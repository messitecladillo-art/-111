'use client';

import { useState, useSyncExternalStore } from 'react';
import { CALENDAR_GROUPS, EDITION17_CALENDAR, calendarFor, type CalendarGroup } from '@/data/edition17-calendar';
import styles from './Overview.module.css';

const noop = () => () => {};
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const md = (iso: string) => `${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const span = (start: string | undefined, end: string) => start && start !== end ? `${md(start)} – ${md(end)}` : md(end);
const RAIL_START = '2026-09-21';
const PREVIEW = 4;

/** Phase rail: five stages between the notice and the group's final, drawn to scale. */
function phases(group: CalendarGroup) {
  const entries = EDITION17_CALENDAR.entries.filter(e => (e.groups as readonly CalendarGroup[]).includes(group));
  const end = (prefix: string) => entries.filter(e => e.id.startsWith(prefix)).map(e => e.end).sort().at(-1);
  const signup = end('signup')!, notice = end('practice-notice')!, knowledge = end('knowledge'), campus = end('campus')!, provincial = end('provincial'), final = end('final')!;
  const steps = [
    { label: '报名', end: signup },
    { label: knowledge ? '知识赛 · 命题' : '命题发布', end: [notice, knowledge ?? notice].sort().at(-1)! },
    { label: '调研 · 校赛', end: campus },
    ...(provincial ? [{ label: '企业命题 · 省赛', end: provincial }] : []),
    { label: '全国赛', end: final },
  ];
  return steps.map((s, i) => ({ ...s, start: i ? steps[i - 1].end : RAIL_START }));
}

export default function CompetitionCalendar() {
  const [group, setGroup] = useState<CalendarGroup>('undergrad');
  const [all, setAll] = useState(false);
  // The server cannot know the visitor's date; the countdown and today marker appear after hydration.
  const today = useSyncExternalStore(noop, localToday, () => null);
  const entries = calendarFor(group, today ?? RAIL_START);
  const next = today ? entries.find(e => e.state !== 'past') : undefined;
  const rail = phases(group);
  // Equal-width phases keep every label readable; today is interpolated inside its own phase.
  const first = dayNumber(RAIL_START), last = dayNumber(rail.at(-1)!.end);
  const at = (iso: string) => {
    const d = dayNumber(iso), i = rail.findIndex(p => d <= dayNumber(p.end));
    if (i < 0) return 100;
    const start = dayNumber(rail[i].start), end = dayNumber(rail[i].end);
    return ((i + Math.max(0, Math.min(1, (d - start) / Math.max(1, end - start)))) / rail.length) * 100;
  };
  // Same slice on the server (nothing past yet relative to the notice) and the client, so hydration does not jump.
  const visible = all ? entries : entries.filter(e => e.state !== 'past').slice(0, PREVIEW);
  const hidden = entries.length - visible.length;

  return <section className={styles.calendar} aria-labelledby="ov-calendar-title">
    <div className={styles.calendarHead}>
      <div>
        <span className={styles.eyebrow}>第十七届 · {EDITION17_CALENDAR.source.documentNumber}</span>
        <h2 id="ov-calendar-title">{next ? <>下一站：{next.label}</> : '第十七届赛程'}</h2>
        {next && <p className={styles.countdown} aria-live="polite">{next.state === 'current' ? <>进行中，距结束 <strong>{next.daysLeft}</strong> 天</> : next.daysLeft === 0 ? <><strong>今天</strong></> : <>还有 <strong>{next.daysLeft}</strong> 天 · {span(next.start, next.end)}</>}</p>}
      </div>
      <div className={styles.groupSwitch} role="radiogroup" aria-label="选择组别">
        {(Object.keys(CALENDAR_GROUPS) as CalendarGroup[]).map(g => <button type="button" role="radio" key={g} aria-checked={group === g} onClick={() => { setGroup(g); setAll(false); }}>{CALENDAR_GROUPS[g]}</button>)}
      </div>
    </div>

    <div className={styles.rail} aria-hidden="true">
      {rail.map((p, i) => <div key={p.label} className={styles.phase} style={{ left: `${(i / rail.length) * 100}%`, width: `${100 / rail.length}%` }} data-state={today ? (today > p.end ? 'past' : today >= p.start ? 'current' : 'upcoming') : 'upcoming'}>
        <i/><span>{p.label}</span><small>{i === rail.length - 1 ? `${md(p.end)}` : `至 ${md(p.end)}`}</small>
      </div>)}
      {today && dayNumber(today) >= first && dayNumber(today) <= last && <div className={styles.today} style={{ left: `${at(today)}%` }}><span>今天</span></div>}
    </div>

    <ol className={styles.agenda}>
      {visible.map(e => <li key={e.id} data-state={today ? e.state : 'upcoming'} data-kind={e.kind}>
        <time dateTime={e.end}>{span(e.start, e.end)}<small>{e.start ? e.start.slice(0, 4) : e.end.slice(0, 4)}</small></time>
        <div>
          <strong>{e.label}</strong>
          <p>{e.detail}</p>
          <small>总通知第 {e.page} 页</small>
        </div>
        {today && <span className={styles.state}>{e.state === 'past' ? '已过' : e.state === 'current' ? `进行中 · 剩 ${e.daysLeft} 天` : `${e.daysLeft} 天后`}</span>}
      </li>)}
    </ol>
    <div className={styles.calendarFoot}>
      {today && (hidden > 0 || all) && <button type="button" className={styles.linkButton} onClick={() => setAll(v => !v)}>{all ? '只看接下来的安排' : `查看全部 ${entries.length} 项（含已过）`}</button>}
      <p>{EDITION17_CALENDAR.boundary} <a href={EDITION17_CALENDAR.source.url} target="_blank" rel="noreferrer">查看总通知原文 ↗</a></p>
    </div>
  </section>;
}
