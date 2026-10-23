import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAgentMessage, assistantText, classifyAgentIntent, consentMessage, createAgentSession, filterSessions,
  formatRelativeTime, groupSessionsByDay, loadActiveSessionId, loadAgentSession, loadAgentSessions, localReply,
  parseAgentSession, questionnaireToolMessage, saveActiveSessionId, saveAgentSession, saveSessionIndex,
  updateAgentMessage, userMessage,
} from '../lib/agent-workspace.ts';

function memoryStorage() {
  const rows = new Map();
  return {
    getItem: key => rows.has(key) ? rows.get(key) : null,
    setItem: (key, value) => { rows.set(key, String(value)); },
    removeItem: key => { rows.delete(key); },
  };
}

const owner = '11111111-1111-4111-8111-111111111111';
const pendingRequest = {
  serviceId: '22222222-2222-4222-8222-222222222222',
  serviceRevision: 2,
  brief: '为校园咖啡消费设计问卷',
  expectedQuestionnaireRevision: 1,
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  consent: true,
};

test('classifyAgentIntent routes explicit questionnaire and analysis requests', () => {
  assert.equal(classifyAgentIntent('帮我设计一份关于校园咖啡的问卷'), 'questionnaire');
  assert.equal(classifyAgentIntent('分析一下问卷数据的信度与效度'), 'analysis');
  assert.equal(classifyAgentIntent('帮我找两个可以落地的选题方向'), 'topic');
  assert.equal(classifyAgentIntent('帮我写报告和 PPT'), 'report');
  assert.equal(classifyAgentIntent('准备答辩可能被追问的问题'), 'defense');
  assert.equal(classifyAgentIntent('你好，你能做什么？'), 'help');
});

test('first user message titles a session and later messages keep it', () => {
  const session = createAgentSession(owner);
  assert.equal(session.title, '新的研究会话');
  const first = appendAgentMessage(session, userMessage('这是一个超过二十六个字符的研究任务描述，用来检查标题截断行为是否正确'));
  assert.ok(first.title.endsWith('…'));
  assert.equal(first.title.length, 27);
  const second = appendAgentMessage(first, userMessage('第二条消息'));
  assert.equal(second.title, first.title);
  assert.equal(second.messages.length, 2);
});

test('consent message can move from pending to submitted without losing the brief', () => {
  const session = appendAgentMessage(createAgentSession(owner), consentMessage({ brief: pendingRequest.brief, serviceId: pendingRequest.serviceId, serviceLabel: '合成模型' }));
  const message = session.messages[0];
  const updated = updateAgentMessage(session, message.id, current => current.kind === 'consent' ? { ...current, status: 'submitted' } : current);
  assert.equal(updated.messages[0].kind, 'consent');
  assert.equal(updated.messages[0].status, 'submitted');
  assert.equal(updated.messages[0].brief, pendingRequest.brief);
});

test('sessions and pending receipts survive a storage round trip per owner', () => {
  const store = memoryStorage();
  let session = createAgentSession(owner);
  session = appendAgentMessage(session, userMessage('生成一份问卷'));
  session = appendAgentMessage(session, questionnaireToolMessage('tool-1', 'unknown', '结果待核对', { canReconcile: true }));
  session = { ...session, pending: { request: pendingRequest, serviceLabel: '合成模型', toolMessageId: 'tool-1', createdAt: new Date().toISOString() } };
  assert.equal(saveAgentSession(session, store), true);
  assert.equal(saveSessionIndex(owner, [session], store), true);
  const loaded = loadAgentSessions(owner, store);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].messages[0].text, '生成一份问卷');
  assert.equal(loaded[0].pending.request.idempotencyKey, pendingRequest.idempotencyKey);
  assert.equal(loaded[0].messages[1].canReconcile, true);
  assert.equal(loadAgentSessions('44444444-4444-4444-8444-444444444444', store).length, 0);
});

test('owner mismatch and malformed records are rejected', () => {
  const store = memoryStorage();
  const session = createAgentSession(owner);
  assert.equal(parseAgentSession({ ...session, ownerId: 'other' }, owner), null);
  assert.equal(parseAgentSession({ ...session, version: 2 }, owner), null);
  store.setItem(`evix.agent.session.v1:${encodeURIComponent(owner)}:broken`, '{"version":1}');
  assert.equal(loadAgentSession(owner, 'broken', store), null);
});

test('active session id is scoped to the owner', () => {
  const store = memoryStorage();
  saveActiveSessionId(owner, 'session-a', store);
  assert.equal(loadActiveSessionId(owner, store), 'session-a');
  assert.equal(loadActiveSessionId('other-owner', store), null);
  saveActiveSessionId(owner, null, store);
  assert.equal(loadActiveSessionId(owner, store), null);
});

test('session groups and search stay deterministic', () => {
  const now = new Date('2026-10-24T12:00:00+08:00');
  const base = createAgentSession(owner, null);
  const today = { ...base, id: 'today', title: '今天的会话', updatedAt: '2026-10-24T10:00:00+08:00' };
  const yesterday = { ...base, id: 'yesterday', title: '昨天的会话', updatedAt: '2026-10-23T10:00:00+08:00' };
  const older = { ...base, id: 'older', title: '更早的会话', updatedAt: '2026-10-01T10:00:00+08:00' };
  const groups = groupSessionsByDay([older, today, yesterday], now);
  assert.deepEqual(groups.map(group => group.label), ['今天', '昨天', '更早']);
  assert.equal(groups[0].sessions[0].id, 'today');
  assert.equal(filterSessions([today, yesterday], '昨天').length, 1);
  assert.equal(filterSessions([today, yesterday], '不存在').length, 0);
  assert.equal(formatRelativeTime('2026-10-24T11:59:30+08:00', now), '刚刚');
});

test('local replies stay honest and point at existing routes', () => {
  const topic = localReply('topic', 'project-1');
  assert.ok(topic.text.includes('选题'));
  assert.equal(topic.actions[0].href, '/projects/project-1');
  const help = localReply('help', null);
  assert.ok(help.text.includes('问卷生成'));
  assert.ok(help.actions.some(action => action.href === '/services'));
  for (const intent of ['topic', 'analysis', 'report', 'defense', 'help']) {
    for (const action of localReply(intent, null).actions) assert.ok(action.href.startsWith('/'));
  }
});

test('assistant text records whether a model was actually called', () => {
  const local = assistantText('本地说明');
  const model = assistantText('模型回执', { source: 'model' });
  assert.equal(local.source, 'local');
  assert.equal(model.source, 'model');
  assert.equal(local.kind, 'text');
});
