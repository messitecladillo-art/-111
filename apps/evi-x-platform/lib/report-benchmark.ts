/**
 * A deterministic health check of a report against the blueprint. It inspects structure and how evidence
 * is presented, never whether the research itself is right. Full-credit lines sit at roughly sixty per cent
 * of the statistics of a well-reviewed competition report: about 33 thousand characters of body prose,
 * 39 figures, 23 tables, 23 display formulas, and data in 57 % of its paragraphs.
 */
import type { EditorContent, ReportSection } from './editor-model.ts';
import { reportHeadingLevel, reportPart, type ReportPart } from './report-format.ts';
import { BLUEPRINT_MODULE_LABELS, blueprintNode, matchBlueprintNode, stripHeadingNumber, type BlueprintModule, type BlueprintNode } from './report-blueprint.ts';

export const BENCHMARK_DIMENSIONS = {
  structure: '结构完整', design: '方案严谨', data: '数据质量', analysis: '分析深度',
  figures: '图表规范', actions: '结论可执行', compliance: '合规披露',
} as const;
export type BenchmarkDimension = keyof typeof BENCHMARK_DIMENSIONS;
export type BenchmarkFix = { label: string; insert?: string; module?: BlueprintModule; findings?: true };
export type BenchmarkStatus = 'pass' | 'partial' | 'fail' | 'na';
export type BenchmarkCheck = { id: string; dimension: BenchmarkDimension; label: string; status: BenchmarkStatus; score: number; detail: string; fixes: BenchmarkFix[] };
export type BenchmarkResult = {
  score: number;
  dimensions: { id: BenchmarkDimension; label: string; score: number; passed: number; total: number }[];
  checks: BenchmarkCheck[];
};
export const BENCHMARK_TARGETS = {
  abstract: [800, 2000], keywords: [3, 8], bodyChars: 25000, figures: 25, tables: 15, formulas: 12,
  references: 10, citations: 5, numericShare: 0.4, paragraphMedian: [60, 180], referenceShare: 0.6, methods: 4, findings: 3,
} as const;

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
const FIGURE_REFERENCE = /(?:^|[\s，。；：、（(“"如见由据从在和与及即照详合])(?:图|表)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)?/gu;
const FIGURE_TOKEN = /\[\[(?:图|表):[^\]\n]+\]\]/gu;
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
];
/** Registered analysis results name their method; map it onto the same vocabulary. */
const RESULT_METHODS: Record<string, string> = { crosstab: '卡方检验', groups: '组间差异检验', pearson: '相关分析', spearman: '相关分析' };

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
  add('abstract', 'structure', '摘要篇幅', !abstract ? 0 : abstractChars < abstractMin ? abstractChars / abstractMin : abstractChars > abstractMax ? 0.7 : 1,
    !abstract ? '没有摘要章节。' : `摘要约 ${thousands(abstractChars)} 字，建议 ${abstractMin}–${abstractMax} 字。`, fixIfMissing('abstract'));
  const keywords = keywordLine ? keywordLine.replace(/^关键词[:：]\s*/, '').split(/[、，,；;\s]+/).filter(Boolean) : [];
  const [kwMin, kwMax] = BENCHMARK_TARGETS.keywords;
  add('keywords', 'structure', '关键词', !keywords.length ? 0 : keywords.length < kwMin || keywords.length > kwMax ? 0.5 : 1,
    keywordLine ? `关键词 ${keywords.length} 个，建议 ${kwMin}–${kwMax} 个。` : '摘要末尾缺少以“关键词：”开头的一行。', fixIfMissing('abstract'));
  const core = ['intro', 'design', 'data', 'conclusion'];
  const missingCore = core.filter(id => !has(id));
  const analysisChapters = ['secondary', 'sample', 'drivers', 'diagnosis', 'plan'].filter(has);
  add('chapters', 'structure', '主体章节齐全', (core.length - missingCore.length + Math.min(2, analysisChapters.length) / 2) / (core.length + 1),
    [missingCore.length ? `缺少：${missingCore.map(id => blueprintNode(id).title).join('、')}。` : '研究简介、调查方案、数据检验、结论建议齐全。',
      `分析类章节 ${analysisChapters.length} 个，至少 2 个。`].join(''),
    [...missingCore.map(insert), ...(analysisChapters.length < 2 ? ['sample', 'drivers', 'diagnosis'].filter(id => !has(id)).slice(0, 2 - analysisChapters.length).map(insert) : [])]);
  const bodyChars = prose.join('').length;
  add('length', 'structure', '正文篇幅', bodyChars / BENCHMARK_TARGETS.bodyChars, `正文论述约 ${thousands(bodyChars)} 字，满分线 ${thousands(BENCHMARK_TARGETS.bodyChars)} 字。`);
  // Chapter headings may stand alone; every other section needs written text or an evidence block.
  const writable = sections.filter(s => !(s.part === 'body' && reportHeadingLevel(s.section.title) === 1));
  const hinted = new Set(content.report.filter(s => HINT.test(s.body) || (s.blocks ?? []).some(b => HINT.test(b.text))).map(s => s.id));
  const unwritten = writable.filter(s => hinted.has(s.section.id) || (!s.lines.length && !(s.section.blocks ?? []).some(b => b.kind !== 'paragraph'))).map(s => s.section);
  add('unwritten', 'structure', '各节均已撰写', unwritten.length ? Math.max(0, 1 - unwritten.length / Math.max(1, writable.length)) * 0.9 : 1,
    unwritten.length ? `${unwritten.length} 节尚未撰写${hinted.size ? `（其中 ${hinted.size} 节仍是写作提示）` : ''}，首个是「${unwritten[0].title || '未命名章节'}」。` : '各节都已有正文。');
  const referenceEntries = sections.filter(s => s.part === 'references').flatMap(s => s.lines);
  add('references', 'structure', '参考文献数量', referenceEntries.length / BENCHMARK_TARGETS.references,
    `参考文献 ${referenceEntries.length} 条，满分线 ${BENCHMARK_TARGETS.references} 条。`, fixIfMissing('references'));
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
  const purposeOk = written('design.purpose') >= 40 || prose.some(l => /调查目的/.test(l));
  const populationOk = written('design.population') >= 40 || prose.some(l => /调查对象|目标总体|调查总体/.test(l));
  add('objectives', 'design', '调查目的与对象', ((purposeOk ? 1 : 0) + (populationOk ? 1 : 0)) / 2,
    purposeOk && populationOk ? '调查目的与对象均已说明。' : `${purposeOk ? '' : '调查目的'}${!purposeOk && !populationOk ? '、' : ''}${populationOk ? '' : '调查对象'}尚未写明。`,
    fixIfMissing(...(purposeOk ? [] : ['design.purpose']), ...(populationOk ? [] : ['design.population'])));
  const sampling = sections.filter(s => s.node?.id === 'design.sampling');
  const samplingChars = sampling.flatMap(s => s.lines).join('').length;
  const samplingTable = sampling.some(s => (s.section.blocks ?? []).some(b => b.kind === 'table') || s.lines.some(l => isCaption(l) && l.startsWith('表')))
    || captions('表').some(l => /抽样|入样|样本分配/.test(l));
  add('sampling', 'design', '抽样设计与抽样框表', (samplingChars >= 200 ? 0.5 : samplingChars > 0 ? 0.25 : 0) + (samplingTable ? 0.5 : 0),
    `${sampling.length ? `抽样设计约 ${thousands(samplingChars)} 字` : '没有抽样设计小节'}；${samplingTable ? '有' : '缺少'}抽样框或入样单位表。`,
    [...fixIfMissing('design.sampling'), go('sampling')]);
  const samplingFormula = sampling.some(s => (s.section.blocks ?? []).some(b => b.kind === 'formula'))
    || blocks.some(b => b.kind === 'formula' && /n_\{?0\}?|\\frac\{[^}]*[zZ]/.test(b.text)) || /n_\{?0\}?\s*=/.test(latex);
  const sampleSizeMentioned = prose.some(l => /样本量/.test(l) && /公式|计算|置信|误差/.test(l));
  add('sampleSize', 'design', '样本量公式', samplingFormula ? 1 : sampleSizeMentioned ? 0.5 : 0,
    samplingFormula ? '样本量公式已排版。' : sampleSizeMentioned ? '文中说明了样本量，但没有排版公式。' : '没有样本量公式与参数取值。', [go('sampling')]);
  const validCount = /有效(?:问卷|样本|回收)[^。；\n]{0,30}?[0-9０-９]+/u.test(proseText);
  const validRate = /有效(?:回收)?率[^。；\n]{0,20}?[0-9０-９]+(?:\.[0-9]+)?\s*[%％]/u.test(proseText);
  add('validRate', 'design', '回收量与有效率', ((validCount ? 1 : 0) + (validRate ? 1 : 0)) / 2,
    validCount && validRate ? '有效样本量与有效回收率均已报告。' : `${validCount ? '' : '有效样本量'}${!validCount && !validRate ? '、' : ''}${validRate ? '' : '有效回收率（百分比）'}尚未报告。`,
    [...fixIfMissing('data.cleaning'), go('analysis')]);
  const pilot = /(预调查|预调研|预测试)[^。\n]{0,60}?[0-9０-９]+/u.test(proseText) ? 1 : /预调查|预调研|预测试/.test(proseText) ? 0.5 : 0;
  add('pilot', 'design', '预调查', pilot, pilot === 1 ? '预调查及其样本量已说明。' : pilot ? '提到了预调查，但没有样本量或检验结果。' : '没有预调查的说明。', fixIfMissing('data.pilot'));
  const qcChars = written('design.qc');
  add('qualityControl', 'design', '质量控制措施', qcChars >= 150 ? 1 : qcChars > 0 || /质量控制/.test(proseText) ? 0.5 : 0,
    qcChars >= 150 ? '质量控制措施已分环节说明。' : '质量控制措施偏少，建议按设计、实施、录入、清洗分环节写。', fixIfMissing('design.qc'));

  // 数据质量
  const CLEANING = [/注意力|甄别题|陷阱题|测谎/, /作答时长|答题时长|用时过短|作答时间/, /逻辑矛盾|前后矛盾|逻辑检验|逻辑校验/, /规律作答|直线作答|连续相同|同一选项/, /缺失值|缺失处理/];
  const rules = CLEANING.filter(re => re.test(proseText)).length;
  add('cleaning', 'data', '清洗与剔除规则', rules >= 2 ? 1 : rules ? 0.5 : 0, `写明了 ${rules} 类剔除或处理规则，至少 2 类。`, [...fixIfMissing('data.cleaning'), go('analysis')]);
  const reportedNumber = (head: string) => new RegExp(`(?:${head})[^。\\n]{0,80}?[0-9]\\.[0-9]+`, 'iu');
  const reliable = reportedNumber('Cronbach|克隆巴赫|α\\s*系数|信度').test(proseText) || usedResults.some(r => /信度|α/.test(r.title)) || captions('表').some(l => /信度/.test(l));
  add('reliability', 'data', '信度检验', reliable ? 1 : /信度/.test(proseText) ? 0.5 : 0, reliable ? '已报告信度系数。' : '没有报告 Cronbach α 等信度系数。', [...fixIfMissing('data.testing'), go('analysis')]);
  const valid = reportedNumber('KMO|Bartlett|巴特利特|结构效度|效度').test(proseText) || usedResults.some(r => /效度|KMO/.test(r.title)) || captions('表').some(l => /效度|KMO/.test(l));
  add('validity', 'data', '效度检验', valid ? 1 : /效度/.test(proseText) ? 0.5 : 0, valid ? '已报告效度检验结果。' : '没有报告 KMO 值、Bartlett 球形检验等效度证据。', [...fixIfMissing('data.testing'), go('analysis')]);
  add('traceable', 'data', '图表可溯源', figures + tables ? share(evidenceBlocks.length, figures + tables) / 0.5 : null,
    `${evidenceBlocks.length} / ${figures + tables} 个图表来自已登记的分析结果，至少一半。`, [go('analysis')]);

  // 分析深度
  const used = new Set(METHODS.filter(([, re]) => re.test(methodText)).map(([name]) => name));
  for (const r of usedResults) if (RESULT_METHODS[r.method]) used.add(RESULT_METHODS[r.method]);
  const kindOf = (name: string) => METHODS.find(([n]) => n === name)?.[2] ?? 'test';
  const tests = [...used].filter(name => kindOf(name) === 'test'), models = [...used].filter(name => kindOf(name) === 'model');
  add('tests', 'analysis', '推断检验', tests.length ? 1 : 0, tests.length ? `使用了${tests.join('、')}。` : '没有差异检验或相关分析。', [go('analysis')]);
  add('models', 'analysis', '模型分析', models.length ? 1 : 0, models.length ? `使用了${models.join('、')}。` : '没有回归、聚类、IPA、AHP 等模型。', [go('analysis')]);
  add('formulas', 'analysis', '公式排版', formulas / BENCHMARK_TARGETS.formulas, `${formulas} 个独立公式，满分线 ${BENCHMARK_TARGETS.formulas} 个；每个模型都应写出公式。`);
  const diagnosed = /诊断|残差|共线|VIF|轮廓系数|一致性检验|一致性比率|拟合优度|伪\s*R|R\s*[²2]|似然比|Hosmer|稳健性|适用条件|前提假设|正态性|方差齐性/i.test(proseText);
  add('diagnostics', 'analysis', '模型检验与适用条件', diagnosed ? 1 : 0, diagnosed ? '说明了模型检验或适用条件。' : '没有说明模型诊断、拟合优度或检验的适用条件。');
  const numeric = paragraphs.filter(l => /[0-9０-９]/.test(l)).length;
  add('numeric', 'analysis', '论述有数据支撑', paragraphs.length >= 10 ? share(numeric, paragraphs.length) / BENCHMARK_TARGETS.numericShare : null,
    `${Math.round(share(numeric, paragraphs.length) * 100)}% 的段落含具体数据，满分线 ${BENCHMARK_TARGETS.numericShare * 100}%。`);
  add('methods', 'analysis', '多方法互证', used.size / BENCHMARK_TARGETS.methods, `用到 ${used.size} 种方法，满分线 ${BENCHMARK_TARGETS.methods} 种。`, [go('analysis')]);

  // 图表规范
  add('figureCount', 'figures', '图的数量', figures / BENCHMARK_TARGETS.figures, `正文 ${figures} 幅图，满分线 ${BENCHMARK_TARGETS.figures} 幅。`, [go('analysis')]);
  add('tableCount', 'figures', '表的数量', tables / BENCHMARK_TARGETS.tables, `正文 ${tables} 张表，满分线 ${BENCHMARK_TARGETS.tables} 张。`, [go('analysis')]);
  const titled = evidenceBlocks.filter(b => b.text.trim()).length;
  add('captions', 'figures', '图表有标题', evidenceBlocks.length ? share(titled, evidenceBlocks.length) : null, `${titled} / ${evidenceBlocks.length} 个图表块填写了标题。`);
  const references = count(FIGURE_REFERENCE, proseText) + count(FIGURE_TOKEN, proseText);
  add('figureReferences', 'figures', '正文引用图表', figures + tables ? references / (BENCHMARK_TARGETS.referenceShare * (figures + tables)) : null,
    `正文引用图表 ${references} 次，图表共 ${figures + tables} 个；每个图表都应在正文中被引用并解读。`);
  const lengths = paragraphs.map(l => l.length).sort((a, b) => a - b);
  const median = lengths.length ? (lengths[(lengths.length - 1) >> 1] + lengths[lengths.length >> 1]) / 2 : 0;
  const [low, high] = BENCHMARK_TARGETS.paragraphMedian;
  add('paragraphs', 'figures', '段落长度适中', lengths.length >= 10 ? (median < low ? median / low : median > high ? high / median : 1) : null,
    `段落长度中位数 ${Math.round(median)} 字，建议 ${low}–${high} 字。`);

  // 结论可执行
  const findings = content.quality?.findings ?? [];
  const confirmed = findings.filter(f => f.status === 'confirmed');
  add('findings', 'actions', '已确认的研究发现', confirmed.length / BENCHMARK_TARGETS.findings, `已确认 ${confirmed.length} 条发现，至少 ${BENCHMARK_TARGETS.findings} 条。`, [FINDINGS_FIX]);
  const actionable = confirmed.filter(f => f.action.trim()).length;
  add('findingActions', 'actions', '发现写明行动意义', actionable / BENCHMARK_TARGETS.findings, `${actionable} 条已确认发现写明了行动意义，至少 ${BENCHMARK_TARGETS.findings} 条。`, [FINDINGS_FIX]);
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
  const formatted = referenceEntries.filter(l => GBT_TYPE.test(l)).length;
  add('referenceFormat', 'compliance', '文献著录格式', referenceEntries.length ? share(formatted, referenceEntries.length) / 0.8 : null,
    `${formatted} / ${referenceEntries.length} 条文献带有 GB/T 7714 文献类型标识，如 [J]、[M]、[EB/OL]。`);
  const cited = count(CITATION, proseText);
  add('citations', 'compliance', '正文标注引用', cited / BENCHMARK_TARGETS.citations, `正文有 ${cited} 处文献序号标注，满分线 ${BENCHMARK_TARGETS.citations} 处。`);
  const simulated = usedResults.filter(r => r.classification === 'simulated');
  const declared = /模拟/.test(content.subtitle + content.title) || body.every(s => !(s.section.blocks ?? []).some(b => simulated.some(r => r.id === b.evidenceId)) || /【教学模拟数据/.test(s.section.body + s.section.source));
  add('simulated', 'compliance', '模拟数据已声明', simulated.length ? (declared ? 1 : 0) : null,
    simulated.length ? (declared ? '使用模拟数据的章节均已声明。' : '有章节使用了模拟数据结果但没有声明，不能作为实际调查结论。') : '没有使用模拟数据。');
  appendixCheck('reproducible', 'compliance', '数据与代码说明', /数据|代码|可复现|程序/, '附录中没有数据或代码说明。', [], ['appendix.data', 'appendix.code']);

  const dimensions = (Object.keys(BENCHMARK_DIMENSIONS) as BenchmarkDimension[]).map(id => {
    const own = checks.filter(c => c.dimension === id && c.status !== 'na');
    return { id, label: BENCHMARK_DIMENSIONS[id], score: own.length ? own.reduce((sum, c) => sum + c.score, 0) / own.length : 1, passed: own.filter(c => c.status === 'pass').length, total: own.length };
  });
  return { score: Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length * 100), dimensions, checks };
}
