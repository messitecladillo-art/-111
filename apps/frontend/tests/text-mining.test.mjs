import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FUNCTION_WORDS, NO_SEGMENTER, answered, cooccurrence, distinctiveTerms, termTable, terms } from '../lib/text-mining.ts';

// Teaching-simulation open answers written for this test; no respondents.
const answers = [
  '开放时间太短，希望增加夜间照明。',
  '希望增加停车位，晚上照明不够。',
  '场地太少，开放时间也短。',
  '器材老化，希望及时维修器材。',
  '停车位不够，周末人太多。',
  '无',
  '',
  '夜间照明不足，开放时间希望延长。',
  '不知道。',
  '器材维修不及时。',
];

test('segmentation keeps content words and drops function words, numbers and single characters', () => {
  assert.deepEqual(terms('社区体育设施开放时间太短，希望增加夜间照明和停车位。'), ['社区', '体育', '设施', '开放', '时间', '太短', '希望', '增加', '夜间', '照明', '停车位']);
  assert.deepEqual(terms('我们觉得每周 3 次比较合适'), ['每周', '合适']);
  assert.ok(FUNCTION_WORDS.has('我们') && !FUNCTION_WORDS.has('希望'), 'requests such as 希望 stay');
  assert.deepEqual(terms('Ｗｉｆｉ 信号差'), ['wifi', '信号'], 'full-width letters are normalised; 差 alone is a single character');
});

test('non-answers do not count towards mention rates', () => {
  assert.deepEqual(answered(['无', ' 没有。', '', '不知道', 'N/A', 'Ｎ／Ａ', '－', 'N.A.', 'N / A', '...', '???', '没有任何问题', '暂无建议。', '无明显问题', '未发现问题', '照明不足']), ['照明不足'], 'full-width, dotted, spaced and punctuation-only markers too');
});

test('the term table counts answers that mention a term, most-mentioned first', () => {
  const table = termTable(answers);
  assert.ok(!('refused' in table));
  assert.equal(table.n, 7, 'three non-answers left out');
  const row = term => table.rows.find(r => r.term === term);
  assert.deepEqual(row('照明'), { term: '照明', count: 3, answers: 3, share: 3 / 7 });
  assert.deepEqual(row('器材'), { term: '器材', count: 3, answers: 2, share: 2 / 7 }, 'twice in one answer counts once among answers');
  assert.equal(table.rows[0].term, '希望', 'most answers mention it');
  const order = table.rows.map(r => [r.answers, r.count]);
  assert.ok(order.every((v, i) => i === 0 || order[i - 1][0] > v[0] || (order[i - 1][0] === v[0] && order[i - 1][1] >= v[1])), 'sorted by answers, then count');
  assert.equal(termTable(answers, { top: 3 }).rows.length, 3);
  assert.deepEqual(termTable(answers, { drop: new Set([...FUNCTION_WORDS, '希望']) }).rows.some(r => r.term === '希望'), false, 'the author can drop more words');
});

test('it refuses when there is too little to count', () => {
  assert.deepEqual(termTable(['无', '', '不知道']), { refused: 'no-answers' });
  assert.deepEqual(termTable(['照明不足', '停车难']), { refused: 'too-few-answers' });
  assert.deepEqual(termTable(['好', '行', '对', '嗯', '是']), { refused: 'no-terms' });
});

test('distinctive terms are what one group says and the others do not', () => {
  const groups = distinctiveTerms([
    { name: '低年级', answers: ['希望增加夜间照明', '夜间照明不足', '希望延长开放时间'] },
    { name: '高年级', answers: ['希望增加停车位', '停车位不够', '希望延长开放时间'] },
  ]);
  assert.deepEqual(groups.map(g => g.name), ['低年级', '高年级']);
  assert.equal(groups[0].terms[0].term, '夜间');
  assert.ok(groups[0].terms.some(t => t.term === '照明') && !groups[0].terms.some(t => ['希望', '开放', '时间'].includes(t.term)), 'shared words score zero');
  assert.equal(groups[1].terms[0].term, '停车位');
  const top = groups[0].terms[0];
  // tf = 2 of the group's 11 words; idf = ln(2 / 1).
  assert.ok(Math.abs(top.tfidf - (2 / 11) * Math.log(2)) < 1e-12 && top.answers === 2);
});

