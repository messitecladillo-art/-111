import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { newQuestion, newQuestionnaire, exampleQuestionnaire } from '../lib/questionnaire.ts';
import { exportWjxBundle, reviewWjxExport, parseRoundTripManifest, WJX_EXPORT_SCHEMA } from '../lib/questionnaire-platform-export.ts';

function sample() {
  const design = newQuestionnaire();
  design.title = '门店体验调查';
  design.introduction = '参与自愿。\n不填写联系方式。';
  design.questions = [
    { ...newQuestion('screen', 'SCREEN'), text: '近期是否到店？', required: false, purpose: 'screening', choices: [{ code: '001', label: '到过' }, { code: 'none', label: '未到过' }] },
    { ...newQuestion('reasons', 'REASONS'), text: '选择这家店的原因有哪些？', type: 'multi', required: true, choices: [{ code: 'near', label: '交通方便' }, { code: 'cost', label: '价格合适' }] },
    { ...newQuestion('comments', 'COMMENTS'), text: '还有哪些改进建议？', type: 'text', condition: { questionId: 'screen', codes: ['001'] } },
    { ...newQuestion('visits', 'VISITS'), text: '近一个月到店多少次？', type: 'number', min: 0, max: 20 },
    { ...newQuestion('rating', 'RATING'), text: '请评价这次服务体验。', type: 'likert', min: -2, max: 2, minLabel: '非常不满意', maxLabel: '非常满意', reverse: true },
  ];
  return design;
}
const sha = text => createHash('sha256').update(text,'utf8').digest('hex');
const json = value => JSON.stringify(value,null,2);

test('question-only import text preserves all five current types without inserting internal fields', async () => {
  const design = sample(), before = json(design);
  const { text, manifest, settings, review } = await exportWjxBundle(design,{sourceRevision:17});
  assert.equal(text, [
    '1. 近期是否到店？\n到过\n未到过',
    '2. 选择这家店的原因有哪些？[多选题]\n交通方便\n价格合适',
    '3. 还有哪些改进建议？',
    '4. 近一个月到店多少次？',
    '5. 请评价这次服务体验。\nA. -2 — 非常不满意\nB. -1\nC. 0\nD. 1\nE. 2 — 非常满意',
  ].join('\n\n')+'\n');
  assert.equal(json(design),before);
  assert.equal(manifest.schema,WJX_EXPORT_SCHEMA);
  assert.equal(manifest.source.revision,17);
  assert.deepEqual(manifest.source.questionnaire,design);
  assert.equal(manifest.text.sha256,sha(text));
  assert.equal(manifest.reference.runtimeVerified,false);
  assert.deepEqual(review.blockers,[]);
  assert.equal(settings.filter(x=>x.code==='required').length,5);
  assert.ok(settings.find(x=>x.code==='required'&&x.questionId==='screen').message.includes('选答'));
  assert.ok(settings.find(x=>x.code==='required'&&x.questionId==='reasons').message.includes('必答'));
  assert.ok(settings.find(x=>x.code==='condition').message.includes('选项 1「到过」（原编码 001）'));
  assert.ok(settings.find(x=>x.code==='number-validation').message.includes('0 至 20'));
  assert.ok(settings.find(x=>x.code==='likert-scoring').message.includes('反向计分只在分析端处理'));
  assert.ok(!text.includes(design.title)); assert.ok(!text.includes(design.introduction));
  assert.ok(!text.includes('SCREEN')); assert.ok(!text.includes('原编码'));
});

