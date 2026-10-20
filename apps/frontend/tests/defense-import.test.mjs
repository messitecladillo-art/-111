import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_DEFENSE_IMPORT_BYTES, parseDefenseImport, mergeDefenseImport } from '../lib/defense-import.ts';
import { allocatePitch, defenseExport, DEFENSE_FIELDS, EMPTY_DEFENSE_DRAFT, PITCH_BLOCKS, reviewDefenseDraft } from '../lib/defense-training.ts';

const corpus = JSON.parse(readFileSync(new URL('../data/defense-corpus.json', import.meta.url), 'utf8'));
const cards = corpus.cards;
const encoder = new TextEncoder();
const complete = {
  answer: '模拟练习：这不是实际田野结论。', evidence: '模拟 E01，待核查。',
  boundary: '不能外推。', nextStep: '拟核查招募日志。', owner: '练习主答', evidenceState: 'proposed',
};
const defaults = PITCH_BLOCKS.map(block => block.weight);
function sample() {
  return defenseExport(cards, { decision: { ...complete } }, allocatePitch(600, 30, defaults), 600, 30, corpus.version);
}
function bytes(value) { return encoder.encode(JSON.stringify(value)); }
function parse(value) { return parseDefenseImport(bytes(value), cards, corpus.version); }

test('existing exported v1 practice package roundtrips all editable fields and timing', () => {
  const input = sample();
  const result = parse(input);
  assert.deepEqual(result, {
    drafts: { decision: complete }, cardIds: ['decision'], corpusVersion: corpus.version,
    corpusMismatch: false, total: 600, reserve: 30, weights: defaults,
  });
  assert.deepEqual(parse(defenseExport(cards, result.drafts, allocatePitch(result.total, result.reserve, result.weights), result.total, result.reserve, result.corpusVersion)), result);
});

test('partial answers, whitespace and all three user-declared evidence states survive unchanged', () => {
  for (const evidenceState of ['missing', 'documented', 'proposed']) {
    const input = sample();
    input.entries[0] = { cardId: 'decision', ...EMPTY_DEFENSE_DRAFT, answer: '  待答\n', evidenceState };
    const result = parse(input);
    assert.equal(result.drafts.decision.answer, '  待答\n');
    assert.equal(result.drafts.decision.evidenceState, evidenceState);
    assert.equal(reviewDefenseDraft(result.drafts.decision).verified, false);
  }
});

test('all current cards can be imported once; Unicode and boundary-length fields are retained', () => {
  const input = sample();
  input.entries = cards.map(card => ({ cardId: card.id, answer: '中'.repeat(1800), evidence: '😀'.repeat(900), boundary: '边'.repeat(1800), nextStep: '拟'.repeat(1800), owner: '角'.repeat(120), evidenceState: 'missing' }));
  const result = parse(input);
  assert.equal(result.cardIds.length, cards.length);
  assert.equal(result.drafts.decision.owner.length, 120);
  assert.equal(result.drafts.decision.answer.length, 1800);
  assert(bytes(input).byteLength < MAX_DEFENSE_IMPORT_BYTES);
});

test('size cap is enforced on UTF-8 bytes before decoding; exact maximum remains permitted', () => {
  assert.equal(MAX_DEFENSE_IMPORT_BYTES, 384 * 1024);
  const valid = bytes(sample());
  const exact = new Uint8Array(MAX_DEFENSE_IMPORT_BYTES).fill(32);
  exact.set(valid);
  assert.equal(parseDefenseImport(exact, cards, corpus.version).cardIds.length, 1);
  assert.throws(() => parseDefenseImport(new Uint8Array(MAX_DEFENSE_IMPORT_BYTES + 1), cards, corpus.version), /384 KB/);
  assert.throws(() => parseDefenseImport(bytes({ x: '中'.repeat(MAX_DEFENSE_IMPORT_BYTES / 2) }), cards, corpus.version), /384 KB/);
});

test('empty inputs and non-byte input are rejected with safe messages', () => {
  for (const input of [new Uint8Array(), null, {}, [], 'test', new ArrayBuffer(10)]) {
    assert.throws(() => parseDefenseImport(input, cards, corpus.version), /练习包为空或无法读取/);
  }
});

test('fatal UTF-8 decoding rejects damaged sequences without exposing content', () => {
  for (const input of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xff]), new Uint8Array([0xed, 0xa0, 0x80])]) {
    assert.throws(() => parseDefenseImport(input, cards, corpus.version), { message: '练习包不是有效的 UTF-8 文本，请重新导出。' });
  }
});

