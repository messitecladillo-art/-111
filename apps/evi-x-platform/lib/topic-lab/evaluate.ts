/**
 * Topic studio: research-gap candidates from the user's own literature export, and an evidence
 * profile for a candidate topic. Nothing here estimates a probability of winning. The award-case
 * index has no non-award comparison group, so award titles are used only as a descriptive reference
 * (how many indexed award titles share a feature, which award titles are closest) and say so.
 */
import type { AwardCase } from '../../data/case-types.ts';
import type { LitRecord } from './parse.ts';
import { cooccurrence } from './network.ts';
import { termKey, type TermIndex } from './terms.ts';
import { termTrend, type CorpusYears, type TermTrend } from './trend.ts';

/* ───────── statistics ───────── */

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function logGamma(x: number): number {
  if (x < .5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  LANCZOS.forEach((c, i) => { a += c / (x + i + 1); });
  return .5 * Math.log(2 * Math.PI) + (x + .5) * Math.log(t) - t + Math.log(a);
}
const logChoose = (n: number, k: number) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
function logSumExp(xs: number[]): number { const m = Math.max(...xs); return m === -Infinity ? m : m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0)); }

/**
 * One-sided Fisher exact test. With N records, K containing term A and n containing term B, returns
 * P(X ≤ observed) for the number X containing both, under independence (hypergeometric).
 */
export function hypergeomLowerTail(observed: number, N: number, K: number, n: number): number {
  const kMin = Math.max(0, n + K - N), kMax = Math.min(n, K);
  if (observed < kMin) return 0;
  if (observed >= kMax) return 1;
  const logs: number[] = [];
  let lp = logChoose(K, kMin) + logChoose(N - K, n - kMin) - logChoose(N, n);
  for (let k = kMin; k <= observed; k++) {
    logs.push(lp);
    lp += Math.log((K - k) * (n - k)) - Math.log((k + 1) * (N - K - n + k + 1));
  }
  return Math.min(1, Math.exp(logSumExp(logs)));
}

/** Benjamini–Hochberg adjusted p-values (q-values), returned in the input order. */
export function benjaminiHochberg(p: number[]): number[] {
  const m = p.length, order = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) { const [v, i] = order[r]; min = Math.min(min, v * m / (r + 1)); q[i] = min; }
  return q;
}

/* ───────── research-gap candidates ───────── */

export type GapTerm = { key: string; label: string; df: number; cluster: number | null; trend: TermTrend | null };
export type GapCandidate = { a: GapTerm; b: GapTerm; observed: number; expected: number; ratio: number; p: number; q: number; crossCluster: boolean | null; papers: number[] };
export type GapResult = { candidates: GapCandidate[]; tested: number; terms: number; minExpected: number; fdr: number };

/**
 * Pairs of established terms that appear together far less often than their frequencies predict.
 * Each pair is tested with a one-sided Fisher exact test and the family is corrected with
 * Benjamini–Hochberg. A rare pairing is a prompt to look, not proof of a worthwhile gap: two terms
 * can also be rare together because combining them makes no sense.
 */
