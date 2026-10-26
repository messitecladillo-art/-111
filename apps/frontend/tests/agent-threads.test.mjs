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

test('a visitor who signs in keeps what they said as a guest; signing out again shows the account nothing', () => {
  // The guest of the test above, in this tab, now signs in.
  threads.bind('nora');
  assert.deepEqual(threads.view('nora').threads.map(t => t.title), ['访客的问题']);
  assert.equal(threads.view('nora').threads[0].id, threads.view('nora').active, 'the conversation stays open');
  assert.equal(session.getItem('evix.agent.threads.v1:guest'), null, 'and leaves the guest’s tab storage');
  assert.match(local.getItem('evix.agent.threads.v1:nora'), /访客的问题/);
  threads.bind('guest');
  assert.deepEqual(threads.view('guest').threads, [], 'a guest after sign-out sees none of the account’s conversations');
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
  fromAnotherTab('evix.agent.threads.v1:gina', JSON.stringify({ threads: [theirs], active: theirs.id, removed: [mine] }));
  assert.equal(threads.view('gina').active, null, 'a conversation deleted in the other tab closes here too');
});

test('the transcript of earlier versions becomes a conversation of the identity it recorded, never of another', () => {
  const earlier = [user('升级前问的问题'), agent('升级前的回答')];
  session.setItem('evix.agent.transcript.v2', JSON.stringify({ owner: 'hana', messages: earlier }));
  threads.bind('hana');
  const book = threads.view('hana'), carried = book.threads.find(t => t.id === book.active);
  assert.equal(carried?.title, '升级前问的问题', 'it opens as a conversation titled by its first question');
  assert.deepEqual(carried.messages.map(m => m.id), earlier.map(m => m.id));
  assert.equal(session.getItem('evix.agent.transcript.v2'), null, 'and the old key is gone once it is carried over');
  session.setItem('evix.agent.transcript.v2', JSON.stringify({ owner: 'ivan', messages: [user('伊万的问题')] }));
  threads.bind('jack');
  assert.equal(threads.view('jack').threads.some(t => t.title === '伊万的问题'), false, 'another identity’s transcript is dropped unread');
  assert.equal(session.getItem('evix.agent.transcript.v2'), null);
});

test('two tabs writing to one conversation before hearing of each other lose nothing, and settle without echoing', () => {
  threads.bind('kim');
  const ask = user('第一问');
  threads.append([ask, agent('第一答')]);
  const key = 'evix.agent.threads.v1:kim', id = threads.view('kim').active;
  // The other tab answered in the same conversation, but its save has not reached this tab yet.
  const stale = JSON.parse(local.getItem(key));
  stale.threads[0].messages.push(user('另一个标签页的追问'));
  local.setItem(key, JSON.stringify(stale));
  threads.append([user('这个标签页的追问')]);
  const saved = JSON.parse(local.getItem(key)).threads.find(t => t.id === id).messages.map(m => m.text ?? m.turn.lines[0][0].text);
  assert.deepEqual(saved.slice(0, 2), ['第一问', '第一答']);
  assert.deepEqual([...saved.slice(2)].sort(), ['另一个标签页的追问', '这个标签页的追问'].sort(), 'both follow-ups are saved');
  // A later change to a message beats an older copy of it, whichever tab saves last.
  threads.patch(ask.id, m => ({ ...m, text: '第一问（改）' }));
  const older = JSON.parse(local.getItem(key));
  older.threads[0].messages[0] = { ...older.threads[0].messages[0], text: '第一问', rev: 1 };
  fromAnotherTab(key, JSON.stringify(older));
  assert.equal(threads.find(ask.id).text, '第一问（改）');
  assert.equal(JSON.parse(local.getItem(key)).threads[0].messages[0].text, '第一问（改）', 'and is saved back for the other tab');
  // A save that holds everything this tab has is taken without saving back.
  let writes = 0;
  const setItem = local.setItem;
  local.setItem = (k, v) => { writes++; setItem(k, v); };
  fromAnotherTab(key, local.getItem(key));
  local.setItem = setItem;
  assert.equal(writes, 1, 'only the other tab’s own save; this tab does not echo it');
});

