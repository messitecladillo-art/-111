/**
 * 全报告 V2 叙事总纲与完整证据三线表引擎（Storyline Brief & Complete Evidence Tables）
 *
 * 解决旧版流水线三大痛点：
 * 1. 终结 draftFacts「最多 80 条事实 / 仅前 6 行 / 每行仅 2 格」导致的统计失明：
 *    formatSectionEvidenceTables 将本节及关联分析结果渲染为完整 Markdown 三线表（保留全部列：
 *    B, SE, β, t, p, VIF, OR, 95% CI, AME, Better, Worse 等，最多 20 行，附 n/total 样本分母与合格应答口径，
 *    以及 KMO、Bartlett、R²、调整 R²、F、似然比 LR χ²、McFadden 伪 R²、轮廓系数等全部模型级指标与表注）；
 * 2. 建立单主责 Claim-Evidence 矩阵（CLM-1..8）：每条核心结论指定唯一 ownerNode 详报精确数字，
 *    非主责章节仅获无数字定性要点（qualitativeTakeaway），并将全篇母洞察（motherInsight）严格限制在
 *    abstract、diagnosis.problems、conclusion.findings 三节注入，根治 28 节数字与口号复读回声；
 * 3. 蒸馏 survey-* 七大语料技能包核心规则（sectionCorpusSkillBlock）：摘要 900–1020 字五步单页锁死、
 *    12–25 字冷峻短句 + 80–120 字带括号统计复句爆发度调律、横截面因果克制、方法最小报告契约、
 *    四要素对策闭环与小规模试点可证伪止损护栏。
 */

import type { EditorContent } from '../editor-model.ts';
import { isDiagramMethod } from '../diagram-figures.ts';
import { matchBlueprintNode } from '../report-blueprint.ts';
import { METHOD_LABELS, suggestedNode } from '../report-placement.ts';
import type { ResultSnapshot } from '../research-quality.ts';
import type { SectionRhetoricalBlueprint } from '../../data/zhengda-empirical-anatomy.ts';
import type { DemoBlueprint, DemoPack } from './demo-study.ts';
import type { ResultsView } from './router.ts';

export type StorylineMode = 'plan' | 'demonstration' | 'empirical';
export type StorylinePack = Omit<DemoPack, 'dataset'> & { dataset: DemoPack['dataset'] | null };

/** 全篇母洞察仅允许注入的三个核心统摄节点，严禁在其余 25 节机械复读。 */
export const MOTHER_INSIGHT_NODES: ReadonlySet<string> = new Set([
  'abstract',
  'diagnosis.problems',
  'conclusion.findings',
]);

const FIELDWORK_SCOPED_NODES: ReadonlySet<string> = new Set([
  'design.sampling',
  'design.schedule',
  'data.pilot',
]);

const PLAN_SCOPED_RE = /^(?:intro|design)\./u;

const SYNTHESIS_EVIDENCE_NODES: ReadonlySet<string> = new Set([
  'abstract',
  'diagnosis.problems',
  'plan.measures',
  'plan.feasibility',
  'conclusion.findings',
  'conclusion.suggestions',
  'conclusion.limits',
]);

export type StorylineClaim = {
  claimId: string;
  /** 唯一允许详报该结论完整统计数字的章节节点 ID */
  ownerNode: string;
  title: string;
  /** 仅供 ownerNode 展开论证的精确统计证据摘要 */
  detailedEvidence: string;
  /** 供非主责章节衔接呼应的纯定性判断（严禁含具体统计数字） */
  qualitativeTakeaway: string;
  resultIds: string[];
  boundary: string;
};

export type ClusterPersona = {
  clusterId: string;
  academicName: string;
  profileSummary: string;
  strategyFocus: string;
};

export type StorylineBrief = {
  topicTitle: string;
  mode: StorylineMode;
  motherInsight: string;
  claims: StorylineClaim[];
  clusterPersonas: ClusterPersona[];
  /** 精确锁定各聚类簇编号（第 1..k 类）标准化中心与各维度最低分短板簇归属，防止对策章张冠李戴错配簇号 */
  clusterPersonaMap?: string[];
  /** 锚定基层微观实情与当地特色政策工具清单（与 RichStudyBlueprint.localGovernancePolicies 自动联动） */
  localGovernancePolicies?: string[];
  chapterBridges: Record<string, string>;
  pilotGuardrails: string[];
  /** 自主 ReAct 探索过程中的模型修正轨迹与异质性反转发现 */
  autonomousPivots?: string[];
};

const EXTRA_METHOD_LABELS: Readonly<Record<string, string>> = {
  kano: 'KANO 需求分类与敏感度分析',
  'multi-response': '多选题个案普及率与响应占比分析',
  'text-mining': '开放题高频语义提及率挖掘',
  pilot: '预调查信效度检验',
  'pilot-pretest': '预调查信效度与题项修正检验',
  reconciliation: '样本分母与跳题路由核对台账',
  'denominator-reconciliation': '样本分母与条件跳题路由核对台账',
  'grounded-coding': '定性深访扎根三级编码',
  'stop-loss': '试点决策与可证伪止损矩阵',
  'pilot-decision-matrix': '可证伪试点验证与止损熔断矩阵',
  infographic: '受访者特征与行为复合信息图',
  cooccurrence: '文献与核心构念关键词共现聚类网络',
  'macro-trend': '宏观行业规模与渗透率趋势统计',
  'summary-card': '核心逻辑与分类支持路径结构化总结图',
};

/** 补充 data/zhengda-empirical-anatomy.ts 未覆盖的 2 个新增 Wave-1 节点修辞蓝图 */
export const FALLBACK_RHETORICAL_BLUEPRINTS: Readonly<Record<string, SectionRhetoricalBlueprint>> = {
  'segments.cluster': {
    nodeId: 'segments.cluster',
    chapterGroup: '四、多维建模与诊断分析',
    sectionName: '受访者异质性聚类与学术画像',
    structuralArc: '变量标准化与轮廓系数优选类别数依据 → 各簇标准化中心梯度与学术画像命名 → 外生预算与痛点列联交叉效度验证。',
    openingMove: '为识别总体均值掩盖下的受众结构分化，本节对核心评价维度作标准化处理并依托轮廓系数优选分群方案（见{G1}）。',
    exhibitBridge: '结合聚类中心剖面与外生行为交叉检验结果（见{G1}），各细分人群在体验敏感点与支付意愿上呈现出清晰梯度。',
    judgeCheckpoint: '必须交代类别数优选依据并赋予学术化群体画像名称，且须以未参与聚类的外生变量验证分群区分度，严禁同变量循环自证。',
    recommendedNotes: '按“轮廓系数定类依据→学术画像特征拆解→外生交叉检验与差异化触达指向”三步推进。',
  },
  'plan.feasibility': {
    nodeId: 'plan.feasibility',
    chapterGroup: '五、对策闭环与总结展望',
    sectionName: '方案可行性评估与小规模试点止损护栏',
    structuralArc: '受众机制支持度与主渠道触达可行性依据 → 小范围对照试点验证方案 → 可证伪评估阈值与触发式止损回退边界。',
    openingMove: '为防范横截面相关结论直接外推为全面铺开政策的风险，本节从受众接受基础、渠道成本约束与小规模对照试点三方面审视方案可行性。',
    exhibitBridge: '对照试点决策与止损评估台账（见{G1}），各项干预措施均预设观察窗口、正向转化门槛与负向摩擦回退红线。',
    judgeCheckpoint: '横截面关联不等于干预净因果增益，必须写明先行小范围对照试点、核心追踪口径及未达预期时的止损调整条件。',
    recommendedNotes: '紧扣受众支持基础、现有高占比渠道复用及可证伪试点止损矩阵展开审慎可行性论证。',
  },
};

export function inferResultNode(r: ResultSnapshot): string {
  if (r.method === 'macro-trend' || /^rich-macro-trend-/u.test(r.id)) return 'intro.background';
  if (r.method === 'summary-card' || /-(?:significance|innovation|conclusion)-summary-/u.test(r.id)) {
    const probe = `${r.id} ${r.title}`;
    if (/significance|研究意义|理论拓展/iu.test(probe)) return 'intro.significance';
    if (/innovation|研究创新|创新架构|创新点/iu.test(probe)) return 'intro.innovation';
    if (/conclusion|核心实证发现|全景总结|研究结论/iu.test(probe)) return 'conclusion.findings';
    return 'plan.measures';
  }
  if (r.method === 'cooccurrence') return 'intro.literature';
  if (r.method === 'wordcloud' && /Q32|主动建言|开放题/u.test(`${r.id} ${r.title}`)) return 'sample.descriptive';
  if (r.method === 'infographic') {
    return /behavior|行为|频次|渠道|预算/iu.test(`${r.id} ${r.title}`) ? 'sample.descriptive' : 'sample.profile';
  }
  if (r.method === 'pilot' || r.method === 'pilot-pretest' || /预调查|预调研|预测试/u.test(r.title)) return 'data.pilot';
  if (r.method === 'kano') return 'diagnosis.evaluation';
  if (r.method === 'multi-response' || r.method === 'text-mining') return 'sample.descriptive';
  if (r.method === 'pilot-decision-matrix' || r.method === 'stop-loss' || /止损|可行性|试点决策/u.test(r.title)) return 'plan.feasibility';
  if (r.method === 'grounded-coding' || /三级编码|扎根/u.test(r.title)) return 'diagnosis.problems';
  if (r.method === 'denominator-reconciliation' || r.method === 'reconciliation' || /分母.*核对|样本.*核对|跳题.*台账/u.test(r.title)) return 'data.cleaning';
  if (r.method === 'crosstab' && r.variables?.[0] && /聚类|分群|簇/u.test(r.variables[0])) return 'segments.cluster';
  return suggestedNode(r);
}

/**
 * 在 workingReport 清空已有 paragraph 块之前，提取紧邻各登记表/图的「注：…」表底诊断脚注
 * （含 KMO、Bartlett χ²、R²、调整 R²、F、似然比 LR χ²、McFadden 伪 R²、平均轮廓系数 s̄ 等关键统计量）。
 */
export function collectPreservedResultNotes(content: EditorContent): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (id: string, note: string) => {
    const clean = note
      .replace(/严禁将[^。；\n]*绘制成饼图[。；]?/gu, '')
      .replace(/[^。；\n]*不证明[^。；\n]*获奖水平[。；]?/gu, '')
      .replace(/不要只为提高[^。；\n]*删除题项[。；]?/gu, '')
      .replace(/超出计分范围\s*0\s*行[。；]?/gu, '')
      .replace(/多选题须先按选项拆列[^。；\n]*[。；]?/gu, '')
      .replace(/(?:\\alpha|α|Cronbach)[^。；\n]{0,12}不证明[^。；\n]*[。；]?/giu, '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (!id || !clean) return;
    const list = map.get(id) ?? [];
    if (!list.includes(clean)) list.push(clean);
    map.set(id, list);
  };

  for (const sec of content.report) {
    const blocks = sec.blocks ?? [];
    let lastEvidenceId = '';
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if ((b.kind === 'table' || b.kind === 'chart') && b.evidenceId) {
        lastEvidenceId = b.evidenceId;
        continue;
      }
      if (b.kind === 'paragraph' && lastEvidenceId) {
        const trimmed = b.text.trim();
        if (/^(?:注[:：]|表注[:：]|说明[:：])/u.test(trimmed)
          || /(?:KMO|Bartlett|调整\s*R|McFadden|似然比检验|轮廓系数|Breusch|分界线为)/iu.test(trimmed)) {
          // 仅提取表底注或纯模型级拟合指标句，避免混入整段旧模板散文造成复读
          if (/^(?:注[:：]|表注[:：])/u.test(trimmed)) {
            push(lastEvidenceId, trimmed);
          } else {
            for (const sent of trimmed.split(/(?<=[。；])/u)) {
              if (/(?:KMO|Bartlett|调整后?\s*\$?R|McFadden|似然比检验|轮廓系数|Breusch)/iu.test(sent) && sent.length <= 220) {
                push(lastEvidenceId, sent.replace(/^由\[\[[^\]]+\]\](?:和\[\[[^\]]+\]\])?可知[，,]?/u, '').trim());
              }
            }
          }
        }
      }
    }
  }
  return map;
}

