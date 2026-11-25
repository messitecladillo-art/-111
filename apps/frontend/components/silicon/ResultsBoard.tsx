'use client';

import { useMemo, useState } from 'react';
import { distribution, estimateMinutes, fidelityReport, pretestFindings, refLabel, type Expectation, type FidelityReport, type Finding, type VarRef, type Verdict } from '@/lib/silicon/assess';
import { disclosureText, siliconCsv, siliconRunJson } from '@/lib/silicon/export';
import type { Questionnaire } from '@/lib/questionnaire';
import { synthesizePersonaProfile } from '@/lib/silicon/persona';
import { answerLabel, NO_SCENARIO, renderQuestionText, type SiliconAnswer, type SiliconRun } from '@/lib/silicon/run';
import AnswerChart from './AnswerChart';
import PersonaAvatar from './PersonaAvatar';
import styles from './SiliconLab.module.css';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

export type DatasetHandoff = { id: string; name: string; csv: string };
type Tab = 'findings' | 'theater' | 'fidelity' | 'answers' | 'export';
type Props = {
  design: Questionnaire; run: SiliconRun; stale: boolean; expectations: Expectation[];
  setExpectations: (next: Expectation[]) => void; onSendToAnalysis?: (handoff: DatasetHandoff) => void;
  onFocusQuestion: (questionId: string) => void;
};

const VERDICT: Record<Verdict, { label: string; icon: string }> = {
  pass: { label: '未见异常', icon: '✓' }, concern: { label: '需要关注', icon: '!' }, inconclusive: { label: '证据不足', icon: '…' }, manual: { label: '需人工评判', icon: '◐' },
};
const LEVEL = { blocker: { label: '阻断', icon: '■' }, warning: { label: '需修改', icon: '▲' }, info: { label: '提示', icon: '●' } } as const;
const pct = (x: number | null) => x === null ? '—' : `${Math.round(x * 100)}%`;

function cleanResultText(value: string): string {
  return value
    .replace(/[【「『]/gu, '“')
    .replace(/[】」』]/gu, '”')
    .replace(/\[/gu, '（')
    .replace(/\]/gu, '）')
    .replace(/\{([^{}]+)\}/gu, '“$1”')
    .replace(/离线演示引擎/gu, '本地预测试推演');
}

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={styles.verdict} data-verdict={verdict}><i aria-hidden="true">{VERDICT[verdict].icon}</i>{VERDICT[verdict].label}</span>;
}

