import { ACCESS_OPTIONS, DOMAIN_OPTIONS, type TopicPattern, type TopicProfile, type TopicRecommendation } from '../topic-advisor/types.ts';

/** Authored query vocabulary; a matching aid, not a claim about current events. */
const SUBJECTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['policy', ['政策', '政务', '公共服务', '便民', '办事', 'policy']],
  ['economy', ['经济', '市场', '消费券', '消费', '商圈', '商业', '零售', '餐饮', '农产品', '电商', '快递', '物流', 'market', 'retail', 'consumption']],
  ['technology', ['科技', '人工智能', '大模型', '智能', '数字化', '数字服务', '算法', '校园办事小程序', '办事小程序', '小程序', '应用程序', 'ai', 'technology', 'digital']],
  ['finance', ['财经', '金融', '融资', '信贷', '理财', 'finance', 'financial']],
  ['biology', ['生物', '健康', '医疗', '中试', '成果转化', 'biology', 'biotech', 'health']],
  ['society', ['社会', '民生', '社区', '养老', '助餐', '维修', '二手', '闲置', 'community']],
  ['employment', ['就业', '求职', '找工作', '应届生', '毕业生', '校招', '简历', '面试', '投递', '招聘', '秋招', '岗位', '职业', '用工', 'job hunting', 'job seeking', 'job search', 'job', 'jobs', 'employment', 'career', 'recruitment']],
  ['entertainment', ['文娱', '娱乐', '演出', '观演', '音乐节', '演唱会', '文化活动', '文化消费', '文创', '展览', 'entertainment']],
  ['sports', ['体育', '赛事', '社区运动场', '运动场', '运动', '健身', '球迷', '比赛', '观赛', '赛后', '看球', '球场', '足球', '篮球', '汉超', 'sports', 'fitness']],
  ['tourism', ['文旅消费', '文旅', '旅游', '游客', '夜游', '研学', '露营', '周末游', '短途游', '景区', 'tourism', 'travel']],
];
type Hit = { domain: string; term: string; start: number; end: number; excluded: boolean };
export type TopicResearchFocus = { included: string[]; excluded: string[]; broaden: boolean; switched: boolean; ambiguous: boolean; detail: string; hits: Hit[] };
export type TopicResearchSelection = { ids: string[]; omittedByRequest: string[]; allowProposals?: boolean; focus: TopicResearchFocus; coverage: 'general' | 'matched' | 'outside_catalog' | 'conflict'; explanation: string; questions: string[] };
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
export function clipResearchText(value: string, maximum: number): string { const clipped = value.slice(0, maximum); return /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped; }
const label = (id: string) => DOMAIN_OPTIONS.find(item => item.id === id)?.label ?? id;
const NEGATIVE = /不太想(?:做|研究|讨论)?|不想(?:做|研究|讨论|选择)?|不考虑|不做|不看|不要(?:研究|做|推荐)?|不关注|不研究|不谈|别(?:做|给我|推荐|研究)?|排除|避开|\bexclude\b|\bavoid\b|\bno\b|not interested in|do not(?: recommend)?|don't(?: recommend)?|\bnot\b(?: about)?/gu;
const SCOPE_NEGATIVE = new RegExp(`${NEGATIVE.source}|不开展|不进行|不实施|不(?:设计|合成|证明|推导|求解|制造)|无需|不需要|不用`,'gu');
const POSITIVE = /但是|而是|改做|改成|改为|换成|转向|更想|但|只做|只研究|只考虑|重点关注|关注|希望|想做|想研究|focus on|interested in|look at/gu;
const BROADEN = /不要只|不只(?:是|看|做|研究|考虑)?|不局限|不限于|除了.+(?:还|也)|not only|not limited/u;
const DOUBLE_NEGATIVE = /不是不|并非不|不要排除|不排除|为什么不|为何不|怎么不|why not/u;
const WEAK_SUBJECTS = new Set(['社区','社会','经济','市场','消费','办事','公共服务']);
const GENERIC = ['能够实际开展', '实际开展', '先帮我看看', '有没有', '不知道', '能做什么', '有什么', '值得研究', '值得做', '研究潜力', '研究价值', '可行性', '第一周', '上一轮', '这些方向', '这个方向', '几个方向', '方向', '选题', '研究', '调查', '问题', '推荐', '给我', '帮我', '我们', '我想', '想要', '希望', '结合', '所在', '地区', '本地', '当地', '领域', '主题', '方面', '内容', '相关', '服务', '体验', '消费者', '用户', '情况', '现象', '进一步', '缩小', '范围', '方案', '计划', '准备', '实际', '开展', '全部', '任何', '那些', '一些', '一点', '哪些', '什么', '这个', '这些', '不要', '不想', '考虑', '关注', '只做', '只看', '想做', '只要', '主要', '重点', '可以', '适合', '合适', '比较', '对比', '潜力', '可行', '价值', '更有', '非常', '一下', '你好', '开始', '先', '的', '我', '和', '与', '或', '在', '想', '请'];

