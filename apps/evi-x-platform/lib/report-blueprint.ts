/**
 * Structural blueprint of a 正大杯-style market-survey report: the chapters a strong entry carries,
 * what each section must achieve, the writing moves inside it and the evidence it should show.
 * The wording is original; only the structure reflects what well-reviewed entries contain.
 */
import type { EditorContent, ReportSection } from './editor-model.ts';
import { reportHeadingLevel, reportPart } from './report-format.ts';

export type BlueprintModule = 'design' | 'sampling' | 'analysis';
export type BlueprintElement = 'figure' | 'table' | 'formula' | 'citation' | 'finding';
export type BlueprintKind = 'abstract' | 'chapter' | 'section' | 'references' | 'appendix';
export type BlueprintNode = {
  id: string;
  /** The chapter a section belongs to; chapters and stand-alone parts name themselves. */
  chapter: string;
  kind: BlueprintKind;
  /** Heading text without its number; numbers are assigned from the position in the report. */
  title: string;
  /** Title words that recognise an existing section written in the author's own words. */
  keywords: readonly string[];
  purpose: string;
  moves: readonly string[];
  needs: readonly { element: BlueprintElement; label: string }[];
  /** Suggested length in Chinese characters. */
  length?: readonly [number, number];
  module?: BlueprintModule;
  optional?: boolean;
};

export const BLUEPRINT_MODULE_LABELS: Record<BlueprintModule, string> = { design: '问卷设计', sampling: '抽样设计', analysis: '数据分析' };

const chapter = (id: string, title: string, keywords: string[], purpose: string, optional = false): BlueprintNode =>
  ({ id, chapter: id, kind: 'chapter', title, keywords, purpose, moves: [], needs: [], ...(optional ? { optional } : {}) });
const section = (id: string, title: string, keywords: string[], purpose: string, moves: string[], extra: Partial<BlueprintNode> = {}): BlueprintNode =>
  ({ id, chapter: id.split('.')[0], kind: 'section', title, keywords, purpose, moves, needs: [], ...extra });
const appendix = (id: string, title: string, keywords: string[], purpose: string, moves: string[], extra: Partial<BlueprintNode> = {}): BlueprintNode =>
  ({ id, chapter: 'appendix', kind: 'appendix', title, keywords, purpose, moves, needs: [], ...extra });

