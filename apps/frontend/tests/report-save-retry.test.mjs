import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContent } from '../lib/editor-model.ts';
import { prepareReportSave } from '../lib/report-persistence.ts';
import { hostedReportHookModule } from './helpers/hosted-report-hook.mjs';

const projectId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const tick = () => new Promise(resolve => setImmediate(resolve));
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
class HostedApiError extends Error {
  constructor(status, code = 'request_failed') { super(`HTTP ${status}: ${code}`); this.status = status; this.code = code; }
}
const receipt = (content, revision = 1) => ({ id: revision === 1 ? projectId : versionId, projectId, revision, title: content.title, updatedAt: '2026-10-20T10:00:00Z', content });

// Execute the actual hook and persistence contracts; only hooks and transport are controlled.
function mount({ cached, post = async () => {}, read } = {}) {
  const cells = [], writes = [], reads = [], caches = [];
  let cursor = 0, queue = [], changed = false, state, unmounted = false;
  let props = { projectId, title: '合成验收', writable: true };
  let reader = read ?? (async path => path.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : { report: null });
  let writer = post;
  const hooks = {
    useState(initial) {
      const at = cursor++;
      if (!cells[at]) cells[at] = { value: typeof initial === 'function' ? initial() : initial };
      return [cells[at].value, next => {
        assert.equal(unmounted, false, 'a completed old request must not update an unmounted hook');
        const value = typeof next === 'function' ? next(cells[at].value) : next;
        if (!Object.is(cells[at].value, value)) { cells[at].value = value; changed = true; }
      }];
    },
    useRef(value) { return cells[cursor++] ??= { current: value }; },
    useCallback(value, deps) { const at = cursor++; if (!cells[at] || !same(cells[at].deps, deps)) cells[at] = { value, deps }; return cells[at].value; },
    useEffect(effect, deps) {
      const at = cursor++;
      if (!cells[at] || !same(cells[at].deps, deps)) {
        const previous = cells[at]; cells[at] = { deps };
        queue.push(() => { previous?.cleanup?.(); cells[at].cleanup = effect(); });
      }
    },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const auth = {
    session: { user: { id: projectId } }, getDraft: () => cached,
    cacheDraft: (_key, value) => { assert.equal(unmounted, false); caches.push(value); },
    setUnsaved() {}, mutate: async (...args) => { writes.push(args); return writer(...args); },
  };
  const api = { HostedApiError, errorMessage: error => error.message, hostedRequest: async (...args) => { reads.push(args); return reader(...args); } };
  const { useHostedReport: executeLifecycle } = hostedReportHookModule(hooks, { auth: { useHostedSession: () => auth }, api });
  return {
    get state() { return state; }, get cache() { return caches.at(-1); }, writes, reads,
    setPost(next) { writer = next; }, setRead(next) { reader = next; },
    async render(next) {
      props = { ...props, ...next };
      for (let cycle = 0; cycle < 30; cycle++) {
        cursor = 0; changed = false; state = executeLifecycle(props);
        const effects = queue; queue = []; for (const effect of effects) effect();
        await tick(); if (!changed && !queue.length) return;
      }
      throw Error('Report hook did not settle');
    },
    unmount() { for (const cell of cells) cell.cleanup?.(); unmounted = true; },
  };
}

async function fresh(post) {
  const h = mount({ post }); await h.render();
  const edited = { ...h.state.initial, subtitle: '原提交内容 · 合成验收' };
  h.state.onSnapshot(edited); await h.render();
  return { h, edited };
}

for (const status of [403, 409]) {
  test(`same-mount uncertain original and rejected ${status} replay retain exact request and nonce`, async () => {
    let count = 0;
    const { h, edited } = await fresh(async () => { throw new HostedApiError(count++ === 0 ? 0 : status, count === 1 ? 'network_outcome_unknown' : 'request_failed'); });
    const capturedLoad = h.state.load;
    await h.state.save(); await h.render();
    const original = h.cache.pending; assert.ok(original); assert.equal(h.state.uncertain, true);
    const later = { ...edited, subtitle: '超时后继续编辑' }; h.state.onSnapshot(later); await h.render();
    await h.state.save(); await h.render();
    assert.equal(h.writes.length, 2); assert.equal(h.writes[1][1], original);
    assert.equal(h.cache.pending, original); assert.equal(h.state.uncertain, true);
    assert.equal(h.cache.content, later); assert.equal(h.state.conflict, false);
    const reads = h.reads.length; await capturedLoad(); await h.state.load(); await h.render();
    assert.equal(h.reads.length, reads, 'uncertain original also blocks callbacks captured before saving');
    assert.equal(h.cache.pending.idempotencyKey, original.idempotencyKey);
  });

  test(`cached uncertain request survives rejected ${status} replay after remount`, async () => {
    const content = createEditorContent(), request = prepareReportSave(content, 1, versionId);
    const head = receipt({ ...content, subtitle: '先前保存版本' });
    const h = mount({ cached: { content, head, pending: request, conflict: false }, post: async () => { throw new HostedApiError(status); }, read: async path => path.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : { report: head } });
    await h.render(); await h.state.save(); await h.render();
    assert.equal(h.writes[0][1], request); assert.equal(h.cache.pending, request);
    assert.equal(h.state.uncertain, true); assert.equal(h.cache.content, content);
  });
}

for (const status of [400, 401, 403, 409, 422]) test(`fresh first POST ${status} remains a definite rejection`, async () => {
  const { h, edited } = await fresh(async () => { throw new HostedApiError(status); });
  await h.state.save(); await h.render();
  assert.equal(h.cache.pending, null); assert.equal(h.state.uncertain, false);
  assert.equal(h.state.conflict, status === 409); assert.equal(h.cache.content, edited);
});

test('invalid-server-receipt even with a 4xx status never becomes a definite rejection', async () => {
  const { h } = await fresh(async () => { throw new HostedApiError(400, 'invalid_server_receipt'); });
  await h.state.save(); await h.render(); const request = h.cache.pending;
  await h.state.save(); await h.render();
  assert.ok(request); assert.equal(h.cache.pending, request); assert.equal(h.state.uncertain, true);
});

for (const status of [403, 404]) test(`accepted POST then head ${status}, denied replay and eventual success preserve edits`, async () => {
  const { h, edited } = await fresh(async (_path, request) => receipt(request.content, 1));
  let headCalls = 0;
  h.setRead(async path => {
    if (path.endsWith('/versions')) return { versions: [], nextBeforeRevision: null };
    headCalls++; throw new HostedApiError(status);
  });
  await h.state.save(); await h.render();
  const request = h.cache.pending, saved = receipt(request.content, 1);
  assert.equal(headCalls, 1); assert.equal(h.state.uncertain, true);
  h.setPost(async () => { throw new HostedApiError(403); });
  await h.state.save(); await h.render(); assert.equal(h.cache.pending, request);
  const later = { ...edited, subtitle: '原保存待核对时的新内容' }; h.state.onSnapshot(later); await h.render();
  const initial = h.state.initial, generation = h.state.generation;
  h.setPost(async () => saved); h.setRead(async path => path.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : { report: saved });
  await h.state.save(); await h.render();
  assert.equal(h.writes.length, 3); assert.ok(h.writes.every(([, value]) => value === request));
  assert.equal(h.cache.pending, null); assert.equal(h.state.uncertain, false);
  assert.equal(h.cache.content, later); assert.equal(h.state.dirty, true);
  assert.equal(h.state.initial, initial); assert.equal(h.state.generation, generation);
});

test('permission-cycle late receipt remains pending and a denied current replay cannot erase it', async () => {
  let complete; const response = new Promise(resolve => { complete = resolve; });
  const { h } = await fresh(() => response);
  const oldSave = h.state.save, saving = oldSave(); await h.render();
  const request = h.writes[0][1];
  await h.render({ writable: false }); await h.render({ writable: true });
  const reads = h.reads.length; complete(receipt(request.content)); await saving; await h.render();
  assert.equal(h.reads.length, reads); assert.equal(h.cache.pending, request); assert.equal(h.state.uncertain, true);
  h.setPost(async () => { throw new HostedApiError(403); });
  await oldSave(); assert.equal(h.writes.length, 1, 'revoked callback cannot start another write');
  await h.state.save(); await h.render(); assert.equal(h.cache.pending, request); assert.equal(h.state.uncertain, true);
});

test('a fresh request after a definite rejection is still eligible for definite rejection', async () => {
  const { h } = await fresh(async () => { throw new HostedApiError(422); });
  await h.state.save(); await h.render(); const first = h.writes[0][1];
  await h.state.save(); await h.render();
  assert.notEqual(h.writes[1][1], first); assert.notEqual(h.writes[1][1].idempotencyKey, first.idempotencyKey);
  assert.equal(h.cache.pending, null); assert.equal(h.state.uncertain, false);
});

test('an unmounted save completion has no state/cache write or further head request', async () => {
  let complete; const response = new Promise(resolve => { complete = resolve; });
  const { h } = await fresh(() => response);
  const saving = h.state.save(); await h.render(); const request = h.writes[0][1], reads = h.reads.length;
  h.unmount(); complete(receipt(request.content)); await saving;
  assert.equal(h.reads.length, reads);
});
