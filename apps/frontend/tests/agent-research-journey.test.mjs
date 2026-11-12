import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as catalog from '../lib/agent/research-stages.ts';
import * as routing from '../lib/agent/model-routing.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync(new URL('../components/agent/ResearchJourney.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const box = { exports: {} };
vm.runInNewContext(code, { module: box, exports: box.exports, require(name) {
  if (name === 'react') return { useId: () => 'journey-test' };
  if (name === 'react/jsx-runtime') return require(name);
  if (name === '@/lib/agent/research-stages') return catalog;
  if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
  throw Error(`Unapproved component dependency: ${name}`);
} });
const Journey = box.exports.default;
const service = { id: 'service-a', label: '我的研究模型', model: 'research-model', revision: 2, capabilities: ['research'] };
const props = overrides => ({ direction: '大学生 AI 学习习惯', onDirectionChange() {}, onStart() {}, steps: [
  { id: 'topic', status: 'awaiting_confirmation', actionLabel: '确认方向' },
  { id: 'diagnosis', status: 'idle' },
  { id: 'literature', status: 'idle', optional: true },
  { id: 'defense', status: 'idle', optional: true },
], services: [service], defaultServiceId: service.id,
  modelRoutes: { 'research.topic': { selectedServiceId: null, effectiveServiceId: service.id, source: 'default' } },
  onDefaultServiceChange() {}, onModelCallChange() {}, onOpenSettings() {}, ...overrides });
function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const html = overrides => renderToStaticMarkup(Journey(props(overrides)));

test('workflow shows named effective route, honest local and manual states, and confirmation checkpoint', () => {
  const markup = html();
  assert.match(markup, /我的研究模型 · 继承设置/);
  assert.match(markup, /本地处理 · 无需模型/);
  assert.match(markup, /真实材料 · 人工参与/);
  assert.match(markup, /待你确认/);
  assert.match(markup, /由你确认/);
  assert.doesNotMatch(markup, /后台|Data 执行器|API Key|密钥/);
  const tree = Journey(props());
  for (const stage of ['diagnosis', 'literature', 'defense']) {
    const item = find(tree, node => node.props?.['data-stage'] === stage);
    assert.equal(nodes(item).filter(node => node.type === 'select').length, 0, stage);
  }
});

test('removed explicit model stays visible and invalid instead of silently choosing another service', () => {
  const markup = html({ modelRoutes: { 'research.topic': { selectedServiceId: 'removed', effectiveServiceId: null, source: 'stale_selection' } } });
  assert.match(markup, /原模型已不可用/);
  assert.match(markup, /原选择已不可用，请重新选择/);
  assert.match(markup, /value="removed" disabled="" selected=""/);
  assert.match(markup, /aria-invalid="true"/);
});

test('form and keyboard dispatch the trimmed direction; normal Enter preserves multiline editing', () => {
  const calls = [], tree = Journey(props({ direction: '  研究方向  ', onStart: value => calls.push(value) }));
  const form = find(tree, node => node.type === 'form'), input = find(tree, node => node.type === 'textarea');
  let prevented = 0;
  form.props.onSubmit({ preventDefault() { prevented++; } });
  input.props.onKeyDown({ key: 'Enter', ctrlKey: false, metaKey: false, nativeEvent: { isComposing: false }, preventDefault() { prevented++; } });
  input.props.onKeyDown({ key: 'Enter', ctrlKey: true, metaKey: false, nativeEvent: { isComposing: false }, preventDefault() { prevented++; } });
  input.props.onKeyDown({ key: 'Enter', ctrlKey: true, metaKey: false, nativeEvent: { isComposing: true }, preventDefault() { prevented++; } });
  assert.deepEqual(calls, ['研究方向', '研究方向']);
  assert.equal(prevented, 2);
  const busy = Journey(props({ busy: true, onStart: value => calls.push(value) }));
  find(busy, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 2);
});