function containsTerm(message: string, term: string): Array<{ start: number; end: number }> {
  const found: Array<{ start: number; end: number }> = []; let from = 0;
  while (from <= message.length) {
    const start = message.indexOf(term, from); if (start < 0) break;
    const end = start + term.length; from = end;
    if (/^[a-z]+$/.test(term) && (/[a-z0-9]/.test(message[start - 1] ?? '') || /[a-z0-9]/.test(message[end] ?? ''))) continue;
    found.push({ start, end });
  }
  return found;
}
function exclusionBefore(message: string, start: number, negativePattern = NEGATIVE): boolean {
  const before = message.slice(Math.max(0, message.slice(0, start).search(/[^，,。；;.!?\n]*$/u)), start);
  if (DOUBLE_NEGATIVE.test(before) || BROADEN.test(before)) return false;
  const negative = [...before.matchAll(negativePattern)], positive = [...before.matchAll(POSITIVE)].filter(hit => !negative.some(no => hit.index! >= no.index! && hit.index! < no.index! + no[0].length));
  return negative.length > 0 && (negative.at(-1)!.index! >= (positive.at(-1)?.index ?? -1));
}

export function interpretTopicResearchFocus(message: string, profile: TopicProfile): TopicResearchFocus {
  const text = normalize(message), switches = [...text.matchAll(/改做|改成|改为|换成|转向|转做|改主意|switch to|instead(?: of)?/gu)];
  const switchAt = switches.at(-1)?.index, activeStart = switchAt ?? 0;
  let hits = SUBJECTS.flatMap(([domain, terms]) => terms.flatMap(term => containsTerm(text, term).map(({start,end}) => ({domain, term, start, end, excluded: exclusionBefore(text,start) || /^(?:相关)?(?:除外|不考虑|不想做|不做|先不考虑)/u.test(text.slice(end))}))));
  hits = hits.filter(hit => hit.start >= activeStart && !hits.some(other => other.domain !== hit.domain && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start));
  const positive = new Set(hits.filter(hit => !hit.excluded).map(hit => hit.domain)), negative = new Set(hits.filter(hit => hit.excluded).map(hit => hit.domain));
  const conflicts = [...positive].filter(id => negative.has(id));
  // A generic place/outcome such as "community" or "consumption" is not a
  // second topic when the concrete object is a sports event or an application.
  const strong = hits.filter(hit => !hit.excluded && !WEAK_SUBJECTS.has(hit.term));
  if (strong.length) for (const domain of positive) {
    const domainHits = hits.filter(hit => hit.domain === domain && !hit.excluded);
    if (domainHits.every(hit => WEAK_SUBJECTS.has(hit.term)) && !domainHits.some(hit => strong.some(other => /^(?:和|与|及|、|以及|还有|或|and|or|[+&])$/u.test(text.slice(Math.min(hit.end,other.end),Math.max(hit.start,other.start)).trim())))) positive.delete(domain);
  }
  let detail = text.slice(activeStart).replace(/不是不想(?:做|研究)?|并非不想(?:做|研究)?|不要排除|不排除|为什么不推荐|改做|改成|改为|换成|转向|转做|其他都行|其他都可以|都可以|都行|还没想好|不知道如何落地|怎么做|具体|落地|问卷|样本渠道|公开资料|公开数据|敏感个人信息|个人信息|不采集|无需|匿名|脱敏|而是|但是|不太想|先不考虑|继续|细化|深入|安排|验证|执行|难度|除外/gu,' ');
  for (const hit of [...hits].sort((a,b) => b.term.length-a.term.length)) detail = detail.split(hit.term).join(' ');
  for (const place of [profile.region, profile.city, profile.school, profile.discipline].filter(Boolean)) { detail = detail.split(normalize(place)).join(' '); if (/省$|市$/.test(place)) detail = detail.split(normalize(place.slice(0,-1))).join(' '); }
  for (const word of GENERIC) detail = detail.split(word).join(' ');
  detail = detail.replace(/\d+(?:\.\d+)?\s*(?:天|周|个月|元|块钱)|\b(?:recommend|suggest|topics?|research|about|for|in|please|compare|potential|plan|avoid|exclude|and|or|but|only|not|no|instead|switch|to)\b/gu,' ').replace(/[^\p{Script=Han}a-z]+/gu,' ').trim();
  const subjectStrength = (domain:string) => Math.max(0,...hits.filter(hit=>hit.domain===domain&&!hit.excluded).map(hit=>WEAK_SUBJECTS.has(hit.term)?1:Math.min(5,hit.term.length)));
  return { included: [...positive].sort((a,b)=>subjectStrength(b)-subjectStrength(a)||Math.min(...hits.filter(hit=>hit.domain===a).map(hit=>hit.start))-Math.min(...hits.filter(hit=>hit.domain===b).map(hit=>hit.start))), excluded: [...negative].filter(id => !positive.has(id)), broaden: BROADEN.test(text), switched: switchAt !== undefined, ambiguous: conflicts.length > 0, detail, hits };
}

