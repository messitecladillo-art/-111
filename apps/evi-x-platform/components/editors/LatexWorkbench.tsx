'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { parseEditorContent, type EditorContent } from '../../lib/editor-model';
import { approvedLatexSource, previewLatexSource, createLatexCompileGuard, decodeLatexPdf, generateLatexBody, insertLatexSnippet, LATEX_INSERTS, LATEX_LIMITS, latexCompileInput, latexCompileKey, latexLineSelection, latexReportKey, latexSha256, parseLatexCompileReceipt, type LatexDiagnostic } from '../../lib/latex-report';
import { useHostedSession } from '../hosted/HostedSession';
import PdfPreview from './PdfPreview';
import styles from './LatexWorkbench.module.css';

type Props = { content: EditorContent; onChange: (content: EditorContent) => void; projectId?: string; onSave?: () => void; disabled?: boolean };
type Preview = { url: string; inputKey: string; sourceHash: string; title: string };
function filename(title: string) { return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || '研究报告'; }
function downloadSource(source: string, title: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/x-tex;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${filename(title)}.tex`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function LatexWorkbench(props: Props) {
  // A project switch owns a new compile lifetime; PDFs never cross project boundaries.
  return <LatexSession key={props.projectId ?? 'local'} {...props} />;
}

function LatexSession({ content, onChange, projectId, onSave, disabled = false }: Props) {
  const { mutate } = useHostedSession();
  const [sourceView, setSourceView] = useState(false), [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [diagnostics, setDiagnostics] = useState<LatexDiagnostic[]>([]), [preview, setPreview] = useState<Preview | null>(null);
  const [diagnosticKey, setDiagnosticKey] = useState('');
  const [hash, setHash] = useState<{ key: string; value: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null), abort = useRef<AbortController | null>(null), previewUrl = useRef<string | null>(null);
  const alive = useRef(true), guard = useRef(createLatexCompileGuard());
  const reportKey = latexReportKey(content);
  const input = useMemo(() => latexCompileInput(content), [content]);
  const inputKey = latexCompileKey(input), sourcePreview=useMemo(()=>previewLatexSource(input),[input]),source=sourcePreview.source,sourceError=sourcePreview.error;
  const current = useRef({ projectId, inputKey });
  useLayoutEffect(() => { current.current = { projectId, inputKey }; }, [projectId, inputKey]);
  const currentReportHash = hash?.key === reportKey ? hash.value : null;
  const staleReport = Boolean(content.latex && currentReportHash && content.latex.reportHash !== currentReportHash);
  const currentPdf = preview?.inputKey === inputKey;

  useEffect(() => {
    let cancelled = false;
    void latexSha256(reportKey).then(value => { if (!cancelled) setHash({ key: reportKey, value }); }).catch(() => { if (!cancelled) setError('无法计算报告指纹，请刷新后重试。'); });
    return () => { cancelled = true; };
  }, [reportKey]);
  useEffect(() => {
    const lifetime = guard.current;
    alive.current = true;
    return () => { alive.current = false; lifetime.cancel(); abort.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, []);

  const applyBody = (body: string) => {
    if (disabled || !content.latex) return;
    try { onChange(parseEditorContent({ ...content, latex: { ...content.latex, body } })); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : '正文未能更新。'); }
  };
  const initialize = (empty = false) => {
    if (disabled || !currentReportHash) return;
    try {
      const body = empty ? '' : generateLatexBody(content);
      onChange(parseEditorContent({ ...content, latex: { version: 1, body, reportHash: currentReportHash } }));
      setSourceView(false); setConfirmRegenerate(false); setError(''); setDiagnostics([]); setNotice(empty ? '空白正文已建立。' : '已根据当前报告生成正文。');
    } catch (e) { setError(e instanceof Error ? e.message : '正文生成失败。'); }
  };
  const insert = (kind: keyof typeof LATEX_INSERTS) => {
    if (disabled || !content.latex) return;
    const field = textarea.current;
    const inserted = insertLatexSnippet(content.latex.body, LATEX_INSERTS[kind], field?.selectionStart, field?.selectionEnd);
    applyBody(inserted.body); setSourceView(false);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(inserted.start, inserted.end); });
  };
  const goToLine = (line: number) => {
    if (!content.latex) return;
    setSourceView(false);
    // Textareas normalize CRLF/CR; use the displayed value for selection offsets.
    requestAnimationFrame(() => { const field = textarea.current; if (field) { const range = latexLineSelection(field.value, line); field.focus(); field.setSelectionRange(range.start, range.end); field.scrollTop = Math.max(0, line - 4) * 24; } });
  };
  const compile = useCallback(async () => {
    if (!projectId || !content.latex || abort.current || sourceError) return;
    const controller = new AbortController(), ticket = guard.current.start(projectId, inputKey);
    abort.current = controller; setBusy(true); setError(''); setNotice(''); setDiagnostics([]);
    const accepts = () => alive.current && guard.current.accepts(ticket, current.current.projectId ?? '', current.current.inputKey);
    try {
      const raw = await mutate(`/api/projects/${encodeURIComponent(projectId)}/report/latex/compile`, input, 'POST', { maxBytes: LATEX_LIMITS.responseBytes, timeoutMs: LATEX_LIMITS.timeoutMs, signal: controller.signal });
      if (!accepts()) return;
      const receipt = await parseLatexCompileReceipt(raw, source);
      if (!accepts()) return;
      setDiagnostics(receipt.diagnostics); setDiagnosticKey(inputKey);
      if (receipt.status === 'compiled' && receipt.pdfBase64) {
        const url = URL.createObjectURL(new Blob([decodeLatexPdf(receipt.pdfBase64)], { type: 'application/pdf' }));
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview({ url, inputKey, sourceHash: receipt.sourceHash, title: input.title }); setNotice('PDF 编译完成。');
      } else setNotice(receipt.status === 'unavailable' ? '编译服务暂未启用，可先导出源码。' : '编译未完成，请检查下方诊断。');
    } catch (e) { if (accepts()) setError(e instanceof Error ? e.message : '编译请求失败，请重试。'); }
    finally { if (alive.current && abort.current === controller) { abort.current = null; setBusy(false); } }
  }, [content.latex, input, inputKey, mutate, projectId, source, sourceError]);
  async function exportSource(){const target={projectId,inputKey};try{const receipt=await approvedLatexSource(input);if(!alive.current||current.current.projectId!==target.projectId||current.current.inputKey!==target.inputKey||receipt.inputKey!==target.inputKey)return;downloadSource(receipt.source,content.title);}catch(error){if(alive.current)setError(error instanceof Error?error.message:'源码未能导出。');}}
  const cancel = () => { guard.current.cancel(); abort.current?.abort(); abort.current = null; setBusy(false); setNotice('已停止等待，可继续编辑。'); };

  return <section className={styles.workbench} aria-label="LaTeX 排版工作台">
    <header className={styles.toolbar}>
      <div><strong>LaTeX 排版</strong><span className={styles.subtitle}>正文与 PDF 对照</span></div>
      <div className={styles.actions}>
        {content.latex && <button type="button" disabled={disabled || !currentReportHash} onClick={() => setConfirmRegenerate(true)}>从报告重新生成</button>}
        <button type="button" disabled={!content.latex||!!sourceError} onClick={() => void exportSource()}>导出 .tex</button>
        {onSave && <button type="button" disabled={disabled} onClick={onSave}>保存版本</button>}
        {busy ? <button type="button" onClick={cancel}>停止等待</button> : <button type="button" className={styles.primary} disabled={!projectId || !content.latex||!!sourceError} onClick={() => void compile()}>编译 PDF <kbd>Ctrl ↵</kbd></button>}
      </div>
    </header>
    {confirmRegenerate && <div className={styles.confirm} role="alertdialog" aria-label="重新生成 LaTeX 正文">
      <div><strong>用当前报告替换 LaTeX 正文？</strong><p>替换后可通过上方“撤销”恢复。</p></div>
      <button type="button" onClick={() => setConfirmRegenerate(false)}>取消</button><button type="button" disabled={disabled || !currentReportHash} onClick={() => initialize()}>替换正文</button>
    </div>}
    <div className={styles.statusRow}>
      <span data-stale={staleReport}>{!content.latex ? '建立正文后开始排版' : !currentReportHash ? '正在核对报告版本…' : staleReport ? '报告已更新 · LaTeX 正文待同步' : '报告版本已对齐'}</span>
      {!projectId ? <Link href="/projects">进入项目后编译 PDF →</Link> : <span>{busy ? '正在编译…' : 'A4 · 三线表 1.5 / 0.75 / 1.5 pt'}</span>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {sourceError&&<p className={styles.error} role="alert">{sourceError}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.panes}>
      <div className={styles.sourcePane}>
        <div className={styles.paneBar}><div className={styles.tabs} aria-label="源码视图">
          <button type="button" aria-pressed={!sourceView} onClick={() => setSourceView(false)}>body.tex</button><button type="button" aria-pressed={sourceView} onClick={() => setSourceView(true)}>完整源码</button>
        </div><span>{sourceView ? '模板 + 正文 · 只读' : '正文可编辑'}</span></div>
        {!content.latex ? <div className={styles.empty}>
          <span className={styles.eyebrow}>SOURCE → PDF</span><h3>把研究写进版面</h3><p>从报告生成正文，再编写公式与三线表。</p>
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || !currentReportHash} onClick={() => initialize()}>从报告生成</button><button type="button" disabled={disabled || !currentReportHash} onClick={() => initialize(true)}>新建空白正文</button></div>
        </div> : <>
          <div className={styles.insertBar}><button type="button" disabled={disabled || sourceView} onClick={() => insert('formula')}>＋ 公式</button><button type="button" disabled={disabled || sourceView} onClick={() => insert('table')}>＋ 三线表</button><span>模板管理纸张、字体与线宽</span></div>
          <textarea ref={textarea} className={styles.code} aria-label="LaTeX 正文" hidden={sourceView} spellCheck={false} wrap="off" value={content.latex.body} readOnly={disabled} maxLength={LATEX_LIMITS.body} onChange={event => applyBody(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void compile(); } }} />
          <textarea className={styles.code} aria-label="完整 LaTeX 源码" hidden={!sourceView} spellCheck={false} wrap="off" value={source} readOnly />
          <div className={styles.sourceFooter}><span>{content.latex.body.split(/\r\n|\r|\n/).length} 行</span><span>{content.latex.body.length.toLocaleString()} / 120,000 字符</span></div>
        </>}
      </div>
      <div className={styles.previewPane} aria-busy={busy}>
        <div className={styles.paneBar}><strong>PDF 预览</strong><span data-stale={preview && !currentPdf}>{preview ? currentPdf ? '当前源码' : '源码已变化 · 上次编译' : '等待编译'}</span>{preview && <a href={preview.url} download={`${filename(preview.title)}${currentPdf ? '' : '-上次编译'}.pdf`}>{currentPdf ? '下载 PDF' : '下载上次 PDF'}</a>}</div>
        {preview ? <PdfPreview key={preview.url} url={preview.url} /> : <div className={styles.previewEmpty}><div className={styles.paperIcon} aria-hidden="true"><i /><i /><i /><i /></div><h3>{busy ? '正在排版' : '编译后在这里查看'}</h3><p>{projectId ? '调整源码，再检查分页、公式和表格。' : '源码可先导出，进入项目后生成 PDF。'}</p></div>}
        {preview && <div className={styles.sourceFooter}><span>XeLaTeX</span><span title={preview.sourceHash}>源码指纹 {preview.sourceHash.slice(0, 12)}</span></div>}
      </div>
    </div>
    {diagnosticKey === inputKey && diagnostics.length > 0 && <div className={styles.diagnostics} aria-label="编译诊断"><strong>编译诊断</strong><ul>{diagnostics.map((item, index) => <li key={`${index}-${item.line}`} data-severity={item.severity}>{item.line ? <button type="button" onClick={() => goToLine(item.line!)}>第 {item.line} 行</button> : <span>编译环境</span>}<span>{item.message}</span></li>)}</ul></div>}
  </section>;
}
