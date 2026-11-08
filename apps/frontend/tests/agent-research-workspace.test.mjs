import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResearchWorkspaceStore, emptyResearchWorkspaceDraft, parseResearchWorkspaceDraft, researchWorkspaceScope, MAX_RESEARCH_WORKSPACE_BYTES } from '../lib/agent/research-workspace.ts';
import { createLiteratureWorkspaceSnapshot, DEFAULT_LITERATURE_SETTINGS, MAX_LITERATURE_WORKSPACE_BYTES } from '../lib/topic-lab/workspace.ts';
import { diagnoseProject } from '../lib/project-diagnosis.ts';
import { prepareResearchIntake } from '../lib/agent/research-intake.ts';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P = '11111111-1111-4111-8111-111111111111', Q = '22222222-2222-4222-8222-222222222222';
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function adapter() {
  const values = new Map();
  return { values, beforeRead: null, beforeCommit: null, failWrite: false,
    async read(scope) { const value = clone(values.get(scope) ?? null); if (this.beforeRead) await this.beforeRead(scope); return value; },
    async commit(scope, expected, next, current) {
      if (this.beforeCommit) await this.beforeCommit(scope);
      if (this.failWrite) throw Error('Synthetic quota failure');
      if (!current()) return 'stale';
      if ((values.get(scope)?.revision ?? 0) !== expected) return 'conflict';
      values.set(scope, clone(next)); return 'committed';
    },
  };
}
const draft = direction => emptyResearchWorkspaceDraft(direction);

test('checkpoint scopes isolate account A-B-A, projects and standalone work and clone inputs/outputs', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage), input = draft('甲的课题');
  input.profile.interests = ['公共服务'];
  assert.deepEqual(await store.read(A, P), { scope: researchWorkspaceScope(A, P), revision: 0, draft: null });
  const saving = store.write(A, P, input, { expectedRevision: 0 });
  input.direction = '保存开始之后的修改'; input.profile.interests.push('新修改');
  assert.equal(await saving, 1);
  await store.write(B, P, draft('乙的课题'), { expectedRevision: 0 });
  await store.write(A, Q, draft('另一个项目'), { expectedRevision: 0 });
  await store.write(A, null, draft('独立研究'), { expectedRevision: 0 });
  const first = await store.read(A, P);
  assert.equal(first.draft.direction, '甲的课题');
  assert.deepEqual(first.draft.profile.interests, ['公共服务']);
  first.draft.profile.interests.push('读取结果后的修改');
  assert.equal((await store.read(B, P)).draft.direction, '乙的课题');
  assert.deepEqual((await store.read(A, P)).draft.profile.interests, ['公共服务']);
  assert.equal((await store.read(A, Q)).draft.direction, '另一个项目');
  assert.equal((await store.read(A, null)).draft.direction, '独立研究');
});

test('an identity epoch ticket discards a late read even after account A-B-A returns', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage);
  await store.write(A, P, draft('旧账号读取'), { expectedRevision: 0 });
  const gate = deferred(), started = deferred(); let epoch = 1;
  storage.beforeRead = async () => { started.resolve(); await gate.promise; };
  const pending = store.read(A, P, { isCurrent: () => epoch === 1 });
  await started.promise; epoch = 3; gate.resolve();
  assert.equal(await pending, null);
  storage.beforeRead = null;
  assert.equal((await store.read(A, P)).draft.direction, '旧账号读取');
});

test('same-scope save/clear invocation order is reserved before asynchronous validation and clear retains a tombstone', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage), gate = deferred(), started = deferred(); let calls = 0;
  storage.beforeCommit = async () => { if (++calls === 1) { started.resolve(); await gate.promise; } };
  const oldSave = store.write(A, P, draft('旧保存'), { expectedRevision: 0 });
  const clearing = store.clear(A, P, { expectedRevision: 1 });
  await started.promise; assert.equal(calls, 1); gate.resolve();
  assert.equal(await oldSave, 1); assert.equal(await clearing, 2);
  assert.deepEqual(await store.read(A, P), { scope: researchWorkspaceScope(A, P), revision: 2, draft: null });
  await assert.rejects(store.write(A, P, draft('迟到的旧保存'), { expectedRevision: 0 }), { name: 'ResearchWorkspaceConflictError' });
  assert.equal((await store.read(A, P)).draft, null);
  assert.equal(await store.write(A, P, draft('删除后明确新建'), { expectedRevision: 2 }), 3);
});

test('two tab stores use atomic compare-and-swap so a delayed older write cannot replace a newer tab', async () => {
  const storage = adapter(), oldTab = createResearchWorkspaceStore(storage), newTab = createResearchWorkspaceStore(storage);
  const gate = deferred(), started = deferred(); let calls = 0;
  storage.beforeCommit = async () => { if (++calls === 1) { started.resolve(); await gate.promise; } };
  const delayed = oldTab.write(A, P, draft('较旧页面'), { expectedRevision: 0 });
  await started.promise;
  assert.equal(await newTab.write(A, P, draft('较新页面'), { expectedRevision: 0 }), 1);
  gate.resolve(); await assert.rejects(delayed, { name: 'ResearchWorkspaceConflictError' });
  assert.equal((await newTab.read(A, P)).draft.direction, '较新页面');
  assert.equal(await newTab.clear(A, P, { expectedRevision: 1 }), 2);
  await assert.rejects(oldTab.write(A, P, draft('旧页面恢复'), { expectedRevision: 1 }), { name: 'ResearchWorkspaceConflictError' });
});