test('co-occurrence counts answers that mention both terms', () => {
  const pairs = cooccurrence(answers, ['希望', '照明', '开放', '时间', '器材', '停车位']);
  assert.deepEqual(pairs.find(p => p.a === '开放' && p.b === '时间'), { a: '开放', b: '时间', answers: 3 });
  assert.deepEqual(pairs.find(p => p.a === '希望' && p.b === '照明'), { a: '希望', b: '照明', answers: 3 });
  assert.ok(pairs.every(p => p.answers >= 2), 'pairs seen once are left out by default');
  assert.ok(!pairs.some(p => p.a === '器材' && p.b === '器材'), 'a word repeated in one answer is not a pair');
});

test('without a word segmenter the counts are refused in plain words, never approximated', () => {
  const original = Intl.Segmenter;
  try {
    delete Intl.Segmenter;
    assert.deepEqual(termTable(answers), { refused: 'no-segmenter' });
    assert.deepEqual(distinctiveTerms([{ name: 'a', answers }]), { refused: 'no-segmenter' });
    assert.deepEqual(cooccurrence(answers, ['照明']), { refused: 'no-segmenter' });
    assert.throws(() => terms('照明不足'), new RegExp(NO_SEGMENTER.slice(0, 8)));
  } finally { Intl.Segmenter = original; }
  assert.ok(!('refused' in termTable(answers)), 'restored');
});

test('a negated word is counted as negated, never as its opposite', () => {
  assert.deepEqual(terms('不满意'), ['不满意']);
  assert.deepEqual(terms('不方便，没有照明'), ['不方便', '没有照明']);
  assert.deepEqual(terms('不太方便'), ['不太方便']);
  assert.deepEqual(terms('器材不够用'), ['器材', '不够用']);
  assert.deepEqual(terms('服务不好'), ['服务', '不好'], 'a negated single character is a term');
  assert.deepEqual(terms('不觉得方便'), ['不方便'], 'a negated function word is no term; the negation reaches the content word');
  assert.deepEqual(terms('不可以'), [], 'nothing left to negate');
  assert.deepEqual(terms('不可以停车'), ['不停车']);
  assert.deepEqual(terms('没有在这里停车'), ['这里', '停车'], 'a preposition ends the negation: no 没有这里');
  assert.deepEqual(terms('不能在这里停车'), ['这里', '停车']);
  assert.deepEqual(terms('照明不错，没有任何问题'), ['照明', '不错', '没有任何问题'], 'the 问题 of 没有任何问题 is no problem raised');
  assert.deepEqual(terms('未发现问题'), ['未发现问题']);
  assert.deepEqual(terms('没有什么意见'), ['没有什么意见']);
  assert.deepEqual(terms('停车位不够'), ['停车位', '不够'], 'a negator ending the answer is the complaint');
  assert.deepEqual(terms('时间不够，人太多'), ['时间', '不够', '太多'], 'or ending a clause');
  assert.deepEqual(terms('希望增加，不。'), ['希望', '增加'], 'a negator before punctuation negates nothing counted');
  const table = termTable(['满意', '不满意', '不满意', '很满意', '不满意']);
  assert.deepEqual(table.rows.map(r => [r.term, r.answers]), [['不满意', 3], ['满意', 2]]);
});

test('a group with nothing to say is left out of the comparison, and one group alone is no comparison', () => {
  const groups = distinctiveTerms([
    { name: '低年级', answers: ['希望增加夜间照明', '夜间照明不足'] },
    { name: '高年级', answers: ['希望增加停车位', '停车位不够'] },
    { name: '研究生', answers: ['无', '不知道'] },
  ]);
  assert.deepEqual(groups[2], { name: '研究生', n: 0, terms: [] });
  assert.ok(!groups[0].terms.some(t => ['希望', '增加'].includes(t.term)), 'words both answering groups use still score zero');
  assert.deepEqual(distinctiveTerms([{ name: 'a', answers: ['夜间照明不足'] }, { name: 'b', answers: ['无'] }]), { refused: 'too-few-groups' });
});
