import type { ChatAction } from './chat.ts';
import { ROOMS } from './rooms.ts';

export type AgentToolCategory = 'probe' | 'inspect' | 'navigate' | 'studio' | 'write';

export type AgentToolSpec = {
  id: ChatAction['tool'];
  zhLabel: string;
  category: AgentToolCategory;
  categoryLabel: string;
  mutates: boolean;
  summary: string;
  argsHint?: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

const ROOM_ENUM = ROOMS.map((room) => room.id);
const LIT_ROOM_ENUM = ['design', 'sampling', 'analysis', 'editor'];

export const AGENT_TOOL_SPECS: readonly AgentToolSpec[] = [
  {
    id: 'next',
    zhLabel: '研究动线诊断',
    category: 'probe',
    categoryLabel: '光学探针',
    mutates: false,
    summary: '按当前项目证据链，识别并给出最优先的下一步动作。',
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'light',
    zhLabel: '模块照度扫描',
    category: 'probe',
    categoryLabel: '光学探针',
    mutates: false,
    summary: '读取全站或指定模块的证据照度百分比及检查通过项。',
    argsHint: 'room?',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', enum: LIT_ROOM_ENUM, description: '可选，限定查询 design/sampling/analysis/editor 之一。' },
      },
    },
  },
  {
    id: 'blind',
    zhLabel: '证据盲区排查',
    category: 'probe',
    categoryLabel: '光学探针',
    mutates: false,
    summary: '定位当前工作区仍缺少证据、未通过体检的盲区清单。',
    argsHint: 'room?',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', enum: LIT_ROOM_ENUM, description: '可选，限定排查某一个研究模块。' },
      },
    },
  },
  {
    id: 'results',
    zhLabel: '读取登记统计结果',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '读取分析引擎已登记的结果方法、有效样本量、主要统计量与已确认发现。',
    argsHint: 'query?',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选，按结果标题、统计方法或变量关键词过滤。' },
      },
    },
  },
  {
    id: 'trace',
    zhLabel: '光路溯源图表',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '从报告里的图/表沿光路逆向追溯至清洗台账、原始数据指纹与对应题项。',
    argsHint: 'reference',
    parameters: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: '图表编号或题名关键词，如“图 3-1”或“满意度”。' },
      },
      required: ['reference'],
    },
  },
  {
    id: 'lookup',
    zhLabel: '检索知识镜词条',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '从已审核统计学与市调知识库中查出精确定义、LaTeX 公式与参考文献出处。',
    argsHint: 'query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '统计学或调查方法术语，如“设计效应”、“卡方检验”、“VIF”。' },
      },
      required: ['query'],
    },
  },
  {
    id: 'open',
    zhLabel: '呼出右侧功能模块',
    category: 'navigate',
    categoryLabel: '舞台调度',
    mutates: false,
    summary: '按需求在右侧滑出对应的研究工作台模块（问卷设计、抽样、分析、画布、成文、答辩等）。',
    argsHint: 'room',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', enum: ROOM_ENUM, description: '要展开的模块 ID。' },
      },
      required: ['room'],
    },
  },
  {
    id: 'stage',
    zhLabel: '切换核心主舞台',
    category: 'navigate',
    categoryLabel: '舞台调度',
    mutates: false,
    summary: '切换中央视口形态：对话大脑(chat)、A4 成文镜台(paper) 或 专家圆桌(advisors)。',
    argsHint: 'view',
    parameters: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['chat', 'paper', 'advisors'], description: '目标舞台。' },
      },
      required: ['view'],
    },
  },
  {
    id: 'studio',
    zhLabel: '召唤交互工坊卡',
    category: 'studio',
    categoryLabel: '交互工坊',
    mutates: false,
    summary: '在对话流中直接呼出统计绘图(chart)、Python/R/LaTeX 编程(code)、润色撰稿(writing)或备赛教练(coach)交互工坊。',
    argsHint: 'kind',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['chart', 'code', 'writing', 'coach'], description: '交互工坊类型。' },
      },
      required: ['kind'],
    },
  },
  {
    id: 'simulate',
    zhLabel: '铸造教学模拟研究',
    category: 'navigate',
    categoryLabel: '舞台调度',
    mutates: false,
    summary: '围绕当前或指定课题生成完整教学模拟问卷、受访样本与实测报告样板。',
    argsHint: 'topic?',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '可选，拟模拟的调查课题名称，如“社区养老助餐服务”。' },
      },
    },
  },
  {
    id: 'place',
    zhLabel: '结果写入报告蓝图',
    category: 'write',
    categoryLabel: '确认写入',
    mutates: true,
    summary: '将未落盘的已登记统计结果对应写入报告正文章节（写入前弹出用户确认卡）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'draft',
    zhLabel: '起草研究问卷提案',
    category: 'write',
    categoryLabel: '确认写入',
    mutates: true,
    summary: '基于研究需求构建结构化调查问卷草案（需用户确认后调用模型）。',
    argsHint: 'brief',
    parameters: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '调研目的、目标人群与核心构念简要描述。' },
      },
      required: ['brief'],
    },
  },
  {
    id: 'draft_section',
    zhLabel: '按事实起草报告章节',
    category: 'write',
    categoryLabel: '确认写入',
    mutates: true,
    summary: '基于已登记的真实统计事实编号，为报告指定章节起草候选段落（需用户确认）。',
    argsHint: 'node',
    parameters: {
      type: 'object',
      properties: {
        node: { type: 'string', description: '章节标题或编号，如“摘要”、“研究背景”、“3.2”。' },
      },
      required: ['node'],
    },
  },
  {
    id: 'generate_report',
    zhLabel: '编排全篇候选报告',
    category: 'write',
    categoryLabel: '确认写入',
    mutates: true,
    summary: '以研究大脑调度全篇 26 节合规报告候选稿流式编排（弹出确认门控后运行）。',
    argsHint: 'topic?',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '可选，研究课题名称。' },
      },
    },
  },
];

