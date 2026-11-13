import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [path.join(root, 'components/agent/workflow-client.ts')], bundle: true, format: 'esm', platform: 'node', write: false,
  alias: { '@': root, '@evix/shared': path.resolve(root, '../../packages/evi-x-shared/src/index.ts') } });
const client = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=workflow-client-test-bundle.mjs').toString('base64')}`);
const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ownerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const serviceId = 'dddddddd-dddd-4ddd-addd-dddddddddddd', executionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', grantId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const scope = { projectId, ownerId, taskId }, projectScope = { projectId, ownerId };
const base = `/api/projects/${projectId}/agent-tasks`, taskBase = `${base}/${taskId}`, sha = 'a'.repeat(64), now = '2026-11-14T00:00:00Z', later = '2026-11-14T00:20:00Z';
const research = ['research.review_materials', 'research.design_research', 'research.assess_feasibility'], reviewer = ['reviewer.check_evidence', 'reviewer.check_consistency', 'reviewer.review_deliverable'];
const service = { id: serviceId, label: 'Synthetic fixture', provider: 'compatible', baseUrl: 'https://fixture.invalid/v1', model: 'fixture', maxOutputTokens: 512, capabilities: ['research', 'report'], revision: 7 };
function task() { return { id: taskId, projectId, taskType: 'topic_design', status: 'ready', revision: 4, createdAt: now, updatedAt: now,
  state: { task_id: taskId, project_id: projectId, task_type: 'topic_design', requirements: { objective: 'Synthetic test' }, context: {}, constraints: {}, input_artifact_refs: [], status: 'ready', current_role: null, awaiting_approval: null, retry_count: {}, max_retries: 2, artifact_refs: [], evidence_refs: [], unresolved_questions: [], errors: [], summary: '', revision: 0, agent_outputs: {},
    model_bindings: { schemaVersion: 1, ownerId, steps: Object.fromEntries([...research, ...reviewer].map(step => [step, { serviceId, revision: 7, capability: step.startsWith('research.') ? 'research' : 'report' }])) } } }; }
function preview() { return { schemaVersion: 1, taskId, projectId, baseRevision: 4, position: 0, roles: ['research', 'reviewer'], phaseHash: sha, inputHash: sha, grantSeconds: 1200, maxCalls: 6, maxOutputTokens: 3072,
  materials: { requirements: { objective: 'Synthetic test' } }, steps: Object.fromEntries([...research, ...reviewer].map(step => [step, structuredClone(service)])), instructionHashes: Object.fromEntries([...research, ...reviewer].map(step => [step, sha])), available: true, missingTools: [] }; }
function grant() { return { schemaVersion: 1, taskId, projectId, baseRevision: 4, position: 0, roles: ['research', 'reviewer'], phaseHash: sha, maxCalls: 6, maxOutputTokens: 3072,
  steps: Object.fromEntries([...research, ...reviewer].map(step => [step, structuredClone(service)])), id: grantId, ownerId, status: 'active', usedCalls: 0, createdAt: now, expiresAt: later, stopReason: null }; }
function execution() { return { id: executionId, role: 'research', status: 'running', inputRevision: 4, claimedRevision: 5, inputHash: sha, resultHash: null, errorCode: null, startedAt: now, leaseExpiresAt: later, finishedAt: null }; }
function call() { return { schema: 'workflow-model-call/v1', id: executionId, taskId, projectId, executionId, step: 'research.review_materials', status: 'outcome_unknown', inputRevision: 4, inputHash: sha, consentHash: sha, serviceId, serviceRevision: 7, providerMode: 'fixture', startedAt: now, finishedAt: null, resultHash: null, usage: null, errorCode: 'model_call_requires_reconciliation', grantId }; }
function creation() { return { taskType: 'topic_design', requirements: { objective: 'Synthetic test' }, modelPlan: { schemaVersion: 1, roles: { research: { serviceId, revision: 7 }, reviewer: { serviceId, revision: 7 } } }, idempotencyKey: grantId }; }
async function mockReads(handler, action) {
  const previous = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
  try { await action(calls); } finally { globalThis.fetch = previous; }
}
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

