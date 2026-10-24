import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { parseExamBank } from '../lib/net-exam-progress.ts';
// The historical bank is private operator material, never part of the public tree.
const bankPath=process.env.EVIX_NET_EXAM_BANK||fileURLToPath(new URL('../../../.local/net-exam-bank.json',import.meta.url));
const bank=existsSync(bankPath)?JSON.parse(readFileSync(bankPath,'utf8')):null;
const bankTest=(name,fn)=>test(name,{skip:bank?false:'private practice bank not present (set EVIX_NET_EXAM_BANK)'},fn);
test('public source tree does not ship the historical practice bank',()=>{
 assert.equal(existsSync(new URL('../data/net-exam-bank.json',import.meta.url)),false);
});
bankTest('private bank satisfies the served structural contract',()=>{assert.strictEqual(parseExamBank(bank),bank);});
bankTest('historical bank has source-keyed single, multiple and boolean contracts',()=>{
 assert.ok(bank.questions.length>100);assert.equal(bank.questions.length,bank.coverage.verifiedQuestions);
 assert.equal(bank.coverage.sourceFileCount,49);assert.equal(bank.coverage.timeoutSourceCount,2);assert.equal(bank.coverage.officialParameters,null);assert.deepEqual(bank.reviewItems,[]);
 assert.equal(new Set(bank.questions.map(q=>q.id)).size,bank.questions.length);
 const types=new Set();for(const q of bank.questions){types.add(q.type);assert.equal(q.answerStatus,'valid');assert.ok(q.stem&&q.options.length>=2);assert.equal(new Set(q.options.map(o=>o.id)).size,q.options.length);assert.ok(q.answer.every(a=>q.options.some(o=>o.id===a)));assert.equal(new Set(q.answer).size,q.answer.length);
 if(q.type==='multiple')assert.ok(q.answer.length>=2);else assert.equal(q.answer.length,1);
 if(q.type==='boolean')assert.deepEqual(q.options.map(o=>o.id),['true','false']);
 assert.equal(q.verification.basis,'explicit-source-key');assert.equal(q.verification.semanticReviewed,false);}
 assert.deepEqual([...types].sort(),['boolean','multiple','single']);
});
bankTest('included questions retain exact source and explicit answer locators',()=>{
 const sources=new Map(bank.sources.map(s=>[s.id,s]));
 for(const s of bank.sources){assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.ok(s.filename);assert.ok(!s.filename.includes('C:\\'));assert.equal(s.historical,true);}
 for(const q of bank.questions)for(const r of q.sourceRefs){assert.ok(sources.has(r.sourceId),q.id);assert.ok(r.locators.length,q.id);assert.ok(r.answerLocator&&r.locators.includes(r.answerLocator),q.id);}
 assert.equal(bank.coverage.sourceCoverage.length,51);assert.equal(new Set(bank.coverage.sourceCoverage.map(s=>s.sourceId)).size,51);
});
bankTest('display has no source answer leakage, separators or merged explanations',()=>{
 for(const q of bank.questions){assert.ok(!/答案\s*[:：]|题型\s*[:：]|\([A-H]{1,8}\)|^-{10,}|[EVev]\(\s*\)/u.test(q.stem),q.id);
 assert.ok(!q.sourceRefs.every(r=>bank.sources.find(s=>s.id===r.sourceId).format==='pdf'),q.id);
 for(const o of q.options)assert.ok(!/【解析】|试题解析|公众号|正确答案/u.test(o.text),q.id);}
});
bankTest('duplicate question numbering cannot overwrite explicit header key or missing formula',()=>{
 assert.ok(!bank.questions.some(q=>q.id==='exam-529e37a66402f4c2bc59'||q.id==='exam-74ca5f72e00e5baee26f'));
 const repaired=bank.questions.find(q=>q.stem.includes('第二季度平均人数')&&q.sourceRefs.some(r=>r.sourceId==='material-010'&&r.answerLocator==='word/document.xml#paragraph-6984'));
 assert.ok(repaired);assert.deepEqual(repaired.answer,['A']);assert.equal(repaired.options.find(o=>o.id==='A').text.replace(/\s/g,''),'2588人');assert.equal(Math.round((2510/2+2590+2614+2608/2)/3),2588);
 assert.equal(bank.coverage.sourceCoverage.find(s=>s.sourceId==='material-010').gridRejectedForAmbiguousScope,true);
});
test('parser fixtures cover inline, header, multiline, scoped grid, boolean, spreadsheet and conflict',()=>{
 const parser=fileURLToPath(new URL('../../../tools/build-net-exam-bank.py',import.meta.url));
 const fixture=fileURLToPath(new URL('./fixtures/net-exam-parser-fixtures.py',import.meta.url));
 const result=spawnSync(process.env.EVIX_PYTHON||(process.platform==='win32'?'python':'python3'),[fixture,parser],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},timeout:20000});
 assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/parser fixture checks passed/);
});

