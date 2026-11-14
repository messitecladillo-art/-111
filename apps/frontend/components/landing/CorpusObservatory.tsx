'use client';

import { useState } from 'react';
import {
  ARCHIVE_YEAR_DISTRIBUTION,
  CANONICAL_THREE_LINE_TABLES,
  CORPUS_RESERVE_SUMMARY,
  EMPIRICAL_MODEL_STATS,
  SECTION_RHETORICAL_BLUEPRINTS,
  TITLE_RHETORIC_PATTERNS,
  VISUAL_EXHIBIT_STATS,
  type VisualExhibitStat,
} from '@/data/zhengda-empirical-anatomy';
import {
  EDITION_17_OFFICIAL_GUIDE,
  TOPIC_THEMES_2027,
  TOPICS_2027_POOL,
} from '@/data/zhengda-corpus-2015-2027';
import styles from './CorpusObservatory.module.css';

type ObservatoryTab = 'models' | 'charts' | 'tables' | 'rhetoric' | 'tracks';

const TABS: ReadonlyArray<{ id: ObservatoryTab; label: string }> = [
  { id: 'models', label: '统计模型' },
  { id: 'charts', label: '图表范式' },
  { id: 'tables', label: '三线表' },
  { id: 'rhetoric', label: '修辞骨架' },
  { id: 'tracks', label: '历届与权重' },
];

const RHETORIC_BLUEPRINTS = Object.values(SECTION_RHETORICAL_BLUEPRINTS);
const RUBRIC_COLORS = ['#94a3b8', '#7fb6ff', '#f4b942', '#4fd1c1', '#c084fc', '#fb7185'] as const;