export function gapCandidates(index: TermIndex, opts: { cy?: CorpusYears | null; clusters?: Map<string, number>; topTerms?: number; minDf?: number; minExpected?: number; maxRatio?: number; fdr?: number; limit?: number } = {}): GapResult {
  const N = index.docs.length, minExpected = opts.minExpected ?? 3, fdr = opts.fdr ?? .05;
  const ranked = [...index.terms.values()].filter(t => t.df >= (opts.minDf ?? 5) && t.df < N * .5)
    .sort((a, b) => b.df - a.df || a.key.localeCompare(b.key)).slice(0, opts.topTerms ?? 60);
  const keys = ranked.map(t => t.key), n = keys.length, co = cooccurrence(index.docs, keys);
  const tested: Array<{ i: number; j: number; o: number; e: number; p: number }> = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const e = ranked[i].df * ranked[j].df / N;
    if (e < minExpected) continue;
    // Nested phrases ("smart grid" / "grid") are not independent concepts.
    if (keys[i].includes(keys[j]) || keys[j].includes(keys[i])) continue;
    const o = co.get(i * n + j) ?? 0;
    tested.push({ i, j, o, e, p: hypergeomLowerTail(o, N, ranked[i].df, ranked[j].df) });
  }
  const q = benjaminiHochberg(tested.map(t => t.p));
  const term = (i: number): GapTerm => ({ key: keys[i], label: ranked[i].label, df: ranked[i].df, cluster: opts.clusters?.get(keys[i]) ?? null, trend: opts.cy ? termTrend(index, keys[i], opts.cy) : null });
  const candidates = tested.map((t, k) => ({ ...t, q: q[k] }))
    .filter(t => t.q <= fdr && t.o / t.e <= (opts.maxRatio ?? .5))
    .sort((x, y) => x.q - y.q || y.e - x.e || x.i - y.i || x.j - y.j)
    .slice(0, opts.limit ?? 30)
    .map(t => {
      const a = term(t.i), b = term(t.j);
      const papers: number[] = [];
      index.docs.forEach((d, r) => { if (papers.length < 8 && d.includes(a.key) && d.includes(b.key)) papers.push(r); });
      return { a, b, observed: t.o, expected: t.e, ratio: t.o / t.e, p: t.p, q: t.q, crossCluster: a.cluster === null || b.cluster === null ? null : a.cluster !== b.cluster, papers };
    });
  return { candidates, tested: tested.length, terms: n, minExpected, fdr };
}

/** Terms whose share of records rose significantly in the recent window. */
export function risingTerms(index: TermIndex, cy: CorpusYears, limit = 20): Array<{ key: string; label: string; df: number; trend: TermTrend }> {
  if (!cy.usable) return [];
  return [...index.terms.values()].filter(t => t.df >= 8).map(t => ({ key: t.key, label: t.label, df: t.df, trend: termTrend(index, t.key, cy) }))
    .filter(t => t.trend.signal === 'rising').sort((a, b) => (b.trend.z ?? 0) - (a.trend.z ?? 0) || a.key.localeCompare(b.key)).slice(0, limit);
}

/* ───────── candidate topic matching ───────── */

