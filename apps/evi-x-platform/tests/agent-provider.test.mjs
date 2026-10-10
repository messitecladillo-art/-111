import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_PROVIDER_LIMITS, DEFAULT_PROVIDER_BASES, ProviderCallError,
  callAgentProvider, validateProviderBase } from "../lib/agent-provider.ts";

const secret = "synthetic-only-provider-key-20261007";
const config = (extra = {}) => ({ id: "11111111-1111-4111-8111-111111111111", label: "Offline fixture",
  provider: "openai", baseUrl: DEFAULT_PROVIDER_BASES.openai[0], model: "fixture-model",
  capabilities: ["questionnaire"], maxOutputTokens: 1024, revision: 1, ...extra });
const questionnaire = (extra = {}) => ({ kind: "questionnaire", prompt: "请提出问卷改进建议。", ...extra });
const json = (body, options = {}) => new Response(JSON.stringify(body), {
  ...options, headers: { "content-type": "application/json", ...options.headers },
});
const models = () => json({ data: [{ id: "fixture-model" }] });
const completion = (extra = {}) => json({ choices: [{ message: { role: "assistant", content: "建议开展预测试。" },
  finish_reason: "stop" }], ...extra });
const errorCode = (result, code) => {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert(!JSON.stringify(result).includes(secret), "result must never disclose the fixture key");
};

test("fixed destinations require exact canonical HTTPS and compatible is disabled by default", () => {
  for (const [provider, bases] of Object.entries(DEFAULT_PROVIDER_BASES)) {
    if (bases[0]) assert.equal(validateProviderBase(config({ provider, baseUrl: bases[0] })), bases[0]);
  }
  const rejected = ["http://api.openai.com/v1", "https://user:pass@api.openai.com/v1", "https://api.openai.com/v1?x=1",
    "https://api.openai.com/v1#x", "https://api.openai.com/v1?", "https://api.openai.com/v1#",
    "https://API.OPENAI.COM/v1", "https://api.openai.com:443/v1", "https://api.openai.com/v1/",
    " https://api.openai.com/v1", "https://api.openai.com/v1\n", "https://api.openai.com/a/../v1",
    "https://api.openai.com\\v1", "https://api.openai.com.evil.example/v1", "https://127.0.0.1/v1"];
  for (const baseUrl of rejected) assert.throws(() => validateProviderBase(config({ baseUrl })), ProviderCallError);
  assert.throws(() => validateProviderBase(config({ provider: "compatible", baseUrl: "https://operator.example/v1" })),
    error => error.code === "destination_not_allowed");
  const operator = { compatible: ["https://operator.example/v1"] };
  assert.equal(validateProviderBase(config({ provider: "compatible", baseUrl: "https://operator.example/v1" }), operator),
    "https://operator.example/v1");
  assert.throws(() => validateProviderBase(config(), { openai: [] }), error => error.code === "destination_not_allowed");
  assert.throws(() => validateProviderBase(config({ provider: "__proto__" })), ProviderCallError);
});

test("connection test is one GET models call with no generation and no redirects", async () => {
  let calls = 0;
  const result = await callAgentProvider(config(), secret, { kind: "test" }, { fetch: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/models");
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    assert(init.signal instanceof AbortSignal);
    return models();
  } });
  assert.deepEqual(result, { ok: true, kind: "test", connection: "reachable", authentication: "provider_accepted",
    modelAvailable: true, generationVerified: false });
  assert.equal(calls, 1);
  assert(!JSON.stringify(result).includes(secret));
});

test("model listing must contain the selected model and must satisfy the JSON shape", async () => {
  errorCode(await callAgentProvider(config(), secret, { kind: "test" }, { fetch: async () => json({ data: [{ id: "other" }] }) }),
    "model_not_available");
  for (const body of [{}, { data: "bad" }, { data: [{ id: 3 }] }, null]) {
    errorCode(await callAgentProvider(config(), secret, { kind: "test" }, { fetch: async () => json(body) }), "invalid_response");
  }
});

test("OpenAI generation uses max_completion_tokens, store false, one user message and no tools", async () => {
  const result = await callAgentProvider(config(), secret, questionnaire({ maxOutputTokens: 512 }), { fetch: async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.deepEqual(JSON.parse(init.body), { model: "fixture-model", messages: [{ role: "user", content: "请提出问卷改进建议。" }],
      stream: false, n: 1, max_completion_tokens: 512, store: false });
    return completion({ usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 } });
  } });
  assert.deepEqual(result, { ok: true, kind: "questionnaire", text: "建议开展预测试。", contentFormat: "plain_text",
    contentClass: "proposed", verified: false, usage: { inputTokens: 8, outputTokens: 12, totalTokens: 20 } });
});

