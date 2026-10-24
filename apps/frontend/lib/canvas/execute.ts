/**
 * Runs the data part of a research canvas in the browser. Statistics reuse the exact functions of the
 * 数据分析 module (runPlanNode, filterPlanSample, buildChartSnapshot, evidenceSection), so a canvas
 * result and the same analysis in the workbench are identical by construction.
 *
 * Status semantics:
 *   done     computed now or reused from the cache for identical inputs and settings
 *   failed   this node could not compute; the message says why
 *   blocked  an upstream node failed or is waiting, so this node did not run
 *   waiting  a review node whose current input has not been approved
 * A failure blocks only its dependents; independent branches keep running.
 */
import { filterPlanSample, planNodeSignature, runPlanNode, type PlanNode, type PlanResult } from '../analysis-plan.ts';
import { buildChartSnapshot } from '../chart-data.ts';
import { chartChoices, defaultChart } from '../chart-registry.ts';
import type { ChartKind, ChartSnapshot } from '../chart-types.ts';
import { canonical } from '../questionnaire-mapping.ts';
import { evidenceSection, frequencyEvidence, reliabilityEvidence } from '../research-flow.ts';
import { isMissing, parseMissingCodes, type SurveyTable } from '../survey-analysis.ts';
import type { ReportSection } from '../editor-model.ts';
import { isStat, nodeDef, type StatMethod } from './catalog.ts';
import type { CanvasDoc, CanvasNode } from './graph.ts';

export type DatasetValue = {
  name: string; sourceHash: string; kind: 'simulated' | 'user_provided';
  table: SurveyTable; missingCodes: string[]; lineage: string[];
};
export type ResultValue = { nodeId: string; title: string; question: string; plan: PlanNode; result: PlanResult; dataset: DatasetValue };
export type ChartValue = { nodeId: string; title: string; snapshot: ChartSnapshot; kind: ChartKind; palette: string; source: ResultValue };
export type BundleItem = { name: string; type: 'result' | 'chart'; value: ResultValue | ChartValue };
export type Fact = { label: string; text: string; simulated: boolean };
export type Output =
  | { type: 'dataset'; value: DatasetValue }
  | { type: 'result'; value: ResultValue }
  | { type: 'chart'; value: ChartValue }
  | { type: 'bundle'; value: BundleItem[] }
  | { type: 'facts'; value: Fact[] }
  | { type: 'report'; value: { sections: ReportSection[]; skipped: string[] } };

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'blocked' | 'waiting';
export type NodeState = { status: NodeStatus; message: string; hash: string; cached: boolean; output: Output | null; at: number };
export type RunEvent = { seq: number; at: number; nodeId: string; type: NodeStatus | 'handoff' | 'cancelled'; message: string; edgeId?: string; hash?: string };
export type RunInputs = { workspace: DatasetValue | null; files: ReadonlyMap<string, DatasetValue> };
export type Cache = Map<string, Output>;

/* ───────── hashing ───────── */

/** 53-bit string hash (cyrb53) for cache keys and handoff identity; not a security boundary. */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
/** Settings that change numbers; titles, notes and layout never invalidate a result. */
function computeKey(node: CanvasNode, inputHashes: string[]): string {
  const c = { ...node.config };
  if (isStat(node.kind)) delete c.question;
  if (node.kind === 'chart') delete c.title;
  if (node.kind === 'review') { delete c.note; delete c.approvedAt; delete c.approvedHash; }
  return hash53(canonical({ kind: node.kind, config: c, inputs: inputHashes }));
}

/* ───────── helpers ───────── */

const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
function column(table: SurveyTable, name: string, role: string): number {
  const hits = table.headers.map((h, i) => [h.trim(), i] as const).filter(([h]) => h === name.trim());
  if (!hits.length) throw Error(`当前数据中没有「${name}」列（${role}）。`);
  if (hits.length > 1) throw Error(`有 ${hits.length} 列都叫「${name}」，无法唯一定位，请先在数据中改名。`);
  return hits[0][1];
}
export function columnSummary(value: DatasetValue): string {
  return `${value.name} · ${value.table.rows.length} 行 × ${value.table.headers.length} 列${value.lineage.length ? ` · ${value.lineage.length} 步处理` : ''}`;
}

