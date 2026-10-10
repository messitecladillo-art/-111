'use client';

import { useEffect, useRef, useState } from 'react';
import { JOURNEY_STATUS_LABELS, type JourneyModule } from '@/lib/analysis-journey';
import { useContentReveal } from '@/components/motion/useWorkspaceMotion';
import styles from './AnalysisJourney.module.css';

type Props = {
  reading: boolean; readPhase: 'reading' | 'checking' | 'identity'; readName: string;
  dataset: { rowCount: number; columnCount: number } | null; importError: string;
  setupIssue: string; setupTarget: 'data' | 'mapping'; modules: JourneyModule[]; activeId: string | null;
  onNavigate: (target: 'data' | 'mapping' | 'recipes') => void;
};
const readLabels = { reading: '正在读取文件', checking: '正在检查字段', identity: '正在核验数据指纹' };
const stageNames = ['数据入场', '口径核对', '分析模块', '结果汇集'];

export default function AnalysisJourney({ reading, readPhase, readName, dataset, importError, setupIssue, setupTarget, modules, activeId, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(true), [paused, setPaused] = useState(false), [visible, setVisible] = useState(true);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => setVisible(!!entries[0]?.isIntersecting && !document.hidden));
    observer.observe(node);
    const visibility = () => { if (document.hidden) setVisible(false); else { observer.unobserve(node); observer.observe(node); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const ready = modules.filter(module => module.status === 'ready');
  const attention = modules.filter(module => ['error', 'diagnostic', 'stale'].includes(module.status));
  const active = modules.find(module => module.id === activeId);
  const latest = modules.filter(module => module.computedAt).sort((a, b) => b.computedAt!.localeCompare(a.computedAt!)).slice(0, 3);
  const receipt = latest.map(module => `${module.id}:${module.computedAt}:${module.status}`).join('|');
  const feedRef = useContentReveal<HTMLUListElement>({ token: receipt || null, enabled: visible && expanded && !paused });
  const focus = reading || !dataset ? 0 : setupIssue ? 1 : ready.length && ready.length === modules.length ? 3 : 2;
  const state = reading ? readLabels[readPhase] : importError ? '文件读取需要调整' : !dataset ? '等待数据进入' : setupIssue ? '口径需要核对' : !modules.length ? '选择你的分析路线' : attention.length ? `${attention.length} 个模块需要查看` : ready.length === modules.length ? '当前模块结果已汇集' : '继续配置与计算';
  const stageNotes = [reading ? readLabels[readPhase] : dataset ? `${dataset.rowCount} 行 · ${dataset.columnCount} 列` : '读取调查数据', setupIssue || (dataset ? '缺失与题目对应' : '定义分析范围'), modules.length ? `${ready.length} / ${modules.length} 项结果可用` : '组合研究方法', ready.length ? `${ready.length} 项当前结果` : '等待计算结果'];
  const targets = ['data', setupIssue ? setupTarget : 'data', 'recipes', 'recipes'] as const;

  return <section ref={root} className={styles.journey} aria-label="分析证据航线" data-expanded={expanded} data-paused={paused || !visible || !expanded} data-reading={reading}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>EVIDENCE IN MOTION</span><h3>证据航线 <span>{dataset ? `${ready.length} 项结果可用` : '从数据出发'}</span></h3></div>
      <div className={styles.controls}>{expanded && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? '继续动效' : '暂停动效'}</button>}<button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起画面' : '展开画面'}</button></div>
    </header>
    <div className={styles.body} hidden={!expanded}>
      <div className={styles.scene}>
        <div className={styles.sceneHeading}><span className={styles.signal} aria-hidden="true"/><p role="status" aria-live="polite">{state}</p><span className={styles.sceneCode}>D → I</span></div>
        <div className={styles.landscape}>
          <svg className={styles.route} viewBox="0 0 800 180" preserveAspectRatio="none" aria-hidden="true"><path d="M 80 65 C 200 65 160 130 280 130 S 420 45 520 45 S 640 120 720 120" className={styles.routeBase}/><path d="M 80 65 C 200 65 160 130 280 130 S 420 45 520 45 S 640 120 720 120" className={styles.routeFlow}/></svg>
          <div className={styles.stations}>{stageNames.map((name, index) => <button type="button" className={styles.station} key={name} disabled={index > 0 && !dataset} data-active={focus === index} data-ready={index === 0 ? !!dataset && !reading : index === 1 ? !!dataset && !setupIssue : index === 2 ? ready.length > 0 : ready.length > 0} onClick={() => onNavigate(targets[index])}>
            <span className={styles.glyph} aria-hidden="true">{index === 0 ? <><i/><i/><i/></> : index === 1 ? <><b>✓</b><i/><i/></> : index === 2 ? <><i/><i/><i/><i/></> : <><i/><i/><i/></>}</span>
            <span className={styles.stationNumber}>0{index + 1}</span><strong>{name}</strong><small>{stageNotes[index]}</small>
          </button>)}</div>
        </div>
        <footer className={styles.sceneFooter}><span>{active ? `当前模块 · ${active.title}` : '问题 → 数据 → 洞察 → 行动'}</span><span>{modules.length ? `${modules.length} 个分析模块` : '等待建立方案'}</span></footer>
      </div>
      <aside className={styles.activity} aria-label="分析当前动态">
        <div className={styles.activityHead}><h4>当前动态</h4><span>{reading ? '处理中' : '当前状态'}</span></div>
        <ul ref={feedRef} className={styles.feed}>
          <li data-tone={importError ? 'attention' : 'normal'}><span className={styles.feedDot}/><div><strong>{reading ? readLabels[readPhase] : importError ? '新文件读取失败' : dataset ? '数据已载入' : '尚未读取数据'}</strong><p>{reading ? readName : importError ? '查看读取选项后重试' : dataset ? `${dataset.rowCount} 行记录，${dataset.columnCount} 个字段` : '选择文件或试用样例'}</p></div></li>
          {setupIssue && <li data-tone="attention"><span className={styles.feedDot}/><div><strong>核对分析口径</strong><p>{setupIssue}</p></div></li>}
          {latest.map(module => <li key={module.id} data-tone={module.status === 'ready' ? 'normal' : 'attention'}><span className={styles.feedDot}/><div><strong>{module.title}</strong><p>{JOURNEY_STATUS_LABELS[module.status]}{module.n !== null ? ` · n=${module.n}` : ''}</p></div></li>)}
          {!latest.length && !setupIssue && <li><span className={styles.feedDot}/><div><strong>{modules.length ? '方案已建立' : '准备研究路线'}</strong><p>{modules.length ? `${modules.length} 个模块，逐项核对变量后计算` : '选择推荐路线，或自由组合模块'}</p></div></li>}
        </ul>
        <div className={styles.resultsCount}><strong>{ready.length}<span> / {modules.length || '—'}</span></strong><span>项结果可用{attention.length ? ` · ${attention.length} 项待查看` : ''}</span></div>
      </aside>
    </div>
    {expanded && modules.length > 0 && <ol className={styles.moduleTrack} aria-label="分析模块进度">{modules.map((module, index) => <li key={module.id} data-status={module.status} data-current={module.id === activeId}><span> {String(index + 1).padStart(2, '0')}</span><strong>{module.title}</strong><small>{JOURNEY_STATUS_LABELS[module.status]}</small></li>)}</ol>}
  </section>;
}
