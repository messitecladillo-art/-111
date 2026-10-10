import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ACTION_STAGES,ACTION_FIELDS,MAX_ACTION_CARDS,MAX_ACTION_IMPORT_BYTES,newActionEvidenceCard,
  reviewActionEvidence,actionEvidenceExport,parseActionEvidenceImport,mergeActionEvidence,
} from '../lib/action-evidence.ts';

const encode=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
const filled=(id='action-1',stage='proposed')=>Object.assign(newActionEvidenceCard(id),Object.fromEntries(ACTION_FIELDS.map(f=>[f.id,`合成核验字段：${f.label}`])),{stage});
const packageFor=cards=>({schema:'evix-action-evidence/v1',contentClass:'user_authored_practice_not_verified',entries:cards});
const clone=value=>JSON.parse(JSON.stringify(value));

test('new card has 13 empty fields, a deterministic safe ID and unknown stage, never invented execution',()=>{
  const card=newActionEvidenceCard();assert.equal(card.id,'action-1');assert.equal(card.stage,'unknown');
  assert.equal(ACTION_FIELDS.length,13);assert.equal(Object.keys(card).length,15);
  for(const field of ACTION_FIELDS)assert.equal(card[field.id],'');
  assert.notEqual(card,newActionEvidenceCard());assert.equal(reviewActionEvidence(card).verified,false);
});
test('labels describe self-reported categories, not progress/score, and metadata is immutable',()=>{
  assert.deepEqual(ACTION_STAGES.map(s=>s.id),['unknown','proposed','prototype','feedback','adopted','implemented','observed_change','attributable_effect']);
  for(const s of ACTION_STAGES){assert.ok(s.label&&s.prompt&&s.boundary);assert.ok(Object.isFrozen(s));}
  for(const f of ACTION_FIELDS){assert.ok(f.label&&f.placeholder);assert.ok(Object.isFrozen(f));}
  assert.throws(()=>{ACTION_STAGES[0].id='implemented';});assert.throws(()=>ACTION_FIELDS.push({id:'verified'}));
});
test('IDs are bounded exact identifiers, not prototype names or path material',()=>{
  for(const id of ['a','action-1','action_a-B2','x'.repeat(80)])assert.equal(newActionEvidenceCard(id).id,id);
  for(const id of ['',null,1,' action-1','a/b','a\\b','../id','__proto__','prototype','constructor','x'.repeat(81),'中文'])assert.throws(()=>newActionEvidenceCard(id));
});
test('same fully populated content across every stage never becomes verified',()=>{
  for(const stage of ACTION_STAGES){const card=filled('a',stage.id),before=clone(card),result=reviewActionEvidence(card);
    assert.equal(result.verified,false);assert.equal(result.status,stage.id==='unknown'?'incomplete':'needs_human_review');assert.deepEqual(card,before);assert.ok(result.warnings.includes(stage.boundary));}
});
test('required common fields and explicit stage are checked by labels without assigning facts',()=>{
  const card=filled('a','unknown');assert.deepEqual(reviewActionEvidence(card).missing,['成果状态（请明确选择）']);
  for(const id of ['title','finding','audience','owner','artifactVersion','claim','periodScope','limitations','nextStep']){
    const result=reviewActionEvidence({...filled(),[id]:' \n '});assert.ok(result.missing.includes(ACTION_FIELDS.find(f=>f.id===id).label));assert.equal(result.status,'incomplete');}
});
test('conditional evidence and metric requirements differ by category, not by imagined milestones',()=>{
  for(const stage of ACTION_STAGES){const card={...filled('a',stage.id),evidence:'',metrics:'',comparison:'',counterEvidence:''},missing=reviewActionEvidence(card).missing;
    const label=id=>ACTION_FIELDS.find(f=>f.id===id).label;
    assert.equal(missing.includes(label('evidence')),stage.id!=='unknown'&&stage.id!=='proposed');
    assert.equal(missing.includes(label('metrics')),['proposed','observed_change','attributable_effect'].includes(stage.id));
    assert.equal(missing.includes(label('comparison')),stage.id==='attributable_effect');assert.equal(missing.includes(label('counterEvidence')),stage.id==='attributable_effect');}
});
test('feedback, adoption, implementation and attribution each retain the non-promotion boundary',()=>{
  for(const [stage,pattern] of [['feedback',/不等于正式采纳/],['adopted',/不等于已经实施/],['implemented',/不自动等于/],['observed_change',/不证明由该方案造成/],['attributable_effect',/不证明因果成立/]]){
    const card=filled('a',stage),before=clone(card),review=reviewActionEvidence(card);assert.ok(review.warnings.some(w=>pattern.test(w)));assert.deepEqual(card,before);}
});
test('field-local metric/implementation reminders preserve negations and never certify semantics',()=>{
  const card={...filled(),claim:'R² 高不能证明因果；尚未试点或采纳。',counterEvidence:'已实施这一句是引用，并非本项目事实。'};
  const review=reviewActionEvidence(card);assert.ok(review.warnings.some(w=>w.includes('当前有限主张')&&w.includes('统计指标')));
  assert.ok(review.warnings.some(w=>w.includes('反证与替代解释')&&w.includes('关键词不能判断事件真假')));assert.equal(review.verified,false);assert.equal(card.stage,'proposed');
});
test('exact text is preserved across detached export/import; no derived approval is exported',()=>{
  const card=filled('a','implemented');card.title=' 行动一 ';card.evidence='报告 v2，第 4 页\n<script>仅文本</script>';card.limitations='未核验。';
  const result=actionEvidenceExport([card]);assert.deepEqual(Object.keys(result),['schema','contentClass','entries']);
  assert.deepEqual(result.entries,[card]);assert.notEqual(result.entries[0],card);assert.doesNotMatch(JSON.stringify(result),/"(?:verified|check|rating|approval)"\s*:/);
  const parsed=parseActionEvidenceImport(encode(result));assert.deepEqual(parsed,[card]);parsed[0].title='编辑后';assert.equal(card.title,' 行动一 ');assert.equal(result.entries[0].title,' 行动一 ');
});
test('incomplete drafts are legitimate portable notes; zero-card exports/imports are not',()=>{
  assert.deepEqual(parseActionEvidenceImport(encode(actionEvidenceExport([newActionEvidenceCard()]))),[newActionEvidenceCard()]);
  assert.throws(()=>actionEvidenceExport([]));assert.throws(()=>parseActionEvidenceImport(encode(packageFor([]))));assert.equal(MAX_ACTION_CARDS,20);assert.equal(MAX_ACTION_IMPORT_BYTES,393216);
});
test('package identities and unknown authority fields fail closed',()=>{
  const pack=packageFor([filled()]);
  for(const patch of [{schema:'evix-action-evidence/v2'},{schema:'evix-defense-practice/v1'},{contentClass:'verified'},{verified:true},{approval:{reviewer:'fake'}},{check:{status:'pass'}},{notice:'pretend approval'}])assert.throws(()=>parseActionEvidenceImport(encode({...pack,...patch})));
  for(const patch of [{verified:true},{stage:'passed'},{approval:'human'},{artifactVersion:undefined}])assert.throws(()=>parseActionEvidenceImport(encode(packageFor([{...filled(),...patch}]))));
});
test('duplicate JSON members, escaped duplicates and prototype keys are rejected',()=>{
  const raw=JSON.stringify(packageFor([filled()]));
  for(const bad of [raw.replace('"stage":"proposed"','"stage":"unknown","stage":"proposed"'),raw.replace('"stage":"proposed"','"stage":"unknown","sta\\u0067e":"proposed"'),raw.replace('"schema":','"schema":"wrong","schema":'),raw.replace('"id":','"__proto__":{},"id":')])assert.throws(()=>parseActionEvidenceImport(encode(bad)));
});
test('malformed UTF-8, JSON and deeply nested material are rejected before acceptance',()=>{
  for(const bytes of [new Uint8Array(),Uint8Array.of(255),encode('{'),encode('null'),encode('[]'),encode('['.repeat(5000)+'0'+']'.repeat(5000))])assert.throws(()=>parseActionEvidenceImport(bytes));
  assert.throws(()=>parseActionEvidenceImport('not bytes'));
});
test('input byte cap uses intrinsic size even with a forged byteLength getter',()=>{
  const bytes=new Uint8Array(MAX_ACTION_IMPORT_BYTES+1);let calls=0;Object.defineProperty(bytes,'byteLength',{get(){calls++;return 1;}});
  assert.throws(()=>parseActionEvidenceImport(bytes),/384 KiB/);assert.equal(calls,0);
  const normal=encode(packageFor([filled()]));Object.defineProperty(normal,'byteLength',{get(){calls++;return MAX_ACTION_IMPORT_BYTES+1;}});
  assert.deepEqual(parseActionEvidenceImport(normal),[filled()]);assert.equal(calls,0);
});
test('all field types/lengths are exact and not silently trimmed/truncated',()=>{
  for(const field of ACTION_FIELDS){const card={...newActionEvidenceCard(),[field.id]:'x'.repeat(field.maxLength)};assert.doesNotThrow(()=>actionEvidenceExport([card]));
    assert.throws(()=>actionEvidenceExport([{...card,[field.id]:card[field.id]+'x'}]));for(const bad of [null,1,{},[],undefined])assert.throws(()=>reviewActionEvidence({...card,[field.id]:bad}));}
});
test('UTF-8 export capacity is enforced without discarding any card or text',()=>{
  const cards=Array.from({length:20},(_,i)=>Object.assign(newActionEvidenceCard(`a${i}`),Object.fromEntries(ACTION_FIELDS.map(f=>[f.id,'中'.repeat(f.maxLength)]))));
  const before=clone(cards);assert.ok(encode(packageFor(cards)).byteLength>MAX_ACTION_IMPORT_BYTES);assert.throws(()=>actionEvidenceExport(cards),/384 KiB/);assert.deepEqual(cards,before);
});
test('own getters, custom prototypes, hidden and symbol fields are rejected without execution',()=>{
  let calls=0;const getter=filled();Object.defineProperty(getter,'claim',{enumerable:true,get(){calls++;return '虚构';}});
  const toJSON={...filled(),toJSON(){calls++;return filled();}},hidden=filled();Object.defineProperty(hidden,'claim',{value:'hidden',enumerable:false});
  for(const card of [getter,toJSON,hidden,Object.assign(Object.create(null),filled()),{...filled(),[Symbol('hidden')]:1}])assert.throws(()=>actionEvidenceExport([card]));
  assert.equal(calls,0);
});
test('array overrides, sparse arrays and accessors cannot change chosen entries',()=>{
  let calls=0;const getter=[filled()];Object.defineProperty(getter,'0',{enumerable:true,get(){calls++;return filled();}});
  const overridden=[filled()];overridden.map=()=>{calls++;return [filled('other')];};
  for(const cards of [getter,overridden,new Array(1),Object.assign([filled()],{[Symbol.iterator](){calls++;return [][Symbol.iterator]();}})])assert.throws(()=>actionEvidenceExport(cards));assert.equal(calls,0);
});
test('merge replaces matching IDs in place, appends new IDs and detaches both input lists',()=>{
  const current=[filled('a'),filled('b')],incoming=[{...filled('b'),claim:'更新'},filled('c')],before=clone({current,incoming});
  const merged=mergeActionEvidence(current,incoming);assert.deepEqual(merged.map(c=>c.id),['a','b','c']);assert.equal(merged[1].claim,'更新');merged[0].claim='local';merged[1].title='local';assert.deepEqual({current,incoming},before);
});
test('merge capacity is based on distinct final IDs and over-cap rejection is atomic',()=>{
  const current=Array.from({length:20},(_,i)=>filled(`a${i}`)),before=clone(current);
  assert.equal(mergeActionEvidence(current,[filled('a19')]).length,20);assert.throws(()=>mergeActionEvidence(current,[filled('new')]));assert.deepEqual(current,before);
  assert.deepEqual(mergeActionEvidence([],[filled('new')]),[filled('new')]);assert.throws(()=>mergeActionEvidence([],[]));
});
test('invalid entries/duplicate IDs in either list reject before any merge result',()=>{
  const current=[filled('a')],before=clone(current);
  for(const incoming of [[filled('b'),filled('b')],[filled('b'),{...filled('c'),stage:'invented'}],Array.from({length:21},(_,i)=>filled(`a${i}`))])assert.throws(()=>mergeActionEvidence(current,incoming));
  assert.throws(()=>mergeActionEvidence([filled('a'),filled('a')],[filled('b')]));assert.deepEqual(current,before);
  assert.throws(()=>parseActionEvidenceImport(encode(packageFor([filled('a'),filled('a')]))));
});
test('model contains no hidden clock/random, IO, network, storage or DOM execution',()=>{
  const source=readFileSync(new URL('../lib/action-evidence.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:Date|crypto|Math\.random|fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document|window)\s*[.(]/);
});