/** Plan node for a statistics canvas node, with variables resolved by column name. */
export function planFor(node: CanvasNode, table: SurveyTable): PlanNode {
  const c = node.config, method = node.kind as StatMethod;
  const base: PlanNode = { id: node.id, method, x: null, y: null, question: text(c.question).slice(0, 300), branch: '画布', filter: null, scale: null };
  if (method === 'alpha') {
    const columns = list(c.columns).map(n => column(table, n, '量表题项'));
    const reverse = list(c.reverse).map(n => column(table, n, '反向题'));
    if (reverse.some(r => !columns.includes(r))) throw Error('反向题必须是已选择的量表题项。');
    return { ...base, scale: { columns, reverse, min: Number(c.min), max: Number(c.max), construct: text(c.construct) } };
  }
  const two = !['frequency', 'numeric'].includes(method);
  return { ...base, x: column(table, text(c.x), '变量 1'), y: two ? column(table, text(c.y), '变量 2') : null };
}

function facts(items: Array<{ name: string; value: ResultValue | ChartValue; type: 'result' | 'chart' }>): Fact[] {
  return items.map(({ name, value, type }) => {
    const r = type === 'chart' ? (value as ChartValue).source : value as ResultValue, res = r.result;
    const metrics = res.metrics.filter(m => m.value !== null).map(m => `${m.label} ${Number.isInteger(m.value) ? m.value : (m.value as number).toFixed(3)}`);
    const top = res.method === 'frequency' && res.rows.length ? (() => { const best = [...res.rows].sort((a, b) => Number(b[1]) - Number(a[1]))[0]; return `最多的类别「${best[0]}」${best[1]} 人（${Number(best[2]).toFixed(1)}%）`; })() : '';
    return { label: name, simulated: r.dataset.kind === 'simulated', text: [`${nodeDef(r.plan.method as StatMethod).title}：有效 ${res.n} / ${res.total} 行`, top, ...metrics].filter(Boolean).join('；') + '。' };
  });
}

/* ───────── node execution ───────── */

type Gathered = { port: string; edgeId: string; sourceId: string; sourceTitle: string; output: Output };

