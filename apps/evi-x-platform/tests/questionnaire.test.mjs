import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DESIGN_LIMITS, newQuestion, newQuestionnaire, exampleQuestionnaire, parseBoundDraft, parseQuestionnaire, questionDirectory, questionIsMapped, questionnaireIssues, visibleQuestionIds, routeDependencies, nextVariable, questionnaireText, designDictionary } from '../lib/questionnaire.ts';
const roundtrip = d => parseQuestionnaire(JSON.stringify(d, null, 2));
const codes = d => questionnaireIssues(d).map(i=>i.code);
const mutate = fn => { const d=exampleQuestionnaire(); fn(d); return d; };

test('directory search is literal, case insensitive, conjunctive and retains original numbering',()=>{
  const d=exampleQuestionnaire();
  Object.assign(d.questions[1],{variable:'SAT_02',construct:'服务 体验',text:'体验评价 [a+b]'});
  assert.deepEqual(questionDirectory(d,'sat_02 体验').map(x=>x.number),[2]);
  assert.deepEqual(questionDirectory(d,'[a+b]').map(x=>x.question.id),[d.questions[1].id]);
  assert.deepEqual(questionDirectory(d,'^.*$'),[]);
  assert.equal(questionDirectory(d,'   ').length,3);
});

test('directory filters combine with search without altering drafts, IDs or route semantics',()=>{
  const d=exampleQuestionnaire(); d.questions[1].text='';
  const before=JSON.stringify(d), routeBefore=visibleQuestionIds(d,{'demo-screen':'1'});
  assert.deepEqual(questionDirectory(d,'','blocker').map(x=>x.number),[2]);
  assert.deepEqual(questionDirectory(d,'','conditional').map(x=>x.number),[2,3]);
  assert.deepEqual(questionDirectory(d,'USED','conditional'),[]);
  assert.equal(JSON.stringify(d),before);
  assert.deepEqual(visibleQuestionIds(d,{'demo-screen':'1'}),routeBefore);
  assert.equal(questionDirectory(d)[1].question,d.questions[1]);
});

test('unapplied numeric drafts have a distinct view status even without semantic blockers',()=>{
  const d=exampleQuestionnaire(), id=d.questions[1].id;
  const rows=questionDirectory(d,'','pending',[id,id,'removed-question']);
  assert.equal(rows.length,1); assert.equal(rows[0].number,2);
  assert.equal(rows[0].pending,true); assert.equal(rows[0].blockers,0);
  assert.equal(questionDirectory(d,'','blocker',[id]).length,0);
  assert.deepEqual(questionDirectory(d,'','pending',[]),[]);
});

test('mapping filter shares existing research and screening semantics without awarding quality scores',()=>{
  const d=exampleQuestionnaire();
  assert.ok(d.questions.every(questionIsMapped));
  d.questions[1].decisionUse=' ';
  assert.deepEqual(questionDirectory(d,'','unmapped').map(x=>x.number),[2]);
  assert.equal(questionIsMapped({...d.questions[0],analysis:'undecided'}),false);
  assert.equal(questionIsMapped({...d.questions[0],purpose:'research',researchQuestion:''}),false);
  assert.equal(questionIsMapped(d.questions[0]),true);
});

test('directory handles empty designs and maximum capacity without renumbering matches',()=>{
  const d=newQuestionnaire();d.questions=[];
  assert.deepEqual(questionDirectory(d),[]);
  d.questions=Array.from({length:80},(_,i)=>newQuestion(`item${i}`,`Q${i+1}`));
  assert.equal(questionDirectory(d).length,80);
  assert.deepEqual(questionDirectory(d,'Q80').map(x=>x.number),[80]);
  assert.equal(questionDirectory(d,'','blocker').length,80);
});

test('new and example designs are explicitly proposed and preserve exact backups',()=>{
  for(const d of [newQuestionnaire(),exampleQuestionnaire()]) assert.deepEqual(roundtrip(d),d);
  const d=exampleQuestionnaire(); assert.equal(d.classification,'proposed');
  assert.equal(questionnaireIssues(d).filter(i=>i.level==='blocker').length,0);
  assert.ok(codes(d).includes('pilot_missing'));
  assert.match(d.questions[1].source,/自编.*尚未经/);
  assert.deepEqual(parseQuestionnaire('\uFEFF'+JSON.stringify(d)),d);
});

