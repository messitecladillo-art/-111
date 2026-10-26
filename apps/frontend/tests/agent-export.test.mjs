import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationMarkdown, recordName } from '../lib/agent/transcript-export.ts';

const at = Date.UTC(2026, 9, 26, 2, 5);
const thread = {
  title: '整群抽样/要注意什么?', createdAt: at,
  messages: [
    { role: 'user', at, text: '整群抽样要注意什么' },
    { role: 'agent', at, answered: 'confirmed', turn: { lines: [[{ text: '发给模型之前请确认：' }]], cards: [{ kind: 'confirm', title: '用「服务甲」回答', lines: [], confirm: { label: '发送', action: { type: 'clear' } }, cancel: '不发送' }] } },
    { role: 'agent', at, model: { service: '服务甲', step: 1 }, turn: { lines: [[{ text: '用设计效应 ' }, { text: String.raw`\text{DEFF}=1+(m-1)\rho`, mark: 'tex' }, { text: ' 衡量。' }], [{ text: '◆ ', mark: 'cyan' }, { text: '服务甲 的回答，未经核实。', mark: 'dim' }]] } },
    { role: 'agent', at, turn: { lines: [[{ text: '整体照度 ' }, { text: '25%', mark: 'gold' }, { text: '。' }]], cards: [{ kind: 'tool', title: '读取 · 项目照度', lines: [[{ text: '问卷设计' }, { text: '50%' }]] }] } },
    { role: 'agent', at, model: { service: '服务甲', step: 2 }, turn: { lines: [[{ text: '问卷设计最弱。' }]] } },
    { role: 'pending', at },
  ],
};

test('the record says how many model calls were made and through which service, then gives the conversation in order', () => {
  const md = conversationMarkdown(thread, at);
  assert.match(md, /^# 证见 Agent 对话记录：整群抽样\/要注意什么\?/);
  assert.match(md, /调用生成式模型 2 次，服务：服务甲/);
  assert.match(md, /## 你 · /);
  assert.match(md, /## 证见 · 模型回答（服务甲，未经核实）/);
  assert.match(md, /## 证见 · 模型回答（服务甲，第 2 步，未经核实）/);
  assert.match(md, /## 证见 · 指令模式/);
  assert.match(md, /## 证见 · 确认 · [^\n]+\n\n发给模型之前请确认：\n需要确认：用「服务甲」回答 —— 已确认/);
  assert.ok(md.includes(String.raw`$\text{DEFF}=1+(m-1)\rho$`), 'formulas keep their TeX');
  assert.ok(md.includes('读取 · 项目照度\n问卷设计50%'), 'a tool card’s rows are part of it');
  assert.ok(!md.includes('◆'), 'the unverified note lives in the heading, not repeated in the body');
  assert.ok(md.indexOf('整群抽样要注意什么') < md.indexOf('问卷设计最弱'));
});

test('a conversation without a model call says so, and the file name is safe everywhere', () => {
  const plain = conversationMarkdown({ ...thread, messages: thread.messages.filter(m => !('model' in m)) }, at);
  assert.match(plain, /未调用生成式模型/);
  assert.match(recordName(thread, at), /^证见对话-整群抽样-要注意什么-\d{8}\.md$/);
  assert.match(recordName({ title: '   ' }, at), /^证见对话-对话-\d{8}\.md$/);
});
