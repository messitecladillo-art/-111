import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {legacySource} from './helpers/legacy-source.mjs';
import { parseEvidence, evidenceSection, evidenceContract, linkEvidence, appendEvidence } from '../lib/research-flow.ts';
import { parseResearchLink } from '../lib/research-link.ts';
import { createEditorContent, EDITOR_LIMITS } from '../lib/editor-model.ts';

const hash='a'.repeat(64);
const binding=(column,type='single')=>({questionId:'q'+column,variable:'Q'+column,questionHash:hash,column,type,representation:'code',construct:type==='likert'?'scale':'',min:1,max:5,reverse:false,conditional:false});
const link=bindings=>({schema:'questionnaire-mapping/v1',questionnaireHash:hash,interpretationHash:hash,mappingHash:hash,bindings});
const frequency=()=>({version:1,sourceHash:hash,classification:'simulated',question:'样本结构如何？',variables:['渠道'],missingCodes:[],total:12,n:10,calculation:{method:'frequency',counts:[6,4],column:0}});
const alpha=()=>({...frequency(),classification:'user_provided',question:'一致性如何？',variables:['题项一','题项二'],missingCodes:['99'],calculation:{method:'alpha',columns:[0,1],reverse:[],min:1,max:5,itemVarianceSum:2,totalVariance:3}});
const counts=(questionId,eligibleAnswered,eligibleMissing=0,ineligibleBlank=0,ineligibleAnswered=0,unknownBlank=0,unknownAnswered=0)=>({questionId,eligibleAnswered,eligibleMissing,ineligibleBlank,ineligibleAnswered,unknownBlank,unknownAnswered});
const routing=()=>({schema:'row-eligibility/v1',policy:'exclude',totalRows:10,eligibleRows:6,ineligibleRows:3,unknownRows:1,contradictionRows:1,questionCounts:[counts('parent',9,1),counts('q0',4,2,2,1,1)]});
const conditionalLink=()=>link([{...binding(0),conditional:true}]);
const v3=()=>({...frequency(),version:3,total:6,n:4,calculation:{method:'frequency',counts:[3,1],column:0},link:conditionalLink(),eligibility:routing()});

test('v1/v2 normalized payload and proposal bytes match pre-change snapshots',()=>{
  const fixtures={v1Frequency:frequency(),v2Frequency:{...frequency(),version:2,link:link([binding(0)])},v1Alpha:alpha(),v2Alpha:{...alpha(),version:2,link:link([binding(0,'likert'),binding(1,'likert')])}};
  // Captured from the original implementations before the v3 change. These protect
  // persisted input/proposal hashes and durable-retry comparisons, not just wording.
  const expected={
    v1Frequency:['cd108b4c807428675528a2a99f2532f8bdc6943555ff9721e2f407202cb9efa3','b007d3c667402db931fea923281267948385a178856134ffc705d0a515d9f1b5'],
    v2Frequency:['bd9d0077f92bade49b98d0e453574927f3ed626d59451c9bccf2e8d85ed62428','5ba928f3611f69d970a0cd6e96d03eef139cb70530f615908f9ae1ea026a8d57'],
    v1Alpha:['98ae70488f0b01373a55db76f5a88e6af5189a608edd95fcdcb8440a2fe27703','47cb769af03641f2a3432f0ff85488eace86885629ac2ec98d262499944eae22'],
    v2Alpha:['303c3ad6ea0c938d012cc222d40874cb02a228f7d1349492f275e02ae49ac5dc','fe48c531096baab68d6eba401cc26698829c20ae8c4792c4b8306774730d1c78'],
  };
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for(const [name,input] of Object.entries(fixtures)){
    assert.equal(digest(parseEvidence(input)),expected[name][0],`${name} normalized payload changed`);
    assert.equal(digest(evidenceSection(input,'compatibility-id')),expected[name][1],`${name} proposal changed`);
  }
});

