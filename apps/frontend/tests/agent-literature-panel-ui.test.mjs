import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { transform } from 'esbuild';
import React from 'react';
import * as literature from '../lib/agent/literature-study.ts';

const source = fs.readFileSync(new URL('../components/agent/LiteratureStudyPanel.tsx', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2022' });
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : !node ? '' : React.Children.toArray(node.props?.children).map(text).join('');
const direction = '合成研究方向';
const paper = (letter, title) => ({ id: letter.repeat(64), title, filename: `${letter}.pdf`, pageCount: 5, pages: [
  { page: 2, text: '研究方法：从两个校区招募参与者。\n研究结果：等待时间中位数为三分钟。' },
] });
const A = paper('a', '合成文献甲'), B = { ...paper('b', '合成文献乙'), pages: [{ page: 2, text: '研究方法：记录每次行程。\n研究结果：等待时间中位数为四分钟。' }] };
const corpus = (executed = false) => literature.parseLiteratureStudy({ papers: [A, B], domain: 'social', evidence: [
  ...[A, B].flatMap((source, index) => [
    { id: `method-${index}`, paperId: source.id, page: 2, kind: 'method', quote: index ? '记录每次行程。' : '从两个校区招募参与者。' },
    { id: `result-${index}`, paperId: source.id, page: 2, kind: 'result', quote: index ? '等待时间中位数为四分钟。' : '等待时间中位数为三分钟。' },
  ]),
], ...(executed ? { executedFor: direction } : {}) });

function harness(overrides = {}) {
  const cells = [], effects = [], layout = [], nodes = new Map(), focused = [], published = [], adopted = [];
  let cursor = 0, dirty = true, tree;
  let props = { value: literature.emptyLiteratureStudy(), direction, disabled: false,
    onChange(value) { published.push(value); props = { ...props, value }; dirty = true; }, onAdopt: id => adopted.push(id), ...overrides };
  const effect = (queue, fn, deps) => {
    const index = cursor++, previous = cells[index];
    if (!previous || !deps || deps.some((value, n) => !Object.is(value, previous.deps?.[n]))) {
      const cell = cells[index] = { deps, cleanup: previous?.cleanup };
      queue.push(() => { cell.cleanup?.(); cell.cleanup = fn(); });
    }
  };
  const hooks = {
    useId: () => 'literature-test',
    useState(initial) { const index = cursor++; cells[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [cells[index].value, next => { cells[index].value = typeof next === 'function' ? next(cells[index].value) : next; dirty = true; }]; },
    useRef(initial) { const index = cursor++; cells[index] ??= { current: initial }; return cells[index]; },
    useMemo(fn, deps) { const index = cursor++, previous = cells[index]; if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) cells[index] = { deps, value: fn() }; return cells[index].value; },
    useEffect: (fn, deps) => effect(effects, fn, deps), useLayoutEffect: (fn, deps) => effect(layout, fn, deps),
  };
  const moduleBox = { exports: {} };
  vm.runInNewContext(code, { module: moduleBox, exports: moduleBox.exports, AbortController, URL, crypto: webcrypto,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => React.createElement(type, { ...props, key }), jsxs: (type, props, key) => React.createElement(type, { ...props, key }) };
      if (name === '@/lib/agent/literature-study') return { ...literature, parseLiteratureStudy: value => literature.parseLiteratureStudy(structuredClone(value)) };
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unapproved dependency: ${name}`);
    },
  });
  function render(next) {
    if (next) { props = { ...props, ...next }; dirty = true; }
    for (let round = 0; dirty && round < 15; round++) {
      dirty = false; cursor = 0; tree = moduleBox.exports.default(props);
      for (const element of walk(tree)) {
        const ref = element.props?.ref;
        if (!ref) continue;
        const key = typeof ref === 'function' ? element.props.id : ref;
        let node = nodes.get(key);
        if (!node) { node = { isConnected: true, clicks: 0, focus() { focused.push(element.props['aria-label'] ?? element.props.id ?? element.type); }, scrollIntoView() {}, click() { this.clicks++; } }; nodes.set(key, node); }
        node.value = element.props.value ?? ''; node.selectionStart ??= 0; node.selectionEnd ??= 0;
        if (typeof ref === 'function') ref(node); else ref.current = node;
      }
      while (layout.length) layout.shift()();
      while (effects.length) effects.shift()();
    }
    return tree;
  }
  const h = { render, published, adopted, focused, nodes,
    find: predicate => walk(tree).find(predicate), all: predicate => walk(tree).filter(predicate),
    button: label => walk(tree).find(node => node.type === 'button' && text(node).replace(/[＋→↗]/g, '').trim() === label),
    tab: key => walk(tree).find(node => node.props?.role === 'tab' && node.props.id.endsWith(key)),
    panel: key => walk(tree).find(node => node.props?.role === 'tabpanel' && node.props.id.endsWith(key)),
    quote: () => walk(tree).find(node => node.type === 'textarea' && node.props.placeholder),
    unmount() { cells.forEach(cell => cell?.cleanup?.()); },
  };
  render(); return h;
}

test('zero state puts explicit PDF import before optional role receipts and never runs automatically', () => {
  const h = harness();
  assert.ok(h.button('导入文献 PDF'));
  assert.equal(h.button('运行文献选题分析').props.disabled, true);
  const collaboration = h.find(node => node.type === 'details' && text(node).includes('研究协作与交接'));
  assert.equal(collaboration.props.open, undefined);
  assert.match(text(h.panel('evidence')), /导入原文.*确认页内摘录.*对照文献/);
  assert.equal(h.published.length, 0); assert.equal(h.adopted.length, 0);
  assert.match(text(h.find(node => node.type === 'section')), /本地规则分析/);
  h.unmount();
});

test('quote and evidence type drafts stay mounted through tab clicks and accessible keyboard navigation', () => {
  const h = harness({ value: corpus() });
  h.quote().props.onChange({ target: { value: '还没确认的摘录草稿' } });
  const kind = h.find(node => node.type === 'select' && node.props.value === 'method');
  kind.props.onChange({ target: { value: 'limitation' } }); h.render();
  for (const key of ['matrix', 'topics', 'evidence']) {
    h.tab(key).props.onClick(); h.render();
    assert.equal(h.quote().props.value, '还没确认的摘录草稿');
    assert.ok(h.find(node => node.type === 'select' && node.props.value === 'limitation'));
    assert.equal(h.panel('evidence').props.hidden, key !== 'evidence');
    assert.equal(h.all(node => node.props?.role === 'tab' && node.props.tabIndex === 0).length, 1);
  }
  const keys = [['End', 'topics'], ['ArrowRight', 'evidence'], ['ArrowLeft', 'topics'], ['Home', 'evidence']];
  for (const [key, expected] of keys) {
    let prevented = false;
    h.find(node => node.props?.role === 'tablist').props.onKeyDown({ key, preventDefault() { prevented = true; } }); h.render();
    assert.equal(prevented, true); assert.equal(h.tab(expected).props['aria-selected'], true);
    assert.equal(h.focused.at(-1), `literature-test-tab-${expected}`);
  }
  assert.equal(h.published.length, 0); h.unmount();
});

test('matrix evidence and role outputs navigate to visible panels and transfer focus to their actual output', () => {
  const h = harness({ value: corpus(true) });
  h.tab('matrix').props.onClick(); h.render();
  const reference = h.find(node => node.type === 'button' && text(node).includes('从两个校区招募参与者。'));
  reference.props.onClick(); h.render();
  assert.equal(h.panel('evidence').props.hidden, false);
  assert.equal(h.focused.at(-1), 'PDF 页原文');
  assert.equal(h.find(node => node.type === 'blockquote').props.children, '从两个校区招募参与者。');
  const analyst = h.find(node => node.type === 'button' && text(node).includes('领域与方法分析师'));
  analyst.props.onClick(); h.render(); h.button('文献对照表').props.onClick(); h.render();
  assert.equal(h.panel('matrix').props.hidden, false);
  assert.equal(h.focused.at(-1), 'literature-test-panel-matrix');
  h.find(node => node.type === 'button' && text(node).includes('证据审查员')).props.onClick(); h.render();
  h.button('核对结果').props.onClick(); h.render();
  assert.equal(h.panel('topics').props.hidden, false); assert.equal(h.focused.at(-1), '证据核对结果');
  assert.equal(h.adopted.length, 0); h.unmount();
});

test('checking a citation on the same physical page preserves the exact quote and type draft', () => {
  const h = harness({ value: corpus(true) }), draft = '研究方法：从两个校区招募参与者。';
  h.quote().props.onChange({ target: { value: draft } });
  h.find(node => node.type === 'select' && node.props.value === 'method').props.onChange({ target: { value: 'limitation' } }); h.render();
  h.tab('matrix').props.onClick(); h.render();
  walk(h.panel('matrix')).find(node => node.type === 'button' && text(node).includes('从两个校区招募参与者。')).props.onClick(); h.render();
  assert.equal(h.panel('evidence').props.hidden, false);
  assert.equal(h.quote().props.value, draft);
  assert.ok(h.find(node => node.type === 'select' && node.props.value === 'limitation'));
  assert.equal(h.focused.at(-1), 'PDF 页原文');
  assert.equal(h.published.length, 0); assert.equal(h.adopted.length, 0); h.unmount();
});

test('changing the actual paper or physical page still clears an unconfirmed quote before it can be bound', () => {
  const value = corpus(true);
  value.papers[0].pages.push({ page: 3, text: '页三补充：新的研究内容。' });
  const h = harness({ value });
  h.quote().props.onChange({ target: { value: '研究方法：从两个校区招募参与者。' } }); h.render();
  h.tab('matrix').props.onClick(); h.render();
  walk(h.panel('matrix')).find(node => node.type === 'button' && text(node).includes('记录每次行程。')).props.onClick(); h.render();
  assert.equal(h.quote().props.value, '');
  assert.equal(h.button('确认原文证据').props.disabled, true);
  assert.ok(h.find(node => node.type === 'textarea' && node.props.readOnly).props.value.includes('记录每次行程。'));
  h.find(node => node.type === 'select' && node.props.value === B.id).props.onChange({ target: { value: A.id } }); h.render();
  h.quote().props.onChange({ target: { value: '研究方法：从两个校区招募参与者。' } }); h.render();
  h.find(node => node.type === 'select' && node.props.value === 2).props.onChange({ target: { value: '3' } }); h.render();
  assert.equal(h.quote().props.value, '');
  assert.equal(h.button('确认原文证据').props.disabled, true);
  assert.equal(h.find(node => node.type === 'textarea' && node.props.readOnly).props.value, '页三补充：新的研究内容。');
  assert.equal(h.published.length, 0); assert.equal(h.adopted.length, 0); h.unmount();
});

test('scope approval is bound to the exact materials and direction; only explicit run and adoption dispatch', () => {
  const h = harness({ value: corpus() });
  const checkbox = () => h.find(node => node.type === 'input' && node.props.type === 'checkbox');
  checkbox().props.onChange({ target: { checked: true } }); h.render();
  assert.equal(h.button('运行文献选题分析').props.disabled, false);
  h.render({ direction: `${direction}变化` }); assert.equal(checkbox().props.checked, false);
  assert.equal(h.button('运行文献选题分析').props.disabled, true);
  checkbox().props.onChange({ target: { checked: true } }); h.render();
  h.render({ value: corpus() }); assert.equal(checkbox().props.checked, false);
  assert.equal(h.published.length, 0);
  checkbox().props.onChange({ target: { checked: true } }); h.render();
  h.button('运行文献选题分析').props.onClick(); h.render();
  assert.equal(h.published.at(-1).executedFor, `${direction}变化`);
  assert.equal(h.panel('topics').props.hidden, false); assert.equal(h.focused.at(-1), '证据核对结果');
  assert.equal(h.adopted.length, 0);
  const adopt = h.button('带入选题确认'); assert.ok(adopt); assert.equal(adopt.props.disabled, false);
  adopt.props.onClick(); assert.equal(h.adopted.length, 1); h.unmount();
});

test('confirming evidence validates the exact page text and invalidates an earlier analysis', () => {
  const h = harness({ value: corpus(true) });
  h.quote().props.onChange({ target: { value: '这不是原页文字' } }); h.render();
  h.button('确认原文证据').props.onClick(); h.render();
  assert.equal(h.published.length, 0); assert.ok(h.find(node => node.props?.role === 'alert'));
  h.quote().props.onChange({ target: { value: '研究方法：从两个校区招募参与者。' } }); h.render();
  h.button('确认原文证据').props.onClick(); h.render();
  assert.equal(h.published.length, 1, text(h.find(node => node.props?.role === 'alert'))); assert.equal(h.published[0].executedFor, undefined);
  assert.equal(h.quote().props.value, ''); assert.equal(h.button('运行文献选题分析').props.disabled, true);
  h.unmount();
});

test('candidate disclosures preserve the question, design and exact evidence without adopting on navigation', () => {
  const value = corpus(true), candidate = literature.buildLiteratureStudy(value, direction).candidates[0];
  const h = harness({ value });
  h.tab('topics').props.onClick(); h.render();
  const card = walk(h.panel('topics')).find(node => node.type === 'article');
  const definitionList = walk(card).find(node => node.type === 'dl');
  assert.deepEqual(walk(definitionList).filter(node => node.type === 'dt').map(text), ['研究问题', '验证思路']);
  assert.deepEqual(walk(definitionList).filter(node => node.type === 'dd').map(text), [candidate.question, candidate.design]);
  const conditions = walk(card).find(node => node.type === 'details' && text(node.props.children[0]) === '适用条件');
  const evidence = walk(card).find(node => node.type === 'details' && text(node.props.children[0]).startsWith('原文依据'));
  assert.ok(conditions); assert.ok(evidence);
  assert.equal(conditions.props.open, undefined); assert.equal(evidence.props.open, undefined);
  assert.equal(walk(conditions).find(node => node.type === 'p').props.children, candidate.caveat);
  assert.equal(evidence.props.onToggle, undefined, 'native disclosure does not dispatch a project mutation');
  assert.equal(evidence.props.children[0].props.onClick, undefined);
  const references = walk(evidence).filter(node => node.type === 'button');
  assert.equal(references.length, candidate.evidenceIds.length);
  for (const [index, reference] of references.entries()) {
    const entry = value.evidence.find(item => item.id === candidate.evidenceIds[index]);
    const source = value.papers.find(item => item.id === entry.paperId);
    assert.ok(text(reference).includes(source.title));
    assert.ok(text(reference).includes(`第 ${entry.page} 页`));
  }
  references[0].props.onClick(); h.render();
  assert.equal(h.panel('evidence').props.hidden, false); assert.equal(h.focused.at(-1), 'PDF 页原文');
  assert.equal(h.adopted.length, 0); assert.equal(h.published.length, 0);
  h.unmount();
});