test('manifest retains stable IDs, arbitrary original codes and current question/option order',async()=>{
  const design=sample();
  [design.questions[0].choices[0],design.questions[0].choices[1]]=[design.questions[0].choices[1],design.questions[0].choices[0]];
  const bundle=await exportWjxBundle(design);
  assert.deepEqual(bundle.manifest.questions[0].options.map(x=>[x.order,x.originalCode,x.label]),[[1,'none','未到过'],[2,'001','到过']]);
  assert.deepEqual(bundle.manifest.questions.map(q=>[q.platformNumber,q.questionId,q.variable]),[[1,'screen','SCREEN'],[2,'reasons','REASONS'],[3,'comments','COMMENTS'],[4,'visits','VISITS'],[5,'rating','RATING']]);
  assert.ok(bundle.settings.find(x=>x.code==='condition').message.includes('选项 2「到过」'));
  const reordered=sample();
  [reordered.questions[0],reordered.questions[1]]=[reordered.questions[1],reordered.questions[0]];
  const next=await exportWjxBundle(reordered);
  assert.equal(next.manifest.questions.find(q=>q.questionId==='screen').platformNumber,2);
  assert.ok(next.settings.find(x=>x.code==='condition').message.includes('第 2 题选择'));
  assert.notEqual(next.manifest.source.questionnaireHash,bundle.manifest.source.questionnaireHash);
});

test('every allowed Likert score is kept as an explicit label including zero/negative origins',async()=>{
  for(const [min,max] of [[1,5],[0,10],[-7,7]]){
    const d=sample(); Object.assign(d.questions[4],{min,max});
    const {manifest}=await exportWjxBundle(d);
    const q=manifest.questions[4];
    assert.equal(q.originalType,'likert');assert.equal(q.platformType,'single');
    assert.deepEqual(q.options.map(x=>x.originalScore),Array.from({length:max-min+1},(_,i)=>min+i));
    assert.deepEqual(q.options.map(x=>x.originalCode),Array.from({length:max-min+1},(_,i)=>String(min+i)));
    assert.deepEqual(q.scoring,{min,max,minLabel:'非常不满意',maxLabel:'非常满意',reverse:true});
  }
});

test('Unicode and literal text are retained; only boundary whitespace is trimmed',async()=>{
  const d=sample();d.questions[0].text='  您会选择哪家咖啡店？☕️  ';d.questions[0].choices[0].label='  和家人👨‍👩‍👧‍👦同行  ';
  const bundle=await exportWjxBundle(d);
  assert.ok(bundle.text.includes('1. 您会选择哪家咖啡店？☕️\n和家人👨‍👩‍👧‍👦同行'));
  assert.equal(bundle.manifest.source.questionnaire.questions[0].choices[0].label,'  和家人👨‍👩‍👧‍👦同行  ');
  assert.equal(bundle.manifest.questions[0].stem,'您会选择哪家咖啡店？☕️');
  assert.equal(bundle.manifest.questions[0].options[0].label,'和家人👨‍👩‍👧‍👦同行');
});

test('ambiguous line breaks, directives and leading numbers block export instead of silent rewriting',async()=>{
  const bad=['未配对\ud800字符','未配对\udfff字符','第一行\n2. 注入题目','第一行\r第二行','第一行\u2028第二行','第一行\u2029第二行','含\t制表符','含\u200b隐藏字符','问题[多选题]','问题［矩阵题］','问题【量表题】','输入____内容','1. 自带题号','１．全角题号','A. 自带选项','第二题 问题'];
  for(const value of bad){
    const d=sample();d.questions[0].text=value;
    const before=json(d), review=reviewWjxExport(d);
    assert.ok(review.blockers.some(x=>x.questionId==='screen'),value);
    await assert.rejects(()=>exportWjxBundle(d),/未生成|无法|文本/);
    assert.equal(json(d),before);
  }
  for(const value of ['2. another question','B、选项标号','任意[未知参数]','含\n换行']){
    const d=sample();d.questions[0].choices[0].label=value;
    assert.ok(reviewWjxExport(d).blockers.some(x=>x.field==='选项 1'));
    await assert.rejects(()=>exportWjxBundle(d));
  }
  const d=sample();d.questions[4].maxLabel='很满意[量表题]';
  assert.ok(reviewWjxExport(d).blockers.some(x=>x.field==='上限锚点'));
});

test('structural blockers reject the whole package with actionable question locations',async()=>{
  for(const mutate of [d=>d.questions[0].text='',d=>d.questions[1].choices=[],d=>d.questions[4].min=null,d=>d.questions[3].min=30,d=>d.questions[1].variable='SCREEN',d=>d.questions[2].condition={questionId:'rating',codes:['1']}]){
    const d=sample();mutate(d);
    assert.ok(reviewWjxExport(d).blockers.length);
    await assert.rejects(()=>exportWjxBundle(d));
  }
  const empty=sample();empty.questions=[];
  assert.ok(reviewWjxExport(empty).blockers.some(x=>x.code==='empty'));await assert.rejects(()=>exportWjxBundle(empty));
  const invalid=sample();invalid.questions[0].id='invalid id';
  assert.equal(reviewWjxExport(invalid).blockers[0].code,'invalid-design');
});