test('model overrides, checkpoint actions and optional steps dispatch controlled callbacks', () => {
  const calls = [], tree = Journey(props({
    onModelCallChange: (...args) => calls.push(['model', ...args]),
    onDefaultServiceChange: value => calls.push(['default', value]),
    onStepAction: stage => calls.push(['action', stage]),
    onToggleOptional: (...args) => calls.push(['optional', ...args]),
  }));
  const select = find(tree, node => node.type === 'select' && node.props.id.endsWith('research.topic'));
  select.props.onChange({ target: { value: 'service-a' } });
  select.props.onChange({ target: { value: '' } });
  find(tree, node => node.type === 'select' && node.props.id.endsWith('-default')).props.onChange({ target: { value: '' } });
  find(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: false } });
  find(tree, node => node.type === 'button' && node.props.children?.[0] === '确认方向').props.onClick();
  assert.deepEqual(calls, [['model', 'research.topic', 'service-a'], ['model', 'research.topic', null], ['default', null], ['optional', 'literature', true], ['action', 'topic']]);
});

function loadSettings(saved, calls = [], environment = {}) {
  const settingsSource = fs.readFileSync(new URL('../components/agent/ModelRoutingSettings.tsx', import.meta.url), 'utf8');
  const settingsCode = ts.transpileModule(settingsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const settingsBox = { exports: {} };
  vm.runInNewContext(settingsCode, { module: settingsBox, exports: settingsBox.exports, document: environment.document, require(name) {
    if (name === 'react') return { useId: () => 'settings-test', useCallback: fn => fn, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useRef: value => ({ current: value }), useLayoutEffect() {}, ...environment.hooks };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return { default: props => React.createElement('a', props) };
    if (name === '@/lib/agent/research-stages') return catalog;
    if (name === '@/lib/agent/model-routing') return { ...routing, getStageModelPreferences: () => saved,
      setDefaultModelPreference: (...args) => calls.push(['default', ...args]),
      setModelPreference: (...args) => calls.push(['task', ...args]),
      setStageModelPreference: (...args) => calls.push(['step', ...args]) };
    if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
    throw Error(`Unapproved settings dependency: ${name}`);
  } });
  return settingsBox.exports.default;
}

test('central settings exposes default and every real model call without duplicating connection credentials', () => {
  const calls = [], Settings = loadSettings({ schemaVersion: 2, defaultServiceId: service.id, tasks: {}, steps: { 'research.topic': 'removed' } }, calls);
  const tree = Settings({ owner: 'account-a', services: [service] });
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /默认模型/);
  assert.match(markup, /按步骤指定/);
  assert.match(markup, /我的研究模型/);
  assert.doesNotMatch(markup, /type="password"|API Key|服务地址/);
  for (const call of catalog.MODEL_CALL_IDS) assert.ok(find(tree, node => node.type === 'select' && node.props.id.endsWith(call)), call);
  find(tree, node => node.type === 'select' && node.props.id.endsWith('research.topic')).props.onChange({ target: { value: '' } });
  find(tree, node => node.type === 'select' && node.props.id.endsWith('-default')).props.onChange({ target: { value: service.id } });
  assert.deepEqual(calls, [['step', 'account-a', 'research.topic', null], ['default', 'account-a', service.id]]);
});

test('normal step overrides are collapsed while default and task choices remain directly editable', () => {
  const completeService = { ...service, capabilities: ['research', 'questionnaire', 'report'] }, calls = [];
  const Settings = loadSettings({ schemaVersion: 2, defaultServiceId: service.id, tasks: {}, steps: {} }, calls);
  const tree = Settings({ owner: 'account-a', services: [completeService] });
  const advanced = find(tree, node => node.type === 'details');
  assert.ok(advanced);
  assert.equal(advanced.props.open, undefined);
  assert.equal(nodes(advanced).filter(node => node.type === 'select').length, catalog.MODEL_CALL_IDS.length);
  assert.match(renderToStaticMarkup(tree), /6 \/ 6 个步骤已分配/);
  assert.equal(find(tree, node => node.props?.role === 'status').props['data-ready'], true);
  assert.equal(find(tree, node => node.type === 'section' && node.props['aria-labelledby']?.endsWith('-issues-title')), undefined);
  const reportTask = find(tree, node => node.type === 'select' && node.props.id.endsWith('-report'));
  reportTask.props.onChange({ target: { value: service.id } });
  assert.deepEqual(calls, [['task', 'account-a', 'report', service.id]]);
});

