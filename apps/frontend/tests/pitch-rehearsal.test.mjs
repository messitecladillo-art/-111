import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startPitchSession,transitionPitchSession,pitchElapsed,pitchPlanMatches,summarizePitch,exportPitchSessions} from '../lib/pitch-rehearsal.ts';

const input=(patch={})=>({id:'round-1',reportVersion:'讲稿 v3',startedAt:'2026-10-02T12:00:00.000Z',corpusVersion:'2026-10-02.1',total:600,reserve:30,weights:[12,18,40,24,6],...patch});
const start=(patch={},now=0)=>startPitchSession(input(patch),now);
const frozen=value=>{Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))frozen(child);return value;};
function finish(durations=[1000,2000,3000,4000,5000],options={}) {
  let session=start(options),now=0;
  for(const duration of durations){now+=duration;session=transitionPitchSession(session,'complete-block',now);}
  return session;
}

test('start snapshots the validated plan and labels without mutating caller',()=>{
  const settings=input(),session=startPitchSession(settings,100);
  settings.weights[0]=100;settings.reportVersion='changed';
  assert.equal(session.plan[0].weight,12);assert.equal(session.reportVersion,'讲稿 v3');
  assert.equal(session.status,'running');assert.equal(session.currentIndex,0);assert.deepEqual(session.segments,[]);
  assert.equal(session.plan.reduce((sum,b)=>sum+b.seconds,0),570);
  assert.deepEqual(pitchElapsed(session,350),{currentMs:250,totalMs:250});
});
test('read projections and transitions leave deeply frozen source intact',()=>{
  const original=frozen(start()),before=JSON.stringify(original);
  assert.deepEqual(pitchElapsed(original,1000),{currentMs:1000,totalMs:1000});
  const next=transitionPitchSession(original,'complete-block',1000);
  assert.equal(JSON.stringify(original),before);assert.equal(next.currentIndex,1);
  next.plan[0].label='edited';assert.notEqual(original.plan[0].label,'edited');
});
test('pause excludes downtime and records exactly one interruption per accepted pause',()=>{
  let session=transitionPitchSession(start(),'pause',1500);
  assert.equal(session.pauseCount,1);assert.deepEqual(pitchElapsed(session,8000),{currentMs:1500,totalMs:1500});
  const before=JSON.stringify(session);assert.throws(()=>transitionPitchSession(session,'pause',8000));assert.equal(JSON.stringify(session),before);
  session=transitionPitchSession(session,'resume',9000);
  session=transitionPitchSession(session,'complete-block',10000);
  assert.equal(session.segments[0].elapsedMs,2500);assert.equal(session.pauseCount,1);
  assert.deepEqual(pitchElapsed(session,10300),{currentMs:300,totalMs:2800});
});
test('delayed reads use actual injected deltas rather than tick count',()=>{
  const session=start({},50);
  assert.deepEqual(pitchElapsed(session,200050),{currentMs:200000,totalMs:200000});
  assert.equal(session.segments.length,0);assert.equal(session.status,'running');
  assert.deepEqual(pitchElapsed(session,200.75),{currentMs:150.75,totalMs:150.75});
});
test('five manual completions conserve exact recorded active time',()=>{
  const done=finish();
  assert.equal(done.status,'completed');assert.equal(done.currentIndex,5);assert.equal(done.segments.length,5);
  assert.ok(done.segments.every(s=>s.completed));assert.equal(done.segments.reduce((sum,s)=>sum+s.elapsedMs,0),15000);
  assert.deepEqual(pitchElapsed(done,999999),{currentMs:0,totalMs:15000});
  assert.equal(summarizePitch(done).actualMs,15000);assert.equal(summarizePitch(done).complete,true);
  for(const action of ['pause','resume','complete-block','stop'])assert.throws(()=>transitionPitchSession(done,action,999999));
});
test('zero-time duplicate completion is rejected; no automatic advance at deadline',()=>{
  const first=transitionPitchSession(start(),'complete-block',1000),before=JSON.stringify(first);
  assert.throws(()=>transitionPitchSession(first,'complete-block',1000));assert.equal(JSON.stringify(first),before);
  const elapsed=pitchElapsed(first,1000000);assert.equal(elapsed.currentMs,999000);assert.equal(first.currentIndex,1);
});
test('stopping block two preserves its partial and never fabricates later segments',()=>{
  const first=transitionPitchSession(start(),'complete-block',1000);
  const stopped=transitionPitchSession(first,'stop',2500);
  assert.equal(stopped.status,'stopped');assert.equal(stopped.currentIndex,1);
  assert.deepEqual(stopped.segments.map(s=>[s.elapsedMs,s.completed]),[[1000,true],[1500,false]]);
  assert.deepEqual(pitchElapsed(stopped,100000),{currentMs:1500,totalMs:2500});assert.equal(summarizePitch(stopped).complete,false);
});
test('stopping immediately may record a zero-time partial but not a completed block',()=>{
  const stopped=transitionPitchSession(start(),'stop',0);
  assert.equal(stopped.segments.length,1);assert.equal(stopped.segments[0].elapsedMs,0);assert.equal(stopped.segments[0].completed,false);
  assert.equal(summarizePitch(stopped).actualMs,0);assert.equal(exportPitchSessions([stopped]).records[0].status,'stopped');
});
test('stop while paused seals only previously active time',()=>{
  const paused=transitionPitchSession(start(),'pause',1200);
  const stopped=transitionPitchSession(paused,'stop',9000);
  assert.equal(stopped.segments[0].elapsedMs,1200);assert.equal(stopped.pauseCount,1);
});
test('illegal actions and backward or non-finite clocks fail atomically',()=>{
  const session=start({},100),before=JSON.stringify(session);
  for(const at of [99,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'101',null]){
    assert.throws(()=>transitionPitchSession(session,'pause',at));assert.throws(()=>pitchElapsed(session,at));
  }
  assert.throws(()=>transitionPitchSession(session,'resume',100));assert.throws(()=>transitionPitchSession(session,'unknown',100));
  assert.equal(JSON.stringify(session),before);
  const paused=transitionPitchSession(session,'pause',200);
  assert.throws(()=>transitionPitchSession(paused,'complete-block',300));
  const resumed=transitionPitchSession(paused,'resume',500);assert.throws(()=>pitchElapsed(resumed,499));
});
test('invalid start metadata and plans are refused',()=>{
  for(const reportVersion of ['', '   ', 'x'.repeat(121), 'v1\nsecret'])assert.throws(()=>start({reportVersion}));
  for(const patch of [{id:''},{startedAt:''},{corpusVersion:''},{total:119},{total:1801},{total:NaN},{reserve:-1},{reserve:91},{weights:[]},{weights:[0,1,1,1,1]},{weights:[1,1,1,1,Infinity]},{weights:null}])assert.throws(()=>start(patch));
  for(const at of [-1,NaN,Infinity])assert.throws(()=>start({},at));
});
test('plan drift is a read-only comparison and invalid edited inputs return false',()=>{
  const session=start(),before=JSON.stringify(session);
  assert.equal(pitchPlanMatches(session,600,30,[12,18,40,24,6]),true);
  assert.equal(pitchPlanMatches(session,601,30,[12,18,40,24,6]),false);
  assert.equal(pitchPlanMatches(session,600,31,[12,18,40,24,6]),false);
  assert.equal(pitchPlanMatches(session,600,30,[24,36,80,48,12]),false);
  for(const weights of [null,[],[1,1,1,1,NaN]])assert.equal(pitchPlanMatches(session,600,30,weights),false);
  assert.equal(pitchPlanMatches(session,NaN,30,[12,18,40,24,6]),false);assert.equal(JSON.stringify(session),before);
});
test('summary is safe during running/paused and does not invent uncommitted elapsed time',()=>{
  const session=start();assert.equal(summarizePitch(session).actualMs,0);assert.equal(summarizePitch(session).complete,false);
  const paused=transitionPitchSession(session,'pause',1000);assert.equal(summarizePitch(paused).actualMs,1000);
  const resumed=transitionPitchSession(paused,'resume',9000);assert.equal(summarizePitch(resumed).actualMs,1000);
  assert.equal(pitchElapsed(resumed,9500).totalMs,1500);
});
test('complete summary separates signed plan difference, consumed reserve and total excess',()=>{
  assert.deepEqual(summarizePitch(finish([100000,100000,100000,100000,100000])),{actualMs:500000,complete:true,overPlanMs:-70000,reserveUsedMs:0,overTotalMs:0});
  assert.deepEqual(summarizePitch(finish([118000,118000,118000,118000,118000])),{actualMs:590000,complete:true,overPlanMs:20000,reserveUsedMs:20000,overTotalMs:0});
  assert.deepEqual(summarizePitch(finish([124000,124000,124000,124000,124000])),{actualMs:620000,complete:true,overPlanMs:50000,reserveUsedMs:30000,overTotalMs:20000});
});
test('export is a detached complete snapshot without monotonic coordinates or evidence certification',()=>{
  const done=finish(),before=JSON.stringify(done),pack=exportPitchSessions([done]);
  assert.equal(pack.schema,'evix-pitch-rehearsal/v1');assert.match(pack.contentClass,/not_verified/);
  assert.match(pack.notice,/不是官方计时证明/);assert.match(pack.notice,/不支持/);
  const encoded=JSON.stringify(pack);for(const name of ['clockStartedMs','lastClockMs','currentElapsedMs'])assert.ok(!encoded.includes(name));
  assert.equal(pack.records[0].reportVersion,done.reportVersion);assert.deepEqual(pack.records[0].segments,done.segments);
  pack.records[0].plan[0].seconds=0;pack.records[0].segments[0].elapsedMs=0;assert.equal(JSON.stringify(done),before);
});
test('export rejects running and paused records atomically even among completed rounds',()=>{
  const done=finish(),running=start({id:'round-2'}),paused=transitionPitchSession(running,'pause',1000),rounds=[done,paused];
  const before=JSON.stringify(rounds);assert.throws(()=>exportPitchSessions([done,running]));assert.throws(()=>exportPitchSessions(rounds));
  assert.equal(JSON.stringify(rounds),before);assert.throws(()=>exportPitchSessions([]));
});
test('export cap and duplicate identity checks never silently truncate history',()=>{
  const rounds=Array.from({length:20},(_,i)=>finish(undefined,{id:`round-${i}`}));
  assert.equal(exportPitchSessions(rounds).records.length,20);
  const before=JSON.stringify(rounds);assert.throws(()=>exportPitchSessions([...rounds,finish(undefined,{id:'round-20'})]));
  assert.equal(JSON.stringify(rounds),before);assert.throws(()=>exportPitchSessions([rounds[0],rounds[0]]));
});
test('tampered plans, segment order, completion, clocks and elapsed values cannot be exported as records',()=>{
  const corruptions=[s=>s.plan[0].seconds++,s=>s.plan[0].weight++,s=>s.segments[0].id='wrong',s=>s.segments[0].completed=false,s=>s.segments[0].elapsedMs=-1,s=>s.segments[0].elapsedMs=0,s=>s.currentIndex=4,s=>s.pauseCount=-1,s=>s.clockStartedMs=0,s=>s.currentElapsedMs=1];
  for(const corrupt of corruptions){const bad=finish();corrupt(bad);const before=JSON.stringify(bad);assert.throws(()=>exportPitchSessions([bad]));assert.equal(JSON.stringify(bad),before);}
});
test('two pauses conserve active time across multiple blocks and one incomplete stop',()=>{
  let s=start();s=transitionPitchSession(s,'pause',1000);s=transitionPitchSession(s,'resume',5000);
  s=transitionPitchSession(s,'complete-block',7000);s=transitionPitchSession(s,'pause',9000);
  s=transitionPitchSession(s,'resume',15000);s=transitionPitchSession(s,'stop',18000);
  assert.equal(s.pauseCount,2);assert.equal(summarizePitch(s).actualMs,8000);
  assert.deepEqual(s.segments.map(x=>x.elapsedMs),[3000,5000]);
});
test('core does not consult a system clock, random generator, storage or network',()=>{
  const source=readFileSync(new URL('../lib/pitch-rehearsal.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:Date|crypto)\s*[.(]|\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/);
});