const isLatin = (k: string) => /^[a-z0-9]/.test(k);
function containsTerm(haystack: string, key: string): boolean {
  if (!isLatin(key)) return haystack.includes(key);
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}(s|es)?([^a-z0-9]|$)`).test(haystack);
}

/**
 * Corpus terms that occur in a candidate title, most specific first. A term inside a longer matched
 * term is dropped ("养老" inside "智慧养老"). Synonym sources map to their unified term.
 */
export function matchTitleTerms(index: TermIndex, title: string, synonyms: Map<string, string> = new Map(), max = 8): string[] {
  const hay = title.normalize('NFKC').toLowerCase();
  const found = new Set<string>();
  for (const k of index.terms.keys()) if (k.length >= 2 && containsTerm(hay, k)) found.add(k);
  for (const [from, to] of synonyms) if (from.length >= 2 && index.terms.has(to) && containsTerm(hay, from)) found.add(to);
  const sorted = [...found].sort((a, b) => b.length - a.length || index.terms.get(b)!.df - index.terms.get(a)!.df || a.localeCompare(b));
  const keep: string[] = [];
  for (const k of sorted) if (!keep.some(longer => longer.includes(k))) keep.push(k);
  return keep.slice(0, max);
}

/* ───────── award-title reference ───────── */

const TITLE_FILLER = ['研究', '分析', '探究', '探析', '探讨', '调查', '调研', '报告', '基于', '关于', '对于', '以及', '路径', '策略', '现状', '问题', '为例', '视角', '背景下', '的', '与', '及', '和', '之', '对'];
const FILLER_RE = new RegExp(TITLE_FILLER.sort((a, b) => b.length - a.length).join('|'), 'g');
/** Character bigrams of Han runs plus Latin words, after removing generic research wording. */
export function titleGrams(title: string): Set<string> {
  const s = title.normalize('NFKC').toLowerCase().replace(FILLER_RE, ' ');
  const out = new Set<string>();
  for (const run of s.match(/\p{Script=Han}+/gu) ?? []) for (let i = 0; i + 2 <= run.length; i++) out.add(run.slice(i, i + 2));
  for (const w of s.match(/[a-z0-9]{2,}/g) ?? []) out.add(w);
  return out;
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}
const caseTags = (c: AwardCase) => (c.topic ?? []).filter(t => !/题名/.test(t));

export type SimilarCase = { id: string; title: string; edition: string; award: string; verification: AwardCase['verification']; similarity: number; titleJaccard: number; sharedTags: string[]; sourceUrl: string };
export function similarAwardCases(title: string, cases: AwardCase[], k = 5): SimilarCase[] {
  const g = titleGrams(title), hay = title.normalize('NFKC').toLowerCase();
  return cases.map(c => {
    const tags = caseTags(c), sharedTags = tags.filter(t => hay.includes(t.normalize('NFKC').toLowerCase()));
    const titleJaccard = jaccard(g, titleGrams(c.title));
    const similarity = .6 * titleJaccard + .4 * (tags.length ? sharedTags.length / tags.length : 0);
    return { id: c.id, title: c.title, edition: c.edition, award: c.award, verification: c.verification, similarity, titleJaccard, sharedTags, sourceUrl: c.sourceUrl ?? '' };
  }).filter(c => c.similarity >= .05).sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id)).slice(0, k);
}

/* Title features: keyword rules, reported with the word that triggered them so a person can check. */
const PROVINCES = '北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门';
const CITIES = '广州|深圳|杭州|南京|武汉|成都|西安|长沙|郑州|济南|青岛|苏州|无锡|宁波|厦门|福州|合肥|南昌|昆明|贵阳|南宁|海口|三亚|太原|石家庄|沈阳|大连|长春|哈尔滨|兰州|西宁|银川|乌鲁木齐|拉萨|呼和浩特|吉安|淄博|洛阳|开封|扬州|徐州|常州|南通|温州|绍兴|嘉兴|金华|台州|泉州|漳州|珠海|佛山|东莞|中山|惠州|汕头|湛江|桂林|柳州|遵义|绵阳|宜昌|襄阳|岳阳|株洲|湘潭|赣州|九江|芜湖|蚌埠|烟台|潍坊|临沂|济宁|威海|唐山|保定|邯郸|秦皇岛|大同|包头|鄂尔多斯|景德镇|丽江|大理|张家界|黄山|延安|敦煌|喀什|雄安';
const REGIONS = '粤港澳|大湾区|长三角|珠三角|京津冀|成渝|山河四省|皖北|皖南|苏南|苏北|浙北|闽南|东北|西北|西南|华北|华东|华南|华中|中原';
const SCENES = '农村|乡村|县域|社区|校园|城区|城乡|小区|景区|商圈';
export type FeatureId = 'hook' | 'population' | 'place' | 'construct' | 'action';
const FEATURE_RULES: Record<FeatureId, { label: string; hint: string; re: RegExp }> = {
  hook: { label: '主副标题', hint: '用短主标题制造记忆点，副标题写清对象与范围', re: /^(.{4,}?)(?:——|—|──|：|:)(.{4,})$/u },
  population: { label: '研究人群', hint: '写出具体人群，例如“北京市 60 岁以上独居老人”', re: /大学生|高校学生|中学生|小学生|学生|青年|年轻群体|年轻人|Z世代|z世代|老年人|老人|银发|居民|村民|市民|消费者|游客|员工|职工|儿童|青少年|家长|父母|女性|毕业生|新蓝领|农民|骑手|用户|患者|群体|人群|白领|上班族|网民|粉丝|观众|球迷|从业者|商户|经营者|企业|人才|教师|宝妈/u },
  place: { label: '地域或场景', hint: '限定到城市、区县或具体场景，便于抽样与触达', re: new RegExp(`${PROVINCES}|${CITIES}|${REGIONS}|${SCENES}|\\p{Script=Han}{2}(?:省|自治区|县|地区)`, 'u') },
  construct: { label: '测量对象', hint: '点明要测的构念：意愿、满意度、需求、偏好、行为……', re: /意愿|满意度|需求|偏好|认知|行为|态度|体验|感知|信心|效果|健康度|画像|现状|前景|供需|决策|选择|反馈|能力|动机|习惯/u },
  action: { label: '行动导向', hint: '说明研究服务于什么行动：策略、路径、方案、优化……', re: /策略|路径|对策|优化|提升|方案|建议|指南|攻略|拓展|推广|活化|支持|赋能|机会|设计|打造|之道|改进|发展|治理/u },
};
export const FEATURE_IDS = Object.keys(FEATURE_RULES) as FeatureId[];
export const FEATURE_LABELS = Object.fromEntries(FEATURE_IDS.map(id => [id, FEATURE_RULES[id].label])) as Record<FeatureId, string>;
export function titleFeature(title: string, id: FeatureId): string | null {
  // Match on the title as typed so the reported word keeps its punctuation; Ｚ/Z width is the only fold needed.
  const t = title.trim().replace(/Ｚ/g, 'Z').replace(/ｚ/g, 'z'), m = t.match(FEATURE_RULES[id].re);
  if (!m) return null;
  return id === 'hook' ? m[1].trim() : m[0];
}

export type FeatureBase = { id: FeatureId; label: string; hint: string; withFeature: number; total: number };
/** Share of official, title-verified award titles that carry each feature (descriptive only). */
export function awardFeatureBase(cases: AwardCase[]): { features: FeatureBase[]; lengths: { median: number; q1: number; q3: number; total: number } } {
  const official = cases.filter(c => c.verification === 'official_verified');
  const features = FEATURE_IDS.map(id => ({ id, label: FEATURE_RULES[id].label, hint: FEATURE_RULES[id].hint, withFeature: official.filter(c => titleFeature(c.title, id) !== null).length, total: official.length }));
  const lens = official.map(c => [...c.title.replace(/\s+/g, '')].length).sort((a, b) => a - b);
  const at = (p: number) => { if (!lens.length) return 0; const x = (lens.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x); return lens[lo] + (lens[hi] - lens[lo]) * (x - lo); };
  return { features, lengths: { median: at(.5), q1: at(.25), q3: at(.75), total: lens.length } };
}

/** Indexed award cases as literature-like records, so the same views can describe the index itself. */
export function awardCaseRecords(cases: AwardCase[]): LitRecord[] {
  return cases.map(c => ({ id: `case:${c.id}`, title: c.title, authors: [], year: c.year, source: `${c.edition} · ${c.award}`, keywords: caseTags(c), keywordsPlus: [], abstract: '', citations: null, doi: '', refs: [], refLabels: [], format: 'library' as const }));
}

/* ───────── evidence profile ───────── */

export type Status = 'ok' | 'neutral' | 'attention' | 'unknown';
export type Feasibility = { decisionOwner: string; access: '' | 'yes' | 'unsure' | 'no'; primaryData: '' | 'yes' | 'unsure' | 'no'; sensitive: '' | 'yes' | 'unsure' | 'no' };
export const EMPTY_FEASIBILITY: Feasibility = { decisionOwner: '', access: '', primaryData: '', sensitive: '' };

export type TermEvidence = { key: string; label: string; df: number; share: number; trend: TermTrend | null };
export type PairEvidence = { a: string; b: string; observed: number; expected: number; pLow: number };
export type TopicEvaluation = {
  title: string;
  corpusSize: number;
  terms: TermEvidence[];
  base: { status: Status; weak: string[] };
  novelty: { status: Status; kind: 'none' | 'sparse' | 'crowded' | 'unknown'; joint: number; expected: number | null; crowdedAt: number; pairs: PairEvidence[]; papers: number[] };
  trend: { status: Status; rising: string[]; falling: string[]; usable: boolean };
  award: { status: Status; similar: SimilarCase[]; nearDuplicate: SimilarCase | null };
  structure: { status: Status; features: Array<FeatureBase & { match: string | null }>; length: number; lengths: { median: number; q1: number; q3: number; total: number } };
  feasibility: { status: Status; issues: string[] };
};

export function evaluateTopic(input: { title: string; terms: string[]; feasibility?: Feasibility }, ctx: { index: TermIndex | null; cy: CorpusYears | null; cases: AwardCase[] }): TopicEvaluation {
  const { index, cy, cases } = ctx, title = input.title.trim();
  const N = index?.docs.length ?? 0;
  const keys = [...new Set(input.terms.map(termKey).filter(Boolean))];
  const terms: TermEvidence[] = keys.map(k => { const t = index?.terms.get(k); return { key: k, label: t?.label ?? k, df: t?.df ?? 0, share: N && t ? t.df / N : 0, trend: index && cy && t ? termTrend(index, k, cy) : null }; });

  // Literature base: every core term should be present in at least three imported records.
  const weak = terms.filter(t => t.df < 3).map(t => t.label);
  const base = { status: (!index || !terms.length ? 'unknown' : weak.length ? 'attention' : 'ok') as Status, weak };

  // Novelty: how many records already combine all core terms, against what independence predicts.
  const present = terms.filter(t => t.df > 0);
  const crowdedAt = Math.max(10, Math.ceil(N * .01));
  let novelty: TopicEvaluation['novelty'] = { status: 'unknown', kind: 'unknown', joint: 0, expected: null, crowdedAt, pairs: [], papers: [] };
  if (index && present.length >= 2) {
    const papers: number[] = [];
    let joint = 0;
    index.docs.forEach((d, r) => { if (present.every(t => d.includes(t.key))) { joint++; papers.push(r); } });
    const expected = present.reduce((p, t) => p * t.df / N, N);
    const pairs: PairEvidence[] = [];
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
      const a = present[i], b = present[j];
      let o = 0; for (const d of index.docs) if (d.includes(a.key) && d.includes(b.key)) o++;
      pairs.push({ a: a.label, b: b.label, observed: o, expected: a.df * b.df / N, pLow: hypergeomLowerTail(o, N, a.df, b.df) });
    }
    const byCitations = (x: number, y: number) => (index.records[y].citations ?? 0) - (index.records[x].citations ?? 0) || x - y;
    const kind = joint === 0 ? 'none' : joint >= crowdedAt ? 'crowded' : 'sparse';
    novelty = { status: kind === 'crowded' ? 'attention' : 'ok', kind, joint, expected, crowdedAt, pairs, papers: papers.sort(byCitations).slice(0, 12) };
  }

  const usable = !!cy?.usable;
  const rising = terms.filter(t => t.trend?.signal === 'rising').map(t => t.label), falling = terms.filter(t => t.trend?.signal === 'falling').map(t => t.label);
  const trend = { status: (!index || !usable || !present.length ? 'unknown' : rising.length ? 'ok' : falling.length ? 'attention' : 'neutral') as Status, rising, falling, usable };

  const similar = similarAwardCases(title, cases);
  const nearDuplicate = similar.find(c => c.titleJaccard >= .35) ?? null;
  const award = { status: (nearDuplicate ? 'attention' : 'neutral') as Status, similar, nearDuplicate };

  const fb = awardFeatureBase(cases);
  const features = fb.features.map(f => ({ ...f, match: titleFeature(title, f.id) }));
  const has = (id: FeatureId) => features.find(f => f.id === id)!.match !== null;
  const structure = { status: (!title ? 'unknown' : !has('population') && !has('place') ? 'attention' : 'ok') as Status, features, length: [...title.replace(/\s+/g, '')].length, lengths: fb.lengths };

  const f = input.feasibility ?? EMPTY_FEASIBILITY, issues: string[] = [];
  if (!f.decisionOwner.trim()) issues.push('尚未写明谁会依据这项研究做决定');
  if (f.access === 'no') issues.push('目标人群难以触达'); else if (f.access === 'unsure') issues.push('目标人群能否触达尚不确定');
  if (f.primaryData === 'no') issues.push('无法取得一手数据'); else if (f.primaryData === 'unsure') issues.push('一手数据来源尚不确定');
  if (f.sensitive === 'yes') issues.push('涉及敏感信息或特殊人群，需要伦理与授权评估'); else if (f.sensitive === 'unsure') issues.push('尚未确认是否涉及敏感信息');
  const answered = f.decisionOwner.trim() || f.access || f.primaryData || f.sensitive;
  const feasibility = { status: (!answered ? 'unknown' : issues.length ? 'attention' : 'ok') as Status, issues };

  return { title, corpusSize: N, terms, base, novelty, trend, award, structure, feasibility };
}

export const STATUS_LABELS: Record<Status, string> = { ok: '有证据支持', neutral: '仅作参考', attention: '需要补强', unknown: '无法判断' };
