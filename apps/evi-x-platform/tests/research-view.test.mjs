import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createResearchViewController } from '../components/research-view/view-controller.ts';

function fixture() {
  const document = { activeElement: null, defaultView: { getComputedStyle: element => ({visibility: element.cssVisibility ?? 'visible'}) } }, frames = new Map(), microtasks = [], calls = [], observers = new Set(), timers = new Map();
  let sequence = 0, section = 'design';
  class Element {
    constructor(tagName, parent = null) { this.tagName = tagName; this.parentElement = parent; this.children = []; this.ownerDocument = document; this.isConnected = true; this.hidden = false; this.scrollTop = 0; this.scrollLeft = 0; this.type = 'text'; this.value = ''; this.selectionStart = 0; this.selectionEnd = 0; this.selectionDirection = 'none'; parent?.children.push(this); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    closest() { return this.hidden || this.inert ? this : this.parentElement?.closest() ?? null; }
    querySelectorAll() { return this.children.flatMap(child => [...(['INPUT','TEXTAREA'].includes(child.tagName) ? [child] : []), ...child.querySelectorAll()]); }
    getClientRects() { return this.noLayout || this.closest() ? [] : [{}]; }
    matches() { return Boolean(this.disabled || this.fieldsetDisabled); }
    focus() { if (this.getClientRects().length && !this.matches() && !this.focusFails) document.activeElement = this; }
    setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction ?? 'none'; }
  }
  const page = new Element('HTML'), host = new Element('DIV', page), design = new Element('DIV', host), report = new Element('DIV', host), canvas = new Element('DIV', page), toolbar = new Element('BUTTON', page), canvasButton = new Element('BUTTON', canvas);
  const input = new Element('TEXTAREA', design), reportInput = new Element('TEXTAREA', report), editorButton = new Element('BUTTON', design);
  input.value = '问卷题干待继续编辑'; reportInput.value = '报告正文'; report.hidden = true; canvas.hidden = true;
  const controller = createResearchViewController({
    getHost: () => host, getSection: () => section, getCanvasFocus: () => canvasButton, getToolbarFocus: () => toolbar,
    onModeChange(mode) { calls.push(['mode',mode]); host.hidden = mode !== 'workbench'; canvas.hidden = mode !== 'canvas'; },
    onOpenEditor(next) { calls.push(['editor',next,input.value]); section = next; design.hidden = next !== 'design'; report.hidden = next !== 'report'; },
        requestFrame(callback) { const id = ++sequence; frames.set(id,callback); return id; }, cancelFrame(id) { frames.delete(id); }, queueMicrotask(callback) { microtasks.push(callback); },
    observeHost(_host,callback) { observers.add(callback); return () => observers.delete(callback); }, scheduleTimeout(callback,duration) { assert.equal(duration,5000); const id = ++sequence; timers.set(id,callback); return id; }, cancelTimeout(id) { timers.delete(id); },
  });
  const flushMicrotasks = () => { while (microtasks.length) microtasks.shift()(); };
  const flushFrame = () => { const batch = [...frames]; frames.clear(); for (const [,callback] of batch) callback(); };
  const settle = () => { flushMicrotasks(); for (let count = 0; frames.size && count < 10; count++) flushFrame(); assert.equal(frames.size,0); };
  return { controller, document, host, design, report, input, reportInput, page, editorButton, canvasButton, toolbar, calls, frames, microtasks, observers, timers, mutate: () => [...observers].forEach(callback => callback()), Element, flushMicrotasks, flushFrame, settle };
}

