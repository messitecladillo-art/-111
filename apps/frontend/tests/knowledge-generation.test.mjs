import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createKnowledgeAccountSync, knowledgeAccountCacheKey } from '../lib/knowledge/account-sync.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Run the actual provider callbacks and actual recovery adapter. The harness
// stubs rendering/effects and HTTP transport only; the identity guard is real.
const bundle = await build({
  stdin: { contents: `export {HostedSessionProvider} from './components/hosted/HostedSession.tsx';
    export {accountBoundRecoveryStorage} from './components/knowledge/useKnowledgeAccount.ts';`, resolveDir: root },
  bundle: true, format: 'esm', platform: 'node', write: false,
  alias: { '@': root, '@evix/shared': path.resolve(root, '../../packages/evi-x-shared/src/index.ts') },
  plugins: [{ name: 'nonvisual-provider-harness', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|next\/navigation)$/ }, args => ({ path: args.path, namespace: 'generation-test' }));
    builder.onResolve({ filter: /^\.\/api-client$/ }, args => args.importer.endsWith('HostedSession.tsx') ? ({ path: 'http', namespace: 'generation-test' }) : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'generation-test' }, args => ({ loader: 'js', contents: args.path === 'react' ? `
      export const Fragment='Fragment'; export const createContext=()=>({Provider:'Provider'});
      export const useCallback=f=>f; export const useRef=value=>({current:value});
      export const useState=value=>[typeof value==='function'?value():value,()=>{}];
      export const useEffect=()=>{}; export const useLayoutEffect=()=>{};
      export const useContext=()=>{throw Error('unused hook')};`
      : args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'
      : args.path === 'http' ? 'export const hostedRequest=(...args)=>globalThis.__knowledgeGenerationRequest(...args); export const errorMessage=e=>e.message;'
      : 'export const usePathname=()=>""; export const useRouter=()=>({push(){}});' }));
  } }],
});
const { HostedSessionProvider, accountBoundRecoveryStorage } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const accountA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', accountB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const session = id => ({ authenticated: true, mode: 'synthetic-test', csrfToken: 'synthetic-same-token-for-regression', user: { id } });
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }; };
const wire = { revision: 0, favorites: [], recent: [], preferences: {} };

test('A→B→A rejects old-generation get/write/delete and old cleanup, even when the account ID matches again', async () => {
  const actual = storage(), previous = globalThis.sessionStorage;
  globalThis.sessionStorage = actual;
  try {
    const auth = HostedSessionProvider({ children: null }).props.value;
    auth.accept(session(accountA));
    assert.equal(auth.isCurrentAccount(accountA, 1), true);
    const old = accountBoundRecoveryStorage(actual, accountA, 1, auth.isCurrentAccount);
    const controller = createKnowledgeAccountSync({ storage: old, debounceMs: 60000, read: async () => wire, write: async () => wire });
    await controller.setIdentity(accountA); controller.updatePrefs({ query: '旧草稿' });
    const key = knowledgeAccountCacheKey(accountA);
    assert.ok(actual.getItem(key));
    auth.accept(session(accountB)); auth.accept(session(accountA));
    assert.equal(auth.isCurrentAccount(accountA, 1), false);
    assert.equal(auth.isCurrentAccount(accountA, 3), true);
    const current = accountBoundRecoveryStorage(actual, accountA, 3, auth.isCurrentAccount);
    current.setItem(key, 'new-generation');
    assert.equal(old.getItem(key), null);
    old.setItem(key, 'stale-overwrite'); assert.equal(actual.getItem(key), 'new-generation');
    old.removeItem(key); assert.equal(actual.getItem(key), 'new-generation');
    controller.dispose(true); assert.equal(actual.getItem(key), 'new-generation');
    assert.equal(current.getItem(key), 'new-generation'); current.removeItem(key); assert.equal(actual.getItem(key), null);
  } finally { if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous; }
});

test('same-account refresh leaves the generation and unresolved recovery draft intact', async () => {
  const actual = storage(), previous = globalThis.sessionStorage;
  globalThis.sessionStorage = actual;
  try {
    const auth = HostedSessionProvider({ children: null }).props.value;
    auth.accept(session(accountA));
    const bound = accountBoundRecoveryStorage(actual, accountA, 1, auth.isCurrentAccount), key = knowledgeAccountCacheKey(accountA);
    let writes = 0;
    const controller = createKnowledgeAccountSync({ storage: bound, debounceMs: 10, read: async () => wire, write: async () => { writes++; throw Object.assign(Error('unknown'), { status: 0 }); } });
    await controller.setIdentity(accountA); controller.updatePrefs({ query: '置信区间' });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(controller.getSnapshot().status, 'unknown'); controller.dispose();
    const saved = actual.getItem(key); assert.ok(saved);
    auth.accept({ ...session(accountA), csrfToken: 'synthetic-refreshed-token' });
    assert.equal(auth.isCurrentAccount(accountA, 1), true); assert.equal(bound.getItem(key), saved);
    const restored = createKnowledgeAccountSync({ storage: bound, debounceMs: 10, read: async () => wire, write: async () => { writes++; return wire; } });
    await restored.setIdentity(accountA);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(restored.getSnapshot().state.preferences.query, '置信区间');
    assert.equal(restored.getSnapshot().status, 'unknown'); assert.equal(writes, 1);
    assert.equal(JSON.parse(actual.getItem(key)).pending.payload.idempotencyKey, JSON.parse(saved).pending.payload.idempotencyKey);
    restored.dispose();
  } finally { if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous; }
});

test('a late HTTP receipt from old A cannot be applied after A→B→A, even with the same synthetic token', async () => {
  const actual = storage(), previous = globalThis.sessionStorage, previousRequest = globalThis.__knowledgeGenerationRequest;
  globalThis.sessionStorage = actual;
  let finish;
  globalThis.__knowledgeGenerationRequest = () => new Promise(resolve => { finish = resolve; });
  try {
    const auth = HostedSessionProvider({ children: null }).props.value; auth.accept(session(accountA));
    const receipt = auth.mutate('/api/me/knowledge-state', undefined, 'GET').then(() => 'applied', error => error.message);
    auth.accept(session(accountB)); auth.accept(session(accountA)); finish(wire);
    assert.match(await receipt, /账号状态已经变化/);
  } finally {
    if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous;
    if (previousRequest === undefined) delete globalThis.__knowledgeGenerationRequest; else globalThis.__knowledgeGenerationRequest = previousRequest;
  }
});
