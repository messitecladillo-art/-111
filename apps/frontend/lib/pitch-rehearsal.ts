import {allocatePitch, PITCH_BLOCKS} from './defense-training.ts';

type PitchPlan = ReturnType<typeof allocatePitch>;
export type PitchSession = {
  id:string;
  reportVersion:string;
  startedAt:string;
  corpusVersion:string;
  total:number;
  reserve:number;
  plan:PitchPlan;
  status:'running'|'paused'|'completed'|'stopped';
  currentIndex:number;
  segments:Array<{id:string;elapsedMs:number;completed:boolean}>;
  pauseCount:number;
  // Page-local monotonic coordinates. These never leave the process in exports.
  clockStartedMs:number|null;
  lastClockMs:number;
  currentElapsedMs:number;
};

type StartPitch = Pick<PitchSession,'id'|'reportVersion'|'startedAt'|'corpusVersion'|'total'|'reserve'> & {weights:number[]};
type PitchAction = 'pause'|'resume'|'complete-block'|'stop';
const MAX_ROUNDS = 20;
const ownRecord = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object'
  && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));

function text(value:unknown,label:string):string {
  if(typeof value!=='string'||!value.trim()||value.length>120||/[\u0000-\u001f\u007f]/u.test(value)) {
    throw Error(`${label}须为 1 至 120 字的有效文字。`);
  }
  return value;
}
function milliseconds(value:unknown):number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw Error('计时值无效，原记录未修改。');
  return value;
}
function addMs(a:number,b:number):number {return milliseconds(a+b);}
function copyPlan(plan:PitchPlan):PitchPlan {return plan.map(block=>({...block}));}
function recordedMs(session:PitchSession):number {
  return session.segments.reduce((sum,segment)=>addMs(sum,segment.elapsedMs),0);
}
function checkedSession(value:PitchSession):void {
  if(!ownRecord(value))throw Error('彩排记录结构无效。');
  text(value.id,'轮次标识');text(value.reportVersion,'报告 / 讲稿版本');
  text(value.startedAt,'开始时间标签');text(value.corpusVersion,'题库版本');
  if(!Array.isArray(value.plan)||value.plan.length!==PITCH_BLOCKS.length)throw Error('彩排计划缺少段落。');
  const expected=allocatePitch(value.total,value.reserve,value.plan.map(block=>block?.weight));
  for(const [index,block] of value.plan.entries()) {
    if(!ownRecord(block)||Object.keys(block).length!==Object.keys(expected[index]).length
      ||Object.entries(expected[index]).some(([key,wanted])=>block[key as keyof typeof block]!==wanted))throw Error('冻结计划已被修改或不完整。');
  }
  if(!['running','paused','completed','stopped'].includes(value.status)
    ||!Number.isInteger(value.currentIndex)||value.currentIndex<0||value.currentIndex>PITCH_BLOCKS.length
    ||!Number.isSafeInteger(value.pauseCount)||value.pauseCount<0||!Array.isArray(value.segments))throw Error('彩排状态无效。');
  milliseconds(value.lastClockMs);milliseconds(value.currentElapsedMs);
  if(value.status==='running') {
    if(value.clockStartedMs!==value.lastClockMs)throw Error('当前计时起点与状态不一致。');
    milliseconds(value.clockStartedMs);
  } else if(value.clockStartedMs!==null)throw Error('非运行记录不能继续计时。');
  const terminal=value.status==='completed'||value.status==='stopped';
  if(terminal&&value.currentElapsedMs!==0)throw Error('结束记录仍含未封存计时。');
  if(value.status==='completed') {
    if(value.currentIndex!==PITCH_BLOCKS.length||value.segments.length!==PITCH_BLOCKS.length)throw Error('五段记录未完成。');
  } else {
    if(value.currentIndex>=PITCH_BLOCKS.length||value.segments.length!==value.currentIndex+(value.status==='stopped'?1:0))throw Error('记录与当前段落不一致。');
  }
  for(const [index,segment] of value.segments.entries()) {
    const completed=value.status!=='stopped'||index<value.currentIndex;
    if(!ownRecord(segment)||segment.id!==PITCH_BLOCKS[index].id||segment.completed!==completed)throw Error('段落次序或完成状态无效。');
    milliseconds(segment.elapsedMs);
    if(completed&&segment.elapsedMs<=0)throw Error('完成段落必须有实际计时。');
  }
  addMs(recordedMs(value),value.currentElapsedMs);
}
function checkedClock(session:PitchSession,nowMs:number):void {
  milliseconds(nowMs);
  if(nowMs<session.lastClockMs)throw Error('时钟早于最近一次操作，原记录未修改。');
}
function cloneSession(session:PitchSession):PitchSession {
  return {
    id:session.id,reportVersion:session.reportVersion,startedAt:session.startedAt,corpusVersion:session.corpusVersion,
    total:session.total,reserve:session.reserve,plan:copyPlan(session.plan),status:session.status,currentIndex:session.currentIndex,
    segments:session.segments.map(segment=>({...segment})),pauseCount:session.pauseCount,
    clockStartedMs:session.clockStartedMs,lastClockMs:session.lastClockMs,currentElapsedMs:session.currentElapsedMs,
  };
}

