import { NextResponse } from 'next/server';
import { IMAGE_GEN_MODELS, type ReportImageTaskId } from '@/lib/agent/image-gen-engine';

export const runtime = 'nodejs';

interface ImageGenRequestBody {
  modelId?: string;
  prompt?: string;
  task?: ReportImageTaskId;
  aspect?: '16:9' | '3:4' | '1:1';
  apiKey?: string;
  baseUrl?: string;
  customModelName?: string;
}

function sizeForAspect(aspect: '16:9' | '3:4' | '1:1'): string {
  if (aspect === '3:4') return '1024x1536';
  if (aspect === '16:9') return '1536x1024';
  return '1024x1024';
}

export async function POST(req: Request) {
  let body: ImageGenRequestBody;
  try {
    body = (await req.json()) as ImageGenRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: '请求 JSON 格式无效。' }, { status: 400 });
  }

  const prompt = (body.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: '生图提示词不能为空。' }, { status: 400 });
  }

  const spec = IMAGE_GEN_MODELS.find(m => m.id === body.modelId) ?? IMAGE_GEN_MODELS[0];
  const aspect = body.aspect ?? '16:9';
  const modelName = (body.customModelName ?? '').trim() || spec.apiModel;

  // Read optional user-provided key or server environment credentials
  const userKey = (body.apiKey ?? '').trim();
  const userBase = (body.baseUrl ?? '').trim().replace(/\/+$/u, '');
  const geminiKey =
    spec.provider === 'gemini' || spec.provider === 'imagen'
      ? userKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
      : '';
  const openAiKey =
    spec.provider === 'openai_compatible'
      ? userKey || process.env.OPENAI_API_KEY || process.env.IMAGE_GEN_API_KEY || ''
      : '';

  // Try Google Gemini Nano Banana (generateContent with responseModalities: ["IMAGE", "TEXT"])
  if (spec.provider === 'gemini' && geminiKey) {
    try {
      const host = userBase || 'https://generativelanguage.googleapis.com';
      const targetModel = userBase ? body.modelId || modelName : modelName;
      const endpoint = `${host}/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (upstream.ok) {
        const json = (await upstream.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                text?: string;
                inlineData?: { mimeType?: string; data?: string };
              }>;
            };
          }>;
        };
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find(p => p.inlineData?.data);
        if (imgPart?.inlineData?.data) {
          const mime = imgPart.inlineData.mimeType || 'image/png';
          return NextResponse.json({
            ok: true,
            mode: 'live_api',
            modelId: spec.id,
            modelLabel: spec.label,
            mime,
            imageDataUrl: `data:${mime};base64,${imgPart.inlineData.data}`,
            revisedPrompt: parts.find(p => p.text)?.text ?? prompt,
          });
        }
      }
      const errText = await upstream.text().catch(() => '');
      return NextResponse.json({
        ok: true,
        mode: 'data_bound_composite',
        modelId: spec.id,
        modelLabel: spec.label,
        fallbackReason: `Gemini 网关返回 HTTP ${upstream.status}，已自动启用报告真实数据复合引擎。${errText.slice(0, 120)}`,
      });
    } catch (error) {
      return NextResponse.json({
        ok: true,
        mode: 'data_bound_composite',
        modelId: spec.id,
        modelLabel: spec.label,
        fallbackReason: `外部 Nano Banana 接口连接超时或不可达（${error instanceof Error ? error.message : '网络异常'}），已切换为绑定真实数据的复合信息图渲染。`,
      });
    }
  }

  // Try Google Imagen 3 predict endpoint
  if (spec.provider === 'imagen' && geminiKey) {
    try {
      const host = userBase || 'https://generativelanguage.googleapis.com';
      const endpoint = `${host}/v1beta/models/${encodeURIComponent(modelName)}:predict?key=${encodeURIComponent(geminiKey)}`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: aspect },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (upstream.ok) {
        const json = (await upstream.json()) as {
          predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
        };
        const pred = json.predictions?.[0];
        if (pred?.bytesBase64Encoded) {
          const mime = pred.mimeType || 'image/png';
          return NextResponse.json({
            ok: true,
            mode: 'live_api',
            modelId: spec.id,
            modelLabel: spec.label,
            mime,
            imageDataUrl: `data:${mime};base64,${pred.bytesBase64Encoded}`,
            revisedPrompt: prompt,
          });
        }
      }
      return NextResponse.json({
        ok: true,
        mode: 'data_bound_composite',
        modelId: spec.id,
        modelLabel: spec.label,
        fallbackReason: `Imagen 接口返回 HTTP ${upstream.status}，已自动回退到报告数据复合图形渲染。`,
      });
    } catch (error) {
      return NextResponse.json({
        ok: true,
        mode: 'data_bound_composite',
        modelId: spec.id,
        modelLabel: spec.label,
        fallbackReason: `Imagen 接口不可达（${error instanceof Error ? error.message : '网络异常'}），已使用报告数据复合渲染。`,
      });
    }
  }

  // Try OpenAI Images / Compatible (/v1/images/generations)
  if (spec.provider === 'openai_compatible' && openAiKey) {
    try {
      const host = userBase || 'https://api.openai.com/v1';
      const endpoint = host.endsWith('/images/generations') ? host : `${host}/images/generations`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          prompt,
          n: 1,
          size: sizeForAspect(aspect),
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (upstream.ok) {
        const json = (await upstream.json()) as {
          data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
        };
        const item = json.data?.[0];
        if (item?.b64_json) {
          return NextResponse.json({
            ok: true,
            mode: 'live_api',
            modelId: spec.id,
            modelLabel: spec.label,
            mime: 'image/png',
            imageDataUrl: `data:image/png;base64,${item.b64_json}`,
            revisedPrompt: item.revised_prompt ?? prompt,
          });
        }
        if (item?.url) {
          return NextResponse.json({
            ok: true,
            mode: 'live_api',
            modelId: spec.id,
            modelLabel: spec.label,
            mime: 'image/png',
            imageDataUrl: item.url,
            revisedPrompt: item.revised_prompt ?? prompt,
          });
        }
      }
      return NextResponse.json({
        ok: true,
        mode: 'data_bound_composite',
        modelId: spec.id,
        modelLabel: spec.label,
        fallbackReason: `生图网关返回 HTTP ${upstream.status}，已切换为报告数据复合信息图。`,
      });
    } catch (error) {
      return NextResponse.json({
        ok: true,
        mode: 'data_bound_composite',
        modelId: spec.id,
        modelLabel: spec.label,
        fallbackReason: `生图网关连接失败（${error instanceof Error ? error.message : '网络异常'}），已切换为报告数据复合信息图。`,
      });
    }
  }

  // No external key configured: respond cleanly so client renders deterministic data-bound infographic
  return NextResponse.json({
    ok: true,
    mode: 'data_bound_composite',
    modelId: spec.id,
    modelLabel: spec.label,
    fallbackReason: `未检测到 ${spec.shortLabel} 外部 API Key（可在上方展开填入 Key 或配置环境变量），已根据当前报告冻结统计数据生成精确复合信息图。`,
  });
}