export const BLUEPRINT: readonly BlueprintNode[] = [
  { id: 'abstract', chapter: 'abstract', kind: 'abstract', title: '摘要', keywords: ['摘要'], purpose: '用一页讲清为什么调查、怎样调查、发现了什么、建议做什么。',
    moves: ['背景与核心问题，一两句即可', '调查设计：对象、抽样方式、样本量与有效回收率', '分析方法：按使用顺序列出主要方法', '核心发现三到五条，每条带关键数据', '对策建议，与发现一一对应', '最后另起一行写关键词，五到八个'],
    needs: [], length: [800, 1800] },

  chapter('intro', '研究项目简介', ['研究项目简介', '项目简介', '研究概述', '绪论', '引言'], '交代选题缘由与研究框架。'),
  section('intro.background', '研究背景', ['研究背景', '背景'], '从现实情境与决策难题引出研究问题。',
    ['政策或行业趋势，并注明出处', '研究对象的现状与痛点，尽量用数据说明', '委托方或决策主体的需要', '由此提出本研究要回答的问题'],
    { needs: [{ element: 'citation', label: '背景数据与政策出处' }], length: [500, 1200] }),
  section('intro.significance', '研究意义', ['研究意义', '意义'], '说明研究结果对谁有什么用。',
    ['对决策主体的直接用途', '对同类问题的参考价值'], { length: [300, 800] }),
  section('intro.literature', '文献综述', ['文献综述', '文献回顾', '研究现状'], '梳理已有研究，找到本研究的切入点。',
    ['检索来源、检索词与文献数量', '既有研究的主要脉络，可配关键词共现图', '已有研究的不足与本研究的切入点'],
    { needs: [{ element: 'citation', label: '文献引用' }], length: [600, 1500] }),
  section('intro.roadmap', '研究思路', ['研究思路', '技术路线', '研究框架', '研究路线'], '用一张技术路线图说明从问题到结论的路径。',
    ['研究问题、数据来源、分析方法与产出如何衔接', '附技术路线图，并在正文中引用'],
    { needs: [{ element: 'figure', label: '技术路线图' }], length: [300, 800] }),
  section('intro.innovation', '研究创新点', ['创新点', '创新之处', '研究特色'], '讲清与常规做法相比的不同之处。',
    ['从选题、调查方案、分析方法中各提炼一点', '每一点说明比常规做法好在哪里'], { length: [300, 700] }),

  chapter('secondary', '网络文本与二手资料分析', ['网络文本', '舆情', '二手资料', '文本挖掘'], '在发放问卷之前摸清公众讨论的焦点，为问卷维度与研究假设提供依据。', true),
  section('secondary.source', '数据来源与处理', ['数据来源与处理', '文本来源'], '说明文本从哪里来、怎样清洗。',
    ['平台、时间范围、采集方式与合规说明', '清洗、分词与停用词处理', '进入分析的有效文本量'], { optional: true, length: [300, 800] }),
  section('secondary.analysis', '文本分析结果', ['情感分析', '词频', '主题建模', '主题模型', '文本分析'], '呈现讨论的情感倾向与主题结构。',
    ['情感倾向的分布', '高频词与主题', '有代表性的观点'],
    { optional: true, needs: [{ element: 'figure', label: '词频或主题图' }], length: [800, 2500] }),
  section('secondary.implication', '结论与启示', ['启示'], '把文本发现转化为问卷设计的依据。',
    ['文本发现如何转化为问卷维度与研究假设'], { optional: true, length: [200, 600] }),

  chapter('design', '调查方案设计与实施', ['调查方案', '调查设计', '方案设计'], '把研究问题落实为可执行、可检验的调查方案。'),
  section('design.purpose', '调查目的', ['调查目的'], '明确调查要回答什么。',
    ['与研究问题一一对应的三到五条调查目的'], { length: [200, 600] }),
  section('design.population', '调查对象和调查单位', ['调查对象', '调查单位'], '界定总体，说明向谁收集信息。',
    ['总体定义：地域、人群、时间、纳入与排除条件', '调查单位与报告单位'], { length: [200, 600] }),
  section('design.content', '调查内容与问卷结构', ['调查内容', '问卷结构', '问卷设计'], '说明问卷测什么、怎样组织。',
    ['调查内容的模块划分', '问卷结构图：模块、题号与对应的研究问题', '量表的来源与改编依据'],
    { needs: [{ element: 'figure', label: '问卷结构图' }], module: 'design', length: [400, 1000] }),
  section('design.methods', '调查方法', ['调查方法'], '说明各种方法分别承担什么任务。',
    ['文献、访谈、问卷、网络数据各自承担的任务', '线上与线下的发放方式'], { length: [300, 800] }),
  section('design.sampling', '抽样设计', ['抽样设计', '抽样方案', '抽样'], '让样本的来源可以被检验和复现。',
    ['抽样框与各阶段的抽样方法，如 PPS、分层、系统、整群', '样本量公式、参数取值与计算结果', '各阶段的入样单位表', '样本分配、实际发放与回收情况'],
    { needs: [{ element: 'formula', label: '样本量公式' }, { element: 'table', label: '抽样框或入样单位表' }], module: 'sampling', length: [800, 2000] }),
  section('design.schedule', '调查任务安排', ['任务安排', '人员分工', '进度安排', '时间安排'], '说明谁在什么时间做什么。',
    ['成员分工表', '时间进度或工作流程图'], { needs: [{ element: 'table', label: '任务分工表' }], length: [200, 600] }),
  section('design.qc', '质量控制', ['质量控制'], '说明怎样保证数据可信。',
    ['问卷设计、预调查、访员培训、现场实施、数据录入与清洗各环节的控制措施'], { length: [300, 900] }),

  chapter('data', '调查数据处理及检验', ['数据处理', '数据检验', '数据质量'], '证明数据可信、可以进入分析。'),
  section('data.pilot', '预调查', ['预调查', '预调研', '预测试'], '用小样本检验问卷，并据此修改。',
    ['预调查的样本量与对象', '信度、效度检验结果', '据此对问卷做出的修改'],
    { needs: [{ element: 'table', label: '预调查信效度表' }], module: 'analysis', length: [400, 1000] }),
  section('data.cleaning', '正式调查数据处理', ['数据处理', '数据清洗', '问卷回收'], '交代有效样本是怎样得到的。',
    ['发放量、回收量、有效量与有效回收率', '剔除规则，如注意力题、作答时长、逻辑矛盾，以及各自剔除的数量', '缺失值的处理方式'],
    { needs: [{ element: 'table', label: '剔除规则与数量表' }], module: 'analysis', length: [400, 1000] }),
  section('data.testing', '正式调查数据检验', ['信度', '效度', '数据检验'], '检验正式数据的信度与效度。',
    ['信度：Cronbach α 系数', '效度：KMO 值与 Bartlett 球形检验', '结论：是否适合进一步分析'],
    { needs: [{ element: 'table', label: '信度与效度检验表' }], module: 'analysis', length: [400, 1000] }),

  chapter('sample', '样本特征与描述性分析', ['样本特征', '描述性', '受访'], '说明样本是谁，以及核心变量的基本分布。'),
  section('sample.profile', '样本特征分析', ['样本特征', '样本结构', '人口统计'], '描述样本结构并说明代表性。',
    ['性别、年龄、身份等结构', '与总体结构的对比或代表性说明'],
    { needs: [{ element: 'figure', label: '样本结构图' }], module: 'analysis', length: [500, 1200] }),
  section('sample.descriptive', '描述性统计分析', ['描述性统计', '描述统计', '现状分析'], '呈现核心行为与态度的分布。',
    ['主要行为与态度变量的分布', '不同群体之间的对比'],
    { needs: [{ element: 'figure', label: '核心变量分布图' }], module: 'analysis', length: [800, 2500] }),

  chapter('drivers', '影响因素分析', ['影响因素', '驱动因素'], '回答哪些因素与目标行为或态度有关，关系有多强。'),
  section('drivers.tests', '差异检验与相关分析', ['差异检验', '假设检验', '相关分析', '相关性'], '先判断哪些因素存在显著关联。',
    ['按变量类型选择检验方法，并说明理由', '检验结果表：统计量、自由度、p 值', '相关矩阵或热力图', '小结：哪些因素存在显著关联'],
    { needs: [{ element: 'table', label: '检验结果表' }, { element: 'figure', label: '相关热力图' }], module: 'analysis', length: [1000, 2500] }),
  section('drivers.model', '回归模型分析', ['回归', 'Logistic', 'logit', '模型分析'], '量化各因素的影响方向与大小。',
    ['模型形式与变量编码，写出公式', '估计结果表', '效应解读，如 OR、RRR 或边际效应', '模型检验与诊断', '不同群体之间的比较'],
    { needs: [{ element: 'formula', label: '模型公式' }, { element: 'table', label: '估计结果表' }, { element: 'figure', label: '系数图' }], module: 'analysis', length: [1500, 4000] }),
  section('drivers.segment', '细分人群与画像', ['聚类', '细分', '画像', '分群'], '找出值得优先争取的人群。',
    ['聚类变量与标准化方式', '确定类别数的依据，如轮廓系数', '各类人群的画像与规模'],
    { optional: true, needs: [{ element: 'figure', label: '聚类结果图' }], module: 'analysis', length: [800, 2000] }),

  chapter('diagnosis', '评价与问题诊断', ['问题诊断', '评价', '现存问题', '反馈'], '把评价结果转化为排好先后的问题清单。'),
  section('diagnosis.evaluation', '满意度与绩效评价', ['IPA', '满意度', '绩效评价', '重要性'], '找出重要但表现不佳的环节。',
    ['评价指标体系', '重要性与表现或满意度的测量', '四象限划分与解读'],
    { needs: [{ element: 'figure', label: '象限图' }], module: 'analysis', length: [1000, 3000] }),
  section('diagnosis.problems', '现存问题归纳', ['现存问题', '问题归纳', '问题探究', '困境'], '把分散的结果归并成少数几个问题。',
    ['把检验、模型与评价结果归并为三到五个问题', '每个问题注明证据所在的图表'], { length: [600, 1500] }),

  chapter('plan', '改进方案与评估', ['改进方案', '优化方案', '提升路径', '优化路径'], '给出排好优先级、算过成本的方案。'),
  section('plan.priority', '方案优先级与成本评估', ['优先级', '成本', '权重', 'AHP', '层次分析'], '在有限资源下决定先做什么。',
    ['评估指标与赋权方法', '一致性检验', '成本与效果或支持度的对比'],
    { optional: true, needs: [{ element: 'table', label: '权重或成本表' }], length: [800, 2000] }),
  section('plan.measures', '分层面改进措施', ['改进措施', '改进策略', '层面'], '把问题逐一落到可执行的措施。',
    ['按层面逐项写：问题、措施、执行主体、所需资源、评估指标'], { length: [1200, 3500] }),
  section('plan.feasibility', '方案可行性与预期效果', ['可行性', '转化潜力', '预期效果'], '估计方案能带来多大改变。',
    ['支持率、意愿或成本约束下的预期效果', '实施风险与应对'], { optional: true, length: [500, 1200] }),

  chapter('conclusion', '结论与建议', ['结论与建议', '结论', '建议'], '逐条回答研究问题，并给出可执行的建议。'),
  section('conclusion.findings', '调查结论', ['调查结论', '研究结论', '主要结论'], '逐条回答研究问题。',
    ['按研究问题逐条作答，每条附关键数据'], { needs: [{ element: 'finding', label: '已确认的研究发现' }], length: [800, 2000] }),
  section('conclusion.suggestions', '对策建议', ['对策建议', '建议', '策略'], '让每条建议都能落地。',
    ['每条建议对应一条结论', '写明执行主体、实施步骤与评估指标'], { length: [800, 2500] }),
  section('conclusion.limits', '研究局限与展望', ['局限', '不足', '展望'], '诚实说明结论的适用边界。',
    ['样本与外推的边界', '测量与方法上的局限', '后续研究方向'], { length: [300, 800] }),

  { id: 'references', chapter: 'references', kind: 'references', title: '参考文献', keywords: ['参考文献'], purpose: '列出正文实际引用的文献。',
    moves: ['按 GB/T 7714—2015 顺序编码制著录', '正文引用处用方括号序号标注'], needs: [{ element: 'citation', label: '不少于 10 条文献' }] },

  appendix('appendix.questionnaire', '调查问卷', ['问卷'], '附正式问卷全文。', ['卷首语、全部题目与选项、题号'], { module: 'design' }),
  appendix('appendix.interviews', '访谈提纲与记录', ['访谈'], '附访谈材料。', ['访谈对象（已匿名）、时间、提纲与要点记录']),
  appendix('appendix.fieldwork', '调查实施记录', ['实施记录', '现场', '实地', '介绍信'], '证明调查确实开展。',
    ['介绍信、发放记录、现场照片；照片须经同意并处理个人信息'], { optional: true }),
  appendix('appendix.data', '数据与处理说明', ['数据说明', '原始数据', '数据处理说明', '变量编码'], '让读者能核对数据。',
    ['变量编码表、清洗规则、数据样例，不公开个人信息']),
  appendix('appendix.code', '分析代码与可复现说明', ['代码', '可复现'], '让分析可以复现。', ['所用软件与版本、关键分析步骤或代码']),
  appendix('appendix.ai', '人工智能工具使用说明', ['人工智能', 'AI', '大模型', '生成式'], '如实披露 AI 工具的使用情况。',
    ['使用的工具与模型、用途、涉及的章节', '人工核验与修改的情况']),
];

