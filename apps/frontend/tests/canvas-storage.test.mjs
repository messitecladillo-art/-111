import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasScopeLifetime, scopedCanvasStorage } from '../lib/canvas/storage.ts';
import { ANONYMOUS_CANVAS_SESSION, anonymousCanvasIdentity, canvasScopeKey, clearAnonymousCanvasIdentity } from '../lib/canvas/scope.ts';
import { emptyDoc } from '../lib/canvas/graph.ts';

const memoryStorage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const account = (id = 'account-A', projectId = 'project-1') => ({ identity: { kind: 'account', id }, projectId });
const guest = (id = 'anonymous-session-A', projectId = 'project-1') => ({ identity: { kind: 'anonymous', id }, projectId });
const view = { x: 43, y: -82, zoom: 0.8 };

test('graph and viewport persist together only for the exact account/project scope', () => {
  const memory = memoryStorage(), a = scopedCanvasStorage(account(), memory, () => true);
  const saved = emptyDoc('A 的项目一');
  assert.equal(a.writeDocument(saved), true); assert.equal(a.writeViewport(view), true);
  const reopened = scopedCanvasStorage(account(), memory, () => true);
  assert.deepEqual(reopened.readDocument(), saved); assert.deepEqual(reopened.readViewport(), view);
  for (const other of [account('account-B'), account('account-A', 'project-2'), guest('account-A')]) {
    const isolated = scopedCanvasStorage(other, memory, () => true);
    assert.equal(isolated.readDocument().nodes.length, 0); assert.notEqual(isolated.readDocument().title, saved.title);
    assert.equal(isolated.readViewport(), undefined);
    isolated.writeDocument(emptyDoc('独立项目')); isolated.writeViewport({ x: 0, y: 0, zoom: 1 });
    assert.deepEqual(a.readDocument(), saved); assert.deepEqual(a.readViewport(), view);
  }
});

test('scope keys use an unambiguous encoded tuple, preserve Unicode, and never accept a missing owner', () => {
  const keys = [account('A:B', 'C'), account('A', 'B:C'), account('中文 / 名称', '项目😺'), guest('A:B', 'C')].map(canvasScopeKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const scope of [null, {}, { identity: { kind: 'account', id: '' }, projectId: 'p' }, account('A\nB'), account('A', '')]) assert.throws(() => canvasScopeKey(scope), /归属/);
});

test('unscoped legacy graph and viewport are preserved without guessing or migrating ownership', () => {
  const memory = memoryStorage();
  memory.setItem('evix.canvas.v1', JSON.stringify(emptyDoc('归属未知的旧草稿')));
  memory.setItem('evix.canvas.viewport.v1', JSON.stringify(view));
  for (const scope of [account(), guest()]) {
    const current = scopedCanvasStorage(scope, memory, () => true);
    assert.notEqual(current.readDocument().title, '归属未知的旧草稿'); assert.equal(current.readViewport(), undefined);
    current.writeDocument(emptyDoc('新草稿'));
  }
  assert.equal(JSON.parse(memory.getItem('evix.canvas.v1')).title, '归属未知的旧草稿');
  assert.deepEqual(JSON.parse(memory.getItem('evix.canvas.viewport.v1')), view);
});

test('a scope fence prevents late reads and pending save/viewport callbacks from using stale state', async () => {
  const memory = memoryStorage(); let current = true;
  const old = scopedCanvasStorage(account(), memory, () => current);
  old.writeDocument(emptyDoc('已保存的 A')); old.writeViewport(view);
  let finish; const pending = new Promise(resolve => { finish = resolve; }).then(() => old.writeDocument(emptyDoc('晚到旧文件')));
  const pendingViewport = () => old.writeViewport({ x: 100, y: 100, zoom: 1 });
  current = false; finish();
  assert.equal(await pending, false); assert.equal(pendingViewport(), false);
  assert.notEqual(old.readDocument().title, '已保存的 A'); assert.equal(old.readViewport(), undefined);
  const latest = scopedCanvasStorage(account(), memory, () => true);
  assert.equal(latest.readDocument().title, '已保存的 A'); assert.deepEqual(latest.readViewport(), view);
});

