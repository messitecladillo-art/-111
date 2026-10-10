import { questionnaireIssues, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import { fidelityRisk, type PersonaAttribute } from './persona.ts';
import { placeholderIssues, type AnswerValue, type SiliconResponse, type SiliconRun } from './run.ts';

export type Finding = { questionId: string | null; level: 'blocker' | 'warning' | 'info'; kind: string; message: string; examples: string[] };
export type VarRef = { kind: 'question'; id: string } | { kind: 'attribute'; key: string };
export type Expectation = { id: string; a: VarRef; b: VarRef; direction: 'positive' | 'negative'; note: string };
export type Verdict = 'pass' | 'concern' | 'inconclusive' | 'manual';

const ok = (run: SiliconRun) => run.responses.filter(r => r.status === 'ok');
const answerOf = (response: SiliconResponse, questionId: string) => response.answers.find(a => a.questionId === questionId);
const closed = (q: DesignQuestion) => q.type === 'single' || q.type === 'likert';
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Reading time plus a typical answer overhead per item type; an estimate, not a measurement. */
export function estimateMinutes(design: Questionnaire): { low: number; high: number } {
  const overhead = { single: 3, multi: 5, likert: 3, number: 6, text: 25 } as const;
  const seconds = design.questions.reduce((sum, q) => {
    const chars = q.text.length + q.choices.reduce((s, c) => s + c.label.length, 0) + q.minLabel.length + q.maxLabel.length;
    return sum + chars / 6 + overhead[q.type];
  }, design.introduction.length / 6);
  return { low: Math.max(1, Math.round(seconds * 0.75 / 60)), high: Math.max(1, Math.round(seconds * 1.25 / 60)) };
}

/** Questionnaire problems surfaced by the simulated pretest, ordered by severity. */
export function pretestFindings(design: Questionnaire, run: SiliconRun): Finding[] {
  const findings: Finding[] = [];
  for (const issue of questionnaireIssues(design)) findings.push({ questionId: issue.questionId, level: issue.level === 'blocker' ? 'blocker' : 'warning', kind: `static:${issue.code}`, message: issue.message, examples: [] });
  for (const message of placeholderIssues(design, run.settings.scenarios)) findings.push({ questionId: null, level: 'warning', kind: 'placeholder', message, examples: [] });
  const responses = ok(run);
  if (!responses.length) return findings;
  for (const q of design.questions) {
    const answers = responses.map(r => answerOf(r, q.id)).filter((a): a is NonNullable<typeof a> => !!a);
    const shown = answers.filter(a => a.shown);
    if (!shown.length) { findings.push({ questionId: q.id, level: 'warning', kind: 'unreachable', message: '没有任何模拟受访者看到此题：跳题条件在本轮从未满足，请核对条件或画像。', examples: [] }); continue; }
    const unclear = shown.filter(a => a.unclear.trim());
    if (unclear.length / shown.length >= 0.2) findings.push({ questionId: q.id, level: 'warning', kind: 'unclear', message: `${pct(unclear.length / shown.length)} 的模拟受访者表示难以理解或无法按选项作答。`, examples: [...new Set(unclear.map(a => a.unclear.trim()))].slice(0, 3) });
    const refused = shown.filter(a => a.refused);
    if (refused.length / shown.length >= 0.15) findings.push({ questionId: q.id, level: 'warning', kind: 'refused', message: `${pct(refused.length / shown.length)} 的模拟受访者跳过或拒答，可能涉及敏感内容或与其情况不符。`, examples: [] });
    const values = shown.filter(a => !a.refused && a.value !== null).map(a => a.value as AnswerValue);
    if (values.length < 10) continue;
    if (q.type === 'single' || q.type === 'multi') {
      const counts = new Map(q.choices.map(c => [c.code, 0]));
      for (const v of values) for (const code of Array.isArray(v) ? v : [String(v)]) counts.set(code, (counts.get(code) ?? 0) + 1);
      const unused = q.choices.filter(c => !counts.get(c.code));
      if (unused.length) findings.push({ questionId: q.id, level: 'info', kind: 'unused_choice', message: `选项「${unused.map(c => c.label || c.code).join('」「')}」没有被任何模拟受访者选择，请确认它是否必要或表述是否清楚。`, examples: [] });
      if (q.type === 'single') {
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] / values.length >= 0.85) findings.push({ questionId: q.id, level: 'warning', kind: 'concentrated', message: `${pct(top[1] / values.length)} 的回答集中在「${q.choices.find(c => c.code === top[0])?.label || top[0]}」，题目可能有诱导或缺乏区分度。`, examples: [] });
      }
    }
    if (q.type === 'likert') {
      const nums = values.map(Number), min = q.min ?? Math.min(...nums), max = q.max ?? Math.max(...nums);
      if (new Set(nums).size === 1) findings.push({ questionId: q.id, level: 'warning', kind: 'no_variance', message: '所有模拟受访者给出了相同分值，量表在此题上没有区分度。', examples: [] });
      else {
        const top = nums.filter(n => n === max).length / nums.length, bottom = nums.filter(n => n === min).length / nums.length;
        if (top >= 0.7) findings.push({ questionId: q.id, level: 'warning', kind: 'ceiling', message: `${pct(top)} 选择了最高分，存在天花板效应风险。`, examples: [] });
        if (bottom >= 0.7) findings.push({ questionId: q.id, level: 'warning', kind: 'floor', message: `${pct(bottom)} 选择了最低分，存在地板效应风险。`, examples: [] });
      }
    }
  }
  const order = { blocker: 0, warning: 1, info: 2 } as const;
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}

