import { NextResponse } from 'next/server';
import {
  type ProjectResearchMode,
  generateFullReportWithAgent,
} from '@/lib/agent/full-report-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestPayload = {
  topic?: string;
  mode?: ProjectResearchMode;
  apiKey?: string;
  provider?: 'deepseek' | 'openai' | 'qwen' | 'compatible';
  baseUrl?: string;
  model?: string;
  concurrency?: number;
  sectionNodes?: string[];
  stream?: boolean;
};

// Only these model hosts are called, so a request cannot point the server's fetch at an address of its own.
const MODEL_HOSTS = new Set(['api.deepseek.com', 'api.openai.com', 'dashscope.aliyuncs.com']);
function modelBase(asked: unknown): string | null {
  if (asked === undefined) return 'https://api.deepseek.com/v1';
  try {
    const url = new URL(String(asked));
    return url.protocol === 'https:' && MODEL_HOSTS.has(url.hostname) ? url.href : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestPayload;
    const apiKey = (
      body.apiKey ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      ''
    ).trim();

    if (!apiKey || apiKey.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          code: 'missing_api_key',
          message:
            '未检测到可用的大模型 API Key。请在对话框发送「/密钥 sk-...」绑定会话密钥，或在本地 .env.local 中配置 DEEPSEEK_API_KEY。',
        },
        { status: 400 },
      );
    }

    const baseUrl = modelBase(body.baseUrl);
    if (!baseUrl) {
      return NextResponse.json({ ok: false, code: 'model_host_rejected', message: '模型服务地址不在允许范围内。' }, { status: 400 });
    }

    const mode: ProjectResearchMode =
      body.mode === 'plan' || body.mode === 'empirical' || body.mode === 'demonstration'
        ? body.mode
        : 'demonstration';
    const concurrency =
      typeof body.concurrency === 'number' && body.concurrency >= 1 && body.concurrency <= 8
        ? body.concurrency
        : 6;

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
            } catch {
              // Ignore if client closed stream early
            }
          };

          try {
            const result = await generateFullReportWithAgent({
              topic: typeof body.topic === 'string' ? body.topic.trim() : undefined,
              mode,
              llm: {
                provider: body.provider ?? 'deepseek',
                baseUrl,
                apiKey,
                model: body.model ?? 'deepseek-chat',
                temperature: 0.2,
                concurrency,
              },
              sectionNodes: Array.isArray(body.sectionNodes) ? body.sectionNodes : undefined,
              onProgress: event => {
                if (event.phase === 'contract') {
                  send({
                    type: 'init',
                    phase: 'contract',
                    completed: event.completed,
                    total: event.total,
                    topic: event.topic,
                    contract: event.contract,
                    pack: event.pack,
                    report: event.report,
                  });
                } else if (event.phase === 'wave1' || event.phase === 'wave2') {
                  send({
                    type: 'section',
                    phase: event.phase,
                    completed: event.completed,
                    total: event.total,
                    nodeId: event.nodeId,
                    sectionId: event.sectionId,
                    title: event.title,
                    body: event.body,
                    source: event.source,
                    trace: event.trace,
                    report: event.report,
                  });
                } else if (event.phase === 'repair') {
                  send({
                    type: 'repair',
                    phase: 'repair',
                    completed: event.completed,
                    total: event.total,
                    repairsApplied: event.repairsApplied,
                    report: event.report,
                  });
                }
              },
            });

            send({
              type: 'done',
              ok: true,
              topic: result.topic,
              pack: result.pack,
              report: result.report,
              contract: result.contract,
              traces: result.traces,
              repairsApplied: result.repairsApplied,
              summary: result.summary,
            });
          } catch (err) {
            send({
              type: 'error',
              ok: false,
              message: err instanceof Error ? err.message : '全报告自动生成未完成。',
            });
          } finally {
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const result = await generateFullReportWithAgent({
      topic: typeof body.topic === 'string' ? body.topic.trim() : undefined,
      mode,
      llm: {
        provider: body.provider ?? 'deepseek',
        baseUrl,
        apiKey,
        model: body.model ?? 'deepseek-chat',
        temperature: 0.2,
        concurrency,
      },
      sectionNodes: Array.isArray(body.sectionNodes) ? body.sectionNodes : undefined,
    });

    return NextResponse.json({
      ok: true,
      topic: result.topic,
      pack: result.pack,
      report: result.report,
      contract: result.contract,
      traces: result.traces,
      repairsApplied: result.repairsApplied,
      summary: result.summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'full_report_generation_failed',
        message: error instanceof Error ? error.message : '全报告自动生成未完成。',
      },
      { status: 500 },
    );
  }
}
