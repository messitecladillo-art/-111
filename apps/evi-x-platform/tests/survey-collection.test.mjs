import test from 'node:test';
import assert from 'node:assert/strict';
import { newQuestion, newQuestionnaire } from '../lib/questionnaire.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { collectionEvidenceSection, collectionAnalysisCsv, collectionTransfer, parsePublicSurvey, parseSurveyDataset, parseSurveyList, parseSurveyReceipt, parseSurveyRelease, pruneSurveyDraft, shownSurveyQuestions, transferClassification, validateSurveyDraft } from '../lib/survey-collection.ts';

const id = '01234567-89ab-4def-8123-456789abcdef', projectId = '12345678-9abc-4def-8123-456789abcdef', versionId = '23456789-abcd-4def-8123-456789abcdef';
const date = '2026-10-11T07:30:00Z';
const release = () => ({ id, projectId, versionId, questionnaireRevision: 2, revision: 1, status: 'open', token: 'a'.repeat(43), title: '合成验收调查', classification: 'synthetic', responseCount: 2, responseBytes: 30, limits: { responses: 5000, answerBytes: 2097152 }, createdAt: date, closedAt: null });
const question = (id, type = 'single', patch = {}) => ({ id, text: id, type, required: true, choices: [{ code: '1', label: '是' }, { code: '0', label: '否' }], min: 1, max: 5, minLabel: '低', maxLabel: '高', condition: null, ...patch });
const publicSurvey = (questions = [question('screen'), question('score', 'likert', { condition: { questionId: 'screen', codes: ['1'] } })]) => ({ id, status: 'open', title: '合成调查', introduction: '调查说明', classification: 'synthetic', questions });
const csvRow = row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',');
function dataset() {
  const design = newQuestionnaire(); design.title = release().title;
  design.questions = [{ ...newQuestion('screen', 'SCREEN'), text: '筛选', choices: [{ code: '1', label: '是' }, { code: '0', label: '否' }] }, { ...newQuestion('text', 'TEXT'), text: '补充', type: 'text', required: false, condition: { questionId: 'screen', codes: ['1'] } }];
  const columns = [{ column: '__response_id', questionId: null, kind: 'metadata' }, { column: 'SCREEN', questionId: 'screen', kind: 'answer' }, { column: '__shown_screen', questionId: 'screen', kind: 'visibility' }, { column: 'TEXT', questionId: 'text', kind: 'answer' }, { column: '__shown_text', questionId: 'text', kind: 'visibility' }];
  const csv = [columns.map(c => c.column), ['receipt1', '1', '1', '中文，逗号,引号"与\n换行', '1'], ['receipt2', '0', '1', '', '0']].map(csvRow).join('\r\n');
  return { schema: 'survey-dataset/v1', release: release(), design, rowCount: 2, sha256: 'a'.repeat(64), generatedAt: date, columns, csv, downloadCsv: csv };
}
test('release/list/receipt parsing binds exact identifiers and lifecycle', () => {
  assert.deepEqual(parseSurveyRelease(release()), release());
  assert.equal(parseSurveyList({ surveys: [release()] }).length, 1);
  assert.throws(() => parseSurveyList({ surveys: [release(), release()] }), /重复/);
  assert.throws(() => parseSurveyRelease({ ...release(), token: 'short' }), /链接/);
  assert.throws(() => parseSurveyRelease({ ...release(), status: 'closed' }), /时间/);
  assert.throws(() => parseSurveyRelease({ ...release(), responseCount: 5001 }), /数值/);
  assert.throws(() => parseSurveyRelease({ ...release(), limits: { responses: 5000, answerBytes: 0 } }), /容量/);
  const receipt = { id: versionId, releaseId: id, submittedAt: date, classification: 'synthetic' };
  assert.deepEqual(parseSurveyReceipt(receipt, id), receipt);
  assert.throws(() => parseSurveyReceipt(receipt, projectId), /不属于/);
});
test('public projection rejects unknown research fields, malformed choices, routes and scales', () => {
  assert.equal(parsePublicSurvey(publicSurvey()).questions.length, 2);
  assert.throws(() => parsePublicSurvey({ ...publicSurvey(), objective: 'private' }), /字段/);
  assert.throws(() => parsePublicSurvey(publicSurvey([question('a'), question('a')])), /标识/);
  assert.throws(() => parsePublicSurvey(publicSurvey([question('a', 'likert', { max: 30 })])), /计分点/);
  assert.throws(() => parsePublicSurvey(publicSurvey([question('a', 'single', { condition: { questionId: 'later', codes: ['1'] } })])), /分支/);
  assert.throws(() => parsePublicSurvey(publicSurvey([question('a', 'single', { choices: [{ code: '1', label: '一' }, { code: '1', label: '二' }] })])), /选项/);
});
test('changing a parent prunes all hidden descendants and required only applies to shown questions', () => {
  const questions = [question('a'), question('b', 'single', { condition: { questionId: 'a', codes: ['1'] } }), question('c', 'text', { condition: { questionId: 'b', codes: ['1'] } })];
  assert.deepEqual(shownSurveyQuestions(questions, { a: '1', b: '1' }).map(q => q.id), ['a', 'b', 'c']);
  assert.deepEqual(pruneSurveyDraft(questions, { a: '0', b: '1', c: 'old', unknown: 'x' }), { a: '0' });
  assert.deepEqual(validateSurveyDraft(questions, { a: '0', b: '1', c: 'old' }), { answers: { a: '0' }, errors: {} });
  assert.deepEqual(Object.keys(validateSurveyDraft(questions, { a: '1' }).errors), ['b']);
});
test('answer validation preserves zero, raw text, stable multi codes and empty optional cells', () => {
  const questions = [question('n', 'number', { min: 0, max: 10 }), question('m', 'multi'), question('t', 'text', { required: false }), question('l', 'likert')];
  assert.deepEqual(validateSurveyDraft(questions, { n: '0', m: ['0', '1'], t: '  =x\n🙂  ', l: '4' }), { answers: { n: 0, m: ['1', '0'], t: '  =x\n🙂  ', l: 4 }, errors: {} });
  const bad = validateSurveyDraft(questions, { n: 'Infinity', m: ['1', '1'], t: '🙂'.repeat(1001), l: '4.5' });
  assert.deepEqual(Object.keys(bad.errors), ['n', 'm', 't', 'l']);
  assert.equal(validateSurveyDraft([question('m', 'multi', { required: false })], { m: [] }).answers.m, undefined);
  assert.ok(validateSurveyDraft([question('n', 'number')], { n: '0x2' }).errors.n);
});
test('dataset parser binds project/release/versioned design and refuses duplicate variable mapping', () => {
  const value = dataset(); assert.deepEqual(parseSurveyDataset(value, projectId, id), value);
  assert.throws(() => parseSurveyDataset(value, versionId, id), /不属于/);
  assert.throws(() => parseSurveyDataset({ ...value, rowCount: 1 }, projectId, id), /数量/);
  assert.throws(() => parseSurveyDataset({ ...value, columns: [...value.columns, value.columns[1]] }, projectId, id), /未对齐/);
  assert.throws(() => parseSurveyDataset({ ...value, sha256: 'g'.repeat(64) }, projectId, id), /指纹/);
});
test('analysis projection drops bookkeeping only and roundtrips quotes/newlines/Chinese and hidden blanks', () => {
  const value = dataset(), csv = collectionAnalysisCsv(value), table = parseSurveyCsv(csv);
  assert.deepEqual(table.headers, ['SCREEN', 'TEXT']);
  assert.deepEqual(table.rows, [['1', '中文，逗号,引号"与\n换行'], ['0', '']]);
  assert.equal(value.csv.includes('__shown_text'), true);
  assert.throws(() => collectionAnalysisCsv({ ...value, csv: value.csv.replace('"TEXT"', '"OTHER"') }), /不一致/);
  assert.throws(() => collectionAnalysisCsv({ ...value, csv: value.csv + '\r\n' + csvRow(['extra', 0, 1, '', 0]) }), /数量/);
  assert.throws(() => collectionAnalysisCsv({ ...value, rowCount: 0 }), /没有答卷/);
});
test('collection handoffs retain exact release provenance and cannot become silicon simulations', () => {
  const synthetic = collectionTransfer(dataset(), 'request');
  assert.deepEqual(transferClassification(synthetic), { simulated: true, silicon: false });
  assert.equal(synthetic.origin.versionId, versionId); assert.equal(synthetic.origin.snapshotHash, 'a'.repeat(64)); assert.equal(synthetic.origin.questionnaireRevision, 2);
  const actual = collectionTransfer({ ...dataset(), release: { ...release(), classification: 'actual' } }, 'request2');
  assert.deepEqual(transferClassification(actual), { simulated: false, silicon: false });
  assert.deepEqual(transferClassification({ id: 'legacy', name: '硅基', csv: 'x' }), { simulated: true, silicon: true });
});
test('wide source metadata projects to 80 answer columns but rejects analyzer cell overflow', () => {
  const value = dataset();
  value.design.questions = Array.from({ length: 80 }, (_, n) => ({ ...newQuestion(`q${n}`, `Q${n}`), type: 'number' }));
  value.columns = value.design.questions.flatMap(q => [{ column: q.variable, questionId: q.id, kind: 'answer' }, { column: `__shown_${q.id}`, questionId: q.id, kind: 'visibility' }]);
  value.csv = [value.columns.map(c => c.column), value.columns.map(() => '1'), value.columns.map(() => '2')].map(csvRow).join('\r\n');
  const table = parseSurveyCsv(collectionAnalysisCsv(value)); assert.equal(table.headers.length, 80); assert.equal(table.rows[1][79], '2');
  assert.throws(() => collectionAnalysisCsv({ ...value, rowCount: 5000 }), /200,000/);
});


