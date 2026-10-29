import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatLine } from '../lib/agent/chat.ts';

const answer = (text, cards) => ({ lines: [[{ text }]], ...(cards ? { cards } : {}) });

test('the model reads what was said, never a waiting line, a failure or a question put to the user', () => {
  assert.deepEqual(chatLine({ role: 'user', text: '问卷还缺什么' }), [{ role: 'user', text: '问卷还缺什么' }]);
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('问卷缺 3 处映射。') }), [{ role: 'agent', text: '问卷缺 3 处映射。' }]);
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('正在请「模型」回答…'), model: { status: 'running' } }), [], 'a sentence still being answered is not history');
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('这一轮没有完成：模型服务出错了。'), model: { status: 'failed' } }), [], 'a failure is a status note');
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('结果尚未明确：…'), model: { status: 'unknown' } }), [], 'so is an unclear outcome');
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('问卷映射完整。'), model: { status: 'ready' } }), [{ role: 'agent', text: '问卷映射完整。' }], 'an answer that arrived is history');
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('旧版记录的回答'), model: { service: '示例模型', step: 1 } }), [{ role: 'agent', text: '旧版记录的回答' }], 'a record from before statuses were kept is still an answer');
  assert.deepEqual(chatLine({ role: 'pending' }), [], 'a lookup in flight says nothing yet');
  assert.deepEqual(chatLine({ role: 'agent', turn: answer('请确认', [{ kind: 'confirm' }]) }), [], 'a question to the user is not something the agent said about the research');
});