const NODE_BY_ID = new Map(BLUEPRINT.map(node => [node.id, node]));
export function blueprintNode(id: string): BlueprintNode {
  const node = NODE_BY_ID.get(id);
  if (!node) throw Error('报告蓝图中没有这一节。');
  return node;
}

const DIGITS = '零一二三四五六七八九';
/** Chinese numerals for headings, 1–99. */
export function chineseNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw Error('序号超出范围。');
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10), ones = n % 10;
  return `${tens === 1 ? '' : DIGITS[tens]}十${ones ? DIGITS[ones] : ''}`;
}

/** Heading text for a node at a given position: chapters 一、, sections （一）, appendices 附录1. */
export function blueprintTitle(node: BlueprintNode, position: number): string {
  if (node.kind === 'chapter') return `${chineseNumeral(position)}、${node.title}`;
  if (node.kind === 'section') return `（${chineseNumeral(position)}）${node.title}`;
  if (node.kind === 'appendix') return `附录${position} ${node.title}`;
  return node.title;
}

export type BlueprintOptions = { includeOptional: boolean };
/** Every included node with its numbered title, in blueprint order. */
export function blueprintOutline(options: BlueprintOptions): { node: BlueprintNode; title: string }[] {
  const nodes = BLUEPRINT.filter(node => options.includeOptional || !node.optional);
  let chapterCount = 0, sectionCount = 0, appendixCount = 0;
  return nodes.map(node => {
    if (node.kind === 'chapter') { chapterCount++; sectionCount = 0; return { node, title: blueprintTitle(node, chapterCount) }; }
    if (node.kind === 'section') return { node, title: blueprintTitle(node, ++sectionCount) };
    if (node.kind === 'appendix') return { node, title: blueprintTitle(node, ++appendixCount) };
    return { node, title: node.title };
  });
}

