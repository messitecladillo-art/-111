import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';



// Independent boundary harness: execute the actual production AgentShell handlers.
// UI layout/rendering, transport and backend authorization are outside this harness.
// Authored as an independent review harness by /root/workflow_path; integrated by root.
function repositoryRoot(start) {
  for (let dir = start, depth = 0; depth < 10; depth++, dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'PROJECT_FRAMEWORK.md')) && fs.existsSync(path.join(dir, 'apps/frontend'))) return dir;
    if (path.dirname(dir) === dir) break;
  }
  throw Error('Repository root not found; behavioral tests must not be skipped.');
}
const root = repositoryRoot(path.dirname(fileURLToPath(import.meta.url)));
const chat = await import(pathToFileURL(path.join(root, 'apps/frontend/lib/agent/chat.ts')));
const routing = await import(pathToFileURL(path.join(root, 'apps/frontend/lib/agent/model-routing.ts')));
const ts = createRequire(path.resolve(root, 'package.json'))('typescript');
const sourcePath = path.resolve(root, 'apps/frontend/components/agent/AgentShell.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const tree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
const pieces = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'agent' && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(tree);
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(tree) === 'span')) pieces.push(node.getText(tree));
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'chatLine') pieces.push(node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callback, 'production agent handler callback must exist');
const compiled = ts.transpileModule(pieces.join('\n') + '\n globalThis.makeAgent = ' + callback + ';', { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const service = (id, revision = 1) => ({ id, label: `Synthetic ${id[0]}`, model: `synthetic-${id[0]}`, revision, capabilities: ['research', 'questionnaire', 'report'] });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; };
function harness() {
  let count = 0, activeOwner = ALICE;
  const books = new Map();
  const emptyBook = () => ({ active: null, threads: [], draftProject: null });
  const book = () => { if (!books.has(activeOwner)) books.set(activeOwner, emptyBook()); return books.get(activeOwner); };
  const all = () => book().threads.flatMap(t => t.messages);
  const home = id => book().threads.find(t => t.messages.some(m => m.id === id));
  const posts = [], drafts = [], tools = [], navigation = [];
  const first = deferred(), receipt = deferred();
  const current = { owner: ALICE, identityEpoch: 1, generation: { account: 'ready', lists: { state: 'ready', services: [service(A), service(B)] }, start: brief => ({ lines: [[{text: 'questionnaire consent'}]] }) },
    chatService: service(A), reportService: service(A), chatMode: 'model', panel: null, light: { overall: 0, rooms: [] }, traces: [], held: { results: [], findings: [], placed: [], pending: false }, plan: null,
    report: { title: 'Synthetic report', report: [] }, liveReport: { quality: { results: [] } }, design: null,
    mutate: () => {}, knowledge: { ready: true, search: async () => [] }, isCurrentAccount: (owner, epoch) => current.owner === owner && current.identityEpoch === epoch };
  const latest = { current };
  const threads = {
    view(owner) { return owner === activeOwner ? book() : emptyBook(); },
    append(messages) { let held = book().threads.find(t => t.id === book().active); if (!held) { held = { id: `thread-${++count}`, messages: [], projectId: null }; book().threads.push(held); book().active = held.id; } held.messages.push(...messages); },
    appendAfter(after, message) { const held = home(after); if (held) held.messages.splice(held.messages.findIndex(m => m.id === after) + 1, 0, message); },
    patch(id, change) { const held = home(id); if (held) { const index = held.messages.findIndex(m => m.id === id); held.messages[index] = change(held.messages[index]); } },
    find(id) { return all().find(m => m.id === id); }, threadOf: home,
    remove(id) { book().threads = book().threads.filter(t => t.id !== id); if (book().active === id) book().active = null; },
  };
  const globals = { ...chat, ...routing, latest, threads, consented: {current: new Set()}, crypto,
    console, setTimeout, clearTimeout, Date, JSON, Promise, Set, Map,
    stamp: () => ({id: `message-${++count}`, at: Date.now()}), focusInput() {}, go: room => navigation.push(room), sendToReport() {},
    HostedApiError: class extends Error {}, errorMessage: error => error.message, UNRECORDED_SERVICE: 'unrecorded',
    route: text => text === '/report-draft' ? { draft: 'intro.background' } : {turn: {lines: [[{text:'local answer'}]]}},
    toolTurn: action => { tools.push(action); return action.tool === 'lookup' ? {lookup: action.args.query, explicit: true} : {turn: {lines: [[{text: 'synthetic tool result'}]]}}; },
    lookupTurn: () => ({lines: [[{text:'lookup synthetic result'}]]}),
    blueprintNode: node => ({id: node, title:'研究背景'}), draftFacts: () => [], standingFindings: () => [], sectionText: () => '',
    draftRequest: ({service: selected}) => ({facts: [], request:{serviceId: selected.id, serviceRevision: selected.revision, idempotencyKey: `draft-${++count}`}}),
    draftLine: p => [{text:p.text}], draftText: p => p.text,
    sendChatTurn: async (_mutate, request) => { posts.push(structuredClone(request)); if (posts.length === 1) return first.promise; return {id:request.idempotencyKey,status:'ready',reply:'synthetic final',step:request.step??1,message:request.message,actions:[],droppedActions:0}; },
    sendDraft: async (_mutate, request) => { drafts.push(structuredClone(request)); return {id:request.idempotencyKey,status:'ready',paragraphs:[{text:'synthetic draft',facts:[]}],droppedParagraphs:0}; },
    readChatTurn: async () => receipt.promise, readDraft: async () => { throw Error('not requested'); },
  };
  const context = vm.createContext(globals);
  vm.runInContext(compiled, context);
  const agent = context.makeAgent();
  const cards = () => all().flatMap(m => (m.turn?.cards??[]).filter(c => c.kind === 'confirm').map(card => ({message:m,card})));
  const confirm = card => agent.answer(card.message.id, 'confirmed', card.card.confirm.action);
  return { current, latest, posts, drafts, tools, navigation, threads, first, receipt, agent, cards, confirm, all,
    choose(id, revision=1) { current.chatService = service(id, revision); current.reportService = service(id, revision); current.generation.lists.services = [current.chatService, service(id===A?B:A)]; },
    switchAccount() { activeOwner = BOB; current.owner = BOB; current.identityEpoch++; },
    async flush() { await tick(); await tick(); },
    readyFirst(actions=[]) { const req=posts[0]; first.resolve({id:req.idempotencyKey,status:'ready',reply:'synthetic reply',step:1,message:req.message,actions,droppedActions:0}); },
  };
}

test('old chat consent cannot dispatch a changed service or changed revision', async () => {
  for (const [id, revision] of [[B,1],[A,2]]) {
    const s=harness(); s.agent.send('研究下一步'); const old=s.cards().at(-1); assert.ok(old); s.choose(id,revision); s.confirm(old); await s.flush();
    assert.equal(s.posts.length,0,'changed destination requires fresh consent');
    assert.ok(s.cards().length>=2,'a fresh consent card is offered');
  }
});
test('old report consent cannot dispatch a changed service or changed revision', async () => {
  for (const [id, revision] of [[B,1],[A,2]]) {
    const s=harness(); s.current.chatMode='command'; s.agent.send('/report-draft'); const old=s.cards().at(-1); assert.ok(old); s.choose(id,revision); s.confirm(old); await s.flush();
    assert.equal(s.drafts.length,0,'report changed destination requires fresh consent');
    assert.ok(s.cards().length>=2,'fresh report consent is offered');
  }
});
test('a legacy stored chat/report action without a consent binding cannot call a model', async () => {
  const s=harness(); s.agent.perform({type:'chat',text:'legacy stored action'}); s.agent.perform({type:'draft',node:'intro.background'}); await s.flush();
  assert.equal(s.posts.length+s.drafts.length,0);
});
test('chat read-tool continuation stays with the first service after menu changes', async () => {
  const s=harness(); s.agent.send('读取结果'); s.confirm(s.cards().at(-1)); await s.flush(); assert.equal(s.posts.length,1); s.choose(B); s.readyFirst([{tool:'results',args:{}}]); await s.flush();
  assert.equal(s.posts.length,2); assert.equal(s.posts[0].serviceId,A); assert.equal(s.posts[1].serviceId,A); assert.equal(s.posts[1].serviceRevision,1);
});
test('an account switch during a model call cannot execute tools or a continuation', async () => {
  const s=harness(); s.agent.send('读取结果'); s.confirm(s.cards().at(-1)); await s.flush(); s.switchAccount(); s.readyFirst([{tool:'results',args:{}}]); await s.flush();
  assert.equal(s.posts.length,1); assert.equal(s.tools.length,0);
});
test('deleting the original thread during a model call stops its tool continuation', async () => {
  const s=harness(); s.agent.send('读取结果'); s.confirm(s.cards().at(-1)); await s.flush(); s.threads.remove(s.threads.view(ALICE).active); s.readyFirst([{tool:'results',args:{}}]); await s.flush(); assert.equal(s.posts.length,1);
});


test('a receipt read completing after account switch cannot run actions for another identity', async () => {
  const s=harness(); s.agent.send('读取结果'); s.confirm(s.cards().at(-1)); await s.flush();
  const waiting=s.all().find(m=>m.model?.status==='running');
  s.agent.perform({type:'check', turn:s.posts[0].idempotencyKey,message:waiting.id}); s.switchAccount();
  s.receipt.resolve({id:s.posts[0].idempotencyKey,status:'ready',reply:'synthetic checked reply',step:1,message:s.posts[0].message,actions:[{tool:'open',args:{room:'editor'}}],droppedActions:0});
  await s.flush(); assert.equal(s.tools.length,0,'the old account receipt must not execute browser tools');
});
test('a tool waiting for knowledge readiness cannot search a newly signed-in identity', async () => {
  const s=harness(); const searched=[]; s.current.knowledge={ready:false,search:async query=>{searched.push(['alice',query]);return[];}};
  s.agent.send('读取知识'); s.confirm(s.cards().at(-1)); await s.flush(); s.readyFirst([{tool:'lookup',args:{query:'原账户请求'}}]); await s.flush();
  s.switchAccount(); s.current.knowledge={ready:true,search:async query=>{searched.push(['bob',query]);return[];}};
  await new Promise(resolve=>setTimeout(resolve,300)); await s.flush();
  assert.equal(searched.length,0,'a pending tool must stop rather than search the next account'); assert.equal(s.posts.length,1);
});
