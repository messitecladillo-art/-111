import { questionnaireIssues, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import { hash32, seededRandom, SILICON_LIMITS, type Persona, type PersonaAttribute } from './persona.ts';

/** `{情境}` in question text is replaced by the active scenario; `{Q1}` pipes this persona's earlier answer to Q1. */
export const SCENARIO_TOKEN = '{情境}';
export type Scenario = { id: string; label: string; text: string };
export type Engine = 'demo' | 'model';
export type Memory = 'carry' | 'independent';
export type RunSettings = { engine: Engine; memory: Memory; shuffleOptions: boolean; scenarios: Scenario[]; models: string[] };
export type AnswerValue = string | string[] | number | null;
export type SiliconAnswer = { questionId: string; value: AnswerValue; shown: boolean; refused: boolean; unclear: string };
export type SiliconResponse = { personaId: string; scenarioId: string; model: string; status: 'ok' | 'failed'; answers: SiliconAnswer[]; error?: string };
export type SiliconRun = {
  schema: 'silicon-run/v1'; classification: 'simulated'; id: string; createdAt: string; engine: Engine;
  questionnaire: { title: string; fingerprint: string; questions: number };
  attributes: PersonaAttribute[]; personas: Persona[]; settings: RunSettings; responses: SiliconResponse[]; notes: string[];
};
export const DEMO_MODEL = '离线演示引擎';
export const NO_SCENARIO: Scenario = { id: 'base', label: '基准', text: '' };

const PIPE = /\{([A-Za-z][A-Za-z0-9_]{0,31})\}/g;

/** Placeholders that cannot be resolved in order are reported before any run. */
export function placeholderIssues(design: Questionnaire, scenarios: Scenario[]): string[] {
  const issues: string[] = [];
  const order = new Map(design.questions.map((q, i) => [q.variable.toLowerCase(), i]));
  design.questions.forEach((q, i) => {
    for (const match of q.text.matchAll(PIPE)) {
      const at = order.get(match[1].toLowerCase());
      if (at === undefined) issues.push(`第 ${i + 1} 题引用了不存在的变量 {${match[1]}}。`);
      else if (at >= i) issues.push(`第 ${i + 1} 题引用的 {${match[1]}} 不在它之前，无法传递前序答案。`);
    }
  });
  const usesScenario = design.questions.some(q => q.text.includes(SCENARIO_TOKEN));
  const real = scenarios.filter(s => s.id !== NO_SCENARIO.id);
  if (real.length && !usesScenario) issues.push(`设置了情境，但没有题干包含 ${SCENARIO_TOKEN}，各情境的问题将完全相同。`);
  if (usesScenario && !real.length) issues.push(`题干包含 ${SCENARIO_TOKEN}，但尚未设置情境；运行时将以空白替换。`);
  if (real.length > SILICON_LIMITS.scenarios) issues.push(`情境最多 ${SILICON_LIMITS.scenarios} 个。`);
  if (real.some(s => !s.label.trim() || !s.text.trim())) issues.push('每个情境都需要名称和替换文字。');
  return issues;
}

export function answerLabel(question: DesignQuestion, value: AnswerValue): string {
  if (value === null) return '（未作答）';
  if (question.type === 'single') return question.choices.find(c => c.code === value)?.label || String(value);
  if (question.type === 'multi') return (Array.isArray(value) ? value : [String(value)]).map(code => question.choices.find(c => c.code === code)?.label || code).join('、');
  return String(value);
}

/** Render question text for one persona: scenario substitution, then piping of earlier answers. */
export function renderQuestionText(design: Questionnaire, question: DesignQuestion, scenario: Scenario, answers: Map<string, SiliconAnswer>): string {
  const byVariable = new Map(design.questions.map(q => [q.variable.toLowerCase(), q]));
  return question.text.split(SCENARIO_TOKEN).join(scenario.text).replace(PIPE, (whole, variable: string) => {
    const source = byVariable.get(variable.toLowerCase());
    if (!source) return whole;
    const answer = answers.get(source.id);
    return answer && answer.shown && !answer.refused ? answerLabel(source, answer.value) : '（未作答）';
  });
}

/** Routing mirrors the studio's rule: a conditional question shows only when its visible parent answered a listed code. */
export function isShown(question: DesignQuestion, answers: Map<string, SiliconAnswer>): boolean {
  if (!question.condition) return true;
  const parent = answers.get(question.condition.questionId);
  if (!parent || !parent.shown || parent.refused || parent.value === null) return false;
  const codes = Array.isArray(parent.value) ? parent.value : [String(parent.value)];
  return codes.some(code => question.condition!.codes.includes(code));
}

export function designFingerprint(design: Questionnaire): string {
  const text = JSON.stringify(design.questions.map(q => [q.id, q.variable, q.text, q.type, q.choices, q.min, q.max, q.condition]));
  return hash32(text).toString(16).padStart(8, '0') + hash32(design.title + text.length).toString(16).padStart(8, '0');
}

/**
 * Offline demo engine. Answers are seeded pseudo-random values with persona-consistent tilts so the
 * full workflow (routing, piping, scenarios, charts, checks) can be rehearsed without a model or key.
 * They describe nobody: the tilts are arbitrary and must never be read as a finding.
 */
export function demoRun(design: Questionnaire, attributes: PersonaAttribute[], personas: Persona[], settings: RunSettings, now = new Date()): SiliconRun {
  const scenarios = settings.scenarios.length ? settings.scenarios : [NO_SCENARIO];
  const staticIssues = questionnaireIssues(design);
  const responses: SiliconResponse[] = [];
  for (const persona of personas) for (const scenario of scenarios) {
    const answers = new Map<string, SiliconAnswer>();
    let carried = 0;
    for (const question of design.questions) {
      const shown = isShown(question, answers);
      if (!shown) { answers.set(question.id, { questionId: question.id, value: null, shown: false, refused: false, unclear: '' }); continue; }
      const rng = seededRandom(hash32(`${persona.id}|${scenario.id}|${question.id}`));
      // A stable stance per persona and construct, nudged by each trait and by the scenario.
      const construct = question.construct.trim() || question.id;
      let stance = hash32(`${persona.id}|${construct}`) / 4294967296 * 2 - 1;
      for (const a of attributes) stance += (hash32(`${question.id}|${a.key}|${persona.traits[a.key] ?? ''}`) / 4294967296 - 0.5) * 0.7;
      if (scenario.id !== NO_SCENARIO.id) stance += (hash32(`${question.id}|${scenario.id}`) / 4294967296 - 0.5) * 0.8;
      if (settings.memory === 'carry') stance = stance * 0.75 + carried * 0.25;
      stance = Math.max(-1, Math.min(1, stance + (rng() - 0.5) * 0.5));
      const flagged = staticIssues.some(i => i.questionId === question.id && i.level === 'blocker');
      const unclear = flagged && rng() < 0.45 ? '演示引擎：此题存在结构阻断项，模拟受访者无法确定如何作答。' : '';
      const refused = !question.required && rng() < 0.03;
      const value = refused ? null : demoValue(question, stance, rng);
      answers.set(question.id, { questionId: question.id, value, shown: true, refused, unclear });
      carried = stance;
    }
    responses.push({ personaId: persona.id, scenarioId: scenario.id, model: DEMO_MODEL, status: 'ok', answers: design.questions.map(q => answers.get(q.id)!) });
  }
  return {
    schema: 'silicon-run/v1', classification: 'simulated', id: `demo-${hash32(designFingerprint(design) + personas.length + now.toISOString()).toString(16)}`,
    createdAt: now.toISOString(), engine: 'demo', questionnaire: { title: design.title, fingerprint: designFingerprint(design), questions: design.questions.length },
    attributes, personas, settings: { ...settings, scenarios, models: [DEMO_MODEL] }, responses,
    notes: ['离线演示引擎生成的随机可复现答案，只用于走查问卷逻辑、界面与分析流程；不代表任何人群，不能作为预测试结论或调查数据。'],
  };
}

function demoValue(question: DesignQuestion, stance: number, rng: () => number): AnswerValue {
  const unit = (stance + 1) / 2;
  if (question.type === 'single' || question.type === 'multi') {
    const codes = question.choices.map(c => c.code).filter(Boolean);
    if (!codes.length) return null;
    const pick = () => codes[Math.min(codes.length - 1, Math.max(0, Math.floor((unit * 0.7 + rng() * 0.3) * codes.length)))];
    if (question.type === 'single') return pick();
    const chosen = new Set<string>([pick()]);
    const extra = Math.floor(rng() * Math.min(3, codes.length));
    for (let i = 0; i < extra; i++) chosen.add(codes[Math.floor(rng() * codes.length)]);
    return codes.filter(code => chosen.has(code));
  }
  if (question.type === 'likert') {
    const min = question.min ?? 1, max = question.max ?? 5;
    return Math.max(min, Math.min(max, Math.round(min + (unit * 0.8 + rng() * 0.2) * (max - min))));
  }
  if (question.type === 'number') {
    const min = question.min ?? 0, max = question.max ?? Math.max(min + 10, 100);
    return Math.round(min + (unit * 0.6 + rng() * 0.4) * (max - min));
  }
  const tone = stance > 0.25 ? '总体顺利' : stance < -0.25 ? '遇到了一些阻碍' : '感受一般';
  return `【演示文本】这位模拟受访者${tone}。`;
}

/** Normalize answers returned by a model against the questionnaire; anything outside the item's options is dropped. */
export function normalizeModelAnswer(question: DesignQuestion, raw: unknown): { value: AnswerValue; valid: boolean } {
  if (raw === null || raw === undefined || raw === '') return { value: null, valid: true };
  const codes = question.choices.map(c => c.code);
  if (question.type === 'single') return codes.includes(String(raw)) ? { value: String(raw), valid: true } : { value: null, valid: false };
  if (question.type === 'multi') {
    const list = (Array.isArray(raw) ? raw : [raw]).map(String);
    const kept = codes.filter(code => list.includes(code));
    return { value: kept.length ? kept : null, valid: kept.length === new Set(list).size };
  }
  if (question.type === 'likert' || question.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) return { value: null, valid: false };
    const min = question.min ?? -Infinity, max = question.max ?? Infinity;
    if (n < min || n > max || (question.type === 'likert' && !Number.isInteger(n))) return { value: null, valid: false };
    return { value: n, valid: true };
  }
  return { value: String(raw).slice(0, 500), valid: true };
}

/** Estimated number of model calls a run needs; independent mode asks one question per call. */
export function estimateCalls(design: Questionnaire, personas: number, settings: RunSettings): number {
  const scenarios = Math.max(1, settings.scenarios.length), models = Math.max(1, settings.models.length);
  return personas * scenarios * models * (settings.memory === 'independent' ? Math.max(1, design.questions.length) : 1);
}

/** What a model-backed run sends to the server; the server owns prompts, providers and limits. */
export type SiliconRunRequest = { design: Questionnaire; attributes: PersonaAttribute[]; personas: Persona[]; settings: RunSettings; idempotencyKey: string };
export type RunProgress = { done: number; total: number };
