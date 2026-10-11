/**
 * Reference flows. Each inserts ordinary, editable nodes; nothing is locked and no paper structure is
 * imposed. The three survey routes reuse the 数据分析 module's research templates step by step.
 */
import { PLAN_TEMPLATES, type PlanTemplateId } from '../analysis-plan.ts';
import { nodeDef, type NodeKind } from './catalog.ts';
import { defaultConfig, REL_IN, REL_OUT, type CanvasEdge, type CanvasNode } from './graph.ts';
import { autoLayout } from './layout.ts';

export type FlowTemplate = { id: string; title: string; description: string; nodes: number };
type Built = { nodes: CanvasNode[]; edges: CanvasEdge[] };

class Builder {
  nodes: CanvasNode[] = []; edges: CanvasEdge[] = [];
  private makeId: (prefix: string) => string;
  constructor(makeId: (prefix: string) => string) { this.makeId = makeId; }
  add(kind: NodeKind, title?: string, config: Record<string, unknown> = {}): string {
    const id = this.makeId(kind === 'group' ? 'g' : 'n');
    this.nodes.push({ id, kind, title: title ?? nodeDef(kind).title, position: { x: 0, y: 0 }, parent: null, config: { ...defaultConfig(kind), ...config } });
    return id;
  }
  link(source: string, target: string, sourcePort?: string, targetPort?: string) {
    const s = this.nodes.find(n => n.id === source)!, t = this.nodes.find(n => n.id === target)!;
    this.edges.push({ id: this.makeId('e'), kind: 'data', source, target, sourcePort: sourcePort ?? nodeDef(s.kind).outputs[0].id, targetPort: targetPort ?? nodeDef(t.kind).inputs[0].id });
  }
  relate(source: string, target: string) { this.edges.push({ id: this.makeId('e'), kind: 'relation', source, target, sourcePort: REL_OUT, targetPort: REL_IN }); }
}

const SURVEY: Record<PlanTemplateId, string> = { activity: 'plan-activity', support: 'plan-support', consumer: 'plan-consumer' };

export const FLOW_TEMPLATES: readonly FlowTemplate[] = [
  { id: 'describe', title: '描述与分组比较', description: '数据 → 频数、数值描述与分组描述 → 图表 → 汇集 → 结论草稿。', nodes: 9 },
  { id: 'scale', title: '量表信度检查', description: '数据 → 缺失处理 → Cronbach α → 图表 → 人工复核 → 报告章节。', nodes: 6 },
  { id: 'pretest', title: '问卷预测试', description: '研究问题 → 问卷 → 硅基样本预测试 → 方法卡，用说明连线串起。', nodes: 4 },
  ...PLAN_TEMPLATES.map(t => ({ id: SURVEY[t.id], title: t.title, description: `${t.description}（来自「数据分析」研究路线）`, nodes: t.steps.length + 4 })),
];

export function buildTemplate(id: string, makeId: (prefix: string) => string, origin: { x: number; y: number }): Built {
  const b = new Builder(makeId);
  if (id === 'describe') {
    const data = b.add('dataset'), freq = b.add('frequency', '频数 · 样本结构'), num = b.add('numeric', '数值描述'), grp = b.add('groups', '分组描述');
    const c1 = b.add('chart', '样本结构图'), c2 = b.add('chart', '分组比较图'), join = b.add('join'), concl = b.add('conclusion'), q = b.add('question', '研究问题');
    b.link(data, freq); b.link(data, num); b.link(data, grp); b.link(freq, c1); b.link(grp, c2); b.link(c1, join); b.link(c2, join); b.link(num, join); b.link(join, concl); b.relate(q, data);
  } else if (id === 'scale') {
    const data = b.add('dataset'), miss = b.add('missing'), alpha = b.add('alpha'), chart = b.add('chart', '删除后 α'), review = b.add('review'), report = b.add('report');
    b.link(data, miss); b.link(miss, alpha); b.link(alpha, chart); b.link(alpha, review); b.link(review, report);
  } else if (id === 'pretest') {
    const q = b.add('question'), qn = b.add('questionnaire'), si = b.add('silicon'), m = b.add('method', '方法卡 · 预测试', { text: '硅基样本只用于发现表述与跳题问题，不进入正式样本。' });
    b.relate(q, qn); b.relate(qn, si); b.relate(si, m);
  } else {
    const plan = PLAN_TEMPLATES.find(t => SURVEY[t.id] === id);
    if (!plan) throw Error('参考流程不存在。');
    const data = b.add('dataset'), branches = new Map<string, string>(), join = b.add('join');
    plan.steps.forEach((step, i) => {
      let source = data;
      if (step.filtered) {
        if (!branches.has(step.branch)) { const f = b.add('filter', `筛选 · ${step.branch}`); b.link(data, f); branches.set(step.branch, f); }
        source = branches.get(step.branch)!;
      }
      const kind = step.method as NodeKind, node = b.add(kind, `${nodeDef(kind).title} · ${i + 1}`, { question: step.question });
      b.link(source, node); b.link(node, join);
    });
    const concl = b.add('conclusion'), report = b.add('report');
    b.link(join, concl); b.link(join, report);
  }
  // Lay the inserted flow out on its own, then place it at the requested origin.
  const pos = autoLayout({ schema: 'research-canvas/v1', title: '', palette: 'blue', nodes: b.nodes, edges: b.edges.filter(e => e.kind === 'data') });
  const xs = [...pos.values()].map(p => p.x), ys = [...pos.values()].map(p => p.y);
  const minX = xs.length ? Math.min(...xs) : 0, minY = ys.length ? Math.min(...ys) : 0;
  // Nodes connected only by relation links get their own row under the data flow.
  let free = 0;
  for (const n of b.nodes) {
    const p = pos.get(n.id)!;
    const hasData = b.edges.some(e => e.kind === 'data' && (e.source === n.id || e.target === n.id));
    n.position = hasData || id !== 'pretest' ? { x: origin.x + p.x - minX, y: origin.y + p.y - minY } : { x: origin.x + (free++) * 320, y: origin.y };
  }
  return b;
}
