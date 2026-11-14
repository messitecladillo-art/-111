import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [path.join(root, 'lib/agent/workflow-tasks.ts')], bundle: true, format: 'esm', platform: 'node', write: false,
  alias: { '@evix/shared': path.resolve(root, '../../packages/evi-x-shared/src/index.ts') } });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=workflow-contract-test-bundle.mjs').toString('base64')}`);
const project = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', owner = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const executionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', grantId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const now = '2026-11-14T00:00:00Z', later = '2026-11-14T00:20:00Z', sha = 'a'.repeat(64);
const scope = { projectId: project, ownerId: owner, taskId };
const service = { id: serviceId, label: 'Synthetic fixture only', provider: 'compatible', baseUrl: 'https://fixture.invalid/v1', model: 'fixture', maxOutputTokens: 512, capabilities: ['research', 'questionnaire', 'report'], revision: 7 };
// These wire fixtures are explicit, independently written examples of backend DTOs.
const research = ['research.review_materials', 'research.design_research', 'research.assess_feasibility'];
const reviewer = ['reviewer.check_evidence', 'reviewer.check_consistency', 'reviewer.review_deliverable'];
const steps = Object.fromEntries([...research, ...reviewer].map(key => [key, structuredClone(service)]));
function task() { return { id: taskId, projectId: project, taskType: 'topic_design', status: 'needs_input', revision: 4,
  state: { task_id: taskId, project_id: project, task_type: 'topic_design', requirements: { objective: 'Synthetic research' }, context: {}, input_artifact_refs: [], constraints: {},
    status: 'needs_input', current_role: 'reviewer', awaiting_approval: 'approve_reviewer', retry_count: {}, max_retries: 2, artifact_refs: [], evidence_refs: [], unresolved_questions: [], errors: [], summary: 'Review complete', revision: 2,
    agent_outputs: { research: { summary: 'Proposed only', deliverable: { classification: 'proposed', exactHtml: '<script>untrusted plain text</script>', values: [1, true, null] } } },
    model_bindings: { schemaVersion: 1, ownerId: owner, steps: Object.fromEntries([...research, ...reviewer].map(step => [step, { serviceId, revision: 7, capability: step.startsWith('research.') ? 'research' : 'report' }])) } },
  createdAt: now, updatedAt: later }; }
function preview() { return { schemaVersion: 1, taskId, projectId: project, baseRevision: 4, position: 0, roles: ['research', 'reviewer'], phaseHash: sha, inputHash: 'b'.repeat(64), maxCalls: 6, maxOutputTokens: 3072, grantSeconds: 1200,
  materials: { requirements: { objective: 'Proposed research' }, inputs: [] }, steps: structuredClone(steps), instructionHashes: Object.fromEntries(Object.keys(steps).map(step => [step, sha])), available: true, missingTools: [] }; }
function grant() { return { schemaVersion: 1, taskId, projectId: project, baseRevision: 4, position: 0, roles: ['research', 'reviewer'], phaseHash: sha, maxCalls: 6, maxOutputTokens: 3072,
  steps: structuredClone(steps), id: grantId, ownerId: owner, status: 'active', usedCalls: 0, createdAt: now, expiresAt: later, stopReason: null }; }
function execution() { return { id: executionId, role: 'research', status: 'outcome_unknown', inputRevision: 4, claimedRevision: 5, inputHash: sha, resultHash: null, errorCode: 'execution_timeout', startedAt: now, leaseExpiresAt: later, finishedAt: later }; }
function call() { return { schema: 'workflow-model-call/v1', id: executionId, taskId, projectId: project, executionId, step: 'research.review_materials', status: 'completed', inputRevision: 4, inputHash: sha, consentHash: sha, serviceId, serviceRevision: 7, providerMode: 'fixture', startedAt: now, finishedAt: later, resultHash: sha, usage: { inputTokens: 0, outputTokens: 15 }, errorCode: null, grantId }; }

test('task keeps API revision separate from pipeline position and retains detached bounded structured output', () => {
  const fixture = task(), parsed = api.parseWorkflowTask(fixture, scope);
  assert.equal(parsed.revision, 4); assert.equal(parsed.state.revision, 2);
  assert.equal(parsed.status, 'needs_input'); assert.equal(parsed.state.awaiting_approval, 'approve_reviewer');
  assert.deepEqual(parsed.state.agent_outputs, fixture.state.agent_outputs);
  fixture.state.agent_outputs.research.deliverable.values[0] = 99;
  assert.equal(parsed.state.agent_outputs.research.deliverable.values[0], 1);
  assert.equal(parsed.state.agent_outputs.research.deliverable.exactHtml, '<script>untrusted plain text</script>');
});

