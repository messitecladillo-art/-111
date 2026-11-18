import { CORPUS_RESERVE_SUMMARY } from '../../data/zhengda-empirical-anatomy.ts';
import { detectAiFlavor } from '../agent/interview-corpus-deai.ts';
import { questionnaireIssues, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import {
  estimateMinutes,
  fidelityReport,
  pretestFindings,
  type Expectation,
  type Finding,
} from './assess.ts';
import {
  fidelityRisk,
  synthesizePersonaProfile,
  type Persona,
  type PersonaAttribute,
  type PersonaProfile,
} from './persona.ts';
import {
  answerLabel,
  NO_SCENARIO,
  renderQuestionText,
  type RunSettings,
  type SiliconAnswer,
  type SiliconRun,
} from './run.ts';

export type LiveFlowStepId =
  | 'request_interaction'
  | 'make_study_plan'
  | 'design_study'
  | 'social_grounding'
  | 'deep_research'
  | 'search_personas'
  | 'build_persona'
  | 'create_panel'
  | 'interview_1'
  | 'interview_2'
  | 'interview_3'
  | 'discussion'
  | 'generate_report';

export type LiveFlowRightViewId =
  | 'design'
  | 'grounding'
  | 'deep_research'
  | 'search_persona'
  | 'build_persona'
  | 'interview_1'
  | 'interview_2'
  | 'interview_3'
  | 'discussion'
  | 'report'
  | 'stage_3d';

export interface LiveFlowTodoItem {
  id: LiveFlowStepId;
  title: string;
  viewId: LiveFlowRightViewId;
  toolName: string;
  doneAtStep: number;
}

export interface LiveEvidenceCard {
  id: number;
  platform: '国奖档案' | '量表库' | '田野边界';
  source: string;
  title: string;
  metric: string;
  excerpt: string;
  cited: boolean;
}

export interface EnrichedPersonaEntry {
  persona: Persona;
  profile: PersonaProfile;
  risk: ReturnType<typeof fidelityRisk>;
  batch: 1 | 2;
}

export interface InterviewTurnItem {
  questionId: string;
  variable: string;
  questionText: string;
  answerText: string;
  unclear: string;
  refused: boolean;
}

export interface InterviewRoundPack {
  id: 'interview_1' | 'interview_2' | 'interview_3';
  roundLabel: string;
  title: string;
  subtitle: string;
  questionIds: string[];
  questions: DesignQuestion[];
  respondentIds: string[];
  matrixHeader: string[];
  matrixRows: Array<{ personaId: string; code: string; alias: string; cells: string[] }>;
  transcriptsByPersona: Record<string, InterviewTurnItem[]>;
  markdownPreview: string;
}

export interface DiscussionTurnItem {
  id: string;
  speakerType: 'moderator' | 'persona';
  personaId?: string;
  code?: string;
  alias: string;
  roleBadge: string;
  content: string;
  aiFlavorScore?: number;
  nextPersonaId?: string;
  nextAlias?: string;
  routingReason?: string;
}

export interface AtypicaFlowBlueprint {
  studyTitle: string;
  population: string;
  panelName: string;
  panelId: string;
  timelineToken: string;
  planCard: {
    title: string;
    background: string;
    goals: string[];
    targetPopulation: string;
    methods: string[];
    deliverable: string;
  };
  clarificationOptions: ReadonlyArray<{
    id: string;
    prompt: string;
    choices: ReadonlyArray<{ id: string; label: string }>;
  }>;
  todos: LiveFlowTodoItem[];
  designMarkdown: string;
  groundingSources: Array<{ label: string; count: string }>;
  groundingSummary: string;
  groundingFindings: Array<{ heading: string; bullets: Array<{ text: string; citeIds: number[] }> }>;
  evidenceCards: LiveEvidenceCard[];
  deepResearchSections: Array<{ title: string; badge: string; body: string }>;
  enrichedPersonas: EnrichedPersonaEntry[];
  interviewRounds: Record<'interview_1' | 'interview_2' | 'interview_3', InterviewRoundPack>;
  discussionArgs: {
    panelId: string;
    instruction: string;
    personaIds: string[];
    timelineToken: string;
  };
  discussionSummary: string;
  discussionTurns: DiscussionTurnItem[];
  report: {
    kicker: string;
    title: string;
    subtitle: string;
    lead: string;
    sourceNote: string;
    keyFindings: Array<{ tag: string; title: string; detail: string }>;
    personaSnap: Array<{ alias: string; code: string; archetype: string; quote: string; traitLine: string }>;
    metrics: {
      responses: number;
      blockers: number;
      warnings: number;
      minutesLow: number;
      minutesHigh: number;
      entropy: number | null;
      straightlining: number | null;
      reversePairs: number | null;
      elevatedRisk: number;
    };
    findings: Finding[];
    actionChecklist: string[];
    followupChips: Array<{ id: string; badge: string; title: string; prompt: string }>;
  };
}

export const RIGHT_VIEW_OPTIONS: ReadonlyArray<{ id: LiveFlowRightViewId; label: string; group: 'plan' | 'persona' | 'field' | 'output' }> = [
  { id: 'design', label: '研究设计', group: 'plan' },
  { id: 'grounding', label: '文献与观察', group: 'plan' },
  { id: 'deep_research', label: '深度研究', group: 'plan' },
  { id: 'search_persona', label: '搜索 Persona', group: 'persona' },
  { id: 'build_persona', label: '构建 Persona', group: 'persona' },
  { id: 'interview_1', label: '访谈 1 · 甄别与基础', group: 'field' },
  { id: 'interview_2', label: '访谈 2 · 情境与量表', group: 'field' },
  { id: 'interview_3', label: '访谈 3 · 边界与开放题', group: 'field' },
  { id: 'discussion', label: '讨论 · 焦点圆桌', group: 'field' },
  { id: 'report', label: '报告 · 洞察与诊断', group: 'output' },
  { id: 'stage_3d', label: '3D 舞台', group: 'output' },
];

export const FLOW_CHECKLIST_STEPS: LiveFlowTodoItem[] = [
  { id: 'design_study', title: '生成研究设计与测量架构', viewId: 'design', toolName: 'designStudy', doneAtStep: 2 },
  { id: 'social_grounding', title: '国奖档案与前沿语料观察', viewId: 'grounding', toolName: 'socialGrounding', doneAtStep: 3 },
  { id: 'deep_research', title: '构念映射与保真度基线研究', viewId: 'deep_research', toolName: 'deepResearch', doneAtStep: 4 },
  { id: 'search_personas', title: '检索配额分层与高风险锚点', viewId: 'search_persona', toolName: 'searchPersonas', doneAtStep: 5 },
  { id: 'build_persona', title: '构建全套硅基受访人设', viewId: 'build_persona', toolName: 'buildPersona', doneAtStep: 6 },
  { id: 'create_panel', title: '组建受访 Panel 与 3D 舞台定位', viewId: 'stage_3d', toolName: 'createPanel', doneAtStep: 7 },
  { id: 'interview_1', title: '访谈 A：甄别过滤与高频特征', viewId: 'interview_1', toolName: 'interviewChat', doneAtStep: 8 },
  { id: 'interview_2', title: '访谈 B：核心量表与情境压力测试', viewId: 'interview_2', toolName: 'interviewChat', doneAtStep: 9 },
  { id: 'interview_3', title: '访谈 C：反向题校验与开放建议', viewId: 'interview_3', toolName: 'interviewChat', doneAtStep: 10 },
  { id: 'discussion', title: '跨分层焦点小组圆桌讨论', viewId: 'discussion', toolName: 'discussionChat', doneAtStep: 11 },
  { id: 'generate_report', title: '生成结构化预测试与洞察报告', viewId: 'report', toolName: 'generateReport', doneAtStep: 12 },
];

const formatPctOrDash = (val: number | null) => (val === null ? '—' : `${Math.round(val * 100)}%`);

const hashSeed = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const shortToken = (seed: string) => hashSeed(seed).toString(36).slice(0, 8).padEnd(8, 'x');

function splitInterviewRounds(questions: DesignQuestion[]): {
  r1: DesignQuestion[];
  r2: DesignQuestion[];
  r3: DesignQuestion[];
} {
  if (!questions.length) return { r1: [], r2: [], r3: [] };
  const r1: DesignQuestion[] = [];
  const r2: DesignQuestion[] = [];
  const r3: DesignQuestion[] = [];
  for (const q of questions) {
    if (q.reverse || q.type === 'text') {
      r3.push(q);
    } else if (q.type === 'likert' || q.text.includes('{情境}')) {
      r2.push(q);
    } else {
      r1.push(q);
    }
  }
  // Ensure every round displays at least 1-2 meaningful items when a questionnaire is short.
  if (!r1.length) r1.push(...questions.slice(0, Math.min(2, questions.length)));
  if (!r2.length) r2.push(...questions.slice(Math.min(1, questions.length - 1), Math.min(3, questions.length)));
  if (!r3.length) r3.push(...questions.slice(Math.max(0, questions.length - 2)));
  return { r1: r1.slice(0, 4), r2: r2.slice(0, 4), r3: r3.slice(0, 4) };
}

function buildRoundPack(
  id: 'interview_1' | 'interview_2' | 'interview_3',
  roundLabel: string,
  title: string,
  subtitle: string,
  questions: DesignQuestion[],
  respondents: EnrichedPersonaEntry[],
  design: Questionnaire,
  run: SiliconRun,
  scenarioId: string,
): InterviewRoundPack {
  const scenario = run.settings.scenarios.find(s => s.id === scenarioId) ?? run.settings.scenarios[0] ?? NO_SCENARIO;
  const matrixHeader = ['受访者', ...questions.map(q => q.variable || q.id)];
  const matrixRows: InterviewRoundPack['matrixRows'] = [];
  const transcriptsByPersona: Record<string, InterviewTurnItem[]> = {};

  for (const entry of respondents) {
    const p = entry.persona;
    const resp =
      run.responses.find(r => r.personaId === p.id && r.scenarioId === scenario.id && r.status === 'ok')
      ?? run.responses.find(r => r.personaId === p.id && r.status === 'ok')
      ?? run.responses.find(r => r.personaId === p.id);
    const answerMemory = new Map<string, SiliconAnswer>();
    if (resp) {
      for (const a of resp.answers) answerMemory.set(a.questionId, a);
    }

    const turns: InterviewTurnItem[] = [];
    const cells: string[] = [];

    for (const q of design.questions) {
      const a = resp?.answers.find(x => x.questionId === q.id);
      if (questions.some(target => target.id === q.id)) {
        const renderedQ = renderQuestionText(design, q, scenario, answerMemory);
        const cellVal = !a || !a.shown
          ? '未显示'
          : a.refused
            ? '跳过'
            : answerLabel(q, a.value);
        cells.push(cellVal);
        turns.push({
          questionId: q.id,
          variable: q.variable || q.id,
          questionText: renderedQ,
          answerText: !a || !a.shown ? '（跳题条件未触发，受访者未见此题）' : a.refused ? '（跳过本题 / 拒答）' : answerLabel(q, a.value),
          unclear: a?.unclear?.trim() ?? '',
          refused: Boolean(a?.refused),
        });
      }
    }

    transcriptsByPersona[p.id] = turns;
    matrixRows.push({
      personaId: p.id,
      code: p.code,
      alias: entry.profile.alias,
      cells,
    });
  }

  const previewLines = [
    `## 1. 测量项 | ${matrixHeader.join(' | ')}`,
    `| ${matrixHeader.map(() => '---').join(' | ')} |`,
    ...matrixRows.slice(0, 4).map(row => `| ${row.alias.split(' · ').pop()} (${row.code}) | ${row.cells.join(' | ')} |`),
  ];

  return {
    id,
    roundLabel,
    title,
    subtitle,
    questionIds: questions.map(q => q.id),
    questions,
    respondentIds: respondents.map(r => r.persona.id),
    matrixHeader,
    matrixRows,
    transcriptsByPersona,
    markdownPreview: previewLines.join('\n'),
  };
}

/** Synthesize a complete Atypica-fidelity live execution flow grounded strictly in EVI-X's questionnaire, panel & silicon run. */
export function buildAtypicaFlowBlueprint(input: {
  design: Questionnaire;
  attributes: PersonaAttribute[];
  personas: Persona[];
  settings: RunSettings;
  run: SiliconRun;
  expectations?: Expectation[];
  scenarioId?: string;
}): AtypicaFlowBlueprint {
  const { design, attributes, personas, settings, run } = input;
  const studyTitle = design.title.trim() || '专题市场调查预测试';
  const cleanPlanSubject = studyTitle.replace(/（教学模拟）$/u, '').trim() || studyTitle;
  const population = design.population.trim() || '目标调研受访人群';
  const attrSummary = attributes.map(a => `${a.label}（${a.levels.map(l => l.label).slice(0, 3).join('/')}）`).join(' × ');
  const scenarioNames = settings.scenarios.map(s => s.label).filter(Boolean);
  const tokenBase = `${studyTitle}:${design.questions.length}:${personas.length}:${run.id}`;

  const enrichedPersonas: EnrichedPersonaEntry[] = personas.map((p, idx) => ({
    persona: p,
    profile: synthesizePersonaProfile(p, attributes, studyTitle),
    risk: fidelityRisk(p),
    batch: idx < 5 ? 1 : 2,
  }));

  const spotlight = enrichedPersonas.slice(0, Math.min(10, enrichedPersonas.length));
  const rounds = splitInterviewRounds(design.questions);
  const scenarioId = input.scenarioId || settings.scenarios[0]?.id || NO_SCENARIO.id;

  const interview_1 = buildRoundPack(
    'interview_1',
    '访谈 1',
    '第一轮访谈 · 甄别过滤与基础特征走查',
    '核查前置甄别题与跳题逻辑是否准确隔离非目标人群，记录首屏作答直觉。',
    rounds.r1,
    spotlight,
    design,
    run,
    scenarioId,
  );
  const interview_2 = buildRoundPack(
    'interview_2',
    '访谈 2',
    '第二轮访谈 · 核心量表与情境压力测试',
    scenarioNames.length
      ? `注入情境变量「${scenarioNames.join(' vs ')}」，检验跨情境态度敏感度与李克特分值分散度。`
      : '测试核心构念量表的区分效度，识别直白凑数或直线作答风险。',
    rounds.r2,
    spotlight,
    design,
    run,
    scenarioId,
  );
  const interview_3 = buildRoundPack(
    'interview_3',
    '访谈 3',
    '第三轮访谈 · 反向题校验与语义困惑探针',
    '逐题追踪反向计分一致性与开放文本槽位，捕捉双关表述与缺少“不适用”出口的题干。',
    rounds.r3,
    spotlight,
    design,
    run,
    scenarioId,
  );

  const rawFindings = pretestFindings(design, run);
  const findings = rawFindings.filter(f => f.kind !== 'static:pilot_missing');
  const fidelity = fidelityReport(design, run, input.expectations ?? []);
  const minutes = estimateMinutes(design);
  const blockers = findings.filter(f => f.level === 'blocker').length + questionnaireIssues(design).filter(i => i.level === 'blocker').length;
  const warnings = findings.filter(f => f.level !== 'blocker').length;

  // Build 4-speaker cross-group focus group anchored in actual run answers and persona profiles.
  const cast = pickDistinctCast(enrichedPersonas, 4);
  const anchorQ = rounds.r2[0] ?? rounds.r1[0] ?? design.questions[0];
  const anchorScenario = settings.scenarios[0] ?? NO_SCENARIO;

  const discussionTurns: DiscussionTurnItem[] = [];
  discussionTurns.push({
    id: 'disc-mod-open',
    speakerType: 'moderator',
    alias: '证见 · 焦点主持人',
    roleBadge: '主持人开场',
    content: `围绕《${studyTitle}》的测量设计（共 ${design.questions.length} 题${scenarioNames.length ? ` · 情境「${scenarioNames.join(' / ')}」` : ''}），请来自不同配额层的 ${cast.length} 位受访者先从「${anchorQ?.text.slice(0, 26) || '核心满意度题项'}」出发，谈谈第一反应以及最容易卡顿/失真的地方。`,
    nextPersonaId: cast[0]?.persona.id,
    nextAlias: cast[0]?.profile.alias,
    routingReason: `优先由「${cast[0]?.profile.archetype || '首轮画像'}」破冰定调，先暴露高频群体在无提示状态下的最直观作答心态。`,
  });

  cast.forEach((entry, idx) => {
    const resp = run.responses.find(r => r.personaId === entry.persona.id && r.status === 'ok');
    const ans = anchorQ && resp ? resp.answers.find(a => a.questionId === anchorQ.id) : undefined;
    const ansText = !ans || !ans.shown
      ? '这一题被跳过了'
      : ans.refused
        ? '跳过拒答'
        : answerLabel(anchorQ!, ans.value);
    const renderedPrompt = anchorQ ? renderQuestionText(design, anchorQ, anchorScenario, new Map()) : studyTitle;
    const prevAlias = idx > 0 ? cast[idx - 1].profile.alias.split(' · ').pop() : '';
    const rawSpeech =
      idx === 0
        ? `我先坦白讲，刚看到「**${renderedPrompt.slice(0, 24)}**」这题时，我直接选了「**${ansText}**」。${entry.profile.catchphrase}${ans?.unclear ? ` 另外这题我觉得：${ans.unclear}` : ''}`
        : `听完${prevAlias}说的，我站**${entry.profile.archetype}**的日常视角反倒卡在选项边界上——刚刚这题我给了「**${ansText}**」，但其实**真实场景比选项窄得多**。${entry.profile.catchphrase}${ans?.unclear ? ` 吐槽一句：${ans.unclear}` : ''}`;
    const deai = detectAiFlavor(rawSpeech);
    const next = cast[idx + 1];

    discussionTurns.push({
      id: `disc-turn-${entry.persona.id}`,
      speakerType: 'persona',
      personaId: entry.persona.id,
      code: entry.persona.code,
      alias: entry.profile.alias,
      roleBadge: entry.profile.archetype,
      content: rawSpeech,
      aiFlavorScore: deai.score,
      nextPersonaId: next?.persona.id,
      nextAlias: next?.profile.alias,
      routingReason: next
        ? `由「${next.profile.archetype}」(${next.persona.code}) 接麦形成跨分层对照，检验同题干是否在不同背景间产生理解漂移。`
        : undefined,
    });
  });

  if (cast.length >= 2) {
    discussionTurns.push({
      id: 'disc-mod-close',
      speakerType: 'moderator',
      alias: '证见 · 焦点主持人',
      roleBadge: '主持人收束追问',
      content: `三位先从各自体验拆出了「**题干边界不清**」与「**情境敏感差异**」。综合 ${run.responses.length} 条硅基样本轨迹（样本熵 ${fidelity.diversity.entropy === null ? '—' : fidelity.diversity.entropy.toFixed(2)}，直线作答率 ${formatPctOrDash(fidelity.forward.straightlining)}），当前发现 ${blockers} 处阻断问题与 ${warnings} 处建议修订项。你可在下方输入自定义问题，直接向本组继续追问。`,
    });
  }

  const evidenceCards: LiveEvidenceCard[] = [
    {
      id: 1,
      platform: '国奖档案',
      source: `正大杯知识底座 · ${CORPUS_RESERVE_SUMMARY.totalReports} 篇国奖`,
      title: '历届国奖问卷预测试与构念对齐基准',
      metric: `样本参考 ${CORPUS_RESERVE_SUMMARY.totalPages.toLocaleString()} 页语料`,
      excerpt: '高评分报告均要求在正式大规模投放前完成小样本预测试，显式追踪跳题可达性与反向计分题一致性，避免因题项歧义拉低量表α信度。',
      cited: true,
    },
    {
      id: 2,
      platform: '量表库',
      source: `${CORPUS_RESERVE_SUMMARY.surveyCategories} 大行业问卷范式库`,
      title: `目标总体「${population}」分层配额覆盖校验`,
      metric: `${personas.length} 位硅基锚点 · ${attributes.length} 维属性`,
      excerpt: `已按 ${attrSummary || '预设特征'} 最大余数法精确锁定配额；其中保真度风险上升画像共 ${fidelity.risk.elevated}/${fidelity.risk.total} 位，须防止大模型向均值趋同。`,
      cited: true,
    },
    {
      id: 3,
      platform: '田野边界',
      source: '社会科学图灵测试与防替代准则',
      title: '模拟回答与真实调查样本隔离红线',
      metric: `多样熵 H=${fidelity.diversity.entropy === null ? '—' : fidelity.diversity.entropy.toFixed(2)} · 直线率 ${formatPctOrDash(fidelity.forward.straightlining)}`,
      excerpt: '硅基受访者仅用于问卷表述排雷、情境敏感性试算与流程走查，绝不得直接充当真实样本写入最终推断统计表。',
      cited: true,
    },
    {
      id: 4,
      platform: '量表库',
      source: '题干语义清晰度扫描',
      title: '含蓄表述与缺乏“不适用”出口定位',
      metric: `识别修订提示 ${warnings} 条`,
      excerpt: findings[0]?.message || '本轮题干结构完整，建议逐条复核反向计分标识与长选项移动端折行阅读体验。',
      cited: findings.length > 0,
    },
  ];

  const designLines = [
    `## 一、研究核心张力与测度设计`,
    `针对《${studyTitle}》，将抽象议题拆解为 ${design.questions.length} 道可量化与可追踪题项，聚焦「${population}」在${scenarioNames.length ? `「${scenarioNames.join(' / ')}」情境下的` : '日常真实行为情境下的'}态度阈值与卡顿痛点。`,
    `## 二、分层配额策略（N = ${personas.length}）`,
    attributes.map(a => `- **${a.label}**：${a.levels.map(l => `${l.label} (权重 ${l.weight})`).join(' · ')}`).join('\n'),
    `## 三、分轮次硅基访谈路由`,
    `- **第 1 轮（甄别与高频行为）**：测查 ${rounds.r1.map(q => `\`${q.variable || q.id}\``).join('、')}`,
    `- **第 2 轮（核心量表与情境）**：测查 ${rounds.r2.map(q => `\`${q.variable || q.id}\``).join('、')}`,
    `- **第 3 轮（反向一致与建议）**：测查 ${rounds.r3.map(q => `\`${q.variable || q.id}\``).join('、')}`,
    `## 四、质量门禁与交付标准`,
    `执行 Cramér's V 反向连续性、正反向题一致性、直线作答率及封闭题标准化信息熵检验，并在结尾生成可溯源 CSV 与预测试修订清单。`,
  ];

  return {
    studyTitle,
    population,
    panelName: `${population} · 全层级仿真队列`,
    panelId: String(10000 + (hashSeed(tokenBase) % 89999)),
    timelineToken: shortToken(tokenBase),
    planCard: {
      title: `预测试方案 · 《${cleanPlanSubject}》`,
      background: `围绕「${studyTitle}」（目标总体：${population}），当前问卷包含 ${design.questions.length} 道题项${scenarioNames.length ? `及 ${scenarioNames.length} 个对照情境（${scenarioNames.join('、')}）` : ''}。为避免直接投放产生高跳出与理解偏差，先以硅基样本队列执行全流程模拟推演。`,
      goals: [
        '识别表述模糊、带诱导倾向或缺乏「不适用」出口的题项',
        `沿「${attributes.map(a => a.label).join(' · ') || '核心特征'}」分层对比回答分布差异`,
        '通过 1v1 深访实录与焦点圆桌定位真实消费/行为阻碍因子',
      ],
      targetPopulation: `${personas.length} 位全分层硅基受访者（${attributes.map(a => a.label).join('、') || '默认配额'}）`,
      methods: [
        '1. 按最大余数法锁定配额，构建具象口癖与生活境况的 AI 受访人设',
        '2. 执行 3 轮分主题 1v1 访谈与跨组焦点小组圆桌讨论',
        '3. 计算 Cramér V 与多样熵，输出可回溯至个体受访编码的预测试诊断报告',
      ],
      deliverable: `结构化预测试诊断报告 · 全量模拟样本矩阵 (${run.responses.length} 条回答) · 3D 空间群像分布`,
    },
    clarificationOptions: [
      {
        id: 'focus',
        prompt: '本轮预测试重点校验哪类风险？',
        choices: [
          { id: 'pretest', label: '题干歧义、选项漏斗与跳题路径排雷' },
          { id: 'scenario', label: '跨情境态度对比与敏感性检验' },
          { id: 'fidelity', label: '边缘群体失真度与直线作答检测' },
        ],
      },
      {
        id: 'mode',
        prompt: '希望以何种节奏在右侧画布观摩实时推演?',
        choices: [
          { id: 'live', label: '1:1 实时逐阶段推演（同步联动 3D 舞台）' },
          { id: 'fast', label: '疾速全流程贯通并直出诊断报告' },
        ],
      },
    ],
    todos: FLOW_CHECKLIST_STEPS,
    designMarkdown: designLines.join('\n\n'),
    groundingSources: [
      { label: '正大杯国奖语料库', count: `${CORPUS_RESERVE_SUMMARY.totalReports} 篇` },
      { label: '标准问卷模板库', count: `${CORPUS_RESERVE_SUMMARY.surveyFiles} 份` },
      { label: '高维硅基画像池', count: `${personas.length} 位` },
    ],
    groundingSummary: `已结合 ${CORPUS_RESERVE_SUMMARY.totalReports} 篇竞赛规范案例与本问卷 ${design.questions.length} 道题结构，生成 3 类前置研究边界与 ${personas.length} 位配额受访锚点。`,
    groundingFindings: [
      {
        heading: '1. 问卷构造与跳题逻辑基线',
        bullets: [
          {
            text: `问卷共设 ${design.questions.length} 题，预计真实填答耗时约 ${minutes.low}–${minutes.high} 分钟；首题是否有效分流直接决定后序核心构念的样本有效率。`,
            citeIds: [1],
          },
          {
            text: findings.length
              ? `预检已捕抓到 ${findings.length} 处需复核项（例如「${findings[0].message.slice(0, 32)}…」），应在正式抽样前完成语义微调。`
              : '静态检查未发现阻断级缺失或循环跳转，可直接进入硅基受访者沉浸式试答与圆桌深挖。',
            citeIds: [4],
          },
        ],
      },
      {
        heading: '2. 硅基配额覆盖与防趋同机制',
        bullets: [
          {
            text: `面板精确匹配 ${attributes.length} 个分层属性（${attrSummary || '预设模板'}），避免常见模型样本全部向“温和中立高学历”塌缩的单一视角偏差。`,
            citeIds: [2],
          },
          {
            text: `面板中共计 ${fidelity.risk.elevated} 位受访者命中保真度提醒阈值（${fidelity.risk.reasons.join('、') || '暂无高风险关键词'}），圆桌环节将保留其反对与质疑权，并严格禁止替代真实人类数据。`,
            citeIds: [3],
          },
        ],
      },
    ],
    evidenceCards,
    deepResearchSections: [
      {
        title: '核心统计指标预设 · Backward Continuity (Cramér V)',
        badge: fidelity.backward.verdict === 'pass' ? '通过基线' : '待关注',
        body: fidelity.backward.attributes.map(a => `- **${a.label}**：最大关联 Cramér's V = **${a.v.toFixed(2)}**（对应题项 ${a.question || '暂无'}）`).join('\n'),
      },
      {
        title: '量表作答稳健性 · Forward Continuity & Diversity',
        badge: `多样熵 ${fidelity.diversity.entropy === null ? '—' : fidelity.diversity.entropy.toFixed(2)}`,
        body: `直线作答率 **${formatPctOrDash(fidelity.forward.straightlining)}** · 正反向一致性 **${formatPctOrDash(fidelity.forward.reversePairs)}** · 跳转违规次数 **${fidelity.forward.routingViolations}** · 完全重复答卷率 **${formatPctOrDash(fidelity.diversity.duplicateRate)}**。`,
      },
      {
        title: '三维空间分布策略 · 3D 硅基舞台',
        badge: `${personas.length} 位在场`,
        body: `全部 ${personas.length} 位受访者按黄金角螺线排布进驻 3D 舞台；选中任一受访者或按核心问题着色时，其脚底光环与站位弧线同步聚类刷新。`,
      },
    ],
    enrichedPersonas,
    interviewRounds: { interview_1, interview_2, interview_3 },
    discussionArgs: {
      panelId: String(10000 + (hashSeed(tokenBase) % 89999)),
      instruction: `背景：围绕《${studyTitle}》开展跨层级硅基焦点圆桌，邀请 ${cast.map(c => `${c.profile.alias} (${c.persona.code})`).join('、')} 互相回应刚才暴露的题干歧义与生活边界。已观测前置量化特征：有效作答 ${run.responses.filter(r => r.status === 'ok').length} 份，预估作答 ${minutes.low}–${minutes.high} 分钟。`,
      personaIds: cast.map(c => c.persona.code),
      timelineToken: shortToken(`${tokenBase}:disc`),
    },
    discussionSummary: `已完成 ${cast.length} 位不同层级受访者的跨组交锋：从「${anchorQ?.variable || 'Q1'}」实际打分延伸到真实使用情境限制，识别出「选项缺少边界」与「口语预期不对称」两条具体改进线索。`,
    discussionTurns,
    report: {
      kicker: '证见 · 硅基样本预测试报告',
      title: studyTitle,
      subtitle: '从语义歧义排查到真实生活情境校准',
      lead: `本轮围绕目标总体「${population}」，调用 ${personas.length} 位分层硅基受访者完成 ${run.responses.filter(r => r.status === 'ok').length} 份沉浸式试答与 4 席焦点小组交叉质询。所有结论均严格限制为“问卷预测试与流程演练”，已精准锚定至个体受访者编号与题干。`,
      sourceNote: `信息来源说明：由 EVI-X 硅基样本矩阵（引擎：${run.engine === 'demo' ? '确定性演示推演' : run.settings.models.join(' / ') || '语言模型'}）生成。严格隔离于真实田野调查数据之外。`,
      keyFindings: [
        {
          tag: blockers > 0 ? '阻断优先修正' : '结构可通行',
          title: blockers > 0 ? `拦截 ${blockers} 处阻断级结构缺陷` : '问卷主干逻辑与跳题链条顺畅',
          detail: blockers > 0
            ? findings.find(f => f.level === 'blocker')?.message || '存在必填字段或选项结构阻断，须修订后才可发布。'
            : `全部 ${design.questions.length} 道题目跳题违规次数为 ${fidelity.forward.routingViolations}，预估填答耗时 ${minutes.low}–${minutes.high} 分钟，处于高完答舒适区间。`,
        },
        {
          tag: '语义与认知负荷',
          title: warnings > 0 ? `定位 ${warnings} 处易引发歧义或困惑的表述` : '题干口语自然度表现均衡',
          detail: findings.find(f => f.level !== 'blocker')?.message || `受访者对「${anchorQ?.variable || 'Q1'}」等核心题项均能给出明确落点，建议重点复核低频用户的“不适用”选项出口。`,
        },
        {
          tag: '样本区分度校准',
          title: `封闭题标准化熵 ${fidelity.diversity.entropy === null ? '—' : fidelity.diversity.entropy.toFixed(2)} · 直线率 ${formatPctOrDash(fidelity.forward.straightlining)}`,
          detail: `面板覆盖 ${fidelity.risk.elevated} 位较高保真度风险画像，焦点圆桌中已单独记录其对“标准选项贴近度不足”的一线质疑。`,
        },
      ],
      personaSnap: cast.map(c => ({
        alias: c.profile.alias,
        code: c.persona.code,
        archetype: c.profile.archetype,
        quote: c.profile.catchphrase,
        traitLine: attributes.map(a => c.persona.traits[a.key]).filter(Boolean).slice(0, 3).join(' · '),
      })),
      metrics: {
        responses: run.responses.filter(r => r.status === 'ok').length,
        blockers,
        warnings,
        minutesLow: minutes.low,
        minutesHigh: minutes.high,
        entropy: fidelity.diversity.entropy,
        straightlining: fidelity.forward.straightlining,
        reversePairs: fidelity.forward.reversePairs,
        elevatedRisk: fidelity.risk.elevated,
      },
      findings,
      actionChecklist: [
        ...(findings.length
          ? findings.slice(0, 3).map(f => {
              const varLabel = f.questionId ? (design.questions.find(q => q.id === f.questionId)?.variable || f.questionId) : '整体测量设计';
              return `核对 ${varLabel} — ${f.message}`;
            })
          : [
              `复核题项 ${anchorQ?.variable || 'Q1'} 与反向题组边界：确认低频/无经历受访者是否需要「不适用 / 跳过」出口。`,
              `校验情境变量对量表均值的影响幅度，观察极值选择是否存在社会赞许性趋同。`,
            ]),
        '导出本轮完整硅基 CSV 送入「数据分析」模块演练信效度检验脚本（标注为 simulated）。',
        '进入真实预调查（Pilot n=30~50）对比真实受访者作答耗时与各维度方差分布。',
      ],
      followupChips: [
        {
          id: 'revise',
          badge: '问卷防偏调优',
          title: '哪些题干最易引导受访者顺从打高分？',
          prompt: `请大家直接挑刺：围绕《${studyTitle}》刚才讨论的题目，哪一句问法最容易让人不好意思选低分或直接敷衍勾选？怎么改成大白话？`,
        },
        {
          id: 'scenario',
          badge: '情境对比验证',
          title: '换成突发忙碌或高峰排队情境，答案会怎么变？',
          prompt: `假设现在大家刚好赶时间或遇到周末高峰，重看《${studyTitle}》这几道题，你的选择和耐心容忍度会突然拐点下掉吗？`,
        },
        {
          id: 'edge',
          badge: '边缘群体压力测试',
          title: '低频用户 / 年长者是否缺少“不适用”出口？',
          prompt: `站在不常使用甚至从未体验过的人群角度，这份问卷目前最缺哪个“我不确定/不适用”的真实选项出口？`,
        },
      ],
    },
  };
}

function pickDistinctCast(entries: EnrichedPersonaEntry[], count: number): EnrichedPersonaEntry[] {
  const chosen: EnrichedPersonaEntry[] = [];
  const seenArchetypes = new Set<string>();
  for (const e of entries) {
    if (!seenArchetypes.has(e.profile.archetype)) {
      seenArchetypes.add(e.profile.archetype);
      chosen.push(e);
      if (chosen.length >= count) return chosen;
    }
  }
  for (const e of entries) {
    if (!chosen.some(c => c.persona.id === e.persona.id)) {
      chosen.push(e);
      if (chosen.length >= count) return chosen;
    }
  }
  return chosen;
}
