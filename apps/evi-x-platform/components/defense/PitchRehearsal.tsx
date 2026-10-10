"use client";

import {useEffect, useRef, useState} from 'react';
import {PITCH_BLOCKS} from '@/lib/defense-training';
import {exportPitchSessions, pitchElapsed, pitchPlanMatches, startPitchSession, summarizePitch, transitionPitchSession, type PitchSession} from '@/lib/pitch-rehearsal';
import styles from './PitchRehearsal.module.css';

type Props = {total:number; reserve:number; weights:number[]; corpusVersion:string; planError:string};
const MAX_ROUNDS = 20;
const isActive = (session:PitchSession|undefined) => session?.status === 'running' || session?.status === 'paused';
function duration(ms:number) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
function difference(ms:number) {return `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${duration(Math.abs(ms))}`;}

/** Local browser practice, never a report review or an official timing record. */
export default function PitchRehearsal({total, reserve, weights, corpusVersion, planError}:Props) {
  const [reportVersion, setReportVersion] = useState('');
  const [sessions, setSessions] = useState<PitchSession[]>([]);
  const records = useRef<PitchSession[]>([]);
  const panel = useRef<HTMLElement>(null);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const current = sessions.at(-1);
  const active = isActive(current);
  const running = current?.status === 'running';
  const publish = (next:PitchSession[]) => {records.current = next; setSessions(next);};

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const pauseFor = (message:string) => {
      const previous = records.current.at(-1);
      if (previous?.status !== 'running') return;
      try {
        const at = performance.now();
        const next = [...records.current.slice(0, -1), transitionPitchSession(previous, 'pause', at)];
        records.current = next; setSessions(next); setNow(at);
        setNotice(message); setError('');
      } catch {
        setError('计时发生异常，当前记录已保留。请结束本轮并另开一轮，不要将异常时间当作连续彩排成绩。');
      }
    };
    const pauseHidden = () => {
      if (document.hidden) pauseFor('页面进入后台，已自动暂停。返回后请手动继续；本轮会保留中断次数。');
    };
    // WorkbenchShell keeps every panel mounted. A module switch must pause
    // independently of document visibility, without clearing practice notes.
    const container = panel.current?.closest('[data-workbench-panel]');
    const observer = new MutationObserver(() => {
      if (container?.hasAttribute('hidden')) pauseFor('已切换工作台模块，本轮暂停且记录保留。返回路演与答辩后请手动继续。');
    });
    if (container) observer.observe(container, {attributes:true, attributeFilter:['hidden']});
    const warnClose = (event:BeforeUnloadEvent) => {
      if (records.current.length) {event.preventDefault(); event.returnValue = '';}
    };
    document.addEventListener('visibilitychange', pauseHidden);
    window.addEventListener('beforeunload', warnClose);
    return () => {observer.disconnect(); document.removeEventListener('visibilitychange', pauseHidden); window.removeEventListener('beforeunload', warnClose);};
  }, []);

  const start = () => {
    if (isActive(records.current.at(-1)) || records.current.length >= MAX_ROUNDS || planError) return;
    try {
      const at = performance.now();
      const next = startPitchSession({id:crypto.randomUUID(), reportVersion, startedAt:new Date().toISOString(), corpusVersion, total, reserve, weights}, at);
      publish([...records.current, next]); setNow(at); setError('');
      setNotice('计时已开始，按“完成本段”进入下一段。本轮计划和版本标签已固定；不采集音频或报告内容。');
    } catch (reason) {setError(reason instanceof Error ? reason.message : '无法开始，请检查本轮设置。');}
  };
  const act = (action:'pause'|'resume'|'complete-block'|'stop') => {
    const previous = records.current.at(-1);
    if (!previous || !isActive(previous)) return;
    try {
      const at = performance.now();
      if (action === 'complete-block' && pitchElapsed(previous, at).currentMs < 1000) {
        setError('本段尚不足 1 秒。请讲完本段后再确认，避免连点误跳。'); return;
      }
      const next = transitionPitchSession(previous, action, at);
      publish([...records.current.slice(0, -1), next]); setNow(at); setError('');
      setNotice(next.status === 'completed' ? '五段计时已记录。完成计时不代表内容正确，请结合缺口与证据复盘。'
        : next.status === 'stopped' ? '已保留本轮未完成记录，不会补齐未讲段落。'
        : action === 'pause' ? '已暂停；暂停时间不计入讲述时间，中断次数会保留。'
        : action === 'resume' ? '继续当前段。带暂停的练习不能当作连续实战用时。'
        : '已记录上一段，正在计时下一段。');
    } catch (reason) {setError(reason instanceof Error ? reason.message : '操作未生效，原记录保持不变。');}
  };
  let elapsed = {currentMs:0, totalMs:0};
  let clockError = '';
  if (current) {
    try {elapsed = pitchElapsed(current, now);} catch {clockError = '计时读取异常。请保留记录，结束本轮后重新练习。';}
  }
  const drift = current && !pitchPlanMatches(current, total, reserve, weights);
  const block = current?.plan[current.currentIndex];
  const summary = current && summarizePitch(current);
  const download = () => {
    if (!records.current.length || isActive(records.current.at(-1))) return;
    try {
      const content = exportPitchSessions(records.current);
      const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], {type:'application/json;charset=utf-8'}));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'EVI-X-彩排记录-非官方.json'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('已发起下载，请确认文件已保存。彩排 JSON 仅供复盘，无法通过“导入练习笔记”恢复，不能用作赛事计时证明。'); setError('');
    } catch {setError('导出失败，页面内的记录仍保留，请重试。');}
  };
  const clear = () => {
    if (isActive(records.current.at(-1)) || !records.current.length) return;
    if (!window.confirm('清空本页全部彩排记录？未下载的记录无法恢复。请先确认已保存彩排 JSON；答辩笔记不会被清空。')) return;
    publish([]); setNow(0); setError(''); setNotice('已清空本页彩排记录。已下载的文件及答辩笔记未受影响。');
  };

  return <section ref={panel} className={styles.panel} aria-labelledby="rehearsal-title">
    <header className={styles.heading}><div><span className={styles.kicker}>把计划练一遍</span><h3 id="rehearsal-title">分段实测彩排</h3><p>逐段记录用时，对照计划复盘。</p></div><span className={styles.tag}>仅本地 · 非官方计时</span></header>
    <p className={styles.boundary}>记录仅存于当前页面；刷新或关闭会丢失。切换模块或进入后台会自动暂停，返回后手动继续。彩排与答辩笔记需分别导出；彩排 JSON 暂不支持导入恢复。计时仅供练习，不采集音视频，不核验报告。</p>
    <div className={styles.setup}><label>本轮报告 / 讲稿版本<input maxLength={120} value={reportVersion} onChange={e => setReportVersion(e.target.value)} disabled={active} placeholder="例如：讲稿 v3 · 10 月 2 日修订（自行填写）"/></label><button type="button" onClick={start} disabled={active || !!planError || !reportVersion.trim() || sessions.length >= MAX_ROUNDS}>{sessions.length ? '按当前计划再练一轮' : '开始本轮计时'}</button></div>
    {!!planError && <p className={styles.warning}>先修正上方时间设置，才能开始新一轮；已有记录不受影响。</p>}
    {sessions.length >= MAX_ROUNDS && <p className={styles.warning}>本页已记录 20 轮，不会自动删除旧记录。请先导出并确认保存，再清空以继续。</p>}
    {current && <>
      <div className={styles.sessionHead}><strong>第 {sessions.length} 轮 · {current.reportVersion}</strong><span>{current.status === 'running' ? '正在讲述' : current.status === 'paused' ? '已暂停' : current.status === 'completed' ? '五段已记录' : '提前结束 · 未完成'} · 中断 {current.pauseCount} 次</span></div>
      {drift && <p className={styles.warning}>上方计划已变化。本轮仍按开始时的快照比较，不会重写已记录时间；下一轮才采用新计划。</p>}
      <div className={styles.clockArea}>
        <div><span>{active ? `当前段 · ${block?.label}` : '本轮讲述用时'}</span><strong role="timer" aria-label={active ? '当前段讲述时间' : '本轮讲述时间'}>{duration(active ? elapsed.currentMs : elapsed.totalMs)}</strong><small>累计 {duration(elapsed.totalMs)} / 本轮计划 {duration((current.total-current.reserve)*1000)} · 总练习额度 {duration(current.total*1000)}</small></div>
        {active && <div className={styles.controls}><button type="button" onClick={() => act(running ? 'pause' : 'resume')}>{running ? '暂停计时' : '继续当前段'}</button><button type="button" className={styles.primary} onClick={() => act('complete-block')} disabled={!running || !!clockError || elapsed.currentMs < 1000}>{current.currentIndex === PITCH_BLOCKS.length-1 ? '完成最后一段' : '完成本段，进入下一段'}</button><button type="button" className={styles.stop} onClick={() => act('stop')}>结束本轮（保留未完成）</button></div>}
      </div>
      <ol className={styles.blocks}>{current.plan.map((entry, index) => {
        const recorded = current.segments[index];
        const actual = recorded?.elapsedMs ?? (active && index === current.currentIndex ? elapsed.currentMs : null);
        return <li key={entry.id} className={active && index === current.currentIndex ? styles.current : undefined}><span>0{index+1} · {entry.label}</span><strong>{actual === null ? '尚未讲述' : duration(actual)}</strong><small>计划 {duration(entry.seconds*1000)}{actual !== null && <> · 差值 {difference(actual-entry.seconds*1000)}</>}</small><em>{recorded ? (recorded.completed ? '已确认本段结束' : '结束时尚未讲完') : active && index === current.currentIndex ? '当前段' : '未记录'}</em></li>;
      })}</ol>
      {!active && summary && <div className={styles.review}><strong>{summary.complete ? '本轮复盘' : '未完成，只比较已经记录的讲述'}</strong><p>{summary.complete ? `比讲述计划${summary.overPlanMs > 0 ? '多用' : '节余'} ${duration(Math.abs(summary.overPlanMs))}；使用预留 ${duration(summary.reserveUsedMs)}；超出总练习额度 ${duration(summary.overTotalMs)}。` : '未讲完的段落没有补零，也不据此宣称节省时间或达到要求。'}</p><ul><li>先检查重复背景、模型名和逐图复述；不要为了缩时删掉样本口径、关键证据与限制。</li><li>将卡顿处对应到报告页码或表号，在上方答辩笔记里写清补证、改稿和负责角色。</li><li>{current.pauseCount ? '本轮有中断，不能直接等同于连续实战；完成修订后再练一次不中断的版本。' : '本轮未记录暂停，但系统不核验是否真正完成口头讲述。'}</li></ul></div>}
    </>}
    {(error || clockError) && <p className={styles.error} role="alert">{error || clockError}</p>}
    <p className={styles.notice} role="status">{notice}</p>
    {!!sessions.length && <footer className={styles.footer}><span>本页保留 {sessions.length} / {MAX_ROUNDS} 轮 · 历史不会被新计划覆盖</span><button type="button" onClick={download} disabled={active}>导出全部彩排记录</button><button type="button" onClick={clear} disabled={active}>清空彩排记录…</button></footer>}
    {sessions.length > 1 && <details className={styles.history}><summary>查看前 {sessions.length-1} 轮</summary>{sessions.slice(0,-1).map((session, index) => <p key={session.id}>第 {index+1} 轮 · {session.reportVersion} · {session.status === 'completed' ? '五段已记录' : '未完成'} · 讲述 {duration(summarizePitch(session).actualMs)} · 中断 {session.pauseCount} 次</p>)}</details>}
  </section>;
}
