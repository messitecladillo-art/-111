import assert from 'node:assert/strict';
import { test } from 'node:test';

// The thread store reads the browser's storage; maps stand in for it.
const fake = () => { const map = new Map(); return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const local = fake(), session = fake(), handlers = [];
globalThis.window = { localStorage: local, sessionStorage: session, addEventListener: (type, fn) => { if (type === 'storage') handlers.push(fn); } };
// What the browser does when another tab saves: the value changes, then every other tab hears of the key.
const fromAnotherTab = (key, value) => { local.setItem(key, value); for (const fn of handlers) fn({ key }); };
const { stamp, threads } = await import('../components/agent/threads.ts');
const user = text => ({ ...stamp(), role: 'user', text });
const agent = text => ({ ...stamp(), role: 'agent', turn: { lines: [[{ text }]] } });
const texts = (book, id = book.active) => book.threads.find(t => t.id === id)?.messages.map(m => m.role === 'user' ? m.text : m.turn.lines[0][0].text) ?? [];

test('conversations belong to one identity: another sees nothing, even before binding', () => {
  session.setItem('evix.agent.transcript.v2', JSON.stringify({ owner: 'x', messages: [] }));
  threads.append([user('登录完成前说的话')]);
  assert.equal(threads.view(null).threads.length, 1, 'what was typed before the session is known stays visible to that page');
  threads.bind('alice');
  assert.equal(session.getItem('evix.agent.transcript.v2'), null, 'the single-transcript store of earlier versions is removed');
  assert.deepEqual(texts(threads.view('alice')), ['登录完成前说的话'], 'and joins the identity it turned out to be');
  threads.append([agent('好的')]);
  assert.deepEqual(threads.view('bob'), { threads: [], active: null, draftProject: null }, 'another account reads an empty book before binding');
  assert.deepEqual(threads.view(null).threads, [], 'so does a session still being checked');
  threads.bind('bob');
  assert.equal(threads.view('bob').threads.length, 0, 'another account starts with none of alice’s conversations');
  assert.match(local.getItem('evix.agent.threads.v1:alice'), /登录完成前说的话/, 'alice’s stay in her own key');
  threads.bind('guest');
  threads.append([user('访客的问题')]);
  assert.match(session.getItem('evix.agent.threads.v1:guest'), /访客的问题/, 'a guest keeps them only for the tab');
  assert.equal(local.getItem('evix.agent.threads.v1:guest'), null);
});

test('a conversation starts from a draft, is titled by its first words, and a late reply finds its own thread', () => {
  threads.bind('carol');
  threads.draft('project-1');
  threads.append([user('甲区居民的体育设施满意度怎么调查'), agent('先确定研究问题。')]);
  const first = threads.view('carol').active;
  assert.equal(threads.view('carol').threads[0].title, '甲区居民的体育设施满意度怎么调查');
  assert.equal(threads.view('carol').threads[0].projectId, 'project-1', 'the draft’s project files the new conversation');
  const job = agent('开始起草。');
  threads.append([job]);
  threads.draft();
  threads.append([user('/照度')]);
  const second = threads.view('carol').active;
  assert.notEqual(second, first);
  // A model call answered while the user is elsewhere goes to the conversation it came from.
  threads.appendAfter(job.id, agent('模型拟了 5 道题。'));
  threads.patch(job.id, m => ({ ...m, turn: { lines: [[{ text: '已起草' }]] } }));
  assert.deepEqual(texts(threads.view('carol'), first), ['甲区居民的体育设施满意度怎么调查', '先确定研究问题。', '已起草', '模型拟了 5 道题。']);
  assert.deepEqual(texts(threads.view('carol'), second), ['/照度']);
  assert.equal(threads.find(job.id).turn.lines[0][0].text, '已起草');
  threads.select(first);
  threads.setProject(null);
  assert.equal(threads.view('carol').threads.find(t => t.id === first).projectId, null);
  threads.remove(first);
  assert.equal(threads.view('carol').active, null, 'removing the open conversation leaves a new draft');
  assert.equal(threads.view('carol').threads.length, 1);
});

test('an account’s conversations come back after a reload; a knowledge lookup in flight does not', async () => {
  threads.bind('dave');
  threads.append([user('什么是设计效应'), { ...stamp(), role: 'pending', query: '设计效应', explicit: true }]);
  const fresh = await import('../components/agent/threads.ts?reload');
  fresh.threads.bind('dave');
  const restored = fresh.threads.view('dave');
  assert.equal(restored.threads.length, 1);
  assert.deepEqual(restored.threads[0].messages.map(m => m.role), ['user'], 'a pending lookup could not finish after a reload, so it is not kept');
  assert.equal(restored.active, restored.threads[0].id);
});

test('confirming a draft into a project files an unfiled conversation there, and never moves a filed one', () => {
  threads.bind('erin');
  const ask = user('起草一份问卷');
  threads.append([ask]);
  assert.equal(threads.projectOf(ask.id), null);
  threads.file(ask.id, 'project-a');
  assert.equal(threads.projectOf(ask.id), 'project-a');
  threads.file(ask.id, 'project-b');
  assert.equal(threads.projectOf(ask.id), 'project-a', 'a conversation already filed stays where the user put it');
});

test('two tabs of one account keep each other’s conversations', () => {
  threads.bind('gina');
  threads.append([user('这个标签页的对话')]);
  const mine = threads.view('gina').active;
  // The other tab adds a conversation of its own and saves everything it has.
  const saved = JSON.parse(local.getItem('evix.agent.threads.v1:gina'));
  const theirs = { id: 'other-tab-thread', title: '另一个标签页的对话', projectId: null, createdAt: 1, updatedAt: 2, messages: [user('另一个标签页的对话')] };
  fromAnotherTab('evix.agent.threads.v1:gina', JSON.stringify({ threads: [theirs, ...saved.threads], active: theirs.id }));
  assert.deepEqual(threads.view('gina').threads.map(t => t.title).sort(), ['另一个标签页的对话', '这个标签页的对话'].sort());
  assert.equal(threads.view('gina').active, mine, 'this tab keeps its own open conversation');
  threads.append([agent('好的')]);
  assert.match(local.getItem('evix.agent.threads.v1:gina'), /另一个标签页的对话/, 'and its next save keeps the other tab’s');
  fromAnotherTab('evix.agent.threads.v1:somebody-else', JSON.stringify({ threads: [], active: null }));
  assert.equal(threads.view('gina').threads.length, 2, 'another account’s key is not this tab’s business');
  fromAnotherTab('evix.agent.threads.v1:gina', JSON.stringify({ threads: [theirs], active: theirs.id }));
  assert.equal(threads.view('gina').active, null, 'a conversation deleted in the other tab closes here too');
});
