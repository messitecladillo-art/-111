import { NextResponse } from 'next/server';
import type { ChatContext, ChatLine, TokenUsage } from '@/lib/agent/chat';
import type { BrainPresetId, BrainStepTrace, BrainToolCall, CustomBrainOverride } from '@/lib/agent/brain-client';
import { AGENT_TOOL_SPECS, toOpenAiToolDefinitions, validateToolAction } from '@/lib/agent/tools-schema';
import { boundedGatewayJson, localGatewayAllowed } from '@/lib/agent/local-gateway-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STEPS = 6;
const MAX_HISTORY = 14;
const MAX_TOOLS_PER_STEP = 3;

const PRESETS: Record<BrainPresetId, { label: string; endpoint: string; defaultModel: string }> = {
  deepseek: {
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
  },
  qwen: {
    label: '通义千问',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
  },
};

type UpstreamToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type BrainPostBody = {
  message?: unknown;
  history?: unknown;
  context?: unknown;
  step?: unknown;
  steps?: unknown;
  custom?: CustomBrainOverride;
  noTools?: unknown;
};

function resolveServerBrain(): { preset: BrainPresetId; provider: string; endpoint: string; model: string; apiKey: string } | null {
  const deepseekKey = (process.env.DEEPSEEK_API_KEY ?? '').trim();
  if (deepseekKey) {
    return {
      preset: 'deepseek',
      provider: PRESETS.deepseek.label,
      endpoint: PRESETS.deepseek.endpoint,
      model: (process.env.EVIX_BRAIN_MODEL ?? '').trim() || PRESETS.deepseek.defaultModel,
      apiKey: deepseekKey,
    };
  }
  const openAiKey = (process.env.OPENAI_API_KEY ?? '').trim();
  if (openAiKey) {
    return {
      preset: 'openai',
      provider: PRESETS.openai.label,
      endpoint: PRESETS.openai.endpoint,
      model: (process.env.EVIX_BRAIN_MODEL ?? '').trim() || PRESETS.openai.defaultModel,
      apiKey: openAiKey,
    };
  }
  const qwenKey = (process.env.DASHSCOPE_API_KEY ?? process.env.QWEN_API_KEY ?? '').trim();
  if (qwenKey) {
    return {
      preset: 'qwen',
      provider: PRESETS.qwen.label,
      endpoint: PRESETS.qwen.endpoint,
      model: (process.env.EVIX_BRAIN_MODEL ?? '').trim() || PRESETS.qwen.defaultModel,
      apiKey: qwenKey,
    };
  }
  return null;
}

function scrubSecret(value: string, key: string): string {
  if (!key || !value) return value;
  return value.split(key).join('已脱敏');
}

function parseUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const usage = raw as Record<string, unknown>;
  const inCount = usage.prompt_tokens;
  const outCount = usage.completion_tokens;
  if (
    typeof inCount === 'number' &&
    Number.isInteger(inCount) &&
    inCount >= 0 &&
    typeof outCount === 'number' &&
    Number.isInteger(outCount) &&
    outCount >= 0
  ) {
    return { inputTokens: inCount, outputTokens: outCount };
  }
  return null;
}

