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

test('central settings exposes default and every real model call without duplicating connection credentials', () => {
  const settingsSource = fs.readFileSync(new URL('../components/agent/ModelRoutingSettings.tsx', import.meta.url), 'utf8');
  const settingsCode = ts.transpileModule(settingsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const settingsBox = { exports: {} }, calls = [];
  const saved = { schemaVersion: 2, defaultServiceId: service.id, tasks: {}, steps: { 'research.topic': 'removed' } };
  vm.runInNewContext(settingsCode, { module: settingsBox, exports: settingsBox.exports, require(name) {
    if (name === 'react') return { useId: () => 'settings-test', useCallback: fn => fn, useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return { default: props => React.createElement('a', props) };
    if (name === '@/lib/agent/research-stages') return catalog;
    if (name === '@/lib/agent/model-routing') return { ...routing, getStageModelPreferences: () => saved,
      setDefaultModelPreference: (...args) => calls.push(['default', ...args]),
      setStageModelPreference: (...args) => calls.push(['step', ...args]) };
    if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
    throw Error(`Unapproved settings dependency: ${name}`);
  } });
  const tree = settingsBox.exports.default({ owner: 'account-a', services: [service] });
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
