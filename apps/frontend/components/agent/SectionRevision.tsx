'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import styles from './SectionRevision.module.css';

export type SectionRevisionProps = {
  section: { id: string; title: string } | null;
  phase: 'idle' | 'confirm' | 'running' | 'ready' | 'unknown' | 'error' | 'applied';
  original: string[];
  proposed: string[];
  evidence: readonly { id: string; text: string }[];
  serviceLabel: string | null;
  reason: string | null;
  staleReason: string | null;
  canStart: boolean;
  composing: boolean;
  usageLabel?: string | null;
  onPrepare: () => void;
  onConfirm: () => void;
  onApply: () => void;
  onKeep: () => void;
  onCheck: () => void;
  onOpenSettings: () => void;
};

type ComparisonTab = 'original' | 'proposed';

const phaseLabels: Record<SectionRevisionProps['phase'], string> = {
  idle: '本节修订',
  confirm: '发送前确认',
  running: '正在等待结果',
  ready: '候选待确认',
  unknown: '结果待核实',
  error: '生成失败',
  applied: '修订已采纳',
};

function textCount(paragraphs: readonly string[]) {
  return paragraphs.reduce((count, paragraph) => count + paragraph.replace(/\s/g, '').length, 0);
}

function Paragraphs({ paragraphs, empty }: { paragraphs: readonly string[]; empty: string }) {
  return paragraphs.length ? (
    <div className={styles.prose}>
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  ) : <p className={styles.description}>{empty}</p>;
}

