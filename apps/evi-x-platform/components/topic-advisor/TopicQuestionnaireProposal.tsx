'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prepareTopicQuestionnaire, applyTopicQuestionnaire, type TopicQuestionnaireSource, type TopicQuestionnaireTarget, type TopicQuestionnaireBinding, type TopicQuestionnaireApplication, type TopicQuestionnaireMapping, type TopicQuestionnaireProposal as CoreProposal } from '@/lib/topic-questionnaire';
import { stableStringify } from '@/lib/topic-advisor/parse';
import styles from './TopicQuestionnaireProposal.module.css';

export type TopicQuestionnaireProposalProps = {
  source: TopicQuestionnaireSource | null; target: TopicQuestionnaireTarget; binding: TopicQuestionnaireBinding | null;
  scopeKey: string; writable: boolean; onApply: (application: TopicQuestionnaireApplication) => Promise<void> | void; onClose: () => void; applyLabel?: string;
};
type Preview = { proposal: CoreProposal; scopeKey: string; signature: string; contextEpoch: number; mappingEpoch: number };
type Token = { scopeKey: string; signature: string; contextEpoch: number; mappingEpoch: number; editEpoch: number };
const message = (error: unknown) => { const detail = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'message') : undefined; return detail && Object.hasOwn(detail, 'value') && typeof detail.value === 'string' ? detail.value : '无法完成本次操作，请重新预览并核对。'; };

