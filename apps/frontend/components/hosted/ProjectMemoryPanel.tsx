'use client';

import { useEffect, useState } from 'react';
import { DECISION_SCOPES, INTENT_FIELDS, ROLE_LABELS, type DecisionScope, type IntentField, type MemorySnapshot, type ProjectMemoryDocument } from '@evix/shared';
import { errorMessage } from './api-client';
import { fetchMemoryVersions, type MemoryVersionHead } from './project-memory-client';
import { useProjectMemory, type ProjectMemoryState } from './useProjectMemory';
import CloudProcessBackups from './CloudProcessBackups';

const INTENT_LABELS: Record<IntentField, string> = {
  title: '题目', researchQuestion: '研究问题', decisionGoal: '决策目标', population: '调查对象', geography: '地区', stage: '当前阶段',
};
const INTENT_FIELDS_LIST = [...INTENT_FIELDS];
const SCOPES = [...DECISION_SCOPES];

export default function ProjectMemoryPanel({ projectId, role }: { projectId: string; role: keyof typeof ROLE_LABELS }) {
  const memory = useProjectMemory(projectId);
  if (memory.status === 'loading' && !memory.snapshot) return <p className="hosted-loading" role="status">正在读取项目记忆…</p>;
  if (memory.status === 'error') return <p className="hosted-alert" role="alert">{memory.error}</p>;
  if (!memory.snapshot) return <p className="hosted-small">还没有可显示的项目记忆。</p>;
  return <MemoryEditor key={projectId} projectId={projectId} role={role} memory={memory} snapshot={memory.snapshot} />;
}

