/** Checks observable report evidence completeness, not award quality or methodological correctness.
 * Counts are descriptive. Adding methods, words, figures or formulas never earns credit by itself.
 */
import type { EditorContent, ReportSection } from './editor-model.ts';
import { findingNeedsReview } from './research-quality.ts';
import { reportHeadingLevel, reportPart, type ReportPart } from './report-format.ts';
import { BLUEPRINT_MODULE_LABELS, blueprintNode, matchBlueprintNode, stripHeadingNumber, type BlueprintModule, type BlueprintNode } from './report-blueprint.ts';
import { formatReference, referenceNumbers, referenceProblems } from './references.ts';
import { reportLabels } from './report-numbering.ts';

export const BENCHMARK_DIMENSIONS = {
  structure: '结构记录', design: '设计记录', data: '数据记录', analysis: '分析记录',
  figures: '图表引用', actions: '发现与行动', compliance: '来源与披露',
} as const;
export type BenchmarkDimension = keyof typeof BENCHMARK_DIMENSIONS;
export type BenchmarkFix = { label: string; insert?: string; module?: BlueprintModule; findings?: true };
export type BenchmarkStatus = 'pass' | 'partial' | 'fail' | 'na';
export type BenchmarkCheck = { id: string; dimension: BenchmarkDimension; label: string; status: BenchmarkStatus; score: number; detail: string; fixes: BenchmarkFix[] };
export type BenchmarkResult = {
  score: number;
  /** A dimension none of whose checks applies yet has no score and does not count towards the total. */
  dimensions: { id: BenchmarkDimension; label: string; score: number | null; passed: number; total: number }[];
  checks: BenchmarkCheck[];
};
/** Writing hints only. They are never score thresholds or competition requirements. */
export const BENCHMARK_TARGETS = { abstract: [800, 2000], keywords: [3, 8], paragraphMedian: [60, 180] } as const;

