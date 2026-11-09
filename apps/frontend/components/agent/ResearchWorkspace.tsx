'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Service } from '@evix/shared';
import { parseDiagnosisBriefSource, type DiagnosisBriefSource } from '@/lib/diagnosis-actions';
import { prepareResearchIntake, adoptIntakeCandidate } from '@/lib/agent/research-intake';
import { prepareTopicDiagnosis } from '@/lib/agent/research-plan';
import { RESEARCH_STAGES, type ModelCallId, type ResearchStageId } from '@/lib/agent/research-stages';
import { emptyResearchWorkspaceDraft, readResearchWorkspace, writeResearchWorkspace, type ResearchWorkspaceDraft } from '@/lib/agent/research-workspace';
import { proposeTopicProfile } from '@/lib/topic-agent';
import { ACCESS_OPTIONS } from '@/lib/topic-advisor/types';
import { regionPath } from '@/lib/topic-advisor/regions';
import { emptyTopicProject, parseTopicProjectDocument, type TopicProjectDocument } from '@/lib/topic-project';
import { buildLiteratureStudy, emptyLiteratureStudy, type LiteratureStudy } from '@/lib/agent/literature-study';
import { literatureWorkspaceReceipt, literatureEvidenceReference, type LiteratureWorkspaceSnapshot } from '@/lib/topic-lab/workspace';
import { literatureEvidenceReferencesEqual } from '@/lib/topic-lab/evidence-reference';
import TopicAgent from '@/components/topic-advisor/TopicAgent';
import RegionPicker from '@/components/topic-advisor/RegionPicker';
import ResearchJourney, { type JourneyModelRoute, type ResearchJourneyStep } from './ResearchJourney';
import LiteratureStudyPanel from './LiteratureStudyPanel';
import styles from './ResearchWorkspace.module.css';

export type ResearchWorkspaceProps = {
  owner: string | null; projectId: string | null; identityEpoch: number;
  services: Service[]; modelRoutes: Partial<Record<ModelCallId, JourneyModelRoute>>;
  defaultServiceId: string | null; onDefaultServiceChange: (id: string | null) => void;
  onModelCallChange: (call: ModelCallId, id: string | null) => void;
  onOpenSettings: () => void; onOpenStage: (stage: ResearchStageId) => void;
  onTopic: (source: DiagnosisBriefSource) => void;
  onRetractTopic: (sourceId: string) => void;
  literature: LiteratureWorkspaceSnapshot | null; onLiterature: (value: LiteratureWorkspaceSnapshot | null) => void;
};
type LiteratureReceipt = Awaited<ReturnType<typeof literatureWorkspaceReceipt>>;
type LocalCheckpoint = { owner: string | null; projectId: string | null; ready: boolean; conflict: boolean; key: string; value: ResearchWorkspaceDraft };
const LITERATURE_TOPIC = 'literature-study/v1';

function hasAdoptedEvidence(selection: TopicProjectDocument, study?: LiteratureStudy) {
  return selection.brief.sources.every(source =>
    study?.evidence.some(entry => entry.id === source.id && entry.quote === source.snippet));
}