function ExhibitArtwork({ kind }: { kind: VisualExhibitStat['svgKind'] }) {
  switch (kind) {
    case 'action_loop':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <rect x="10" y="14" width="32" height="20" rx="5" fill="#132238" stroke="#f4b942" strokeWidth="1.4" />
          <rect x="54" y="14" width="32" height="20" rx="5" fill="#132238" stroke="#4fd1c1" strokeWidth="1.4" />
          <rect x="98" y="14" width="32" height="20" rx="5" fill="#132238" stroke="#7fb6ff" strokeWidth="1.4" />
          <path d="M42 24 H54 M86 24 H98" stroke="#f4b942" strokeWidth="1.5" />
          <rect x="34" y="50" width="72" height="20" rx="10" fill="rgba(79,209,193,0.12)" stroke="#4fd1c1" strokeDasharray="3 2" />
          <path d="M114 34 V60 H106 M26 34 V60 H34" stroke="#4fd1c1" strokeWidth="1.3" fill="none" />
          <circle cx="48" cy="24" r="2" fill="#f4b942" />
          <circle cx="92" cy="24" r="2" fill="#4fd1c1" />
        </svg>
      );
    case 'likert_diverging':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <line x1="70" y1="8" x2="70" y2="76" stroke="rgba(255,255,255,0.28)" strokeDasharray="3 2" />
          {[
            { y: 15, l: 26, r: 46, c: '#4fd1c1' },
            { y: 31, l: 38, r: 34, c: '#4fd1c1' },
            { y: 47, l: 16, r: 54, c: '#f4b942' },
            { y: 63, l: 48, r: 22, c: '#7fb6ff' },
          ].map(row => (
            <g key={row.y}>
              <rect x={70 - row.l} y={row.y} width={row.l} height="9" rx="3" fill="#fb7185" opacity="0.78" />
              <rect x="70" y={row.y} width={row.r} height="9" rx="3" fill={row.c} />
            </g>
          ))}
        </svg>
      );
    case 'wordcloud':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <path
            d="M70 10 C102 10 116 26 112 44 C108 64 88 74 70 74 C50 74 28 64 26 44 C24 24 40 10 70 10Z"
            fill="rgba(79,209,193,0.08)"
            stroke="rgba(79,209,193,0.5)"
            strokeDasharray="3 2"
          />
          <text x="70" y="45" fontSize="14" fontWeight="700" fill="#f4b942" textAnchor="middle">实证热点</text>
          <text x="48" y="28" fontSize="8" fill="#7fb6ff" textAnchor="middle">PPS</text>
          <text x="92" y="28" fontSize="8" fill="#4fd1c1" textAnchor="middle">SEM</text>
          <text x="50" y="61" fontSize="8.5" fill="#c084fc" textAnchor="middle">聚类</text>
          <text x="90" y="61" fontSize="8.5" fill="#cbd5e1" textAnchor="middle">复访</text>
        </svg>
      );
    case 'sem_forest':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <line x1="48" y1="10" x2="48" y2="74" stroke="rgba(255,255,255,0.28)" strokeDasharray="3 2" />
          {[
            { y: 20, x1: 62, x2: 112, cx: 87, c: '#f4b942' },
            { y: 38, x1: 72, x2: 122, cx: 97, c: '#4fd1c1' },
            { y: 56, x1: 38, x2: 78, cx: 58, c: '#7fb6ff' },
            { y: 70, x1: 54, x2: 96, cx: 75, c: '#c084fc' },
          ].map(item => (
            <g key={item.y}>
              <line x1={item.x1} y1={item.y} x2={item.x2} y2={item.y} stroke={item.c} strokeWidth="1.8" />
              <circle cx={item.cx} cy={item.y} r="4" fill={item.c} />
            </g>
          ))}
        </svg>
      );
    case 'tech_roadmap':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <rect x="34" y="8" width="72" height="14" rx="4" fill="#132238" stroke="#f4b942" />
          <rect x="34" y="34" width="72" height="14" rx="4" fill="#132238" stroke="#4fd1c1" />
          <rect x="34" y="60" width="72" height="14" rx="4" fill="#132238" stroke="#7fb6ff" />
          <path d="M70 22 V34 M70 48 V60" stroke="#94a3b8" strokeWidth="1.5" />
          <path d="M106 67 H118 V15 H106" stroke="#f4b942" strokeWidth="1.3" strokeDasharray="3 2" fill="none" />
        </svg>
      );
    case 'sampling_flow':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <polygon points="18,12 122,12 106,28 34,28" fill="#132238" stroke="#f4b942" strokeWidth="1.2" />
          <polygon points="34,34 106,34 94,50 46,50" fill="#132238" stroke="#4fd1c1" strokeWidth="1.2" />
          <polygon points="46,56 94,56 84,72 56,72" fill="rgba(127,182,255,0.16)" stroke="#7fb6ff" strokeWidth="1.2" />
        </svg>
      );
    case 'heatmap_scree':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          {[0, 1, 2, 3].map(r =>
            [0, 1, 2, 3].map(c =>
              r >= c ? (
                <rect
                  key={`${r}-${c}`}
                  x={34 + c * 19}
                  y={11 + r * 16}
                  width="15"
                  height="13"
                  rx="3"
                  fill={r === c ? '#f4b942' : (r + c) % 2 === 0 ? '#4fd1c1' : '#7fb6ff'}
                  opacity={r === c ? 0.95 : 0.4 + c * 0.16}
                />
              ) : null,
            ),
          )}
        </svg>
      );
    case 'radar_boxplot':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <polygon points="70,10 106,32 92,72 48,72 34,32" fill="none" stroke="rgba(255,255,255,0.16)" />
          <polygon points="70,20 94,35 84,62 56,62 46,35" fill="rgba(79,209,193,0.22)" stroke="#4fd1c1" strokeWidth="1.6" />
          <polygon points="70,14 100,40 76,68 42,56 40,28" fill="rgba(244,185,66,0.18)" stroke="#f4b942" strokeWidth="1.5" />
        </svg>
      );
    case 'donut_pareto':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <circle cx="70" cy="42" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
          <circle cx="70" cy="42" r="28" fill="none" stroke="#f4b942" strokeWidth="9" strokeDasharray="76 120" transform="rotate(-90 70 42)" />
          <circle cx="70" cy="42" r="28" fill="none" stroke="#4fd1c1" strokeWidth="9" strokeDasharray="48 120" strokeDashoffset="-76" transform="rotate(-90 70 42)" />
          <circle cx="70" cy="42" r="14" fill="none" stroke="#7fb6ff" strokeWidth="4.5" strokeDasharray="52 50" />
        </svg>
      );
    case 'ipa_quadrant':
      return (
        <svg viewBox="0 0 140 84" width="100%" height="100%" aria-hidden="true">
          <rect x="26" y="10" width="88" height="64" rx="5" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.16)" />
          <rect x="26" y="10" width="44" height="32" fill="rgba(251,113,133,0.14)" />
          <line x1="70" y1="10" x2="70" y2="74" stroke="rgba(255,255,255,0.28)" strokeDasharray="3 2" />
          <line x1="26" y1="42" x2="114" y2="42" stroke="rgba(255,255,255,0.28)" strokeDasharray="3 2" />
          <circle cx="44" cy="24" r="4.5" fill="#fb7185" />
          <circle cx="56" cy="31" r="3.5" fill="#f4b942" />
          <circle cx="92" cy="22" r="4.5" fill="#4fd1c1" />
          <circle cx="96" cy="58" r="3.5" fill="#7fb6ff" />
        </svg>
      );
  }
}