/** Cramér's V (no small-sample correction) for a contingency table built from paired labels. */
export function cramersV(pairs: Array<[string, string]>): number {
  if (pairs.length < 2) return 0;
  const rows = [...new Set(pairs.map(p => p[0]))], cols = [...new Set(pairs.map(p => p[1]))];
  if (rows.length < 2 || cols.length < 2) return 0;
  const n = pairs.length, table = rows.map(() => cols.map(() => 0));
  for (const [r, c] of pairs) table[rows.indexOf(r)][cols.indexOf(c)]++;
  const rowSum = table.map(r => r.reduce((a, b) => a + b, 0)), colSum = cols.map((_, j) => table.reduce((a, r) => a + r[j], 0));
  let chi = 0;
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols.length; j++) { const e = rowSum[i] * colSum[j] / n; if (e > 0) chi += (table[i][j] - e) ** 2 / e; }
  return Math.sqrt(chi / (n * (Math.min(rows.length, cols.length) - 1)));
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v), out = new Array<number>(values.length);
  for (let k = 0; k < order.length;) {
    let j = k; while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    for (let m = k; m <= j; m++) out[order[m].i] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return out;
}

/** Spearman's rho with average ranks for ties; 0 when either side is constant. */
export function spearman(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return 0;
  const rx = ranks(x), ry = ranks(y), mean = (x.length + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { const a = rx[i] - mean, b = ry[i] - mean; num += a * b; dx += a * a; dy += b * b; }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function ordinal(ref: VarRef, response: SiliconResponse, run: SiliconRun, design: Questionnaire): number | null {
  if (ref.kind === 'attribute') {
    const attribute = run.attributes.find(a => a.key === ref.key), persona = run.personas.find(p => p.id === response.personaId);
    if (!attribute || !persona) return null;
    const index = attribute.levels.findIndex(l => l.label === persona.traits[ref.key]);
    return index < 0 ? null : index;
  }
  const question = design.questions.find(q => q.id === ref.id), answer = answerOf(response, ref.id);
  if (!question || !answer || !answer.shown || answer.refused || answer.value === null) return null;
  if (question.type === 'likert' || question.type === 'number') return Number(answer.value);
  if (question.type === 'single') { const i = question.choices.findIndex(c => c.code === answer.value); return i < 0 ? null : i; }
  return null;
}

export function refLabel(ref: VarRef, design: Questionnaire, attributes: PersonaAttribute[]): string {
  if (ref.kind === 'attribute') return `画像·${attributes.find(a => a.key === ref.key)?.label ?? ref.key}`;
  const q = design.questions.find(x => x.id === ref.id);
  return q ? `${q.variable} ${q.text.slice(0, 18)}${q.text.length > 18 ? '…' : ''}` : '已删除的题目';
}

export type FidelityReport = {
  turing: { verdict: 'manual'; note: string };
  backward: { verdict: Verdict; attributes: Array<{ key: string; label: string; v: number; question: string }> };
  forward: { verdict: Verdict; straightlining: number | null; reversePairs: number | null; routingViolations: number; notes: string[] };
  pattern: { verdict: Verdict; checks: Array<{ id: string; label: string; expected: 'positive' | 'negative'; rho: number; n: number; result: 'match' | 'mismatch' | 'inconclusive' }> };
  diversity: { duplicateRate: number; entropy: number | null };
  agreement: { models: number; rate: number | null };
  risk: { elevated: number; total: number; reasons: string[] };
};

/** Four fidelity criteria (Argyle et al.) plus diversity, cross-model agreement and coverage risk. */
export function fidelityReport(design: Questionnaire, run: SiliconRun, expectations: Expectation[]): FidelityReport {
  const responses = ok(run), closedQs = design.questions.filter(closed);
  const personaOf = new Map(run.personas.map(p => [p.id, p]));

  const attributes = run.attributes.map(a => {
    let best = { v: 0, question: '' };
    for (const q of closedQs) {
      const pairs: Array<[string, string]> = [];
      for (const r of responses) { const ans = answerOf(r, q.id), p = personaOf.get(r.personaId); if (ans?.shown && !ans.refused && ans.value !== null && p) pairs.push([p.traits[a.key] ?? '', String(ans.value)]); }
      if (pairs.length >= 10) { const v = cramersV(pairs); if (v > best.v) best = { v, question: q.variable }; }
    }
    return { key: a.key, label: a.label, v: Math.round(best.v * 100) / 100, question: best.question };
  });
  const backwardVerdict: Verdict = responses.length < 10 || !closedQs.length ? 'inconclusive' : attributes.every(a => a.v < 0.1) ? 'concern' : 'pass';

  const likerts = design.questions.filter(q => q.type === 'likert');
  let straight: number | null = null, reverse: number | null = null, violations = 0;
  const notes: string[] = [];
  if (likerts.length >= 3) {
    const eligible = responses.map(r => likerts.map(q => answerOf(r, q.id)).filter(a => a?.shown && !a.refused && a.value !== null).map(a => Number(a!.value))).filter(v => v.length >= 3);
    straight = eligible.length ? eligible.filter(v => new Set(v).size === 1).length / eligible.length : null;
  }
  const pairs: Array<[DesignQuestion, DesignQuestion]> = [];
  for (const a of likerts) for (const b of likerts) if (a.id < b.id && a.construct.trim() && a.construct.trim() === b.construct.trim() && a.reverse !== b.reverse) pairs.push([a, b]);
  if (pairs.length) {
    let checked = 0, inconsistent = 0;
    for (const r of responses) for (const [a, b] of pairs) {
      const x = answerOf(r, a.id), y = answerOf(r, b.id);
      if (!x?.shown || !y?.shown || x.value === null || y.value === null) continue;
      const scale = (q: DesignQuestion, v: number) => { const lo = q.min ?? 1, hi = q.max ?? 5; const u = (v - lo) / Math.max(1, hi - lo); return q.reverse ? 1 - u : u; };
      checked++; if (Math.abs(scale(a, Number(x.value)) - scale(b, Number(y.value))) > 0.5) inconsistent++;
    }
    reverse = checked ? 1 - inconsistent / checked : null;
  } else notes.push('没有同一构念下的正反向量表题，无法检验前后表态一致性；可在问卷中加入一对反向题。');
  for (const r of responses) for (const a of r.answers) if (!a.shown && a.value !== null) violations++;
  const forwardVerdict: Verdict = straight === null && reverse === null ? 'inconclusive' : (straight ?? 0) > 0.3 || (reverse !== null && reverse < 0.7) || violations > 0 ? 'concern' : 'pass';

  const checks = expectations.map(e => {
    const x: number[] = [], y: number[] = [];
    for (const r of responses) { const a = ordinal(e.a, r, run, design), b = ordinal(e.b, r, run, design); if (a !== null && b !== null) { x.push(a); y.push(b); } }
    const rho = Math.round(spearman(x, y) * 100) / 100;
    const result: 'match' | 'mismatch' | 'inconclusive' = x.length < 10 || Math.abs(rho) < 0.1 ? 'inconclusive' : (rho > 0) === (e.direction === 'positive') ? 'match' : 'mismatch';
    return { id: e.id, label: `${refLabel(e.a, design, run.attributes)} ↔ ${refLabel(e.b, design, run.attributes)}`, expected: e.direction, rho, n: x.length, result };
  });
  const patternVerdict: Verdict = !checks.length ? 'inconclusive' : checks.some(c => c.result === 'mismatch') ? 'concern' : checks.every(c => c.result === 'match') ? 'pass' : 'inconclusive';

  const vectors = responses.map(r => JSON.stringify(r.answers.map(a => a.value)));
  const duplicateRate = vectors.length ? 1 - new Set(vectors).size / vectors.length : 0;
  const entropies = closedQs.map(q => {
    const values = responses.map(r => answerOf(r, q.id)).filter(a => a?.shown && !a.refused && a.value !== null).map(a => String(a!.value));
    const k = q.type === 'single' ? q.choices.length : (q.max ?? 5) - (q.min ?? 1) + 1;
    if (values.length < 5 || k < 2) return null;
    const counts = [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>()).values()];
    const h = -counts.reduce((s, c) => s + (c / values.length) * Math.log(c / values.length), 0);
    return h / Math.log(k);
  }).filter((x): x is number => x !== null);

  const models = [...new Set(responses.map(r => r.model))];
  let rate: number | null = null;
  if (models.length >= 2) {
    let same = 0, total = 0;
    const groups = new Map<string, SiliconResponse[]>();
    for (const r of responses) groups.set(`${r.personaId}|${r.scenarioId}`, [...(groups.get(`${r.personaId}|${r.scenarioId}`) ?? []), r]);
    for (const group of groups.values()) if (group.length >= 2) for (const q of closedQs) {
      const vals = group.map(r => answerOf(r, q.id)).filter(a => a?.shown && a.value !== null).map(a => String(a!.value));
      if (vals.length >= 2) { total++; if (new Set(vals).size === 1) same++; }
    }
    rate = total ? same / total : null;
  }

  const risks = run.personas.map(fidelityRisk);
  return {
    turing: { verdict: 'manual', note: '需要人工盲评：把模拟开放回答与少量真实预调查回答混排，请未参与设计的同学判断来源。系统不替代这一步。' },
    backward: { verdict: backwardVerdict, attributes },
    forward: { verdict: forwardVerdict, straightlining: straight, reversePairs: reverse, routingViolations: violations, notes },
    pattern: { verdict: patternVerdict, checks },
    diversity: { duplicateRate, entropy: entropies.length ? entropies.reduce((a, b) => a + b, 0) / entropies.length : null },
    agreement: { models: models.length, rate },
    risk: { elevated: risks.filter(r => r.level === 'elevated').length, total: risks.length, reasons: [...new Set(risks.flatMap(r => r.reasons))] },
  };
}

export type Distribution = { categories: Array<{ key: string; label: string }>; groups: Array<{ key: string; label: string; counts: number[]; n: number }> };

/** Answer counts for one closed question, split by an attribute, scenario, model or nothing. */
export function distribution(design: Questionnaire, run: SiliconRun, questionId: string, groupBy: string): Distribution | null {
  const q = design.questions.find(x => x.id === questionId);
  if (!q || q.type === 'text' || q.type === 'number') return null;
  const categories = q.type === 'likert'
    ? Array.from({ length: Math.max(0, (q.max ?? 5) - (q.min ?? 1) + 1) }, (_, i) => { const v = String((q.min ?? 1) + i); return { key: v, label: v }; })
    : q.choices.map(c => ({ key: c.code, label: c.label || c.code }));
  const personaOf = new Map(run.personas.map(p => [p.id, p]));
  const groupOf = (r: SiliconResponse): [string, string] => {
    if (groupBy === 'scenario') { const s = run.settings.scenarios.find(x => x.id === r.scenarioId); return [r.scenarioId, s?.label ?? r.scenarioId]; }
    if (groupBy === 'model') return [r.model, r.model];
    if (groupBy.startsWith('attr:')) { const v = personaOf.get(r.personaId)?.traits[groupBy.slice(5)] ?? '未设定'; return [v, v]; }
    return ['all', '全部模拟受访者'];
  };
  const groups = new Map<string, { key: string; label: string; counts: number[]; n: number }>();
  if (groupBy.startsWith('attr:')) for (const l of run.attributes.find(a => a.key === groupBy.slice(5))?.levels ?? []) groups.set(l.label, { key: l.label, label: l.label, counts: categories.map(() => 0), n: 0 });
  for (const r of ok(run)) {
    const a = answerOf(r, questionId);
    if (!a?.shown || a.refused || a.value === null) continue;
    const [key, label] = groupOf(r);
    const g = groups.get(key) ?? { key, label, counts: categories.map(() => 0), n: 0 };
    for (const code of Array.isArray(a.value) ? a.value : [String(a.value)]) { const i = categories.findIndex(c => c.key === code); if (i >= 0) g.counts[i]++; }
    g.n++; groups.set(key, g);
  }
  return { categories, groups: [...groups.values()] };
}
