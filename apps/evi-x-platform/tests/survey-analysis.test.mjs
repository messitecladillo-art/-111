import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { analyzeReliability, categoryCounts, describeNumbers, finiteNumber, parseMissingCodes, parseSurveyCsv, profileSurvey, SURVEY_LIMITS } from '../lib/survey-analysis.ts';
const near = (a,b,tolerance=1e-10) => assert.ok(Math.abs(a-b) < tolerance, `${a} differs from ${b}`);
const table = rows => parseSurveyCsv(rows[0].map((_,i)=>`Q${i+1}`).join(',')+'\n'+rows.map(row=>row.map(v=>v??'').join(',')).join('\n'));
const scale = (rows, extras={}) => analyzeReliability(table(rows), { columns: rows[0].map((_,i)=>i), reverse: [], min: 0, max: 100, missingCodes: [], ...extras });

test('CSV preserves quoted separators, line breaks, escaped quotes and raw whitespace',()=>{
  assert.deepEqual(parseSurveyCsv('\uFEFFa,b\r\n"hello, world","one\nline"\r\n"a""b",001').rows,[['hello, world','one\nline'],['a"b','001']]);
  assert.deepEqual(parseSurveyCsv('a,b,c\n1,2,').rows,[['1','2','']]);
  assert.deepEqual(parseSurveyCsv('a,b\n" leading ",001').rows,[[' leading ','001']]);
  assert.deepEqual(parseSurveyCsv('a;b\n1;2',';').rows,[['1','2']]);
  assert.deepEqual(parseSurveyCsv('a\tb\n1\t2','\t').rows,[['1','2']]);
});
test('CSV does not confuse quoted-empty or delimiter-only records with physical blank lines',()=>{
  const one=parseSurveyCsv('a\n""\n'); assert.deepEqual(one.rows,[['']]); assert.equal(one.skippedBlankLines,0);
  const two=parseSurveyCsv('a,b\n,\n\n'); assert.deepEqual(two.rows,[['','']]); assert.equal(two.skippedBlankLines,1);
  assert.deepEqual(parseSurveyCsv('\na\r\n1\r\n').rows,[['1']]);
});
test('CSV fails closed for malformed rows and headers without partial repair',()=>{
  for(const csv of ['a,b\n1','a,b\n1,2,3','a,b\n"unterminated,2','a,b\n"ok"junk,2','a,b\nraw"quote,2','x,x\n1,2','x, x \n1,2','a,\n1,2','a,b','']) assert.throws(()=>parseSurveyCsv(csv));
  assert.deepEqual(parseSurveyCsv('__proto__,constructor,toString\n1,2,3').headers,['__proto__','constructor','toString']);
  assert.throws(()=>parseSurveyCsv('a\n1\u0000'));
  assert.throws(()=>parseSurveyCsv('a\n1','|'));
});
test('CSV bounds are enforced at exact row, column, byte, cell and field limits',()=>{
  assert.equal(parseSurveyCsv('a\n'+'1\n'.repeat(SURVEY_LIMITS.rows)).rows.length,5000);
  assert.throws(()=>parseSurveyCsv('a\n'+'1\n'.repeat(5001)),/5,000/);
  const headers=Array.from({length:80},(_,i)=>`q${i}`).join(',');
  assert.equal(parseSurveyCsv(headers+'\n'+Array(80).fill('1').join(',')).headers.length,80);
  assert.throws(()=>parseSurveyCsv(headers+',extra\n1'),/80/);
  const row=Array(80).fill('1').join(',')+'\n';
  assert.equal(parseSurveyCsv(headers+'\n'+row.repeat(2500)).rows.length,2500);
  assert.throws(()=>parseSurveyCsv(headers+'\n'+row.repeat(2501)),/200,000/);
  assert.equal(parseSurveyCsv('a\n'+'x'.repeat(2000)).rows[0][0].length,2000);
  assert.throws(()=>parseSurveyCsv('a\n'+'x'.repeat(2001)),/2,000/);
  assert.throws(()=>parseSurveyCsv('中'.repeat(700000)),/2 MB/);
});
test('numeric parsing separates zero, missing and invalid without loose coercion',()=>{
  for(const raw of ['', ' ', '1x', 'NaN', 'Infinity', '1e309', '0xff','1,000','12%','1000000000001','1e-324']) assert.equal(finiteNumber(raw),null);
  assert.equal(finiteNumber('0'),0); assert.equal(finiteNumber(' -1.25e2 '),-125); assert.equal(finiteNumber('.5'),.5);
  assert.deepEqual(parseMissingCodes('NA;99;NA; '),['NA','99']);
  assert.throws(()=>parseMissingCodes(Array.from({length:21},(_,i)=>`${i}`).join(';')));
});
test('profiling counts are explicit; duplicates remain; category denominator excludes only configured missing',()=>{
  const input=parseSurveyCsv('值,渠道\n0,A\n,NA\n99,A\n1x,B\n0,A');
  const result=profileSurvey(input,['99','NA']);
  assert.equal(result.rows,5); assert.equal(result.missingCells,3); assert.equal(result.duplicateRows,1);
  assert.deepEqual([result.columns[0].numeric,result.columns[0].nonNumeric,result.columns[0].missing],[2,1,2]);
  assert.equal(result.columns[0].stats.mean,0);
  const counts=categoryCounts(input,1,['NA']); assert.equal(counts.n,4); assert.equal(counts.missing,1); assert.equal(counts.values[0].count,3);
  assert.equal(input.rows.length,5); assert.equal(input.rows[2][0],'99');
});
test('descriptives use sample SD, type7 quartiles and stable centered moments',()=>{
  const x=describeNumbers([1,2,4,8]); near(x.mean,3.75); near(x.sd,Math.sqrt(115/12)); near(x.q1,1.75); near(x.median,3); near(x.q3,5);
  assert.equal(describeNumbers([]),null); assert.equal(describeNumbers([8]).sd,null); assert.equal(describeNumbers([8,8]).sd,0);
  near(describeNumbers([1e9+1,1e9+2,1e9+4,1e9+8]).sd,Math.sqrt(115/12),1e-7);
  assert.equal(describeNumbers([2,10,3]).median,3);
});
test('raw alpha matches independent exact fixtures, including unequal item scales and negatives',()=>{
  near(scale([[1,2,1],[2,2,2],[3,3,4],[4,5,4]]).alpha,62/65);
  near(scale([[1,4],[2,1],[3,3],[4,2]]).alpha,-4/3);
  near(scale([[1,4],[2,2],[3,3],[4,1]]).alpha,-8);
  near(scale([[1,10],[2,20],[3,30],[4,40]]).alpha,40/121);
  assert.ok(scale([[1,4],[2,2],[3,3],[4,1]]).warnings.some(s=>s.includes('负值')));
});
test('item shifts and common scaling preserve alpha and corrected correlations at representable precision',()=>{
  const rows=[[1,2,1],[2,2,2],[3,3,4],[4,5,4]];
  const expected=scale(rows);
  for(const [offset,factor] of [[999990,2**-32],[0,1e-200]]) {
    const transformed=rows.map(row=>row.map(v=>offset+v*factor));
    const actual=scale(transformed,{max:1e6});
    near(actual.alpha,62/65);
    actual.items.forEach((item,i)=>{ near(item.correctedItemTotal,expected.items[i].correctedItemTotal); near(item.alphaIfDeleted,expected.items[i].alphaIfDeleted); });
    assert.ok(!actual.warnings.some(w=>w.includes('零方差')));
    near(actual.items[0].sd/factor,expected.items[0].sd);
  }
  near(describeNumbers([1,2,4,8].map(v=>v*1e-200)).sd/1e-200,Math.sqrt(115/12));
});
test('suspected identifier columns suppress numeric extrema and derived values in profile exports',()=>{
  const result=profileSurvey(parseSurveyCsv('手机号,学号,Q1\n13800138001,20260001,3\n13900139002,20260002,5'));
  assert.equal(result.columns[0].stats,null); assert.equal(result.columns[1].stats,null);
  assert.equal(result.columns[0].numeric,2); assert.equal(result.columns[2].stats.mean,4);
  assert.doesNotMatch(JSON.stringify(result),/13800138001|13900139002|20260001|20260002/);
});
test('constant items are retained; degeneracy is null, never fake zero or one',()=>{
  const kept=scale([[1,2,4],[2,3,4],[3,4,4],[4,5,4]]); near(kept.alpha,.75); assert.equal(kept.k,3); assert.ok(kept.warnings.some(s=>s.includes('零方差'))); assert.equal(kept.items[2].correctedItemTotal,null);
  assert.equal(scale([[1,1],[1,2],[1,3]]).alpha,0);
  assert.equal(scale([[1,5],[2,4],[3,3],[4,2],[5,1]]).alpha,null);
  assert.equal(scale([[1,2,4],[4,1,2]]).alpha,null);
  assert.equal(scale([[1,2,4],[1,3,3],[4,1,2]]).alpha,null);
  assert.equal(scale([[2,2]]).alpha,null);
  const empty=scale([[null,2],[1,null]]); assert.equal(empty.n,0); assert.equal(empty.alpha,null); assert.equal(empty.items[0].mean,null);
});
test('reverse scoring uses declared bounds on one selected-item complete-case set',()=>{
  const input=[[1,5,2],[2,4,2],[3,null,3],[4,2,4],[null,1,5],[5,1,null],[5,1,5]];
  const result=scale(input,{reverse:[1],min:1,max:5}); near(result.alpha,104/105); assert.equal(result.n,4); assert.equal(result.excluded,3);
  assert.equal(input[0][1],5); assert.equal(result.items[1].reversed,true);
  const two=scale([[1,1,null],[2,2,null],[3,3,null]],{columns:[0,1]}); assert.equal(two.n,3); near(two.alpha,1);
});
test('exclusion reasons may overlap but excluded records are counted once',()=>{
  const result=scale([[1,1],[2,2],[null,99],['no',null],[3,3]],{min:1,max:5});
  assert.equal(result.n,3); assert.equal(result.excluded,2); assert.equal(result.missingRows,2); assert.equal(result.nonNumericRows,1); assert.equal(result.outOfRangeRows,1);
  assert.throws(()=>scale([[1,2],[2,3]],{columns:[0,0]}));
  assert.throws(()=>scale([[1,2],[2,3]],{reverse:[9]}));
  assert.throws(()=>scale([[1,2],[2,3]],{min:5,max:1}));
});
test('CSV and reliability calculator keep raw data local; explicit aggregate persistence is separate',async()=>{
  const source=await readFile(new URL('../components/analysis/SurveyLab.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|sendBeacon|localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML/);
  assert.match(source,/schema: "survey-analysis\/v2"/); assert.match(source,/reliability: currentResult \?/);
  assert.match(source,/scope:'raw_file_cell_check'/); assert.match(source,/numericColumnRecords/);
  assert.doesNotMatch(source,/rows: dataset\.table\.rows|rows: table\.rows/);
  assert.match(source,/模拟数据 · 非真实调研/);
});
