'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefCallback, type ReactNode } from 'react';
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
import { hostedRequest } from '@/components/hosted/api-client';
import {
  buildAiDisclosureLines,
  formatAiDisclosureMarkdown,
  inspectReportDocxLocal,
  type FullReportDisclosureSummary,
} from '@/lib/agent/ai-disclosure';
import { locateCheckSectionId } from '@/lib/agent/paper-diff';
import {
  getModelCalls,
  listAgentTasks,
  type WorkflowModelCallReceipt,
  type WorkflowTransport,
} from '@/lib/agent/workflow-task-client';
import { parseAiUsageLedger, type AiUsageLedger } from '@/lib/evidence-appendices';
import type { PreflightReport } from '@/lib/submission-preflight';
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

export type { LiveWritingStatus } from '@/lib/agent/report-work';
import type { LiveWritingStatus } from '@/lib/agent/report-work';

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
          title="先核对研究模式、模型与资料范围，再生成独立候选稿"
        >
          <Icon name="spark" />
          {liveWriting?.active ? `正在实时撰写 (${liveWriting.completed}/${liveWriting.total})…` : '生成候选稿'}
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
  revision,
  onJumpToIssue,
}: {
  content: EditorContent;
  picked: string | null;
  benchmark: BenchmarkResult | null;
  advisors: AdvisorReading[];
  onSay: (text: string) => void;
  onEdit: () => void;
  onAdvisors: () => void;
  revision?: ReactNode;
  onJumpToIssue?: (sectionId: string, checkId: string) => void;
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
        {revision}
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
                      {onJumpToIssue ? (
                        <button type="button" className={styles.issueBtn} onClick={() => onJumpToIssue(section.id, check.id)}>
                          <b>
                            <i className={styles.byGlyph} title={advisor.name} aria-label={advisor.name}>
                              {advisor.glyph}
                            </i>
                            {check.label}
                          </b>
                          <span>{check.detail}</span>
                          <em className={styles.issueHint}>在纸面定位本节 →</em>
                        </button>
                      ) : (
                        <>
                          <b>
                            <i className={styles.byGlyph} title={advisor.name} aria-label={advisor.name}>
                              {advisor.glyph}
                            </i>
                            {check.label}
                          </b>
                          <span>{check.detail}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : hasContent(section) ? (
                <p className={styles.sectionOk}>本节文字未见常见误读。</p>
              ) : null;
            })()}
        </section>
        <section className={styles.block}>
          <p className={styles.keyHint}><kbd>[</kbd> <kbd>]</kbd> 切换上一节、下一节</p>
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
          <p className={styles.label}>证据完整度检查</p>
          {benchmark ? (
            <>
              <p className={styles.hint}>此分数反映可检查项目的完整度；方法适用性、事实真实性和导出文件仍需验收。</p>
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
                        {issues.slice(0, 3).map(c => {
                          const targetSectionId = onJumpToIssue ? locateCheckSectionId(content, c.id) : null;
                          return (
                            <li key={c.id} data-status={c.status}>
                              {targetSectionId && onJumpToIssue ? (
                                <button type="button" className={styles.issueBtn} onClick={() => onJumpToIssue(targetSectionId, c.id)}>
                                  <b>{c.label}</b>
                                  <span>{c.detail}</span>
                                  <em className={styles.issueHint}>定位对应章节 →</em>
                                </button>
                              ) : (
                                <>
                                  <b>{c.label}</b>
                                  <span>{c.detail}</span>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={styles.hint}>{checked ? '当前可检查项未发现问题，独立复核仍待完成。' : '报告里还没有它能检查的内容。'}</p>
                    )}
                  </div>
                ))
              ) : todo.length ? (
                <ul className={styles.todo}>
                  {todo.map(c => {
                    const targetSectionId = onJumpToIssue ? locateCheckSectionId(content, c.id) : null;
                    return (
                      <li key={c.id} data-status={c.status}>
                        {targetSectionId && onJumpToIssue ? (
                          <button type="button" className={styles.issueBtn} onClick={() => onJumpToIssue(targetSectionId, c.id)}>
                            <b>{c.label}</b>
                            <span>{c.detail}</span>
                            <em className={styles.issueHint}>定位对应章节 →</em>
                          </button>
                        ) : (
                          <>
                            <b>{c.label}</b>
                            <span>{c.detail}</span>
                          </>
                        )}
                      </li>
                    );
                  })}
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

type Tool = 'text' | 'figure' | 'table' | 'formula' | 'ai' | 'preflight' | 'disclosure';
const focusQuietly: RefCallback<HTMLInputElement | HTMLTextAreaElement> = el => {
  el?.focus({ preventScroll: true });
};
const TOOLS: { id: Exclude<Tool, 'ai' | 'preflight' | 'disclosure'>; label: string; icon: string }[] = [
  { id: 'text', label: '正文', icon: 'edit' },
  { id: 'figure', label: '图', icon: 'chart' },
  { id: 'table', label: '表', icon: 'grid' },
  { id: 'formula', label: '公式', icon: 'code' },
];

const PHASE_LABELS: Record<LiveWritingStatus['phase'], string> = {
  contract: '正在核对输入与研究模式',
  wave1: '正在生成主体章节候选稿',
  wave2: '正在汇总已生成内容',
  repair: '正在记录实际返修与规则检查',
  done: '本轮运行结束 · 候选稿待审阅',
  error: '本轮执行未完成 · 原稿已保留',
  failed: '未收到完整结果 · 请核对回执',
  cancelled: '已停止接收 · 原稿已保留',
};

/**
 * Report controls distinguish the browser preview, source export, draft export and independent candidate generation.
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
  previewOnly = false,
  projectId = null,
  signedIn = false,
  fullReportSummary = null,
  onWriteAiAppendix,
  onOpenPreflightPanel,
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
  previewOnly?: boolean;
  projectId?: string | null;
  signedIn?: boolean;
  fullReportSummary?: FullReportDisclosureSummary | null;
  onWriteAiAppendix?: (lines: string[]) => void;
  onOpenPreflightPanel?: () => void;
}) {
  const [open, setOpen] = useState<Tool | null>(null);
  const [showTexSource, setShowTexSource] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [identityTermsInput, setIdentityTermsInput] = useState('');
  const [preflightState, setPreflightState] = useState<{
    running: boolean;
    phase: string;
    report: PreflightReport | null;
    filename: string;
    blob: Blob | null;
    error: string;
  }>({ running: false, phase: '', report: null, filename: '', blob: null, error: '' });
  const [manualAiTools, setManualAiTools] = useState('');
  const [disclosureState, setDisclosureState] = useState<{
    loading: boolean;
    loaded: boolean;
    ledger: AiUsageLedger | null;
    workflowCalls: WorkflowModelCallReceipt[];
    error: string;
  }>({ loading: false, loaded: false, ledger: null, workflowCalls: [], error: '' });
  const [text, setText] = useState('');
  const [tex, setTex] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [said, setSaid] = useState('');
  const announceTimer = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (announceTimer.current) window.clearTimeout(announceTimer.current); }; }, []);

  const announce = (msg: string) => {
    if (!mounted.current) return;
    if (announceTimer.current) window.clearTimeout(announceTimer.current);
    setSaid(msg);
    announceTimer.current = window.setTimeout(() => setSaid(''), 4200);
  };

  const put = (items: InsertItem[], what: string) => {
    if (previewOnly) return;
    onInsert(items);
    setOpen(null);
    setText('');
    setTex('');
    announce(`已写入「${section?.title ?? ''}」：${what}`);
  };

  const charted = results.filter(r => suggestedExhibits(r).includes('chart'));
  // Ctrl or ⌘ + Enter adds what was typed; Esc closes the box without adding.
  const keys = (submit: () => unknown) => (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(null); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
  };
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
      return '';
    }
  }, [content]);

  const handleDownloadTex = () => {
    if (!generatedTexSource) { announce('源码生成失败，请在编辑器中检查报告内容后再导出。'); return; }
    const cleanTitle = (content.title || '研究报告').replace(/[<>:"/\\|?*]/gu, '_').slice(0, 80);
    const url = URL.createObjectURL(new Blob([generatedTexSource], { type: 'text/x-tex;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.tex`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('已导出 .tex 源码，尚未编译；请在编译后核对版式');
  };

  const handleExportDocx = async () => {
    if (exportingDocx) return;
    setExportingDocx(true);
    try {
      const { buildDocx, downloadBlob, fileName } = await import('@/lib/editor-export');
      const parsed = parseEditorContent(content);
      const blob = await buildDocx(parsed, reportExportOptions(DEFAULT_REPORT_SETTINGS.options, 'main'));
      downloadBlob(blob, `${fileName(parsed.title)}-报告草稿.docx`);
      announce('已导出 Word 草稿，请打开文件核对分页、图表与公式');
    } catch (err) {
      announce(err instanceof Error ? err.message : 'Word 导出失败，请稍后重试');
    } finally {
      if (mounted.current) setExportingDocx(false);
    }
  };

  const deliveryEpoch = useRef(0);
  useEffect(() => {
    deliveryEpoch.current += 1;
    setPreflightState({ running: false, phase: '', report: null, filename: '', blob: null, error: '' });
    setDisclosureState({ loading: false, loaded: false, ledger: null, workflowCalls: [], error: '' });
  }, [projectId]);

  const identityTerms = useMemo(
    () =>
      identityTermsInput
        .split(/[\s,，、;；]+/u)
        .map(s => s.trim())
        .filter(Boolean),
    [identityTermsInput],
  );

  const runLocalPreflight = async () => {
    const ticket = ++deliveryEpoch.current;
    setPreflightState(prev => ({ ...prev, running: true, phase: '正在按提交规范打包 Word…', error: '' }));
    try {
      const outcome = await inspectReportDocxLocal(content, {
        identityTerms,
        onPhase: phase => {
          if (mounted.current && deliveryEpoch.current === ticket) {
            setPreflightState(prev => ({ ...prev, phase }));
          }
        },
      });
      if (!mounted.current || deliveryEpoch.current !== ticket) return;
      setPreflightState({
        running: false,
        phase: '检验完成',
        report: outcome.report,
        filename: outcome.filename,
        blob: outcome.blob,
        error: '',
      });
    } catch (err) {
      if (!mounted.current || deliveryEpoch.current !== ticket) return;
      setPreflightState(prev => ({
        ...prev,
        running: false,
        phase: '',
        error: err instanceof Error ? err.message : '参赛预检未能完成，请核对报告内容后重试',
      }));
    }
  };

  const handleDownloadCheckedDocx = async () => {
    if (!preflightState.blob || !preflightState.filename) return;
    const { downloadBlob } = await import('@/lib/editor-export');
    downloadBlob(preflightState.blob, preflightState.filename);
    announce('已下载通过本地预检的 Word 文档');
  };

  const refreshDisclosure = async () => {
    const ticket = ++deliveryEpoch.current;
    if (!signedIn || !projectId) {
      setDisclosureState({ loading: false, loaded: true, ledger: null, workflowCalls: [], error: '' });
      return;
    }
    setDisclosureState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      let ledger: AiUsageLedger | null = null;
      const errors: string[] = [];
      try {
        const rawLedger = await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/report/ai-usage`);
        ledger = parseAiUsageLedger(rawLedger, projectId);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : '未能读取项目 AI 台账');
      }
      const calls: WorkflowModelCallReceipt[] = [];
      try {
        const transport: WorkflowTransport = {
          request: hostedRequest,
          mutate: (path, body, method = 'POST') => hostedRequest(path, { method, body }),
        };
        const tasks = await listAgentTasks(transport, projectId);
        const withCalls = tasks.slice(0, 6);
        const callBatches = await Promise.allSettled(
          withCalls.map(task => getModelCalls(transport, projectId, task.id)),
        );
        for (const res of callBatches) {
          if (res.status === 'fulfilled') calls.push(...res.value);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : '未能读取工作流调用回执');
      }
      if (!mounted.current || deliveryEpoch.current !== ticket) return;
      setDisclosureState({
        loading: false,
        loaded: true,
        ledger,
        workflowCalls: calls,
        error: errors.join('；'),
      });
    } catch (err) {
      if (!mounted.current || deliveryEpoch.current !== ticket) return;
      setDisclosureState(prev => ({
        ...prev,
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : 'AI 使用记录读取失败',
      }));
    }
  };

  const disclosureLines = useMemo(
    () =>
      buildAiDisclosureLines({
        content,
        ledger: disclosureState.ledger,
        workflowCalls: disclosureState.workflowCalls,
        fullReportSummary,
        manualToolsNote: manualAiTools,
      }),
    [content, disclosureState.ledger, disclosureState.workflowCalls, fullReportSummary, manualAiTools],
  );

  const handleWriteAiAppendix = () => {
    if (!onWriteAiAppendix || previewOnly) return;
    onWriteAiAppendix(disclosureLines);
    setOpen(null);
    announce('已将《AI 工具使用情况说明》写入附录，可在编辑器中撤销');
  };

  const handleDownloadAiMarkdown = async () => {
    const { downloadBlob, fileName } = await import('@/lib/editor-export');
    const parsed = parseEditorContent(content);
    const md = formatAiDisclosureMarkdown({
      content: parsed,
      projectId,
      ledger: disclosureState.ledger,
      workflowCalls: disclosureState.workflowCalls,
      fullReportSummary,
      manualToolsNote: manualAiTools,
    });
    downloadBlob(
      new Blob([md], { type: 'text/markdown;charset=utf-8' }),
      `${fileName(parsed.title)}-AI工具使用情况说明.md`,
    );
    announce('已下载《AI 工具使用情况说明.md》');
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div ref={toolbarRef} className={styles.toolbarWrap} onKeyDown={event => { if (event.key === 'Escape') { setOpen(null); setShowTexSource(false); toolbarRef.current?.querySelector<HTMLButtonElement>(`[data-tool="${open}"]`)?.focus(); } }}>
      <div className={styles.toolbar} role="toolbar" aria-label="报告排版与生成工具栏">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            type="button"
            data-tool={tool.id}
            disabled={!section || previewOnly}
            aria-pressed={open === tool.id}
            title={previewOnly ? '候选稿仅供预览，请打开原稿编辑' : section ? `往「${section.title}」里加${tool.label}` : '先在纸面或目录里选一节'}
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
          title="浏览器中的学术样式预览；下载的源码需单独编译核验"
        >
          <Icon name="code" />
          <span>学术预览</span>
        </button>
        <button
          type="button"
          aria-pressed={docFormat === 'word'}
          onClick={() => onChangeDocFormat?.('word')}
          title="浏览器中的 Word 样式预览；导出后需核对实际分页"
        >
          <Icon name="book" />
          <span>Word 预览</span>
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
              title="打开浏览器打印，可另存为 PDF；这是浏览器预览，不是 LaTeX 编译结果"
            >
              <Icon name="download" />
              <span>打印 / PDF</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={exportingDocx}
            onClick={() => void handleExportDocx()}
            title="导出可编辑的 Word 草稿，导出文件仍需验收"
          >
            <Icon name="download" />
            <span>{exportingDocx ? '导出中…' : '导出 .docx'}</span>
          </button>
        )}

        <button
          type="button"
          data-tool="preflight"
          aria-pressed={open === 'preflight'}
          onClick={() => {
            const next = open === 'preflight' ? null : 'preflight';
            setOpen(next);
            if (next === 'preflight' && !preflightState.running) void runLocalPreflight();
          }}
          title="按竞赛提交格式构建 Word 并执行本地匿名与合规预检"
        >
          <Icon name="check" />
          <span>{preflightState.running ? '预检中…' : '参赛预检'}</span>
        </button>

        <button
          type="button"
          data-tool="disclosure"
          aria-pressed={open === 'disclosure'}
          onClick={() => {
            const next = open === 'disclosure' ? null : 'disclosure';
            setOpen(next);
            if (next === 'disclosure' && !disclosureState.loaded && !disclosureState.loading) void refreshDisclosure();
          }}
          title="汇总服务端台账与会话调用记录，生成《AI 工具使用情况说明》"
        >
          <Icon name="info" />
          <span>AI 说明</span>
        </button>

        <span className={styles.toolbarRule} aria-hidden="true" />

        <button
          type="button"
          data-tool="ai"
          aria-pressed={open === 'ai' || !!liveWriting?.active}
          onClick={() => setOpen(open === 'ai' ? null : 'ai')}
          title="先确认研究模式、模型版本与发送资料，再生成独立候选稿"
          style={liveWriting?.active ? { color: '#1f6b5f', fontWeight: 600 } : undefined}
        >
          <Icon name="spark" />
          <span>{liveWriting?.active ? `${liveWriting.completed}/${liveWriting.total} 撰写中` : '生成候选稿'}</span>
        </button>

        {onPlayChoreography && (
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              onPlayChoreography();
            }}
            title="回放当前已有的正文和图表；只有本轮记录的实际修订才显示纠错"
          >
            <Icon name="bolt" />
            <span>回放呈现</span>
          </button>
        )}

        <button type="button" onClick={onEdit} title="打开原稿，在完整编辑器里修改">
          <Icon name="external" />
          <span>{previewOnly ? '编辑原稿' : '编辑'}</span>
        </button>
      </div>

      {previewOnly && <p className={styles.previewNote}>正在预览候选稿。插入操作已停用；「编辑原稿」打开原始版本，采纳在审阅工作台完成。</p>}

      {showTexSource && (
        <div className={styles.latexSourceDrawer} role="region" aria-label="可导出的 XeLaTeX 源码">
          <div className={styles.latexSourceHead}>
            <b>main.tex · XeLaTeX (ctexart + booktabs + amsmath) 可导出源码 · 尚未编译</b>
            <div className={styles.latexSourceActions}>
              <button
                type="button"
                onClick={() => {
                  if (!generatedTexSource) { announce('源码生成失败，暂不能复制。'); return; }
                  if (!navigator.clipboard) { announce('当前浏览器不支持复制，请下载源码。'); return; }
                  void navigator.clipboard.writeText(generatedTexSource).then(() => announce('已复制 .tex 源码')).catch(() => announce('复制失败，请下载源码。'));
                }}
              >
                复制源码
              </button>
              <button type="button" onClick={handleDownloadTex}>
                下载 .tex
              </button>
              <button type="button" onClick={handlePrintPdf}>
                打印当前预览
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
            <i style={{ width: `${liveWriting.phase === 'done' ? 100 : Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <div className={styles.liveHudRow}>
            <span className={styles.liveHudBadge}>
              <b aria-hidden="true" />
              {PHASE_LABELS[liveWriting.phase]}
            </span>
            <span className={styles.liveHudStats}>
              已处理 <b>{liveWriting.completed}/{liveWriting.total}</b> 节 · <b>{liveWriting.paragraphs}</b> 段 · 已关联{' '}
              <b>{liveWriting.facts}</b> 处事实锚点
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
            aria-label="研究课题名称"
            maxLength={160}
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            placeholder="研究课题名称（留空使用当前项目标题）…"
          />
          <div className={styles.popActions}>
            <span>先确认资料和模型服务；本次内容进入独立候选稿，审阅后采纳。</span>
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
                载入教学模拟
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
              {liveWriting?.active ? '正在实时撰写…' : '核对并生成候选稿'}
            </button>
          </div>
        </div>
      )}

      {open === 'preflight' && (
        <div className={styles.popover} aria-label="竞赛参赛预检">
          <div className={styles.deliveryHead}>
            <strong>竞赛终稿本地预检</strong>
            {preflightState.report && (
              <span
                className={`${styles.deliveryBadge} ${
                  preflightState.report.status === 'no_issues_in_checked_scope'
                    ? styles.deliveryBadgeOk
                    : styles.deliveryBadgeWarn
                }`}
              >
                {preflightState.report.status === 'no_issues_in_checked_scope'
                  ? '已检范围无阻断项'
                  : preflightState.report.status === 'issues_found'
                    ? '发现需核查项'
                    : '检查未完全覆盖'}
              </span>
            )}
          </div>
          <input
            ref={focusQuietly}
            aria-label="匿名核查关键词"
            maxLength={200}
            value={identityTermsInput}
            onChange={e => setIdentityTermsInput(e.target.value)}
            onKeyDown={event => keys(() => !preflightState.running && void runLocalPreflight())(event)}
            placeholder="输入需匿名核查的院校、姓名或赛区关键词（逗号或空格分隔）…"
          />
          {preflightState.running && (
            <p className={styles.deliveryMeta}>{preflightState.phase || '正在执行 .docx 匿名与元数据检查…'}</p>
          )}
          {preflightState.error && <p className={styles.texProblem}>{preflightState.error}</p>}
          {preflightState.report && (
            <>
              <p className={styles.deliveryMeta}>
                文件大小 {Math.max(1, Math.round(preflightState.report.bytes / 1024))} KB · SHA-256{' '}
                <code>{preflightState.report.sha256.slice(0, 16)}…</code> · 发现{' '}
                {preflightState.report.findings.length} 项 · 覆盖：
                {preflightState.report.coverage
                  .map(
                    c =>
                      `${c.label}(${c.status === 'checked' ? '已检' : c.status === 'manual' ? '需人工' : '未检'})`,
                  )
                  .join(' / ')}
              </p>
              {preflightState.report.findings.length > 0 && (
                <ul className={styles.deliveryFindings}>
                  {preflightState.report.findings.map((finding, idx) => (
                    <li
                      key={`${finding.code}-${idx}`}
                      className={styles.deliveryFinding}
                      data-level={finding.level}
                    >
                      <b>
                        {finding.level === 'error' ? '阻断' : '提醒'} · {finding.code}
                      </b>
                      <span>{finding.message}</span>
                      {finding.location && <small> · 位置：{finding.location}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className={styles.popActions}>
            <span>仅在浏览器本地检查正文与元数据；深度页数与字体校验请用完整工作台。</span>
            {onOpenPreflightPanel && (
              <button
                type="button"
                onClick={() => {
                  setOpen(null);
                  onOpenPreflightPanel();
                }}
              >
                完整体检工作台
              </button>
            )}
            <button
              type="button"
              disabled={!preflightState.blob || preflightState.running}
              onClick={() => void handleDownloadCheckedDocx()}
            >
              下载已检 .docx
            </button>
            <button
              type="button"
              data-primary="true"
              disabled={preflightState.running}
              onClick={() => void runLocalPreflight()}
            >
              {preflightState.running ? '检验中…' : '重新检验'}
            </button>
          </div>
        </div>
      )}

      {open === 'disclosure' && (
        <div className={styles.popover} aria-label="AI 工具使用情况说明">
          <div className={styles.deliveryHead}>
            <strong>《AI 工具使用情况说明》汇总</strong>
            <span
              className={`${styles.deliveryBadge} ${
                disclosureState.ledger?.coverage === 'partial'
                  ? styles.deliveryBadgeOk
                  : styles.deliveryBadgeWarn
              }`}
            >
              {disclosureState.ledger?.coverage === 'partial' ? '部分服务端台账已核对' : '当前仅会话可见范围'}
            </span>
          </div>
          <p className={styles.deliveryMeta}>
            服务端台账 {disclosureState.ledger?.records.length ?? 0} 条 · 工作流回执{' '}
            {disclosureState.workflowCalls.length} 条
            {disclosureState.loading ? ' · 正在读取…' : ''}
            {disclosureState.error ? ` · 提示：${disclosureState.error}` : ''}
          </p>
          <input
            ref={focusQuietly}
            aria-label="补录平台外使用的 AI 工具"
            maxLength={200}
            value={manualAiTools}
            onChange={e => setManualAiTools(e.target.value)}
            placeholder="如有平台外使用的 AI 工具与版本，可在此补充（可选）…"
          />
          <pre className={styles.deliveryPreview}>{disclosureLines.join('\n')}</pre>
          <div className={styles.popActions}>
            <span>仅如实陈述已验证范围与回执，不虚构未记录的 Token 或审核结论。</span>
            <button
              type="button"
              disabled={disclosureState.loading}
              onClick={() => void refreshDisclosure()}
            >
              刷新台账
            </button>
            <button type="button" onClick={() => void handleDownloadAiMarkdown()}>
              下载 .md 说明
            </button>
            <button
              type="button"
              data-primary="true"
              disabled={!onWriteAiAppendix || previewOnly}
              title={previewOnly ? '预览候选稿时不可写入，请先采纳或返回原稿' : '写入附录并保留编辑器撤销栈'}
              onClick={handleWriteAiAppendix}
            >
              写入「AI 附录」
            </button>
          </div>
        </div>
      )}

      {open && open !== 'ai' && open !== 'preflight' && open !== 'disclosure' && section && !previewOnly && (
        <div className={styles.popover}>
          {open === 'text' && (
            <>
              <textarea
                ref={focusQuietly}
                rows={4}
                maxLength={2000}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={event => keys(() => text.trim() && put([{ kind: 'paragraph', text: text.trim() }], '一段正文'))(event)}
                placeholder={`写一段加到「${section.title}」末尾。数字请用登记结果，不要手填。`}
              />
              <div className={styles.popActions}>
                <span>{text.trim().length} 字 · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 加入，<kbd>Esc</kbd> 关闭</span>
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
                onKeyDown={event => keys(() => tex.trim() && !problem && put([{ kind: 'formula', tex: tex.trim() }], '一个公式'))(event)}
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
                <span>独立公式，导出时自动编号 · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 加入</span>
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