test('task identity, status, exact step coverage and canonical IDs fail closed; teammate reads remain possible', () => {
  const teammate = task(); teammate.state.model_bindings.ownerId = grantId;
  assert.equal(api.parseWorkflowTask(teammate, scope).state.model_bindings.ownerId, grantId);
  const invalids = [
    value => { value.projectId = grantId; value.state.project_id = grantId; },
    value => { value.id = grantId; value.state.task_id = grantId; },
    value => { value.state.task_id = grantId; }, value => { value.state.status = 'ready'; },
    value => { value.state.task_type = 'questionnaire'; }, value => { value.id = taskId.toUpperCase(); },
    value => { value.revision = true; }, value => { value.state.revision = 3; }, value => { value.state.model_bindings.ownerId = 'not-uuid'; },
    value => { delete value.state.model_bindings.steps['research.design_research']; },
    value => { value.state.model_bindings.steps['reviewer.check_evidence'].capability = 'research'; },
    value => { value.state.model_bindings.steps['reviewer.extra'] = { serviceId, revision: 7, capability: 'report' }; },
    value => { value.rawPrompt = 'not part of the receipt'; }, value => { value.updatedAt = '2026-02-30T00:00:00Z'; },
  ];
  for (const mutate of invalids) { const value = task(); mutate(value); assert.throws(() => api.parseWorkflowTask(value, scope)); }
  assert.throws(() => api.parseWorkflowTasks({ tasks: [task(), task()] }, scope));
});

test('JSON boundaries reject code-bearing objects, accessors, cycles, sparse arrays, invalid numbers and oversized state', () => {
  let getterRead = false;
  const withGetter = task(); Object.defineProperty(withGetter.state.context, 'secret', { enumerable: true, get() { getterRead = true; return 'unread'; } });
  assert.throws(() => api.parseWorkflowTask(withGetter, scope)); assert.equal(getterRead, false);
  for (const replacement of [new Date(), { toJSON() { throw Error('must not run'); } }, { value: NaN }, { value: Infinity }, { value: undefined }, { value: BigInt(1) }, { value: Array(1) }, { value: '\ud800' }, { [Symbol('hidden')]: 'bad' }]) {
    const value = task(); value.state.context = replacement; assert.throws(() => api.parseWorkflowTask(value, scope));
  }
  const cyclic = {}; cyclic.self = cyclic;
  const value = task(); value.state.context = cyclic; assert.throws(() => api.parseWorkflowTask(value, scope));
  value.state.context = { raw: '汉'.repeat(340_000) }; assert.throws(() => api.parseWorkflowTask(value, scope));
  value.state.context = {}; let deep = value.state.context; for (let i = 0; i < 17; i++) deep = deep.next = {};
  assert.throws(() => api.parseWorkflowTask(value, scope));
});

test('phase preview binds all producer and reviewer steps to capabilities, hashes and exact call/token limits', () => {
  assert.equal(api.parseWorkflowPhasePreview(preview(), scope).maxCalls, 6);
  for (const mutate of [
    value => { value.taskId = grantId; }, value => { value.projectId = grantId; }, value => { value.roles = ['reviewer', 'research']; },
    value => { value.roles = ['research', 'research']; }, value => { delete value.steps['reviewer.check_evidence']; },
    value => { value.steps['research.review_materials'].capabilities = ['report']; }, value => { value.steps['research.review_materials'].apiKey = 'refused'; },
    value => { value.maxCalls = 5; }, value => { value.maxOutputTokens = 3000; }, value => { value.phaseHash = sha.toUpperCase(); },
    value => { value.instructionHashes['research.review_materials'] = 'bad'; }, value => { value.instructionHashes.extra = sha; },
    value => { value.grantSeconds = 1201; }, value => { value.available = true; value.missingTools = ['load_dataset']; },
  ]) { const value = preview(); mutate(value); assert.throws(() => api.parseWorkflowPhasePreview(value, scope)); }
  const data = preview(); data.roles = ['data', 'reviewer']; data.steps = Object.fromEntries(['data.inspect_data', 'data.clean_data', 'data.analyze_data', ...reviewer].map(step => [step, service])); data.instructionHashes = Object.fromEntries(Object.keys(data.steps).map(step => [step, sha])); data.available = false; data.missingTools = ['load_dataset', 'analyze_dataset'];
  assert.equal(api.parseWorkflowPhasePreview(data, scope).available, false);
});

test('grants enforce account and task scope with bounded budget, timestamps and secret-free public shape', () => {
  assert.equal(api.parseWorkflowModelGrant(grant(), scope).usedCalls, 0);
  for (const mutate of [
    value => { value.ownerId = grantId; }, value => { value.taskId = grantId; }, value => { value.usedCalls = 7; },
    value => { value.stopReason = 'stopped'; }, value => { value.expiresAt = now; }, value => { value.basisHash = sha; }, value => { value.rawOutput = {}; },
  ]) { const value = grant(); mutate(value); assert.throws(() => api.parseWorkflowModelGrant(value, scope)); }
  for (const status of ['stopped', 'expired', 'exhausted']) { const value = grant(); value.status = status; value.stopReason = 'public_reason'; assert.equal(api.parseWorkflowModelGrant(value, scope).status, status); }
  assert.throws(() => api.parseWorkflowGrants({ grants: [grant(), grant()] }, scope));
});