function formatTableCell(header: string, cell: string | number | null): string {
  if (cell === null || cell === undefined) return '—';
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return '—';
    const isPctHeader = /[%％]|占比|比例|普及率|有效率|贡献率/u.test(header);
    const isPHeader = /^(?:p|sig|显著性)(?:\s*[（(].*[)）]|\s*值)?$/iu.test(header.trim());
    if (isPHeader && cell >= 0 && cell < 0.001 && cell > 0) return '<0.001';
    if (Number.isInteger(cell)) return `${cell}${isPctHeader ? '%' : ''}`;
    const formatted = Math.abs(cell) < 1 && !isPctHeader ? cell.toFixed(3) : cell.toFixed(2);
    const trimmed = formatted.replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
    return `${trimmed}${isPctHeader ? '%' : ''}`;
  }
  const text = String(cell).replace(/\|/gu, '｜').replace(/\r?\n/gu, ' ').trim();
  return text || '—';
}

function formatScalarMetric(label: string, value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  const hasPct = /[%％]/u.test(label);
  if (/(?:^|[^a-z])p(?:\s*值|$|[^a-z])|显著性|sig/iu.test(label) && value >= 0 && value < 0.001 && value > 0) {
    return '<0.001';
  }
  if (Number.isInteger(value)) return `${value}${hasPct ? '%' : ''}`;
  const digits = Math.abs(value) < 1 && !hasPct ? 3 : 2;
  const clean = value.toFixed(digits).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
  return `${clean}${hasPct ? '%' : ''}`;
}

function summarizeChartMetrics(r: ResultSnapshot): string[] {
  const sep = '｜';
  const encoded = r.metrics.filter(m => m.label.includes(sep) && m.value !== null && Number.isFinite(m.value));
  if (!encoded.length) return [];

  if (r.method === 'validity') {
    const eigens = encoded
      .filter(m => m.label.startsWith(`特征值${sep}`))
      .map(m => `${m.label.replace(sep, ' ')}=${formatScalarMetric(m.label, m.value!)}`);
    return eigens.length ? [`相关矩阵特征值序列：${eigens.join('，')}`] : [];
  }
  if (r.method === 'ipa') {
    const lines = encoded.filter(m => m.label.startsWith(`分界线${sep}`));
    if (lines.length) {
      return [`IPA 四象限均值分界阈值：${lines.map(m => `${m.label.slice(m.label.indexOf(sep) + 1)}=${formatScalarMetric(m.label, m.value!)}`).join('，')}`];
    }
    return [];
  }
  if (r.method === 'regression' && !r.headers.some(h => /CI|置信区间/iu.test(h))) {
    const byHead = new Map<string, { low?: number; high?: number }>();
    for (const m of encoded) {
      const at = m.label.lastIndexOf(sep);
      const head = m.label.slice(0, at);
      const field = m.label.slice(at + 1);
      const entry = byHead.get(head) ?? {};
      if (field === '下限') entry.low = m.value!;
      if (field === '上限') entry.high = m.value!;
      byHead.set(head, entry);
    }
    const intervals = [...byHead.entries()]
      .filter(([, v]) => v.low !== undefined && v.high !== undefined)
      .slice(0, 12)
      .map(([name, v]) => `${name} [${v.low!.toFixed(3)}, ${v.high!.toFixed(3)}]`);
    return intervals.length ? [`非标准化系数 B 的 95% CI：${intervals.join('；')}`] : [];
  }
  return [];
}

function formatEligibilityLine(r: ResultSnapshot): string {
  const parts: string[] = [
    `有效分析样本 n = ${r.n} / 总记录 total = ${r.total}`,
  ];
  if (r.total > r.n) {
    parts.push(`排除/跳题未纳入 ${r.total - r.n} 份`);
  }
  if (r.classification === 'simulated') {
    parts.push('教学模拟数据');
  }
  const receipt = r.receipt;
  if (receipt) {
    const s = receipt.sample;
    if (s.missingRows > 0 || s.invalidRows > 0) {
      parts.push(`题项缺失 ${s.missingRows} 份、无效编码 ${s.invalidRows} 份`);
    }
    if (receipt.percentageBasis === 'effective-sample') {
      parts.push('百分比分母：该题有效作答样本 n');
    } else if (receipt.percentageBasis === 'row-total') {
      parts.push('百分比分母：各行分组样本小计');
    }
    const calc = receipt.calculation;
    if (calc?.filter) {
      parts.push(`子样本筛选条件：列#${calc.filter.column + 1} ∈ {${calc.filter.values.join(', ')}}（条件合格分支 ${calc.sample.branchRows} 份）`);
    }
    const routing = calc?.routing?.analysis;
    if (routing && routing.ineligibleRows > 0) {
      parts.push(`跳题路由核算：条件合格样本 ${routing.eligibleRows} 份，结构性跳过不适用 ${routing.ineligibleRows} 份`);
    }
  }
  return parts.join('；');
}

function formatInferenceDiagnostics(r: ResultSnapshot): string[] {
  const lines: string[] = [];
  const inf = r.receipt?.inference;
  if (inf) {
    const p = inf.primary;
    const statText = p.statistic
      ? `${p.statistic.label}${p.statistic.df?.length ? `(${p.statistic.df.join(', ')})` : ''} = ${formatScalarMetric(p.statistic.label, p.statistic.value)}`
      : '';
    const pText = p.p !== null ? (p.p < 0.001 ? 'p < 0.001' : `p = ${p.p.toFixed(3)}`) : '';
    const effText = p.effect && p.effect.value !== null
      ? `${p.effect.name} = ${formatScalarMetric(p.effect.name, p.effect.value)}${p.effect.interval ? ` (95% CI [${p.effect.interval.lower.toFixed(3)}, ${p.effect.interval.upper.toFixed(3)}])` : ''}`
      : '';
    lines.push(`主检验（${p.name}）：${[statText, pText, effText, p.line].filter(Boolean).join('；')}`);
    for (const rob of inf.robustness.slice(0, 3)) {
      lines.push(`稳健复核（${rob.name}）：${rob.line}`);
    }
    if (inf.notes.length) lines.push(`统计前提提醒：${inf.notes.join('；')}`);
  }
  if (r.receipt?.interpretation?.trim()) {
    lines.push(`结果口径说明：${r.receipt.interpretation.trim()}`);
  }
  return lines;
}

export const INTERNAL_META_WARNING_RE =
  /严禁将.*绘制成饼图|不证明.*获奖水平|当前产物为草稿|仅校验文件是否相同|不要只为提高.*删除题项|超出计分范围\s*0\s*行|多选题须先按选项拆列|(?:\\alpha|α|Cronbach)\s*不证明/iu;

/**
 * 为当前撰写章节渲染完整 Markdown 三线表与全部统计诊断参数（最多展示每表 20 行、保留全部列与模型级拟合优度）。
 */
