'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import DefenseStudio from '@/components/defense/DefenseStudio';
import { defenseReferenceLocator, projectDefenseSource, type DefenseSource } from '@/lib/project-defense';
import { parseReportHead } from '@/lib/project-report';
import { errorMessage, hostedRequest } from './api-client';
import styles from './HostedDefense.module.css';

const linkLabels = { current: '报告关联已对齐', unlinked: '独立编写的页面', report_changed: '报告章节已变化', slide_changed: '页面已修改', missing_source: '原章节已移除' } as const;
export default function HostedDefense({ projectId, onOpenReport }: { projectId: string; onOpenReport?: () => void }) {
  // Project identity is the boundary. Source refreshes never remount the practice studio.
  return <ProjectDefense key={projectId} projectId={projectId} onOpenReport={onOpenReport}/>;
}
function ProjectDefense({ projectId, onOpenReport }: { projectId: string; onOpenReport?: () => void }) {
  const [source, setSource] = useState<DefenseSource | null>(null), [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [kind, setKind] = useState<'section' | 'slide'>('section'), [selectedId, setSelectedId] = useState('');
  const [expanded, setExpanded] = useState(false);
  const mounted = useRef(true), readEpoch = useRef(0);
  const reload = useCallback(async () => {
    const epoch = ++readEpoch.current;
    try {
      const report = parseReportHead(await hostedRequest(`/api/projects/${projectId}/report`), projectId);
      const next = report ? await projectDefenseSource(report, projectId) : null;
      if (!mounted.current || readEpoch.current !== epoch) return;
      setSource(next); setLoaded(true); setError(''); setNotice(next ? `参考资料已读取：报告 v${next.revision}。` : '先保存项目报告，再带入章节、来源和讲稿。');
    } catch (e) { if (mounted.current && readEpoch.current === epoch) setError(errorMessage(e)); }
    finally { if (mounted.current && readEpoch.current === epoch) setLoading(false); }
  }, [projectId]);
  useEffect(() => { mounted.current = true; let active = true; const epoch = readEpoch; queueMicrotask(() => { if (active) void reload(); }); return () => { active = false; mounted.current = false; epoch.current++; }; }, [reload]);
  const items = source ? kind === 'section' ? source.sections : source.slides : [];
  const selected = items.find(item => item.id === selectedId) || items[0];
  const section = source && kind === 'section' ? source.sections.find(item => item.id === selected?.id) : null;
  const slide = source && kind === 'slide' ? source.slides.find(item => item.id === selected?.id) : null;
  async function copyLocator() {
    if (!source || !selected) return;
    try { await navigator.clipboard.writeText(defenseReferenceLocator(source, kind, selected.id)); if (mounted.current) setNotice('来源定位已复制，可粘贴到练习笔记。'); }
    catch { if (mounted.current) { setExpanded(true); setNotice('请展开来源定位后复制。'); } }
  }
  return <div data-self-styled className={styles.host}>
    <section className={styles.reference} aria-labelledby="defense-reference-title" aria-busy={loading}>
      <header className={styles.header}><div><span className={styles.kicker}>REPORT → DEFENSE</span><h2 id="defense-reference-title">带着证据进入答辩</h2><p>{source ? `${source.title} · 已保存报告 v${source.revision}` : loading ? '正在读取项目报告…' : '项目报告与 PPT 讲稿'}</p></div><div className={styles.headerActions}><span>练习笔记：下载保存</span><button type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); void reload(); }}>{loading ? '正在读取…' : '读取最新保存版本'}</button>{onOpenReport && <button type="button" onClick={onOpenReport}>打开报告 →</button>}</div></header>
      {error && <p className={styles.error} role="alert">{error}{source ? ' 当前参考版本仍保留。' : ''}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {!source && loaded ? <div className={styles.empty}><strong>保存一版报告，即可在这里查阅研究原文。</strong><p>下方题库可直接开始练习。</p></div> : source && <>
        <div className={styles.toolbar}><div role="group" aria-label="答辩参考资料类型"><button type="button" aria-pressed={kind === 'section'} onClick={() => { setKind('section'); setSelectedId(''); setExpanded(false); }}>报告章节 <span>{source.sections.length}</span></button><button type="button" aria-pressed={kind === 'slide'} onClick={() => { setKind('slide'); setSelectedId(''); setExpanded(false); }}>PPT 讲稿 <span>{source.slides.length}</span></button></div><span>保存于 {new Date(source.updatedAt).toLocaleString('zh-CN')}</span></div>
        <div className={styles.sourceGrid}><nav className={styles.directory} aria-label={kind === 'section' ? '报告章节参考目录' : 'PPT 讲稿参考目录'}>{items.map(item => <button type="button" key={item.id} aria-pressed={item.id === selected?.id} onClick={() => { setSelectedId(item.id); setExpanded(false); }}><span>{String(item.number).padStart(2, '0')}</span><strong>{item.title || '未命名'}</strong></button>)}</nav>
          <article className={styles.content}>{selected && <><div className={styles.contentHeader}><h3>{selected.title || '未命名'}</h3><button type="button" onClick={() => void copyLocator()}>复制来源定位</button></div>
            {section && <><p className={styles.original}>{section.body || '本章节还未填写正文。'}</p><details className={styles.evidence}><summary>章节来源与计算口径</summary><pre>{section.source || '本章节还未填写来源。'}</pre></details></>}
            {slide && <><span className={styles.linkState} data-current={slide.linkState === 'current'}>{linkLabels[slide.linkState]}</span><div className={styles.slide}><div><h4>页面内容</h4><p className={styles.original}>{slide.body || '本页还未填写正文。'}</p>{slide.aside && <p className={styles.aside}>{slide.aside}</p>}</div><div><h4>讲稿</h4><p className={styles.original}>{slide.notes || '本页还未填写讲稿。'}</p></div></div></>}
            <details className={styles.locator} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>查看版本与来源定位</summary><pre>{defenseReferenceLocator(source, kind, selected.id)}</pre></details>
          </>}</article>
        </div>
      </>}
    </section>
    <DefenseStudio/>
  </div>;
}
