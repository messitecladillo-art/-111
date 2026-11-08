'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { HostedApiError, errorMessage } from '@/components/hosted/api-client';
import { isDefiniteChatRejection, usageText, type TokenUsage } from '@/lib/agent/chat';
import type { Service } from '@evix/shared';
import type { Questionnaire } from '@/lib/questionnaire';
import { sameReportRunScope, type ReportRunScope } from '@/lib/agent/report-work';
import { prepareSectionRevision, proposalFromReceipt, revisionProblem, revisionProse, type PreparedRevision, type RevisionApplyResult, type RevisionSnapshot, type SectionRevisionProposal } from '@/lib/agent/section-revision';
import { readDraft, sendDraft } from './draft-client';
import type { SectionRevisionProps } from './SectionRevision';

type Phase = SectionRevisionProps['phase'];
type State = { phase: Phase; prepared: PreparedRevision | null; proposal: SectionRevisionProposal | null; reason: string | null; usage: TokenUsage | null; epoch: number; serviceLabel: string | null };
const empty = (epoch: number): State => ({ phase: 'idle', prepared: null, proposal: null, reason: null, usage: null, epoch, serviceLabel: null });
type Options = {
  sectionId: string | null; scope: ReportRunScope; service: Service | null; design: Questionnaire | null;
  readScope: () => ReportRunScope; readSnapshot: () => RevisionSnapshot | null;
  apply: (proposal: SectionRevisionProposal, scope: ReportRunScope) => RevisionApplyResult;
  mountEditor: () => void; openSettings: () => void;
  mutate: Parameters<typeof sendDraft>[0]; disabled?: boolean; readDisabled?: () => boolean;
};