export function formatSectionEvidenceTables(
  held: NonNullable<ResultsView>,
  content: EditorContent,
  nodeId: string,
  options?: {
    maxTables?: number;
    maxRows?: number;
    preservedNotes?: ReadonlyMap<string, readonly string[]>;
  },
): string {
  const maxRows = options?.maxRows ?? 20;
  const preservedNotes = options?.preservedNotes ?? collectPreservedResultNotes(content);
  const targetSec = content.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
  const ownEvidenceIds = new Set(
    (targetSec?.blocks ?? [])
      .filter(b => (b.kind === 'chart' || b.kind === 'table') && b.evidenceId)
      .map(b => b.evidenceId),
  );

  // Build exhibit anchor lookup ({G1}..{Gn}) matching buildSectionTokens ordering
  const allExhibitBlocks: { blockId: string; evidenceId: string; kind: 'chart' | 'table'; isOwn: boolean }[] = [];
  const fieldworkScopedIds = new Set(
    held.results
      .filter(r => ownEvidenceIds.has(r.id) || inferResultNode(r) === nodeId)
      .map(r => r.id),
  );
  for (const sec of content.report) {
    const isOwn = sec.id === targetSec?.id;
    for (const b of sec.blocks ?? []) {
      if (b.kind === 'chart' || b.kind === 'table') {
        if (FIELDWORK_SCOPED_NODES.has(nodeId) && !fieldworkScopedIds.has(b.evidenceId)) continue;
        allExhibitBlocks.push({ blockId: b.id, evidenceId: b.evidenceId, kind: b.kind, isOwn });
      }
    }
  }
  allExhibitBlocks.sort((a, b) => Number(b.isOwn) - Number(a.isOwn));
  const gAnchorsByResult = new Map<string, string[]>();
  allExhibitBlocks.slice(0, 14).forEach((item, idx) => {
    if (!item.evidenceId) return;
    const list = gAnchorsByResult.get(item.evidenceId) ?? [];
    list.push(`{G${idx + 1}}（${item.kind === 'chart' ? '图' : '表'}）`);
    gAnchorsByResult.set(item.evidenceId, list);
  });

  // Select scoped results for nodeId
  let selected: ResultSnapshot[] = [];
  if (FIELDWORK_SCOPED_NODES.has(nodeId)) {
    selected = held.results.filter(r => ownEvidenceIds.has(r.id) || inferResultNode(r) === nodeId);
  } else if (PLAN_SCOPED_RE.test(nodeId)) {
    selected = held.results.filter(r => ownEvidenceIds.has(r.id) || inferResultNode(r) === nodeId);
  } else if (SYNTHESIS_EVIDENCE_NODES.has(nodeId)) {
    // Note: `ipa` is deliberately excluded from non-owner synthesis tables so IPA cutoff/coordinate decimals
    // stay strictly confined to `diagnosis.evaluation` (stopping 6-chapter IPA decimal repetition!).
    const priorityMethods = new Set([
      'quality-control', 'denominator-reconciliation', 'alpha', 'validity',
      'correlation', 'profile', 'crosstab', 'regression', 'logistic',
      'cluster', 'kano', 'multi-response', 'text-mining',
      'grounded-coding', 'pilot-decision-matrix', 'stop-loss',
    ]);
    const own = held.results.filter(r => ownEvidenceIds.has(r.id) || inferResultNode(r) === nodeId);
    let seenAlpha = 0;
    let seenCrosstab = 0;
    const core = held.results.filter(r => {
      if (own.includes(r) || isDiagramMethod(r.method) || !priorityMethods.has(r.method)) return false;
      if (r.method === 'alpha') {
        seenAlpha++;
        return seenAlpha <= 1 || /总量表|综合/u.test(r.title);
      }
      if (r.method === 'crosstab') {
        seenCrosstab++;
        return seenCrosstab <= 2;
      }
      return true;
    });
    selected = [...own, ...core];
  } else {
    const own = held.results.filter(r => ownEvidenceIds.has(r.id) || inferResultNode(r) === nodeId);
    selected = own;
  }

  const maxTables = options?.maxTables ?? (SYNTHESIS_EVIDENCE_NODES.has(nodeId) ? 16 : 10);
  selected = selected.slice(0, maxTables);
  if (!selected.length) return '';

  const blocks: string[] = [];
  for (const r of selected) {
    const methodLabel = METHOD_LABELS[r.method] ?? EXTRA_METHOD_LABELS[r.method] ?? r.method;
    const gAnchors = gAnchorsByResult.get(r.id)?.join('、') ?? '';
    const headerLine = `### 登记证据表 [${r.id}] ${r.title}（方法：${methodLabel}）${gAnchors ? `｜正文引用锚点：${gAnchors}` : ''}`;

    // Skip coordinate/diagram spec rows for pure framework/diagram/summary-card/cooccurrence/panoramic snapshots while retaining their anchor
    if (r.method === 'framework' || r.method === 'diagram' || r.method === 'summary-card') {
      blocks.push(`${headerLine}\n- 图谱说明：结构化逻辑框架/分类支持路径与核心发现总结图${gAnchors ? `，正文中用 ${gAnchors} 自然指代解读，严禁从框架卡片虚构未登记定量统计数字` : ''}。`);
      continue;
    }
    if (r.method === 'cooccurrence') {
      blocks.push(
        `${headerLine}\n- 文献关键词共现聚类网络引述护栏：本图呈现研究领域核心主题词的共现聚类社区与跨簇桥接关系${gAnchors ? `（正文中用 ${gAnchors} 自然引出）` : ''}；请结合已登记理论文献评述各主题簇脉络与微观机制空白，严禁在正文中直接书写制图软件英文商标名，严禁捏造未登记文献篇数！`,
      );
      continue;
    }
    if (r.method === 'infographic' && /全景示意图/u.test(r.title)) {
      blocks.push(
        `${headerLine}\n- 全景配图引述护栏：本图为课题调查对象与核心研究场景的定性视觉全景示意图${gAnchors ? `（正文中用 ${gAnchors} 自然引入）` : ''}；仅作目标群体与典型场景的定性概览导读，严禁从插图本身虚构或读取任何定量统计人数与百分比！`,
      );
      continue;
    }

    const metaLines: string[] = [`- 样本与合格应答口径：${formatEligibilityLine(r)}`];

    // Direct scalar metrics (without internal chart separator `｜`)
    const scalarMetrics = r.metrics
      .filter(m => !m.label.includes('｜') && m.value !== null && Number.isFinite(m.value))
      .map(m => `${m.label} = ${formatScalarMetric(m.label, m.value!)}`);
    if (scalarMetrics.length) {
      metaLines.push(`- 登记统计指标：${scalarMetrics.join('；')}`);
    }

    for (const chartSummary of summarizeChartMetrics(r)) {
      metaLines.push(`- ${chartSummary}`);
    }
    for (const infLine of formatInferenceDiagnostics(r)) {
      metaLines.push(`- ${infLine}`);
    }
    const notes = preservedNotes.get(r.id) ?? [];
    for (const note of notes) {
      metaLines.push(`- 模型拟合与表底注：${note}`);
    }
    const publicWarnings = r.warnings.filter(w => !INTERNAL_META_WARNING_RE.test(w));
    if (publicWarnings.length) {
      metaLines.push(`- 统计诊断与边界说明：${publicWarnings.join('；')}`);
    }
    if (r.method === 'kano') {
      metaLines.push(
        '- KANO 读表防错护栏：第 2–7 列依次为必备型 M(%)、期望型 O(%)、魅力型 A(%)、无差异型 I(%)、反向型 R(%)、可疑结果 Q(%) 的配对样本占比，第 8 列为最终需求归类，第 9–10 列 Better=(A+O)/(A+O+M+I)（满意敏感度系数，正值）与 Worse=-(O+M)/(A+O+M+I)（不满敏感度系数，负值）均非人数百分比；严禁将 M(%)、O(%) 列数值误引作魅力型 A(%) 占比，也严禁将 Better 系数当作某类需求人数百分比！',
      );
    }

    let mdTable = '';
    if (r.headers.length && r.rows.length) {
      const cleanHeaders = r.headers.map(h => h.replace(/\|/gu, '｜').replace(/\s+/gu, ' ').trim() || '指标');
      const alignRow = cleanHeaders.map((_, idx) => (idx === 0 ? ':---' : '---:'));
      const shownRows = r.rows.slice(0, maxRows).map(row =>
        cleanHeaders.map((h, colIdx) => formatTableCell(h, row[colIdx] ?? null)),
      );
      const tableLines = [
        `| ${cleanHeaders.join(' | ')} |`,
        `| ${alignRow.join(' | ')} |`,
        ...shownRows.map(cells => `| ${cells.join(' | ')} |`),
      ];
      if (r.rows.length > maxRows) {
        tableLines.push(`> 表注：完整登记结果共 ${r.rows.length} 行，上表展示前 ${maxRows} 行全列明细。`);
      }
      mdTable = `\n${tableLines.join('\n')}`;
    }

    blocks.push(`${headerLine}\n${metaLines.join('\n')}${mdTable}`);
  }

  return blocks.join('\n\n');
}

function stripDigitsForQualitative(text: string): string {
  return text
    .replace(/\d+(?:\.\d+)?%?/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/([，,；;。])\1+/gu, '$1')
    .trim();
}

function compactNeutralDimStem(raw: string): string {
  const cleaned = stripDigitsForQualitative(raw)
    .replace(/[()（）「」【】\[\]]/gu, '')
    .replace(/(?:标准化中心|合成分|子量表|均值|得分|评分|评价|感知|程度|水平|情况)$/u, '')
    .trim();
  return (cleaned || '核心体验').slice(0, 14);
}

function deriveAcademicClusterPersonas(
  clusterSnap: ResultSnapshot | undefined,
  topic: DemoBlueprint,
): ClusterPersona[] {
  const dim0 = compactNeutralDimStem(topic.dimensions[0]?.short ?? '操作体验');
  const dim1 = compactNeutralDimStem(topic.dimensions[1]?.short ?? '规则说明');
  const defaultPersonas: ClusterPersona[] = [
    {
      clusterId: '第 1 类',
      academicName: '多维高评组',
      profileSummary: `在“${topic.shortTitle}”各入模评价维度标准化中心整体高于样本均值`,
      strategyFocus: '保持现有服务体验水准，巩固规范透明的标准服务流程',
    },
    {
      clusterId: '第 2 类',
      academicName: `${dim0}低评组`,
      profileSummary: `部分体验尚可，但在“${dim0}”维度标准化中心明显偏低，受该环节摩擦制约`,
      strategyFocus: `严格对准“${dim0}”短板开展针对性流程优化与试点核验`,
    },
    {
      clusterId: '第 3 类',
      academicName: `${dim1}低评组`,
      profileSummary: `在“${dim1}”维度标准化中心处于全样本最低水平，存在明显体验断点`,
      strategyFocus: `严格对准“${dim1}”最低分环节优先提供改善支持与人工兜底`,
    },
    {
      clusterId: '第 4 类',
      academicName: '均衡中评组',
      profileSummary: '各入模维度得分贴近总体均值，无极端单维偏离',
      strategyFocus: '维持核心入口顺畅，按常规标准流程稳步服务',
    },
    {
      clusterId: '第 5 类',
      academicName: '综合低评组',
      profileSummary: '多项入模评价维度均低于样本均值，存在复合体验阻力',
      strategyFocus: '结合低门槛引导触点分步排查主要受阻环节',
    },
  ];

  if (!clusterSnap || !clusterSnap.rows.length) {
    return defaultPersonas.slice(0, 3);
  }

  const dimHeaders = clusterSnap.headers.slice(3).map(h => h.replace(/\s+/gu, ' ').trim());

  // Rank clusters by average standardized center across numeric columns >= 3 so neutral names match actual data centers!
  const parsed = clusterSnap.rows.map((row, idx) => {
    const rawCell = String(row[0] ?? `第 ${idx + 1} 类`).trim();
    const baseIdMatch = /^第\s*\d+\s*类/u.exec(rawCell);
    const clusterId = baseIdMatch ? baseIdMatch[0].replace(/\s+/gu, ' ') : rawCell;
    const embeddedMatch = /[（(]([^（）()]{2,24})[)）]/u.exec(rawCell);
    const embeddedName = embeddedMatch && !/\d|Cluster/iu.test(embeddedMatch[1]) ? embeddedMatch[1].trim() : null;
    const pairs: { dim: string; val: number }[] = [];
    row.slice(3).forEach((c, dIdx) => {
      const num = Number(String(c ?? '').replace(/−/gu, '-'));
      if (Number.isFinite(num)) {
        pairs.push({ dim: dimHeaders[dIdx] || `维度${dIdx + 1}`, val: num });
      }
    });
    const avgCenter = pairs.length
      ? pairs.reduce((a, b) => a + b.val, 0) / pairs.length
      : 0;
    const sortedDims = [...pairs].sort((a, b) => a.val - b.val);
    return { idx, clusterId, embeddedName, avgCenter, sortedDims };
  });

  const sortedByCenter = [...parsed].sort((a, b) => b.avgCenter - a.avgCenter);
  const highestIdx = sortedByCenter[0]?.idx ?? 0;
  const usedNames = new Set<string>(['多维高评组']);

  return parsed.map(item => {
    const minDim = item.sortedDims[0];
    const maxDim = item.sortedDims.at(-1);
    let canonicalName: string;
    if (item.embeddedName) {
      canonicalName = item.embeddedName;
      usedNames.add(canonicalName);
    } else if (item.idx === highestIdx) {
      canonicalName = '多维高评组';
    } else {
      let chosen = '';
      for (const cand of item.sortedDims) {
        const candidateLabel = `${compactNeutralDimStem(cand.dim)}低评组`;
        if (!usedNames.has(candidateLabel)) {
          chosen = candidateLabel;
          break;
        }
      }
      canonicalName = chosen || defaultPersonas[Math.min(item.idx, defaultPersonas.length - 1)].academicName;
      usedNames.add(canonicalName);
    }

    const cleanDim = (s: string) => stripDigitsForQualitative(s).replace(/[()（）]/gu, '').trim();
    const minDimName = minDim ? cleanDim(minDim.dim) : '';
    const maxDimName = maxDim ? cleanDim(maxDim.dim) : '';
    const profileSummary = minDimName && maxDimName && minDimName !== maxDimName
      ? item.idx === highestIdx
        ? `各入模维度标准化中心整体高于总体均值，其中“${maxDimName}”表现最高`
        : `主要短板集中落在“${minDimName}”维度，而“${maxDimName}”相对接近或高于均值`
      : defaultPersonas[Math.min(item.idx, defaultPersonas.length - 1)].profileSummary;
    const strategyFocus = minDimName && item.idx !== highestIdx
      ? `严格对准该簇最低分维度“${minDimName}”开展靶向改进与试点评估`
      : defaultPersonas[0].strategyFocus;
    return {
      clusterId: item.clusterId,
      academicName: canonicalName,
      profileSummary,
      strategyFocus,
    };
  });
}