function execute(node: CanvasNode, doc: CanvasDoc, inputs: Gathered[], run: RunInputs): Output {
  const c = node.config, one = (type: Output['type']) => {
    const hit = inputs.find(i => i.output.type === type);
    if (!hit) throw Error('缺少上游输入。');
    return hit.output;
  };
  switch (node.kind) {
    case 'dataset': {
      const base = c.source === 'file' ? run.files.get(node.id) : run.workspace;
      if (!base) throw Error(c.source === 'file' ? (text(c.fileHash) ? `请重新选择文件「${text(c.fileName)}」；画布不保存原始数据。` : '请选择一个 CSV 文件。') : '「数据分析」中还没有载入数据，请先在那里读取或使用示例数据。');
      if (c.source === 'file' && text(c.fileHash) && base.sourceHash !== text(c.fileHash)) throw Error('所选文件内容与上次登记的不同（指纹不符），请确认后重新选择。');
      const extra = parseMissingCodes(text(c.missingCodes));
      return { type: 'dataset', value: { ...base, missingCodes: [...new Set([...base.missingCodes, ...extra])], lineage: [...base.lineage] } };
    }
    case 'filter': {
      const d = one('dataset').value as DatasetValue, col = column(d.table, text(c.column), '筛选变量');
      const { table, evidence } = filterPlanSample(d.table, { column: col, values: list(c.values) }, d.missingCodes);
      return { type: 'dataset', value: { ...d, table, lineage: [...d.lineage, `筛选「${text(c.column)}」= ${list(c.values).join('、')}：保留 ${evidence.branchRows} / ${evidence.totalRows} 行`] } };
    }
    case 'missing': {
      const d = one('dataset').value as DatasetValue, codes = [...new Set([...d.missingCodes, ...parseMissingCodes(text(c.codes))])];
      const cols = list(c.complete).map(n => column(d.table, n, '完整案例变量'));
      const rows = cols.length ? d.table.rows.filter(row => cols.every(i => !isMissing(row[i], codes))) : d.table.rows;
      const steps = [...d.lineage, ...(text(c.codes) ? [`缺失代码：${parseMissingCodes(text(c.codes)).join('、')}`] : []), ...(cols.length ? [`完整案例（${list(c.complete).join('、')}）：保留 ${rows.length} / ${d.table.rows.length} 行`] : [])];
      return { type: 'dataset', value: { ...d, missingCodes: codes, table: { ...d.table, rows }, lineage: steps } };
    }
    case 'chart': {
      const r = one('result').value as ResultValue;
      const signature = planNodeSignature(r.plan, r.dataset.sourceHash, r.dataset.missingCodes);
      const snapshot = buildChartSnapshot(r.dataset.table, r.plan, r.result, r.dataset.missingCodes, { dataHash: r.dataset.sourceHash, signature, computedAt: '' });
      const wanted = text(c.kind);
      let kind: ChartKind = defaultChart(snapshot);
      if (wanted && wanted !== 'auto') {
        const choices = chartChoices(snapshot), choice = choices.find(x => x.id === wanted);
        if (!choice) throw Error(`该图形不能画这种统计结果，可选：${choices.map(x => x.title).join('、')}。`);
        if (!choice.available) throw Error(`当前结果不能画成「${choice.title}」：${choice.reason}`);
        kind = choice.id;
      }
      return { type: 'chart', value: { nodeId: node.id, title: text(c.title) || r.title, snapshot, kind, palette: text(c.palette) || doc.palette, source: r } };
    }
    case 'join':
      return { type: 'bundle', value: inputs.filter(i => i.output.type === 'result' || i.output.type === 'chart').map(i => ({ name: i.sourceTitle, type: i.output.type as 'result' | 'chart', value: i.output.value as ResultValue | ChartValue })) };
    case 'review':
      return inputs[0].output;
    case 'conclusion': {
      const items = inputs.flatMap(i => i.output.type === 'bundle' ? i.output.value : i.output.type === 'result' || i.output.type === 'chart' ? [{ name: i.sourceTitle, type: i.output.type, value: i.output.value as ResultValue | ChartValue }] : []);
      return { type: 'facts', value: facts(items) };
    }
    case 'report': {
      const results = inputs.flatMap(i => i.output.type === 'bundle' ? i.output.value.filter(x => x.type === 'result').map(x => x.value as ResultValue) : i.output.type === 'result' ? [i.output.value] : []);
      const sections: ReportSection[] = [], skipped: string[] = [];
      for (const r of results) {
        const scope = r.dataset.lineage.length ? `（子样本：${r.dataset.lineage.join('；')}）` : '';
        const question = `${r.question || r.title}${scope}`.slice(0, 300);
        if (r.result.method === 'frequency') sections.push(evidenceSection(frequencyEvidence({ ...r.result, method: 'frequency' }, { hash: r.dataset.sourceHash, simulated: r.dataset.kind === 'simulated', question, variable: r.dataset.table.headers[r.plan.x!], column: r.plan.x!, missingCodes: r.dataset.missingCodes }), `${node.id}-${sections.length + 1}`));
        else if (r.result.method === 'alpha' && r.result.reliability && r.plan.scale) {
          const s = r.plan.scale;
          sections.push(evidenceSection(reliabilityEvidence(r.result.reliability, { columns: s.columns, reverse: s.reverse, min: s.min, max: s.max, missingCodes: r.dataset.missingCodes }, { hash: r.dataset.sourceHash, simulated: r.dataset.kind === 'simulated', question }), `${node.id}-${sections.length + 1}`));
        } else skipped.push(`${r.title}（${nodeDef(r.plan.method as StatMethod).title}）`);
      }
      return { type: 'report', value: { sections, skipped } };
    }
    default:
      if (isStat(node.kind)) {
        const d = one('dataset').value as DatasetValue, plan = planFor(node, d.table);
        return { type: 'result', value: { nodeId: node.id, title: node.title, question: plan.question, plan, result: runPlanNode(d.table, plan, d.missingCodes), dataset: d } };
      }
      throw Error('该节点不在画布上运行，请在对应编辑器中打开。');
  }
}

function outputHash(output: Output, key: string): string {
  // Datasets are identified by content + processing; everything else by the key of the computation.
  return output.type === 'dataset' ? hash53(canonical({ source: output.value.sourceHash, missing: [...output.value.missingCodes].sort(), lineage: output.value.lineage, rows: output.value.table.rows.length })) : key;
}