function MemoryEditor({ projectId, role, memory, snapshot: initial }: {
  projectId: string; role: keyof typeof ROLE_LABELS; memory: ProjectMemoryState; snapshot: MemorySnapshot;
}) {
  const [document, setDocument] = useState<ProjectMemoryDocument>(initial.document);
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [versions, setVersions] = useState<MemoryVersionHead[]>([]);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let live = true;
    fetchMemoryVersions(projectId).then(items => { if (live) setVersions(items); })
      .catch(reason => { if (live) setHistoryError(errorMessage(reason)); });
    return () => { live = false; };
  }, [projectId]);

  const edit = (next: ProjectMemoryDocument) => { setDocument(next); setDirty(true); setNotice(''); setSaveError(''); };
  const canEdit = !!memory.snapshot?.permissions.canEdit;
  const setIntent = (field: IntentField, value: string) => edit({
    ...document,
    intent: { ...document.intent, [field]: value.trim()
      ? { value, status: 'confirmed', source: { kind: 'user' }, confirmedAt: new Date().toISOString() }
      : { value: '', status: 'unknown' } },
  });
  const setDecision = (id: string, patch: Partial<ProjectMemoryDocument['decisions'][number]>) => edit({
    ...document, decisions: document.decisions.map(item => item.id === id ? { ...item, ...patch } : item),
  });
  const setQuestion = (id: string, patch: Partial<ProjectMemoryDocument['openQuestions'][number]>) => edit({
    ...document, openQuestions: document.openQuestions.map(item => item.id === id ? { ...item, ...patch } : item),
  });
  const addDecision = () => edit({
    ...document,
    decisions: [...document.decisions, { id: crypto.randomUUID(), statement: '', rationale: '', scope: 'general', status: 'confirmed', source: { kind: 'user' }, confirmedAt: new Date().toISOString() }],
  });
  const addQuestion = () => edit({
    ...document,
    openQuestions: [...document.openQuestions, { id: crypto.randomUUID(), question: '', why: '', next: '', status: 'open', createdAt: new Date().toISOString() }],
  });
  const applySeed = () => {
    const seed = memory.snapshot?.seed;
    if (!seed) return;
    const next = { ...document };
    for (const [field, value] of Object.entries(seed.intent)) {
      if (!value || !INTENT_FIELDS.includes(field as IntentField)) continue;
      next.intent = { ...next.intent, [field as IntentField]: { value, status: 'confirmed', source: seed.source, confirmedAt: new Date().toISOString() } };
    }
    edit(next);
  };
  const valid = document.decisions.every(item => item.statement.trim())
    && document.openQuestions.every(item => item.question.trim());
  const save = async () => {
    setBusy(true); setSaveError(''); setNotice('');
    try {
      await memory.save(document, note.trim());
      setDirty(false); setNote(''); setNotice('已保存为新的项目记忆版本。');
      setVersions(await fetchMemoryVersions(projectId));
    } catch (reason) {
      setSaveError(errorMessage(reason));
    } finally { setBusy(false); }
  };

  return <section className="hosted-card hosted-memory" aria-labelledby="project-memory-title">
    <div className="hosted-section-title">
      <div>
        <h3 id="project-memory-title">项目档案</h3>
        <p className="hosted-small">研究意图、已确认决策与开放问题；只有负责人和编辑成员可以写入。当前身份：{ROLE_LABELS[role]}。</p>
      </div>
      <div className="hosted-actions">
        <span className="hosted-small">当前第 {memory.snapshot?.revision ?? 0} 版</span>
        <button className="hosted-primary" disabled={!canEdit || !dirty || !valid || busy} onClick={() => void save()}>{busy ? '正在保存…' : '保存新版本'}</button>
      </div>
    </div>
    {memory.snapshot?.revision === 0 && memory.snapshot.seed && <div className="hosted-notice">
      <p>这个项目还没有项目记忆。可以从已确认的选题带入，带入后仍需要你检查并保存。</p>
      <button disabled={!canEdit} onClick={applySeed}>从选题带入</button>
    </div>}
    {saveError && <p className="hosted-alert" role="alert">{saveError}</p>}
    {notice && <p className="hosted-notice" role="status">{notice}</p>}

    <section className="hosted-memory-section" aria-labelledby="memory-intent">
      <h4 id="memory-intent">研究意图</h4>
      <div className="hosted-memory-grid">
        {INTENT_FIELDS_LIST.map(field => <label key={field}>
          <span>{INTENT_LABELS[field]}</span>
          <textarea rows={field === 'title' ? 2 : 3} maxLength={600} value={document.intent[field].value} disabled={!canEdit}
            onChange={event => setIntent(field, event.target.value)} />
        </label>)}
      </div>
    </section>

    <section className="hosted-memory-section" aria-labelledby="memory-decisions">
      <div className="hosted-section-title"><h4 id="memory-decisions">已确认决策</h4><button disabled={!canEdit} onClick={addDecision}>新增决策</button></div>
      {!document.decisions.length && <p className="hosted-small">还没有记录决策。把“为什么这样定”写下来，下一段对话就不用重新解释。</p>}
      {document.decisions.map(item => <div className="hosted-memory-entry" key={item.id}>
        <label><span>结论</span><input maxLength={1200} value={item.statement} disabled={!canEdit} onChange={event => setDecision(item.id, { statement: event.target.value })} /></label>
        <label><span>理由</span><textarea rows={2} maxLength={2000} value={item.rationale} disabled={!canEdit} onChange={event => setDecision(item.id, { rationale: event.target.value })} /></label>
        <div className="hosted-memory-row">
          <label><span>范围</span><select value={item.scope} disabled={!canEdit} onChange={event => setDecision(item.id, { scope: event.target.value as DecisionScope })}>{SCOPES.map(scope => <option key={scope} value={scope}>{scope}</option>)}</select></label>
          <label><span>状态</span><select value={item.status} disabled={!canEdit} onChange={event => setDecision(item.id, { status: event.target.value as typeof item.status })}><option value="confirmed">有效</option><option value="superseded">已被取代</option><option value="revoked">已撤销</option></select></label>
          <button disabled={!canEdit} onClick={() => edit({ ...document, decisions: document.decisions.filter(row => row.id !== item.id) })}>删除</button>
        </div>
      </div>)}
    </section>

    <section className="hosted-memory-section" aria-labelledby="memory-open">
      <div className="hosted-section-title"><h4 id="memory-open">开放问题</h4><button disabled={!canEdit} onClick={addQuestion}>新增问题</button></div>
      {!document.openQuestions.length && <p className="hosted-small">还没有开放问题。</p>}
      {document.openQuestions.map(item => <div className="hosted-memory-entry" key={item.id}>
        <label><span>问题</span><input maxLength={1200} value={item.question} disabled={!canEdit} onChange={event => setQuestion(item.id, { question: event.target.value })} /></label>
        <label><span>为什么重要</span><input maxLength={1000} value={item.why} disabled={!canEdit} onChange={event => setQuestion(item.id, { why: event.target.value })} /></label>
        <label><span>下一步</span><input maxLength={1000} value={item.next} disabled={!canEdit} onChange={event => setQuestion(item.id, { next: event.target.value })} /></label>
        <div className="hosted-memory-row">
          <label><span>状态</span><select value={item.status} disabled={!canEdit} onChange={event => setQuestion(item.id, { status: event.target.value as typeof item.status })}><option value="open">待解决</option><option value="resolved">已解决</option></select></label>
          <button disabled={!canEdit} onClick={() => edit({ ...document, openQuestions: document.openQuestions.filter(row => row.id !== item.id) })}>删除</button>
        </div>
      </div>)}
    </section>

    <section className="hosted-memory-section" aria-labelledby="memory-evidence">
      <div className="hosted-section-heading"><h4 id="memory-evidence">证据索引</h4><span className="hosted-small">由项目模块生成，下一阶段接入</span></div>
      <p className="hosted-small">这一版先保存研究意图、决策与开放问题；问卷、数据、结果和报告的索引将在下一阶段加入，不会存原始数据行或报告正文。</p>
    </section>

    {canEdit && <label className="hosted-memory-note"><span>本次修改说明（可选）</span><input maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="例如：补充抽样理由" /></label>}

    <CloudProcessBackups projectId={projectId} />

    <details className="hosted-project-tool hosted-memory-history"><summary><span>版本历史</span><small>{versions.length} 个版本</small></summary>
      <div className="hosted-project-tool-body">
        {historyError && <p className="hosted-alert" role="alert">{historyError}</p>}
        <div className="hosted-history">{versions.map(version => <div key={version.id}><span><strong>第 {version.revision} 版</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN')}{version.changeNote ? ` · ${version.changeNote}` : ''}</small></span></div>)}{!versions.length && <p>还没有保存过版本。</p>}</div>
      </div>
    </details>
  </section>;
}
