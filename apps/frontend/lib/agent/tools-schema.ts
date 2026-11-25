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
    zhLabel: '图表数据溯源',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '从报告里的图表逆向核查清洗台账、原始数据校验值与对应调查题项。',
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
    zhLabel: '检索方法词条',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '从已审核统计学与市场调查方法库中查出准确定义、数学公式与文献出处。',
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
    zhLabel: '展开右侧功能模块',
    category: 'navigate',
    categoryLabel: '舞台调度',
    mutates: false,
    summary: '按需求在右侧展开对应的研究工作台模块（问卷设计、抽样、分析、画布、成文、答辩等）。',
    argsHint: 'room',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', enum: ROOM_ENUM, description: '要展开的模块标识。' },
      },
      required: ['room'],
    },
  },
  {
    id: 'stage',
    zhLabel: '切换核心主视图',
    category: 'navigate',
    categoryLabel: '舞台调度',
    mutates: false,
    summary: '切换中央主视图，支持研究对话（chat）、A4 报告纸面（paper）、专家顾问（advisors）或研究资料库（library）。',
    argsHint: 'view',
    parameters: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['chat', 'paper', 'advisors', 'library'], description: '目标主视图。' },
      },
      required: ['view'],
    },
  },
  {
    id: 'studio',
    zhLabel: '展开交互工坊卡',
    category: 'studio',
    categoryLabel: '交互工坊',
    mutates: false,
    summary: '在对话流中直接展开统计绘图（chart）、统计脚本编写（code）、润色撰稿（writing）或备赛指导（coach）交互工坊。',
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
    zhLabel: '生成教学模拟研究',
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
    summary: '基于研究需求构建结构化调查问卷草案，经用户确认后发起生成。',
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
    summary: '按已登记实证材料流式编排全篇合规报告候选稿，经用户确认后运行。',
    argsHint: 'topic?',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '可选，研究课题名称。' },
      },
    },
  },
  {
    id: 'run_autonomous_research',
    zhLabel: '多步自主统计探索',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '在主对话中对当前数据开展多步统计检验、论证脉络梳理与稳健性反证核查，自动排查多重共线性、完全分离与分层混杂偏误并登记可复核结果快照。',
    argsHint: 'goal?, datasetMode?',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: '可选，本次自主探索核心问题或验证目标（不超过 200 字）。' },
        datasetMode: {
          type: 'string',
          enum: ['planted_trap_benchmark', 'inline_dataset'],
          description: '可选，inline_dataset（当前工作区脱敏数据，需不少于 10 行）或 planted_trap_benchmark（统计偏误基准验证集）。',
        },
      },
    },
  },
  {
    id: 'recommend_resource',
    zhLabel: '智能匹配研究资源',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '跨百余种统计图表、学术三线表、研究框架图、版式组合图板与期刊配色方案进行方法与语义智能匹配。',
    argsHint: 'query?',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选，方法、主题或视觉检索词，如“回归”“路径机理”“配色”（不超过 60 字）。' },
      },
    },
  },
  {
    id: 'lookup_county',
    zhLabel: '检索县域风物志',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '检索覆盖全国 2,845 个县区的中国县域风物志数据库，返回地标、标签与政经文社俗五维质性脉络。',
    argsHint: 'query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '县区名、关键词或 6 位行政区划代码，如“义乌”或“330782”。' },
      },
      required: ['query'],
    },
  },
  {
    id: 'verify_citation',
    zhLabel: '文献 DOI 循证核验',
    category: 'inspect',
    categoryLabel: '循证检索',
    mutates: false,
    summary: '结合离线方法学文献库与学术索引对 DOI 或论文题名关键词做核验，未命中文献严格拦截，绝不编造引用。',
    argsHint: 'query?, doi?',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选，文献题名、作者或方法关键词（不超过 120 字）。' },
        doi: { type: 'string', description: '可选，标准 DOI 编号，如 10.1016/j.jeconom.2020.12.001（不超过 80 字）。' },
      },
    },
  },
  {
    id: 'render_sandbox_plot',
    zhLabel: '科研统计图表绘制',
    category: 'studio',
    categoryLabel: '交互工坊',
    mutates: false,
    summary: '基于已登记的统计结果快照绘制经过版面自检的高清矢量统计图，并自动收入成果架。',
    argsHint: 'snapshotId?, chartKind?',
    parameters: {
      type: 'object',
      properties: {
        snapshotId: { type: 'string', description: '可选，目标统计快照标识；留空时自动选择最新统计结果（不超过 80 字）。' },
        chartKind: {
          type: 'string',
          enum: ['auto', 'bar', 'line', 'forest', 'dumbbell'],
          description: '可选，支持 auto（自动适配）、bar（柱状图）、line（折线图）、forest（森林图）或 dumbbell（哑铃图）。',
        },
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
      description: `${spec.zhLabel}，${spec.summary}`,
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
      return typeof args.view === 'string' && ['chat', 'paper', 'advisors', 'library'].includes(args.view)
        ? { tool: 'stage', args: { view: args.view as 'chat' | 'paper' | 'advisors' | 'library' } }
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
    case 'run_autonomous_research': {
      const out: { goal?: string; datasetMode?: 'planted_trap_benchmark' | 'inline_dataset' } = {};
      if (args.goal !== undefined && args.goal !== '') {
        if (typeof args.goal !== 'string' || !args.goal.trim() || args.goal.trim().length > 200) return null;
        out.goal = args.goal.trim();
      }
      if (args.datasetMode !== undefined && args.datasetMode !== '') {
        if (args.datasetMode !== 'planted_trap_benchmark' && args.datasetMode !== 'inline_dataset') return null;
        out.datasetMode = args.datasetMode;
      }
      return { tool: 'run_autonomous_research', args: out };
    }
    case 'recommend_resource': {
      if (args.query === undefined || args.query === '') return { tool: 'recommend_resource', args: {} };
      return typeof args.query === 'string' && args.query.trim() && args.query.trim().length <= 60
        ? { tool: 'recommend_resource', args: { query: args.query.trim() } }
        : null;
    }
    case 'lookup_county':
      return typeof args.query === 'string' && args.query.trim() && args.query.trim().length <= 60
        ? { tool: 'lookup_county', args: { query: args.query.trim() } }
        : null;
    case 'verify_citation': {
      const out: { query?: string; doi?: string } = {};
      if (args.query !== undefined && args.query !== '') {
        if (typeof args.query !== 'string' || !args.query.trim() || args.query.trim().length > 120) return null;
        out.query = args.query.trim();
      }
      if (args.doi !== undefined && args.doi !== '') {
        if (typeof args.doi !== 'string' || !args.doi.trim() || args.doi.trim().length > 80) return null;
        out.doi = args.doi.trim();
      }
      return { tool: 'verify_citation', args: out };
    }
    case 'render_sandbox_plot': {
      const out: { snapshotId?: string; chartKind?: 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell' } = {};
      if (args.snapshotId !== undefined && args.snapshotId !== '') {
        if (typeof args.snapshotId !== 'string' || !args.snapshotId.trim() || args.snapshotId.trim().length > 80) return null;
        out.snapshotId = args.snapshotId.trim();
      }
      if (args.chartKind !== undefined && args.chartKind !== '') {
        if (typeof args.chartKind !== 'string' || !['auto', 'bar', 'line', 'forest', 'dumbbell'].includes(args.chartKind)) return null;
        out.chartKind = args.chartKind as 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell';
      }
      return { tool: 'render_sandbox_plot', args: out };
    }
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