export default function CorpusObservatory({
  compact = false,
  onInjectSteering,
}: {
  compact?: boolean;
  onInjectSteering?: (directive: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<ObservatoryTab>('models');
  const [selectedModelId, setSelectedModelId] = useState(EMPIRICAL_MODEL_STATS[0].id);
  const [selectedChartId, setSelectedChartId] = useState(VISUAL_EXHIBIT_STATS[0].id);
  const [selectedTableId, setSelectedTableId] = useState(CANONICAL_THREE_LINE_TABLES[0].id);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedGroup, setSelectedGroup] = useState<string>(RHETORIC_BLUEPRINTS[0].chapterGroup);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(RHETORIC_BLUEPRINTS[0].nodeId);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedModel = EMPIRICAL_MODEL_STATS.find(m => m.id === selectedModelId) ?? EMPIRICAL_MODEL_STATS[0];
  const selectedChart = VISUAL_EXHIBIT_STATS.find(c => c.id === selectedChartId) ?? VISUAL_EXHIBIT_STATS[0];
  const selectedTable = CANONICAL_THREE_LINE_TABLES.find(t => t.id === selectedTableId) ?? CANONICAL_THREE_LINE_TABLES[0];
  const activeYearObj = ARCHIVE_YEAR_DISTRIBUTION.find(y => y.year === selectedYear) ?? ARCHIVE_YEAR_DISTRIBUTION.at(-1)!;
  const chapterGroups = Array.from(new Set(RHETORIC_BLUEPRINTS.map(r => r.chapterGroup)));
  const nodesInGroup = RHETORIC_BLUEPRINTS.filter(r => r.chapterGroup === selectedGroup);
  const activeBlueprint = nodesInGroup.find(n => n.nodeId === selectedNodeId) ?? nodesInGroup[0] ?? RHETORIC_BLUEPRINTS[0];

  const handleGroupChange = (group: string) => {
    setSelectedGroup(group);
    const first = RHETORIC_BLUEPRINTS.find(r => r.chapterGroup === group);
    if (first) setSelectedNodeId(first.nodeId);
  };

  const triggerAction = (id: string, text: string) => {
    if (onInjectSteering) {
      onInjectSteering(text);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1600);
  };

  // Radial arc math for Model Gauge
  const gaugeCirc = 2 * Math.PI * 36;
  const gaugeOffset = gaugeCirc * (1 - selectedModel.ratePct / 100);

  // Trend polyline points for 2014–2025 SVG chart
  const maxY = Math.max(...ARCHIVE_YEAR_DISTRIBUTION.map(d => d.count));
  const trendCoords = ARCHIVE_YEAR_DISTRIBUTION.map((d, i) => {
    const x = 22 + i * 38;
    const y = 104 - Math.round((d.count / maxY) * 82);
    return { ...d, x, y };
  });
  const polylinePts = trendCoords.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${trendCoords[0].x},108 L${trendCoords.map(p => `${p.x},${p.y}`).join(' L')} L${trendCoords.at(-1)!.x},108 Z`;

  return (
    <div className={`${styles.observatory} ${compact ? styles.compact : ''}`} data-testid="corpus-observatory">
      {/* Header + Minimal Segmented Pill Tabs */}
      <div className={styles.topBar}>
        <div>
          <p className={styles.kicker}>CORPUS ATLAS · N={CORPUS_RESERVE_SUMMARY.totalReports}</p>
          <h2 id="corpus-title" className={styles.title}>正大杯实证语料与范式图谱</h2>
        </div>

        <div className={styles.segmented} role="tablist" aria-label="正大杯实证统计图谱视图">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.segBtn} ${activeTab === tab.id ? styles.segBtnActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Big Minimalist Metrics */}
      <div className={styles.heroMetrics} aria-label="语料规模概览">
        <div className={styles.metricCell}>
          <span className={styles.metricNum}>{CORPUS_RESERVE_SUMMARY.totalReports}</span>
          <span className={styles.metricName}>国奖档案</span>
          <span className={styles.metricSub}>国一 {CORPUS_RESERVE_SUMMARY.nationalFirstCount} · 命题 {CORPUS_RESERVE_SUMMARY.cpPropositionCount}</span>
        </div>
        <div className={styles.metricCell}>
          <span className={styles.metricNum}>{CORPUS_RESERVE_SUMMARY.totalPages.toLocaleString()}</span>
          <span className={styles.metricName}>解析页数</span>
          <span className={styles.metricSub}>均值 {CORPUS_RESERVE_SUMMARY.avgPages} 页/篇</span>
        </div>
        <div className={styles.metricCell}>
          <span className={styles.metricNum}>{CORPUS_RESERVE_SUMMARY.surveyFiles}</span>
          <span className={styles.metricName}>{CORPUS_RESERVE_SUMMARY.surveyCategories} 类问卷</span>
          <span className={styles.metricSub}>12 模型 · 10 图 · 8 表</span>
        </div>
        <div className={styles.metricCell}>
          <span className={styles.metricNum}>{CORPUS_RESERVE_SUMMARY.topics2027}</span>
          <span className={styles.metricName}>2027 选题</span>
          <span className={styles.metricSub}>26 节论证已内化</span>
        </div>
      </div>

      {/* TAB 1: Models Spectrum + Radial Gauge */}
      {activeTab === 'models' && (
        <div className={styles.splitGrid} role="tabpanel" aria-label="统计模型">
          <div className={styles.glassCard}>
            <span className={styles.cardLabel}>检出率光谱 · n={CORPUS_RESERVE_SUMMARY.deepSampledDocs}</span>
            <div className={styles.spectrumList}>
              {EMPIRICAL_MODEL_STATS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.spectrumRow} ${m.id === selectedModel.id ? styles.spectrumRowActive : ''}`}
                  aria-pressed={m.id === selectedModel.id}
                  onClick={() => setSelectedModelId(m.id)}
                >
                  <span className={styles.spectrumName}>{m.shortName}</span>
                  <span className={styles.spectrumTrack}>
                    <span className={styles.spectrumFill} style={{ width: `${Math.max(8, m.ratePct)}%` }} />
                  </span>
                  <span className={styles.spectrumVal}>{m.ratePct}%</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.glassCard} style={{ alignContent: 'space-between' }}>
            <div className={styles.gaugeWrap}>
              <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
                <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                <circle
                  cx="44"
                  cy="44"
                  r="36"
                  fill="none"
                  stroke="#f4b942"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={gaugeCirc}
                  strokeDashoffset={gaugeOffset}
                  transform="rotate(-90 44 44)"
                />
                <text x="44" y="48" textAnchor="middle" fontSize="14" fontWeight="700" fill="#f7f4ed">
                  {selectedModel.ratePct}%
                </text>
              </svg>
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <strong style={{ fontSize: 15 }}>{selectedModel.shortName}</strong>
                <div className={styles.pillRow}>
                  <span className={`${styles.miniPill} ${styles.goldPill}`}>{selectedModel.tier}</span>
                  <span className={styles.miniPill}>{selectedModel.eraTrend}</span>
                  <span className={styles.miniPill}>{selectedModel.sampleHits}/{selectedModel.sampleTotal} 篇</span>
                </div>
              </div>
            </div>

            <div className={styles.pillRow}>
              {selectedModel.pairedWith.split('+').map(part => (
                <span key={part} className={styles.miniPill} style={{ color: 'var(--obs-ivory)', borderColor: 'var(--obs-border)' }}>
                  {part.trim()}
                </span>
              ))}
            </div>

            <div className={styles.quoteLine}>{selectedModel.reportSentenceFormula}</div>

            <div>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => triggerAction(selectedModel.id, `[${selectedModel.shortName}] 要求：${selectedModel.pairedWith}`)}
              >
                {copiedId === selectedModel.id
                  ? onInjectSteering ? '✓ 已注入写作队列' : '✓ 已复制模型规范'
                  : onInjectSteering ? '+ 注入模型规范' : '复制规范'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Visual Charts Bento Grid */}
      {activeTab === 'charts' && (
        <div style={{ display: 'grid', gap: 12 }} role="tabpanel" aria-label="图表范式">
          <div className={styles.bentoGrid}>
            {VISUAL_EXHIBIT_STATS.map(ex => {
              const active = ex.id === selectedChart.id;
              return (
                <button
                  key={ex.id}
                  type="button"
                  className={`${styles.bentoCard} ${active ? styles.bentoCardActive : ''}`}
                  aria-pressed={active}
                  onClick={() => setSelectedChartId(ex.id)}
                >
                  <div className={styles.svgCanvas}>
                    <ExhibitArtwork kind={ex.svgKind} />
                  </div>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div className={styles.bentoMeta}>
                      <span className={styles.bentoTitle}>{ex.name.split('—')[0].split('/')[0].slice(0, 10)}</span>
                      <span className={styles.bentoPct}>{ex.ratePct}%</span>
                    </div>
                    <span className={styles.bentoSub}>{ex.targetSectionLabel.split(' ')[0]}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className={styles.insightStrip}>
            <span>
              <strong style={{ color: 'var(--obs-gold)' }}>{selectedChart.name}</strong> · {selectedChart.upgradeTip}
            </span>
            <span className={styles.miniPill}>{selectedChart.targetNode}</span>
          </div>
        </div>
      )}

      {/* TAB 3: Minimalist Three-Line Tables */}
      {activeTab === 'tables' && (
        <div style={{ display: 'grid', gap: 12 }} role="tabpanel" aria-label="三线表">
          <div className={styles.chipBar}>
            {CANONICAL_THREE_LINE_TABLES.map(t => (
              <button
                key={t.id}
                type="button"
                className={`${styles.chipBtn} ${t.id === selectedTable.id ? styles.chipBtnActive : ''}`}
                onClick={() => setSelectedTableId(t.id)}
              >
                {t.title.split(' ')[1]} · {t.ratePct}%
              </button>
            ))}
          </div>

          <div className={styles.tableStage}>
            <p className={styles.tableHeading}>{selectedTable.title}</p>
            <table className={styles.academicTable}>
              <thead>
                <tr>
                  {selectedTable.headers.map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedTable.sampleRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.insightStrip}>
            <div className={styles.pillRow}>
              {selectedTable.mandatoryStats.map(s => (
                <span key={s} className={styles.miniPill}>
                  {s}
                </span>
              ))}
            </div>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() =>
                triggerAction(selectedTable.id, `[三线表核查] ${selectedTable.title} 须含：${selectedTable.mandatoryStats.join('、')}`)
              }
            >
              {copiedId === selectedTable.id ? '✓ 已完成' : onInjectSteering ? '+ 注入核查' : '复制指标'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Title Formulas + 3-Step Blueprint Flow */}
      {activeTab === 'rhetoric' && (
        <div style={{ display: 'grid', gap: 14 }} role="tabpanel" aria-label="修辞骨架">
          <div className={styles.formulaGrid}>
            {TITLE_RHETORIC_PATTERNS.map(pat => (
              <div key={pat.id} className={styles.formulaCard}>
                <span className={styles.formulaPct}>{pat.sharePct}%</span>
                <strong style={{ fontSize: 12.5 }}>{pat.formulaName.split(' + ')[0]}</strong>
                <span style={{ fontSize: 11, color: 'var(--obs-muted)' }}>{pat.countIn204} 篇 · {pat.bestForTracks.split('、')[0]}</span>
              </div>
            ))}
          </div>

          <div className={styles.glassCard}>
            <div className={styles.chipBar}>
              {chapterGroups.map(g => (
                <button
                  key={g}
                  type="button"
                  className={`${styles.chipBtn} ${selectedGroup === g ? styles.chipBtnActive : ''}`}
                  onClick={() => handleGroupChange(g)}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className={styles.chipBar}>
              {nodesInGroup.map(n => (
                <button
                  key={n.nodeId}
                  type="button"
                  className={`${styles.chipBtn} ${activeBlueprint.nodeId === n.nodeId ? styles.chipBtnActive : ''}`}
                  onClick={() => setSelectedNodeId(n.nodeId)}
                >
                  {n.sectionName}
                </button>
              ))}
            </div>

            <div className={styles.stepFlow}>
              <div className={styles.stepNode}>
                <span className={styles.stepBadge}>01 · 推进脉络</span>
                <span style={{ fontSize: 12, color: 'var(--obs-ivory)' }}>{activeBlueprint.structuralArc}</span>
              </div>
              <div className={styles.stepNode}>
                <span className={styles.stepBadge}>02 · 开篇起笔</span>
                <span style={{ fontSize: 12, color: 'var(--obs-mist)' }}>{activeBlueprint.openingMove}</span>
              </div>
              <div className={styles.stepNode}>
                <span className={styles.stepBadge}>03 · 评委关口</span>
                <span style={{ fontSize: 12, color: 'var(--obs-gold)' }}>{activeBlueprint.judgeCheckpoint}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span className={styles.cardLabel}>{activeBlueprint.nodeId} · 已内置 Prompt</span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => triggerAction(activeBlueprint.nodeId, `[${activeBlueprint.sectionName}] ${activeBlueprint.recommendedNotes}`)}
              >
                {copiedId === activeBlueprint.nodeId ? '✓ 已完成' : onInjectSteering ? '+ 注入本节范式' : '复制本节范式'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Smooth Area Trend + 100pt Donut Chart */}
      {activeTab === 'tracks' && (
        <div className={styles.splitGrid} role="tabpanel" aria-label="历届与权重">
          <div className={styles.glassCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.cardLabel}>2014–2025 样本演进</span>
              <span className={styles.miniPill}>{activeYearObj.year} · {activeYearObj.count} 篇 · {activeYearObj.eraTag}</span>
            </div>
            <svg viewBox="0 0 462 132" width="100%" height="132" role="img" aria-label="2014到2025历届国奖数量趋势图">
              <defs>
                <linearGradient id="evx-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4fd1c1" stopOpacity="0.38" />
                  <stop offset="100%" stopColor="#4fd1c1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#evx-area-grad)" />
              <polyline fill="none" stroke="#4fd1c1" strokeWidth="2.2" strokeLinejoin="round" points={polylinePts} />
              {trendCoords.map(pt => {
                const isSel = pt.year === selectedYear;
                return (
                  <g key={pt.year} style={{ cursor: 'pointer' }} onClick={() => setSelectedYear(pt.year)}>
                    <circle cx={pt.x} cy={pt.y} r={isSel ? 5.5 : 3.5} fill={isSel ? '#f4b942' : '#4fd1c1'} />
                    <text x={pt.x} y={pt.y - 9} fontSize="9.5" fill={isSel ? '#f4b942' : '#94a3b8'} textAnchor="middle">
                      {pt.count}
                    </text>
                    <text x={pt.x} y="124" fontSize="9.5" fill={isSel ? '#f4b942' : '#6c7c8d'} textAnchor="middle">
                      {String(pt.year).slice(2)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className={styles.glassCard}>
            <span className={styles.cardLabel}>第十七届 100 分评审配比</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                {(() => {
                  const r = 38;
                  const c = 2 * Math.PI * r;
                  let offset = 0;
                  return EDITION_17_OFFICIAL_GUIDE.reportScoringWeights.map((w, idx) => {
                    const seg = (w.points / 100) * c;
                    const dash = `${seg - 2} ${c}`;
                    const curOffset = offset;
                    offset += seg;
                    return (
                      <circle
                        key={w.id}
                        cx="52"
                        cy="52"
                        r={r}
                        fill="none"
                        stroke={RUBRIC_COLORS[idx % RUBRIC_COLORS.length]}
                        strokeWidth="12"
                        strokeDasharray={dash}
                        strokeDashoffset={-curOffset}
                        transform="rotate(-90 52 52)"
                      />
                    );
                  });
                })()}
                <text x="52" y="55" textAnchor="middle" fontSize="14" fontWeight="700" fill="#f7f4ed">100 PT</text>
              </svg>

              <div style={{ display: 'grid', gap: 5, flex: '1 1 160px' }}>
                {EDITION_17_OFFICIAL_GUIDE.reportScoringWeights.map((w, idx) => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--obs-mist)' }}>
                      <i style={{ width: 8, height: 8, borderRadius: 99, background: RUBRIC_COLORS[idx % RUBRIC_COLORS.length], display: 'inline-block' }} />
                      {w.item.replace(/^[一二三四五六]、/, '')}
                    </span>
                    <strong style={{ fontFamily: 'var(--obs-mono)', color: 'var(--obs-ivory)' }}>{w.points}%</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.pillRow}>
              {TOPIC_THEMES_2027.map(theme => (
                <span key={theme} className={styles.miniPill}>
                  {theme.split(' · ')[0]} ({TOPICS_2027_POOL.filter(t => t.theme === theme).length})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