test('invalidated queued mutations and storage failures preserve existing records and do not poison the queue', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage);
  await store.write(A, P, draft('已保存'), { expectedRevision: 0 });
  assert.equal(await store.write(A, P, draft('不会写入'), { expectedRevision: 1, ticket: { isCurrent: () => false } }), null);
  assert.equal(await store.clear(A, P, { expectedRevision: 1, ticket: { isCurrent: () => false } }), null);
  storage.failWrite = true; await assert.rejects(store.write(A, P, draft('存储拒绝'), { expectedRevision: 1 }), /quota/);
  storage.failWrite = false;
  assert.equal((await store.read(A, P)).draft.direction, '已保存');
  assert.equal(await store.write(A, P, draft('可以继续'), { expectedRevision: 1 }), 2);
});

test('the commit-time ticket fence cancels work invalidated after validation began', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage), gate = deferred(), started = deferred(); let live = true;
  storage.beforeCommit = async () => { started.resolve(); await gate.promise; };
  const pending = store.write(A, P, draft('迟到保存'), { expectedRevision: 0, ticket: { isCurrent: () => live } });
  await started.promise; live = false; gate.resolve();
  assert.equal(await pending, null); assert.equal(storage.values.size, 0);
});

test('draft parser preserves incomplete team conditions and default auto advance, verifies canonical diagnosis', () => {
  const initial = draft('待细化方向'), { autoAdvance: ignored, ...legacy } = initial; void ignored;
  assert.equal(parseResearchWorkspaceDraft(legacy).autoAdvance, true);
  assert.equal(parseResearchWorkspaceDraft(initial).profile.city, '');
  const source = { id: 'diagnosis-test', input: { title: '研究主题', problem: '拟优化社区公共服务配置', decisionOwner: '服务管理岗位', population: '尚待明确', geography: '研究地区', stage: 'intake', evidenceStatus: 'proposed' } };
  initial.diagnosis = { source, result: diagnoseProject(source.input) };
  assert.deepEqual(parseResearchWorkspaceDraft(initial).diagnosis, initial.diagnosis);
  initial.diagnosis.result.readiness++; assert.throws(() => parseResearchWorkspaceDraft(initial), /诊断结果/);
  let read = false; initial.diagnosis.result = diagnoseProject(source.input);
  Object.defineProperty(initial.diagnosis.result.scores, 'Q', { get() { read = true; return 25; } });
  assert.throws(() => parseResearchWorkspaceDraft(initial), /诊断结果/); assert.equal(read, false);
  assert.throws(() => parseResearchWorkspaceDraft({ ...draft('方向'), direction: '字'.repeat(1201) }), /文本/);
});

test('intake receipts are scope checked and nested documents cannot be swapped during resume', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage), value = draft('校园公共服务');
  value.intake = await prepareResearchIntake(value.direction, undefined, P);
  assert.throws(() => store.write(A, Q, value, { expectedRevision: 0 }), /其他项目/);
  assert.equal(await store.write(A, P, value, { expectedRevision: 0 }), 1);
  const tampered = clone(value); tampered.intake.turn.message = '被替换的研究输入';
  await assert.rejects(store.write(A, P, tampered, { expectedRevision: 1 }), /输入与指纹/);
  value.intake.candidates[0].document.brief.title = '被替换的标题';
  assert.throws(() => parseResearchWorkspaceDraft(value), /候选文档/);
});

test('corrupt persisted envelopes fail closed without clearing the saved bytes', async () => {
  const storage = adapter(), store = createResearchWorkspaceStore(storage), scope = researchWorkspaceScope(A, P);
  const corrupt = { schema: 'research-workspace-checkpoint/v1', scope: researchWorkspaceScope(B, P), revision: 2, draft: draft('不匹配账号') };
  storage.values.set(scope, corrupt); await assert.rejects(store.read(A, P), /范围/);
  assert.deepEqual(storage.values.get(scope), corrupt);
});

test('literature remains in the checkpoint adapter, verifies hashes, and keeps workspace capacity separate from intake limits', async () => {
  assert.ok(MAX_RESEARCH_WORKSPACE_BYTES > MAX_LITERATURE_WORKSPACE_BYTES);
  const storage = adapter(), store = createResearchWorkspaceStore(storage), value = draft('文献研究');
  const record = { id: 'p1', title: 'Imported metadata', authors: [], year: null, source: '', keywords: [], keywordsPlus: [], abstract: 'a'.repeat(6 * 1024 * 1024), citations: null, doi: '', refs: [], refLabels: [], format: 'ris' };
  value.literature = await createLiteratureWorkspaceSnapshot({ kind: 'import', lists: [[record]], files: [{ name: 'local.ris', format: 'ris', records: 1, skipped: 0, warnings: [] }] }, DEFAULT_LITERATURE_SETTINGS);
  const oldWindow = globalThis.window;
  globalThis.window = { get localStorage() { throw Error('raw corpus must never reach localStorage'); } };
  try {
    await store.write(A, P, value, { expectedRevision: 0 });
    assert.equal((await store.read(A, P)).draft.literature.corpus.lists[0][0].abstract.length, 6 * 1024 * 1024);
    value.literature.corpus.lists[0][0].title = '篡改后未更新哈希';
    await assert.rejects(store.write(A, P, value, { expectedRevision: 1 }), /指纹/);
    assert.equal((await store.read(A, P)).revision, 1);
  } finally { globalThis.window = oldWindow; }
});

test('guest scope uses only a session token and cannot share an authenticated scope', () => {
  const values = new Map(), oldWindow = globalThis.window;
  globalThis.window = { sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    const scope = researchWorkspaceScope('guest', null);
    assert.equal(researchWorkspaceScope('guest', null), scope); assert.notEqual(researchWorkspaceScope(A, null), scope);
    assert.match(JSON.parse(scope)[1], /^guest:/); assert.equal(values.size, 1);
    assert.throws(() => researchWorkspaceScope('untrusted-account', P), /账号/);
  } finally { globalThis.window = oldWindow; }
});
