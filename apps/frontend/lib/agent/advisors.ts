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
    rules: ['研究问题、构念、题项、样本与分析一一对应', '线上公开链接和自愿作答写成便利或配额，不借用随机抽样的名称', '样本量公式只管估计精度，不能把便利样本变成概率样本'] },
  { id: 'evidence', name: '证据与引用顾问', glyph: '证', skill: 'market-research-evidence',
    line: '每条结论都能回到出处，文献要核过内容才算数。',
    checks: ['references', 'referenceFormat', 'citations', 'referenceVerification', 'findingEvidence', 'simulated'],
    rules: ['只核了书目的文献不能支撑正式结论', '自有调查的结论指向登记结果，模拟数据不能写成调查发现', '同一来源不因多次引用变成多项独立证据'] },
  { id: 'modeling', name: '统计建模顾问', glyph: '统', skill: 'market-research-modeling',
    line: '用最少而足够的方法回答问题，效应、区间与前提一起报告。',
    checks: ['tests', 'diagnostics', 'denominators', 'methods', 'reliability', 'validity', 'cleaning', 'oddsRatio', 'rankMedian', 'nullResult', 'clusterCircular', 'dynamicClaim', 'simulationRobust'],
    rules: ['OR 是优势之比，不是概率的倍数', '不显著不等于没有差异，用区间说明能排除多大的差异', '聚类效果用稳定性或未参与聚类的变量验证', '横截面数据写路径假设，不写演化'] },
  { id: 'figures', name: '科研图表顾问', glyph: '图', skill: 'market-research-figures',
    line: '每张图回答一个问题，数字来自结果文件，正文引用并解读。',
    checks: ['captions', 'figureReferences', 'traceable', 'figureCount', 'tableCount'],
    rules: ['图表都由登记结果绘制，不手抄数字', '图表在正文中被引用，并写出它说明了什么', '多选题与子样本的分母写清楚'] },
  { id: 'writing', name: '报告写作顾问', glyph: '写', skill: 'market-research-writing',
    line: '先论证再成文，每段回答问题、呈现结果、限定边界。',
    checks: ['abstract', 'keywords', 'unwritten', 'findings', 'findingActions', 'executable', 'limitations', 'causal', 'paragraphs'],
    rules: ['结果段依次交代样本与条件、结果与图表、解释、推不到哪里', '建议写明执行主体、行动与评估指标', '相关不写成因果，共同局限集中说一次'] },
  { id: 'delivery', name: '成果交付顾问', glyph: '交', skill: 'market-research-delivery',
    line: '正文、附录、数据与代码齐全，按赛事要求核对后再交。',
    checks: ['aiDisclosure', 'reproducible', 'formulas', 'numeric', 'length', 'chapters', 'models'],
    rules: ['附上 AI 工具使用说明与数据、代码说明', '导出后逐页检查目录、跨页、字体与插图', '检查没做就写没做，不用"全部通过"代替记录'] },
];

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
