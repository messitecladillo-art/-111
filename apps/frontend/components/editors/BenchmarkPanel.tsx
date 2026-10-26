'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import { BENCHMARK_DIMENSIONS, benchmarkReport, type BenchmarkDimension, type BenchmarkFix } from '@/lib/report-benchmark';
import { BLUEPRINT_MODULE_LABELS, blueprintSections, DEFAULT_REPORT_TYPE, LEGACY_SECTION_IDS, REPORT_TYPES, reportType, type BlueprintModule } from '@/lib/report-blueprint';
import styles from './BenchmarkPanel.module.css';

type Props = {
  content: EditorContent;
  disabled?: boolean;
  onInsert: (nodeId: string) => void;
  /** Rebuilds the outline from the frame plus the chosen analysis modules. */
  onApplyBlueprint: (nodes: readonly string[]) => void;
  /** Present only where the other workspace modules are reachable. */
  onNavigate?: (module: BlueprintModule) => void;
  onOpenFindings: () => void;
};

const PRIORITY = 6;
const level = (score: number | null) => score === null ? 'na' : score >= 0.85 ? 'strong' : score >= 0.6 ? 'fair' : 'weak';

/** Observable evidence completeness; optional writing references do not become score thresholds. */
export default function BenchmarkPanel({ content, disabled, onInsert, onApplyBlueprint, onNavigate, onOpenFindings }: Props) {
  const id = useId();
  const deferred = useDeferredValue(content);
  const result = useMemo(() => benchmarkReport(deferred), [deferred]);
  const [focus, setFocus] = useState<BenchmarkDimension | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typeId, setTypeId] = useState(DEFAULT_REPORT_TYPE);
  const gaps = result.checks.filter(c => c.status === 'fail' || c.status === 'partial');
  // Missing items before thin ones; within each, the furthest from the line first.
  const ranked = [...gaps].sort((a, b) => a.status === b.status ? a.score - b.score : a.status === 'fail' ? -1 : 1);
  const listed = focus ? ranked.filter(c => c.dimension === focus) : showAll ? ranked : ranked.slice(0, PRIORITY);
  const applicable = result.checks.filter(c => c.status !== 'na');
  const passed = applicable.filter(c => c.status === 'pass').length;
  const replacement = useMemo(() => blueprintSections({ nodes: reportType(typeId).nodes }), [typeId]);
  const replacementIds = new Set(replacement.map(s => s.id));
  const orphaned = content.slides.filter(slide => slide.reportLink && !replacementIds.has(LEGACY_SECTION_IDS[slide.reportLink.sectionId] ?? slide.reportLink.sectionId)).length;
  const act = (fix: BenchmarkFix) => {
    if (fix.insert) onInsert(fix.insert);
    else if (fix.module) onNavigate?.(fix.module);
    else if (fix.findings) onOpenFindings();
  };

  return <details className={styles.panel}>
    <summary className={styles.summary}>
      <span className={styles.title}>证据完整度</span>
      <span className={styles.score} data-level={level(result.score / 100)}><b>{result.score}</b>%</span>
      <span className={styles.meta}>{passed} / {applicable.length} 项完成<span aria-hidden="true"> · </span>{gaps.length} 项待补</span>
    </summary>
    <div className={styles.content}>
      <div className={styles.tiles} role="group" aria-label="按维度查看待补项">
        {result.dimensions.map(d => {
          const open = gaps.filter(c => c.dimension === d.id).length;
          return <button key={d.id} type="button" className={styles.tile} data-level={level(d.score)} aria-pressed={focus === d.id} onClick={() => { setFocus(focus === d.id ? null : d.id); setShowAll(false); }}>
            <span className={styles.tileLabel}>{d.label}</span>
            <span className={styles.tileScore}>{d.score === null ? '—' : Math.round(d.score * 100)}</span>
            <span className={styles.track} aria-hidden="true"><span data-level={level(d.score)} style={{ inlineSize: `${d.score === null ? 0 : Math.max(2, Math.round(d.score * 100))}%` }}/></span>
            <span className={styles.tileMeta}>{d.score === null ? '尚不适用' : open ? `${open} 项待补` : '已记录完整'}</span>
          </button>;
        })}
      </div>
      <div className={styles.listHead}>
        <h4>{focus ? `${BENCHMARK_DIMENSIONS[focus]}的待补项` : showAll ? `全部待补项 · ${gaps.length}` : '优先处理'}</h4>
        {focus
          ? <button type="button" className={styles.link} onClick={() => setFocus(null)}>返回优先项</button>
          : gaps.length > PRIORITY && <button type="button" className={styles.link} onClick={() => setShowAll(!showAll)}>{showAll ? '只看优先项' : `查看全部 ${gaps.length} 项`}</button>}
      </div>
      {listed.length ? <ul className={styles.gaps} aria-label="待补项">
        {listed.map(check => {
          const fixes = check.fixes.filter(f => !f.module || onNavigate);
          const offline = check.fixes.filter(f => f.module && !onNavigate);
          return <li key={check.id} data-status={check.status}>
            <span className={styles.dot} aria-hidden="true"/>
            <div className={styles.text}>
              <strong>{check.label}{!focus && <span className={styles.dimension}>{BENCHMARK_DIMENSIONS[check.dimension]}</span>}</strong>
              <p>{check.detail}</p>
            </div>
            {(fixes.length > 0 || offline.length > 0) && <div className={styles.actions}>
              {fixes.map(fix => <button key={fix.label} type="button" disabled={disabled && !fix.module} onClick={() => act(fix)}>{fix.label}</button>)}
              {offline.map(fix => <span key={fix.label} className={styles.hint}>在「{BLUEPRINT_MODULE_LABELS[fix.module!]}」完成</span>)}
            </div>}
          </li>;
        })}
      </ul> : <p className={styles.done}>{focus ? '这一维度的适用记录已完整。' : '当前适用记录已完整。'}</p>}
      <div className={styles.footer}>
        <p className={styles.note}>按已使用的证据检查数据版本、计算口径、发现确认与成果引用。章节、图表和方法由研究需要决定。</p>
        {confirming
          ? <div className={styles.confirm} role="region" aria-label="重建骨架确认">
            <p>选择与研究问题相符的报告类型，将当前 {content.report.length} 个章节替换为对应骨架（{replacement.length} 节）？PPT、LaTeX 与研究发现保留，替换后可撤销；之后仍可从体检或写作指引中增删分析模块。
              {orphaned > 0 && <strong className={styles.warn}>有 {orphaned} 页 PPT 关联的章节不在骨架中，替换后会标记为“关联章节已移除”，导出前需重新选择依据。</strong>}</p>
            <fieldset className={styles.types}><legend>报告类型</legend>{REPORT_TYPES.map(type => <label key={type.id} htmlFor={`${id}-${type.id}`}><input id={`${id}-${type.id}`} type="radio" name={`${id}-type`} checked={typeId === type.id} onChange={() => setTypeId(type.id)}/><span><b>{type.label}</b><small>{type.summary}</small></span></label>)}</fieldset>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setConfirming(false)}>取消</button>
              <button type="button" className={styles.primary} disabled={disabled} onClick={() => { onApplyBlueprint(reportType(typeId).nodes); setConfirming(false); }}>替换为「{reportType(typeId).label}」骨架</button>
            </div>
          </div>
          : <button type="button" className={styles.rebuild} disabled={disabled} onClick={() => setConfirming(true)}>按研究类型重建骨架</button>}
      </div>
    </div>
  </details>;
}
