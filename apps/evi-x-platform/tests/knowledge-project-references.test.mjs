import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createKnowledgeAccountSync, knowledgeAccountCacheKey } from '../lib/knowledge/account-sync.ts';

// Bundle the actual TSX production exports; React/UI hooks are not invoked in
// these protocol tests. Only Next navigation and CSS presentation are stubbed.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=`export {createKnowledgeReferenceController,checkedArchivedEntry} from './components/knowledge/KnowledgeProjectReferences.tsx';
export {clearPreviousKnowledgeCache} from './components/hosted/HostedSession.tsx';
export {accountBoundRecoveryStorage} from './components/knowledge/useKnowledgeAccount.ts';`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'reference-contract-tests.mjs'},bundle:true,format:'esm',platform:'node',write:false,alias:{'@':root,'@evix/shared':path.resolve(root,'../../packages/evi-x-shared/src/index.ts')},plugins:[{name:'presentation-only-stubs',setup(builder){builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'test-ui'}));builder.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'test-ui'}));builder.onLoad({filter:/.*/,namespace:'test-ui'},args=>({loader:'js',contents:args.path==='css'?'export default {}':'export const usePathname=()=>""; export const useRouter=()=>({push(){}});'}));}}]});
const {createKnowledgeReferenceController,checkedArchivedEntry,clearPreviousKnowledgeCache,accountBoundRecoveryStorage}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const project='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',rid='cccccccc-cccc-cccc-cccc-cccccccccccc';
const entryRef={id:'p-value',version:1},ref={id:rid,entryId:'p-value',entryVersion:1,createdBy:owner,createdAt:'2026-10-15T00:00:00Z'};
const wire=(revision=0,references=[])=>({revision,references});
const keys=()=>{let n=0;return()=>`dddddddd-dddd-dddd-dddd-${String(++n).padStart(12,'0')}`;};
const error=(status,code)=>Object.assign(new Error(code),{status,code});
const storage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};

test('project references bind exact numeric versions, duplicate additions do not dispatch, and deletion has its own receipt',async()=>{
  const calls=[];let server=wire();let pending;
  const c=createKnowledgeReferenceController({projectId:project,createId:keys(),savePending:value=>pending=value,request:async(url,body,method)=>{calls.push({url,body,method});if(method==='POST')server=wire(1,[ref]);if(method==='DELETE')server=wire(2);return server;}});
  await c.reload();await c.add(entryRef);await c.add(entryRef);assert.equal(calls.filter(x=>x.method==='POST').length,1);assert.equal(calls[1].body.entryVersion,1);assert.equal(calls[1].body.expectedRevision,0);assert.equal(pending,null);
  await c.remove(rid);assert.equal(calls[2].method,'DELETE');assert.equal(calls[2].url,`/api/projects/${project}/knowledge-references/${rid}`);assert.equal(calls[2].body.expectedRevision,1);assert.deepEqual(c.getSnapshot().references,[]);c.dispose();
});
test('unknown reference keeps the same intent and idempotency key; reconciliation reads latest state after historical receipt',async()=>{
  const posts=[];let count=0,pending;
  const c=createKnowledgeReferenceController({projectId:project,createId:keys(),savePending:value=>pending=value,request:async(url,body,method)=>{if(method==='GET')return count?wire(2,[]):wire();posts.push(body);if(++count===1)throw error(0,'network_outcome_unknown');return wire(1,[ref]);}});
  await c.reload();await c.add(entryRef);assert.equal(c.getSnapshot().status,'unknown');const frozen=structuredClone(pending);await c.add({id:'confidence-interval',version:1});assert.equal(posts.length,1);
  await c.reload();assert.equal(c.getSnapshot().status,'unknown');await c.reconcile();assert.deepEqual(posts[1],posts[0]);assert.equal(posts[1].idempotencyKey,frozen.idempotencyKey);assert.equal(c.getSnapshot().revision,2);assert.equal(c.getSnapshot().references.length,0);assert.equal(pending,null);c.dispose();
});
test('CAS conflicts require fresh read and explicit new choice, while idempotency conflicts retain original locator',async()=>{
  let revision=4,mode='version_conflict',pending;const posts=[];
  const c=createKnowledgeReferenceController({projectId:project,createId:keys(),savePending:value=>pending=value,request:async(url,body,method)=>{if(method==='GET')return wire(revision);posts.push(body);throw error(409,mode);}});
  await c.reload();await c.add(entryRef);assert.equal(c.getSnapshot().status,'conflict');assert.equal(pending,null);await c.add(entryRef);assert.equal(posts.length,1);
  revision=5;mode='idempotency_conflict';await c.reload();await c.add(entryRef);assert.equal(posts[1].expectedRevision,5);assert.notEqual(posts[1].idempotencyKey,posts[0].idempotencyKey);assert.equal(c.getSnapshot().status,'unknown');assert.ok(pending);c.dispose();
});
test('revocation clears private references and late completion after disposal cannot publish',async()=>{
  let deny=false;const c=createKnowledgeReferenceController({projectId:project,createId:keys(),savePending:()=>{},request:async(url,body,method)=>{if(method==='GET')return wire(1,[ref]);if(deny)throw error(403,'forbidden');return wire(2,[]);}});
  await c.reload();deny=true;await c.remove(rid);assert.equal(c.getSnapshot().status,'error');assert.deepEqual(c.getSnapshot().references,[]);c.dispose();
  let finish;const later=createKnowledgeReferenceController({projectId:project,savePending:()=>{},request:()=>new Promise(resolve=>finish=resolve)});const p=later.reload();later.dispose();finish(wire(99,[ref]));await p;assert.equal(later.getSnapshot().revision,0);
});
test('archive reading rejects wrong ID/version, draft or malformed payload instead of treating latest text as old',async()=>{
  const pack=JSON.parse(await readFile(path.join(root,'content/knowledge/core-60.json'),'utf8')),concept=pack.entries.find(e=>e.id==='p-value');
  assert.equal(checkedArchivedEntry(concept,{entryId:concept.id,entryVersion:concept.version},pack.entries),concept);
  for(const candidate of [{...concept,version:concept.version+1},{...concept,id:'wrong-id'},{...concept,review:{...concept.review,status:'draft'}},{...concept,rawAnswers:['secret']}])assert.throws(()=>checkedArchivedEntry(candidate,{entryId:concept.id,entryVersion:concept.version},pack.entries));
});
test('logout/switch clears only the previous account keys; old cleanup cannot recreate them while same-account refresh retains unresolved drafts',async()=>{
  const actual=storage();let current=owner;
  const bound=accountBoundRecoveryStorage(actual,owner,1,id=>id===current),c=createKnowledgeAccountSync({storage:bound,debounceMs:60000,read:async()=>({revision:0,favorites:[],recent:[],preferences:{}}),write:async()=>{throw Error('not dispatched');}});
  await c.setIdentity(owner);c.setFavorite(entryRef);assert.ok(actual.getItem(knowledgeAccountCacheKey(owner)));const original=actual.getItem(knowledgeAccountCacheKey(owner));
  clearPreviousKnowledgeCache(owner,owner,actual);assert.equal(actual.getItem(knowledgeAccountCacheKey(owner)),original);
  const next='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';for(const prefix of ['evix.knowledge.lookup.v1:','evix.knowledge.term-request.v1:'])actual.setItem(prefix+owner,'previous');actual.setItem('unrelated','keep');actual.setItem('evix.knowledge.lookup.v1:'+next,'next');
  current=next;clearPreviousKnowledgeCache(owner,next,actual);c.dispose();assert.equal(actual.getItem(knowledgeAccountCacheKey(owner)),null);assert.equal(actual.getItem('evix.knowledge.lookup.v1:'+owner),null);assert.equal(actual.getItem('evix.knowledge.term-request.v1:'+owner),null);assert.equal(actual.getItem('unrelated'),'keep');assert.equal(actual.getItem('evix.knowledge.lookup.v1:'+next),'next');
});