bankTest('knowledge tags are stable and content version includes normalized questions',()=>{
 const allowed=new Set(['市场调查基础','调查方案设计','调查与数据采集','问卷与量表','抽样与估计','描述统计','统计分析与推断','数据处理与报告','专项调研','综合练习']);
 for(const q of bank.questions)assert(allowed.has(q.chapter),q.chapter);
 assert(bank.questions.some(q=>q.sourceChapter&&q.sourceChapter!==q.chapter));
 const result=spawnSync(process.env.EVIX_PYTHON||(process.platform==='win32'?'python':'python3'),['-c',"import hashlib,json,sys;b=json.load(open(sys.argv[1],encoding='utf8'));print('historical-'+hashlib.sha256(json.dumps(b['questions'],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:16])",bankPath],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'},timeout:20000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),bank.version);
});

bankTest('located broken mathematics and suspected historical keys stay outside grading',()=>{
 const rejected=['exam-8d694bf1ee405bf5ccd3','exam-ae714dc14aa700ba09b4','exam-224d670e2e68a20fdfc5','exam-d74fe9bc5824c19b70ff','exam-41272649a9e5b6c76694','exam-727727e9ba10642d7926','exam-83d41164efd229b11396','exam-8506225c94c7fc4d02d4','exam-d068a8b2b129b12c6995','exam-90685e19faafde3de6dd','exam-c057a3c8d8f78f78c9d7','exam-c1d8293f2555ac221340','exam-ee070d894cb7113fcc5e','exam-db36e20847433531fd64','exam-313f33a153088271b796','exam-3f979b7ab77a482a52dc','exam-47236eafd3b05fef4501','exam-43f147ee2cac8473dab6','exam-8ad5f86699a8d49590af','exam-970d5942e17f2f5ef831','exam-ea7c503c7332627cac65','exam-fb0d4617cca6ee6fb5fd'];
 for(const id of rejected)assert(!bank.questions.some(q=>q.id===id),id);
});


bankTest('known missing choice-label variants are excluded while complete options remain',()=>{
 const bad=['exam-705ae1a697924c2b5509','exam-0999a3a30cb70879606b','exam-f830d76438c751075fe6'];
 for(const id of bad)assert(!bank.questions.some(q=>q.id===id),id);
 const good=bank.questions.filter(q=>q.stem.includes('样本优质品成数')&&q.options.length===4);
 assert(good.length>=2);for(const q of good)assert.deepEqual(q.answer,['B']);
 for(const q of bank.questions.filter(q=>q.type!=='boolean'&&q.options.length<4))
  assert(!q.options.some(o=>/\d+%\s+\d+%/.test(o.text)),q.id);
});


bankTest('ordinary answer prose is preserved and unchecked explanation stays private',()=>{
 const question=bank.questions.find(q=>q.sourceRefs.some(r=>r.sourceId==='material-042-member-e7241ed1c460'&&r.locators.includes('zip-member:专科随机100道题.xlsx/Sheet1!C23')));
 assert(question&&question.stem.includes('在两个极端之间划分若干阶段')&&question.stem.includes('这样的量表称为'));
 for(const q of bank.questions)assert(!Object.hasOwn(q,'explanation'),q.id);
 assert(!bank.questions.some(q=>q.id==='exam-42e9ab5dd33c51dfa152'||q.id==='exam-594716425334f0ab29d8'));
 assert(bank.questions.some(q=>q.id==='exam-21f9d949aea990b82fce'));
});


bankTest('newly restored historical stems cannot reintroduce located source defects',()=>{
 const rejected=['exam-7e63d28446b62697169e','exam-8c860b78d9edc70fb590','exam-dbb135551ba2f25ec409','exam-cfa62ce18021fc630a4e'];
 for(const id of rejected)assert(!bank.questions.some(q=>q.id===id),id);
});
