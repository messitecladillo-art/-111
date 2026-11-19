import type { BenchmarkCheck, BenchmarkResult } from '../report-benchmark.ts';

/**
 * Advisors a team can hire into its report: each one a stage of the market-research skill pack (调查设计 through 成果交付),
 * answerable for the report checks of its field and carrying that stage's working rules in short. An advisor reads the
 * report check; it never computes anything of its own, so what it says is exactly what the check found.
 */
export type Advisor = {
  id: string; name: string; glyph: string;
  /** The skill it comes from, as the skill pack names it. */
  skill: string;
  line: string;
  /** The report checks it answers for. */
  checks: readonly string[];
  /** Its working rules, a few short lines. */
  rules: readonly string[];
};

export const ADVISORS: readonly Advisor[] = [
  { id: 'design', name: '调查设计顾问', glyph: '设', skill: 'market-research-design',
    line: '把现实决策变成可测量的问题，抽样与质控如实写出。',
    checks: ['objectives', 'sampling', 'sampleSize', 'validRate', 'pilot', 'qualityControl', 'samplingWording', 'questionnaire'],
    rules: ['研究问题、构念、题项、样本与分析一一对应', '多阶段分层/PPS交代抽样框与设计效应 Deff，线上公开链接和自愿作答如实写成便利或配额，不借用随机抽样的名称', '样本量公式只管估计精度，四级清洗配合游程检验，不把便利样本伪装为概率样本'] },
  { id: 'evidence', name: '证据与引用顾问', glyph: '证', skill: 'market-research-evidence',
    line: '每条结论都能回到出处，文献要核过内容才算数。',
    checks: ['references', 'referenceFormat', 'citations', 'referenceVerification', 'findingEvidence', 'simulated'],
    rules: ['只核了书目的文献不能支撑正式结论，顺序编码与 GB/T 7714 著录一致', '自有调查结论指向登记结果，网络舆情/NLP 须映射回构念并交代覆盖偏倚，模拟数据不冒充发现', '同一来源不因多次引用变成多项独立证据'] },
  { id: 'modeling', name: '统计建模顾问', glyph: '统', skill: 'market-research-modeling',
    line: '用最少而足够的方法回答问题，效应、区间与前提一起报告。',
    checks: ['tests', 'diagnostics', 'denominators', 'methods', 'reliability', 'validity', 'cleaning', 'oddsRatio', 'rankMedian', 'nullResult', 'clusterCircular', 'dynamicClaim', 'simulationRobust'],
    rules: ['OR 是优势之比，不是概率的倍数；有序李克特不以邻近均值随意插补', '不显著不等于没有差异，结合置信区间说明可排除幅度；Logit/SEM 如实报拟合与标准误', '聚类以轮廓系数/外生变量验证，树模型配 SHAP，禁用聚类+同特征树分类循环自证', '横截面数据写路径假设与关联强度，不写因果决定或动态演化'] },
  { id: 'figures', name: '科研图表顾问', glyph: '图', skill: 'market-research-figures',
    line: '每张图回答一个问题，定量由代码绑定结果绘制，概念配图严守示意边界。',
    checks: ['captions', 'figureReferences', 'traceable', 'figureCount', 'tableCount'],
    rules: ['参数明细归三线表，分布/形态/象限/拓扑归代码矢量图（发散堆叠、雨云、哑铃点图、森林与IPA等依数据自选），不原地表饼复读', '封面与概念场景插画可由生图模型辅助，但定量数值、坐标与地理边界须由代码从登记结果合成（表序居上、图序居下）', '正文自然点出图表编号并解析核心反差与异常断点，多选题与子样本写明分母'] },
  { id: 'writing', name: '报告写作顾问', glyph: '写', skill: 'market-research-writing',
    line: '先论证再成文，每段回答问题、呈现结果、限定边界。',
    checks: ['abstract', 'keywords', 'unwritten', 'findings', 'findingActions', 'executable', 'limitations', 'causal', 'paragraphs'],
    rules: ['结果段依次交代样本与条件、结果与图表、解释、推不到哪里，章尾以方法盲区自然搭桥', '建议按“实证断点→执行主体→具体抓手→量化评估指标”四要素闭合', '短句立判接带括号统计复句控爆发度，相关不写成因果，共同局限集中说一次'] },
  { id: 'delivery', name: '成果交付顾问', glyph: '交', skill: 'market-research-delivery',
    line: '正文、附录、数据与代码齐全，按赛事要求核对后再交。',
    checks: ['aiDisclosure', 'reproducible', 'formulas', 'numeric', 'length', 'chapters', 'models'],
    rules: ['标题+摘要+目录+正文合并<=65页，问卷/访谈/代码/AI透明声明表独立分卷', '正文与附录卷首语彻底脱敏零校名/导师泄露，采用1+1克制配色与统一字体谱系', '检查没做就写没做，不用“全部通过”代替记录'] },
];