export default function SectionRevision({
  section, phase, original, proposed, evidence, serviceLabel, reason, staleReason,
  canStart, composing, usageLabel, onPrepare, onConfirm, onApply, onKeep, onCheck, onOpenSettings,
}: SectionRevisionProps) {
  const id = useId();
  const [tab, setTab] = useState<ComparisonTab>('proposed');
  const tabRefs = useRef<Record<ComparisonTab, HTMLButtonElement | null>>({ original: null, proposed: null });
  const title = section?.title.trim() || '未命名章节';
  const startBlocked = !section || !canStart || composing;
  const startReason = composing ? '中文输入尚未结束，请完成输入后再修订。'
    : !section ? '请先在报告中选择一节。'
      : reason || (!canStart ? '暂时无法修订，请先完成当前操作。' : null);
  const applyReason = staleReason || (composing ? '中文输入尚未结束，请完成输入后再采纳。' : null)
    || (!section ? '请选择生成候选时的章节。' : null)
    || (!proposed.some(paragraph => paragraph.trim()) ? '候选正文为空，无法采纳。' : null);

  function changeTab(event: KeyboardEvent<HTMLButtonElement>, current: ComparisonTab) {
    let next: ComparisonTab;
    if (event.key === 'Home') next = 'original';
    else if (event.key === 'End') next = 'proposed';
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = current === 'original' ? 'proposed' : 'original';
    else return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const evidenceDisclosure = (
    <details className={styles.disclosure}>
      <summary>核对本次依据 <span>{evidence.length} 项</span></summary>
      {evidence.length ? (
        <ul className={styles.evidence}>
          {evidence.map((item, index) => (
            <li key={`${item.id}-${index}`}>
              <b>{item.id}</b>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      ) : <p className={styles.description}>本次没有提供登记事实或已确认发现。</p>}
    </details>
  );

  return (
    <section className={styles.root} aria-labelledby={`${id}-heading`} data-phase={phase}>
      <header className={styles.heading}>
        <p className={styles.kicker}>章节修订</p>
        <h3 id={`${id}-heading`}>{section ? title : '选择报告章节'}</h3>
        <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
          <i aria-hidden="true" />{phaseLabels[phase]}
        </p>
      </header>

      {phase === 'idle' && (
        <>
          <p className={styles.description}>调整这一节的表达与结构，先比较候选，再决定是否采纳。</p>
          {section && original.length > 0 && <p className={styles.count}>{original.length} 段正文 · {textCount(original).toLocaleString()} 字</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onPrepare} disabled={startBlocked}
              aria-describedby={startReason ? `${id}-start-reason` : undefined}>修订本节</button>
          </div>
          {startReason && <p className={styles.description} id={`${id}-start-reason`}>{startReason}</p>}
        </>
      )}

      {phase === 'confirm' && (
        <>
          <p className={styles.description}>确认后，将以下内容发送至<strong>{serviceLabel || '当前报告模型'}</strong>，用于生成本节候选。</p>
          <ul className={styles.scope} aria-label="将发送的内容范围">
            <li>所选章节的正文段落</li>
            <li>项目目标与范围</li>
            <li>已登记事实的摘要</li>
            <li>已确认的研究发现</li>
          </ul>
          <p className={styles.description}>仅修订正文段落。图表、公式、来源及其他说明对象保留。</p>
          <p className={styles.sourceNote}>发送内容不含原始答卷。请先展开核对正文与依据。</p>
          <details className={styles.disclosure}>
            <summary>核对本节原文 <span>{original.length} 段</span></summary>
            <Paragraphs paragraphs={original} empty="本节暂无可发送的正文。" />
          </details>
          {evidenceDisclosure}
          {staleReason && <p className={styles.warning} role="alert">{staleReason}</p>}
          {startBlocked && startReason && <p className={styles.warning}>{startReason}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onConfirm} disabled={startBlocked || !!staleReason}>发送并生成候选</button>
            <button type="button" className={styles.secondary} onClick={onKeep}>取消</button>
          </div>
        </>
      )}

      {phase === 'running' && (
        <>
          <p className={styles.description}>结果确认后，可在这里核对原文与修订候选。</p>
          <div className={styles.waiting}>
            <span className={styles.waitingMark} aria-hidden="true">···</span>
            <p role="status" aria-live="polite">{reason || '正在等待模型返回'}</p>
          </div>
          <p className={styles.sourceNote}>停止等待后，服务端可能仍在处理；可随后核实本次请求的回执。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onKeep}>停止等待，保留原文</button>
          </div>
        </>
      )}

      {phase === 'ready' && (
        <>
          <p className={styles.description}>模型候选，未经核实。请核对表达、数字与引用。采纳仅替换正文段落，图表、公式、来源及其他说明对象保留。</p>
          <div className={styles.comparison}>
            <div className={styles.tabs} role="tablist" aria-label="比较本节原文与候选">
              {(['original', 'proposed'] as const).map(value => (
                <button key={value} type="button" role="tab" id={`${id}-tab-${value}`}
                  aria-selected={tab === value} aria-controls={`${id}-panel-${value}`} tabIndex={tab === value ? 0 : -1}
                  ref={element => { tabRefs.current[value] = element; }}
                  onClick={() => setTab(value)} onKeyDown={event => changeTab(event, value)}>
                  <b>{value === 'original' ? '原文' : '修订候选'}</b>
                  <span>{(value === 'original' ? original : proposed).length} 段 · {textCount(value === 'original' ? original : proposed).toLocaleString()} 字</span>
                </button>
              ))}
            </div>
            <div className={styles.comparePanel} role="tabpanel" id={`${id}-panel-original`}
              aria-labelledby={`${id}-tab-original`} hidden={tab !== 'original'} tabIndex={0}>
              <div className={styles.versionHead}><b>生成前原文</b><span>原始版本</span></div>
              <Paragraphs paragraphs={original} empty="生成前本节暂无正文。" />
            </div>
            <div className={styles.comparePanel} role="tabpanel" id={`${id}-panel-proposed`}
              aria-labelledby={`${id}-tab-proposed`} hidden={tab !== 'proposed'} tabIndex={0}>
              <div className={styles.versionHead}><b>修订候选</b><span data-pending="true">待确认</span></div>
              <Paragraphs paragraphs={proposed} empty="本次未返回可采纳的正文。" />
            </div>
          </div>
          {evidenceDisclosure}
          {reason && reason !== applyReason && <p className={styles.warning} role="alert">{reason}</p>}
          {applyReason && <p className={styles.warning} id={`${id}-apply-reason`} role="alert">{applyReason}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onApply} disabled={!!applyReason}
              aria-describedby={applyReason ? `${id}-apply-reason` : undefined}>采纳修订</button>
            <button type="button" className={styles.secondary} onClick={onKeep}>保留原文</button>
          </div>
        </>
      )}

      {phase === 'unknown' && (
        <>
          <p className={styles.warning} role="alert">{reason || '暂时无法确认本次请求是否完成。'}</p>
          <p className={styles.description}>先读取本次请求的回执，核实是否已有候选结果。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onCheck}>核实生成结果</button>
            <button type="button" className={styles.secondary} onClick={onKeep}>保留原文</button>
          </div>
        </>
      )}

      {phase === 'error' && (
        <>
          <p className={styles.warning} role="alert">{reason || '本次生成失败，请重新准备修订。'}</p>
          <p className={styles.description}>重新核对本节内容与依据后，可以确认下一次生成。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onPrepare} disabled={startBlocked}>重新准备修订</button>
            <button type="button" className={styles.secondary} onClick={onKeep}>保留原文</button>
          </div>
          {startBlocked && startReason && <p className={styles.description}>{startReason}</p>}
        </>
      )}

      {phase === 'applied' && (
        <>
          <p className={styles.success}>本节正文已更新。可在报告编辑器中撤销此次修改。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onKeep}>完成</button>
          </div>
        </>
      )}

      <footer className={styles.footer}>
        <div className={styles.service}><span>报告模型</span><b>{serviceLabel || '尚未选择'}</b></div>
        {usageLabel && <p className={styles.usage}>{usageLabel}</p>}
        <button type="button" className={styles.settings} onClick={onOpenSettings}>模型设置<span aria-hidden="true"> ↗</span></button>
      </footer>
    </section>
  );
}