test('only v3 accepts conditional bindings and requires aggregate-only routing evidence',()=>{
  const input=v3();assert.deepEqual(parseEvidence(input),input);assert.equal(evidenceContract(input),'research-flow/v3');
  assert.throws(()=>parseResearchLink(input.link));assert.deepEqual(parseResearchLink(input.link,true),input.link);
  const withoutEligibility={...input};delete withoutEligibility.eligibility;
  assert.throws(()=>parseEvidence(withoutEligibility));assert.throws(()=>parseEvidence({...withoutEligibility,version:2}));
  assert.throws(()=>parseEvidence({...input,version:1}));assert.throws(()=>parseEvidence({...input,version:2}));
  assert.throws(()=>parseEvidence({...input,link:link([binding(0)])}));
  for(const patch of [{rows:[]},{eligibleIndices:[0]},{verified:true},{rawResponses:['private']},{hasConditions:true}])assert.throws(()=>parseEvidence({...input,eligibility:{...input.eligibility,...patch}}));
  for(const conditional of ['true',1,[],null])assert.throws(()=>parseResearchLink(link([{...binding(0),conditional}]),true));
});

test('v3 validates exact frequency denominator, all row buckets, QC policy, and selected IDs',()=>{
  const input=v3();
  for(const patch of [{n:3,calculation:{...input.calculation,counts:[2,1]}},{n:5,calculation:{...input.calculation,counts:[4,1]}},{total:7}])assert.throws(()=>parseEvidence({...input,...patch}));
  for(const patch of [{eligibleRows:5},{unknownRows:2},{contradictionRows:0},{policy:'strict'},{totalRows:5001},{totalRows:'10'},{questionCounts:[counts('not-selected',4,2,2,1,1)]}])assert.throws(()=>parseEvidence({...input,eligibility:{...input.eligibility,...patch}}));
  const extra=structuredClone(input);extra.eligibility.questionCounts[1].answers=['private'];assert.throws(()=>parseEvidence(extra));
  const strict={...input,eligibility:{...routing(),policy:'strict',ineligibleRows:4,unknownRows:0,contradictionRows:0,questionCounts:[counts('parent',10),counts('q0',4,2,4)]}};
  assert.deepEqual(parseEvidence(strict),strict);
});

test('alpha complete-case count obeys per-item answered upper and missing-union lower bounds',()=>{
  const input={...alpha(),version:3,total:6,n:4,link:link([0,1].map(column=>({...binding(column,'likert'),conditional:true}))),eligibility:{...routing(),questionCounts:[...routing().questionCounts,counts('q1',5,1,2,1,1)]}};
  assert.deepEqual(parseEvidence(input),input);
  assert.equal(parseEvidence({...input,n:3}).n,3);
  for(const n of [2,5,6])assert.throws(()=>parseEvidence({...input,n}));
  const unconditionedSecond=structuredClone(input);unconditionedSecond.link.bindings[1].conditional=false;
  assert.equal(parseEvidence(unconditionedSecond).version,3);
});

test('linkEvidence chooses v2/v3 explicitly, retains calculation binding order, and drops stale routing on relink',()=>{
  const input=v3(),bare={...frequency(),total:6,n:4,calculation:input.calculation};
  assert.deepEqual(linkEvidence(bare,input.link,input.eligibility),input);
  assert.throws(()=>linkEvidence(bare,input.link));
  const v2=linkEvidence(input,link([binding(0)]),null);assert.equal(v2.version,2);assert.equal(Object.hasOwn(v2,'eligibility'),false);
  assert.throws(()=>linkEvidence({...input,rows:['private']},link([binding(0)]),null));
  const a={...alpha(),version:3,total:6,n:4,link:link([0,1].map(column=>({...binding(column,'likert'),conditional:true}))),eligibility:{...routing(),questionCounts:[...routing().questionCounts,counts('q1',5,1,2,1,1)]}};
  assert.deepEqual(linkEvidence(a,{...a.link,bindings:[a.link.bindings[1],a.link.bindings[0]]},a.eligibility).link.bindings,a.link.bindings);
});

