/**
 * 全报告 V2 自然学术数字核验与句级外科手术脱水器（Numeric & Entity Alignment Verifier）
 *
 * 核心能力：
 * 1. 双轨兼容：同时支持受控占位符 `{F编号}` / `{G编号}` / `{R编号}` 与自然学术直写数字
 *    （如 `Q1–Q32`、`$R^2=0.482$`、`$95\%$`、`$p<0.001$`、三线表实测值及同表合法派生运算）；
 * 2. 同表算术推导池：自动允许同一登记表内的和（Top-2/Top-3 合并占比、互补占比 `100%-p`）、
 *    百分点差值/均值差（`|a-b|`）、比值（`a/b`）、优势变动百分比（`|OR-1|*100%`）以及小数—百分比互转
 *    （`0.482 <-> 48.2%`），容差严格执行 `max(0.5 * ulp, 0.015)`；
 * 3. 语境化非统计豁免：精准豁免题号 `Q1..Q40`、潜因子/研究问题/编码号 `F1..F6`/`RQ1..9`/`H1..12`/`A1..9`、
 *    序数词、李克特 `1–5` 量表级次、紧邻阈值术语时的统计常规截断值（`0.05/0.01/0.001/0.6/0.7/0.8/1/5/10/95%` 等）、
 *    国家标准号 `GB/T 7714—2015` 及文献引用年份；
 * 4. 行—实体对齐门禁（Row-Entity Alignment）：建立跨表实体数值归属索引，拦截把 B 组/B 行的数字张冠李戴安在 A 组/A 行名下的语义错配；
 * 5. 防误读与诚实性守卫：拦截 OR 概率倍数误读、未登记模型越界声称、模拟模式真人田野伪造及计划模式超前声称；
 * 6. 句级外科手术剔除（Surgical Sentence Excision）：仅精准切除违规单句并记录原因，保留同段其余合规学术句子，告别“一字误杀整段”。
 */

import type { EditorContent } from '../editor-model.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { matchBlueprintNode } from '../report-blueprint.ts';
import type { ResultSnapshot } from '../research-quality.ts';
import type { Fact } from './draft.ts';
import { AI_CLICHE_RULES } from './interview-corpus-deai.ts';
import { collectPreservedResultNotes, inferResultNode } from './storyline-brief.ts';

export type VerifierResearchMode = 'plan' | 'demonstration' | 'empirical';

export type VerifierTokenMap = {
  facts: Fact[];
  exhibits: { id: string; text: string; value: string }[];
  references: { id: string; text: string; value: string }[];
};

export type V2VerifierContext = {
  methods: readonly string[];
  registeredMethods?: readonly string[];
  planSection: boolean;
  pending?: boolean;
  labels?: readonly string[];
  mode?: VerifierResearchMode;
  pilotPending?: boolean;
  screening?: readonly string[];
  duplicatesMarked?: boolean;
  nodeId?: string;
  results?: readonly ResultSnapshot[];
  design?: Questionnaire | null;
  content?: EditorContent | null;
  preservedNotes?: ReadonlyMap<string, readonly string[]>;
};

export type VerifiedV2Section = {
  paragraphs: string[];
  drafts: string[];
  droppedParagraphs: number;
  droppedSentences: number;
  dropReasons: string[];
  flaggedSentences: { sentence: string; reason: string }[];
  citedFacts: string[];
  citedExhibits: string[];
  citedReferences: string[];
};

const PLACEHOLDER_RE = /\{(F[1-9][0-9]{0,2}|G[1-9][0-9]?|R[1-9][0-9]?)\}/gu;
const CN_NUMERAL = '[零〇一二两三四五六七八九十百千万]';
const CN_QUANTITY_V2 = new RegExp(
  `${CN_NUMERAL}+点[零〇一二三四五六七八九]+|百分之(?!九十[五九]\\s*置信|百)${CN_NUMERAL}+|${CN_NUMERAL}+\\s*(?:倍|个百分点)|[一二两三四五六七八九]成(?=以上|左右|多|的|受访|样本|用户|居民|学生|群体)`,
  'u',
);

const V2_ANALYSIS_CLAIMS: readonly { name: string; words: RegExp; methods: RegExp }[] = [
  {
    name: '回归或 Logit 模型',
    words: /回归(?:模型|分析|系数|方程|结果)|[Ll]ogit|[Ll]ogistic|[Pp]robit|优势比|比值比|发生比|(?<![A-Za-z])OR(?![A-Za-z])|边际效应|方差膨胀|VIF|共线性|平行线假定|伪\s*R|McFadden/u,
    methods: /regress|logit|logistic|probit|ols/iu,
  },
  {
    name: '因子分析或 KMO 检验',
    words: /因子分析|因子载荷|公因子|KMO|Bartlett|球形检验|主成分/iu,
    methods: /factor|kmo|efa|cfa|pca|validity/iu,
  },
  {
    name: '聚类分析',
    words: /聚类|K-?means|轮廓系数/iu,
    methods: /cluster|kmeans/iu,
  },
  {
    name: 'KANO 需求模型',
    words: /\bKANO\b|Better[-–—\s]*Worse|魅力型需求|必备型需求|期望型需求/iu,
    methods: /kano/iu,
  },
  {
    name: '结构方程模型',
    words: /结构方程|\bSEM\b|RMSEA|\bCFI\b|\bTLI\b|\bSRMR\b/u,
    methods: /sem|cfa|path/iu,
  },
  {
    name: '树模型或 SHAP 归因',
    words: /随机森林|XGBoost|LightGBM|GBDT|\bSHAP\b/iu,
    methods: /rf|xgb|lgb|gbdt|tree|forest|shap/iu,
  },
];

