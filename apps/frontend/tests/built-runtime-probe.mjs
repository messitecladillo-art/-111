// Local built-bundle gate, not a cloud deployment or a substitute for D1 tests.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {heldOpenUpload} from './helpers/held-open-upload.mjs';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(app,'package.json'));
const runtimeRequire=createRequire(require.resolve('wrangler'));
const {Miniflare,Log,LogLevel,convertV4MiniflareOptions}=runtimeRequire('miniflare');
const server=resolve(app,'dist/server');
const config=JSON.parse(readFileSync(resolve(server,'wrangler.json'),'utf8'));
assert.equal(config.no_bundle,true,'Build before running this probe');
assert.equal(config.assets?.directory,'../client','Review changed asset topology before probing');
const modules=[];
function walk(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    assert.equal(entry.isSymbolicLink(),false,'No linked build inputs');
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())walk(path);
    else if(entry.name.endsWith('.js')||entry.name.endsWith('.mjs'))modules.push({type:'ESModule',path});
  }
}
walk(server);
const entry=resolve(server,config.main);
assert.ok(modules.some(m=>m.path===entry));
modules.sort((a,b)=>Number(b.path===entry)-Number(a.path===entry)||a.path.localeCompare(b.path));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const bundle=modules.map(m=>({path:relative(server,m.path).replaceAll('\\','/'),sha256:sha256(readFileSync(m.path))}));
const report={schema:'evix-built-runtime-gate/v1',observed_at:new Date().toISOString(),node:process.version,
  runtime:runtimeRequire('miniflare/package.json').version,scope:'Local built Worker with assets over real loopback HTTP; not Wrangler proxy or deployed cloud',
  bundle_sha256:sha256(JSON.stringify(bundle)),config_sha256:sha256(readFileSync(resolve(server,'wrangler.json'))),
  cases:[],runtime_error_count:0,disposed:false,port_closed:false,passed:false};
class ProbeLog extends Log{constructor(){super(LogLevel.ERROR);}error(){report.runtime_error_count++;}}
const options={host:'127.0.0.1',port:0,cf:false,log:new ProbeLog(),workers:[{
  name:'evix-built-probe',modules,modulesRoot:server,
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
  d1Databases:(config.d1_databases||[]).map(db=>db.binding),
  assets:{directory:resolve(server,config.assets.directory),routerConfig:{has_user_worker:true}},
}]};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
let url;
const jsonHeaders={'content-type':'application/json'};
const specimens=[
  {id:'origin-denied',path:'/api/drafts',headers:{...jsonHeaders,origin:'https://untrusted.invalid'},body:'{}',status:403,code:'origin_forbidden'},
  {id:'session-required',path:'/api/drafts',headers:jsonHeaders,body:'{}',status:401,code:'editor_session_required'},
  {id:'unsupported-media',path:'/api/rules',headers:{'content-type':'text/plain'},body:'x',status:415,code:'unsupported_media_type'},
  {id:'oversized-json',path:'/api/rules',headers:jsonHeaders,body:JSON.stringify({x:'x'.repeat(5000)}),status:413,code:'payload_too_large'},
  {id:'ongoing-upload-no-eof',path:'/api/rules',headers:jsonHeaders,createUpload:()=>heldOpenUpload(4096),status:413,code:'payload_too_large'},
  {id:'invalid-utf8',path:'/api/rules',headers:jsonHeaders,body:Uint8Array.of(255),status:400,code:'invalid_json'},
  {id:'valid-readonly-query',path:'/api/rules',headers:jsonHeaders,body:JSON.stringify({edition:'synthetic-unknown',group:'synthetic',region:'synthetic',track:'synthetic',stage:'synthetic'}),status:200},
];
async function checkHealth(){
  const response=await fetch(new URL('/api/cases',url),{signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);assert.ok(Array.isArray((await response.json()).cases));
  const post=await fetch(new URL('/api/rules',url),{method:'POST',headers:jsonHeaders,body:JSON.stringify({edition:'synthetic-unknown',group:'synthetic',region:'synthetic',track:'synthetic',stage:'synthetic'}),signal:AbortSignal.timeout(5000)});
  assert.equal(post.status,200);const value=await post.json();assert.equal(value.match,'none');assert.equal(value.blocking,true);assert.deepEqual(value.rules,[]);
}
try{
  url=await mf.ready;
  await checkHealth();
  for(const specimen of specimens){
    const result={id:specimen.id,expected_status:specimen.status,attempted:0,passed:0,failures:[],health:false};
    for(let i=0;i<100;i++){
      result.attempted++;
      const upload=specimen.createUpload?.();
      try{
        const response=await fetch(new URL(specimen.path,url),{method:'POST',headers:specimen.headers,body:upload?.body??specimen.body,...(upload?{duplex:'half'}:{}),signal:upload?.signal??AbortSignal.timeout(5000)});
        assert.equal(response.status,specimen.status);
        assert.equal(response.headers.get('cache-control'),'no-store');
        assert.equal(response.headers.get('x-content-type-options'),'nosniff');
        const body=await response.json();
        if(specimen.code)assert.equal(body.error?.code,specimen.code);
        else {assert.equal(body.blocking,true);assert.equal(body.match,'none');assert.deepEqual(body.rules,[]);}
        if(upload){
          assert.equal(upload.eofReleased,false,'413 must precede EOF cleanup');
          assert.equal(upload.signal.aborted,false,'deadline must not produce a successful rejection');
        }
        result.passed++;
      }catch(error){
        // Never log payloads, cookies, arbitrary runtime error text or proxy keys.
        result.failures.push({index:i,kind:error.name,cause:error.cause?.code||null});
        break; // failed mutations are never automatically replayed
      }finally{upload?.cleanup();}
    }
    try{await checkHealth();result.health=true;}catch{result.health=false;}
    report.cases.push(result);
  }
}catch(error){report.setup_error=error.name;}
finally{
  try{await mf.dispose();report.disposed=true;}catch{report.disposed=false;}
  if(url)report.port_closed=await new Promise(resolveClosed=>{
    const socket=net.connect({host:'127.0.0.1',port:Number(url.port)});
    socket.setTimeout(1000);
    socket.once('error',error=>{socket.destroy();resolveClosed(error.code==='ECONNREFUSED');});
    socket.once('connect',()=>{socket.destroy();resolveClosed(false);});
    socket.once('timeout',()=>{socket.destroy();resolveClosed(false);});
  });
}
report.passed=report.cases.length===specimens.length&&report.cases.every(c=>c.passed===100&&c.failures.length===0&&c.health)&&report.runtime_error_count===0&&report.disposed&&report.port_closed;
console.log(JSON.stringify(report,null,2));
process.exitCode=report.passed?0:1;
