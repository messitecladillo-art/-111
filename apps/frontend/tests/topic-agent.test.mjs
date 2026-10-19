import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { freezeTopicAgentRequest, inferTopicAgentIntent, knownTopicAgentRejection, parseTopicAgentConversation, parseTopicAgentPending, parseTopicAgentTurn, proposeTopicProfile, runLocalTopicAgent, topicAgentContinuationCandidates, topicAgentConversationResumable, topicAgentFingerprintMaterial, topicAgentScopeQuery, verifyTopicAgentTurn } from '../lib/topic-agent/index.ts';
import { EMPTY_TOPIC_PROFILE } from '../lib/topic-advisor/types.ts';
import { parseTopicProfile, stableStringify } from '../lib/topic-advisor/parse.ts';
import { TOPIC_SOURCE_VERSIONS } from '../lib/topic-proposal.ts';
const profile = () => structuredClone({ ...EMPTY_TOPIC_PROFILE, schemaVersion: 2, regionRef: null, referenceDate: '2026-10-18' });
const digest = value => createHash('sha256').update(stableStringify(value)).digest('hex');
const local = (extra = {}) => runLocalTopicAgent({ profile: profile(), message: '寻找有实际样本渠道的校园服务选题', intent: 'recommend', ...extra });

test('intake proposes explicit region, numeric limits and channels without changing the original profile', () => {
  const before = profile(), proposal = proposeTopicProfile(before, '我在武汉，有14天，预算500元，可以联系大学生。无法联系企业负责人');
  assert.equal(before.regionRef, null); assert.deepEqual(before.access, {});
  assert.equal(proposal.profile.regionRef.code, '420100'); assert.equal(proposal.profile.days, 14); assert.equal(proposal.profile.budgetYuan, 500);
  assert.equal(proposal.profile.access.campus_students, 'confirmed'); assert.equal(proposal.profile.access.firms, 'unavailable');
  assert.equal(proposal.profile.school, ''); assert.deepEqual(proposal.profile.resources, {});
  assert.equal(proposeTopicProfile(before, '学校名气很大，所以应该有很多企业资源'), null);
  assert.equal(proposeTopicProfile(before, '如果我在武汉，可以联系大学生。假设预算500元，有14天'), null);
});

test('local agent executes traceable corpus tools and asks for unknown conditions without claiming a model call', async () => {
  const turn = await local();
  assert.equal(turn.status, 'ready'); assert.equal(turn.modelCalled, false); assert.equal(turn.providerMode, 'local');
  assert.deepEqual(turn.tools.map(tool => tool.name), ['context', 'catalog', 'feasibility', 'sources', 'draft']);
  assert.ok(turn.assistant.questions.some(question => question.includes('城市')));
  assert.ok(turn.assistant.questions.some(question => question.includes('联系')));
  assert.equal(turn.assistant.items.length, 3);
  assert.ok(turn.assistant.items.every(item => item.sourceIds.length && item.sourceIds.every(id => turn.sources.some(source => source.id === id))));
  assert.deepEqual(turn.profile.access, {});
});

test('follow-up reuses chosen candidates and updates current profile without mutating previous evidence', async () => {
  const first = await local(), copy = structuredClone(first);
  const second = await local({ message: '比较这些方向的执行难度', intent: 'compare', previous: first });
  assert.equal(second.parentTurnId, first.id); assert.equal(second.turnIndex, 2); assert.deepEqual(second.candidateIds, first.candidateIds);
  const changed = proposeTopicProfile(first.profile, '我在武汉，有30天，预算0元，可以联系大学生').profile;
  const third = await local({ profile: changed, message: '把第一周验证计划写具体', intent: 'plan', previous: second });
  assert.equal(third.profile.city, '武汉市'); assert.equal(third.profile.budgetYuan, 0); assert.match(third.assistant.text, /团队条件已更新/);
  assert.deepEqual(first, copy);
  await assert.rejects(local({ previous: { ...third, turnIndex: 12 } }), /12/);
});

test('explicit feasible candidates outside the first twenty remain available; hard barriers remain blocked', async () => {
  const broad = parseTopicProfile({ region: '湖北', city: '武汉', sensitiveData: 'approved', referenceDate: '2026-10-18' });
  const feasible = await local({ profile: broad, candidateIds: ['p06-elder-meals'] });
  assert.equal(feasible.assistant.items[0].patternId, 'p06-elder-meals');
  const blocked = await local({ profile: { ...broad, access: { older_adults: 'unavailable' } }, candidateIds: ['p06-elder-meals'] });
  assert.equal(blocked.assistant.items.length, 0); assert.equal(blocked.tools.find(tool => tool.name === 'feasibility').status, 'blocked');
});