/** Translation/retrieval aliases refer only to existing patterns, never to new field facts. */
const PATTERN_ALIASES:Record<string,readonly string[]>={
  'p04-job-matching':['应届生找工作','毕业生求职','校招','简历','面试','投递','graduate recruitment','job seeking','job search','career service'],
  'p13-wuhan-data-jobs':['data jobs','data career','数据标注','数据岗位'],
  'p19-regional-job-service':['employment station','county employment','就业站'],
  'p16-sme-digital':['small business','small businesses','sme','digital transformation','adoption barriers'],
  'p03-campus-digital':['campus app','campus digital','校园数字','小程序','办事入口','层层跳转'],
  'p10-wuhan-sports':['sports event','football match','汉超','看球','球迷','比赛','观赛','赛事'],
  'p24-wuhan-community-sport':['community sports','community sport','fitness','运动场','健身'],
  'p11-wuhan-night-tour':['last bus','last-bus','night tour','night tourism','夜游','返程'],
  'p17-culture-repeat':['cultural event','concert','repeat visit','演唱会','看展'],
  'p08-farm-trust':['farm product','origin label','产地','农产品'],
};
function contentScore(item: TopicRecommendation, detail: string): number {
  const content = normalize(`${item.title} ${item.question} ${item.population} ${item.decision} ${(PATTERN_ALIASES[item.patternId]??[]).join(' ')}`).replace(/-/g,' ');
  const tokens = [...new Set(detail.match(/[a-z]{2,}|[\p{Script=Han}]{2,}/gu) ?? [])];
  return tokens.reduce((score, token) => score + (content.includes(token) ? Math.max(2,token.length) : /[a-z]/.test(token) ? 0 : [...token].slice(0,-1).reduce((sum,_,i) => sum + Number(content.includes(token.slice(i,i+2))),0)),0);
}