test("DeepSeek and compatible use max_tokens; Qwen uses max_completion_tokens without fallback", async () => {
  for (const provider of ["deepseek", "qwen", "compatible"]) {
    const baseUrl = DEFAULT_PROVIDER_BASES[provider][0] || "https://operator.example/v1";
    const result = await callAgentProvider(config({ provider, baseUrl }), secret, questionnaire(), {
      allowedBases: { compatible: [baseUrl] }, fetch: async (url, init) => {
        assert.equal(url, `${baseUrl}/chat/completions`);
        const body = JSON.parse(init.body);
        assert.equal(body.max_tokens, provider === "qwen" ? undefined : 1024);
        assert.equal(body.max_completion_tokens, provider === "qwen" ? 1024 : undefined);
        assert.equal(body.store, undefined);
        return completion();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.usage, null);
  }
});

test("invalid config, key, request and token limits fail before any fetch", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; throw new Error(secret); } };
  for (const key of ["", "short", "space key", `${secret}\n`, `${secret}\r`, `${secret}\t`, "密钥密钥密钥密钥", "a".repeat(1025)]) {
    errorCode(await callAgentProvider(config(), key, questionnaire(), options), "invalid_key");
  }
  for (const model of ["", "model\n", "bad model", secret, "a".repeat(161)]) {
    errorCode(await callAgentProvider(config({ model }), secret, questionnaire(), options), "invalid_configuration");
  }
  for (const prompt of ["", "  ", null, "a\u0000b", "a\u000bb"]) {
    errorCode(await callAgentProvider(config(), secret, questionnaire({ prompt }), options), "invalid_request");
  }
  for (const maxOutputTokens of [127, 1025, 4097, NaN, 512.5, "512"]) {
    errorCode(await callAgentProvider(config(), secret, questionnaire({ maxOutputTokens }), options), "invalid_request");
  }
  for (const maxOutputTokens of [127, 4097, NaN, 512.5, "512"]) {
    errorCode(await callAgentProvider(config({ maxOutputTokens }), secret, questionnaire(), options), "invalid_configuration");
  }
  errorCode(await callAgentProvider(config(), secret, { kind: "other" }, options), "invalid_request");
  for (const timeoutMs of [0, -1, NaN, 30001, 1.5, "10"]) {
    errorCode(await callAgentProvider(config(), secret, questionnaire(), { ...options, timeoutMs }), "invalid_configuration");
  }
  assert.equal(calls, 0);
});

test("input cap counts UTF-8 bytes and the escaped JSON envelope before transport", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; return completion(); } };
  errorCode(await callAgentProvider(config(), secret, questionnaire({ prompt: "中".repeat(10923) }), options), "input_too_large");
  errorCode(await callAgentProvider(config(), secret, questionnaire({ prompt: "a".repeat(32768) }), options), "input_too_large");
  errorCode(await callAgentProvider(config(), secret, questionnaire({ prompt: "\"".repeat(17000) }), options), "input_too_large");
  assert.equal(calls, 0);
  assert.equal((await callAgentProvider(config(), secret, questionnaire({ prompt: "中".repeat(10000) }), options)).ok, true);
  assert.equal(calls, 1);
});

test("401, 403, 429, 5xx and other errors expose only fixed errors with no retries", async () => {
  for (const [status, code, retryable] of [[401, "authentication_failed", false], [403, "authentication_failed", false],
    [429, "rate_limited", true], [500, "provider_unavailable", true], [503, "provider_unavailable", true],
    [400, "provider_rejected", false], [404, "provider_rejected", false]]) {
    let calls = 0;
    const result = await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => {
      calls++; return json({ error: { message: `echo ${secret}` } }, { status, headers: { "x-key": secret } });
    } });
    errorCode(result, code);
    assert.equal(result.error.retryable, retryable);
    assert.equal(calls, 1);
    assert.equal(result.headers, undefined);
  }
});

test("redirect responses are rejected without a follow-up request", async () => {
  for (const status of [301, 302, 307, 308]) {
    let calls = 0;
    errorCode(await callAgentProvider(config(), secret, questionnaire(), { fetch: async (_, init) => {
      calls++; assert.equal(init.redirect, "error");
      return new Response(null, { status, headers: { location: "https://attacker.example/" } });
    } }), "redirect_blocked");
    assert.equal(calls, 1);
  }
  errorCode(await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => ({
    redirected: true, status: 200, body: null,
  }) }), "redirect_blocked");
});

test("response cap checks Content-Length and streamed bytes rather than decoded character length", async () => {
  const contentLength = new Response("unused", { headers: { "content-type": "application/json",
    "content-length": String(AGENT_PROVIDER_LIMITS.responseBytes + 1) } });
  errorCode(await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => contentLength }), "response_too_large");
  let cancelCount = 0;
  const bytes = new TextEncoder().encode("中".repeat(AGENT_PROVIDER_LIMITS.responseBytes / 3 + 1));
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, 65536));
    controller.enqueue(bytes.subarray(65536));
  }, cancel() { cancelCount++; return new Promise(() => {}); } });
  errorCode(await callAgentProvider(config(), secret, questionnaire(), { timeoutMs: 500,
    fetch: async () => new Response(stream, { headers: { "content-type": "application/json" } }) }), "response_too_large");
  assert.equal(cancelCount, 1, "cancel is signalled but its unresolved promise is not awaited");
});