/** Inputs are user labels and a practice plan, not verified report facts. */
export function startPitchSession(input:StartPitch,nowMs:number):PitchSession {
  if(!ownRecord(input))throw Error('请填写彩排设置。');
  milliseconds(nowMs);
  const id=text(input.id,'轮次标识'),reportVersion=text(input.reportVersion,'报告 / 讲稿版本');
  const startedAt=text(input.startedAt,'开始时间标签'),corpusVersion=text(input.corpusVersion,'题库版本');
  if(!Array.isArray(input.weights))throw Error('练习权重无效。');
  const plan=allocatePitch(input.total,input.reserve,[...input.weights]);
  return {id,reportVersion,startedAt,corpusVersion,total:input.total,reserve:input.reserve,plan,
    status:'running',currentIndex:0,segments:[],pauseCount:0,clockStartedMs:nowMs,lastClockMs:nowMs,currentElapsedMs:0};
}

/** Read-only projection. Backward checks are against the last committed action. */
export function pitchElapsed(session:PitchSession,nowMs:number):{currentMs:number;totalMs:number} {
  checkedSession(session);checkedClock(session,nowMs);
  const terminal=session.status==='completed'||session.status==='stopped';
  const currentMs=terminal ? (session.status==='stopped'?session.segments.at(-1)!.elapsedMs:0)
    : addMs(session.currentElapsedMs,session.status==='running'?nowMs-session.clockStartedMs!:0);
  return {currentMs,totalMs:terminal?recordedMs(session):addMs(recordedMs(session),currentMs)};
}

/** An invalid action/clock throws before producing a replacement; inputs stay intact. */
export function transitionPitchSession(session:PitchSession,action:PitchAction,nowMs:number):PitchSession {
  checkedSession(session);checkedClock(session,nowMs);
  if(!['pause','resume','complete-block','stop'].includes(action))throw Error('未知彩排操作。');
  if(session.status==='completed'||session.status==='stopped')throw Error('本轮已经结束，请开始新一轮。');
  if(action==='resume'&&session.status!=='paused')throw Error('只有暂停的记录可以继续。');
  if((action==='pause'||action==='complete-block')&&session.status!=='running')throw Error('请先继续当前段计时。');
  const elapsed=pitchElapsed(session,nowMs).currentMs;
  if(action==='complete-block'&&elapsed<=0)throw Error('本段尚无计时，不可连续跳过段落。');
  if(action==='pause'&&session.pauseCount>=Number.MAX_SAFE_INTEGER)throw Error('中断次数超出记录范围。');
  const next=cloneSession(session);
  next.lastClockMs=nowMs;
  if(action==='pause') {
    next.status='paused';next.currentElapsedMs=elapsed;next.clockStartedMs=null;next.pauseCount++;
  } else if(action==='resume') {
    next.status='running';next.clockStartedMs=nowMs;
  } else {
    next.segments.push({id:next.plan[next.currentIndex].id,elapsedMs:elapsed,completed:action==='complete-block'});
    next.currentElapsedMs=0;
    if(action==='stop') {next.status='stopped';next.clockStartedMs=null;}
    else {
      next.currentIndex++;
      next.status=next.currentIndex===next.plan.length?'completed':'running';
      next.clockStartedMs=next.status==='running'?nowMs:null;
    }
  }
  checkedSession(next);
  return next;
}

/** Invalid edited input is drift, never a rewrite of the frozen plan. */
export function pitchPlanMatches(session:PitchSession,total:number,reserve:number,weights:number[]):boolean {
  try {
    checkedSession(session);
    if(!Array.isArray(weights))return false;
    const candidate=allocatePitch(total,reserve,weights);
    return session.total===total&&session.reserve===reserve
      &&candidate.every((block,index)=>block.weight===session.plan[index].weight&&block.seconds===session.plan[index].seconds);
  } catch {return false;}
}

/** Running summaries cover committed time only; pitchElapsed supplies live display. */
export function summarizePitch(session:PitchSession):{actualMs:number;complete:boolean;overPlanMs:number;reserveUsedMs:number;overTotalMs:number} {
  checkedSession(session);
  const actualMs=addMs(recordedMs(session),session.currentElapsedMs);
  const overPlanMs=actualMs-(session.total-session.reserve)*1000;
  return {actualMs,complete:session.status==='completed',overPlanMs,
    reserveUsedMs:Math.max(0,Math.min(session.reserve*1000,overPlanMs)),overTotalMs:Math.max(0,actualMs-session.total*1000)};
}

/** Finalized local records only. Deliberately separate from v1 answer-note imports. */
export function exportPitchSessions(sessions:PitchSession[]) {
  if(!Array.isArray(sessions)||sessions.length<1||sessions.length>MAX_ROUNDS)throw Error('每次导出须包含 1 至 20 轮彩排，不会自动删除旧记录。');
  const seen=new Set<string>();
  const records=sessions.map(session=>{
    checkedSession(session);
    if(session.status!=='completed'&&session.status!=='stopped')throw Error('请先完成或结束本轮，再导出全部记录。');
    if(seen.has(session.id))throw Error('轮次标识重复，请检查记录。');
    seen.add(session.id);
    return {id:session.id,reportVersion:session.reportVersion,startedAt:session.startedAt,corpusVersion:session.corpusVersion,
      total:session.total,reserve:session.reserve,plan:copyPlan(session.plan),status:session.status,currentIndex:session.currentIndex,
      segments:session.segments.map(segment=>({id:segment.id,elapsedMs:segment.elapsedMs,completed:segment.completed})),
      pauseCount:session.pauseCount,summary:summarizePitch(session)};
  });
  return {schema:'evix-pitch-rehearsal/v1',contentClass:'user_operated_local_rehearsal_not_verified',
    notice:'本地用户操作的近似彩排记录，不是官方计时证明、报告证据核验或获奖评估；有中断不等同连续实战。版本与开始时间为用户提供的标签。不包含口述内容，不支持从答辩笔记导入恢复。',
    records};
}
