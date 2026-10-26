import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationMarkdown, recordName } from '../lib/agent/transcript-export.ts';

const at = Date.UTC(2026, 9, 26, 2, 5);
const thread = {
  title: '整群抽样/要注意什么?', createdAt: at,
  messages: [
    { role: 'user', at, text: '整群抽样要注意什么' },
    { role: 'agent', at, answered: 'confirmed', turn: { lines: [[{ text: '发给模型之前请确认：' }]], cards: [{ kind: 'confirm', title: '用「服务甲」回答', lines: [[{ text: '发送：' }, { text: '这句话、最近 12 条对话', mark: 'strong' }], [{ text: '不发送：问卷、数据与报告的原文。', mark: 'dim' }], []], confirm: { label: '发送', action: { type: 'clear' } }, cancel: '不发送' }] } },
    { role: 'agent', at, model: { service: '服务甲', step: 1 }, turn: { lines: [[{ text: '用设计效应 ' }, { text: String.raw`\text{DEFF}=1+(m-1)\rho`, mark: 'tex' }, { text: ' 衡量。' }], [{ text: '◆ ', mark: 'cyan' }, { text: '服务甲 的回答，未经核实。', mark: 'dim' }]] } },
    { role: 'agent', at, turn: { lines: [[{ text: '整体照度 ' }, { text: '25%', mark: 'gold' }, { text: '。' }]], cards: [{ kind: 'tool', title: '读取 · 项目照度', lines: [[{ text: '问卷设计' }, { text: '50%' }]] }] } },
    { role: 'agent', at, model: { service: '服务甲', step: 2 }, turn: { lines: [[{ text: '问卷设计最弱。' }]] } },
    { role: 'pending', at },
  ],
};