test('all exported data is captured before async hashing and later source edits do not change the package',async()=>{
  const d=sample(), old=json(d), pending=exportWjxBundle(d,{sourceRevision:3});
  d.questions[0].text='修改后的题干';d.questions[0].choices[0].code='changed';d.title='新名称';
  const bundle=await pending;
  assert.equal(json(bundle.manifest.source.questionnaire),old);
  assert.ok(bundle.text.includes('近期是否到店？'));assert.ok(!bundle.text.includes('修改后的题干'));
  assert.equal(bundle.manifest.source.revision,3);
});

test('original roundtrip manifest restores only exact versioned content and supports BOM/key order',async()=>{
  const d=sample(),bundle=await exportWjxBundle(d,{sourceRevision:0});
  assert.deepEqual(await parseRoundTripManifest(json(bundle.manifest),d),bundle.manifest);
  assert.deepEqual(await parseRoundTripManifest('\ufeff'+json(bundle.manifest)),bundle.manifest);
  const reversed=Object.fromEntries(Object.entries(bundle.manifest).reverse());
  assert.deepEqual(await parseRoundTripManifest(json(reversed)),bundle.manifest);
  const different=sample();different.questions[0].text='后来修改';
  await assert.rejects(()=>parseRoundTripManifest(json(bundle.manifest),different),/当前问卷版本不一致/);
});

test('manifest rejects hash/content/order/score edits and unknown or missing fields at every level',async()=>{
  const {manifest}=await exportWjxBundle(sample());
  const changes=[
    m=>m.extra=true,m=>delete m.settings,m=>m.source.extra=true,m=>delete m.source.revision,
    m=>m.source.questionnaireHash='0'.repeat(64),m=>m.source.revision=12,m=>m.manifestSha256='0'.repeat(64),m=>m.text.sha256='f'.repeat(64),m=>m.text.newline='CRLF',
    m=>m.questions[0].extra=true,m=>m.questions[0].platformNumber=9,m=>m.questions[0].questionId='unknown',
    m=>m.questions[0].options[0].originalCode='9',m=>m.questions[0].options[0].extra=true,
    m=>m.questions[4].scoring.min=1,m=>m.questions[4].options[0].originalScore=1,
    m=>m.questions.reverse(),m=>m.settings[0].message='已确认',m=>m.reference.runtimeVerified=true,
    m=>m.source.questionnaire.questions[0].text='篡改快照',m=>m.target='tencent',m=>m.schema='questionnaire-platform-export/v2',
  ];
  for(const mutate of changes){const value=structuredClone(manifest);mutate(value);await assert.rejects(()=>parseRoundTripManifest(json(value)));}
});

test('duplicate JSON members, malformed/deep/oversized inputs and invalid revisions fail closed',async()=>{
  const {manifest}=await exportWjxBundle(sample());
  const duplicate=json(manifest).replace('"target": "wjx"','"target":"wjx", "target":"wjx"');
  await assert.rejects(()=>parseRoundTripManifest(duplicate),/重复字段/);
  for(const raw of ['', '{', '[]','null','1',json({schema:WJX_EXPORT_SCHEMA}), ' '.repeat(2_000_001)])await assert.rejects(()=>parseRoundTripManifest(raw));
  for(const sourceRevision of [-1,1.2,Number.MAX_SAFE_INTEGER+1,'1',NaN,Infinity])await assert.rejects(()=>exportWjxBundle(sample(),{sourceRevision}),/修订号/);
  const polluted=json(manifest).replace('"target": "wjx"','"target": "wjx", "__proto__":{"polluted":true}');
  await assert.rejects(()=>parseRoundTripManifest(polluted));assert.equal({}.polluted,undefined);
});

