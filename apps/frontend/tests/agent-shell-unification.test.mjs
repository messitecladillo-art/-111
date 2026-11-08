import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), ts = require('typescript');
const path = new URL('../components/agent/AgentShell.tsx', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const tree = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map(), elements = [];
function visit(node) {
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(tree), node);
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const opening = node => ts.isJsxElement(node) ? node.openingElement : node;
const attribute = (node, name) => opening(node).attributes.properties.find(prop => prop.name?.getText(tree) === name);
const handler = (node, name) => attribute(node, name)?.initializer?.expression?.getText(tree);
const compile = expression => ts.transpileModule(`globalThis.run = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test('main model configuration opens the same full-size services panel and closes the artifact overlay', () => {
  const declaration = declarations.get('go');
  const goCallback = declaration.initializer.arguments[0].getText(tree);
  const events = [], window = { location: { hash: '' } };
  const context = vm.createContext({ window, currentPanel: () => null,
    setArtifactOpen: value => events.push(['artifact', value]), setExpanded: value => events.push(['expanded', value]) });
  vm.runInContext(compile(goCallback), context);
  const go = context.run;
  const button = elements.find(node => opening(node).tagName.getText(tree) === 'button'
    && attribute(node, 'aria-label')?.initializer?.text === '模型配置');
  assert.ok(button, 'configuration is accessible in the main header');
  const click = vm.createContext({ go });
  vm.runInContext(compile(handler(button, 'onClick')), click);
  click.run();
  assert.equal(window.location.hash, 'services');
  assert.deepEqual(events, [['artifact', false], ['expanded', true]]);
});

test('composer stores the exact conversation call override used by live dispatch', () => {
  const composer = elements.find(node => opening(node).tagName.getText(tree) === 'Composer');
  const calls = [], context = vm.createContext({ owner: 'account-a', setStageModelPreference: (...args) => calls.push(args) });
  vm.runInContext(compile(handler(composer, 'onService')), context);
  context.run('chosen-model');
  assert.deepEqual(calls, [['account-a', 'research.conversation', 'chosen-model']]);
  assert.match(source, /const chatService = resolveStageModelRoute\('research\.conversation'/);
});

test('panel editing expands the mounted editor rather than navigating to another workbench', () => {
  const button = elements.find(node => opening(node).tagName.getText(tree) === 'button' && ts.isJsxElement(node)
    && node.children.some(child => ts.isJsxText(child) && child.text.includes('展开编辑')));
  assert.ok(button);
  const expanded = [], context = vm.createContext({ setExpanded: value => expanded.push(value) });
  vm.runInContext(compile(handler(button, 'onClick')), context);
  context.run();
  assert.deepEqual(expanded, [true]);
  assert.equal(attribute(button, 'href'), undefined);
});

test('research workspace uses project identity rather than conversation identity and receives host state', () => {
  const workspace = elements.find(node => opening(node).tagName.getText(tree) === 'ResearchWorkspace');
  assert.ok(workspace);
  const key = attribute(workspace, 'key').initializer.expression.getText(tree);
  assert.match(key, /owner/);
  assert.match(key, /identityEpoch/);
  assert.match(key, /projectId/);
  assert.doesNotMatch(key, /thread|book\.active/);
  assert.equal(handler(workspace, 'onTopic'), 'research.topic');
  assert.equal(handler(workspace, 'literature'), 'research.literature');
  assert.equal(handler(workspace, 'onLiterature'), 'research.setLiterature');
});
