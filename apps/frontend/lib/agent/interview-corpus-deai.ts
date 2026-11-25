/**
 * Qualitative Interview Corpus Generator & Top-10 De-AI Writing Engine
 * 内化 GitHub「去 AI 味十大 Skill 榜」并提供定性深访提纲、去 AI 味受访者原声语料及扎根理论三级编码表。
 */

export interface DeAiSkillSpec {
  rank: string;
  id: string;
  name: string;
  tag: string;
  summary: string;
  focus: 'detect' | 'de_slop' | 'colloquial' | 'persona' | 'prompt';
}

/** GitHub「去 AI 味十大 Skill 榜」内置规则谱系 */
export const TOP10_DEAI_SKILLS: readonly DeAiSkillSpec[] = [
  { rank: '01', id: 'humanizer', name: 'humanizer', tag: '去味', summary: '清除机械过渡、过度对称排比与空泛总结', focus: 'de_slop' },
  { rank: '02', id: 'Humanizer-zh', name: 'Humanizer-zh', tag: '中文', summary: '清理公文套话、译制腔与过度修饰，恢复平实中文语感', focus: 'de_slop' },
  { rank: '03', id: 'stop-slop', name: 'stop-slop', tag: '去腔', summary: '删除“综上所述”“值得注意的是”“赋能”“抓手”等高频套话', focus: 'de_slop' },
  { rank: '04', id: 'taste-skill', name: 'taste-skill', tag: '审美', summary: '保留锋利判断与具体生活细节，拒绝平庸套话', focus: 'persona' },
  { rank: '05', id: 'ai-flavor-remover', name: 'ai-flavor-remover', tag: '去味', summary: '压缩冗余副词与假大空定语，恢复自然语序', focus: 'de_slop' },
  { rank: '06', id: 'shuorenhua', name: 'shuorenhua', tag: '说人话', summary: '注入自然停顿、自我修正与具体生活锚点的中文口语化改写', focus: 'colloquial' },
  { rank: '07', id: 'nuwa-skill', name: 'nuwa-skill', tag: '文风', summary: '为不同身份受访者提炼差异化说话习惯与视角', focus: 'persona' },
  { rank: '08', id: 'writing-agent', name: 'writing-agent', tag: '系统', summary: '写作全流程文风克制与句长节奏控制', focus: 'prompt' },
  { rank: '09', id: 'chatgpt-comparison-detection', name: 'chatgpt-comparison-detection', tag: '检测', summary: '量化识别典型模板化句式并定位套话集中段落', focus: 'detect' },
  { rank: '10', id: 'De-AI-Prompt-Enhancer', name: 'De-AI-Prompt-Enhancer', tag: '准则', summary: '在写作规范中内嵌学术文风红线与克制表达准则', focus: 'prompt' },
];

export interface AiFlavorHit {
  phrase: string;
  reason: string;
  suggestion: string;
}

export interface AiFlavorReport {
  score: number;
  level: 'clean' | 'mild' | 'heavy';
  hits: AiFlavorHit[];
  summary: string;
}

