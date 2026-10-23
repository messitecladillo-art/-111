// Two-phase local-only fixture. Run seed, restart the isolated server with the
// same D1 directory, then verify. Credentials belong only to synthetic QA data.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createEditorContent} from '../lib/editor-model.ts';
const base=process.env.EVI_X_TEST_BASE_URL;
if(!base||!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Explicit isolated local runtime required');
const state=resolve('.wrangler/research-flow-qa-20260930'),file=resolve(state,'restart-fixture.json');
async function call(path,headers={},body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${path}: ${r.status}`);return {value:await r.json(),headers:r.headers};}
if(process.argv[2]==='seed'){
  const session=await call('/api/drafts/session',{},{}),cookie=session.headers.get('set-cookie').split(';')[0],library=await call('/api/drafts',{cookie}),headers={cookie,'x-editor-scope':library.value.scope};
  const input={version:1,sourceHash:'c'.repeat(64),classification:'simulated',question:'重启恢复合成验收',variables:['合成变量'],missingCodes:[],total:12,n:12,calculation:{method:'frequency',counts:[7,5],column:0}};
  const records=[];
  for(const action of ['pending','accepted','cancelled']){
    const draftId=crypto.randomUUID(),content=createEditorContent();content.title=`重启验收-${action}`;
    await call('/api/drafts',headers,{id:draftId,content});
    let run=(await call('/api/drafts/research-runs',headers,{id:crypto.randomUUID(),draftId,baseRevision:1,input,consent:true})).value.run;
    if(action!=='pending')run=(await call(`/api/drafts/research-runs/${run.id}`,headers,{action:action==='accepted'?'accept':'cancel',proposalHash:run.proposalHash})).value.run;
    records.push({run,draft:(await call(`/api/drafts/${draftId}`,headers)).value.draft,versions:(await call(`/api/drafts/${draftId}/versions`,headers)).value.versions});
  }
  await mkdir(state,{recursive:true});await writeFile(file,JSON.stringify({headers,records}));console.log(JSON.stringify({phase:'seed',records:records.length,status:'pass',rawResponsesStored:false}));
}else if(process.argv[2]==='verify'){
  const {headers,records}=JSON.parse(await readFile(file,'utf8'));
  for(const before of records){
    const run=(await call(`/api/drafts/research-runs/${before.run.id}`,headers)).value.run;
    assert.deepEqual(run,before.run);assert.deepEqual((await call(`/api/drafts/${run.draftId}`,headers)).value.draft,before.draft);assert.deepEqual((await call(`/api/drafts/${run.draftId}/versions`,headers)).value.versions,before.versions);
    if(run.status==='accepted')assert.deepEqual((await call(`/api/drafts/research-runs/${run.id}`,headers,{action:'accept',proposalHash:run.proposalHash})).value.run,before.run);
  }
  console.log(JSON.stringify({phase:'verify-after-server-restart',records:records.length,status:'pass',checks:['pending/accepted/cancelled restored','input and proposal hashes unchanged','drafts and before/after versions unchanged','accept replay idempotent']}));
}else throw Error('Use seed or verify');
