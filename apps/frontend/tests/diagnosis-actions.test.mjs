import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DIAGNOSIS_ACTIONS,prepareDiagnosisBrief,applyDiagnosisBrief} from '../lib/diagnosis-actions.ts';
import {newQuestionnaire,exampleQuestionnaire,parseQuestionnaire,questionnaireIssues} from '../lib/questionnaire.ts';

const source=(patch={},id='diagnosis-1')=>({id,input:{title:'校园出行服务研究',problem:'了解通勤学生的服务需求，支持服务中心比较两种拟议改进方案。',decisionOwner:'校园交通服务中心',population:'本校本学期有通勤需求的在读学生',geography:'校园及相邻生活区',stage:'problem_framing',evidenceStatus:'proposed',...patch}});
const copy=value=>structuredClone(value);
function frozen(value){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))frozen(child);return value;}
const diagnosisUrl=new URL('../app/api/_lib/diagnosis.ts',import.meta.url);
const diagnosisSource=readFileSync(diagnosisUrl,'utf8').replace('"@/data/control-plane-contract.generated"',JSON.stringify(new URL('../data/control-plane-contract.generated.ts',import.meta.url).href));
const {diagnoseProject,EVIDENCE_STATUSES}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(diagnosisSource)).toString('base64'));

test('preview owns a deterministic exact snapshot and preserves raw source text',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d),snapshot=JSON.stringify(p);
  assert.deepEqual(p.fields.map(f=>f.key),['title','population','geography','objective']);
  assert.equal(p.fields.find(f=>f.key==='objective').after,`决策主体：${s.input.decisionOwner}\n决策问题：${s.input.problem}`);
  assert.equal(p.sourceId,s.id);assert.deepEqual(JSON.parse(p.sourceKey),s);assert.deepEqual(JSON.parse(p.baseKey),d);
  s.input.title=' changed ';d.questions[0].text='modified';assert.equal(JSON.stringify(p),snapshot);
});
test('partial apply changes only chosen fields and owns all nested question data',()=>{
  const s=source(),d=exampleQuestionnaire(),before=copy(d),p=prepareDiagnosisBrief(s,d);
  const next=applyDiagnosisBrief(p,s,d,['title','objective']);
  assert.equal(next.title,s.input.title);assert.match(next.objective,/决策主体：/);
  for(const key of Object.keys(d).filter(k=>!['title','objective'].includes(k)))assert.deepEqual(next[key],d[key]);
  next.questions[0].text='changed result';assert.deepEqual(d,before);assert.notEqual(next.questions,d.questions);
});
test('deep frozen inputs and proposal are read-only and one complete return forms one undo entry',()=>{
  const s=frozen(source()),d=frozen(exampleQuestionnaire()),p=frozen(prepareDiagnosisBrief(s,d)),before=JSON.stringify([s,d,p]);
  const next=applyDiagnosisBrief(p,s,d,['title','population','geography','objective']);
  assert.equal(JSON.stringify([s,d,p]),before);assert.equal(next.classification,'proposed');assert.deepEqual(next.questions,d.questions);
});
test('all source fields and source id bind currentness, not just chosen values',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d);
  for(const key of ['title','problem','decisionOwner','population','geography','stage','evidenceStatus']){
    const changed=copy(s);changed.input[key]=key==='stage'?'fieldwork':key==='evidenceStatus'?'none':changed.input[key]+'新';
    assert.throws(()=>applyDiagnosisBrief(p,changed,d,['title']),/变化/);
  }
  assert.throws(()=>applyDiagnosisBrief(p,source({},'diagnosis-2'),d,['title']),/变化/);
});
test('destination currentness includes every brief and nested item, not only chosen field',()=>{
  const s=source(),d=exampleQuestionnaire(),p=prepareDiagnosisBrief(s,d);
  for(const key of ['title','objective','population','geography','period','recruitment','introduction','pilotNotes']){
    const changed=copy(d);changed[key]+='新';assert.throws(()=>applyDiagnosisBrief(p,s,changed,['title']),/变化/);
  }
  for(const mutate of [q=>q.text+='新',q=>q.required=!q.required,q=>q.variable='NEW',q=>q.choices[0].label+='新']){
    const changed=copy(d);mutate(changed.questions[0]);assert.throws(()=>applyDiagnosisBrief(p,s,changed,['title']),/变化/);
  }
});
test('pure content snapshots alone intentionally do not detect edit-undo; UI epoch must change source id',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d),restored=copy(d);
  restored.title='temporary';restored.title=d.title;
  assert.equal(applyDiagnosisBrief(p,s,restored,['title']).title,s.input.title);
  assert.throws(()=>applyDiagnosisBrief(p,source({},'new-ui-epoch'),restored,['title']));
});
test('any preview field or metadata tampering is rejected atomically',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d),before=JSON.stringify(d);
  const corruptions=[x=>x.sourceId='other',x=>x.sourceKey+=' ',x=>x.baseKey+=' ',x=>x.fields[0].after='invented',x=>x.fields[0].before='invented',x=>x.fields[0].max=9999,x=>x.fields[0].label='wrong',x=>x.fields[0].error='wrong',x=>x.fields.reverse(),x=>x.extra='x',x=>x.fields[0].extra='x',x=>x.fields.pop()];
  for(const corrupt of corruptions){const bad=copy(p);corrupt(bad);assert.throws(()=>applyDiagnosisBrief(bad,s,d,['title']));assert.equal(JSON.stringify(d),before);}
});
test('unknown, duplicate, empty and malformed selections cannot execute',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d);
  for(const selected of [[],['title','title'],['questions'],['__proto__'],['constructor'],['title',null],null,'title'])assert.throws(()=>applyDiagnosisBrief(p,s,d,selected));
});
test('caller-supplied selection methods, iterators and accessors never execute or broaden selection',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d);let calls=0;
  const includes=['title'];includes.includes=()=>{calls++;return true;};
  const some=['unknown'];some.some=()=>{calls++;return false;};
  const iterator=['title'];iterator[Symbol.iterator]=function*(){calls++;yield 'objective';};
  const accessor=['title'];Object.defineProperty(accessor,'0',{enumerable:true,get(){calls++;return 'objective';}});
  const hidden=['title'];Object.defineProperty(hidden,'includes',{value:()=>{calls++;return true;}});
  for(const selection of [includes,some,iterator,accessor,hidden,new Array(1)])assert.throws(()=>applyDiagnosisBrief(p,s,d,selection));
  assert.equal(calls,0);assert.deepEqual(d,newQuestionnaire());
});
test('oversized population remains fully displayed and only blocks its own selection',()=>{
  const s=source({population:'人'.repeat(161)}),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d),field=p.fields.find(f=>f.key==='population');
  assert.equal(field.after.length,161);assert.match(field.error,/161.*160/);
  assert.equal(applyDiagnosisBrief(p,s,d,['title']).title,s.input.title);
  assert.throws(()=>applyDiagnosisBrief(p,s,d,['title','population']),/上限/);assert.deepEqual(d,newQuestionnaire());
});
test('objective length includes owner labels; exact max is accepted and max+1 is not truncated',()=>{
  const owner='服务中心',prefix=`决策主体：${owner}\n决策问题：`,d=newQuestionnaire();
  const exact=source({decisionOwner:owner,problem:'问'.repeat(600-prefix.length)}),p=prepareDiagnosisBrief(exact,d);
  assert.equal(p.fields[3].after.length,600);assert.equal(p.fields[3].error,'');assert.equal(applyDiagnosisBrief(p,exact,d,['objective']).objective.length,600);
  const long=source({decisionOwner:owner,problem:'问'.repeat(601-prefix.length)}),over=prepareDiagnosisBrief(long,d);
  assert.equal(over.fields[3].after.length,601);assert.throws(()=>applyDiagnosisBrief(over,long,d,['objective']),/上限/);
});
test('valid source maximum is distinct from destination maximum; no implicit narrowing',()=>{
  const s=source({title:'题'.repeat(120),problem:'问'.repeat(1000),decisionOwner:'主'.repeat(120),population:'人'.repeat(200),geography:'地'.repeat(120)}),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d);
  assert.ok(p.fields[1].error);assert.ok(p.fields[3].error);assert.equal(p.fields[0].error,'');assert.equal(p.fields[2].error,'');
  const next=applyDiagnosisBrief(p,s,d,['title','geography']);assert.equal(next.title.length,120);assert.equal(next.geography.length,120);
});
test('strict source shape, text bounds and self-reported enums reject invalid input',()=>{
  const d=newQuestionnaire();
  for(const patch of [{title:''},{title:' '},{title:'x'.repeat(121)},{problem:'x'.repeat(1001)},{population:'x'.repeat(201)},{stage:'unknown'},{stage:'review'},{evidenceStatus:'accepted'},{evidenceStatus:true},{geography:'x\u0000'},{extra:'not allowed'}])assert.throws(()=>prepareDiagnosisBrief(source(patch),d));
  for(const status of EVIDENCE_STATUSES)assert.doesNotThrow(()=>prepareDiagnosisBrief(source({evidenceStatus:status}),d));
  for(const bad of [null,[],{id:'a'},{...source(),extra:true},{id:'',input:source().input}])assert.throws(()=>prepareDiagnosisBrief(bad,d));
});
test('malformed questionnaire is not repaired and structural gaps stay reviewable',()=>{
  const s=source(),d=newQuestionnaire();assert.throws(()=>prepareDiagnosisBrief(s,{...d,classification:'actual'}));
  assert.throws(()=>prepareDiagnosisBrief(s,{...d,extra:'x'}));
  const p=prepareDiagnosisBrief(s,d),next=applyDiagnosisBrief(p,s,d,['title']);
  assert.deepEqual(questionnaireIssues(next).filter(i=>i.questionId),questionnaireIssues(d).filter(i=>i.questionId));
  assert.deepEqual(parseQuestionnaire(JSON.stringify(next)),next);assert.equal(next.pilotNotes,'');assert.equal(next.recruitment,'');
});
test('source and destination object key ordering does not create false drift',()=>{
  const s=source(),d=newQuestionnaire(),p=prepareDiagnosisBrief(s,d);
  const reorder=o=>Object.fromEntries(Object.entries(o).reverse());
  assert.equal(applyDiagnosisBrief(reorder(p),{input:reorder(s.input),id:s.id},reorder(d),['title']).title,s.input.title);
});
test('non-plain data and accessor inputs are rejected without invoking accessors',()=>{
  let calls=0;const s=source();Object.defineProperty(s.input,'title',{enumerable:true,get(){calls++;return 'bad';}});
  assert.throws(()=>prepareDiagnosisBrief(s,newQuestionnaire()));assert.equal(calls,0);
  assert.throws(()=>prepareDiagnosisBrief(Object.assign(Object.create({}),source()),newQuestionnaire()));
  const cycle=source();cycle.input.problem=cycle;assert.throws(()=>prepareDiagnosisBrief(cycle,newQuestionnaire()));
});
test('known action map only points to fixed internal modules, unknown and prototype names are absent',()=>{
  const allowed=new Set(['#diagnose','#rules','#design','#analysis','#workspace']);
  assert.equal(Object.keys(DIAGNOSIS_ACTIONS).length,9);
  for(const value of Object.values(DIAGNOSIS_ACTIONS)){assert.ok(allowed.has(value.target));for(const key of ['title','input','output','review'])assert.ok(value[key].length>0);}
  for(const key of ['constructor','__proto__','https://example.test','arbitrary'])assert.equal(DIAGNOSIS_ACTIONS[key],undefined);
  for(const entry of Object.values(DIAGNOSIS_ACTIONS)){assert.ok(Object.isFrozen(entry));assert.throws(()=>{entry.target='https://example.test';});}
});
test('high-risk stage mismatch cannot be displaced by lower-priority items among five actions',()=>{
  const result=diagnoseProject(source({title:'短题',problem:'问题',decisionOwner:'政府',population:'学生',geography:'市',stage:'defense',evidenceStatus:'none'}).input);
  assert.equal(result.nextSteps.length,5);assert.ok(result.nextSteps.some(s=>s.code==='stage_evidence_mismatch'));
  const levels=result.nextSteps.map(step=>result.risks.find(r=>r.code===step.code).severity),rank={high:0,medium:1,low:2};
  assert.deepEqual(levels,[...levels].sort((a,b)=>rank[a]-rank[b]));
  for(const item of result.nextSteps)assert.ok(Object.hasOwn(DIAGNOSIS_ACTIONS,item.code));
});
test('diagnosis score and metric stay compatible but explicitly disclose heuristic evidence limitations',()=>{
  const r=diagnoseProject(source().input);assert.equal(r.metric,'project_readiness_not_award_probability');assert.ok(Number.isFinite(r.readiness));
  assert.match(r.disclaimer,/自报/);assert.match(r.disclaimer,/文字长度/);assert.match(r.disclaimer,/未核验/);assert.match(r.disclaimer,/Gate/);
});
test('core has no hidden system time, random, persistence, network or evaluation side effects',()=>{
  const text=readFileSync(new URL('../lib/diagnosis-actions.ts',import.meta.url),'utf8');
  assert.doesNotMatch(text,/\b(?:Date|crypto)\s*[.(]|\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|eval)\s*[.(]/);
});