test("response exactly at the byte limit is accepted; one additional byte is rejected", async () => {
  const envelope = { choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }] };
  const overhead = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
  envelope.choices[0].message.content = "x".repeat(AGENT_PROVIDER_LIMITS.responseBytes - overhead);
  const accepted = await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => json(envelope) });
  assert.equal(accepted.ok, true);
  envelope.choices[0].message.content += "x";
  errorCode(await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => json(envelope) }), "response_too_large");
});

test("missing or invalid usage is null rather than fabricated token counts", async () => {
  for (const usage of [undefined, null, {}, { prompt_tokens: 1 }, { prompt_tokens: -1, completion_tokens: 2, total_tokens: 1 },
    { prompt_tokens: 1, completion_tokens: 2, total_tokens: 2 }, { prompt_tokens: 1.5, completion_tokens: 2, total_tokens: 3.5 }]) {
    const result = await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => completion({ usage }) });
    assert.equal(result.ok, true);
    assert.equal(result.usage, null);
  }
});

test("outlier usage stays null so a generated proposal remains independent of accounting metadata", async () => {
  const result = await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => completion({
    usage: { prompt_tokens: 2_000_000, completion_tokens: 12, total_tokens: 2_000_012 },
  }) });
  assert.equal(result.ok, true);
  assert.equal(result.text, "建议开展预测试。");
  assert.equal(result.usage, null);
});

test("tool calls, malformed content, reflected keys and non-JSON payloads are rejected", async () => {
  const badChoices = [[], [{ message: { content: "" } }], [{ message: { content: [] } }],
    [{ message: { role: "user", content: "bad" } }], [{ message: { content: "bad", tool_calls: [{ id: "call" }] } }],
    [{ message: { content: "bad", function_call: { name: "run" } } }],
    [{ message: { content: "bad" }, finish_reason: "tool_calls" }], [{ message: { content: "incomplete" }, finish_reason: "length" }],
    [{ message: { content: `echo ${secret}` } }],
    [{ message: { content: "control\u0000bad" } }], [{ message: { content: "a" } }, { message: { content: "b" } }]];
  for (const choices of badChoices) {
    errorCode(await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => json({ choices }) }), "invalid_response");
  }
  for (const response of [new Response("<script>bad()</script>", { headers: { "content-type": "text/html" } }),
    new Response("{bad", { headers: { "content-type": "application/json" } }),
    new Response(new Uint8Array([255, 254]), { headers: { "content-type": "application/json" } }),
    new Response(null, { status: 204 }), new Response("{}")]) {
    errorCode(await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => response }), "invalid_response");
  }
});

test("HTML inside a JSON string is labelled plain text and is never interpreted or executed", async () => {
  const text = '<script>globalThis.providerCodeWasExecuted = true</script>';
  const result = await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => json({
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
  }) });
  assert.equal(result.ok, true);
  assert.equal(result.text, text);
  assert.equal(result.contentFormat, "plain_text");
  assert.equal(globalThis.providerCodeWasExecuted, undefined);
});

test("never resolving fetch is bounded and its abort signal is set", async () => {
  let signal;
  const start = performance.now();
  errorCode(await callAgentProvider(config(), secret, questionnaire(), { timeoutMs: 20, fetch: async (_, init) => {
    signal = init.signal; return new Promise(() => {});
  } }), "timeout");
  assert.equal(signal.aborted, true);
  assert(performance.now() - start < 1000);
});

test("never resolving body and cancellation are bounded by the same deadline", async () => {
  let cancellations = 0;
  const response = { status: 200, redirected: false, headers: new Headers({ "content-type": "application/json" }),
    body: { getReader() { return { read() { return new Promise(() => {}); },
      cancel() { cancellations++; return new Promise(() => {}); }, releaseLock() {} }; } } };
  const start = performance.now();
  errorCode(await callAgentProvider(config(), secret, questionnaire(), { timeoutMs: 20, fetch: async () => response }), "timeout");
  assert.equal(cancellations, 1);
  assert(performance.now() - start < 1000);
});

test("network exceptions cannot expose the key, headers or upstream stack", async () => {
  const result = await callAgentProvider(config(), secret, questionnaire(), { fetch: async () => {
    throw new Error(`Authorization: Bearer ${secret}`);
  } });
  errorCode(result, "network_failed");
  assert.equal(result.error.retryable, false);
  assert.equal(result.error.stack, undefined);
});