/**
 * A complete skeleton of empty sections. Guidance is shown beside each section while writing, never stored in
 * the body, so it cannot leak into an export. IDs derive from node IDs: the same options build the same report.
 */
export function blueprintSections(options: BlueprintOptions): ReportSection[] {
  return blueprintOutline(options).map(({ node, title }) => ({ id: `bp-${node.id}`, title, body: '', source: '' }));
}

// Arabic outline numbers need a delimiter ("3、", "1.", "2.1 "), so "5G 用户" keeps its digits.
const NUMBER_PREFIX = /^\s*(?:[一二三四五六七八九十百]+\s*[、.．]|[（(]\s*[一二三四五六七八九十百]+\s*[）)]|[（(]\s*\d+\s*[）)]|\d+(?:[.．]\d+)+(?:\s+|[、.．）)])|\d+\s*[、.．）)]|(?:附录|附件)\s*[A-ZＡ-Ｚ0-9０-９一二三四五六七八九十]*\s*[：:、.．]?)\s*/u;
/** A title without its outline number, e.g. "（五）抽样设计" → "抽样设计". */
export function stripHeadingNumber(title: string): string { return title.replace(NUMBER_PREFIX, '').trim(); }

/** The blueprint node an existing section most plausibly fills, judged only from its title. */
export function matchBlueprintNode(title: string): BlueprintNode | null {
  const part = reportPart(title), level = reportHeadingLevel(title);
  const bare = stripHeadingNumber(title).toLowerCase();
  if (!bare) return null;
  let best: { node: BlueprintNode; score: number } | null = null;
  for (const node of BLUEPRINT) {
    const compatible = part === 'abstract' ? node.kind === 'abstract'
      : part === 'references' ? node.kind === 'references'
        : part === 'appendix' ? node.kind === 'appendix'
          : level === 1 ? node.kind === 'chapter' : level === 2 ? node.kind === 'section' : node.kind === 'chapter' || node.kind === 'section';
    if (!compatible) continue;
    const exact = bare === node.title.toLowerCase() ? 100 : 0;
    const keyword = Math.max(0, ...node.keywords.filter(k => bare.includes(k.toLowerCase())).map(k => k.length));
    const score = exact + keyword;
    if (score > 0 && (!best || score > best.score)) best = { node, score };
  }
  return best?.node ?? null;
}