test('flag-off returns the original children without hooks or a DOM host', () => {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const source = fs.readFileSync(new URL('../components/research-view/ResearchViewHost.tsx',import.meta.url),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const imports = { react: {}, 'react/jsx-runtime': { jsx: (type,props,key) => ({type,props,key}) }, '@/components/workbench/shell-kit': {}, './view-controller': {createResearchViewController}, './ResearchViewHost.module.css': {default:{}} };
  const box = {exports:{},process:{env:{}},require: name => {assert.ok(name in imports);return imports[name];}};
  vm.runInNewContext(compiled,box);
  const children = {type:'OriginalEditor',props:{content:'未保存题干'}};
  for (const value of [undefined,'false','1']) { box.process.env.NEXT_PUBLIC_EVIX_RESEARCH_CANVAS = value; assert.equal(box.exports.default({identityKey:'u:p',projectTitle:'项目',activeSection:'design',onOpenEditor(){},children}),children); }
});

test('the experimental hosted wrapper retains one editor per kind and the current project context', () => {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const source = fs.readFileSync(new URL('../components/hosted/HostedProject.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('HostedProject.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(tree.parseDiagnostics, []);
  const openings = [];
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const named = name => openings.filter(node => node.tagName.getText(tree) === name);
  assert.equal(named('ResearchViewHost').length, 1);
  assert.equal(named('QuestionnaireStudio').length, 1);
  assert.equal(named('HostedReport').length, 1);
  for (const name of ['QuestionnaireStudio', 'HostedReport']) {
    assert.equal(named(name)[0].attributes.properties.some(attribute => attribute.name?.getText(tree) === 'key'), false, `${name} must not be re-keyed on a view change`);
  }
  const host = named('ResearchViewHost')[0];
  const hostAttributes = new Map(host.attributes.properties.map(attribute => [attribute.name?.getText(tree), attribute.initializer?.getText(tree)]));
  assert.equal(hostAttributes.get('identityKey'), '{`${auth.identityEpoch}:${projectId}`}');
  assert.equal(hostAttributes.get('activeSection'), '{tab}');
  assert.equal(hostAttributes.has('key'), false);
  assert.ok(openings.some(node => node.attributes.properties.some(attribute => attribute.name?.getText(tree) === 'data-knowledge-context')));
  const tabRegions = openings.flatMap(node => node.attributes.properties.filter(attribute => attribute.name?.getText(tree) === 'hidden').map(attribute => attribute.initializer?.getText(tree)));
  for (const tab of ['design', 'silicon', 'collection', 'analysis', 'report', 'defense']) assert.ok(tabRegions.includes(`{tab !== '${tab}'}`), tab);
  const shell = fs.readFileSync(new URL('../components/WorkbenchShell.tsx', import.meta.url), 'utf8');
  assert.equal(shell.includes('ResearchViewHost'), false, 'the A1 experiment must not wrap the existing A2 canvas');
});

test('twenty switches preserve the same textarea, caret, direction and nested/page scroll', () => {
  const f = fixture(); f.input.focus(); f.input.setSelectionRange(2,5,'backward'); f.input.scrollTop = 71; f.host.scrollTop = 124; f.page.scrollTop = 456; f.controller.remember(f.input);
  f.editorButton.focus(); f.controller.remember(f.editorButton);
  const original = f.input;
  for (let count = 0; count < 20; count++) { f.controller.requestMode('canvas'); f.settle(); assert.equal(f.document.activeElement,f.canvasButton); f.input.setSelectionRange(0,0); f.input.scrollTop = 0; f.host.scrollTop = 0; f.page.scrollTop = 0; f.controller.requestMode('workbench'); f.settle(); assert.equal(f.document.activeElement,original); assert.equal(original.selectionStart,2); assert.equal(original.selectionEnd,5); assert.equal(original.selectionDirection,'backward'); assert.equal(original.scrollTop,71); assert.equal(f.host.scrollTop,124); assert.equal(f.page.scrollTop,456); }
  assert.equal(f.input.value,'问卷题干待继续编辑'); f.controller.dispose();
});

test('composition queues the entire open-editor action until final input settles', () => {
  const f = fixture(); f.input.focus(); f.controller.compositionStart();
  let prevented = false; f.controller.protectPointerDown({preventDefault(){prevented = true;}}); assert.equal(prevented,true);
  f.controller.openEditor('report'); assert.equal(f.calls.length,0); assert.equal(f.host.hidden,false);
  f.controller.compositionEnd(); assert.equal(f.calls.length,0); f.flushMicrotasks(); assert.equal(f.calls.length,0); f.flushFrame(); assert.equal(f.calls.length,0);
  f.input.value = '最终中文输入'; f.input.setSelectionRange(6,6); f.controller.remember(f.input);
  f.flushFrame(); f.settle(); assert.deepEqual(f.calls[0],['editor','report','最终中文输入']); assert.equal(f.document.activeElement,f.reportInput);
  f.controller.requestMode('canvas'); f.settle(); f.controller.openEditor('design'); f.settle(); assert.equal(f.document.activeElement,f.input); assert.equal(f.input.selectionStart,6); f.controller.dispose();
});

test('a reversal during composition settling applies only the latest requested view', () => {
  const f = fixture(); f.input.focus(); f.controller.compositionStart(); f.controller.requestMode('canvas'); f.controller.compositionEnd(); f.controller.requestMode('workbench'); f.settle();
  assert.deepEqual(f.calls,[['mode','workbench']]); assert.equal(f.host.hidden,false); assert.equal(f.document.activeElement,f.input); f.controller.dispose();
});

test('a connected but hidden stale field is never restored as the active editor', () => {
  const f = fixture(); f.input.focus(); f.controller.remember(f.input); f.controller.requestMode('canvas'); f.settle();
  f.input.hidden = true; const replacement = new f.Element('TEXTAREA',f.design); replacement.value = '当前可见字段';
  f.controller.requestMode('workbench'); f.settle(); assert.equal(f.input.isConnected,true); assert.equal(f.document.activeElement,replacement); f.controller.dispose();
});

test('new composition cancels the prior scheduled handoff and disposal cancels frames/microtasks', () => {
  const f = fixture(); f.input.focus(); f.controller.compositionStart(); f.controller.openEditor('report'); f.controller.compositionEnd(); f.flushMicrotasks();
  assert.equal(f.frames.size,1); f.controller.compositionStart(); assert.equal(f.frames.size,0); f.flushFrame(); assert.equal(f.calls.length,0);
  f.controller.compositionEnd(); f.controller.dispose(); f.settle(); assert.equal(f.calls.length,0); assert.equal(f.frames.size,0);
  f.controller.requestMode('canvas'); f.controller.openEditor('report'); f.controller.compositionEnd(); f.settle(); assert.equal(f.calls.length,0);
});

test('identity cleanup prevents old-account callbacks and a new controller starts in workbench', () => {
  const old = fixture(); old.input.focus(); old.controller.compositionStart(); old.controller.openEditor('report'); old.controller.compositionEnd(); old.controller.dispose();
  const next = fixture(); next.input.focus(); next.controller.remember(next.input); old.settle(); assert.equal(old.calls.length,0); assert.equal(next.host.hidden,false); assert.equal(next.calls.length,0); next.controller.dispose();
});
test('the first asynchronously mounted report field restores focus once and releases its observer', () => {
  const f = fixture(); f.reportInput.isConnected = false; f.controller.openEditor('report'); f.settle();
  assert.equal(f.document.activeElement,f.toolbar); assert.equal(f.observers.size,1); assert.equal(f.timers.size,1);
  f.reportInput.isConnected = true; f.mutate(); f.settle(); assert.equal(f.document.activeElement,f.reportInput); assert.equal(f.observers.size,0); assert.equal(f.timers.size,0); f.controller.dispose();
});

test('later user actions and tab changes prevent an asynchronous field from stealing focus', () => {
  const f = fixture(); f.reportInput.isConnected = false; f.controller.openEditor('report'); f.settle(); f.controller.userInteraction(); const outside = new f.Element('BUTTON',f.page); outside.focus();
  f.reportInput.isConnected = true; f.mutate(); f.settle(); assert.equal(f.document.activeElement,outside); assert.equal(f.observers.size,0); assert.equal(f.timers.size,0); f.controller.dispose();
  const g = fixture(); g.reportInput.isConnected = false; g.controller.openEditor('report'); g.settle(); g.controller.openEditor('design'); g.settle(); g.reportInput.isConnected = true; g.mutate(); g.settle(); assert.equal(g.document.activeElement,g.input); assert.equal(g.observers.size,0); g.controller.dispose();
});

test('a user action before the initial restore frame also retains their chosen focus', () => {
  const f = fixture(); f.controller.requestMode('canvas'); f.controller.userInteraction(); f.toolbar.focus(); f.settle(); assert.equal(f.document.activeElement,f.toolbar); f.controller.dispose();
});

test('the late-mount wait is bounded and disposal releases observer, timer and pending restore', () => {
  const f = fixture(); f.reportInput.isConnected = false; f.controller.openEditor('report'); f.settle(); [...f.timers.values()][0](); assert.equal(f.observers.size,0); assert.equal(f.timers.size,0); f.reportInput.isConnected = true; f.mutate(); f.settle(); assert.equal(f.document.activeElement,f.toolbar); f.controller.dispose();
  const g = fixture(); g.reportInput.isConnected = false; g.controller.openEditor('report'); g.settle(); g.reportInput.isConnected = true; g.mutate(); assert.equal(g.frames.size,1); g.controller.dispose(); g.settle(); assert.equal(g.observers.size,0); assert.equal(g.timers.size,0); assert.equal(g.document.activeElement,g.toolbar);
});
test('CSS no-layout and closed-details fields are skipped instead of claiming a failed native focus', () => {
  for (const reason of ['CSS display none','closed details']) {
    const f = fixture(); f.input.noLayout = true; f.input.reason = reason; const available = new f.Element('TEXTAREA',f.design); available.value = '可见字段'; f.controller.requestMode('canvas'); f.settle(); f.controller.requestMode('workbench'); f.settle(); assert.equal(f.document.activeElement,available,reason); f.controller.dispose();
  }
});

test('inherited fieldset disable invalidates a remembered field and chooses another eligible input', () => {
  const f = fixture(); f.input.focus(); f.controller.remember(f.input); f.controller.requestMode('canvas'); f.settle(); f.input.fieldsetDisabled = true; assert.equal(f.input.disabled,undefined);
  const available = new f.Element('TEXTAREA',f.design); f.controller.requestMode('workbench'); f.settle(); assert.equal(f.document.activeElement,available); f.controller.dispose();
});

test('failed native focus keeps the bounded observer alive for a later usable editor field', () => {
  const f = fixture(); f.input.focusFails = true; f.controller.requestMode('canvas'); f.settle(); f.controller.requestMode('workbench'); f.settle(); assert.equal(f.document.activeElement,f.toolbar); assert.equal(f.observers.size,1);
  const available = new f.Element('TEXTAREA',f.design); f.mutate(); f.settle(); assert.equal(f.document.activeElement,available); assert.equal(f.observers.size,0); f.controller.dispose();
});