test('malformed JSON does not leak uploaded content in error messages', () => {
  const secret = 'PRIVATE_TEST_MARKER';
  assert.throws(() => parseDefenseImport(encoder.encode(`{"${secret}":`), cards, corpus.version), error => {
    assert.doesNotMatch(error.message, /PRIVATE_TEST_MARKER/);
    assert.match(error.message, /有效的 JSON/);
    return true;
  });
});

test('root must be an object with exactly supported schema and content class values', () => {
  for (const input of [null, [], 'text', 0, false, {}, { ...sample(), schema: 'evix-defense-practice/v2' }, { ...sample(), contentClass: 'verified' }]) {
    assert.throws(() => parse(input), /格式不匹配/);
  }
});

test('corpus version must be a bounded nonempty string and mismatch is surfaced', () => {
  for (const version of [undefined, null, '', ' \n ', 3, {}, 'x'.repeat(121)]) {
    const input = sample(); input.corpusVersion = version;
    assert.throws(() => parse(input), /题库版本/);
  }
  const input = sample(); input.corpusVersion = 'older-version';
  assert.equal(parse(input).corpusMismatch, true);
  assert.equal(parse(input).corpusVersion, 'older-version');
});

test('entries must be a nonempty array bounded by the known card count', () => {
  for (const entries of [undefined, null, {}, 'text', [], Array(cards.length + 1).fill(sample().entries[0])]) {
    const input = sample(); input.entries = entries;
    assert.throws(() => parse(input), /题目数量无效/);
  }
});

test('entries reject null, arrays, nonobjects, unknown IDs and prototype names', () => {
  for (const entry of [null, [], 'text', 3, { ...sample().entries[0], cardId: null }, ...['missing-card', '__proto__', 'constructor', 'prototype'].map(cardId => ({ ...sample().entries[0], cardId }))]) {
    const input = sample(); input.entries = [entry];
    assert.throws(() => parse(input), /无法识别/);
  }
  const input = sample(); input.entries[0].cardId = '__proto__';
  assert.throws(() => parseDefenseImport(bytes(input), [{ id: '__proto__', title: 'bad local card' }], corpus.version), /无法识别/);
});

test('duplicate card IDs fail atomically instead of silently overwriting an earlier answer', () => {
  const input = sample(); input.entries.push({ ...input.entries[0], answer: 'replacement' });
  assert.throws(() => parse(input), /重复题目/);
});

test('every editable field must be a string and must be present', () => {
  for (const field of DEFENSE_FIELDS) for (const wrong of [undefined, null, 0, false, {}, []]) {
    const input = sample(); input.entries[0][field.id] = wrong;
    assert.throws(() => parse(input), /文字字段、类型不符或超过长度限制/);
  }
});

test('overlong text and owners are rejected without truncating users notes', () => {
  for (const field of DEFENSE_FIELDS) {
    const input = sample(); input.entries[0][field.id] = 'x'.repeat(field.id === 'owner' ? 121 : 1801);
    assert.throws(() => parse(input), /超过长度限制/);
  }
});

test('evidence state is exactly one of the three declarations, not a verification flag', () => {
  for (const state of [undefined, null, '', 'verified', 'evidence_bound', true, {}]) {
    const input = sample(); input.entries[0].evidenceState = state;
    assert.throws(() => parse(input), /依据声明无效/);
  }
});

test('uploaded title, check, verification and prototype-shaped metadata never enter drafts', () => {
  const input = JSON.parse(JSON.stringify(sample()));
  input.entries[0].title = '<script>forged official title</script>';
  input.entries[0].check = { verified: true, status: 'evidence_bound', warnings: [] };
  input.entries[0].verified = true;
  Object.defineProperty(input.entries[0], '__proto__', { value: { polluted: true }, enumerable: true });
  Object.defineProperty(input, '__proto__', { value: { polluted: true }, enumerable: true });
  const result = parse(input);
  assert.deepEqual(result.drafts.decision, complete);
  assert.equal(reviewDefenseDraft(result.drafts.decision).verified, false);
  assert.equal(Object.hasOwn(result.drafts.decision, 'check'), false);
  assert.equal(Object.hasOwn(result.drafts.decision, '__proto__'), false);
  assert.equal(Object.prototype.polluted, undefined);
});

