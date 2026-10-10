'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import type { ChartFamily, ChartKind, ChartModule, ChartStyle, ChartWorkspaceSettings } from '../../lib/chart-types';
import { CHART_FAMILIES, chartChoices } from '../../lib/chart-registry';
import { CHART_THEMES, currentChartSettings, resolveFigureSettings as figureFor, restoreChartSettings, serializeChartSettings } from '../../lib/chart-theme';
import { RESEARCH_PALETTES } from '../../lib/chart-palette-reserve';
import ChartPreview, { type ChartPreviewHandle } from './ChartPreview';
import styles from './ChartStudio.module.css';

type Props = {
  modules: ChartModule[];
  settings: ChartWorkspaceSettings;
  onChange: (settings: ChartWorkspaceSettings) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
};
type Notice = { text: string; error: boolean };

function ChartGlyph({ family }: { family: ChartFamily }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
    {family === 'comparison' ? <><path d="M4 20h17"/><path d="M6 17V9h3v8m3 0V4h3v13m3 0v-6h3v6"/></>
      : family === 'composition' ? <><circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 5m-6-5H4"/></>
      : family === 'distribution' ? <><path d="M3 19h18M4 17c4 0 3-12 8-12s4 12 8 12"/><path d="M12 6v11" strokeDasharray="2 2"/></>
      : family === 'relationship' ? <><path d="M4 4v16h16"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="9" r="1"/><circle cx="17" cy="6" r="1"/><path d="m6 17 14-13" strokeDasharray="2 2"/></>
      : family === 'measurement' ? <><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="var(--wb-solid)"/><circle cx="16" cy="12" r="2" fill="var(--wb-solid)"/><circle cx="11" cy="19" r="2" fill="var(--wb-solid)"/></>
      : <><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M4 14h16M10 4v16"/></>}
  </svg>;
}

export default function ChartStudio({ modules, settings, onChange, activeId, onSelect, onBack }: Props) {
  const currentModule = modules.find(item => item.id === activeId) ?? modules[0] ?? null;
  const snapshot = currentModule?.snapshot ?? null;
  const current = !!currentModule?.current && !!snapshot;
  const figure = currentModule ? figureFor(currentModule, settings) : null;
  const choices = snapshot ? chartChoices(snapshot) : [];
  const selected = choices.find(choice => choice.id === figure?.kind);
  const ready = current && !!selected?.available;
  const currentCount = modules.filter(item => item.current && item.snapshot).length;
  const scope = JSON.stringify([currentModule?.id, ...modules.map(item => [item.id, item.current, item.snapshot?.binding, item.title, item.question])]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reading, setReading] = useState<{ epoch: number; scope: string } | null>(null);
  const [exporting, setExporting] = useState<{ epoch: number; scope: string; format: 'svg' | 'png' } | null>(null);
  const [openFamilies, setOpenFamilies] = useState<Partial<Record<ChartFamily, boolean>>>({});
  const [focused, setFocused] = useState(false);
  const studio = useRef<HTMLElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const epoch = useRef(0);
  const alive = useRef(false);
  const latest = useRef({ scope, settings });
  const preview = useRef<ChartPreviewHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    const cancellationEpoch = epoch;
    return () => { alive.current = false; cancellationEpoch.current++; };
  }, []);
  // Commit the request fence before pending file/export microtasks can apply.
  useLayoutEffect(() => { latest.current = { scope, settings }; }, [scope, settings]);
  useEffect(() => {
    if (!focused) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background: { element: HTMLElement; inert: boolean }[] = [];
    for (let branch: HTMLElement | null = studio.current; branch?.parentElement; branch = branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) if (sibling !== branch && sibling instanceof HTMLElement) {
        background.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
      }
      if (parent === document.body) break;
    }
    document.body.style.overflow = 'hidden';
    focusButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setFocused(false); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(studio.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (!studio.current?.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      for (const item of background) item.element.inert = item.inert;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [focused]);

  const importing = reading?.scope === scope;
  const busyExport = exporting?.scope === scope;
  function touch() { epoch.current++; setReading(null); setNotice(null); }
  function updateStyle(patch: Partial<ChartStyle>) {
    if (!currentModule || !figure) return;
    touch();
    onChange({ ...settings, figures: { ...settings.figures, [currentModule.id]: { ...figure, style: { ...figure.style, ...patch } } } });
  }
  function choose(kind: ChartKind) {
    if (!currentModule || !figure) return;
    touch();
    onChange({ ...settings, figures: { ...settings.figures, [currentModule.id]: { ...figure, kind } } });
  }
  function applyAll() {
    if (!figure) return;
    touch();
    const figures = { ...settings.figures };
    for (const item of modules) {
      const existing = figureFor(item, settings);
      const { title, subtitle, xLabel, yLabel, note } = existing.style;
      figures[item.id] = { ...existing, style: { ...figure.style, title, subtitle, xLabel, yLabel, note } };
    }
    onChange({ ...settings, figures });
    setNotice({ text: `格式已应用到 ${modules.length} 个模块。`, error: false });
  }
  function downloadSettings() {
    try {
      const blob = new Blob([serializeChartSettings(currentChartSettings(settings, modules), modules)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = '图表格式.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ text: `已发起 ${currentCount} 个当前模块的格式下载。`, error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : '格式下载失败，请重试。', error: true }); }
  }
  async function importSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = ++epoch.current;
    const startingScope = scope, startingSettings = settings;
    setNotice(null);
    if (file.size > 100 * 1024) { setNotice({ text: '格式文件超过 100 KB，请选择图表格式 JSON。', error: true }); return; }
    setReading({ epoch: token, scope: startingScope });
    const isCurrent = () => alive.current && epoch.current === token && latest.current.scope === startingScope && latest.current.settings === startingSettings;
    try {
      const raw = await file.text();
      if (!isCurrent()) return;
      const restored = restoreChartSettings(raw, modules);
      if (!isCurrent()) return;
      onChange({ ...restored, figures: { ...startingSettings.figures, ...restored.figures } });
      setNotice({ text: `已载入 ${file.name} 的图表格式。`, error: false });
    } catch (error) {
      if (isCurrent()) setNotice({ text: error instanceof Error ? error.message : '格式文件无法读取，请重新选择。', error: true });
    } finally {
      if (alive.current) setReading(previous => previous?.epoch === token ? null : previous);
    }
  }
  async function exportImage(format: 'svg' | 'png') {
    if (!ready || !preview.current) return;
    const token = ++epoch.current;
    const startingScope = scope, startingSettings = settings;
    setNotice(null); setReading(null); setExporting({ epoch: token, scope, format });
    try {
      await preview.current.exportImage(format);
      if (alive.current && epoch.current === token && latest.current.scope === startingScope && latest.current.settings === startingSettings) {
        setNotice({ text: `已发起 ${format.toUpperCase()} 图${figure?.kind === 'table' ? '表' : ''}下载。`, error: false });
      }
    } catch (error) {
      if (alive.current && epoch.current === token && latest.current.scope === startingScope && latest.current.settings === startingSettings) {
        setNotice({ text: error instanceof Error ? error.message : '图表导出失败，请重试。', error: true });
      }
    } finally {
      if (alive.current) setExporting(previous => previous?.epoch === token ? null : previous);
    }
  }
  function numberControl(label: string, key: 'fontSize' | 'decimals' | 'lineWidth' | 'pointSize' | 'width' | 'height', min: number, max: number, step = 1, disabled = false) {
    return <label>{label}<input type="number" min={min} max={max} step={step} disabled={disabled} value={figure!.style[key]} onChange={event => {
      if (event.target.value === '') return;
      const value = Number(event.target.value);
      if (Number.isFinite(value)) updateStyle({ [key]: Math.min(max, Math.max(min, step === 1 ? Math.round(value) : value)) });
    }}/></label>;
  }

  return <section ref={studio} className={styles.studio} data-focused={focused} role={focused ? 'dialog' : 'region'} aria-modal={focused || undefined} aria-label="图表工作室">
    <header className={styles.toolbar}>
      <div className={styles.heading}><button type="button" className={styles.back} onClick={onBack} aria-label="返回分析模块">←</button><div><span className={styles.eyebrow}>FIGURE STUDIO</span><h3>图表工作室</h3></div></div>
      <label className={styles.moduleSelect}>分析模块<select value={currentModule?.id ?? ''} disabled={!modules.length} onChange={event => { touch(); onSelect(event.target.value); }}>{modules.map((item, index) => <option value={item.id} key={item.id}>{String(index + 1).padStart(2, '0')} · {item.title}{item.question ? ` · ${item.question}` : ''}</option>)}</select></label>
      <div className={styles.fileTools}><button ref={focusButton} type="button" aria-pressed={focused} onClick={() => setFocused(previous => !previous)}>{focused ? '退出专注 · Esc' : '专注图表'}</button><input ref={fileInput} className={styles.hidden} type="file" accept=".json,application/json" aria-label="导入图表格式文件" onChange={importSettings}/><button type="button" onClick={() => fileInput.current?.click()} disabled={!modules.length || !!importing}>载入格式</button><button type="button" onClick={downloadSettings} disabled={!currentCount}>下载当前格式</button></div>
    </header>
    <div className={styles.context}><span className={styles.contextQuestion}>{currentModule?.question || currentModule?.title || '选择一个分析模块'}</span><div><span className={styles.state} data-current={current}>{current ? '当前结果' : snapshot ? '待更新' : '待计算'}</span>{current && <span className={styles.sample}>n = {snapshot!.n}</span>}</div></div>
    {importing && <div className={styles.notice} role="status"><span className={styles.activity} aria-hidden="true"/>正在读取与校验格式文件…<button type="button" onClick={() => { touch(); setNotice({ text: '已取消格式读取。', error: false }); }}>取消</button></div>}
    {notice && <p className={styles.notice} data-error={notice.error} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    <div className={styles.desk}>
      <nav className={styles.tree} aria-label="按用途选择图表">
        <div className={styles.paneHeading}><h4>想呈现什么</h4><span>{choices.filter(choice => choice.available).length} 种可选</span></div>
        {CHART_FAMILIES.map(family => {
          const items = choices.filter(choice => choice.family === family.id);
          if (!items.length) return null;
          const active = items.some(choice => choice.id === figure?.kind);
          const open = openFamilies[family.id] ?? active;
          return <details key={family.id} open={open} className={styles.family} onToggle={event => { const isOpen = event.currentTarget.open; setOpenFamilies(previous => previous[family.id] === isOpen ? previous : { ...previous, [family.id]: isOpen }); }}>
            <summary><ChartGlyph family={family.id}/><span><strong>{family.title}</strong><small>{family.description}</small></span><span className={styles.chevron} aria-hidden="true">›</span></summary>
            <div className={styles.branches}>{items.map(choice => <button type="button" key={choice.id} aria-pressed={figure?.kind === choice.id} disabled={!choice.available || !currentModule} onClick={() => choose(choice.id)} title={choice.available ? choice.description : choice.reason}><span className={styles.branchDot} aria-hidden="true"/><span><strong>{choice.title}</strong><small>{choice.available ? choice.description : choice.reason}</small></span></button>)}</div>
          </details>;
        })}
        {!snapshot && <p className={styles.treeEmpty}>计算完成后，在这里选择图形。</p>}
      </nav>
      <section className={styles.previewPane} aria-label="图表预览">
        <div className={styles.previewHeading}><span>{selected?.title ?? '图表预览'}</span><div><button type="button" disabled={!ready || !!busyExport} onClick={() => exportImage('svg')}>{busyExport && exporting?.format === 'svg' ? '导出中…' : 'SVG'}</button><button type="button" disabled={!ready || !!busyExport} onClick={() => exportImage('png')}>{busyExport && exporting?.format === 'png' ? '导出中…' : 'PNG'}</button></div></div>
        <div className={styles.paperStage}>
          {ready && figure && snapshot ? <div className={styles.paper} style={{ '--figure-ratio': `${figure.style.width} / ${figure.style.height}` } as CSSProperties}><ChartPreview ref={preview} snapshot={snapshot} kind={figure.kind} style={figure.style} theme={settings.theme}/></div>
            : <div className={styles.empty}><svg viewBox="0 0 56 56" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d="M9 8v39h40M16 40V26h7v14m7 0V15h7v25m7 0v-7h7v7"/></svg><h4>{snapshot && !current ? '设置已变化，重新计算后更新图表' : !snapshot ? '先计算，再看见数据' : selected?.reason || '请重新选择图形'}</h4><button type="button" onClick={onBack}>返回分析模块</button></div>}
        </div>
        {current && snapshot && <details className={styles.dataScope}><summary>计算口径 <span>{snapshot.statistics.length} 项</span></summary><ul>{snapshot.statistics.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      </section>
      <aside className={styles.formatPane} aria-label="图表格式">
        <div className={styles.paneHeading}><h4>格式</h4><span>实时预览</span></div>
        <fieldset disabled={!figure} className={styles.controls}>
          <details className={styles.formatSection} open><summary>项目色系 <span>{CHART_THEMES.find(theme => theme.id === settings.theme)?.title}</span></summary><div className={styles.themeList}>{CHART_THEMES.filter(theme => !theme.id.startsWith('ref_')).map(theme => <button type="button" key={theme.id} aria-label={`使用${theme.title}色系`} aria-pressed={settings.theme === theme.id} onClick={() => { touch(); onChange({ ...settings, theme: theme.id }); }}><span className={styles.swatches}>{theme.colors.slice(0, 5).map((color, index) => <i key={index} style={{ background: color }}/>)}</span><span>{theme.title}</span><span className={styles.themeCheck} aria-hidden="true">{settings.theme === theme.id ? '✓' : ''}</span></button>)}</div>
            {figure && <div className={styles.accentRow}><label className={styles.check}><input type="checkbox" checked={figure.style.accent !== null} onChange={event => updateStyle({ accent: event.target.checked ? CHART_THEMES.find(theme => theme.id === settings.theme)!.colors[0] : null })}/>单图强调色</label><input aria-label="单图强调色" type="color" disabled={figure.style.accent === null} value={figure.style.accent ?? CHART_THEMES.find(theme => theme.id === settings.theme)!.colors[0]} onChange={event => updateStyle({ accent: event.target.value })}/></div>}
          </details>
          <details className={styles.formatSection}><summary>配色组合库 <span>{RESEARCH_PALETTES.length} 组</span></summary><div className={styles.paletteReserve}>{RESEARCH_PALETTES.map(palette => <button type="button" key={palette.id} title={palette.use} aria-label={`使用${palette.title}组合`} aria-pressed={settings.theme === palette.id} onClick={() => { touch(); onChange({ ...settings, theme: palette.id }); }}><span className={styles.paletteMeta}><strong>{palette.title}</strong><small>{({ categorical: '分类比较', sequential: '连续数值', diverging: '正负差异' })[palette.kind]} · {palette.colors.length} 色</small><span aria-hidden="true">{settings.theme === palette.id ? '✓' : ''}</span></span><span className={styles.paletteStrip}>{palette.colors.map(color => <i key={color} style={{ background: color }} title={color}/>)}</span><span className={styles.paletteCodes}>{palette.colors.join(' · ')}</span></button>)}</div></details>
          {figure && <>
            <details className={styles.formatSection} open><summary>标题与标注</summary><div className={styles.fields}><label>图表标题<input maxLength={160} value={figure.style.title} onChange={event => updateStyle({ title: event.target.value })}/></label><label>副标题<input maxLength={240} value={figure.style.subtitle} onChange={event => updateStyle({ subtitle: event.target.value })}/></label>{figure.kind !== 'table' && <div className={styles.twoColumns}><label>横轴标题<input maxLength={100} placeholder="自动匹配图型" value={figure.style.xLabel} onChange={event => updateStyle({ xLabel: event.target.value })}/></label><label>纵轴标题<input maxLength={100} placeholder="自动匹配图型" value={figure.style.yLabel} onChange={event => updateStyle({ yLabel: event.target.value })}/></label></div>}<label>图下注释<textarea rows={2} maxLength={500} value={figure.style.note} onChange={event => updateStyle({ note: event.target.value })} placeholder="来源、单位或说明"/></label></div></details>
            <details className={styles.formatSection}><summary>文字与数字</summary><div className={styles.fields}><label>字体<select value={figure.style.fontFamily} onChange={event => updateStyle({ fontFamily: event.target.value as ChartStyle['fontFamily'] })}><option value="sans">无衬线 · 黑体</option><option value="serif">衬线 · 宋体</option></select></label><div className={styles.twoColumns}>{numberControl('字号 / px', 'fontSize', 9, 24)}{numberControl('小数位数', 'decimals', 0, 6)}</div></div></details>
            <details className={styles.formatSection}><summary>{figure.kind === 'table' ? '表格线条' : '图例与线条'}</summary><div className={styles.fields}>{figure.kind === 'table' ? <label>表格格式<select value={figure.style.tableRules} onChange={event => updateStyle({ tableRules: event.target.value as ChartStyle['tableRules'] })}><option value="three_line">三线表</option><option value="grid">网格线</option><option value="minimal">简洁留白</option></select></label> : <><div className={styles.toggleGrid}>{(['showLegend', 'showLabels', 'showGrid', 'showBorder'] as const).map((key, index) => <label className={styles.check} key={key}><input type="checkbox" checked={figure.style[key]} onChange={event => updateStyle({ [key]: event.target.checked })}/>{['图例', '数据标签', '网格线', '边框'][index]}</label>)}</div><div className={styles.twoColumns}>{numberControl('线宽 / px', 'lineWidth', .5, 6, .5)}{numberControl('点径 / px', 'pointSize', 2, 16)}</div></>}</div></details>
            <details className={styles.formatSection}><summary>画布与导出 <span>{figure.style.width} × {figure.kind === 'table' ? '自适应' : figure.style.height}</span></summary><div className={styles.fields}><div className={styles.twoColumns}>{numberControl('宽度 / px', 'width', 480, 2400)}{numberControl('高度 / px', 'height', 320, 1800, 1, figure.kind === 'table')}</div>{figure.kind === 'table' && <p className={styles.fieldHelp}>表格高度随行数展开。</p>}<div className={styles.colorRow}><label>纸面<input aria-label="图表背景颜色" type="color" value={figure.style.background} onChange={event => updateStyle({ background: event.target.value })}/></label><label>文字<input aria-label="图表文字颜色" type="color" value={figure.style.ink} onChange={event => updateStyle({ ink: event.target.value })}/></label></div></div></details>
            <button type="button" className={styles.applyAll} onClick={applyAll}>将当前格式应用到所有模块 <span aria-hidden="true">↗</span></button>
          </>}
        </fieldset>
      </aside>
    </div>
  </section>;
}