test('all receipt reads use exact project/task routes, bounded JSON transport and abortable requests', async () => {
  const controller = new AbortController(), fixtures = new Map([
    [base, { tasks: [task()] }], [taskBase, task()], [`/api/projects/${projectId}/agent-task-creations/${grantId}`, task()],
    [`${taskBase}/model-phase-preview`, preview()], [`${taskBase}/model-grants`, { grants: [grant()] }],
    [`${taskBase}/model-calls`, { calls: [call()] }], [`${taskBase}/executions`, { executions: [execution()] }],
  ]);
  await mockReads(url => json(fixtures.get(url)), async calls => {
    assert.equal((await client.readWorkflowTasks(projectScope, { signal: controller.signal }))[0].id, taskId);
    assert.equal((await client.readWorkflowTask(scope, { signal: controller.signal })).revision, 4);
    assert.equal((await client.readWorkflowCreation(projectScope, grantId, { signal: controller.signal })).id, taskId);
    assert.equal((await client.readWorkflowPhasePreview(scope, { signal: controller.signal })).phaseHash, sha);
    assert.equal((await client.readWorkflowGrants(scope, { signal: controller.signal }))[0].ownerId, ownerId);
    assert.equal((await client.readWorkflowCalls(scope, { signal: controller.signal }))[0].status, 'outcome_unknown');
    assert.equal((await client.readWorkflowExecutions(scope, { signal: controller.signal }))[0].id, executionId);
    assert.deepEqual(calls.map(item => item.url), [...fixtures.keys()]);
    for (const { init } of calls) { assert.equal(init.method, 'GET'); assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'same-origin'); assert.ok(init.signal instanceof AbortSignal); assert.equal(init.body, undefined); }
    controller.abort(); for (const { init } of calls) assert.equal(init.signal.aborted, true);
  });
});

test('creation uses one validated mutation with exact role versions and rejects a different owner or binding receipt', async () => {
  const calls = [], signal = new AbortController().signal;
  const mutate = async (...args) => { calls.push(args); return task(); };
  assert.equal((await client.createWorkflowTask(mutate, projectScope, creation(), { signal })).id, taskId);
  assert.deepEqual(calls[0].slice(0, 3), [base, creation(), 'POST']);
  assert.equal(calls[0][3].signal, signal); assert.equal(calls[0][3].timeoutMs, 45_000); assert.ok(calls[0][3].maxBytes <= 16 * 1024 * 1024);
  const wrongOwner = task(); wrongOwner.state.model_bindings.ownerId = grantId;
  await assert.rejects(client.createWorkflowTask(async () => wrongOwner, projectScope, creation()));
  const wrongBinding = task(); wrongBinding.state.model_bindings.steps['research.review_materials'].revision++;
  await assert.rejects(client.createWorkflowTask(async () => wrongBinding, projectScope, creation()));
  const noDispatch = []; const invalid = creation(); delete invalid.idempotencyKey;
  await assert.rejects(client.createWorkflowTask(async (...args) => noDispatch.push(args), projectScope, invalid)); assert.equal(noDispatch.length, 0);
});

test('ordinary reads preserve team visibility while grant receipts reject a different account', async () => {
  const teammate = task(); teammate.state.model_bindings.ownerId = grantId;
  await mockReads(() => json(teammate), async () => {
    assert.equal((await client.readWorkflowTask(scope)).state.model_bindings.ownerId, grantId);
    assert.equal((await client.readWorkflowCreation(projectScope, grantId)).state.model_bindings.ownerId, grantId);
  });
  await mockReads(() => json({ grants: [{ ...grant(), ownerId: executionId }] }), async () => { await assert.rejects(client.readWorkflowGrants(scope)); });
});