test('a conversation deleted in one tab does not come back from another tab’s older copy', () => {
  threads.bind('lee');
  threads.append([user('要删除的对话')]);
  const key = 'evix.agent.threads.v1:lee', doomed = threads.view('lee').active, older = local.getItem(key);
  threads.remove(doomed);
  fromAnotherTab(key, older);
  assert.equal(threads.view('lee').threads.some(t => t.id === doomed), false);
  assert.deepEqual(JSON.parse(local.getItem(key)).removed, [doomed], 'the deletion is saved back so the other tab drops it too');
});

test('a guest conversation held only in memory still moves into the account at sign-in', () => {
  threads.bind('guest');
  const setItem = session.setItem;
  session.setItem = () => { throw new Error('QuotaExceededError'); };
  threads.append([user('存储失败时访客问的问题')]);
  session.setItem = setItem;
  assert.equal(session.getItem('evix.agent.threads.v1:guest')?.includes('存储失败时访客问的问题') ?? false, false, 'nothing reached storage');
  threads.bind('olga');
  assert.deepEqual(threads.view('olga').threads.map(t => t.title), ['存储失败时访客问的问题']);
  assert.equal(threads.view('olga').active, threads.view('olga').threads[0].id);
});

test('when the cap drops the conversation that was open, the account’s own open one opens instead', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `pia-${i}`, title: `对话 ${i}`, projectId: null, createdAt: 1000 + i, updatedAt: 1000 + i, messages: [user(`对话 ${i}`)] }));
  local.setItem('evix.agent.threads.v1:pia', JSON.stringify({ threads: many, active: 'pia-59', removed: [] }));
  session.setItem('evix.agent.threads.v1:guest', JSON.stringify({ threads: [{ id: 'old-guest', title: '很早的访客对话', projectId: null, createdAt: 1, updatedAt: 1, messages: [user('很早的访客对话')] }], active: 'old-guest', removed: [] }));
  threads.bind('pia');
  assert.equal(threads.view('pia').threads.length, 60);
  assert.equal(threads.view('pia').active, 'pia-59');
});

test('a later step finds the conversation its sentence was asked in, and nothing once that conversation is gone', () => {
  threads.bind('quinn');
  const asked = user('原对话里的问题');
  threads.append([asked]);
  const home = threads.view('quinn').active;
  threads.draft();
  threads.append([user('另一段对话')]);
  assert.equal(threads.threadOf(asked.id)?.id, home, 'found by its message, whichever conversation is open');
  threads.remove(home);
  assert.equal(threads.threadOf(asked.id), undefined);
});

test('a conversation keeps the name the user gave it; between two tabs the later name holds', () => {
  threads.bind('mia');
  threads.append([user('整群抽样的设计效应怎么估计')]);
  const key = 'evix.agent.threads.v1:mia', id = threads.view('mia').active, older = local.getItem(key);
  threads.rename(id, '  设计效应   估计 ');
  assert.equal(threads.view('mia').threads[0].title, '设计效应 估计', 'spaces are tidied');
  threads.rename(id, '   ');
  assert.equal(threads.view('mia').threads[0].title, '设计效应 估计', 'an empty name changes nothing');
  // Another tab that has not heard of the rename saves its older copy: the name stays.
  fromAnotherTab(key, older);
  assert.equal(threads.view('mia').threads[0].title, '设计效应 估计');
  assert.equal(JSON.parse(local.getItem(key)).threads[0].title, '设计效应 估计', 'and is saved back for the other tab');
  // A name given later in the other tab wins here.
  const later = JSON.parse(local.getItem(key));
  later.threads[0] = { ...later.threads[0], title: '另一个标签页起的名字', titledAt: Date.now() + 1000 };
  fromAnotherTab(key, JSON.stringify(later));
  assert.equal(threads.view('mia').threads[0].title, '另一个标签页起的名字');
  threads.append([user('追问')]);
  assert.equal(threads.view('mia').threads[0].title, '另一个标签页起的名字', 'new messages leave the name alone');
});
