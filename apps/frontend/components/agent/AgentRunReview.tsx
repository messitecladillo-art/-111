'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PaperText } from '@/components/editors/PaperBlocks';
import type { FullReportGenerationResult, ProjectResearchMode } from '@/lib/agent/full-report-pipeline';
import type { EditorContent } from '@/lib/editor-model';
import { referenceNumbers } from '@/lib/references';
import { reportLabels, type BlockLabel } from '@/lib/report-numbering';
import styles from './AgentRunReview.module.css';

type Change = { sectionId: string; title: string; before: string; after: string; changeType: 'added' | 'updated' | 'removed'; details?: string[] };
type Tab = 'quality' | 'diff' | 'revisions';
const TABS: { id: Tab; label: string }[] = [{ id: 'quality', label: '质量检查' }, { id: 'diff', label: '原稿对比' }, { id: 'revisions', label: '实际修订' }];
const MODE_LABELS: Record<ProjectResearchMode, string> = { plan: '研究方案', demonstration: '教学模拟', empirical: '真实资料' };
const STATUS_LABELS = { pass: '已检查', warning: '待复核', failed: '未通过', not_run: '未执行' };
const EMPTY_LABELS: Map<string, BlockLabel> = new Map();
const EMPTY_CITATIONS: ReadonlyMap<string, number> = new Map();
const EXHIBIT_TOKEN_RE = /\[\[(图|表|式):([^\]\n]{1,80})\]\]/gu;
const CITE_TOKEN_RE = /\[\[引:([^\]\n]{1,80})\]\]/gu;
const KIND_MAP: Record<string, 'figure' | 'table' | 'equation'> = { 图: 'figure', 表: 'table', 式: 'equation' };
const FALLBACK_EXHIBIT: Record<string, string> = { 图: '对应统计图', 表: '对应统计表', 式: '对应公式' };

function cleanReviewText(raw: string): string {
  return raw
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）');
}

function formatReviewInline(
  raw: string,
  primaryLabels: Map<string, BlockLabel>,
  secondaryLabels: Map<string, BlockLabel>,
  citations: ReadonlyMap<string, number>,
): ReactNode {
  const effectiveLabels = new Map(secondaryLabels);
  for (const [k, v] of primaryLabels) effectiveLabels.set(k, v);
  const normalized = cleanReviewText(raw);
  const cleaned = normalized.replace(EXHIBIT_TOKEN_RE, (full, kindChar: string, id: string) => {
    const found = effectiveLabels.get(id);
    if (found && found.kind === KIND_MAP[kindChar]) return full;
    if (/^(?:附)?\d+(?:[-－—.]\d+)?$/u.test(id.trim())) {
      return kindChar === '式' ? `式（${id.trim()}）` : `${kindChar} ${id.trim()}`;
    }
    return FALLBACK_EXHIBIT[kindChar] ?? kindChar;
  });
  return <PaperText text={cleaned} labels={effectiveLabels} citations={citations} />;
}

function ReviewProse({
  text,
  empty,
  primaryLabels,
  secondaryLabels,
  citations,
}: {
  text: string;
  empty: string;
  primaryLabels: Map<string, BlockLabel>;
  secondaryLabels: Map<string, BlockLabel>;
  citations: ReadonlyMap<string, number>;
}) {
  const lines = text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return <p>{empty}</p>;
  return (
    <>
      {lines.map((line, idx) => (
        <p key={idx}>{formatReviewInline(line, primaryLabels, secondaryLabels, citations)}</p>
      ))}
    </>
  );
}

