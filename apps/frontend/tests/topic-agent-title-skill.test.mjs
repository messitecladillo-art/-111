import assert from 'node:assert/strict';
import test from 'node:test';
import { TOPIC_SOURCE_VERSIONS } from '../lib/topic-proposal.ts';
import { TOPIC_AGENT_SOURCE_VERSIONS, freezeTopicAgentRequest, parseTopicAgentConversation, parseTopicAgentTurn, runLocalTopicAgent, topicAgentConversationResumable, topicAgentFingerprintMaterial, verifyTopicAgentTurn } from '../lib/topic-agent/index.ts';
import { EMPTY_TOPIC_PROFILE } from '../lib/topic-advisor/types.ts';
import { createHash } from 'node:crypto';
import { stableStringify } from '../lib/topic-advisor/parse.ts';

const digest = value => createHash('sha256').update(stableStringify(value)).digest('hex');

test('title guidance uses a dedicated Agent version binding without replacing TopicProposal versions', () => {
  assert.notEqual(TOPIC_AGENT_SOURCE_VERSIONS.topicDigest, TOPIC_SOURCE_VERSIONS.topicDigest);
  assert.deepEqual(TOPIC_AGENT_SOURCE_VERSIONS.regionCatalog, TOPIC_SOURCE_VERSIONS.regionCatalog);
  assert.ok(Object.isFrozen(TOPIC_AGENT_SOURCE_VERSIONS));
});

test('historical title versions remain readable and verifiable but do not resume under new guidance', async () => {
  const profile = structuredClone({ ...EMPTY_TOPIC_PROFILE, schemaVersion: 2, regionRef: null, referenceDate: '2026-10-18' });
  const local = await runLocalTopicAgent({ profile, message: '完善校园服务方向', intent: 'recommend' });
  const request = freezeTopicAgentRequest({ profile, candidateIds: local.candidateIds, message: '比较题名', intent: 'compare', parentTurnId: null, mode: 'model', serviceId: crypto.randomUUID(), serviceRevision: 1, consent: true });
  const make = versions => parseTopicAgentTurn({ ...local, id: request.idempotencyKey, mode: 'model', providerMode: 'fixture', modelCalled: true, message: request.message, intent: request.intent, serviceId: request.serviceId, serviceRevision: 1, parentTurnId: null, turnIndex: 1, sourceVersions: versions, inputFingerprint: digest(topicAgentFingerprintMaterial(request, versions)) });
  const current = make(TOPIC_AGENT_SOURCE_VERSIONS);
  assert.equal(topicAgentConversationResumable([current]), true);
  const old = make(TOPIC_SOURCE_VERSIONS);
  const [read] = parseTopicAgentConversation({ turns: [old] });
  assert.deepEqual(read.sourceVersions, TOPIC_SOURCE_VERSIONS);
  assert.equal(topicAgentConversationResumable([read]), false);
  await verifyTopicAgentTurn(read, request, TOPIC_SOURCE_VERSIONS);
  await assert.rejects(verifyTopicAgentTurn(read, request));
});