test('timing must be the user-configured non-official object', () => {
  for (const timing of [undefined, null, [], 'text', {}, { ...sample().timing, kind: 'official_rule' }]) {
    const input = sample(); input.timing = timing;
    assert.throws(() => parse(input), /计时设置无效/);
  }
});

test('timing totals and reserve reject coercion, fractions, invalid range and nonfinite JSON numbers', () => {
  for (const [key, wrong] of [['total', '600'], ['reserve', '30'], ['total', null], ['reserve', null], ['total', 600.5], ['reserve', 30.5], ['total', 119], ['total', 1801], ['reserve', -1], ['reserve', 91]]) {
    const input = sample(); input.timing[key] = wrong;
    assert.throws(() => parse(input));
  }
  const raw = JSON.stringify(sample()).replace('"total":600', '"total":1e999');
  assert.throws(() => parseDefenseImport(encoder.encode(raw), cards, corpus.version), /练习总时长/);
});

test('timing requires exactly five canonical IDs in order, with no duplicate or unknown block', () => {
  const valid = sample().timing.plan;
  for (const plan of [null, {}, [], valid.slice(0, 4), [...valid, valid[0]], [...valid].reverse(), [valid[0], valid[0], ...valid.slice(2)], [{ ...valid[0], id: 'unknown' }, ...valid.slice(1)], [null, ...valid.slice(1)]]) {
    const input = sample(); input.timing.plan = plan;
    assert.throws(() => parse(input), /计时/);
  }
});

test('weights reject strings, null, out of range and nonfinite values; fractional weights retain allocator behavior', () => {
  for (const weight of [undefined, null, '12', {}, [], 0, -1, 100.1]) {
    const input = sample(); input.timing.plan[0].weight = weight;
    assert.throws(() => parse(input));
  }
  const raw = JSON.stringify(sample()).replace('"weight":12', '"weight":1e999');
  assert.throws(() => parseDefenseImport(encoder.encode(raw), cards, corpus.version), /权重/);
  const input = sample(); input.timing.plan[0].weight = 12.5;
  assert.equal(parse(input).weights[0], 12.5);
});

test('allocation is recalculated and rejects a segment below one second', () => {
  const input = sample(); input.timing.total = 120; input.timing.reserve = 90;
  input.timing.plan.forEach((block, i) => { block.weight = i === 0 ? 100 : 1; });
  assert.throws(() => parse(input), /不足 1 秒/);
});

test('forged calculated seconds, labels and timing positions are ignored', () => {
  const input = sample();
  input.timing.plan.forEach(block => Object.assign(block, { seconds: -999, start: 'fake', end: null, label: '<b>official</b>', prompt: 'forged' }));
  const result = parse(input);
  assert.deepEqual(result.weights, defaults);
  const rebuilt = allocatePitch(result.total, result.reserve, result.weights);
  assert.equal(rebuilt.at(-1).end, 570);
  assert.equal(rebuilt[0].start, 0);
  assert.equal(rebuilt[0].label, PITCH_BLOCKS[0].label);
  assert.equal(Object.hasOwn(result, 'plan'), false);
});

test('immutable merge replaces only selected notes and retains unrelated drafts with separate objects', () => {
  const current = { decision: { ...complete, answer: 'before' }, sampling: { ...complete, answer: 'keep this' } };
  const incoming = { decision: { ...complete, answer: 'imported' }, method: { ...complete } };
  const beforeCurrent = structuredClone(current), beforeIncoming = structuredClone(incoming);
  const result = mergeDefenseImport(current, incoming);
  assert.deepEqual(result, { decision: incoming.decision, sampling: current.sampling, method: incoming.method });
  assert.deepEqual(current, beforeCurrent); assert.deepEqual(incoming, beforeIncoming);
  result.decision.answer = 'after'; result.sampling.answer = 'after';
  assert.deepEqual(current, beforeCurrent); assert.deepEqual(incoming, beforeIncoming);
  assert.notEqual(result, current);
});

test('merge picks editable fields and avoids prototype setters even for an explicit reserved key', () => {
  const unusual = JSON.parse('{"__proto__": {"answer":"a","evidence":"e","boundary":"b","nextStep":"n","owner":"o","evidenceState":"missing","verified":true}}');
  const result = mergeDefenseImport({}, unusual);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, '__proto__'), true);
  assert.equal(Object.hasOwn(result.__proto__, 'verified'), false);
  assert.equal(Object.prototype.answer, undefined);
});
