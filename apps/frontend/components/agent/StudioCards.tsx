'use client';

import { useMemo, useState } from 'react';
import type { AgentAction } from '@/lib/agent/router';
import {
  auditWritingDraft,
  STUDIO_PALETTES,
  type ChartStudioCardData,
  type CodeStudioCardData,
  type CodeStudioLang,
  type StudioChartKind,
  type StudioPaletteId,
  type WritingStudioCardData,
} from '@/lib/agent/studios';
import styles from './AgentShell.module.css';

const xmlEsc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c);

function buildPureChartSvg(options: {
  title: string;
  subtitle: string;
  unit: string;
  primaryLabel: string;
  secondaryLabel?: string;
  kind: StudioChartKind;
  paletteId: StudioPaletteId;
  sourceLabel: string;
  annotation: string;
  points: Array<{ label: string; primary: number; secondary?: number; note?: string }>;
}): string {
  const pal = STUDIO_PALETTES[options.paletteId] ?? STUDIO_PALETTES['hanchao-pitch'];
  const W = 720;
  const H = 390;
  const padL = 68;
  const padR = 44;
  const padT = 74;
  const padB = 86;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const pts = options.points.length ? options.points : [{ label: '样本', primary: 1 }];
  const allVals = pts.flatMap(p => (p.secondary !== undefined ? [p.primary, p.secondary] : [p.primary]));
  const rawMax = Math.max(...allVals, 1);
  const yMax = rawMax <= 5 ? 5 : Math.ceil(rawMax * 1.15);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${xmlEsc(options.title)}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="${pal.surface}" stroke="${pal.grid}" stroke-width="1.5"/>`,
    `<text x="${padL}" y="30" font-family="serif" font-size="15.5" font-weight="700" fill="${pal.ink}">${xmlEsc(options.title)}</text>`,
    `<text x="${padL}" y="50" font-family="sans-serif" font-size="11.5" fill="${pal.ink}" fill-opacity="0.72">${xmlEsc(options.subtitle)}</text>`,
  ];

  // Legend
  lines.push(
    `<rect x="${W - 250}" y="18" width="10" height="10" rx="2" fill="${pal.primary}"/>`,
    `<text x="${W - 235}" y="27" font-family="sans-serif" font-size="11" fill="${pal.ink}">${xmlEsc(options.primaryLabel)}</text>`,
  );
  if (options.secondaryLabel) {
    lines.push(
      `<rect x="${W - 130}" y="18" width="10" height="10" rx="2" fill="${pal.secondary}"/>`,
      `<text x="${W - 115}" y="27" font-family="sans-serif" font-size="11" fill="${pal.ink}">${xmlEsc(options.secondaryLabel)}</text>`,
    );
  }

  // Horizontal grid
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = (yMax / ticks) * i;
    const y = Number((padT + plotH - (val / yMax) * plotH).toFixed(1));
    lines.push(
      `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${pal.grid}" stroke-width="1" stroke-dasharray="${i === 0 ? 'none' : '3 3'}"/>`,
      `<text x="${padL - 10}" y="${y + 4}" font-family="monospace" font-size="10.5" fill="${pal.ink}" fill-opacity="0.68" text-anchor="end">${val.toFixed(yMax <= 5 ? 1 : 0)}${xmlEsc(options.unit)}</text>`,
    );
  }

  const step = plotW / pts.length;
  const polyPrimary: string[] = [];
  const polySecondary: string[] = [];
  let cumSum = 0;
  const totalPrimary = pts.reduce((s, p) => s + p.primary, 0) || 1;

  pts.forEach((pt, idx) => {
    const cx = Number((padL + step * idx + step / 2).toFixed(1));
    const h1 = Number(((pt.primary / yMax) * plotH).toFixed(1));
    const y1 = Number((padT + plotH - h1).toFixed(1));
    const hasSec = pt.secondary !== undefined;
    const h2 = hasSec ? Number((((pt.secondary ?? 0) / yMax) * plotH).toFixed(1)) : 0;
    const y2 = Number((padT + plotH - h2).toFixed(1));

    if (options.kind === 'grouped' && hasSec) {
      const bw = Math.min(28, step * 0.32);
      lines.push(
        `<rect x="${(cx - bw - 2).toFixed(1)}" y="${y1}" width="${bw.toFixed(1)}" height="${h1}" rx="4" fill="${pal.primary}"/>`,
        `<text x="${(cx - bw / 2 - 2).toFixed(1)}" y="${y1 - 6}" font-family="monospace" font-size="10.5" font-weight="700" fill="${pal.primary}" text-anchor="middle">${pt.primary}</text>`,
        `<rect x="${(cx + 2).toFixed(1)}" y="${y2}" width="${bw.toFixed(1)}" height="${h2}" rx="4" fill="${pal.secondary}"/>`,
        `<text x="${(cx + bw / 2 + 2).toFixed(1)}" y="${y2 - 6}" font-family="monospace" font-size="10.5" font-weight="700" fill="${pal.secondary}" text-anchor="middle">${pt.secondary}</text>`,
      );
    } else if (options.kind === 'lollipop') {
      lines.push(
        `<line x1="${cx}" y1="${padT + plotH}" x2="${cx}" y2="${y1}" stroke="${pal.primary}" stroke-width="3"/>`,
        `<circle cx="${cx}" cy="${y1}" r="7" fill="${pal.primary}" stroke="${pal.surface}" stroke-width="2"/>`,
        `<text x="${cx}" y="${y1 - 11}" font-family="monospace" font-size="11" font-weight="700" fill="${pal.primary}" text-anchor="middle">${pt.primary}${xmlEsc(options.unit)}</text>`,
      );
      if (hasSec) {
        lines.push(
          `<circle cx="${cx + 12}" cy="${y2}" r="5.5" fill="${pal.secondary}" stroke="${pal.surface}" stroke-width="1.5"/>`,
        );
      }
    } else if (options.kind === 'line') {
      polyPrimary.push(`${cx},${y1}`);
      if (hasSec) polySecondary.push(`${cx},${y2}`);
    } else {
      // 'bar' or 'pareto'
      const bw = Math.min(44, step * 0.48);
      lines.push(
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y1}" width="${bw.toFixed(1)}" height="${h1}" rx="4" fill="${pal.primary}"/>`,
        `<text x="${cx}" y="${y1 - 6}" font-family="monospace" font-size="11" font-weight="700" fill="${pal.primary}" text-anchor="middle">${pt.primary}${xmlEsc(options.unit)}</text>`,
      );
      if (options.kind === 'pareto') {
        cumSum += pt.primary;
        const cumRatio = cumSum / totalPrimary;
        const cy = Number((padT + plotH - cumRatio * plotH).toFixed(1));
        polySecondary.push(`${cx},${cy}`);
      }
    }

    lines.push(
      `<text x="${cx}" y="${padT + plotH + 20}" font-family="sans-serif" font-size="11.5" font-weight="600" fill="${pal.ink}" text-anchor="middle">${xmlEsc(pt.label)}</text>`,
    );
    if (pt.note) {
      lines.push(
        `<text x="${cx}" y="${padT + plotH + 36}" font-family="sans-serif" font-size="9.5" fill="${pal.ink}" fill-opacity="0.62" text-anchor="middle">${xmlEsc(pt.note)}</text>`,
      );
    }
  });

  if (options.kind === 'line' && polyPrimary.length > 1) {
    lines.push(`<polyline fill="none" stroke="${pal.primary}" stroke-width="3" points="${polyPrimary.join(' ')}"/>`);
    polyPrimary.forEach((pair, idx) => {
      const [x, y] = pair.split(',');
      lines.push(
        `<circle cx="${x}" cy="${y}" r="5.5" fill="${pal.primary}" stroke="${pal.surface}" stroke-width="2"/>`,
        `<text x="${x}" y="${Number(y) - 10}" font-family="monospace" font-size="10.5" font-weight="700" fill="${pal.primary}" text-anchor="middle">${pts[idx].primary}</text>`,
      );
    });
    if (polySecondary.length > 1) {
      lines.push(
        `<polyline fill="none" stroke="${pal.secondary}" stroke-width="2.5" stroke-dasharray="5 3" points="${polySecondary.join(' ')}"/>`,
      );
    }
  }

  if (options.kind === 'pareto' && polySecondary.length > 1) {
    lines.push(`<polyline fill="none" stroke="${pal.accent}" stroke-width="2.5" points="${polySecondary.join(' ')}"/>`);
    polySecondary.forEach(pair => {
      const [x, y] = pair.split(',');
      lines.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${pal.accent}" stroke="${pal.surface}" stroke-width="1.5"/>`);
    });
  }

  // Annotation & Source Footer
  lines.push(
    `<rect x="${padL}" y="${H - 36}" width="${W - padL - padR}" height="24" rx="5" fill="${pal.primary}" fill-opacity="0.09"/>`,
    `<text x="${padL + 10}" y="${H - 20}" font-family="sans-serif" font-size="10.5" fill="${pal.ink}">★ 统计读数：${xmlEsc(options.annotation.slice(0, 56))}（来源：${xmlEsc(options.sourceLabel)}）</text>`,
    `</svg>`,
  );

  return lines.join('\n');
}