/** Detect a requested deliverable outside this catalog, not a bare word ban. */
export function topicResearchScopeIssue(message: string): string | null {
  for (const clause of normalize(message).split(/[，,。；;.!?\n]/u)) {
    const survey = /理解|认知|接受度|使用体验|服务需求|调查用户|调查居民|知晓|就医体验|service experience|perception/u.test(clause);
    const negated = (start: number) => exclusionBefore(clause,start+(clause[start-1]==='不'&&/^(?:设计|合成|证明|推导|求解|制造)/u.test(clause.slice(start))?2:0),SCOPE_NEGATIVE);
    const proof = clause.match(/梯度|收敛|定理|引理|方程|算法|正确性|复杂度|theorem|convergence|equation/u);
    const proofTask = clause.match(/证明|推导|求解|prove|derive|solve/u);
    if (proof && proofTask && (!survey || /请(?:帮我)?(?:证明|推导|求解)|(?:我要|我们要|需要|并|同时)(?:完成)?(?:证明|推导|求解)/u.test(clause)) && !negated(Math.min(proof.index!,proofTask.index!))) return '数学证明或方程求解';
    const engineering = clause.match(/机翼|空气动力|湍流|发动机|电路布线|芯片制造|airfoil|aerodynamic/u);
    const design = clause.match(/设计|制造|求解|优化结构|design|manufacture|solve/u);
    if (engineering && design && (!survey || /请(?:帮我)?(?:设计|制造|求解)|(?:我要|我们要|需要|并|同时)(?:设计|制造|求解)/u.test(clause)) && !negated(Math.min(engineering.index!,design.index!))) return '工程设计或计算';
    const clinical = clause.match(/临床(?:随机|对照|药物|干预)?(?:试验|实验)|随机对照(?:试验|实验)|人体(?:用药|试药)|药物疗效|clinical trial/u);
    if (clinical && (!survey || /(?:请(?:帮我)?|我要|我们要|需要|并|同时)(?:开展|进行|实施)(?:临床|随机对照|人体)/u.test(clause)) && !negated(clinical.index!)) return '临床实验或用药疗效验证';
    const lab = clause.match(/分子|生物化学|化合物|合成路线|反应工艺|chemical|molecular/u);
    const synthesis = clause.match(/合成|设计(?:实验|反应)|反应工艺|synthesi[sz]e/u);
    if (lab && synthesis && (!survey || /请(?:帮我)?(?:设计|合成)|(?:我要|我们要|需要|并|同时)(?:设计|合成)/u.test(clause)) && !negated(Math.min(lab.index!,synthesis.index!))) return '实验设计或化学合成';
  }
  return null;
}

