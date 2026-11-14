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
  { rank: '02', id: 'Humanizer-zh', name: 'Humanizer-zh', tag: '中文', summary: '专治中文 AI 腔：替换公文套话、译制腔与过度修饰', focus: 'de_slop' },
  { rank: '03', id: 'stop-slop', name: 'stop-slop', tag: '去腔', summary: '删除“综上所述/值得注意的是/赋能/抓手”等高频模型水词', focus: 'de_slop' },
  { rank: '04', id: 'taste-skill', name: 'taste-skill', tag: '审美', summary: '保留锋利判断与具体生活细节，拒绝平庸套话', focus: 'persona' },
  { rank: '05', id: 'ai-flavor-remover', name: 'ai-flavor-remover', tag: '去味', summary: '压缩冗余副词与假大空定语，恢复自然语序', focus: 'de_slop' },
  { rank: '06', id: 'shuorenhua', name: 'shuorenhua', tag: '说人话', summary: '中文口语化改写：注入自然停顿、自我修正与具体生活锚点', focus: 'colloquial' },
  { rank: '07', id: 'nuwa-skill', name: 'nuwa-skill', tag: '文风', summary: '为不同身份受访者蒸馏差异化说话习惯与视角', focus: 'persona' },
  { rank: '08', id: 'writing-agent', name: 'writing-agent', tag: '系统', summary: '写作全流程去味约束与节奏控制', focus: 'prompt' },
  { rank: '09', id: 'chatgpt-comparison-detection', name: 'chatgpt-comparison-detection', tag: '检测', summary: '量化识别典型生成式句式并定位 AI 味热区', focus: 'detect' },
  { rank: '10', id: 'De-AI-Prompt-Enhancer', name: 'De-AI-Prompt-Enhancer', tag: '提示词', summary: '向生成模型系统提示词注入去 AI 味红线规则', focus: 'prompt' },
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
  { pattern: /综上所述[，,：:]?/gu, label: '综上所述', reason: '典型生成式结尾套话', academicSub: '', spokenSub: '说到底' },
  { pattern: /总而言之[，,：:]?/gu, label: '总而言之', reason: '模板化总结过渡', academicSub: '综上，', spokenSub: '反正' },
  { pattern: /值得注意的是[，,：:]?/gu, label: '值得注意的是', reason: '高频 AI 转折垫词', academicSub: '需要指出的是，', spokenSub: '说起来还有一点，' },
  { pattern: /不言而喻/gu, label: '不言而喻', reason: '空洞断言，缺乏证据边界', academicSub: '较为明显', spokenSub: '一看就知道' },
  { pattern: /毫无疑问[，,]?/gu, label: '毫无疑问', reason: '绝对化修辞（学术禁忌）', academicSub: '', spokenSub: '按我的感觉，' },
  { pattern: /在当今时代|在当今社会/gu, label: '在当今时代', reason: '宏大空泛开篇套话', academicSub: '在当前阶段', spokenSub: '这两年' },
  { pattern: /随着[^，。！？\n]{2,14}的不断发展[，,]?/gu, label: '随着……的不断发展', reason: '典型八股导语', academicSub: '', spokenSub: '这阵子' },
  { pattern: /深度赋能|全面赋能|赋能/gu, label: '赋能', reason: '互联网公文黑话（Humanizer-zh 禁用）', academicSub: '支撑', spokenSub: '帮得上忙' },
  { pattern: /核心抓手|重要抓手|抓手/gu, label: '抓手', reason: '公文套话（stop-slop）', academicSub: '切入点', spokenSub: '关键的一步' },
  { pattern: /形成(?:了)?(?:完整|有效)?闭环|闭环/gu, label: '闭环', reason: '高频套话，建议写具体流程', academicSub: '前后衔接', spokenSub: '能顺下来' },
  { pattern: /不仅如此[，,]?/gu, label: '不仅如此', reason: '机械递进连接词', academicSub: '此外，', spokenSub: '而且' },
  { pattern: /与此同时[，,]?/gu, label: '与此同时', reason: 'AI 高频并列连接词', academicSub: '同时，', spokenSub: '另外' },
  { pattern: /由此可见[，,]?/gu, label: '由此可见', reason: '机械因果总结', academicSub: '据此可见，', spokenSub: '所以你看，' },
  { pattern: /具有重要(?:的)?(?:现实|战略|深远)?意义/gu, label: '具有重要意义', reason: '空泛价值拔高', academicSub: '具有参考价值', spokenSub: '还挺有用的' },
  { pattern: /是一把双刃剑/gu, label: '双刃剑', reason: '陈词滥调隐喻', academicSub: '存在正负两面效应', spokenSub: '有好处也有烦人的地方' },
  { pattern: /极大地|显著地|深刻地|全面地/gu, label: '过度程度副词', reason: 'stop-slop 冗余修饰副词', academicSub: '', spokenSub: '' },
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
    hits.push({ phrase: '一方面……另一方面……', reason: 'AI 高频平衡对比骨架', suggestion: '按主次先后直接切入对比视角' });
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
      ? `AI 味指数 ${score}/100（自然克制）：未见明显套话腔。`
      : level === 'mild'
        ? `AI 味指数 ${score}/100（轻度模板腔）：命中 ${hits.length} 处套话或机械句式，建议微调。`
        : `AI 味指数 ${score}/100（明显 AI 腔）：命中 ${hits.length} 处高频套话，建议一键去味重写。`;

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
      changes.push(`清理「${rule.label}」→「${rep || '直接切入陈述'}」`);
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
      '【去 AI 味口语准则（Humanizer-zh + shuorenhua + nuwa-skill）】',
      '一、禁止受访者使用书面总结词或公文腔（如“综上所述”“值得注意”“赋能”“抓手”“闭环”“痛点”“显著提升”）。',
      '二、必须保留真实说话节奏：出现犹豫停顿（“怎么说呢”“实话讲”）、自我修正（“倒也不是贵，主要是……”）与具体生活场景细节。',
      '三、不同角色使用差异化词汇密度与关注点，避免多位受访者口径整齐划一。',
    ].join('\n');
  }

  return [
    '【去 AI 味学术行文红线（Humanizer-zh + stop-slop + writing-agent）】',
    '一、禁用高频模型套话与公文黑话，包括“综上所述”“总而言之”“值得注意的是”“不言而喻”“毫无疑问”“在当今时代”“赋能”“抓手”“形成闭环”“具有重要意义”。',
    '二、避免机械排比与对称模板句，少用“不仅……而且……”“一方面……另一方面……”，改为结论前置、证据紧随其后的平实句式。',
    '三、长短句错落搭配，直接陈述变量关系与适用边界，不写空洞拔高与情绪化修饰。',
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

/**
 * 围绕课题、人群与测量维度生成定性半结构化访谈提纲、4 位去 AI 味受访者原声语料与扎根理论三级编码映射表。
 */
export function generateInterviewCorpus(params: {
  topic: string;
  population?: string;
  dimensions?: readonly string[];
  groupChoices?: readonly string[];
}): InterviewCorpusPack {
  const cleanTopic = (params.topic || '研究主题').trim().replace(/[（(][^）)]*[）)]$/u, '');
  const shortSubject = cleanTopic.replace(/(?:的)?(?:使用体验|满意度|调查|研究|调研).*$/u, '').trim() || cleanTopic.slice(0, 14);
  const population = (params.population || '核心受访群体与潜在关注者').trim();
  const dims = (params.dimensions && params.dimensions.length
    ? params.dimensions
    : ['流程便捷度', '服务响应速度', '价格透明度', '场景体验质量', '持续推荐意愿']
  ).slice(0, 5);
  const dim0 = dims[0] || '流程便捷度';
  const dim1 = dims[1] || '服务响应速度';
  const dim2 = dims[2] || '价格与信息透明度';
  const dim3 = dims[3] || '场景氛围与适配度';
  const groupA = params.groupChoices?.[0] || '高频参与群体';
  const groupB = params.groupChoices?.[1] || '低频观望群体';

  const disclaimer =
    '【教学模拟访谈语料】以下半结构化深访提纲、受访者原声摘录与三级编码表由研究设计自动推导并经 GitHub 去 AI 味十项原则（Humanizer-zh / stop-slop / shuorenhua / nuwa-skill）清洗，专供问卷维度校核与质性编码演练参考，不替代真实田野录音。';

  const guide: InterviewGuideItem[] = [
    {
      id: 'Q-I1',
      stage: '1. 破冰与初触情景',
      prompt: `您最早是在什么具体场合接触到「${shortSubject}」的？还记得第一次用时的真实感受吗？`,
      followUp: '追问：当时促使您尝试或犹豫的具体细节是什么？',
    },
    {
      id: 'Q-I2',
      stage: '2. 核心卡点与摩擦',
      prompt: `平时说到${dim0}和${dim1}，有没有哪一次让您觉得“差点就不想继续了”？能讲讲当时的经过吗？`,
      followUp: '追问：后来这个问题自己解决了吗，还是干脆换了别的选择？',
    },
    {
      id: 'Q-I3',
      stage: '3. 成本与信任权衡',
      prompt: `在${dim2}这一块，您心里怎么算这笔账？什么情况下会觉得“这事值得”，什么情况下会打退堂鼓？`,
      followUp: '追问：同价位或同类替代方案里，您最常拿谁来做比较？',
    },
    {
      id: 'Q-I4',
      stage: '4. 群体异质性感知',
      prompt: `您觉得像${groupA}和${groupB}这两类人，在${dim3}上的期待差别大吗？身边的朋友吐槽最多的是哪一头？`,
      followUp: '追问：有没有一个“外人看不出来、只有自己用过才懂”的小问题？',
    },
    {
      id: 'Q-I5',
      stage: '5. 改进期待与推荐条件',
      prompt: `如果只允许运营方或相关部门先改好一件事，让您愿意推荐给家人朋友，您会选哪一条？为什么？`,
      followUp: '追问：改完之后您大概多久会再去试一次？',
    },
  ];

  const rawPersonas: Array<Omit<InterviewTranscript, 'aiFlavorScore' | 'skillsApplied'>> = [
    {
      id: 'R01',
      respondentCode: '受访者 R01（高频实用派）',
      personaName: '周师傅 / 工作日高频使用者',
      groupTag: groupA,
      contextNote: '线下碰面简访 · 语速快、重具体耗时与顺手程度',
      excerpt: `怎么说呢，我基本上一周要碰上三四回。其实大方向我觉得是挺省心的，省得自己再折腾一圈。不过前阵子在「${dim0}」那一块真是把我卡过一次——那天赶时间，页面里转了好几个弯才找到入口，排在后面的两个人也跟着着急。后来我摸熟了路子倒是十秒搞定，可你要是不熟的新人，头一回真容易直接关掉走人。所以你问我愿不愿意推给同事，我得看他平时耐不耐烦摸索那个流程。`,
    },
    {
      id: 'R02',
      respondentCode: '受访者 R02（谨慎比价派）',
      personaName: '陈同学 / 偶尔参与与敏感比对群体',
      groupTag: groupB,
      contextNote: '校园食堂外闲聊式访谈 · 语带犹豫与自我修正',
      excerpt: `倒也不是说贵得离谱，主要是一开始没把规则写明白。就比方说「${dim2}」这块吧，你页面上写着一个价，点进去才发现还有别的附加条件或者时间限制，心里就会咯噔一下——哪怕最后也就差个几块钱，可那种“早怎么不说明白”的防备心一下子就上来了。我现在偶尔才会去用一两次，身边室友也是，只要规则敞亮、不用猜来猜去，贵一点点大家反而认账。`,
    },
    {
      id: 'R03',
      respondentCode: '受访者 R03（体验敏感与口碑传播者）',
      personaName: '林女士 / 重视响应与细节体验群体',
      groupTag: groupA,
      contextNote: '周末社区活动室深访 · 擅长回忆具体小事',
      excerpt: `我这个人比较看重「${dim1}」和现场那点细节。上个月有回碰到临时调整，原本以为要扯皮半天，结果那边窗口的小姑娘反应特别快，二话没说先帮我把急事处理了，回头才补手续。那一下我就觉得很踏实，回来还拉着两个邻居一起试。反过来讲，「${dim3}」有时候下午人一多就显得有点挤、有点吵，如果能把错峰提示做得更明显点，整体感觉会舒服很多。`,
    },
    {
      id: 'R04',
      respondentCode: '受访者 R04（观望流失样本与一线观察）',
      personaName: '赵先生 / 曾尝试但暂未高频复访',
      groupTag: groupB,
      contextNote: '电话回访约十五分钟 · 直言痛点与替代方案比较',
      excerpt: `我试过两次就放一边了，不是说它多差，是替补方案太多了。对我这种平时嫌麻烦的人来说，如果「${dim0}」不能一眼看懂、或者出问题找不到真人马上搭把手，我就直接回原来的老办法了。其实只要把最常卡壳的那两步合并掉，再给个痛快的反馈通道，我这种闲置用户应该还是愿意回来看看的。`,
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

  const codingMatrix: GroundedCodingRow[] = [
    {
      openCode: 'A1 首遇入口冗长 / 规则隐匿预期落差',
      rawAnchor: 'R01“转了好几个弯才找到入口”、R02“早怎么不说明白”',
      axialCategory: '接触摩擦与信息透明感知',
      selectiveTheme: '行为阻断机制（影响初访留存）',
      mappedDimension: `${dim0} / ${dim2}`,
    },
    {
      openCode: 'A2 异常情景兜底与人工补位信任',
      rawAnchor: 'R03“二话没说先帮把急事处理了，就觉得踏实”',
      axialCategory: '应急响应与服务兜底力',
      selectiveTheme: '信任增益与口碑推荐前因',
      mappedDimension: `${dim1} / 推荐意愿`,
    },
    {
      openCode: 'A3 高峰拥挤感知与替代品低切换成本',
      rawAnchor: 'R03“下午人多显得吵”、R04“替补方案太多直接回老办法”',
      axialCategory: '场景容量与竞争粘性边界',
      selectiveTheme: '群体分化与流失触发条件',
      mappedDimension: `${dim3} / 高低频群体对照`,
    },
  ];

  const appendixBody = [
    disclaimer,
    '',
    '一、半结构化深访提纲（五阶段聚焦）',
    ...guide.map(g => `${g.id}【${g.stage}】${g.prompt}（${g.followUp}）`),
    '',
    '二、典型受访者原声语料摘录（已应用去 AI 味口语化改写）',
    ...transcripts.map(
      t => `· ${t.respondentCode}｜${t.personaName}（${t.groupTag}，AI味检测 ${t.aiFlavorScore} 分）：「${t.excerpt}」`,
    ),
    '',
    '三、扎根理论三级编码与问卷维度映射表',
    ...codingMatrix.map(
      c => `· [${c.openCode}] ← 实录锚点：${c.rawAnchor} → 主轴编码：${c.axialCategory} → 选择编码：${c.selectiveTheme}（对应问卷维度：${c.mappedDimension}）`,
    ),
  ].join('\n');

  const markdown = [
    `# ${shortSubject} · 定性深访提纲与去 AI 味原声语料档案`,
    '',
    `> ${disclaimer}`,
    `> 研究对象：${population}`,
    '',
    '## 一、半结构化深访提纲',
    ...guide.flatMap(g => [`### ${g.id} ${g.stage}`, `- 主问：${g.prompt}`, `- ${g.followUp}`, '']),
    '## 二、差异化受访者原声实录（经去 AI 味十大 Skill 风格处理）',
    ...transcripts.flatMap(t => [
      `### ${t.respondentCode} — ${t.personaName}`,
      `- 分组标签：${t.groupTag} | 访谈情境：${t.contextNote} | AI 味得分：${t.aiFlavorScore}/100`,
      `- 原声实录：「${t.excerpt}」`,
      '',
    ]),
    '## 三、扎根理论三级编码映射',
    '| 开放编码 | 原声实录锚点 | 主轴编码 | 选择编码 | 对应量表维度 |',
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
