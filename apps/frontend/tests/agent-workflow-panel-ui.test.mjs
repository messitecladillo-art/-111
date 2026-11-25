import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'esbuild';
import * as workflow from '../lib/agent/workflow-tasks.ts';

// Every task, model and receipt in this harness is a synthetic fixture.
// Rendering the production presenter never makes HTTP or provider calls.
const source = fs.readFileSync(new URL('../components/agent/WorkflowExecutionPanel.tsx', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2022' });
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : !node ? '' : React.Children.toArray(node.props?.children).map(text).join('');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const service = (n, capabilities, model = `synthetic-model-${n}`) => ({ id: uuid(n), label: `合成模型配置 ${n}`, provider: 'compatible',
  baseUrl: 'https://invalid.example/v1', model, maxOutputTokens: 1000, revision: 2, capabilities });
const services = [service(1, ['research']), service(2, ['report']), service(3, ['questionnaire'])];
const task = (overrides = {}) => ({ id: uuid(10), projectId: uuid(20), taskType: 'full_research', status: 'ready', revision: 0,
  state: { task_id: uuid(10), project_id: uuid(20), task_type: 'full_research', requirements: { goal: '合成测试方向' }, context: {}, constraints: {},
    status: 'ready', current_role: null, awaiting_approval: null, retry_count: {}, max_retries: 2, artifact_refs: [], evidence_refs: [],
    input_artifact_refs: [], unresolved_questions: [], errors: [], summary: '', revision: 0, agent_outputs: {} },
  createdAt: '2026-11-13T17:00:00Z', updatedAt: '2026-11-13T17:00:00Z', ...overrides });
const steps = { 'research.review_materials': services[0], 'research.design_research': services[0], 'research.assess_feasibility': services[0],
  'reviewer.check_evidence': services[1], 'reviewer.check_consistency': services[1], 'reviewer.review_deliverable': services[1] };
const preview = (overrides = {}) => ({ schemaVersion: 1, taskId: uuid(10), projectId: uuid(20), baseRevision: 0, position: 0,
  roles: ['research', 'reviewer'], phaseHash: 'a'.repeat(64), inputHash: 'd'.repeat(64), grantSeconds: 1200,
  maxCalls: 6, maxOutputTokens: 6000, materials: { requirements: { goal: '合成测试方向' } }, steps, instructionHashes: {},
  available: true, missingTools: [], ...overrides });
const grant = (overrides = {}) => ({ schemaVersion: 1, id: uuid(30), ownerId: uuid(40), taskId: uuid(10), projectId: uuid(20),
  status: 'active', baseRevision: 0, position: 0, roles: ['research', 'reviewer'], phaseHash: 'a'.repeat(64), maxCalls: 6, usedCalls: 3,
  maxOutputTokens: 6000, steps, createdAt: '2026-11-13T17:00:00Z', expiresAt: '2026-11-13T17:10:00Z', stopReason: null, ...overrides });
const execution = (status = 'completed') => ({ id: uuid(50), role: 'research', status, inputRevision: 0, claimedRevision: 1,
  inputHash: 'b'.repeat(64), resultHash: status === 'completed' ? 'c'.repeat(64) : null, startedAt: '2026-11-13T17:01:00Z',
  leaseExpiresAt: '2026-11-13T17:03:20Z', finishedAt: status === 'running' ? null : '2026-11-13T17:02:00Z', errorCode: null });
const call = (status = 'completed', overrides = {}) => ({ schema: 'workflow-model-call/v1', id: uuid(60), taskId: uuid(10), projectId: uuid(20),
  executionId: uuid(50), step: 'research.design_research', status, inputRevision: 0, inputHash: 'b'.repeat(64), consentHash: 'a'.repeat(64),
  serviceId: services[0].id, serviceRevision: 2, providerMode: 'fixture', grantId: uuid(30), startedAt: '2026-11-13T17:01:00Z',
  finishedAt: null, resultHash: null, usage: null, errorCode: null, ...overrides });

function harness(overrides = {}) {
  let cursor = 0, dirty = true, tree;
  const cells = [], events = [];
  const props = { task: null, taskKind: 'full_research', phasePreview: null, grant: null, calls: [], services,
    roleSelections: { research: services[0].id, reviewer: services[1].id }, canManage: true,
    onAuthorize: () => events.push(['authorize']), onContinue: () => events.push(['continue']), onRefresh: () => events.push(['refresh']),
    onCancel: () => events.push(['cancel']), onApprove: () => events.push(['approve']), onRevise: value => events.push(['revise', value]),
    onOpenSettings: () => events.push(['settings']), onOpenAnalysis: () => events.push(['analysis']),
    onRoleSelectionChange: (role, id) => events.push(['selection', role, id]), onPrepare: () => events.push(['prepare']),
    onNewTask: () => events.push(['new-task']), ...overrides };
  const box = { exports: {} };
  vm.runInNewContext(code, { module: box, exports: box.exports, require(name) {
    if (name === 'react') return { useId: () => 'workflow-test', useState(initial) { const index = cursor++; cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cells[index].value, next => { cells[index].value = typeof next === 'function' ? next(cells[index].value) : next; dirty = true; }]; } };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/lib/agent/workflow-tasks') return workflow;
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    throw Error(`Unexpected presenter dependency: ${name}`);
  } });
  function render(next) {
    if (next) { Object.assign(props, next); dirty = true; }
    for (let round = 0; dirty && round < 10; round++) { cursor = 0; dirty = false; tree = box.exports.default(props); }
    return tree;
  }
  render();
  return { events, props, render, text: () => text(tree), markup: () => renderToStaticMarkup(tree),
    all: predicate => walk(tree).filter(predicate), find: predicate => walk(tree).find(predicate),
    button: label => walk(tree).find(node => node.type === 'button' && text(node).trim() === label),
    checkbox: () => walk(tree).find(node => node.type === 'input' && node.props.type === 'checkbox'),
    accept() { this.checkbox().props.onChange({ target: { checked: true } }); render(); },
  };
}

test('initial and restored presenters do not dispatch; full research contains all five visible role controls in native settings', () => {
  const h = harness();
  assert.equal(h.all(node => node.type === 'select').length, 5);
  const settings = h.find(node => node.type === 'details');
  assert.equal(settings.props.open, undefined);
  assert.equal(settings.props.onToggle, undefined);
  assert.match(h.text(), /填写上方的研究方向/);
  assert.deepEqual(h.events, []);
  h.render({ task: task(), restored: true, grant: grant() });
  assert.match(h.text(), /已恢复上次任务/);
  assert.deepEqual(h.events, []);
  h.button('继续本阶段').props.onClick();
  assert.deepEqual(h.events, [['continue']]);
});

test('task kind and role capability determine selectors, preserving an unavailable explicit selection', () => {
  const h = harness({ taskKind: 'topic_design', roleSelections: { research: uuid(99), reviewer: services[1].id } });
  assert.equal(h.all(node => node.type === 'select').length, 2);
  const research = h.find(node => node.type === 'select' && node.props.id.endsWith('-research'));
  assert.equal(research.props['aria-invalid'], true);
  const options = React.Children.toArray(research.props.children).flatMap(node => node?.type === 'option' ? [node] : []);
  assert.ok(options.some(node => node.props.value === services[0].id));
  assert.equal(options.some(node => node.props.value === services[1].id), false);
  assert.ok(options.some(node => node.props.value === uuid(99) && node.props.disabled));
  research.props.onChange({ target: { value: services[0].id } });
  assert.deepEqual(h.events, [['selection', 'research', services[0].id]]);
});

test('phase authorization requires explicit acceptance of the exact revision and never substitutes changed service settings', () => {
  const h = harness({ task: task(), phasePreview: preview(), services: services.map(item => ({ ...item, model: 'later-edited-model' })) });
  assert.equal(h.button('授权并推进本阶段').props.disabled, true);
  h.button('授权并推进本阶段').props.onClick();
  assert.deepEqual(h.events, []);
  h.accept();
  assert.equal(h.button('授权并推进本阶段').props.disabled, false);
  const authorization = h.find(node => node.type === 'section' && node.props['aria-labelledby'] === 'workflow-test-authorization');
  assert.match(text(authorization), /synthetic-model-1/);
  assert.doesNotMatch(text(authorization), /later-edited-model/);
  h.button('授权并推进本阶段').props.onClick();
  assert.deepEqual(h.events, [['authorize']]);
  h.render({ phasePreview: preview({ phaseHash: 'e'.repeat(64) }) });
  assert.equal(h.checkbox().props.checked, false);
  assert.equal(h.button('授权并推进本阶段').props.disabled, true);
  h.accept();
  h.render({ task: task({ revision: 1 }) });
  assert.equal(h.checkbox(), undefined, 'a preview for an earlier API revision cannot authorize');
  assert.deepEqual(h.events, [['authorize']]);
});

test('a fresh phase can be authorized after a stopped historical grant without replaying old consent', () => {
  const h = harness({ task: task(), phasePreview: preview(), grant: grant({ status: 'stopped', stopReason: 'human_input' }) });
  assert.ok(h.checkbox());
  assert.equal(h.button('授权并推进本阶段').props.disabled, true);
  h.accept(); h.button('授权并推进本阶段').props.onClick();
  assert.deepEqual(h.events, [['authorize']]);
});

test('stopping a grant before its first call cannot reuse an earlier checkbox even when the phase hash is unchanged', () => {
  const h = harness({ task: task(), phasePreview: preview() });
  h.accept(); h.button('授权并推进本阶段').props.onClick(); h.render();
  h.render({ grant: grant() });
  h.render({ grant: grant({ status: 'stopped', stopReason: 'cancelled' }) });
  assert.equal(h.checkbox().props.checked, false);
  assert.equal(h.button('授权并推进本阶段').props.disabled, true);
  h.button('授权并推进本阶段').props.onClick();
  assert.deepEqual(h.events, [['authorize']]);
});

test('busy, loading, read-only and reconciliation states cannot dispatch even through an invoked disabled handler', () => {
  for (const blocked of [{ busy: true }, { loading: true }, { canManage: false }, { reconciling: true }]) {
    const h = harness({ task: task(), phasePreview: preview(), ...blocked });
    assert.equal(h.button('授权并推进本阶段').props.disabled, true);
    assert.equal(h.checkbox().props.disabled, true);
    h.button('授权并推进本阶段').props.onClick();
    const select = h.find(node => node.type === 'select');
    assert.equal(select.props.disabled, true);
    select.props.onChange({ target: { value: services[0].id } });
    assert.deepEqual(h.events, []);
  }
});

test('an unavailable data tool preview blocks payment and opens the existing analysis view explicitly', () => {
  const value = task(); value.state.revision = 4;
  const dataSteps = { 'data.inspect_data': services[0] };
  const h = harness({ task: value, phasePreview: preview({ position: 4, roles: ['data', 'reviewer'], available: false,
    missingTools: ['load_dataset', 'analyze_dataset'], steps: dataSteps }) });
  assert.equal(h.button('授权并推进本阶段').props.disabled, true);
  h.button('查看现有数据与分析').props.onClick();
  assert.deepEqual(h.events, [['analysis']]);
});

test('materials remain exact text and HTML-like model output is escaped, with raw results disclosed only on request', () => {
  const hostile = '</pre><img src=x onerror="alert(1)">研究材料';
  const output = { summary: '拟议研究设计摘要', deliverable: { title: hostile, research_questions: ['问题一'], population: '拟调查人群',
    geography: '拟调查地区', background: '待查证的背景', assumptions: ['尚需预试'] } };
  const value = task(); value.state.agent_outputs.research = output;
  const h = harness({ task: value, phasePreview: preview({ materials: { requirements: { goal: hostile } } }) });
  const materials = h.find(node => node.type === 'pre' && node.props['aria-label'] === '本阶段完整外发材料');
  assert.equal(materials.props.children, JSON.stringify({ requirements: { goal: hostile } }, null, 2));
  assert.ok(h.find(node => node.type === 'article' && text(node).includes('研究问题')));
  assert.ok(h.find(node => node.type === 'details' && text(node).startsWith('查看原始结构化结果') && node.props.open === undefined));
  assert.doesNotMatch(h.markup(), /<img/);
  assert.match(h.markup(), /&lt;img/);
  assert.deepEqual(h.events, []);
});

test('unknown outcomes and reconciliation block new paid work but preserve the explicit read-only refresh action', () => {
  const value = task({ status: 'blocked', execution: execution('outcome_unknown') });
  const h = harness({ task: value, phasePreview: preview(), grant: grant(), calls: [call('outcome_unknown')], reconciling: true });
  assert.match(h.text(), /结果尚未确定/);
  assert.equal(h.button('继续本阶段'), undefined);
  assert.equal(h.button('核对服务器回执').props.disabled, false);
  h.button('核对服务器回执').props.onClick();
  h.render({ phasePreview: preview(), grant: null, task: task(), reconciling: false });
  assert.equal(h.button('授权并推进本阶段').props.disabled, true, 'unknown model receipt still blocks authorization');
  h.button('授权并推进本阶段').props.onClick();
  assert.deepEqual(h.events, [['refresh']]);
});

test('read-only and source-changed states retain output but cannot approve, revise or authorize', () => {
  const value = task({ status: 'needs_input' });
  value.state.awaiting_approval = 'approve_reviewer'; value.state.revision = 2;
  value.state.agent_outputs.research = { summary: '可读的合成草稿', deliverable: { title: '合成题目' } };
  const h = harness({ task: value, canManage: false });
  assert.match(h.text(), /可读的合成草稿/);
  assert.equal(h.button('确认成果，进入下一阶段').props.disabled, true);
  assert.equal(h.button('提交修改意见').props.disabled, true);
  h.button('确认成果，进入下一阶段').props.onClick();
  assert.deepEqual(h.events, []);
  h.render({ canManage: true, sourceChanged: true });
  assert.equal(h.button('确认成果，进入下一阶段').props.disabled, true);
  assert.equal(h.find(node => node.type === 'textarea').props.disabled, true);
  h.button('按当前材料新建任务').props.onClick();
  assert.deepEqual(h.events, [['new-task']]);
});

test('inline revision requires feedback, preserves it through receipt refresh, and clears it for another task', () => {
  const value = task({ status: 'needs_input' }); value.state.awaiting_approval = 'approve_reviewer'; value.state.revision = 2;
  const h = harness({ task: value });
  assert.equal(h.button('提交修改意见').props.disabled, true);
  h.find(node => node.type === 'textarea').props.onChange({ target: { value: '  缩小研究范围  ' } }); h.render();
  h.render({ task: structuredClone(value), calls: [call()] });
  assert.equal(h.find(node => node.type === 'textarea').props.value, '  缩小研究范围  ');
  h.button('提交修改意见').props.onClick();
  assert.deepEqual(h.events, [['revise', '缩小研究范围']]);
  h.render({ task: { ...value, id: uuid(11) } });
  assert.equal(h.find(node => node.type === 'textarea').props.value, '');
  assert.equal(h.button('提交修改意见').props.disabled, true);
});

test('feedback from research approval is not reused at the questionnaire checkpoint of the same task', () => {
  const value = task({ status: 'needs_input' }); value.state.awaiting_approval = 'approve_reviewer'; value.state.revision = 2;
  const h = harness({ task: value });
  h.find(node => node.type === 'textarea').props.onChange({ target: { value: '仅适用于研究设计的旧意见' } }); h.render();
  const questionnaire = structuredClone(value); questionnaire.state.revision = 4; questionnaire.revision = 5;
  h.render({ task: questionnaire });
  assert.equal(h.find(node => node.type === 'textarea').props.value, '');
  assert.equal(h.button('提交修改意见').props.disabled, true);
  assert.deepEqual(h.events, []);
});

test('a server task past its last role waits for finalization without showing another research-design call', () => {
  const value = task({ taskType: 'topic_design' }); value.state.revision = 2; value.state.task_type = 'topic_design';
  const h = harness({ task: value });
  assert.match(h.text(), /本次任务正在完成核对/);
  assert.equal(h.button('核对本阶段材料'), undefined);
  assert.equal(h.button('授权并推进本阶段'), undefined);
  assert.deepEqual(h.events, []);
});

test('running tasks can be stopped while busy, and cancelled receipts never claim the provider was stopped', () => {
  const h = harness({ task: task({ status: 'running', execution: execution('running') }), busy: true, grant: grant() });
  assert.ok(h.button('停止本阶段'));
  h.button('停止本阶段').props.onClick();
  assert.deepEqual(h.events, [['cancel']]);
  h.render({ task: task({ status: 'blocked', execution: execution('cancelled') }), busy: false, grant: grant({ status: 'stopped' }) });
  assert.match(h.text(), /结果写入已停止/);
  assert.match(h.text(), /模型请求可能仍在处理/);
  assert.equal(h.button('继续本阶段'), undefined);
  h.button('刷新任务与回执').props.onClick();
  assert.deepEqual(h.events, [['cancel'], ['refresh']]);
});

test('real data gate leads to the existing analysis workspace and progress follows the server pipeline position', () => {
  const value = task({ status: 'needs_input' }); value.state.awaiting_approval = 'upload_real_data'; value.state.revision = 4;
  const h = harness({ task: value });
  assert.equal(h.button('确认成果，进入下一阶段'), undefined);
  h.button('前往数据分析').props.onClick();
  const progress = h.find(node => node.type === 'ol' && node.props['aria-label'] === '任务实际进度');
  assert.equal(React.Children.toArray(progress.props.children).length, 8);
  assert.equal(walk(progress).filter(node => node.type === 'li' && node.props['data-done']).length, 4);
  assert.match(text(walk(progress).find(node => node.props?.['aria-current'] === 'step')), /数据分析/);
  assert.deepEqual(h.events, [['analysis']]);
});

test('out-of-scope receipts and previews are not displayed or usable in the current task', () => {
  const h = harness({ task: task(), phasePreview: preview({ projectId: uuid(99) }), calls: [call('outcome_unknown', { taskId: uuid(99) })],
    grant: grant({ taskId: uuid(99) }) });
  assert.equal(h.checkbox(), undefined);
  assert.equal(h.button('继续本阶段'), undefined);
  assert.match(h.text(), /尚无模型调用回执/);
  h.button('核对本阶段材料').props.onClick();
  assert.deepEqual(h.events, [['prepare']]);
});

test('matching call receipts show frozen configuration and actual usage, never later service settings', () => {
  const h = harness({ task: task(), grant: grant(), calls: [call('completed', { usage: { inputTokens: 42, outputTokens: 19 } })],
    services: services.map(item => ({ ...item, model: 'edited-after-consent' })) });
  const receipts = h.find(node => node.type === 'details' && text(node).startsWith('查看执行与调用记录'));
  assert.match(text(receipts), /synthetic-model-1/);
  assert.doesNotMatch(text(receipts), /edited-after-consent/);
  assert.match(text(receipts), /输入 42 词元 · 输出 19 词元/);
  assert.equal(receipts.props.open, undefined);
  assert.deepEqual(h.events, []);
});
