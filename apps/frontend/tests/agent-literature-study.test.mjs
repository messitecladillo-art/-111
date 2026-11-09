import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLiteratureStudy, emptyLiteratureStudy, LITERATURE_STUDY_LIMITS, parseLiteratureStudy, suggestLiteratureEvidence,
} from '../lib/agent/literature-study.ts';

// Synthetic texts exercise page alignment and provenance. They are not real findings.
const scope = '高校共享单车服务体验';
const createPaper = (letter, title, entries) => ({
  id: letter.repeat(64),
  title,
  filename: `${letter}.pdf`,
  pageCount: 8,
  pages: entries.map(([page, text]) => ({ page, text })),
});
const A = createPaper('a', '合成材料甲', [
  [3, '研究方法：从两个校区\n  招募参与者。\n结果：候车时间中位数为三分钟。'],
  [5, '局限性：样本来自同一城市。'],
]);
const B = createPaper('b', 'Synthetic paper B', [
  [2, '2 Methods\nWe logged each trip.\n3 Results\nMedian wait was four minutes.\nReferences\nSynthetic citation.'],
]);
const confirmed = (source, id, kind, page, quote) => ({ id, paperId: source.id, page, kind, quote });
const methodA = confirmed(A, '方法甲 #1', 'method', 3, '从两个校区 招募参与者。');
const resultA = confirmed(A, '结果甲', 'result', 3, '候车时间中位数为三分钟。');
const limitA = confirmed(A, '局限甲', 'limitation', 5, '样本来自同一城市。');
const methodB = confirmed(B, 'method B', 'method', 2, 'We logged each trip.');
const resultB = confirmed(B, 'result B', 'result', 2, 'Median wait was four minutes.');
const corpus = () => ({
  papers: [structuredClone(A), structuredClone(B)],
  evidence: structuredClone([methodA, resultA, limitA, methodB, resultB]),
  domain: 'social',
});

test('aligns exact excerpts by physical page and allows whitespace normalization', () => {
  const parsed = parseLiteratureStudy(corpus());
  assert.deepEqual(parsed.evidence[0], methodA);
  assert.notEqual(parsed.papers[0], A);
  assert.throws(() => parseLiteratureStudy({ ...corpus(), evidence: [{ ...methodA, page: 5 }] }), /对应 PDF/);
  assert.throws(() => parseLiteratureStudy({ ...corpus(), evidence: [{ ...methodA, paperId: B.id }] }), /对应 PDF/);
  assert.throws(() => parseLiteratureStudy({ ...corpus(), evidence: [{ ...resultA, quote: '候车时间中位数为五分钟。' }] }), /对应 PDF/);
  assert.throws(() => parseLiteratureStudy({ ...corpus(), evidence: [{ ...methodB, quote: 'we logged each trip.' }] }), /对应 PDF/);
  const blocked = buildLiteratureStudy({ ...corpus(), evidence: [{ ...methodA, page: 5 }] }, scope);
  assert.deepEqual(blocked.candidates, []);
  assert.equal(blocked.stages[0].status, 'blocked');
});

test('suggests actual excerpts from bilingual headings without automatically confirming them', () => {
  const a = suggestLiteratureEvidence(A);
  assert.deepEqual(a.map(item => item.kind), ['method', 'result', 'limitation']);
  assert.deepEqual(suggestLiteratureEvidence(B), [
    { kind: 'method', page: 2, quote: 'We logged each trip.' },
    { kind: 'result', page: 2, quote: 'Median wait was four minutes.' },
  ]);
  const raw = { ...emptyLiteratureStudy(), papers: [A, B] };
  assert.deepEqual(buildLiteratureStudy(raw, scope).candidates, []);
  const approved = a.map((item, i) => ({ ...item, id: `approved ${i}`, paperId: A.id }));
  assert.equal(parseLiteratureStudy({ ...raw, evidence: approved }).evidence.length, 3);
});

test('keeps a partial matrix and blocks missing scope, heading-only evidence and weak cross-paper inputs', () => {
  const partial = { ...corpus(), evidence: [methodA, resultA, methodB] };
  const result = buildLiteratureStudy(partial, scope);
  assert.deepEqual(result.rows[0].cells.method, [methodA]);
  assert.deepEqual(result.rows[0].cells.question, []);
  assert.deepEqual(result.rows[1].cells.result, []);
  assert.deepEqual(result.candidates, []);
  assert.ok(result.issues.some(issue => /至少两篇/.test(issue)));
  assert.deepEqual(result.stages.map(stage => stage.status), ['done', 'done', 'done', 'blocked', 'waiting']);

  const noScope = buildLiteratureStudy(corpus(), ' ！？ ');
  assert.equal(noScope.rows.length, 2);
  assert.deepEqual(noScope.candidates, []);
  assert.equal(noScope.stages[0].status, 'blocked');
  const headings = [methodA, resultA, { ...methodB, quote: 'Methods' }, { ...resultB, quote: 'Results' }];
  const held = buildLiteratureStudy({ ...partial, evidence: headings }, scope);
  assert.deepEqual(held.candidates, []);
  assert.deepEqual(held.rows[1].cells.method, []);
  assert.ok(held.issues.some(issue => /只有标题/.test(issue)));
});

