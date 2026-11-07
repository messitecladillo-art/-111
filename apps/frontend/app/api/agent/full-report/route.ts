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
};

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

    const result = await generateFullReportWithAgent({
      topic: typeof body.topic === 'string' ? body.topic.trim() : undefined,
      mode:
        body.mode === 'plan' || body.mode === 'empirical' || body.mode === 'demonstration'
          ? body.mode
          : 'demonstration',
      llm: {
        provider: body.provider ?? 'deepseek',
        baseUrl: body.baseUrl ?? 'https://api.deepseek.com/v1',
        apiKey,
        model: body.model ?? 'deepseek-chat',
        temperature: 0.2,
        concurrency:
          typeof body.concurrency === 'number' && body.concurrency >= 1 && body.concurrency <= 8
            ? body.concurrency
            : 6,
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
