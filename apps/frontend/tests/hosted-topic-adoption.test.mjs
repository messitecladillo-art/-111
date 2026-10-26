import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { emptyTopicProject, hasTopicResearchWork, parseTopicProjectDocument } from '../lib/topic-project.ts';

const source = readFileSync(new URL('../components/hosted/HostedTopic.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('HostedTopic.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'HostedTopic');
assert.ok(component?.body);
const statements = component.body.statements;
const namedFunction = name => {
  const declaration = statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} must come from the actual component`);
  return declaration.getText(tree);
};
const callback = (hook, fragment) => {
  const statement = statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(tree) === hook && node.expression.arguments[0]?.getText(tree).includes(fragment));
  assert.ok(statement, `${hook} callback missing: ${fragment}`);
  return statement.expression.arguments[0].getText(tree);
};
let invalidation;
for (const statement of statements) {
  if (!ts.isVariableStatement(statement)) continue;
  const declaration = statement.declarationList.declarations.find(node => node.name.getText(tree) === 'invalidateAdoption');
  if (declaration) invalidation = declaration.initializer.arguments[0].getText(tree);
}
assert.ok(invalidation);
const functionNames = ['adoptionAvailable', 'applyAdoption', 'previewAdoption', 'finishAdoption'];
const code = `const invalidateAdoption = ${invalidation};
${functionNames.map(namedFunction).join('\n')}
const focusEffect = ${callback('useEffect', 'dialog.showModal()')};
const invalidateEffect = ${callback('useLayoutEffect', 'adoptionLiveContext.current=adoptionContext')};
globalThis.probe = { ${functionNames.join(',')}, focusEffect, invalidateEffect };`;
const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

// This executes the component's real functions and effects with real domain
// parsing, controlled lifecycle refs and a minimal DOM. Browser layout/native
// dialog focus remains a separate integration check.
function harness({ existingWork = true } = {}) {
  const initial = emptyTopicProject('2026-10-26');
  if (existingWork) {
    initial.brief.title = 'Existing research';
    initial.brief.questions = [{ id: 'rq-existing', text: 'Existing question' }];
  }
  const next = structuredClone(initial);
  next.brief.title = 'Proposed research';
  const state = { active: true, writable: true, writes: [], notices: [], views: [], focus: [], sourceVersion: 'sources-v1' };
  class Element {
    constructor(name) { this.name = name; this.isConnected = true; this.disabled = false; }
    getClientRects() { return this.isConnected ? [{}] : []; }
    matches() { return this.disabled; }
    focus() { state.focus.push(this.name); }
  }
  const trigger = new Element('trigger'), cancel = new Element('cancel'), brief = new Element('brief-title');
  const dialog = { open: false, shown: 0, closed: 0, showModal() { this.open = true; this.shown++; }, close() { this.open = false; this.closed++; } };
  const context = {
    HTMLElement: Element, document: { activeElement: trigger },
    current: { current: initial }, adoptionOperation: { current: null }, adoptionSequence: { current: 0 },
    adoptionLiveContext: { current: 'context-v1' }, adoptionContext: 'context-v1',
    editEpoch: { current: 0 }, loadEpoch: { current: 0 }, lock: { current: false },
    pendingSave: { current: null }, pendingDecision: { current: null },
    loading: false, busy: false, uncertain: false, conflict: false, accessDenied: false, composing: false, pendingLoad: null,
    adoptionTrigger: { current: null }, adoptionDestination: { current: 'trigger' }, adoptionDialog: { current: dialog },
    adoptionCancel: { current: cancel }, briefTitle: { current: brief }, adoption: null,
    TOPIC_BUNDLE: { catalog: { patterns: [] } },
    clone: structuredClone, parseTopicProjectDocument, hasTopicResearchWork,
    currentScope: () => state.active,
    currentWritable: () => state.active && state.writable,
    adoptionSources: () => state.sourceVersion,
    setAdoption(value) { context.adoption = value; },
    setNotice(value) { state.notices.push(value); },
    setView(value) { state.views.push(value); },
    write(value) { context.current.current = value; state.writes.push(structuredClone(value)); context.editEpoch.current++; },
  };
  vm.runInNewContext(compiled, context);
  return {
    state, context, next, trigger, brief, dialog,
    preview(value = next) { context.probe.previewAdoption(value); return context.adoptionOperation.current?.id; },
    finish(id, accept) { context.probe.finishAdoption(id, accept); },
    focusEffect() { return context.probe.focusEffect(); },
    invalidateEffect() { return context.probe.invalidateEffect(); },
  };
}

test('adoption previews before replacing work; cancel and late confirmation preserve the existing draft', () => {
  const h = harness();
  const id = h.preview();
  assert.ok(id);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.context.current.current.brief.title, 'Existing research');
  assert.equal(h.context.adoption.previousTitle, 'Existing research');
  h.finish(id, false);
  assert.equal(h.context.adoptionOperation.current, null);
  h.finish(id, true);
  assert.equal(h.state.writes.length, 0);
});

test('an accepted current preview updates the draft once and goes to the brief', () => {
  const h = harness();
  const id = h.preview();
  h.finish(id + 1, true);
  assert.equal(h.context.adoptionOperation.current.id, id, 'an old dialog event must not dismiss the current preview');
  h.finish(id, true);
  assert.equal(h.state.writes.length, 1);
  assert.equal(h.context.current.current.brief.title, 'Proposed research');
  assert.equal(h.context.adoptionDestination.current, 'brief');
  assert.deepEqual(h.state.views, ['brief']);
  h.finish(id, true);
  assert.equal(h.state.writes.length, 1);
});

test('an empty draft can adopt directly without an unnecessary replacement prompt', () => {
  const h = harness({ existingWork: false });
  assert.equal(h.preview(), undefined);
  assert.equal(h.context.adoption, null);
  assert.equal(h.state.writes.length, 1);
});

test('draft edits, late loads, source changes, account changes and pending operations fence stale previews', () => {
  const changes = [
    h => { h.context.current.current.brief.title = 'Typed after preview'; },
    h => { h.context.editEpoch.current++; },
    h => { h.context.loadEpoch.current++; },
    h => { h.context.adoptionLiveContext.current = 'different-context'; },
    h => { h.state.sourceVersion = 'sources-v2'; },
    h => { h.state.active = false; },
    h => { h.state.writable = false; },
    h => { h.context.busy = true; },
    h => { h.context.lock.current = true; },
    h => { h.context.composing = true; },
    h => { h.context.pendingSave.current = { id: 'pending-save' }; },
    h => { h.context.pendingDecision.current = { id: 'pending-decision' }; },
  ];
  for (const change of changes) {
    const h = harness(); const id = h.preview(); change(h); h.finish(id, true);
    assert.equal(h.state.writes.length, 0, change.toString());
    assert.equal(h.context.adoptionOperation.current, null);
  }
});

test('the actual layout invalidation effect dismisses a preview after context or identity drift', () => {
  const h = harness(); const id = h.preview();
  h.context.adoptionContext = 'changed-by-edit-or-identity';
  h.invalidateEffect();
  assert.equal(h.context.adoptionOperation.current, null);
  assert.equal(h.context.adoption, null);
  h.finish(id, true);
  assert.equal(h.state.writes.length, 0);
});

test('dialog lifecycle focuses cancel, then restores the trigger or accepted brief without crossing identity', () => {
  const cancelled = harness(); const cancelId = cancelled.preview(); const cancelCleanup = cancelled.focusEffect();
  assert.equal(cancelled.dialog.shown, 1);
  assert.deepEqual(cancelled.state.focus, ['cancel']);
  cancelled.finish(cancelId, false); cancelCleanup();
  assert.deepEqual(cancelled.state.focus, ['cancel', 'trigger']);
  assert.equal(cancelled.dialog.closed, 1);

  const accepted = harness(); const acceptId = accepted.preview(); const acceptCleanup = accepted.focusEffect();
  accepted.finish(acceptId, true); acceptCleanup();
  assert.deepEqual(accepted.state.focus, ['cancel', 'brief-title']);

  const switched = harness(); switched.preview(); const staleCleanup = switched.focusEffect();
  switched.state.active = false; staleCleanup();
  assert.deepEqual(switched.state.focus, ['cancel']);
  assert.equal(switched.dialog.closed, 1);
});

test('adoption controls are wired to cancel/accept and no longer invoke a native window confirmation', () => {
  assert.match(source, /onCancel=\{event=>\{event\.preventDefault\(\);finishAdoption\(adoption\?\.id,false\);\}\}/);
  assert.match(source, /取消，保留当前内容/);
  assert.match(source, /onClick=\{\(\)=>finishAdoption\(adoption\?\.id,true\)\}/);
  assert.doesNotMatch(functionNames.map(namedFunction).join('\n'), /window\.confirm|window\.alert/);
});