function buildClusterPersonaMap(
  clusterSnap: ResultSnapshot | undefined,
  personas: readonly ClusterPersona[],
): string[] {
  if (!clusterSnap || !clusterSnap.rows.length || clusterSnap.headers.length < 4) return [];
  const dimHeaders = clusterSnap.headers.slice(3).map(h => h.replace(/\s+/gu, ' ').trim());
  const personaById = new Map(personas.map(p => [p.clusterId, p]));
  const lines: string[] = [];

  const dimRows: { clusterId: string; canonicalFull: string; count: string; share: string; vals: (number | null)[] }[] = [];
  for (let i = 0; i < clusterSnap.rows.length; i++) {
    const row = clusterSnap.rows[i];
    const rawCell = String(row[0] ?? `第 ${i + 1} 类`).trim();
    const baseIdMatch = /^第\s*\d+\s*类/u.exec(rawCell);
    const clusterId = baseIdMatch ? baseIdMatch[0].replace(/\s+/gu, ' ') : rawCell;
    const p = personaById.get(clusterId);
    const canonicalFull = p ? `${clusterId}（${p.academicName}）` : clusterId;
    const count = formatTableCell(clusterSnap.headers[1] ?? '样本数', row[1] ?? null);
    const share = formatTableCell(clusterSnap.headers[2] ?? '占比', row[2] ?? null);
    const vals = dimHeaders.map((_, dIdx) => {
      const v = Number(String(row[dIdx + 3] ?? '').replace(/−/gu, '-'));
      return Number.isFinite(v) ? v : null;
    });
    dimRows.push({ clusterId, canonicalFull, count, share, vals });

    const centerPairs = dimHeaders
      .map((d, dIdx) => (vals[dIdx] !== null ? `${d}=${vals[dIdx]!.toFixed(2)}` : ''))
      .filter(Boolean);
    let minIdx = -1;
    let minVal = Infinity;
    vals.forEach((v, dIdx) => {
      if (v !== null && v < minVal) {
        minVal = v;
        minIdx = dIdx;
      }
    });
    const minNote = minIdx >= 0 ? `｜本簇最低分短板维度：“${dimHeaders[minIdx]}”(${minVal.toFixed(2)})` : '';
    lines.push(
      `${canonicalFull}：n=${count}（占比 ${share}），标准化中心 [${centerPairs.join('，')}]${minNote}`,
    );
  }

  const lowestPerDim: string[] = [];
  dimHeaders.forEach((dim, dIdx) => {
    let bestCluster = '';
    let bestVal = Infinity;
    for (const r of dimRows) {
      const v = r.vals[dIdx];
      if (v !== null && v < bestVal) {
        bestVal = v;
        bestCluster = r.clusterId;
      }
    }
    if (bestCluster && Number.isFinite(bestVal)) {
      lowestPerDim.push(`“${dim}”最低分簇为“${bestCluster}”（中心=${bestVal.toFixed(2)}）`);
    }
  });
  if (lowestPerDim.length) {
    lines.push(
      `各维度最低分短板簇精准核对表（分层面改进措施与试点招募指派干预对象时必须严格对齐此簇号，且全篇统一使用上述“第 k 类（××组）”唯一标准名称，严禁另起画像别名）：${lowestPerDim.join('；')}`,
    );
  }
  return lines;
}