test('the record says how many model calls were made and through which service, then gives the conversation in order', () => {
  const md = conversationMarkdown(thread, at);
  assert.match(md, /^# 证见 Agent 对话记录：整群抽样\/要注意什么\?/);
  assert.match(md, /本段对话调用生成式模型 2 次，服务：服务甲。/);
  assert.match(md, /## 你 · /);
  assert.match(md, /## 证见 · 模型回答（服务甲，未经核实）/);
  assert.match(md, /## 证见 · 模型回答（服务甲，第 2 步，未经核实）/);
  assert.match(md, /## 证见 · 指令模式/);
  assert.match(md, /## 证见 · 确认 · [^\n]+\n\n发给模型之前请确认：\n需要确认：用「服务甲」回答 —— 已确认\n发送：\*\*这句话、最近 12 条对话\*\*\n不发送：问卷、数据与报告的原文。\n\n/, 'what the user agreed to is in the record, word for word');
  assert.ok(md.includes(String.raw`$\text{DEFF}=1+(m-1)\rho$`), 'formulas keep their TeX');
  assert.ok(md.includes('读取 · 项目照度\n问卷设计50%'), 'a tool card’s rows are part of it');
  assert.ok(!md.includes('◆'), 'the unverified note lives in the heading, not repeated in the body');
  assert.ok(md.indexOf('整群抽样要注意什么') < md.indexOf('问卷设计最弱'));
});

test('a conversation without a model call says so, and the file name is safe everywhere', () => {
  const plain = conversationMarkdown({ ...thread, messages: thread.messages.filter(m => !('model' in m)) }, at);
  assert.match(plain, /本段对话未调用生成式模型/);
  assert.match(recordName(thread, at), /^证见对话-整群抽样-要注意什么-\d{8}\.md$/);
  assert.match(recordName({ title: '   ' }, at), /^证见对话-对话-\d{8}\.md$/);
});

const agent = (extra, lines = [[{ text: '……' }]]) => ({ role: 'agent', at, turn: { lines }, ...extra });
const said = (lines, cards) => ({ role: 'agent', at, turn: { lines, cards } });
const job = (status, more = {}) => ({ kind: 'job', status, detail: '已起草「通勤调查」· 2 题 · 基于问卷 v0', projectId: 'p', serviceLabel: '服务乙', model: 'deepseek-chat', ...more });
const draft = (...cards) => said([[{ text: '开始起草。' }]], cards);

test('every call is shown as it ended; calls never sent are shown but not counted', () => {
  const md = conversationMarkdown({ title: '调用', createdAt: at, messages: [
    agent({ model: { service: '服务甲', step: 1, status: 'running' } }),
    agent({ model: { service: '服务甲', step: 1, status: 'failed' } }),
    agent({ model: { service: '服务甲', step: 2, status: 'unknown' } }),
    agent({ model: { service: '服务丙', step: 1, status: 'refused' } }),
  ] }, at);
  assert.match(md, /本段对话调用生成式模型 3 次（其中 2 次结果尚不明确），服务：服务甲。/);
  assert.match(md, /## 证见 · 模型调用结果尚不明确（服务甲）/);
  assert.match(md, /## 证见 · 模型调用失败（服务甲）/);
  assert.match(md, /## 证见 · 模型调用结果尚不明确（服务甲，第 2 步）/);
  assert.match(md, /## 证见 · 模型调用未发出（服务丙，未调用模型）/);
  assert.match(md, /不是完整的 AI 使用台账/);
});

test('a reply stored before calls were recorded is still credited to its service', () => {
  const md = conversationMarkdown({ title: '旧', createdAt: at, messages: [
    agent({}, [[{ text: '回答。' }], [{ text: '◆ ', mark: 'cyan' }, { text: '服务甲 的回答，未经核实；项目里的数字以工具读到的为准。', mark: 'dim' }]]),
  ] }, at);
  assert.match(md, /调用生成式模型 1 次，服务：服务甲。/);
  assert.match(md, /## 证见 · 模型回答（服务甲，未经核实）[^\n]*\n\n回答。\n/);
});

test('older calls that ended without a reply are still counted as model calls, or shown as never sent', () => {
  const md = conversationMarkdown({ title: '旧失败', createdAt: at, messages: [
    agent({}, [[{ text: '正在请' }, { text: '「服务甲」', mark: 'strong' }, { text: '回答…', mark: 'dim' }]]),
    agent({}, [[{ text: '这一轮没有完成：', mark: 'error' }, { text: '模型服务出错了。' }]]),
    agent({}, [[{ text: '结果尚未明确：', mark: 'error' }, { text: '这一轮已记下；核对只读取回执，不会再次调用模型。' }]]),
    agent({}, [[{ text: '正在根据工具结果接着回答…', mark: 'dim' }]]),
    agent({}, [[{ text: '这一轮没有发出：', mark: 'error' }, { text: '每小时最多 30 次对话模型调用，请稍后再试。' }]]),
    agent({}, [[{ text: '这一轮没有发出，', mark: 'error' }, { text: '没有产生费用，可以再问一次。' }]]),
    agent({}, [[{ text: 'constructor', mark: 'error' }]]),
  ] }, at);
  assert.match(md, /本段对话调用生成式模型 4 次（其中 3 次结果尚不明确），服务：服务甲、未记录的服务。/);
  assert.match(md, /## 证见 · 模型调用结果尚不明确（服务甲）/);
  assert.match(md, /## 证见 · 模型调用失败（未记录的服务）/);
  assert.equal(md.match(/## 证见 · 模型调用未发出（未记录的服务，未调用模型）/g)?.length, 2);
  assert.match(md, /## 证见 · 指令模式[^\n]*\n\nconstructor/);
});

test('emphasis stays Markdown emphasis, one pair of marks for a run of emphasised text', () => {
  const md = conversationMarkdown({ title: '强调', createdAt: at, messages: [
    agent({ model: { service: '服务甲', step: 1, status: 'ready' } }, [[{ text: '有效', mark: 'strong' }, { text: '样本量', mark: 'strong' }, { text: '是 ' }, { text: 'n', mark: 'tex' }, { text: '。' }]]),
  ] }, at);
  assert.ok(md.includes('**有效样本量**是 $n$。'));
});

test('questionnaire drafting: consent, the call and the proposed questions are part of the record', () => {
  const md = conversationMarkdown({ title: '起草', createdAt: at, messages: [
    said([[{ text: '可以。' }]], [{ kind: 'consent', brief: '大学生通勤方式', state: 'submitted', serviceLabel: '服务乙', projectTitle: '通勤' }]),
    draft(job('done')),
    said([[{ text: '模型拟了 2 道题。' }]], [{ kind: 'proposal', projectId: 'p', proposalId: 'x', serviceId: 's', serviceRevision: 1, serviceLabel: '服务乙', model: 'deepseek-chat', inputRevision: 0,
      design: { title: '通勤调查', questions: [{ text: '你每天通勤多久？', type: 'single' }, { text: '你用什么交通方式？', type: 'multiple' }] } }]),
  ] }, at);
  assert.match(md, /调用生成式模型 1 次，服务：服务乙（deepseek-chat）。/);
  assert.match(md, /## 证见 · 确认[^\n]*\n\n可以。\n需要确认：调用模型起草问卷（研究需求：大学生通勤方式；服务：服务乙；项目：通勤）—— 已确认/);
  assert.match(md, /## 证见 · 模型起草问卷（服务乙（deepseek-chat），已完成）[^\n]*\n\n开始起草。\n已起草「通勤调查」/);
  assert.match(md, /## 证见 · 模型拟议的问卷（服务乙（deepseek-chat），未经核实）[^\n]*\n\n模型拟了 2 道题。\n模型拟议的问卷（未经核实[^\n]*：通勤调查\n1\. 你每天通勤多久？（single）\n2\. 你用什么交通方式？（multiple）/);
  // The oldest messages are dropped first, so a long conversation can keep the proposal without the job that made it.
  const kept = conversationMarkdown({ title: '起草', createdAt: at, messages: [said([[{ text: '模型拟了 2 道题。' }]], [{ kind: 'proposal', projectId: 'p', proposalId: 'x', serviceId: 's', serviceRevision: 1, serviceLabel: '服务乙', model: 'deepseek-chat', inputRevision: 0, design: { title: '', questions: [] } }])] }, at);
  assert.match(kept, /调用生成式模型 1 次，服务：服务乙（deepseek-chat）。/);
  assert.match(kept, /：未命名问卷/);
});

test('a draft that never reached a model is shown but not counted, however old the record', () => {
  for (const card of [
    job('failed', { detail: '本次起草没有启动：服务没有问卷能力。', noCall: true }),
    job('failed', { detail: '本次起草没有启动：服务没有问卷能力。' }),
    job('failed', { detail: '无法读取项目当前的问卷版本，本次没有调用模型：网络错误。' }),
    job('running', { detail: '正在读取项目当前的问卷版本…' }),
  ]) {
    const md = conversationMarkdown({ title: '未启动', createdAt: at, messages: [draft(card)] }, at);
    assert.match(md, /本段对话未调用生成式模型/, card.detail);
    assert.match(md, /## 证见 · 模型起草问卷未启动（服务乙（deepseek-chat），未调用模型）/);
  }
  const failed = conversationMarkdown({ title: '失败', createdAt: at, messages: [draft(job('failed', { detail: '模型没有完成本次起草；项目问卷没有变化。' }))] }, at);
  assert.match(failed, /调用生成式模型 1 次，/);
  assert.match(failed, /## 证见 · 模型起草问卷（服务乙（deepseek-chat），失败）/);
  const sent = conversationMarkdown({ title: '在途', createdAt: at, messages: [draft(job('running', { detail: '正在调用模型起草问卷…', request: {} }))] }, at);
  assert.match(sent, /调用生成式模型 1 次（其中 1 次结果尚不明确）/);
});
