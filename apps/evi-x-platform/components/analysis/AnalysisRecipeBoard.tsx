"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ANALYSIS_BLOCKS } from '@/lib/analysis-recipes';
import { finiteNumber, isMissing, type SurveyProfile, type SurveyTable } from '@/lib/survey-analysis';
import { ANALYSIS_PLAN_VERSION, PLAN_LIMITS, PLAN_TEMPLATES, createPlanNode, createTemplateNodes, exportPlanResult, filterPlanSample, planNodeRequest, planNodeSignature, restorePlan, runPlanNode, serializePlan, type AnalysisPlan, type PlanFilterEvidence, type PlanMethod, type PlanNode, type PlanResult } from '@/lib/analysis-plan';
import { frequencyEvidence, reliabilityEvidence, linkEvidence, type EvidenceCandidate } from '@/lib/research-flow';
import { prepareLinkedAnalysis, type Mapping, type DatasetIdentity } from '@/lib/questionnaire-mapping';
import type { ResearchLink } from '@/lib/research-link';
import { routingSummary, type RoutingChoice, type RoutingEvidence } from '@/lib/routing-evidence';
import styles from './AnalysisRecipes.module.css';

type Card = PlanNode & {
  boundsDraft?: { min: string; max: string };
  result?: { signature: string; computedAt: string; value: PlanResult; eligibility: RoutingEvidence | null; filterEligibility: RoutingEvidence | null; sample: PlanFilterEvidence; eligibleRows: number };
  error?: string;
};
type Preview = { plan: AnalysisPlan; revision: number; scope: string; filename: string };
const ALPHA_BLOCK = { id: 'alpha', title: '信度与题项诊断', tag: '测量质量', roles: [] as string[], use: '查看同一构念各题项的内部一致性、校正题总相关与删除后 α。', boundary: 'α 不证明效度或单维性；题项需测量同一构念，并核对反向计分与范围。' };
const blocks = [...ANALYSIS_BLOCKS, ALPHA_BLOCK];
const fmt = (n: number | null) => n === null ? '—' : n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
const nodeOnly = (c: Card): PlanNode => ({ id: c.id, method: c.method, x: c.x, y: c.y, question: c.question, branch: c.branch, filter: c.filter, scale: c.scale });
const resultSignature = (c: Card, contextKey: string, missingCodes: string[]) => JSON.stringify({ calculation: planNodeSignature(c, contextKey, missingCodes), question: c.question, boundsDraft: c.boundsDraft });
function inputProblems(card: Card): string[] {
  const problems: string[] = [];
  if (!card.question.trim()) problems.push('填写研究问题');
  if (card.filter && (card.filter.column === null || !card.filter.values.length)) problems.push('完成样本筛选');
  if (card.method === 'alpha') {
    if (!card.scale?.construct.trim()) problems.push('填写量表构念');
    if (!card.scale || card.scale.columns.length < 2) problems.push('选择至少 2 个同构念题项');
    const min = finiteNumber(card.boundsDraft?.min ?? String(card.scale?.min));
    const max = finiteNumber(card.boundsDraft?.max ?? String(card.scale?.max));
    if (min === null || max === null || min >= max || Math.max(Math.abs(min), Math.abs(max)) > 1e6) problems.push('设置有效计分范围');
  } else {
    const meta = ANALYSIS_BLOCKS.find(item => item.id === card.method)!;
    if (card.x === null || (meta.roles.length === 2 && card.y === null)) problems.push('选择分析变量');
    if (meta.roles.length === 2 && card.x !== null && card.x === card.y) problems.push('选择两个不同变量');
  }
  return problems;
}
function download(raw: string, filename: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AnalysisRecipeBoard({ table, profile, missingCodes, hash, simulated, onReliability, invalidMissing, onCandidates, mapping, identity, mappingStale, activeLink, contextKey, routing }: { table: SurveyTable; profile: SurveyProfile; missingCodes: string[]; hash: string; simulated: boolean; onReliability: () => void; invalidMissing: boolean; onCandidates: (value: EvidenceCandidate[]) => void; mapping: Mapping | null; identity: DatasetIdentity; mappingStale: boolean; activeLink: ResearchLink | null; contextKey: string; routing: RoutingChoice }) {
  const [cards, setCards] = useState<Card[]>([]), [deleted, setDeleted] = useState<{ card: Card; index: number } | null>(null), [notice, setNotice] = useState('');
  const [method, setMethod] = useState<PlanMethod>('frequency'), [activeId, setActiveId] = useState('');
  const [mode, setMode] = useState<'choose' | 'routes' | 'free'>('choose');
  const [sampleOpen, setSampleOpen] = useState<Record<string, boolean>>({});
  const [templateId, setTemplateId] = useState<(typeof PLAN_TEMPLATES)[number]['id']>(PLAN_TEMPLATES[0].id);
  const [planTitle, setPlanTitle] = useState('我的分析方案'), [template, setTemplate] = useState<AnalysisPlan['template']>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), importEpoch = useRef(0), revision = useRef(0), mounted = useRef(true);
  const source = { hash, headers: table.headers, interpretationHash: identity.interpretationHash, expectedMapping: mapping && activeLink ? { questionnaireHash: activeLink.questionnaireHash, mappingHash: activeLink.mappingHash, routingPolicy: routing.policy } : null };
  const unconfirmedMapping = !!mapping && !activeLink;
  const scopeKey = JSON.stringify({ contextKey, source, missingCodes, invalidMissing });
  const scopeRef = useRef(scopeKey);
  useEffect(() => {
    // A -> B -> A is still a changed editing session: do not revive a late file read.
    if (scopeRef.current !== scopeKey) revision.current++;
    scopeRef.current = scopeKey;
  }, [scopeKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // This is a mutable request counter, not a DOM ref captured by the effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      importEpoch.current++;
    };
  }, []);
  const activeCardId = cards.some(card => card.id === activeId) ? activeId : cards[0]?.id;
  const activeCard = cards.find(card => card.id === activeCardId);
  const activeFilter = activeCard?.filter;
  const branchPreview = useMemo(() => {
    if (activeFilter === undefined) return { values: [] as string[], count: null as number | null };
    const values = activeFilter?.column !== null && activeFilter?.column !== undefined ? [...new Set(table.rows.map(row => row[activeFilter.column!].trim()).filter(cell => !isMissing(cell, missingCodes)))].sort((a, b) => a.localeCompare(b, 'zh-CN')) : [];
    let count: number | null = null;
    try { count = filterPlanSample(table, activeFilter, missingCodes).evidence.branchRows; } catch { /* The branch is still being configured. */ }
    return { values, count };
  }, [activeFilter, table, missingCodes]);
  const current = (c: Card) => !invalidMissing && !inputProblems(c).length && c.result?.signature === resultSignature(c, contextKey, missingCodes) ? c.result.value : null;
  const selectedTemplate = PLAN_TEMPLATES.find(item => item.id === templateId)!;

  useEffect(() => {
    const evidence: EvidenceCandidate[] = [];
    if (!invalidMissing && (!mapping || activeLink)) cards.forEach((card, index) => {
      if (card.filter || inputProblems(card).length || !card.result || card.result.signature !== resultSignature(card, contextKey, missingCodes)) return;
      try {
        let input;
        if (card.method === 'frequency') input = frequencyEvidence({ ...card.result.value, method: 'frequency' }, { hash, simulated, question: card.question, variable: table.headers[card.x!], column: card.x!, missingCodes });
        else if (card.method === 'alpha' && card.scale && card.result.value.reliability) input = reliabilityEvidence(card.result.value.reliability, { ...card.scale, missingCodes }, { hash, simulated, question: card.question.replace(/[\r\n\t]+/g, ' ') });
        else return;
        if (mapping && activeLink) input = linkEvidence(input, activeLink, card.result.eligibility);
        evidence.push({ key: card.id, input, contextKey, label: `模块 ${index + 1} · ${blocks.find(item => item.id === card.method)!.title} · n=${input.n}` });
      } catch { /* Undefined or unbound results remain local diagnostics. */ }
    });
    onCandidates(evidence);
  }, [cards, hash, missingCodes, simulated, table, invalidMissing, onCandidates, contextKey, mapping, activeLink]);

  function touch() { revision.current++; }
  function add(nodes: PlanNode[], origin: AnalysisPlan['template'] = null) {
    if (cards.length + nodes.length > PLAN_LIMITS.nodes) { setNotice(`本方案最多 ${PLAN_LIMITS.nodes} 个模块；本次需要 ${nodes.length} 个空位，未添加任何模块。`); return; }
    touch(); setCards(prev => [...prev, ...nodes]); setActiveId(nodes[0]?.id || activeId);
    setTemplate(cards.length ? null : origin); setMode('free');
    setNotice(`已添加 ${nodes.length} 个模块。请逐项确认变量与样本范围。`);
  }
  function update(id: string, patch: Partial<Card>) {
    touch(); setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch, error: undefined } : c)); setNotice('');
  }
  function move(index: number, direction: number) {
    if (index + direction < 0 || index + direction >= cards.length) return;
    touch(); setCards(prev => { const next = [...prev]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  function bounds(card: Card, field: 'min' | 'max', value: string) {
    if (!card.scale) return;
    const draft = { min: String(card.scale.min), max: String(card.scale.max), ...card.boundsDraft, [field]: value };
    const min = finiteNumber(draft.min), max = finiteNumber(draft.max);
    update(card.id, { boundsDraft: draft, scale: { ...card.scale, min: min ?? card.scale.min, max: max ?? card.scale.max } });
  }
  function run(card: Card) {
    try {
      if (invalidMissing) throw Error('请先修复缺失代码设置。');
      const problems = inputProblems(card); if (problems.length) throw Error(`请先${problems.join('、')}。`);
      const branch = filterPlanSample(table, card.filter, missingCodes);
      // Eligibility is always assessed against the original dataset, before any custom branch.
      const prepared = mapping ? prepareLinkedAnalysis(mapping, identity, mappingStale, table, missingCodes, planNodeRequest(card), routing) : { table, problems: [], eligibility: null };
      if (prepared.problems.length) throw Error(prepared.problems.join(' '));
      const filterPrepared = mapping && card.filter?.column !== null && card.filter?.column !== undefined ? prepareLinkedAnalysis(mapping, identity, mappingStale, table, missingCodes, { method: 'frequency', columns: [card.filter.column] }, routing) : { table, problems: [], eligibility: null };
      if (filterPrepared.problems.length) throw Error(`筛选变量：${filterPrepared.problems.join(' ')}`);
      const eligible = new Set(prepared.table.rows), filterEligible = new Set(filterPrepared.table.rows);
      const input = { ...table, rows: branch.table.rows.filter(row => eligible.has(row) && filterEligible.has(row)) };
      const value = runPlanNode(input, nodeOnly(card), missingCodes);
      update(card.id, { result: { signature: resultSignature(card, contextKey, missingCodes), computedAt: new Date().toISOString(), value, eligibility: prepared.eligibility, filterEligibility: filterPrepared.eligibility, sample: branch.evidence, eligibleRows: input.rows.length } });
    } catch (e) { update(card.id, { result: undefined, error: (e as Error).message }); setCards(prev => prev.map(c => c.id === card.id ? { ...c, error: (e as Error).message } : c)); }
  }
  function buildPlan(): AnalysisPlan {
    if (invalidMissing) throw Error('请先修复缺失代码设置。');
    if (unconfirmedMapping) throw Error('请先确认当前问卷与数据列的对应，再保存方案。');
    if (cards.some(c => c.boundsDraft && (finiteNumber(c.boundsDraft.min) === null || finiteNumber(c.boundsDraft.max) === null))) throw Error('有未完成的计分范围输入，请先补全后再保存方案。');
    return { schema: ANALYSIS_PLAN_VERSION, title: planTitle, template, nodes: cards.map(nodeOnly), source, missingCodes };
  }
  function savePlan() {
    try { download(serializePlan(buildPlan()), '分析方案.json'); setNotice('已生成方案下载。文件保存模块配置、变量名和筛选取值；不含答卷或计算结果。重开时先读取同一数据及相同解析、缺失设置，再导入方案。'); }
    catch (e) { setNotice((e as Error).message); }
  }
  async function readPlan(file: File) {
    const token = ++importEpoch.current, startRevision = revision.current, startScope = scopeKey;
    setReading(true); setPreview(null); setNotice('正在读取方案文件…');
    try {
      if (invalidMissing) throw Error('请先修复缺失代码设置。');
      if (unconfirmedMapping) throw Error('请先确认当前问卷与数据列的对应，再导入方案。');
      if (file.size > PLAN_LIMITS.bytes) throw Error('方案文件超过 100 KB。');
      const raw = await file.text();
      if (!mounted.current || token !== importEpoch.current) return;
      if (startRevision !== revision.current || startScope !== scopeRef.current) { setNotice('读取期间方案或数据口径已改变，原有内容已保留。请重新选择方案文件。'); return; }
      const plan = restorePlan(raw, source, missingCodes);
      setPreview({ plan, revision: startRevision, scope: startScope, filename: file.name }); setNotice('已校验方案，请预览后确认载入。');
    } catch (e) { if (mounted.current && token === importEpoch.current) setNotice((e as Error).message); }
    finally { if (mounted.current && token === importEpoch.current) setReading(false); }
  }
  function confirmImport() {
    if (!preview) return;
    if (unconfirmedMapping || invalidMissing) { setNotice('请先确认题目对应并修复缺失代码，再导入方案。'); return; }
    if (preview.revision !== revision.current || preview.scope !== scopeKey) { setPreview(null); setNotice('预览后方案或数据口径已改变，请重新导入；现有模块已保留。'); return; }
    try {
      const plan = restorePlan(serializePlan(preview.plan), source, missingCodes);
      touch(); setCards(plan.nodes); setPlanTitle(plan.title); setTemplate(plan.template); setDeleted(null); setActiveId(plan.nodes[0]?.id || ''); setMode('free'); setPreview(null);
      setNotice('已载入模块配置，请核对后逐项计算。文件中的旧结果与批准状态不会载入。');
    } catch (e) { setNotice((e as Error).message); }
  }
  function saveResults() {
    const record = { schema: 'survey-recipes/v3', engine: 'analysis-plan/v1', createdAt: new Date().toISOString(), title: planTitle, source: { sha256: hash, classification: simulated ? 'simulated' : 'user_provided', interpretationHash: identity.interpretationHash }, processing: { missingCodes, weighting: 'none', imputation: 'none', duplicates: 'not removed', inference: 'not performed' }, recipes: cards.map(c => ({ method: c.method, question: c.question, branch: c.branch, filter: c.filter, scale: c.scale, variables: (c.scale?.columns || [c.x, c.y].filter((i): i is number => i !== null)).map(i => ({ index: i, name: table.headers[i] })), status: current(c) ? 'computed' : 'not_current', computedAt: current(c) ? c.result?.computedAt : null, sample: current(c) ? { ...c.result?.sample, eligibleRows: c.result?.eligibleRows, analysisRows: current(c)!.n } : null, eligibility: current(c) ? c.result?.eligibility : null, filterEligibility: current(c) ? c.result?.filterEligibility : null, result: current(c) ? exportPlanResult(current(c)!) : null })), questionnaire: mapping ? { link: activeLink, status: activeLink ? 'confirmed_by_user' : 'not_current', classification: 'proposed' } : null, limits: ['No raw rows. Result category labels replaced with aliases; branch filter values, variable names and small aggregates may disclose sensitive information.', 'Eligibility is checked on the original dataset. Custom branch conditions are then intersected with eligible rows.', 'No p-values, confidence intervals, causal or population claims.'] };
    download(JSON.stringify(record, null, 2), '组合分析记录.json');
    setNotice('已生成计算汇总下载。结果分类标签已替换为代号；分支筛选条件、变量名和小样本汇总仍需检查。此文件不含原始答卷。');
  }

  return <div className={styles.board}>
    {invalidMissing && <p className={styles.error} role="alert">缺失代码无效：模块设置已保留，修复后才可计算或下载。</p>}
    <div className={styles.title}><div><span className={styles.eyebrow}>ANALYSIS PLAN</span><h3>{cards.length ? '我的分析方案' : '从问题，组织你的分析'}</h3></div><details className={styles.fileMenu}><summary>方案与记录</summary><div><button type="button" onClick={() => fileInput.current?.click()} disabled={invalidMissing}>导入方案文件</button><button type="button" disabled={!cards.length || invalidMissing} onClick={savePlan}>下载方案配置</button><button type="button" disabled={!cards.length || invalidMissing} onClick={saveResults}>下载计算汇总</button><button type="button" onClick={onReliability}>打开量表工作区</button></div></details><input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="选择分析方案文件" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void readPlan(file); }}/></div>

    <div className={styles.entryModes} data-compact={!!cards.length} aria-label="分析方案起步方式"><button type="button" aria-pressed={mode === 'routes'} onClick={() => setMode(mode === 'routes' && cards.length ? 'free' : 'routes')}><span>01</span><strong>选择研究路线</strong>{!cards.length && <small>从研究目标出发，调整一组已有模块</small>}</button><button type="button" aria-pressed={mode === 'free'} onClick={() => setMode('free')}><span>02</span><strong>自由搭建</strong>{!cards.length && <small>按自己的问题，逐块添加与排序</small>}</button></div>

    {mode === 'routes' && <section className={styles.routeChooser} aria-label="研究路线预览"><div className={styles.routeTabs}>{PLAN_TEMPLATES.map(item => <button type="button" key={item.id} aria-pressed={item.id === templateId} onClick={() => setTemplateId(item.id)}>{item.title}</button>)}</div><div className={styles.routePreview}><div><h4>{selectedTemplate.title}</h4><p>{selectedTemplate.description}</p></div><ol>{selectedTemplate.steps.map((step, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{blocks.find(item => item.id === step.method)?.title}</strong><small>{step.branch} · {step.question}</small></div></li>)}</ol><button type="button" className={styles.primary} onClick={() => add(createTemplateNodes(templateId, () => crypto.randomUUID()), { id: templateId, version: 1 })}>{cards.length ? '追加到当前方案' : '使用这条路线'} · {selectedTemplate.steps.length} 个模块</button><p className={styles.note}>{cards.length ? `当前 ${cards.length} / ${PLAN_LIMITS.nodes} 个模块。追加保留已有模块与结果。` : '路线提供起点；变量与人群筛选由你确认后计算。'}</p></div></section>}

    {mode === 'free' && <div className={styles.methodPicker} data-compact={!!cards.length}><label>添加模块<select value={method} onChange={e => setMethod(e.target.value as PlanMethod)}>{blocks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" className={styles.primary} disabled={cards.length >= PLAN_LIMITS.nodes} onClick={() => add([createPlanNode(method, crypto.randomUUID())])}>＋ 添加模块</button><p>{blocks.find(item => item.id === method)?.use}</p></div>}
    {reading && <div className={styles.restore} role="status">正在读取方案文件…<button type="button" onClick={() => { importEpoch.current++; setReading(false); setNotice('已取消读取，现有方案已保留。'); }}>取消读取</button></div>}
    {preview && <section className={styles.importPreview} aria-label="导入方案预览"><div><span className={styles.eyebrow}>文件预览</span><h4>{preview.plan.title}</h4><p>{preview.filename} · {preview.plan.nodes.length} 个模块 · 同一数据与缺失口径</p></div><ol>{preview.plan.nodes.map((node, index) => <li key={node.id}>{index + 1}. {blocks.find(item => item.id === node.method)?.title} · {node.branch || '全部样本'} · {node.question || '待填写研究问题'}</li>)}</ol><p className={styles.note}>{cards.length ? `确认后替换当前 ${cards.length} 个模块。需要保留当前方案时请先下载方案配置与计算汇总。` : '仅载入配置，变量设置将在重新计算时校验。'}</p><div className={styles.actions}><button type="button" onClick={() => setPreview(null)}>取消</button><button type="button" className={styles.primary} onClick={confirmImport}>{cards.length ? '确认替换当前方案' : '确认载入方案'}</button></div></section>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {deleted && <div className={styles.restore}>已移除一个模块。<button type="button" disabled={cards.length >= PLAN_LIMITS.nodes} onClick={() => { touch(); setCards(prev => { const next = [...prev]; next.splice(Math.min(deleted.index, next.length), 0, deleted.card); return next; }); setActiveId(deleted.card.id); setDeleted(null); }}>撤销移除</button></div>}
    {!!cards.length && <label className={styles.planName}>方案名称<input value={planTitle} maxLength={120} onChange={e => { touch(); setPlanTitle(e.target.value); }}/></label>}

    <div className={styles.workspace}>{!!cards.length && <nav className={styles.taskList} aria-label="已添加的分析任务"><div className={styles.taskListHeading}>模块顺序 <span>{cards.length} / {PLAN_LIMITS.nodes}</span></div>{cards.map((card, index) => <button type="button" key={card.id} aria-pressed={card.id === activeCardId} aria-controls={`analysis-card-${card.id}`} onClick={() => setActiveId(card.id)}><span className={styles.taskNumber}>{String(index + 1).padStart(2, '0')}</span><span><strong>{blocks.find(item => item.id === card.method)!.title}</strong><small>{card.branch || '全部样本'} · {card.question || '待填写研究问题'}</small><em data-current={!!current(card)}>{current(card) ? '已计算' : card.result ? '设置已变化' : card.error ? '需要检查' : inputProblems(card).length ? '待配置' : '待计算'}</em></span></button>)}</nav>}
      <div className={styles.canvas}>{cards.filter(card => card.id === activeCardId).map(card => {
        const index = cards.indexOf(card);
        const meta = blocks.find(item => item.id === card.method)!, value = current(card), problems = inputProblems(card);
        const filterValues = branchPreview.values, branchCount = branchPreview.count;
        return <article className={styles.card} key={card.id} id={`analysis-card-${card.id}`} hidden={card.id !== activeCardId} aria-label={`分析卡片 ${index + 1} ${meta.title}`}><div className={styles.cardHead}><div><span>{String(index + 1).padStart(2, '0')} · {meta.tag}</span><h4>{meta.title}</h4></div><div className={styles.actions}><button type="button" aria-label={`上移分析卡片 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>上移</button><button type="button" aria-label={`下移分析卡片 ${index + 1}`} disabled={index === cards.length - 1} onClick={() => move(index, 1)}>下移</button><button type="button" aria-label={`移除分析卡片 ${index + 1}`} onClick={() => { touch(); setDeleted({ card, index }); setCards(prev => prev.filter(c => c.id !== card.id)); }}>移除</button></div></div>
          <div className={styles.cardBody}><div className={styles.config}><p>{meta.use}</p><label>这个模块回答的问题<textarea rows={2} maxLength={300} value={card.question} onChange={e => update(card.id, { question: e.target.value })} placeholder="例如：不同参与经历的人，需求有哪些不同？"/></label><details className={styles.sampleConfig} open={Object.hasOwn(sampleOpen, card.id) ? sampleOpen[card.id] : card.filter !== null} onToggle={e => { const open = e.currentTarget.open; setSampleOpen(prev => prev[card.id] === open ? prev : { ...prev, [card.id]: open }); }}><summary>分析对象 · {card.branch || '全部样本'}{branchCount !== null ? ` · ${branchCount} 行` : ' · 待配置'}</summary><div><label>分支名称<input maxLength={80} value={card.branch} onChange={e => update(card.id, { branch: e.target.value })} placeholder="如参与者、未参与者"/></label><label>样本范围<select value={card.filter ? 'filter' : 'all'} onChange={e => update(card.id, { filter: e.target.value === 'all' ? null : { column: null, values: [] } })}><option value="all">全部样本</option><option value="filter">按一列取值筛选</option></select></label>{card.filter && <><label>筛选变量<select value={card.filter.column ?? ''} onChange={e => update(card.id, { filter: { column: e.target.value === '' ? null : Number(e.target.value), values: [] } })}><option value="">请选择变量</option>{profile.columns.map(c => <option key={c.index} value={c.index} disabled={c.likelyIdentifier}>{c.name}{c.likelyIdentifier ? ' · 疑似标识列' : ''}</option>)}</select></label>{filterValues.length > 50 ? <p className={styles.error}>该列超过 50 个取值，请先按研究依据编码后再筛选。</p> : filterValues.length > 0 && <fieldset className={styles.checkList}><legend>保留以下取值（可多选）</legend>{filterValues.map(label => <label key={label}><input type="checkbox" checked={card.filter!.values.includes(label)} onChange={() => update(card.id, { filter: { ...card.filter!, values: card.filter!.values.includes(label) ? card.filter!.values.filter(item => item !== label) : [...card.filter!.values, label] } })}/><span>{label}</span></label>)}</fieldset>}<p className={styles.note}>空白与缺失代码不进入所选分支。每个模块独立设置筛选；分支名称只作标注。</p></>}</div></details>
            {card.method === 'alpha' && card.scale ? <div className={styles.scaleConfig}><label>量表构念<input maxLength={120} value={card.scale.construct} onChange={e => update(card.id, { scale: { ...card.scale!, construct: e.target.value } })} placeholder="这些题项共同测量什么？"/></label><div className={styles.bounds}><label>计分下限<input inputMode="decimal" value={card.boundsDraft?.min ?? String(card.scale.min)} onChange={e => bounds(card, 'min', e.target.value)}/></label><label>计分上限<input inputMode="decimal" value={card.boundsDraft?.max ?? String(card.scale.max)} onChange={e => bounds(card, 'max', e.target.value)}/></label></div><fieldset className={styles.scaleItems}><legend>题项 · 已选 {card.scale.columns.length} / 30</legend>{profile.columns.map(c => <div key={c.index}><label><input type="checkbox" checked={card.scale!.columns.includes(c.index)} disabled={c.likelyIdentifier || c.numeric === 0 || (!card.scale!.columns.includes(c.index) && card.scale!.columns.length >= 30)} onChange={() => { const included = card.scale!.columns.includes(c.index); update(card.id, { scale: { ...card.scale!, columns: included ? card.scale!.columns.filter(i => i !== c.index) : [...card.scale!.columns, c.index], reverse: included ? card.scale!.reverse.filter(i => i !== c.index) : card.scale!.reverse } }); }}/><span>{c.name}</span></label>{card.scale!.columns.includes(c.index) && <label className={styles.reverse}><input type="checkbox" aria-label={`反向计分：${c.name}`} checked={card.scale!.reverse.includes(c.index)} onChange={() => update(card.id, { scale: { ...card.scale!, reverse: card.scale!.reverse.includes(c.index) ? card.scale!.reverse.filter(i => i !== c.index) : [...card.scale!.reverse, c.index] } })}/>反向</label>}</div>)}</fieldset></div> : meta.roles.map((role, i) => <label key={role}>{role}<select value={(i === 0 ? card.x : card.y) ?? ''} onChange={e => update(card.id, { [i === 0 ? 'x' : 'y']: e.target.value === '' ? null : Number(e.target.value) })}><option value="">请选择变量</option>{profile.columns.map(c => <option key={c.index} value={c.index} disabled={c.likelyIdentifier}>{c.name}{c.likelyIdentifier ? ' · 疑似标识列' : ''}</option>)}</select></label>)}
            {!!problems.length && <p className={styles.readiness}>待完成：{problems.join('、')}</p>}<button type="button" className={styles.primary} disabled={invalidMissing || !!problems.length} onClick={() => run(card)}>计算这个模块</button><details><summary>适用条件与边界</summary><p>{meta.boundary}</p><p>一行应是一位独立调查单位；重复测量、权重和复杂抽样需要专门流程。</p></details></div>
            <div className={styles.output}>{card.error && <p className={styles.error} role="alert">{card.error}</p>}{!value ? <div className={styles.awaiting}><span>{card.result ? '设置已改变 · 需重新计算' : '配置完成后，查看结果'}</span><p>{problems.length ? problems.join('、') : '点击计算，查看当前样本的结果与诊断。'}</p></div> : <><span className={styles.badge}>{simulated ? '教学模拟结果' : '用户导入数据'}</span><div className={styles.sampleChain} aria-label="分析样本分母"><span>原表 <b>{card.result!.sample.totalRows}</b></span><span>筛选分支 <b>{card.result!.sample.branchRows}</b></span><span>共同应答范围 <b>{card.result!.eligibleRows}</b></span><span>有效计算 <b>{value.n}</b></span></div>{card.result?.eligibility && <p className={styles.note}>分析题目原表级应答范围：{routingSummary(card.result.eligibility)}</p>}{card.result?.filterEligibility && <p className={styles.note}>筛选题目原表级应答范围：{routingSummary(card.result.filterEligibility)}</p>}<div className={styles.metrics}><div><span>{card.method === 'alpha' ? '完整案例 n' : '分析样本 n'}</span><strong>{value.n}<small> / {value.total}</small></strong></div>{value.metrics.map(metric => <div key={metric.label}><span>{metric.label}</span><strong>{fmt(metric.value)}</strong></div>)}</div><p className={styles.note}>共同应答范围内未纳入 {value.excluded} 行；含缺失 {value.missingRows}、非数值 {value.invalidRows}{value.reliability ? `、越界 ${value.reliability.outOfRangeRows}` : ''}。原因可能重叠。</p><div className={styles.table} tabIndex={0} aria-label={`${meta.title}结果表，可横向滚动`}><table><thead><tr>{value.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{value.rows.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}>{typeof cell === 'number' || cell === null ? fmt(cell) : cell}</td>)}</tr>)}</tbody></table></div><p className={styles.interpretation}>{value.interpretation}</p>{card.filter && <p className={styles.note}>此结果使用自定义样本筛选，可下载计算汇总；当前报告候选尚未接入这类筛选口径。</p>}<details><summary>计算口径与提醒 · {value.warnings.length} 项</summary><ul>{value.warnings.map(w => <li key={w}>{w}</li>)}</ul></details></>}</div></div></article>;
      })}</div></div>
    {!!cards.length && <p className={styles.note}>移动顺序保留结果；变量、样本范围或计算口径改变后需重算。方案保留在当前页面，离开前可下载配置与计算汇总。</p>}
    <details className={styles.roadmap}><summary>方法库与下一步：效度、检验和建模</summary><div className={styles.roadmapGrid}><section><h4>数据质量</h4><p>核查纳入条件、缺失、重复、时长和逻辑矛盾；记录剔除依据。现支持缺失、完全重复行和关联问卷的逐行跳题检查。</p></section><section><h4>测量质量</h4><p>α 与题项诊断已可计算。内容效度需要理论与专家审查；KMO / Bartlett、EFA / CFA 尚未接入。</p></section><section><h4>差异与关联</h4><p>现有分组描述、交叉表与相关模块。t 检验、ANOVA 及其效应量、不确定性与多重比较流程尚未接入。</p></section><section><h4>解释与行动</h4><p>回归、聚类和 SEM 尚未接入。现有模块可组织成方案，当前各模块独立计算，不自动传递派生变量。</p></section></div><div className={styles.sources}><a href="https://stat.ethz.ch/R-manual/R-devel/library/stats/html/cor.html" target="_blank" rel="noopener noreferrer">R · 相关定义</a><a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.chi2_contingency.html" target="_blank" rel="noopener noreferrer">SciPy · χ² 与期望频数</a><a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.contingency.association.html" target="_blank" rel="noopener noreferrer">SciPy · Cramér V</a></div></details>
  </div>;
}