test('model-call and execution receipts preserve unknown outcomes without allowing forged identities or usage', () => {
  const unknown = api.parseWorkflowExecution(execution()); assert.equal(unknown.status, 'outcome_unknown'); assert.equal(unknown.resultHash, null);
  assert.equal(api.parseWorkflowModelCall(call(), scope).grantId, grantId);
  const legacy = call(); delete legacy.grantId; assert.equal(api.parseWorkflowModelCall(legacy, scope).grantId, undefined);
  for (const mutate of [value => { value.projectId = grantId; }, value => { value.taskId = grantId; }, value => { value.step = 'reviewer.unregistered'; }, value => { value.usage.inputTokens = -1; }, value => { value.grantId = grantId.toUpperCase(); }, value => { value.rawPrompt = 'not public'; }, value => { value.providerMode = 'simulated_success'; }]) {
    const value = call(); mutate(value); assert.throws(() => api.parseWorkflowModelCall(value, scope));
  }
  const wrongClaim = execution(); wrongClaim.claimedRevision = 9; assert.throws(() => api.parseWorkflowExecution(wrongClaim));
  const futureExecution = task(); futureExecution.execution = execution(); assert.throws(() => api.parseWorkflowTask(futureExecution, scope));
  futureExecution.revision = 5; assert.equal(api.parseWorkflowTask(futureExecution, scope).execution.claimedRevision, 5);
  futureExecution.execution.role = 'data'; assert.throws(() => api.parseWorkflowTask(futureExecution, scope));
  assert.throws(() => api.parseWorkflowExecutions({ executions: [execution(), execution()] }));
});

test('run-specific model plans require every relevant role and the exact capability; old call defaults never become roles', () => {
  const selections = { research: serviceId, survey: serviceId, data: serviceId, writing: serviceId, reviewer: serviceId };
  const full = api.makeWorkflowModelPlan('full_research', selections, [service]);
  assert.deepEqual(Object.keys(full.roles), ['research', 'survey', 'data', 'writing', 'reviewer']);
  assert.deepEqual(api.makeWorkflowModelPlan('topic_design', selections, [service]), { schemaVersion: 1, roles: { research: { serviceId, revision: 7 }, reviewer: { serviceId, revision: 7 } } });
  for (const [kind, input, catalog] of [
    ['topic_design', { research: serviceId }, [service]], ['topic_design', { ...selections, 'agent-chat': serviceId }, [service]],
    ['topic_design', selections, [{ ...service, capabilities: ['research'] }]], ['questionnaire', selections, [{ ...service, capabilities: ['research', 'report'] }]],
    ['report', selections, []], ['data_analysis', selections, [{ ...service, capabilities: ['report'] }]],
    ['topic_design', selections, [service, service]], ['unregistered', selections, [service]],
  ]) assert.throws(() => api.makeWorkflowModelPlan(kind, input, catalog));
});

test('creation request requires a canonical idempotency key and exact task role coverage before dispatch', () => {
  const request = { taskType: 'topic_design', requirements: { objective: 'Synthetic fixture' }, modelPlan: { schemaVersion: 1, roles: { research: { serviceId, revision: 7 }, reviewer: { serviceId, revision: 7 } } }, idempotencyKey: grantId };
  assert.deepEqual(api.parseWorkflowCreateRequest(request), request);
  for (const mutate of [value => { delete value.idempotencyKey; }, value => { value.idempotencyKey = '../bad'; }, value => { value.modelPlan.roles.data = { serviceId, revision: 7 }; }, value => { value.modelPlan.roles.reviewer.revision = false; }, value => { value.modelPlan.default = { serviceId, revision: 7 }; }, value => { value.requirements = { raw: 'a'.repeat(100_001) }; }]) {
    const value = structuredClone(request); mutate(value); assert.throws(() => api.parseWorkflowCreateRequest(value));
  }
});

test('data phase disclosure preserves precise snapshots and rejects raw rows, missing policy and malformed references', () => {
  const value = preview();
  Object.assign(value, { dataTool: 'survey-release-aggregates/v1', dataDisclosure: 'aggregate_statistics_only_no_rows_no_open_text',
    datasets: [{ ref: `survey-release:${serviceId}`, title: 'Synthetic responses', status: 'closed', classification: 'synthetic', rowCount: 3, variables: 2, sha256: sha }] });
  assert.deepEqual(api.parseWorkflowPhasePreview(value, scope).datasets, value.datasets);
  for (const mutate of [row => { delete row.dataDisclosure; }, row => { row.datasets[0].answers = ['private']; },
    row => { row.datasets[0].ref = 'browser-file'; }, row => { row.datasets[0].rowCount = -1; }, row => { row.datasets[0].classification = 'verified'; }]) {
    const invalid = structuredClone(value); mutate(invalid); assert.throws(() => api.parseWorkflowPhasePreview(invalid, scope));
  }
});
