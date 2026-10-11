'use client';
import { useEffect, useRef, useState } from 'react';
import { HostedApiError, errorMessage, hostedRequest } from '@/components/hosted/api-client';
import { parsePublicSurvey, parseSurveyReceipt, pruneSurveyDraft, shownSurveyQuestions, validateSurveyDraft, type PublicSurvey as Survey, type SurveyDraft, type SurveyReceipt, type SurveySubmission } from '@/lib/survey-collection';
import styles from './PublicSurvey.module.css';

type Recovery = { schema: 'survey-response-session/v1'; releaseId: string; pending: SurveySubmission | null; receipt: SurveyReceipt | null };
export default function PublicSurvey({ token }: { token: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null), [draft, setDraft] = useState<SurveyDraft>({});
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [consent, setConsent] = useState(false), [receipt, setReceipt] = useState<SurveyReceipt | null>(null);
  const pending = useRef<SurveySubmission | null>(null), mounted = useRef(true), lock = useRef(false);
  const storageKey = `evix.survey-response.v1:${token}`;
  useEffect(() => {
    mounted.current = true; let currentRequest = true; const controller = new AbortController();
    void hostedRequest(`/api/surveys/${encodeURIComponent(token)}`, { signal: controller.signal }).then(value => {
      if (!mounted.current || !currentRequest) return;
      const current = parsePublicSurvey(value); setSurvey(current);
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw || raw.length > 200_000) return;
        const saved = JSON.parse(raw) as Recovery;
        if (saved.schema !== 'survey-response-session/v1' || saved.releaseId !== current.id) return;
        if (saved.receipt) { setReceipt(parseSurveyReceipt(saved.receipt, current.id)); return; }
        if (saved.pending && /^[a-f0-9-]{36}$/i.test(saved.pending.idempotencyKey) && saved.pending.answers && typeof saved.pending.answers === 'object') {
          const recovered: SurveyDraft = {};
          for (const [id, answer] of Object.entries(saved.pending.answers)) {
            if (!current.questions.some(q => q.id === id) || (answer !== null && typeof answer !== 'string' && typeof answer !== 'number' && !(Array.isArray(answer) && answer.every(v => typeof v === 'string')))) throw Error('恢复记录格式无效。');
            if (answer !== null) recovered[id] = Array.isArray(answer) ? answer : String(answer);
          }
          if (Object.keys(validateSurveyDraft(current.questions, recovered).errors).length) throw Error('恢复记录需要核对。');
          pending.current = saved.pending; setDraft(recovered); setConsent(true); setUncertain(true);
        }
      } catch { setError('上次提交记录无法恢复，请核对后重新填写。'); }
    }).catch(e => { if (mounted.current && currentRequest) setError(errorMessage(e)); }).finally(() => { if (mounted.current && currentRequest) setLoading(false); });
    return () => { currentRequest = false; mounted.current = false; controller.abort(); };
  }, [token, storageKey]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (!receipt && Object.keys(draft).length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [draft, receipt]);
  function remember(value: Recovery) { try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The frozen request remains in this mounted page. */ } }
  function change(id: string, value: string | string[]) {
    if (!survey || busy || uncertain) return;
    setDraft(current => pruneSurveyDraft(survey.questions, { ...current, [id]: value }));
    setErrors({}); setError('');
  }
  async function submit() {
    if (!survey || lock.current || receipt || (!uncertain && survey.status === 'closed')) return;
    const checked = validateSurveyDraft(survey.questions, draft); setErrors(checked.errors); setError('');
    if (Object.keys(checked.errors).length) { document.getElementById(`survey-${Object.keys(checked.errors)[0]}`)?.focus(); return; }
    if (!consent) { setError('请先确认自愿参与本次调查。'); return; }
    pending.current ??= { idempotencyKey: crypto.randomUUID(), answers: checked.answers };
    const request = pending.current;
    remember({ schema: 'survey-response-session/v1', releaseId: survey.id, pending: request, receipt: null });
    lock.current = true; setBusy(true);
    try {
      const received = parseSurveyReceipt(await hostedRequest(`/api/surveys/${encodeURIComponent(token)}/responses`, { method: 'POST', body: request }), survey.id);
      if (!mounted.current) return;
      remember({ schema: 'survey-response-session/v1', releaseId: survey.id, pending: null, receipt: received });
      pending.current = null; setReceipt(received); setDraft({}); setUncertain(false);
    } catch (e) {
      if (!mounted.current) return;
      setError(errorMessage(e));
      if (e instanceof HostedApiError && e.status >= 400 && e.status < 500 && e.code !== 'invalid_server_receipt') {
        pending.current = null; setUncertain(false); try { sessionStorage.removeItem(storageKey); } catch { /* input remains on page */ }
      } else setUncertain(true);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const visible = survey ? shownSurveyQuestions(survey.questions, draft) : [];
  const answered = visible.filter(q => { const answer = draft[q.id]; return typeof answer === 'string' ? !!answer.trim() : !!answer?.length; }).length;
  return <main className={styles.page}>
    <header className={styles.masthead}><span>调查问卷</span><span>{survey?.classification === 'synthetic' ? '合成验收' : '分享你的真实看法'}</span></header>
    {loading ? <section className={styles.card}><p role="status">正在打开问卷…</p></section> : !survey ? <section className={styles.card}><h1>暂时无法打开问卷</h1><p role="alert">{error}</p><button onClick={() => location.reload()}>重新打开</button></section> : receipt ? <section className={`${styles.card} ${styles.complete}`}><span className={styles.check} aria-hidden="true">✓</span><h1>回答已收到</h1><p>谢谢你参与「{survey.title}」。</p><dl><div><dt>提交时间</dt><dd>{new Date(receipt.submittedAt).toLocaleString('zh-CN')}</dd></div><div><dt>回执编号</dt><dd>{receipt.id}</dd></div></dl><p className={styles.muted}>本页已确认提交成功。</p></section> : <>
      <section className={styles.card}><span className={styles.kicker}>{survey.status === 'open' ? '正在收集回答' : '本次调查已结束'}</span><h1>{survey.title}</h1><p className={styles.introduction}>{survey.introduction}</p>{survey.classification === 'synthetic' && <p className={styles.muted}>本次为合成流程验收。</p>}<div className={styles.progress}><span>已回答 {answered} / {visible.length} 题</span><span>带 * 的题目为必答</span></div><progress value={answered} max={Math.max(1, visible.length)} aria-label="问卷回答进度"/></section>
      {(survey.status === 'open' || uncertain) && <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
        {visible.map((q, index) => <fieldset key={q.id} id={`survey-${q.id}`} tabIndex={-1} className={styles.question} disabled={busy || uncertain} aria-describedby={errors[q.id] ? `error-${q.id}` : undefined}>
          <legend><span className={styles.number}>{String(index + 1).padStart(2, '0')}</span><span>{q.text}{q.required && <em aria-label="必答"> *</em>}</span></legend>
          {(q.type === 'single' || q.type === 'multi') && <div className={styles.choices}>{q.choices.map(choice => <label key={choice.code}><input type={q.type === 'single' ? 'radio' : 'checkbox'} name={q.id} value={choice.code} checked={q.type === 'single' ? draft[q.id] === choice.code : Array.isArray(draft[q.id]) && (draft[q.id] as string[]).includes(choice.code)} onChange={event => { if (q.type === 'single') change(q.id, choice.code); else { const previous = Array.isArray(draft[q.id]) ? draft[q.id] as string[] : []; change(q.id, event.target.checked ? [...previous, choice.code] : previous.filter(code => code !== choice.code)); } }}/><span>{choice.label}</span></label>)}</div>}
          {q.type === 'likert' && <div className={styles.scale}><div className={styles.anchors}><span>{q.minLabel}</span><span>{q.maxLabel}</span></div><div className={styles.points}>{Array.from({ length: q.max! - q.min! + 1 }, (_, offset) => q.min! + offset).map(value => <label key={value}><input type="radio" name={q.id} value={value} checked={draft[q.id] === String(value)} onChange={() => change(q.id, String(value))}/><span>{value}</span></label>)}</div></div>}
          {q.type === 'number' && <label className={styles.field}><span className={styles.muted}>数值{q.min !== null || q.max !== null ? ` · ${q.min ?? '不限'} 至 ${q.max ?? '不限'}` : ''}</span><input aria-label={q.text} type="text" inputMode="decimal" maxLength={64} value={typeof draft[q.id] === 'string' ? draft[q.id] : ''} onChange={event => change(q.id, event.target.value)}/></label>}
          {q.type === 'text' && <label className={styles.field}><textarea aria-label={q.text} maxLength={2000} rows={4} value={typeof draft[q.id] === 'string' ? draft[q.id] : ''} onChange={event => change(q.id, event.target.value)}/><span className={styles.muted}>{draft[q.id]?.length || 0} / 2,000</span></label>}
          {!q.required && draft[q.id] !== undefined && <button className={styles.clear} type="button" onClick={() => change(q.id, q.type === 'multi' ? [] : '')}>清除此题回答</button>}
          {errors[q.id] && <p id={`error-${q.id}`} className={styles.error}>{errors[q.id]}</p>}
        </fieldset>)}
        <section className={styles.card}><label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy || uncertain} onChange={event => setConsent(event.target.checked)}/><span>我已阅读调查说明，自愿参与并提交以上回答。</span></label>{error && <p className={styles.error} role="alert">{error}</p>}{uncertain && <p role="status">提交结果待核对，重试会沿用同一份回答。</p>}<button type="submit" className={styles.submit} disabled={busy || !consent}>{busy ? '正在确认提交…' : uncertain ? '核对并重试原提交' : '提交回答'}<span aria-hidden="true">→</span></button></section>
      </form>}
    </>}
  </main>;
}
