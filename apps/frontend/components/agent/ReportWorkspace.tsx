'use client';

import { useState, type RefCallback } from 'react';
import { Formula } from '@/components/math/Tex';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { texProblem } from '@/lib/omml';
import type { InsertItem } from '@/lib/report-insert';
import { suggestedExhibits } from '@/lib/report-placement';
import type { ResultSnapshot } from '@/lib/research-quality';
import type { BenchmarkResult } from '@/lib/report-benchmark';
import { writtenLines } from '@/lib/report-benchmark';
import { outlineKind, reportPart } from '@/lib/report-format';
import { Icon } from './icons';
import styles from './ReportWorkspace.module.css';

const written = (s: ReportSection) => [s.body, ...(s.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text)].flatMap(writtenLines).join('').replace(/\s/g, '').length;
const exhibits = (s: ReportSection) => (s.blocks ?? []).filter(b => b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula').length;
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
          <span>{hasContent(section) ? `已写 ${written(section)} 字` : '尚未撰写'}{exhibits(section) ? ` · ${exhibits(section)} 个图、表或公式` : ''}</span>
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

type Tool = 'text' | 'figure' | 'table' | 'formula';
const focusQuietly: RefCallback<HTMLInputElement | HTMLTextAreaElement> = el => { el?.focus({ preventScroll: true }); };
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'text', label: '正文', icon: 'edit' }, { id: 'figure', label: '图', icon: 'chart' }, { id: 'table', label: '表', icon: 'grid' }, { id: 'formula', label: '公式', icon: 'code' },
];

/**
 * The bar over the paper: what can be put into the section in view, each written into the report as one undoable step
 * and shown on the paper at once. Figures and tables come only from registered results; formulas must typeset first.
 */
export function PaperToolbar({ section, results, onInsert, onEdit }: { section: ReportSection | null; results: ResultSnapshot[]; onInsert: (items: InsertItem[]) => void; onEdit: () => void }) {
  const [open, setOpen] = useState<Tool | null>(null);
  const [text, setText] = useState('');
  const [tex, setTex] = useState('');
  const [said, setSaid] = useState('');
  const put = (items: InsertItem[], what: string) => { onInsert(items); setOpen(null); setText(''); setTex(''); setSaid(`已写入「${section?.title ?? ''}」：${what}`); setTimeout(() => setSaid(''), 2600); };
  const charted = results.filter(r => suggestedExhibits(r).includes('chart'));
  const problem = tex.trim() ? texProblem(tex) : null;
  return <div className={styles.toolbarWrap}>
    <div className={styles.toolbar} role="toolbar" aria-label="往选中章节里加入内容">
      {TOOLS.map(tool => <button key={tool.id} type="button" disabled={!section} aria-pressed={open === tool.id} title={section ? `往「${section.title}」里加${tool.label}` : '先在纸面或目录里选一节'}
        onClick={() => setOpen(open === tool.id ? null : tool.id)}><Icon name={tool.icon} /><span>{tool.label}</span></button>)}
      <span className={styles.toolbarRule} aria-hidden="true" />
      <button type="button" onClick={onEdit} title="在完整编辑器里修改"><Icon name="external" /><span>编辑</span></button>
    </div>
    {said && <p className={styles.toolbarSaid} role="status">{said}</p>}
    {open && section && <div className={styles.popover}>
      {open === 'text' && <>
        <textarea ref={focusQuietly} rows={4} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder={`写一段加到「${section.title}」末尾。数字请用登记结果，不要手填。`} />
        <div className={styles.popActions}><span>{text.trim().length} 字</span><button type="button" data-primary="true" disabled={!text.trim()} onClick={() => put([{ kind: 'paragraph', text: text.trim() }], '一段正文')}>加入</button></div>
      </>}
      {(open === 'figure' || open === 'table') && <>
        {(open === 'figure' ? charted : results).length ? <ul className={styles.pickList}>
          {(open === 'figure' ? charted : results).map(r => <li key={r.id}><button type="button" onClick={() => put(open === 'figure' ? [{ kind: 'figure', result: r, caption: r.title }] : [{ kind: 'table', result: r, caption: r.title }], `${open === 'figure' ? '图' : '表'}「${r.title}」`)}>
            <b>{r.title}</b><small>有效样本 {r.n}{r.classification === 'simulated' ? ' · 教学模拟' : ''}</small></button></li>)}
        </ul> : <p className={styles.hint}>{open === 'figure' ? '还没有能画成图的登记结果。' : '还没有登记结果。'}先到「数据分析」算好并登记。</p>}
      </>}
      {open === 'formula' && <>
        <input ref={focusQuietly} value={tex} onChange={e => setTex(e.target.value)} placeholder="LaTeX，例如 n_0=\frac{z^2p(1-p)}{d^2}" />
        <div className={styles.texPreview}>{tex.trim() ? problem ? <span className={styles.texProblem}>{problem}</span> : <Formula tex={tex} copyable={false} compact /> : <span className={styles.hint}>输入后这里显示排版效果</span>}</div>
        <div className={styles.popActions}><span>独立公式，导出时自动编号</span><button type="button" data-primary="true" disabled={!tex.trim() || !!problem} onClick={() => put([{ kind: 'formula', tex: tex.trim() }], '一个公式')}>加入</button></div>
      </>}
    </div>}
  </div>;
}
