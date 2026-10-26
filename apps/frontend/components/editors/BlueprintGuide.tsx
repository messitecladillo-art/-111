'use client';

import { BLUEPRINT_MODULE_LABELS, type BlueprintElement, type BlueprintModule, type BlueprintNode } from '@/lib/report-blueprint';
import styles from './BlueprintGuide.module.css';

const ELEMENT_LABELS: Record<BlueprintElement, string> = { figure: '图', table: '表', formula: '公式', citation: '文献', finding: '发现' };

type Props = { node: BlueprintNode; written: number; open: boolean; onToggle: (open: boolean) => void; onNavigate?: (module: BlueprintModule) => void };

/** Guidance for the section being written. It lives beside the text, never inside it, so it cannot reach an export. */
export default function BlueprintGuide({ node, written, open, onToggle, onNavigate }: Props) {
  const [low, high] = node.length ?? [0, 0];
  const lengthState = written === 0 ? 'empty' : written < low ? 'short' : written > high ? 'long' : 'ok';
  return <details className={styles.guide} open={open} onToggle={event => onToggle(event.currentTarget.open)}>
    <summary>
      <span className={styles.kicker}>{node.kind === 'chapter' ? '本章任务' : '写作指引'}</span>
    </summary>
    <div className={styles.body}>
      <p className={styles.purpose}>{node.purpose}</p>
      {node.moves.length > 0 && <ol className={styles.moves}>{node.moves.map(move => <li key={move}>{move}</li>)}</ol>}
      <div className={styles.meta}>
        {node.length && <span className={styles.length} data-state={lengthState}>{written.toLocaleString('zh-CN')}<small> / {low.toLocaleString('zh-CN')}–{high.toLocaleString('zh-CN')} 字</small></span>}
        {node.needs.map(need => <span key={need.label} className={styles.need}><b>{ELEMENT_LABELS[need.element]}</b>{need.label}</span>)}
        {node.module && onNavigate && <button type="button" className={styles.module} onClick={() => onNavigate(node.module!)}>去{BLUEPRINT_MODULE_LABELS[node.module]}取素材</button>}
      </div>
    </div>
  </details>;
}
