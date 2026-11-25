'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  autoLayoutDiagram,
  buildDiagramResultSnapshot,
  DIAGRAM_PRESETS,
  diagramSnapshotSVG,
  fromDrawioXml,
  toDrawioXml,
  type DiagramGraphSpec,
  type DiagramNodeRole,
} from '@/lib/diagram-figures';
import type { EditorContent } from '@/lib/editor-model';
import { placeResult } from '@/lib/report-placement';
import { appendRegisteredResult } from '@/lib/result-registration';
import { figureInk } from '@/lib/figure-palette';
import {
  DIAGRAM_CATALOG,
  DIAGRAM_INTENT_LABELS,
  toDiagramGraphSpec,
} from '@/lib/resource-library/diagram-catalog';
import styles from './Studio.module.css';

function toFlow(spec: DiagramGraphSpec): { nodes: Node[]; edges: Edge[] } {
  const laid = spec.nodes.some(n => typeof n.x !== 'number' || typeof n.y !== 'number')
    ? autoLayoutDiagram(spec)
    : spec;
  const nodes: Node[] = laid.nodes.map(n => ({
    id: n.id,
    position: { x: n.x ?? 40, y: n.y ?? 40 },
    data: {
      label: n.sublabel ? `${n.label}\n（${n.sublabel}）` : n.label,
      stage: n.stage ?? '流程环节',
      role: n.role ?? 'process',
      rawLabel: n.label,
      rawSublabel: n.sublabel ?? '',
    },
    style: {
      width: Math.min(220, n.width ?? 210),
      padding: '8px 10px',
      borderRadius: 10,
      fontSize: 11.5,
      lineHeight: 1.35,
      whiteSpace: 'pre-wrap',
      border: `1.6px solid ${n.role === 'decision' ? '#b91c1c' : n.role === 'output' ? '#0f766e' : '#334155'}`,
      background: n.role === 'decision' ? '#fef2f2' : n.role === 'output' ? '#ecfdf5' : '#ffffff',
      color: '#0f172a',
    },
  }));
  const edges: Edge[] = laid.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: Boolean(e.dashed),
    style: e.dashed ? { strokeDasharray: '5 4', stroke: '#b91c1c' } : { stroke: '#0f766e', strokeWidth: 1.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: e.dashed ? '#b91c1c' : '#0f766e' },
  }));
  return { nodes, edges };
}

function fromFlow(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR'): DiagramGraphSpec {
  return {
    direction,
    nodes: nodes.map(n => {
      const data = n.data as { rawLabel?: string; rawSublabel?: string; label?: string; stage?: string; role?: DiagramNodeRole };
      const lines = String(data.rawLabel || data.label || n.id).split('\n');
      return {
        id: n.id,
        label: lines[0] || n.id,
        sublabel: data.rawSublabel || (lines[1] ? lines[1].replace(/^[（(]|[）)]$/g, '') : undefined),
        stage: data.stage,
        role: data.role ?? 'process',
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        width: 240,
        height: 74,
      };
    }),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      dashed: Boolean(e.animated),
    })),
  };
}