test('expected questionnaire is captured before digest verification',async()=>{
  const d=sample(),{manifest}=await exportWjxBundle(d);
  const pending=parseRoundTripManifest(json(manifest),d);d.title='new title';
  assert.deepEqual(await pending,manifest);
});

test('maximum existing questionnaire capacity preserves 80 questions and 30 options per question',async()=>{
  const d=newQuestionnaire();
  d.questions=Array.from({length:80},(_,i)=>({...newQuestion(`item-${i}`,`Q${i+1}`),text:`研究问题 ${i+1} 是什么？`,type:i%2?'multi':'single',choices:Array.from({length:30},(_,j)=>({code:`option_${j+1}`,label:`备选内容 ${j+1}`}))}));
  const bundle=await exportWjxBundle(d,{sourceRevision:80});
  assert.equal(bundle.manifest.questions.length,80);
  assert.equal(bundle.manifest.questions.at(-1).platformNumber,80);
  assert.ok(bundle.manifest.questions.every(q=>q.options.length===30));
  assert.ok(Buffer.byteLength(json(bundle.manifest),'utf8')<2_000_000);
  assert.deepEqual(await parseRoundTripManifest(json(bundle.manifest),d),bundle.manifest);
});

test('existing teaching questionnaire passes exporter structural review without changing its draft',async()=>{
  const d=exampleQuestionnaire(),before=json(d),bundle=await exportWjxBundle(d);
  assert.equal(bundle.manifest.questions.length,3);assert.equal(json(d),before);
});

test('numeric Likert options use explicit letter prefixes to avoid WJX question splitting',async()=>{
  const d=sample();const bundle=await exportWjxBundle(d);const q=bundle.manifest.questions[4];
  assert.deepEqual(q.options.map(o=>o.importLabel),['A. -2 — 非常不满意','B. -1','C. 0','D. 1','E. 2 — 非常满意']);
  assert.deepEqual(q.options.map(o=>o.originalScore),[-2,-1,0,1,2]);
  assert.deepEqual(q.options.map(o=>o.label),['-2 — 非常不满意','-1','0','1','2 — 非常满意']);
  assert.deepEqual(bundle.manifest.questions[0].options.map(o=>o.importLabel),['到过','未到过']);
  assert.deepEqual(await parseRoundTripManifest(JSON.stringify(bundle.manifest),d),bundle.manifest);
});

test('custom single/multi numeric-start options fail closed without rewriting the draft',async()=>{
  const values=['0','1','10','-2','+3','0.5','.5','-.5','1e3','-1E-3','−2','０','－２','＋０．５','2%','24小时','18–25岁','- 2','  0  '];
  for(const type of ['single','multi'])for(const label of values){
    const d=sample();d.questions[0].type=type;d.questions[0].choices[0].label=label;d.questions[2].condition=null;
    const before=json(d),review=reviewWjxExport(d);
    assert.ok(review.blockers.some(issue=>issue.code==='numeric-option-prefix'&&issue.questionId==='screen'&&issue.questionNumber===1&&issue.field==='选项 1'),`${type}: ${label}`);
    await assert.rejects(()=>exportWjxBundle(d),/以数值开头/);
    assert.equal(json(d),before);
  }
});

test('non-numeric custom labels and all 30 option positions retain their exact text',async()=>{
  for(const type of ['single','multi']){
    const d=sample();d.questions[0].type=type;d.questions[2].condition=null;
    d.questions[0].choices=Array.from({length:30},(_,i)=>({code:i===0?'001':`n${i}`,label:i===29?'次数：0':`组别 ${i+1}`}));
    const bundle=await exportWjxBundle(d);
    assert.deepEqual(bundle.manifest.questions[0].options.map(option=>option.importLabel),d.questions[0].choices.map(option=>option.label));
    assert.deepEqual(bundle.manifest.source.questionnaire,d);
    assert.deepEqual(await parseRoundTripManifest(json(bundle.manifest),d),bundle.manifest);
    d.questions[0].choices[29].label='0';
    assert.ok(reviewWjxExport(d).blockers.some(issue=>issue.code==='numeric-option-prefix'&&issue.field==='选项 30'));
    await assert.rejects(()=>exportWjxBundle(d),/选项 30以数值开头/);
  }
});