/**
 * Run `scope` (already in topological order). States update through `onState`; events are numbered
 * so a UI can replay them once. The cache reuses outputs for identical inputs and settings.
 */
export async function runCanvas(doc: CanvasDoc, scope: string[], run: RunInputs, opts: {
  cache?: Cache; signal?: AbortSignal; onState?: (id: string, s: NodeState) => void; onEvent?: (e: RunEvent) => void; yieldMs?: number;
} = {}): Promise<Map<string, NodeState>> {
  const states = new Map<string, NodeState>(), byId = new Map(doc.nodes.map(n => [n.id, n])), inScope = new Set(scope);
  let seq = 0;
  const emit = (e: Omit<RunEvent, 'seq' | 'at'>) => opts.onEvent?.({ ...e, seq: ++seq, at: Date.now() });
  const set = (id: string, s: Omit<NodeState, 'at'>) => { const full = { ...s, at: Date.now() }; states.set(id, full); opts.onState?.(id, full); emit({ nodeId: id, type: s.status, message: s.message, hash: s.hash }); };
  for (const id of scope) set(id, { status: 'queued', message: '', hash: '', cached: false, output: null });
  for (const id of scope) {
    if (opts.signal?.aborted) {
      for (const rest of scope.slice(scope.indexOf(id))) if (states.get(rest)?.status === 'queued') { states.set(rest, { status: 'idle', message: '已取消', hash: '', cached: false, output: null, at: Date.now() }); opts.onState?.(rest, states.get(rest)!); }
      emit({ nodeId: id, type: 'cancelled', message: '运行已取消；已完成的节点保留结果。' });
      break;
    }
    const node = byId.get(id)!;
    const incoming = doc.edges.filter(e => e.kind === 'data' && e.target === id);
    const blockers = incoming.map(e => states.get(e.source)).filter(s => s && s.status !== 'done');
    if (blockers.length || incoming.some(e => !inScope.has(e.source))) {
      const missing = incoming.find(e => !inScope.has(e.source));
      set(id, { status: 'blocked', message: missing ? `上游「${byId.get(missing.source)?.title ?? missing.source}」不在本次运行范围内。` : '上游节点未完成，本节点没有运行。', hash: '', cached: false, output: null });
      continue;
    }
    const gathered: Gathered[] = incoming.map(e => ({ port: e.targetPort, edgeId: e.id, sourceId: e.source, sourceTitle: byId.get(e.source)!.title, output: states.get(e.source)!.output! }));
    const key = computeKey(node, incoming.map(e => states.get(e.source)!.hash));
    if (node.kind === 'review' && text(node.config.approvedHash) !== key) {
      set(id, { status: 'waiting', message: text(node.config.approvedHash) ? '上游结果已变化，需要重新确认。' : '等待人工确认上游结果。', hash: key, cached: false, output: null });
      continue;
    }
    set(id, { status: 'running', message: '', hash: '', cached: false, output: null });
    if (opts.yieldMs !== undefined) await new Promise(r => setTimeout(r, opts.yieldMs));
    const cached = node.kind !== 'dataset' ? opts.cache?.get(key) : undefined;
    try {
      const output = cached ?? execute(node, doc, gathered, run);
      if (!cached && node.kind !== 'dataset') opts.cache?.set(key, output);
      const h = outputHash(output, key);
      set(id, { status: 'done', message: cached ? '输入与设置未变化，沿用上次结果。' : '', hash: h, cached: !!cached, output });
      for (const e of doc.edges.filter(x => x.kind === 'data' && x.source === id && inScope.has(x.target))) emit({ nodeId: id, type: 'handoff', message: '', edgeId: e.id, hash: h });
    } catch (error) {
      set(id, { status: 'failed', message: error instanceof Error ? error.message : '计算失败。', hash: '', cached: false, output: null });
    }
  }
  return states;
}

/** Hash a review node must approve so its downstream may run: the key of its current input. */
export function reviewKey(doc: CanvasDoc, nodeId: string, states: Map<string, NodeState>): string | null {
  const node = doc.nodes.find(n => n.id === nodeId), incoming = doc.edges.filter(e => e.kind === 'data' && e.target === nodeId);
  if (!node || !incoming.length || incoming.some(e => states.get(e.source)?.status !== 'done')) return null;
  return computeKey(node, incoming.map(e => states.get(e.source)!.hash));
}
