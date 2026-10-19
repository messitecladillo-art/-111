/** Deterministic layout fixtures only: no respondent records, model calls or fabricated results. */
import { pathToFileURL } from 'node:url';
import { nodeDef } from '../lib/canvas/catalog.ts';
import { connectionProblem, defaultConfig, emptyDoc, parseDoc, REL_IN, REL_OUT, topoOrder } from '../lib/canvas/graph.ts';

const PRESETS = {
  daily: { dataset: 6, stat: 18, chart: 10, join: 8, conclusion: 4, note: 4, inputsPerJoin: 4, inputsPerConclusion: 2, edges: 80 },
  stress: { dataset: 20, stat: 80, chart: 40, join: 32, conclusion: 16, note: 12, inputsPerJoin: 5, inputsPerConclusion: 4, edges: 500 },
};
const STATS = ['frequency', 'numeric', 'groups', 'crosstab', 'pearson', 'spearman', 'alpha'];

export function createCanvasFixture(preset = 'daily') {
  const spec = PRESETS[preset];
  if (!spec) throw Error('未知压力图：请选择 daily 或 stress。');
  const doc = emptyDoc(preset === 'daily' ? '日常交互图 · 50 节点' : '压力交互图 · 200 节点 / 500 连线');
  let sequence = 0, edgeSequence = 0;
  function add(kinds, count, x) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length], config = defaultConfig(kind);
      if (STATS.includes(kind)) {
        config.question = '交互压力图中的配置项';
        if (kind === 'alpha') Object.assign(config, { columns: ['指标A', '指标B', '指标C'], construct: '压力图配置' });
        else Object.assign(config, { x: '指标A', y: '指标B' });
      }
      const node = { id: `fixture-n-${++sequence}`, kind, title: `${nodeDef(kind).title} ${String(i + 1).padStart(2, '0')}`, position: { x, y: i * 180 }, parent: null, config };
      nodes.push(node); doc.nodes.push(node);
    }
    return nodes;
  }
  const datasets = add(['dataset'], spec.dataset, 0);
  const statistics = add(STATS, spec.stat, 340);
  const charts = add(['chart'], spec.chart, 680);
  const joins = add(['join'], spec.join, 1020);
  const conclusions = add(['conclusion'], spec.conclusion, 1360);
  add(['question', 'method', 'note', 'material'], spec.note, 1700);
  function connect(source, target, kind = 'data') {
    const edge = { id: `fixture-e-${++edgeSequence}`, kind, source: source.id, target: target.id, sourcePort: kind === 'relation' ? REL_OUT : nodeDef(source.kind).outputs[0].id, targetPort: kind === 'relation' ? REL_IN : nodeDef(target.kind).inputs[0].id };
    const problem = connectionProblem(doc, edge);
    if (problem) throw Error(`${source.title} → ${target.title}: ${problem}`);
    doc.edges.push(edge);
  }
  statistics.forEach((n, i) => connect(datasets[i % datasets.length], n));
  charts.forEach((n, i) => connect(statistics[i % statistics.length], n));
  const results = [...statistics, ...charts];
  joins.forEach((n, i) => {
    for (let j = 0; j < spec.inputsPerJoin; j++) connect(results[(i * spec.inputsPerJoin + j) % results.length], n);
  });
  conclusions.forEach((n, i) => {
    for (let j = 0; j < spec.inputsPerConclusion; j++) connect(joins[(i * spec.inputsPerConclusion + j) % joins.length], n);
  });
  // Relation edges explain associations without changing data dependencies or scheduling.
  for (let distance = 1; doc.edges.length < spec.edges && distance < doc.nodes.length; distance++) {
    for (let i = 0; i + distance < doc.nodes.length && doc.edges.length < spec.edges; i++) connect(doc.nodes[i], doc.nodes[i + distance], 'relation');
  }
  if (doc.edges.length !== spec.edges || topoOrder(doc).cyclic.length) throw Error('压力图结构不正确。');
  return parseDoc(doc);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--preset')) throw Error('用法：node --experimental-strip-types scripts/canvas-interaction-fixtures.mjs [--preset daily|stress]');
  process.stdout.write(`${JSON.stringify(createCanvasFixture(args[1] ?? 'daily'), null, 2)}\n`);
}
