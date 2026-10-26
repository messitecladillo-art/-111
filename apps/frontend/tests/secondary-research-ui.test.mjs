import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as handbook from '../lib/sampling-handbook.ts';
import * as sampling from '../lib/sampling.ts';

const ts = createRequire(import.meta.url)('typescript');
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.props?.children) : String(n);
const style = { default: new Proxy({}, { get: (_, key) => key }) };
const component = name => Object.assign(() => null, { displayName: name });
function mount(file, imports, props = {}) {
  const cells = [];
  let index = 0, tree;
  const hooks = {
    useState(initial) { const i = index++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useEffect() {}, useMemo: fn => fn(),
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const mocks = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, ...imports };
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const box = { exports: {}, require: id => { assert.ok(id in mocks, `Unmocked ${id}`); return mocks[id]; }, JSON, window: { localStorage: { getItem: () => null, setItem() {} } }, document: {}, crypto };
  vm.runInNewContext(compiled, box);
  const screen = {
    get tree() { return tree; },
    render() { index = 0; tree = box.exports.default({ dataset: null, embedded: true, ...props }); },
    click(name) { const target = nodes(tree).find(n => n.type === 'button' && text(n).replace(/^·/, '') === name); assert.ok(target, `Missing ${name}`); target.props.onClick(); screen.render(); },
  };
  screen.render(); return screen;
}
const motion = { useKeyedListMotion: () => null, useContentReveal: () => null };

test('sampling pages and estimator tools retain stable mounted panels after navigation', () => {
  const imports = { '@/lib/sampling-handbook': handbook, '../motion/useWorkspaceMotion': motion, '../math/Tex': { Formula: component('Formula') }, './SamplingDesigner': { default: component('SamplingDesigner') }, './DesignBuilder': { default: component('DesignBuilder') }, './SamplingLab': { default: component('SamplingLab') }, './ui': { Rich: component('Rich') }, './Sampling.module.css': style };
  for (const [file, names] of Object.entries({ basic: ['PowerCalc', 'SrsCalc'], stratified: ['CumRootFCalc', 'StratifiedCalc', 'StratifiedPlanCalc'], auxiliary: ['AuxiliaryCalc'], unequal: ['PpsCalc'], cluster: ['ClusterCalc', 'TwoStageCalc'], systematic: ['SelectionCalc', 'SystematicCalc'], twophase: ['NonresponseCalc', 'TwoPhaseCalc'], sensitive: ['RrCalc'], dataset: ['ComplexCalc', 'WeightingCalc'] })) imports[`./calculators/${file}`] = Object.fromEntries(names.map(name => [name, component(name)]));
  const onReportInsert = () => {};
  const screen = mount('../components/sampling/SamplingWorkbench.tsx', imports, { onReportInsert });
  const panels = () => nodes(screen.tree).filter(n => n.props?.['data-sampling-page']);
  assert.deepEqual(panels().map(n => n.key), ['builder']);
  assert.equal(nodes(panels()[0]).find(n => n.type === imports['./DesignBuilder'].default).props.onReportInsert, onReportInsert);
  screen.click('样本量与分层分配');
  assert.equal(panels().find(n => n.key === 'builder').props.hidden, true);
  const sizeType = nodes(panels().find(n => n.key === 'size')).find(n => typeof n.type === 'function').type;
  assert.equal(nodes(panels().find(n => n.key === 'size')).find(n => n.type === sizeType).props.onReportInsert, onReportInsert);
  screen.click('精度与估计'); screen.click('分层'); screen.click('简单随机'); screen.click('样本量与分层分配');
  assert.equal(panels().length, 3, 'only visited pages are mounted');
  assert.equal(nodes(panels().find(n => n.key === 'size')).find(n => typeof n.type === 'function').type, sizeType);
  const estimate = panels().find(n => n.key === 'estimate');
  assert.equal(estimate.props.hidden, true);
  const tools = nodes(estimate).filter(n => n.type === 'div' && ['srs', 'stratified'].includes(n.key));
  assert.equal(tools.length, 2, 'previous estimator remains mounted');
  assert.equal(tools.find(n => n.key === 'stratified').props.hidden, true);
  screen.click('精度与估计'); screen.click('分层');
  assert.equal(panels().length, 3, 'revisiting does not duplicate page instances');
});

test('sample-size, allocation and precision forms remain mounted across tabs', () => {
  const screen = mount('../components/sampling/SamplingDesigner.tsx', { '@/lib/sampling': sampling, '@/lib/report-insert': { sampleSizeInsert() { assert.fail('Report insertion is outside this tab-preservation test'); } }, '../motion/useWorkspaceMotion': motion, '../math/Tex': { Formula: component('Formula'), Tex: component('Tex') }, './SamplingDesigner.module.css': style });
  const inputs = () => nodes(screen.tree).filter(n => n.type === 'input');
  const count = inputs().length;
  const sizeForm = () => nodes(screen.tree).find(n => n.type === 'div' && n.props?.className === 'split');
  assert.equal(sizeForm().props.hidden, false);
  screen.click('分层与配额把样本分到各层');
  assert.equal(inputs().length, count);
  assert.equal(sizeForm().props.hidden, true);
  screen.click('已有样本的精度回收后复核');
  assert.equal(inputs().length, count);
  screen.click('样本量按精度要求倒推');
  assert.equal(sizeForm().props.hidden, false);
});
