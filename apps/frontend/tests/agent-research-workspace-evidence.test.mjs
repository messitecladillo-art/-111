import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyResearchWorkspaceDraft, parseResearchWorkspaceDraft, verifyResearchWorkspaceDraft, createResearchWorkspaceStore } from '../lib/agent/research-workspace.ts';
import { diagnoseProject } from '../lib/project-diagnosis.ts';
import { createLiteratureWorkspaceSnapshot, DEFAULT_LITERATURE_SETTINGS, literatureEvidenceReference } from '../lib/topic-lab/workspace.ts';

test('workspace persists and restores the exact v2 diagnosis reference without raw corpus in its source', async () => {
  const snapshot = await createLiteratureWorkspaceSnapshot(null, DEFAULT_LITERATURE_SETTINGS);
  const source = { schemaVersion: 2, id: 'bound-diagnosis', input: { title: '公共服务研究', problem: '支持负责人比较两项待实施服务方案。', decisionOwner: '服务负责人', population: '明确范围内的拟调查居民', geography: '拟调查地区', stage: 'intake', evidenceStatus: 'proposed' }, literature: literatureEvidenceReference(snapshot) };
  const draft = emptyResearchWorkspaceDraft('公共服务');
  draft.literature = snapshot; draft.diagnosis = { source, result: diagnoseProject(source.input) };
  assert.deepEqual(parseResearchWorkspaceDraft(draft).diagnosis.source, source);
  assert.deepEqual((await verifyResearchWorkspaceDraft(draft)).diagnosis, draft.diagnosis);
  let saved = null;
  const store = createResearchWorkspaceStore({ read: async () => structuredClone(saved), commit: async (scope, revision, next, current) => {
    if (!current()) return 'stale'; if ((saved?.revision ?? 0) !== revision) return 'conflict'; saved = structuredClone(next); return 'committed';
  } });
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await store.write(owner, null, draft, { expectedRevision: 0 });
  assert.deepEqual((await store.read(owner, null)).draft.diagnosis.source, source);
  assert.equal(Object.hasOwn(saved.draft.diagnosis.source.literature, 'corpus'), false);
  const corrupted = structuredClone(draft); corrupted.diagnosis.source.literature.classification = 'fulltext_review';
  assert.throws(() => parseResearchWorkspaceDraft(corrupted), /文献证据引用/);
  const resultDrift = structuredClone(draft); resultDrift.diagnosis.result.readiness++;
  assert.throws(() => parseResearchWorkspaceDraft(resultDrift), /诊断结果/);
});
