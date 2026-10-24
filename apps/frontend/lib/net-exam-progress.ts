/** Device-local practice state. Grading changes records; animation never does. */
export type ExamQuestion = { id: string; type: 'single'|'multiple'|'boolean'; chapter: string; stem: string; options: { id: string; text: string }[]; answer: string[]; answerStatus: 'valid'; explanation?: string; sourceRefs: { sourceId: string; locators: string[]; answerLocator?: string }[] };
export type ExamBank = { version: string; sources: { id: string; filename: string; sha256: string }[]; questions: ExamQuestion[] };
export const EXAM_MODES = ['sequential','random','chapter','wrong','favorites','mock'] as const;
export type ExamMode = typeof EXAM_MODES[number];
export type Grade = 'correct'|'incorrect'|'unanswered';
export type ExamResponse = { selected: string[]; submittedAt: number|null; grade: Grade|null };
export type ExamSession = { id: string; mode: ExamMode; questionIds: string[]; index: number; startedAt: number; deadline: number|null; finishedAt: number|null; responses: Record<string,ExamResponse> };
export type ExamProgress = { schema: 'net-exam-progress/v1'; accountId: string; bankVersion: string; records: Record<string,{ attempts: number; correctAttempts: number; lastGrade: 'correct'|'incorrect'; lastAt: number }>; favorites: string[]; session: ExamSession|null };
export function examProgressKey(accountId: string, bankVersion: string): string { if (!accountId) throw Error('需要已登录账号。'); return `evix-net-exam:${encodeURIComponent(accountId)}:${encodeURIComponent(bankVersion)}`; }
export function emptyExamProgress(accountId: string, bankVersion: string): ExamProgress { return {schema:'net-exam-progress/v1',accountId,bankVersion,records:{},favorites:[],session:null}; }
const dict = (value: unknown): value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype;
const finite = (n: unknown): n is number => typeof n==='number' && Number.isFinite(n) && n>=0;
/** Reject cross-owner/version, unknown IDs and corrupt snapshots instead of partly applying them. */
export function parseExamProgress(raw: string|null, accountId: string, bank: ExamBank): {progress: ExamProgress; reset: boolean} {
 const fallback=()=>({progress:emptyExamProgress(accountId,bank.version),reset:!!raw});
 if (!raw) return fallback();
 try {
  if(raw.length>4_000_000) return fallback();
  const p:unknown=JSON.parse(raw);if(!dict(p)||p.schema!=='net-exam-progress/v1'||p.accountId!==accountId||p.bankVersion!==bank.version||!dict(p.records)||!Array.isArray(p.favorites))return fallback();
  const questions=new Map(bank.questions.map(q=>[q.id,q]));
  const validIds=(a:unknown):a is string[]=>Array.isArray(a)&&a.every(x=>typeof x==='string'&&questions.has(x))&&new Set(a).size===a.length;
  if(!validIds(p.favorites))return fallback();
  for(const [id,r] of Object.entries(p.records))if(!questions.has(id)||!dict(r)||!Number.isInteger(r.attempts)||!finite(r.attempts)||r.attempts<1||!Number.isInteger(r.correctAttempts)||!finite(r.correctAttempts)||r.correctAttempts>r.attempts||!['correct','incorrect'].includes(String(r.lastGrade))||!finite(r.lastAt))return fallback();
  if(p.session!==null){
   const s=p.session;if(!dict(s)||typeof s.id!=='string'||!s.id||!EXAM_MODES.includes(s.mode as ExamMode)||!validIds(s.questionIds)||!s.questionIds.length||!Number.isInteger(s.index)||!finite(s.index)||s.index>=s.questionIds.length||!finite(s.startedAt)||!(s.finishedAt===null||finite(s.finishedAt))||!(s.deadline===null||finite(s.deadline))||!dict(s.responses))return fallback();
   if(s.mode==='mock'?(s.deadline===null||(s.deadline as number)<s.startedAt):s.deadline!==null)return fallback();
   if(s.finishedAt!==null&&(s.finishedAt as number)<s.startedAt)return fallback();
   if(s.mode==='mock'&&s.finishedAt!==null&&s.questionIds.some(id=>!Object.hasOwn(s.responses as object,id)))return fallback();
   for(const [id,r] of Object.entries(s.responses)){
    const q=questions.get(id);if(!s.questionIds.includes(id)||!q||!dict(r)||!Array.isArray(r.selected)||!r.selected.every(x=>typeof x==='string'&&q.options.some(o=>o.id===x))||new Set(r.selected).size!==r.selected.length||(q.type!=='multiple'&&r.selected.length>1)||!(r.submittedAt===null||finite(r.submittedAt))||!(r.grade===null||['correct','incorrect','unanswered'].includes(String(r.grade))))return fallback();
    if(r.submittedAt===null?r.grade!==null:r.grade!==gradeExamAnswer(q,r.selected as string[]))return fallback();
    if(s.mode==='mock'&&s.finishedAt===null&&r.submittedAt!==null)return fallback();
   }
  }
  return {progress:p as ExamProgress,reset:false};
 }catch{return fallback();}
}
export function writeExamProgress(storage: {setItem:(key:string,value:string)=>void}, key: string, progress: ExamProgress): boolean { try { storage.setItem(key,JSON.stringify(progress));return true; } catch { return false; } }
const text = (v: unknown, limit: number): v is string => typeof v==='string' && v.length>0 && v.length<=limit;
/** Structural contract for the operator-provided bank; mirrors multi_agent.core.net_exam.validate_bank. */
export function parseExamBank(value: unknown): ExamBank {
 const fail=(reason:string)=>{throw Error(`题库格式无效：${reason}`);};
 if(!dict(value)||!text(value.version,120))fail('缺少版本');
 const v=value as Record<string,unknown>;
 if(!Array.isArray(v.sources)||!Array.isArray(v.questions)||!v.questions.length||v.questions.length>20_000)fail('缺少题目或来源');
 const sourceIds=new Set<string>();
 for(const s of v.sources as unknown[]){if(!dict(s)||!text(s.id,200)||sourceIds.has(s.id))fail('来源编号无效');sourceIds.add((s as {id:string}).id);}
 const questionIds=new Set<string>();
 for(const q of v.questions as unknown[]){
  if(!dict(q)||!text(q.id,200)||questionIds.has(q.id))fail('题目编号无效');
  const item=q as Record<string,unknown>;questionIds.add(item.id as string);
  if(!['single','multiple','boolean'].includes(String(item.type))||!text(item.stem,4000)||!text(item.chapter,200))fail(`题目 ${item.id} 不完整`);
  const options=item.options,answer=item.answer;
  if(!Array.isArray(options)||options.length<2||!Array.isArray(answer)||!answer.length)fail(`题目 ${item.id} 缺少选项或答案`);
  const optionIds=(options as unknown[]).map(o=>dict(o)&&text(o.id,40)&&typeof o.text==='string'?o.id:null);
  if(optionIds.some(id=>id===null)||new Set(optionIds).size!==optionIds.length)fail(`题目 ${item.id} 选项无效`);
  if(new Set(answer as unknown[]).size!==(answer as unknown[]).length||(answer as unknown[]).some(a=>!optionIds.includes(a as string)))fail(`题目 ${item.id} 答案无效`);
  if((item.type==='multiple')!==((answer as unknown[]).length>1))fail(`题目 ${item.id} 答案数量与题型不符`);
  if(item.answerStatus!=='valid')fail(`题目 ${item.id} 未通过来源核对`);
  if(!Array.isArray(item.sourceRefs)||(item.sourceRefs as unknown[]).some(r=>!dict(r)||!sourceIds.has(String(r.sourceId))||!Array.isArray(r.locators)))fail(`题目 ${item.id} 来源定位无效`);
 }
 return value as ExamBank;
}
export function gradeExamAnswer(question: ExamQuestion, selected: readonly string[]): Grade {
 if(!selected.length)return 'unanswered';
 if(new Set(selected).size!==selected.length||selected.some(id=>!question.options.some(o=>o.id===id))||(question.type!=='multiple'&&selected.length!==1))return 'incorrect';
 return selected.length===question.answer.length && selected.every(id=>question.answer.includes(id))?'correct':'incorrect';
}
/** Stable reproducible shuffle for a frozen practice session, without sorting by a random comparator. */
export function seededExamShuffle<T>(items: readonly T[], seed: number): T[] {
 const out=[...items];let state=seed>>>0;
 const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
 for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;
}
export function examQuestionPool(progress: ExamProgress, bank: ExamBank, mode: ExamMode, chapter=''): ExamQuestion[] {
 return bank.questions.filter(q=>q.answerStatus==='valid'&&(!chapter||q.chapter===chapter)&&(mode!=='wrong'||progress.records[q.id]?.lastGrade==='incorrect')&&(mode!=='favorites'||progress.favorites.includes(q.id)));
}
export function startExamSession(progress: ExamProgress, bank: ExamBank, options: {id:string;mode:ExamMode;chapter?:string;count?:number;minutes?:number;now:number;seed:number}): ExamProgress {
 if(!options.id||!finite(options.now))throw Error('练习参数无效。');
 const pool=examQuestionPool(progress,bank,options.mode,options.chapter);if(!pool.length)throw Error(options.mode==='wrong'?'当前没有错题。':options.mode==='favorites'?'先收藏一些题目。':'该范围没有可用题目。');
 const ordered=(options.mode==='random'||options.mode==='mock')?seededExamShuffle(pool,options.seed):pool;
 const count=options.mode==='mock'?Math.min(ordered.length,Math.max(1,Math.floor(Number.isFinite(options.count)?options.count!:25))):ordered.length;
 const minutes=Math.min(180,Math.max(1,Number.isFinite(options.minutes)?options.minutes!:30));
 return {...progress,session:{id:options.id,mode:options.mode,questionIds:ordered.slice(0,count).map(q=>q.id),index:0,startedAt:options.now,deadline:options.mode==='mock'?options.now+minutes*60_000:null,finishedAt:null,responses:{}}};
}
export function chooseExamAnswer(progress: ExamProgress, bank: ExamBank, questionId: string, optionId: string, now?: number): ExamProgress {
 const s=progress.session,q=bank.questions.find(q=>q.id===questionId);if(!s||s.finishedAt!==null||!s.questionIds.includes(questionId)||!q||!q.options.some(o=>o.id===optionId)||s.responses[questionId]?.submittedAt!=null)return progress;
 if(s.mode==='mock'&&s.deadline!==null&&now!==undefined&&now>=s.deadline)return finishExamMock(progress,bank,now);
 const selected=s.responses[questionId]?.selected??[];
 const next=q.type==='multiple'?(selected.includes(optionId)?selected.filter(id=>id!==optionId):[...selected,optionId]):[optionId];
 return {...progress,session:{...s,responses:{...s.responses,[questionId]:{selected:next,submittedAt:null,grade:null}}}};
}
function record(progress:ExamProgress,id:string,grade:Grade,now:number){ if(grade==='unanswered')return progress.records; const old=progress.records[id];return {...progress.records,[id]:{attempts:(old?.attempts??0)+1,correctAttempts:(old?.correctAttempts??0)+(grade==='correct'?1:0),lastGrade:grade,lastAt:now}}; }
export function submitExamPractice(progress: ExamProgress, bank: ExamBank, questionId: string, now: number): ExamProgress {
 const s=progress.session,q=bank.questions.find(q=>q.id===questionId),r=s?.responses[questionId];if(!s||s.mode==='mock'||s.finishedAt!==null||!s.questionIds.includes(questionId)||!q||!r?.selected.length||r.submittedAt!==null)return progress;
 const grade=gradeExamAnswer(q,r.selected);
 return {...progress,records:record(progress,questionId,grade,now),session:{...s,responses:{...s.responses,[questionId]:{...r,submittedAt:now,grade}}}};
}
/** Submit each answered item once. Blank mock items are unattempted, not added to the wrong pool. */
export function finishExamMock(progress: ExamProgress, bank: ExamBank, now: number): ExamProgress {
 const s=progress.session;if(!s||s.mode!=='mock'||s.finishedAt!==null)return progress;
 let records=progress.records;const responses={...s.responses};
 for(const id of s.questionIds){const q=bank.questions.find(q=>q.id===id);if(!q)continue;const r=responses[id]??{selected:[],submittedAt:null,grade:null};const grade=gradeExamAnswer(q,r.selected);responses[id]={...r,submittedAt:now,grade};records=record({...progress,records},id,grade,now);}
 return {...progress,records,session:{...s,responses,finishedAt:now}};
}
export function expireExamMock(progress: ExamProgress, bank: ExamBank, now: number): ExamProgress { return progress.session?.mode==='mock'&&progress.session.finishedAt===null&&progress.session.deadline!==null&&now>=progress.session.deadline?finishExamMock(progress,bank,now):progress; }
export function examSessionStats(session: ExamSession): {total:number;answered:number;correct:number;incorrect:number;unanswered:number} {
 const responses=session.questionIds.map(id=>session.responses[id]);const answered=responses.filter(r=>r?.selected.length).length;
 return {total:session.questionIds.length,answered,correct:responses.filter(r=>r?.grade==='correct').length,incorrect:responses.filter(r=>r?.grade==='incorrect').length,unanswered:session.questionIds.length-answered};
}
export function moveExamQuestion(progress: ExamProgress, index: number): ExamProgress { const s=progress.session;if(!s||!Number.isInteger(index)||index<0||index>=s.questionIds.length||index===s.index)return progress;return {...progress,session:{...s,index}}; }
export function toggleExamFavorite(progress: ExamProgress, questionId: string, bank: ExamBank): ExamProgress { if(!bank.questions.some(q=>q.id===questionId))return progress;return {...progress,favorites:progress.favorites.includes(questionId)?progress.favorites.filter(id=>id!==questionId):[...progress.favorites,questionId]}; }