export const AI_CLICHE_RULES: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  reason: string;
  academicSub: string;
  spokenSub: string;
}> = [
  { pattern: /综上所述[，,：:]?/gu, label: '综上所述', reason: '典型模板式结尾套话', academicSub: '', spokenSub: '说到底' },
  { pattern: /总而言之[，,：:]?/gu, label: '总而言之', reason: '模板化总结过渡', academicSub: '综上，', spokenSub: '反正' },
  { pattern: /值得注意的是[，,：:]?/gu, label: '值得注意的是', reason: '高频模板转折垫词', academicSub: '需要指出的是，', spokenSub: '说起来还有一点，' },
  { pattern: /不言而喻/gu, label: '不言而喻', reason: '空洞断言，缺乏证据边界', academicSub: '较为明显', spokenSub: '一看就知道' },
  { pattern: /毫无疑问[，,]?/gu, label: '毫无疑问', reason: '绝对化修辞（学术禁忌）', academicSub: '', spokenSub: '按我的感觉，' },
  { pattern: /在当今时代|在当今社会/gu, label: '在当今时代', reason: '宏大空泛开篇套话', academicSub: '在当前阶段', spokenSub: '这两年' },
  { pattern: /随着[^，。！？\n]{2,14}的不断发展[，,]?/gu, label: '随着……的不断发展', reason: '典型八股导语', academicSub: '', spokenSub: '这阵子' },
  { pattern: /深度赋能|全面赋能|赋能/gu, label: '赋能', reason: '互联网公文套话', academicSub: '支撑', spokenSub: '帮得上忙' },
  { pattern: /核心抓手|重要抓手|抓手/gu, label: '抓手', reason: '常见公文套话', academicSub: '切入点', spokenSub: '关键的一步' },
  { pattern: /形成(?:了)?(?:完整|有效)?闭环|闭环/gu, label: '闭环', reason: '高频套话，建议写具体流程', academicSub: '前后衔接', spokenSub: '能顺下来' },
  { pattern: /不仅如此[，,]?/gu, label: '不仅如此', reason: '机械递进连接词', academicSub: '此外，', spokenSub: '而且' },
  { pattern: /与此同时[，,]?/gu, label: '与此同时', reason: '高频对称并列连接词', academicSub: '同时，', spokenSub: '另外' },
  { pattern: /由此可见[，,]?/gu, label: '由此可见', reason: '机械因果总结', academicSub: '据此可见，', spokenSub: '所以你看，' },
  { pattern: /具有重要(?:的)?(?:现实|战略|深远)?意义/gu, label: '具有重要意义', reason: '空泛价值拔高', academicSub: '具有参考价值', spokenSub: '还挺有用的' },
  { pattern: /是一把双刃剑/gu, label: '双刃剑', reason: '陈词滥调隐喻', academicSub: '存在正负两面效应', spokenSub: '有好处也有烦人的地方' },
  { pattern: /极大地|显著地|深刻地|全面地/gu, label: '过度程度副词', reason: '冗余程度修饰副词', academicSub: '', spokenSub: '' },
];

