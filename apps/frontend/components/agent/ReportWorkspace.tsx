'use client';

import type { EditorContent, ReportSection } from '@/lib/editor-model';
import type { BenchmarkResult } from '@/lib/report-benchmark';
import { writtenLines } from '@/lib/report-benchmark';
import { outlineKind, reportPart } from '@/lib/report-format';
import { Icon } from './icons';
import styles from './ReportWorkspace.module.css';

const written = (s: ReportSection) => [s.body, ...(s.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text)].flatMap(writtenLines).join('').replace(/\s/g, '').length;
const hasContent = (s: ReportSection) => written(s) > 0 || !!s.blocks?.some(b => b.kind !== 'paragraph');

/**
 * The report's own navigation, in the sidebar while the report fills the centre: its sections in order, each with
 * whether it has content, and the agent's writing tools for the section in view. Every tool is a real command.
 */
export function ReportNav({ content, picked, onPick, onSay }: { content: EditorContent; picked: string | null; onPick: (id: string) => void; onSay: (text: string) => void }) {
  const section = content.report.find(s => s.id === picked) ?? null;
  const draftable = section && reportPart(section.title) !== 'references' && outlineKind(section.title) !== 'chapter';
  return <div className={styles.nav}>
    <p className={styles.label}>章节</p>
    <ol className={styles.outline}>
      {content.report.map(s => {
        const kind = outlineKind(s.title), filled = kind === 'chapter' || hasContent(s);
        return <li key={s.id}><button type="button" data-kind={kind} aria-current={s.id === picked ? 'true' : undefined} onClick={() => onPick(s.id)} title={s.title}>
          <span className={styles.dot} data-filled={filled} aria-hidden="true" />{s.title || '未命名章节'}
        </button></li>;
      })}
    </ol>
    <p className={styles.label}>AI 写作工具</p>
    <div className={styles.tools}>
      <button type="button" disabled={!draftable} onClick={() => section && onSay(`/起草 ${section.title}`)} title={draftable ? `用你的模型服务起草「${section!.title}」` : '先在纸面或目录里选一节'}>
        <Icon name="edit" />起草本节{section && draftable ? <small>{section.title}</small> : null}</button>
      <button type="button" onClick={() => onSay('/写入')}><Icon name="plus" />把登记结果写进报告</button>
      <button type="button" onClick={() => onSay('/写报告')}><Icon name="book" />报告写到哪了</button>
      <button type="button" onClick={() => onSay('/盲区 报告')}><Icon name="lamp" />报告还缺什么</button>
    </div>
  </div>;
}

/**
 * The writing inspector beside the paper: the section in view, then what the report holds, then the report check's
 * score and the first things it says to fix.
 */
export function ReportInspector({ content, picked, benchmark, onSay, onEdit }: { content: EditorContent; picked: string | null; benchmark: BenchmarkResult | null; onSay: (text: string) => void; onEdit: () => void }) {
  const section = content.report.find(s => s.id === picked) ?? null;
  const blocks = content.report.flatMap(s => s.blocks ?? []);
  const stats: [string, number][] = [
    ['章节', content.report.length],
    ['正文字数', content.report.reduce((n, s) => n + written(s), 0)],
    ['图', blocks.filter(b => b.kind === 'chart').length],
    ['表', blocks.filter(b => b.kind === 'table').length],
    ['公式', blocks.filter(b => b.kind === 'formula').length],
    ['参考文献', content.references?.length ?? 0],
    ['登记结果', content.quality?.results.length ?? 0],
    ['已确认发现', content.quality?.findings.filter(f => f.status === 'confirmed').length ?? 0],
  ];
  const todo = (benchmark?.checks ?? []).filter(c => c.status === 'fail' || c.status === 'partial').slice(0, 4);
  return <div className={styles.inspector}>
    <header className={styles.head}><b>写作</b><span className={styles.spacer} /><button type="button" onClick={onEdit} title="在报告编辑器里修改"><Icon name="edit" />编辑</button></header>
    <div className={styles.scroll}>
      <section className={styles.block}>
        <p className={styles.label}>当前章节</p>
        {section ? <div className={styles.picked}>
          <b>{section.title || '未命名章节'}</b>
          <span>{hasContent(section) ? `已写 ${written(section)} 字` : '尚未撰写'}{section.blocks?.length ? ` · ${section.blocks.length} 个图表公式块` : ''}</span>
          {outlineKind(section.title) !== 'chapter' && reportPart(section.title) !== 'references' && <button type="button" data-primary="true" onClick={() => onSay(`/起草 ${section.title}`)}>起草这一节</button>}
        </div> : <p className={styles.hint}>在纸面上点一节，这里显示它的情况和可做的事。</p>}
      </section>
      <section className={styles.block}>
        <p className={styles.label}>统计</p>
        <dl className={styles.stats}>{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v.toLocaleString()}</dd></div>)}</dl>
      </section>
      <section className={styles.block}>
        <p className={styles.label}>对标体检</p>
        {benchmark ? <>
          <div className={styles.score}><b>{benchmark.score}</b><span>/ 100</span><i style={{ width: `${benchmark.score}%` }} aria-hidden="true" /></div>
          {todo.length ? <ul className={styles.todo}>{todo.map(c => <li key={c.id} data-status={c.status}><b>{c.label}</b><span>{c.detail}</span></li>)}</ul>
            : <p className={styles.hint}>可检测的项目都通过了；仍需人工核对数字与版面。</p>}
        </> : <p className={styles.hint}>打开过报告后显示体检结果。</p>}
      </section>
    </div>
  </div>;
}
