'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { FullReportGenerationResult, ProjectResearchMode } from '@/lib/agent/full-report-pipeline';
import styles from './AgentRunReview.module.css';

type Change = { sectionId: string; title: string; before: string; after: string; changeType: 'added' | 'updated' | 'removed'; details?: string[] };
type Tab = 'quality' | 'diff' | 'revisions';
const TABS: { id: Tab; label: string }[] = [{ id: 'quality', label: '质量检查' }, { id: 'diff', label: '原稿对比' }, { id: 'revisions', label: '实际修订' }];
const MODE_LABELS: Record<ProjectResearchMode, string> = { plan: '研究方案', demonstration: '教学模拟', empirical: '真实资料' };
const STATUS_LABELS = { pass: '已检查', warning: '待复核', failed: '未通过', not_run: '未执行' };

/** A run is a reviewable candidate, never a certificate that the research or export is ready. */
export default function AgentRunReview({ quality, revisions, summary, mode, conflict, pending = false, failed, changes = [], lockedSectionIds = [], onApply, onDiscard, onCancel, onSelectSection, onToggleSectionLock }: {
  quality?: FullReportGenerationResult['quality'];
  revisions?: FullReportGenerationResult['revisions'];
  summary?: Pick<FullReportGenerationResult['summary'], 'llmSuccessCount' | 'totalSectionsGenerated' | 'fallbackCount' | 'totalTokens' | 'promptTokens' | 'completionTokens' | 'usageReported'>;
  mode: ProjectResearchMode;
  conflict: boolean;
  pending?: boolean;
  failed?: string;
  changes?: Change[];
  lockedSectionIds?: string[];
  onApply: () => void;
  onDiscard: () => void;
  onCancel?: () => void;
  onSelectSection?: (id: string) => void;
  onToggleSectionLock?: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('quality');
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const locks = new Set(lockedSectionIds);
  const remaining = changes.filter(change => !locks.has(change.sectionId));
  const canApply = !!quality && !pending && !failed && !conflict && quality.status !== 'blocked' && remaining.length > 0;
  const status = pending ? '正在生成候选稿' : failed ? '运行未完成' : quality?.status === 'blocked' ? '存在阻断项' : '候选稿待审阅';
  const keys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); setTab(TABS[next].id); tabRefs.current[next]?.focus();
  };

  return <section className={styles.review} aria-label="候选稿审阅工作台" data-blocked={quality?.status === 'blocked' || !!failed || undefined}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>AGENT · 审阅工作台</span><h2>{status}</h2></div>
      <span className={styles.mode}>{MODE_LABELS[mode]}</span>
    </header>
    <p className={styles.intro}>原稿保留在编辑器。核对证据、比较改动后，再选择采纳；候选稿仍需事实与导出文件验收。</p>
    {summary && <dl className={styles.metrics}>
      <div><dt>模型写成</dt><dd>{summary.llmSuccessCount}<small> / {summary.totalSectionsGenerated} 节</small></dd></div>
      <div><dt>待补写</dt><dd>{summary.fallbackCount}<small> 节</small></dd></div>
      <div><dt>服务商用量</dt><dd>{summary.usageReported ? (summary.totalTokens ?? 0).toLocaleString() : '未完整报告'}{summary.usageReported && <small> tokens</small>}</dd></div>
    </dl>}
    {conflict && <p className={styles.alert} role="alert">原始资料或原稿已在运行后修改。这份候选稿不能覆盖当前版本，请丢弃候选稿后重新生成。</p>}
    {failed && <p className={styles.alert} role="alert">{failed} 已收到的内容仅供查看，运行回执可在下方核对。</p>}
    <div className={styles.tabs} role="tablist" aria-label="审阅内容">
      {TABS.map((item, index) => <button key={item.id} ref={element => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${id}-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => keys(event, index)}>{item.label}{item.id === 'diff' && <small>{changes.length}</small>}{item.id === 'revisions' && <small>{revisions?.length ?? 0}</small>}</button>)}
    </div>
    <div className={styles.panel} role="tabpanel" tabIndex={0} id={`${id}-panel-${tab}`} aria-labelledby={`${id}-${tab}`}>
      {tab === 'quality' && <>
        {!quality ? <p className={styles.empty}>{pending ? '完整质量检查会随运行结果返回，当前尚未验收。' : '未收到完整检查结果，不能采纳。'}</p> : <>
          {quality.blockers.length > 0 && <div className={styles.blockers}><b>采纳前需解决</b><ul>{Array.from(new Set(quality.blockers)).map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          <ul className={styles.checks}>{quality.checks.map(check => <li key={check.id} data-status={check.status}><span className={styles.checkStatus}>{STATUS_LABELS[check.status]}</span><div><b>{check.label}</b><p>{check.detail}</p></div></li>)}</ul>
        </>}
        {summary && <p className={styles.footnote}>{summary.usageReported ? `已报告输入 ${summary.promptTokens.toLocaleString()} / 输出 ${summary.completionTokens.toLocaleString()} tokens。` : '部分调用没有返回完整用量；这里不推算 token 或费用，请核对服务商账单。'} 生成完成与交付验收分别记录。</p>}
      </>}
      {tab === 'diff' && <>
        <p className={styles.footnote}>勾选的原章节保留原稿；勾选的新增章节不加入报告。未勾选的变更随采纳一起写入。</p>
        {!changes.length ? <p className={styles.empty}>{pending ? '候选内容返回后显示实际差异。' : '候选稿与原稿没有可应用的差异。'}</p> : <div className={styles.changeList}>{changes.map(change => <article className={styles.change} key={change.sectionId}>
          <div className={styles.changeHead}><button type="button" onClick={() => onSelectSection?.(change.sectionId)}>{change.title}</button><span>{change.changeType === 'added' ? '新增' : change.changeType === 'removed' ? '删除' : '修改'}</span><label><input type="checkbox" checked={locks.has(change.sectionId)} onChange={() => onToggleSectionLock?.(change.sectionId)} />{change.changeType === 'added' ? '排除此节' : '保留原稿'}</label></div>
          {!!change.details?.length && <ul className={styles.details}>{change.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
          <div className={styles.diff}><div><b>原稿</b><p>{change.before || '原稿无此内容'}</p></div><div><b>候选稿</b><p>{change.after || '候选稿已移除此内容'}</p></div></div>
        </article>)}</div>}
      </>}
      {tab === 'revisions' && (!revisions?.length ? <p className={styles.empty}>本次未记录实际修订。动画回放不会添加示例纠错记录。</p> : <ol className={styles.revisions}>{revisions.map(revision => <li key={revision.id}>
        <div className={styles.revisionHead}><button type="button" onClick={() => onSelectSection?.(revision.sectionId)}>{changes.find(change => change.sectionId === revision.sectionId)?.title ?? revision.sectionId}</button><span>{revision.kind === 'model_revision' ? '模型返修' : '确定性整理'}</span></div>
        <p>{revision.reason}</p><div className={styles.diff}><div><b>修订前</b><p>{revision.before || '空白'}</p></div><div><b>修订后</b><p>{revision.after || '已移除'}</p></div></div>
        {revision.checkIds.length > 0 && <small>关联检查：{revision.checkIds.join('、')}</small>}
      </li>)}</ol>)}
    </div>
    <footer className={styles.actions}>
      <p>{pending ? '生成期间可取消，原稿继续保留。' : quality?.status === 'blocked' ? '阻断项处理完成前无法采纳。' : `${remaining.length} 项变更待采纳 · ${locks.size} 项保留或排除`}</p>
      {pending && onCancel ? <button type="button" onClick={onCancel}>取消运行</button> : <button type="button" onClick={onDiscard}>丢弃候选稿</button>}
      <button type="button" className={styles.primary} disabled={!canApply} onClick={onApply}>采纳所选变更</button>
    </footer>
  </section>;
}