/** Each advisor's colour where its share of the report is marked on the canvas. Screen only: never exported. */
export const ADVISOR_TONES: Readonly<Record<string, string>> = {
  design: '#2F7D6B', evidence: '#3A6EA5', modeling: '#6B5BA8', figures: '#96620F', writing: '#B4566E', delivery: '#5B6B7A',
};

const advisorById = (id: string) => ADVISORS.find(a => a.id === id) ?? null;
/**
 * The advisor whose skill writes a part of the report: a blueprint section's id, or a part ('abstract', 'references',
 * 'appendix'). Its rules go into that section's drafting prompt, and the canvas marks the section in its colour.
 * Every chart and table, wherever it stands, is the figures advisor's.
 */
export function advisorForNode(nodeId: string | null | undefined): Advisor | null {
  if (!nodeId) return null;
  if (nodeId === 'intro.literature' || nodeId === 'references') return advisorById('evidence');
  if (nodeId.startsWith('design.') || nodeId === 'data.pilot') return advisorById('design');
  if (nodeId.startsWith('data.') || nodeId.startsWith('compare.') || nodeId.startsWith('drivers.') || nodeId === 'diagnosis.evaluation') return advisorById('modeling');
  if (nodeId.startsWith('sample.')) return advisorById('figures');
  if (nodeId === 'appendix' || nodeId.startsWith('appendix.')) return advisorById('delivery');
  if (nodeId === 'abstract' || /^(?:intro|diagnosis|plan|conclusion)\./u.test(nodeId)) return advisorById('writing');
  return null;
}
export const exhibitAdvisor = (): Advisor => advisorById('figures')!;

export type AdvisorReading = { advisor: Advisor; issues: BenchmarkCheck[]; checked: number; passed: number };

/** What an advisor finds in a report check: its checks that apply, those that pass, and those still to fix. */
export function advisorReading(advisor: Advisor, benchmark: BenchmarkResult | null): AdvisorReading {
  const own = (benchmark?.checks ?? []).filter(c => advisor.checks.includes(c.id) && c.status !== 'na');
  return { advisor, checked: own.length, passed: own.filter(c => c.status === 'pass').length, issues: own.filter(c => c.status === 'fail' || c.status === 'partial') };
}

/** The advisors a team has hired, in the order they are listed; unknown ids are dropped. */
export const hiredAdvisors = (ids: readonly string[]) => ADVISORS.filter(a => ids.includes(a.id));

/** Checks that read a section's own words, as opposed to the report as a whole (abstract, appendices, references). */
export const SECTION_CHECKS = ['causal', 'oddsRatio', 'rankMedian', 'nullResult', 'clusterCircular', 'dynamicClaim', 'simulationRobust', 'samplingWording', 'captions'] as const;

/**
 * One section's problems: the report check run on that section alone, its text-level findings kept, each with the
 * advisor whose field it is. The rest of the report stays as it is, so results and references still resolve.
 */
export function sectionIssues(content: import('../editor-model.ts').EditorContent, sectionId: string, check: (content: import('../editor-model.ts').EditorContent) => BenchmarkResult): { check: BenchmarkCheck; advisor: Advisor }[] {
  const section = content.report.find(s => s.id === sectionId);
  if (!section) return [];
  const alone = { ...content, report: [section] };
  return check(alone).checks
    .filter(c => (SECTION_CHECKS as readonly string[]).includes(c.id) && (c.status === 'fail' || c.status === 'partial'))
    .map(c => ({ check: c, advisor: ADVISORS.find(a => a.checks.includes(c.id))! }));
}