/** Scope changes invalidate candidates permanently, including leaving and returning to the same conversation. */
export function useSectionRevision(options: Options): SectionRevisionProps {
  const env = useRef(options), epoch = useRef(0), wait = useRef(0), busy = useRef(false), composingRef = useRef(false);
  const scopeKey = JSON.stringify(options.scope);
  const [scopeState, setScopeState] = useState({ key: scopeKey, epoch: 0 });
  if (scopeState.key !== scopeKey) setScopeState({ key: scopeKey, epoch: scopeState.epoch + 1 });
  const [state, setState] = useState<State>(() => empty(0));
  const stateRef = useRef(state);
  const [composing, setComposing] = useState(false);
  useLayoutEffect(() => { env.current = options; stateRef.current = state; });
  useLayoutEffect(() => {
    epoch.current = scopeState.epoch; wait.current++; busy.current = false;
    // Reading the counters happens at the cancellation event, not at render time.
    const invalidate = () => { epoch.current = -1; wait.current++; busy.current = false; };
    return invalidate;
  }, [scopeState]);
  useLayoutEffect(() => {
    const start = () => { composingRef.current = true; setComposing(true); }, end = () => { composingRef.current = false; setComposing(false); };
    document.addEventListener('compositionstart', start, true); document.addEventListener('compositionend', end, true);
    return () => { document.removeEventListener('compositionstart', start, true); document.removeEventListener('compositionend', end, true); };
  }, []);
  const visible = state.epoch === scopeState.epoch && (!state.prepared || sameReportRunScope(state.prepared.anchor.scope, options.scope));
  const shown = visible ? state : empty(scopeState.epoch);
  const snapshot = options.readSnapshot();
  const section = snapshot?.content.report.find(s => s.id === options.sectionId) ?? null;
  const staleReason = options.disabled && shown.prepared ? '报告任务正在执行，请等待结束后重新核对候选。' : shown.prepared && snapshot ? revisionProblem(shown.prepared.anchor, snapshot, options.design, options.readScope()) : shown.prepared ? '编辑器尚未就绪。' : null;
  const baseReason = !options.scope.owner ? '登录后使用自己的报告模型服务。' : !options.service ? '请在模型设置中选择报告拟稿服务。' : options.disabled ? '请等待当前报告任务结束。' : !section ? '请先在报告中选择章节。' : null;
  const update = (next: State) => { stateRef.current = next; setState(next); };
  const current = (s: State) => s.epoch === epoch.current && !!s.prepared && sameReportRunScope(s.prepared.anchor.scope, env.current.readScope());
  const problem = (s: State) => {
    const live = env.current.readSnapshot();
    return !current(s) ? '研究会话已变化，请重新选择章节。' : !live ? '编辑器尚未就绪。' : revisionProblem(s.prepared!.anchor, live, env.current.design, env.current.readScope());
  };
  const prepare = () => {
    if (busy.current || composingRef.current || (stateRef.current.epoch === epoch.current && ['running', 'unknown'].includes(stateRef.current.phase))) return;
    const e = env.current;
    e.mountEditor();
    const live = e.readSnapshot();
    try {
      if (e.disabled) throw Error('请等待当前报告任务结束。');
      if (!live || !e.sectionId) throw Error('编辑器正在准备，请稍后重试。');
      if (!e.service) throw Error('请先选择报告拟稿服务。');
      const prepared = prepareSectionRevision(live, e.sectionId, e.design, e.readScope(), e.service);
      update({ ...empty(epoch.current), phase: 'confirm', prepared, serviceLabel: `${e.service.label} · ${e.service.model} · v${e.service.revision}` });
    } catch (error) { update({ ...empty(epoch.current), phase: 'error', reason: errorMessage(error) }); }
  };
  const receive = (s: State, receipt: Awaited<ReturnType<typeof sendDraft>>) => {
    if (receipt.id !== s.prepared!.request.idempotencyKey || receipt.node !== 'section.revision') {
      update({ ...s, phase: 'unknown', reason: '回执与本次请求不一致，请核对原请求回执。' }); return;
    }
    if (receipt.status === 'ready' && receipt.paragraphs.length) {
      update({ ...s, phase: 'ready', proposal: proposalFromReceipt(s.prepared!, receipt), usage: receipt.usage,
        reason: receipt.droppedParagraphs ? `已丢弃 ${receipt.droppedParagraphs} 段无效数字或引用；候选仍需人工复核。` : null });
    } else if (receipt.status === 'failed' || receipt.status === 'ready') update({ ...s, phase: 'error', usage: receipt.usage, reason: '未返回可用正文，原文已保留。' });
    else update({ ...s, phase: 'unknown', reason: '结果尚未明确。核对只读取原请求回执，不会重新调用模型。' });
  };
  const dispatch = async (readOnly: boolean) => {
    const s = stateRef.current, e = env.current;
    if (busy.current || composingRef.current || !s.prepared || !current(s) || (readOnly ? s.phase !== 'unknown' : s.phase !== 'confirm')) return;
    const changed = problem(s);
    if (!readOnly && (changed || e.disabled || e.readDisabled?.() || !e.service || s.prepared.request.serviceId !== e.service.id || s.prepared.request.serviceRevision !== e.service.revision)) {
      update({ ...s, phase: 'error', reason: changed ?? '任务或模型配置已变化，请重新确认本次发送。' }); return;
    }
    busy.current = true; const ticket = ++wait.current;
    update({ ...s, phase: 'running', reason: readOnly ? '正在核对原请求回执…' : null });
    try {
      const receipt = readOnly ? await readDraft(s.prepared.request.idempotencyKey, new Set(s.prepared.facts.map(f => f.id))) : await sendDraft(e.mutate, s.prepared.request);
      if (wait.current === ticket && current(s)) receive(s, receipt);
    } catch (error) {
      if (wait.current !== ticket || !current(s)) return;
      const definite = error instanceof HostedApiError && (readOnly ? error.status === 404 : isDefiniteChatRejection(error.status, error.code));
      update({ ...s, phase: definite ? 'error' : 'unknown', reason: definite ? `本次未得到可用结果：${errorMessage(error)}` : '调用结果未知，请核对原请求回执；不要重复生成。' });
    } finally { if (wait.current === ticket) busy.current = false; }
  };
  return {
    section: shown.prepared ? { id: shown.prepared.anchor.sectionId, title: (JSON.parse(shown.prepared.anchor.section) as { title: string }).title } : section ? { id: section.id, title: section.title } : null, phase: shown.phase,
    original: shown.prepared?.original ?? (section ? revisionProse(section) : []), proposed: shown.proposal?.paragraphs ?? [], evidence: shown.prepared?.evidence ?? [],
    serviceLabel: shown.serviceLabel ?? (options.service ? `${options.service.label} · ${options.service.model} · v${options.service.revision}` : null),
    reason: shown.reason ?? (shown.phase === 'idle' ? baseReason : null), staleReason, canStart: !baseReason && !options.disabled, composing,
    usageLabel: shown.usage ? usageText(shown.usage) : null,
    onPrepare: prepare, onConfirm: () => void dispatch(false), onCheck: () => void dispatch(true), onOpenSettings: options.openSettings,
    onKeep: () => {
      const s = stateRef.current; wait.current++; busy.current = false;
      if (s.phase === 'running' || s.phase === 'unknown') update({ ...s, phase: 'unknown', reason: '已停止等待，原文保留。远端调用可能仍在执行；可稍后核对回执。' });
      else update(empty(epoch.current));
    },
    onApply: () => {
      const s = stateRef.current;
      if (s.phase !== 'ready' || !s.proposal || composingRef.current) return;
      if (env.current.disabled || env.current.readDisabled?.()) { update({ ...s, reason: '报告任务正在执行，暂时不能采纳修订。' }); return; }
      const changed = problem(s);
      if (changed) { update({ ...s, reason: changed }); return; }
      const result = env.current.apply(s.proposal, env.current.readScope());
      update(result.ok ? { ...s, phase: 'applied', reason: '已采纳本节修订，可在编辑器中撤销；写作检查已按当前正文更新。' } : { ...s, reason: result.reason });
    },
  };
}
