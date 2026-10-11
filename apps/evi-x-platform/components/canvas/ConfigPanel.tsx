'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ChartPreview, { type ChartPreviewHandle } from '@/components/analysis/ChartPreview';
import { nodeDef, STAT_ROLES, isStat, type NodeKind } from '@/lib/canvas/catalog';
import type { CanvasNode, Issue } from '@/lib/canvas/graph';
import { columnSummary, type DatasetValue, type NodeState, type Output } from '@/lib/canvas/execute';
import { chartChoices } from '@/lib/chart-registry';
import { CHART_THEMES, defaultChartStyle } from '@/lib/chart-theme';
import type { ChartKind, ChartStyle, ChartThemeId } from '@/lib/chart-types';
import { isMissing, type Delimiter } from '@/lib/survey-analysis';
import { STATUS_LABELS, formatNumber, useCanvasContext } from './canvasUi';
import { StatusMark } from './CanvasNode';
import styles from './Canvas.module.css';

type Props = {
  palette: string; node: CanvasNode; state: NodeState | undefined; issues: Issue[]; dataset: DatasetValue | null; approvable: string | null;
  onChange: (patch: Partial<CanvasNode> & { config?: Record<string, unknown> }, label: string) => void;
  onRun: () => void; onClose: () => void; onDelete: () => void; onApprove: (hash: string | null) => void;
  onPickFile: (file: File, delimiter: Delimiter) => Promise<void>;
};