export function toolSpecById(tool: string): AgentToolSpec | undefined {
  return AGENT_TOOL_SPECS.find((spec) => spec.id === tool);
}

export function toOpenAiToolDefinitions() {
  return AGENT_TOOL_SPECS.map((spec) => ({
    type: 'function' as const,
    function: {
      name: spec.id,
      description: `${spec.zhLabel}：${spec.summary}`,
      parameters: spec.parameters,
    },
  }));
}

export function validateToolAction(name: string, rawArgs: unknown): ChatAction | null {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return null;
  const args = rawArgs as Record<string, unknown>;
  const validRoom = (value: unknown) => typeof value === 'string' && ROOM_ENUM.includes(value as (typeof ROOM_ENUM)[number]);
  switch (name) {
    case 'next':
      return { tool: 'next', args: {} };
    case 'place':
      return { tool: 'place', args: {} };
    case 'light':
    case 'blind': {
      if (args.room === undefined || args.room === '') return { tool: name, args: {} };
      return validRoom(args.room) ? { tool: name, args: { room: args.room as (typeof ROOMS)[number]['id'] } } : null;
    }
    case 'open':
      return validRoom(args.room) ? { tool: 'open', args: { room: args.room as (typeof ROOMS)[number]['id'] } } : null;
    case 'stage':
      return typeof args.view === 'string' && ['chat', 'paper', 'advisors'].includes(args.view)
        ? { tool: 'stage', args: { view: args.view as 'chat' | 'paper' | 'advisors' } }
        : null;
    case 'studio':
      return typeof args.kind === 'string' && ['chart', 'code', 'writing', 'coach'].includes(args.kind)
        ? { tool: 'studio', args: { kind: args.kind as 'chart' | 'code' | 'writing' | 'coach' } }
        : null;
    case 'results': {
      if (args.query === undefined || args.query === '') return { tool: 'results', args: {} };
      return typeof args.query === 'string' && args.query.trim().length <= 40
        ? { tool: 'results', args: { query: args.query.trim() } }
        : null;
    }
    case 'generate_report':
    case 'simulate': {
      if (args.topic === undefined || args.topic === '') return { tool: name, args: {} };
      return typeof args.topic === 'string' && args.topic.trim().length <= 200
        ? { tool: name, args: { topic: args.topic.trim() } }
        : null;
    }
    case 'trace':
      return typeof args.reference === 'string' && args.reference.trim() && args.reference.trim().length <= 20
        ? { tool: 'trace', args: { reference: args.reference.trim() } }
        : null;
    case 'lookup':
      return typeof args.query === 'string' && args.query.trim() && args.query.trim().length <= 60
        ? { tool: 'lookup', args: { query: args.query.trim() } }
        : null;
    case 'draft':
      return typeof args.brief === 'string' && args.brief.trim() && args.brief.trim().length <= 600
        ? { tool: 'draft', args: { brief: args.brief.trim() } }
        : null;
    case 'draft_section':
      return typeof args.node === 'string' && args.node.trim() && args.node.trim().length <= 40
        ? { tool: 'draft_section', args: { node: args.node.trim() } }
        : null;
    default:
      return null;
  }
}

export function formatToolArgsBrief(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== '');
  if (!entries.length) return '';
  return entries.map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ');
}
