import test from 'node:test';
import assert from 'node:assert/strict';
import {createFullReportHandler,reportSectionCallId} from '../lib/agent/full-report-server.ts';
import {fullReportInputRevision,parseFullReportRequest} from '../lib/agent/full-report-request.ts';
import {createEditorContent} from '../lib/editor-model.ts';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {digestText,snapshotRecipe} from '../lib/research-quality.ts';
const runId='c0f951d7-54d8-4f43-973f-bcf9d3f36d33',serviceId='6d33e1c2-7ad3-47c3-862f-7a034ac3bb49',projectId='d8ae0d7a-619f-4c13-bcf8-554a0e14c535';
async function input(extra={}){const value={schemaVersion:1,runId,projectId,inputRevision:'a'.repeat(64),serviceId,serviceRevision:2,consent:true,topic:'社区服务研究计划',mode:'plan',base:{design:newQuestionnaire(),dataset:null,report:createEditorContent()},sectionNodes:['intro.background'],concurrency:1,...extra};value.inputRevision=await fullReportInputRevision(value);return value;}
const request=(value,signal)=>new Request('http://localhost/api/agent/full-report',{method:'POST',headers:{'content-type':'application/json',cookie:'evix_session=synthetic-session','x-csrf-token':'synthetic-csrf',origin:'http://localhost'},body:JSON.stringify(value),signal});
const preflight=data=>Response.json({...data,status:'authorized',provider:'synthetic-provider',model:'synthetic-model',providerMode:'live',maxConcurrency:3,maxOutputTokens:2400});
const result=value=>({report:value.base.report,pack:value.base,quality:{status:'draft',deliverable:false,checks:[],blockers:[]},revisions:[],summary:{},project:{projectId:value.projectId??'local',runId:value.runId,inputRevision:value.inputRevision}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('the report boundary accepts only service/version consent and rejects client provider credentials',async()=>{
  let calls=0;const handler=createFullReportHandler({fetcher:async()=>{calls++;return preflight();},generate:async()=>{throw Error('must not execute');}});
  for(const field of ['apiKey','baseUrl','provider','model'])assert.equal((await handler(request({...await input(),[field]:'synthetic-input'}))).status,422);
  assert.equal(calls,0);assert.equal(parseFullReportRequest(await input()).serviceRevision,2);
});
test('input version changes and malformed empirical data fail before any backend/model call',async()=>{
  let calls=0;const handler=createFullReportHandler({fetcher:async()=>{calls++;return preflight();}});
  const altered=await input();altered.topic='确认后编辑的题目';assert.equal((await handler(request(altered))).status,409);
  assert.equal((await handler(request(await input({mode:'empirical'})))).status,422);assert.equal(calls,0);
});
test('CSRF/session context is forwarded and provider errors never echo private backend text',async()=>{
  const value=await input();let observed;
  const handler=createFullReportHandler({apiOrigin:'http://backend.test:8180',fetcher:async(url,init)=>{observed={url,init};return Response.json({error:{code:'unauthorized',message:'PRIVATE_PROVIDER_TRACE'}},{status:401});}});
  const response=await handler(request(value)),body=await response.text();
  assert.equal(response.status,401);assert.equal(observed.url,'http://backend.test:8180/api/agent/report-sections/preflight');
  assert.equal(observed.init.headers.get('cookie'),'evix_session=synthetic-session');assert.equal(observed.init.headers.get('x-csrf-token'),'synthetic-csrf');assert.equal(observed.init.redirect,'error');assert.equal(body.includes('PRIVATE_PROVIDER_TRACE'),false);
  const sent=JSON.parse(observed.init.body);assert.equal(sent.consent,true);assert.equal(Object.hasOwn(sent,'base'),false);assert.equal(sent.serviceRevision,2);
});
test('the real pipeline consumes server-vault callbacks and reports the actual returned usage',async()=>{
  const bodies=[];const handler=createFullReportHandler({fetcher:async(url,init)=>{
    if(url.endsWith('/preflight'))return preflight(JSON.parse(init.body));const value=JSON.parse(init.body);bodies.push(value);
    return Response.json({...value,id:value.idempotencyKey,status:'ready',content:JSON.stringify({paragraphs:[{text:'本研究拟围绕社区公共服务的供需关系展开调查，先核对服务对象与实际决策需求，再以经确认的问卷和原始资料逐步登记证据。现阶段尚未完成正式回收，正文将研究安排与后续实证结论明确区分。'}]}),usage:{inputTokens:31,outputTokens:17}});
  }});
  const response=await handler(request(await input()));assert.equal(response.status,200);const value=await response.json();
  assert.ok(bodies.length>0);assert.equal(value.summary.promptTokens,31*bodies.length);assert.equal(value.summary.completionTokens,17*bodies.length);assert.equal(value.quality.deliverable,false);assert.equal(value.project.projectId,projectId);
  for(const body of bodies){assert.equal(body.serviceId,serviceId);assert.equal(body.idempotencyKey,await reportSectionCallId(runId,body.nodeId,body.purpose,body.attempt));assert.equal(Object.hasOwn(body,'apiKey'),false);}
});
test('unknown provider outcome stops new paid calls without transparent retries',async()=>{
  let calls=0;const handler=createFullReportHandler({fetcher:async(url,init)=>{
    if(url.endsWith('/preflight'))return preflight(JSON.parse(init.body));calls++;const value=JSON.parse(init.body);return Response.json({...value,id:value.idempotencyKey,status:'outcome_unknown',content:null,errorCode:'outcome_unknown',usage:null});
  }});
  const response=await handler(request(await input({sectionNodes:['intro.background','intro.significance']}))),value=await response.json();assert.equal(calls,1);assert.equal(value.quality.status,'blocked');assert.equal(value.quality.deliverable,false);
});
test('receipt identifiers are stable within an attempt and differ across attempts/runs',async()=>{
  const first=await reportSectionCallId(runId,'abstract','draft',1);assert.equal(first,await reportSectionCallId(runId,'abstract','draft',1));assert.notEqual(first,await reportSectionCallId(runId,'abstract','draft',2));assert.notEqual(first,await reportSectionCallId(serviceId,'abstract','draft',1));assert.match(first,/^[0-9a-f-]{36}$/);
});
test('stream cancellation aborts an in-flight callback and cannot emit a late completion',async()=>{
  const value=await input({stream:true});let observedSignal;
  const handler=createFullReportHandler({fetcher:async(url,init)=>{
    if(url.endsWith('/preflight'))return preflight(JSON.parse(init.body));observedSignal=init.signal;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
  },generate:async options=>{await options.sectionGenerator({prompt:'合成测试',nodeId:'intro.background',wave:1,attempt:1,purpose:'draft',signal:options.signal});return result(value);}});
  const response=await handler(request(value)),reader=response.body.getReader(),first=await reader.read();assert.match(new TextDecoder().decode(first.value),/dispatched/);await reader.cancel();await tick();assert.equal(observedSignal.aborted,true);
});
test('fixture backends cannot return an unqualified draft status',async()=>{
  const value=await input(),handler=createFullReportHandler({fetcher:async(url,init)=>Response.json({...JSON.parse(init.body),status:'authorized',provider:'test',model:'test',providerMode:'fixture',maxConcurrency:2}),generate:async()=>result(value)});
  const response=await handler(request(value)),body=await response.json();assert.equal(body.quality.status,'needs_review');assert.ok(body.quality.checks.some(c=>c.id==='provider_fixture'));
});

test('persisted provider authentication/rate failures and service refusals stop the remaining chapters',async()=>{
  for(const failure of [{code:'authentication_failed',status:201},{code:'rate_limited',status:201},{code:'not_found',status:404},{code:'capability_unavailable',status:422}]){
    let calls=0;const handler=createFullReportHandler({fetcher:async(url,init)=>{
      if(url.endsWith('/preflight'))return preflight(JSON.parse(init.body));calls++;const value=JSON.parse(init.body);
      return failure.status===201?Response.json({...value,id:value.idempotencyKey,status:'failed',content:null,errorCode:failure.code},{status:201}):Response.json({error:{code:failure.code}},{status:failure.status});
    }});
    const response=await handler(request(await input({sectionNodes:['intro.background','intro.significance']}))),value=await response.json();
    assert.equal(calls,1,failure.code);assert.equal(value.quality.deliverable,false);
  }
});

test('a preflight or section receipt for another context cannot proceed as this run',async()=>{
  const data=await input();let called=false;
  const rejected=createFullReportHandler({fetcher:async()=>preflight({...data,runId:serviceId}),generate:async()=>{called=true;return result(data);}});
  assert.equal((await rejected(request(data))).status,502);assert.equal(called,false);
  let calls=0;const handler=createFullReportHandler({fetcher:async(url,init)=>{
    const body=JSON.parse(init.body);if(url.endsWith('/preflight'))return preflight(body);calls++;
    return Response.json({...body,id:body.idempotencyKey,projectId:serviceId,status:'ready',content:'不应采纳',usage:null});
  }});
  const response=await handler(request(await input({sectionNodes:['intro.background','intro.significance']}))),value=await response.json();
  assert.equal(calls,1);assert.equal(value.quality.status,'blocked');
});


async function buildEmpiricalGapBase(){
  const q1={...newQuestion('q1','group_mode'),text:'居住方式',type:'single',purpose:'background',analysis:'comparison',choices:[{code:'solo',label:'独居'},{code:'cohabit',label:'共居'}]};
  const q2={...newQuestion('q2','trust_score'),text:'服务满意度与采纳意愿',type:'likert',purpose:'research',analysis:'association',choices:[],min:1,max:5,minLabel:'非常低',maxLabel:'非常高'};
  const q3={...newQuestion('q3','contact_phone'),text:'受访者电话与住址',type:'text',purpose:'research',analysis:'coding',choices:[],min:null,max:null};
  const design={...newQuestionnaire(),title:'社区助餐实证测试',questions:[q1,q2,q3]};
  const headers=['group_mode','trust_score','contact_phone'];
  const rows=Array.from({length:12},(_,i)=>[i%2===0?'solo':'cohabit',String(3+(i%3)),`138001380${String(i).padStart(2,'0')} 隐私地址${i}`]);
  const table={headers,rows,skippedBlankLines:0,delimiter:','};
  const sourceHash=await digestText(JSON.stringify(table));
  const dataset={kind:'user_provided',name:'社区助餐12样本',sourceHash,table,missingCodes:[],lineage:[]};
  const freqSnap=await snapshotRecipe(
    {method:'frequency',interpretation:'基础频数分布已完成',n:12,total:12,excluded:0,missingRows:0,invalidRows:0,headers:['居住方式','人数'],rows:[['独居',6],['共居',6]],metrics:[],warnings:[]},
    {title:'基础居住方式频数',sourceName:'社区助餐12样本',sourceUrl:'',sourceHash,classification:'user_provided'},
    'freq-base-1',
  );
  const report={...createEditorContent(),version:3,quality:{version:1,results:[freqSnap],findings:[]}};
  return {sourceHash,base:{design,dataset,report}};
}

async function readNdjsonEvents(response){
  const text=await response.text();
  return text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
}

test('evidence gap auto-supplement stays disabled for plan mode with zero extra upstream calls',async()=>{
  const calls=[];
  const handler=createFullReportHandler({
    fetcher:async(url,init)=>{
      calls.push(url);
      if(url.endsWith('/preflight'))return preflight(JSON.parse(init.body));
      const value=JSON.parse(init.body);
      return Response.json({...value,id:value.idempotencyKey,status:'ready',content:JSON.stringify({paragraphs:[{text:'研究计划阶段仅核对文献依据与抽样框安排，尚未收集实证样本，本文不虚构实证检验结果。'}]}),usage:{inputTokens:12,outputTokens:10}});
    },
  });
  const response=await handler(request(await input({mode:'plan'})));
  assert.equal(response.status,200);
  assert.equal(calls.some(u=>u.includes('/autonomous-runs')),false);
});

test('empirical gap auto-supplement strips open-text PII, invokes /autonomous-runs, streams events and hydrates snapshot',async()=>{
  const {base}=await buildEmpiricalGapBase();
  let autoRequest=null;
  const handler=createFullReportHandler({
    fetcher:async(url,init)=>{
      const body=JSON.parse(init.body);
      if(url.endsWith('/preflight'))return preflight(body);
      if(url.includes('/autonomous-runs')){
        autoRequest={url,body};
        return Response.json({
          runId:'auto-gap-run-1',
          status:'completed',
          registeredResults:[{
            id:'snap_gap_model_1',
            title:'[自主补全] 有序 Logit 边际效应',
            sourceName:'社区助餐12样本',
            method:'logit',
            n:12,
            total:12,
            headers:['变量','OR','p值'],
            rows:[['trust_score',1.82,0.014]],
            metrics:[{label:'Pseudo R²',value:0.24}],
            warnings:[],
            variables:['trust_score'],
          }],
        });
      }
      return Response.json({...body,id:body.idempotencyKey,status:'ready',content:JSON.stringify({paragraphs:[{text:'基于工作区真实问卷与自主补全后的统计快照（snap_gap_model_1），本节汇报相关变量分布及谨慎推断边界。'}]}),usage:{inputTokens:20,outputTokens:18}});
    },
  });
  const payload=await input({stream:true,mode:'empirical',base,sectionNodes:['drivers.model']});
  const response=await handler(request(payload));
  assert.equal(response.status,200);
  const events=await readNdjsonEvents(response);
  const gapDetected=events.find(e=>e.type==='evidence_gap'&&e.phase==='gap_detected');
  const gapSupplemented=events.find(e=>e.type==='evidence_gap'&&e.phase==='gap_supplemented');
  const done=events.find(e=>e.type==='done');
  assert.ok(gapDetected&&gapDetected.count>0);
  assert.equal(gapSupplemented.count,1);
  assert.equal(gapSupplemented.autonomousRunId,'auto-gap-run-1');
  assert.ok(autoRequest&&autoRequest.url.endsWith(`/api/projects/${projectId}/autonomous-runs`));
  assert.equal(autoRequest.body.datasetMode,'inline_dataset');
  assert.equal(autoRequest.body.leaseMode,'pi_autonomous');
  assert.equal(autoRequest.body.inlineDataset.classification,'actual');
  // Open-text PII column must never be present in dispatched row answers.
  for(const row of autoRequest.body.inlineDataset.rows){
    assert.equal(Object.hasOwn(row.answers,'q3'),false);
    assert.equal(Object.hasOwn(row.answers,'contact_phone'),false);
    assert.equal(row.visibility.q3,false);
  }
  const mergedIds=done.pack.report.quality.results.map(r=>r.id);
  assert.ok(mergedIds.includes('snap_gap_model_1'));
});

test('empirical gap supplement failure degrades gracefully to gap_skipped without failing report',async()=>{
  const {base}=await buildEmpiricalGapBase();
  const handler=createFullReportHandler({
    fetcher:async(url,init)=>{
      const body=JSON.parse(init.body);
      if(url.endsWith('/preflight'))return preflight(body);
      if(url.includes('/autonomous-runs')){
        return Response.json({error:{code:'internal_error',message:'PRIVATE_STACK'}},{status:500});
      }
      return Response.json({...body,id:body.idempotencyKey,status:'ready',content:JSON.stringify({paragraphs:[{text:'即使后端自主补证服务暂时不可用，仍按现有已登记频数快照如实撰写并提示研究限制。'}]}),usage:{inputTokens:15,outputTokens:12}});
    },
  });
  const payload=await input({stream:true,mode:'empirical',base,sectionNodes:['drivers.model']});
  const response=await handler(request(payload));
  assert.equal(response.status,200);
  const events=await readNdjsonEvents(response);
  assert.ok(events.some(e=>e.type==='evidence_gap'&&e.phase==='gap_skipped'));
  const done=events.find(e=>e.type==='done');
  assert.equal(done.ok,true);
  assert.equal(done.pack.report.quality.results.length,1);
});
