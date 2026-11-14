import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [path.join(root, 'components/agent/workflow-controller.ts')], bundle: true,
  format: 'esm', platform: 'node', write: false,
  alias: { '@': root, '@evix/shared': path.resolve(root, '../../packages/evi-x-shared/src/index.ts') },
  plugins: [{ name: 'injected-workflow-client', setup(builder) {
    builder.onResolve({ filter: /^\.\/workflow-client$/ }, () => ({ path: 'injected-client', namespace: 'controller-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'controller-test' }, () => ({ contents: 'export const testTransportMustBeInjected = true;', loader: 'js' }));
  } }],
});
const production = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=workflow-controller-test-bundle.mjs').toString('base64')}`);

// All server states, model configurations and receipts below are synthetic.
// The production controller is executed with an injected client; no fetch or provider is used.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ownerId = id(1), projectId = id(2), taskId = id(3), grantId = id(4);
const projectScope = { ownerId, projectId }, storageKey = `evix.workflow-execution.v1:${ownerId}:${projectId}`;
const roles = ['research', 'survey', 'data', 'writing', 'reviewer'];
const roleSteps = { research: ['review_materials', 'design_research', 'assess_feasibility'],
  survey: ['design_variables', 'design_questionnaire', 'design_sampling'], data: ['inspect_data', 'clean_data', 'analyze_data'],
  writing: ['outline_report', 'draft_report'], reviewer: ['check_evidence', 'check_consistency', 'review_deliverable'] };
const pipelines = { full_research: ['research', 'reviewer', 'survey', 'reviewer', 'data', 'reviewer', 'writing', 'reviewer'],
  topic_design: ['research', 'reviewer'], questionnaire: ['survey', 'reviewer'], data_analysis: ['data', 'reviewer'], report: ['writing', 'reviewer'] };
const capabilities = { research: 'research', survey: 'questionnaire', data: 'research', writing: 'report', reviewer: 'report' };
const service = (number, capability = ['research', 'questionnaire', 'report']) => ({ id: id(number), revision: 7,
  label: `Synthetic model ${number}`, provider: 'compatible', baseUrl: 'https://fixture.invalid/v1', model: `fixture-${number}`,
  maxOutputTokens: 512, capabilities: capability });
const defaultService = service(20), services = [defaultService, ...roles.map((role, n) => service(30 + n, [capabilities[role]]))];
const now = '2026-11-14T00:00:00Z', later = '2026-11-14T00:20:00Z', sha = 'a'.repeat(64);
const clone = value => structuredClone(value);
function task({ kind = 'full_research', position = 0, status = 'ready', revision = 0, owner = ownerId, awaiting = null,
  execution, taskIdentifier = taskId, projectIdentifier = projectId, summary = '' } = {}) {
  const taskRoles = kind === 'full_research' ? roles : [pipelines[kind][0], 'reviewer'];
  return { id: taskIdentifier, projectId: projectIdentifier, taskType: kind, status, revision, createdAt: now, updatedAt: now,
    state: { task_id: taskIdentifier, project_id: projectIdentifier, task_type: kind, status, revision: position, requirements: { goal: 'Synthetic direction' },
      context: {}, constraints: {}, input_artifact_refs: [], current_role: position ? pipelines[kind][position - 1] : null,
      awaiting_approval: awaiting, retry_count: {}, max_retries: 2, artifact_refs: [], evidence_refs: [], unresolved_questions: [], errors: [], summary,
      agent_outputs: {}, model_bindings: { schemaVersion: 1, ownerId: owner, steps: Object.fromEntries(taskRoles.flatMap(role =>
        roleSteps[role].map(step => [`${role}.${step}`, { serviceId: defaultService.id, revision: defaultService.revision, capability: capabilities[role] }]))),
      } }, ...(execution ? { execution } : {}) };
}
function execution(status = 'completed') { return { id: id(5), role: 'research', status, inputRevision: 0, claimedRevision: 1,
  inputHash: sha, resultHash: status === 'completed' ? sha : null, errorCode: null, startedAt: now, leaseExpiresAt: later,
  finishedAt: status === 'running' ? null : now }; }
function phase(value) {
  const role = pipelines[value.taskType][value.state.revision], phaseRoles = role === 'reviewer' ? ['reviewer'] : [role, 'reviewer'];
  const steps = Object.fromEntries(phaseRoles.flatMap(role => roleSteps[role].map(step => [`${role}.${step}`, clone(defaultService)])));
  return { schemaVersion: 1, taskId: value.id, projectId: value.projectId, baseRevision: value.revision, position: value.state.revision,
    roles: phaseRoles, phaseHash: sha, inputHash: sha, maxCalls: Object.keys(steps).length, maxOutputTokens: Object.keys(steps).length * 512,
    grantSeconds: 1200, materials: { requirements: clone(value.state.requirements) }, steps,
    instructionHashes: Object.fromEntries(Object.keys(steps).map(step => [step, sha])), available: true, missingTools: [] };
}
function grant(value, grantIdentifier = grantId, extra = {}) {
  const preview = phase(value);
  return { schemaVersion: 1, id: grantIdentifier, ownerId, taskId: value.id, projectId: value.projectId, status: 'active',
    baseRevision: value.revision, position: value.state.revision, roles: preview.roles, phaseHash: sha,
    maxCalls: preview.maxCalls, maxOutputTokens: preview.maxOutputTokens, usedCalls: 0, steps: preview.steps,
    createdAt: now, expiresAt: later, stopReason: null, ...extra };
}
function call(status = 'completed') { return { schema: 'workflow-model-call/v1', id: id(6), taskId, projectId, executionId: id(5),
  step: 'research.review_materials', status, inputRevision: 0, inputHash: sha, consentHash: sha, serviceId: defaultService.id,
  serviceRevision: 7, providerMode: 'fixture', startedAt: now, finishedAt: status === 'running' ? null : now,
  resultHash: status === 'completed' ? sha : null, usage: null, errorCode: null, grantId }; }
const locator = (extra = {}) => ({ schemaVersion: 1, taskId, creationKey: null, grantKey: null, selections: {}, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(predicate) { for (let n = 0; n < 30 && !predicate(); n++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'Expected controlled async boundary was not reached'); }

function harness({ initialTask = null, initialGrant = null, initialCalls = [], stored, storageMap = new Map(), client: custom = {},
  current = true, inputCurrent = true, defaultId = defaultService.id, initialServices = services, storageFailure = false } = {}) {
  if (stored !== undefined) storageMap.set(storageKey, JSON.stringify(stored));
  const events = [], changes = [], adopted = [], requests = [];
  let currentIdentity = current, currentInput = inputCurrent, serviceList = initialServices;
  const server = { task: clone(initialTask), grants: initialGrant ? [clone(initialGrant)] : [], calls: clone(initialCalls) };
  const defaults = {
    readWorkflowTasks: async () => server.task ? [clone(server.task)] : [],
    readWorkflowTask: async () => clone(server.task),
    readWorkflowCreation: async () => { if (!server.task) throw Object.assign(Error('Synthetic not found'), { status: 404 }); return clone(server.task); },
    readWorkflowCalls: async () => clone(server.calls), readWorkflowGrants: async () => clone(server.grants),
    readWorkflowSurveys: async () => [],
    provideWorkflowInput: async () => { throw Error('Unexpected dataset binding in synthetic test'); },
    readWorkflowPhasePreview: async () => phase(server.task),
    createWorkflowTask: async (_mutate, _scope, body) => { server.task = task(); server.task.state.requirements = clone(body.requirements); return clone(server.task); },
    createWorkflowGrant: async (_mutate, _scope, body) => { const value = grant(server.task, body.idempotencyKey); server.grants = [value]; return clone(value); },
    advanceWorkflowTask: async () => { throw Error('Unexpected model advance in synthetic test'); },
    approveWorkflowTask: async () => { throw Error('Unexpected approval in synthetic test'); },
    revokeWorkflowGrant: async (_mutate, _scope, selectedId) => {
      const value = server.grants.find(item => item.id === selectedId); assert.ok(value, 'Stop must target the actual persistent grant');
      Object.assign(value, { status: 'stopped', stopReason: 'grant_revoked' }); return clone(value);
    },
    cancelWorkflowTask: async () => { server.task = task({ status: 'blocked', revision: server.task.revision + 1,
      position: server.task.state.revision, execution: execution('cancelled') }); return clone(server.task); },
  };
  const client = Object.fromEntries(Object.keys(defaults).map(name => [name, async (...args) => {
    const opt = args.at(-1); if (opt?.signal) requests.push(opt.signal);
    events.push({ name, args: clone(args.map(value => typeof value === 'function' ? '[injected-mutate]' : value?.signal ? { signal: '[abortable]' } : value)) });
    return (custom[name] ?? defaults[name])(...args);
  }]));
  const storage = {
    getItem(key) { events.push({ name: 'storage.get', key }); return storageMap.get(key) ?? null; },
    setItem(key, value) { events.push({ name: 'storage.set', key, value: JSON.parse(value) }); if (storageFailure) throw Error('Synthetic storage full'); storageMap.set(key, value); },
  };
  const controller = production.createWorkflowController({ scope: projectScope,
    mutate: async () => { throw Error('Real transport must not be used in controller tests'); }, client, storage,
    current: () => currentIdentity, inputCurrent: () => currentInput, services: () => serviceList, defaultServiceId: () => defaultId,
    onChange: snapshot => changes.push(clone(snapshot)), onTask: value => adopted.push(clone(value)) });
  return { controller, server, events, changes, adopted, requests, storageMap,
    methods: () => events.filter(event => event.name !== 'storage.get' && event.name !== 'storage.set').map(event => event.name),
    calls: name => events.filter(event => event.name === name), snapshot: () => controller.getSnapshot(),
    stored: () => JSON.parse(storageMap.get(storageKey)), setCurrent: value => { currentIdentity = value; },
    setInputCurrent: value => { currentInput = value; }, setServices: value => { serviceList = value; },
  };
}

test('restore of an active grant is GET-only and never resumes model work automatically', async () => {
  const value = task(), active = grant(value);
  const h = harness({ initialTask: value, initialGrant: active, stored: locator({ grantKey: active.id }) });
  await h.controller.restore();
  assert.equal(h.snapshot().task.id, taskId); assert.equal(h.snapshot().grant.id, active.id);
  assert.equal(h.snapshot().restored, true); assert.equal(h.snapshot().loading, false);
  assert.deepEqual(h.methods(), ['readWorkflowTask', 'readWorkflowCalls', 'readWorkflowGrants', 'readWorkflowPhasePreview']);
  assert.equal(h.calls('advanceWorkflowTask').length, 0); assert.equal(h.calls('createWorkflowGrant').length, 0);
});

test('restore without a locator discovers only this account task and leaves a teammate task read-only', async () => {
  const teammate = task({ owner: id(99) });
  const own = task({ taskIdentifier: id(80) });
  const h = harness({ client: { readWorkflowTasks: async () => [teammate, own], readWorkflowPhasePreview: async () => phase(own) } });
  await h.controller.restore();
  assert.equal(h.snapshot().task.id, own.id);
  assert.equal(h.calls('createWorkflowTask').length, 0);
  const readonly = harness({ initialTask: teammate, stored: locator() });
  await readonly.controller.restore(); await readonly.controller.authorize(); await readonly.controller.resume();
  assert.equal(readonly.snapshot().task.id, teammate.id);
  assert.deepEqual(readonly.methods(), ['readWorkflowTask']);
});

test('creation stores its UUID before POST and persists only locators and service IDs', async () => {
  let h;
  h = harness({ client: { createWorkflowTask: async (_mutate, scope, body) => {
    assert.deepEqual(scope, projectScope);
    assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/u);
    assert.equal(h.stored().creationKey, body.idempotencyKey);
    assert.equal(h.stored().taskId, null);
    assert.equal(JSON.stringify(h.stored()).includes('Private synthetic direction'), false);
    h.server.task = task(); return clone(h.server.task);
  } } });
  await h.controller.restore(); await h.controller.start('  Private synthetic direction  ');
  assert.equal(h.calls('createWorkflowTask').length, 1);
  const postIndex = h.events.findIndex(event => event.name === 'createWorkflowTask');
  assert.ok(h.events.slice(0, postIndex).some(event => event.name === 'storage.set' && event.value.creationKey));
  assert.equal(h.stored().creationKey, null); assert.equal(h.stored().taskId, taskId);
  assert.deepEqual(Object.keys(h.stored()).sort(), ['creationKey', 'grantKey', 'schemaVersion', 'selections', 'taskId']);
  assert.equal(h.snapshot().busy, false);
});

test('a timed-out creation and subsequent 404 keep the same recovery key and never recreate the task', async () => {
  const storageMap = new Map();
  const h = harness({ storageMap, client: { createWorkflowTask: async () => { throw Error('Synthetic connection lost after POST'); } } });
  await h.controller.restore(); await h.controller.start('Synthetic direction');
  const pendingKey = h.stored().creationKey;
  assert.ok(pendingKey); assert.equal(h.snapshot().reconciling, true);
  await h.controller.start('Synthetic direction'); await h.controller.refresh();
  assert.equal(h.calls('createWorkflowTask').length, 1);
  assert.equal(h.stored().creationKey, pendingKey); assert.equal(h.snapshot().reconciling, true);
  assert.equal(h.calls('readWorkflowCreation')[0].args[1], pendingKey);
  h.controller.close();
  const resumed = harness({ storageMap }); await resumed.controller.restore();
  assert.deepEqual(resumed.methods(), ['readWorkflowCreation']);
  assert.equal(resumed.stored().creationKey, pendingKey);
  resumed.server.task = task(); await resumed.controller.refresh();
  assert.equal(resumed.stored().creationKey, null); assert.equal(resumed.snapshot().task.id, taskId);
  assert.equal(resumed.calls('createWorkflowTask').length, 0);
});

test('a definite create rejection clears its recovery key but never retries the POST', async () => {
  const h = harness({ client: { createWorkflowTask: async () => { throw Object.assign(Error('Synthetic validation rejection'), { status: 422 }); } } });
  await h.controller.restore(); await h.controller.start('Synthetic direction');
  assert.equal(h.stored().creationKey, null); assert.equal(h.snapshot().reconciling, false);
  assert.equal(h.calls('createWorkflowTask').length, 1);
});

test('failure to persist the creation UUID blocks POST and surfaces a local storage error', async () => {
  const h = harness({ storageFailure: true });
  await h.controller.restore(); await h.controller.start('Synthetic direction');
  assert.equal(h.calls('createWorkflowTask').length, 0);
  assert.equal(h.snapshot().busy, false); assert.equal(h.snapshot().reconciling, false);
  assert.match(h.snapshot().error, /Synthetic storage full/u);
});

test('research settings are validated before any creation reservation or POST', async () => {
  for (const invalid of [{ rawRespondents: 'private material must not be sent' }, { days: -1 }, { budgetYuan: Number.NaN }]) {
    const h = harness(); await h.controller.restore(); await h.controller.start('Synthetic direction', invalid);
    assert.equal(h.calls('createWorkflowTask').length, 0);
    assert.equal(h.snapshot().reconciling, false, 'a local validation failure has no uncertain server side effect');
    assert.equal(h.events.some(event => event.name === 'storage.set' && event.value.creationKey), false);
    assert.equal(h.snapshot().busy, false); assert.ok(h.snapshot().error);
  }
});

test('the existing research profile becomes only reviewed string requirements and constraints', async () => {
  const h = harness(); await h.controller.restore();
  await h.controller.start('  Synthetic direction  ', { region: '合成省', city: '合成市', school: '合成学校', days: 14, budgetYuan: 500 });
  const body = h.calls('createWorkflowTask')[0].args[2];
  assert.deepEqual(body.requirements, { goal: 'Synthetic direction', geography: '合成省 · 合成市' });
  assert.deepEqual(body.constraints, { notes: '学校：合成学校；可用时间：14天；经费：500元' });
  assert.equal(body.context, undefined);
  assert.equal(Object.values(body.requirements).every(value => typeof value === 'string'), true);
  assert.equal(Object.values(body.constraints).every(value => typeof value === 'string'), true);
});

test('the five run-specific role choices cover all fourteen unique backend model-step slots at exact service revisions', async () => {
  const h = harness({ defaultId: null }); await h.controller.restore();
  for (const [index, role] of roles.entries()) h.controller.select(role, services[index + 1].id);
  await h.controller.start('Synthetic direction');
  const body = h.calls('createWorkflowTask')[0].args[2];
  assert.deepEqual(Object.keys(body.modelPlan.roles).sort(), [...roles].sort());
  const slots = Object.entries(body.modelPlan.roles).flatMap(([role, selection]) => roleSteps[role].map(step => ({ name: `${role}.${step}`, selection })));
  assert.equal(slots.length, 14); assert.equal(new Set(slots.map(slot => slot.name)).size, 14);
  for (const [index, role] of roles.entries()) assert.deepEqual(body.modelPlan.roles[role], { serviceId: services[index + 1].id, revision: 7 });
  assert.equal(h.calls('advanceWorkflowTask').length, 0, 'creating a task alone does not call a model');
});

test('one explicit stage grant advances producer then Reviewer exactly once and stops at human confirmation', async () => {
  let h;
  h = harness({ initialTask: task(), stored: locator(), client: { advanceWorkflowTask: async (_mutate, _scope, body) => {
    const count = h.calls('advanceWorkflowTask').length;
    assert.equal(body.expectedRevision, count - 1); assert.equal(body.modelGrantId, h.server.grants[0].id);
    h.server.task = count === 1 ? task({ position: 1, revision: 1 })
      : task({ position: 2, revision: 2, status: 'needs_input', awaiting: 'approve_reviewer' });
    if (count === 2) Object.assign(h.server.grants[0], { status: 'stopped', stopReason: 'needs_input', usedCalls: 6 });
    return clone(h.server.task);
  } } });
  await h.controller.restore(); await h.controller.authorize();
  assert.equal(h.calls('createWorkflowGrant').length, 1); assert.equal(h.calls('advanceWorkflowTask').length, 2);
  assert.equal(h.snapshot().task.status, 'needs_input'); assert.equal(h.snapshot().busy, false);
  assert.equal(h.snapshot().task.state.revision, 2);
  const grantPost = h.calls('createWorkflowGrant')[0].args[2];
  assert.equal(grantPost.consent, true); assert.equal(grantPost.phaseHash, sha); assert.equal(grantPost.maxCalls, 6);
  const grantIndex = h.events.findIndex(event => event.name === 'createWorkflowGrant');
  assert.ok(h.events.slice(0, grantIndex).some(event => event.name === 'storage.set' && event.value.grantKey === grantPost.idempotencyKey));
  await h.controller.resume(); assert.equal(h.calls('advanceWorkflowTask').length, 2);
});

test('Reviewer REVISE moving backwards stops the automatic grant even if a stale receipt still says active', async () => {
  let h;
  h = harness({ initialTask: task({ position: 1, revision: 1 }), initialGrant: grant(task()), stored: locator({ grantKey: grantId }),
    client: { advanceWorkflowTask: async () => { h.server.task = task({ position: 0, revision: 2 }); h.server.task.state.retry_count.research = 1; return clone(h.server.task); } } });
  await h.controller.restore(); await h.controller.resume();
  assert.equal(h.calls('advanceWorkflowTask').length, 1); assert.equal(h.snapshot().task.state.revision, 0);
  assert.equal(h.calls('createWorkflowGrant').length, 0);
});

test('an unknown advance result stays in reconciliation and cannot automatically resend on refresh, restore or resume', async () => {
  let h;
  h = harness({ initialTask: task(), stored: locator(), client: { advanceWorkflowTask: async () => {
    h.server.task = task({ status: 'blocked', revision: 1, execution: execution('outcome_unknown') });
    h.server.calls = [call('outcome_unknown')]; throw Error('Synthetic unknown model result');
  } } });
  await h.controller.restore(); await h.controller.authorize();
  assert.equal(h.snapshot().reconciling, true); assert.equal(h.calls('advanceWorkflowTask').length, 1);
  await h.controller.resume(); await h.controller.authorize(); await h.controller.refresh(); await h.controller.resume();
  assert.equal(h.calls('advanceWorkflowTask').length, 1); assert.equal(h.calls('createWorkflowGrant').length, 1);
  assert.equal(h.snapshot().task.execution.status, 'outcome_unknown');
});

test('an unknown grant POST is recovered by its saved UUID and is never automatically re-authorized', async () => {
  let h;
  h = harness({ initialTask: task(), stored: locator(), client: { createWorkflowGrant: async (_mutate, _scope, body) => {
    h.server.grants = [grant(h.server.task, body.idempotencyKey)]; throw Error('Synthetic lost grant reply');
  } } });
  await h.controller.restore(); await h.controller.authorize();
  assert.equal(h.snapshot().reconciling, true); const saved = h.stored().grantKey;
  assert.equal(saved, h.server.grants[0].id);
  await h.controller.authorize(); assert.equal(h.calls('createWorkflowGrant').length, 1);
  await h.controller.refresh();
  assert.equal(h.snapshot().grant.id, saved); assert.equal(h.snapshot().reconciling, false);
  assert.equal(h.calls('advanceWorkflowTask').length, 0, 'receipt recovery remains read-only even for a recovered active grant');
});

test('close aborts pending creation and discards its late response without adopting or writing another namespace', async () => {
  const pending = deferred();
  const h = harness({ client: { createWorkflowTask: async () => pending.promise } });
  await h.controller.restore(); const work = h.controller.start('Synthetic direction');
  await until(() => h.calls('createWorkflowTask').length === 1);
  const before = h.changes.length, writes = h.events.filter(event => event.name === 'storage.set').length;
  h.controller.close(); assert.equal(h.requests.at(-1).aborted, true);
  pending.resolve(task()); await work;
  assert.equal(h.adopted.length, 0); assert.equal(h.changes.length, before);
  assert.equal(h.events.filter(event => event.name === 'storage.set').length, writes);
  assert.deepEqual([...h.storageMap.keys()], [storageKey]);
});

test('account or project identity change discards late reads without publishing the old project', async () => {
  for (const identityChange of ['account', 'project']) {
    const pending = deferred();
    const h = harness({ stored: locator(), client: { readWorkflowTask: async () => pending.promise } });
    const restoring = h.controller.restore(); await until(() => h.calls('readWorkflowTask').length === 1);
    const before = h.changes.length; h.setCurrent(false); pending.resolve(task({ summary: `${identityChange} old result` })); await restoring;
    assert.equal(h.adopted.length, 0); assert.equal(h.changes.length, before); assert.equal(h.snapshot().task, null);
  }
});

test('Stop persistently revokes before cancel, fences a pending producer and prevents the automatic Reviewer', async () => {
  const pending = deferred(); let h;
  h = harness({ initialTask: task(), stored: locator(), client: { advanceWorkflowTask: async () => {
    h.server.task = task({ status: 'running', revision: 1, execution: execution('running') }); return pending.promise;
  } } });
  await h.controller.restore(); const executing = h.controller.authorize();
  await until(() => h.calls('advanceWorkflowTask').length === 1);
  await h.controller.stop();
  const sequence = h.methods(); assert.ok(sequence.indexOf('revokeWorkflowGrant') < sequence.indexOf('cancelWorkflowTask'));
  assert.equal(h.calls('revokeWorkflowGrant')[0].args[2], h.server.grants[0].id);
  assert.equal(h.snapshot().grant.status, 'stopped'); assert.equal(h.snapshot().task.execution.status, 'cancelled');
  const finalRevision = h.snapshot().task.revision;
  pending.resolve(task({ position: 1, revision: 2 })); await executing;
  assert.equal(h.calls('advanceWorkflowTask').length, 1); assert.equal(h.snapshot().task.revision, finalRevision);
  assert.equal(h.snapshot().task.execution.status, 'cancelled');
});

test('Stop while READY revokes its persistent grant without sending an invalid task cancellation', async () => {
  const value = task(), active = grant(value);
  const h = harness({ initialTask: value, initialGrant: active, stored: locator({ grantKey: active.id }) });
  await h.controller.restore(); await h.controller.stop(); await h.controller.resume();
  assert.equal(h.calls('revokeWorkflowGrant').length, 1); assert.equal(h.calls('cancelWorkflowTask').length, 0);
  assert.equal(h.calls('advanceWorkflowTask').length, 0); assert.equal(h.snapshot().grant.status, 'stopped');
});

test('Stop during a pending grant POST revokes the saved new UUID and ignores a late active-grant reply', async () => {
  const pending = deferred(); let h;
  const old = grant(task(), grantId, { status: 'stopped', stopReason: 'needs_input' });
  h = harness({ initialTask: task(), initialGrant: old, stored: locator({ grantKey: old.id }), client: {
    createWorkflowGrant: async (_mutate, _scope, body) => {
      const next = grant(h.server.task, body.idempotencyKey); h.server.grants = [next, old]; return pending.promise;
    },
  } });
  await h.controller.restore(); const authorizing = h.controller.authorize();
  await until(() => h.calls('createWorkflowGrant').length === 1);
  const newGrant = clone(h.server.grants[0]);
  await h.controller.stop();
  const revoked = h.calls('revokeWorkflowGrant').map(event => event.args[2]);
  assert.equal(revoked[0], newGrant.id, 'the unresolved POST reservation is revoked before the old displayed grant');
  assert.ok(revoked.includes(old.id));
  pending.resolve(newGrant); await authorizing;
  assert.equal(h.calls('advanceWorkflowTask').length, 0); assert.equal(h.snapshot().grant.status, 'stopped');
});

test('a stale GET receipt response cannot erase a grant created after that read started', async () => {
  const staleCalls = deferred(), staleGrants = deferred(), pendingAdvance = deferred(); let h, reads = 0;
  h = harness({ initialTask: task(), stored: locator(), client: {
    readWorkflowCalls: async () => ++reads === 2 ? staleCalls.promise : clone(h.server.calls),
    readWorkflowGrants: async () => reads === 2 ? staleGrants.promise : clone(h.server.grants),
    advanceWorkflowTask: async () => pendingAdvance.promise,
  } });
  await h.controller.restore();
  const oldRefresh = h.controller.refresh();
  await until(() => h.calls('readWorkflowCalls').length === 2);
  const executing = h.controller.authorize();
  await until(() => h.calls('advanceWorkflowTask').length === 1);
  const activeId = h.snapshot().grant.id;
  staleCalls.resolve([]); staleGrants.resolve([]); await oldRefresh;
  assert.equal(h.snapshot().grant.id, activeId); assert.equal(h.snapshot().grant.status, 'active');
  assert.equal(h.snapshot().busy, true);
  h.controller.close(); pendingAdvance.resolve(task({ position: 1, revision: 1 })); await executing;
});

test('concurrent start and authorization clicks cannot produce duplicate create, grant or advance requests', async () => {
  const pendingCreate = deferred();
  const create = harness({ client: { createWorkflowTask: async () => pendingCreate.promise } });
  await create.controller.restore();
  const first = create.controller.start('Synthetic direction'), second = create.controller.start('Synthetic direction');
  await until(() => create.calls('createWorkflowTask').length === 1);
  pendingCreate.resolve(task()); await Promise.all([first, second]);
  assert.equal(create.calls('createWorkflowTask').length, 1);
  const pendingGrant = deferred(), pendingAdvance = deferred(); let h;
  h = harness({ initialTask: task(), stored: locator(), client: {
    createWorkflowGrant: async (_mutate, _scope, body) => { h.server.grants = [grant(h.server.task, body.idempotencyKey)]; return pendingGrant.promise; },
    advanceWorkflowTask: async () => pendingAdvance.promise,
  } });
  await h.controller.restore(); const authorizing = h.controller.authorize();
  await h.controller.authorize(); assert.equal(h.calls('createWorkflowGrant').length, 1);
  pendingGrant.resolve(clone(h.server.grants[0])); await until(() => h.calls('advanceWorkflowTask').length === 1);
  await h.controller.resume(); assert.equal(h.calls('advanceWorkflowTask').length, 1);
  h.server.task = task({ position: 2, revision: 2, status: 'needs_input', awaiting: 'approve_reviewer' });
  pendingAdvance.resolve(clone(h.server.task)); await authorizing;
  assert.equal(h.calls('createWorkflowGrant').length, 1); assert.equal(h.calls('advanceWorkflowTask').length, 1);
});

test('terminal approval performs only the server no-model completion transition with no grant or model fee authorization', async () => {
  let h;
  h = harness({ initialTask: task({ kind: 'topic_design', position: 2, revision: 4, status: 'needs_input', awaiting: 'approve_reviewer' }),
    stored: locator(), client: {
      approveWorkflowTask: async (_mutate, _scope, body) => { assert.equal(body.approved, true); assert.equal(body.expectedRevision, 4);
        h.server.task = task({ kind: 'topic_design', position: 2, revision: 5 }); return clone(h.server.task); },
      advanceWorkflowTask: async (_mutate, _scope, body) => { assert.deepEqual(body, { expectedRevision: 5 });
        h.server.task = task({ kind: 'topic_design', position: 2, revision: 6, status: 'completed' }); return clone(h.server.task); },
    } });
  await h.controller.restore(); await h.controller.approve();
  assert.equal(h.calls('approveWorkflowTask').length, 1); assert.equal(h.calls('advanceWorkflowTask').length, 1);
  assert.equal(h.calls('createWorkflowGrant').length, 0); assert.equal(h.snapshot().task.status, 'completed');
});

test('a nonterminal approval does not authorize the next producer automatically', async () => {
  let h;
  h = harness({ initialTask: task({ position: 2, revision: 4, status: 'needs_input', awaiting: 'approve_reviewer' }),
    stored: locator(), client: { approveWorkflowTask: async () => { h.server.task = task({ position: 2, revision: 5 }); return clone(h.server.task); } } });
  await h.controller.restore(); await h.controller.approve();
  assert.equal(h.calls('advanceWorkflowTask').length, 0); assert.equal(h.calls('createWorkflowGrant').length, 0);
  assert.equal(h.snapshot().task.status, 'ready'); assert.equal(h.snapshot().phasePreview.position, 2);
});

test('changed source input prevents an authorization before any grant or paid advance', async () => {
  const h = harness({ initialTask: task(), stored: locator(), inputCurrent: false });
  await h.controller.restore(); await h.controller.authorize();
  assert.equal(h.calls('createWorkflowGrant').length, 0); assert.equal(h.calls('advanceWorkflowTask').length, 0);
});

test('changed source input during a producer response prevents the following Reviewer dispatch', async () => {
  const pending = deferred(); let h;
  h = harness({ initialTask: task(), stored: locator(), client: { advanceWorkflowTask: async () => pending.promise } });
  await h.controller.restore(); const executing = h.controller.authorize();
  await until(() => h.calls('advanceWorkflowTask').length === 1);
  h.setInputCurrent(false); h.server.task = task({ position: 1, revision: 1 }); pending.resolve(clone(h.server.task)); await executing;
  assert.equal(h.calls('advanceWorkflowTask').length, 1);
});

test('account or project change during a paid producer response discards it and prevents the automatic Reviewer', async () => {
  for (const identityChange of ['account', 'project']) {
    const pending = deferred();
    const h = harness({ initialTask: task(), stored: locator(), client: { advanceWorkflowTask: async () => pending.promise } });
    await h.controller.restore(); const executing = h.controller.authorize();
    await until(() => h.calls('advanceWorkflowTask').length === 1);
    const before = h.adopted.length, changes = h.changes.length;
    h.setCurrent(false); pending.resolve(task({ position: 1, revision: 1, summary: `${identityChange} stale producer` })); await executing;
    assert.equal(h.calls('advanceWorkflowTask').length, 1); assert.equal(h.adopted.length, before);
    assert.equal(h.changes.length, changes); assert.equal(h.snapshot().task.state.revision, 0);
  }
});

test('agent_input accepts only explicit nonempty feedback and does not automatically authorize another model phase', async () => {
  let h;
  const value = task({ status: 'needs_input', awaiting: 'agent_input' }); value.state.unresolved_questions = ['合成待补问题'];
  h = harness({ initialTask: value, stored: locator(), client: { approveWorkflowTask: async (_mutate, _scope, body) => {
    assert.equal(body.feedback, '合成补充说明'); assert.equal(body.approved, false); h.server.task = task({ revision: 1 }); return clone(h.server.task);
  } } });
  await h.controller.restore(); await h.controller.revise('   ');
  assert.equal(h.calls('approveWorkflowTask').length, 0);
  await h.controller.revise('合成补充说明');
  assert.equal(h.calls('approveWorkflowTask').length, 1); assert.equal(h.calls('createWorkflowGrant').length, 0);
  assert.equal(h.calls('advanceWorkflowTask').length, 0); assert.equal(h.snapshot().task.status, 'ready');
});

test('data gate binds a project survey with responses, refreshes consent, and never authorizes or analyzes on its own', async () => {
  let h;
  const releaseId = id(91), value = task({ position: 4, status: 'needs_input', awaiting: 'upload_real_data' });
  h = harness({ initialTask: value, stored: locator(), client: {
    readWorkflowSurveys: async () => [{ id: releaseId, projectId, responseCount: 3 }],
    provideWorkflowInput: async (_mutate, selected, body) => {
      assert.equal(selected.projectId, projectId); assert.equal(body.releaseId, releaseId);
      h.server.task = task({ position: 4, revision: 1 }); h.server.task.state.input_artifact_refs = [`survey-release:${releaseId}`];
      return clone(h.server.task);
    },
  } });
  await h.controller.restore(); assert.equal(h.snapshot().surveys.length, 1);
  await h.controller.bindDataset(id(92)); assert.equal(h.calls('provideWorkflowInput').length, 0);
  await h.controller.bindDataset(releaseId); assert.equal(h.calls('provideWorkflowInput').length, 1);
  assert.equal(h.snapshot().phasePreview.position, 4);
  assert.equal(h.calls('createWorkflowGrant').length, 0); assert.equal(h.calls('advanceWorkflowTask').length, 0);
});