export function selectTopicResearchCandidates({profile,message,items,explicitIds,previousIds,intent}: {profile:TopicProfile;message:string;items:TopicRecommendation[];explicitIds?:string[];previousIds?:string[];intent:'recommend'|'compare'|'refine'|'plan'}):TopicResearchSelection {
  const focus=interpretTopicResearchFocus(message,profile), eligible=items.filter(item=>item.feasibility!=='blocked'), questions:string[]=[];
  const scopeIssue=topicResearchScopeIssue(message);
  if(scopeIssue) return {ids:[...(explicitIds??[])],omittedByRequest:[],allowProposals:false,focus,coverage:'outside_catalog',explanation:`这轮问题侧重${scopeIssue}，当前方向库没有对应的市场调查提案。先确认研究对象，再决定是否转成相关人群的使用、理解或服务需求调查。`,questions:['你希望完成方法本身，还是调查相关人群的使用、理解或服务需求？']};
  const focused=focus.included.length>0 && !focus.broaden;
  const fits=(item:TopicRecommendation)=>!focus.excluded.includes(item.domain)&&(!focused||focus.included.includes(item.domain));
  if(focus.ambiguous)questions.push('你希望排除整个领域，还是保留这个领域、换一个研究切入点？');
  const fixed=explicitIds?.length?explicitIds:!focus.switched&&intent!=='recommend'&&previousIds?.length?previousIds:[];
  if(fixed.length){
    const conflicts=fixed.filter(id=>{const item=eligible.find(item=>item.patternId===id);return item&&!fits(item);});
    if(!conflicts.length || explicitIds?.length){
      if(conflicts.length)questions.unshift('当前所选方向与这轮关注范围不同。你想保留所选方向，还是切换到新的领域？');
      return {ids:[...fixed],omittedByRequest:[],focus,coverage:conflicts.length?'conflict':'matched',explanation:conflicts.length?'保留你明确选中的方向；采用前先确认这轮研究范围。':'继续核对已选择方向的研究边界与证据。',questions};
    }
  }
  const scoped=eligible.filter(fits), detailTokens=focus.detail.match(/[a-z]{2,}|[\p{Script=Han}]{2,}/gu)??[], subjectTerms=focus.hits.filter(hit=>!hit.excluded).map(hit=>hit.term).join(' '), scored=scoped.map((item,index)=>({item,index,detailScore:contentScore(item,focus.detail),score:contentScore(item,focus.detail)+contentScore(item,subjectTerms)}));
  const concrete=detailTokens.length>0, matched=scored.filter(row=>row.detailScore>0);
  // Domain requests often contain harmless conversational phrasing. An exact
  // subject match remains useful even when those residual words do not match.
  const partialSubject=concrete&&!matched.length&&focus.included.length>0;
  const pool=focused?scored:concrete&&matched.length?matched:focus.included.length||!concrete?scored:[];
  if(!pool.length){
    questions.unshift(focus.included.length?`你更想研究${focus.included.map(label).join('、')}中的哪类人群和具体经历？也可以先调整左侧领域与资源条件。`:'你关注的具体人群、使用情境和希望改变的决定是什么？我会据此判断是否有合适的内置方向。');
    return{ids:[],omittedByRequest:[],focus,coverage:'outside_catalog',explanation:'当前资料库没有与这轮具体要求充分对应、且符合现有条件的方向；请先明确切口，再补充相关资料。',questions};
  }
  pool.sort((a,b)=>Number(focus.included.includes(b.item.domain))-Number(focus.included.includes(a.item.domain))||b.score-a.score||a.index-b.index);
  const ids:string[]=[];
  if(focus.included.length>1){for(const domain of focus.included){const choice=pool.find(row=>row.item.domain===domain);if(choice&&!ids.includes(choice.item.patternId)&&ids.length<3)ids.push(choice.item.patternId);}}
  for(const row of pool)if(ids.length<3&&!ids.includes(row.item.patternId))ids.push(row.item.patternId);
  return{ids,omittedByRequest:[],focus,coverage:partialSubject?'general':focus.included.length||concrete?'matched':'general',explanation:partialSubject?`先列出${focus.included.map(label).join('、')}领域内可用的起步方向；你提到的具体情境仍需补充资料核实。`:focus.included.length?`按这轮关注的${focus.included.map(label).join('、')}筛选，再比较调查入口与证据条件。`:concrete?'按具体对象与情境匹配资料，未用城市名称替代主题相关性。':'按当前地区、资源、时间与经费筛选方向。',questions};
}

/** Proposed, inspectable work, never evidence that interviews or fieldwork happened. */
export function buildTopicFirstWeekPlan(_profile:TopicProfile,pattern:TopicPattern):string[]{
  const access=pattern.accessNeeds.map(id=>ACCESS_OPTIONS.find(option=>option.id===id)?.label??id).join('、')||'目标人群或合作方';
  const evidence=pattern.minimumEvidence.slice(0,3).join('、');
  return[
    `确认入口：联系${access}，记录可触达范围、同意方式与可执行事项。尚未获得许可时，先做公开资料核验。`,
    `核对依据：逐项查找${evidence}，保存原始链接、发布时间、适用地区和未核实项。`,
    `准备探索：围绕“${pattern.question}”列出经历、原因与反例的追问；按“${pattern.population}”确认招募边界和记录表。`,
    '小范围预试：在获得同意后试用提纲或问卷，记录难以理解、无法回答和遗漏的情境；保留修改前后版本。',
    `作出去留决定：把支持、反例和证据缺口汇总给${pattern.decisionOwner}，检查能否支持“${pattern.decision}”；按记录决定保留、缩小范围或换题。`,
  ].map(step=>clipResearchText(step,300));
}