const backMatter = (s: ReportSection) => ['references', 'appendix'].includes(reportPart(s.title));
/** New body sections belong before the references and appendices, not after them. */
export function insertBeforeBackMatter(report: readonly ReportSection[], added: ReportSection): ReportSection[] {
  const at = report.findIndex(backMatter);
  return at < 0 ? [...report, added] : [...report.slice(0, at), added, ...report.slice(at)];
}

const CHAPTER_HEAD = /^\s*[一二三四五六七八九十百]+\s*[、.．]\s*/u;
const SECTION_HEAD = /^\s*[（(]\s*[一二三四五六七八九十百]+\s*[）)]\s*/u;
const APPENDIX_HEAD = /^(\s*(?:附录|附件)\s*)([0-9０-９]+|[一二三四五六七八九十]+)/u;
/**
 * Renumbers outline prefixes in order: chapters 一、, sections （一） within each chapter, appendices 1….
 * Titles without such a prefix are left exactly as written.
 */
export function renumberHeadings(report: readonly ReportSection[]): { report: ReportSection[]; changed: number } {
  let chapters = 0, sections = 0, appendices = 0, changed = 0;
  const next = report.map(s => {
    let title = s.title;
    const part = reportPart(s.title);
    if (part === 'body' && CHAPTER_HEAD.test(title)) { chapters++; sections = 0; title = title.replace(CHAPTER_HEAD, `${chineseNumeral(Math.min(chapters, 99))}、`); }
    else if (part === 'body' && SECTION_HEAD.test(title)) { sections++; title = title.replace(SECTION_HEAD, `（${chineseNumeral(Math.min(sections, 99))}）`); }
    else if (part === 'appendix' && APPENDIX_HEAD.test(title)) {
      appendices++;
      title = title.replace(APPENDIX_HEAD, (_m, lead: string, numeral: string) => lead + (/^[0-9０-９]+$/.test(numeral) ? String(appendices) : chineseNumeral(Math.min(appendices, 99))));
    }
    if (title === s.title) return s;
    changed++;
    return { ...s, title };
  });
  return { report: next, changed };
}

