import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFullReport,fullReportFailureStatus} from '../components/agent/full-report-client.ts';
import {HostedApiError} from '../components/hosted/api-client.ts';
import {createEditorContent} from '../lib/editor-model.ts';
const input={runId:'69da7018-09c1-43bc-a796-04a194992cc8',projectId:'6dd73101-bbd3-40c5-8d5d-0005c9a7b915',inputRevision:'a'.repeat(64)};
const done=(changes={})=>({type:'done',ok:true,runId:input.runId,project:{...input},report:createEditorContent(),pack:{report:createEditorContent()},quality:{status:'needs_review',deliverable:false,checks:[],blockers:[]},revisions:[],summary:{},...changes});
const response=events=>new Response(events.map(e=>JSON.stringify(e)).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
async function run(value,body){const previous=globalThis.fetch;globalThis.fetch=async()=>value;try{return await requestFullReport(body??input,{csrfToken:'test-csrf',signal:new AbortController().signal,onEvent(){}});}finally{globalThis.fetch=previous;}}

test('only a complete candidate for the current run/project/input is accepted',async()=>{
  const result=await run(response([done()]));assert.equal(result.quality.deliverable,false);
  for(const field of ['runId','projectId','inputRevision'])await assert.rejects(run(response([done({project:{...input,[field]:'different'}})])),/不匹配/);
});
test('a local unfiled run uses the explicitly named local receipt scope',async()=>{
  const local={...input,projectId:null};assert.ok(await run(response([done({project:{...input,projectId:'local'}})]),local));
  await assert.rejects(run(response([done()]),local),/不匹配/);
});
test('stream interruption, unexpected final events and wrong content type stay unknown',async()=>{
  await assert.rejects(run(response([{type:'receipt',runId:input.runId,id:'section',nodeId:'abstract',status:'running'}])),e=>fullReportFailureStatus(e)==='unknown');
  await assert.rejects(run(response([done(),done()])),/额外回执/);
  await assert.rejects(run(new Response('{}',{headers:{'content-type':'application/json'}})),e=>fullReportFailureStatus(e)==='unknown');
});
test('only explicit HTTP client refusals can be labelled refused',()=>{
  for(const status of [400,401,403,409,422,429])assert.equal(fullReportFailureStatus(new HostedApiError(status,'test','test')),'refused');
  for(const status of [0,500,502,503])assert.equal(fullReportFailureStatus(new HostedApiError(status,'test','test')),'unknown');
  assert.equal(fullReportFailureStatus(new Error('connection gone')),'unknown');
});
test('an aborted stream cannot publish a completed candidate',async()=>{
  const abort=new AbortController();abort.abort();const previous=fetch;globalThis.fetch=async()=>response([done()]);
  try{await assert.rejects(requestFullReport(input,{csrfToken:'test',signal:abort.signal,onEvent(){}}),{name:'AbortError'});}finally{globalThis.fetch=previous;}
});