/** One browser-owned research draft. Mounted beside the same workbench editors, never their replacement. */
export default function ResearchWorkspace(props: ResearchWorkspaceProps) {
  const { owner, projectId, identityEpoch, literature } = props;
  const [draft, setDraft] = useState<ResearchWorkspaceDraft>(() => emptyResearchWorkspaceDraft());
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [saved, setSaved] = useState(false), [conflict, setConflict] = useState(false);
  const [proposal, setProposal] = useState<TopicProjectDocument | null>(null);
  const confirmPanel = useRef<HTMLElement>(null);
  const literaturePanel = useRef<HTMLDetailsElement>(null);
  const literatureProposal = proposal?.provenance.catalogVersion === LITERATURE_TOPIC ? proposal.selected?.id : null;
  const adoptedLiterature = draft.selected?.provenance.catalogVersion === LITERATURE_TOPIC ? draft.selected : null;
  const adoptedEvidenceCurrent = !adoptedLiterature || hasAdoptedEvidence(adoptedLiterature, draft.literatureStudy);
  useEffect(() => { if (literatureProposal) confirmPanel.current?.scrollIntoView({ block: 'start' }); }, [literatureProposal]);
  const [literatureResult, setLiteratureResult] = useState<{ value: LiteratureReceipt; source: LiteratureWorkspaceSnapshot; selection: TopicProjectDocument } | null>(null);
  const [literatureBusy, setLiteratureBusy] = useState(false);
  const receipt = literatureResult?.source === literature && literatureResult.selection === draft.selected ? literatureResult.value : null;
  const setReceipt = (value: LiteratureReceipt | null) => setLiteratureResult(value && literature && draft.selected ? { value, source: literature, selection: draft.selected } : null);
  const alive = useRef(true), job = useRef(0), literatureJob = useRef(0), edit = useRef(0), revision = useRef(0);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; }, [props]);
  const current = () => alive.current && latest.current.owner === owner && latest.current.projectId === projectId && latest.current.identityEpoch === identityEpoch;
  const saving = useRef(Promise.resolve());
  const saveFailed = useRef(false), committedKey = useRef(''), flushedKey = useRef('');
  const checkpoint = useRef<LocalCheckpoint | null>(null);
  useLayoutEffect(() => {
    checkpoint.current = { owner, projectId, ready, conflict, key: JSON.stringify([draft.updatedAt, edit.current, literature?.snapshotHash ?? null]), value: { ...draft, literature } };
  }, [owner, projectId, ready, conflict, draft, literature]);
  const enqueueSave = (captured: LocalCheckpoint | null, flush = false) => {
    if (!captured?.ready || !captured.owner || captured.conflict || saveFailed.current) return;
    if (flush) { if (flushedKey.current === captured.key) return; flushedKey.current = captured.key; }
    const value = structuredClone(captured.value), fixedOwner = captured.owner, fixedProject = captured.projectId;
    saving.current = saving.current.then(async () => {
      if (saveFailed.current || committedKey.current === captured.key || !flush && !current()) return;
      try {
        // Teardown may checkpoint only its captured old namespace. It never adopts
        // late results or writes into whichever account/project is now on screen.
        const next = await writeResearchWorkspace(fixedOwner, fixedProject, value, { expectedRevision: revision.current, ...(flush ? {} : { ticket: { isCurrent: current } }) });
        if (next === null) return;
        revision.current = next; committedKey.current = captured.key;
        if (current() && checkpoint.current?.key === captured.key) setSaved(true);
      } catch (reason) {
        saveFailed.current = true;
        if (current()) { setConflict(true); setError(reason instanceof Error ? reason.message : '无法保存研究草稿。'); }
      }
    });
  };
  const update = (fn: (value: ResearchWorkspaceDraft) => ResearchWorkspaceDraft) => {
    edit.current++; setSaved(false); setDraft(value => ({ ...fn(value), updatedAt: new Date().toISOString() }));
  };
  const changeResearchInput = (fn: (value: ResearchWorkspaceDraft) => ResearchWorkspaceDraft) => {
    retractAdoptedTopic();
    job.current++; literatureJob.current++; setProposal(null); setReceipt(null); setBusy(false); setLiteratureBusy(false);
    update(value => ({ ...fn(value), intake: null, selected: null, diagnosis: null }));
  };

  function retractAdoptedTopic() {
    const value = checkpoint.current?.value;
    if (value?.selected?.provenance.catalogVersion === LITERATURE_TOPIC && value.diagnosis) {
      latest.current.onRetractTopic(value.diagnosis.source.id);
    }
  }

  function changeLiteratureStudy(study: LiteratureStudy) {
    if (!ready || busy || conflict || !current()) return;
    if (literatureProposal) setProposal(null);
    if (adoptedLiterature && !hasAdoptedEvidence(adoptedLiterature, study)) retractAdoptedTopic();
    update(value => ({ ...value, literatureStudy: study }));
  }

  function chooseLiteratureTopic(candidateId: string) {
    if (!ready || busy || conflict || !current()) return;
    try {
      const study = draft.literatureStudy;
      if (!study || study.executedFor !== draft.direction.trim()) throw Error('研究方向或资料已更新，请重新运行文献分析。');
      const result = buildLiteratureStudy(study, draft.direction);
      const candidate = result.candidates.find(item => item.id === candidateId);
      if (!candidate || result.stages.find(item => item.id === 'reviewer')?.status !== 'done') throw Error('请先完成原文依据核对。');
      const sources = candidate.evidenceIds.map(id => {
        const entry = study.evidence.find(item => item.id === id);
        const paper = entry && study.papers.find(item => item.id === entry.paperId);
        if (!entry || !paper) throw Error('选题引用的原文依据已变化。');
        return { id, title: paper.title, url: '', locator: `PDF 第 ${entry.page} 页 · ${paper.filename} · SHA-256 ${paper.id}`,
          coverage: 'reference' as const, publishedAt: '', retrievedAt: '', snippet: entry.quote };
      });
      const base = emptyTopicProject(draft.profile.referenceDate);
      const title = Array.from(candidate.title).slice(0, 100).join('');
      const scope = Array.from(draft.direction.trim()).slice(0, 180).join('');
      const questions: Record<string, string> = {
        replicate: `在「${scope}」的实际样本中，按文献给出的指标重测，结果能否复现？`,
        compare: `在「${scope}」中，能否用统一指标比较两项研究的方法？`,
        limits: `在「${scope}」中，改变文献所述的一个条件后，结果会如何变化？`,
      };
      const region = draft.profile.regionRef ? regionPath(draft.profile.regionRef).map(item => item.name) : [draft.profile.region, draft.profile.city];
      setProposal(parseTopicProjectDocument({ ...base, schemaVersion: draft.profile.schemaVersion === 2 ? 2 : 1, profile: draft.profile,
        selected: { kind: 'custom', id: `literature-${crypto.randomUUID()}`, title },
        brief: { ...base.brief, title, geography: [...new Set(region.filter(Boolean))].join(' · '),
          decision: '判断是否开展这项研究，并确定预试方案。',
          questions: [{ id: 'literature-question', text: questions[candidate.id] ?? `在「${scope}」中，如何验证文献提出的研究问题？` }], evidencePlan: candidate.design,
          unknowns: [candidate.caveat], sources },
        provenance: { catalogVersion: LITERATURE_TOPIC, modelVersion: 'local-rules/v1', sourceIds: sources.map(item => item.id) },
      }));
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法带入文献选题。'); }
  }

  useEffect(() => {
    alive.current = true;
    const cancel = () => {
      alive.current = false; job.current++; literatureJob.current++;
      const captured = checkpoint.current;
      if (captured?.owner === owner && captured.projectId === projectId) enqueueSave(captured, true);
    };
    if (!owner) return cancel;
    const before = edit.current;
    void readResearchWorkspace(owner, projectId, { isCurrent: current }).then(record => {
      if (!current()) return;
      revision.current = record?.revision ?? 0;
      if (record?.draft && edit.current === before) {
        setDraft(record.draft); setSaved(true);
        // An import made while storage was opening wins over an older stored snapshot.
        if (!latest.current.literature) latest.current.onLiterature(record.draft.literature);
      }
      setReady(true);
    }).catch(reason => { saveFailed.current = true; if (current()) { setReady(true); setConflict(true); setError(reason instanceof Error ? reason.message : '无法恢复研究草稿。'); } });
    return cancel;
    // This component is keyed by the host's account epoch and project; do not reload on callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, projectId, identityEpoch]);

  useEffect(() => {
    if (!ready || !owner || conflict) return;
    const timer = setTimeout(() => {
      setSaved(false);
      enqueueSave(checkpoint.current);
    }, 800);
    return () => clearTimeout(timer);
    // Saving callbacks are deliberately fenced to this mounted owner/project, not render identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, literature, ready, owner, projectId, conflict]);

  const withLiterature = (source: DiagnosisBriefSource, snapshot: LiteratureWorkspaceSnapshot): DiagnosisBriefSource => {
    const reference = literatureEvidenceReference(snapshot);
    if (source.schemaVersion === 2 && literatureEvidenceReferencesEqual(source.literature, reference)) return source;
    return parseDiagnosisBriefSource({ schemaVersion: 2, id: crypto.randomUUID(), input: source.input, literature: reference });
  };
  const attachLiterature = (snapshot: LiteratureWorkspaceSnapshot, selection: TopicProjectDocument) => {
    const held = checkpoint.current;
    if (!current() || latest.current.literature !== snapshot || held?.value.selected !== selection) return;
    if (selection.provenance.catalogVersion === LITERATURE_TOPIC) return;
    const diagnosis = held.value.diagnosis ?? prepareTopicDiagnosis(selection);
    const source = withLiterature(diagnosis.source, snapshot);
    if (source !== diagnosis.source) update(value => ({ ...value, diagnosis: { ...diagnosis, source } }));
    latest.current.onTopic(source);
  };

  useEffect(() => {
    let live = true;
    const attempt = ++literatureJob.current;
    void Promise.resolve().then(() => {
      if (!live || !current() || attempt !== literatureJob.current) return;
      setReceipt(null); setLiteratureBusy(false);
      if (!ready || !draft.selected || !literature?.corpus || !draft.autoAdvance) return;
      setLiteratureBusy(true);
      return literatureWorkspaceReceipt(literature).then(value => {
        if (live && current() && attempt === literatureJob.current) { setReceipt(value); if (value.status === 'ready') attachLiterature(literature, draft.selected!); }
      }).catch(reason => { if (live && current() && attempt === literatureJob.current) setError(reason instanceof Error ? reason.message : '文献分析未完成。'); })
        .finally(() => { if (live && current() && attempt === literatureJob.current) setLiteratureBusy(false); });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [literature, draft.selected, draft.autoAdvance, ready]);

  async function start(direction: string) {
    if (!ready || busy || conflict) return;
    const attempt = ++job.current;
    setBusy(true); setError(''); setProposal(null);
    try {
      const profile = proposeTopicProfile(draft.profile, direction)?.profile ?? draft.profile;
      const intake = await prepareResearchIntake(direction, profile, projectId);
      if (!current() || attempt !== job.current) return;
      retractAdoptedTopic();
      update(value => ({ ...value, profile, direction, intake, selected: null, diagnosis: null }));
    } catch (reason) { if (current() && attempt === job.current) setError(reason instanceof Error ? reason.message : '选题准备失败。'); }
    finally { if (current() && attempt === job.current) setBusy(false); }
  }

  function confirmTopic() {
    if (!proposal || !current() || conflict) return;
    try {
      const diagnosis = draft.autoAdvance || literatureProposal ? prepareTopicDiagnosis(proposal) : null;
      // Explicit acceptance affects this draft only. Cloud topic version/Gate decisions remain independent.
      const selected = literatureProposal && proposal.selected ? { ...proposal, selected: { ...proposal.selected, title: proposal.brief.title } } : proposal;
      retractAdoptedTopic();
      update(value => ({ ...value, selected: structuredClone(selected), diagnosis: draft.autoAdvance ? diagnosis : null }));
      setProposal(null); setError('');
      if (draft.autoAdvance && diagnosis && !literatureProposal) props.onTopic(diagnosis.source);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '请补全研究范围。'); }
  }

  function continueStep(stage: ResearchStageId) {
    if (stage === 'literature' && draft.literatureStudy?.papers.length && literaturePanel.current) {
      literaturePanel.current.open = true;
      literaturePanel.current.scrollIntoView({ block: 'start' });
      return;
    }
    if (stage === 'diagnosis' && draft.selected && !draft.diagnosis) {
      if (!adoptedEvidenceCurrent) { setError('选题所用摘录已撤回，请重新核对并采纳。'); return; }
      try { const diagnosis = prepareTopicDiagnosis(draft.selected); update(value => ({ ...value, diagnosis })); if (!adoptedLiterature) props.onTopic(diagnosis.source); setError(''); }
      catch (reason) { setError(reason instanceof Error ? reason.message : '诊断输入不完整。'); }
      return;
    }
    if (stage === 'literature' && literature?.corpus && !receipt) {
      const source = literature, attempt = ++literatureJob.current;
      setLiteratureBusy(true);
      const valid = () => current() && attempt === literatureJob.current && latest.current.literature === source;
      void literatureWorkspaceReceipt(source).then(value => { if (valid()) { setReceipt(value); if (value.status === 'ready' && draft.selected) attachLiterature(source, draft.selected); } })
        .catch(reason => { if (valid()) setError(reason instanceof Error ? reason.message : '文献分析未完成。'); }).finally(() => { if (valid()) setLiteratureBusy(false); });
      return;
    }
    props.onOpenStage(stage);
  }

  function sendBrief() {
    if (!current() || !draft.diagnosis) return;
    try {
      if (!adoptedEvidenceCurrent) throw Error('选题所用摘录已撤回，请重新核对并采纳。');
      let source = draft.diagnosis.source;
      if (source.schemaVersion === 2 && (!literature || !literatureEvidenceReferencesEqual(source.literature, literatureEvidenceReference(literature)))) throw Error('文献语料或参数已变化，请先重新分析后再发送研究简介。');
      if (!adoptedLiterature && receipt?.status === 'ready' && literature) source = withLiterature(source, literature);
      props.onTopic(source); props.onOpenStage('questionnaire'); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '研究简介来源已变化。'); }
  }

  const steps: ResearchJourneyStep[] = RESEARCH_STAGES.map(stage => {
    if (stage.id === 'topic') return { id: stage.id, status: busy ? 'running' : draft.selected ? 'completed' : draft.intake?.status === 'ready' ? 'awaiting_confirmation' : draft.intake ? 'needs_input' : 'ready', actionLabel: draft.selected ? '编辑选题' : '选题顾问' };
    if (stage.id === 'diagnosis') return { id: stage.id, status: draft.diagnosis ? 'completed' : draft.selected ? 'ready' : 'idle', actionLabel: '查看诊断' };
    if (stage.id === 'literature') return { id: stage.id, status: literatureBusy ? 'running' : receipt?.status === 'ready' ? 'completed' : draft.selected ? 'needs_input' : 'idle', detail: draft.literatureStudy?.papers.length ? `${draft.literatureStudy.papers.length} 篇原文 · ${draft.literatureStudy.evidence.length} 条已确认摘录` : receipt?.status === 'ready' ? `已分析 ${receipt.summary.records} 条记录。` : draft.selected ? '导入文献题录查看词云与关联图谱。' : undefined, actionLabel: draft.literatureStudy?.papers.length ? '查看原文证据' : '文献图谱' };
    return { id: stage.id, status: 'idle', actionLabel: stage.availability === 'planned' ? undefined : '打开编辑' };
  });

  const patchBrief = (key: keyof Pick<TopicProjectDocument['brief'], 'title' | 'decisionOwner' | 'population' | 'geography' | 'decision'>, value: string) => setProposal(old => old ? { ...old, brief: { ...old.brief, [key]: value } } : null);

  return <section className={styles.workspace} aria-label="研究推进">
    <div className={styles.options}>
      <label><input type="checkbox" checked={draft.autoAdvance} disabled={!ready || busy} onChange={event => update(value => ({ ...value, autoAdvance: event.target.checked }))} />选题确认后自动诊断与文献分析</label>
      <span role="status">{!ready ? '载入研究草稿…' : conflict ? '草稿待处理' : owner === 'guest' ? '本次访客会话' : saved ? '已保存在本浏览器' : '待保存'}</span>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.profile}>
      <summary>团队条件{draft.profile.city ? ` · ${draft.profile.city}` : ''}</summary>
      <div className={styles.profileGrid}>
        <RegionPicker regionRef={draft.profile.regionRef ?? null} region={draft.profile.region} city={draft.profile.city} scopeKey={`${owner}:${projectId}`} disabled={!ready || busy}
          onChange={ref => { const path = ref ? regionPath(ref) : []; changeResearchInput(value => ({ ...value, profile: { ...value.profile, schemaVersion: 2, regionRef: ref, region: path[0]?.name ?? '', city: path.find(item => item.level === 'prefecture')?.name ?? '' } })); }} />
        <label>学校<input value={draft.profile.school} maxLength={100} disabled={!ready || busy} onChange={event => changeResearchInput(value => ({ ...value, profile: { ...value.profile, school: event.target.value } }))} placeholder="选填" /></label>
        <label>可用时间（天）<input type="number" min={1} max={3660} value={draft.profile.days ?? ''} disabled={!ready || busy} onChange={event => changeResearchInput(value => ({ ...value, profile: { ...value.profile, days: event.target.value ? Number(event.target.value) : null } }))} /></label>
        <label>经费（元）<input type="number" min={0} max={99999999} value={draft.profile.budgetYuan ?? ''} disabled={!ready || busy} onChange={event => changeResearchInput(value => ({ ...value, profile: { ...value.profile, budgetYuan: event.target.value ? Number(event.target.value) : null } }))} /></label>
      </div>
      <fieldset><legend>确认能联系的人群或单位</legend><div className={styles.access}>{ACCESS_OPTIONS.map(option => <label key={option.id}><input type="checkbox" checked={draft.profile.access[option.id] === 'confirmed'} disabled={!ready || busy} onChange={event => changeResearchInput(value => ({ ...value, profile: { ...value.profile, access: { ...value.profile.access, [option.id]: event.target.checked ? 'confirmed' : 'possible' } } }))} />{option.label}</label>)}</div></fieldset>
    </details>
    <ResearchJourney direction={draft.direction} onDirectionChange={direction => changeResearchInput(value => ({ ...value, direction }))} onStart={direction => void start(direction)} steps={steps}
      services={props.services} modelRoutes={props.modelRoutes} defaultServiceId={props.defaultServiceId} onDefaultServiceChange={props.onDefaultServiceChange} onModelCallChange={props.onModelCallChange}
      onOpenSettings={props.onOpenSettings} onStepAction={continueStep} busy={busy} disabled={!ready || conflict} afterIntake={<div className={styles.intakeResults}>
    <details className={styles.literature} ref={literaturePanel}>
      <summary>选题与文献研究 <small>原文摘录 · 文献对照 · 候选选题</small></summary>
      <LiteratureStudyPanel value={draft.literatureStudy ?? emptyLiteratureStudy()} direction={draft.direction}
        disabled={!ready || busy || conflict} onChange={changeLiteratureStudy} onAdopt={chooseLiteratureTopic} />
      <button type="button" className={styles.literatureMap} onClick={() => props.onOpenStage('literature')}>打开文献图谱与词云</button>
    </details>
    {draft.intake && !draft.selected && <div className={styles.candidates} aria-label="选题候选">
      <h3>先选一个值得深入的方向</h3>
      {!!draft.intake.missing.length && <ul>{draft.intake.missing.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {draft.intake.candidates.map(item => <article key={item.patternId}><h4>{item.document.brief.title}</h4><p>{item.document.brief.questions.map(q => q.text).join('；')}</p><p>{item.document.brief.population} · {item.document.brief.geography || '地区待补充'}</p><button type="button" onClick={() => {
        if (!draft.intake) return;
        try { setProposal(adoptIntakeCandidate(draft.intake.turn, item.patternId)); setError(''); }
        catch (reason) { setError(reason instanceof Error ? reason.message : '请重新生成当前选题候选。'); }
      }}>选择并完善</button></article>)}
    </div>}
    {proposal && <section ref={confirmPanel} className={styles.confirm} aria-label="确认选题">
      <h3>确认研究范围</h3>
      {([['title', '题目'], ['decisionOwner', '决策主体'], ['population', '调查人群'], ['geography', '调查地区'], ['decision', '要支持的决定']] as const).map(([key, label]) => <label key={key}>{label}<input value={proposal.brief[key]} maxLength={key === 'decision' ? 600 : key === 'population' ? 200 : 120} onChange={event => patchBrief(key, event.target.value)} /></label>)}
      <button type="button" onClick={confirmTopic}>确认选题并继续</button><button type="button" onClick={() => setProposal(null)}>返回比较</button>
    </section>}
    {adoptedLiterature && <details className={styles.result}>
      <summary>已采纳选题的文献依据</summary>
      {!adoptedEvidenceCurrent && <p role="status">所用摘录已撤回。重新核对并采纳后，方可将研究简介送入问卷。</p>}
      {adoptedLiterature.brief.sources.map(source => <article key={source.id}><h4>{source.title}</h4><p>{source.locator}</p><blockquote>{source.snippet}</blockquote></article>)}
    </details>}
    {draft.diagnosis && <section className={styles.result} aria-label="选题诊断结果"><h3>{draft.diagnosis.source.input.title}</h3><ul>{draft.diagnosis.result?.nextSteps.map(item => <li key={item.code}>{item.action}</li>)}</ul><button type="button" disabled={!adoptedEvidenceCurrent} onClick={sendBrief}>将研究简介送入问卷</button></section>}
    {receipt?.status === 'ready' && <details className={styles.result}><summary>文献分析回执 · {receipt.summary.records} 条</summary><p>共现节点 {receipt.map.nodes.length} · 论文网络节点 {receipt.papers.nodes.length}</p><code>{receipt.resultHash}</code><button type="button" onClick={() => props.onOpenStage('literature')}>查看词云与图谱</button></details>}
    <details className={styles.advisor}><summary>与选题顾问继续推敲</summary><TopicAgent profile={draft.profile} projectId={projectId} cacheNamespace={`research:${projectId ?? 'local'}`} readOnly={!ready || conflict}
      onProfileChange={profile => changeResearchInput(value => ({ ...value, profile }))}
      onChoose={(item, profile, turn) => { if (!turn) return; try { const document = adoptIntakeCandidate(turn, item.patternId); changeResearchInput(value => ({ ...value, profile })); setProposal(document); setError(''); } catch (reason) { setError(String(reason)); } }} /></details>
    </div>} />
  </section>;
}