const PLANNED_CUE = /(?<!模)拟(?!合)|计划|将(?:采用|构建|估计|报告|检验|开展|引入)|尚未登记|待(?:估计|补|登记|完成|验证)|后续可/u;
const FACT_AS_EXHIBIT = /(?:见|参见|详见|参照)\s*[（(]?\s*\{F\d+\}|\{F\d+\}\s*所(?:示|载|列|述|绘|给出)/u;
const PROBABILITY_MULTIPLE_CLAIM = /(?:概率|可能性|几率)[^。；！？\n]{0,16}?(?:是|为|提高|增加|高出|达到|翻|变为)[^。；！？\n]{0,14}?(?:[0-9０-９.]+|\{F\d+\})\s*倍/u;
const OR_CONTEXT_CUE = /\bOR\b|优势比|发生比|比值比|[Ll]ogistic|[Ll]ogit/u;
const NEGATED_OR_PROB = /(?:不是|并非|不等于|不等同于?|不能写成|切勿写成|不可读作)[^。；\n]{0,16}(?:概率|可能性|几率)/u;

const COMPLETED_RECRUITMENT = /(?:本次|此次|实际|本研究的?)(?:正式)?(?:调查|招募|发放|回收)(?:的方式)?\s*(?:已|采用|使用|通过|采取|系|为)[^。！？；]{0,45}(?:线上|线下|公开链接|受访者|自愿作答|招募渠道)|(?:线上公开链接|线下拦截|现场招募|自愿作答)[^。！？；]{0,30}(?:是|为)主要(?:触达|招募|发放|回收)方式/u;
const RECRUITMENT_CHANNEL = /(?:通过|采用|经由)(?:[^，。！？；]{0,12})(?:线上|线下|公开链接|微信群|现场)[^，。！？；]{0,24}(?:发放|投放|招募|回收)/u;
const COMPLETED_PILOT = /(?:本次|此次)?(?:预调查|预调研|预测试)(?:的?(?:对象|样本|结果))?\s*(?:已经|已|按|对[^。！？；]{0,35}(?:计算|筛查|进行了)|与[^。！？；]{0,20}一致|属于|形成)|经此环节[^。！？；]{0,35}得到[^。！？；]{0,15}(?:初步)?检验/u;
const SCREENING_RULES = [/时长|答题时间/u, /逻辑一致|逻辑矛盾|逻辑校验/u, /反向题[^。！？；]{0,15}(?:一致|矛盾)|反向题与正问/u];
const FUTURE_FIELDWORK = /后续|(?<!模)拟(?!合)|计划|建议|将(?:采用|通过|进行|开展|安排|按|发放|招募)|(?:预调查|预调研|预测试)(?:完成|形成)后/u;
const COMPLETION_CUE = /已经|已(?:按|通过|使用|完成|实施|回收|发放|剔除|形成|获得|进行|开展)|过后|结果(?:显示|表明)/u;
const DUPLICATE_ANSWER = /答案(?:完全)?重复|重复答案|重复答卷/u;

function tidyBoundComparisons(text: string): string {
  return text
    .replace(/(小于|低于|不足|不到)\s*[<＜]\s*/gu, '$1')
    .replace(/(大于|高于|超过)\s*[>＞]\s*/gu, '$1')
    .replace(/(均为|均是|为|是)\s*[<＜]\s*(?=\d)/gu, (_, word: string) => (word.startsWith('均') ? '均小于' : '小于'))
    .replace(/([<＜>＞])\s*\1/gu, '$1')
    .replace(/[=＝]\s*([<＜>＞])/gu, '$1');
}

/**
 * 清理 `{G编号}` 与 `{F编号}` 展开后的粘连语病：
 * 1. 消除 `信度表[[表:...]]` -> `信度[[表:...]]`（渲染为 `信度表 3-8` 而非 `信度表表 3-8`）、`碎石图[[图:...]]` -> `碎石[[图:...]]`；
 * 2. 防止把样本量裸整数直接粘连在中文名词后（如 `按模拟决策矩阵619安排` -> `按模拟决策矩阵安排`）。
 */
export function sanitizeV2Paragraph(text: string): string {
  return tidyBoundComparisons(text)
    .replace(/(?<![代发列])表\s*(\[\[表:)/gu, '$1')
    .replace(/(?<![试意蓝版地])图\s*(\[\[图:)/gu, '$1')
    .replace(/(?<![方模正格范形仪公定])式\s*(\[\[式:)/gu, '$1')
    .replace(/(矩阵|方案|模型|台账|框架|清单|路线|图谱|量表|表|图)\d{2,6}(?![-–—.0-9%％份人名例道题项条个类维种天周月年次元分步级届)）\]])/gu, '$1')
    .replace(/(\d+(?:\.\d+)?%?)(\s*[份人名例个项条次天分]?)\s*[（(]\s*(?:[nN]\s*=\s*)?\1\s*[份人名例个项条次天分]?\s*[)）]/gu, '$1$2')
    .replace(/严禁将[^。；！？!?\n]{0,40}绘制成饼图/gu, '')
    .replace(/(?:该结果|上述结果|本结果|统计结果|模型结果|指纹|哈希)?[^，,；;。！？!?\n]{0,12}不证明[^。；！？!?\n]{0,36}获奖水平/gu, '')
    .replace(/不要只为提高[^。；！？!?\n]{0,28}删除题项/gu, '')
    .replace(/超出计分范围\s*0\s*行/gu, '')
    .replace(/多选题须先按选项拆列[^。；！？!?\n]{0,32}/gu, '')
    .replace(/(?:\\alpha|α|Cronbach)\s*不证明[^。；！？!?\n]{0,36}/giu, '')
    .replace(/当前产物为草稿[^。！？!?\n]*/gu, '')
    .replace(/分别登记于\s*\d+\s*[、，,和与]\s*\d+(?![0-9.%％份人名例项条个类维页节章])/gu, '')
    .replace(/([，,；;。])\s*[，,；;]+/gu, '$1')
    .replace(/[，,；;]\s*([。！？!?])/gu, '$1')
    .replace(/[，,；;]+$/u, '。')
    .replace(/^[\s，,；;、]+/u, '')
    .trim();
}

function cleanAcademicCliches(text: string): string {
  let out = text.trim();
  for (const rule of AI_CLICHE_RULES) {
    out = out.replace(rule.pattern, rule.academicSub);
  }
  return out
    .replace(/([，,；;。])\s*[，,]/gu, '$1')
    .replace(/^[\s，,、]+/u, '')
    .trim();
}

export function decimalUlp(numText: string): number {
  const clean = numText.replace(/^[<>≤≥−+-]+/u, '').replace(/[%％*]+$/u, '').trim();
  const dot = clean.indexOf('.');
  if (dot < 0) return 0;
  const places = clean.length - dot - 1;
  return places > 0 ? 10 ** -places : 0;
}

type NumericEntry = {
  value: number;
  ulp: number;
  isPercent: boolean;
  isIntegerCount: boolean;
};

type EntityOwnershipIndex = {
  /** Sorted longest-first entity names */
  entities: string[];
  /** Values legitimately owned by an entity across all tables */
  ownByEntity: Map<string, NumericEntry[]>;
  /** Sibling values from the SAME table(s) that do NOT belong to this entity: value -> siblingName */
  siblingByEntity: Map<string, { entry: NumericEntry; sibling: string }[]>;
};

function parseNumbersFromCell(rawCell: string | number | null, header = ''): NumericEntry[] {
  if (rawCell === null || rawCell === undefined) return [];
  const headerPct = /[%％]|占比|比例|普及率|有效率|贡献率/u.test(header);
  if (typeof rawCell === 'number') {
    if (!Number.isFinite(rawCell)) return [];
    const str = Number.isInteger(rawCell) ? String(rawCell) : String(Number(rawCell.toFixed(4)));
    return [{
      value: rawCell,
      ulp: Number.isInteger(rawCell) ? 0 : decimalUlp(str),
      isPercent: headerPct,
      isIntegerCount: Number.isInteger(rawCell) && !headerPct,
    }];
  }
  const text = String(rawCell).replace(/−/gu, '-').trim();
  if (!text || /^[—–-]+$/u.test(text)) return [];
  const out: NumericEntry[] = [];
  for (const m of text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*([%％])?/gu)) {
    const numStr = m[1];
    const val = Number(numStr);
    if (!Number.isFinite(val)) continue;
    const isPct = Boolean(m[2]) || (headerPct && !text.includes('('));
    out.push({
      value: val,
      ulp: decimalUlp(numStr),
      isPercent: isPct,
      isIntegerCount: !numStr.includes('.') && !isPct,
    });
  }
  return out;
}

/**
 * 判断散文中的候选数字是否与登记/派生数字在 `max(0.5*ulp, 0.015)` 容差（及 `0.482 <-> 48.2%` 等价转换）下匹配。
 */
export function matchesNumericEntry(
  proseVal: number,
  proseUlp: number,
  proseHasPct: boolean,
  cand: NumericEntry,
  allowUnsignedMagnitude = false,
): boolean {
  const checkPair = (a: number, uA: number, b: number, uB: number): boolean => {
    const tol = Math.max(0.5 * Math.max(uA, uB), 0.015);
    if (Math.abs(a - b) <= tol + 1e-12) return true;
    if (allowUnsignedMagnitude && Math.abs(Math.abs(a) - Math.abs(b)) <= tol + 1e-12) return true;
    return false;
  };

  // 1. Direct value match (avoid matching bare integer counts >= 2 with `%` unless proportion matches)
  if (!(proseHasPct && cand.isIntegerCount && Math.abs(cand.value) > 1)) {
    if (checkPair(proseVal, proseUlp, cand.value, cand.ulp)) return true;
  }

  // 2. Proportion -> Percentage equivalence (`0.482` registered <-> `48.2%` or `48.2 个百分点` in prose)
  if (!cand.isPercent && !cand.isIntegerCount && Math.abs(cand.value) <= 1) {
    if (checkPair(proseVal, proseUlp, cand.value * 100, cand.ulp * 100)) return true;
  }

  // 3. Percentage -> Proportion equivalence (`48.2%` registered <-> `0.482` in prose)
  if (cand.isPercent && !proseHasPct && Math.abs(proseVal) <= 1) {
    if (checkPair(proseVal, proseUlp, cand.value / 100, cand.ulp / 100)) return true;
  }

  return false;
}

function cleanEntityName(raw: string): string {
  return raw
    .replace(/\s*（n\s*=\s*\d+）\s*$/u, '')
    .replace(/^\s*（\d+）\s*/u, '')
    .trim();
}

const GENERIC_SUMMARY_ROW = /^(?:合计|总计|小计|总体|均值|标准差|旋转后方差贡献率|累计方差贡献率|特征值|（截距）|\(截距\)|截距|Constant|Intercept)$/iu;

function expandEntityAliases(entity: string): string[] {
  const aliases = new Set<string>([entity]);
  const bare = cleanEntityName(entity);
  if (bare.length >= 2) {
    aliases.add(bare);
    const stem = bare.replace(/(?:标准化中心|合成分|子量表|均值|总分|得分|评分|维度)$/u, '').trim();
    if (stem.length >= 2) aliases.add(stem);
  }
  const clusterMatch = /^第\s*([1-9])\s*类(?:人群)?$/u.exec(bare);
  if (clusterMatch) {
    const d = Number(clusterMatch[1]);
    const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'][d];
    aliases.add(`第 ${d} 类`);
    aliases.add(`第${d}类`);
    aliases.add(`第 ${d} 类人群`);
    if (cn) {
      aliases.add(`第${cn}类`);
      aliases.add(`簇${cn}`);
    }
  }
  return [...aliases].filter(a => a.length >= 2);
}

/**
 * 构建全节合法数值池（直接登记值 + 同表合法算术派生值）与跨行实体归属对齐索引。
 */
export function buildAllowedNumericRegistry(
  tokens: VerifierTokenMap,
  context?: V2VerifierContext,
): {
  pool: NumericEntry[];
  entityIndex: EntityOwnershipIndex;
  referenceYears: Set<string>;
} {
  const pool: NumericEntry[] = [];
  const addEntry = (entry: NumericEntry) => {
    if (!Number.isFinite(entry.value)) return;
    pool.push(entry);
  };
  const addScalar = (value: number, ulp = 0, isPercent = false, isIntegerCount = false) => {
    if (!Number.isFinite(value)) return;
    addEntry({ value, ulp, isPercent, isIntegerCount });
  };

  // 1. Facts from SectionTokenMap
  for (const f of tokens.facts) {
    for (const entry of parseNumbersFromCell(f.value, f.text)) addEntry(entry);
  }

  // 2. Questionnaire metadata
  if (context?.design?.questions?.length) {
    addScalar(context.design.questions.length, 0, false, true);
    for (const q of context.design.questions) {
      const maybeMax = (q as unknown as { maxChoices?: unknown }).maxChoices;
      if (typeof maybeMax === 'number') {
        addScalar(maybeMax, 0, false, true);
      }
    }
  }

  // 3. Reference years from structured references
  const referenceYears = new Set<string>();
  for (const ref of context?.content?.references ?? []) {
    if (ref.year && /^\d{4}$/u.test(ref.year.trim())) referenceYears.add(ref.year.trim());
  }
  for (const rToken of tokens.references) {
    for (const ym of rToken.text.matchAll(/\b((?:19|20)\d{2})\b/gu)) referenceYears.add(ym[1]);
  }

  // 4. Preserved table footnotes & warnings
  const preserved = context?.preservedNotes
    ?? (context?.content ? collectPreservedResultNotes(context.content) : new Map<string, string[]>());

  const ownByEntity = new Map<string, NumericEntry[]>();
  const tableEntityRows: { entities: Map<string, NumericEntry[]> }[] = [];

  const registerEntityVal = (map: Map<string, NumericEntry[]>, rawName: string, entries: readonly NumericEntry[]) => {
    if (!rawName || GENERIC_SUMMARY_ROW.test(rawName.trim())) return;
    for (const alias of expandEntityAliases(rawName)) {
      const list = map.get(alias) ?? [];
      list.push(...entries);
      map.set(alias, list);
      const globalList = ownByEntity.get(alias) ?? [];
      globalList.push(...entries);
      ownByEntity.set(alias, globalList);
    }
  };

  for (const r of context?.results ?? []) {
    const localEntities = new Map<string, NumericEntry[]>();
    const metricEntityExempt = ['correlation', 'cluster', 'cluster-radar', 'likert', 'wordcloud', 'framework', 'diagram'].includes(r.method);
    addScalar(r.n, 0, false, true);
    addScalar(r.total, 0, false, true);
    if (r.total >= r.n && r.total > 0) {
      const diff = r.total - r.n;
      addScalar(diff, 0, false, true);
      addScalar((r.n / r.total) * 100, 0.1, true, false);
      addScalar(((r.total - r.n) / r.total) * 100, 0.1, true, false);
    }

    // Metrics
    const metricEntries: NumericEntry[] = [];
    for (const m of r.metrics) {
      if (m.value === null || !Number.isFinite(m.value)) continue;
      const parsed = parseNumbersFromCell(m.value, m.label);
      for (const e of parsed) {
        addEntry(e);
        metricEntries.push(e);
      }
      if (!metricEntityExempt && m.label.includes('｜')) {
        const metricEntity = m.label.split('｜')[0]?.trim() ?? '';
        if (metricEntity && !/^特征值$/u.test(metricEntity)) {
          registerEntityVal(localEntities, metricEntity, parsed);
        }
      }
    }
    // Same-result metric differences (e.g., R² - Adj R²)
    for (let i = 0; i < Math.min(metricEntries.length, 10); i++) {
      for (let j = i + 1; j < Math.min(metricEntries.length, 10); j++) {
        addScalar(Math.abs(metricEntries[i].value - metricEntries[j].value), Math.max(metricEntries[i].ulp, metricEntries[j].ulp), metricEntries[i].isPercent && metricEntries[j].isPercent);
      }
    }

    // Receipt counts & inference statistics
    if (r.receipt) {
      const s = r.receipt.sample;
      for (const v of [s.calculationRows, s.analysisRows, s.excludedRows, s.missingRows, s.invalidRows, s.outOfRangeRows]) {
        if (typeof v === 'number' && Number.isFinite(v)) addScalar(v, 0, false, true);
      }
      const cs = r.receipt.calculation?.sample;
      if (cs) {
        for (const v of [cs.originalRows, cs.branchRows, cs.commonEligibleRows, cs.filterExcludedRows, cs.filterMissingRows]) {
          addScalar(v, 0, false, true);
        }
      }
      const rt = r.receipt.calculation?.routing?.analysis;
      if (rt) {
        for (const v of [rt.totalRows, rt.eligibleRows, rt.ineligibleRows]) {
          if (typeof v === 'number' && Number.isFinite(v)) addScalar(v, 0, false, true);
        }
        for (const qc of rt.questionCounts ?? []) {
          for (const v of [qc.eligibleAnswered, qc.eligibleMissing, qc.ineligibleBlank]) {
            if (typeof v === 'number' && Number.isFinite(v)) addScalar(v, 0, false, true);
          }
        }
      }
      const inf = r.receipt.inference;
      if (inf) {
        const tests = [inf.primary, ...inf.robustness];
        for (const t of tests) {
          if (t.p !== null) addScalar(t.p, 0.001, false, false);
          if (t.statistic) {
            addScalar(t.statistic.value, 0.01, false, false);
            for (const df of t.statistic.df ?? []) addScalar(df, Number.isInteger(df) ? 0 : 0.01, false, Number.isInteger(df));
          }
          if (t.effect?.value !== null && t.effect?.value !== undefined) {
            addScalar(t.effect.value, 0.001, false, false);
            if (t.effect.interval) {
              addScalar(t.effect.interval.lower, 0.001, false, false);
              addScalar(t.effect.interval.upper, 0.001, false, false);
            }
          }
          for (const e of parseNumbersFromCell(t.line)) addEntry(e);
        }
        for (const comp of inf.comparisons ?? []) {
          addScalar(comp.difference, 0.01);
          addScalar(Math.abs(comp.difference), 0.01);
          addScalar(comp.t, 0.01);
          addScalar(comp.df, 0.01);
          addScalar(comp.p, 0.001);
          addScalar(comp.adjusted, 0.001);
        }
      }
      if (r.receipt.interpretation) {
        for (const e of parseNumbersFromCell(r.receipt.interpretation)) addEntry(e);
      }
    }

    // Preserved table notes & warnings (strip confidence-level labels like `95% 置信区间` before extracting empirical numbers)
    for (const note of [...(preserved.get(r.id) ?? []), ...r.warnings]) {
      const strippedNote = note.replace(/\b(?:90|95|99)\s*[%％]\s*(?:置信|CI)/giu, '');
      for (const e of parseNumbersFromCell(strippedNote)) addEntry(e);
    }

    // Header group sample sizes ONLY (e.g., `理工医农类学生（n = 310）` — never extract `95%` from `OR 95% CI` or `1 分`..`5 分`!)
    for (const h of r.headers) {
      for (const gm of h.matchAll(/n\s*=\s*(\d+)/giu)) {
        addScalar(Number(gm[1]), 0, false, true);
      }
    }

    // Parse table cells & compute same-table arithmetic + entity ownership!
    const boundedRows = r.rows.slice(0, 25);
    const colValues: NumericEntry[][] = r.headers.map(() => []);

    // Special column-group entity extraction for `profile` tables (`不同X受访者各评价维度均值...`)
    const profileGroupCols: { colIdx: number; groupName: string }[] = [];
    if (r.method === 'profile') {
      r.headers.forEach((h, colIdx) => {
        const gm = /^(.+?)\s*（n\s*=\s*(\d+)）$/u.exec(h.trim());
        if (gm && colIdx >= 1) {
          const gName = gm[1].trim();
          profileGroupCols.push({ colIdx, groupName: gName });
          registerEntityVal(localEntities, gName, [{ value: Number(gm[2]), ulp: 0, isPercent: false, isIntegerCount: true }]);
        }
      });
    }

    for (const row of boundedRows) {
      const rowEntries: NumericEntry[] = [];
      row.forEach((cell, colIdx) => {
        const header = r.headers[colIdx] ?? '';
        const parsed = parseNumbersFromCell(cell, header);
        for (const e of parsed) {
          addEntry(e);
          colValues[colIdx]?.push(e);
          rowEntries.push(e);
          // OR odds-change percentage: `(OR - 1) * 100%`
          if (/\bOR\b|优势比|发生比/u.test(header) && e.value > 0 && e.value < 50) {
            const pctChange = Math.abs(e.value - 1) * 100;
            addScalar(pctChange, 0.1, true, false);
            rowEntries.push({ value: pctChange, ulp: 0.1, isPercent: true, isIntegerCount: false });
          }
          // Complement percentage `100 - p%` or `1 - p`
          if (e.isPercent && e.value >= 0 && e.value <= 100) {
            addScalar(100 - e.value, e.ulp, true, false);
          } else if (!e.isIntegerCount && e.value >= 0 && e.value <= 1) {
            addScalar(1 - e.value, e.ulp, false, false);
          }
          // Count -> share of n (`count / r.n * 100`)
          if (e.isIntegerCount && r.n > 0 && e.value >= 0 && e.value <= r.n) {
            const pctOfN = (e.value / r.n) * 100;
            addScalar(pctOfN, 0.1, true, false);
            rowEntries.push({ value: pctOfN, ulp: 0.1, isPercent: true, isIntegerCount: false });
          }
        }
      });

      // Same-row arithmetic across columns (differences, sums, ratios)
      for (let a = 0; a < Math.min(rowEntries.length, 10); a++) {
        for (let b = a + 1; b < Math.min(rowEntries.length, 10); b++) {
          const x = rowEntries[a], y = rowEntries[b];
          const u = Math.max(x.ulp, y.ulp);
          const bothPct = x.isPercent && y.isPercent;
          addScalar(x.value + y.value, u, bothPct, x.isIntegerCount && y.isIntegerCount);
          addScalar(Math.abs(x.value - y.value), u, bothPct, x.isIntegerCount && y.isIntegerCount);
          if (Math.abs(y.value) > 1e-6) {
            const r1 = x.value / y.value;
            if (r1 >= 0.01 && r1 <= 1000) addScalar(r1, 0.01, false, false);
          }
          if (Math.abs(x.value) > 1e-6) {
            const r2 = y.value / x.value;
            if (r2 >= 0.01 && r2 <= 1000) addScalar(r2, 0.01, false, false);
          }
        }
      }

      // Register row entity ownership (skipping correlation matrices, cluster centroid tables, and multi-item likert tables where multiple entities/items legitimately co-occur)
      if (
        r.method !== 'correlation' &&
        r.method !== 'cluster' &&
        r.method !== 'cluster-radar' &&
        r.method !== 'likert' &&
        r.method !== 'wordcloud' &&
        r.method !== 'framework' &&
        r.method !== 'diagram'
      ) {
        const firstCell = typeof row[0] === 'string' ? row[0].trim() : '';
        if (firstCell && !GENERIC_SUMMARY_ROW.test(firstCell)) {
          if (r.method === 'crosstab' && typeof row[1] === 'string' && row[1].trim()) {
            registerEntityVal(localEntities, firstCell, rowEntries);
            registerEntityVal(localEntities, `${cleanEntityName(firstCell)}·${cleanEntityName(row[1])}`, rowEntries);
          } else if (r.method === 'profile' && profileGroupCols.length >= 2) {
            // Dimension owns the whole row; each group column owns its group mean!
            registerEntityVal(localEntities, firstCell, rowEntries);
            for (const gc of profileGroupCols) {
              const cellEntries = parseNumbersFromCell(row[gc.colIdx] ?? null, r.headers[gc.colIdx] ?? '');
              registerEntityVal(localEntities, gc.groupName, cellEntries);
            }
          } else {
            registerEntityVal(localEntities, firstCell, rowEntries);
          }
        }
      }
    }

    // Same-column arithmetic across rows (2-row & 3-row sums, full column sum, pairwise diffs & ratios)
    for (const col of colValues) {
      if (col.length < 2) continue;
      const colSum = col.reduce((s, e) => s + e.value, 0);
      const maxUlp = Math.max(...col.map(e => e.ulp));
      const allPct = col.every(e => e.isPercent);
      const allInt = col.every(e => e.isIntegerCount);
      addScalar(colSum, maxUlp, allPct, allInt);

      // Crosstab group subtotals for entity ownership
      if (r.method === 'crosstab') {
        const sumByGroup = new Map<string, number>();
        for (const row of boundedRows) {
          const g = typeof row[0] === 'string' ? row[0].trim() : '';
          const cnt = typeof row[2] === 'number' ? row[2] : Number(row[2]);
          if (g && Number.isFinite(cnt)) sumByGroup.set(g, (sumByGroup.get(g) ?? 0) + cnt);
        }
        for (const [g, totalCnt] of sumByGroup.entries()) {
          const cntEntry: NumericEntry = { value: totalCnt, ulp: 0, isPercent: false, isIntegerCount: true };
          addEntry(cntEntry);
          registerEntityVal(localEntities, g, [cntEntry]);
          if (r.n > 0) {
            const pctEntry: NumericEntry = { value: (totalCnt / r.n) * 100, ulp: 0.1, isPercent: true, isIntegerCount: false };
            addEntry(pctEntry);
            registerEntityVal(localEntities, g, [pctEntry]);
          }
        }
      }

      const cap = Math.min(col.length, 20);
      for (let i = 0; i < cap; i++) {
        for (let j = i + 1; j < cap; j++) {
          const x = col[i], y = col[j];
          const u = Math.max(x.ulp, y.ulp);
          addScalar(x.value + y.value, u, allPct, allInt);
          addScalar(Math.abs(x.value - y.value), u, allPct, allInt);
          if (Math.abs(y.value) > 1e-6) {
            const ratio = x.value / y.value;
            if (ratio >= 0.01 && ratio <= 1000) addScalar(ratio, 0.01, false, false);
          }
          if (Math.abs(x.value) > 1e-6) {
            const ratio = y.value / x.value;
            if (ratio >= 0.01 && ratio <= 1000) addScalar(ratio, 0.01, false, false);
          }
          if (cap <= 12) {
            for (let k = j + 1; k < cap; k++) {
              const z = col[k];
              addScalar(x.value + y.value + z.value, Math.max(u, z.ulp), allPct, allInt);
            }
          }
        }
      }
    }

    if (localEntities.size >= 2) {
      tableEntityRows.push({ entities: localEntities });
    }
  }

  // Finalize sibling exclusive map for Row-Entity Alignment (`张冠李戴` detection)
  const siblingByEntity = new Map<string, { entry: NumericEntry; sibling: string }[]>();
  for (const { entities } of tableEntityRows) {
    const names = [...entities.keys()];
    for (const target of names) {
      const ownGlobal = ownByEntity.get(target) ?? [];
      const sibList = siblingByEntity.get(target) ?? [];
      for (const other of names) {
        if (other === target) continue;
        // Skip alias of the same underlying entity (e.g., `第 1 类` vs `第 1 类人群`)
        if (other.includes(target) || target.includes(other)) continue;
        for (const cand of entities.get(other) ?? []) {
          // Ignore trivial 0 / 1 codes that appear everywhere
          if (cand.value === 0 || cand.value === 1) continue;
          const alsoOwned = ownGlobal.some(o =>
            matchesNumericEntry(cand.value, cand.ulp, cand.isPercent, o, false),
          );
          if (!alsoOwned) {
            sibList.push({ entry: cand, sibling: other });
          }
        }
      }
      siblingByEntity.set(target, sibList);
    }
  }

  const sortedEntities = [...ownByEntity.keys()]
    .filter(e => e.length >= 2)
    .sort((a, b) => b.length - a.length);

  return {
    pool,
    entityIndex: { entities: sortedEntities, ownByEntity, siblingByEntity },
    referenceYears,
  };
}

/**
 * 将句子中的语法型非统计编号（题号 Q1–Q32、潜因子 F1–F6、量表 1–5 分、国标号、引用年份、分类名等）掩码为等长占位字符，
 * 以便仅对真正的统计量执行池核验与行—实体对齐检查。
 */
function maskGrammaticalNonStatistics(
  sentence: string,
  labels: readonly string[],
  referenceYears: ReadonlySet<string>,
): string {
  const maskSpan = (s: string, re: RegExp): string =>
    s.replace(re, match => '□'.repeat(match.length));

  let masked = sentence;

  // 1. Placeholders & resolved tokens (`{F1}`, `{G1}`, `{R1}`, `[[图:...]]`, `[1]`, `[1-3]`)
  masked = maskSpan(masked, PLACEHOLDER_RE);
  masked = maskSpan(masked, /\[\[(?:图|表|式|引):[^\]\n]{1,80}\]\]/gu);
  masked = maskSpan(masked, /[[［]\s*\d{1,2}(?:\s*[-–—,，、]\s*\d{1,2})*\s*[\]］]/gu);

  // 2. Registered category labels carrying digits (longest first, e.g., `60–70 岁老年人`, `9–12 元`, `18–25 岁`)
  for (const label of labels) {
    if (label && masked.includes(label)) {
      masked = masked.split(label).join('□'.repeat(label.length));
    }
  }

  // 3. National standards (`GB/T 7714—2015`) & competition edition (`第 17 届`)
  masked = maskSpan(masked, /\bGB\/T\s*\d+(?:\.\d+)?(?:\s*[—–\-－]\s*\d{4})?/giu);
  masked = maskSpan(masked, /第\s*1[5-9]\s*届/gu);

  // 4. Question codes (`Q1..Q45` and ranges `Q5–Q13`, `Q18~Q45`), Factor/RQ/Hypothesis/Coding IDs (`F1..F6`, `RQ1..9`, `H1..12`, `CLM-1..9`, `A1..9`, `R01..15`, `S1..15`)
  masked = maskSpan(
    masked,
    /(?<![A-Za-z])Q(?:[1-9]|[1-3][0-9]|4[0-5])(?:\s*[—–\-－~～至到、/]\s*Q?(?:[1-9]|[1-3][0-9]|4[0-5]))*(?![0-9])/giu,
  );
  masked = maskSpan(masked, /题\s*(?:[1-9]|[1-3][0-9]|4[0-5])(?:\s*[—–\-－~～至到、]\s*题?\s*(?:[1-9]|[1-3][0-9]|4[0-5]))*(?![0-9])/gu);
  masked = maskSpan(masked, /(?<![A-Za-z])(?:RQ|CLM-?|H)[1-9][0-9]?(?![0-9])/gu);
  masked = maskSpan(masked, /(?<![A-Za-z])F[1-6](?!\s*[(（=<>])/gu);
  masked = maskSpan(masked, /(?<![A-Za-z])(?:R0[1-9]|R1[0-5]|A[1-9]|S[1-9]|S1[0-5])(?![0-9A-Za-z])/gu);
  masked = maskSpan(masked, /\b(?:UTAUT-?2|[35]W1H|4P|5GAP|L1|L2|L3|L4|L5)\b/giu);

  // 5. LaTeX / math exponents & subscripts (`R^2`, `R²`, `\chi^2`, `χ²`, `\varepsilon^2`, `\beta_0`, `X_1`, `n_0`, `k\in\{2,3,4,5\}`)
  masked = maskSpan(masked, /(?:\\mathrm\{[^}]+\}|\\[A-Za-z]+|[RχζεηhQszeXβμλp])(?:\s*\^\s*\{?\d+\}?|\s*_\s*\{?[0-9A-Za-z]+\}?)+/gu);
  masked = maskSpan(masked, /[RχζεηhQs][²³]/gu);
  masked = maskSpan(masked, /k\s*\\in\s*\\\{\s*\d(?:\s*,\s*\d)*\s*\\\}/gu);

  // 6. Explicit figure/table/equation numbering (`图 4-1`, `表 3-2`, `式（4-1）`, `附录 1`)
  masked = maskSpan(masked, /(?:图|表|Figure|Table)\s*\d+(?:\s*[-－—.．]\s*\d+)*/giu);
  masked = maskSpan(masked, /式\s*[（(]\s*\d+(?:\s*[-－—.．]\s*\d+)*\s*[)）]/gu);
  masked = maskSpan(masked, /(?:附录|附件)\s*\d+/gu);

  // 7. Leading list ordinals & structural ordinals (`1.`, `（1）`, `第 1 阶段`, `第 1 类`, `1–5 分`, `5 点量表`, `5×5 矩阵`, `0/1 编码`)
  masked = maskSpan(masked, /^\s*(?:[（(]\s*\d{1,2}\s*[)）]|\d{1,2}\s*[.、．])\s*/u);
  masked = maskSpan(masked, /[；;：:]\s*[（(]\s*\d{1,2}\s*[)）]/gu);
  masked = maskSpan(
    masked,
    /第\s*(?:[1-9]|1[0-9]|20)\s*(?:章|节|部分|阶段|步|层|类|簇|组|象限|因子|主成分|维度|梯队|轮|期|条|项|位|名|次)/gu,
  );
  masked = maskSpan(
    masked,
    /(?<![0-9.])(?:1\s*[—–\-－~～至到]\s*[57]|0\s*[—–\-－~～至到]\s*(?:100|10))(?:\s*(?:分制|分|级|点|标度))?(?![0-9])/gu,
  );
  masked = maskSpan(masked, /(?<![0-9.])(?:[57]|100)\s*分制/gu);
  masked = maskSpan(masked, /(?<![0-9.])[57]\s*(?:级量表|点量表|分量表|级李克特|点\s*Likert)/giu);
  masked = maskSpan(masked, /(?<![0-9.])\d{1,2}\s*(?:道题|对配对|组对照)/gu);
  masked = maskSpan(masked, /(?<![0-9.])5\s*[×xX]\s*5\s*(?:矩阵|评价矩阵|配对)?/gu);
  masked = maskSpan(masked, /(?:编码为?|取值|二元|二分类)[^，。；]{0,8}?(?:['"“]?[01]['"”]?\s*[/／、和与]\s*['"“]?[01]['"”]?)/gu);
  masked = maskSpan(masked, /选择\s*[“"']?[1-5][”"']?(?:\s*选项)?/gu);
  masked = maskSpan(masked, /代码\s*[“"']?[1-5][”"']?/gu);
  masked = maskSpan(masked, /均值\s*0\s*[、，,]\s*标准差\s*1/gu);
  masked = maskSpan(masked, /(?:每(?:提高|增加|降低|变动|上升|下降)|变动)\s*1\s*(?:个?(?:单位|标准差|等级|分))/gu);
  masked = maskSpan(masked, /(?:跨过|包含|不含|跨越|等于|大于|小于)\s*[01](?![0-9.])/gu);
  masked = maskSpan(
    masked,
    /(?<![0-9.])(?:[1-9]|1[0-2])\s*(?:个|项|条|类|分类|维|维度|大|种|阶段|象限|部分|步|步骤|层|层面|级|轮|期|子量表|配对|模块|主体|要素|原则|方面)(?![0-9])/gu,
  );
  masked = maskSpan(
    masked,
    /(?<![0-9.])(?:[1-9])\s*[—–\-－~～至到]\s*(?:[1-9]|10)\s*(?:个|项|条|类|维|阶段|步|层|级|天|周|月|分钟)(?![0-9])/gu,
  );

  // 8. Citation years (`(2020)`, `（2024）`, or registered reference years)
  masked = masked.replace(/[（(]([^（）()]{0,28}?)\b((?:19|20)\d{2})\b([^（）()]{0,12}?)[)）]/gu, (full, pre: string, yr: string, post: string) => {
    if (referenceYears.has(yr) || !/[%％份人元倍]/u.test(pre + post)) {
      return full.replace(yr, '□□□□');
    }
    return full;
  });
  for (const yr of referenceYears) {
    masked = masked.replace(new RegExp(`(?<![0-9])${yr}(?:年)?(?![0-9])`, 'gu'), m => '□'.repeat(m.length));
  }

  // 9. SRS textbook formula planning example (`z=1.96, e=0.05, p=0.5 -> n0=384.16 / 385`)
  if (/1\.96|n_0/u.test(sentence) && /0\.05/u.test(sentence)) {
    masked = maskSpan(masked, /(?<![0-9])(?:1\.96|0\.05|0\.50?|384(?:\.16)?|385)(?![0-9])/gu);
  }

  return masked;
}

const STANDARD_CUTOFF_VALUES = new Set([
  0.001, 0.01, 0.05, 0.08, 0.1, 0.2, 0.25, 0.26, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9,
  1, 1.96, 2, 3, 3.2, 5, 10, 20, 40, 90, 95, 99,
]);

function isContextualStandardCutoff(sentence: string, index: number, rawToken: string, value: number, hasPct: boolean): boolean {
  if (!STANDARD_CUTOFF_VALUES.has(value)) return false;
  const from = Math.max(0, index - 22);
  const to = Math.min(sentence.length, index + rawToken.length + 22);
  const before = sentence.slice(from, index);
  const after = sentence.slice(index + rawToken.length, to);
  const window = before + rawToken + after;

  // Direct p-value inequality (`p < 0.001`, `p < 0.05`, `p > 0.05`, `p_{\mathrm{Holm}} < 0.001`)
  if ((value === 0.001 || value === 0.01 || value === 0.05 || value === 0.1) && !hasPct) {
    if (/(?:(?<![A-Za-z])p(?:_\{[^}]+\}|_[A-Za-z]+)?|显著性|sig\.?|α|\\alpha)\s*(?:[<＜≤>＞≥]|小于|低于|大于|高于|超过|不小于|不低于)\s*\$?$/iu.test(before)) {
      return true;
    }
    if (/^\$?\s*(?:的)?\s*显著性水平/u.test(after)) return true;
  }

  // Significance levels expressed as 1%, 5%, 10%
  if (hasPct && (value === 1 || value === 5 || value === 10) && /显著性水平|水平上显著/u.test(window)) {
    return true;
  }

  // Confidence interval levels (`95% CI`, `95% 置信区间`, `$95\%$`)
  if (hasPct && (value === 90 || value === 95 || value === 99)) {
    if (/置信(?:区间|水平|度)|\bCI\b/iu.test(window)) return true;
  }

  // Never exempt an empirical point estimate (`值为 0.8`, `占比为 95%`, `达 80%`, `共 10 人`)
  if (/(?:均值|占比|比例|比率|人数|样本|系数|得分|统计量|结果|总计|共)\s*(?:为|是|达|达到|约|约为|=|＝)\s*\$?$/u.test(before)) {
    return false;
  }
  if (/^\$?\s*(?:人|份|例|名|元|次)/u.test(after)) {
    return false;
  }

  // Adjacent to explicit threshold / diagnostic criterion terms
  const hasThresholdTerm = /阈值|临界|下限|上限|门槛|准则|判据|参考线|标准(?:线|值)?|截断值|经验值|分界/u.test(window);
  const hasDiagnosticInequality =
    /(?:VIF|共线性|特征值|特征根|KMO|Cronbach|α|\\alpha|载荷|共同度|轮廓系数|\\bar\{s\}|\bCR\b|\bAVE\b|Harman|首因子|期望频数)[^，。；\n]{0,14}?(?:大于|小于|高于|低于|超过|不足|不低于|不超过|远低于|优于|[<>＜＞≤≥])/iu.test(
      window,
    );
  return hasThresholdTerm || hasDiagnosticInequality;
}

const DIFFERENCE_OR_GLOBAL_BEFORE_RE = /(?:高出|低出|相差|差值|差距|领先|超出|多出|少于|提升|下降|降低|增加|减少|变动|变化|样本量|有效样本|总样本|总记录|问卷共|\bn\s*=|\btotal\s*=|KMO|Bartlett|R\^2|R²|McFadden|似然比|\bF\s*\(|轮廓系数|\\bar\{s\})[^，。；\n]{0,10}$/iu;

const MULTI_ENTITY_COMPARATIVE_RE = /(?:高于|低于|高出|低出|相比|对比|相较|分别|依次|各自|而|与[^。！？；\n]{1,28}呈|相关)/u;

function detectEntityMisalignment(
  hydratedSentence: string,
  entityIndex: EntityOwnershipIndex,
  exemptMatrixOrMultiItem = false,
): string | null {
  if (exemptMatrixOrMultiItem || !entityIndex.entities.length) return null;

  // Exempt multi-entity comparative or relational sentences (`高于|低于|相比|对比|分别|依次|而|与.*呈|相关`)
  if (MULTI_ENTITY_COMPARATIVE_RE.test(hydratedSentence)) {
    let distinctCount = 0;
    for (const entity of entityIndex.entities) {
      if (hydratedSentence.includes(entity)) {
        distinctCount++;
        if (distinctCount >= 2) return null;
      }
    }
  }

  // Check clause by clause so entities in earlier clauses don't bleed across commas unless needed
  const clauses = hydratedSentence.split(/[，,；;。！？!?\n]/u);
  for (const clause of clauses) {
    if (!/\d/u.test(clause)) continue;

    // Locate non-overlapping entity spans in this clause (longest match first)
    const occupied = new Uint8Array(clause.length);
    const mentions: { name: string; start: number; end: number }[] = [];
    for (const entity of entityIndex.entities) {
      let from = 0;
      while (from <= clause.length - entity.length) {
        const at = clause.indexOf(entity, from);
        if (at < 0) break;
        const end = at + entity.length;
        let overlaps = false;
        for (let k = at; k < end; k++) {
          if (occupied[k]) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          for (let k = at; k < end; k++) occupied[k] = 1;
          mentions.push({ name: entity, start: at, end });
        }
        from = at + 1;
      }
    }
    if (!mentions.length) continue;
    mentions.sort((a, b) => a.start - b.start);

    // Mask out digits that sit INSIDE entity names themselves (e.g., `60–70 岁老年人`, `第 1 类`)
    let maskedClause = clause;
    for (const m of mentions) {
      maskedClause = maskedClause.slice(0, m.start) + '□'.repeat(m.end - m.start) + maskedClause.slice(m.end);
    }
    // Also mask item codes, citations, exhibit refs inside clause
    maskedClause = maskedClause
      .replace(/\[\[(?:图|表|式|引):[^\]]+\]\]/gu, m => '□'.repeat(m.length))
      .replace(/(?<![A-Za-z])Q\d+/giu, m => '□'.repeat(m.length));

    for (const numMatch of maskedClause.matchAll(/([+-]?\d+(?:\.\d+)?)\s*([%％])?/gu)) {
      const idx = numMatch.index!;
      const rawNum = numMatch[0].trim();
      const val = Number(numMatch[1]);
      if (!Number.isFinite(val)) continue;
      const u = decimalUlp(numMatch[1]);
      const hasPct = Boolean(numMatch[2]);

      const beforeText = clause.slice(0, idx);
      if (DIFFERENCE_OR_GLOBAL_BEFORE_RE.test(beforeText)) continue;
      if (isContextualStandardCutoff(clause, idx, rawNum, Math.abs(val), hasPct)) continue;

      // Nearest preceding entity in this clause
      const preceding = mentions.filter(m => m.end <= idx);
      if (!preceding.length) continue;
      const nearest = preceding.at(-1)!;

      // Skip if comparative target phrase sits between nearest entity and number (`较参照组`, `高于另一组`)
      const between = clause.slice(nearest.end, idx);
      if (/(?:较|比|相对|高于|低于|高出|低出|相差)/u.test(between)) continue;

      const ownList = entityIndex.ownByEntity.get(nearest.name) ?? [];
      const matchesOwn = ownList.some(o => matchesNumericEntry(val, u, hasPct, o, true));
      if (matchesOwn) continue;

      const sibList = entityIndex.siblingByEntity.get(nearest.name) ?? [];
      const swapped = sibList.find(s => u >= s.entry.ulp * 0.5 && matchesNumericEntry(val, u, hasPct, s.entry, false));
      if (swapped) {
        return `实体数值张冠李戴（“${nearest.name}”误用了同表“${swapped.sibling}”的数值 ${rawNum}）`;
      }
    }
  }
  return null;
}

function mismatchedFactContextV2(sentence: string, facts: readonly Fact[]): string | null {
  for (const match of sentence.matchAll(/\{(F\d+)\}/gu)) {
    const fact = facts.find(f => f.id === match[1]);
    if (!fact) continue;
    const prefix = sentence.slice(0, match.index).split(/[。；！？\n]/u).at(-1) ?? '';
    const immediate = prefix.split(/[，,]/u).at(-1) ?? '';
    if (/有效回收率|回收比例/u.test(fact.text)
      && /占比|比例|比率|百分比|率/u.test(prefix)
      && !/回收率|回收比例/u.test(prefix)) {
      return '把回收率用于其他人群或指标的比例';
    }
    const totalSample = /有效样本|总样本|样本总数|参与分析的样本/u.test(fact.text) && !/中「[^」]+」/u.test(fact.text);
    if (totalSample
      && /(?:其中|某组|该组|子组|组内|选择「[^」]+」|「[^」]+」(?:组|人群|受访者))[^。；]*$/u.test(immediate)
      && !/全部|总体|总样本/u.test(immediate)) {
      return '把分析总样本数用于未登记的分组人数';
    }
  }
  return null;
}

function simulatedFieldworkSentenceIssue(
  sentence: string,
  pilotPending: boolean,
  screening: readonly string[],
  duplicatesMarked: boolean,
): string {
  for (const clause of sentence.split(/[。！？；\n]/u)) {
    const futureOnly = FUTURE_FIELDWORK.test(clause) && !COMPLETION_CUE.test(clause);
    if (!futureOnly && (COMPLETED_RECRUITMENT.test(clause) || RECRUITMENT_CHANNEL.test(clause))) {
      return '教学模拟不能声称开展过真人调查或招募';
    }
    if (!futureOnly && pilotPending && COMPLETED_PILOT.test(clause)) {
      return '未登记预调查结果，不能声称已经执行';
    }
    const claimsScreening = /筛查|筛选|剔除|清理|核查|检查/u.test(clause)
      && /剔除|排除|筛掉|保留|按[^。！？；]{0,42}(?:规则|标准)|逐份/u.test(clause);
    if (!claimsScreening || futureOnly || /(?:未|没有)(?:做|用|采用|按|执行|剔除|排除)/u.test(clause)) continue;
    if (SCREENING_RULES.some(rule => rule.test(clause) && !screening.some(label => rule.test(label)))) {
      return '描述了未登记的模拟数据筛查规则';
    }
    if (duplicatesMarked && DUPLICATE_ANSWER.test(clause) && /剔除|排除|筛掉/u.test(clause)
      && !/仅(?:作)?标记|保留.*重复/u.test(clause)) {
      return '将仅标记的重复答卷写成了剔除';
    }
  }
  return '';
}

const METHOD_EXEMPT_CUE_RE = /(?:未采用|暂未纳入|不涉及|后续研究可|未来可结合|有待进一步)/u;
const METHOD_POST_EXEMPT_CUE_RE = /(?:有待进一步|暂未纳入|未采用|不涉及)/u;
const METHOD_AFFIRMATIVE_PAST_RE = /(?:构建了|建立了|开展了|采用了|实施了|进行了|结果显示|结果表明|验证了|证实了|得出)/u;

function isMethodMentionExempt(sentence: string, matchIndex: number, matchLength: number): boolean {
  const clauseDelimiters = /[，,；;。！？\n]/u;
  let clauseStart = matchIndex;
  while (clauseStart > 0 && !clauseDelimiters.test(sentence[clauseStart - 1])) clauseStart--;
  let clauseEnd = matchIndex + matchLength;
  while (clauseEnd < sentence.length && !clauseDelimiters.test(sentence[clauseEnd])) clauseEnd++;
  const clause = sentence.slice(clauseStart, clauseEnd);
  if (METHOD_EXEMPT_CUE_RE.test(clause)) return true;

  // Check preceding window up to sentence boundary (e.g. "后续研究可收集纵向数据，并结合SEM...")
  const sentenceDelimiters = /[。；！？\n]/u;
  let sentStart = matchIndex;
  while (sentStart > 0 && !sentenceDelimiters.test(sentence[sentStart - 1]) && matchIndex - sentStart < 48) {
    sentStart--;
  }
  const preWindow = sentence.slice(sentStart, matchIndex);
  const preMatches = [...preWindow.matchAll(new RegExp(METHOD_EXEMPT_CUE_RE.source, 'gu'))];
  if (preMatches.length) {
    const lastCue = preMatches.at(-1)!;
    const afterCue = preWindow.slice((lastCue.index ?? 0) + lastCue[0].length);
    if (!METHOD_AFFIRMATIVE_PAST_RE.test(afterCue)) return true;
  }

  // Check short trailing window inside the same sentence for subject-before-predicate cues like "有待进一步"
  let sentEnd = matchIndex + matchLength;
  while (sentEnd < sentence.length && !sentenceDelimiters.test(sentence[sentEnd]) && sentEnd - (matchIndex + matchLength) < 28) {
    sentEnd++;
  }
  const postWindow = sentence.slice(matchIndex + matchLength, sentEnd);
  if (METHOD_POST_EXEMPT_CUE_RE.test(postWindow) && !METHOD_AFFIRMATIVE_PAST_RE.test(postWindow)) {
    return true;
  }
  return false;
}

function unbackedAnalysesV2(sentence: string, methods: readonly string[]): string[] {
  return V2_ANALYSIS_CLAIMS
    .filter(c => {
      if (methods.some(m => c.methods.test(m))) return false;
      const flags = c.words.flags.includes('g') ? c.words.flags : `${c.words.flags}g`;
      const matches = [...sentence.matchAll(new RegExp(c.words.source, flags))];
      if (!matches.length) return false;
      return matches.some(m => !isMethodMentionExempt(sentence, m.index ?? 0, m[0].length));
    })
    .map(c => c.name);
}

function splitIntoSentences(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];
  if (/^关键词[:：]/u.test(trimmed)) return [trimmed];
  const parts = trimmed
    .split(/(?<=[。！？!?])\s*/u)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [trimmed];
}

/**
 * V2 章节核验与脱水入口：支持占位符与自然直写统计量双轨输入，执行句级外科手术剔除与行—实体对齐检查。
 */
export function verifyAndHydrateV2Section(
  rawJsonText: string,
  tokens: VerifierTokenMap,
  context?: V2VerifierContext,
): VerifiedV2Section {
  const factMap = new Map(tokens.facts.map(f => [f.id, f.value]));
  const exhibitMap = new Map(tokens.exhibits.map(e => [e.id, e.value]));
  const refMap = new Map(tokens.references.map(r => [r.id, r.value]));

  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*)\n\s*```\s*$/u.exec(rawJsonText.trim());
  const rawBody = fenced ? fenced[1] : rawJsonText;
  let rows: unknown[] = [];
  try {
    const payload = JSON.parse(rawBody);
    rows = Array.isArray(payload?.paragraphs) ? payload.paragraphs : [];
  } catch {
    const extracted = [...rawBody.matchAll(/"text"\s*:\s*"([\s\S]*?)"\s*\}/gu)].map(m => ({
      text: m[1].replace(/\\"/gu, '“').replace(/"/gu, '”').replace(/\\n/gu, '\n'),
    }));
    if (extracted.length > 0) {
      rows = extracted;
    } else {
      throw new Error('Invalid JSON structure in section draft response');
    }
  }

  const { pool, entityIndex, referenceYears } = buildAllowedNumericRegistry(tokens, context);
  const labels = [...(context?.labels ?? [])].sort((a, b) => b.length - a.length);
  const sectionOwnResults = (() => {
    const allRes = context?.results ?? [];
    if (!context?.nodeId) return allRes;
    const targetSec = context.content?.report.find(s => matchBlueprintNode(s.title)?.id === context.nodeId);
    const ownIds = new Set(
      (targetSec?.blocks ?? [])
        .filter(b => (b.kind === 'chart' || b.kind === 'table') && b.evidenceId)
        .map(b => b.evidenceId),
    );
    return allRes.filter(r => ownIds.has(r.id) || inferResultNode(r) === context.nodeId);
  })();
  const exemptMatrixOrMultiItem = sectionOwnResults.some(
    r => r.method === 'correlation' || r.method === 'cluster' || r.method === 'cluster-radar' || r.method === 'likert',
  );

  const paragraphs: string[] = [];
  const drafts: string[] = [];
  const dropReasons: string[] = [];
  const flaggedSentences: { sentence: string; reason: string }[] = [];
  const citedFacts = new Set<string>();
  const citedExhibits = new Set<string>();
  const citedReferences = new Set<string>();
  let droppedParagraphs = 0;
  let droppedSentences = 0;

  // Flatten multi-line paragraphs cleanly (up to 12 paragraphs per backend v2 envelope)
  const rawParagraphTexts: string[] = [];
  for (const row of rows.slice(0, 12)) {
    const rawText = typeof (row as { text?: unknown })?.text === 'string' ? (row as { text: string }).text : '';
    if (!rawText.trim()) {
      droppedParagraphs++;
      dropReasons.push('空段落');
      continue;
    }
    const lines = rawText.split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
    rawParagraphTexts.push(...lines);
  }

  for (const rawPara of rawParagraphTexts.slice(0, 12)) {
    const cleanedPara = cleanAcademicCliches(rawPara);
    const sentences = splitIntoSentences(cleanedPara);
    const keptHydratedSentences: string[] = [];
    const keptDraftSentences: string[] = [];

    for (const sentence of sentences) {
      const tokensFound = [...sentence.matchAll(PLACEHOLDER_RE)].map(m => m[1]);
      const unknownToken = tokensFound.some(id => !factMap.has(id) && !exhibitMap.has(id) && !refMap.has(id));
      const misboundRate = [...sentence.matchAll(/(?:率|占比|比例|百分比)(?:为|是|达|达到|约为|仅|仅为)?\s*\{(F\d+)\}/gu)]
        .some(m => {
          const v = factMap.get(m[1]) ?? '';
          return !/%$/u.test(v) && !(Number(v) >= 0 && Number(v) <= 1 && /\./u.test(v));
        });
      const withoutPlaceholders = sentence.replace(PLACEHOLDER_RE, '');
      const planned = Boolean(context && (context.planSection || (Boolean(context.pending) && PLANNED_CUE.test(withoutPlaceholders))));
      const backedMethods = context?.registeredMethods ?? context?.methods ?? [];
      const unbacked = context && !planned ? unbackedAnalysesV2(withoutPlaceholders, backedMethods) : [];
      const mismatched = mismatchedFactContextV2(sentence, tokens.facts);
      const completedPlan = context?.mode === 'plan'
        && /(?:本次调查|本研究|调查结果|统计结果|检验结果|模型结果|已覆盖|已调查).{0,20}(?:已经|已完成|已回收|已收集|表明|显示|证实|证明|发现|\d+\s*(?:人|名|份))/u.test(withoutPlaceholders);
      const fieldworkIssue = context?.mode === 'demonstration'
        ? simulatedFieldworkSentenceIssue(
            withoutPlaceholders,
            context.pilotPending ?? false,
            context.screening ?? [],
            context.duplicatesMarked ?? false,
          )
        : '';

      // Hydrate placeholders first so OR guard and Row-Entity Alignment can inspect the full sentence!
      const hydratedSentence = sanitizeV2Paragraph(
        sentence.replace(PLACEHOLDER_RE, (full, id: string, offset: number, src: string) => {
          if (factMap.has(id)) {
            const val = factMap.get(id)!;
            if (/^\d{2,6}$/u.test(val.trim())) {
              const beforeSlice = src.slice(Math.max(0, offset - 4), offset);
              const afterSlice = src.slice(offset + full.length, offset + full.length + 4);
              if (
                /(?:矩阵|方案|模型|台账|框架|清单|路线|图谱|量表|表|图)$/u.test(beforeSlice) &&
                !/^\s*(?:[-–—.0-9%％份人名例道题项条个类维种天周月年次元分步级届)）\]])/u.test(afterSlice)
              ) {
                return '';
              }
            }
            return val;
          }
          return exhibitMap.get(id) ?? refMap.get(id) ?? '';
        }),
      );

      const paragraphMentionsOr = OR_CONTEXT_CUE.test(cleanedPara) || backedMethods.some(m => /logistic|logit/iu.test(m));
      const orMisread =
        PROBABILITY_MULTIPLE_CLAIM.test(hydratedSentence) &&
        paragraphMentionsOr &&
        !NEGATED_OR_PROB.test(hydratedSentence);

      // Mask grammatical non-statistics on the unexpanded sentence (placeholders masked too) and verify all remaining digits!
      const maskedForDigits = maskGrammaticalNonStatistics(
        sentence.replace(/−/gu, '-'),
        labels,
        referenceYears,
      );

      let unverifiedNumber = '';
      for (const nm of maskedForDigits.matchAll(/([+-]?\d+(?:\.\d+)?)\s*([%％])?/gu)) {
        const idx = nm.index!;
        const rawTok = nm[0].trim();
        const numVal = Number(nm[1]);
        if (!Number.isFinite(numVal)) continue;
        const u = decimalUlp(nm[1]);
        const afterSlice = maskedForDigits.slice(idx + nm[0].length, idx + nm[0].length + 8);
        const hasPct = Boolean(nm[2]) || /^\s*个百分点/u.test(afterSlice);

        if (isContextualStandardCutoff(sentence.replace(/−/gu, '-'), idx, rawTok, Math.abs(numVal), Boolean(nm[2]))) {
          continue;
        }

        const beforeSlice = sentence.slice(Math.max(0, idx - 16), idx);
        const allowUnsigned = /(?:下降|降低|减少|负向|损耗|绝对值|Worse)/iu.test(beforeSlice);
        const matched = pool.some(cand => matchesNumericEntry(numVal, u, hasPct, cand, allowUnsigned));
        if (!matched) {
          unverifiedNumber = rawTok;
          break;
        }
      }

      const entitySwap = !unknownToken && !unverifiedNumber
        ? detectEntityMisalignment(hydratedSentence, entityIndex, exemptMatrixOrMultiItem)
        : null;

      const reason = unknownToken
        ? '引用了不存在的占位符'
        : misboundRate
          ? '比率处引用了不是比率的数字'
          : mismatched
            ? mismatched
            : FACT_AS_EXHIBIT.test(sentence)
              ? '把数字当作图表引用（“见…”“…所示”只能跟图表 {G编号}）'
              : orMisread
                ? '将优势比 OR 误读为概率倍数'
                : completedPlan
                  ? '研究计划不能声称已完成调查或得到结果'
                  : fieldworkIssue
                    ? fieldworkIssue
                    : CN_QUANTITY_V2.test(maskedForDigits)
                      ? '用汉字写了数量'
                      : unbacked.length
                        ? `写了未登记的分析（${unbacked.join('、')}）`
                        : unverifiedNumber
                          ? `写了未登记或无法由同表推导的数值（${unverifiedNumber}）`
                          : entitySwap ?? '';

      if (reason) {
        droppedSentences++;
        dropReasons.push(reason);
        flaggedSentences.push({ sentence, reason });
        continue;
      }

      for (const id of tokensFound) {
        if (factMap.has(id)) citedFacts.add(id);
        else if (exhibitMap.has(id)) citedExhibits.add(id);
        else if (refMap.has(id)) citedReferences.add(id);
      }
      keptHydratedSentences.push(hydratedSentence);
      keptDraftSentences.push(sentence);
    }

    if (!keptHydratedSentences.length) {
      droppedParagraphs++;
      continue;
    }

    paragraphs.push(keptHydratedSentences.join(''));
    drafts.push(keptDraftSentences.join(''));
  }

  return {
    paragraphs: paragraphs.slice(0, 12),
    drafts: drafts.slice(0, 12),
    droppedParagraphs,
    droppedSentences,
    dropReasons,
    flaggedSentences,
    citedFacts: [...citedFacts],
    citedExhibits: [...citedExhibits],
    citedReferences: [...citedReferences],
  };
}

export type StatisticalGuardrailCode =
  | 'causal_overreach'
  | 'complete_separation_se'
  | 'micro_sample_factor_model'
  | 'sem_fit_overreach'
  | 'srs_on_convenience_sample'
  | 'circular_cluster_classifier'
  | 'orphan_nlp_section';

export interface StatisticalGuardrailFinding {
  code: StatisticalGuardrailCode;
  severity: 'error' | 'warn';
  message: string;
  sectionTitle?: string;
  excerpt?: string;
}

const CAUSAL_OVERREACH_RE = /(?:直接导致|显著引起|必然引起|决定性引发|充分证明.{0,12}导致|因果证明)/u;
const CAUSAL_HEDGE_RE = /(?:相关关系|横截面|尚不能.{0,8}直接确立因果|非实验|稳健性|有待纵向|谨慎解释)/u;
const EXPERIMENT_DESIGN_RE = /(?:随机对照|RCT|双重差分|DID|断点回归|RDD|工具变量|纵向追踪|面板数据)/u;
const COMPLETE_SEP_RE = /(?:SE|标准误)\s*[=:：]?\s*(\d{2,}(?:\.\d+)?)|\bOR\s*[=:：]?\s*(\d{3,}(?:\.\d+)?)/iu;
const FIRTH_HEDGE_RE = /(?:Firth|惩罚似然|完全分离|准完全分离|合并稀疏类别)/iu;
const FACTOR_MODEL_RE = /(?:因子分析|EFA|CFA|验证性因子|结构方程|SEM|路径分析)/iu;
const SAMPLE_SIZE_RE = /(?:有效样本|样本量|共回收有效问卷|实际样本)\s*(?:[nN]\s*)?[=为达共:：]?\s*(\d{1,5})\s*(?:份|名|人|例)?/u;
const SEM_GOOD_CLAIM_RE = /(?:模型拟合(?:效果)?(?:良好|优秀|理想|达标|较为理想)|整体适配度较高)/u;
const SRS_FORMULA_RE = /(?:Z\s*\^?\s*2\s*[×*]?\s*p\s*\(\s*1\s*[-−]\s*p\s*\)|简单随机抽样(?:样本量)?公式)/iu;
const NON_SRS_DESIGN_RE = /(?:多阶段|分层|整群|配额|方便抽样|非概率|滚雪球|PPS)/u;
const DEFF_MENTION_RE = /(?:Deff|设计效应|design\s*effect)/iu;
const CLUSTER_ALGO_RE = /(?:K-?Means|层次聚类|二阶段聚类|聚类分群|簇标签)/iu;
const CLASSIFIER_ALGO_RE = /(?:GBDT|XGBoost|LightGBM|随机森林|Random\s*Forest|支持向量机|SVM|准确率|Accuracy|AUC)/iu;
const NLP_CUE_RE = /(?:词云|SnowNLP|情感倾向|LDA\s*主题|分词词频|文本挖掘)/iu;
const QUANT_LINK_RE = /(?:Q\d{1,2}|表\s*\d|图\s*\d|维度|变量|满意度|意愿|均值|相关性|回归|卡方)/u;

/**
 * Deterministic methodological red-team check catching common survey/modeling flaws before submission:
 * causal overreach on cross-sectional data, complete-separation SE/OR explosion, micro-sample factor/SEM models,
 * over-threshold SEM spin, unadjusted SRS formulas on complex/convenience samples, circular KMeans->GBDT validation,
 * and unlinked orphan NLP/word-cloud prose.
 */
export function auditStatisticalMethodGuardrails(
  input:
    | EditorContent
    | {
        sections?: ReadonlyArray<{ id?: string; title: string; body: string }>;
        results?: readonly ResultSnapshot[];
      },
): StatisticalGuardrailFinding[] {
  const sections =
    'report' in input && Array.isArray(input.report)
      ? input.report
      : Array.isArray((input as { sections?: unknown }).sections)
        ? ((input as { sections: ReadonlyArray<{ title: string; body: string }> }).sections ?? [])
        : [];
  const results =
    'quality' in input && input.quality?.results
      ? input.quality.results
      : Array.isArray((input as { results?: unknown }).results)
        ? ((input as { results: readonly ResultSnapshot[] }).results ?? [])
        : [];

  const findings: StatisticalGuardrailFinding[] = [];
  const seen = new Set<string>();
  const pushFinding = (item: StatisticalGuardrailFinding) => {
    const key = `${item.code}:${item.sectionTitle ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(item);
  };

  const fullText = sections.map(s => `${s.title}\n${s.body}`).join('\n');
  const isExperimental = EXPERIMENT_DESIGN_RE.test(fullText);

  // Extract conservative global valid sample size n if stated cleanly in text
  let globalSampleN: number | null = null;
  for (const m of fullText.matchAll(new RegExp(SAMPLE_SIZE_RE.source, 'gu'))) {
    const val = Number(m[1]);
    if (Number.isFinite(val) && val >= 5 && val <= 100000) {
      globalSampleN = globalSampleN === null ? val : Math.max(globalSampleN, val);
    }
  }

  for (const sec of sections) {
    const title = sec.title || '未命名章节';
    const body = sec.body || '';
    if (!body.trim()) continue;

    // 1. Cross-sectional causal overreach
    if (!isExperimental) {
      const mCausal = CAUSAL_OVERREACH_RE.exec(body);
      if (mCausal && !CAUSAL_HEDGE_RE.test(body)) {
        pushFinding({
          code: 'causal_overreach',
          severity: 'warn',
          sectionTitle: title,
          excerpt: mCausal[0],
          message: `“${title}”在横截面调查语境下出现强因果措辞（"${mCausal[0]}"），建议改为“显著相关/正向预测/正向关联”并补充横截面外推边界说明。`,
        });
      }
    }

    // 2. Complete separation SE / OR explosion in text
    if (/(?:Logistic|Logit|Probit|回归)/iu.test(body) && !FIRTH_HEDGE_RE.test(body)) {
      for (const m of body.matchAll(new RegExp(COMPLETE_SEP_RE.source, 'giu'))) {
        const seVal = m[1] ? Number(m[1]) : 0;
        const orVal = m[2] ? Number(m[2]) : 0;
        if (seVal > 10 || orVal > 100) {
          pushFinding({
            code: 'complete_separation_se',
            severity: 'error',
            sectionTitle: title,
            excerpt: m[0],
            message: `“${title}”疑似存在逻辑回归完全分离/准完全分离异常数值（${m[0]}），必须采用 Firth 惩罚似然回归或合并稀疏哑变量并说明。`,
          });
          break;
        }
      }
    }

    // 3. Micro-sample EFA / CFA / SEM
    if (FACTOR_MODEL_RE.test(body)) {
      const localNMatch = SAMPLE_SIZE_RE.exec(body);
      const localN = localNMatch ? Number(localNMatch[1]) : globalSampleN;
      if (localN !== null && localN >= 10 && localN < 100) {
        pushFinding({
          code: 'micro_sample_factor_model',
          severity: 'error',
          sectionTitle: title,
          excerpt: `n=${localN}`,
          message: `“${title}”在小样本（n = ${localN} < 100）条件下强行执行因子分析或结构方程模型，统计检验力严重不足，建议改用非参数检验、描述均值差或补充样本量。`,
        });
      }
    }

    // 4. Over-threshold SEM fit spin
    if (SEM_GOOD_CLAIM_RE.test(body)) {
      const rmseaM = /RMSEA\s*[=:：]?\s*(\d+\.\d+)/iu.exec(body);
      const cfiM = /CFI\s*[=:：]?\s*(\d+\.\d+)/iu.exec(body);
      const tliM = /TLI\s*[=:：]?\s*(\d+\.\d+)/iu.exec(body);
      const chiM = /(?:χ²|chi2|卡方)\s*\/\s*df\s*[=:：]?\s*(\d+(?:\.\d+)?)/iu.exec(body);
      const badFit: string[] = [];
      if (rmseaM && Number(rmseaM[1]) > 0.08) badFit.push(`RMSEA=${rmseaM[1]} (>0.08)`);
      if (cfiM && Number(cfiM[1]) < 0.9) badFit.push(`CFI=${cfiM[1]} (<0.90)`);
      if (tliM && Number(tliM[1]) < 0.9) badFit.push(`TLI=${tliM[1]} (<0.90)`);
      if (chiM && Number(chiM[1]) > 5) badFit.push(`χ²/df=${chiM[1]} (>5)`);
      if (badFit.length > 0) {
        pushFinding({
          code: 'sem_fit_overreach',
          severity: 'error',
          sectionTitle: title,
          excerpt: badFit.join(', '),
          message: `“${title}”声称模型拟合良好，但报告指标已越过可接受阈值（${badFit.join('；')}），严禁强行美化拟合度，应如实修正模型或说明残差原因。`,
        });
      }
    }

    // 5. Pure SRS sample-size formula on complex or convenience sample
    if (SRS_FORMULA_RE.test(body) && NON_SRS_DESIGN_RE.test(fullText) && !DEFF_MENTION_RE.test(fullText)) {
      pushFinding({
        code: 'srs_on_convenience_sample',
        severity: 'warn',
        sectionTitle: title,
        message: `“${title}”使用了简单随机抽样（SRS）样本量公式，但方案实际采用复杂/非概率抽样且未乘以设计效应 Deff，请补齐 Deff 修正与配额外推边界。`,
      });
    }

    // 6. Circular KMeans + GBDT/RF self-validation
    if (CLUSTER_ALGO_RE.test(body) && CLASSIFIER_ALGO_RE.test(body)) {
      if (/(?:聚类标签|分群结果|簇类).{0,32}(?:作为目标|预测|验证分类|AUC|准确率)/u.test(body)) {
        pushFinding({
          code: 'circular_cluster_classifier',
          severity: 'error',
          sectionTitle: title,
          message: `“${title}”涉嫌同源循环验证：将无监督聚类（K-Means）生成的标签作为有监督模型（GBDT/随机森林）的目标变量再用高准确率论证模型有效，请改用外部客观结果变量（如真实采纳意愿/消费频次）。`,
        });
      }
    }

    // 7. Orphan NLP / unlinked word cloud
    if (NLP_CUE_RE.test(body) && !QUANT_LINK_RE.test(body)) {
      pushFinding({
        code: 'orphan_nlp_section',
        severity: 'warn',
        sectionTitle: title,
        message: `“${title}”仅孤立呈现文本分词/词云/情感得分，未与问卷量化题项或核心构念维度关联分析，建议补充与实证主表的对照解释。`,
      });
    }
  }

  // Also scan registered quantitative ResultSnapshots for SE > 10 or OR > 100 explosions
  for (const res of results) {
    if (!/logit|logistic|probit/iu.test(res.method)) continue;
    const seCol = res.headers.findIndex(h => /^(?:se|std\.?\s*error|标准误)$/iu.test(h.trim()));
    const orCol = res.headers.findIndex(h => /^(?:or|odds\s*ratio|优势比)$/iu.test(h.trim()));
    for (const row of res.rows) {
      const seNum = seCol >= 0 && typeof row[seCol] === 'number' ? Number(row[seCol]) : 0;
      const orNum = orCol >= 0 && typeof row[orCol] === 'number' ? Number(row[orCol]) : 0;
      if (seNum > 10 || orNum > 100) {
        pushFinding({
          code: 'complete_separation_se',
          severity: 'error',
          sectionTitle: res.title,
          excerpt: `${String(row[0] ?? '')}: SE=${seNum || '-'}, OR=${orNum || '-'}`,
          message: `结果表“${res.title}”中“${String(row[0] ?? '')}”存在标准误/优势比畸高，疑似完全分离，需核查样本单元频数并改用 Firth 回归或合并类别。`,
        });
        break;
      }
    }
  }

  return findings;
}