test('a stale step override reduces readiness and remains repairable outside the collapsed settings', () => {
  const completeService = { ...service, capabilities: ['research', 'questionnaire', 'report'] };
  const Settings = loadSettings({ schemaVersion: 2, defaultServiceId: service.id, tasks: {}, steps: { 'report.full': 'removed' } });
  const tree = Settings({ owner: 'account-a', services: [completeService] });
  const advanced = find(tree, node => node.type === 'details');
  const issues = find(tree, node => node.type === 'section' && node.props['aria-labelledby']?.endsWith('-issues-title'));
  assert.ok(issues);
  assert.ok(find(issues, node => node.type === 'select' && node.props.id.endsWith('report.full')));
  assert.equal(find(advanced, node => node.type === 'select' && node.props.id.endsWith('report.full')), undefined);
  assert.match(renderToStaticMarkup(tree), /5 \/ 6 个步骤已分配/);
  assert.equal(find(tree, node => node.props?.role === 'status').props['data-ready'], false);
  assert.equal(find(issues, node => node.type === 'select').props['aria-invalid'], true);
});

test('malformed preferences never appear ready and loading does not expose provisional failures', () => {
  const completeService = { ...service, capabilities: ['research', 'questionnaire', 'report'] };
  const Settings = loadSettings({ schemaVersion: 2, tasks: {}, steps: {}, invalid: true });
  const tree = Settings({ owner: 'account-a', services: [completeService] });
  assert.match(renderToStaticMarkup(tree), /0 \/ 6 个步骤已分配/);
  assert.ok(find(tree, node => node.props?.role === 'alert'));
  assert.equal(find(tree, node => node.props?.role === 'status').props['data-ready'], false);
  const loading = Settings({ owner: 'account-a', services: [completeService], loading: true });
  assert.match(renderToStaticMarkup(loading), /正在读取服务/);
  assert.equal(find(loading, node => node.type === 'section' && node.props['aria-labelledby']?.endsWith('-issues-title')), undefined);
  assert.equal(nodes(loading).filter(node => node.type === 'select').every(node => node.props.disabled), true);
  const StaleSettings = loadSettings({ schemaVersion: 2, defaultServiceId: 'removed', tasks: { report: 'removed' }, steps: { 'research.topic': 'removed' } });
  const reading = renderToStaticMarkup(StaleSettings({ owner: 'account-a', services: [], loading: true }));
  assert.doesNotMatch(reading, /原选择已不可用|原模型已不可用|需要更新的步骤/);
});