test('receipt verification binds exact profile, candidate order, message, parent, service and source versions', async () => {
  const turn = await local();
  const request = { ...freezeTopicAgentRequest({ profile: turn.profile, candidateIds: turn.candidateIds, message: turn.message, intent: turn.intent, parentTurnId: null, mode: 'local', serviceId: null, serviceRevision: null, consent: false }), idempotencyKey: turn.id };
  await verifyTopicAgentTurn(turn, request);
  for (const patch of [{ message: '另一个问题' }, { parentTurnId: crypto.randomUUID() }, { candidateIds: [...request.candidateIds].reverse() }, { profile: { ...request.profile, days: 1 } }]) await assert.rejects(verifyTopicAgentTurn(turn, { ...request, ...patch }), /不一致/);
  const oldVersions = { ...TOPIC_SOURCE_VERSIONS, topicDigest: '0'.repeat(64) };
  const old = { ...turn, sourceVersions: oldVersions, inputFingerprint: digest(topicAgentFingerprintMaterial(request, oldVersions)) };
  await verifyTopicAgentTurn(old, request, oldVersions);
  await assert.rejects(verifyTopicAgentTurn(old, request), /不一致/);
});

test('untrusted receipt cannot fabricate source IDs, eligible candidates, completion state or executable URLs', async () => {
  const turn = await local();
  const alter = patch => assert.throws(() => parseTopicAgentTurn({ ...structuredClone(turn), ...patch }));
  alter({ status: 'running' }); alter({ modelCalled: true }); alter({ finishedAt: null });
  alter({ sources: [{ id: 'x', title: 'x', url: 'javascript:alert(1)' }] });
  const forged = structuredClone(turn); forged.assistant.items[0].sourceIds = ['invented']; assert.throws(() => parseTopicAgentTurn(forged));
  const barrier = structuredClone(turn); barrier.tools.push({ name: 'feasibility', status: 'blocked', summary: '已阻断', patternIds: [turn.assistant.items[0].patternId], sourceIds: [] }); assert.throws(() => parseTopicAgentTurn(barrier));
  const sparse = structuredClone(turn); sparse.candidateIds = Array(2); assert.throws(() => parseTopicAgentTurn(sparse));
});

