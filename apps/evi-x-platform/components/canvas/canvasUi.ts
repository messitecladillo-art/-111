'use client';

import { createContext, useContext } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { nodeDef, type EditorSection } from '@/lib/canvas/catalog';
import type { CanvasNode, Issue } from '@/lib/canvas/graph';
import type { DatasetValue, NodeState, NodeStatus, Output } from '@/lib/canvas/execute';
import { isSiliconTable } from '@/lib/silicon/export';
import { parseSurveyCsv, SURVEY_LIMITS, type Delimiter } from '@/lib/survey-analysis';
import { WORKSPACE_MOTION } from '@/lib/workspace-motion';

/** Motion parameters (ms). Standard values match the workspace motion where the two overlap. */
export const MOTION = {
  hover: 120, pressIn: 90, pressOut: 160, select: WORKSPACE_MOTION.selection, reveal: WORKSPACE_MOTION.reveal,
  morph: WORKSPACE_MOTION.reorder, group: 260, layout: 300, focus: 260, pulse: 300, exit: 160, settle: 180, draw: 180,
} as const;
export type MotionLevel = 'standard' | 'reduced' | 'off';

export type NodeData = {
  node: CanvasNode; state: NodeState | undefined; issues: Issue[]; entering: 'add' | 'copy' | 'restore' | null; childCount: number;
  [key: string]: unknown;
};
export type EdgeData = { kind: 'data' | 'relation'; entering: boolean; pulse: number; status: NodeStatus | null; [key: string]: unknown };
export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge<EdgeData>;

export type DesignSummary = { title: string; questions: number; issues: number } | null;
export type CanvasContextValue = {
  workspaceDataset: DatasetValue | null;
  design: DesignSummary;
  files: ReadonlyMap<string, DatasetValue>;
  motion: MotionLevel;
  open: (section: EditorSection, nodeId: string) => void;
  toggleGroup: (id: string) => void;
  select: (id: string) => void;
};
export const CanvasContext = createContext<CanvasContextValue | null>(null);
export function useCanvasContext(): CanvasContextValue {
  const value = useContext(CanvasContext);
  if (!value) throw Error('CanvasContext missing');
  return value;
}

export const STATUS_LABELS: Record<NodeStatus, string> = {
  idle: '未运行', queued: '排队中', running: '运行中', done: '已完成', failed: '失败', blocked: '已阻塞', waiting: '等待确认',
};

const fmt = (v: number | null | undefined, d = 3) => v === null || v === undefined || !Number.isFinite(v) ? '—' : Number.isInteger(v) ? v.toLocaleString('zh-CN') : v.toLocaleString('zh-CN', { maximumFractionDigits: d });
export const formatNumber = fmt;