/** A run is a reviewable candidate, never a certificate that the research or export is ready. */
export default function AgentRunReview({ quality, revisions, summary, mode, conflict, pending = false, failed, changes = [], lockedSectionIds = [], before, preview, onApply, onDiscard, onCancel, onSelectSection, onToggleSectionLock }: {
  quality?: FullReportGenerationResult['quality'];
  revisions?: FullReportGenerationResult['revisions'];
  summary?: Pick<FullReportGenerationResult['summary'], 'llmSuccessCount' | 'totalSectionsGenerated' | 'fallbackCount' | 'totalTokens' | 'promptTokens' | 'completionTokens' | 'usageReported'>;
  mode: ProjectResearchMode;
  conflict: boolean;
  pending?: boolean;
  failed?: string;
  changes?: Change[];
  lockedSectionIds?: string[];
  before?: EditorContent | null;
  preview?: EditorContent | null;
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

  const { beforeLabels, afterLabels, beforeCitations, afterCitations } = useMemo(() => {
    const bLabels = before ? reportLabels(before.report) : EMPTY_LABELS;
    const aLabels = preview ? reportLabels(preview.report) : EMPTY_LABELS;
    const bCit = new Map(before ? referenceNumbers(before).numbers : EMPTY_CITATIONS);
    const aCit = new Map(preview ? referenceNumbers(preview).numbers : EMPTY_CITATIONS);
    for (const [refId, num] of aCit) if (!bCit.has(refId)) bCit.set(refId, num);
    for (const [refId, num] of bCit) if (!aCit.has(refId)) aCit.set(refId, num);
    let nextBefore = Math.max(0, ...bCit.values()) + 1;
    let nextAfter = Math.max(0, ...aCit.values()) + 1;
    const scan = (raw: string, map: Map<string, number>, next: () => number) => {
      for (const m of raw.matchAll(CITE_TOKEN_RE)) if (!map.has(m[1])) map.set(m[1], next());
    };
    for (const c of changes) {
      scan(c.before, bCit, () => nextBefore++);
      scan(c.after, aCit, () => nextAfter++);
    }
    for (const r of revisions ?? []) {
      scan(r.before, bCit, () => nextBefore++);
      scan(r.after, aCit, () => nextAfter++);
    }
    return { beforeLabels: bLabels, afterLabels: aLabels, beforeCitations: bCit, afterCitations: aCit };
  }, [before, preview, changes, revisions]);

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
      <div><span className={styles.eyebrow}>证见 · 审阅工作台</span><h2 role="status" aria-live="polite">{status}</h2></div>
      <span className={styles.mode}>{MODE_LABELS[mode]}</span>
    </header>
    <p className={styles.intro}>原稿保留在编辑器。核对证据、比较改动后，再选择采纳；候选稿仍需事实与导出文件验收。</p>
    {summary && <dl className={styles.metrics}>
      <div><dt>自动起草</dt><dd>{summary.llmSuccessCount}<small> / {summary.totalSectionsGenerated} 节</small></dd></div>
      <div><dt>待补写</dt><dd>{summary.fallbackCount}<small> 节</small></dd></div>
      <div><dt>服务商用量</dt><dd>{summary.usageReported ? (summary.totalTokens ?? 0).toLocaleString() : '未完整报告'}{summary.usageReported && <small> 词元</small>}</dd></div>
    </dl>}
    {conflict && <p className={styles.alert} role="alert">原始资料或原稿已在运行后修改。这份候选稿不能覆盖当前版本，请丢弃候选稿后重新生成。</p>}
    {failed && <p className={styles.alert} role="alert">{cleanReviewText(failed)} 已收到的内容仅供查看，运行回执可在下方核对。</p>}
    <div className={styles.tabs} role="tablist" aria-label="审阅内容">
      {TABS.map((item, index) => <button key={item.id} ref={element => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${id}-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => keys(event, index)}>{item.label}{item.id === 'diff' && <small>{changes.length}</small>}{item.id === 'revisions' && <small>{revisions?.length ?? 0}</small>}</button>)}
    </div>
    <div className={styles.panel} role="tabpanel" tabIndex={0} id={`${id}-panel-${tab}`} aria-labelledby={`${id}-${tab}`}>
      {tab === 'quality' && <>
        {!quality ? <p className={styles.empty} role="status">{pending ? '完整质量检查会随运行结果返回，当前尚未验收。' : '未收到完整检查结果，不能采纳。'}</p> : <>
          {quality.blockers.length > 0 && <div className={styles.blockers} role="alert"><b>采纳前需解决</b><ul>{Array.from(new Set(quality.blockers)).map((item, index) => <li key={index}>{cleanReviewText(item)}</li>)}</ul></div>}
          <ul className={styles.checks}>{quality.checks.map(check => <li key={check.id} data-status={check.status}><span className={styles.checkStatus}>{STATUS_LABELS[check.status]}</span><div><b>{cleanReviewText(check.label)}</b><p>{cleanReviewText(check.detail)}</p></div></li>)}</ul>
        </>}
        {summary && <p className={styles.footnote}>{summary.usageReported ? `已报告输入 ${summary.promptTokens.toLocaleString()} / 输出 ${summary.completionTokens.toLocaleString()} 词元。` : '部分调用未返回完整用量，平台不推算词元或费用，请以服务商账单为准。'} 生成完成与交付验收分别记录。</p>}
      </>}
      {tab === 'diff' && <>
        <p className={styles.footnote}>勾选的原章节保留原稿；勾选的新增章节不加入报告。未勾选的变更随采纳一起写入。</p>
        {!changes.length ? <p className={styles.empty} role="status">{pending ? '候选内容返回后显示实际差异。' : '候选稿与原稿没有可应用的差异。'}</p> : <div className={styles.changeList}>{changes.map(change => {
          const cleanTitle = cleanReviewText(change.title);
          return <article className={styles.change} key={change.sectionId}>
            <div className={styles.changeHead}><button type="button" aria-label={`定位到章节“${cleanTitle}”`} onClick={() => onSelectSection?.(change.sectionId)}>{cleanTitle}</button><span>{change.changeType === 'added' ? '新增' : change.changeType === 'removed' ? '删除' : '修改'}</span><label><input type="checkbox" aria-label={`${change.changeType === 'added' ? '排除新增章节' : '保留原稿章节'}“${cleanTitle}”`} checked={locks.has(change.sectionId)} onChange={() => onToggleSectionLock?.(change.sectionId)} />{change.changeType === 'added' ? '排除此节' : '保留原稿'}</label></div>
            {!!change.details?.length && <ul className={styles.details}>{change.details.map((detail, index) => <li key={index}>{formatReviewInline(detail, afterLabels, beforeLabels, afterCitations)}</li>)}</ul>}
            <div className={styles.diff}>
              <div><b>原稿</b><ReviewProse text={change.before} empty="原稿无此内容" primaryLabels={beforeLabels} secondaryLabels={afterLabels} citations={beforeCitations} /></div>
              <div><b>候选稿</b><ReviewProse text={change.after} empty="候选稿已移除此内容" primaryLabels={afterLabels} secondaryLabels={beforeLabels} citations={afterCitations} /></div>
            </div>
          </article>;
        })}</div>}
      </>}
      {tab === 'revisions' && (!revisions?.length ? <p className={styles.empty} role="status">本次未记录实际修订。动画回放不会添加示例纠错记录。</p> : <ol className={styles.revisions}>{revisions.map(revision => {
        const revTitle = cleanReviewText(changes.find(change => change.sectionId === revision.sectionId)?.title ?? revision.sectionId);
        return <li key={revision.id}>
          <div className={styles.revisionHead}><button type="button" aria-label={`定位到修订章节“${revTitle}”`} onClick={() => onSelectSection?.(revision.sectionId)}>{revTitle}</button><span>{revision.kind === 'model_revision' ? '智能审校返修' : '规范化整理'}</span></div>
          <p>{formatReviewInline(revision.reason, afterLabels, beforeLabels, afterCitations)}</p>
          <div className={styles.diff}>
            <div><b>修订前</b><ReviewProse text={revision.before} empty="空白" primaryLabels={afterLabels} secondaryLabels={beforeLabels} citations={afterCitations} /></div>
            <div><b>修订后</b><ReviewProse text={revision.after} empty="已移除" primaryLabels={afterLabels} secondaryLabels={beforeLabels} citations={afterCitations} /></div>
          </div>
          {revision.checkIds.length > 0 && <small>关联核查项 · {revision.checkIds.map(cleanReviewText).join('、')}</small>}
        </li>;
      })}</ol>)}
    </div>
    <footer className={styles.actions}>
      <p role="status" aria-live="polite">{pending ? '生成期间可取消，原稿继续保留。' : quality?.status === 'blocked' ? '阻断项处理完成前无法采纳。' : `${remaining.length} 项变更待采纳 · ${locks.size} 项保留或排除`}</p>
      {pending && onCancel ? <button type="button" onClick={onCancel}>取消运行</button> : <button type="button" onClick={onDiscard}>丢弃候选稿</button>}
      <button type="button" className={styles.primary} disabled={!canApply} onClick={onApply}>采纳所选变更</button>
    </footer>
  </section>;
}