test('explicit grant creation matches consent, idempotency key and phase; Stop revokes that exact persistent grant', async () => {
  const calls = [], body = { expectedRevision: 4, consent: true, phaseHash: sha, maxCalls: 6, idempotencyKey: grantId };
  const mutate = async (...args) => { calls.push(args); return args[0].endsWith('/revoke') ? { ...grant(), status: 'stopped', stopReason: 'grant_revoked' } : grant(); };
  assert.equal((await client.createWorkflowGrant(mutate, scope, body)).id, grantId);
  assert.deepEqual(calls[0].slice(0, 3), [`${taskBase}/model-grants`, body, 'POST']); assert.equal(calls[0][3].timeoutMs, 45_000);
  assert.equal((await client.revokeWorkflowGrant(mutate, scope, grantId)).stopReason, 'grant_revoked');
  assert.deepEqual(calls[1].slice(0, 3), [`${taskBase}/model-grants/${grantId}/revoke`, {}, 'POST']);
  for (const altered of [{ ...grant(), id: executionId }, { ...grant(), phaseHash: 'b'.repeat(64) }, { ...grant(), baseRevision: 5 }]) await assert.rejects(client.createWorkflowGrant(async () => altered, scope, body));
  await assert.rejects(client.revokeWorkflowGrant(async () => grant(), scope, grantId));
  const invalid = { ...body, consent: false }; let count = 0;
  await assert.rejects(client.createWorkflowGrant(async () => { count++; return grant(); }, scope, invalid)); assert.equal(count, 0);
});

test('advance alone permits the 120-second wait and sends outer expectedRevision without changing authorization', async () => {
  const calls = [], mutate = async (...args) => { calls.push(args); return task(); }, signal = new AbortController().signal;
  const result = await client.advanceWorkflowTask(mutate, scope, { expectedRevision: 4, modelGrantId: grantId }, { signal });
  assert.equal(result.state.revision, 0);
  assert.deepEqual(calls[0].slice(0, 3), [`${taskBase}/advance`, { expectedRevision: 4, modelGrantId: grantId }, 'POST']);
  assert.equal(calls[0][3].timeoutMs, 120_000); assert.equal(calls[0][3].signal, signal);
  await client.advanceWorkflowTask(mutate, scope, { expectedRevision: 4, modelGrantId: grantId }, { timeoutMs: 10_000 });
  assert.equal(calls[1][3].timeoutMs, 10_000);
  await assert.rejects(client.advanceWorkflowTask(mutate, scope, { expectedRevision: 4, modelGrantId: grantId, modelConsent: { accepted: true } }));
  assert.equal(calls.length, 2);
});

test('completion and data-input gates may advance without authorizing or dispatching a model call', async () => {
  const calls = [], complete = task(); complete.status = complete.state.status = 'completed'; complete.state.revision = 2;
  const result = await client.advanceWorkflowTask(async (...args) => { calls.push(args); return complete; }, scope, { expectedRevision: 4 });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls[0].slice(0, 3), [`${taskBase}/advance`, { expectedRevision: 4 }, 'POST']);
  const refusal = Object.assign(Error('Explicit model consent required.'), { status: 422, code: 'model_consent_required' });
  await assert.rejects(client.advanceWorkflowTask(async (...args) => { calls.push(args); throw refusal; }, scope, { expectedRevision: 4 }), error => error === refusal);
  assert.equal(calls.length, 2);
});

test('approval and cancellation make one versioned POST; malformed input never reaches the mutation callback', async () => {
  const calls = [], mutate = async (...args) => { calls.push(args); return task(); };
  await client.approveWorkflowTask(mutate, scope, { expectedRevision: 4, approved: false, feedback: 'Please revise the proposed design.' });
  await client.cancelWorkflowTask(mutate, scope, 4);
  assert.deepEqual(calls[0].slice(0, 3), [`${taskBase}/approval`, { expectedRevision: 4, approved: false, feedback: 'Please revise the proposed design.' }, 'POST']);
  assert.deepEqual(calls[1].slice(0, 3), [`${taskBase}/cancel`, { expectedRevision: 4 }, 'POST']);
  assert.equal(calls[0][3].timeoutMs, 45_000); assert.equal(calls[1][3].timeoutMs, 45_000);
  await assert.rejects(client.approveWorkflowTask(mutate, scope, { expectedRevision: true, approved: true }));
  await assert.rejects(client.approveWorkflowTask(mutate, scope, { expectedRevision: 4, approved: 'yes' }));
  await assert.rejects(client.cancelWorkflowTask(mutate, scope, -1)); assert.equal(calls.length, 2);
});