export default function ResultsBoard({ design, run, stale, expectations, setExpectations, onSendToAnalysis, onFocusQuestion }: Props) {
  const [tab, setTab] = useState<Tab>('findings');
  const findings = useMemo(() => pretestFindings(design, run), [design, run]);
  const usable = expectations.filter(e => [e.a, e.b].every(r => r.kind === 'attribute' ? run.attributes.some(a => a.key === r.key) : design.questions.some(q => q.id === r.id)));
  const report = useMemo(() => fidelityReport(design, run, usable), [design, run, usable]);
  const ok = run.responses.filter(r => r.status === 'ok').length, unknown = run.responses.filter(r => r.status === 'outcome_unknown').length, failed = run.responses.length - ok - unknown;
  const minutes = estimateMinutes(design);
  const counts = { blocker: findings.filter(f => f.level === 'blocker').length, warning: findings.filter(f => f.level === 'warning').length };
  const tabsRef = useKeyedListMotion<HTMLDivElement>({ ids: ['findings', 'theater', 'fidelity', 'answers', 'export'], activeId: tab, markerAxis: 'horizontal' });
  const statsRef = useContentReveal<HTMLDivElement>({ token: run.id });

  return <div className={styles.results}>
    {stale && <p className={styles.warnNote} role="status" aria-live="polite"><b>结果对应旧版本</b>问卷或画像在本次运行后已修改。下方结果仍按运行时的版本计算，请重新运行后再据此修改问卷。</p>}
    <div ref={statsRef} className={styles.statRow} role="status" aria-label="本轮预测试结果概览">
      <article><span>模拟回答</span><strong>{ok}</strong><small>{run.personas.length} 位受访者 × {Math.max(1, run.settings.scenarios.length)} 个情境 × {Math.max(1, run.settings.models.length)} 路推演{failed ? ` · ${failed} 份未完成` : ''}{unknown ? ` · ${unknown} 份待对账` : ''}</small></article>
      <article><span>阻断问题</span><strong>{counts.blocker}</strong><small>发放前必须修正</small></article>
      <article><span>需修改</span><strong>{counts.warning}</strong><small>建议逐条核对</small></article>
      <article><span>估计作答时长</span><strong>{minutes.low}–{minutes.high} 分钟</strong><small>按字数与题型估算，非实测</small></article>
    </div>
    <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="结果类型"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>
      {([['findings', '预测试发现'], ['theater', '访谈与圆桌'], ['fidelity', '保真度检验'], ['answers', '答案分布'], ['export', '导出与披露']] as Array<[Tab, string]>).map(([key, label]) =>
        <button type="button" role="tab" key={key} data-motion-id={key} id={`sx-tab-${key}`} aria-selected={tab === key} aria-controls={`sx-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={e => {
          const keys: Tab[] = ['findings', 'theater', 'fidelity', 'answers', 'export'];
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const next = keys[(keys.indexOf(key) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
          setTab(next); document.getElementById(`sx-tab-${next}`)?.focus();
        }}>{label}</button>)}
    </div>
    <div role="tabpanel" id="sx-panel-findings" aria-labelledby="sx-tab-findings" className={styles.tabPanel} hidden={tab !== 'findings'}><FindingsList findings={findings} design={design} onFocusQuestion={onFocusQuestion}/></div>
    <div role="tabpanel" id="sx-panel-theater" aria-labelledby="sx-tab-theater" className={styles.tabPanel} hidden={tab !== 'theater'}><InterviewTheaterPanel design={design} run={run} onFocusQuestion={onFocusQuestion}/></div>
    <div role="tabpanel" id="sx-panel-fidelity" aria-labelledby="sx-tab-fidelity" className={styles.tabPanel} hidden={tab !== 'fidelity'}><Fidelity report={report} design={design} run={run} expectations={expectations} setExpectations={setExpectations}/></div>
    <div role="tabpanel" id="sx-panel-answers" aria-labelledby="sx-tab-answers" className={styles.tabPanel} hidden={tab !== 'answers'}><Answers design={design} run={run}/></div>
    <div role="tabpanel" id="sx-panel-export" aria-labelledby="sx-tab-export" className={styles.tabPanel} hidden={tab !== 'export'}><ExportPanel design={design} run={run} onSendToAnalysis={onSendToAnalysis}/></div>
  </div>;
}

function FindingsList({ findings, design, onFocusQuestion }: { findings: Finding[]; design: Questionnaire; onFocusQuestion: (id: string) => void }) {
  if (!findings.length) return <div className={styles.emptyState} role="status"><strong>本轮没有发现明显问题</strong><p>模拟中未见明显障碍，仍需通过真人认知访谈核验。</p></div>;
  const number = new Map(design.questions.map((q, i) => [q.id, i + 1]));
  return <ol className={styles.findings}>
    {findings.map((f, i) => {
      const q = f.questionId ? design.questions.find(x => x.id === f.questionId) : null;
      return <li key={i} data-level={f.level}>
        <span className={styles.level} data-level={f.level}><i aria-hidden="true">{LEVEL[f.level].icon}</i>{LEVEL[f.level].label}</span>
        <div>
          <p className={styles.findingWhere}>{q ? <button type="button" className={styles.linkButton} onClick={() => onFocusQuestion(q.id)}>第 {number.get(q.id)} 题 · {q.variable}</button> : '整卷'}<small>{q ? cleanResultText(q.text).slice(0, 40) + (q.text.length > 40 ? '…' : '') : ''}</small></p>
          <p>{cleanResultText(f.message)}</p>
          {f.examples.length > 0 && <ul className={styles.quotes}>{f.examples.map(e => <li key={e}>{cleanResultText(e)}</li>)}</ul>}
        </div>
      </li>;
    })}
  </ol>;
}

function Fidelity({ report, design, run, expectations, setExpectations }: { report: FidelityReport; design: Questionnaire; run: SiliconRun; expectations: Expectation[]; setExpectations: (next: Expectation[]) => void }) {
  const refs: Array<{ value: string; ref: VarRef; label: string }> = [
    ...design.questions.filter(q => q.type === 'likert' || q.type === 'number' || (q.type === 'single' && q.choices.length >= 2)).map(q => ({ value: `q:${q.id}`, ref: { kind: 'question', id: q.id } as VarRef, label: refLabel({ kind: 'question', id: q.id }, design, run.attributes) })),
    ...run.attributes.map(a => ({ value: `a:${a.key}`, ref: { kind: 'attribute', key: a.key } as VarRef, label: refLabel({ kind: 'attribute', key: a.key }, design, run.attributes) })),
  ];
  const [a, setA] = useState(refs[0]?.value ?? ''), [b, setB] = useState(refs[1]?.value ?? ''), [direction, setDirection] = useState<'positive' | 'negative'>('positive');
  const effectiveA = refs.some(r => r.value === a) ? a : refs[0]?.value ?? '';
  const effectiveB = refs.some(r => r.value === b) ? b : refs[1]?.value ?? '';
  const maxV = Math.max(0.3, ...report.backward.attributes.map(x => x.v));
  return <div className={styles.fidelity}>
    <p className={styles.lead}>从回答风格、内部一致性、信息响应和关系方向四个维度检查模拟回答。</p>
    <div className={styles.criteria}>
      <article><header><span>01</span><h4>社会科学图灵测试</h4><VerdictBadge verdict="manual"/></header><p>{cleanResultText(report.turing.note)}</p></article>
      <article><header><span>02</span><h4>反向连续性</h4><VerdictBadge verdict={report.backward.verdict}/></header>
        <p>画像属性与回答的最大关联（Cramér V），用于检查背景特征是否反映在回答中。</p>
        <ul className={styles.vBars} aria-label="各属性与回答的最大 Cramér V">
          {report.backward.attributes.map(x => <li key={x.key}><span>{x.label}</span><span className={styles.vTrack}><i style={{ width: `${(x.v / maxV) * 100}%` }}/></span><b>{x.v.toFixed(2)}</b><small>{x.question ? `对应 ${x.question}` : '无可比题目'}</small></li>)}
        </ul>
      </article>
      <article><header><span>03</span><h4>向前连续性</h4><VerdictBadge verdict={report.forward.verdict}/></header>
        <dl className={styles.facts}>
          <div><dt>量表直线作答</dt><dd>{pct(report.forward.straightlining)}</dd></div>
          <div><dt>正反向题前后一致</dt><dd>{pct(report.forward.reversePairs)}</dd></div>
          <div><dt>跳转违规</dt><dd>{report.forward.routingViolations}</dd></div>
        </dl>
        {report.forward.notes.map(n => <p key={n} className={styles.small}>{cleanResultText(n)}</p>)}
      </article>
      <article><header><span>04</span><h4>模式对应性</h4><VerdictBadge verdict={report.pattern.verdict}/></header>
        <p>根据文献或常识预先记录关系方向，再与模拟结果比较。</p>
        {report.pattern.checks.length > 0 && <ul className={styles.checks}>{report.pattern.checks.map(c => <li key={c.id} data-result={c.result}>
          <span>{cleanResultText(c.label)}</span><small>预期{c.expected === 'positive' ? '正相关' : '负相关'} · 秩相关 {c.rho.toFixed(2)} · 样本 {c.n}</small>
          <b>{c.result === 'match' ? '一致' : c.result === 'mismatch' ? '相反' : '不明确'}</b>
          <button type="button" className={styles.iconButton} aria-label={`删除预期“${cleanResultText(c.label)}”`} onClick={() => setExpectations(expectations.filter(e => e.id !== c.id))}>×</button>
        </li>)}</ul>}
        {refs.length >= 2 && <div className={styles.expectForm}>
          <select aria-label="变量 A" value={effectiveA} onChange={e => setA(e.target.value)}>{refs.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          <select aria-label="预期方向" value={direction} onChange={e => setDirection(e.target.value as 'positive' | 'negative')}><option value="positive">正相关</option><option value="negative">负相关</option></select>
          <select aria-label="变量 B" value={effectiveB} onChange={e => setB(e.target.value)}>{refs.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          <button type="button" disabled={!effectiveA || !effectiveB || effectiveA === effectiveB || expectations.length >= 12} onClick={() => {
            const ra = refs.find(r => r.value === effectiveA), rb = refs.find(r => r.value === effectiveB);
            if (!ra || !rb || ra.value === rb.value || expectations.length >= 12) return;
            setExpectations([...expectations, { id: `exp-${Date.now().toString(36)}`, a: ra.ref, b: rb.ref, direction, note: '' }]);
          }}>添加预期</button>
        </div>}
      </article>
    </div>
    <div className={styles.statRow}>
      <article><span>重复答卷比例</span><strong>{pct(report.diversity.duplicateRate)}</strong><small>整份回答完全相同的比例，提示回答趋同</small></article>
      <article><span>回答多样性</span><strong>{report.diversity.entropy === null ? '—' : report.diversity.entropy.toFixed(2)}</strong><small>封闭题标准化熵，0 = 全部相同，1 = 均匀分散</small></article>
      <article><span>跨通道一致率</span><strong>{report.agreement.models >= 2 ? pct(report.agreement.rate) : '—'}</strong><small>{report.agreement.models >= 2 ? `${report.agreement.models} 路推演对同一画像封闭题答案相同的比例` : '同时开启 2–3 路推演时才可横向比较'}</small></article>
      <article><span>高风险画像</span><strong>{report.risk.elevated}/{report.risk.total}</strong><small>{report.risk.reasons.length ? report.risk.reasons.join('、') : '未命中需重点复核人群特征'}</small></article>
    </div>
  </div>;
}

function Answers({ design, run }: { design: Questionnaire; run: SiliconRun }) {
  const closed = design.questions.filter(q => q.type === 'single' || q.type === 'multi' || q.type === 'likert');
  const [questionId, setQuestionId] = useState(closed[0]?.id ?? '');
  const [groupBy, setGroupBy] = useState(run.settings.scenarios.length > 1 ? 'scenario' : 'all');
  const effectiveGroupBy = groupBy === 'all'
    || (groupBy === 'scenario' && run.settings.scenarios.length > 1)
    || (groupBy === 'model' && run.settings.models.length > 1)
    || run.attributes.some(a => groupBy === `attr:${a.key}`)
    ? groupBy : 'all';
  const q = closed.find(x => x.id === questionId) ?? closed[0];
  const data = q ? distribution(design, run, q.id, effectiveGroupBy) : null;
  const opens = design.questions.filter(x => x.type === 'text');
  return <div className={styles.answers}>
    <div className={styles.filterRow}>
      <label><span>题目</span><select aria-label="选择要查看分布的题目" value={q?.id ?? ''} onChange={e => setQuestionId(e.target.value)}>{closed.map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.variable} · {cleanResultText(x.text).slice(0, 22)}</option>)}</select></label>
      <label><span>分组</span><select aria-label="选择答案分布分组方式" value={effectiveGroupBy} onChange={e => setGroupBy(e.target.value)}>
        <option value="all">不分组</option>
        {run.settings.scenarios.length > 1 && <option value="scenario">按情境</option>}
        {run.settings.models.length > 1 && <option value="model">按推演通道</option>}
        {run.attributes.map(a => <option key={a.key} value={`attr:${a.key}`}>按{a.label}</option>)}
      </select></label>
    </div>
    <p className={styles.simBanner}>硅基样本 · 模拟数据（与真实调查严格分开）</p>
    {q && data ? <AnswerChart data={data} kind={q.type === 'likert' ? 'likert' : q.type === 'multi' ? 'multi' : 'single'} title={`${q.variable} · ${cleanResultText(q.text)}`}/> : <p className={styles.hint} role="status">问卷中没有可绘制分布的封闭题。</p>}
    {opens.length > 0 && <details className={styles.openAnswers}><summary>开放题回答（{opens.length} 题）</summary>
      {opens.map(o => { const texts = run.responses.flatMap(r => r.answers.filter(a => a.questionId === o.id && a.shown && !a.refused && typeof a.value === 'string').map(a => a.value as string)); return <div key={o.id}><h5>{o.variable} · {cleanResultText(o.text)}</h5>{texts.length ? <ul>{[...new Set(texts)].slice(0, 12).map(t => <li key={t}>{cleanResultText(t)}</li>)}</ul> : <p className={styles.small}>没有回答。</p>}</div>; })}
    </details>}
  </div>;
}

function ExportPanel({ design, run, onSendToAnalysis }: { design: Questionnaire; run: SiliconRun; onSendToAnalysis?: (handoff: DatasetHandoff) => void }) {
  const [copied, setCopied] = useState(false);
  const text = disclosureText(design, run);
  const stamp = run.createdAt.slice(0, 10);
  return <div className={styles.exportPanel}>
    <div className={styles.boundaryCard}>
      <strong>导出模拟数据</strong>
      <p>用于问卷预测试、分析演练与敏感性检查，模拟数据与真实调查样本严格分开。</p>
    </div>
    <div className={styles.exportActions}>
      <button type="button" onClick={() => download(siliconCsv(design, run), `硅基样本-模拟数据-${stamp}.csv`, 'text/csv;charset=utf-8')}>下载模拟数据 CSV</button>
      <button type="button" onClick={() => download(siliconRunJson(run), `硅基样本-运行记录-${stamp}.json`, 'application/json')}>导出完整推演记录</button>
      {onSendToAnalysis && <button type="button" className={styles.primary} onClick={() => onSendToAnalysis({ id: `${run.id}-${Date.now().toString(36)}`, name: `硅基样本 · ${cleanResultText(design.title || '未命名问卷')} · ${stamp}`, csv: siliconCsv(design, run) })}>在数据分析中演练（模拟数据）</button>}
    </div>
    <label className={styles.wideField}><span>预测试使用披露说明（可放入方法说明部分，最后一段请据实填写）</span><textarea aria-label="预测试使用披露说明" readOnly rows={7} value={cleanResultText(text)}/></label>
    <button type="button" className={styles.linkButton} aria-live="polite" onClick={() => { void navigator.clipboard?.writeText(cleanResultText(text)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>{copied ? '已复制' : '复制说明文字'}</button>
  </div>;
}

function InterviewTheaterPanel({ design, run, onFocusQuestion }: { design: Questionnaire; run: SiliconRun; onFocusQuestion: (questionId: string) => void }) {
  const [mode, setMode] = useState<'interview' | 'roundtable' | 'matrix'>('interview');
  const respondents = useMemo(() => run.personas.slice(0, 10), [run.personas]);
  const [activeId, setActiveId] = useState<string>(respondents[0]?.id ?? '');
  const [copiedTable, setCopiedTable] = useState(false);

  const activePersona = respondents.find(p => p.id === activeId) ?? respondents[0] ?? null;
  const profiles = useMemo(
    () => new Map(respondents.map(p => [p.id, synthesizePersonaProfile(p, run.attributes, design.title)])),
    [respondents, run.attributes, design.title],
  );
  const scenario = run.settings.scenarios[0] ?? NO_SCENARIO;
  const activeResponse = activePersona ? run.responses.find(r => r.personaId === activePersona.id && r.scenarioId === scenario.id) ?? run.responses.find(r => r.personaId === activePersona.id) : null;
  const keyQuestions = useMemo(() => design.questions.slice(0, 5), [design.questions]);

  const roundtableTurns = useMemo(() => {
    const cast = respondents.slice(0, 4);
    const focusQ = design.questions.find(q => q.type === 'likert') ?? design.questions[0];
    return cast.map((p, idx) => {
      const prof = profiles.get(p.id)!;
      const next = cast[(idx + 1) % cast.length];
      const nextProf = profiles.get(next.id)!;
      const resp = run.responses.find(r => r.personaId === p.id && r.status === 'ok');
      const ans = focusQ && resp ? resp.answers.find(a => a.questionId === focusQ.id) : undefined;
      const ansText = ans && ans.shown && focusQ ? (ans.refused ? '跳过未作答' : answerLabel(focusQ, ans.value)) : '视具体情境而定';
      const reaction = idx === 0
        ? `我先说说自己的第一反应，面对“${cleanResultText(focusQ?.text.slice(0, 22) || design.title)}”，我的选择是“${cleanResultText(ansText)}”。${cleanResultText(prof.catchphrase)}`
        : `接着前面几位说的，我（${prof.archetype}）其实挺有同感，但站我日常习惯来看，“${cleanResultText(ansText)}”背后最卡人的一点是选项缺少真实生活边界——${cleanResultText(prof.catchphrase)}`;
      const cueReason = idx < cast.length - 1
        ? `由“${nextProf.archetype}”视角补充对照组反应，检验不同层级受访者是否对同一题干产生歧义`
        : '收束本轮焦点讨论，交由研究者核对是否拆解双关题干';
      return {
        persona: p,
        profile: prof,
        answerText: ansText,
        reaction,
        unclear: ans?.unclear?.trim() || '',
        nextName: idx < cast.length - 1 ? nextProf.alias : null,
        cueReason,
      };
    });
  }, [respondents, design.questions, design.title, profiles, run.responses]);

  const matrixMarkdown = useMemo(() => {
    const header = ['受访者（花名 · 编号）', ...keyQuestions.map(q => q.variable || q.id)];
    const rows = respondents.map(p => {
      const prof = profiles.get(p.id)!;
      const resp = run.responses.find(r => r.personaId === p.id);
      const cells = keyQuestions.map(q => {
        const a = resp?.answers.find(x => x.questionId === q.id);
        if (!a || !a.shown) return '未显示';
        return a.refused ? '跳过' : answerLabel(q, a.value);
      });
      return [ `${prof.alias} (${p.code})`, ...cells ];
    });
    return [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...rows.map(r => `| ${r.join(' | ')} |`),
    ].join('\n');
  }, [respondents, keyQuestions, profiles, run.responses]);

  if (!activePersona) return <div className={styles.emptyState} role="status"><p>暂无可播放的硅基受访者实录。</p></div>;

  const activeProfile = profiles.get(activePersona.id)!;
  const answerMemory = new Map<string, SiliconAnswer>();

  return <div className={styles.theaterWrap}>
    <div className={styles.theaterHead}>
      <div className={styles.theaterModePills} role="tablist" aria-label="访谈呈现模式">
        <button type="button" role="tab" aria-selected={mode === 'interview'} onClick={() => setMode('interview')}>💬 1v1 访谈实录</button>
        <button type="button" role="tab" aria-selected={mode === 'roundtable'} onClick={() => setMode('roundtable')}>🔥 焦点小组圆桌</button>
        <button type="button" role="tab" aria-selected={mode === 'matrix'} onClick={() => setMode('matrix')}>⊞ 受访者溯源矩阵</button>
      </div>
      <span className={styles.simBanner}>硅基模拟实录 · 严禁充当真实访谈样本</span>
    </div>

    {mode === 'interview' && (
      <>
        <div className={styles.theaterPersonaBar}>
          <PersonaAvatar appearance={activePersona.appearance} size={46}/>
          <div>
            <strong>{activeProfile.alias} <code className={styles.codePill}>{activePersona.code}</code></strong>
            <small>{activeProfile.archetype}</small>
            <div className={styles.tagPills}>{activeProfile.tags.map(t => <span key={t} className={styles.tagPill}>{t}</span>)}</div>
          </div>
          <blockquote className={styles.inlineQuote}>“{activeProfile.catchphrase}”</blockquote>
        </div>

        <ol className={styles.chatTranscript}>
          {design.questions.map((q, qi) => {
            const a = activeResponse?.answers.find(x => x.questionId === q.id);
            const questionLine = cleanResultText(renderQuestionText(design, q, scenario, answerMemory));
            if (a) answerMemory.set(q.id, a);
            if (!a || !a.shown) return null;
            return <li key={q.id} className={styles.chatExchange}>
              <div className={styles.chatHost}>
                <span>证见主持 · Q{qi + 1} ({q.variable})</span>
                <p>{questionLine}</p>
              </div>
              <div className={styles.chatGuest}>
                <PersonaAvatar appearance={activePersona.appearance} size={28}/>
                <div>
                  <span className={styles.chatGuestName}>{activeProfile.alias}</span>
                  <strong>{a.refused ? '（选择跳过 / 不适用）' : cleanResultText(answerLabel(q, a.value))}</strong>
                  {a.unclear && (
                    <em>
                      💭 {cleanResultText(a.unclear)}{' '}
                      <button type="button" className={styles.linkButton} onClick={() => onFocusQuestion(q.id)}>核查此题 →</button>
                    </em>
                  )}
                </div>
              </div>
            </li>;
          })}
        </ol>

        <div className={styles.respondentSwitcher} role="tablist" aria-label="切换受访者">
          {respondents.map(p => {
            const prof = profiles.get(p.id)!;
            const hasFlag = run.responses.some(r => r.personaId === p.id && r.answers.some(a => a.unclear.trim()));
            return <button key={p.id} type="button" role="tab" aria-selected={activePersona.id === p.id} className={styles.respondentPill} onClick={() => setActiveId(p.id)}>
              <PersonaAvatar appearance={p.appearance} size={24}/>
              <span>{prof.alias.split(' · ').pop()}</span>
              <code className={styles.codePill}>{p.code}</code>
              {hasFlag && <i className={styles.riskDot} title="该受访者在部分题目触发理解困惑" aria-label="有作答困惑"/>}
            </button>;
          })}
        </div>
      </>
    )}

    {mode === 'roundtable' && (
      <div className={styles.roundtableList}>
        <div className={styles.moderatorCard}>
          <strong>● 证见主持 · 圆桌议题</strong>
          <p>围绕《{cleanResultText(design.title || '当前调查问卷')}》，请 4 位不同画像受访者互相回应刚才最容易卡顿或引起歧义的问题。</p>
        </div>
        {roundtableTurns.map((turn, idx) => (
          <div key={turn.persona.id} className={styles.roundtableTurn}>
            <div className={styles.roundtableSpeaker}>
              <PersonaAvatar appearance={turn.persona.appearance} size={36}/>
              <div>
                <div className={styles.roundtableMeta}>
                  <strong>{turn.profile.alias}</strong>
                  <span className={styles.tagPill}>{turn.profile.archetype}</span>
                  <code className={styles.codePill}>{turn.persona.code}</code>
                </div>
                <p>{turn.reaction}</p>
                {turn.unclear && <em className={styles.roundtableFlag}>💭 本题试答卡顿点在于“{cleanResultText(turn.unclear)}”</em>}
              </div>
            </div>
            {turn.nextName && (
              <details className={styles.turnCue}>
                <summary>@ {turn.nextName} · 接麦调度原因 ▾</summary>
                <p>第 {idx + 1} 棒转由下一位发言，{cleanResultText(turn.cueReason)}</p>
              </details>
            )}
          </div>
        ))}
      </div>
    )}

    {mode === 'matrix' && (
      <div className={styles.matrixBox}>
        <div className={styles.matrixBar}>
          <strong>受访者作答溯源矩阵（{respondents.length} 位 × {keyQuestions.length} 题）</strong>
          <button type="button" className={styles.linkButton} aria-live="polite" onClick={() => { void navigator.clipboard?.writeText(matrixMarkdown).then(() => { setCopiedTable(true); setTimeout(() => setCopiedTable(false), 1800); }); }}>
            {copiedTable ? '✓ 已复制矩阵表格' : '复制表格数据'}
          </button>
        </div>
        <div className={styles.matrixScroll}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th>受访者（花名 · 编号）</th>
                {keyQuestions.map(q => <th key={q.id} title={q.text}>{q.variable || q.id}</th>)}
              </tr>
            </thead>
            <tbody>
              {respondents.map(p => {
                const prof = profiles.get(p.id)!;
                const resp = run.responses.find(r => r.personaId === p.id);
                return <tr key={p.id}>
                  <td><button type="button" className={styles.linkButton} onClick={() => { setActiveId(p.id); setMode('interview'); }}>{prof.alias} <code>{p.code}</code></button></td>
                  {keyQuestions.map(q => {
                    const a = resp?.answers.find(x => x.questionId === q.id);
                    return <td key={q.id}>{!a || !a.shown ? '未显示' : a.refused ? '跳过' : answerLabel(q, a.value)}</td>;
                  })}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>;
}
