import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTION_BLOCKS,appendQuestionBlocks,appendScaleBlock} from '../lib/research-blocks.ts';
import {newQuestionnaire,parseQuestionnaire,newQuestion} from '../lib/questionnaire.ts';
const ids=()=>{let i=0;return()=>`new-${++i}`;};
test('all blocks append in selection order, preserve original and round-trip strict v1',()=>{
 const d=newQuestionnaire(),snapshot=JSON.stringify(d),next=appendQuestionBlocks(d,QUESTION_BLOCKS.map(b=>b.id),'就业',ids());
 assert.equal(JSON.stringify(d),snapshot);assert.deepEqual(next.questions[0],d.questions[0]);assert.equal(next.questions.length,13);assert.deepEqual(parseQuestionnaire(JSON.stringify(next)),next);
 assert.equal(new Set(next.questions.map(q=>q.id)).size,13);assert.equal(new Set(next.questions.map(q=>q.variable.toLowerCase())).size,13);
 assert.ok(next.questions.slice(1).every(q=>q.source.includes('自编')&&!q.required&&!q.reverse));
});
test('variable allocation avoids case-insensitive collisions, existing routes preserved',()=>{
 const d=newQuestionnaire();d.questions[0].variable='q2';d.questions.push({...newQuestion('branch','Q1'),condition:{questionId:'initial-question',codes:['1']}});
 const next=appendQuestionBlocks(d,['open','screen'],'主题',ids());assert.deepEqual(next.questions.slice(0,2),d.questions);assert.deepEqual(next.questions.slice(2).map(q=>q.variable),['Q3','Q4']);assert.equal(next.questions[2].type,'text');
});
test('capacity or duplicate ids fails atomically instead of partial addition',()=>{
 const d=newQuestionnaire();d.questions=Array.from({length:79},(_,i)=>newQuestion(`i${i}`,`Q${i+1}`));const before=JSON.stringify(d);
 assert.throws(()=>appendQuestionBlocks(d,['experience'],'题',ids()),/80/);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>appendQuestionBlocks(newQuestionnaire(),['profile'],'题',()=> 'same'),/id|ID|重复/i);
});
test('module selection and theme are bounded',()=>{
 for(const blockIds of [[],['unknown'],['open','open']])assert.throws(()=>appendQuestionBlocks(newQuestionnaire(),blockIds,'主题',ids()));
 for(const topic of ['', 'x'.repeat(61)])assert.throws(()=>appendQuestionBlocks(newQuestionnaire(),['open'],topic,ids()));
});
test('batch scale retains literal stems/anchors/source, independent items without automatic validation',()=>{
 const next=appendScaleBlock(newQuestionnaire(),{construct:'自编构念',lines:'第一题\n\n第二题',points:7,minLabel:'完全不同意',maxLabel:'完全同意',source:'自编待预试'},ids());
 assert.deepEqual(next.questions.slice(1).map(q=>q.text),['第一题','第二题']);for(const q of next.questions.slice(1)){assert.equal(q.type,'likert');assert.equal(q.max,7);assert.equal(q.source,'自编待预试');assert.equal(q.reverse,false);assert.equal(q.researchQuestion,'');assert.equal(q.decisionUse,'');}
});
test('invalid scale configuration and id collision never mutate original',()=>{
 const d=newQuestionnaire(),before=JSON.stringify(d),base={construct:'构念',lines:'一\n二',points:5,minLabel:'低',maxLabel:'高',source:''};
 for(const patch of [{lines:'一'},{lines:Array(13).fill('项').join('\n')},{points:6},{construct:''},{minLabel:''},{lines:'一\n'+'x'.repeat(601)}])assert.throws(()=>appendScaleBlock(d,{...base,...patch},ids()));
 assert.throws(()=>appendScaleBlock(d,base,()=> 'initial-question'));assert.equal(JSON.stringify(d),before);
});
