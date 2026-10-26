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
  assert.deepEqual(replyLines(String.raw`\(a+b\) 与 \[c=d\]`).map(l => l.map(s => s.mark)), [['tex', undefined], ['math']], 'a display formula stands on its own line');
  assert.deepEqual(replyLines('经费 $5 以内'), [[{ text: '经费 $5 以内' }]], 'a lone dollar stays text');
  assert.deepEqual(replyLines(`$${'x'.repeat(500)}$`)[0].map(s => s.mark), [undefined], 'too long to be a formula');
  assert.equal(replyLines('第一段\n\n\n第二段').length, 2);
  assert.deepEqual(replyLines(String.raw`看**设计效应 $\text{DEFF}$ 很大**。`), [[{ text: '看' }, { text: '设计效应 ', mark: 'strong' },
    { text: String.raw`\text{DEFF}`, mark: 'tex' }, { text: ' 很大', mark: 'strong' }, { text: '。' }]], 'a formula inside emphasis is typeset too');
  assert.deepEqual(replyLines(String.raw`**设计效应 $$\text{DEFF}=1+(m-1)\rho$$ 越大越要加样本**`), [[{ text: '设计效应', mark: 'strong' }],
    [{ text: String.raw`\text{DEFF}=1+(m-1)\rho`, mark: 'math' }], [{ text: '越大越要加样本', mark: 'strong' }]], 'a display formula leaves the emphasis around it intact');
  assert.deepEqual(replyLines('样本量：\n$$\n' + String.raw`n = \frac{z^2 p(1-p)}` + '\n' + String.raw`{e^2}` + '\n$$\n然后回收。'),
    [[{ text: '样本量：' }], [{ text: String.raw`n = \frac{z^2 p(1-p)} {e^2}`, mark: 'math' }], [{ text: '然后回收。' }]], 'a display formula over several lines is one formula');
  assert.deepEqual(replyLines(String.raw`\[` + '\n' + 'a=b' + '\n' + String.raw`\]`), [[{ text: 'a=b', mark: 'math' }]]);
  assert.equal(line.map(spanText).join(''), String.raw`设计效应 $\text{DEFF}=1+(m-1)\rho$，很重要。`, 'history keeps the formula’s delimiters');
});

const result = (title, method, more = {}) => ({ id: title, title, sourceName: 's.csv', sourceUrl: '', sourceHash: 'h', resultHash: 'r', classification: 'user_provided', method, n: 212, total: 240,
  headers: [], rows: [], metrics: [{ label: 'χ²', value: 12.3456 }, { label: 'p', value: 0.000123 }, { label: 'Cramér V', value: null }, { label: 'df', value: 4 }], warnings: [], ...more });
const held = {
  results: [result('各年级满意度', '卡方检验'), result('通勤时间与满意度', 'Pearson 相关', { classification: 'simulated', variables: ['通勤时间'], warnings: ['样本量偏小'] })],
  findings: [{ id: 'f1', title: '高年级满意度更低', status: 'confirmed', interpretation: '差异显著。', evidenceIds: ['各年级满意度'], confirmedHashes: { 各年级满意度: 'r' } },
    { id: 'f2', title: '草稿', status: 'draft', interpretation: '', evidenceIds: [], confirmedHashes: {} }],
  pending: false, placed: [],
};
const withResults = (results = held) => ({ ...ctx(), results });

test('registered results are read with their method, effective sample and statistics, numbers marked as having an origin', () => {
  const turn = route('/结果', withResults()).turn, card = turn.cards[0];
  assert.match(text(turn), /已登记的分析结果 2 项，其中 1 项来自教学模拟数据。/);
  assert.equal(card.title, '读取 · 已登记结果');
  const rows = card.lines.map(line => line.map(s => s.text).join(''));
  assert.equal(rows[0], '通勤时间与满意度　Pearson 相关 · 有效样本 212 / 240 · 教学模拟 · 未写进报告', 'the latest first');
  assert.equal(rows[1], '　χ² 12.35；p 0.000123；df 4', 'a missing statistic is left out, not shown as zero');
  assert.equal(rows[2], '　提醒：样本量偏小。');
  assert.ok(card.lines[1].some(s => s.text === '12.35' && s.mark === 'gold'));
  assert.deepEqual(turn.cards[1].lines.map(line => line[0].text), ['高年级满意度更低'], 'only confirmed findings');
  assert.deepEqual(route('登记了哪些结果', withResults()), route('/结果', withResults()), 'the everyday phrasing runs the command');
  assert.deepEqual(toolTurn({ tool: 'results', args: {} }, withResults()), route('/结果', withResults()), 'and so does the tool the model asks for');
});

