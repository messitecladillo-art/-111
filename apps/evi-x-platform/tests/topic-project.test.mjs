import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyTopicProject, parseTopicProjectDocument, parseTopicHead, parseTopicVersionResponse, parseTopicHistory, topicDocumentsEqual, prepareTopicSave, recoverTopicProjectDraft, canConfirmTopic, adoptTopicRecommendation, adoptTopicCandidate } from '../lib/topic-project.ts';
import { parseTopicBundle } from '../lib/topic-advisor/parse.ts';
import { recommendTopics, evaluateCandidate } from '../lib/topic-advisor/core.ts';
import { EMPTY_TOPIC_CANDIDATE } from '../lib/topic-advisor/types.ts';

const json=name=>JSON.parse(fs.readFileSync(new URL(`../content/topic-advisor/${name}.json`,import.meta.url),'utf8'));
const bundle=parseTopicBundle({catalog:json('catalog'),sources:json('sources'),model:json('ranker'),events:json('hotspot-events')});
const summary=(revision=1)=>({id:`v-${revision}`,revision,contentHash:'a'.repeat(64),createdAt:'2026-10-15T08:00:00Z',createdBy:'account-a'});
const draft=()=>emptyTopicProject('2026-10-15');
const decision={revision:0,status:'draft',versionId:null,contentHash:null};

