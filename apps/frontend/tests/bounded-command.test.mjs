import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createIsolatedTestEnv} from './helpers/isolated-test-env.mjs';
import {runBoundedCommand, updateOwnedProcesses} from './helpers/bounded-command.mjs';
const fixture = fileURLToPath(new URL('./fixtures/bounded-child.mjs', import.meta.url));
const birth = '2026-10-02T10:00:00.000Z';
const later = '2026-10-02T10:00:01.000Z';
const row = (pid, parent, created = birth) => ({pid, parent, created});

test('isolated child env excludes credentials, proxies, preloads and inherited config', () => {
  const root = mkdtempSync(join(tmpdir(), 'evix-env-'));
  try {
    const inherited = {Path:'runtime-only',SystemRoot:'C:\\Windows',AWS_SECRET_ACCESS_KEY:'synthetic',
      HTTP_PROXY:'synthetic',NODE_OPTIONS:'synthetic',CODEX_HOME:'synthetic',HOME:'synthetic',USERPROFILE:'synthetic'};
    const {env,paths} = createIsolatedTestEnv({rootDir:root,inherited,platform:'win32'});
    for (const key of ['AWS_SECRET_ACCESS_KEY','HTTP_PROXY','NODE_OPTIONS','CODEX_HOME','HOME']) assert.equal(env[key],undefined);
    assert.equal(env.PATH,'runtime-only'); assert.equal(env.USERPROFILE,paths.profile);
    assert.equal(env.WRANGLER_SEND_METRICS,'false'); assert.equal(env.CI,'true');
    assert.equal(inherited.USERPROFILE,'synthetic');
    assert.throws(() => createIsolatedTestEnv({rootDir:root,inherited}),/already exists/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('POSIX child context uses isolated home and refuses relative path', () => {
  const root=mkdtempSync(join(tmpdir(),'evix-env-'));
  try {const {env,paths}=createIsolatedTestEnv({rootDir:root,inherited:{PATH:'/synthetic'},platform:'linux'});
    assert.equal(env.HOME,paths.profile); assert.equal(env.XDG_CACHE_HOME,paths.cache);
    assert.throws(()=>createIsolatedTestEnv({rootDir:'relative'}),/Absolute/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('ownership discovers early and late children only through current matching parents', () => {
  const first=updateOwnedProcesses([row(1,0),row(2,1,later)],[row(1,0)]);
  assert.deepEqual(first.captured.map(r=>r.pid),[1,2]);
  const late=updateOwnedProcesses([row(1,0),row(2,1,later),row(3,2,later)],first.captured);
  assert.deepEqual(late.remaining.map(r=>r.pid),[1,2,3]);
});
test('exited or reused parent PID does not grant authority over replacement children', () => {
  const result=updateOwnedProcesses([row(1,0,later),row(99,1,later)],[row(1,0)]);
  assert.deepEqual(result.remaining,[]); assert.deepEqual(result.captured,[row(1,0)]);
  const orphan=updateOwnedProcesses([row(2,1,later),row(3,2,later)],[row(1,0),row(2,1,later)]);
  assert.deepEqual(orphan.remaining.map(r=>r.pid),[2,3]);
});
test('missing owned/descendant metadata and duplicate PID fail closed', () => {
  assert.throws(()=>updateOwnedProcesses([row(1,0,null)],[row(1,0)]));
  assert.throws(()=>updateOwnedProcesses([row(1,0),row(2,1,null)],[row(1,0)]));
  assert.throws(()=>updateOwnedProcesses([row(1,0),row(1,0)],[]));
});
test('metadata preflight failure never starts a target', async () => {
  let stops=0;
  const result=await runBoundedCommand({command:process.execPath,args:[fixture,'zero'],cwd:process.cwd(),env:{},
    processAdapter:{readProcesses:async()=>{throw new Error('synthetic metadata failure');},stopIdentity:async()=>{stops++;}},
    timeoutMs:100,cleanupTimeoutMs:100,closeGraceMs:20});
  assert.equal(result.receipt.passed,false); assert.equal(result.receipt.ownership_confirmed,false);
  assert.equal(result.stdout,''); assert.equal(stops,0); assert.equal(result.receipt.observation_error,'OWNERSHIP_OR_ADAPTER_FAILED');
});
test('hanging metadata adapter is bounded before spawn', async () => {
  const result=await runBoundedCommand({command:process.execPath,args:[],cwd:process.cwd(),env:{},
    processAdapter:{readProcesses:()=>new Promise(()=>{}),stopIdentity:async()=>{}},timeoutMs:100,cleanupTimeoutMs:50,closeGraceMs:20});
  assert.equal(result.receipt.passed,false); assert.equal(result.receipt.ownership_confirmed,false);
});
test('exit zero without stream close fails even when all captured identities are gone', async () => {
  let exited=false, emitted=false, fake;
  const created=new Date().toISOString();
  const adapter={
    readProcesses:async()=>exited?[]:[{pid:7654,parent:0,created}],
    stopIdentity:async()=>{throw new Error('No live identity may be stopped');},
    spawnLauncher:()=>{
      fake=new EventEmitter(); fake.pid=7654; fake.connected=true;
      fake.stdout=new PassThrough(); fake.stderr=new PassThrough();
      fake.disconnect=()=>{fake.connected=false;}; fake.unref=()=>{};
      fake.send=(message,callback)=>{
        if(message.type==='run'&&!emitted){emitted=true;setImmediate(()=>{
          exited=true; fake.emit('message',{nonce:message.nonce,type:'target-exit',code:0,signal:null});
          fake.emit('exit',0,null); // Intentionally no close event/EOF.
        });}
        callback?.();
      };
      return fake;
    },
  };
  const result=await runBoundedCommand({command:process.execPath,cwd:process.cwd(),env:{},
    processAdapter:adapter,timeoutMs:500,closeGraceMs:30,cleanupTimeoutMs:50,pollIntervalMs:10});
  assert.equal(result.receipt.command_exit_code,0); assert.equal(result.receipt.passed,false);
  assert.equal(result.receipt.streams_closed,false); assert.equal(result.receipt.observation_error,'STREAM_CLOSE_TIMEOUT');
  assert.equal(result.receipt.captured_tree_empty,true); assert.equal(result.receipt.forced_cleanup,false);
});
for (const scenario of ['late-deadline','late-close']) {
  test(`completion events cannot bypass ${scenario} while awaiting metadata`, async () => {
    let ended=false, reads=0;
    const created=new Date().toISOString();
    const adapter={readProcesses:async()=>{
      reads++;
      if(reads===4) await new Promise(resolve=>setTimeout(resolve,100));
      return ended?[]:[{pid:8765,parent:0,created}];
    },stopIdentity:async()=>{throw new Error('No live process');},spawnLauncher:()=>{
      const fake=new EventEmitter();fake.pid=8765;fake.connected=true;
      fake.stdout=new PassThrough();fake.stderr=new PassThrough();fake.disconnect=()=>{fake.connected=false;};fake.unref=()=>{};
      fake.send=(message,callback)=>{
        if(message.type==='run') {
          setTimeout(()=>{ended=true;fake.emit('message',{nonce:message.nonce,type:'target-exit',code:0,signal:null});fake.emit('exit',0,null);},scenario==='late-deadline'?60:1);
          setTimeout(()=>fake.emit('close'),70);
        }
        callback?.();
      };return fake;
    }};
    const result=await runBoundedCommand({command:process.execPath,cwd:process.cwd(),env:{},processAdapter:adapter,
      timeoutMs:scenario==='late-deadline'?50:500,closeGraceMs:scenario==='late-close'?20:200,cleanupTimeoutMs:200,pollIntervalMs:10});
    assert.equal(result.receipt.passed,false);assert.equal(result.receipt.command_exit_code,0);
    if(scenario==='late-deadline')assert.equal(result.receipt.timed_out,true);
    else assert.equal(result.receipt.observation_error,'STREAM_CLOSE_TIMEOUT');
  });
}

// Actual OS fixtures are opt-in: they require metadata access, never Wrangler.
const real = process.env.EVI_X_BOUNDED_OS_TESTS === '1' && process.platform === 'win32';
for (const mode of ['zero','nonzero','spawn-error','hang','overflow','latechild','log-error']) {
  test(`owned real synthetic fixture: ${mode}`, {skip: !real, timeout: 45000}, async () => {
    const root=mkdtempSync(join(tmpdir(),'evix-bounded-'));
    const {env}=createIsolatedTestEnv({rootDir:root});
    const result=await runBoundedCommand({command:mode==='spawn-error'?join(root,'missing.exe'):process.execPath,
      args:[fixture,mode==='log-error'?'zero':mode],cwd:root,env,timeoutMs:mode==='hang'||mode==='latechild'?6500:20000,
      maxOutputBytes:mode==='overflow'?1024:1048576,closeGraceMs:300,cleanupTimeoutMs:12000,
      onOutput:mode==='log-error'?()=>{throw new Error('synthetic sink failure');}:undefined});
    // Retain isolated state on uncertain ownership/cleanup rather than removing evidence.
    if (result.receipt.captured_tree_empty) rmSync(root,{recursive:true,force:true});
    assert.equal(result.receipt.passed,mode==='zero',JSON.stringify(result.receipt));
    if (mode==='nonzero') assert.equal(result.receipt.command_exit_code,7);
    if (mode==='spawn-error') assert.equal(result.receipt.spawn_error,'TARGET_SPAWN_ERROR');
    if (mode==='hang'||mode==='latechild') assert.equal(result.receipt.timed_out,true);
    if (mode==='overflow') assert.equal(result.receipt.output_limit_exceeded,true);
    if (mode==='log-error') assert.equal(result.receipt.observation_error,'OUTPUT_SINK_FAILED');
    assert.equal(result.receipt.cleanup_scope,'captured-identities-only');
    assert.equal(result.receipt.captured_tree_empty,true,JSON.stringify(result.receipt));
  });
}