function resolveLocalGovernancePolicies(topic: DemoBlueprint): string[] {
  const raw = (topic as DemoBlueprint & { localGovernancePolicies?: unknown }).localGovernancePolicies;
  if (Array.isArray(raw) && raw.length > 0) {
    const normalized = raw
      .map(item => {
        if (typeof item === 'string') return item.replace(/\s+/gu, ' ').trim();
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const parts = [obj.policyName ?? obj.title ?? obj.name, obj.actor, obj.action ?? obj.mechanism ?? obj.detail]
            .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
            .map(v => v.trim());
          return parts.join('：');
        }
        return '';
      })
      .filter(Boolean);
    if (normalized.length > 0) return normalized.slice(0, 6);
  }

  const probe = `${topic.title} ${topic.shortTitle} ${topic.domainLabel}`;
  if (/银发|老龄|老年.*健康|健康监测|慢病|居家养老/u.test(probe)) {
    return [
      '民政部门“居家和社区基本养老服务提升行动”适老化智能终端改造补贴目录准入与大字语音简化验收',
      '街道综合为老服务中心与社区党群驿站“长者数字驿站”社工驻点一对一实操帮办机制',
      '基层社区卫生服务中心“家庭医生签约服务包”慢病随访数据对接（严格执行老年人本人双确认授权与一键撤权）',
      '社区低龄健康老人结对高龄独居老人的“银龄互助员”入户三步操作指引卡制度',
    ];
  }
  if (/闪电仓|即时零售|县域|骑手|前置仓|外卖|配送/u.test(probe)) {
    return [
      '县级商务部门“县域商业建设行动”数字化前置仓温控包装与分拣交接动线改造专项支持',
      '县城住建与城管部门背街小巷及商圈周边“骑手友好微停靠接驳泊位”施划与取货免绕行通道',
      '县级市场监管部门“前置仓阳光食安封签溯源码+临期破损双重复核隔离”常态化巡检清单',
      '县乡村三级共同配送集散节点波次错峰并单与恶劣天气弹性履约时效免罚机制',
    ];
  }
  if (/助餐|长者食堂|老年食堂|社区食堂|配餐/u.test(probe)) {
    return [
      '民政部门“老年助餐服务行动”按龄分级就餐补贴跨社区异地刷卡结算互通机制',
      '街道“中央厨房+社区助餐服务点+志愿送餐入户”三级冷热保温配餐协同网络',
      '基层卫健与市监联动的“低盐低糖适老营养菜谱公示+明厨亮灶食安留样”核查制度',
      '社区网格员与物业联动的行动不便高龄老人错峰订餐登记与入户送餐回访机制',
    ];
  }
  if (/大学生|高校|\bAI\b|人工智能|学习工具|科研|校园/iu.test(probe)) {
    return [
      '高校教务处与研究生院《生成式人工智能辅助课程学习与论文写作分级规范》边界清单与透明引用声明模板',
      '高校图书馆与信息中心“校园合规文献检索核验环境与引文真实性溯源工具”公共服务支撑机制',
      '院系专业课“过程性思维留痕（检索提问演进记录与课堂口头答辩抽检）”课程考核评价改革',
      '学工部门与朋辈学业辅导中心“辅助工具幻觉甄别与启发式助学实操工作坊”分层指导机制',
    ];
  }
  return [
    '区县行业主管部门重点服务触点透明标准清单公示与分级准入激励机制',
    '街道与社区基层便民服务驿站驻点体验辅导与首遇问题现场帮办通道',
    '一线服务运营网点异常工单快速响应接管与服务质量回溯核查台账',
    '政企社联动小微场景改造对照试点与第三方满意度动态复盘挂钩机制',
  ];
}
export function buildDeterministicStorylineBrief(
  pack: StorylinePack,
  topic: DemoBlueprint,
  mode: StorylineMode = 'demonstration',
): StorylineBrief {
  const results = pack.report.quality?.results ?? [];
  const preservedNotes = collectPreservedResultNotes(pack.report);
  const byMethod = (m: string) => results.find(r => r.method === m);

  const qcSnap = byMethod('quality-control');
  const alphaSnaps = results.filter(r => r.method === 'alpha');
  const valSnap = byMethod('validity');
  const multiSnap = byMethod('multi-response');
  const likertSnap = byMethod('likert');
  const crossSnap = byMethod('crosstab');
  const profileSnap = byMethod('profile');
  const corrSnap = byMethod('correlation');
  const regSnap = byMethod('regression');
  const logitSnap = byMethod('logistic') ?? byMethod('logit');
  const cluSnap = byMethod('cluster');
  const cluCrossSnaps = results.filter(
    r => r.method === 'crosstab' && r.variables?.[0] && /聚类|分群|簇/u.test(r.variables[0]),
  );
  const ipaSnap = byMethod('ipa');
  const kanoSnap = byMethod('kano');
  const textSnap = results.find(r => r.method === 'text-mining' || /开放题|高频词/u.test(r.title));
  const groundedSnap = results.find(r => r.method === 'grounded-coding' || /三级编码|扎根/u.test(r.title));
  const stopLossSnap = results.find(r => r.method === 'pilot-decision-matrix' || /止损|可行性|试点决策/u.test(r.title));

  const weakIpaNames = ipaSnap?.rows
    .filter(row => String(row[3] ?? '').includes('重点改进'))
    .map(row => String(row[0]).trim())
    .filter(Boolean) ?? [];
  const primaryBottleneck = weakIpaNames[0] ?? topic.dimensions[0]?.short ?? '核心触点体验';
  const secondaryBottleneck = weakIpaNames[1] ?? topic.dimensions[2]?.short ?? '规则与信息透明';

  const personas = deriveAcademicClusterPersonas(cluSnap, topic);
  const clusterPersonaMap = buildClusterPersonaMap(cluSnap, personas);
  const localGovernancePolicies = resolveLocalGovernancePolicies(topic);
  const targetPersona = personas[1]?.academicName ?? '核心短板低评组';
  const riskPersona = personas[2]?.academicName ?? personas.at(-1)?.academicName ?? '重点受阻低评组';

  // 四元公式母洞察：[表层认知/行为剪刀差] + [深层结构性断点] + [高弹性异质客群靶标] + [可验证机制反转]（零裸数字）
  const motherInsight = stripDigitsForQualitative(
    `围绕“${topic.shortTitle}”，受访群体呈现“整体接触意愿尚可但深度持续转化分流”的结构性张力：` +
    `核心梗阻并非泛化供给不足，而是“${primaryBottleneck}”与“${secondaryBottleneck}”构成的体验—信任双重断点；` +
    `相较于高粘性熟稔群体，“${targetPersona}”与“${riskPersona}”受首遇规则摩擦掣肘最深，` +
    `唯有以透明引导支持机制替代粗放同质补贴并优先靶向修复高重要度低表现短板，方能打通持续转化路径。`,
  );

  const planned = mode === 'plan' || results.length === 0;
  const noteOf = (r: ResultSnapshot | undefined) => (r ? (preservedNotes.get(r.id) ?? []).join('；') : '');

  const claims: StorylineClaim[] = [
    {
      claimId: 'CLM-1',
      ownerNode: 'data.cleaning',
      title: '多规则质控筛查与条件跳题分母核对',
      detailedEvidence: planned
        ? '当前为研究计划阶段：拟按注意力甄别、直线作答排查与重复记录标记执行质控，并严格分离条件跳题结构性缺失与题项漏答分母。'
        : qcSnap
          ? `总记录 total=${qcSnap.total} 份，经质控筛查保留有效样本 n=${qcSnap.n} 份（剔除 ${qcSnap.total - qcSnap.n} 份，有效率 ${((qcSnap.n / Math.max(1, qcSnap.total)) * 100).toFixed(1)}%）；跳题条件受限题项按实际合格应答分母独立核算。`
          : '按已登记数据集核对原始回收、筛查留存及条件跳题合格应答分母。',
      qualitativeTakeaway: '经注意力核验与异常作答逐级筛查并剥离结构性跳题人群后，入模样本基数洁净且各子模块分母口径前后闭合。',
      resultIds: qcSnap ? [qcSnap.id] : [],
      boundary: mode === 'empirical'
        ? '样本经多规则质量筛查仅改善内部作答一致性，总体外推仍需结合抽样覆盖范围审慎评估。'
        : '非概率或模拟样本经清洗仅改善内部作答一致性，不消除总体覆盖偏差。',
    },
    {
      claimId: 'CLM-2',
      ownerNode: 'data.testing',
      title: '多维潜变量量表内部一致性与因子结构效度',
      detailedEvidence: planned
        ? '拟对各潜变量子量表及总量表检验 Cronbach α 系数，并通过 KMO、Bartlett 球形检验及探索性因子旋转核验构念效度与共同方法偏差。'
        : [
            ...alphaSnaps.map(a => `${a.title} n=${a.n}，${a.metrics.map(m => `${m.label}=${m.value}`).join('，')}`),
            valSnap ? `${valSnap.title} n=${valSnap.n}（${noteOf(valSnap) || '旋转因子载荷结构清晰'}）` : '',
          ].filter(Boolean).join('；') || '基于已登记信效度检验表汇报 Cronbach α 与因子结构。',
      qualitativeTakeaway: '各核心潜变量子量表与全量表均具备稳健的内部一致性，探索性因子载荷归属清晰且未见严重单一共同方法偏差。',
      resultIds: [...alphaSnaps.map(a => a.id), ...(valSnap ? [valSnap.id] : [])],
      boundary: '测量信效度仅说明当前样本下构念聚合与区分表现良好，跨场景复用仍需复测。',
    },
    {
      claimId: 'CLM-3',
      ownerNode: 'sample.descriptive',
      title: '使用参与层级、量表极化分布与多选痛点集中度',
      detailedEvidence: planned
        ? '拟结合发散堆叠量表分布与限选多选题（区分个案普及率与响应占比双分母）刻画总体态度均值掩盖下的局部痛点集中态势。'
        : [
            likertSnap ? `量表作答分布（n=${likertSnap.n}）揭示高低分评价维度分化` : '',
            multiSnap ? `多选痛点（有效受访者分母 n=${multiSnap.n}，${multiSnap.metrics.map(m => `${m.label}=${m.value}`).join('、')}）锁定高频摩擦集中项` : '',
          ].filter(Boolean).join('；') || '结合已登记频数与量表分布表剖析高低评价反差。',
      qualitativeTakeaway: '受访群体在基础接触与深度复用之间存在明显断层，主观多选痛点与量表低分洼地高度集中于关键履约与透明环节。',
      resultIds: [likertSnap?.id, multiSnap?.id].filter((x): x is string => Boolean(x)),
      boundary: '多选题个案普及率之和超过百分之百属正常多选口径，严禁混同于互斥单选占比。',
    },
    {
      claimId: 'CLM-4',
      ownerNode: 'compare.tests',
      title: '群际特征列联分化、多维非参数比较与关联矩阵',
      detailedEvidence: planned
        ? '拟以列联表 Pearson χ²（配 Cramér’s V 效应量）、Holm 多重校正 Kruskal–Wallis 检验及 Spearman 秩相关检验群体异质性与维度伴生结构。'
        : [
            crossSnap ? `${crossSnap.title}（n=${crossSnap.n}，${crossSnap.receipt?.inference?.primary.line ?? ''}）` : '',
            profileSnap ? `${profileSnap.title}（n=${profileSnap.n}，${noteOf(profileSnap)}）` : '',
            corrSnap ? `${corrSnap.title}（n=${corrSnap.n}）` : '',
          ].filter(Boolean).join('；') || '依已登记交叉表、组间比较与相关矩阵汇报统计量及效应量。',
      qualitativeTakeaway: `不同${topic.groupConstruct}与${topic.statusConstruct}群体在参与深度及多维体验评价上呈系统性分化，核心感知维度与持续意愿呈稳健正向伴生关系。`,
      resultIds: [crossSnap?.id, profileSnap?.id, corrSnap?.id].filter((x): x is string => Boolean(x)),
      boundary: '双变量差异与秩相关未控制混杂协变量，仅揭示群体分布关联而非净边际效应。',
    },
    {
      claimId: 'CLM-5',
      ownerNode: 'drivers.model',
      title: '连续意愿线性回归与二元转化 Logistic 净效应及机制对比',
      detailedEvidence: planned
        ? '拟构建多元线性回归（报 B、SE、β、t、p、VIF、调整 R²、F）与二元 Logistic 模型（报 B、SE、Wald z、OR、95% CI、AME、LR χ²、McFadden 伪 R²）剥离净预测贡献。'
        : [
            regSnap ? `OLS 回归（n=${regSnap.n}，${noteOf(regSnap)}）` : '',
            logitSnap ? `二元 Logistic 回归（n=${logitSnap.n}，${noteOf(logitSnap)}）` : '',
          ].filter(Boolean).join('；') || '依已登记回归与 Logit 估计表汇报系数、共线性诊断及发生优势比。',
      qualitativeTakeaway: '控制人口与接触背景协变量后，核心服务体验及透明支持型机制对持续意愿与实际转化发生优势均具显著正向预测力，且共线性处于安全区间。',
      resultIds: [regSnap?.id, logitSnap?.id].filter((x): x is string => Boolean(x)),
      boundary: '横截面回归系数与优势比 OR 仅反映统计关联与发生优势倍数，严禁等价于因果决定或概率直接翻倍。',
    },
    {
      claimId: 'CLM-6',
      ownerNode: 'segments.cluster',
      title: '自适应轮廓系数分群画像与外生交叉效度验证',
      detailedEvidence: planned
        ? '拟对标准化体验指标执行自适应 K-means 聚类，依据平均轮廓系数选定类别数，并以未入群的外生预算与痛点变量做交叉验证。'
        : cluSnap
          ? `自适应聚类（n=${cluSnap.n}，${noteOf(cluSnap)}）划分出 ${personas.map(p => `${p.clusterId}“${p.academicName}”`).join('、')}，并经 ${cluCrossSnaps.length} 项外生交叉表验证行为与诉求分化。`
          : '依已登记聚类中心表与外生交叉表刻画各细分人群画像。',
      qualitativeTakeaway: '受访群体可清晰划分为高认同深耕、审慎权衡观望与痛点敏感易流失等差异化画像，各类别在外生预算承受与首要诉求上显著异质。',
      resultIds: [cluSnap?.id, ...cluCrossSnaps.map(c => c.id)].filter((x): x is string => Boolean(x)),
      boundary: '分群边界依赖标准化距离度量，严禁拿参与聚类的原变量方差分析循环自证分群有效。',
    },
    {
      claimId: 'CLM-7',
      ownerNode: 'diagnosis.evaluation',
      title: 'IPA 隐性重要度象限与 KANO 正反配对敏感度双重锁定短板',
      detailedEvidence: planned
        ? '拟结合修正 IPA 四象限矩阵与 KANO 正反配对 Better–Worse 敏感度系数，交叉锁定高重要低表现及高不满敏感的核心改进项。'
        : [
            ipaSnap ? `IPA 矩阵（n=${ipaSnap.n}，${noteOf(ipaSnap)}）锁定重点改进象限：${weakIpaNames.join('、') || primaryBottleneck}` : '',
            kanoSnap ? `KANO 配对分析（n=${kanoSnap.n}）测算 M/O/A/I 归类与 Better–Worse 敏感度` : '',
          ].filter(Boolean).join('；') || '依已登记评价象限与需求分类表识别优先攻坚短板。',
      qualitativeTakeaway: `重要性—表现矩阵与正反需求敏感度分析共同将核心攻坚靶点收敛至“${primaryBottleneck}”等高驱动权重却低实际表现的关键短板。`,
      resultIds: [ipaSnap?.id, kanoSnap?.id].filter((x): x is string => Boolean(x)),
      boundary: '仅对有实际接触经验的合格受访者评估满意度表现，未接触者的结构性跳题不混入表现均值。',
    },
    {
      claimId: 'CLM-8',
      ownerNode: 'plan.feasibility',
      title: '定性编码三角互证与小范围试点可证伪止损护栏',
      detailedEvidence: planned
        ? '拟将开放题语义挖掘、深访三级编码与定量短板互证，并为整改方案设定小规模 A/B 对照试点、追踪窗口与止损回退条件。'
        : [
            textSnap ? `开放题文本挖掘（有效答卷 n=${textSnap.n}）印证高频反馈词簇` : '',
            groundedSnap ? `深访扎根三级编码（${groundedSnap.title}）提取核心痛点范畴` : '',
            stopLossSnap ? `试点决策与止损矩阵（${stopLossSnap.title}）明确对照试运行与触发回退准则` : '',
          ].filter(Boolean).join('；') || '结合定性三级编码与试点止损评估表确立审慎落地边界。',
      qualitativeTakeaway: '开放反馈与深访三级编码从微观情境印证了定量短板成因，配套的小范围对照试点与触发式止损规则保障了改进方案稳妥可控。',
      resultIds: [textSnap?.id, groundedSnap?.id, stopLossSnap?.id].filter((x): x is string => Boolean(x)),
      boundary: '全面推广前须经小范围对照试运行检验净增量，若核心转化未改善或投诉摩擦上升须立即触发回退校准。',
    },
  ];

  const chapterBridges: Record<string, string> = {
    'intro.innovation': '前文虽从政策与文献层面界定了核心矛盾，但抽象构念尚待转化为可复核的观测指标；下文据此展开调查对象界定、量表模块化设计与质控部署。',
    'design.qc': '严密的方案设计仅确立了事前防偏规则，实际入库数据的洁净度与多维构念的测量可靠性仍需实证检验；下一章依次报告预测试、清洗漏斗与量表信效度校准。',
    'data.testing': '清洗台账与因子信效度检验确认了观测工具结构稳健，具备进入实质统计分析的前提；下文首先从样本基线构成、量表极化分布与多选痛点刻画整体盘面。',
    'sample.descriptive': '整体描述分布虽暴露出高关注与局部体验洼地并存的表象，但无法判断不同人群特征间是否存在统计学显著分化；下节引入列联检验与多重校正组间比较予以甄别。',
    'compare.tests': '双变量差异与相关矩阵揭示了维度间的同向伴生关系，却难以剥离人口与接触背景混杂后的独立净效应；下一章构建多元线性回归与二元 Logistic 模型量化边际预测贡献。',
    'drivers.model': '全样本参数回归刻画了平均边际关联，但平均效应往往掩盖细分受众内部的结构性张力；下一章采用自适应轮廓系数聚类与外生交叉验证提取典型受众画像。',
    'segments.cluster': '受众分群厘清了不同画像的诉求分化，而在资源约束下究竟应优先修复哪几项具体服务触点仍需二维基准裁定；下一章结合修正 IPA 象限与 KANO 敏感度锁定整改先后序。',
    'diagnosis.problems': '至此，定量象限断点、回归净效应与定性三级编码已完成多源互证；下一章按“实证断点—执行主体—工程举措—试点止损”将诊断结论逐条转译为分层面行动方案。',
    'plan.feasibility': '在完成具体整改措施与小规模试点止损边界评估后，末章系统收束全篇研究问题结论、宏观协同建言及横截面与样本外推的诚实边界。',
  };

  const pilotGuardrails: string[] = [
    '坚持先试后推原则，鉴于横截面关联不等于干预因果净效应，全面铺开前须选取特征可比的试点单元与对照单元开展小规模平行对照试运行。',
    '实行双口径追踪验证，同步监测目标短板维度复测表现、高频痛点提及占比及目标客群留存转化变动，严禁仅凭单一主观好评宣称见效。',
    '设立可证伪止损回退红线，若观察窗口内核心转化指标未较对照基线改善，或一线排队与投诉摩擦指标反而上升，立即暂停扩面并回退校准流程权限与规则说明。',
  ];

  const autonomousPivots: string[] = [];
  for (const r of results) {
    for (const w of r.warnings ?? []) {
      if (w.startsWith('SCALE_PURIFIED_DROPPED:')) {
        autonomousPivots.push(`在量表自主净化环节（${r.id}），检出反向或低 CITC 题项 ${w.split(':')[1] ?? ''} 并自动剔除重构构念，恢复 Cronbach α 信度。`);
      } else if (w.startsWith('RIDGE_STABILIZED:')) {
        autonomousPivots.push(`针对共线性自主纠偏（${r.id}），基准 OLS 触发高 VIF 膨胀后自动切换 Ridge 收缩估计（${w.split(':')[1] ?? ''}）。`);
      } else if (w.startsWith('PENALIZED_LOGIT_L2:')) {
        autonomousPivots.push(`针对完全分离稳健修正（${r.id}），标准二元 Logit 触发准完全分离告警后启用 L2 惩罚似然（${w.split(':')[1] ?? ''}）。`);
      } else if (w.startsWith('SUBGROUP_SIGN_REVERSAL:')) {
        autonomousPivots.push(`针对辛普森悖论异质性发现（${r.id}），按调节维度“${w.split(':')[1] ?? ''}”分层后呈现显著方向反转，否决单一均值推论。`);
      }
    }
  }

  return {
    topicTitle: topic.title,
    mode,
    motherInsight,
    claims,
    clusterPersonas: personas,
    clusterPersonaMap,
    localGovernancePolicies,
    chapterBridges,
    pilotGuardrails,
    ...(autonomousPivots.length ? { autonomousPivots: [...new Set(autonomousPivots)] } : {}),
  };
}

