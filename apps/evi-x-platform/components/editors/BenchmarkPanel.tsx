'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import { BENCHMARK_DIMENSIONS, benchmarkReport, type BenchmarkFix } from '@/lib/report-benchmark';
import { BLUEPRINT, BLUEPRINT_MODULE_LABELS, type BlueprintModule } from '@/lib/report-blueprint';
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

const level = (score: number) => score >= 0.85 ? 'strong' : score >= 0.6 ? 'fair' : 'weak';

/** Rule-based comparison with the competition blueprint; every gap links to the place that fills it. */
export default function BenchmarkPanel({ content, disabled, onInsert, onApplyBlueprint, onNavigate, onOpenFindings }: Props) {
  const id = useId();
  const deferred = useDeferredValue(content);
  const result = useMemo(() => benchmarkReport(deferred), [deferred]);
  const [confirming, setConfirming] = useState(false);
  const [includeOptional, setIncludeOptional] = useState(false);
  const gaps = result.checks.filter(c => c.status === 'fail' || c.status === 'partial');
  const applicable = result.checks.filter(c => c.status !== 'na');
  const passed = applicable.filter(c => c.status === 'pass').length;
  const skeletonSize = BLUEPRINT.filter(node => includeOptional || !node.optional).length;
  const linkedSlides = content.slides.filter(slide => slide.reportLink && content.report.some(s => s.id === slide.reportLink!.sectionId)).length;
  const act = (fix: BenchmarkFix) => {
    if (fix.insert) onInsert(fix.insert);
    else if (fix.module) onNavigate?.(fix.module);
    else if (fix.findings) onOpenFindings();
  };

  return <details className={styles.panel}>
    <summary className={styles.summary}>
      <span>对标体检</span>
      <span className={styles.score} data-level={level(result.score / 100)}><b>{result.score}</b>分</span>
      <span className={styles.meta}>{passed} / {applicable.length} 项达标 · {gaps.length} 项待补</span>
    </summary>
    <div className={styles.content}>
      <ol className={styles.dimensions} aria-label="各维度得分">
        {result.dimensions.map(d => <li key={d.id}>
          <span className={styles.label}>{d.label}</span>
          <span className={styles.track} aria-hidden="true"><span data-level={level(d.score)} style={{ inlineSize: `${Math.round(d.score * 100)}%` }}/></span>
          <span className={styles.value}>{Math.round(d.score * 100)}</span>
        </li>)}
      </ol>
      {gaps.length ? <ul className={styles.gaps} aria-label="待补项">
        {gaps.map(check => {
          const fixes = check.fixes.filter(f => !f.module || onNavigate);
          const offline = check.fixes.filter(f => f.module && !onNavigate);
          return <li key={check.id} data-status={check.status}>
            <div className={styles.name}><strong>{check.label}</strong><span>{BENCHMARK_DIMENSIONS[check.dimension]}</span></div>
            <p>{check.detail}</p>
            <div className={styles.actions}>
              {fixes.map(fix => <button key={fix.label} type="button" disabled={disabled && !fix.module} onClick={() => act(fix)}>{fix.label}</button>)}
              {offline.map(fix => <span key={fix.label} className={styles.hint}>在「{BLUEPRINT_MODULE_LABELS[fix.module!]}」模块完成</span>)}
            </div>
          </li>;
        })}
      </ul> : <p className={styles.done}>全部检查项均已达标。</p>}
      <div className={styles.footer}>
        <p className={styles.note}>体检按固定规则检查结构与证据的呈现，不评判研究结论本身是否正确。满分线约为一份评审认可的优秀参赛报告相应统计的六成。</p>
        {confirming
          ? <div className={styles.confirm} role="region" aria-label="重建骨架确认">
            <span>将当前 {content.report.length} 个章节替换为蓝图骨架（{skeletonSize} 节，每节附写作提示）？PPT、LaTeX 与研究发现保留，替换后可撤销。{linkedSlides > 0 && <strong className={styles.warn}>其中 {linkedSlides} 页 PPT 关联了现有章节，替换后会标记为“关联章节已移除”，导出前需重新选择依据。</strong>}</span>
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