function triggerDownload(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ──────────────── 1. Chart Studio Card ──────────────── */

export function ChartStudioView({
  data,
  onAction,
}: {
  data: ChartStudioCardData;
  onAction: (action: AgentAction) => void;
}) {
  const [datasetId, setDatasetId] = useState(data.activeDatasetId);
  const activeSpec = useMemo(
    () => data.datasets.find(d => d.id === datasetId) ?? data.datasets[0],
    [data.datasets, datasetId],
  );
  const [kind, setKind] = useState<StudioChartKind>(activeSpec.defaultKind);
  const [paletteId, setPaletteId] = useState<StudioPaletteId>(activeSpec.defaultPalette);
  const [customTitle, setCustomTitle] = useState(activeSpec.title);
  const [customAnnotation, setCustomAnnotation] = useState(activeSpec.annotation);
  const [customPoints, setCustomPoints] = useState(activeSpec.points);
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [pushedMsg, setPushedMsg] = useState('');

  const handleSelectDataset = (id: string) => {
    setDatasetId(id);
    const next = data.datasets.find(d => d.id === id);
    if (next) {
      setKind(next.defaultKind);
      setPaletteId(next.defaultPalette);
      setCustomTitle(next.title);
      setCustomAnnotation(next.annotation);
      setCustomPoints(next.points);
      setPushedMsg('');
    }
  };

  const handlePointChange = (idx: number, field: 'label' | 'primary' | 'secondary' | 'note', val: string) => {
    setCustomPoints(prev =>
      prev.map((pt, i) => {
        if (i !== idx) return pt;
        if (field === 'primary') {
          const n = Number(val);
          return { ...pt, primary: Number.isFinite(n) ? n : 0 };
        }
        if (field === 'secondary') {
          if (val.trim() === '') return { ...pt, secondary: undefined };
          const n = Number(val);
          return { ...pt, secondary: Number.isFinite(n) ? n : 0 };
        }
        return { ...pt, [field]: val };
      }),
    );
  };

  const handleAddPoint = () => {
    setCustomPoints(prev => [
      ...prev,
      { label: `自定义维度 ${prev.length + 1}`, primary: 4.1, secondary: 3.8, note: '新增观测' },
    ]);
  };

  const handleRemovePoint = (idx: number) => {
    setCustomPoints(prev => (prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const svgMarkup = useMemo(
    () =>
      buildPureChartSvg({
        title: customTitle || activeSpec.title,
        subtitle: activeSpec.subtitle,
        unit: activeSpec.unit,
        primaryLabel: activeSpec.primaryLabel,
        secondaryLabel: activeSpec.secondaryLabel,
        kind,
        paletteId,
        sourceLabel: activeSpec.sourceLabel,
        annotation: customAnnotation || activeSpec.annotation,
        points: customPoints,
      }),
    [activeSpec, customAnnotation, customPoints, customTitle, kind, paletteId],
  );

  const handleInsertToReport = () => {
    const summaryLine = customPoints
      .map(p => `${p.label}为 ${p.primary}${activeSpec.unit}${p.secondary !== undefined ? `（对比组 ${p.secondary}${activeSpec.unit}）` : ''}`)
      .join('，');
    onAction({
      type: 'insertStudioBlock',
      node: activeSpec.targetNode,
      title: customTitle || activeSpec.title,
      paragraphs: [
        `${customTitle || activeSpec.title}`,
        `由制图工坊统计结果可知（${activeSpec.sourceLabel}）：${summaryLine}。核心诊断结论：${customAnnotation || activeSpec.annotation}`,
      ],
    });
    setPushedMsg('已将该图表标题与统计读数写入报告对应章节，可在右侧报告中查看。');
  };

  return (
    <div className={styles.studioWrap}>
      <div className={styles.studioToolbar}>
        <label className={styles.studioField}>
          <span>数据集 / 证据源</span>
          <select value={datasetId} onChange={e => handleSelectDataset(e.target.value)} className={styles.studioSelect}>
            {data.datasets.map(d => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.studioField}>
          <span>图表类型（5 选 1）</span>
          <select value={kind} onChange={e => setKind(e.target.value as StudioChartKind)} className={styles.studioSelect}>
            <option value="grouped">双轨分组对比图 (Grouped Bar)</option>
            <option value="bar">经典柱形对比图 (Column Bar)</option>
            <option value="lollipop">棒棒糖精确读数图 (Lollipop)</option>
            <option value="line">多维趋势折线图 (Profile Line)</option>
            <option value="pareto">帕累托累计贡献图 (Pareto Curve)</option>
          </select>
        </label>
        <label className={styles.studioField}>
          <span>国奖视觉透镜（4 选 1）</span>
          <select
            value={paletteId}
            onChange={e => setPaletteId(e.target.value as StudioPaletteId)}
            className={styles.studioSelect}
          >
            {Object.entries(STUDIO_PALETTES).map(([id, pal]) => (
              <option key={id} value={id}>
                {pal.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.studioInputsRow}>
        <label className={styles.studioFieldWide}>
          <span>一图一结论标题（可自由改写）</span>
          <input
            type="text"
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
            className={styles.studioInput}
          />
        </label>
        <label className={styles.studioFieldWide}>
          <span>图表尾注 / 统计解读锚点</span>
          <input
            type="text"
            value={customAnnotation}
            onChange={e => setCustomAnnotation(e.target.value)}
            className={styles.studioInput}
          />
        </label>
      </div>

      <div
        className={styles.studioSvgStage}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />

      {showDataEditor ? (
        <div className={styles.studioBanner}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className={styles.studioFactHeader}>数据点自由编辑器（实时重绘 SVG 矢量图）</span>
            <button type="button" className={styles.studioFactChip} onClick={handleAddPoint}>
              <strong>+ 新增数据行</strong>
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customPoints.map((pt, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1.2fr auto', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={pt.label}
                  onChange={e => handlePointChange(idx, 'label', e.target.value)}
                  className={styles.studioInput}
                  placeholder="维度/类别名称"
                />
                <input
                  type="number"
                  step="0.01"
                  value={pt.primary}
                  onChange={e => handlePointChange(idx, 'primary', e.target.value)}
                  className={styles.studioInput}
                  placeholder={activeSpec.primaryLabel}
                />
                <input
                  type="number"
                  step="0.01"
                  value={pt.secondary ?? ''}
                  onChange={e => handlePointChange(idx, 'secondary', e.target.value)}
                  className={styles.studioInput}
                  placeholder={activeSpec.secondaryLabel || '对比值(选填)'}
                />
                <input
                  type="text"
                  value={pt.note ?? ''}
                  onChange={e => handlePointChange(idx, 'note', e.target.value)}
                  className={styles.studioInput}
                  placeholder="象限/备注标签"
                />
                <button
                  type="button"
                  className={styles.studioSecondaryBtn}
                  onClick={() => handleRemovePoint(idx)}
                  disabled={customPoints.length <= 2}
                  title="删除该数据点"
                >
                  删
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.studioActions}>
        <button type="button" className={styles.studioPrimaryBtn} onClick={handleInsertToReport}>
          一键将图表与读数写入报告
        </button>
        <button
          type="button"
          className={styles.studioSecondaryBtn}
          onClick={() => setShowDataEditor(v => !v)}
        >
          {showDataEditor ? '收起数据点编辑器' : '自定义修改数据点数值'}
        </button>
        <button
          type="button"
          className={styles.studioSecondaryBtn}
          onClick={() => triggerDownload(`${activeSpec.id}-${kind}.svg`, svgMarkup, 'image/svg+xml;charset=utf-8')}
        >
          下载纯矢量 SVG 原图
        </button>
        {pushedMsg ? <span className={styles.studioStatusNote}>{pushedMsg}</span> : null}
      </div>
    </div>
  );
}

/* ──────────────── 2. Code Studio Card ──────────────── */

const LANG_EXT: Record<CodeStudioLang, string> = {
  python: 'py',
  r: 'R',
  spss: 'sps',
  latex: 'tex',
};

export function CodeStudioView({
  data,
  onAction,
}: {
  data: CodeStudioCardData;
  onAction: (action: AgentAction) => void;
}) {
  const [recipeId, setRecipeId] = useState(data.activeRecipeId);
  const [lang, setLang] = useState<CodeStudioLang>(data.activeLang);
  const activeRecipe = useMemo(
    () => data.recipes.find(r => r.id === recipeId) ?? data.recipes[0],
    [data.recipes, recipeId],
  );
  const [customCode, setCustomCode] = useState<string>(activeRecipe.snippets[lang]);
  const [statusMsg, setStatusMsg] = useState('');

  const handleSelectRecipe = (id: string) => {
    setRecipeId(id);
    const next = data.recipes.find(r => r.id === id);
    if (next) {
      setCustomCode(next.snippets[lang]);
      setStatusMsg('');
    }
  };

  const handleSelectLang = (nextLang: CodeStudioLang) => {
    setLang(nextLang);
    setCustomCode(activeRecipe.snippets[nextLang]);
    setStatusMsg('');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(customCode);
      setStatusMsg('已复制完整代码到剪贴板。');
    } catch {
      setStatusMsg('请直接选中文本框内容复制。');
    }
  };

  const handleInsertAppendix = () => {
    onAction({
      type: 'insertStudioBlock',
      node: activeRecipe.targetNode,
      title: activeRecipe.title,
      paragraphs: [
        `【可复现统计程序 · ${activeRecipe.title} (${lang.toUpperCase()})】${activeRecipe.summary}`,
        `方法论审计说明：${activeRecipe.auditUpgrade}`,
        customCode,
      ],
    });
    setStatusMsg('已将该统计复现脚本写入报告附录/对应章节。');
  };

  return (
    <div className={styles.studioWrap}>
      <div className={styles.studioToolbar}>
        <label className={styles.studioFieldWide}>
          <span>统计建模与制表处方（4 大国奖核心算法）</span>
          <select value={recipeId} onChange={e => handleSelectRecipe(e.target.value)} className={styles.studioSelect}>
            {data.recipes.map(r => (
              <option key={r.id} value={r.id}>
                {r.title} [{r.badge}]
              </option>
            ))}
          </select>
        </label>
        <div className={styles.studioLangTabs} role="tablist" aria-label="编程语言切换">
          {(['python', 'r', 'spss', 'latex'] as const).map(l => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              className={lang === l ? styles.studioLangTabActive : styles.studioLangTab}
              onClick={() => handleSelectLang(l)}
            >
              {l === 'python' ? 'Python' : l === 'r' ? 'R 语言' : l === 'spss' ? 'SPSS 语法' : 'LaTeX 三线表'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.studioAuditBanner}>
        <strong>国奖审计纠偏说明：</strong>
        {activeRecipe.auditUpgrade}
      </div>

      <textarea
        className={styles.studioCodeEditor}
        value={customCode}
        onChange={e => setCustomCode(e.target.value)}
        rows={13}
        spellCheck={false}
        aria-label="可编辑统计与排版代码"
      />

      <div className={styles.studioActions}>
        <button type="button" className={styles.studioPrimaryBtn} onClick={handleInsertAppendix}>
          一键写入报告代码附录
        </button>
        <button type="button" className={styles.studioSecondaryBtn} onClick={handleCopy}>
          复制代码
        </button>
        <button
          type="button"
          className={styles.studioSecondaryBtn}
          onClick={() => triggerDownload(`evix-${activeRecipe.id}.${LANG_EXT[lang]}`, customCode)}
        >
          下载 .{LANG_EXT[lang]} 源码文件
        </button>
        {statusMsg ? <span className={styles.studioStatusNote}>{statusMsg}</span> : null}
      </div>
    </div>
  );
}

/* ──────────────── 3. Writing Studio Card ──────────────── */

export function WritingStudioView({
  data,
  onAction,
}: {
  data: WritingStudioCardData;
  onAction: (action: AgentAction) => void;
}) {
  const [templateId, setTemplateId] = useState(data.activeTemplateId);
  const activeTpl = useMemo(
    () => data.templates.find(t => t.id === templateId) ?? data.templates[0],
    [data.templates, templateId],
  );
  const [draft, setDraft] = useState(activeTpl.defaultDraft);
  const [statusMsg, setStatusMsg] = useState('');

  const audit = useMemo(() => auditWritingDraft(draft), [draft]);

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
    const next = data.templates.find(t => t.id === id);
    if (next) {
      setDraft(next.defaultDraft);
      setStatusMsg('');
    }
  };

  const handleInjectFact = (token: string) => {
    setDraft(prev => `${prev.trim()}（实证锚点：${token}）。`);
    setStatusMsg('已将金源事实胶囊嵌入文稿末尾。');
  };

  const handleAdoptToReport = () => {
    const paragraphs = draft
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!paragraphs.length) return;
    onAction({
      type: 'insertStudioBlock',
      node: activeTpl.nodeId,
      title: activeTpl.nodeLabel,
      paragraphs,
    });
    setStatusMsg(`已将定稿写入报告「${activeTpl.nodeLabel}」章节，并在右侧打开报告。`);
  };

  return (
    <div className={styles.studioWrap}>
      <div className={styles.studioToolbar}>
        <label className={styles.studioFieldWide}>
          <span>国奖核心文体与答辩手卡模板（5 选 1）</span>
          <select value={templateId} onChange={e => handleSelectTemplate(e.target.value)} className={styles.studioSelect}>
            {data.templates.map(tpl => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title} [{tpl.stageBadge}]
              </option>
            ))}
          </select>
        </label>
        <div className={styles.studioScoreBadge}>
          <span>学术合规体检分</span>
          <strong>{audit.score} / 100</strong>
          <small>{audit.wordCount} 字 · {audit.factMentions} 处定量读数</small>
        </div>
      </div>

      <div className={styles.studioFactBar}>
        <span className={styles.studioFactTitle}>点击注入金源事实胶囊：</span>
        {data.facts.map(f => (
          <button
            key={f.id}
            type="button"
            className={styles.studioFactPill}
            title={`${f.token} — 来源：${f.origin}`}
            onClick={() => handleInjectFact(f.token)}
          >
            <strong>{f.id}</strong> {f.label} · <span>{f.value}</span>
          </button>
        ))}
      </div>

      <textarea
        className={styles.studioProseEditor}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={10}
        aria-label="国奖循证文稿编辑器"
      />

      <div className={styles.studioChecklistGrid}>
        {audit.checks.map(chk => (
          <div key={chk.id} className={chk.passed ? styles.studioCheckPass : styles.studioCheckWarn}>
            <strong>{chk.passed ? '✓' : '!'} {chk.label}</strong>
            <span>{chk.detail}</span>
          </div>
        ))}
      </div>

      <div className={styles.studioActions}>
        <button type="button" className={styles.studioPrimaryBtn} onClick={handleAdoptToReport}>
          一键采纳并写入报告「{activeTpl.nodeLabel}」
        </button>
        <button
          type="button"
          className={styles.studioSecondaryBtn}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(draft);
              setStatusMsg('已复制定稿文本到剪贴板。');
            } catch {
              setStatusMsg('请直接选中文本框内容复制。');
            }
          }}
        >
          复制润色定稿
        </button>
        {statusMsg ? <span className={styles.studioStatusNote}>{statusMsg}</span> : null}
      </div>
    </div>
  );
}