test('strict import rejects alien schemas, types, fields and object pollution',()=>{
  for(const raw of ['', '{', 'null', '[]', '1', JSON.stringify({__proto__:null})]) assert.throws(()=>parseQuestionnaire(raw));
  for(const fn of [d=>delete d.title,d=>d.extra=true,d=>d.schema='questionnaire-codebook/v1',d=>d.classification='actual',d=>d.questions={},d=>d.questions[0].required='false',d=>d.questions[0].reverse=1,d=>d.questions[0].type='html',d=>d.questions[0].analysis='automatic',d=>d.questions[0].min='0',d=>d.questions[0].max=1e10,d=>d.questions[0].choices[0].extra='x',d=>d.questions[0].condition={questionId:'x',codes:['1'],evil:true},d=>d.questions[0].id='',d=>d.questions.push({...d.questions[0]})]) assert.throws(()=>roundtrip(mutate(fn)));
  const raw=JSON.stringify(exampleQuestionnaire()).replace('"schema":','"__proto__":{"polluted":true},"schema":');
  assert.throws(()=>parseQuestionnaire(raw)); assert.equal({}.polluted,undefined);
});

test('bounded imports check UTF-8 bytes, formatted backups, fields and collections',()=>{
  assert.throws(()=>parseQuestionnaire(' '.repeat(DESIGN_LIMITS.bytes+1)),/300/);
  for(const fn of [d=>d.title='中'.repeat(161),d=>d.questions[0].text='x'.repeat(601),d=>d.questions[0].choices=Array.from({length:31},()=>({code:'1',label:'a'})),d=>d.questions=Array.from({length:81},(_,i)=>newQuestion(`id${i}`,`Q${i}`)),d=>d.questions[0].text='x\u0000',d=>d.questions[1].condition.codes=Array(31).fill('1')]) assert.throws(()=>roundtrip(mutate(fn)));
  const empty=exampleQuestionnaire(); empty.questions=[]; assert.deepEqual(roundtrip(empty),empty); assert.ok(codes(empty).includes('empty'));
  const many=exampleQuestionnaire(); many.questions=Array.from({length:80},(_,i)=>newQuestion(`id${i}`,`Q${i}`));
  assert.deepEqual(roundtrip(many),many);
  let found=false;
  for(let n=10;n<100;n++) {
    many.questions.forEach(q=>q.choices=Array.from({length:30},(_,i)=>({code:String(i),label:'x'.repeat(n)})));
    const compact=JSON.stringify(many),pretty=JSON.stringify(many,null,2);
    if(Buffer.byteLength(compact)<=DESIGN_LIMITS.bytes && Buffer.byteLength(pretty)>DESIGN_LIMITS.bytes) { assert.throws(()=>parseQuestionnaire(compact),/格式化/); found=true; break; }
  }
  assert.ok(found,'constructed compact-under/pretty-over boundary');
});

test('duplicate JSON members including escaped names are rejected at every object depth',()=>{
  const raw=JSON.stringify(exampleQuestionnaire());
  for(const [before,after] of [['"title":','"title":"lost","title":'],['"title":','"\\u0074itle":"lost","title":'],['"text":','"text":"lost","text":'],['"code":','"code":"lost","code":'],['"codes":','"codes":["0"],"codes":']]) assert.throws(()=>parseQuestionnaire(raw.replace(before,after)),/重复字段/);
  const d=mutate(d=>d.questions[0].text='{"title":"not a member", "title":"only text"} \\ " 中');
  assert.deepEqual(roundtrip(d),d);
  assert.throws(()=>parseQuestionnaire('['.repeat(17)+'0'+']'.repeat(17)),/嵌套/);
  const zero=mutate(d=>d.questions[1].min=0), parsed=parseQuestionnaire(JSON.stringify(zero).replace('"min":0','"min":-0'));
  assert.equal(Object.is(parsed.questions[1].min,-0),false); assert.deepEqual(roundtrip(parsed),parsed);
});

test('numeric editing preserves partial input as errors instead of coercing it to null or zero',()=>{
  for(const raw of ['-','+','.','1e','1e-','1e309','NaN','Infinity','0xff','1,000','1e-999','1000000001']) assert.ok(parseBoundDraft(raw).error,raw);
  for(const [raw,expected] of [['',null],[' ',null],['0',0],['-0',0],['0.',0],['-.25',-.25],['1e-3',.001],['-1000000000',-1e9]]) assert.deepEqual(parseBoundDraft(raw),{value:expected,error:''});
});

