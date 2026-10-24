import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {SAV_UPLOAD_LIMITS,SavUploadError,uploadTemporarySav,validateSavFile} from '../lib/sav-upload.ts';
const bytes=new Uint8Array([36,70,76,50,1,2,3,4]),file=()=>new File([bytes],'中文样本.SAV');
function fixture(overrides={}){
 return {schema:'survey-import/sav-v1',format:'sav',parser:'pyreadstat/1.3.6',sourceSha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rowCount:2,columnCount:1,fileEncoding:'UTF-8',columns:[{name:'Q1',label:'满意度',measurement:'ordinal',originalFormat:'F8.2',storageType:'double',alignment:'right',valueLabels:[{value:1,label:'不满意'},{value:2,label:'满意'}],userMissingValues:[],userMissingRanges:[],dateEncoding:null,systemMissingCount:0}],rows:[[1],[2]],cleanup:{completed:true,reason:'temporary-upload'},...overrides};
}
const response=value=>new Response(typeof value==='string'?value:JSON.stringify(value),{headers:{'Content-Type':'application/json; charset=utf-8'}});
const signal=()=>new AbortController().signal;
const isCode=code=>error=>error instanceof SavUploadError&&error.code===code;
test('one explicit upload carries consent, CSRF, same-origin cookies and exact body; original labels/codes remain',async()=>{
 let count=0,posted;const phases=[];
 const data=await uploadTemporarySav(file(),'synthetic-csrf',signal(),phase=>phases.push(phase),async(path,init)=>{count++;posted={path,init};return response(fixture());});
 assert.equal(count,1);assert.equal(posted.path,'/api/imports/sav');assert.equal(posted.init.method,'POST');assert.equal(posted.init.credentials,'same-origin');assert.equal(posted.init.redirect,'error');assert.equal(posted.init.headers['X-EVIX-Temporary-Upload'],'accepted');assert.equal(posted.init.headers['X-CSRF-Token'],'synthetic-csrf');assert.equal(posted.init.headers['Content-Type'],'application/octet-stream');assert.deepEqual(new Uint8Array(posted.init.body),bytes);
 assert.deepEqual(phases,['fingerprint','request','receipt','verify']);assert.deepEqual(data.table.rows,[['1'],['2']]);assert.equal(data.table.columnLabels.Q1,'满意度');assert.deepEqual(data.raw.columns[0].valueLabels,fixture().columns[0].valueLabels);assert.equal(data.raw.cleanup.completed,true);
});
test('invalid local files and inconsistent arrayBuffer reject without network',async()=>{
 for(const bad of [{name:'data.csv',size:8},{name:'a.sav',size:0},{name:'a.sav',size:SAV_UPLOAD_LIMITS.fileBytes+1}])assert.throws(()=>validateSavFile(bad),SavUploadError);
 let count=0;await assert.rejects(()=>uploadTemporarySav({name:'a.sav',size:9,arrayBuffer:async()=>bytes.buffer},'csrf',signal(),undefined,async()=>{count++;return response(fixture());}),isCode('file_changed'));assert.equal(count,0);
});
test('missing login token and pre-cancelled request never upload',async()=>{
 let count=0;const fetcher=async()=>{count++;return response(fixture());};await assert.rejects(()=>uploadTemporarySav(file(),'',signal(),undefined,fetcher),isCode('login_required'));const c=new AbortController();c.abort();await assert.rejects(()=>uploadTemporarySav(file(),'csrf',c.signal,undefined,fetcher),error=>error.name==='AbortError');assert.equal(count,0);
});
test('cancel during local read or fingerprint phase fences network',async()=>{
 let resolve,count=0;const c=new AbortController();const pending=uploadTemporarySav({name:'a.sav',size:bytes.length,arrayBuffer:()=>new Promise(r=>resolve=r)},'csrf',c.signal,undefined,async()=>{count++;return response(fixture());});c.abort();resolve(bytes.buffer);await assert.rejects(()=>pending,error=>error.name==='AbortError');assert.equal(count,0);
 const h=new AbortController();await assert.rejects(()=>uploadTemporarySav(file(),'csrf',h.signal,p=>{if(p==='fingerprint')h.abort();},async()=>{count++;return response(fixture());}),error=>error.name==='AbortError');assert.equal(count,0);
});
test('returned source hash/bytes and completed temporary cleanup are mandatory',async()=>{
 for(const changed of [{sourceSha256:'a'.repeat(64)},{bytes:bytes.length+1}])await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>response(fixture(changed))),isCode('source_mismatch'));
 for(const cleanup of [{completed:false,reason:'temporary-upload'},{completed:true,reason:'retained'}])await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>response(fixture({cleanup}))),isCode('invalid_receipt'));
});
test('strict UTF-8, duplicate/invalid JSON and non-JSON receipts reject',async()=>{
 const duplicate=JSON.stringify(fixture()).replace('"format":"sav"','"format":"sav","f\\u006frmat":"sav"');
 for(const receipt of [response(duplicate),response('{'),new Response(new Uint8Array([0xc3,0x28]),{headers:{'Content-Type':'application/json'}}),new Response('{}',{headers:{'Content-Type':'text/html'}})])await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>receipt),SavUploadError);
});
test('declared and streaming limits both reject; oversized stream is cancelled',async()=>{
 const declared=new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':String(SAV_UPLOAD_LIMITS.responseBytes+1)}});await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>declared),isCode('response_limit'));
 let cancelled=0,steps=0;const stream=new ReadableStream({pull(c){steps++;c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled++;}});await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})),isCode('response_limit'));assert.ok(steps>=17);assert.equal(cancelled,1);
});
test('cancel while awaiting headers or reading body rejects late results',async()=>{
 let resolve;const c=new AbortController();const pending=uploadTemporarySav(file(),'csrf',c.signal,undefined,()=>new Promise(r=>resolve=r));while(!resolve)await new Promise(r=>setTimeout(r,0));c.abort();resolve(response(fixture()));await assert.rejects(()=>pending,error=>error.name==='AbortError');
 let cancelled=0;const bodyController=new AbortController(),stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled++;}});const reading=uploadTemporarySav(file(),'csrf',bodyController.signal,p=>{if(p==='receipt')setTimeout(()=>bodyController.abort(),0);},async()=>new Response(stream,{headers:{'Content-Type':'application/json'}}));await assert.rejects(()=>reading,error=>error.name==='AbortError');assert.equal(cancelled,1);
});
test('HTTP/network failures do not retry automatically',async()=>{
 let count=0;await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>{count++;return new Response(JSON.stringify({error:{code:'sav_invalid',message:'文件无法读取。'}}),{status:422,headers:{'Content-Type':'application/json'}});}),error=>error instanceof SavUploadError&&error.status===422&&error.code==='sav_invalid');assert.equal(count,1);
 count=0;await assert.rejects(()=>uploadTemporarySav(file(),'csrf',signal(),undefined,async()=>{count++;throw Error('synthetic offline');}),isCode('network_error'));await new Promise(r=>setTimeout(r,5));assert.equal(count,1);
});
test('file selection only validates; request is exclusive to explicit begin and guarded by account epoch',()=>{
 const source=readFileSync(new URL('../components/analysis/SavImportPanel.tsx',import.meta.url),'utf8');const choose=source.slice(source.indexOf('function choose('),source.indexOf('function cancel('));assert.ok(choose.includes('validateSavFile(next)'));assert.ok(!choose.includes('uploadTemporarySav'));assert.equal(source.match(/await uploadTemporarySav\(/g).length,1);assert.ok(source.includes('identityEpoch'));assert.ok(source.includes('session?.csrfToken'));assert.ok(source.includes('owner.current===identityKey&&!controller.signal.aborted'));assert.ok(source.includes('receipt||{data:await uploadTemporarySav'));
});

// Run the actual component action bodies with controlled state and deferred I/O.
// These are lifecycle checks, not a substitute for React/browser verification.
import ts from 'typescript';
function panelHarness({uploadMode='normal',adopt=false,externalBusy=false}={}){
 const source=readFileSync(new URL('../components/analysis/SavImportPanel.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let component;ts.forEachChild(ast,node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='SavImportPanel')component=node;});
 const names=new Set(['stop','endBusy','choose','cancel','begin']);const actions=component.body.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(ast)).join('\n');
 const identityEffect=component.body.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='useLayoutEffect'&&node.getText(ast).includes('owner.current===identity'));
 assert.ok(identityEffect);const identityBody=identityEffect.expression.arguments[0].body.getText(ast);
 const code=ts.transpileModule(actions+'\nfunction changeIdentity(next:string)'+identityBody.replace('{','{ identity=next;'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const h={calls:0,adoptions:0,notifications:[],states:{file:file(),receipt:null,error:'',phase:'',busy:false},refs:{epoch:{current:0},request:{current:null},timer:{current:null},ownBusy:{current:false},owner:{current:'initial'}},resolve:null,timerFn:null};
 const make=new Function('h','uploadTemporarySav','validateSavFile','setTimeout','clearTimeout',`let file=h.states.file,receipt=h.states.receipt,session={authenticated:true,user:{id:'synthetic-user'},csrfToken:'synthetic-csrf'},loggedIn=true,identity='initial',externalBusy=${externalBusy};const {epoch,request,timer,ownBusy,owner}=h.refs;const callbacks={current:{onBusy:(value)=>h.notifications.push(value),onReady:async()=>{h.adoptions++;return ${adopt};}}};const setFile=v=>{file=v;h.states.file=v;},setReceipt=v=>{receipt=v;h.states.receipt=v;},setBusy=v=>h.states.busy=v,setPhase=v=>h.states.phase=v,setError=v=>h.states.error=v;${code};return {begin,cancel,choose,changeIdentity,setAdopt:value=>callbacks.current.onReady=async()=>{h.adoptions++;return value;}};`);
 const upload=async(_file,_csrf,signal)=>{h.calls++;h.signal=signal;if(uploadMode==='deferred')return new Promise(resolve=>h.resolve=resolve);return {raw:{rowCount:2,columnCount:1}};};
 h.actions=make(h,upload,validateSavFile,fn=>{h.timerFn=fn;return 1;},()=>{h.timerFn=null;});return h;
}
test('actual Panel selection and declined confirmation preserve file; explicit second apply reuses verified receipt',async()=>{
 const h=panelHarness();h.actions.choose(file());assert.equal(h.calls,0);await h.actions.begin();assert.equal(h.calls,1);assert.equal(h.adoptions,1);assert.ok(h.states.file);assert.ok(h.states.receipt);assert.equal(h.states.phase,'已核验，等待载入');assert.deepEqual(h.notifications,[true,false]);
 h.actions.setAdopt(true);await h.actions.begin();assert.equal(h.calls,1);assert.equal(h.adoptions,2);assert.equal(h.states.file,null);assert.equal(h.states.receipt,null);assert.equal(h.states.phase,'已载入当前分析');
});
test('actual Panel cancel, changed account and timeout abort and fence late upload without applying',async()=>{
 for(const mode of ['cancel','identity','timeout']){const h=panelHarness({uploadMode:'deferred',adopt:true});const pending=h.actions.begin();assert.equal(h.calls,1);if(mode==='cancel')h.actions.cancel();else if(mode==='identity')h.actions.changeIdentity('new-account-new-csrf');else h.timerFn();assert.equal(h.signal.aborted,true);h.resolve({raw:{rowCount:2,columnCount:1}});await pending;assert.equal(h.adoptions,0);assert.equal(h.states.receipt,null);assert.equal(h.states.busy,false);assert.deepEqual(h.notifications,[true,false]);if(mode==='identity')assert.equal(h.states.file,null);}
});
test('actual idle Panel cannot clear another import ownership or start a request while external busy',async()=>{
 const h=panelHarness({externalBusy:true,adopt:true});h.actions.cancel();h.actions.choose(file());await h.actions.begin();assert.equal(h.calls,0);assert.equal(h.refs.epoch.current,0);assert.deepEqual(h.notifications,[]);
});