test('results are narrowed by title, method or variable; nothing is invented when there are none or the report is unseen', () => {
  assert.match(text(route('/结果 通勤', withResults()).turn), /与「通勤」有关的已登记的分析结果 1 项/);
  assert.match(text(toolTurn({ tool: 'results', args: { query: '卡方' } }, withResults()).turn), /有关的已登记的分析结果 1 项。/);
  const none = route('/结果 回归', withResults()).turn;
  assert.match(text(none), /登记的结果里没有「回归」/);
  assert.deepEqual(none.chips.map(c => c.action.text), ['/结果 通勤时间与满意度', '/结果 各年级满意度']);
  assert.match(text(route('/结果', withResults({ results: [], findings: [], pending: true, placed: [] })).turn), /正在送往报告/);
  const unseen = route('/结果', withResults(null)).turn;
  assert.match(text(unseen), /还没有打开报告与 PPT/);
  assert.equal(unseen.cards, undefined);
});

test('the model may ask for registered results, and is told how many there are without being sent them', () => {
  const receipt = parseChatReceipt({ id: 'x', status: 'ready', reply: '好', actions: [
    { tool: 'results', args: {} }, { tool: 'results', args: { query: '满意度' } }, { tool: 'results', args: { query: '长'.repeat(41) } }] });
  assert.deepEqual(receipt.actions, [{ tool: 'results', args: {} }, { tool: 'results', args: { query: '满意度' } }]);
  const context = chatContext(null, illuminate(empty), [], held);
  assert.deepEqual(context.results, { registered: 2, simulated: 1, frames: 0, confirmedFindings: 1 });
  assert.equal(chatContext(null, illuminate(empty), []).results, null);
  assert.ok(!JSON.stringify(context).includes('12.3456'), 'the statistics go only when the model asks');
});

test('a sampling frame in the report is listed as a plan, never as an analysis with an empty sample', () => {
  const frame = result('城区居民抽样框', 'sampling-frame', { n: 0, total: 0, metrics: [{ label: '计划有效样本', value: 300 }] });
  const plans = route('/结果', withResults({ results: [frame], findings: [], pending: false, placed: [] })).turn;
  assert.match(text(plans), /还没有分析结果，只有写进报告的抽样框 1 份。/);
  assert.equal(plans.cards.length, 1);
  assert.equal(plans.cards[0].title, '已写进报告的抽样框（计划，不是分析结果）');
  assert.deepEqual(plans.cards[0].lines.map(line => line.map(s => s.text).join('')), ['城区居民抽样框', '　计划有效样本 300']);
  assert.ok(!JSON.stringify(plans).includes('有效样本 0'));
  const both = route('/结果', withResults({ ...held, results: [...held.results, frame] })).turn;
  assert.match(text(both), /已登记的分析结果 2 项/);
  assert.deepEqual(both.cards.map(c => c.title), ['读取 · 已登记结果', '已写进报告的抽样框（计划，不是分析结果）', '已确认的研究发现']);
  assert.match(text(route('/结果 抽样框', withResults({ ...held, results: [...held.results, frame] })).turn), /只有写进报告的抽样框 1 份/);
  assert.deepEqual(chatContext(null, illuminate(empty), [], { ...held, results: [...held.results, frame] }).results, { registered: 2, simulated: 1, frames: 1, confirmedFindings: 1 });
});

