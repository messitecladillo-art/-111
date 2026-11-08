'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReportPaper from '@/components/editors/ReportPaper';
import ReportWorkstation from '@/components/figures/report-workstation/ReportWorkstation';
import { reportWorkState, type LiveWritingStatus, type ReportWorkState } from '@/lib/agent/report-work';
import type { EditorContent } from '@/lib/editor-model';
import { DEFAULT_REPORT_SETTINGS } from '@/lib/report-format';
import css from './example.module.css';

const phases = [
  ['contract', '准备请求'], ['wave1', '正文起草'], ['repair', '核对修订'], ['error', '连接中断'], ['done', '完成'],
] as const;
const intro = '研究从一个明确的问题开始：我们希望帮助谁作出什么决定？本页仅用于观察报告生成界面的交互，不包含实际调查结论。';
const received = '章节内容返回后，工作装置退出，纸面继续呈现实际写入的正文。用户可以在现有编辑器中修改段落、插入已确认的图表，并按自己的研究结构组织报告。';

export default function WorkstationExample() {
  const [phase, setPhase] = useState<LiveWritingStatus['phase']>('wave1');
  const [dense, setDense] = useState(false);
  const [dark, setDark] = useState(false);
  const live: LiveWritingStatus = {
    active: !['error', 'done'].includes(phase), phase, completed: phase === 'contract' ? 0 : phase === 'wave1' ? 1 : 2,
    total: phase === 'contract' ? 0 : 2, paragraphs: 1, facts: 0,
    lastSectionId: phase === 'wave1' ? null : 'draft', lastSectionTitle: '研究设计', topicTitle: '报告工作装置', autoFollow: false,
  };
  const work = reportWorkState(live);
  const detail: ReportWorkState = work ?? { phase: 'complete', completed: 2, total: 2, detail: '本次演示内容已写入纸面' };
  const content: EditorContent = {
    version: 3, title: '研究设计示例', subtitle: '', accent: 'teal', slides: [],
    reportFormat: { ...DEFAULT_REPORT_SETTINGS, options: { ...DEFAULT_REPORT_SETTINGS.options, includeCover: false, includeToc: false } },
    report: [
      { id: 'intro', title: '一、研究问题', body: dense ? Array.from({ length: 25 }, () => intro).join('\n') : intro, source: '' },
      { id: 'draft', title: '二、研究设计', body: phase === 'done' ? received : dense ? intro : '', source: '' },
    ],
  };
  return <main className={css.example} data-theme={dark ? 'dark' : 'light'}>
    <header className={css.header}>
      <Link href="/agent" className={css.brand}>证见 <span>EVI-X</span></Link>
      <span className={css.sample}>交互样板 · 模拟任务状态</span>
      <button type="button" onClick={() => setDark(v => !v)}>{dark ? '浅色' : '深色'}</button>
    </header>
    <section className={css.intro}>
      <p>REPORT WORKSTATION / 01</p>
      <h1>让等待，看得见。</h1>
      <span>查看生成过程，展开装置结构；内容返回后，纸面自然接续。</span>
    </section>
    <div className={css.workspace}>
      <aside className={css.controls}>
        <p className={css.overline}>演示任务状态</p>
        <div className={css.phases}>{phases.map(([id, title]) => <button key={id} type="button" aria-pressed={phase === id} onClick={() => setPhase(id)}><i />{title}</button>)}</div>
        <label className={css.check}><input type="checkbox" checked={dense} onChange={e => setDense(e.target.checked)} />检查正文密集时的布局</label>
        <div className={css.notes}>本页切换演示状态，不发送模型请求。报告页内的装置只在空白足够时显示。</div>
        <details className={css.detail}>
          <summary>单独查看工作装置</summary>
          <ReportWorkstation state={detail} />
        </details>
        <Link href="/agent" className={css.back}>进入 Agent 工作台 ↗</Link>
      </aside>
      <section className={css.paper} aria-label="报告生成交互样板">
        <ReportPaper content={content} activeSectionId="draft" workState={work} writingActive={live.active} />
      </section>
    </div>
  </main>;
}
