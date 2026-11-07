'use client';

import { useMemo, useState, type RefCallback } from 'react';
import { Formula } from '@/components/math/Tex';
import { parseEditorContent, type EditorContent, type ReportSection } from '@/lib/editor-model';
import { texProblem } from '@/lib/omml';
import type { InsertItem } from '@/lib/report-insert';
import { suggestedExhibits } from '@/lib/report-placement';
import type { ResultSnapshot } from '@/lib/research-quality';
import { sectionIssues, type AdvisorReading } from '@/lib/agent/advisors';
import { benchmarkReport, writtenLines, type BenchmarkResult } from '@/lib/report-benchmark';
import { DEFAULT_REPORT_SETTINGS, outlineKind, reportExportOptions, reportPart } from '@/lib/report-format';
import { buildLatexSource, generateLatexBody, latexCompileInput } from '@/lib/latex-report';
import type { DocFormatMode } from '@/components/editors/ReportPaper';
import { Icon } from './icons';
import styles from './ReportWorkspace.module.css';

const written = (s: ReportSection) =>
  [s.body, ...(s.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text)]
    .flatMap(writtenLines)
    .join('')
    .replace(/\s/g, '').length;
const exhibits = (s: ReportSection) =>
  (s.blocks ?? []).filter(b => b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula').length;
const hasContent = (s: ReportSection) => written(s) > 0 || !!s.blocks?.some(b => b.kind !== 'paragraph');

export type LiveWritingStatus = {
  active: boolean;
  phase: 'contract' | 'wave1' | 'wave2' | 'repair' | 'done';
  completed: number;
  total: number;
  paragraphs: number;
  facts: number;
  lastSectionId: string | null;
  lastSectionTitle: string;
  topicTitle: string;
  autoFollow: boolean;
};

/**
 * The report's own navigation, in the sidebar while the report fills the centre: its sections in order, each with
 * whether it has content, and the agent's writing tools for the section in view. Every tool is a real command.
 */
export function ReportNav({
  content,
  picked,
  onPick,
  onSay,
  onStartFullReport,
  liveWriting,
}: {
  content: EditorContent;
  picked: string | null;
  onPick: (id: string) => void;
  onSay: (text: string) => void;
  onStartFullReport?: (topic?: string) => void;
  liveWriting?: LiveWritingStatus | null;
}) {
  const section = content.report.find(s => s.id === picked) ?? null;
  const draftable = section && reportPart(section.title) !== 'references' && outlineKind(section.title) !== 'chapter';
  return (
    <div className={styles.nav}>
      <p className={styles.label}>
        章节 {liveWriting?.active ? `· 实时写入 ${liveWriting.completed}/${liveWriting.total}` : ''}
      </p>
      <ol className={styles.outline}>
        {content.report.map(s => {
          const kind = outlineKind(s.title),
            filled = kind === 'chapter' || hasContent(s);
          return (
            <li key={s.id}>
              <button
                type="button"
                data-kind={kind}
                aria-current={s.id === picked ? 'true' : undefined}
                onClick={() => onPick(s.id)}
                title={s.title}
              >
                <span className={styles.dot} data-filled={filled} aria-hidden="true" />
                {s.title || '未命名章节'}
              </button>
            </li>
          );
        })}
      </ol>
      <p className={styles.label}>写作操作</p>
      <div className={styles.tools}>
        <button
          type="button"
          data-primary="true"
          disabled={liveWriting?.active}
          onClick={() => (onStartFullReport ? onStartFullReport() : onSay('/全报告'))}
          title="在当前报告画布上实时逐节生成全部 26 节正文并执行审阅修订"
        >
          <Icon name="spark" />
          {liveWriting?.active ? `正在实时撰写 (${liveWriting.completed}/${liveWriting.total})…` : '全流程生成完整报告'}
        </button>
        <button
          type="button"
          disabled={!draftable}
          onClick={() => section && onSay(`/起草 ${section.title}`)}
          title={draftable ? `用你的模型服务起草「${section!.title}」` : '先在纸面或目录里选一节'}
        >
          <Icon name="edit" />
          起草本节{section && draftable ? <small>{section.title}</small> : null}
        </button>
        <button type="button" onClick={() => onSay('/写入')}>
          <Icon name="plus" />
          把登记结果写进报告
        </button>
        <button type="button" onClick={() => onSay('/写报告')}>
          <Icon name="book" />
          报告写到哪了
        </button>
        <button type="button" onClick={() => onSay('/盲区 报告')}>
          <Icon name="lamp" />
          报告还缺什么
        </button>
      </div>
    </div>
  );
}

/**
 * The writing inspector beside the paper: the section in view, then what the report holds, then the report check's
 * score and the first things it says to fix.
 */
export function ReportInspector({
  content,
  picked,
  benchmark,
  advisors,
  onSay,
  onEdit,
  onAdvisors,
}: {
  content: EditorContent;
  picked: string | null;
  benchmark: BenchmarkResult | null;
  advisors: AdvisorReading[];
  onSay: (text: string) => void;
  onEdit: () => void;
  onAdvisors: () => void;
}) {
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
  return (
    <div className={styles.inspector}>
      <header className={styles.head}>
        <b>写作</b>
        <span className={styles.spacer} />
        <button type="button" onClick={onEdit} title="在报告编辑器里修改">
          <Icon name="edit" />
          编辑
        </button>
      </header>
      <div className={styles.scroll}>
        <section className={styles.block}>
          <p className={styles.label}>当前章节</p>
          {section ? (
            <div className={styles.picked}>
              <b>{section.title || '未命名章节'}</b>
              <span>
                {hasContent(section) ? `已写 ${written(section)} 字` : '尚未撰写'}
                {exhibits(section) ? ` · ${exhibits(section)} 个图、表或公式` : ''}
              </span>
              {outlineKind(section.title) !== 'chapter' && reportPart(section.title) !== 'references' && (
                <button type="button" data-primary="true" onClick={() => onSay(`/起草 ${section.title}`)}>
                  起草这一节
                </button>
              )}
            </div>
          ) : (
            <p className={styles.hint}>在纸面上点一节，这里显示它的情况和可做的事。</p>
          )}
          {section &&
            (() => {
              const issues = sectionIssues(content, section.id, benchmarkReport);
              return issues.length ? (
                <ul className={styles.todo} aria-label="本节体检">
                  {issues.map(({ check, advisor }) => (
                    <li key={check.id} data-status={check.status}>
                      <b>
                        <i className={styles.byGlyph} title={advisor.name} aria-label={advisor.name}>
                          {advisor.glyph}
                        </i>
                        {check.label}
                      </b>
                      <span>{check.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : hasContent(section) ? (
                <p className={styles.sectionOk}>本节文字未见常见误读。</p>
              ) : null;
            })()}
        </section>
        <section className={styles.block}>
          <p className={styles.label}>统计</p>
          <dl className={styles.stats}>
            {stats.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={styles.block}>
          <p className={styles.label}>对标体检</p>
          {benchmark ? (
            <>
              <div className={styles.score}>
                <b>{benchmark.score}</b>
                <span>/ 100</span>
                <i style={{ width: `${benchmark.score}%` }} aria-hidden="true" />
              </div>
              {advisors.length ? (
                advisors.map(({ advisor, issues, checked, passed }) => (
                  <div key={advisor.id} className={styles.advisor}>
                    <p className={styles.advisorHead}>
                      <b aria-hidden="true">{advisor.glyph}</b>
                      {advisor.name}
                      <small>{checked ? `${passed}/${checked} 通过` : '暂无可查'}</small>
                    </p>
                    {issues.length ? (
                      <ul className={styles.todo}>
                        {issues.slice(0, 3).map(c => (
                          <li key={c.id} data-status={c.status}>
                            <b>{c.label}</b>
                            <span>{c.detail}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.hint}>{checked ? '这一领域没有意见。' : '报告里还没有它能检查的内容。'}</p>
                    )}
                  </div>
                ))
              ) : todo.length ? (
                <ul className={styles.todo}>
                  {todo.map(c => (
                    <li key={c.id} data-status={c.status}>
                      <b>{c.label}</b>
                      <span>{c.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.hint}>可检测的项目都通过了；仍需人工核对数字与版面。</p>
              )}
              {!advisors.length && (
                <button type="button" className={styles.linkButton} onClick={onAdvisors}>
                  雇用顾问，按领域看意见 →
                </button>
              )}
            </>
          ) : (
            <p className={styles.hint}>打开过报告后显示体检结果。</p>
          )}
        </section>
      </div>
    </div>
  );
}

type Tool = 'text' | 'figure' | 'table' | 'formula' | 'ai';
const focusQuietly: RefCallback<HTMLInputElement | HTMLTextAreaElement> = el => {
  el?.focus({ preventScroll: true });
};
const TOOLS: { id: Exclude<Tool, 'ai'>; label: string; icon: string }[] = [
  { id: 'text', label: '正文', icon: 'edit' },
  { id: 'figure', label: '图', icon: 'chart' },
  { id: 'table', label: '表', icon: 'grid' },
  { id: 'formula', label: '公式', icon: 'code' },
];

const PHASE_LABELS: Record<LiveWritingStatus['phase'], string> = {
  contract: '正在构建 9 章 26 节目录与统计图表索引',
  wave1: '正在逐节撰写正文并嵌入统计图表',
  wave2: '正在关联全篇图目录、表目录与参考文献交叉引用',
  repair: '正在执行学术表述修订与版式规整',
  done: '全篇 26 节撰写与版式校验已完成',
};

/**
 * The bar over the paper: supports inserting blocks, switching between LaTeX PDF typesetting and 1:1 Word (.docx)
 * template layout, viewing/exporting .tex source, exporting standard .docx or PDF, and running live generation.
 */
export function PaperToolbar({
  content,
  section,
  results,
  onInsert,
  onEdit,
  onStartFullReport,
  onInstantForge,
  onPlayChoreography,
  liveWriting,
  onToggleAutoFollow,
  onJumpToSection,
  docFormat = 'latex',
  onChangeDocFormat,
}: {
  content: EditorContent;
  section: ReportSection | null;
  results: ResultSnapshot[];
  onInsert: (items: InsertItem[]) => void;
  onEdit: () => void;
  onStartFullReport?: (topic?: string) => void;
  onInstantForge?: (topic?: string) => void;
  onPlayChoreography?: () => void;
  liveWriting?: LiveWritingStatus | null;
  onToggleAutoFollow?: () => void;
  onJumpToSection?: (sectionId: string) => void;
  docFormat?: DocFormatMode;
  onChangeDocFormat?: (mode: DocFormatMode) => void;
}) {
  const [open, setOpen] = useState<Tool | null>(null);
  const [showTexSource, setShowTexSource] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [text, setText] = useState('');
  const [tex, setTex] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [said, setSaid] = useState('');

  const announce = (msg: string) => {
    setSaid(msg);
    window.setTimeout(() => setSaid(''), 2800);
  };

  const put = (items: InsertItem[], what: string) => {
    onInsert(items);
    setOpen(null);
    setText('');
    setTex('');
    announce(`已写入「${section?.title ?? ''}」：${what}`);
  };

  const charted = results.filter(r => suggestedExhibits(r).includes('chart'));
  const problem = tex.trim() ? texProblem(tex) : null;
  const pct = liveWriting ? Math.round((liveWriting.completed / Math.max(1, liveWriting.total)) * 100) : 0;

  const generatedTexSource = useMemo(() => {
    try {
      const body = content.latex?.body || generateLatexBody(content);
      const baseInput = latexCompileInput({
        ...content,
        latex: { version: 1, body, reportHash: '' },
      });
      return buildLatexSource(baseInput);
    } catch {
      return [
        '\\documentclass[UTF8,a4paper,zihao=-4]{ctexart}',
        '\\usepackage[top=25.4mm,bottom=25.4mm,left=31.8mm,right=31.8mm]{geometry}',
        '\\usepackage{amsmath,amssymb,booktabs,graphicx,hyperref}',
        '\\begin{document}',
        ...content.report.map(s => `\\section{${s.title}}\n${s.body || ''}`),
        '\\end{document}',
      ].join('\n\n');
    }
  }, [content]);

  const handleDownloadTex = () => {
    const cleanTitle = (content.title || '研究报告').replace(/[<>:"/\\|?*]/gu, '_').slice(0, 80);
    const url = URL.createObjectURL(new Blob([generatedTexSource], { type: 'text/x-tex;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.tex`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('已导出标准 XeLaTeX (.tex) 源码文件');
  };

  const handleExportDocx = async () => {
    if (exportingDocx) return;
    setExportingDocx(true);
    try {
      const { buildDocx, downloadBlob, fileName } = await import('@/lib/editor-export');
      const parsed = parseEditorContent(content);
      const blob = await buildDocx(parsed, reportExportOptions(DEFAULT_REPORT_SETTINGS.options, 'main'));
      downloadBlob(blob, `${fileName(parsed.title)}-正大杯标准报告.docx`);
      announce('已导出正大杯官方规范 Word (.docx) 文档');
    } catch (err) {
      announce(err instanceof Error ? err.message : 'Word 导出失败，请稍后重试');
    } finally {
      setExportingDocx(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className={styles.toolbarWrap}>
      <div className={styles.toolbar} role="toolbar" aria-label="报告排版与生成工具栏">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            type="button"
            disabled={!section}
            aria-pressed={open === tool.id}
            title={section ? `往「${section.title}」里加${tool.label}` : '先在纸面或目录里选一节'}
            onClick={() => setOpen(open === tool.id ? null : tool.id)}
          >
            <Icon name={tool.icon} />
            <span>{tool.label}</span>
          </button>
        ))}

        <span className={styles.toolbarRule} aria-hidden="true" />

        {/* Dual Engine Switcher: LaTeX Compilation (Primary) vs Word Template (Secondary) */}
        <button
          type="button"
          aria-pressed={docFormat === 'latex'}
          onClick={() => onChangeDocFormat?.('latex')}
          title="切换为 XeLaTeX (ctexart + booktabs) A4 标准学术排印模式"
        >
          <Icon name="code" />
          <span>LaTeX 排版</span>
        </button>
        <button
          type="button"
          aria-pressed={docFormat === 'word'}
          onClick={() => onChangeDocFormat?.('word')}
          title="切换为正大杯官方 Word (.docx) 1:1 标尺与样式模板模式（后置导出与微调）"
        >
          <Icon name="book" />
          <span>Word 模板</span>
        </button>

        {docFormat === 'latex' ? (
          <>
            <button
              type="button"
              aria-pressed={showTexSource}
              onClick={() => setShowTexSource(v => !v)}
              title="查看或下载实时生成的 XeLaTeX (.tex) 完整排版源码"
            >
              <Icon name="panel" />
              <span>.tex 源码</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              title="将当前 A4 学术排印页面直接导出/打印为标准 PDF 文档"
            >
              <Icon name="download" />
              <span>导出 PDF</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={exportingDocx}
            onClick={() => void handleExportDocx()}
            title="一键导出与当前画布格式 1:1 对齐的正大杯标准 Word (.docx) 文件"
          >
            <Icon name="download" />
            <span>{exportingDocx ? '导出中…' : '导出 .docx'}</span>
          </button>
        )}

        <span className={styles.toolbarRule} aria-hidden="true" />

        <button
          type="button"
          aria-pressed={open === 'ai' || !!liveWriting?.active}
          onClick={() => setOpen(open === 'ai' ? null : 'ai')}
          title="由模型实时生成完整 26 节报告并在纸面同步呈现输入、图表飞入、交叉引用与修订"
          style={liveWriting?.active ? { color: '#1f6b5f', fontWeight: 600 } : undefined}
        >
          <Icon name="spark" />
          <span>{liveWriting?.active ? `${liveWriting.completed}/${liveWriting.total} 撰写中` : '生成报告'}</span>
        </button>

        {onPlayChoreography && (
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              onPlayChoreography();
            }}
            title="在当前纸面演示实时逐字输入、内置图表飞入、双轨交叉引用连线与审阅修订"
          >
            <Icon name="bolt" />
            <span>实时演练</span>
          </button>
        )}

        <button type="button" onClick={onEdit} title="在完整编辑器里修改">
          <Icon name="external" />
          <span>编辑</span>
        </button>
      </div>

      {showTexSource && (
        <div className={styles.latexSourceDrawer} role="region" aria-label="实时生成的 XeLaTeX 源码">
          <div className={styles.latexSourceHead}>
            <b>main.tex · XeLaTeX (ctexart + booktabs + amsmath) 实时编译源码</b>
            <div className={styles.latexSourceActions}>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(generatedTexSource);
                  announce('已复制完整 .tex 源码到剪贴板');
                }}
              >
                复制源码
              </button>
              <button type="button" onClick={handleDownloadTex}>
                下载 .tex
              </button>
              <button type="button" onClick={handlePrintPdf}>
                编译导出 PDF
              </button>
              <button type="button" onClick={() => setShowTexSource(false)}>
                收起
              </button>
            </div>
          </div>
          <pre className={styles.latexSourcePre}>{generatedTexSource}</pre>
        </div>
      )}

      {liveWriting && (
        <div className={styles.liveHud} data-active={liveWriting.active || undefined} role="status" aria-live="polite">
          <div className={styles.liveHudTrack} aria-hidden="true">
            <i style={{ width: `${liveWriting.phase === 'done' ? 100 : Math.max(4, pct)}%` }} />
          </div>
          <div className={styles.liveHudRow}>
            <span className={styles.liveHudBadge}>
              <b aria-hidden="true" />
              {PHASE_LABELS[liveWriting.phase]}
            </span>
            <span className={styles.liveHudStats}>
              已完成 <b>{liveWriting.completed}/{liveWriting.total}</b> 节 · <b>{liveWriting.paragraphs}</b> 段 · 已关联{' '}
              <b>{liveWriting.facts}</b> 处统计数据与图表引用
            </span>
            {liveWriting.lastSectionTitle && (
              <button
                type="button"
                className={styles.liveHudSection}
                onClick={() => liveWriting.lastSectionId && onJumpToSection?.(liveWriting.lastSectionId)}
                title="点击跳转到当前最新落笔章节"
              >
                当前章节：{liveWriting.lastSectionTitle}
              </button>
            )}
            {liveWriting.active && onToggleAutoFollow && (
              <button
                type="button"
                className={styles.liveHudFollow}
                aria-pressed={liveWriting.autoFollow}
                onClick={onToggleAutoFollow}
                title="开启后，每写完一节自动平滑滚动到该章节"
              >
                自动跟随：{liveWriting.autoFollow ? '开' : '关'}
              </button>
            )}
          </div>
        </div>
      )}

      {said && (
        <p className={styles.toolbarSaid} role="status">
          {said}
        </p>
      )}

      {open === 'ai' && (
        <div className={styles.popover}>
          <input
            ref={focusQuietly}
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            placeholder="输入研究课题名称（留空则按当前项目课题生成 9 章 26 节完整报告）…"
          />
          <div className={styles.popActions}>
            <span>支持实时逐字输入、内置统计图生成嵌入、目录交叉引用连线与审阅修订</span>
            {onInstantForge && (
              <button
                type="button"
                style={{ background: 'var(--c-hover)', color: 'var(--c-fg)', marginLeft: 'auto' }}
                onClick={() => {
                  const t = topicInput.trim() || undefined;
                  setOpen(null);
                  onInstantForge(t);
                }}
              >
                快速生成样板
              </button>
            )}
            <button
              type="button"
              data-primary="true"
              disabled={liveWriting?.active}
              style={onInstantForge ? { marginLeft: 0 } : undefined}
              onClick={() => {
                const t = topicInput.trim() || undefined;
                setOpen(null);
                onStartFullReport?.(t);
              }}
            >
              {liveWriting?.active ? '正在实时撰写…' : '启动实时全篇撰写'}
            </button>
          </div>
        </div>
      )}

      {open && open !== 'ai' && section && (
        <div className={styles.popover}>
          {open === 'text' && (
            <>
              <textarea
                ref={focusQuietly}
                rows={4}
                maxLength={2000}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={`写一段加到「${section.title}」末尾。数字请用登记结果，不要手填。`}
              />
              <div className={styles.popActions}>
                <span>{text.trim().length} 字</span>
                <button
                  type="button"
                  data-primary="true"
                  disabled={!text.trim()}
                  onClick={() => put([{ kind: 'paragraph', text: text.trim() }], '一段正文')}
                >
                  加入
                </button>
              </div>
            </>
          )}
          {(open === 'figure' || open === 'table') && (
            <>
              {(open === 'figure' ? charted : results).length ? (
                <ul className={styles.pickList}>
                  {(open === 'figure' ? charted : results).map(r => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() =>
                          put(
                            open === 'figure'
                              ? [{ kind: 'figure', result: r, caption: r.title }]
                              : [{ kind: 'table', result: r, caption: r.title }],
                            `${open === 'figure' ? '图' : '表'}「${r.title}」`,
                          )
                        }
                      >
                        <b>{r.title}</b>
                        <small>
                          有效样本 {r.n}
                          {r.classification === 'simulated' ? ' · 教学模拟' : ''}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.hint}>
                  {open === 'figure' ? '还没有能画成图的登记结果。' : '还没有登记结果。'}先到「数据分析」算好并登记。
                </p>
              )}
            </>
          )}
          {open === 'formula' && (
            <>
              <input
                ref={focusQuietly}
                value={tex}
                onChange={e => setTex(e.target.value)}
                placeholder="LaTeX，例如 n_0=\frac{z^2p(1-p)}{d^2}"
              />
              <div className={styles.texPreview}>
                {tex.trim() ? (
                  problem ? (
                    <span className={styles.texProblem}>{problem}</span>
                  ) : (
                    <Formula tex={tex} copyable={false} compact />
                  )
                ) : (
                  <span className={styles.hint}>输入后这里显示排版效果</span>
                )}
              </div>
              <div className={styles.popActions}>
                <span>独立公式，导出时自动编号</span>
                <button
                  type="button"
                  data-primary="true"
                  disabled={!tex.trim() || !!problem}
                  onClick={() => put([{ kind: 'formula', tex: tex.trim() }], '一个公式')}
                >
                  加入
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