/** 09 chatgpt-comparison-detection：检测文本 AI 套话与句式机械度（0-100，越低越自然） */
export function detectAiFlavor(text: string): AiFlavorReport {
  const source = (text ?? '').trim();
  if (!source) {
    return { score: 0, level: 'clean', hits: [], summary: '待检测文本为空。' };
  }

  const hits: AiFlavorHit[] = [];
  let penalty = 0;

  for (const rule of AI_CLICHE_RULES) {
    const matched = source.match(rule.pattern);
    if (matched && matched.length > 0) {
      penalty += Math.min(22, 9 * matched.length);
      hits.push({
        phrase: matched[0].replace(/[，,：:]$/u, '') || rule.label,
        reason: `${rule.reason}（命中 ${matched.length} 次）`,
        suggestion: rule.spokenSub || rule.academicSub || '建议删去或改写为具体事实陈述',
      });
    }
  }

  if (/不仅[^。！？]{2,36}而且/gu.test(source)) {
    penalty += 10;
    hits.push({ phrase: '不仅……而且……', reason: '机械对称递进句式', suggestion: '拆为两句短句，先说事实再补充细节' });
  }
  if (/一方面[^。！？]{2,40}另一方面/gu.test(source)) {
    penalty += 10;
    hits.push({ phrase: '一方面……另一方面……', reason: '高频对称平衡对比骨架', suggestion: '按主次先后直接切入对比视角' });
  }

  // Uniform sentence cadence check
  const sentences = source.split(/[。！？\n]+/u).map(s => s.trim()).filter(s => s.length >= 6);
  if (sentences.length >= 4) {
    const lengths = sentences.map(s => s.length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
    if (variance < 28) {
      penalty += 10;
      hits.push({ phrase: '句长过于齐整', reason: '长短句节奏缺少自然起伏', suggestion: '穿插短句评价与细节展开' });
    }
  }

  const score = Math.min(100, Math.max(0, Math.round(penalty)));
  const level: AiFlavorReport['level'] = score >= 40 ? 'heavy' : score >= 18 ? 'mild' : 'clean';
  const summary =
    level === 'clean'
      ? `套话指数 ${score}/100（自然克制），未见明显模板套话。`
      : level === 'mild'
        ? `套话指数 ${score}/100（轻度模板化），检出 ${hits.length} 处套话或对称句式，建议微调。`
        : `套话指数 ${score}/100（套话偏多），检出 ${hits.length} 处高频套话，建议一键润色改写。`;

  return { score, level, hits, summary };
}

export type HumanizeMode = 'colloquial_interview' | 'academic_clean';

export interface HumanizeResult {
  beforeScore: number;
  afterScore: number;
  rewritten: string;
  appliedSkills: string[];
  changes: string[];
}

/** 01/02/03/05/06/07 去 AI 味联合改写引擎 */
export function humanizeTextWithSkills(text: string, mode: HumanizeMode = 'academic_clean'): HumanizeResult {
  const original = (text ?? '').trim();
  if (!original) {
    return { beforeScore: 0, afterScore: 0, rewritten: '', appliedSkills: [], changes: [] };
  }

  const before = detectAiFlavor(original);
  let out = original;
  const changes: string[] = [];

  for (const rule of AI_CLICHE_RULES) {
    if (rule.pattern.test(out)) {
      const rep = mode === 'colloquial_interview' ? rule.spokenSub : rule.academicSub;
      out = out.replace(rule.pattern, rep);
      changes.push(`清理“${rule.label}”→“${rep || '直接切入陈述'}”`);
    }
  }

  if (mode === 'colloquial_interview') {
    out = out
      .replace(/不仅([^。！？]{2,36})，?\s*而且/gu, '$1，再一个就是')
      .replace(/一方面([^。！？]{2,40})，?\s*另一方面/gu, '先说$1；再一个，');
  } else {
    out = out
      .replace(/不仅([^。！？]{2,36})，?\s*而且/gu, '$1，同时')
      .replace(/一方面([^。！？]{2,40})，?\s*另一方面/gu, '其一为$1；其二，');
  }

  // Tidy punctuation artifacts created by stripping opening filler
  out = out
    .replace(/(^|\n)[，,、；;：:\s]+/gu, '$1')
    .replace(/([。！？；])[，,、；;]+/gu, '$1')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  const after = detectAiFlavor(out);
  return {
    beforeScore: before.score,
    afterScore: after.score,
    rewritten: out,
    appliedSkills:
      mode === 'colloquial_interview'
        ? ['02 Humanizer-zh', '03 stop-slop', '06 shuorenhua', '07 nuwa-skill']
        : ['01 humanizer', '02 Humanizer-zh', '03 stop-slop', '05 ai-flavor-remover'],
    changes,
  };
}

/**
 * 08/10 De-AI-Prompt-Enhancer：输出可注入全自动写作 Agent 的去 AI 味系统指令。
 * 注意：academic_clean 模式禁止出现任何裸阿拉伯数字，以兼容 full-report-honesty 严格检查。
 */
export function buildDeAiPromptRules(mode: HumanizeMode = 'academic_clean'): string {
  if (mode === 'colloquial_interview') {
    return [
      '去 AI 味口语准则（Humanizer-zh + shuorenhua + nuwa-skill）',
      '一、禁止受访者使用书面总结词或公文腔（如“综上所述”“值得注意”“赋能”“抓手”“闭环”“痛点”“显著提升”）。',
      '二、必须保留真实说话节奏，自然呈现犹豫停顿（“怎么说呢”“实话讲”）、自我修正（“倒也不是贵，主要是……”）与具体生活场景细节。',
      '三、不同角色使用差异化词汇密度与关注点，避免多位受访者口径整齐划一。',
    ].join('\n');
  }

  return [
    '去 AI 味学术行文红线（Humanizer-zh + stop-slop + 两百余篇国奖去味语料）',
    '一、清零高频套话与公文辞令，禁用“综上所述”“总而言之”“值得注意的是”“不言而喻”“毫无疑问”“在当今时代”“赋能”“抓手”“形成闭环”“具有重要意义”“双刃剑”“由此可见”。',
    '二、强化句长爆发度（Burstiness），用简短冷峻定性判断句切分紧随括号统计参数的高密分析复句，避免句长齐整的流水账与“不仅……而且……”“一方面……另一方面……”对称排比。',
    '三、严守横截面因果克制文法，缺少工具变量或实验设计时，禁止“导致、决定了、取决于、必然带来、因果机理已证实”，一律降级为“呈现显著统计关联、伴随着更高的发生优势、边际预测贡献位居前列”。',
  ].join('\n');
}

export interface InterviewGuideItem {
  id: string;
  stage: string;
  prompt: string;
  followUp: string;
}

export interface InterviewTranscript {
  id: string;
  respondentCode: string;
  personaName: string;
  groupTag: string;
  contextNote: string;
  excerpt: string;
  aiFlavorScore: number;
  skillsApplied: string[];
}

export interface GroundedCodingRow {
  openCode: string;
  rawAnchor: string;
  axialCategory: string;
  selectiveTheme: string;
  mappedDimension: string;
}

export interface InterviewCorpusPack {
  topic: string;
  population: string;
  disclaimer: string;
  guide: InterviewGuideItem[];
  transcripts: InterviewTranscript[];
  codingMatrix: GroundedCodingRow[];
  appendixBody: string;
  markdown: string;
}

/** Extract a clean concrete stimulus noun (product/service object) without project slogans or truncated suffixes. */
function extractCleanStimulusSubject(rawTopic: string, explicitStimulus?: string): string {
  const fromExplicit = (explicitStimulus ?? '').trim().replace(/[「」『』“”"']/gu, '');
  if (fromExplicit && !/教学模拟|调查问卷|调查|研究|调研|分析/u.test(fromExplicit)) {
    return fromExplicit.slice(0, 16);
  }
  let s = (rawTopic || '目标服务').trim().replace(/[（(][^）)]*[）)]/gu, '');
  // Strip slogan prefix before colon (e.g. "银发「智」守：")
  s = s.replace(/^[^：:]{2,12}[：:]\s*/u, '');
  s = s.replace(/银发[「“"『]?智[」”"』]?守|教学模拟|模拟演示|市场调查|问卷调查|调查问卷/gu, '').trim();
  // Strip research-aspect tail starting from '的' + research nouns or trailing research suffixes
  s = s
    .replace(/的(?:使用体验|履约损耗|供需错配|公平感知|服务质量|体验|满意度|采纳意愿|复购意愿|持续使用意愿|骑手协同|家庭代际|动态定价|影响因素|优化路径|提升路径).*$/u, '')
    .replace(/(?:使用体验|履约损耗|供需错配|公平感知|采纳意愿|复购意愿|持续使用意愿|满意度|动态定价机制|家庭代际数字反哺机制|影响因素|优化路径|提升路径)?(?:与|及)?[^，。]*?(?:调查|研究|调研|分析)$/u, '')
    .replace(/(?:调查|研究|调研|分析|机制|意愿)$/gu, '')
    .replace(/[「」『』“”"']/gu, '')
    .trim();
  const strippedDemo = s.replace(/^(?:城市|农村|县城|高校)?(?:老年人|大学生|消费者|居民|受访者)(?:使用|参与|对)?\s*/u, '').trim();
  if (strippedDemo.length >= 4) s = strippedDemo;
  return (s || '该项产品或服务').slice(0, 16);
}

/**
 * 围绕课题、人群与测量维度生成定性半结构化访谈提纲、4 位受访者同构演练语料与扎根理论三级编码映射表。
 */
export function generateInterviewCorpus(params: {
  topic: string;
  stimulusNoun?: string;
  population?: string;
  dimensions?: readonly string[];
  groupChoices?: readonly string[];
  mechanismDimension?: string;
  codingRows?: 3 | 4;
  mappedTargets?: readonly string[];
}): InterviewCorpusPack {
  const cleanTopic = (params.topic || '研究主题').trim().replace(/[（(][^）)]*[）)]$/u, '');
  const shortSubject = extractCleanStimulusSubject(cleanTopic, params.stimulusNoun);
  const population = (params.population || '核心受访群体与潜在关注者').trim();
  const dims = (params.dimensions && params.dimensions.length
    ? params.dimensions
    : ['核心交付品质', '规则与信息清晰度', '履约稳定性与响应', '场景适配度', '持续使用倾向']
  ).slice(0, 5);
  const dim0 = dims[0] || '核心交付品质';
  const dim1 = dims[1] || '规则与信息清晰度';
  const dim2 = dims[2] || '履约稳定性与响应';
  const dim3 = dims[3] || dim2;
  const mechDim = (params.mechanismDimension || '启发式协同支持认同').trim();
  const groupA = params.groupChoices?.[0] || '高频参与群体';
  const groupB = params.groupChoices?.[1] || '低频观望群体';
  const emitFourRows = params.codingRows === 4 || Boolean(params.mechanismDimension);

  const combinedScope = `${cleanTopic} ${population} ${groupA} ${groupB}`;
  const isElderContext = /银发|养老|老年|长者|适老|退休|助餐|高龄/u.test(combinedScope);
  const isAcademicContext = !isElderContext && /大学生|高校|本科|研究生|科研|课程|图书馆|学术/u.test(combinedScope);

  const personaSlots = isElderContext
    ? {
        r1Name: '周阿姨（68岁） / 规律接触受访者',
        r1Place: '社区便民服务驿站面访 · 关注核心体验品质与实际易用程度',
        r1Peer: '老伴和街坊',
        r2Name: '孙伯伯（72岁） / 审慎核对规则受访者',
        r2Place: '街道长者活动室访谈 · 语速平缓、在意权限与细则说明',
        r2Peer: '同楼栋几位老邻居',
        r3Name: '林阿姨（64岁） / 重视稳定性与异常处理受访者',
        r3Place: '社区日间照料站深访 · 擅长结合日常具体经历举例',
        r3Staff: '现场协助人员',
        r4Name: '赵叔（70岁） / 曾接触但暂未高频使用受访者',
        r4Place: '电话回访约十五分钟 · 关注分步指引与本人知情确认权',
      }
    : isAcademicContext
      ? {
          r1Name: '周受访者 / 高频课程科研使用者',
          r1Place: '教学研讨间简访 · 语速快、重核心功能实际表现',
          r1Peer: '同组合作同学',
          r2Name: '吴受访者 / 审慎核查规则边界群体',
          r2Place: '线上预约语音深访 · 关注适用规范与核验透明度',
          r2Peer: '课题组同伴',
          r3Name: '林受访者 / 重视稳定性与异常响应群体',
          r3Place: '研修区面对面深访 · 关注异常工况下的响应效率',
          r3Staff: '技术支持值班人员',
          r4Name: '赵受访者 / 低频尝试与自主把控群体',
          r4Place: '电话回访约十五分钟 · 强调启发提示而非越权代办',
        }
      : {
          r1Name: '周先生 / 日常高频接触使用者',
          r1Place: '线下服务网点外简访 · 语速快、重核心品质与顺手程度',
          r1Peer: '家里人和同事',
          r2Name: '吴女士 / 审慎比对规则细节群体',
          r2Place: '线上预约语音访谈 · 在意计费规则与适用边界透明度',
          r2Peer: '周围常打交道的熟人',
          r3Name: '林女士 / 重视履约稳定与售后响应群体',
          r3Place: '周末便民访谈间深访 · 关注突发状况时的人工衔接',
          r3Staff: '值班客服人员',
          r4Name: '赵先生 / 曾尝试但暂未长期留存群体',
          r4Place: '电话回访约十五分钟 · 直言替代方案比较与自主确认需求',
        };

  const disclaimer =
    '本节所列为教学模拟访谈语料与定性编码演练映射语料（基于研究构念同构生成，非独立田野录音）。以下半结构化深访提纲、4 位受访者演练摘录与三级编码映射表均基于研究构念同构生成，仅用于问卷构念校核与编码演练映射，不作为独立定性实证证据。';

  const guide: InterviewGuideItem[] = [
    {
      id: 'Q-I1',
      stage: '1. 破冰与初触情景',
      prompt: `您最早是在什么具体场合接触到“${shortSubject}”的？还记得头一回接触时的真实感受吗？`,
      followUp: '进一步追问当时促使继续尝试或中途犹豫的具体细节。',
    },
    {
      id: 'Q-I2',
      stage: '2. 核心体验与执行细节',
      prompt: `日常使用中，围绕“${dim0}”的实际表现，有没有哪一次让您觉得不够理想甚至想暂停使用？`,
      followUp: '进一步追问后来该问题的处理经过，以及是否转向其他替代做法。',
    },
    {
      id: 'Q-I3',
      stage: '3. 规则说明与边界透明',
      prompt: `在“${dim1}”这一块，您最在意哪些事先说清楚的条款或提示？什么情况下会觉得敞亮放心？`,
      followUp: '进一步追问面对分步提示辅助自主确认与直接代办两种方式时的偏好及原因。',
    },
    {
      id: 'Q-I4',
      stage: '4. 持续稳定与群体差异',
      prompt: `结合您的观察，“${groupA}”和“${groupB}”在“${dim2}”与“${dim3}”上的关注点有什么不同？`,
      followUp: '进一步追问遇到突发状况需要人工协助时最令人安心的响应速度与处理方式。',
    },
    {
      id: 'Q-I5',
      stage: '5. 优先改进与试行条件',
      prompt: `如果现阶段针对“${shortSubject}”只集中力量先改好一处短板，您会点名先改哪一项？`,
      followUp: '进一步追问若推出配套分步指引与透明规则保障的试行方案，报名前最看重哪些保障。',
    },
  ];

  const rawPersonas: Array<Omit<InterviewTranscript, 'aiFlavorScore' | 'skillsApplied'>> = [
    {
      id: 'R01',
      respondentCode: '受访者 R01（高频实用型）',
      personaName: personaSlots.r1Name,
      groupTag: groupA,
      contextNote: personaSlots.r1Place,
      excerpt: `怎么说呢，这一个月里我差不多每周都会用到“${shortSubject}”两三回。整体上确实省了不少工夫，比以前老办法顺手。不过前阵子在“${dim0}”这一块真让我失望过一次——最基础的执行细节没做到位，跟预想的标准差了一截，当时差点就不想接着用了。我自己多用几次摸清规律后还能将就，可要是头一回接触的新用户，碰上这种基础短板很容易直接放弃。所以我跟${personaSlots.r1Peer}提起时也总说，先把核心品质细节扎扎实实做好最要紧。`,
    },
    {
      id: 'R02',
      respondentCode: '受访者 R02（规则审慎型）',
      personaName: personaSlots.r2Name,
      groupTag: groupB,
      contextNote: personaSlots.r2Place,
      excerpt: `实话讲，我倒不是挑剔价格本身，主要是怕规则和权限边界一开始没摆在明面上。就拿“${dim1}”来说吧，如果前头看着挺简单，到关键环节才冒出附加限制、收费条件或者信息授权说明，心里马上就会打个鼓——哪怕实际影响不大，那种“怎么不提前讲清楚”的顾虑一下就上来了。我现在还不算高频用，${personaSlots.r2Peer}聊天时看法也差不多：只要适用条件、收费和权限事先写得敞亮明白，不用让人猜，大家心里反而认账。`,
    },
    {
      id: 'R03',
      respondentCode: '受访者 R03（稳定与响应敏感型）',
      personaName: personaSlots.r3Name,
      groupTag: groupA,
      contextNote: personaSlots.r3Place,
      excerpt: `我平时最看重“${dim2}”稳不稳得住。上个月有一次正好碰上突发异常状况，原本以为得来回折腾半天，结果${personaSlots.r3Staff}接手特别及时，先把眼下卡住的问题妥善处理好了，事后才慢慢核对记录。那一次之后我就踏实多了。反过来讲，不同时段在“${dim2}”上的表现还是有点起伏，忙的时候衔接明显慢半拍；要是能把异常预警和人工兜底流程固定下来，长期用着会放心得多。`,
    },
    {
      id: 'R04',
      respondentCode: '受访者 R04（观望比较与自主把控型）',
      personaName: personaSlots.r4Name,
      groupTag: groupB,
      contextNote: personaSlots.r4Place,
      excerpt: `我前阵子试过两回就先停下了，倒不是说东西不好，主要是手头原来的老办法也能凑合用。对我来说，除了基础质量得过关之外，在“${mechDim}”上有一点特别关键：给清楚分步提示让我自己点确认最踏实，要是啥都不解释就全替我包办做主，我反而不敢长期用下去。只要把关键节点的知情确认权留给我本人、规则事先说透，推出升级试行方案时我是愿意报名再试一试的。`,
    },
  ];

  const transcripts: InterviewTranscript[] = rawPersonas.map(p => {
    const cleaned = humanizeTextWithSkills(p.excerpt, 'colloquial_interview');
    return {
      ...p,
      excerpt: cleaned.rewritten,
      aiFlavorScore: cleaned.afterScore,
      skillsApplied: ['nuwa-skill', 'shuorenhua', 'Humanizer-zh'],
    };
  });

  const baseRows: GroundedCodingRow[] = [
    {
      openCode: `A1 核心交付细节偏离预期影响初访留存`,
      rawAnchor: `R01“在‘${dim0}’这一块基础细节没做到位，跟预想标准差一截”`,
      axialCategory: `${dim0}执行水准与首遇留存条件`,
      selectiveTheme: '正向履约表现与透明自主边界共同支撑持续意向',
      mappedDimension: params.mappedTargets?.[0] ?? `${dim0}`,
    },
    {
      openCode: `A2 规则条款与权限边界前置说明诉求`,
      rawAnchor: `R02“怎么不提前讲清楚……事先写得敞亮明白心里反而认账”`,
      axialCategory: `${dim1}与事前规则透明度`,
      selectiveTheme: '正向履约表现与透明自主边界共同支撑持续意向',
      mappedDimension: params.mappedTargets?.[1] ?? `${dim1}`,
    },
    {
      openCode: `A3 跨时段稳定性波动与异常人工兜底保障`,
      rawAnchor: `R03“先把卡住的问题妥善处理好……不同时段表现还有点起伏”`,
      axialCategory: `${dim2}与异常工况响应衔接`,
      selectiveTheme: '正向履约表现与透明自主边界共同支撑持续意向',
      mappedDimension: params.mappedTargets?.[2] ?? `${dim2}`,
    },
  ];

  const codingMatrix: GroundedCodingRow[] = emitFourRows
    ? [
        ...baseRows,
        {
          openCode: 'A4 分步启发提示优于越权代办的知情确认诉求',
          rawAnchor: 'R04“给清楚分步提示让我自己点确认最踏实，全替我包办反而不敢长期用”',
          axialCategory: '启发式分步支持与本人知情确认权',
          selectiveTheme: '正向履约表现与透明自主边界共同支撑持续意向',
          mappedDimension: params.mappedTargets?.[3] ?? `${mechDim}`,
        },
      ]
    : baseRows;

  const appendixBody = [
    disclaimer,
    '',
    '一、半结构化深访提纲（五阶段聚焦）',
    ...guide.map(g => `${g.id}（${g.stage}）${g.prompt}（${g.followUp}）`),
    '',
    '二、典型受访者定性演练摘录（共 4 名演练角色 R01–R04，基于构念同构生成）',
    ...transcripts.map(
      t => `· ${t.respondentCode}｜${t.personaName}（${t.groupTag} · ${t.contextNote}）谈到，“${t.excerpt}”`,
    ),
    '',
    '三、三级编码演练与问卷构念同构映射表（同构演练映射，非独立田野录音）',
    ...codingMatrix.map(
      c => `· 开放编码 ${c.openCode} 源自受访原话 ${c.rawAnchor}，归入主轴范畴“${c.axialCategory}”与核心范畴“${c.selectiveTheme}”（对应问卷构念与待核查题项“${c.mappedDimension}”）。`,
    ),
  ].join('\n');

  const markdown = [
    `# ${shortSubject} · 定性编码演练映射语料档案`,
    '',
    `> ${disclaimer}`,
    `> 面向研究对象为${population}`,
    '',
    '## 一、半结构化深访提纲',
    ...guide.flatMap(g => [`### ${g.id} ${g.stage}`, `- 访谈主问为“${g.prompt}”`, `- ${g.followUp}`, '']),
    '## 二、定性演练受访者语料摘录（R01–R04，基于构念同构生成）',
    ...transcripts.flatMap(t => [
      `### ${t.respondentCode} — ${t.personaName}`,
      `- 所属分组为${t.groupTag}，访谈情境为${t.contextNote}`,
      `- 受访原话摘录为“${t.excerpt}”`,
      '',
    ]),
    '## 三、三级编码演练与构念映射（同构演练映射）',
    '| 开放编码 | 语料锚点摘录 | 主轴范畴 | 核心范畴 | 对应问卷构念与待核查题项（同构演练映射） |',
    '| --- | --- | --- | --- | --- |',
    ...codingMatrix.map(
      c => `| ${c.openCode} | ${c.rawAnchor} | ${c.axialCategory} | ${c.selectiveTheme} | ${c.mappedDimension} |`,
    ),
  ].join('\n');

  return {
    topic: shortSubject,
    population,
    disclaimer,
    guide,
    transcripts,
    codingMatrix,
    appendixBody,
    markdown,
  };
}