test('draft semantic gaps are preserved rather than silently repaired',()=>{
  const d=mutate(d=>{d.title='';d.questions[0].variable='';d.questions[0].text='';d.questions[0].choices=[];d.questions[1].min=null;d.questions[1].condition={questionId:'missing',codes:[]};});
  assert.deepEqual(roundtrip(d),d);
  for(const code of ['text_missing','variable_invalid','choices_short','scale_bounds','route_source','route_codes']) assert.ok(codes(d).includes(code),code);
});

test('variable names are bounded ASCII and duplicate detection is case-insensitive',()=>{
  const d=mutate(d=>{d.questions[0].variable='Q1';d.questions[1].variable='q1';});
  assert.equal(questionnaireIssues(d).filter(i=>i.code==='variable_duplicate').length,2);
  assert.equal(nextVariable(d),'Q2');
  for(const variable of ['中文',' Q1','Q1 ','1Q','a-b']) assert.ok(codes(mutate(d=>d.questions[0].variable=variable)).includes('variable_invalid'));
});

test('choice codes are strings: leading zeros, missing categories and zero remain distinct',()=>{
  const d=mutate(d=>{d.questions[0].choices=[{code:'01',label:'第一类'},{code:'0',label:'不适用'}]; d.questions[1].condition.codes=['01'];d.questions[2].condition.codes=['01'];});
  assert.deepEqual(roundtrip(d).questions[0].choices,d.questions[0].choices);
  assert.equal(visibleQuestionIds(d,{'demo-screen':'1'}).length,1);
  assert.equal(visibleQuestionIds(d,{'demo-screen':'01'}).length,3);
  assert.ok(codes(d).includes('special_answers'));
  for(const value of ['', ' 1', '1 ', 'a b']) assert.ok(codes(mutate(d=>d.questions[0].choices[0].code=value)).includes('choice_codes'));
  assert.ok(codes(mutate(d=>d.questions[0].choices[1].code='1')).includes('choice_codes'));
  assert.ok(codes(mutate(d=>d.questions[0].choices[1].label='使用过')).includes('choice_labels'));
});

test('screening route purpose does not require an invented statistical research question',()=>{
  const d=exampleQuestionnaire();
  assert.equal(questionnaireIssues(d).filter(i=>i.questionId==='demo-screen').length,0);
  d.questions[0].analysis='undecided'; assert.ok(codes(d).includes('analysis_missing'));
  d.questions[0].purpose='research'; assert.ok(codes(d).includes('question_unmapped'));
  d.questions[0].analysis='routing'; assert.ok(codes(d).includes('routing_mismatch'));
});

test('wording heuristics remain human-review prompts, never validity certifications',()=>{
  const d=mutate(d=>d.questions[0].text='显然这项服务以及交通都很好，对吗？');
  const issues=questionnaireIssues(d).filter(i=>['leading_possible','double_possible'].includes(i.code));
  assert.equal(issues.length,2); assert.ok(issues.every(i=>i.level==='review'));
  d.questions[0].text='您最近一次在哪里办理？'; assert.ok(!codes(d).includes('leading_possible'));
});

test('scale bounds define editor capacity, not a universal four-point rule',()=>{
  for(const max of [2,3,5,15]) {
    const d=mutate(d=>d.questions[1].max=max); assert.ok(!codes(d).includes('scale_bounds'));
  }
  for(const [min,max] of [[null,5],[1,null],[1,1],[2,1],[1.5,5],[1,16]]) assert.ok(codes(mutate(d=>Object.assign(d.questions[1],{min,max}))).includes('scale_bounds'));
  const d=mutate(d=>d.questions[1].reverse=true); assert.ok(codes(d).includes('reverse_review'));
  assert.equal(designDictionary(d).variables[1].scoring,'min + max - raw value; only after explicit missing handling');
  assert.ok(codes(mutate(d=>d.questions[0].reverse=true)).includes('reverse_type'));
});

test('numeric zero and unbounded null are distinct and reversed ranges are flagged',()=>{
  const d=mutate(d=>Object.assign(d.questions[2],{type:'number',min:0,max:null}));
  assert.equal(roundtrip(d).questions[2].min,0); assert.equal(roundtrip(d).questions[2].max,null);
  assert.match(questionnaireText(d),/数值范围：0 至 未限定/);
  d.questions[2].max=-1; assert.ok(codes(d).includes('number_bounds'));
});