test('empty project and brief are saveable drafts without inferred facts',()=>{
  const d=draft();assert.deepEqual(parseTopicProjectDocument(d),d);assert.equal(d.candidate,null);assert.equal(d.selected,null);assert.equal(canConfirmTopic(d).length,6);
  assert.deepEqual(parseTopicHead({head:null,document:null,decision,canEdit:true}),{head:null,document:null,decision,canEdit:true});
});
test('exact editable text, Unicode and array order survive round trip while key order is irrelevant',()=>{
  const d=draft();d.brief.title='  武汉研究 🧭  ';d.brief.questions=[{id:'rq-1',text:' 第一行\n第二行 '},{id:'rq-2',text:'另一个问题'}];
  const before=structuredClone(d),received=parseTopicProjectDocument(d);assert.deepEqual(received,before);assert.equal(topicDocumentsEqual(d,{...d,brief:Object.fromEntries(Object.entries(d.brief).reverse())}),true);
  assert.equal(topicDocumentsEqual(d,{...d,brief:{...d.brief,questions:[...d.brief.questions].reverse()}}),false);assert.deepEqual(d,before);
});
test('question, construct and source references are validated rather than silently repaired',()=>{
  const d=draft();d.brief.questions=[{id:'rq-1',text:''}];d.brief.constructs=[{id:'c-1',name:'意愿',questionIds:['rq-missing']}];assert.throws(()=>parseTopicProjectDocument(d),/研究问题不存在/);
  d.brief.constructs=[];d.verification=[{id:'t-1',title:'验证',status:'planned',note:'',sourceRefs:['missing'],recordedAt:null}];assert.throws(()=>parseTopicProjectDocument(d),/来源不存在/);
  d.verification=[];d.provenance.sourceIds=['missing'];assert.throws(()=>parseTopicProjectDocument(d),/来源版本引用不存在/);
});
test('strict root fields, prototype-like IDs, duplicate IDs and unsupported values are rejected',()=>{
  assert.throws(()=>parseTopicProjectDocument({...draft(),approved:true}));const d=draft();d.brief.questions=[{id:'constructor',text:'问题'}];assert.throws(()=>parseTopicProjectDocument(d));
  d.brief.questions=[{id:'same',text:'一'},{id:'same',text:'二'}];assert.throws(()=>parseTopicProjectDocument(d),/标识重复/);
  d.brief.questions=[];d.verification=[{id:'v',title:'验证',status:'success',note:'',sourceRefs:[],recordedAt:null}];assert.throws(()=>parseTopicProjectDocument(d),/验证状态无效/);
});
test('source snapshots only accept ordinary URLs and never carry local paths',()=>{
  const d=draft();d.brief.sources=[{id:'s',title:'资料',url:'file:///private/source.pdf',locator:'第2页',coverage:'reference',publishedAt:'',retrievedAt:''}];assert.throws(()=>parseTopicProjectDocument(d),/来源链接无效/);
  d.brief.sources[0].url='https://example.org/source';assert.equal(parseTopicProjectDocument(d).brief.sources[0].url,d.brief.sources[0].url);
  d.brief.sources[0].publishedAt='2026-02-30';assert.throws(()=>parseTopicProjectDocument(d),/日期无效/);
  d.brief.sources[0].publishedAt='';d.brief.sources[0].path='private.pdf';assert.throws(()=>parseTopicProjectDocument(d));
});
test('adoption creates independent stable question IDs and planned tasks without fabricating verification',()=>{
  const d=draft();d.profile.region='湖北';d.profile.city='武汉';const item=recommendTopics(d.profile,bundle,6).items[0];const original=structuredClone(d);
  const adopted=adoptTopicRecommendation(d,item,d.profile,bundle);assert.deepEqual(d,original);assert.equal(adopted.selected.id,item.patternId);assert.ok(adopted.shortlistIds.includes(item.patternId));
  assert.ok(adopted.brief.questions[0].id.startsWith('rq-'));assert.equal(adopted.brief.questions[0].text,item.question);assert.ok(adopted.verification.every(v=>v.status==='planned'&&v.note===''&&v.recordedAt===null));
  assert.ok(adopted.brief.sources.every(s=>!('path'in s)));assert.deepEqual(parseTopicProjectDocument(adopted),adopted);
  const again=adoptTopicRecommendation(adopted,item,d.profile,bundle);assert.equal(again.brief.questions[0].id,adopted.brief.questions[0].id);
});
test('custom topic keeps its text and does not insert an evaluation pseudo ID into shortlist',()=>{
  const d=draft();d.shortlistIds=['existing'];const c={...structuredClone(EMPTY_TOPIC_CANDIDATE),title:' 自拟武汉服务题目 ',decision:'决定优先改哪项服务',decisionOwner:'拟沟通的社区',population:'居民',geography:'武汉',evidencePlan:'先核对渠道',differentiators:['场景差异']};
  const result=evaluateCandidate(c,d.profile,bundle);const next=adoptTopicCandidate(d,c,result,bundle);assert.equal(next.selected.kind,'custom');assert.equal(next.brief.title,c.title);assert.deepEqual(next.shortlistIds,['existing']);assert.deepEqual(parseTopicProjectDocument(next),next);
});
test('saved payload is frozen and unknown retry can reuse exact idempotency payload despite new editing',()=>{
  const d=draft();d.brief.title='保存前';const request=prepareTopicSave(d,2,'request-1');d.brief.title='保存后';assert.equal(request.document.brief.title,'保存前');assert.equal(request.expectedRevision,2);assert.equal(request.idempotencyKey,'request-1');
  assert.deepEqual(prepareTopicSave(request.document,request.expectedRevision,request.idempotencyKey),request);assert.throws(()=>prepareTopicSave(d,-1,'r'));
});
test('version and decision receipts are exact, complete and distinct from imported content',()=>{
  const document=draft(),version=summary();const confirmed={revision:1,status:'confirmed',versionId:version.id,contentHash:version.contentHash};assert.equal(parseTopicVersionResponse({version,document,decision:confirmed}).decision.status,'confirmed');
  assert.throws(()=>parseTopicHead({head:version,document:null,decision,canEdit:true}));assert.throws(()=>parseTopicHead({head:version,document,decision:{...confirmed,contentHash:null},canEdit:true}));assert.throws(()=>parseTopicVersionResponse({version,document,decision,canEdit:true}));
  assert.deepEqual(parseTopicHistory({versions:[summary(2),summary(1)],nextBefore:1}).versions.map(v=>v.revision),[2,1]);assert.throws(()=>parseTopicHistory({versions:[summary(1),summary(2)],nextBefore:null}));
});
test('verification can record disconfirming evidence without changing the original study question',()=>{
  const d=draft();d.brief.questions=[{id:'rq',text:'原研究问题'}];d.verification=[{id:'t',title:'联系渠道',status:'not_supported',note:'实际联系后无法进入该场所',sourceRefs:[],recordedAt:'2026-10-15T16:00:00+08:00'}];
  const next=parseTopicProjectDocument(d);assert.equal(next.verification[0].status,'not_supported');assert.equal(next.brief.questions[0].text,'原研究问题');
  next.verification[0].recordedAt='2026-10-15T16:00:00';assert.throws(()=>parseTopicProjectDocument(next),/时间无效/);
});
test('project candidate uses full backend field limits and preserves whitespace instead of legacy normalization',()=>{
  const d=draft();d.candidate={...structuredClone(EMPTY_TOPIC_CANDIDATE),title:'  草稿  ',decision:'决'.repeat(600),population:'人'.repeat(300),geography:'地'.repeat(160),action:'行'.repeat(600)};d.profile.days=0;d.profile.school='  学校  ';
  assert.deepEqual(parseTopicProjectDocument(d),d);for(const key of['decision','population','geography','action']){const invalid=structuredClone(d);invalid.candidate[key]+='多';assert.throws(()=>parseTopicProjectDocument(invalid));}
});
test('unfinished source URL/date and profile date remain recoverable in an owner memory draft',()=>{
  const d=draft();d.profile.referenceDate='2026-10-';d.brief.sources=[{id:'s',title:'',url:'https://',locator:'尚未输入完',coverage:'reference',publishedAt:'2026-10-',retrievedAt:''}];
  assert.deepEqual(recoverTopicProjectDraft(d),d);assert.throws(()=>parseTopicProjectDocument(d));assert.throws(()=>recoverTopicProjectDraft({...d,extra:true}));
});
test('overlong user-editable strings remain recoverable while strict save reports invalid fields',()=>{
  const d=draft();d.brief.title='不可丢弃的简报';d.profile.interests=['兴'.repeat(61)];d.brief.differentiators=['差'.repeat(601)];
  assert.deepEqual(recoverTopicProjectDraft(d),d);assert.throws(()=>prepareTopicSave(d,0,'request'));assert.equal(topicDocumentsEqual(d,d),false);
});
test('enum parsers reject array-to-string coercion',()=>{
  const d=draft();d.brief.sources=[{id:'s',title:'来源',url:'',locator:'',coverage:['reference'],publishedAt:'',retrievedAt:''}];assert.throws(()=>parseTopicProjectDocument(d));
  d.brief.sources=[];d.verification=[{id:'t',title:'任务',status:['planned'],note:'',sourceRefs:[],recordedAt:null}];assert.throws(()=>parseTopicProjectDocument(d));
  assert.throws(()=>parseTopicHead({head:null,document:null,decision:{...decision,status:['draft']},canEdit:true}));
});