/** Proposes a local design transaction. Parent owns authorization, atomic commit, persistence and undo. */
export default function TopicQuestionnaireProposal({ source, target, binding, scopeKey, writable, onApply, onClose, applyLabel }: TopicQuestionnaireProposalProps) {
  const [mappings, setMappings] = useState<TopicQuestionnaireMapping[]>([]), [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [mappingRevision, setMappingRevision] = useState(0);
  const [editRevision, setEditRevision] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [failed, setFailed] = useState(false), [submitted, setSubmitted] = useState(false), [closed, setClosed] = useState(false);
  const alive = useRef(true), busyRef = useRef(false), closedRef = useRef(false), contextEpoch = useRef(0), mappingEpoch = useRef(0), editEpoch = useRef(0), operationEpoch = useRef(0);
  const latest = useRef({ source, target, binding, scopeKey, writable }), callbacks = useRef({ onApply, onClose });
  let signature = '', inputError = '';
  try { signature = stableStringify({ source, target, binding, scopeKey, writable }); } catch { inputError = '当前输入尚不能比较，请核对研究简报和问卷。'; }
  const [fence, setFence] = useState({ signature, epoch: 0 }), previousScope = useRef(scopeKey);
  const currentEpoch = fence.signature === signature ? fence.epoch : fence.epoch + 1;
  // Remember observed changes, including edit-undo, without mutating refs during render.
  if (fence.signature !== signature) setFence({ signature, epoch: currentEpoch });
  useLayoutEffect(() => { latest.current = { source, target, binding, scopeKey, writable }; callbacks.current = { onApply, onClose }; contextEpoch.current = currentEpoch; }, [source, target, binding, scopeKey, writable, onApply, onClose, currentEpoch]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey; mappingEpoch.current++; setMappingRevision(value => value + 1); editEpoch.current++; setEditRevision(value => value + 1); operationEpoch.current++; closedRef.current = false; busyRef.current = false;
    setMappings([]); setPreview(null); setSelected([]); setFailed(false); setSubmitted(false); setClosed(false);
    setBusy(null); setNotice(''); setError('工作范围已变化，请在当前范围重新预览。');
  }, [scopeKey]);
  const sameScope = preview?.scopeKey === scopeKey;
  const current = Boolean(preview && sameScope && preview.signature === signature && preview.contextEpoch === currentEpoch && preview.mappingEpoch === mappingRevision);
  const blocked = inputError || (!source ? '请先选择一个已保存的研究简报版本。' : source.dirty ? '选题仍有未保存修改，请先保存后再预览。' : target.pending ? '问卷仍有未完成输入，请处理后再预览。' : '');
  function token(): Token { return { scopeKey, signature, contextEpoch: currentEpoch, mappingEpoch: mappingRevision, editEpoch: editRevision }; }
  function previewIsCurrent(value: Preview): boolean {
    if (!alive.current || closedRef.current || value.scopeKey !== latest.current.scopeKey || value.contextEpoch !== contextEpoch.current || value.mappingEpoch !== mappingEpoch.current) return false;
    try { return value.signature === stableStringify(latest.current); } catch { return false; }
  }
  function markEdit() { editEpoch.current++; setEditRevision(value => value + 1); }
  function stillCurrent(value: Token): boolean {
    if (!alive.current || closedRef.current || value.scopeKey !== latest.current.scopeKey || value.contextEpoch !== contextEpoch.current || value.mappingEpoch !== mappingEpoch.current || value.editEpoch !== editEpoch.current) return false;
    try { return value.signature === stableStringify(latest.current); } catch { return false; }
  }
  function changeMapping(questionId: string, field: 'researchQuestionIds' | 'constructIds', id: string, checked: boolean) {
    if (!writable || !latest.current.writable || scopeKey !== latest.current.scopeKey || busyRef.current || closedRef.current) return;
    mappingEpoch.current++; setMappingRevision(value => value + 1); markEdit(); setSubmitted(false); setNotice('');
    setMappings(old => {
      const prior = old.find(m => m.questionId === questionId) ?? { questionId, researchQuestionIds: [], constructIds: [] };
      const next = { ...prior, [field]: checked ? [...new Set([...prior[field], id])] : prior[field].filter(value => value !== id) };
      return [...old.filter(m => m.questionId !== questionId), ...(next.researchQuestionIds.length || next.constructIds.length ? [next] : [])];
    });
  }
  function selectField(id: string, checked: boolean) {
    if (!writable || !latest.current.writable || busyRef.current || !preview || !previewIsCurrent(preview) || !current || failed || submitted || closedRef.current || preview.proposal.fields.find(f => f.id === id)?.issues.length) return;
    markEdit(); setSelected(old => checked ? [...new Set([...old, id])] : old.filter(value => value !== id));
  }
  function clearMappings() {
    if (!writable || busyRef.current || closedRef.current) return;
    mappingEpoch.current++; setMappingRevision(value => value + 1); markEdit(); setMappings([]); setSelected([]); setFailed(false); setSubmitted(false); setError(''); setNotice('已清空题目关联选择，请重新预览字段变化。');
  }
  async function compare() {
    if (busyRef.current || blocked || closedRef.current || !source) return;
    const start = token(), input = latest.current;
    if (!stillCurrent(start)) return;
    const operation = ++operationEpoch.current;
    busyRef.current = true; setBusy('preview'); setError(''); setNotice('');
    try {
      const proposal = await prepareTopicQuestionnaire(source, input.target, mappings, input.binding);
      if (operation !== operationEpoch.current || !alive.current) return;
      if (start.scopeKey !== latest.current.scopeKey || closedRef.current) return;
      const valid = stillCurrent(start);
      setPreview({ proposal, scopeKey: start.scopeKey, signature: start.signature, contextEpoch: start.contextEpoch, mappingEpoch: start.mappingEpoch });
      markEdit(); setSelected([]); setFailed(false); setSubmitted(false);
      if (!valid) setError('预览期间输入发生变化。旧提案保留供核对，请重新预览。');
      else setNotice(proposal.fields.length ? '已列出拟议变化。请逐项选择要采用的字段。' : '没有需要修改的字段；原问卷保持当前内容。');
    } catch (cause) { if (operation === operationEpoch.current && alive.current && start.scopeKey === latest.current.scopeKey && !closedRef.current) { markEdit(); setFailed(true); setError(message(cause)); } }
    finally { if (operation === operationEpoch.current) { busyRef.current = false; if (alive.current) setBusy(null); } }
  }
  async function adopt() {
    if (busyRef.current || !writable || !latest.current.writable || !preview || !previewIsCurrent(preview) || !current || blocked || failed || submitted || !selected.length || !source || closedRef.current) return;
    // Preserve the preview's original fence; a retained event handler cannot stamp it with a newer epoch.
    const start: Token = { ...token(), scopeKey: preview.scopeKey, signature: preview.signature, contextEpoch: preview.contextEpoch, mappingEpoch: preview.mappingEpoch }, input = latest.current, selection = [...selected], proposal = preview.proposal;
    if (!stillCurrent(start)) return;
    const operation = ++operationEpoch.current;
    busyRef.current = true; setBusy('apply'); setError(''); setNotice('');
    try {
      const application = await applyTopicQuestionnaire(proposal, source, input.target, selection, input.binding);
      if (operation !== operationEpoch.current) return;
      if (!stillCurrent(start) || !previewIsCurrent(preview)) { if (alive.current && start.scopeKey === latest.current.scopeKey && !closedRef.current) setError('应用前输入发生变化，未向问卷工作区提交旧提案。请重新预览。'); return; }
      await callbacks.current.onApply(application);
      if (operation !== operationEpoch.current || !alive.current || closedRef.current || start.scopeKey !== latest.current.scopeKey) return;
      if (!stillCurrent(start)) { markEdit(); setError('当前内容已变化，请在问卷工作区核对结果；旧提案不再可采用。'); setFailed(true); return; }
      markEdit(); setSubmitted(true); setNotice('所选修改已交给问卷工作区。请核对问卷及其保存状态。');
    } catch (cause) { if (operation === operationEpoch.current && alive.current && start.scopeKey === latest.current.scopeKey && !closedRef.current) { markEdit(); setFailed(true); setError(`尚未确认应用完成：${message(cause)}`); } }
    finally { if (operation === operationEpoch.current) { busyRef.current = false; if (alive.current) setBusy(null); } }
  }
  function close() { if (closedRef.current) return; closedRef.current = true; markEdit(); operationEpoch.current++; busyRef.current = false; setBusy(null); setClosed(true); callbacks.current.onClose(); }
  const choicesDisabled = !writable || Boolean(busy) || closed;
  const visiblePreview = sameScope ? preview : null;
  return <section className={styles.root} aria-label="选题到问卷的待确认提案" data-self-styled>
    <div className={styles.heading}><div><span className={styles.eyebrow}>研究简报 → 问卷设计</span><h3>选择要带入问卷的内容</h3></div><button type="button" onClick={close}>关闭提案</button></div>
    <p className={styles.note}>逐项核对简介与题目关联。内容仍为待实施设计，来源文字需要研究团队核验。</p>
    {source && <p className={styles.meta}>来源：{source.brief.title || '未命名研究简报'} · v{source.version.revision} · {source.version.id}</p>}
    {!writable && <p className={styles.warning}>当前为只读模式，可预览简介变化；采用内容需要编辑权限。</p>}
    {blocked && <p className={styles.warning} role="status">{blocked}</p>}
    <details className={styles.mapping}><summary>关联已有题目 <span>{mappings.length} 题已选择关联</span></summary>
      <p className={styles.note}>先选择研究问题，再按需选择概念。概念关联的研究问题需同时选中；系统会检查这些稳定标识的对应关系。</p>
      <button type="button" disabled={choicesDisabled || !mappings.length} onClick={clearMappings}>清空题目关联选择</button>
      {!target.design.questions.length && <p className={styles.note}>当前问卷没有题目。仍可比较简介字段；本提案不会自动创建调查题目或答案。</p>}
      {source && target.design.questions.map((question, index) => {
        const mapping = mappings.find(m => m.questionId === question.id);
        return <details key={question.id} className={styles.question}><summary><span>{index + 1}. {question.text || '题干待填写'}</span><small>{question.variable || question.id}</small></summary>
          <div className={styles.mappingColumns}><fieldset disabled={choicesDisabled}><legend>研究问题</legend>{!source.brief.questions.length && <p>简报尚未列出研究问题。</p>}{source.brief.questions.map(rq => <label key={rq.id} className={styles.option}><input type="checkbox" aria-label={`题目 ${question.id} 关联研究问题 ${rq.id}`} checked={mapping?.researchQuestionIds.includes(rq.id) ?? false} onChange={event => changeMapping(question.id, 'researchQuestionIds', rq.id, event.target.checked)}/><span>{rq.text || '（研究问题文字为空）'}<small>{rq.id}</small></span></label>)}</fieldset>
          <fieldset disabled={choicesDisabled}><legend>概念</legend>{!source.brief.constructs.length && <p>简报尚未列出概念。</p>}{source.brief.constructs.map(construct => <label key={construct.id} className={styles.option}><input type="checkbox" aria-label={`题目 ${question.id} 关联概念 ${construct.id}`} checked={mapping?.constructIds.includes(construct.id) ?? false} onChange={event => changeMapping(question.id, 'constructIds', construct.id, event.target.checked)}/><span>{construct.name || '（概念名称为空）'}<small>{construct.id} · 对应研究问题：{construct.questionIds.join('、') || '尚未关联'}</small></span></label>)}</fieldset></div>
        </details>;
      })}
    </details>
    <div className={styles.actions}><button type="button" disabled={Boolean(busy) || Boolean(blocked) || closed} onClick={() => void compare()}>{busy === 'preview' ? '正在比较…' : preview ? '重新预览字段变化' : '预览字段变化'}</button></div>
    {visiblePreview && <div className={styles.preview}>
      <p className={styles.meta}>本提案绑定来源 v{visiblePreview.proposal.source.version.revision} · {visiblePreview.proposal.source.version.id}</p>
      {!current && <p className={styles.warning} role="status">来源、问卷或关联选择已变化。旧提案保留供核对，请重新预览后采用。</p>}
      <div className={styles.fields}>{visiblePreview.proposal.fields.map(field => <article key={field.id} className={styles.field} data-change-id={field.id}>
        <label className={styles.choose}><input type="checkbox" aria-label={`采用字段 ${field.id}`} checked={selected.includes(field.id)} disabled={!writable || !current || Boolean(busy) || Boolean(field.issues.length) || failed || submitted || closed} onChange={event => selectField(field.id, event.target.checked)}/><strong>{field.label}</strong><span>{field.kind === 'question' && field.before === field.after ? '文字相同 · 可记录关联' : field.before.trim() ? '已有内容，需明确选择' : '当前为空'}</span></label>
        <div className={styles.diff}><div><small>当前内容</small><p>{field.before || '（空）'}</p></div><div><small>拟写入 · {field.after.length} / {field.max} 字符</small><p>{field.after || '（空）'}</p></div></div>
        {field.issues.map((issue, index) => <p key={index} className={styles.error}>{issue.message}</p>)}
      </article>)}</div>
      <div className={styles.footer}><p>仅提交勾选字段。现有题目及其稳定标识、选项和显示条件由提案保留。</p><button type="button" className={styles.primary} disabled={!writable || !current || Boolean(busy) || Boolean(blocked) || !selected.length || failed || submitted || closed} onClick={() => void adopt()}>{busy === 'apply' ? '正在核对并提交…' : applyLabel || `采用 ${selected.length} 个所选字段`}</button></div>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
  </section>;
}