test('builds reproducible proposed designs with resolvable evidence on distinct papers', () => {
  const study = corpus();
  const result = buildLiteratureStudy(study, scope);
  assert.deepEqual(result, buildLiteratureStudy(study, scope));
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ['replicate', 'compare', 'limits']);
  assert.deepEqual(result.stages.map(stage => stage.status), Array(5).fill('done'));
  for (const candidate of result.candidates) {
    const anchors = candidate.evidenceIds.map(id => study.evidence.find(entry => entry.id === id));
    assert.match(candidate.question, new RegExp(scope));
    assert.match(candidate.design, /招募条件、量表及测量时点/);
    assert.ok(candidate.caveat.length > 0);
    assert.equal(new Set(anchors.map(entry => entry.paperId)).size, 2);
    for (const paper of study.papers) {
      assert.ok(anchors.some(entry => entry.paperId === paper.id && entry.kind === 'method'));
      assert.ok(anchors.some(entry => entry.paperId === paper.id && entry.kind === 'result'));
    }
  }
  assert.ok(result.candidates[2].evidenceIds.includes(limitA.id));
  assert.ok(result.candidates[0].question.includes(resultA.quote));
  assert.ok(result.candidates[1].question.includes(resultB.quote));
  assert.ok(result.candidates[2].question.includes(limitA.quote));
  assert.ok(result.candidates[1].design.includes(methodB.quote));
  study.evidence = study.evidence.filter(entry => entry.kind !== 'limitation');
  assert.deepEqual(buildLiteratureStudy(study, scope).candidates.map(candidate => candidate.id), ['replicate', 'compare']);
});

test('retains both PDFs in the matrix but holds cross-paper proposals when their method and result repeat', () => {
  const duplicate = { ...A, id: B.id, filename: B.filename, title: B.title };
  const study = {
    ...corpus(),
    papers: [A, duplicate],
    evidence: [
      methodA, resultA,
      { ...methodA, paperId: duplicate.id, id: methodB.id },
      { ...resultA, paperId: duplicate.id, id: resultB.id },
    ],
  };
  const held = buildLiteratureStudy(study, scope);
  assert.equal(held.rows.length, 2);
  assert.deepEqual(held.candidates, []);
  assert.ok(held.issues.some(issue => /同一研究/.test(issue)));
});

test('rejects unknowns, duplicate identities, sparse arrays and accessors without invoking getters', () => {
  const study = corpus();
  assert.throws(() => parseLiteratureStudy({ ...study, candidates: [] }), /未知字段/);
  assert.throws(() => parseLiteratureStudy({ ...study, executedFor: undefined }), /文本/);
  assert.deepEqual(parseLiteratureStudy({ ...study, executedFor: scope }).executedFor, scope);
  assert.throws(() => parseLiteratureStudy({ ...study, papers: [A, A] }), /指纹重复/);
  assert.throws(() => parseLiteratureStudy({ ...study, evidence: [methodA, { ...resultA, id: methodA.id }] }), /重复/);
  assert.throws(() => parseLiteratureStudy({ ...study, evidence: [methodA, { ...methodA, id: 'retry', kind: 'result' }] }), /重复/);
  assert.throws(() => parseLiteratureStudy({ ...study, papers: [A, { ...B, pages: [B.pages[0], B.pages[0]] }] }), /页码重复/);
  assert.throws(() => parseLiteratureStudy({ ...study, papers: [A, { ...B, pages: Array(1) }] }), /列表/);
  assert.throws(() => parseLiteratureStudy({ ...study, papers: [A, { ...B, pageCount: 1 }] }), /物理页码/);
  const withAccessor = { ...study, get executedFor() { assert.fail('accessor must not run'); } };
  assert.throws(() => parseLiteratureStudy(withAccessor), /访问器/);
  const withArrayAccessor = [A];
  Object.defineProperty(withArrayAccessor, 0, { get() { assert.fail('array accessor must not run'); } });
  assert.throws(() => parseLiteratureStudy({ ...study, papers: withArrayAccessor }), /访问器/);
});

test('enforces item limits and measures the storage budget in UTF-8 bytes', () => {
  const bounds = LITERATURE_STUDY_LIMITS;
  const pageText = '研'.repeat(bounds.pageChars);
  const makeLargePaper = (letter, length) => ({
    ...A,
    id: letter.repeat(64),
    pageCount: bounds.pagesPerPaper + 1,
    pages: Array.from({ length }, (_, index) => ({ page: index + 1, text: pageText })),
  });
  const fit = { ...emptyLiteratureStudy(), papers: [makeLargePaper('a', 29)] };
  assert.ok(new TextEncoder().encode(JSON.stringify(fit)).byteLength < bounds.bytes);
  assert.doesNotThrow(() => parseLiteratureStudy(fit));
  const excess = { ...fit, papers: [makeLargePaper('a', 30)] };
  assert.ok(JSON.stringify(excess).length < bounds.bytes);
  assert.throws(() => parseLiteratureStudy(excess), /700 KiB/);
  assert.throws(() => parseLiteratureStudy({ ...fit, papers: [makeLargePaper('a', bounds.pagesPerPaper + 1)] }), /列表/);
  assert.throws(() => parseLiteratureStudy({ ...fit, papers: Array(bounds.papers + 1).fill(A) }), /列表/);
  assert.throws(() => parseLiteratureStudy({ ...fit, evidence: Array(bounds.evidence + 1).fill(methodA) }), /列表/);
  assert.throws(() => parseLiteratureStudy({
    ...fit, papers: [{ ...A, pages: [{ page: 3, text: `${pageText}字` }] }],
  }), /文本/);
});
