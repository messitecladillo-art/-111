import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_CARDS,MATERIAL_SOURCES,MATERIAL_QUESTION_GROUPS,findMaterialCards,appendMaterialQuestionGroup,materialCardText } from '../lib/research-materials.ts';
import { newQuestionnaire,newQuestion,parseQuestionnaire,questionnaireIssues,visibleQuestionIds } from '../lib/questionnaire.ts';
import { initialRevisionHistory,commitQuestionnaireRevision,travelQuestionnaireRevision } from '../lib/questionnaire-revision.ts';
const ids = prefix => {let i=0;return()=>`${prefix}-${++i}`;};

test('every bundled card has a source-backed complete context contract; no historical hard rules',()=>{
 assert.equal(MATERIAL_CARDS.length,87);
 assert.equal(new Set(MATERIAL_CARDS.map(c=>c.id)).size,MATERIAL_CARDS.length);
 assert.equal(new Set(MATERIAL_SOURCES.map(s=>s.id)).size,MATERIAL_SOURCES.length);
 const scopes=new Set(['questionnaire','analysis','report','defense','learning']);
 for(const s of MATERIAL_SOURCES){assert.equal(s.hardRule,false);assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.ok(s.filename);assert.ok(!s.filename.includes(':'));}
 for(const c of MATERIAL_CARDS){
  assert.ok(Array.isArray(c.contexts)&&c.contexts.length,c.id);assert.ok(c.contexts.every(x=>scopes.has(x)),c.id);
  assert.equal(c.availability,'guidance');assert.ok(c.title&&c.researchQuestion,c.id);
  for(const key of ['steps','preconditions','diagnostics','outputs','limits'])assert.ok(Array.isArray(c[key])&&c[key].length,c.id+key);
  assert.ok(c.sourceRefs.length,c.id);
  for(const r of c.sourceRefs){assert.ok(MATERIAL_SOURCES.some(s=>s.id===r.sourceId),c.id);assert.ok(r.locators.length&&r.locators.every(s=>typeof s==='string'&&s.length),c.id);}
  if(c.questionGroupId)assert.ok(MATERIAL_QUESTION_GROUPS.some(g=>g.id===c.questionGroupId));
  if(c.quiz){assert.equal(c.quiz.options.length,3);assert.ok(Number.isInteger(c.quiz.answer)&&c.quiz.answer>=0&&c.quiz.answer<c.quiz.options.length);assert.ok(c.quiz.explanation);}
 }
 assert.equal(new Set(MATERIAL_SOURCES.map(s=>s.collection)).size,6);
});

test('search handles Chinese, multiple terms, empty matches, scopes and category without mutating cards',()=>{
 const before=JSON.stringify(MATERIAL_CARDS);
 assert.ok(findMaterialCards('analysis','抽样').length);
 assert.ok(findMaterialCards('analysis','样本 误差').length);
 assert.equal(findMaterialCards('report','zz-no-such-material').length,0);
 assert.ok(findMaterialCards('questionnaire','','可编辑题组').every(c=>c.questionGroupId));
 assert.equal(findMaterialCards('report','','可编辑题组').length,0);
 assert.equal(findMaterialCards('report','','可编辑题组',true).length,MATERIAL_QUESTION_GROUPS.length);
 assert.equal(JSON.stringify(MATERIAL_CARDS),before);
});

test('all original groups append atomically with fresh IDs, mapped usage and strict backups',()=>{
 for(const group of MATERIAL_QUESTION_GROUPS){
  const d=newQuestionnaire();d.questions[0].variable='q2';const before=JSON.stringify(d);
  const next=appendMaterialQuestionGroup(d,group.id,ids('group'));
  assert.equal(JSON.stringify(d),before);assert.deepEqual(next.questions[0],d.questions[0]);
  assert.equal(next.questions.length,d.questions.length+group.design.questions.length);
  assert.deepEqual(parseQuestionnaire(JSON.stringify(next)),next);
  assert.equal(new Set(next.questions.map(q=>q.variable.toLowerCase())).size,next.questions.length);
  assert.equal(questionnaireIssues(next).filter(i=>i.level==='blocker'&&i.questionId!=='initial-question').length,0,group.id);
  assert.ok(next.questions.slice(1).every(q=>q.source&&q.researchQuestion&&q.decisionUse));
 }
});