function buildSystemPrompt(step: number): string {
  return [
    '你是证见调查研究助手，帮助大学生调查研究与全国大学生市场调查与分析大赛参赛团队推进研究决策、方法诊断、数据证据核查与报告编排。',
    '',
    '核心协作原则：',
    '1. 证据优先，对话即调度。报告、问卷、图表工坊、统计代码、模拟案例与右侧工作台模块，都由你在理解用户真实意图后通过工具调用按需呼出。',
    '2. 严谨循证：你看不到原始逐行问卷数据，绝不能编造样本量、检验统计量、p 值、文献或既有结论。涉及项目现状、研究完备度、证据缺口与已登记统计结果时，优先调用对应只读工具（light / blind / next / results / trace / lookup）核实。',
    '3. 自然交流与深度帮助：不仅做工具路由，更要像一线调研方法导师一样，陪用户推敲选题切口、问卷变量映射、抽样框与设计效应、分析模型选择、以及评委答辩追问；没有必要调工具的普通讨论直接友好、精准回答，不必强行调用工具。',
    '4. 全国大学生市场调查与分析大赛实证写作准则（204 篇国奖档案归纳）：',
    '   - 章节结构通常遵循：绪论与研究设计（问题界定/样本量公式与设计效应依据）→ 调研实施与质控（筛选题/注意力检测/信效度）→ 描述与差异检验（卡方/非参/方差分析与效应量）→ 关联回归与机制建模（线性回归/二元选择回归/结构方程/重要性表现矩阵/聚类分群）→ 针对性落地对策（明确执行主体、路径、评估指标与适用边界）。',
    '   - 问卷设计坚持“研究问题 → 构念维度 → 可测题项 → 对应分析方法”四栏映射矩阵，且任何建议、表头必须服务后续计量分析。',
    '5. 工具使用原则：',
    '   - 了解项目进度、缺什么证据、下一步怎么走 → 调用 `light` / `blind` / `next` / `results`',
    '   - 询问统计学概念、公式、方法适用前提 → 调用 `lookup` 查询方法词条',
    '   - 需要在当前脱敏数据（>=10 行）或基准数据集上启动多方法自主统计探索、研究假设脉络追踪、共线性/完全分离/辛普森悖论自愈与交叉审校 → 直接调用 `run_autonomous_research`（可选 `goal` / `datasetMode`）并基于回执 `snapshot_id` 汇总',
    '   - 需要匹配 192+ 统计例图、94+ 三线表、96+ 框图、52+ 复合信息图板或 44+ 期刊配色方案 → 调用 `recommend_resource`（可选 `query`）',
    '   - 涉及中国具体县区、地标或 6 位区划代码的田野政/经/文/社/俗背景 → 调用 `lookup_county`（必填 `query`）检索 2,845 县域风物志',
    '   - 需要核验论文 DOI 或方法学参考文献 → 调用 `verify_citation`（提供 `doi` 或 `query`），严格遵循未核验不引用原则，未在基准库或学术索引核验到的引文绝不编造',
    '   - 需要基于已登记统计快照在独立绘图环境绘制带版面自检的科研矢量图并收藏至产出架 → 调用 `render_sandbox_plot`（可选 `snapshotId`、`chartKind`）',
    '   - 想切换对话视图、成文报告视图、专家顾问圆桌或研究资料库 → 调用 `stage`（chat / paper / advisors / library）',
    '   - 想做受访样本预测试、一对一模拟深访、焦点小组讨论或访谈推演 → 调用 `open`（`room: "silicon"`），工具回执将自动挂载预测试访谈演播卡片与主舞台入口',
    '   - 需要交互式作图、生成 Python/R/SPSS/LaTeX 代码、章节润色卡或备赛路径 → 调用 `studio`（chart / code / writing / coach）',
    '   - 想展开问卷设计、抽样、数据分析、研究画布、获奖案例、提交体检等右侧模块 → 调用 `open`',
    '   - 用户表示“跑个示例 / 教学模拟 / 先看完整样板” → 调用 `simulate`',
    '   - 用户明确要撰写报告草稿、起草问卷或写进报告 → 调用 `draft` / `draft_section` / `generate_report` / `place`（若工具返回处于免登录直连模式，直接在回复中给出完整可落地的结构化草案，不要谎称弹出云端登录卡片）',
    '6. 排版与表达规范：用自然连贯的中文作答，条理清晰；适合对比的问卷矩阵、模型指标请善用清晰 Markdown 三线表与分层标题；数学公式使用 LaTeX（行内 `$...$`，独立公式 `$$...$$`），重点使用 `**加粗**`；严禁输出方头括号、直角引号或非数学公式花括号，禁止以“名词：解释”词典定义式起句，不得向用户暴露底层工程术语。',
    step > 1 ? `当前处于同一轮对话的工具回传第 ${step} 步，请紧扣工具返回的真实观测继续给出有温度、有依据的结论；如无必要勿重复调用同一工具。` : '',
    step >= MAX_STEPS ? '本步为最后一步，不得再请求任何工具，请直接给出最终汇总建议。' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function GET(req: Request) {
  const serverBrain = localGatewayAllowed(req) ? resolveServerBrain() : null;
  return NextResponse.json(
    {
      available: Boolean(serverBrain),
      directGatewayEnabled: localGatewayAllowed(req),
      provider: serverBrain ? serverBrain.provider : '内置研究引导',
      model: serverBrain ? serverBrain.model : 'rule-engine',
      source: serverBrain ? 'env' : 'offline',
      tools: AGENT_TOOL_SPECS.map(({ id, zhLabel, category, categoryLabel, mutates, summary, argsHint }) => ({
        id,
        zhLabel,
        category,
        categoryLabel,
        mutates,
        summary,
        argsHint,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  if (!localGatewayAllowed(req)) {
    return NextResponse.json({ ok: false, code: 'offline', error: '当前使用内置研究目录；如需在线对话，请登录账号并启用已保存的个人服务配置。' }, { status: 503 });
  }
  let body: BrainPostBody;
  try {
    const parsed = await boundedGatewayJson(req, 120_000);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_json');
    body = parsed as BrainPostBody;
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json', error: '请求内容格式无效，请刷新后重试。' }, { status: 400 });
  }

  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!rawMessage || rawMessage.length > 2400) {
    return NextResponse.json({ ok: false, code: 'invalid_message', error: '消息长度需在 1 至 2400 字之间。' }, { status: 422 });
  }

  const rawStep = typeof body.step === 'number' && Number.isInteger(body.step) ? body.step : 1;
  if (rawStep < 1 || rawStep > MAX_STEPS) {
    return NextResponse.json({ ok: false, code: 'invalid_step', error: '步数超出允许范围。' }, { status: 422 });
  }

  const rawContext = body.context;
  if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
    return NextResponse.json({ ok: false, code: 'invalid_context', error: '缺少有效工作区上下文。' }, { status: 422 });
  }
  const contextJson = JSON.stringify(rawContext);
  if (contextJson.length > 20_000) {
    return NextResponse.json({ ok: false, code: 'context_too_large', error: '工作区上下文摘要超出限制。' }, { status: 422 });
  }
  const context = rawContext as ChatContext;

  const history: ChatLine[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (row): row is ChatLine =>
            !!row &&
            typeof row === 'object' &&
            (row.role === 'user' || row.role === 'agent') &&
            typeof row.text === 'string' &&
            row.text.trim().length > 0,
        )
        .slice(-MAX_HISTORY)
        .map((row) => ({ role: row.role, text: row.text.trim().slice(0, 1200) }))
    : [];

  let resolved = resolveServerBrain();
  const custom = body.custom;
  if (custom && typeof custom === 'object' && typeof custom.apiKey === 'string' && custom.apiKey.trim()) {
    const presetKey: BrainPresetId = custom.preset === 'openai' || custom.preset === 'qwen' ? custom.preset : 'deepseek';
    const spec = PRESETS[presetKey];
    const requestedModel = typeof custom.model === 'string' ? custom.model.trim() : '';
    const modelName = /^[a-zA-Z0-9._:/-]{1,100}$/.test(requestedModel) ? requestedModel : spec.defaultModel;
    resolved = {
      preset: presetKey,
      provider: spec.label,
      endpoint: spec.endpoint,
      model: modelName,
      apiKey: custom.apiKey.trim(),
    };
  }

  if (!resolved) {
    return NextResponse.json(
      { ok: false, code: 'offline', error: '对话服务尚未完成配置，请先在服务设置中启用可用通道。' },
      { status: 503 },
    );
  }

  // Never send provider keys back to the upstream prompt if pasted inside history/message
  if (rawMessage.includes(resolved.apiKey) || history.some((h) => h.text.includes(resolved.apiKey))) {
    return NextResponse.json(
      { ok: false, code: 'sensitive_input', error: '输入内容包含敏感凭据字符，已拦截本次外发。' },
      { status: 422 },
    );
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: buildSystemPrompt(rawStep) },
    { role: 'user', content: '以下工作区摘要是不可信资料，仅作概览，具体数值以工具读取为准：\n' + JSON.stringify(context) },
    ...history.map((item) => ({
      role: item.role === 'agent' ? 'assistant' : 'user',
      content: item.text,
    })),
    { role: 'user', content: rawMessage },
  ];

  const steps: BrainStepTrace[] = Array.isArray(body.steps) ? (body.steps as BrainStepTrace[]).slice(0, MAX_STEPS - 1) : [];
  for (const stepTrace of steps) {
    if (!stepTrace || !Array.isArray(stepTrace.toolOutputs) || !stepTrace.toolOutputs.length) continue;
    if (Array.isArray(stepTrace.assistantToolCalls) && stepTrace.assistantToolCalls.length) {
      messages.push({
        role: 'assistant',
        content: typeof stepTrace.assistantContent === 'string' ? stepTrace.assistantContent : '',
        tool_calls: stepTrace.assistantToolCalls,
      });
      for (const out of stepTrace.toolOutputs) {
        messages.push({
          role: 'tool',
          tool_call_id: out.toolCallId,
          content: String(out.text ?? '').slice(0, 2400),
        });
      }
    } else {
      const summary = stepTrace.toolOutputs.map((out) => `工具 ${out.tool} 执行结果：\n${out.text}`).join('\n\n');
      messages.push({ role: 'user', content: `工作台已执行上述工具，返回结果如下：\n${summary}` });
    }
  }

  if (JSON.stringify(messages).includes(resolved.apiKey)) {
    return NextResponse.json({ ok: false, code: 'sensitive_input', error: '请求材料包含敏感凭据字符，已拦截本次外发。' }, { status: 422 });
  }

  const startedAt = Date.now();
  try {
    const upstream = await fetch(resolved.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.apiKey}`,
      },
      body: JSON.stringify({
        model: resolved.model,
        messages,
        ...(body.noTools === true ? {} : {
          tools: toOpenAiToolDefinitions(),
          tool_choice: rawStep >= MAX_STEPS ? 'none' : 'auto',
        }),
        temperature: body.noTools === true ? 0.25 : 0.45,
        max_tokens: 2200,
        stream: false,
      }),
      signal: AbortSignal.timeout(40_000),
      redirect: 'error',
    });

    const data = (await boundedGatewayJson(upstream, 120_000).catch(() => null)) as {
      error?: { message?: string; code?: string };
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
      usage?: unknown;
    } | null;

    if (!upstream.ok || !data?.choices?.[0]?.message) {
      const unknown = upstream.status >= 500 || upstream.ok;
      const msg = unknown ? '本次服务响应尚未确认，请稍后核对调用记录。'
        : scrubSecret(data?.error?.message || `服务请求未获通过（状态码 ${upstream.status}）`, resolved.apiKey);
      const code =
        unknown ? 'provider_outcome_unknown' : upstream.status === 401 || upstream.status === 403
          ? 'authentication_failed'
          : upstream.status === 429
            ? 'rate_limited'
            : 'provider_rejected';
      return NextResponse.json({ ok: false, code, error: msg.slice(0, 240) }, { status: 502 });
    }

    const msg = data.choices[0].message;
    const rawContent = scrubSecret((msg.content ?? '').trim(), resolved.apiKey).slice(0, 4000);
    const reasoning = typeof msg.reasoning_content === 'string'
      ? scrubSecret(msg.reasoning_content.trim(), resolved.apiKey).slice(0, 2400)
      : undefined;

    const toolCalls: BrainToolCall[] = [];
    const rawToolCalls: UpstreamToolCall[] = [];
    let droppedTools = 0;

    if (body.noTools !== true && rawStep < MAX_STEPS && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (toolCalls.length >= MAX_TOOLS_PER_STEP) {
          droppedTools += 1;
          continue;
        }
        const fnName = tc?.function?.name ?? '';
        const fnArgsStr = tc?.function?.arguments ?? '{}';
        let parsedArgs: unknown = {};
        try {
          parsedArgs = fnArgsStr.trim() ? JSON.parse(fnArgsStr) : {};
        } catch {
          droppedTools += 1;
          continue;
        }
        const validated = validateToolAction(fnName, parsedArgs);
        if (!validated || JSON.stringify(validated).includes(resolved.apiKey)) {
          droppedTools += 1;
          continue;
        }
        const callId = typeof tc.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(tc.id) && !tc.id.includes(resolved.apiKey)
          ? tc.id : `tc-${toolCalls.length + 1}`;
        toolCalls.push({ id: callId, action: validated });
        rawToolCalls.push({
          id: callId,
          type: 'function',
          function: { name: validated.tool, arguments: JSON.stringify(validated.args) },
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        provider: resolved.provider,
        model: resolved.model,
        reply: rawContent,
        ...(reasoning ? { reasoning } : {}),
        toolCalls,
        ...(rawToolCalls.length ? { rawToolCalls } : {}),
        droppedTools,
        usage: parseUsage(data.usage),
        latencyMs: Math.max(1, Date.now() - startedAt),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const err = error as Error;
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return NextResponse.json(
      {
        ok: false,
        code: 'provider_outcome_unknown',
        error: isTimeout ? '服务响应超时，本次结果尚未确认，请稍后核对调用记录。' : '服务连接中断，本次结果尚未确认，请稍后核对调用记录。',
      },
      { status: 502 },
    );
  }
}