test('repairing a stale step opens its new parent and hands focus to the same step after commit', () => {
  const completeService = { ...service, capabilities: ['research', 'questionnaire', 'report'] };
  const saved = { schemaVersion: 2, defaultServiceId: service.id, tasks: {}, steps: { 'report.full': 'removed' } };
  const refs = [], calls = [], focused = [], effects = [], panel = { open: false };
  let cursor = 0;
  const Settings = loadSettings(saved, calls, { hooks: {
    useRef(value) { return refs[cursor++] ??= { current: value }; },
    useLayoutEffect(effect) { effects.push(effect); },
  }, document: { getElementById(id) {
    assert.equal(id, 'settings-test-report.full');
    return { isConnected: true, focus(options) { assert.equal(panel.open, true); assert.equal(options.preventScroll, true); focused.push(id); }, scrollIntoView() {} };
  } } });
  function render() {
    cursor = 0;
    const tree = Settings({ owner: 'account-a', services: [completeService] });
    find(tree, node => node.type === 'details').props.ref.current = panel;
    effects.pop()();
    return tree;
  }
  const tree = render();
  find(tree, node => node.type === 'select' && node.props.id.endsWith('report.full')).props.onChange({ target: { value: service.id } });
  saved.steps['report.full'] = service.id;
  const repaired = render();
  assert.equal(panel.open, true);
  assert.deepEqual(focused, ['settings-test-report.full']);
  assert.ok(find(find(repaired, node => node.type === 'details'), node => node.type === 'select' && node.props.id.endsWith('report.full')));
  find(repaired, node => node.type === 'select' && node.props.id.endsWith('report.draft')).props.onChange({ target: { value: service.id } });
  saved.steps['report.draft'] = service.id;
  render();
  assert.deepEqual(focused, ['settings-test-report.full'], 'normal step changes do not steal focus');
  assert.deepEqual(calls, [['step', 'account-a', 'report.full', service.id], ['step', 'account-a', 'report.draft', service.id]]);
});

test('unused stale defaults and tasks stay invalid without overriding the effective step count', () => {
  const completeService = { ...service, capabilities: ['research', 'questionnaire', 'report'] };
  const allOverrides = Object.fromEntries(catalog.MODEL_CALL_IDS.map(call => [call, service.id]));
  const reportOverrides = Object.fromEntries(catalog.MODEL_CALL_IDS.filter(call => call.startsWith('report.')).map(call => [call, service.id]));
  const scenarios = [
    { saved: { schemaVersion: 2, defaultServiceId: 'removed', tasks: {}, steps: allOverrides }, invalidControl: '-default' },
    { saved: { schemaVersion: 2, defaultServiceId: service.id, tasks: { report: 'removed' }, steps: reportOverrides }, invalidControl: '-report' },
  ];
  for (const { saved, invalidControl } of scenarios) {
    const Settings = loadSettings(saved), tree = Settings({ owner: 'account-a', services: [completeService] });
    assert.match(renderToStaticMarkup(tree), /6 \/ 6 个步骤已分配/);
    assert.equal(find(tree, node => node.props?.role === 'status').props['data-ready'], true);
    assert.equal(find(tree, node => node.type === 'select' && node.props.id.endsWith(invalidControl)).props['aria-invalid'], true);
    delete saved.steps['report.full'];
    const uncovered = Settings({ owner: 'account-a', services: [completeService] });
    assert.match(renderToStaticMarkup(uncovered), /5 \/ 6 个步骤已分配/);
    assert.equal(find(uncovered, node => node.props?.role === 'status').props['data-ready'], false);
    assert.ok(find(find(uncovered, node => node.type === 'section' && node.props['aria-labelledby']?.endsWith('-issues-title')), node => node.type === 'select' && node.props.id.endsWith('report.full')));
  }
});

test('actual intake output precedes route cards; only the first three and active later stages are expanded', () => {
  const steps = catalog.RESEARCH_STAGES.map(stage => ({ id: stage.id, status: stage.id === 'report' ? 'running' : 'idle' }));
  const tree = Journey(props({ steps, afterIntake: React.createElement('section', { 'data-candidates': true }, '实际候选结果') }));
  const firstList = find(tree, node => node.type === 'ol');
  assert.equal(React.Children.count(firstList.props.children), 4);
  const later = find(tree, node => node.type === 'details' && React.Children.toArray(node.props.children).some(child => child.type === 'summary' && String(child.props.children).includes('后续研究步骤')));
  assert.ok(later);
  assert.equal(later.props.open, undefined);
  const markup = renderToStaticMarkup(tree);
  assert.ok(markup.indexOf('实际候选结果') < markup.indexOf('data-stage="topic"'));
});