test('repeated group application keeps existing identities and isolates internal branches',()=>{
 const first=appendMaterialQuestionGroup(newQuestionnaire(),'use-branches',ids('first'));
 const twice=appendMaterialQuestionGroup(first,'use-branches',ids('second'));
 assert.deepEqual(twice.questions.slice(0,first.questions.length),first.questions);
 const originalSource=first.questions.find(q=>q.type==='single'&&q.id!=='initial-question');
 const newSource=twice.questions[first.questions.length];
 assert.notEqual(originalSource.id,newSource.id);
 assert.ok(twice.questions.slice(first.questions.length).filter(q=>q.condition).every(q=>q.condition.questionId===newSource.id));
 const userPath=visibleQuestionIds(twice,{[originalSource.id]:'1',[newSource.id]:'2'});
 for(const q of twice.questions.slice(first.questions.length))if(q.condition)assert.equal(userPath.includes(q.id),q.condition.codes.includes('2'));
});

test('append is one revision and undo restores the exact previous content and repair provenance',()=>{
 let history=initialRevisionHistory(newQuestionnaire());const before=JSON.stringify(history.present);
 const next=appendMaterialQuestionGroup(history.present.content,'incident',ids('new'));
 history=commitQuestionnaireRevision(history,next,history.present.repairOrigin);
 assert.equal(history.past.length,1);history=travelQuestionnaireRevision(history,true);
 assert.equal(JSON.stringify(history.present),before);
 history=travelQuestionnaireRevision(history,false);assert.deepEqual(history.present.content,next);
});

test('capacity, unknown groups, ID collisions and invalid IDs leave current content untouched',()=>{
 const d=newQuestionnaire();d.questions=Array.from({length:79},(_,i)=>newQuestion(`old-${i}`,`Q${i+1}`));const before=JSON.stringify(d);
 assert.throws(()=>appendMaterialQuestionGroup(d,'experience',ids('new')),/80/);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>appendMaterialQuestionGroup(newQuestionnaire(),'absent',ids('x')),/有效/);
 assert.throws(()=>appendMaterialQuestionGroup(newQuestionnaire(),'scope',()=> 'initial-question'),/ID/);
 assert.throws(()=>appendMaterialQuestionGroup(newQuestionnaire(),'scope',()=> 'same'),/ID/);
 assert.throws(()=>appendMaterialQuestionGroup(newQuestionnaire(),'scope',()=> 'bad id'),/ID/);
});

test('card export preserves selected checks and source hashes, and never introduces results or raw documents',()=>{
 const card=MATERIAL_CARDS.find(c=>c.id==='report-sampling-audit');const text=materialCardText(card,[0]);
 assert.ok(text.includes('[x] '+card.diagnostics[0]));assert.ok(text.includes('[ ] '+card.diagnostics[1]));assert.ok(text.includes('600.25'));
 assert.ok(text.includes(MATERIAL_SOURCES.find(s=>s.id==='material-270').sha256));assert.ok(!text.includes('C:\\Users'));
 assert.ok(Math.abs(1.96**2*.5*.5/.04**2-600.25)<1e-10);
 const frequency=MATERIAL_CARDS.find(c=>c.id==='local-frequency-structure');assert.ok(frequency.limits.some(x=>x.includes('多选需先按选项拆列')));
});

test('all learning card exports retain every option, answer and explanation',()=>{
 for(const card of MATERIAL_CARDS.filter(c=>c.quiz)){const text=materialCardText(card);
  for(const option of card.quiz.options)assert.ok(text.includes(option));
  assert.ok(text.includes('答案：'+String.fromCharCode(65+card.quiz.answer)));assert.ok(text.includes(card.quiz.explanation));
 }
});
