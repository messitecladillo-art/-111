import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRunView, createSiliconRunner } from '../components/hosted/silicon-runner.ts';
import { exampleQuestionnaire } from '../lib/questionnaire.ts';
import { siliconCsv } from '../lib/silicon/export.ts';

const serviceId = '651fd4b9-7672-491b-9251-dea7809cfc8a';
const response = status => ({ personaId: 'p1', scenarioId: 'base', model: '合成服务', status, answers: [], ...(status === 'outcome_unknown' ? { error: 'provider_timeout' } : {}) });
const receipt = responses => ({ id: 'a51fd4b9-7672-491b-9251-dea7809cfc8a', status: 'outcome_unknown', classification: 'simulated', done: responses.length, total: responses.length, services: [{ serviceId, name: '合成服务' }], responses, createdAt: '2026-10-11T00:00:00Z', errorCode: 'provider_timeout' });

test('unknown silicon receipts remain distinguishable from known failure and cannot claim ready', () => {
  const value = receipt([response('ok'), response('outcome_unknown')]);
  assert.equal(parseRunView(value).responses[1].status, 'outcome_unknown');
  assert.throws(() => parseRunView({ ...value, status: 'ready' }), e => e.code === 'invalid_server_receipt');
  assert.throws(() => parseRunView(receipt([{ ...response('outcome_unknown'), answers: [{ questionId: 'q', shown: true, refused: false, unclear: '', value: 1 }] }])), e => e.code === 'invalid_server_receipt');
  assert.equal(parseRunView({ ...receipt([response('failed')]), status: 'failed' }).status, 'failed');
});

function request() {
  return { design: exampleQuestionnaire(), attributes: [], personas: [{ id: 'p1', code: 'P-1', traits: {}, background: '' }], settings: { engine: 'model', memory: 'carry', shuffleOptions: false, scenarios: [], models: [serviceId] }, idempotencyKey: '651fd4b9-7672-491b-9251-dea7809cfc8a' };
}
const services = [{ id: serviceId, label: '合成服务', model: 'fixture', revision: 1, provider: 'openai', capabilities: ['research'] }];

test('partial silicon results retain unknown run state and never replay a dispatched call', async () => {
  let calls = 0;
  const runner = createSiliconRunner({ projectId: 'project', services, localTest: true, mutate: async (_path, body) => { calls++; assert.equal(body.idempotencyKey, request().idempotencyKey); return receipt([response('ok'), response('outcome_unknown')]); } });
  const result = await runner.run(request(), () => {}, new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.responses[1].status, 'outcome_unknown');
  assert.ok(result.notes.some(note => note.includes('待对账')));
  const csv = siliconCsv(request().design, result);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2, 'unknown responses never become analysis rows');
});

test('all-unknown silicon run reports reconciliation and does not submit again', async () => {
  let calls = 0;
  const runner = createSiliconRunner({ projectId: 'project', services, localTest: true, mutate: async () => { calls++; return receipt([response('outcome_unknown')]); } });
  await assert.rejects(runner.run(request(), () => {}, new AbortController().signal), /待对账/);
  assert.equal(calls, 1);
});
