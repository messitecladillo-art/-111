import { ACCESS_OPTIONS, RESOURCE_OPTIONS, FEATURE_NAMES } from './types.ts';
import type { AccessStatus, TopicProfile, TopicPattern, TopicEvents, TopicSources, EventLead, FeatureVector, TopicBundle, TopicRecommendation, PotentialDimension, TopicRecommendations, TopicCandidate, CandidateEvaluation } from './types.ts';
import { parseTopicProfile, parseTopicCandidate, profileFingerprint, TopicInputError } from './parse.ts';

/** Width/space normalization only: 武汉 and 武汉市 are deliberately not silently equated. */
const geographicKey = (s: string) => s.normalize('NFKC').trim();
const ratio = (n: number, d: number, unknown = 0) => d ? n / d : unknown;
const count = (needs: string[], statuses: Record<string, AccessStatus>, state: AccessStatus) => needs.filter(id => statuses[id] === state).length;
const label = (id: string, options: { id: string; label: string }[]) => options.find(o => o.id === id)?.label ?? id;

function geographyMatch(pattern: TopicPattern, profile: TopicProfile): 'exact' | 'transferable' | 'unknown' | 'mismatch' {
  if (!pattern.regionTags.length && !pattern.cityTags.length) return 'transferable';
  let unknown = false;
  for (const [tags, value] of [[pattern.regionTags, profile.region], [pattern.cityTags, profile.city]] as const) {
    if (!tags.length) continue;
    if (!value) { unknown = true; continue; }
    if (!tags.some(t => geographicKey(t) === geographicKey(value))) return 'mismatch';
  }
  return unknown ? 'unknown' : 'exact';
}
export function eventLeadsForProfile(profileInput: TopicProfile, events: TopicEvents, sources: TopicSources, patternId?: string): EventLead[] {
  const profile = parseTopicProfile(profileInput), sourceMap = new Map(sources.sources.map(s => [s.id, s]));
  return events.events.filter(event => {
    if (profile.domains.length && !profile.domains.includes(event.domain)) return false;
    if (patternId && !event.patternIds.includes(patternId)) return false;
    const g = event.geography;
    if (g.level === 'national') return true;
    if (g.level === 'province') return !!profile.region && geographicKey(profile.region) === geographicKey(g.region);
    return !!profile.city && geographicKey(profile.city) === geographicKey(g.city) && (!g.region || !!profile.region && geographicKey(profile.region) === geographicKey(g.region));
  }).map(event => {
    const ref = profile.referenceDate, window = profile.competitionWindow;
    const age = ref ? (Date.parse(ref) - Date.parse(event.publishedAt)) / 86400000 : NaN;
    const coversReference = !!ref && event.validFrom <= ref && ref <= event.validUntil;
    const upcomingInWindow = !!ref && !!window && event.validFrom > ref && event.validFrom <= window.end && event.validUntil >= window.start;
    const knownAtReference = !!ref && event.publishedAt <= ref && (!event.verifiedAt || event.verifiedAt <= ref);
    const coversWindow = !window || event.validFrom <= window.end && event.validUntil >= window.start;
    const sourceVerified = event.sourceIds.length > 0 && event.sourceIds.every(id => sourceMap.get(id)?.coverage === 'fulltext');
    const stale = event.status === 'historical' || event.referenceOnly || !!ref && (ref > event.validUntil || age > 366) || !coversWindow;
    const temporalStatus: EventLead['temporalStatus'] = stale ? 'historical' : event.status === 'verified' && sourceVerified && knownAtReference && (coversReference || upcomingInWindow) ? 'current' : 'unverified';
    const geographyReason = event.geography.level === 'national' ? '全国线索；当地影响尚待验证' : event.geography.level === 'province' ? `精确匹配省份：${event.geography.region}` : `精确匹配城市：${event.geography.city}`;
    const upcomingOccurrence = upcomingInWindow || !!ref && !!event.eventDate && event.eventDate > ref;
    return { id: event.id, title: event.title, domain: event.domain, geography: { ...event.geography }, publishedAt: event.publishedAt, ...(event.eventDate ? { eventDate: event.eventDate } : {}), summary: event.summary, researchHypotheses: [...event.researchHypotheses], sourceIds: [...event.sourceIds], temporalStatus, geographyReason, validityBasis: event.validityBasis || '该日期范围只用于内容复核，不自动证明活动仍在执行。', limitations: [...(event.limitations ?? []), ...(upcomingOccurrence ? ['安排时间尚未到达，只是已发布的计划；执行情况需要后续核验。'] : []), '研究假设为拟议方向，不能当作市场效果或调查结论。'] };
  }).sort((a, b) => ({ current: 0, unverified: 1, historical: 2 }[a.temporalStatus] - { current: 0, unverified: 1, historical: 2 }[b.temporalStatus]) || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

/** All features are explicit profile statements or authored content structure, never school prestige. */
export function extractTopicFeatures(pattern: TopicPattern, profileInput: TopicProfile, events: TopicEvents, sources: TopicSources): FeatureVector {
  const profile = parseTopicProfile(profileInput), geo = geographyMatch(pattern, profile);
  const interestText = `${pattern.title} ${pattern.domain} ${pattern.question}`.normalize('NFKC').toLowerCase();
  const current = eventLeadsForProfile(profile, events, sources, pattern.id).filter(e => e.temporalStatus === 'current');
  const fit = (available: number | null, required: number | null) => available === null || required === null ? .5 : required === 0 ? 1 : Math.min(1, available / required);
  return {
    confirmedAccess: ratio(count(pattern.accessNeeds, profile.access, 'confirmed'), pattern.accessNeeds.length),
    possibleAccess: ratio(count(pattern.accessNeeds, profile.access, 'confirmed') + .35 * count(pattern.accessNeeds, profile.access, 'possible'), pattern.accessNeeds.length),
    resourceFit: ratio(pattern.resourceNeeds.reduce((n, id) => n + ({ confirmed: 1, possible: .35, unavailable: 0 }[profile.resources[id]] ?? 0), 0), pattern.resourceNeeds.length),
    geographyFit: geo === 'exact' ? 1 : geo === 'transferable' ? .5 : 0,
    settingFit: ratio(pattern.settingTags.filter(t => profile.schoolContext.includes(t)).length, pattern.settingTags.length),
    interestFit: profile.interests.some(i => i && interestText.includes(i.normalize('NFKC').toLowerCase())) || profile.domains.includes(pattern.domain) ? 1 : 0,
    timeFit: fit(profile.days, pattern.minimumDays), budgetFit: fit(profile.budgetYuan, pattern.minimumBudgetYuan),
    decisionClarity: [pattern.decisionOwner, pattern.decision, pattern.population].filter(Boolean).length / 3,
    evidenceDesign: Math.min(1, pattern.minimumEvidence.length / 3), differentiation: Math.min(1, pattern.differentiators.length / 2),
    actionability: pattern.decision && pattern.decisionOwner ? 1 : 0, currentEventMatch: current.length ? 1 : 0,
    lowSensitivity: pattern.sensitive ? 0 : 1,
  };
}
export function scoreTopicFeatures(features: FeatureVector, weights: number[]): number {
  if (weights.length !== FEATURE_NAMES.length || weights.some(w => !Number.isFinite(w) || w < 0)) throw new TopicInputError('排序权重无效');
  return FEATURE_NAMES.reduce((sum, name, i) => sum + features[name] * weights[i], 0);
}

export function assessTopicPattern(pattern: TopicPattern, profileInput: TopicProfile, bundle: TopicBundle): TopicRecommendation {
  const profile = parseTopicProfile(profileInput), blockers: string[] = [], unknowns: string[] = [], matchReasons: string[] = [];
  const geography = geographyMatch(pattern, profile), leads = eventLeadsForProfile(profile, bundle.events, bundle.sources, pattern.id);
  if (geography === 'mismatch') blockers.push('模式限定地域与填写地域不一致，不能直接移植当地事实。');
  else if (geography === 'unknown') unknowns.push('模式限定了地域，请补全对应省份或城市。');
  else if (geography === 'exact') matchReasons.push('填写地域与模式限定地域精确匹配。');
  else matchReasons.push('这是可迁移的问题框架；当地是否存在该问题仍需核验。');
  if (!pattern.accessNeeds.length) unknowns.push('尚未明确抽样单位及招募渠道。');
  for (const [needs, states, options, name] of [[pattern.accessNeeds, profile.access, ACCESS_OPTIONS, '样本渠道'], [pattern.resourceNeeds, profile.resources, RESOURCE_OPTIONS, '研究资源']] as const) {
    for (const id of needs) {
      const state = states[id], display = label(id, options);
      if (state === 'unavailable') blockers.push(`${name}「${display}」明确不可获得。`);
      else if (state === 'possible') unknowns.push(`${name}「${display}」仅可能获得，需要先落实。`);
      else if (state === undefined) unknowns.push(`${name}「${display}」未填写，不视为已有。`);
      else matchReasons.push(`用户自述已确认${name}「${display}」，仍需保留授权与招募依据。`);
    }
  }
  if (pattern.minimumDays !== null) {
    if (profile.days === null) unknowns.push(`可用时间未知；此框架的作者规划下限为 ${pattern.minimumDays} 天。`);
    else if (profile.days < pattern.minimumDays) blockers.push(`可用 ${profile.days} 天低于作者规划下限 ${pattern.minimumDays} 天，应缩小范围。`);
  }
  if (pattern.minimumBudgetYuan !== null) {
    if (profile.budgetYuan === null) unknowns.push(`预算未知；此框架的作者规划下限为 ${pattern.minimumBudgetYuan} 元。`);
    else if (profile.budgetYuan < pattern.minimumBudgetYuan) blockers.push(`预算 ${profile.budgetYuan} 元低于作者规划下限 ${pattern.minimumBudgetYuan} 元，应调整方案。`);
  }
  if (pattern.sensitive) {
    if (profile.sensitiveData === 'avoid') blockers.push('该方向涉及敏感研究，当前设置为避开此类研究。');
    else if (profile.sensitiveData !== 'approved') unknowns.push('敏感研究尚需完成伦理、授权、招募与信息最小化评估。');
    else matchReasons.push('用户自述已具备敏感研究授权，执行前仍需核对批准范围。');
  }
  if (profile.school) matchReasons.push('学校仅用于背景记录，名称与层次不参与排序或样本可得性判断。');
  const currentEvents = leads.filter(e => e.temporalStatus === 'current');
  if (currentEvents.length) matchReasons.push(`有 ${currentEvents.length} 条在所选时间与地域范围内可核验的事件线索；热度不能证明可研究性。`);
  const accessMissing = pattern.accessNeeds.length === 0 || pattern.accessNeeds.some(id => profile.access[id] === undefined || profile.access[id] === 'possible');
  const accessBlocked = pattern.accessNeeds.some(id => profile.access[id] === 'unavailable');
  const features = extractTopicFeatures(pattern, profile, bundle.events, bundle.sources);
  const dimension = (id: PotentialDimension['id'], name: string, score: number | null, reason: string, verification: string, status: PotentialDimension['status'] = 'proposed'): PotentialDimension => ({ id, label: name, score, status, reason, verification, sourceIds: [...pattern.sourceIds] });
  const dimensions = [
    dimension('problem', '问题强度与时效', currentEvents.length ? 4 : null, currentEvents.length ? '已有同期事件入口；实际影响强度仍是待检验假设。' : '框架提出了可能的问题，缺少当前当地问题强度的直接证据。', '核查原始通知或数据，并访谈决策方确认真实摩擦。', currentEvents.length ? 'proposed' : 'unknown'),
    dimension('decision', '决策者与决策', pattern.decisionOwner && pattern.decision ? 4 : null, pattern.decisionOwner && pattern.decision ? `拟服务 ${pattern.decisionOwner}；拟回答：${pattern.decision}` : '尚缺明确决策者或会改变的决策。', '取得决策方确认：研究完成后哪项决定会改变。', pattern.decisionOwner && pattern.decision ? 'proposed' : 'unknown'),
    dimension('access', '样本与证据可得性', accessBlocked ? 1 : accessMissing ? null : 4, accessBlocked ? '至少一个必要样本渠道明确不可得。' : accessMissing ? '必要样本渠道尚未全部落实。' : '必要渠道均由用户声明已确认；尚未独立验证。', '记录抽样框、纳排标准、招募入口、同意流程及预计覆盖偏差。', accessBlocked ? 'blocked' : accessMissing ? 'unknown' : 'proposed'),
    dimension('difference', '实质差异化', pattern.differentiators.length >= 2 ? 4 : pattern.differentiators.length ? 2 : null, pattern.differentiators.length ? `可检验的拟议差异：${pattern.differentiators.join('；')}` : '尚未提出可验证的实质差异。', '比较相近研究，核对人群、机制、设计或行动闭环；改标题不算创新。', pattern.differentiators.length ? 'proposed' : 'unknown'),
    dimension('feasibility', '伦理与执行可行性', blockers.length ? 1 : unknowns.length ? null : 4, blockers.length ? blockers.join('；') : unknowns.length ? '存在尚未落实的渠道、资源或时间预算。' : '填写条件满足当前框架的规划要求；估算不是实际费用或工时。', '先完成许可与最小预调查，复核时间、成本、隐私与退出条件。', blockers.length ? 'blocked' : unknowns.length ? 'unknown' : 'proposed'),
    dimension('analysis', '分析深度与设计', pattern.minimumEvidence.length && pattern.methods.length ? 4 : null, pattern.methods.length ? `可考虑 ${pattern.methods.join('、')}；须由研究问题和实际数据决定。` : '尚缺与证据对应的分析方案。', '列出问题—变量—题项—方法—决策对应表，不强行套用模型。', pattern.minimumEvidence.length && pattern.methods.length ? 'proposed' : 'unknown'),
    dimension('action', '行动价值与可测影响', pattern.decisionOwner && pattern.decision ? 4 : null, pattern.decisionOwner && pattern.decision ? '已有拟议决策用途，但收益、效果与实施承诺均未证实。' : '行动对象或决策用途尚不清晰。', '与行动负责人约定试点、成本、指标、观测周期与停止条件。', pattern.decisionOwner && pattern.decision ? 'proposed' : 'unknown'),
    dimension('defense', '叙事与答辩潜力', pattern.scopeLimits.length && pattern.minimumEvidence.length ? 4 : null, '答辩价值取决于能否解释来源、抽样偏差、分析假设与行动依据。', '用一分钟讲清问题、证据、限制和可改变的决策，保留反例。', pattern.scopeLimits.length && pattern.minimumEvidence.length ? 'proposed' : 'unknown'),
  ];
  return { patternId: pattern.id, title: pattern.title, domain: pattern.domain, decisionOwner: pattern.decisionOwner, decision: pattern.decision, question: pattern.question, population: pattern.population, feasibility: blockers.length ? 'blocked' : unknowns.length ? 'conditional' : 'ready', blockers, unknowns, dimensions,
    firstWeekPlan: [
      `第 1 天：核查 ${pattern.sourceIds.join('、')} 的原文、适用日期与地域；确认 ${pattern.decisionOwner || '真实决策方'} 是否需要该研究。`,
      `第 2—3 天：逐项落实 ${pattern.accessNeeds.map(id => label(id, ACCESS_OPTIONS)).join('、') || '抽样框与招募入口'}，记录授权、纳排标准和未覆盖人群。`,
      `第 4—5 天：拟开展小规模探索访谈或观察，检验 ${pattern.question || '核心研究问题'}；先获得同意。`,
      `第 6 天：形成最小证据清单：${pattern.minimumEvidence.join('；') || '按决策需要补齐变量与来源'}。`,
      `第 7 天：复核渠道、预算与伦理约束；${pattern.rejectWhen.length ? `若出现「${pattern.rejectWhen.join('；')}」则停止或缩小范围。` : '无法取得关键证据时停止或缩小范围。'}`,
    ], sourceIds: [...pattern.sourceIds], rankScore: scoreTopicFeatures(features, bundle.model.weights), matchReasons, scopeLimits: [...pattern.scopeLimits], eventLeads: leads };
}

export function recommendTopics(profileInput: TopicProfile, bundle: TopicBundle, limit = 6): TopicRecommendations {
  const profile = parseTopicProfile(profileInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TopicInputError('推荐数量应为 1—50');
  const patterns = bundle.catalog.patterns.filter(p => !profile.domains.length || profile.domains.includes(p.domain));
  const assessments = patterns.map(p => assessTopicPattern(p, profile, bundle));
  const compare = (a: TopicRecommendation, b: TopicRecommendation) => ({ ready: 0, conditional: 1, blocked: 2 }[a.feasibility] - { ready: 0, conditional: 1, blocked: 2 }[b.feasibility]) || b.rankScore - a.rankScore || a.patternId.localeCompare(b.patternId);
  return { profileKey: profileFingerprint(profile), contentVersion: bundle.catalog.contentVersion, modelVersion: bundle.model.modelVersion,
    items: assessments.filter(r => r.feasibility !== 'blocked').sort(compare).slice(0, limit), excluded: assessments.filter(r => r.feasibility === 'blocked').sort(compare),
    warnings: ['排序由人工编写的合成偏好对训练，只表达当前输入下的比较顺序，不是获奖概率或真实效果预测。', '八维分值为拟议研究设计的诊断刻度，不能替代实际调查、专家评审或当届规则核查。', ...(!profile.referenceDate ? ['未填写参考日期，事件线索不会被认定为当前有效。'] : []), ...(!Object.keys(profile.access).length ? ['样本渠道均未知，以下方向都需要先验证可达性。'] : []), ...(profile.city && !profile.region ? ['只填写了城市：带有省份约束的地方线索需补全省份后精确匹配。'] : [])] };
}

const grams = (s: string): Set<string> => { const chars = [...s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')]; return new Set(chars.slice(0, -1).map((c, i) => c + chars[i + 1])); };
export function evaluateCandidate(candidateInput: TopicCandidate, profileInput: TopicProfile, bundle: TopicBundle): CandidateEvaluation {
  const candidate = parseTopicCandidate(candidateInput), profile = parseTopicProfile(profileInput), tokens = grams(`${candidate.title} ${candidate.decision} ${candidate.population}`);
  const matches = bundle.catalog.patterns.map(p => { const other = grams(`${p.title} ${p.question} ${p.population}`); const sharedTerms = [...tokens].filter(t => other.has(t)); return { p, sharedTerms, similarity: sharedTerms.length / Math.max(1, tokens.size + other.size - sharedTerms.length) }; }).filter(m => m.sharedTerms.length >= 2).sort((a, b) => b.similarity - a.similarity || a.p.id.localeCompare(b.p.id)).slice(0, 3);
  const sourceIds = [...new Set(matches.flatMap(m => m.p.sourceIds))];
  const pattern: TopicPattern = { id: 'user-candidate', title: candidate.title, domain: matches[0]?.p.domain ?? profile.domains[0] ?? 'society', regionTags: [], cityTags: [], settingTags: [], accessNeeds: candidate.accessNeeds, resourceNeeds: candidate.resourceNeeds, decisionOwner: candidate.decisionOwner, decision: candidate.decision, question: candidate.title, population: candidate.population, minimumEvidence: candidate.evidencePlan ? [candidate.evidencePlan] : [], methods: [], differentiators: candidate.differentiators, scopeLimits: ['用户候选题内容均为输入陈述；相似模式和来源不自动证明该题的事实或可行性。'], rejectWhen: [], sourceIds, minimumDays: null, minimumBudgetYuan: null, sensitive: candidate.sensitive };
  const result = assessTopicPattern(pattern, profile, bundle);
  for (const [value, message] of [[candidate.title, '尚未填写候选题目。'], [candidate.decisionOwner, '尚未填写实际决策者。'], [candidate.decision, '尚未说明研究将改变哪项决策。'], [candidate.population, '尚未定义目标人群与抽样单位。'], [candidate.geography, '尚未限定研究地域。'], [candidate.evidencePlan, '尚未描述证据收集计划。'], [candidate.action, '尚未定义可执行行动。']] as const) if (!value) result.unknowns.push(message);
  if (!candidate.resourceNeeds.length) result.unknowns.push('尚未声明所需研究资源，不能视为无需资源。');
  if (candidate.geography && ![profile.city, profile.region].some(v => v && geographicKey(v) === geographicKey(candidate.geography))) result.unknowns.push('候选题的地域范围尚未与背景精确对应，请补充该范围的渠道和抽样依据。');
  if (!candidate.differentiators.length) result.unknowns.push('尚未说明实质差异化。');
  if (profile.days === 0) result.blockers.push('可用时间为 0 天，无法安排新的研究工作；需要补充可执行的时间计划。');
  result.unknowns.push('候选题尚未完成工期与费用估算，填写的时间或预算不能直接证明执行可行性。');
  if (profile.budgetYuan === 0) result.unknowns.push('预算为 0 元：需要确认招募、出行和工具等必要费用是否确实为零；不能自动判为可行或不可行。');
  result.feasibility = result.blockers.length ? 'blocked' : result.unknowns.length ? 'conditional' : 'ready';
  // A free-form candidate has no trained quality label; do not manufacture a comparable score.
  result.rankScore = 0;
  result.matchReasons = ['以下为用户输入的结构检查；相似模式仅提供方法参考，不是该候选题的证据。'];
  const action = result.dimensions.find(d => d.id === 'action')!;
  if (!candidate.action) { action.score = null; action.status = 'unknown'; action.reason = '尚未说明研究后的行动与影响指标。'; }
  const feasibility = result.dimensions.find(d => d.id === 'feasibility')!;
  if (result.blockers.length) { feasibility.score = 1; feasibility.status = 'blocked'; feasibility.reason = result.blockers.join('；'); }
  else if (result.unknowns.length) { feasibility.score = null; feasibility.status = 'unknown'; feasibility.reason = result.unknowns.join('；'); }
  return { ...result, matchedPatterns: matches.map(m => ({ patternId: m.p.id, title: m.p.title, sharedTerms: m.sharedTerms.slice(0, 12), sourceIds: [...m.p.sourceIds] })) };
}