test('same-account project change leaves the previous project intact and callbacks bound to the old project', () => {
  const memory = memoryStorage(); let projectId = 'project-1';
  const a = scopedCanvasStorage(account(), memory, () => projectId === 'project-1');
  a.writeDocument(emptyDoc('项目一')); a.writeViewport(view);
  projectId = 'project-2';
  const b = scopedCanvasStorage(account('account-A', projectId), memory, () => projectId === 'project-2');
  b.writeDocument(emptyDoc('项目二'));
  assert.equal(a.writeDocument(emptyDoc('误写')), false); assert.equal(a.writeViewport(view), false);
  assert.equal(b.readDocument().title, '项目二');
  projectId = 'project-1';
  assert.equal(a.readDocument().title, '项目一'); assert.deepEqual(a.readViewport(), view);
});

test('unmount fences a project even when its account is unchanged and strict effect replay stays usable', () => {
  const memory = memoryStorage(), oldLifetime = canvasScopeLifetime(() => true);
  const old = scopedCanvasStorage(account(), memory, oldLifetime.isCurrent);
  old.writeDocument(emptyDoc('项目一'));
  oldLifetime.deactivate(); assert.equal(old.writeDocument(emptyDoc('已卸载')), false);
  const nextLifetime = canvasScopeLifetime(() => true), next = scopedCanvasStorage(account('account-A', 'project-2'), memory, nextLifetime.isCurrent);
  next.writeDocument(emptyDoc('项目二'));
  assert.equal(old.writeViewport(view), false);
  nextLifetime.deactivate(); nextLifetime.activate(); assert.equal(next.writeViewport(view), true, 'Strict Mode setup/cleanup/setup retains a working mount');
  assert.equal(next.readDocument().title, '项目二');
});

test('anonymous tab identities persist through reload, rotate at account boundaries, and do not inherit another guest', () => {
  const session = memoryStorage(), persistent = memoryStorage();
  const first = anonymousCanvasIdentity(session, () => 'anonymous-session-0001');
  const a = scopedCanvasStorage({ identity: first, projectId: 'local-workspace' }, persistent, () => true);
  a.writeDocument(emptyDoc('访客草稿')); a.writeViewport(view);
  assert.deepEqual(anonymousCanvasIdentity(session, () => 'must-not-be-used'), first);
  clearAnonymousCanvasIdentity(session); assert.equal(session.getItem(ANONYMOUS_CANVAS_SESSION), null);
  const next = anonymousCanvasIdentity(session, () => 'anonymous-session-0002');
  assert.notDeepEqual(next, first);
  const b = scopedCanvasStorage({ identity: next, projectId: 'local-workspace' }, persistent, () => true);
  assert.notEqual(b.readDocument().title, '访客草稿'); assert.equal(b.readViewport(), undefined);
  assert.notEqual(scopedCanvasStorage(account('anonymous-session-0001', 'local-workspace'), persistent, () => true).readDocument().title, '访客草稿');
});

test('blocked browser stores do not leak another scope or report an unsuccessful write as saved', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  const store = scopedCanvasStorage(account(), blocked, () => true);
  assert.deepEqual(store.readDocument(), emptyDoc()); assert.equal(store.readViewport(), undefined);
  assert.throws(() => store.writeDocument(emptyDoc()), /quota/);
  assert.throws(() => scopedCanvasStorage(account(), null, () => true).writeDocument(emptyDoc()), /存储/);
  assert.deepEqual(anonymousCanvasIdentity(blocked, () => 'ephemeral-session-0001'), { kind: 'anonymous', id: 'ephemeral-session-0001' });
});

test('corrupt and out-of-bounds viewports are ignored while exact finite values restore', () => {
  const memory = memoryStorage(), store = scopedCanvasStorage(account(), memory, () => true);
  for (const v of [null, [], { x: 0, y: 0, zoom: 0 }, { x: 0, y: 0, zoom: 2.1 }, { x: 1e8, y: 0, zoom: 1 }, { x: 0, y: '2', zoom: 1 }]) {
    memory.setItem(store.viewportKey, JSON.stringify(v)); assert.equal(store.readViewport(), undefined);
  }
  memory.setItem(store.documentKey, '{'); assert.deepEqual(store.readDocument(), emptyDoc());
  memory.setItem(store.viewportKey, '{'); assert.equal(store.readViewport(), undefined);
  assert.equal(store.writeViewport({ x: NaN, y: 0, zoom: 1 }), false);
  assert.equal(store.writeViewport(view), true); assert.deepEqual(store.readViewport(), view);
});