test('frozen pending model recovery retains historical bytes and rejects other accounts, projects and duplicate JSON', async () => {
  const turn = await local(), ownerId = crypto.randomUUID();
  const request = freezeTopicAgentRequest({ profile: turn.profile, candidateIds: turn.candidateIds, message: '继续比较 🦞', intent: 'compare', parentTurnId: null, mode: 'model', serviceId: crypto.randomUUID(), serviceRevision: 1, consent: true });
  const saved = { schemaVersion: 1, ownerId, namespace: 'project:one', request: { ...request, catalogVersion: 'historical-catalog-v1' }, context: 'captured-context', sourceVersions: { ...TOPIC_SOURCE_VERSIONS, topicDigest: '1'.repeat(64) } };
  const recovered = parseTopicAgentPending(JSON.stringify(saved), ownerId, 'project:one');
  assert.equal(recovered.request.idempotencyKey, request.idempotencyKey); assert.equal(recovered.request.catalogVersion, 'historical-catalog-v1');
  assert.equal(recovered.sourceVersions.topicDigest, '1'.repeat(64));
  assert.equal(parseTopicAgentPending(saved, crypto.randomUUID(), 'project:one'), null);
  assert.equal(parseTopicAgentPending(saved, ownerId, 'project:two'), null);
  assert.throws(() => parseTopicAgentPending(JSON.stringify(saved).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'), ownerId, 'project:one'));
  assert.throws(() => parseTopicAgentPending({ ...saved, request: { ...request, consent: false } }, ownerId, 'project:one'));
});

test('model dispatch requires explicit consent while uncertain and nonce-conflict responses never mean safe retry', () => {
  const input = { profile: profile(), candidateIds: ['p06-elder-meals'], message: '比较', intent: 'compare', parentTurnId: null, mode: 'model', serviceId: crypto.randomUUID(), serviceRevision: 1, consent: false };
  assert.throws(() => freezeTopicAgentRequest(input));
  for (const code of ['history_conflict', 'history_limit', 'lookup_unavailable', 'catalog_conflict', 'invalid_request']) assert.equal(knownTopicAgentRejection(code), true);
  for (const code of ['outcome_unknown', 'idempotency_conflict', 'network_outcome_unknown', 'provider_failure', 'session_expired']) assert.equal(knownTopicAgentRejection(code), false);
  assert.equal(inferTopicAgentIntent('比较两条路线'), 'compare'); assert.equal(inferTopicAgentIntent('第一周怎么验证'), 'plan');
});

const projectA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', projectB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
async function syntheticModelTurn({ previous, ...scope } = {}) {
  const base = await local(scope), request = freezeTopicAgentRequest({ profile: base.profile, candidateIds: base.candidateIds, message: '合成回执，仅验证会话恢复', intent: 'compare', parentTurnId: previous?.id ?? null, mode: 'model', serviceId: previous?.serviceId ?? crypto.randomUUID(), serviceRevision: 1, consent: true, ...scope });
  return parseTopicAgentTurn({ ...base, id: request.idempotencyKey, mode: 'model', providerMode: 'fixture', modelCalled: true, message: request.message, intent: request.intent, serviceId: request.serviceId, serviceRevision: 1, parentTurnId: request.parentTurnId, turnIndex: (previous?.turnIndex ?? 0) + 1, inputFingerprint: digest(topicAgentFingerprintMaterial(request)) });
}

test('project extension keeps legacy fingerprint material byte-equivalent and explicitly binds new null/project scopes', async () => {
  const turn = await local(), request = { ...freezeTopicAgentRequest({ profile: turn.profile, candidateIds: turn.candidateIds, message: turn.message, intent: turn.intent, parentTurnId: null, mode: 'local', serviceId: null, serviceRevision: null, consent: false }), idempotencyKey: turn.id };
  const oldMaterial = { schemaVersion: 1, catalogVersion: request.catalogVersion, profile: request.profile, candidateIds: request.candidateIds, message: request.message, intent: request.intent, parentTurnId: null, mode: 'local', serviceId: null, serviceRevision: null, lookupId: null, sourceVersions: TOPIC_SOURCE_VERSIONS };
  assert.equal(digest(topicAgentFingerprintMaterial(request)), digest(oldMaterial)); assert.equal(Object.hasOwn(parseTopicAgentTurn(turn), 'projectId'), false);
  const variants = [request, { ...request, projectId: null }, { ...request, projectId: projectA }, { ...request, projectId: projectB }];
  assert.equal(new Set(variants.map(row => digest(topicAgentFingerprintMaterial(row)))).size, 4);
  await assert.rejects(verifyTopicAgentTurn({ ...turn, projectId: null }, request), /不一致/);
  assert.equal(topicAgentScopeQuery(), '?scope=global'); assert.equal(topicAgentScopeQuery(null), '?scope=global'); assert.equal(topicAgentScopeQuery(projectA), `?projectId=${projectA}`);
  for (const invalid of ['', '../one', 'null', 7, false, {}]) assert.throws(() => topicAgentScopeQuery(invalid));
  assert.throws(() => freezeTopicAgentRequest({ ...request, projectId: undefined }));
});

test('local conversation cannot transfer a project parent across scopes while historical global parents remain readable', async () => {
  const first = await local({ projectId: projectA }); assert.equal(first.projectId, projectA);
  const second = await local({ projectId: projectA, previous: first }); assert.equal(second.parentTurnId, first.id);
  for (const projectId of [projectB, null, undefined]) await assert.rejects(local({ projectId, previous: first }), /其他项目/);
  const legacy = await local(), global = await local({ projectId: null, previous: legacy });
  assert.equal(Object.hasOwn(legacy, 'projectId'), false); assert.equal(global.projectId, null); assert.equal(global.parentTurnId, legacy.id);
});

test('pending restoration preserves scope field presence and refuses an explicitly misplaced frozen project', async () => {
  const base = await local(), ownerId = crypto.randomUUID();
  const request = freezeTopicAgentRequest({ profile: base.profile, candidateIds: base.candidateIds, message: '合成待核对请求', intent: 'refine', parentTurnId: null, mode: 'model', serviceId: crypto.randomUUID(), serviceRevision: 1, consent: true, projectId: projectA });
  const pending = { schemaVersion: 1, ownerId, namespace: `project:${projectA}`, request, context: 'frozen-context', sourceVersions: TOPIC_SOURCE_VERSIONS };
  assert.deepEqual(parseTopicAgentPending(JSON.stringify(pending), ownerId, pending.namespace).request, request);
  for (const namespace of ['global', `project:${projectB}`]) assert.throws(() => parseTopicAgentPending({ ...pending, namespace }, ownerId, namespace));
  const { projectId: omitted, ...legacy } = request; void omitted;
  const old = parseTopicAgentPending({ ...pending, request: legacy }, ownerId, pending.namespace); assert.equal(Object.hasOwn(old.request, 'projectId'), false);
  const global = parseTopicAgentPending({ ...pending, namespace: 'global', request: { ...request, projectId: null } }, ownerId, 'global'); assert.equal(global.request.projectId, null);
});

test('full conversation validates ownership-independent project, mode, root, sequence and every ancestor before restoration', async () => {
  const first = await syntheticModelTurn({ projectId: projectA }), second = await syntheticModelTurn({ projectId: projectA, previous: first });
  const turns = parseTopicAgentConversation({ turns: [first, second] }, projectA); assert.equal(turns[1].parentTurnId, first.id);
  assert.equal(topicAgentConversationResumable(turns, projectA), true);
  assert.throws(() => parseTopicAgentConversation({ turns }, projectB)); assert.throws(() => parseTopicAgentConversation({ turns }));
  for (const bad of [[], [second], [first, first], [second, first], [first, { ...second, turnIndex: 3 }], [first, { ...second, projectId: projectB }], [first, { ...second, parentTurnId: second.id }]]) assert.throws(() => parseTopicAgentConversation({ turns: bad }, projectA));
  const localTurn = await local({ projectId: projectA }); assert.throws(() => parseTopicAgentConversation({ turns: [first, { ...localTurn, parentTurnId: first.id, turnIndex: 2 }] }, projectA));
  assert.throws(() => parseTopicAgentConversation({ turns: [first, { ...second, createdAt: '2000-01-01T00:00:00Z' }] }, projectA));
  const sparse = [first, second]; delete sparse[1]; assert.throws(() => parseTopicAgentConversation({ turns: sparse }, projectA));
  assert.throws(() => parseTopicAgentConversation({ turns, projectId: projectA }, projectA));
});

test('historical and unsuccessful leaf transcripts remain viewable without becoming resumable', async () => {
  const first = await syntheticModelTurn({ projectId: projectA }), next = await syntheticModelTurn({ projectId: projectA, previous: first });
  const historical = [first, { ...next, sourceVersions: { ...next.sourceVersions, topicDigest: '0'.repeat(64) } }];
  assert.equal(parseTopicAgentConversation({ turns: historical }, projectA).length, 2); assert.equal(topicAgentConversationResumable(historical, projectA), false);
  for (const status of ['failed', 'outcome_unknown']) {
    const leaf = { ...next, status, assistant: null, errorCode: 'provider_timeout' };
    assert.equal(parseTopicAgentConversation({ turns: [first, leaf] }, projectA)[1].status, status); assert.equal(topicAgentConversationResumable([first, leaf], projectA), false);
    assert.throws(() => parseTopicAgentConversation({ turns: [{ ...first, status, assistant: null, errorCode: 'provider_timeout' }, next] }, projectA));
  }
  const legacy = await syntheticModelTurn(), global = await syntheticModelTurn({ projectId: null, previous: legacy });
  assert.equal(parseTopicAgentConversation({ turns: [legacy, global] }, null).length, 2);
});

test('restored candidate suggestions recheck actual conditions and stop at the twelve-turn boundary', async () => {
  const turns = [await syntheticModelTurn({ projectId: projectA })], snapshot = structuredClone(turns);
  assert.equal(topicAgentContinuationCandidates(turns[0].profile, turns).length, 3);
  assert.deepEqual(topicAgentContinuationCandidates({ ...turns[0].profile, budgetYuan: 0 }, turns), []); assert.deepEqual(turns, snapshot);
  while (turns.length < 11) turns.push(await syntheticModelTurn({ projectId: projectA, previous: turns.at(-1) }));
  assert.equal(topicAgentConversationResumable(turns, projectA), true);
  turns.push(await syntheticModelTurn({ projectId: projectA, previous: turns.at(-1) }));
  assert.equal(parseTopicAgentConversation({ turns }, projectA).length, 12); assert.equal(topicAgentConversationResumable(turns, projectA), false); assert.deepEqual(topicAgentContinuationCandidates(turns[0].profile, turns), []);
});
