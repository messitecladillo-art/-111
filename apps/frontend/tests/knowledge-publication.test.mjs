import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assembleKnowledgePublication, currentKnowledgeEntries, exactKnowledgeEntry } from '../lib/knowledge/publication.ts';
const core=JSON.parse(await readFile(new URL('../content/knowledge/core-60.json',import.meta.url)));
test('new versions leave the exact older definition readable; same-version mutation is rejected',()=>{
  const changed={...core.entries[0],version:2,definition:'第二版教学解释。'};
  const next={schemaVersion:1,version:'next',entries:[changed]};
  const published=assembleKnowledgePublication('test',[core,next]);
  assert.equal(currentKnowledgeEntries(published).length,60);
  assert.equal(exactKnowledgeEntry(published,changed.id,1).definition,core.entries[0].definition);
  assert.equal(exactKnowledgeEntry(published,changed.id,2).definition,changed.definition);
  assert.equal(exactKnowledgeEntry(published,changed.id,3),undefined);
  assert.throws(()=>assembleKnowledgePublication('test',[core,{...next,entries:[{...changed,version:1}]}]),/Published version changed/);
});
test('drafts and falsely independent reviews cannot be published',()=>{
  for(const review of [{status:'draft',producer:'p'},{status:'reviewed',producer:'p',reviewer:'p',checkedAt:'2026-10-15'}]) assert.throws(()=>assembleKnowledgePublication('test',[{...core,entries:core.entries.map((entry,i)=>i===0?{...entry,review}:entry)}]));
});
test('separate releases preserve older endpoints and reject a rehashed same-version rewrite',()=>{
  const first=assembleKnowledgePublication('first',[core]);
  const changed={...core.entries[0],version:2,definition:'第二次发布的新解释。'};
  const second=assembleKnowledgePublication('second',[{schemaVersion:1,version:'next-only',entries:[changed]}],first);
  assert.equal(exactKnowledgeEntry(second,changed.id,1).definition,core.entries[0].definition);
  assert.equal(exactKnowledgeEntry(second,changed.id,2).definition,changed.definition);
  assert.equal(currentKnowledgeEntries(second).length,60);
  assert.throws(()=>assembleKnowledgePublication('third',[{schemaVersion:1,version:'rehash',entries:[{...changed,version:1}]}],second),/Published version changed/);
  assert.throws(()=>assembleKnowledgePublication('bad',[],{...first,entries:[...first.entries,first.entries[0]]}),/Duplicate archived/);
});
