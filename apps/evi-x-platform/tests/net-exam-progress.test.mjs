import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyExamProgress,examProgressKey,parseExamProgress,writeExamProgress,gradeExamAnswer,seededExamShuffle,examQuestionPool,startExamSession,chooseExamAnswer,submitExamPractice,finishExamMock,expireExamMock,examSessionStats,moveExamQuestion,toggleExamFavorite} from '../lib/net-exam-progress.ts';
const q=(id,type,answer)=>({id,type,chapter:'第一章',stem:id,options:(type==='boolean'?['true','false']:['A','B','C']).map(id=>({id,text:id})),answer,answerStatus:'valid',sourceRefs:[]});
const bank={version:'fixtures-v1',sources:[],questions:[q('s','single',['B']),q('m','multiple',['A','C']),q('b','boolean',['false'])]};
const initial=()=>emptyExamProgress('user1',bank.version);
const start=(p,mode='sequential',extra={})=>startExamSession(p,bank,{id:'run1',mode,now:1000,seed:42,...extra});
test('single, boolean and multiple grading is exact, order-independent and blank is unanswered',()=>{
 assert.equal(gradeExamAnswer(bank.questions[0],['B']),'correct');assert.equal(gradeExamAnswer(bank.questions[0],['A']),'incorrect');
 assert.equal(gradeExamAnswer(bank.questions[1],['C','A']),'correct');for(const a of [['A'],['A','B','C'],['A','A','C'],['Z']])assert.equal(gradeExamAnswer(bank.questions[1],a),'incorrect');
 assert.equal(gradeExamAnswer(bank.questions[2],['false']),'correct');assert.equal(gradeExamAnswer(bank.questions[2],['true']),'incorrect');assert.equal(gradeExamAnswer(bank.questions[0],[]),'unanswered');
});
test('account and bank version isolate keys and snapshots; corrupt and unknown-ID snapshots reset safely',()=>{
 const p=start(initial());assert.notEqual(examProgressKey('user1','v1'),examProgressKey('user2','v1'));assert.notEqual(examProgressKey('user1','v1'),examProgressKey('user1','v2'));assert.throws(()=>examProgressKey('','v1'));
 assert.deepEqual(parseExamProgress(JSON.stringify(p),'user1',bank).progress,p);assert.equal(parseExamProgress(JSON.stringify(p),'other',bank).reset,true);assert.equal(parseExamProgress(JSON.stringify(p),'user1',{...bank,version:'next'}).reset,true);
 for(const raw of ['{',JSON.stringify({...p,favorites:['missing']}),JSON.stringify({...p,session:{...p.session,index:99}}),JSON.stringify({...p,records:{s:{attempts:2,correctAttempts:3,lastGrade:'correct',lastAt:1}}})])assert.equal(parseExamProgress(raw,'user1',bank).reset,true);
});
test('explicit practice submission records once even on duplicate clicks; correct retry exits wrong pool',()=>{
 let p=start(initial());const before=JSON.stringify(p);p=chooseExamAnswer(p,bank,'s','A');assert.equal(Object.keys(p.records).length,0);assert.equal(before===JSON.stringify(p),false);
 p=submitExamPractice(p,bank,'s',2000);assert.equal(p.records.s.attempts,1);assert.equal(examQuestionPool(p,bank,'wrong').length,1);assert.strictEqual(submitExamPractice(p,bank,'s',2001),p);assert.strictEqual(chooseExamAnswer(p,bank,'s','B'),p);
 p=start(p,'wrong',{id:'retry'});p=chooseExamAnswer(p,bank,'s','B');p=submitExamPractice(p,bank,'s',3000);assert.equal(p.records.s.attempts,2);assert.equal(examQuestionPool(p,bank,'wrong').length,0);assert.equal(p.records.s.correctAttempts,1);
});
test('mock retains picks until submission, blanks remain unanswered and duplicate finish cannot duplicate records',()=>{
 let p=start(initial(),'mock',{count:50,minutes:1});assert.equal(p.session.questionIds.length,3);p=chooseExamAnswer(p,bank,'s','B');assert.equal(Object.keys(p.records).length,0);assert.strictEqual(submitExamPractice(p,bank,'s',2000),p);
 p=finishExamMock(p,bank,3000);const stats=examSessionStats(p.session);assert.deepEqual(stats,{total:3,answered:1,correct:1,incorrect:0,unanswered:2});assert.equal(Object.keys(p.records).length,1);assert.equal(examQuestionPool(p,bank,'wrong').length,0);assert.strictEqual(finishExamMock(p,bank,4000),p);
});
test('refresh snapshot preserves pending mock answers and expiry submits exactly once from the real deadline',()=>{
 let p=start(initial(),'mock',{minutes:1});p=chooseExamAnswer(p,bank,'m','C');p=chooseExamAnswer(p,bank,'m','A');p=moveExamQuestion(p,2);
 p=parseExamProgress(JSON.stringify(p),'user1',bank).progress;assert.equal(p.session.index,2);assert.deepEqual(p.session.responses.m.selected,['C','A']);assert.strictEqual(expireExamMock(p,bank,60999),p);
 p=expireExamMock(p,bank,61000);assert.equal(p.session.finishedAt,61000);assert.equal(p.records.m.attempts,1);assert.equal(p.records.m.lastGrade,'correct');assert.strictEqual(expireExamMock(p,bank,62000),p);assert.deepEqual(parseExamProgress(JSON.stringify(p),'user1',bank).progress,p);
});
test('favorites, chapters and seeded shuffle preserve ID sets and do not mutate data',()=>{
 let p=toggleExamFavorite(initial(),'m',bank);assert.deepEqual(examQuestionPool(p,bank,'favorites').map(q=>q.id),['m']);p=toggleExamFavorite(p,'m',bank);assert.equal(p.favorites.length,0);assert.strictEqual(toggleExamFavorite(p,'missing',bank),p);assert.equal(examQuestionPool(p,bank,'chapter','absent').length,0);
 const a=Array.from({length:30},(_,i)=>i),before=[...a];assert.deepEqual(seededExamShuffle(a,123),seededExamShuffle(a,123));assert.deepEqual(a,before);assert.deepEqual([...seededExamShuffle(a,123)].sort((a,b)=>a-b),a);assert.notDeepEqual(seededExamShuffle(a,123),seededExamShuffle(a,321));
});
test('empty submission does not fabricate an attempt and storage failure is observable',()=>{
 const p=start(initial());assert.strictEqual(submitExamPractice(p,bank,'s',2000),p);assert.equal(writeExamProgress({setItem(){throw Error('quota');}},'key',p),false);let saved='';assert.equal(writeExamProgress({setItem(k,v){saved=v;}},'key',p),true);assert.deepEqual(JSON.parse(saved),p);
});