/** Two short lines shown on the card; full detail lives in the side panel. */
export function nodeSummary(node: CanvasNode, state: NodeState | undefined, ctx: Pick<CanvasContextValue, 'workspaceDataset' | 'design' | 'files'>): string[] {
  const c = node.config, out = state?.status === 'done' ? state.output : null;
  const vars = (...names: unknown[]) => names.filter(v => typeof v === 'string' && v).join(' × ') || '未选择变量';
  switch (node.kind) {
    case 'question': case 'method': case 'note': case 'material':
      return [String(c.text || '').slice(0, 60) || '点击填写内容'];
    case 'questionnaire':
      return ctx.design ? [`「${ctx.design.title || '未命名问卷'}」`, `${ctx.design.questions} 题${ctx.design.issues ? ` · ${ctx.design.issues} 项结构问题` : ''}`] : ['尚未读取问卷草稿', '打开「问卷设计」后自动同步'];
    case 'dataset': {
      if (out?.type === 'dataset') return [out.value.name, `${out.value.table.rows.length} 行 × ${out.value.table.headers.length} 列 · ${out.value.kind === 'simulated' ? '模拟数据' : '用户提供'}`];
      if (c.source === 'file') { const f = ctx.files.get(node.id); return f ? [f.name, `${f.table.rows.length} 行 · 未运行`] : [c.fileName ? `需重新选择「${c.fileName}」` : '选择本地 CSV', '只在本机解析，不上传']; }
      return ctx.workspaceDataset ? [`数据分析：${ctx.workspaceDataset.name}`, `${ctx.workspaceDataset.table.rows.length} 行 · ${ctx.workspaceDataset.kind === 'simulated' ? '模拟数据' : '用户提供'}`] : ['「数据分析」中尚未载入数据', '先在那里读取 CSV 或示例数据'];
    }
    case 'filter': return [c.column ? `「${c.column}」= ${(c.values as string[]).join('、') || '未选类别'}` : '未选择筛选变量', out?.type === 'dataset' ? `保留 ${out.value.table.rows.length} 行` : ''];
    case 'missing': return [c.codes ? `缺失代码：${c.codes}` : '未声明额外缺失代码', (c.complete as string[]).length ? `完整案例：${(c.complete as string[]).join('、')}` : ''];
    case 'alpha': return [(c.columns as string[]).length ? `${(c.columns as string[]).length} 个题项${c.construct ? ` · ${c.construct}` : ''}` : '未选择题项', out?.type === 'result' ? `α = ${fmt(out.value.result.metrics[0]?.value)} · n = ${out.value.result.n}` : ''];
    case 'chart': return [out?.type === 'chart' ? `${out.value.title}` : c.kind === 'auto' ? '自动选择图形' : String(c.kind), out?.type === 'chart' ? `n = ${out.value.snapshot.n}` : ''];
    case 'join': return [out?.type === 'bundle' ? `${out.value.length} 项结果` : '连接多个结果'];
    case 'review': return [c.approvedHash ? `已确认 · ${String(c.approvedAt).slice(5, 16).replace('T', ' ')}` : '等待人工确认', String(c.note || '').slice(0, 40)];
    case 'conclusion': return [out?.type === 'facts' ? `${out.value.length} 条事实` : '连接结果后列出事实', String(c.text || '').length ? `已写 ${String(c.text).length} 字` : '结论由你撰写'];
    case 'report': return [out?.type === 'report' ? `${out.value.sections.length} 段证据${out.value.skipped.length ? ` · ${out.value.skipped.length} 项需手写` : ''}` : '频数与信度可生成证据段落'];
    case 'silicon': return ['在硅基样本中运行预测试', '结果只用于预测试'];
    case 'defense': case 'topics': case 'cases': case 'rules': return [nodeDef(node.kind).summary.slice(0, 34)];
    default:
      if (out?.type === 'result') {
        const m = out.value.result.metrics.find(x => x.value !== null);
        return [vars(c.x, c.y), `n = ${out.value.result.n}${m ? ` · ${m.label} ${fmt(m.value)}` : ''}`];
      }
      return [vars(c.x, c.y), ''];
  }
}

export function outputLabel(output: Output | null): string {
  if (!output) return '';
  return { dataset: '数据', result: '统计结果', chart: '图表', bundle: '汇集', facts: '事实清单', report: '证据段落' }[output.type];
}

/* ───────── local CSV for dataset nodes ───────── */

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
/** Same parser and limits as the 数据分析 module; GB18030 only when UTF-8 cannot decode the file. */
export async function readCsvFile(file: File, delimiter: Delimiter = ','): Promise<DatasetValue> {
  if (file.size > SURVEY_LIMITS.bytes) throw Error(`文件超过 ${Math.round(SURVEY_LIMITS.bytes / 1e6)} MB 上限，请先删减。`);
  const raw = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { try { text = new TextDecoder('gb18030', { fatal: true }).decode(raw); } catch { throw Error('文件编码无法识别，请另存为 UTF-8 CSV。'); } }
  const table = parseSurveyCsv(text.replace(/^﻿/, ''), delimiter);
  const silicon = isSiliconTable(table.headers);
  return { name: file.name, sourceHash: await sha256Hex(raw), kind: silicon ? 'simulated' : 'user_provided', table, missingCodes: [], lineage: [] };
}

export function readMotionPreference(): MotionLevel {
  try { const v = localStorage.getItem('evix.canvas.motion'); return v === 'reduced' || v === 'off' ? v : 'standard'; } catch { return 'standard'; }
}
export function readGlassPreference(): number {
  try { const v = Number(localStorage.getItem('evix.canvas.glass')); return v >= 0.6 && v <= 1 ? v : 0.84; } catch { return 0.84; }
}