test('routing blocks missing, self, future, non-single and nonexistent-code conditions',()=>{
  const variants=[d=>d.questions[1].condition.questionId='missing',d=>d.questions[1].condition.questionId='demo-experience',d=>d.questions[1].condition.questionId='demo-open',d=>d.questions[0].type='multi',d=>d.questions[1].condition.codes=['99'],d=>d.questions[1].condition.codes=[],d=>d.questions[1].condition.codes=['1','1']];
  for(const fn of variants) {
    const d=mutate(fn); assert.ok(questionnaireIssues(d).some(i=>i.questionId==='demo-experience' && i.level==='blocker'));
    assert.ok(!visibleQuestionIds(d,{'demo-screen':'1','demo-experience':'1','demo-open':'1'}).includes('demo-experience'));
  }
  const ambiguous=mutate(d=>d.questions[0].choices[1].code='1');
  assert.ok(codes(ambiguous).includes('route_ambiguous')); assert.deepEqual(visibleQuestionIds(ambiguous,{'demo-screen':'1'}),['demo-screen']);
});

test('hidden ancestors and inherited answer properties cannot reveal descendants',()=>{
  const d=exampleQuestionnaire(); Object.assign(d.questions[1],{type:'single',choices:[{code:'a',label:'甲'},{code:'b',label:'乙'}]});
  d.questions[2].condition={questionId:'demo-experience',codes:['a']};
  assert.deepEqual(visibleQuestionIds(d,{'demo-screen':'0','demo-experience':'a'}),['demo-screen']);
  assert.deepEqual(visibleQuestionIds(d,{'demo-screen':'1','demo-experience':'a'}),d.questions.map(q=>q.id));
  assert.deepEqual(visibleQuestionIds(d,Object.create({'demo-screen':'1'})),['demo-screen']);
  d.questions[0].condition={questionId:'demo-open',codes:['1']}; assert.deepEqual(visibleQuestionIds(d,{'demo-screen':'1','demo-experience':'a','demo-open':'1'}),[]);
});

test('route dependency identity survives variable rename, not arbitrary index mutation',()=>{
  const d=exampleQuestionnaire(); assert.equal(routeDependencies(d,'demo-screen').length,2); assert.equal(routeDependencies(d,'demo-screen','0').length,0);
  d.questions[0].variable='RENAMED'; assert.equal(visibleQuestionIds(d,{'demo-screen':'1'}).length,3);
  [d.questions[0],d.questions[1]]=[d.questions[1],d.questions[0]];
  assert.ok(codes(d).includes('route_source')); assert.ok(!visibleQuestionIds(d,{'demo-screen':'1'}).includes('demo-experience'));
});

test('exports retain question, branch and method provenance without claiming results',()=>{
  const d=exampleQuestionnaire(),text=questionnaireText(d),dictionary=designDictionary(d);
  assert.match(text,/待实施/); assert.match(text,/1\. \[USED\]/); assert.match(text,/第 1 题 USED 的回答编码属于 1/);
  for(const q of d.questions) assert.ok(text.includes(q.text));
  assert.equal(dictionary.classification,'proposed'); assert.equal(dictionary.variables[1].source,d.questions[1].source);
  assert.deepEqual(dictionary.variables[1].condition,d.questions[1].condition);
  assert.throws(()=>parseQuestionnaire(JSON.stringify(dictionary)),/字段/);
  const html=mutate(d=>d.questions[0].text='<img src=x onerror=alert(1)>'); assert.deepEqual(roundtrip(html),html);
});

test('questionnaire UI keeps memory-only state, escaped JSX and explicit non-collection boundaries',async()=>{
  const ui=await readFile(new URL('../components/design/QuestionnaireStudio.tsx',import.meta.url),'utf8');
  for(const expression of [/\bfetch\s*\(/,/localStorage/,/sessionStorage/,/indexedDB/,/dangerouslySetInnerHTML/,/\beval\s*\(/]) assert.doesNotMatch(ui,expression);
  assert.match(ui,/revision !== editRevision.current/); assert.match(ui,/epoch !== readEpoch.current/);
  assert.match(ui,/fatal:true/); assert.match(ui,/本页不收集受访者答卷/);
  assert.doesNotMatch(ui,/window\.confirm/);
  assert.match(ui,/pending.revision===editRevision.current/);
  assert.match(ui,/cancelConfirm.current\?\.focus\(\)/);
  assert.match(ui,/\[activeId,view,mobilePane\]/);
});