const text = (v: unknown) => typeof v === 'string' ? v : '';
const list = (v: unknown) => Array.isArray(v) ? v as string[] : [];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function ColumnSelect({ label, value, headers, onChange }: { label: string; value: string; headers: string[]; onChange: (v: string) => void }) {
  const known = !value || headers.includes(value);
  return <Field label={label} hint={!known ? `当前数据中没有「${value}」，运行时会报错。` : undefined}>
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">请选择</option>
      {!known && <option value={value}>{value}（未找到）</option>}
      {headers.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  </Field>;
}
function ColumnChecks({ legend, value, headers, onChange, limit }: { legend: string; value: string[]; headers: string[]; onChange: (v: string[]) => void; limit?: string[] }) {
  const options = limit ?? headers;
  return <fieldset className={styles.checks}><legend>{legend}</legend>
    {options.length ? options.map(h => <label key={h}><input type="checkbox" checked={value.includes(h)} onChange={e => onChange(e.target.checked ? [...value, h] : value.filter(x => x !== h))} />{h}</label>) : <p className={styles.muted}>运行上游数据节点后可选择列。</p>}
  </fieldset>;
}

/** Position-only changes (a drag) never re-render the panel; every other prop is compared as usual. */
export default memo(ConfigPanel, (a, b) => {
  const { node: na, ...ra } = a, { node: nb, ...rb } = b;
  const same = na === nb || (na.id === nb.id && na.kind === nb.kind && na.title === nb.title && na.config === nb.config && na.parent === nb.parent);
  return same && (Object.keys(ra) as (keyof typeof ra)[]).every(k => ra[k] === rb[k]);
});

function ConfigPanel({ palette, node, state, issues, dataset, approvable, onChange, onRun, onClose, onDelete, onApprove, onPickFile }: Props) {
  const ctx = useCanvasContext();
  const def = nodeDef(node.kind), c = node.config, status = state?.status ?? 'idle';
  const headers = dataset?.table.headers ?? [];
  const set = (patch: Record<string, unknown>, label = `修改「${node.title}」`) => onChange({ config: { ...c, ...patch } }, label);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [node.id]);

  return <aside className={styles.config} aria-label={`配置：${node.title}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header className={styles.panelHead}>
      <div className={styles.configTitle}>
        <span className={styles.kindLabel}>{def.title}{def.capability === 'reference' ? ' · 引用' : def.capability === 'note' ? ' · 注释' : ''}</span>
        <input className={styles.titleInput} value={node.title} maxLength={120} aria-label="节点名称" onChange={e => onChange({ title: e.target.value }, '重命名节点')} />
      </div>
      <button ref={close} type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭配置面板（Esc）">×</button>
    </header>
    <div className={styles.configBody}>
      <p className={styles.configSummary}>{def.summary}</p>
      {def.boundary && <p className={styles.boundary}>{def.boundary}</p>}
      {issues.length > 0 && <ul className={styles.issueList}>{issues.map((i, k) => <li key={k} data-level={i.level}>{i.message}</li>)}</ul>}
      {status !== 'idle' && <p className={styles.runState} data-status={status}><StatusMark status={status} />{state?.message || STATUS_LABELS[status]}{state?.cached ? '' : ''}</p>}

      <NodeForm node={node} set={set} headers={headers} dataset={dataset} onPickFile={onPickFile} />

      {node.kind === 'review' && <div className={styles.reviewBox}>
        <p>{text(c.approvedHash) ? `已确认：${text(c.approvedAt).replace('T', ' ').slice(0, 16)}。上游结果变化后需重新确认。` : '确认上游结果无误后，下游节点才会运行。'}</p>
        <div className={styles.rowButtons}>
          <button type="button" className={styles.primary} disabled={!approvable || approvable === text(c.approvedHash)} onClick={() => onApprove(approvable)}>{approvable ? '确认通过' : '先运行上游'}</button>
          {text(c.approvedHash) && <button type="button" className={styles.secondary} onClick={() => onApprove(null)}>撤销确认</button>}
        </div>
      </div>}

      {state?.status === 'done' && state.output && <Result output={state.output} node={node} palette={palette} set={set} />}

      <div className={styles.rowButtons}>
        {def.capability === 'run' && <button type="button" className={styles.primary} onClick={onRun}>运行到此节点</button>}
        {def.section && <button type="button" className={styles.secondary} onClick={() => ctx.open(def.section!, node.id)}>在完整编辑器中打开</button>}
        <button type="button" className={styles.danger} onClick={onDelete}>删除节点</button>
      </div>
    </div>
  </aside>;
}

function NodeForm({ node, set, headers, dataset, onPickFile }: { node: CanvasNode; set: (p: Record<string, unknown>, label?: string) => void; headers: string[]; dataset: DatasetValue | null; onPickFile: Props['onPickFile'] }) {
  const ctx = useCanvasContext(), c = node.config, kind: NodeKind = node.kind;
  const [delimiter, setDelimiter] = useState<Delimiter>(',');
  const [reading, setReading] = useState(''), [readError, setReadError] = useState('');
  const categories = useMemo(() => {
    if (!dataset || !text(c.column)) return [];
    const idx = dataset.table.headers.indexOf(text(c.column));
    if (idx < 0) return [];
    return [...new Set(dataset.table.rows.map(r => r[idx]).filter(v => !isMissing(v, dataset.missingCodes)).map(v => v.trim()))].slice(0, 60).sort();
  }, [dataset, c.column]);
  if (kind === 'question' || kind === 'method' || kind === 'note') return <Field label={kind === 'question' ? '问题、决策者与证据缺口' : kind === 'method' ? '方法与理由' : '备注'}><textarea rows={6} value={text(c.text)} onChange={e => set({ text: e.target.value })} /></Field>;
  if (kind === 'material') return <><Field label="出处"><input value={text(c.source)} onChange={e => set({ source: e.target.value })} placeholder="作者、年份、标题或网址" /></Field><Field label="要点"><textarea rows={5} value={text(c.text)} onChange={e => set({ text: e.target.value })} /></Field></>;
  if (kind === 'dataset') return <>
    <fieldset className={styles.radioRow}><legend>数据来源</legend>
      <label><input type="radio" name={`src-${node.id}`} checked={c.source === 'workspace'} onChange={() => set({ source: 'workspace' }, '切换数据来源')} />「数据分析」中的数据</label>
      <label><input type="radio" name={`src-${node.id}`} checked={c.source === 'file'} onChange={() => set({ source: 'file' }, '切换数据来源')} />本地 CSV 文件</label>
    </fieldset>
    {c.source === 'workspace' && <p className={styles.muted}>{ctx.workspaceDataset ? `当前：${columnSummary(ctx.workspaceDataset)}。在「数据分析」中更换数据后，重新运行即可。` : '「数据分析」中还没有数据。'}</p>}
    {c.source === 'file' && <>
      <Field label="分隔符"><select value={delimiter} onChange={e => setDelimiter(e.target.value as Delimiter)}><option value=",">逗号</option><option value={'\t'}>制表符</option><option value=";">分号</option></select></Field>
      <Field label="CSV 文件" hint="文件只在本机解析；画布只记录文件名和 SHA-256 指纹，不保存答卷。">
        <span className={styles.fileButton}>{text(c.fileName) ? '重新选择文件' : '选择 CSV 文件'}</span>
        <input className={styles.srOnly} type="file" accept=".csv,.tsv,.txt,text/csv" onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setReading(f.name); setReadError('');
          try { await onPickFile(f, delimiter); } catch (err) { setReadError(err instanceof Error ? err.message : '读取失败。'); } finally { setReading(''); }
        }} />
      </Field>
      {reading && <p className={styles.reading} role="status">正在读取「{reading}」…</p>}
      {readError && <p className={styles.errorText} role="alert">{readError}</p>}
      {text(c.fileName) && !reading && <p className={styles.muted}>{ctx.files.get(node.id) ? `已载入：${columnSummary(ctx.files.get(node.id)!)}` : `上次使用「${text(c.fileName)}」（指纹 ${text(c.fileHash).slice(0, 12)}…）；需重新选择同一文件。`}</p>}
    </>}
    <Field label="额外缺失代码" hint="用逗号分隔，例如 99, -1；空白单元格始终视为缺失。"><input value={text(c.missingCodes)} onChange={e => set({ missingCodes: e.target.value })} /></Field>
  </>;
  if (kind === 'filter') return <>
    <ColumnSelect label="筛选变量" value={text(c.column)} headers={headers} onChange={v => set({ column: v, values: [] }, '设置筛选变量')} />
    <ColumnChecks legend="纳入的类别" value={list(c.values)} headers={headers} limit={categories} onChange={v => set({ values: v }, '设置纳入类别')} />
  </>;
  if (kind === 'missing') return <>
    <Field label="缺失代码" hint="用逗号分隔；会与上游的缺失代码合并。"><input value={text(c.codes)} onChange={e => set({ codes: e.target.value })} /></Field>
    <ColumnChecks legend="只保留这些变量都有效的完整案例（可不选）" value={list(c.complete)} headers={headers} onChange={v => set({ complete: v }, '设置完整案例')} />
  </>;
  if (kind === 'alpha') return <>
    <ColumnChecks legend="量表题项" value={list(c.columns)} headers={headers} onChange={v => set({ columns: v, reverse: list(c.reverse).filter(r => v.includes(r)) }, '设置量表题项')} />
    <ColumnChecks legend="反向计分题" value={list(c.reverse)} headers={headers} limit={list(c.columns)} onChange={v => set({ reverse: v }, '设置反向题')} />
    <div className={styles.inline}>
      <Field label="计分下限"><input type="number" value={Number(c.min)} onChange={e => set({ min: Number(e.target.value) })} /></Field>
      <Field label="计分上限"><input type="number" value={Number(c.max)} onChange={e => set({ max: Number(e.target.value) })} /></Field>
    </div>
    <Field label="共同测量的构念"><input value={text(c.construct)} onChange={e => set({ construct: e.target.value })} placeholder="例如：使用体验" /></Field>
    <Field label="研究问题（不影响计算）"><textarea rows={2} value={text(c.question)} onChange={e => set({ question: e.target.value })} /></Field>
  </>;
  if (isStat(kind)) {
    const roles = STAT_ROLES[kind as Exclude<typeof kind, 'alpha'>];
    return <>
      <ColumnSelect label={roles[0]} value={text(c.x)} headers={headers} onChange={v => set({ x: v }, '设置变量')} />
      {roles[1] && <ColumnSelect label={roles[1]} value={text(c.y)} headers={headers} onChange={v => set({ y: v }, '设置变量')} />}
      <Field label="研究问题（不影响计算）"><textarea rows={2} value={text(c.question)} onChange={e => set({ question: e.target.value })} /></Field>
    </>;
  }
  if (kind === 'conclusion') return <Field label="你的结论" hint="只基于上方列出的事实撰写；系统不会代写解释或因果判断。"><textarea rows={7} value={text(c.text)} onChange={e => set({ text: e.target.value })} /></Field>;
  if (kind === 'report') return <Field label="章节标题（可选）"><input value={text(c.heading)} onChange={e => set({ heading: e.target.value })} /></Field>;
  if (kind === 'review') return <Field label="复核说明"><textarea rows={3} value={text(c.note)} onChange={e => set({ note: e.target.value })} placeholder="检查了什么、发现什么问题" /></Field>;
  if (kind === 'chart') return null;
  return null;
}

type Setter = (patch: Record<string, unknown>, label?: string) => void;
function Result({ output, node, palette, set }: { output: Output; node: CanvasNode; palette: string; set: Setter }) {
  if (output.type === 'dataset') {
    const d = output.value;
    return <section className={styles.result} aria-label="运行结果">
      <h4>数据</h4>
      <p className={styles.resultLead}>{columnSummary(d)} · {d.kind === 'simulated' ? '模拟数据' : '用户提供，来源未独立核验'}</p>
      {d.lineage.length > 0 && <ol className={styles.lineage}>{d.lineage.map((l, i) => <li key={i}>{l}</li>)}</ol>}
      <p className={styles.muted}>缺失代码：{d.missingCodes.join('、') || '仅空白'} · 指纹 {d.sourceHash.slice(0, 12)}…</p>
    </section>;
  }
  if (output.type === 'result') {
    const r = output.value.result;
    return <section className={styles.result} aria-label="运行结果">
      <h4>结果</h4>
      <div className={styles.metrics}>
        <span><small>有效样本</small><strong>{r.n}</strong><em>/ {r.total}</em></span>
        {r.metrics.map(m => <span key={m.label}><small>{m.label}</small><strong>{formatNumber(m.value)}</strong></span>)}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>{r.headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{r.rows.slice(0, 40).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{typeof cell === 'number' ? formatNumber(cell) : cell ?? '—'}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {r.rows.length > 40 && <p className={styles.muted}>只显示前 40 行，共 {r.rows.length} 行。</p>}
      <p className={styles.muted}>{r.interpretation}</p>
      <details className={styles.warnings}><summary>口径与限制（{r.warnings.length}）</summary><ul>{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
    </section>;
  }
  if (output.type === 'chart') return <ChartResult output={output} node={node} palette={palette} set={set} />;
  if (output.type === 'bundle') return <section className={styles.result} aria-label="运行结果"><h4>汇集</h4><ol className={styles.lineage}>{output.value.map((i, k) => <li key={k}>{i.name} · {i.type === 'chart' ? '图表' : '统计结果'}</li>)}</ol></section>;
  if (output.type === 'facts') return <section className={styles.result} aria-label="运行结果"><h4>上游事实</h4><ul className={styles.facts}>{output.value.map((f, i) => <li key={i}><strong>{f.label}</strong>{f.simulated && <em>模拟数据</em>}<span>{f.text}</span></li>)}</ul>{!output.value.length && <p className={styles.muted}>没有可列出的结果。</p>}</section>;
  if (output.type === 'report') {
    const { sections, skipped } = output.value;
    const download = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'evix-local-evidence/v1', heading: text(node.config.heading), sections }, null, 2)], { type: 'application/json;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = '画布证据段落.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <section className={styles.result} aria-label="运行结果">
      <h4>证据段落</h4>
      {sections.map(s => <details key={s.id} className={styles.section}><summary>{s.title}</summary><pre>{s.body}</pre></details>)}
      {skipped.length > 0 && <p className={styles.muted}>以下结果暂不支持自动生成段落，请在报告编辑器中撰写：{skipped.join('、')}。</p>}
      {sections.length > 0 && <button type="button" className={styles.secondary} onClick={download}>下载证据段落（JSON）</button>}
    </section>;
  }
  return null;
}

function ChartResult({ output, node, palette: projectPalette, set }: { output: Extract<Output, { type: 'chart' }>; node: CanvasNode; palette: string; set: Setter }) {
  const c = node.config, preview = useRef<ChartPreviewHandle>(null);
  const [exportError, setExportError] = useState('');
  const choices = useMemo(() => chartChoices(output.value.snapshot), [output.value.snapshot]);
  const wanted = text(c.kind);
  // Format changes apply to the preview directly; they never re-run the statistics.
  const kind: ChartKind = wanted && wanted !== 'auto' && choices.some(x => x.id === wanted && x.available) ? wanted as ChartKind : output.value.kind;
  const palette = (text(c.palette) || projectPalette) as ChartThemeId;
  const style: ChartStyle = { ...defaultChartStyle(text(c.title) || output.value.title), decimals: Number(c.decimals) || 0, showLabels: !!c.showLabels, tableRules: (['three_line', 'grid', 'minimal'].includes(text(c.tableRules)) ? text(c.tableRules) : 'three_line') as ChartStyle['tableRules'] };
  return <ChartControls node={node} choices={choices} kind={kind} set={set}>
    <div className={styles.chartFrame} key={`${kind}:${palette}`}>
      <ChartPreview ref={preview} snapshot={output.value.snapshot} kind={kind} style={style} theme={palette} />
    </div>
    <div className={styles.rowButtons}>
      {(['svg', 'png'] as const).map(f => <button key={f} type="button" className={styles.secondary} onClick={() => { setExportError(''); preview.current?.exportImage(f).catch(e => setExportError(e instanceof Error ? e.message : '导出失败。')); }}>导出 {f.toUpperCase()}</button>)}
    </div>
    {exportError && <p className={styles.errorText} role="alert">{exportError}</p>}
  </ChartControls>;
}

function ChartControls({ node, choices, kind, set, children }: { node: CanvasNode; choices: ReturnType<typeof chartChoices>; kind: ChartKind; set: Setter; children: React.ReactNode }) {
  const c = node.config;
  return <section className={styles.result} aria-label="图表">
    <h4>图表</h4>
    <Field label="图形"><select value={text(c.kind) || 'auto'} onChange={e => set({ kind: e.target.value }, '切换图形')}>
      <option value="auto">自动（{choices.find(x => x.available)?.title ?? '统计结果表'}）</option>
      {choices.map(x => <option key={x.id} value={x.id} disabled={!x.available}>{x.title}{x.available ? '' : `（${x.reason}）`}</option>)}
    </select></Field>
    <div className={styles.inline}>
      <Field label="配色"><select value={text(c.palette)} onChange={e => set({ palette: e.target.value }, '修改配色')}><option value="">跟随项目配色</option>{CHART_THEMES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      <Field label="小数位"><input type="number" min={0} max={4} value={Number(c.decimals)} onChange={e => set({ decimals: Math.max(0, Math.min(4, Number(e.target.value) || 0)) }, '修改小数位')} /></Field>
    </div>
    <Field label="标题"><input value={text(c.title)} onChange={e => set({ title: e.target.value }, '修改图表标题')} placeholder={node.title} /></Field>
    <label className={styles.checkLine}><input type="checkbox" checked={!!c.showLabels} onChange={e => set({ showLabels: e.target.checked }, '切换数据标签')} />显示数据标签</label>
    {kind === 'table' && <Field label="框线" hint="三线表固定 1.5 / 0.75 / 1.5 磅，各列居中。"><select value={text(c.tableRules) || 'three_line'} onChange={e => set({ tableRules: e.target.value }, '修改框线')}><option value="three_line">三线表</option><option value="grid">网格</option><option value="minimal">简洁</option></select></Field>}
    {children}
  </section>;
}
