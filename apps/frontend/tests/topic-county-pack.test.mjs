import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareTopicPublication,applyTopicPublication,freshTopicPublication,TOPIC_PUBLICATION_UI_CONTRACT,TOPIC_PUBLICATION_UI_FIELDS} from '../lib/topic-publication.ts';

// Real immutable draft data, inspected mechanically. No content approval or publication is created.
const root=fileURLToPath(new URL('../../..',import.meta.url));
const corpus='corpus-source/topic-advisor/county-pack-01/';
const parent='apps/frontend/content/topic-advisor/county-pack-01.json';
const candidate='apps/frontend/content/topic-advisor/county-pack-01-candidates-v2.json';
const hashes={
  [parent]:'a7c99603bbeaabc0b65758a8fe9b8142b0d431c41836997494eb6f9e93c08d58',
  [candidate]:'59a23fad2595509df853ba7c8d6a8c9e7d649c0ef9ff8a646a600e21f9018689',
  [`${corpus}supplement-20261015.json`]:'af301a0e0e046be2312c9f5b034e8f57888e86440421d03dbbc4ca25d0cb9c9f',
  [`${corpus}review-first-candidates.json`]:'a17855b4789065fae877710828e33b3271f34334eaf700d5f304910ffbd5efec',
  [`${corpus}review-candidates-v2.json`]:'543ee5ec7dd7cc9f6287cfb3862af9260d47f2c0febf1b569ed325aebfb7efbf',
  [`${corpus}captures.json`]:'c9e4398e56d8850ca4f4480127880b03c13a1b4171d8ba6fe94428f5ce0ed0bd',
  [`${corpus}recovery.json`]:'5ef0576bc60264f6bf52f11587efd286b5c731639ba3c111db678502f39daf04',
  [`${corpus}editorial-evidence.json`]:'880b8a5d8d7f917560694ab580b122155dafb8497d39915d12d76a45b30cb3e6',
  'apps/frontend/content/topic-advisor/regions.catalog.json':'db55266d7e1ca53cc75c6f7b83bfad03a216b950a2700441611660bf7a942595',
};
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const read=relative=>fs.readFileSync(path.join(root,relative));
const json=relative=>JSON.parse(read(relative).toString('utf8'));
const python=process.env.EVIX_PYTHON||(process.platform==='win32'?'python':'python3');
const files=[...Object.keys(hashes),`${corpus}build-reviewed-candidates.py`,`${corpus}build-pack.py`,`${corpus}validate-pack.py`];
function runPython(args,cwd){
  const result=spawnSync(python,['-B','-X','utf8',...args],{cwd,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},windowsHide:true,timeout:20_000,maxBuffer:2_000_000});
  assert.ifError(result.error);return result;
}
const lastJson=result=>{assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));};
function cleanCopy(){
  const temporaryBase=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(temporaryBase,'evix-county-pack-'));
  for(const relative of files){const target=path.join(directory,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);}
  return{directory,remove(){
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),temporaryBase,'recursive cleanup must stay under the verified temporary parent');
    assert.match(path.basename(resolved),/^evix-county-pack-/);
    fs.rmSync(resolved,{recursive:true,force:true});
  }};
}