test('v3 report states original→eligible→analysis scope and never serializes local row identities',()=>{
  const input=v3(),section=evidenceSection(input,'synthetic');
  assert.match(section.body,/原始记录 10 行 → 所选题目共同符合显示条件 6 行 → 本次分析有效样本 4 行/);
  assert.match(section.body,/75.00%/);assert.match(section.body,/与前述排除计数重叠，不相加/);assert.match(section.body,/不把结构性跳过当作漏答、零值/);assert.match(section.body,/服务器未复核逐行分支/);
  assert.match(section.source,/research-flow\/v3/);assert.ok(!JSON.stringify(input).includes('eligibleIndices'));assert.ok(!JSON.stringify(input).includes('"rows"'));
  assert.ok(!section.body.includes('共读取 6 行'));
  const before=JSON.stringify(input);appendEvidence(createEditorContent(),section);assert.equal(JSON.stringify(input),before);
});

test('v3 maximum bounded alpha metadata and report fit editor body/source and request caps',t=>{
  const input={...alpha(),version:3,question:'问'.repeat(300),variables:Array.from({length:30},(_,i)=>`${i}`.padEnd(120,'题')),missingCodes:Array.from({length:20},(_,i)=>`${i}`.padEnd(40,'M')),total:5000,n:5000,
    calculation:{method:'alpha',columns:Array.from({length:30},(_,i)=>i),reverse:Array.from({length:30},(_,i)=>i),min:1,max:5,itemVarianceSum:30,totalVariance:120},
    link:link(Array.from({length:30},(_,i)=>({...binding(i,'likert'),variable:`Q${i}`.padEnd(32,'V'),questionId:`q${i}`.padEnd(64,'x'),construct:'构'.repeat(120),conditional:true,reverse:true}))),
    eligibility:{schema:'row-eligibility/v1',policy:'strict',totalRows:5000,eligibleRows:5000,ineligibleRows:0,unknownRows:0,contradictionRows:0,questionCounts:Array.from({length:80},(_,i)=>counts(`q${i}`.padEnd(64,'x'),5000))}};
  const normalized=parseEvidence(input),section=evidenceSection(normalized,'max');
  assert.ok(section.body.length<=EDITOR_LIMITS.body);assert.ok(section.source.length<=1500);
  const route=readFileSync(legacySource(new URL('../app/api/drafts/research-runs/route.ts',import.meta.url)),'utf8');
  const requestCap=Number(route.match(/readJsonObject\(request,(\d+)\)/)?.[1]);
  assert.equal(requestCap,96000);
  const requestBytes=value=>Buffer.byteLength(JSON.stringify({input:value,consent:true,id:'max',draftId:'draft',baseRevision:1}),'utf8');
  assert.ok(requestBytes(normalized)<requestCap,`Maximum bounded v3 request is ${requestBytes(normalized)} bytes; endpoint cap is ${requestCap}.`);
  // Existing text contracts permit lone UTF-16 surrogates. JSON escapes each as six
  // bytes, a larger transport bound than ordinary Chinese or supplementary characters.
  const escaped=structuredClone(input);escaped.question='\uD800'.repeat(300);escaped.variables=Array(30).fill('\uD800'.repeat(120));escaped.missingCodes=Array(20).fill('\uD800'.repeat(40));escaped.link.bindings.forEach(binding=>binding.construct='\uD800'.repeat(120));
  assert.ok(requestBytes(parseEvidence(escaped))<requestCap,`Escaped bounded request is ${requestBytes(escaped)} bytes.`);
  assert.doesNotThrow(()=>appendEvidence(createEditorContent(),evidenceSection(escaped,'max-escaped')));
  t.diagnostic(JSON.stringify({bodyCharacters:section.body.length,sourceCharacters:section.source.length,normalRequestBytes:requestBytes(normalized),escapedRequestBytes:requestBytes(escaped),requestCap}));
  assert.doesNotThrow(()=>appendEvidence(createEditorContent(),section));
  assert.throws(()=>parseEvidence({...input,total:5001}));assert.throws(()=>parseEvidence({...input,question:'问'.repeat(301)}));
});