test('a method goes by the name the report gives it, and warnings read as sentences', () => {
  const counted = result('本次样本由哪些人群组成？', 'frequency', { n: 12, total: 12, metrics: [{ label: '有效类别数', value: 2 }], warnings: ['单列分类题。', '未加权、未插补。'] });
  const turn = route('/结果 频数', withResults({ results: [counted], findings: [], pending: false, placed: [] })).turn;
  const rows = turn.cards[0].lines.map(line => line.map(s => s.text).join(''));
  assert.equal(rows[0], '本次样本由哪些人群组成？　频数分析 · 有效样本 12 / 12 · 未写进报告');
  assert.equal(rows[2], '　提醒：单列分类题；未加权、未插补。');
  const odd = route('/结果', withResults({ results: [result('自定义', 'toString')], findings: [], pending: false, placed: [] })).turn;
  assert.equal(odd.cards[0].lines[0].map(s => s.text).join(''), '自定义　toString · 有效样本 212 / 240 · 未写进报告', 'a method without a label keeps its own name');
});

test('a finding whose result changed after it was confirmed is not presented as confirmed', () => {
  const stale = { id: 'f3', title: '通勤越久越不满意', status: 'confirmed', interpretation: '负相关。', evidenceIds: ['通勤时间与满意度'], confirmedHashes: { 通勤时间与满意度: 'an older result' } };
  const view = { ...held, findings: [...held.findings, stale] };
  const turn = route('/结果', withResults(view)).turn;
  assert.deepEqual(turn.cards.at(-1).lines.map(line => line[0].text), ['高年级满意度更低']);
  assert.match(text(turn), /另有 1 条研究发现所依据的结果在确认后变了，需要在报告与 PPT 里重新确认/);
  assert.equal(chatContext(null, illuminate(empty), [], view).results.confirmedFindings, 1);
  const frame = result('城区居民抽样框', 'sampling-frame', { n: 0, total: 0, metrics: [] });
  assert.match(text(route('/结果 抽样设计', withResults({ ...held, results: [frame] })).turn), /抽样框 1 份/, 'a frame is found by the method name it is shown with');
});

test('writing results into the report is offered on a confirmation card that says what goes where', () => {
  const turn = route('/写入', withResults()).turn, card = turn.cards[0];
  assert.match(text(turn), /把 2 项还没写进报告的登记结果按蓝图写入之前，请确认/);
  assert.equal(card.kind, 'confirm');
  const rows = card.lines.map(line => line.map(s => s.text).join(''));
  assert.ok(rows.some(row => /^「描述性统计分析」　/.test(row) && row.includes('各年级满意度') && row.includes('通勤时间与满意度')), rows.join('\n'));
  assert.ok(rows.some(row => /1 项来自教学模拟数据/.test(row)));
  assert.deepEqual(card.confirm.action, { type: 'place', results: ['各年级满意度', '通勤时间与满意度'] });
  assert.deepEqual(route('把结果写进报告', withResults()), route('/写入', withResults()), 'the everyday phrasing');
  assert.deepEqual(toolTurn({ tool: 'place', args: {} }, withResults()), route('/写入', withResults()), 'the model asks; the card still waits for the user');
  const some = route('/写入', withResults({ ...held, placed: ['各年级满意度'] })).turn;
  assert.deepEqual(some.cards[0].confirm.action.results, ['通勤时间与满意度'], 'only what is not yet in the report');
  assert.match(text(route('/写入', withResults({ ...held, placed: ['各年级满意度', '通勤时间与满意度'] })).turn), /都已写进报告/);
  assert.match(text(route('/写入', withResults(null)).turn), /还没有打开报告与 PPT/);
  assert.match(text(route('/写入', withResults({ results: [], findings: [], pending: false, placed: [] })).turn), /还没有登记的结果可写/);
  assert.deepEqual(parseChatReceipt({ id: 'x', status: 'ready', reply: '好', actions: [{ tool: 'place', args: {} }] }).actions, [{ tool: 'place', args: {} }]);
  const listed = route('/结果', withResults({ ...held, placed: ['各年级满意度'] })).turn;
  assert.ok(text({ lines: listed.cards[0].lines }).includes('各年级满意度　卡方检验 · 有效样本 212 / 240 · 已写进报告'));
  assert.equal(listed.chips[0].action.text, '/写入', 'the list recommends writing what is still missing');
});
