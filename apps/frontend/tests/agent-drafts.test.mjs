import assert from 'node:assert/strict';
import { test } from 'node:test';

// The draft store reads the browser's storage; maps stand in for it.
const fake = () => { const map = new Map(); return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const local = fake(), session = fake(), handlers = new Map();
globalThis.window = {
  localStorage: local, sessionStorage: session,
  addEventListener: (type, fn) => { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
};
// What the browser does when another tab saves: the value changes, then every other tab hears of the key.
const fromAnotherTab = (key, value) => { local.setItem(key, value); for (const fn of handlers.get('storage') ?? []) fn({ key }); };
const KEY = id => `evix.agent.drafts.v1:${id}`;

test('a draft follows its conversation, not the composer, and comes back after a reload', async () => {
  const { drafts, NEW_DRAFT } = await import('../components/agent/drafts.ts');
  drafts.bind('ann');
  drafts.save('thread-a', '甲区问卷的题干还要改');
  drafts.save('thread-b', '另一段对话里的追问');
  drafts.save(NEW_DRAFT, '还没开始的对话');
  assert.equal(drafts.text('thread-a'), '甲区问卷的题干还要改');
  assert.equal(drafts.text('thread-b'), '另一段对话里的追问');
  assert.equal(drafts.text('thread-c'), '', 'a conversation never typed in has no draft');
  drafts.save('thread-a', '   ');
  assert.equal(drafts.has('thread-a'), false, 'erasing the text clears the draft');
  drafts.flush();
  const fresh = await import('../components/agent/drafts.ts?reload');
  fresh.drafts.bind('ann');
  assert.equal(fresh.drafts.text('thread-b'), '另一段对话里的追问');
  assert.equal(fresh.drafts.text(NEW_DRAFT), '还没开始的对话');
  assert.equal(fresh.drafts.has('thread-a'), false, 'a cleared draft stays cleared');
  const saved = JSON.parse(local.getItem(KEY('ann')));
  assert.equal(saved.entries['thread-b'].text, '另一段对话里的追问');
  assert.ok(saved.gone['thread-a'] > 0, 'clearing is kept as a tombstone');
});

test('drafts belong to one identity; a guest’s drafts join the account as its conversations do', async () => {
  const { drafts } = await import('../components/agent/drafts.ts?identities');
  drafts.bind('guest');
  drafts.save('guest-thread', '访客写的草稿');
  drafts.flush();
  assert.equal(local.getItem(KEY('guest')), null, 'a guest writes only to this tab');
  drafts.bind('nora');
  assert.equal(drafts.text('guest-thread'), '访客写的草稿', 'signing in carries the guest draft over');
  assert.equal(session.getItem(KEY('guest')), null, 'and it leaves the guest tab storage');
  drafts.save('nora-thread', '账号里的草稿');
  drafts.flush();
  assert.equal(drafts.textFor('nora', 'nora-thread'), '账号里的草稿');
  assert.equal(drafts.textFor('oscar', 'nora-thread'), '', 'another identity in view reads no draft');
  drafts.saveFor('oscar', 'nora-thread', '冒名写入的草稿');
  assert.equal(drafts.text('nora-thread'), '账号里的草稿', 'another identity in view cannot write one either');
  drafts.bind('guest');
  assert.equal(drafts.text('guest-thread'), '', 'a guest after sign-out sees none of the account’s drafts');
  drafts.bind('nora');
  assert.equal(drafts.text('nora-thread'), '账号里的草稿');
  drafts.bind('oscar');
  assert.equal(drafts.text('nora-thread'), '', 'another account sees nothing of nora’s');
});

test('two tabs merge by the later draft, and a draft sent in one does not return from the other’s older copy', async () => {
  const { drafts } = await import('../components/agent/drafts.ts?tabs');
  drafts.bind('kit');
  drafts.save('one', '这个标签页先写的');
  drafts.flush();
  const newer = { entries: { one: { text: '另一个标签页后来改的', at: Date.now() + 5000 }, two: { text: '只在另一个标签页里', at: Date.now() + 4000 } }, gone: {} };
  fromAnotherTab(KEY('kit'), JSON.stringify(newer));
  assert.equal(drafts.text('one'), '另一个标签页后来改的', 'the later draft wins');
  assert.equal(drafts.text('two'), '只在另一个标签页里', 'nothing the other tab holds is lost');
  drafts.clear('one');
  drafts.flush();
  const older = { entries: { one: { text: '另一个标签页的旧草稿', at: Date.now() - 5000 } }, gone: {} };
  fromAnotherTab(KEY('kit'), JSON.stringify(older));
  assert.equal(drafts.has('one'), false, 'a sent draft is not brought back');
  drafts.flush();
  assert.ok(JSON.parse(local.getItem(KEY('kit'))).gone.one > 0, 'and the clear is saved back for the other tab');
});

test('drafts for conversations that are gone are dropped; the conversation not started keeps its draft', async () => {
  const { drafts, NEW_DRAFT } = await import('../components/agent/drafts.ts?retain');
  drafts.bind('remy');
  drafts.save('kept', '还留着的对话');
  drafts.save('deleted', '已删除的对话');
  drafts.save(NEW_DRAFT, '新对话');
  drafts.flush();
  drafts.retain(new Set(['kept']));
  assert.equal(drafts.text('kept'), '还留着的对话');
  assert.equal(drafts.text('deleted'), '', 'a deleted conversation takes its draft with it');
  assert.equal(drafts.text(NEW_DRAFT), '新对话');
  drafts.flush();
  assert.ok(JSON.parse(local.getItem(KEY('remy'))).gone.deleted > 0, 'the deletion is saved for the other tab');
});

test('clearing a conversation that has no draft writes nothing', async () => {
  const { drafts } = await import('../components/agent/drafts.ts?empty');
  drafts.bind('sasha');
  drafts.clear('never-typed');
  drafts.flush();
  assert.equal(local.getItem(KEY('sasha')), JSON.stringify({ entries: {}, gone: {} }), 'no tombstone for a draft that never existed');
});