test('unused choices do not invalidate text or numeric forms; tiny nonzero input never becomes zero', () => {
  for (const type of ['text','number','likert']) {
    const q=question('q',type,{choices:[{code:'',label:''},{code:'',label:''}]});
    assert.equal(parsePublicSurvey(publicSurvey([q])).questions[0].type,type);
  }
  const q=question('n','number',{min:null,max:null});
  assert.ok(validateSurveyDraft([q],{n:'1e-999'}).errors.n);
  assert.ok(validateSurveyDraft([q],{n:'-1e-999'}).errors.n);
  assert.equal(validateSurveyDraft([q],{n:'0e-999'}).answers.n,0);
});

test('hosted evidence keeps exact values and records its frozen version without local-only source claims', () => {
  const origin=collectionTransfer(dataset()).origin;
  const section={id:'evidence-test',title:'统计',body:'【合成验收】\n类别 1：18 / 30，占有效样本的 60.00%。\n核验边界：旧本地说明\n问卷关联：旧本地说明',source:'输入指纹'};
  const actual=collectionEvidenceSection(section,origin);
  assert.ok(actual.body.includes('18 / 30'));
  assert.ok(actual.body.includes('发布 v2'));
  assert.ok(!actual.body.includes('旧本地说明'));
  assert.ok(actual.source.includes(origin.snapshotHash));
  assert.ok(actual.source.includes('服务器尚未独立复算'));
  assert.ok(section.body.includes('旧本地说明'));
});
