'use client';

import { useMemo, useState } from 'react';
import { distribution, estimateMinutes, fidelityReport, pretestFindings, refLabel, type Expectation, type FidelityReport, type Finding, type VarRef, type Verdict } from '@/lib/silicon/assess';
import { disclosureText, siliconCsv, siliconRunJson } from '@/lib/silicon/export';
import type { Questionnaire } from '@/lib/questionnaire';
import type { SiliconRun } from '@/lib/silicon/run';
import AnswerChart from './AnswerChart';
import styles from './SiliconLab.module.css';

export type DatasetHandoff = { id: string; name: string; csv: string };
type Tab = 'findings' | 'fidelity' | 'answers' | 'export';
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
  const ok = run.responses.filter(r => r.status === 'ok').length, failed = run.responses.length - ok;
  const minutes = estimateMinutes(design);
  const counts = { blocker: findings.filter(f => f.level === 'blocker').length, warning: findings.filter(f => f.level === 'warning').length };

  return <div className={styles.results}>
    {stale && <p className={styles.warnNote} role="status"><b>结果对应旧版本</b>问卷或画像在本次运行后已修改。下方结果仍按运行时的版本计算，请重新运行后再据此修改问卷。</p>}
    <div className={styles.statRow}>
      <article><span>模拟回答</span><strong>{ok}</strong><small>{run.personas.length} 位 × {run.settings.scenarios.length} 个情境 × {run.settings.models.length} 个引擎{failed ? ` · ${failed} 份失败` : ''}</small></article>
      <article><span>阻断问题</span><strong>{counts.blocker}</strong><small>发放前必须修正</small></article>
      <article><span>需修改</span><strong>{counts.warning}</strong><small>建议逐条核对</small></article>
      <article><span>估计作答时长</span><strong>{minutes.low}–{minutes.high} 分钟</strong><small>按字数与题型估算，非实测</small></article>
    </div>
    <div className={styles.tabs} role="tablist" aria-label="结果类型">
      {([['findings', '预测试发现'], ['fidelity', '保真度检验'], ['answers', '答案分布'], ['export', '导出与披露']] as Array<[Tab, string]>).map(([key, label]) =>
        <button type="button" role="tab" key={key} id={`sx-tab-${key}`} aria-selected={tab === key} aria-controls={`sx-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={e => {
          const keys: Tab[] = ['findings', 'fidelity', 'answers', 'export'];
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const next = keys[(keys.indexOf(key) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
          setTab(next); document.getElementById(`sx-tab-${next}`)?.focus();
        }}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`sx-panel-${tab}`} aria-labelledby={`sx-tab-${tab}`} className={styles.tabPanel}>
      {tab === 'findings' && <FindingsList findings={findings} design={design} onFocusQuestion={onFocusQuestion}/>}
      {tab === 'fidelity' && <Fidelity report={report} design={design} run={run} expectations={expectations} setExpectations={setExpectations}/>}
      {tab === 'answers' && <Answers design={design} run={run}/>}
      {tab === 'export' && <ExportPanel design={design} run={run} onSendToAnalysis={onSendToAnalysis}/>}
    </div>
  </div>;
}

function FindingsList({ findings, design, onFocusQuestion }: { findings: Finding[]; design: Questionnaire; onFocusQuestion: (id: string) => void }) {
  if (!findings.length) return <div className={styles.emptyState}><strong>本轮没有发现明显问题</strong><p>这只说明模拟受访者没有遇到障碍，不代表问卷对真实受访者同样清楚。请继续做真人认知访谈。</p></div>;
  const number = new Map(design.questions.map((q, i) => [q.id, i + 1]));
  return <ol className={styles.findings}>
    {findings.map((f, i) => {
      const q = f.questionId ? design.questions.find(x => x.id === f.questionId) : null;
      return <li key={i} data-level={f.level}>
        <span className={styles.level} data-level={f.level}><i aria-hidden="true">{LEVEL[f.level].icon}</i>{LEVEL[f.level].label}</span>
        <div>
          <p className={styles.findingWhere}>{q ? <button type="button" className={styles.linkButton} onClick={() => onFocusQuestion(q.id)}>第 {number.get(q.id)} 题 · {q.variable}</button> : '整卷'}<small>{q ? q.text.slice(0, 40) + (q.text.length > 40 ? '…' : '') : ''}</small></p>
          <p>{f.message}</p>
          {f.examples.length > 0 && <ul className={styles.quotes}>{f.examples.map(e => <li key={e}>{e}</li>)}</ul>}
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
  const maxV = Math.max(0.3, ...report.backward.attributes.map(x => x.v));
  return <div className={styles.fidelity}>
    <p className={styles.lead}>按 Argyle 等人提出的四项标准检验“像不像”。通过只说明模拟内部自洽，不能证明它代表真实人群。</p>
    <div className={styles.criteria}>
      <article><header><span>01</span><h4>社会科学图灵测试</h4><VerdictBadge verdict="manual"/></header><p>{report.turing.note}</p></article>
      <article><header><span>02</span><h4>反向连续性</h4><VerdictBadge verdict={report.backward.verdict}/></header>
        <p>从回答能否看出设定的身份？下面是每个画像属性与回答的最大关联（Cramér V）。全都接近 0，说明设定没有起作用。</p>
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
        {report.forward.notes.map(n => <p key={n} className={styles.small}>{n}</p>)}
      </article>
      <article><header><span>04</span><h4>模式对应性</h4><VerdictBadge verdict={report.pattern.verdict}/></header>
        <p>先写下你根据文献或常识预期的关系，再看模拟结果是否一致。预期必须在看结果之前写好。</p>
        {report.pattern.checks.length > 0 && <ul className={styles.checks}>{report.pattern.checks.map(c => <li key={c.id} data-result={c.result}>
          <span>{c.label}</span><small>预期{c.expected === 'positive' ? '正相关' : '负相关'} · ρ = {c.rho.toFixed(2)} · n = {c.n}</small>
          <b>{c.result === 'match' ? '一致' : c.result === 'mismatch' ? '相反' : '不明确'}</b>
          <button type="button" className={styles.iconButton} aria-label="删除这条预期" onClick={() => setExpectations(expectations.filter(e => e.id !== c.id))}>×</button>
        </li>)}</ul>}
        {refs.length >= 2 && <div className={styles.expectForm}>
          <select aria-label="变量 A" value={a} onChange={e => setA(e.target.value)}>{refs.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          <select aria-label="预期方向" value={direction} onChange={e => setDirection(e.target.value as 'positive' | 'negative')}><option value="positive">正相关</option><option value="negative">负相关</option></select>
          <select aria-label="变量 B" value={b} onChange={e => setB(e.target.value)}>{refs.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          <button type="button" disabled={!a || !b || a === b || expectations.length >= 12} onClick={() => { const ra = refs.find(r => r.value === a)!.ref, rb = refs.find(r => r.value === b)!.ref; setExpectations([...expectations, { id: `exp-${Date.now().toString(36)}`, a: ra, b: rb, direction, note: '' }]); }}>添加预期</button>
        </div>}
      </article>
    </div>
    <div className={styles.statRow}>
      <article><span>重复答卷比例</span><strong>{pct(report.diversity.duplicateRate)}</strong><small>完全相同的整份回答；过高说明模型回答趋同</small></article>
      <article><span>回答多样性</span><strong>{report.diversity.entropy === null ? '—' : report.diversity.entropy.toFixed(2)}</strong><small>封闭题标准化熵，0 = 全部相同，1 = 均匀分散</small></article>
      <article><span>多模型一致率</span><strong>{report.agreement.models >= 2 ? pct(report.agreement.rate) : '—'}</strong><small>{report.agreement.models >= 2 ? `${report.agreement.models} 个模型对同一画像的封闭题答案相同的比例` : '同时运行 2–3 个模型才可比较'}</small></article>
      <article><span>高风险画像</span><strong>{report.risk.elevated}/{report.risk.total}</strong><small>{report.risk.reasons.length ? report.risk.reasons.join('、') : '未发现训练数据覆盖较弱的人群标记'}</small></article>
    </div>
  </div>;
}

function Answers({ design, run }: { design: Questionnaire; run: SiliconRun }) {
  const closed = design.questions.filter(q => q.type === 'single' || q.type === 'multi' || q.type === 'likert');
  const [questionId, setQuestionId] = useState(closed[0]?.id ?? '');
  const [groupBy, setGroupBy] = useState(run.settings.scenarios.length > 1 ? 'scenario' : 'all');
  const q = closed.find(x => x.id === questionId) ?? closed[0];
  const data = q ? distribution(design, run, q.id, groupBy) : null;
  const opens = design.questions.filter(x => x.type === 'text');
  return <div className={styles.answers}>
    <div className={styles.filterRow}>
      <label><span>题目</span><select value={q?.id ?? ''} onChange={e => setQuestionId(e.target.value)}>{closed.map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.variable} · {x.text.slice(0, 22)}</option>)}</select></label>
      <label><span>分组</span><select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
        <option value="all">不分组</option>
        {run.settings.scenarios.length > 1 && <option value="scenario">按情境</option>}
        {run.settings.models.length > 1 && <option value="model">按模型</option>}
        {run.attributes.map(a => <option key={a.key} value={`attr:${a.key}`}>按{a.label}</option>)}
      </select></label>
    </div>
    <p className={styles.simBanner}>模拟数据 · 只用于检查问卷，不是调查结果</p>
    {q && data ? <AnswerChart data={data} kind={q.type === 'likert' ? 'likert' : q.type === 'multi' ? 'multi' : 'single'} title={`${q.variable} · ${q.text}`}/> : <p className={styles.hint}>问卷中没有可绘制分布的封闭题。</p>}
    {opens.length > 0 && <details className={styles.openAnswers}><summary>开放题回答（{opens.length} 题）</summary>
      {opens.map(o => { const texts = run.responses.flatMap(r => r.answers.filter(a => a.questionId === o.id && a.shown && !a.refused && typeof a.value === 'string').map(a => a.value as string)); return <div key={o.id}><h5>{o.variable} · {o.text}</h5>{texts.length ? <ul>{[...new Set(texts)].slice(0, 12).map(t => <li key={t}>{t}</li>)}</ul> : <p className={styles.small}>没有回答。</p>}</div>; })}
    </details>}
  </div>;
}

function ExportPanel({ design, run, onSendToAnalysis }: { design: Questionnaire; run: SiliconRun; onSendToAnalysis?: (handoff: DatasetHandoff) => void }) {
  const [copied, setCopied] = useState(false);
  const text = disclosureText(design, run);
  const stamp = run.createdAt.slice(0, 10);
  return <div className={styles.exportPanel}>
    <div className={styles.boundaryCard}>
      <strong>使用边界</strong>
      <ul>
        <li>可以：发放前找出表述不清、选项缺失、跳转错误；演练分析流程；作为先验或敏感性分析的参考。</li>
        <li>不可以：填补或扩充真实样本，与真实答卷混合分析，或写成调研发现。</li>
        <li>每一行导出数据都带有 <code>__origin = silicon_simulated</code> 标记，分析工具读取后会强制按模拟数据处理。</li>
      </ul>
    </div>
    <div className={styles.exportActions}>
      <button type="button" onClick={() => download(siliconCsv(design, run), `硅基样本-模拟数据-${stamp}.csv`, 'text/csv;charset=utf-8')}>下载模拟数据 CSV</button>
      <button type="button" onClick={() => download(siliconRunJson(run), `硅基样本-运行记录-${stamp}.json`, 'application/json')}>下载完整运行记录 JSON</button>
      {onSendToAnalysis && <button type="button" className={styles.primary} onClick={() => onSendToAnalysis({ id: `${run.id}-${Date.now().toString(36)}`, name: `硅基样本 · ${design.title || '未命名问卷'} · ${stamp}`, csv: siliconCsv(design, run) })}>在数据分析中演练（模拟数据）</button>}
    </div>
    <label className={styles.wideField}><span>AI 使用说明（可放入报告的方法部分，最后一段请据实填写）</span><textarea readOnly rows={7} value={text}/></label>
    <button type="button" className={styles.linkButton} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>{copied ? '已复制' : '复制说明文字'}</button>
  </div>;
}
