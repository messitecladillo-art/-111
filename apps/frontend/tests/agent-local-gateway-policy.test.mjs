import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const localOrigin = 'http://127.0.0.1:3180';
const localEnv = {
  NODE_ENV: 'development', EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1', EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
  OPENAI_API_KEY: 'synthetic-server-openai', GEMINI_API_KEY: 'synthetic-server-google', DEEPSEEK_API_KEY: 'synthetic-server-chat',
};
const specs = [
  { id: 'gemini-test', provider: 'gemini', apiModel: 'gemini-test', label: 'Synthetic Gemini' },
  { id: 'gpt-image-1', provider: 'openai_compatible', apiModel: 'gpt-image-1', label: 'Synthetic OpenAI' },
];

function compile(relative, env, require = () => { throw new Error('Unexpected import'); }, fetch) {
  const exports = {};
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, { exports, require, process: { env }, fetch, URL, Request, Response, AbortSignal, TextDecoder, Uint8Array }, { filename: relative });
  return exports;
}

function harness(kind, env = localEnv, upstream = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic answer' } }] }))) {
  const calls = [];
  const policy = compile('../lib/agent/local-gateway-policy.ts', env);
  const route = compile(`../app/api/agent/${kind}/route.ts`, env, (name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => Response.json(body, options) } };
    if (name === '@/lib/agent/local-gateway-policy') return policy;
    if (name === '@/lib/agent/image-gen-engine') return { IMAGE_GEN_MODELS: specs };
    if (name === '@/lib/agent/tools-schema') return { AGENT_TOOL_SPECS: [{ id: 'light', zhLabel: 'Synthetic read-only tool' }], toOpenAiToolDefinitions: () => [], validateToolAction: (name) => name === 'light' ? { tool: 'light', args: {} } : null };
    throw new Error(`Unexpected import: ${name}`);
  }, async (url, options) => { calls.push({ url, options }); return upstream(url, options); });
  return { route, calls, policy };
}

function request(body, { origin = localOrigin, host = '127.0.0.1:3180', url = `${localOrigin}/api/agent/brain`, ...headers } = {}) {
  return new Request(url, { method: 'POST', headers: { origin, host, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('local gateway requires development, explicit opt-in and matching literal-loopback origin and host', () => {
  const { localGatewayAllowed } = compile('../lib/agent/local-gateway-policy.ts', localEnv);
  assert.equal(localGatewayAllowed(request({})), true);
  for (const env of [
    { ...localEnv, NODE_ENV: 'production' }, { ...localEnv, NODE_ENV: 'test' },
    { ...localEnv, EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '' }, { ...localEnv, EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: 'http://public.example.test' },
    { ...localEnv, EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: `${localOrigin}/spoof` },
  ]) assert.equal(localGatewayAllowed(request({}), env), false);
  for (const options of [
    { origin: 'https://attacker.example.test' }, { host: 'attacker.example.test' },
    { url: 'http://attacker.example.test/api/agent/brain', 'x-forwarded-host': '127.0.0.1:3180' },
    { 'sec-fetch-site': 'cross-site' }, { origin: '' },
  ]) assert.equal(localGatewayAllowed(request({}, options)), false);
  const read = new Request(`${localOrigin}/api/agent/brain`, { headers: { host: '127.0.0.1:3180', 'sec-fetch-site': 'same-origin', referer: `${localOrigin}/agent` } });
  assert.equal(localGatewayAllowed(read), true);
});

test('production keeps the offline catalogue and composite while making zero credential-funded calls', async () => {
  const env = { ...localEnv, NODE_ENV: 'production' };
  const brain = harness('brain', env);
  const status = await brain.route.GET(request({}));
  assert.equal((await status.json()).available, false);
  const post = await brain.route.POST(request({ message: 'Synthetic', context: {}, custom: { apiKey: 'synthetic-personal-key' } }));
  assert.equal(post.status, 503);
  assert.equal(brain.calls.length, 0);
  const image = harness('image-gen', env);
  const fallback = await image.route.POST(request({ prompt: 'Synthetic', baseUrl: 'http://169.254.169.254' }));
  const payload = await fallback.json();
  assert.equal(payload.mode, 'data_bound_composite');
  assert.match(payload.fallbackReason, /未发起外部模型调用/u);
  assert.equal(image.calls.length, 0);
});

test('custom image hosts cannot receive server or personal credentials, including metadata and redirect URLs', async () => {
  for (const modelId of ['gpt-image-1', 'gemini-test']) {
    for (const baseUrl of ['https://attacker.example.test/v1', 'http://127.0.0.1:8180', 'http://169.254.169.254', 'https://api.openai.com@attacker.example.test/v1']) {
      const { route, calls } = harness('image-gen');
      const response = await route.POST(request({ modelId, baseUrl, prompt: 'Synthetic', apiKey: 'synthetic-personal-key' }));
      assert.equal(response.status, 422);
      assert.equal(calls.length, 0);
    }
  }
});

test('explicit local image call uses a fixed endpoint, header credentials and no redirects', async () => {
  const { route, calls } = harness('image-gen', localEnv, async () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'c3ludGhldGlj' } }] } }] }));
  const response = await route.POST(request({ modelId: 'gemini-test', prompt: 'Synthetic' }));
  assert.equal((await response.json()).mode, 'live_api');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(calls[0].options.headers['x-goog-api-key'], localEnv.GEMINI_API_KEY);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.body.includes(localEnv.GEMINI_API_KEY), false);
});

