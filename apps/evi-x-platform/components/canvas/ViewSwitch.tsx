'use client';

import styles from './ViewSwitch.module.css';

/**
 * 工作台 / 画布 capsule. Kept out of the canvas bundle so the workbench heading can render it
 * without loading React Flow; the indicator slides between the halves.
 */
export default function ViewSwitch({ view, arrive = false, onWorkbench, onCanvas }: { view: 'workbench' | 'canvas'; arrive?: boolean; onWorkbench?: () => void; onCanvas?: () => void }) {
  // `arrive` replays the slide from the other half when this view has just been entered.
  return <div className={styles.viewSwitch} data-view={view} data-arrive={arrive || undefined} role="group" aria-label="切换视图">
    <i aria-hidden="true" />
    <button type="button" aria-pressed={view === 'workbench'} onClick={() => { if (view !== 'workbench') onWorkbench?.(); }}>工作台</button>
    <button type="button" aria-pressed={view === 'canvas'} onClick={() => { if (view !== 'canvas') onCanvas?.(); }}>画布</button>
  </div>;
}