// Execute the production session identity-generation guard, rather than replacing it with a test stub.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  stdin: { contents: `export {HostedSessionProvider} from './components/hosted/HostedSession.tsx';`, resolveDir: root },
  bundle: true, format: 'esm', platform: 'node', write: false,
  alias: { '@': root, '@evix/shared': path.resolve(root, '../../packages/evi-x-shared/src/index.ts') },
  plugins: [{ name: 'canvas-session-harness', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|next\/navigation)$/ }, args => ({ path: args.path, namespace: 'canvas-session-test' }));
    builder.onResolve({ filter: /^\.\/api-client$/ }, args => args.importer.endsWith('HostedSession.tsx') ? ({ path: 'http', namespace: 'canvas-session-test' }) : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'canvas-session-test' }, args => ({ loader: 'js', contents: args.path === 'react' ? `
      export const Fragment='Fragment'; export const createContext=()=>({Provider:'Provider'});
      export const useCallback=f=>f; export const useRef=value=>({current:value});
      export const useState=value=>[typeof value==='function'?value():value,()=>{}];
      export const useEffect=()=>{}; export const useContext=()=>{throw Error('unused hook')};`
      : args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'
      : args.path === 'http' ? 'export const hostedRequest=async()=>({}); export const errorMessage=e=>e.message;'
      : 'export const usePathname=()=>""; export const useRouter=()=>({push(){}});' }));
  } }],
});
const { HostedSessionProvider } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const sessionFor = id => ({ authenticated: true, mode: 'synthetic-test', csrfToken: 'synthetic-token', user: { id } });

test('logout immediately fences a pending canvas save before React unmount and rotates the anonymous session', async () => {
  const before = globalThis.sessionStorage, memory = memoryStorage(); globalThis.sessionStorage = memory;
  try {
    const auth = HostedSessionProvider({ children: null }).props.value;
    assert.equal(auth.isCurrentIdentity(null, 0), false, 'unknown login state cannot load an anonymous draft');
    auth.accept(sessionFor('account-A'));
    const old = scopedCanvasStorage(account(), memory, () => auth.isCurrentIdentity('account-A', 1));
    old.writeDocument(emptyDoc('已保存的 A'));
    let finish; const pending = new Promise(resolve => { finish = resolve; }).then(() => old.writeDocument(emptyDoc('延迟的 A')));
    memory.setItem(ANONYMOUS_CANVAS_SESSION, 'previous-guest-session');
    auth.accept({ authenticated: false, mode: 'synthetic-test' });
    assert.equal(memory.getItem(ANONYMOUS_CANVAS_SESSION), null); assert.equal(auth.isCurrentIdentity('account-A', 1), false);
    assert.equal(auth.isCurrentIdentity(null, 2), true); finish(); assert.equal(await pending, false);
    auth.accept(sessionFor('account-A'));
    assert.equal(auth.isCurrentIdentity('account-A', 1), false, 'old A stays stale after A returns');
    assert.equal(auth.isCurrentIdentity('account-A', 3), true);
    assert.equal(scopedCanvasStorage(account(), memory, () => auth.isCurrentIdentity('account-A', 3)).readDocument().title, '已保存的 A');
  } finally { if (before === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = before; }
});

test('A→B→A fences old callbacks and anonymous→account changes invalidate guest writes synchronously', () => {
  const auth = HostedSessionProvider({ children: null }).props.value, memory = memoryStorage();
  auth.accept({ authenticated: false, mode: 'synthetic-test' });
  const oldGuest = scopedCanvasStorage(guest(), memory, () => auth.isCurrentIdentity(null, 0));
  oldGuest.writeDocument(emptyDoc('旧访客'));
  auth.accept(sessionFor('account-A'));
  assert.equal(oldGuest.writeDocument(emptyDoc('晚到访客')), false);
  const oldA = scopedCanvasStorage(account(), memory, () => auth.isCurrentIdentity('account-A', 1)); oldA.writeViewport(view);
  auth.accept(sessionFor('account-B')); auth.accept(sessionFor('account-A'));
  assert.equal(oldA.writeViewport({ x: 0, y: 0, zoom: 1 }), false);
  const a = scopedCanvasStorage(account(), memory, () => auth.isCurrentIdentity('account-A', 3));
  assert.deepEqual(a.readViewport(), view);
  auth.accept({ ...sessionFor('account-A'), csrfToken: 'refreshed-token' });
  assert.equal(auth.isCurrentIdentity('account-A', 3), true, 'a same-account refresh preserves its draft generation');
  assert.equal(a.writeDocument(emptyDoc('继续编辑')), true);
});