/** Inserts a blueprint section (and its chapter when that is missing) where the blueprint order puts it. */
export function insertBlueprintNode(content: EditorContent, nodeId: string): { content: EditorContent; inserted: string[]; renumbered: number } {
  const target = blueprintNode(nodeId);
  const present = (node: BlueprintNode, report: readonly ReportSection[]) => report.some(s => matchBlueprintNode(s.title)?.id === node.id);
  const wanted = target.kind === 'section' && !present(blueprintNode(target.chapter), content.report) ? [blueprintNode(target.chapter), target] : [target];
  const report = [...content.report];
  const inserted: string[] = [];
  for (const node of wanted) {
    if (present(node, report)) continue;
    const order = BLUEPRINT.indexOf(node);
    let at = report.findIndex(s => { const m = matchBlueprintNode(s.title); return !!m && BLUEPRINT.indexOf(m) > order; });
    if (at < 0) {
      const firstAppendix = report.findIndex(s => reportPart(s.title) === 'appendix');
      at = node.kind === 'appendix' ? report.length
        : node.kind === 'references' ? (firstAppendix < 0 ? report.length : firstAppendix)
          : (() => { const back = report.findIndex(backMatter); return back < 0 ? report.length : back; })();
    }
    const used = new Set(report.map(s => s.id));
    let id = `bp-${node.id}`;
    for (let n = 2; used.has(id); n++) id = `bp-${node.id}-${n}`;
    // Provisional number 1; renumbering below gives the position-correct number.
    report.splice(at, 0, { id, title: blueprintTitle(node, 1), body: '', source: '' });
    inserted.push(id);
  }
  const before = new Map(content.report.map(s => [s.id, s.title]));
  const next = renumberHeadings(report).report;
  const renumbered = next.filter(s => before.has(s.id) && before.get(s.id) !== s.title).length;
  return { content: { ...content, report: next }, inserted, renumbered };
}