test('cross-project and cross-task responses, malformed JSON and oversized receipt bytes are rejected', async () => {
  for (const altered of [() => { const value = task(); value.projectId = grantId; value.state.project_id = grantId; return value; }, () => { const value = task(); value.id = grantId; value.state.task_id = grantId; return value; }]) {
    await mockReads(() => json(altered()), async () => { await assert.rejects(client.readWorkflowTask(scope)); });
  }
  await mockReads(() => new Response('{"id":1,"id":2}'), async () => { await assert.rejects(client.readWorkflowTask(scope), error => error.code === 'invalid_server_receipt'); });
  await mockReads(() => new Response(' '.repeat(1_100_001)), async () => { await assert.rejects(client.readWorkflowTask(scope), error => error.code === 'invalid_server_receipt'); });
  await assert.rejects(client.advanceWorkflowTask(async () => ({ ...task(), projectId: grantId }), scope, { expectedRevision: 4, modelGrantId: grantId }));
});

test('unknown POST results and a creation 404 never trigger resend, reauthorization or a different task', async () => {
  let mutations = 0, reads = 0;
  const unknown = Object.assign(Error('unknown outcome'), { status: 0, code: 'network_outcome_unknown' });
  const mutate = async () => { mutations++; throw unknown; };
  await assert.rejects(client.createWorkflowTask(mutate, projectScope, creation()), error => error === unknown);
  await assert.rejects(client.createWorkflowGrant(mutate, scope, { expectedRevision: 4, consent: true, phaseHash: sha, maxCalls: 6, idempotencyKey: grantId }), error => error === unknown);
  await assert.rejects(client.advanceWorkflowTask(mutate, scope, { expectedRevision: 4, modelGrantId: grantId }), error => error === unknown);
  assert.equal(mutations, 3);
  await mockReads(() => { reads++; return new Response(JSON.stringify({ error: { code: 'not_found', message: 'No receipt yet.' } }), { status: 404 }); }, async () => {
    await assert.rejects(client.readWorkflowCreation(projectScope, grantId), error => error.status === 404 && error.code === 'not_found');
  });
  assert.equal(reads, 1); assert.equal(mutations, 3);
});

test('noncanonical route IDs and invalid wait limits are refused before a request is sent', async () => {
  await mockReads(() => { throw Error('must not dispatch'); }, async calls => {
    await assert.rejects(client.readWorkflowTask({ ...scope, projectId: '../escape' }));
    await assert.rejects(client.readWorkflowTask({ ...scope, taskId: taskId.toUpperCase() }));
    await assert.rejects(client.readWorkflowTask(scope, { timeoutMs: 45_001 }));
    await assert.rejects(client.readWorkflowTask(scope, { timeoutMs: 0 })); assert.equal(calls.length, 0);
  });
});

test('an in-flight read retains its captured identity and mutation replies cannot move the API version backwards', async () => {
  const mutableScope = { ...scope }; let release;
  await mockReads(() => new Promise(resolve => { release = resolve; }), async () => {
    const pending = client.readWorkflowTask(mutableScope); mutableScope.taskId = grantId;
    const wrong = task(); wrong.id = grantId; wrong.state.task_id = grantId; release(json(wrong));
    await assert.rejects(pending);
  });
  const stale = task(); stale.revision = 3;
  await assert.rejects(client.advanceWorkflowTask(async () => stale, scope, { expectedRevision: 4, modelGrantId: grantId }));
  await assert.rejects(client.approveWorkflowTask(async () => stale, scope, { expectedRevision: 4, approved: true }));
  await assert.rejects(client.cancelWorkflowTask(async () => stale, scope, 4));
});