export default function DrawDiagramStudio({
  content,
  onUpdateReport,
  onSaveArtifact,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onSaveArtifact?: (title: string, svg: string) => void;
}) {
  const [presetId, setPresetId] = useState(DIAGRAM_PRESETS[0].id);
  const [direction, setDirection] = useState<'TB' | 'LR'>(DIAGRAM_PRESETS[0].spec.direction ?? 'TB');
  const [title, setTitle] = useState(DIAGRAM_PRESETS[0].name);
  const initialFlow = useMemo(() => toFlow(DIAGRAM_PRESETS[0].spec), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeRole, setNewNodeRole] = useState<DiagramNodeRole>('process');
  const [selectedId, setSelectedId] = useState<string | null>(initialFlow.nodes[0]?.id ?? null);
  const [status, setStatus] = useState('支持节点拖拽连线、智能自动排版与通用流程图源文件双向导入导出。');
  const [targetSectionId, setTargetSectionId] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' }, style: { stroke: '#0f766e', strokeWidth: 1.8 } }, eds));
  }, [setEdges]);

  const applyPreset = (id: string) => {
    const found = DIAGRAM_PRESETS.find(p => p.id === id);
    if (!found) return;
    setPresetId(id);
    setDirection(found.spec.direction ?? 'TB');
    setTitle(found.name);
    const flow = toFlow(found.spec);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setStatus(`已载入“${found.name}”矢量模板。`);
  };

  const runAutoLayout = (nextDir = direction) => {
    const spec = autoLayoutDiagram(fromFlow(nodes, edges, nextDir));
    const flow = toFlow(spec);
    setDirection(nextDir);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setStatus(`已完成智能布局自动排版（${nextDir === 'LR' ? '横向从左到右' : '纵向分层演进'}）。`);
  };

  const addCustomNode = () => {
    const clean = newNodeLabel.trim();
    if (!clean) return;
    const id = `node-${nodes.length + 1}-${Date.now().toString(36).slice(-3)}`;
    const nextNode: Node = {
      id,
      position: { x: 80 + (nodes.length % 3) * 40, y: 60 + nodes.length * 76 },
      data: { label: clean, rawLabel: clean, rawSublabel: '自定义研究环节', stage: '新增节点', role: newNodeRole },
      style: {
        width: 210,
        padding: '8px 10px',
        borderRadius: 10,
        fontSize: 11.5,
        border: '1.6px solid #0f766e',
        background: '#ffffff',
        color: '#0f172a',
      },
    };
    const nextNodes = [...nodes, nextNode];
    const nextEdges = selectedId
      ? [...edges, { id: `e-${selectedId}-${id}`, source: selectedId, target: id, markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' }, style: { stroke: '#0f766e', strokeWidth: 1.8 } }]
      : edges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedId(id);
    setNewNodeLabel('');
    setStatus(`已添加节点“${clean}”${selectedId ? '并自动连线' : ''}。`);
  };

  const exportDrawio = () => {
    const xml = toDrawioXml(fromFlow(nodes, edges, direction), title);
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'evix-diagram'}.drawio`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('已导出可编辑流程图源文件，可在常用绘图软件中打开继续精修。');
  };

  const importDrawio = async (file: File | undefined) => {
    if (!file) return;
    try {
      const xml = await file.text();
      const spec = fromDrawioXml(xml);
      const flow = toFlow(spec);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setTitle(file.name.replace(/\.(?:drawio|xml)$/iu, '') || '导入流程图');
      setStatus(`已从 ${file.name} 解析 ${spec.nodes.length} 个节点与 ${spec.edges.length} 条连线。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入流程图源文件失败。');
    }
  };

  const applyCatalogDiagram = (catalogId: string) => {
    const found = DIAGRAM_CATALOG.find(item => item.id === catalogId);
    if (!found) return;
    setPresetId(found.id);
    setDirection(found.direction);
    setTitle(found.title);
    const flow = toFlow(toDiagramGraphSpec(found, content.title));
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedId(flow.nodes[0]?.id ?? null);
    setStatus(`已载入资料库研究框架“${found.title}”（${found.nodes.length} 阶 · ${found.edges.length} 路径），可拖拽重排并导出可编辑源文件。`);
  };

  const insertIntoReport = async () => {
    try {
      const spec = fromFlow(nodes, edges, direction);
      const snap = await buildDiagramResultSnapshot({
        id: `diagram-${presetId}-${Date.now().toString(36)}`,
        title: title.trim() || '研究技术路线图',
        spec,
        classification: content.quality?.results.some(r => r.classification === 'simulated') ? 'simulated' : 'public',
      });
      const svg = diagramSnapshotSVG(snap, figureInk(content));
      onSaveArtifact?.(snap.title, svg);
      const placed = placeResult(appendRegisteredResult(content, { result: snap }), snap.id, {
        sectionId: targetSectionId || undefined,
      });
      const targetTitle = placed.content.report.find(s => s.id === placed.sectionId)?.title ?? '对应研究章节';
      onUpdateReport(placed.content, `已将本地矢量框架图“${snap.title}”插入报告“${targetTitle}”章节。`);
      setStatus(`已将“${snap.title}”嵌入报告“${targetTitle}”章节，纸面预览与导出文稿同步生效。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '嵌入报告失败。');
    }
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>研究架构与流程图</h4>
        <span className={styles.monoTag}>{nodes.length} 节点 · {edges.length} 路径</span>
      </div>

      <div className={styles.panel}>
        <div className={styles.field}>
          <span>图题与预设模板</span>
          <div className={styles.row}>
            <input
              className={styles.input}
              aria-label="研究技术路线图标题"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="研究技术路线图标题"
            />
          </div>
          <div className={styles.row}>
            {DIAGRAM_PRESETS.map(p => (
              <button key={p.id} type="button" className={`${styles.btn} ${presetId === p.id ? styles.btnPrimary : ''}`} onClick={() => applyPreset(p.id)}>
                {p.name.replace(/图$/u, '')}
              </button>
            ))}
          </div>
          <div className={styles.row}>
            <select
              className={styles.select}
              aria-label={`从${DIAGRAM_CATALOG.length}套跨学科科研框架库载入`}
              value={DIAGRAM_CATALOG.some(item => item.id === presetId) ? presetId : ''}
              onChange={e => {
                if (e.target.value) applyCatalogDiagram(e.target.value);
              }}
            >
              <option value="">或从资料库 {DIAGRAM_CATALOG.length} 套跨学科研究框架载入…</option>
              {DIAGRAM_INTENT_LABELS.filter(group => group.id !== 'all').map(group => {
                const items = DIAGRAM_CATALOG.filter(d => d.intent === group.id);
                if (!items.length) return null;
                return (
                  <optgroup key={group.id} label={`${group.label}（${items.length} 套）`}>
                    {items.map(d => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        </div>

        <div className={styles.canvasWrap} aria-label="本地研究流程图画布">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
          >
            <Background gap={16} size={1} color="#cbd5e1" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className={styles.row}>
          <input
            className={styles.input}
            style={{ flex: 1, minWidth: 120 }}
            aria-label="新增研究环节名称"
            value={newNodeLabel}
            onChange={e => setNewNodeLabel(e.target.value)}
            placeholder="新增环节名称，如倾向得分匹配稳健性检验"
          />
          <select
            className={styles.select}
            style={{ width: 92 }}
            aria-label="新增研究环节角色类型"
            value={newNodeRole}
            onChange={e => setNewNodeRole(e.target.value as DiagramNodeRole)}
          >
            <option value="process">核心步骤</option>
            <option value="stage">研究阶段</option>
            <option value="method">统计方法</option>
            <option value="decision">质控/关键</option>
            <option value="output">结论产出</option>
          </select>
          <button
            type="button"
            className={styles.btn}
            aria-label="添加新增研究环节节点"
            onClick={addCustomNode}
            disabled={!newNodeLabel.trim()}
          >
            + 节点
          </button>
        </div>

        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => runAutoLayout('TB')}>↓ 纵向排版</button>
          <button type="button" className={styles.btn} onClick={() => runAutoLayout('LR')}>→ 横向排版</button>
          <button type="button" className={styles.btn} onClick={exportDrawio}>导出流程图源文件</button>
          <button type="button" className={styles.btn} onClick={() => fileRef.current?.click()}>导入流程图源文件</button>
          <input
            ref={fileRef}
            type="file"
            accept=".drawio,.xml"
            aria-label="选择要导入的流程图源文件"
            hidden
            onChange={e => { void importDrawio(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        <div className={styles.row}>
          <select
            className={styles.select}
            aria-label="选择框图写入目标章节"
            value={targetSectionId}
            onChange={e => setTargetSectionId(e.target.value)}
          >
            <option value="">🎯 自动匹配推荐章节（调查内容与研究框架）</option>
            {content.report.map(sec => (
              <option key={sec.id} value={sec.id}>{sec.title}</option>
            ))}
          </select>
        </div>

        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={insertIntoReport}>
          ✦ 一键生成高清矢量图并插入报告
        </button>
      </div>

      <div className={styles.statusBar} role="status" aria-live="polite">{status}</div>
    </div>
  );
}