/**
 * 构造可选的全文叙事总纲精炼 Prompt（仅在完整报告运行 !input.sectionNodes 时发起一次调用：
 * purpose='storyline', nodeId='intro.roadmap', wave=1, attempt=1）。
 */
export function buildStorylinePrompt(
  pack: StorylinePack,
  topic: DemoBlueprint,
  mode: StorylineMode = 'demonstration',
  baseBrief?: StorylineBrief,
): string {
  const deterministic = baseBrief ?? buildDeterministicStorylineBrief(pack, topic, mode);
  const compactClaims = deterministic.claims.map(c => ({
    claimId: c.claimId,
    ownerNode: c.ownerNode,
    title: c.title,
    qualitativeTakeaway: c.qualitativeTakeaway,
  }));
  const compactPersonas = deterministic.clusterPersonas.map(p => ({
    clusterId: p.clusterId,
    academicName: p.academicName,
    strategyFocus: p.strategyFocus,
  }));
  return [
    '你是国家级市场调查与统计分析报告的总架构师（Master Architect）。',
    `请围绕研究课题“${topic.title}”（领域：${topic.domainLabel}，研究模式：${mode}），在不编造任何统计数字的前提下，对以下确定性叙事总纲进行学术化凝练润色。`,
    '【铁律】',
    '1. motherInsight（50–95字）按“表层认知/行为张力 + 深层结构性断点 + 高弹性异质客群靶标 + 可验证机制反转”四元公式凝练成唯一一句母洞察，严禁包含任何阿拉伯数字或百分比，避免套用机械排比“……不等于……”口号！',
    '2. claims 保持 CLM-1 至 CLM-8 原有 claimId 与唯一 ownerNode 不变，仅优化 qualitativeTakeaway（每条 35–75 字纯定性提炼，严禁出现任何阿拉伯数字，严禁以“……不等于……”起句，防止跨节数字与句式回声）。',
    '3. clusterPersonas 请严格沿用基础总纲给定的中性实证簇名（如“多维高评组”“××低评组”，严禁自行另起第二套花哨别名、网络热梗或英文 Cluster_1，严禁含数字，确保全篇簇名一字不差统一）。',
    '4. pilotGuardrails 保持 3 条可证伪的小范围试点与止损回退准则（严禁杜撰具体百分比目标值）。',
    '只输出严格合法的 JSON 对象：{"motherInsight":"...","claims":[{"claimId":"CLM-1","qualitativeTakeaway":"..."}],"clusterPersonas":[{"clusterId":"第 1 类","academicName":"...","strategyFocus":"..."}],"pilotGuardrails":["..."]}。',
    `基础总纲参考 JSON：${JSON.stringify({ motherInsight: deterministic.motherInsight, claims: compactClaims, clusterPersonas: compactPersonas, pilotGuardrails: deterministic.pilotGuardrails })}`,
  ].join('\n');
}

/**
 * 安全解析模型返回的叙事总纲 JSON：锁死 CLM-1..8 的唯一 ownerNode 与底层统计数值证据，
 * 拒收任何夹带未核验数字的定性摘要或母洞察。
 */