const HINT = /写作提示】/;
/** Lines the author actually wrote: guidance blocks (a hint marker through the next blank line) are skipped. */
export function writtenLines(text: string): string[] {
  const out: string[] = [];
  let skipping = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (HINT.test(line)) { skipping = true; continue; }
    if (skipping) { if (!line) skipping = false; continue; }
    if (line) out.push(line);
  }
  return out;
}
const CAPTION = /^(图|表)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)*/u;
/** "图 3-1 抽样流程" is a caption; "图3呈现了……。" is a sentence about a figure. */
export const isCaption = (line: string) => CAPTION.test(line) && line.length <= 50 && !/[，。；：]/.test(line);
const isHeading = (line: string) => line.length <= 40 && !/[。；]/.test(line) && reportHeadingLevel(line) !== null;
// A figure or table number cited in a sentence; the preceding character rules out words such as 代表、发表.
const FIGURE_REFERENCE = /(?:^|[\s，。；：、（(“"如见由据从在和与及即照详合])((?:图|表)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)?)/gu;
const FIGURE_TOKEN = /\[\[(图|表):([^\]\n]{1,80})\]\]/gu;
/** "图 4－1", "图4.1" and "图 4-1" name the same exhibit. */
const exhibitNumber = (text: string) => text.replace(/\s+/gu, '').replace(/[０-９]/gu, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[－—.．]/gu, '-');
/**
 * The numbers a LaTeX body gives its floats. The document class decides the scheme, so both are accepted: one sequence
 * through the document (图 3), and one per chapter, or per section when there are no chapters (图 2-1).
 */
function latexExhibitNumbers(latex: string): string[] {
  const unit = /\\chapter\{/.test(latex) ? 'chapter' : 'section', numbers: string[] = [];
  const total = { figure: 0, table: 0 }, local = { figure: 0, table: 0 };
  let part = 0;
  for (const m of latex.matchAll(new RegExp(String.raw`\\${unit}(\*?)\{|\\begin\{(figure|table)\*?\}`, 'g'))) {
    if (!m[2]) { if (!m[1]) { part++; local.figure = local.table = 0; } continue; }
    const kind = m[2] as 'figure' | 'table', head = kind === 'figure' ? '图' : '表';
    numbers.push(`${head}${++total[kind]}`, ...(part ? [`${head}${part}-${++local[kind]}`] : []));
  }
  return numbers;
}
const CITATION = /[[［]\s*\d+(?:\s*[-–—,，、]\s*\d+)*\s*[\]］]/gu;
const GBT_TYPE = /\[(?:J|M|D|C|N|R|S|P|Z|G|A|EB\/OL|DB\/OL|CP\/DK|[JMDCNRSPZG]\/OL)\]/u;

const METHODS: readonly (readonly [string, RegExp, 'test' | 'model'])[] = [
  ['卡方检验', /卡方|χ\s*[²2]|chi-?square/i, 'test'],
  ['t 检验', /(?:^|[^A-Za-z])t\s*检验|Welch/i, 'test'],
  ['方差分析', /方差分析|ANOVA/i, 'test'],
  ['非参数检验', /Kruskal|Mann[-–\s]?Whitney|秩和检验/i, 'test'],
  ['相关分析', /相关系数|Pearson|Spearman|相关分析|相关性分析/i, 'test'],
  ['回归分析', /回归/, 'model'],
  ['Logistic 回归', /Logistic|logit/i, 'model'],
  ['聚类分析', /聚类|K-?means/i, 'model'],
  ['因子分析', /因子分析|主成分/, 'model'],
  ['IPA 分析', /\bIPA\b|重要性[-—–－]?表现|重要性[-—–－]?满意度/, 'model'],
  ['层次分析法', /AHP|层次分析/, 'model'],
  ['文本挖掘', /LDA|情感分析|词频分析|主题模型|主题建模/, 'model'],
  ['结构方程', /结构方程|\bSEM\b/, 'model'],
  ['机器学习', /决策树|随机森林|XGBoost|神经网络|支持向量机/, 'model'],
  ['联合分析', /联合分析|conjoint/i, 'model'],
  ['综合评价', /熵权|TOPSIS|模糊综合评价|灰色关联|综合评价指数/i, 'model'],
];

const insert = (id: string): BenchmarkFix => ({ label: `插入「${blueprintNode(id).title}」`, insert: id });
const go = (module: BlueprintModule): BenchmarkFix => ({ label: `去${BLUEPRINT_MODULE_LABELS[module]}`, module });
const FINDINGS_FIX: BenchmarkFix = { label: '整理研究发现', findings: true };
const share = (part: number, whole: number) => whole > 0 ? part / whole : 0;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const thousands = (n: number) => n.toLocaleString('zh-CN');

type Scanned = { section: ReportSection; part: ReportPart; node: BlueprintNode | null; lines: string[] };

export function benchmarkReport(content: EditorContent): BenchmarkResult {
  const sections: Scanned[] = content.report.map(section => ({
    section, part: reportPart(section.title), node: matchBlueprintNode(section.title),
    lines: [...writtenLines(section.body), ...(section.blocks ?? []).filter(b => ['paragraph', 'callout', 'citation'].includes(b.kind)).flatMap(b => writtenLines(b.text))],
  }));
  const has = (id: string) => sections.some(s => s.node?.id === id);
  const nodeLines = (id: string) => sections.filter(s => s.node?.id === id).flatMap(s => s.lines);
  const fixIfMissing = (...ids: string[]) => ids.filter(id => !has(id)).map(insert);
  const body = sections.filter(s => s.part === 'body');
  const bodyLines = body.flatMap(s => s.lines);
  const prose = bodyLines.filter(l => !isCaption(l) && !isHeading(l));
  const proseText = prose.join('\n');
  // A heading names its method only once the section has content; skeleton headings earn nothing.
  const methodText = [...body.filter(s => s.lines.length || s.section.blocks?.length).map(s => s.section.title), ...bodyLines].join('\n');
  const blocks = body.flatMap(s => s.section.blocks ?? []);
  const evidenceBlocks = blocks.filter(b => b.kind === 'chart' || b.kind === 'table');
  const usedIds = new Set(evidenceBlocks.map(b => b.evidenceId));
  const usedResults = (content.quality?.results ?? []).filter(r => usedIds.has(r.id));
  const latex = content.latex?.body ?? '';
  const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;
  const captions = (head: '图' | '表') => bodyLines.filter(l => isCaption(l) && l.startsWith(head));
  const figures = Math.max(blocks.filter(b => b.kind === 'chart').length + captions('图').length, count(/\\begin\{figure\*?\}/g, latex));
  const tables = Math.max(blocks.filter(b => b.kind === 'table').length + captions('表').length, count(/\\begin\{table\*?\}/g, latex));
  const formulas = Math.max(blocks.filter(b => b.kind === 'formula').length,
    count(/\\\[/g, latex) + count(/\\begin\{(?:equation|align|gather|multline)\*?\}/g, latex) + Math.floor(count(/\$\$/g, latex) / 2));
  const paragraphs = prose.filter(l => l.length >= 20);
  // A reference counts only when it reaches an exhibit: an inserted reference to a chart or table block,
  // or a typed number that a numbered block, a typed caption or a float of the LaTeX body carries.
  const labels = reportLabels(content.report);
  const numbers = new Set([...labels.values()].filter(l => l.kind !== 'equation').map(l => exhibitNumber(l.reference)));
  for (const line of bodyLines) { const caption = CAPTION.exec(line); if (caption && isCaption(line)) numbers.add(exhibitNumber(caption[0])); }
  for (const number of latexExhibitNumbers(latex)) numbers.add(number);
  const exhibitReferences = (text: string) => [...text.matchAll(FIGURE_REFERENCE)].filter(m => numbers.has(exhibitNumber(m[1]))).length
    + [...text.matchAll(FIGURE_TOKEN)].filter(m => labels.get(m[2])?.kind === (m[1] === '图' ? 'figure' : 'table')).length;

  const checks: BenchmarkCheck[] = [];
  const add = (id: string, dimension: BenchmarkDimension, label: string, score: number | null, detail: string, fixes: BenchmarkFix[] = []) => {
    const value = score === null ? 0 : clamp(score);
    const status: BenchmarkStatus = score === null ? 'na' : value >= 0.999 ? 'pass' : value > 0 ? 'partial' : 'fail';
    checks.push({ id, dimension, label, status, score: value, detail, fixes: status === 'pass' || status === 'na' ? [] : fixes });
  };

  // 结构完整
  const abstract = sections.find(s => s.part === 'abstract');
  const keywordLine = abstract?.lines.find(l => /^关键词[:：]/.test(l));
  const abstractChars = abstract ? abstract.lines.filter(l => l !== keywordLine).join('').length : 0;
  const [abstractMin, abstractMax] = BENCHMARK_TARGETS.abstract;
  add('abstract', 'structure', '摘要已撰写', !abstract ? null : abstractChars ? 1 : 0,
    !abstract ? '没有摘要章节。' : `摘要约 ${thousands(abstractChars)} 字；${abstractMin}–${abstractMax} 字仅作写作参考，按适用要求和内容调整。`, fixIfMissing('abstract'));
  const keywords = keywordLine ? keywordLine.replace(/^关键词[:：]\s*/, '').split(/[、，,；;\s]+/).filter(Boolean) : [];
  const [kwMin, kwMax] = BENCHMARK_TARGETS.keywords;
  add('keywords', 'structure', '关键词', keywordLine ? (keywords.length ? 1 : 0) : null,
    keywordLine ? `关键词 ${keywords.length} 个，建议 ${kwMin}–${kwMax} 个。` : '摘要末尾缺少以“关键词：”开头的一行。', fixIfMissing('abstract'));
  const bodyChars = prose.join('').length;
  add('chapters', 'structure', '章节组织参考', null, `正文 ${body.length} 个章节或小节；章节结构由研究问题和用户选择决定。`);
  add('length', 'structure', '正文篇幅', null, `正文论述约 ${thousands(bodyChars)} 字；字数不计入证据完整度。`);
  // Chapter headings may stand alone; every other section needs written text or an evidence block.
  // Chapter headings may stand alone, and a references section is written by its structured entries.
  const writable = sections.filter(s => !(s.part === 'body' && reportHeadingLevel(s.section.title) === 1) && !(s.part === 'references' && (content.references?.length ?? 0) > 0));
  const hinted = new Set(content.report.filter(s => HINT.test(s.body) || (s.blocks ?? []).some(b => HINT.test(b.text))).map(s => s.id));
  const unwritten = writable.filter(s => hinted.has(s.section.id) || (!s.lines.length && !(s.section.blocks ?? []).some(b => b.kind !== 'paragraph'))).map(s => s.section);
  add('unwritten', 'structure', '各节均已撰写', unwritten.length ? Math.max(0, 1 - unwritten.length / Math.max(1, writable.length)) * 0.9 : 1,
    unwritten.length ? `${unwritten.length} 节尚未撰写${hinted.size ? `（其中 ${hinted.size} 节仍是写作提示）` : ''}，首个是「${unwritten[0].title || '未命名章节'}」。` : '各节都已有正文。');
  // Structured references are the list when present; older drafts list their references as lines of the section.
  const structured = content.references ?? [];
  const referenceEntries = structured.length ? structured.map(formatReference) : sections.filter(s => s.part === 'references').flatMap(s => s.lines);
  add('references', 'structure', '参考文献数量', null,
    `参考文献 ${referenceEntries.length} 条；按实际引用登记，数量不计分。`, fixIfMissing('references'));
  const appendices = sections.filter(s => s.part === 'appendix');
  /** An appendix earns credit only once it has content; an empty heading earns a little. */
  const appendixCheck = (id: string, dimension: BenchmarkDimension, label: string, pattern: RegExp, missing: string, extra: BenchmarkFix[] = [], nodes = [id]) => {
    const found = appendices.filter(s => pattern.test(s.section.title)), written = found.some(s => s.lines.length > 0);
    add(id, dimension, label, written ? 1 : found.length ? 0.3 : 0,
      written ? `已附「${found.find(s => s.lines.length)!.section.title}」。` : found.length ? `「${found[0].section.title}」已建立，但尚未填写。` : missing,
      [...fixIfMissing(...nodes), ...extra]);
  };
  appendixCheck('questionnaire', 'structure', '问卷附录', /问卷/, '附录中没有调查问卷。', [go('design')], ['appendix.questionnaire']);

  // 方案严谨
  const written = (id: string) => nodeLines(id).join('').length;
  const purposeOk = written('design.purpose') > 0 || prose.some(l => /调查目的/.test(l));
  const populationOk = written('design.population') > 0 || prose.some(l => /调查对象|目标总体|调查总体/.test(l));
  add('objectives', 'design', '调查目的与对象说明', purposeOk || populationOk || has('design.purpose') || has('design.population') ? ((purposeOk ? 1 : 0) + (populationOk ? 1 : 0)) / 2 : null,
    purposeOk && populationOk ? '调查目的与对象均已说明。' : `${purposeOk ? '' : '调查目的'}${!purposeOk && !populationOk ? '、' : ''}${populationOk ? '' : '调查对象'}尚未写明。`,
    fixIfMissing(...(purposeOk ? [] : ['design.purpose']), ...(populationOk ? [] : ['design.population'])));
  const sampling = sections.filter(s => s.node?.id === 'design.sampling');
  const samplingChars = sampling.flatMap(s => s.lines).join('').length;
  const samplingTable = sampling.some(s => (s.section.blocks ?? []).some(b => b.kind === 'table') || s.lines.some(l => isCaption(l) && l.startsWith('表')))
    || captions('表').some(l => /抽样|入样|样本分配/.test(l));
  add('sampling', 'design', '抽样设计文字记录', sampling.length ? (samplingChars > 0 ? 1 : 0) : null,
    `${sampling.length ? `抽样设计约 ${thousands(samplingChars)} 字` : '没有抽样设计小节'}；${samplingTable ? '有' : '缺少'}抽样框或入样单位表。`,
    [...fixIfMissing('design.sampling'), go('sampling')]);
  const samplingFormula = sampling.some(s => (s.section.blocks ?? []).some(b => b.kind === 'formula'))
    || blocks.some(b => b.kind === 'formula' && /n_\{?0\}?|\\frac\{[^}]*[zZ]/.test(b.text)) || /n_\{?0\}?\s*=/.test(latex);
  const sampleSizeMentioned = prose.some(l => /样本量/.test(l) && /公式|计算|置信|误差/.test(l));
  add('sampleSize', 'design', '样本量说明记录', samplingFormula || sampleSizeMentioned ? 1 : null,
    samplingFormula ? '样本量公式已排版，参数与设计需另行核验。' : sampleSizeMentioned ? '文中有样本量说明；是否需公式依研究设计决定。' : '未识别到样本量说明；对公开历史数据不强加调查样本量公式。', [go('sampling')]);
  const validCount = /有效(?:问卷|样本|回收)[^。；\n]{0,30}?[0-9０-９]+/u.test(proseText);
  const validRate = /有效(?:回收)?率[^。；\n]{0,20}?[0-9０-９]+(?:\.[0-9]+)?\s*[%％]/u.test(proseText);
  add('validRate', 'design', '回收量与有效率文字记录', validCount || validRate ? ((validCount ? 1 : 0) + (validRate ? 1 : 0)) / 2 : null,
    validCount && validRate ? '有效样本量与有效回收率均已报告。' : `${validCount ? '' : '有效样本量'}${!validCount && !validRate ? '、' : ''}${validRate ? '' : '有效回收率（百分比）'}尚未报告。`,
    [...fixIfMissing('data.cleaning'), go('analysis')]);
  const pilot = /(预调查|预调研|预测试)[^。\n]{0,60}?[0-9０-９]+/u.test(proseText) ? 1 : /预调查|预调研|预测试/.test(proseText) ? 0.5 : 0;
  add('pilot', 'design', '预调查文字记录', pilot || has('data.pilot') ? pilot : null, pilot === 1 ? '预调查及其样本量已说明。' : pilot ? '提到了预调查，但没有样本量或检验结果。' : '没有预调查的说明。', fixIfMissing('data.pilot'));
  const qcChars = written('design.qc');
  add('qualityControl', 'design', '质量控制文字记录', has('design.qc') ? (qcChars > 0 ? 1 : 0) : null,
    qcChars > 0 ? '已有质量控制文字；执行过程与处理日志需核对。' : '质量控制小节尚未撰写。', fixIfMissing('design.qc'));

  // 数据质量
  const CLEANING = [/注意力|甄别题|陷阱题|测谎/, /作答时长|答题时长|用时过短|作答时间/, /逻辑矛盾|前后矛盾|逻辑检验|逻辑校验/, /规律作答|直线作答|连续相同|同一选项/, /缺失值|缺失处理/];
  const rules = CLEANING.filter(re => re.test(proseText)).length;
  add('cleaning', 'data', '处理规则文字概览', null, `文字涉及 ${rules} 类处理规则；规则种类不计分，执行与否以实际处理记录核验。`, [...fixIfMissing('data.cleaning'), go('analysis')]);
  const alphaResults = usedResults.filter(r => r.method === 'alpha');
  const reliable = alphaResults.filter(r => r.receipt?.calculation?.scale && r.metrics.some(m => /α/.test(m.label) && m.value !== null));
  add('reliability', 'data', '信度计算记录', alphaResults.length ? share(reliable.length, alphaResults.length) : null,
    `${reliable.length} / ${alphaResults.length} 个已使用信度结果保留题项与计分设置；文字出现“信度”不作为已计算证明。`, [go('analysis')]);
  add('validity', 'data', '效度证据', null, '效度须结合测量设计与实际检验审阅；标题或 KMO、Bartlett 等方法名不作为执行证明。');
  const linked = evidenceBlocks.filter(b => usedResults.some(r => r.id === b.evidenceId));
  add('traceable', 'data', '图表结果引用', evidenceBlocks.length ? share(linked.length,evidenceBlocks.length) : null,
    `${linked.length} / ${evidenceBlocks.length} 个结构化图表块引用已登记结果；手写图表需另行核验来源。`, [go('analysis')]);
  const receipts = usedResults.filter(r => r.receipt?.calculation);
  add('denominators', 'data', '分母与计算参数', usedResults.length ? share(receipts.length,usedResults.length) : null,
    `${receipts.length} / ${usedResults.length} 个已使用结果保留变量、缺失设置、筛选、应答范围与有效计算口径。`, [go('analysis')]);

  // A method's name is descriptive metadata. Only registered structured results can show execution.
  const mentioned = METHODS.filter(([,re]) => re.test(methodText)).map(([name]) => name);
  const inferential = usedResults.filter(r => ['groups','crosstab','pearson','spearman'].includes(r.method));
  // A legitimate degenerate sample can have no defined test. Preserve and review that
  // receipt instead of incentivising fabricated p-values just to satisfy the checker.
  const withInference = inferential.filter(r => r.receipt && (r.receipt.inference || r.receipt.interpretation && r.warnings.length));
  add('tests', 'analysis', '推断结果与适用范围', inferential.length ? share(withInference.length,inferential.length) : null,
    `${withInference.length} / ${inferential.length} 个已使用推断结果保留检验回执或未定义时的样本、解释与提醒。`, [go('analysis')]);
  add('models', 'analysis', '方法文字提及', null, mentioned.length ? `文字提及${mentioned.join('、')}；方法名不证明运行，也不产生质量加分。` : '未识别到方法名；按研究需要选择方法，无须补齐模型种类。');
  add('formulas', 'analysis', '公式排版记录', null, `已排版 ${formulas} 个独立公式；是否需要公式由方法和读者需要决定。`);
  const diagnosed = inferential.filter(r => r.receipt?.interpretation && r.warnings.length && (!r.receipt.inference || r.receipt.inference.notes.length));
  add('diagnostics', 'analysis', '计算前提与限制记录', inferential.length ? share(diagnosed.length,inferential.length) : null,
    `${diagnosed.length} / ${inferential.length} 个已使用推断结果保留计算提醒与适用限制；记录存在不代表前提已满足。`);
  const numeric = paragraphs.filter(l => /[0-9０-９]/.test(l)).length;
  add('numeric', 'analysis', '数据陈述概览', null, `${Math.round(share(numeric,paragraphs.length)*100)}% 的段落含数字；数字密度不计分。`);
  add('methods', 'analysis', '方法可复算记录', usedResults.length ? share(receipts.length,usedResults.length) : null,
    `${receipts.length} / ${usedResults.length} 个已使用结果保留计算配置；方法数量不计分。`, [go('analysis')]);

  // 图表规范
  add('figureCount', 'figures', '图的数量', null, `正文识别到 ${figures} 幅图；数量不计分，按证据表达需要使用。`);
  add('tableCount', 'figures', '表的数量', null, `正文识别到 ${tables} 张表；数量不计分，避免重复同一证据。`);
  const titled = evidenceBlocks.filter(b => b.text.trim()).length;
  add('captions', 'figures', '图表有标题', evidenceBlocks.length ? share(titled, evidenceBlocks.length) : null, `${titled} / ${evidenceBlocks.length} 个图表块填写了标题。`);
  const references = exhibitReferences(proseText);
  add('figureReferences', 'figures', '正文引用图表', figures + tables ? (references ? 1 : 0) : null,
    `正文引用图表 ${references} 次，图表共 ${figures + tables} 个；每个图表都应在正文中被引用并解读。`);
  const lengths = paragraphs.map(l => l.length).sort((a, b) => a - b);
  const median = lengths.length ? (lengths[(lengths.length - 1) >> 1] + lengths[lengths.length >> 1]) / 2 : 0;
  const [low, high] = BENCHMARK_TARGETS.paragraphMedian;
  add('paragraphs', 'figures', '段落长度参考', null,
    `段落长度中位数 ${Math.round(median)} 字，建议 ${low}–${high} 字。`);

  // 结论可执行
  const findings = content.quality?.findings ?? [];
  const confirmed = findings.filter(f => content.quality && !findingNeedsReview(f,content.quality));
  add('findings', 'actions', '已确认的研究发现', findings.length ? share(confirmed.length,findings.length) : usedResults.length ? 0 : null, `${confirmed.length} / ${findings.length} 条发现已确认；不要求固定条数。`, [FINDINGS_FIX]);
  const actionable = confirmed.filter(f => f.action.trim()).length;
  add('findingActions', 'actions', '发现写明行动意义', confirmed.length ? share(actionable,confirmed.length) : null, `${actionable} / ${confirmed.length} 条已确认发现写明行动意义。`, [FINDINGS_FIX]);
  const recommendation = sections.filter(s => ['conclusion.suggestions', 'plan.measures', 'plan'].includes(s.node?.id ?? '') || /建议|措施|策略|对策/.test(stripHeadingNumber(s.section.title)))
    .flatMap(s => s.lines).join('\n');
  const actor = /负责|牵头|执行主体|主办方|运营方|部门|学校|高校|政府|企业|平台|社区|协会|委员会|团队/.test(recommendation);
  const metric = /评估|考核|监测|指标|目标值|KPI|复盘|跟踪/.test(recommendation);
  add('executable', 'actions', '建议有执行主体与评估指标', ((actor ? 1 : 0) + (metric ? 1 : 0)) / 2,
    !recommendation ? '还没有写出对策建议。' : `${actor ? '写明' : '缺少'}执行主体，${metric ? '写明' : '缺少'}评估指标。`, fixIfMissing('conclusion.suggestions'));
  const limits = /局限|不足之处|研究不足|适用边界|外推|未来研究|研究展望/.test(proseText);
  add('limitations', 'actions', '说明研究局限', limits ? 1 : 0, limits ? '说明了研究局限或适用边界。' : '没有说明样本、测量或方法上的局限。', fixIfMissing('conclusion.limits'));
  const causal = paragraphs.filter(l => /相关|关联/.test(l) && /导致|造成|决定了|引起了|使得/.test(l));
  add('causal', 'actions', '相关不写成因果', prose.length ? (causal.length === 0 ? 1 : causal.length === 1 ? 0.5 : 0) : null,
    causal.length ? `${causal.length} 段在相关性结果旁使用了因果措辞，如「${causal[0].slice(0, 24)}…」。` : '没有发现把相关写成因果的措辞。');

  // 合规披露
  appendixCheck('aiDisclosure', 'compliance', 'AI 工具使用说明', /人工智能|AI|大模型|生成式/i, '附录中没有 AI 工具使用说明。', [], ['appendix.ai']);
  // A structured record is complete when it has every item its type requires; a typed line needs its GB/T 7714 type code.
  const formatted = structured.length ? structured.filter(e => e.type === 'other' ? GBT_TYPE.test(e.text) : !referenceProblems(e).length).length : referenceEntries.filter(l => GBT_TYPE.test(l)).length;
  add('referenceFormat', 'compliance', '文献著录格式', referenceEntries.length ? share(formatted, referenceEntries.length) : null,
    structured.length ? `${formatted} / ${structured.length} 条文献按 GB/T 7714 著录完整，其余缺少作者、年份、出版者等必备项。` : `${formatted} / ${referenceEntries.length} 条文献带有 GB/T 7714 文献类型标识，如 [J]、[M]、[EB/OL]。`);
  // Under the numeric system every listed reference is cited at least once: count the distinct numbers cited, ranges included.
  const citedNumbers = new Set((proseText.match(CITATION) ?? []).flatMap(mark => mark.replace(/[[\]［］\s]/gu, '').split(/[,，、]/u).flatMap(part => {
    const [a, b] = part.split(/[-–—]/u).map(Number);
    return Number.isInteger(a) && Number.isInteger(b) && b >= a && b - a < 500 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Number.isInteger(a) ? [a] : [];
  })));
  const listed = referenceEntries.length, covered = structured.length ? structured.length - referenceNumbers(content).uncited.length : [...citedNumbers].filter(n => n >= 1 && n <= listed).length;
  add('citations', 'compliance', '文献均在正文引用', listed ? covered / listed : citedNumbers.size || /\[\[引:/.test(proseText) ? 0 : null,
    listed ? `参考文献 ${listed} 条，正文引用了其中 ${covered} 条；顺序编码制下每条文献都应在正文中被引用。` : citedNumbers.size ? '正文有文献序号标注，但没有参考文献列表。' : '还没有参考文献。');
  const simulated = usedResults.filter(r => r.classification === 'simulated');
  const declared = /模拟/.test(content.subtitle + content.title) || body.every(s => !(s.section.blocks ?? []).some(b => simulated.some(r => r.id === b.evidenceId)) || /【教学模拟数据/.test(s.section.body + s.section.source));
  add('simulated', 'compliance', '模拟数据已声明', simulated.length ? (declared ? 1 : 0) : null,
    simulated.length ? (declared ? '使用模拟数据的章节均已声明。' : '有章节使用了模拟数据结果但没有声明，不能作为实际调查结论。') : '没有使用模拟数据。');
  appendixCheck('reproducible', 'compliance', '数据与代码说明', /数据|代码|可复现|程序/, '附录中没有数据或代码说明。', [], ['appendix.data', 'appendix.code']);

  const dimensions = (Object.keys(BENCHMARK_DIMENSIONS) as BenchmarkDimension[]).map(id => {
    const own = checks.filter(c => c.dimension === id && c.status !== 'na');
    return { id, label: BENCHMARK_DIMENSIONS[id], score: own.length ? own.reduce((sum, c) => sum + c.score, 0) / own.length : null, passed: own.filter(c => c.status === 'pass').length, total: own.length };
  });
  const scored = dimensions.filter(d => d.score !== null);
  return { score: scored.length ? Math.round(scored.reduce((sum, d) => sum + d.score!, 0) / scored.length * 100) : 0, dimensions, checks };
}
