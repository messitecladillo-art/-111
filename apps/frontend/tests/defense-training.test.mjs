import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {allocatePitch,defenseExport,DEFENSE_FIELDS,DEFENSE_SCAFFOLDS,EMPTY_DEFENSE_DRAFT,hasDefenseDraftChanges,PITCH_BLOCKS,reviewDefenseDraft} from '../lib/defense-training.ts';
import {parseDefenseImport} from '../lib/defense-import.ts';
const snapshot=new URL('../data/defense-corpus.json',import.meta.url);
const canonical=new URL('../../../corpus-source/experience/defense-learning-20260930.json',import.meta.url);
const corpus=JSON.parse(readFileSync(snapshot,'utf8'));
const complete={answer:'模拟练习：当前只能描述该样本。',evidence:'模拟记录 E01，不是真实田野证据。',boundary:'模拟样本不能外推。',nextStep:'拟核对招募日志。',owner:'练习角色',evidenceState:'documented'};
test('reviewed experience snapshot is byte-identical to its canonical source',()=>{
  assert.equal(readFileSync(snapshot,'utf8'),readFileSync(canonical,'utf8'));
  assert.equal(corpus.status,'reviewed');assert.equal(corpus.sources.length,3);
  assert.equal(corpus.sources.reduce((sum,s)=>sum+s.pages,0),126);
  assert(corpus.sources.every(s=>s.kind==='informal_training'&&/^[a-f0-9]{64}$/.test(s.sha256)));
  assert.equal(new Set(corpus.cards.map(c=>c.id)).size,corpus.cards.length);
  for(const card of [...corpus.cards,...corpus.rejectedShortcuts])for(const ref of card.sourceRefs){const source=corpus.sources.find(s=>s.id===ref.id);assert(source);assert(ref.pages.every(p=>Number.isInteger(p)&&p>0&&p<=source.pages));}
});
test('source abstraction does not include private contact/path, raw scripts or officially verified awards',()=>{
  const text=readFileSync(snapshot,'utf8');assert.doesNotMatch(text,/Zyning5|wxid_|xwechat_files|C:[\\/]|official_verified/);
  assert.match(corpus.notice,/非官方/);assert.match(corpus.notice,/不.*复制/);
  assert.equal(corpus.cards.length,13);
  assert(['exposure','contribution','mixed-evidence'].every(id=>corpus.cards.some(c=>c.id===id)));
});
test('blank answer records missing slots rather than a success score',()=>{
  const result=reviewDefenseDraft(EMPTY_DEFENSE_DRAFT);assert.equal(result.status,'incomplete');assert.equal(result.missing.length,5);assert.equal(result.verified,false);
});
test('state-only notes are exportable without claiming complete or verified answers',()=>{
  for(const evidenceState of ['documented','proposed']){
    const draft={...EMPTY_DEFENSE_DRAFT,evidenceState};assert.equal(hasDefenseDraftChanges(draft),true);
    const result=defenseExport(corpus.cards,{decision:draft},allocatePitch(600,30,PITCH_BLOCKS.map(p=>p.weight)),600,30,corpus.version);
    assert.equal(result.entries.length,1);assert.equal(result.entries[0].evidenceState,evidenceState);
    assert.equal(result.entries[0].check.status,'incomplete');assert.equal(result.entries[0].check.verified,false);
  }
});
test('default blank and whitespace-only notes remain empty',()=>{
  assert.equal(hasDefenseDraftChanges(undefined),false);assert.equal(hasDefenseDraftChanges(EMPTY_DEFENSE_DRAFT),false);
  assert.equal(hasDefenseDraftChanges({...EMPTY_DEFENSE_DRAFT,answer:'  \n '}),false);
  assert.equal(hasDefenseDraftChanges({...EMPTY_DEFENSE_DRAFT,owner:'练习角色'}),true);
});
for(const state of ['missing','documented','proposed'])test(`filled ${state} answers remain unverified`,()=>{
  const result=reviewDefenseDraft({...complete,evidenceState:state});assert.equal(result.status,'needs_human_review');assert.equal(result.verified,false);
  if(state!=='documented')assert(result.warnings.length>0);
});
test('statistical keywords trigger limited human-check hints, never correctness claims',()=>{
  const result=reviewDefenseDraft({...complete,answer:'R²和信度高；加权后代表性仍需核查。'});
  assert.equal(result.warnings.length,2);assert(result.warnings[0].includes('否定句'));assert.equal(result.verified,false);
});
test('every field is checked after whitespace trimming',()=>{for(const f of DEFENSE_FIELDS)assert(reviewDefenseDraft({...complete,[f.id]:'  \n '}).missing.includes(f.label));});
test('every substantive field gets a located neutral keyword reminder without changing notes',()=>{
  for(const field of DEFENSE_FIELDS.filter(f=>f.id!=='owner')){
    const draft={...complete,[field.id]:'不能凭信度和加权就声称有代表性。'};
    const before=JSON.stringify(draft),result=reviewDefenseDraft(draft);
    assert.equal(result.warnings.length,2);assert(result.warnings.every(w=>w.includes(field.label)&&w.includes('否定句')));
    assert.equal(result.verified,false);assert.equal(JSON.stringify(draft),before);
  }
});
test('role labels alone are not treated as methodological claims',()=>{
  assert.deepEqual(reviewDefenseDraft({...complete,owner:'信效度与加权负责人'}).warnings,[]);
});
test('keyword reminders aggregate locations instead of repeating one warning per field',()=>{
  const result=reviewDefenseDraft({...complete,answer:'信度',evidence:'效度',nextStep:'拟检查稳健性'});
  assert.equal(result.warnings.length,1);for(const label of ['直接回应','证据定位','下一步核验或修复'])assert(result.warnings[0].includes(label));
});
test('each evidence state has an explicit scaffold, never an answer or verification result',()=>{
  assert.deepEqual(Object.keys(DEFENSE_SCAFFOLDS),['missing','documented','proposed']);
  for(const scaffold of Object.values(DEFENSE_SCAFFOLDS)){assert.equal(scaffold.steps.length,3);assert(scaffold.steps.every(s=>typeof s==='string'&&s.length>0));assert(!Object.hasOwn(scaffold,'answer'));assert(!Object.hasOwn(scaffold,'verified'));}
  assert.match(DEFENSE_SCAFFOLDS.missing.steps.join(''),/不补写/);
  assert.match(DEFENSE_SCAFFOLDS.documented.steps.join(''),/不等于已验证/);
  assert.match(DEFENSE_SCAFFOLDS.proposed.steps.join(''),/未知效果保持未知/);
});
test('the three new practice topics roundtrip with unverified notes and unchanged text',()=>{
  const ids=['exposure','contribution','mixed-evidence'],drafts=Object.fromEntries(ids.map(id=>[id,{...complete,answer:`模拟练习 ${id}，未核验`,evidenceState:'proposed'}]));
  const payload=defenseExport(corpus.cards,drafts,allocatePitch(600,30,PITCH_BLOCKS.map(p=>p.weight)),600,30,corpus.version);
  const parsed=parseDefenseImport(new TextEncoder().encode(JSON.stringify(payload)),corpus.cards,corpus.version);
  assert.deepEqual(parsed.cardIds,ids);assert.equal(parsed.corpusMismatch,false);
  for(const id of ids){assert.deepEqual(parsed.drafts[id],drafts[id]);assert.equal(reviewDefenseDraft(parsed.drafts[id]).verified,false);}
});
test('legacy ten-topic notes stay importable and flag the current corpus version mismatch',()=>{
  const ids=['decision','sampling','instrument','method','sample-unit','action','limitations','team','story','rehearsal'];
  const drafts=Object.fromEntries(ids.map(id=>[id,{...complete,answer:`旧笔记 ${id}`}]))
  const payload=defenseExport(corpus.cards.filter(c=>ids.includes(c.id)),drafts,allocatePitch(600,30,PITCH_BLOCKS.map(p=>p.weight)),600,30,'2026-09-30.1');
  const parsed=parseDefenseImport(new TextEncoder().encode(JSON.stringify(payload)),corpus.cards,corpus.version);
  assert.equal(parsed.corpusMismatch,true);assert.deepEqual(parsed.cardIds,ids);assert.equal(Object.keys(parsed.drafts).length,10);
  for(const id of ids)assert.deepEqual(parsed.drafts[id],drafts[id]);
});
test('timing allocation conserves every second at bounds and skewed weights',()=>{
  for(const total of [120,600,1800])for(const reserve of [0,30,90])for(const weights of [[1,1,1,1,1],[20,1,1,1,1],[12,18,40,24,6]]){
    const plan=allocatePitch(total,reserve,weights);assert.equal(plan.reduce((s,p)=>s+p.seconds,0),total-reserve);assert.equal(plan[0].start,0);assert.equal(plan.at(-1).end,total-reserve);plan.forEach((p,i)=>{assert(Number.isInteger(p.seconds));if(i)assert.equal(p.start,plan[i-1].end);});
  }
});
test('an extreme allocation cannot silently erase a required block',()=>{
  assert.throws(()=>allocatePitch(120,30,[100,100,100,100,1]),/不足 1 秒/);
  assert.throws(()=>allocatePitch(120,90,[100,1,1,1,1]),/不足 1 秒/);
});
test('custom weights survive the plan and export without reverting to defaults',()=>{
  const weights=[20,20,20,20,20],plan=allocatePitch(600,30,weights);
  assert.deepEqual(plan.map(p=>p.weight),weights);assert.deepEqual(plan.map(p=>p.seconds),[114,114,114,114,114]);
  const result=defenseExport(corpus.cards,{decision:complete},plan,600,30,corpus.version);
  assert.deepEqual(result.timing.plan.map(p=>p.weight),weights);
});
test('timing rejects invalid or zeroed weights and nonfinite durations',()=>{
  for(const args of [[NaN,0,[1,1,1,1,1]],[120,NaN,[1,1,1,1,1]],[119,0,[1,1,1,1,1]],[1801,0,[1,1,1,1,1]],[600,91,[1,1,1,1,1]],[600,30,[0,1,1,1,1]],[600,30,[Infinity,1,1,1,1]],[600,30,[1]]])assert.throws(()=>allocatePitch(...args));
});
test('export includes only known nonempty drafts and preserves proposal/unverified boundaries',()=>{
  const plan=allocatePitch(600,30,PITCH_BLOCKS.map(p=>p.weight));
  const result=defenseExport(corpus.cards,{decision:{...complete,evidenceState:'proposed'},sampling:EMPTY_DEFENSE_DRAFT,unknown:complete},plan,600,30,corpus.version);
  assert.equal(result.entries.length,1);assert.equal(result.entries[0].evidenceState,'proposed');assert.equal(result.entries[0].check.verified,false);assert.match(result.contentClass,/not_verified/);assert.match(result.timing.kind,/not_official_rule/);assert.equal(JSON.parse(JSON.stringify(result)).entries[0].answer,complete.answer);
  assert.equal(createHash('sha256').update(readFileSync(snapshot)).digest('hex').length,64);
});