test('real draft inspection binds exact bytes and does not publish the existing 20 counties',async()=>{
  const before=read(parent),raw=before.toString('utf8'),draft=await prepareTopicPublication(raw,'inspection-only',[]);
  assert.equal(sha(before),hashes[parent]);assert.equal(draft.packHash,hashes[parent]);assert.equal(draft.pack.profiles.length,20);
  assert.equal(draft.pack.profiles.flatMap(p=>p.directions).length,60);assert.equal(draft.pack.sources.length,14);
  assert.equal(draft.items.length,draft.pack.profiles.flatMap(p=>[...p.facts,...p.directions]).length);
  assert.ok(draft.pack.profiles.every(p=>p.status==='draft'));assert.deepEqual(await freshTopicPublication([]),[]);
  // An intentionally incomplete decision has no approval records and must fail closed.
  await assert.rejects(applyTopicPublication({rawPack:raw,author:draft.author,sourceReads:[],history:[],now:'2026-10-15T14:00:00.000Z',decision:{id:'inspection-never-publish',action:'publish',packId:draft.pack.id,contentVersion:draft.pack.contentVersion,packHash:draft.packHash,profileIds:[draft.pack.profiles[0].id],expectedPreviousHash:null,ui:{contractVersion:TOPIC_PUBLICATION_UI_CONTRACT,fields:[...TOPIC_PUBLICATION_UI_FIELDS]},reviews:[]}}),/one explicit review/);
  // invalid_synthetic_declaration: intentionally invalid test-only objects, never real approvals or stored receipts.
  const selected=draft.pack.profiles[0].id,invalidSyntheticDeclarations=draft.items.filter(item=>item.profileId===selected).map(item=>({id:`invalid_synthetic_declaration-${item.id}`,packId:draft.pack.id,contentVersion:draft.pack.contentVersion,packHash:draft.packHash,itemId:item.id,itemHash:item.itemHash,author:draft.author,reviewer:'test-only-invalid_synthetic_declaration',reviewedAt:'2026-10-15T14:00:00.000Z',decision:'approve',scope:item.kind==='direction'?'proposed':'listing_entry'}));
  await assert.rejects(applyTopicPublication({rawPack:raw,author:draft.author,sourceReads:[],history:[],now:'2026-10-15T14:00:00.000Z',decision:{id:'invalid_synthetic_declaration',action:'publish',packId:draft.pack.id,contentVersion:draft.pack.contentVersion,packHash:draft.packHash,profileIds:[selected],expectedPreviousHash:null,ui:{contractVersion:TOPIC_PUBLICATION_UI_CONTRACT,fields:[...TOPIC_PUBLICATION_UI_FIELDS]},reviews:invalidSyntheticDeclarations}}),/not actually read/);
  assert.deepEqual(await freshTopicPublication([]),[]);
  assert.equal(sha(read(parent)),hashes[parent]);assert.ok(raw.includes('\r\n'));assert.ok(!raw.replaceAll('\r\n','').includes('\n'));
});

test('the reviewed three-county candidate retains exact historical data, draft status and hash-bound local review copies',async()=>{
  for(const [relative,expected]of Object.entries(hashes))assert.equal(sha(read(relative)),expected,relative);
  const raw=read(candidate).toString('utf8'),draft=await prepareTopicPublication(raw,'candidate-inspection-only',[]),review=json(`${corpus}review-candidates-v2.json`);
  assert.equal(draft.packHash,hashes[candidate]);assert.equal(draft.pack.contentVersion,'2026-10-15.2');assert.equal(draft.pack.profiles.length,3);assert.equal(draft.pack.sources.length,4);assert.equal(draft.items.length,15);
  assert.deepEqual(draft.pack.profiles.map(p=>p.regionRef.code),['421222','340882','320623']);assert.ok(draft.pack.profiles.every(p=>p.status==='draft'));assert.ok(draft.pack.profiles.flatMap(p=>p.facts).every(f=>f.temporalKind==='historical_reference'));assert.ok(draft.pack.profiles.flatMap(p=>p.directions).every(d=>d.classification==='proposed'));
  assert.equal(review.target.sha256,draft.packHash);assert.equal(review.verdict,'acceptable_as_reviewed_draft_content');assert.equal(review.publicationApproved,false);assert.deepEqual(review.openFindings,[]);assert.equal(review.factReviews.length,6);assert.equal(review.directionReviews.length,9);
  const old=json(parent),changed=new Set(['county-421222-direction-1','county-340882-direction-2']);let inheritedFacts=0,unchangedDirections=0;
  for(const p of draft.pack.profiles){const original=old.profiles.find(o=>o.id===p.id);assert.deepEqual(p.regionRef,original.regionRef);for(const fact of original.facts){assert.deepEqual(p.facts.find(f=>f.id===fact.id),fact);inheritedFacts++;}for(const direction of p.directions){const previous=original.directions.find(d=>d.id===direction.id);assert.deepEqual(direction.sourceIds,previous.sourceIds);assert.deepEqual(direction.requiredAccess,previous.requiredAccess);if(!changed.has(direction.id)){assert.deepEqual(direction,previous);unchangedDirections++;}else{assert.ok(!direction.title.includes('青年'));assert.ok(direction.population.includes('年满18周岁'));}}}
  assert.equal(inheritedFacts,5);assert.equal(unchangedDirections,7);assert.equal(draft.sourceReads.length,0);assert.deepEqual(await freshTopicPublication([]),[]);assert.ok(!raw.includes('\r'));assert.equal(sha(read(parent)),hashes[parent]);
});