test('answer click at or after deadline cannot add a late response',()=>{
 let p=start(initial(),'mock',{minutes:1});p=chooseExamAnswer(p,bank,'s','B',61000);assert.equal(p.session.finishedAt,61000);assert.equal(p.session.responses.s.grade,'unanswered');assert.equal(Object.keys(p.records).length,0);
 const corrupt={...p,session:{...p.session,responses:{}}};assert.equal(parseExamProgress(JSON.stringify(corrupt),'user1',bank).reset,true);
});

test('1000-question stress session grades, restores and keeps blanks and IDs consistent',()=>{
 const large={...bank,version:'stress-1000',questions:Array.from({length:1000},(_,i)=>({...q(`stress-${i}`,'single',['B']),chapter:`chapter-${i%10}`}))};
 let p=startExamSession(emptyExamProgress('user1',large.version),large,{id:'stress',mode:'mock',count:1000,minutes:30,now:1000,seed:17});
 assert.equal(p.session.questionIds.length,1000);assert.equal(new Set(p.session.questionIds).size,1000);
 for(const id of p.session.questionIds.slice(0,150))p=chooseExamAnswer(p,large,id,'B',2000);
 p=finishExamMock(p,large,3000);assert.deepEqual(examSessionStats(p.session),{total:1000,answered:150,correct:150,incorrect:0,unanswered:850});
 assert.deepEqual(parseExamProgress(JSON.stringify(p),'user1',large).progress,p);assert.equal(Object.keys(p.records).length,150);
 assert.equal(examQuestionPool(p,large,'chapter','chapter-1').length,100);
});
test('served bank contract accepts complete banks and rejects unusable ones before practice starts',async()=>{
 const {parseExamBank}=await import('../lib/net-exam-progress.ts');
 const full={version:'fixtures-v1',sources:[{id:'s1'}],questions:[{...q('s','single',['B']),sourceRefs:[{sourceId:'s1',locators:['p1']}]},q('m','multiple',['A','C']),q('b','boolean',['false'])]};
 assert.strictEqual(parseExamBank(full),full);
 const clone=()=>JSON.parse(JSON.stringify(full));
 const broken=[b=>{delete b.version;},b=>{b.questions=[];},b=>{b.questions[1].id='s';},b=>{b.questions[0].type='essay';},b=>{b.questions[0].answer=['Z'];},
  b=>{b.questions[0].answer=['A','B'];},b=>{b.questions[1].answer=['A'];},b=>{b.questions[0].options.push({id:'A',text:'dup'});},
  b=>{b.questions[0].sourceRefs=[{sourceId:'missing',locators:[]}];},b=>{b.questions[0].answerStatus='review';},b=>{b.sources.push({id:'s1'});},null];
 for(const mutate of broken){const b=mutate?clone():'not a bank';if(mutate)mutate(b);assert.throws(()=>parseExamBank(b),/题库格式无效/);}
});
