'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import { BENCHMARK_DIMENSIONS, benchmarkReport, type BenchmarkDimension, type BenchmarkFix } from '@/lib/report-benchmark';
import { BLUEPRINT_MODULE_LABELS, blueprintSections, type BlueprintModule } from '@/lib/report-blueprint';
import styles from './BenchmarkPanel.module.css';

type Props = {
  content: EditorContent;
  disabled?: boolean;
  onInsert: (nodeId: string) => void;
  onApplyBlueprint: (includeOptional: boolean) => void;
  /** Present only where the other workspace modules are reachable. */
  onNavigate?: (module: BlueprintModule) => void;
  onOpenFindings: () => void;
};

const PRIORITY = 6;
const level = (score: number) => score >= 0.85 ? 'strong' : score >= 0.6 ? 'fair' : 'weak';

/** Observable evidence completeness; optional writing references do not become score thresholds. */
export default function BenchmarkPanel({ content, disabled, onInsert, onApplyBlueprint, onNavigate, onOpenFindings }: Props) {
  const id = useId();
  const deferred = useDeferredValue(content);
  const result = useMemo(() => benchmarkReport(deferred), [deferred]);
  const [focus, setFocus] = useState<BenchmarkDimension | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [includeOptional, setIncludeOptional] = useState(false);
  const gaps = result.checks.filter(c => c.status === 'fail' || c.status === 'partial');
  // Missing items before thin ones; within each, the furthest from the line first.
  const ranked = [...gaps].sort((a, b) => a.status === b.status ? a.score - b.score : a.status === 'fail' ? -1 : 1);
  const listed = focus ? ranked.filter(c => c.dimension === focus) : showAll ? ranked : ranked.slice(0, PRIORITY);
  const applicable = result.checks.filter(c => c.status !== 'na');
  const passed = applicable.filter(c => c.status === 'pass').length;
  const replacement = useMemo(() => blueprintSections({ includeOptional }), [includeOptional]);
  const replacementIds = new Set(replacement.map(s => s.id));
  const orphaned = content.slides.filter(slide => slide.reportLink && !replacementIds.has(slide.reportLink.sectionId)).length;
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
            <span className={styles.tileScore}>{d.total ? Math.round(d.score * 100) : '—'}</span>
            <span className={styles.track} aria-hidden="true"><span data-level={level(d.score)} style={{ inlineSize: `${Math.max(2, Math.round(d.score * 100))}%` }}/></span>
            <span className={styles.tileMeta}>{open ? `${open} 项待补` : d.total ? '记录完整' : '按研究需要'}</span>
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
            <p>将当前 {content.report.length} 个章节替换为蓝图骨架（{replacement.length} 节）？PPT、LaTeX 与研究发现保留，替换后可撤销。
              {orphaned > 0 && <strong className={styles.warn}>有 {orphaned} 页 PPT 关联的章节不在骨架中，替换后会标记为“关联章节已移除”，导出前需重新选择依据。</strong>}</p>
            <label className={styles.check} htmlFor={id + '-optional'}><input id={id + '-optional'} type="checkbox" checked={includeOptional} onChange={event => setIncludeOptional(event.target.checked)}/>包含可选章节：网络文本、人群画像、方案优先级与可行性</label>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setConfirming(false)}>取消</button>
              <button type="button" className={styles.primary} disabled={disabled} onClick={() => { onApplyBlueprint(includeOptional); setConfirming(false); }}>替换为蓝图骨架</button>
            </div>
          </div>
          : <button type="button" className={styles.rebuild} disabled={disabled} onClick={() => setConfirming(true)}>按正大杯蓝图重建骨架</button>}
      </div>
    </div>
  </details>;
}