export function parseStorylineBrief(
  raw: string,
  fallback?: StorylineBrief,
): StorylineBrief | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*)\n\s*```\s*$/u.exec(raw.trim());
  const body = fenced ? fenced[1] : raw.trim();
  let parsed: Record<string, unknown>;
  try {
    const val = JSON.parse(body);
    if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
    parsed = val as Record<string, unknown>;
  } catch {
    return null;
  }

  // Reject if this is actually a section draft response `{"paragraphs":[...]}` rather than a storyline brief
  if (!('motherInsight' in parsed) && !('claims' in parsed) && !('clusterPersonas' in parsed)) {
    return null;
  }

  const base: StorylineBrief = fallback ?? {
    topicTitle: '',
    mode: 'demonstration',
    motherInsight: '',
    claims: [],
    clusterPersonas: [],
    chapterBridges: {},
    pilotGuardrails: [],
  };

  const cleanNoDigit = (v: unknown, minLen: number, maxLen: number): string | null => {
    if (typeof v !== 'string') return null;
    const s = v.replace(/\s+/gu, ' ').trim();
    if (s.length < minLen || s.length > maxLen || /\d/u.test(s)) return null;
    return s;
  };

  const refinedMother = cleanNoDigit(parsed.motherInsight, 24, 150) ?? base.motherInsight;

  const rawClaims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const mergedClaims: StorylineClaim[] = base.claims.length
    ? base.claims.map(c => {
        const hit = rawClaims.find(
          rc => rc && typeof rc === 'object' && (rc as { claimId?: unknown }).claimId === c.claimId,
        ) as { qualitativeTakeaway?: unknown; title?: unknown } | undefined;
        return {
          ...c,
          title: (hit && cleanNoDigit(hit.title, 6, 40)) ?? c.title,
          qualitativeTakeaway: (hit && cleanNoDigit(hit.qualitativeTakeaway, 18, 120)) ?? c.qualitativeTakeaway,
        };
      })
    : rawClaims.slice(0, 8).flatMap((rc, i) => {
        if (!rc || typeof rc !== 'object') return [];
        const obj = rc as Record<string, unknown>;
        const takeaway = cleanNoDigit(obj.qualitativeTakeaway, 10, 140);
        if (!takeaway) return [];
        return [{
          claimId: typeof obj.claimId === 'string' ? obj.claimId : `CLM-${i + 1}`,
          ownerNode: typeof obj.ownerNode === 'string' ? obj.ownerNode : 'sample.descriptive',
          title: cleanNoDigit(obj.title, 4, 40) ?? `核心发现 ${i + 1}`,
          detailedEvidence: typeof obj.detailedEvidence === 'string' ? obj.detailedEvidence.slice(0, 400) : takeaway,
          qualitativeTakeaway: takeaway,
          resultIds: [],
          boundary: typeof obj.boundary === 'string' ? obj.boundary.slice(0, 200) : '',
        }];
      });

  const rawPersonas = Array.isArray(parsed.clusterPersonas) ? parsed.clusterPersonas : [];
  const mergedPersonas: ClusterPersona[] = base.clusterPersonas.map((p, idx) => {
    const hit = (rawPersonas.find(
      rp => rp && typeof rp === 'object' && (rp as { clusterId?: unknown }).clusterId === p.clusterId,
    ) ?? rawPersonas[idx]) as { academicName?: unknown; profileSummary?: unknown; strategyFocus?: unknown } | undefined;
    const rawName = hit && cleanNoDigit(hit.academicName, 3, 22);
    const validName = rawName && !/cluster|类别|簇/iu.test(rawName) ? rawName : p.academicName;
    return {
      ...p,
      academicName: validName,
      profileSummary: (hit && cleanNoDigit(hit.profileSummary, 14, 120)) ?? p.profileSummary,
      strategyFocus: (hit && cleanNoDigit(hit.strategyFocus, 10, 100)) ?? p.strategyFocus,
    };
  });

  const rawGuardrails = Array.isArray(parsed.pilotGuardrails)
    ? parsed.pilotGuardrails.map(g => cleanNoDigit(g, 16, 160)).filter((g): g is string => Boolean(g)).slice(0, 4)
    : [];

  return {
    ...base,
    motherInsight: refinedMother,
    claims: mergedClaims,
    clusterPersonas: mergedPersonas.length ? mergedPersonas : base.clusterPersonas,
    pilotGuardrails: rawGuardrails.length >= 2 ? rawGuardrails : base.pilotGuardrails,
  };
}

/**
 * 按章节角色定向投送叙事总纲：
 * - motherInsight 严格仅注入 abstract、diagnosis.problems、conclusion.findings；
 * - CLM-1..8 仅向其唯一 ownerNode 开放详细统计数字，其余章节只提供无数字定性结论，杜绝全篇回声！
 */
export function formatStorylineForSection(brief: StorylineBrief, nodeId: string): string {
  const lines: string[] = ['【全篇叙事分工与防回声边界（Claim-Evidence 单主责机制）】'];

  if (brief.mode === 'empirical') {
    lines.push(
      '· 实证调查报告语体铁律（mode=empirical）：全篇必须按真实实地与线上联合市场调查的实证研究口吻撰写，严禁在摘要、正文、表注或附录中出现任何“教学模拟、模拟数据、模拟样本、模拟记录、脚本生成、随机种子、算法合成、演练语料、机器生成、数据生成、AI生成、AIGC、人工智能、大语言模型”等字样！',
    );
  }

  if (MOTHER_INSIGHT_NODES.has(nodeId) && brief.motherInsight) {
    lines.push(`· 全篇统摄母洞察（仅限摘要、问题归纳与调查结论三节呼应，请用本节语境自然化用而非逐字照抄）：${brief.motherInsight}`);
  }

  const ownedClaims = brief.claims.filter(c => c.ownerNode === nodeId);
  if (ownedClaims.length) {
    for (const c of ownedClaims) {
      lines.push(`· 【本节独家主责结论 ${c.claimId}｜${c.title}】本节负责完整展开该结论的具体统计量、置信区间与检验前提：${c.detailedEvidence}（适用边界：${c.boundary}）`);
    }
  }

  // Provide qualitative-only context of upstream/related claims without exposing numbers to non-owners
  if (!FIELDWORK_SCOPED_NODES.has(nodeId) && !PLAN_SCOPED_RE.test(nodeId)) {
    const peerClaims = brief.claims
      .filter(c => c.ownerNode !== nodeId)
      .slice(0, SYNTHESIS_EVIDENCE_NODES.has(nodeId) ? 6 : 3);
    if (peerClaims.length) {
      lines.push(
        '· 跨节定性协同要点（以下结论由对应专节独家详报数字；本节若需衔接仅作定性呼应，严禁跨节复诵他人具体统计值或原句）：' +
        peerClaims.map(c => `[${c.claimId}@${c.ownerNode}] ${c.qualitativeTakeaway}`).join(' '),
      );
    }
  }

  const personaNodes = new Set([
    'segments.cluster',
    'diagnosis.problems',
    'plan.measures',
    'plan.feasibility',
    'conclusion.suggestions',
    'conclusion.findings',
    'abstract',
  ]);
  if (personaNodes.has(nodeId) && brief.clusterPersonas.length) {
    lines.push(
      '· 受众细分唯一标准中性簇名（全篇各章必须一字不差沿用“第 k 类（××组）”，严禁自行改名、另造别名或混用软件原始标签 Cluster_1）：' +
      brief.clusterPersonas
        .map(p => `${p.clusterId}（${p.academicName}）——${nodeId === 'segments.cluster' ? p.profileSummary : p.strategyFocus}`)
        .join('；'),
    );
  }
  const clusterMapNodes = new Set([
    'segments.cluster',
    'diagnosis.problems',
    'plan.measures',
    'plan.feasibility',
    'conclusion.suggestions',
  ]);
  if (clusterMapNodes.has(nodeId) && brief.clusterPersonaMap?.length) {
    lines.push(
      '· 聚类簇编号与维度标准化中心精准对位台账（clusterPersonaMap）：\n  - ' +
      brief.clusterPersonaMap.join('\n  - '),
    );
  }
  if (nodeId === 'diagnosis.evaluation') {
    lines.push(
      '· IPA 独家展陈与口径边界：本节独家完整报告 IPA 隐性重要性与表现均值十字分界线及各属性坐标，且须将其准确界定为“样本内满意度隐性重要性排序（作为后续小规模试点的候选优先序，非直接复购或行为转化净收益估计）”，严禁写出“必须排在改进首位”等绝对化规范断言。',
    );
  } else if (
    nodeId.startsWith('intro.') ||
    nodeId.startsWith('design.') ||
    nodeId.startsWith('plan.') ||
    nodeId.startsWith('conclusion.') ||
    nodeId === 'abstract'
  ) {
    lines.push(
      nodeId === 'abstract'
        ? '· 防 IPA 坐标跨章复读：摘要中对重点改进短板最多保留一句无坐标小数的定性概括，严禁提前背诵 IPA 十字分界线数值与具体 β*/均值坐标小数！'
        : '· 防 IPA 坐标跨章复读：IPA 分界线数值（如隐性重要性均值、表现均值）与具体属性坐标小数已由第 8 章评价专节独家报告，本节严禁再次复读或罗列 IPA 分界线与坐标小数（对策与结论章仅定性指称“前文 IPA 识别的高重要低表现短板项”即可）！',
    );
  }
  if (nodeId !== 'abstract') {
    lines.push(
      '· 开篇去口号化约束：严禁在节首或段首套用“……，不等于……”“……并不等于……”对比格言式起笔，直接按本节专属方法角色切入。',
    );
  }

  const bridge = brief.chapterBridges[nodeId];
  if (bridge) {
    lines.push(`· 节末跨章逻辑搭桥指引（采用“已证事实 + 本阶方法盲区 + 下阶模型接管”，严禁机械报幕套话）：${bridge}`);
  }

  const policyNodes = new Set(['plan.measures', 'plan.feasibility', 'conclusion.suggestions', 'abstract']);
  if (policyNodes.has(nodeId) && brief.localGovernancePolicies?.length) {
    lines.push(
      '· 基层微观实情与当地特色政策工具锚定清单（对策建议须逐条挂钩下列具象基层载体与特色制度工具，严禁写“加强顶层设计、加大宣传力度、完善监管机制、形成多方合力”等大空话）：\n  - ' +
      brief.localGovernancePolicies.join('\n  - '),
    );
  }

  const guardrailNodes = new Set(['plan.feasibility', 'plan.measures', 'conclusion.suggestions', 'conclusion.limits']);
  if (guardrailNodes.has(nodeId) && brief.pilotGuardrails.length) {
    lines.push(`· 小规模对照试点与可证伪止损护栏：${brief.pilotGuardrails.join(' ')}`);
  }

  const pivotNodes = new Set(['data.cleaning', 'data.pilot', 'data.testing', 'drivers.model', 'conclusion.findings', 'conclusion.limits']);
  if (pivotNodes.has(nodeId) && brief.autonomousPivots?.length) {
    lines.push(`· 实证统计诊断自愈轨迹（须如实交代为何舍弃有偏初始规格而采用修正模型）：\n  - ${brief.autonomousPivots.join('\n  - ')}`);
  }

  return lines.join('\n');
}

/**
 * 蒸馏自 skill/survey-* 七大国家级获奖语料技能包的章节与方法级精简规范。
 */
export function sectionCorpusSkillBlock(
  nodeId: string,
  methods: readonly string[],
  mode?: StorylineMode,
): string {
  const has = (re: RegExp) => methods.some(m => re.test(m));
  const rules: string[] = [
    '【国奖语料库七大技能蒸馏规范（survey-corpus-7pack）】',
    `1. 句长爆发度（Burstiness）调律：打破四平八稳均长流水账，交替使用 12–25 字冷峻定性短句立判与 80–120 字嵌入括号精确统计参数的复合分析长句；全面清零“综上所述、值得注意的是、与此同时、赋能、抓手、形成闭环、双刃剑、不言而喻”等${mode === 'empirical' ? '空泛套话' : ' AI 套话'}；合并提交件严守竞赛六十五页篇幅上限。`,
    '2. 横截面因果克制文法：单时点调查无工具变量或随机实验支撑时，严禁断言“导致、决定了、引起了、必然带来”，一律使用“呈显著统计关联、控制协变量后显著正向预测、发生优势（Odds）更高、潜在传导路径显示”。',
  ];

  if (mode === 'empirical') {
    rules.push(
      '· 实证田野语体红线：全篇为真实调查实证报告（第一章统一称“一、绪论”），严禁在正文、摘要、表注或附录中写出“教学模拟、模拟数据、模拟样本、脚本生成、随机种子、演练语料、机器生成、AI生成、人工智能、大语言模型”等任何字样！',
    );
  }

  if (nodeId === 'abstract') {
    rules.push(
      '3. 单页五步高密摘要锁死（正文 4 段总字数必须饱满达到 920–1030 中文字，对应 900–1020 字单页黄金高密容量，严禁写成四五百字半页空荡提纲，也严防超长跨页悬空）：① 第 1 段宏观背景、核心刺激物与结构性张力（140–180字）→ ② 第 2 段 32 题跳题资格掩码、预试质控对账与四因子信效度门禁（180–230字）→ ③ 第 3 段阶梯式核心实证发现（描述与建言痛点→群际列联与秩相关→控制总体满意度的 OLS 净效应与全样本二元 Logistic 优势比/AUC→六维聚类画像与 IPA×KANO 短板锁定，360–420字）→ ④ 第 4 段锚定基层微观实情与当地特色政策工具的分层治理方案及 30 天平行对照试点止损边界（220–260字）→ ⑤ 独立第 5 段以“关键词：”开头列出 5–7 个核心术语（顿号分隔）。',
    );
  } else {
    rules.push(
      '3. 章节差异化开篇铁律：严禁在各章节开头机械复读“……，不等于……”“……并不等于……”口号句式！各章起笔须严格贴合方法定位变化（绪论切入宏观趋势痛点与理论缺口、方案聚焦跳题路由与测量口径、检验呈现分母闭合与潜构念结构、推断阐明控制协变量后的净效应、分群拆解中心梯度、评价依二维阈值锁定短板、对策锚定对照试点与止损护栏）。',
    );
    if (nodeId === 'intro.literature') {
      rules.push(
        '4. 理论文献构念化综述铁律（结合文献关键词共现聚类网络）：结合本节研究文献与核心构念关键词共现聚类网络图（{G编号}）及已登记经典理论文献（如 TAM、UTAUT、SERVQUAL、TPB、创新扩散或文化反哺等 {R编号} 引文），评述四大主题聚类社区演进与微观使用机制空白并顺理推演出本调查测量框架；正文中统一称“文献关键词共现聚类网络”，勿写具体制图软件英文名，严禁写出“检索来源、检索式与实收篇数待补”“实证全文待补核”等自我拆台道歉句！',
      );
    } else if (PLAN_SCOPED_RE.test(nodeId)) {
      rules.push(
        `4. 破题与白盒方案工艺：三拍决策张力展开（行业基线→结构性痛点反差→可测量子问题 RQ），若本节配有宏观趋势图或理论/创新/技术路线总结图（{G编号}）须自然互文引出；无概率抽样框时坦诚界定${mode === 'empirical' ? '非概率样本覆盖边界' : '非概率/模拟性质'}，严禁伪装分层/PPS 随机抽样或将 SRS 精度公式充当实测误差证明。`,
      );
    } else if (nodeId === 'data.pilot' || nodeId === 'data.cleaning') {
      rules.push(
        '4. 预试净化与清洗分母台账：逐级交代原始记录、注意力甄别/直线作答剔除、重复记录处理及最终有效样本 n；涉及跳题条件模块须明确区分“结构性跳过不适用”与“题项缺失”，严禁以邻近行均值填补有序李克特量表。',
      );
    } else if (nodeId === 'plan.measures' || nodeId === 'plan.feasibility' || nodeId === 'conclusion.suggestions') {
      rules.push(
        '4. 四要素闭环与地方特色政策落地铁律（清零大空话）：严禁在生成正文中输出“加强顶层设计、加大宣传力度、完善监管机制、形成多方合力、健全长效机制、抓手、赋能、形成闭环”等套话！每条建议必须紧扣【① 前文实证断点（对应图表锚点、精确最低分簇号与具体短板指标）→ ② 具体基层执行主体（如街道驿站、基层卫健/市监/商务部门、运营前置仓、院系教务等）→ ③ 嵌合当地特色政策工具与制度载体的实操改造动作（严格按本课题领域匹配）→ ④ 30 天平行对照试点追踪指标与一票否决止损回退红线】展开。',
      );
    } else {
      const contracts: string[] = [];
      if (has(/alpha|validity|efa|cfa/iu)) {
        contracts.push('信效度契约：报总表及各潜变量子量表 Cronbach α、KMO 取样适切性与 Bartlett 球形检验（χ², df, p）、旋转因子载荷与累计方差解释率（及 Harman 首因子共同方法偏差核查）');
      }
      if (has(/crosstab|groups|profile|pearson|spearman|correlation/iu)) {
        contracts.push('差异与关联契约：列联检验同报 χ²、df、p 与 Cramér’s V 效应量并说明行/列百分比分母；非参数多维比较报 H(df)、Holm 校正 p 与 ε²，不误读为中位数相等检验；未达显著水平的相关或差异（p ≥ 0.05）严禁升格写成“有实证依据”，须表述为当前样本下未检出显著关联');
      }
      if (has(/multi-response|text-mining/iu)) {
        contracts.push('多选与开放题契约：多选题严格区分以有效作答人数 n 为分母的“个案普及率”与以总勾选人次为分母的“响应占比”；开放题高频词与共现仅代表“在主动填写实质建议的受访者中”的提及集中度，严禁外推夸大为“全样本共性关切”');
      }
      if (has(/regression|ols/iu)) {
        contracts.push('OLS 回归契约：齐报非标准化 B、SE、标准化 β、t、p、VIF 共线性诊断、R²、调整 R² 及整体 F 检验（及异方差稳健检验说明）');
      }
      if (has(/logistic|logit/iu)) {
        contracts.push('Logistic 契约：齐报 B、SE、Wald z、p、优势比 OR 及 95% CI、平均边际效应 AME、似然比 LR χ² 与 McFadden 伪 R²；OR 仅解作发生优势倍数而非概率倍数');
      }
      if (has(/cluster|kmeans/iu)) {
        contracts.push('聚类画像契约：说明变量标准化与轮廓系数（Silhouette）定 k 依据，赋予中文学术画像名，并用未参与聚类的外生变量交叉验证，严禁原变量循环自证');
      }
      if (has(/ipa|kano/iu)) {
        contracts.push('评价与 KANO 契约：IPA 报隐性重要性与表现均值十字分界阈值及四象限归位；KANO 严格按列名区分 M/O/A/I 占比与 Better、Worse 敏感度系数，点名移交重点短板');
      }
      if (nodeId === 'sample.profile' || has(/^infographic$/iu)) {
        contracts.push('总体特征全景图契约：若本节含总体特征全景示意图（{G编号}），须将其作为定性视觉导览自然引入且严禁从纯场景插图编造定量人数；若含受访者人口/行为复合画像信息图（{G编号}），只精确引用其登记表内的小人占比与进度条对应百分比，严禁捏造表外数值');
      }
      if (contracts.length) {
        rules.push(`4. 最小统计报告契约：${contracts.join('；')}。`);
      }
    }
  }

  const displayFormulaNodes = new Set([
    'data.testing',
    'compare.tests',
    'drivers.model',
    'segments.cluster',
    'diagnosis.evaluation',
  ]);
  if (displayFormulaNodes.has(nodeId)) {
    rules.push(
      '5. 陈列公式防重铁律：本节已内置独立编号的陈列数学公式块，正文中严禁再用纯文本重复默写整条模型通式（如严禁写“写作 Y=α+ΣbX+ε”“记为 ln(p/(1-p))=...”或行内复抄 Better/Worse 分式），直接阐明变量设定与估计结果即可。',
    );
  }

  return rules.join('\n');
}

export type EchoAuditResult = {
  passed: boolean;
  echoedNgrams: { ngram: string; sections: string[] }[];
  detail: string;
};

const BENIGN_8GRAM_PATTERNS = [
  /教学模拟数据/u,
  /不能说明因果/u,
  /不能直接解释为因果/u,
  /控制其他变量/u,
  /统计证据详?见|本节统计证据/u,
  /结果尚未登记/u,
  /不足以排除零假设/u,
  /显著性水平/u,
  /内部一致性/u,
  /重要性表现分析/u,
  /多元线性回归/u,
  /Logist|ogistic|gistic|Kmeans|KMeans|结构方程模型|帕累托/iu,
  /Spearman|pearman|earman|arman秩/iu,
  /Kruskal|Wallis/iu,
  /Breusch|Pagan/iu,
  /Cronbach|Bartlett|McFadden|Harman/iu,
  /探索性因子分析/u,
  /平均轮廓系数/u,
  /平均边际效应|边际效应AME/iu,
  /KANO|正反配对/iu,
  /Cram[eé]?rsV/iu,
  /抽样方式与覆盖范围|覆盖范围待确认/u,
  /结构性跳题|跳题不适用/u,
  /共同方法偏差/u,
  /未来\d*天(?:内)?继续|继续自主使用|再次下单购买|试行方案报名/u,
  /置信区间/u,
  /样本覆盖范围/u,
];

function collectRegisteredProperNouns(content: EditorContent): string[] {
  const rawSet = new Set<string>();
  const addTerm = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const s = raw.replace(/\s+/gu, ' ').trim();
    if (s.length >= 3 && s.length <= 64) {
      const stripped = s.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
      if (stripped.length >= 3 && stripped.length <= 48 && !/^\d+$/u.test(stripped)) rawSet.add(stripped);
    }
    // Extract parenthetical / clause / construct parts (including long groupA/groupB option labels & outcome stems)
    for (const part of s.split(/[（()）「」【】［］｜|：:、，,；;。？?!！·—]/u)) {
      const p = part.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
      if (p.length >= 3 && p.length <= 40 && !/^\d+$/u.test(p)) rawSet.add(p);
    }
  };

  addTerm(content.title);
  if (typeof content.title === 'string') {
    for (const seg of content.title.split(/——|—|:/u)) {
      const cleanSeg = seg.trim().replace(/^[\u4e00-\u9fa5]{2,6}(?:省|市|自治区|自治州|县|区)/u, '');
      const subjectMatch = /^(.{4,24}?)(?:AI|试点|消费|体验|采纳|研究|调查)/u.exec(cleanSeg);
      if (subjectMatch?.[1]) addTerm(subjectMatch[1]);
    }
  }
  for (const r of content.quality?.results ?? []) {
    addTerm(r.title);
    for (const v of r.variables ?? []) addTerm(v);
    for (const h of r.headers ?? []) addTerm(h);
    for (const row of (r.rows ?? []).slice(0, 20)) {
      addTerm(row[0]);
      if (typeof row[0] === 'string' && row[0].includes('的')) {
        const afterDe = row[0].split('的').slice(1).join('的');
        if (afterDe.length >= 6) addTerm(afterDe);
      }
      if (r.method === 'crosstab' || r.method === 'grounded-coding' || r.method === 'pilot-decision-matrix') {
        addTerm(row[1]);
      }
    }
  }

  // Also harvest groupA/groupB option labels and outcome constructs from Appendix 1 questionnaire text when present
  for (const sec of content.report ?? []) {
    if (matchBlueprintNode(sec.title)?.id !== 'appendix.questionnaire') continue;
    for (const line of sec.body.split(/\r?\n/u)) {
      const trimmed = line.trim();
      for (const tag of trimmed.matchAll(/【([^】]{2,32})】/gu)) addTerm(tag[1]);
      const optMatch = /^(?:[1-9]|1[0-2]|[A-G])[.、．)\]]\s*(.+)$/u.exec(trimmed);
      if (optMatch) addTerm(optMatch[1]);
      if (/^Q(?:1|2|4|29|30|31)\b/u.test(trimmed)) addTerm(trimmed.replace(/^Q\d+\s*[.、．]?\s*/u, ''));
    }
  }

  return [...rawSet].sort((a, b) => b.length - a.length);
}

function extractNormalized8Grams(text: string, properNouns: readonly string[] = []): Set<string> {
  const cleaned = text
    .replace(/【教学模拟数据[^】]*】/gu, '')
    .replace(/本节统计证据(?:详见|见)[^。！？!?\r\n]*/gu, '')
    .replace(/(?:围绕|针对|关于|结合)「[^」]{1,80}」[，,]?(?:具体|对应|详细|实测)(?:统计)?(?:结果|分布|参数|数据)见[^。！？!?\r\n]*/gu, '')
    .replace(/^关键词[:：].*$/gmu, '')
    .replace(/\[\[(?:图|表|式|引):[^\]]+\]\]/gu, '｜')
    .replace(/\$[^$]{1,80}\$/gu, '｜')
    .replace(/第\s*[1-9]\s*类(?:\s*[（(「][^）)」]{2,26}[）)」])?/gu, '｜');
  const out = new Set<string>();
  for (const sentence of cleaned.split(/[。！？!?\r\n｜]+/u)) {
    let norm = sentence.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
    if (norm.length < 8) continue;
    for (const noun of properNouns) {
      if (norm.includes(noun)) {
        norm = norm.split(noun).join('|');
      }
    }
    for (const segment of norm.split('|')) {
      for (let i = 0; i + 8 <= segment.length; i++) {
        const gram = segment.slice(i, i + 8);
        if (BENIGN_8GRAM_PATTERNS.some(re => re.test(gram))) continue;
        out.add(gram);
      }
    }
  }
  return out;
}

/**
 * 扫描全篇报告各可写章节（正文 body + paragraph 内容块）的 8-gram 跨节复读回声。
 * 自动剔除已登记变量名、构念名与人群簇名等专有名词跨章合法共指，专注捕获机械套话复读。
 */
export function checkCrossSectionEcho(content: EditorContent): EchoAuditResult {
  const gramToNodes = new Map<string, string[]>();
  const synthesisSet = new Set(['abstract', 'conclusion.findings', 'conclusion.suggestions', 'conclusion.limits']);
  const properNouns = collectRegisteredProperNouns(content);

  for (const sec of content.report) {
    const node = matchBlueprintNode(sec.title);
    if (!node || (node.kind !== 'section' && node.kind !== 'abstract')) continue;
    const fullProse = [
      sec.body,
      ...(sec.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text),
    ].join('\n');
    if (!fullProse.trim()) continue;
    const grams = extractNormalized8Grams(fullProse, properNouns);
    for (const g of grams) {
      const list = gramToNodes.get(g) ?? [];
      if (!list.includes(node.id)) list.push(node.id);
      gramToNodes.set(g, list);
    }
  }

  const echoed: { ngram: string; sections: string[] }[] = [];
  for (const [ngram, nodes] of gramToNodes.entries()) {
    const bodyCount = nodes.filter(n => !synthesisSet.has(n)).length;
    if (nodes.length >= 4 || bodyCount >= 3) {
      echoed.push({ ngram, sections: nodes });
    }
  }
  echoed.sort((a, b) => b.sections.length - a.sections.length);
  const top = echoed.slice(0, 10);
  return {
    passed: top.length === 0,
    echoedNgrams: top,
    detail: top.length === 0
      ? '跨节 8-gram 扫描未发现多节机械复读回声。'
      : `检测到 ${echoed.length} 处跨节 8-gram 高频复读（如“${top[0].ngram}”在 ${top[0].sections.length} 节重复出现），建议差异化表述。`,
  };
}