test('anonymous model overrides cannot change the operator model and context stays below system priority', async () => {
  const { route, calls } = harness('brain');
  const response = await route.POST(request({ message: 'Synthetic', context: { note: 'untrusted-context' }, custom: { model: 'expensive-attacker-model' } }));
  assert.equal(response.status, 200);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'deepseek-chat');
  assert.equal(body.messages[0].content.includes('untrusted-context'), false);
  assert.equal(body.messages[1].role, 'user');
  assert.equal(calls[0].options.redirect, 'error');
});

test('secrets in context or tool traces are rejected before any model request', async () => {
  for (const body of [
    { message: 'Synthetic', context: { pasted: localEnv.DEEPSEEK_API_KEY } },
    { message: 'Synthetic', context: {}, steps: [{ toolOutputs: [{ tool: 'light', text: localEnv.DEEPSEEK_API_KEY }] }] },
  ]) {
    const { route, calls } = harness('brain');
    assert.equal((await route.POST(request(body))).status, 422);
    assert.equal(calls.length, 0);
  }
});

test('provider echo cannot return the operator key through content, reasoning or tool ids', async () => {
  const { route } = harness('brain', localEnv, async () => Response.json({ choices: [{ message: {
    content: localEnv.DEEPSEEK_API_KEY, reasoning_content: localEnv.DEEPSEEK_API_KEY,
    tool_calls: [{ id: localEnv.DEEPSEEK_API_KEY, function: { name: 'light', arguments: '{}' } }],
  } }] }));
  const response = await route.POST(request({ message: 'Synthetic', context: {} }));
  const payload = await response.json();
  assert.equal(JSON.stringify(payload).includes(localEnv.DEEPSEEK_API_KEY), false);
  assert.equal(payload.toolCalls[0].id, 'tc-1');
});

test('provider failure or lost response yields one unknown result with no fake image success or retry', async () => {
  for (const upstream of [async () => new Response('', { status: 503 }), async () => { throw new Error('synthetic lost response'); }]) {
    for (const kind of ['brain', 'image-gen']) {
      const { route, calls } = harness(kind, localEnv, upstream);
      const response = await route.POST(request(kind === 'brain' ? { message: 'Synthetic', context: {} } : { modelId: 'gpt-image-1', prompt: 'Synthetic' }));
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.equal(payload.code, 'provider_outcome_unknown');
      assert.equal(payload.mode, undefined);
      assert.equal(calls.length, 1);
    }
  }
});

test('oversized local input is rejected before a provider request', async () => {
  const { route, calls } = harness('brain');
  assert.equal((await route.POST(request({ message: 'Synthetic', context: {}, extra: 'x'.repeat(120_000) }))).status, 400);
  assert.equal(calls.length, 0);
});

test('image readiness follows the authorized gateway without disclosing key values', async () => {
  const read = new Request(localOrigin + '/api/agent/image-gen', {
    headers: { host: '127.0.0.1:3180', 'sec-fetch-site': 'same-origin', referer: localOrigin + '/agent' },
  });
  for (const enabled of [true, false]) {
    const { route, calls } = harness('image-gen', enabled ? localEnv : { ...localEnv, NODE_ENV: 'production' });
    const response = await route.GET(read);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      providers: { gemini: enabled, imagen: enabled, openai_compatible: enabled },
    });
    assert.equal(calls.length, 0);
  }
});

test('explicit no-tools calls neither expose tools to the provider nor accept returned tool requests', async () => {
  const { route, calls } = harness('brain', localEnv, async () => Response.json({ choices: [{ message: {
    content: 'Synthetic answer',
    tool_calls: [{ id: 'test-call', function: { name: 'light', arguments: '{}' } }],
  } }] }));
  const response = await route.POST(request({ message: 'Synthetic', context: {}, noTools: true }));
  assert.equal(response.status, 200);
  const upstream = JSON.parse(calls[0].options.body);
  assert.equal(Object.hasOwn(upstream, 'tools'), false);
  assert.equal(Object.hasOwn(upstream, 'tool_choice'), false);
  assert.deepEqual((await response.json()).toolCalls, []);
});