test('portable candidate builder uses only repository-local inputs from an unrelated cwd and rejects copied review drift',()=>{
  const original=Object.fromEntries(Object.keys(hashes).map(relative=>[relative,sha(read(relative))])),copy=cleanCopy();
  try{
    assert.equal(fs.existsSync(path.join(copy.directory,'.collab')),false);
    const script=path.join(copy.directory,corpus,'build-reviewed-candidates.py'),result=lastJson(runPython([script,'--self-test'],path.dirname(copy.directory)));
    assert.equal(result.contract,'pass');assert.equal(result.mode,'check');assert.equal(result.publication,'draft_not_published');assert.equal(result.sha256,hashes[candidate]);assert.equal(result.inputDriftRejections,3);assert.equal(result.profiles,3);assert.equal(result.directions,9);
    const written=lastJson(runPython([script,'--write'],path.dirname(copy.directory)));assert.equal(written.mode,'write');assert.equal(sha(fs.readFileSync(path.join(copy.directory,candidate))),hashes[candidate]);
    const legacy=lastJson(runPython([path.join(copy.directory,corpus,'validate-pack.py')],path.dirname(copy.directory)));assert.equal(legacy.contract,'pass');assert.equal(legacy.sha256,hashes[parent]);
    fs.appendFileSync(path.join(copy.directory,corpus,'review-first-candidates.json'),'\n');const drift=runPython([script],path.dirname(copy.directory));assert.notEqual(drift.status,0);assert.match(drift.stderr,/review input hash drift/);assert.equal(sha(fs.readFileSync(path.join(copy.directory,candidate))),hashes[candidate]);
    for(const [relative,before]of Object.entries(original))assert.equal(sha(read(relative)),before,`${relative} remains untouched`);
  }finally{copy.remove();}
});

test('legacy builder emits fixed UTF-8 CRLF bytes in memory without overwriting the real twenty-county draft',()=>{
  const copy=cleanCopy(),before=sha(read(parent));
  try{
    const script=`import hashlib,json,runpy,sys
from pathlib import Path
builder=Path(sys.argv[1]).resolve()
root=builder.parents[3]
writes={}
original_read=Path.read_bytes
def capture(target,data):
    target=target.resolve()
    if not target.is_relative_to(root): raise AssertionError('write escaped clean-copy root')
    writes[target]=bytes(data)
    return len(data)
def read(target):
    return writes[target.resolve()] if target.resolve() in writes else original_read(target)
def implicit_write(*args,**kwargs): raise AssertionError('platform-dependent text output is forbidden')
Path.write_bytes=capture
Path.read_bytes=read
Path.write_text=implicit_write
runpy.run_path(str(builder),run_name='__main__')
print(json.dumps({str(p.relative_to(root)).replace('\\\\','/'):{'sha256':hashlib.sha256(raw).hexdigest(),'crlf':raw.count(b'\\r\\n'),'lf':raw.count(b'\\n')} for p,raw in writes.items()}))`;
    const result=lastJson(runPython(['-c',script,path.join(copy.directory,corpus,'build-pack.py')],path.dirname(copy.directory)));
    assert.deepEqual(Object.keys(result).sort(),[parent,`${corpus}editorial-evidence.json`].sort());
    for(const relative of [parent,`${corpus}editorial-evidence.json`]){assert.equal(result[relative].sha256,hashes[relative]);assert.ok(result[relative].crlf>0);assert.equal(result[relative].crlf,result[relative].lf);assert.equal(sha(fs.readFileSync(path.join(copy.directory,relative))),hashes[relative]);}
    assert.equal(sha(read(parent)),before);
  }finally{copy.remove();}
});
