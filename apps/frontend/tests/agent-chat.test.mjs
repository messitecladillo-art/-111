import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_ERRORS, chatContext, chatHistory, isDefiniteChatRejection, parseChatReceipt } from '../lib/agent/chat.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { route, toolTurn } from '../lib/agent/router.ts';

const empty = { design: null, dataset: null, report: null, resultPending: false };
const ctx = (room = null) => ({ room, light: illuminate(empty), traces: [] });
const text = turn => turn.lines.flat().map(s => s.text).join('');

test('the model sees each module’s light and failing checks, the figures that can be traced, and no data rows', () => {
  const context = chatContext('design', illuminate(empty), [{ reference: '图 3-1', title: '各年级满意度' }]);
  assert.equal(context.room, 'design');
  assert.deepEqual(context.rooms.map(r => r.room), ['design', 'sampling', 'analysis', 'editor']);
  assert.ok(context.rooms[0].blind.length >= 1 && context.rooms[0].blind.every(b => b.length <= 80));
  assert.deepEqual(context.traces, [{ reference: '图 3-1', title: '各年级满意度' }]);
  assert.ok(JSON.stringify(context).length < 16000, 'well inside the backend’s limit');
});

test('the history keeps the latest twelve entries within the length limit', () => {
  const lines = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'agent' : 'user', text: `第${i}句${'长'.repeat(i === 19 ? 2000 : 0)}` }));
  const history = chatHistory([...lines, { role: 'user', text: '   ' }]);
  assert.equal(history.length, 12);
  assert.equal(history[0].text, '第8句');
  assert.ok(history.at(-1).text.length <= 1200 && history.at(-1).text.endsWith('…'));
});

test('a receipt is checked again: unknown tools and modules are dropped, the shape is enforced', () => {
  const receipt = parseChatReceipt({ id: 'turn-1', status: 'ready', message: '下一步？', reply: '先补齐问卷映射。', droppedActions: 0, errorCode: null, actions: [
    { tool: 'open', args: { room: 'design' } }, { tool: 'open', args: { room: 'nowhere' } }, { tool: 'delete', args: {} },
    { tool: 'light', args: {} }, { tool: 'lookup', args: { query: '设计效应' } }] });
  assert.deepEqual(receipt.actions, [{ tool: 'open', args: { room: 'design' } }, { tool: 'light', args: {} }, { tool: 'lookup', args: { query: '设计效应' } }]);
  assert.equal(receipt.message, '下一步？');
  assert.throws(() => parseChatReceipt({ id: 'turn-1', status: 'done' }));
  assert.throws(() => parseChatReceipt(null));
  assert.equal(parseChatReceipt({ id: 'x', status: 'failed', reply: '  ', actions: 'no' }).reply, null);
});

test('a refusal before any call is told apart from an outcome that is not yet known', () => {
  assert.equal(isDefiniteChatRejection(422, 'capability_unavailable'), true);
  assert.equal(isDefiniteChatRejection(429, 'call_rate_limit'), true);
  assert.equal(isDefiniteChatRejection(409, 'outcome_unknown'), true);
  assert.equal(isDefiniteChatRejection(502, 'provider_failure'), false);
  assert.equal(isDefiniteChatRejection(0, 'network'), false);
  assert.match(CHAT_ERRORS.capability_unavailable, /研究/);
});

test('each tool the model asks for runs exactly as its command does', () => {
  assert.deepEqual(toolTurn({ tool: 'next', args: {} }, ctx()), route('/下一步', ctx()));
  assert.deepEqual(toolTurn({ tool: 'light', args: {} }, ctx()), route('/照度', ctx()));
  assert.match(text(toolTurn({ tool: 'blind', args: { room: 'design' } }, ctx()).turn), /问卷设计里光到不了的角落/);
  assert.deepEqual(toolTurn({ tool: 'open', args: { room: 'analysis' } }, ctx()).turn.act, { type: 'open', room: 'analysis' });
  assert.equal(toolTurn({ tool: 'open', args: { room: 'analysis' } }, ctx('analysis')).turn.act, undefined, 'an open module is not opened again');
  assert.deepEqual(toolTurn({ tool: 'lookup', args: { query: '设计效应' } }, ctx()), { lookup: '设计效应', explicit: true });
  assert.deepEqual(toolTurn({ tool: 'draft', args: { brief: '社区体育设施满意度' } }, ctx()), { generate: '社区体育设施满意度' });
  assert.match(text(toolTurn({ tool: 'trace', args: { reference: '图 3-1' } }, ctx()).turn), /图/);
});

test('what a tool found is sent back as plain text, its cards included, and only for read-only tools', async () => {
  const { isResultTool, turnText, MAX_STEPS } = await import('../lib/agent/chat.ts');
  const light = toolTurn({ tool: 'light', args: {} }, ctx()).turn;
  const found = turnText(light);
  assert.match(found, /整体照度/);
  assert.match(found, /问卷设计/, 'the card’s rows are part of it');
  assert.ok(found.length <= 1200);
  assert.equal(isResultTool('light'), true);
  assert.equal(isResultTool('open'), false);
  assert.equal(isResultTool('draft'), false);
  assert.equal(MAX_STEPS, 3);
  assert.equal(parseChatReceipt({ id: 'x', status: 'ready', reply: '好', actions: [] }).step, 1);
  assert.equal(parseChatReceipt({ id: 'x', status: 'ready', step: 2, reply: '好', actions: [] }).step, 2);
});

test('a reply’s formulas are typeset, never shown as TeX, and its emphasis is bold', async () => {
  const { replyLines, spanText } = await import('../lib/agent/chat.ts');
  const [line] = replyLines(String.raw`设计效应 $\text{DEFF}=1+(m-1)\rho$，**很重要**。`);
  assert.deepEqual(line, [{ text: '设计效应 ' }, { text: String.raw`\text{DEFF}=1+(m-1)\rho`, mark: 'tex' }, { text: '，' }, { text: '很重要', mark: 'strong' }, { text: '。' }]);
  assert.deepEqual(replyLines(String.raw`样本量：` + '\n' + String.raw`$$n=\frac{z^2p(1-p)}{e^2}$$`), [[{ text: '样本量：' }], [{ text: String.raw`n=\frac{z^2p(1-p)}{e^2}`, mark: 'math' }]]);
  assert.deepEqual(replyLines(String.raw`\(a+b\) 与 \[c=d\]`)[0].map(s => s.mark), ['tex', undefined, 'math']);
  assert.deepEqual(replyLines('经费 $5 以内'), [[{ text: '经费 $5 以内' }]], 'a lone dollar stays text');
  assert.deepEqual(replyLines(`$${'x'.repeat(500)}$`)[0].map(s => s.mark), [undefined], 'too long to be a formula');
  assert.equal(replyLines('第一段\n\n\n第二段').length, 2);
  assert.equal(line.map(spanText).join(''), String.raw`设计效应 $\text{DEFF}=1+(m-1)\rho$，很重要。`, 'history keeps the formula’s delimiters');
});
