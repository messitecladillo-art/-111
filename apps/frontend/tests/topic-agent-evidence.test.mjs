import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTopicProject, parseTopicProjectDocument, prepareTopicSave, withTopicAgentEvidence, recoverTopicProjectDraft } from '../lib/topic-project.ts';

const id = 'lookup-89a51370-8659-4ce8-858a-a9aab9a9a7bb-0';
const excerpt = () => ({id,title:'武汉公共服务研究线索 🧭',url:'https://example.test/wuhan',coverage:'search_excerpt',locator:'检索回执：89a51370-8659-4ce8-858a-a9aab9a9a7bb\n查询：武汉 就业 政策 公开数据',retrievedAt:'2026-10-19T01:23:45.123456+00:00',snippet:'合成测试片段：仅用于验证来源记录，不代表实际政策。',limitations:['搜索片段，尚未核对原文与事件日期']});
const draft = () => emptyTopicProject('2026-10-19');

test('adopted cited excerpt retains exact text/query/receipt/time without promotion to fulltext',()=>{
  const input=draft(), row=excerpt(), before=structuredClone(input);
  const adopted=withTopicAgentEvidence(input,[id],[row,{...row,id:'uncited',title:'未引用的资料'}]);
  assert.deepEqual(input,before);
  assert.deepEqual(adopted.provenance.sourceIds,[id]);
  assert.equal(adopted.brief.sources.length,1);
  const s=adopted.brief.sources[0];
  assert.equal(s.coverage,'search_excerpt');assert.equal(s.snippet,row.snippet);
  assert.equal(s.retrievedAt,'2026-10-19');
  assert.ok(s.locator.includes('武汉 就业 政策 公开数据'));
  assert.ok(s.locator.includes(row.retrievedAt));
  assert.deepEqual(parseTopicProjectDocument(JSON.parse(JSON.stringify(adopted))),adopted);
  assert.deepEqual(recoverTopicProjectDraft(adopted),adopted);
  assert.deepEqual(prepareTopicSave(adopted,0,crypto.randomUUID()).document.brief.sources,[s]);
});

test('unresolved or duplicate citations reject the whole adoption before changing the brief',()=>{
  const d=draft(), before=structuredClone(d);
  for(const [ids,rows] of [[[id,'missing'],[excerpt()]],[[id,id],[excerpt()]],[[id],[excerpt(),excerpt()]],[[],[excerpt()]]]) assert.throws(()=>withTopicAgentEvidence(d,ids,rows));
  assert.deepEqual(d,before);
});

test('snapshot bounds preserve allowed long URL and full Unicode excerpt, reject oversized or unsafe URL',()=>{
  const s=excerpt();s.url='https://example.test/'+ 'x'.repeat(2048-'https://example.test/'.length);s.snippet='🧭'.repeat(2000);s.title='🧭'.repeat(200);s.locator='🧭'.repeat(700);
  const source=withTopicAgentEvidence(draft(),[id],[s]).brief.sources[0];
  assert.equal(source.url.length,2048);assert.equal(source.snippet.length,4000);
  assert.ok(source.title.length<=300);assert.ok(source.locator.length<=1000);assert.doesNotMatch(source.title,/[\uD800-\uDBFF]$/);
  assert.throws(()=>withTopicAgentEvidence(draft(),[id],[{...s,url:s.url+'x'}]));
  assert.throws(()=>withTopicAgentEvidence(draft(),[id],[{...s,url:'javascript:alert(1)'}]));
  assert.throws(()=>withTopicAgentEvidence(draft(),[id],[{...s,snippet:s.snippet+'x'}]));
  assert.throws(()=>withTopicAgentEvidence(draft(),[id],[{...s,retrievedAt:'2026-02-30T00:00:00Z'}]));
});

test('older source records without snippet retain exact semantics; new snippets remain strict',()=>{
  const d=draft();d.brief.sources=[{id:'old-source',title:'原有参考资料',url:'',locator:'第2页',coverage:'reference',publishedAt:'',retrievedAt:''}];
  assert.deepEqual(parseTopicProjectDocument(d),d);
  assert.throws(()=>parseTopicProjectDocument({...d,brief:{...d.brief,sources:[{...d.brief.sources[0],snippet:{unsafe:true}}]}}));
});
