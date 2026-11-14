import { NextResponse } from 'next/server';
import { IMAGE_GEN_MODELS } from '@/lib/agent/image-gen-engine';
import { boundedGatewayJson, localGatewayAllowed } from '@/lib/agent/local-gateway-policy';

export const runtime = 'nodejs';

function composite(modelId: string, modelLabel: string, reason: string) {
  return NextResponse.json({ ok: true, mode: 'data_bound_composite', modelId, modelLabel, fallbackReason: reason });
}

function failed(code: string, message: string, status = 502) {
  // The browser already has a deterministic preview. Do not call it a successful provider result.
  return NextResponse.json({ ok: false, code, error: message, fallbackReason: message }, { status });
}

export async function POST(req: Request) {
  if (!localGatewayAllowed(req)) {
    return composite(IMAGE_GEN_MODELS[0].id, IMAGE_GEN_MODELS[0].label,
      '未发起外部模型调用。当前显示浏览器本地生成的数据复合图；个人模型请使用已登录账号保存的模型服务。');
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await boundedGatewayJson(req, 40_000);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_json');
    body = parsed as Record<string, unknown>;
  } catch {
    return failed('invalid_json', '请求 JSON 格式无效或超出限额。', 400);
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 8000) return failed('invalid_prompt', '生图提示词需在 1 至 8000 字之间。', 422);
  const spec = IMAGE_GEN_MODELS.find(m => m.id === body.modelId) ?? IMAGE_GEN_MODELS[0];
  const aspect = body.aspect ?? '16:9';
  if (!['16:9', '3:4', '1:1'].includes(String(aspect))) return failed('invalid_aspect', '图像比例无效。', 422);
  const requestedModel = typeof body.customModelName === 'string' ? body.customModelName.trim() : '';
  if (requestedModel && !/^[a-zA-Z0-9._:/-]{1,100}$/.test(requestedModel)) return failed('invalid_model', '模型名称无效。', 422);
  const modelName = requestedModel || spec.apiModel;
  const base = spec.provider === 'openai_compatible' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com';
  const userBase = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/u, '') : '';
  // Public arbitrary URLs would turn this server into a credential-forwarding SSRF proxy.
  if (userBase && userBase !== base) return failed('unsupported_gateway', '此本地开发入口仅支持固定供应商地址；兼容网关请使用已保存的个人模型服务。', 422);
  const userKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const apiKey = userKey || (spec.provider === 'openai_compatible'
    ? process.env.OPENAI_API_KEY || process.env.IMAGE_GEN_API_KEY || ''
    : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
  if (!apiKey) return composite(spec.id, spec.label, '未配置本地开发模型密钥，未发起外部调用。当前显示浏览器本地生成的数据复合图。');
  if (apiKey.length > 512 || /[\r\n]/u.test(apiKey) || prompt.includes(apiKey)) return failed('sensitive_input', '密钥格式或提示词材料无效，未发起外部调用。', 422);
  let endpoint: string;
  let payload: Record<string, unknown>;
  if (spec.provider === 'gemini') {
    endpoint = `${base}/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } };
  } else if (spec.provider === 'imagen') {
    endpoint = `${base}/v1beta/models/${encodeURIComponent(modelName)}:predict`;
    payload = { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: aspect } };
  } else {
    endpoint = `${base}/images/generations`;
    payload = { model: modelName, prompt, n: 1,
      size: aspect === '3:4' ? '1024x1536' : aspect === '16:9' ? '1536x1024' : '1024x1024', response_format: 'b64_json' };
  }
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(spec.provider === 'openai_compatible'
        ? { Authorization: `Bearer ${apiKey}` } : { 'x-goog-api-key': apiKey }) },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(45_000),
    });
    if (!upstream.ok) {
      if (upstream.status >= 500) return failed('provider_outcome_unknown', '生图调用结果尚未核对，请先核对供应商记录。当前数据复合图仅为本地预览。');
      return failed('provider_rejected', `生图服务拒绝请求（HTTP ${upstream.status}）。当前数据复合图仅为本地预览。`);
    }
    const json = await boundedGatewayJson(upstream, 16_000_000) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>;
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find(p => p.inlineData?.data)?.inlineData;
    const prediction = json.predictions?.[0];
    const item = json.data?.[0];
    const encoded = spec.provider === 'gemini' ? inline?.data : spec.provider === 'imagen' ? prediction?.bytesBase64Encoded : item?.b64_json;
    const mime = (spec.provider === 'gemini' ? inline?.mimeType : spec.provider === 'imagen' ? prediction?.mimeType : undefined) || 'image/png';
    if (typeof encoded !== 'string' || !encoded || encoded.includes(apiKey) || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      return failed('provider_outcome_unknown', '生图服务未返回可核对的图像，本次调用结果尚未确认。请先核对供应商记录。');
    }
    const revised = spec.provider === 'gemini' ? parts.find(p => p.text)?.text : item?.revised_prompt;
    return NextResponse.json({ ok: true, mode: 'live_api', modelId: spec.id, modelLabel: spec.label, mime,
      imageDataUrl: `data:${mime};base64,${encoded}`,
      revisedPrompt: typeof revised === 'string' ? revised.split(apiKey).join('[REDACTED]').slice(0, 8000) : prompt });
  } catch {
    return failed('provider_outcome_unknown', '生图连接中断或响应无法核对，本次结果尚未确认。请先核对供应商记录；当前数据复合图仅为本地预览。');
  }
}
