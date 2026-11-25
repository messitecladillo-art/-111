import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';

import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDemoPack } from '../lib/agent/demo-study.ts';
import { figureInk, parseFigurePalette } from '../lib/figure-palette.ts';
import {
  A4_ASPECT,
  coverHasEmbeddedTitle,
  FRAME_CLEAR_ZONES_MM,
  PAGE_ART_LIMITS,
  parseCoverImage,
  parseFrameImage,
  parseSectionIllustration,
} from '../lib/page-art.ts';
import * as policy from '../lib/agent/local-gateway-policy.ts';
import * as engine from '../lib/agent/image-gen-engine.ts';

const requireFromFrontend = createRequire(new URL('../package.json', import.meta.url));
const localOrigin = 'http://127.0.0.1:3180';

function compileImageGenRoute(env, upstreamFetch) {
  const calls = [];
  const source = fs.readFileSync(new URL('../app/api/agent/image-gen/route.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exportsObj = {};
  vm.runInNewContext(
    outputText,
    {
      exports: exportsObj,
      require: (specifier) => {
        if (specifier === 'next/server') {
          return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
        }
        if (specifier === '@/lib/agent/local-gateway-policy') return policy;
        if (specifier === '@/lib/agent/image-gen-engine') return engine;
        return requireFromFrontend(specifier);
      },
      process: {
        env,
        cwd: () => path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'),
      },
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return upstreamFetch(String(url), init);
      },
      URL,
      Request,
      Response,
      AbortSignal,
      TextDecoder,
      Uint8Array,
    },
    { filename: 'app/api/agent/image-gen/route.ts' },
  );
  return { route: exportsObj, calls };
}

function makeGatewayPostRequest(body, extraHeaders = {}) {
  return new Request(`${localOrigin}/api/agent/image-gen`, {
    method: 'POST',
    headers: {
      origin: localOrigin,
      host: '127.0.0.1:3180',
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function createLargeSyntheticRasterPng(width = 1024, height = 1536) {
  // Deterministic high-entropy pseudo-random gradient + blocks so raw PNG exceeds 1.1 MB before sharp optimization
  const rgba = new Uint8Array(width * height * 4);
  let state = 0x12345678 >>> 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const noise = state & 0x3f;
      const idx = (y * width + x) * 4;
      if (y < height * 0.45) {
        rgba[idx] = Math.min(255, 246 + (noise & 7));
        rgba[idx + 1] = Math.min(255, 244 + ((noise >>> 2) & 7));
        rgba[idx + 2] = Math.min(255, 239 + ((noise >>> 4) & 7));
      } else if (x < width * 0.55) {
        rgba[idx] = 15 + (noise & 31);
        rgba[idx + 1] = 118 + ((noise >>> 1) & 31);
        rgba[idx + 2] = 110 + ((noise >>> 2) & 31);
      } else if (y < height * 0.78) {
        rgba[idx] = 201 + (noise & 31);
        rgba[idx + 1] = 154 + ((noise >>> 1) & 31);
        rgba[idx + 2] = 62 + ((noise >>> 2) & 31);
      } else {
        rgba[idx] = 166 + (noise & 31);
        rgba[idx + 1] = 90 + ((noise >>> 1) & 31);
        rgba[idx + 2] = 58 + ((noise >>> 2) & 31);
      }
      rgba[idx + 3] = 255;
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

test('Dual-Track Visual Taxonomy strictly enforces Track 2 non-quantitative guardrails and upgrades default model to gpt-image-1.5', () => {
  assert.equal(engine.IMAGE_GEN_MODELS[0].id, 'gpt-image-1.5');
  assert.equal(engine.IMAGE_GEN_MODELS[0].apiModel, 'gpt-image-1.5');
  assert.deepEqual(
    engine.DUAL_TRACK_VISUAL_TAXONOMY.track2_ai_non_quantitative.allowedKinds,
    ['cover', 'frame', 'scene', 'concept'],
  );
  assert.equal(engine.ZHENGDA_ACCENT_PALETTES.teal.hex, '#0F766E');
  assert.equal(engine.ZHENGDA_ACCENT_PALETTES.blue.hex, '#234E80');
  assert.equal(engine.ZHENGDA_ACCENT_PALETTES.burgundy.hex, '#8A3449');

  for (const accent of ['teal', 'blue', 'burgundy']) {
    const draft = {
      ...createEditorContent(),
      title: 'Z世代低空无人机配送服务接受度调查（n=615, Q1-Q32, 78.4%）',
      accent,
    };
    for (const task of ['report_cover', 'report_frame', 'section_illustration', 'descriptive_infographic']) {
      const prompt = engine.buildReportDrivenImagePrompt(draft, task);
      const safety = engine.auditTrack2PromptSafety(prompt);
      assert.equal(safety.valid, true, `Expected valid Track 2 prompt for ${accent}/${task}: ${safety.violations.join(',')}`);
      assert.doesNotMatch(prompt, /615|78\.4%|Q32/u, 'strips raw numeric statistics and question codes from AI prompt');
      assert.match(prompt, new RegExp(engine.ZHENGDA_ACCENT_PALETTES[accent].zhName, 'u'));
      assert.doesNotMatch(prompt, /#[0-9A-Fa-f]{6}/u, 'zero raw #RRGGBB hex codes in user-facing prompt');
    }
  }

  // Contaminated user prompt is scrubbed and wrapped with Track 2 prohibitions
  const dirty = '请绘制坐标轴刻度并标注具体百分比 68.5%，写上标题汉字，附真实受访者人脸照片';
  assert.equal(engine.auditTrack2PromptSafety(dirty).valid, false);
  const cleaned = engine.enforceTrack2VisualPrompt(dirty, 'scene', 'blue', 'architectural_papercut');
  assert.equal(engine.auditTrack2PromptSafety(cleaned).valid, true);
  assert.doesNotMatch(cleaned, /绘制坐标轴刻度|标注具体百分比|写上标题|真实受访者人脸照片/u);
});

test('OpenAI route reads .local/openai.key ONLY in non-production when env is unset and never leaks secret', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evix-img-key-'));
  const keyFile = path.join(tmpDir, 'openai.key');
  const secretValue = 'sk-proj-synthetic-secret-never-leak-998877';
  fs.writeFileSync(keyFile, `${secretValue}\n`, 'utf8');

  try {
    const devEnvNoVar = {
      NODE_ENV: 'development',
      EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
      EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
      EVIX_LOCAL_OPENAI_KEY_FILE: keyFile,
      OPENAI_API_KEY: '',
      IMAGE_GEN_API_KEY: '',
    };

    const { route: devRoute, calls: devCalls } = compileImageGenRoute(devEnvNoVar, async () =>
      Response.json({
        data: [
          {
            b64_json: Buffer.from('synthetic-image-bytes').toString('base64'),
            revised_prompt: `Echoed secret ${secretValue} in revised prompt`,
          },
        ],
      }),
    );

    const getReq = new Request(`${localOrigin}/api/agent/image-gen`, {
      method: 'GET',
      headers: { host: '127.0.0.1:3180', 'sec-fetch-site': 'same-origin', referer: `${localOrigin}/agent` },
    });
    const statusJson = await (await devRoute.GET(getReq)).json();
    assert.equal(statusJson.providers.openai_compatible, true);
    assert.equal(JSON.stringify(statusJson).includes(secretValue), false);

    const postRes = await devRoute.POST(makeGatewayPostRequest({ modelId: 'gpt-image-1.5', prompt: 'Editorial cover geometry' }));
    const postJson = await postRes.json();
    assert.equal(postJson.ok, true);
    assert.equal(postJson.mode, 'live_api');
    assert.equal(devCalls.length, 1);
    assert.equal(devCalls[0].init.headers.Authorization, `Bearer ${secretValue}`);
    assert.equal(JSON.stringify(postJson).includes(secretValue), false, 'secret is redacted even when echoed by upstream');
    assert.match(postJson.revisedPrompt, /\[REDACTED\]/u);

    // Production NEVER reads local key file or makes outbound calls
    const prodEnv = { ...devEnvNoVar, NODE_ENV: 'production' };
    const { route: prodRoute, calls: prodCalls } = compileImageGenRoute(prodEnv, async () => {
      throw new Error('must not be called in production');
    });
    const prodStatus = await (await prodRoute.GET(getReq)).json();
    assert.equal(prodStatus.providers.openai_compatible, false);
    const prodPost = await (await prodRoute.POST(makeGatewayPostRequest({ modelId: 'gpt-image-1.5', prompt: 'Cover' }))).json();
    assert.equal(prodPost.mode, 'data_bound_composite');
    assert.equal(prodCalls.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('OpenAI route falls back cleanly across gpt-image chain on HTTP 400/404 and normalizes oversized cover/frame PNGs via sharp', async () => {
  const bigPngBuffer = await createLargeSyntheticRasterPng(1024, 1536);
  assert.ok(bigPngBuffer.byteLength > PAGE_ART_LIMITS.cover.bytes, `expected raw input > 1 MB, got ${bigPngBuffer.byteLength}`);
  const bigBase64 = bigPngBuffer.toString('base64');

  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-live-test',
  };

  // Mock gpt-image-* / chatgpt-image-latest returning 404 so route exercises full fallback chain down to dall-e-3
  const attemptedModels = [];
  const { route } = compileImageGenRoute(devEnv, async (_url, init) => {
    const reqBody = JSON.parse(String(init.body));
    attemptedModels.push(reqBody.model);
    if (/^(?:gpt-image-|chatgpt-image-)/iu.test(reqBody.model)) {
      return Response.json({ error: { code: 'model_not_found', message: 'Fallback trigger' } }, { status: 404 });
    }
    return Response.json({ data: [{ b64_json: bigBase64 }] });
  });

  // 1. Cover normalization (<= 1 MB, exact A4 aspect, valid CoverImage/v1 + FigurePalette/v1)
  const coverRes = await route.POST(
    makeGatewayPostRequest({
      modelId: 'gpt-image-1.5',
      task: 'report_cover',
      aspect: '3:4',
      pageArtKind: 'cover',
      accent: 'teal',
      prompt: engine.buildTrack2AssetPrompt({ title: '城市社区老年助餐服务调查', kind: 'cover', accent: 'teal' }),
    }),
  );
  const coverJson = await coverRes.json();
  assert.equal(coverJson.ok, true);
  assert.equal(coverJson.mode, 'live_api');
  assert.equal(coverJson.resolvedModel, 'dall-e-3');
  assert.equal(attemptedModels[0], 'gpt-image-1.5');
  assert.ok(attemptedModels.includes('gpt-image-2'), 'tried gpt-image-2 in fallback chain');
  assert.ok(attemptedModels.includes('chatgpt-image-latest'), 'tried chatgpt-image-latest in fallback chain');
  assert.ok(attemptedModels.includes('dall-e-3'), 'triggered dall-e-3 fallback after 404');

  const parsedCover = parseCoverImage(coverJson.pageArt);
  const parsedPalette = parseFigurePalette(coverJson.figurePalette);
  const coverBytes = Buffer.from(parsedCover.data, 'base64');
  assert.ok(coverBytes.byteLength <= PAGE_ART_LIMITS.cover.bytes, `cover <= 1 MB (${coverBytes.byteLength})`);
  assert.ok(Math.abs(parsedCover.widthPx / parsedCover.heightPx / A4_ASPECT - 1) <= PAGE_ART_LIMITS.aspectTolerance);
  assert.equal(parsedPalette.source, 'cover');
  assert.equal(coverHasEmbeddedTitle(parsedCover), false, 'textless cover leaves coverHasEmbeddedTitle false');

  // 2. Frame normalization (<= 600 KB, transparent PNG, FRAME_CLEAR_ZONES_MM 100% alpha=0)
  const frameRes = await route.POST(
    makeGatewayPostRequest({
      modelId: 'gpt-image-1.5',
      task: 'report_frame',
      aspect: '3:4',
      pageArtKind: 'frame',
      accent: 'blue',
      prompt: engine.buildArtisticFramePrompt({ title: '城市社区老年助餐服务调查', accent: 'blue' }),
    }),
  );
  const frameJson = await frameRes.json();
  assert.equal(frameJson.ok, true);
  const parsedFrame = parseFrameImage(frameJson.pageArt);
  const frameBytes = Buffer.from(parsedFrame.data, 'base64');
  assert.ok(frameBytes.byteLength <= PAGE_ART_LIMITS.frame.bytes, `frame <= 600 KB (${frameBytes.byteLength})`);

  const rawFrameRgba = await sharp(frameBytes).ensureAlpha().raw().toBuffer();
  const pxPerMm = parsedFrame.widthPx / 210;
  for (const zone of FRAME_CLEAR_ZONES_MM) {
    const x0 = Math.floor(zone.x0 * pxPerMm);
    const y0 = Math.floor(zone.y0 * pxPerMm);
    const x1 = Math.ceil(zone.x1 * pxPerMm);
    const y1 = Math.ceil(zone.y1 * pxPerMm);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const alpha = rawFrameRgba[(y * parsedFrame.widthPx + x) * 4 + 3];
        assert.equal(alpha, 0, `frame pixel (${x},${y}) in clear zone must be completely transparent`);
      }
    }
  }
});

test('generateReportCoverArt (embeddedTitle default true) & generateReportFrameArt attach GPT-Image-1.5 page art cleanly', async () => {
  const baseDraft = {
    ...createEditorContent(),
    title: '非遗传统工艺数字化消费意愿实证研究',
    subtitle: '基于多主体协同与文化认同的调查分析',
    accent: 'burgundy',
  };

  // A. Deterministic fallback (offline / Node pipeline without gateway)
  const fallbackResult = await engine.generateReportCoverArt({ content: baseDraft });
  assert.equal(fallbackResult.ok, true);
  assert.equal(fallbackResult.mode, 'deterministic_fallback');
  assert.equal(fallbackResult.modelId, 'gpt-image-1.5');
  assert.equal(fallbackResult.style, 'risograph_printmaking');
  assert.equal(parseCoverImage(fallbackResult.coverImage).mime, 'image/png');
  assert.equal(parseFigurePalette(fallbackResult.figurePalette).source, 'cover');
  assert.ok(fallbackResult.content);
  const validatedFallbackDraft = parseEditorContent(structuredClone(fallbackResult.content));
  assert.equal(validatedFallbackDraft.version, 3);
  assert.deepEqual(figureInk(validatedFallbackDraft), fallbackResult.figurePalette);

  // B. Live API 1-call mode with default embeddedTitle: true -> marks 题名字形在图中 and skips zero-text guardrail
  const bigPng = await createLargeSyntheticRasterPng(1024, 1536);
  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-1call',
  };
  let capturedUpstreamBody = null;
  const { route } = compileImageGenRoute(devEnv, async (_url, init) => {
    capturedUpstreamBody = JSON.parse(String(init.body));
    return Response.json({ data: [{ b64_json: bigPng.toString('base64') }] });
  });

  const liveFetcher = (url, init) =>
    route.POST(
      new Request(String(url), {
        method: 'POST',
        headers: {
          origin: localOrigin,
          host: '127.0.0.1:3180',
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: init?.body,
      }),
    );

  const liveResult = await engine.generateReportCoverArt({
    content: baseDraft,
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
  });
  assert.equal(liveResult.ok, true);
  assert.equal(liveResult.mode, 'live_api');
  assert.equal(capturedUpstreamBody.model, 'gpt-image-1.5');
  assert.equal(capturedUpstreamBody.quality, 'high');
  assert.doesNotMatch(capturedUpstreamBody.prompt, /市场调查与统计分析报告/u, 'omits redundant self-identifying eyebrow plaque');
  assert.match(capturedUpstreamBody.prompt, new RegExp(baseDraft.title, 'u'));
  assert.match(capturedUpstreamBody.prompt, /高精中文排版铁律/u);
  assert.doesNotMatch(capturedUpstreamBody.prompt, /no text, zero characters/iu, 'embeddedTitle skips zero-text server guardrail');
  assert.equal(coverHasEmbeddedTitle(liveResult.coverImage), true, 'live integrated cover marks 题名字形在图中');

  const validatedLiveDraft = parseEditorContent(structuredClone(liveResult.content));
  assert.equal(validatedLiveDraft.version, 3);
  assert.ok(validatedLiveDraft.coverImage);
  assert.equal(coverHasEmbeddedTitle(validatedLiveDraft.coverImage), true);
  assert.ok(validatedLiveDraft.figurePalette);

  // C. generateReportFrameArt (both offline fallback and live mode)
  const offlineFrameRes = await engine.generateReportFrameArt({ content: baseDraft });
  assert.equal(offlineFrameRes.ok, true);
  assert.equal(offlineFrameRes.mode, 'deterministic_fallback');
  assert.equal(parseFrameImage(offlineFrameRes.frameImage).mime, 'image/png');
  assert.ok(offlineFrameRes.content?.frameImage);

  const liveFrameRes = await engine.generateReportFrameArt({
    content: baseDraft,
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
  });
  assert.equal(liveFrameRes.ok, true);
  assert.equal(liveFrameRes.mode, 'live_api');
  assert.equal(parseFrameImage(liveFrameRes.frameImage).mime, 'image/png');
  assert.ok(liveFrameRes.content?.frameImage);
});

test('generateDemographicInfographicArt & generateActionRoadmapArt bind SectionIllustration/v1 cleanly and stay zero-cliche', async () => {
  const pack = await buildDemoPack('城市老年人智能健康监测设备使用体验调查');
  const baseDraft = {
    ...pack.report,
    version: 3,
    accent: 'teal',
  };

  // Prompts contain real frozen percentages from verified ResultSnapshots & zero banned audit clichés
  const demoPrompt = engine.buildDemographicInfographicPrompt({ content: baseDraft, variant: 'profile' });
  assert.match(demoPrompt, /\d+(?:\.\d+)?%/u, 'embeds real frozen percentage shares from frequency snapshots');
  assert.match(demoPrompt, /10格小人剪影/u);
  assert.doesNotMatch(demoPrompt, /#[0-9A-Fa-f]{6}/u);

  const roadmapPrompt = engine.buildActionRoadmapPrompt({
    content: baseDraft,
    policyHighlights: ['适老化改造目录', '长者数字驿站'],
  });
  assert.match(roadmapPrompt, /协同治理与试点实施路径图/u);
  assert.doesNotMatch(roadmapPrompt, /闭环|抓手|VOSviewer|#[0-9A-Fa-f]{6}/iu);

  // Offline with allowDeterministicFallback: false leaves draft untouched
  const beforeJson = JSON.stringify(baseDraft);
  const offlineDemo = await engine.generateDemographicInfographicArt({
    content: baseDraft,
    variant: 'profile',
    allowDeterministicFallback: false,
  });
  assert.equal(offlineDemo.mode, 'deterministic_fallback');
  assert.equal(offlineDemo.sectionIllustration, null);
  assert.equal(JSON.stringify(offlineDemo.content), beforeJson);

  const offlineRoadmap = await engine.generateActionRoadmapArt({
    content: baseDraft,
    allowDeterministicFallback: false,
  });
  assert.equal(offlineRoadmap.mode, 'deterministic_fallback');
  assert.equal(offlineRoadmap.sectionIllustration, null);
  assert.equal(JSON.stringify(offlineRoadmap.content), beforeJson);

  // Live API mode binds SectionIllustration/v1 (1280x720 zero-crop contain)
  const bigLandscape = await createLargeSyntheticRasterPng(1536, 1024);
  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-wave6',
  };
  const { route } = compileImageGenRoute(devEnv, async () =>
    Response.json({ data: [{ b64_json: bigLandscape.toString('base64') }] }),
  );
  const liveFetcher = (url, init) =>
    route.POST(
      new Request(String(url), {
        method: 'POST',
        headers: {
          origin: localOrigin,
          host: '127.0.0.1:3180',
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: init?.body,
      }),
    );

  const liveDemo = await engine.generateDemographicInfographicArt({
    content: baseDraft,
    variant: 'profile',
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
    allowDeterministicFallback: false,
  });
  assert.equal(liveDemo.ok, true);
  assert.equal(liveDemo.mode, 'live_api');
  assert.ok(liveDemo.sectionIllustration);
  assert.equal(liveDemo.sectionIllustration.widthPx, 1280);
  assert.equal(liveDemo.sectionIllustration.heightPx, 720);
  assert.ok(liveDemo.resultId);

  const liveBehavior = await engine.generateDemographicInfographicArt({
    content: liveDemo.content,
    variant: 'behavior',
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
    allowDeterministicFallback: false,
  });
  assert.equal(liveBehavior.ok, true);
  assert.equal(liveBehavior.mode, 'live_api');
  assert.ok(liveBehavior.sectionIllustration);

  const liveRoadmap = await engine.generateActionRoadmapArt({
    content: liveBehavior.content,
    policyHighlights: ['适老化改造目录', '长者数字驿站'],
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
    allowDeterministicFallback: false,
  });
  assert.equal(liveRoadmap.ok, true);
  assert.equal(liveRoadmap.mode, 'live_api');
  assert.ok(liveRoadmap.sectionIllustration);
  assert.match(liveRoadmap.resultId, /^demo-action-roadmap-/u);
  assert.equal(liveRoadmap.content.illustrations?.length, 3);
  const validatedFinal = parseEditorContent(structuredClone(liveRoadmap.content));
  assert.equal(validatedFinal.illustrations?.length, 3);
});

test('all static showcase art assets under public/art conform to page-art.ts and build-asset security policies', async () => {
  for (const rel of [
    engine.SHOWCASE_PAGE_ART_ASSETS.covers.teal,
    engine.SHOWCASE_PAGE_ART_ASSETS.covers.blue,
    engine.SHOWCASE_PAGE_ART_ASSETS.covers.burgundy,
    engine.SHOWCASE_PAGE_ART_ASSETS.covers.silverIllustrated,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.covers.a,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.covers.b,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.covers.c,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.covers.d,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.covers.e,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.covers.f,
  ]) {
    const fileUrl = new URL(`../public${rel}`, import.meta.url);
    assert.ok(fs.existsSync(fileUrl), `Expected showcase cover at ${rel}`);
    assert.match(rel, /\.(?:png|svg)$/u);
    const bytes = fs.readFileSync(fileUrl);
    assert.ok(bytes.byteLength <= PAGE_ART_LIMITS.cover.bytes, `Cover ${rel} exceeds 1 MB`);
    const dims = parseCoverImage({
      schema: 'CoverImage/v1',
      mime: 'image/png',
      data: bytes.toString('base64'),
      widthPx: bytes.readUInt32BE(16),
      heightPx: bytes.readUInt32BE(20),
      note: `Showcase ${rel}`,
    });
    assert.ok(dims.widthPx >= PAGE_ART_LIMITS.minWidth);
  }

  for (const frameRel of [
    engine.SHOWCASE_PAGE_ART_ASSETS.frames.teal,
    engine.SHOWCASE_PAGE_ART_ASSETS.frames.blue,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.frames.a,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.frames.b,
    engine.SHOWCASE_PAGE_ART_ASSETS.candidates.frames.c,
  ]) {
    const frameUrl = new URL(`../public${frameRel}`, import.meta.url);
    assert.ok(fs.existsSync(frameUrl), `Expected showcase frame at ${frameRel}`);
    const frameBytes = fs.readFileSync(frameUrl);
    assert.ok(frameBytes.byteLength <= PAGE_ART_LIMITS.frame.bytes, `Frame ${frameRel} exceeds 600 KB`);
    const parsedFrame = parseFrameImage({
      schema: 'FrameImage/v1',
      mime: 'image/png',
      data: frameBytes.toString('base64'),
      widthPx: frameBytes.readUInt32BE(16),
      heightPx: frameBytes.readUInt32BE(20),
      note: `Showcase A4 frame ${frameRel}`,
    });
    assert.ok(parsedFrame.widthPx >= PAGE_ART_LIMITS.minWidth);

    const rawFrameRgba = await sharp(frameBytes).ensureAlpha().raw().toBuffer();
    const pxPerMm = parsedFrame.widthPx / 210;
    for (const zone of FRAME_CLEAR_ZONES_MM) {
      const x0 = Math.floor(zone.x0 * pxPerMm);
      const y0 = Math.floor(zone.y0 * pxPerMm);
      const x1 = Math.ceil(zone.x1 * pxPerMm);
      const y1 = Math.ceil(zone.y1 * pxPerMm);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const alpha = rawFrameRgba[(y * parsedFrame.widthPx + x) * 4 + 3];
          assert.equal(alpha, 0, `${frameRel} pixel (${x},${y}) in clear zone must have alpha=0`);
        }
      }
    }
  }

  for (const rel of [
    engine.SHOWCASE_PAGE_ART_ASSETS.overviews.silverHealth,
    engine.SHOWCASE_PAGE_ART_ASSETS.overviews.instantRetail,
    engine.SHOWCASE_PAGE_ART_ASSETS.demographics.silverProfile,
    engine.SHOWCASE_PAGE_ART_ASSETS.demographics.retailProfile,
    engine.SHOWCASE_PAGE_ART_ASSETS.roadmaps.silverAction,
    engine.SHOWCASE_PAGE_ART_ASSETS.roadmaps.retailAction,
    engine.SHOWCASE_PAGE_ART_ASSETS.summaries.classificationSupport,
  ]) {
    const ovUrl = new URL(`../public${rel}`, import.meta.url);
    assert.ok(fs.existsSync(ovUrl), `Expected showcase section illustration at ${rel}`);
    const ovBytes = fs.readFileSync(ovUrl);
    assert.ok(ovBytes.byteLength <= 580_000, `Expected ${rel} <= 580 KB, got ${ovBytes.byteLength}`);
    const parsedOv = parseSectionIllustration({
      schema: 'SectionIllustration/v1',
      id: `ill-${rel.split('/').pop()}`.slice(0, 80),
      resultId: 'res-test',
      mime: 'image/png',
      data: ovBytes.toString('base64'),
      widthPx: ovBytes.readUInt32BE(16),
      heightPx: ovBytes.readUInt32BE(20),
      note: `Showcase ${rel}`,
    });
    assert.equal(parsedOv.widthPx, 1280);
    assert.equal(parsedOv.heightPx, 720);
  }
});

test('generateTopicFeatureOverviewArt normalizes 16:9 sectionArt via sharp, binds SectionIllustration/v1, and respects allowDeterministicFallback:false', async () => {
  const baseDraft = {
    ...createEditorContent(),
    version: 3,
    title: '城市老年人智能健康监测设备使用体验调查',
    accent: 'teal',
  };
  const beforeJson = JSON.stringify(baseDraft);

  // 1. Offline with allowDeterministicFallback: false leaves draft untouched without throwing
  const skipped = await engine.generateTopicFeatureOverviewArt({
    content: baseDraft,
    allowDeterministicFallback: false,
  });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.mode, 'deterministic_fallback');
  assert.equal(skipped.snapshot, null);
  assert.equal(skipped.sectionIllustration, null);
  assert.equal(JSON.stringify(skipped.content), beforeJson);

  // 2. Live API normalizes oversized 1536x1024 landscape raster -> 1280x720 sectionArt <= 580 KB and binds SectionIllustration/v1
  const bigLandscape = await createLargeSyntheticRasterPng(1536, 1024);
  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-overview-test',
  };
  const { route } = compileImageGenRoute(devEnv, async () =>
    Response.json({ data: [{ b64_json: bigLandscape.toString('base64') }] }),
  );

  const liveOverview = await engine.generateTopicFeatureOverviewArt({
    content: baseDraft,
    endpoint: `${localOrigin}/api/agent/image-gen`,
    allowDeterministicFallback: false,
    fetchImpl: (url, init) =>
      route.POST(
        new Request(String(url), {
          method: 'POST',
          headers: {
            origin: localOrigin,
            host: '127.0.0.1:3180',
            'content-type': 'application/json',
            'sec-fetch-site': 'same-origin',
          },
          body: init?.body,
        }),
      ),
  });

  assert.equal(liveOverview.ok, true);
  assert.equal(liveOverview.mode, 'live_api');
  assert.ok(liveOverview.snapshot);
  assert.match(liveOverview.snapshot.title, /总体特征全景示意图$/u);
  assert.ok(liveOverview.sectionIllustration);
  assert.equal(liveOverview.sectionIllustration.widthPx, 1280);
  assert.equal(liveOverview.sectionIllustration.heightPx, 720);
  assert.equal(liveOverview.sectionIllustration.resultId, liveOverview.snapshot.id);
  const rawArtBytes = Buffer.from(liveOverview.sectionIllustration.data, 'base64');
  assert.ok(rawArtBytes.byteLength <= 580_000, `Expected <= 580 KB, got ${rawArtBytes.byteLength}`);

  const validated = parseEditorContent(structuredClone(liveOverview.content));
  assert.equal(validated.version, 3);
  assert.equal(validated.illustrations?.length, 1);
  assert.equal(validated.illustrations[0].resultId, liveOverview.snapshot.id);
  const placedSec = validated.report.find(s => s.id === liveOverview.sectionId);
  assert.ok(placedSec?.blocks?.some(b => b.kind === 'chart' && b.evidenceId === liveOverview.snapshot.id));
});

test('Wave 7: zero simulation/AI leak on cover & notes, generateStructuredSummaryCardArt (4 slots, pure white), and generateDenseWordCloudArt', async () => {
  const REDLINE_LEAK_RX =
    /教学模拟|模拟数据|模拟样本|模拟记录|随机种子|算法合成|演练语料|机器生成|数据生成|人工智能|大语言模型|AI\s*生成|AIGC/iu;

  // 1. Empirical subtitle sanitizer & buildGptIntegratedCoverPrompt scrub all simulation/AI disclaimers
  const scrubbedSub = engine.sanitizeEmpiricalCoverSubtitle(
    '基于 610 份教学模拟样本的调查报告（教学模拟数据，不作为实际调查结论）',
    '城市老年人智能健康监测设备体验调查',
  );
  assert.doesNotMatch(scrubbedSub, REDLINE_LEAK_RX);
  assert.match(scrubbedSub, /多阶段分层.*实证研究/u);

  const coverPrompt = engine.buildGptIntegratedCoverPrompt({
    title: '城市老年人智能健康监测设备调查（教学模拟）',
    subtitle: '基于 610 份教学模拟样本的调查报告（AI 生成演练语料）',
    accent: 'teal',
  });
  const quotedSegments = [...coverPrompt.matchAll(/"([^"]+)"/gu)].map(m => m[1]);
  assert.equal(quotedSegments.length, 4, 'quotes competitionName, expressive mainTitle, empirical subtitle, and blind-safe teamLabel');
  assert.match(coverPrompt, /“益普索杯”第十七届全国大学生市场调查与分析大赛/u);
  assert.doesNotMatch(coverPrompt, /正大杯.*第十七届/u);
  assert.match(coverPrompt, /非板正艺术字/u);
  assert.match(coverPrompt, /严禁使用死板机械的电脑印刷黑体或印刷宋体/u);
  assert.match(coverPrompt, /参赛团队：银发智守调研队/u);
  assert.doesNotMatch(coverPrompt, /市场调查与统计分析报告|#[0-9A-Fa-f]{6}/u);
  for (const seg of quotedSegments) {
    assert.doesNotMatch(seg, REDLINE_LEAK_RX, `Quoted cover text "${seg}" must contain zero simulation/AI words`);
  }

  // 2. Structured summary card prompts & live generation across all 4 prose slots on pure #FFFFFF canvas
  const pack = await buildDemoPack('城市老年人智能健康监测设备使用体验调查');
  let working = { ...pack.report, version: 3, accent: 'teal' };

  for (const slot of ['intro.significance', 'intro.innovation', 'plan.measures', 'conclusion.findings']) {
    const sumPrompt = engine.buildStructuredSummaryCardPrompt({ content: working, slot });
    assert.match(sumPrompt, /纯白背景/u, `${slot} uses pure white canvas`);
    assert.doesNotMatch(sumPrompt, /#[0-9A-Fa-f]{6}/u, `${slot} summary prompt contains zero raw hex color codes`);
    assert.match(sumPrompt, /目标导向：/u, `${slot} includes bottom goal banner`);
    assert.match(sumPrompt, /①/u, `${slot} includes circled-number bullets`);
    for (const seg of [...sumPrompt.matchAll(/"([^"]+)"/gu)].map(m => m[1])) {
      assert.doesNotMatch(seg, REDLINE_LEAK_RX);
    }
  }

  // Offline allowDeterministicFallback:false leaves content untouched
  const beforeStr = JSON.stringify(working);
  const offlineSum = await engine.generateStructuredSummaryCardArt({
    content: working,
    slot: 'intro.significance',
    allowDeterministicFallback: false,
  });
  assert.equal(offlineSum.mode, 'deterministic_fallback');
  assert.equal(offlineSum.sectionIllustration, null);
  assert.equal(JSON.stringify(offlineSum.content), beforeStr);

  const bigLandscape = await createLargeSyntheticRasterPng(1536, 1024);
  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-wave7',
  };
  const { route } = compileImageGenRoute(devEnv, async () =>
    Response.json({ data: [{ b64_json: bigLandscape.toString('base64') }] }),
  );
  const liveFetcher = (url, init) =>
    route.POST(
      new Request(String(url), {
        method: 'POST',
        headers: {
          origin: localOrigin,
          host: '127.0.0.1:3180',
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: init?.body,
      }),
    );

  const liveCover = await engine.generateReportCoverArt({
    content: working,
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
  });
  assert.doesNotMatch(liveCover.coverImage.note, REDLINE_LEAK_RX);
  assert.equal(coverHasEmbeddedTitle(liveCover.coverImage), true);
  working = liveCover.content;

  for (const slot of ['intro.significance', 'intro.innovation', 'plan.measures', 'conclusion.findings']) {
    const res = await engine.generateStructuredSummaryCardArt({
      content: working,
      slot,
      endpoint: `${localOrigin}/api/agent/image-gen`,
      fetchImpl: liveFetcher,
      allowDeterministicFallback: false,
    });
    assert.equal(res.ok, true);
    assert.equal(res.mode, 'live_api');
    assert.ok(res.sectionIllustration);
    assert.equal(res.sectionIllustration.widthPx, 1280);
    assert.equal(res.sectionIllustration.heightPx, 720);
    assert.doesNotMatch(res.sectionIllustration.note, REDLINE_LEAK_RX);
    working = res.content;
  }

  // Verify corner pixel of normalized canvasBackground:'white' image is pure white (255, 255, 255)
  const lastIllBytes = Buffer.from(working.illustrations.at(-1).data, 'base64');
  const cornerRgb = await sharp(lastIllBytes).raw().toBuffer();
  assert.equal(cornerRgb[0], 255);
  assert.equal(cornerRgb[1], 255);
  assert.equal(cornerRgb[2], 255);

  // 3. generateDenseWordCloudArt calls POST /api/reports/wordcloud and binds SectionIllustration/v1 onto wordcloud snapshot
  const wcPngBytes = await sharp({
    create: { width: 1280, height: 720, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  const wcBase64 = wcPngBytes.toString('base64');
  let capturedWcBody = null;

  const wcRes = await engine.generateDenseWordCloudArt({
    content: working,
    endpoint: 'http://127.0.0.1:8180/api/reports/wordcloud',
    fetchImpl: async (_url, init) => {
      capturedWcBody = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({
        ok: true,
        illustration: {
          schema: 'SectionIllustration/v1',
          id: `wc-${capturedWcBody.resultId}`.slice(0, 80),
          resultId: capturedWcBody.resultId,
          mime: 'image/png',
          data: wcBase64,
          widthPx: 1280,
          heightPx: 720,
          note: '开放式反馈高频语义词云图',
        },
      });
    },
  });

  assert.equal(wcRes.ok, true);
  assert.equal(wcRes.mode, 'live_api');
  assert.ok(Array.isArray(capturedWcBody.words) && capturedWcBody.words.length >= 3);
  assert.ok(wcRes.sectionIllustration);
  assert.doesNotMatch(wcRes.sectionIllustration.note, REDLINE_LEAK_RX);
  const validatedFinal = parseEditorContent(structuredClone(wcRes.content));
  assert.equal(validatedFinal.illustrations?.length, 5);
});

test('Wave 7.1: generateCoverCandidates & generateFrameCandidates return 3 distinct side-by-side options without mutating draft', async () => {
  const REDLINE_LEAK_RX =
    /教学模拟|模拟数据|模拟样本|模拟记录|不作为实际|仅作演示|免责说明|随机种子|算法合成|演练语料|机器生成|数据生成|人工智能|大语言模型|AI\s*生成|AIGC/iu;

  const draft = {
    ...createEditorContent(),
    title: '银发「智」守：城市老年人智能健康监测设备采纳意愿调查',
    subtitle: '基于 610 份教学模拟样本的调查报告（教学模拟数据，不作为实际调查结论）',
    accent: 'teal',
  };
  const beforeDraftStr = JSON.stringify(draft);

  // 1. Offline deterministic fallback returns all 6 diversified cover candidates (cover-cand-f first) & 3 frame candidates without mutating draft
  const detCoverCands = await engine.generateCoverCandidates({ content: draft });
  assert.equal(detCoverCands.ok, true);
  assert.equal(detCoverCands.candidates.length, 6);
  assert.deepEqual(
    detCoverCands.candidates.map(c => c.id),
    ['cover-cand-f', 'cover-cand-a', 'cover-cand-b', 'cover-cand-c', 'cover-cand-d', 'cover-cand-e'],
  );
  assert.equal(new Set(detCoverCands.candidates.map(c => c.coverImage.data)).size, 6, '6 visually distinct cover candidates');
  for (const c of detCoverCands.candidates) {
    assert.doesNotMatch(c.prompt, /市场调查与统计分析报告|不作为实际调查结论|仅作演示|免责说明|正大杯.*第十七届/u);
    assert.match(c.prompt, /“益普索杯”第十七届全国大学生市场调查与分析大赛/u);
    assert.match(c.prompt, /非板正艺术字/u);
    assert.match(c.prompt, /参赛团队：银发智守调研队/u);
    const candQuotes = [...c.prompt.matchAll(/"([^"]+)"/gu)].map(m => m[1]);
    assert.equal(candQuotes.length, 4, `${c.id} quotes competitionName + mainTitle + subTitle + teamLabel`);
    for (const seg of candQuotes) {
      assert.doesNotMatch(seg, REDLINE_LEAK_RX);
    }
    assert.doesNotMatch(c.coverImage.note, REDLINE_LEAK_RX);
    assert.doesNotMatch(c.prompt, /#[0-9A-Fa-f]{6}/u, `${c.id} prompt contains zero raw #RRGGBB hex codes`);
  }
  assert.match(detCoverCands.candidates[0].prompt, /光学玻璃静物微距风/u, 'cand-f is default preferred #1 optical glass macro');
  assert.match(detCoverCands.candidates[3].prompt, /竖排非板正艺术字/u, 'cand-c uses vertical artistic typography');
  assert.match(detCoverCands.candidates[4].prompt, /亮暖金\/象牙白高反差字色/u, 'cand-d dark indigo uses light_on_dark luminous typography');
  assert.equal(JSON.stringify(draft), beforeDraftStr, 'generateCoverCandidates does not overwrite draft prior to user selection');

  const detFrameCands = await engine.generateFrameCandidates({ content: draft });
  assert.equal(detFrameCands.ok, true);
  assert.equal(detFrameCands.candidates.length, 3);
  assert.deepEqual(
    detFrameCands.candidates.map(f => f.motifId),
    ['botanical_watercolor', 'geometric_architectural', 'oriental_double_rule'],
  );
  assert.equal(new Set(detFrameCands.candidates.map(f => f.frameImage.data)).size, 3, '3 visually distinct frame candidates');
  for (const f of detFrameCands.candidates) {
    parseFrameImage(f.frameImage);
    assert.doesNotMatch(f.frameImage.note, REDLINE_LEAK_RX);
    assert.match(f.prompt, /4%–(?:5\.5|6)%/u, 'frame prompt locks ornaments to outer 4%-6% strip');
    assert.match(f.prompt, /88%×88%/u, 'frame prompt enforces >=88%x88% blank center');
    assert.match(f.prompt, /严禁任何边缘羽化虚化/u, 'frame prompt forbids feather-blur bite');
    assert.doesNotMatch(f.prompt, /#[0-9A-Fa-f]{6}/u, `${f.motifId} frame prompt contains zero raw #RRGGBB hex codes`);
  }

  // 2. Live API 3-candidate generation marks 题名字形在图中 on all 3 cover candidates
  const bigPng = await createLargeSyntheticRasterPng(1024, 1536);
  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-3cands',
  };
  const { route } = compileImageGenRoute(devEnv, async () =>
    Response.json({ data: [{ b64_json: bigPng.toString('base64') }] }),
  );
  const liveFetcher = (url, init) =>
    route.POST(
      new Request(String(url), {
        method: 'POST',
        headers: {
          origin: localOrigin,
          host: '127.0.0.1:3180',
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: init?.body,
      }),
    );

  const liveCoverCands = await engine.generateCoverCandidates({
    content: draft,
    endpoint: `${localOrigin}/api/agent/image-gen`,
    fetchImpl: liveFetcher,
  });
  assert.equal(liveCoverCands.candidates.length, 6);
  assert.ok(liveCoverCands.candidates.every(c => c.mode === 'live_api' && coverHasEmbeddedTitle(c.coverImage)));
});

test('Sprint 1 image-gen route: dark backdrop guardrail, OpenAI 429 Gemini failover, and explicit 429 quota error', async () => {
  const bigPng = await createLargeSyntheticRasterPng(1024, 1536);

  // 1. When OpenAI returns 429 and GEMINI_API_KEY is configured, route automatically fails over to Gemini
  const calledUrls = [];
  const failoverEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-exhausted',
    GEMINI_API_KEY: 'gm-synthetic-active',
  };
  const { route: failoverRoute } = compileImageGenRoute(failoverEnv, async (url) => {
    calledUrls.push(String(url));
    if (String(url).includes('api.openai.com')) {
      return Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 });
    }
    return Response.json({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: bigPng.toString('base64') } }] } }],
    });
  });

  const darkBackdropRes = await failoverRoute.POST(
    makeGatewayPostRequest({
      modelId: 'gpt-image-1.5',
      aspect: '3:4',
      coverPipelineMode: 'layered_assembly',
      layer: 'clean_backdrop',
      inkMode: 'light_on_dark',
      prompt: 'Midnight urban cityscape clean negative space poster backdrop',
    }),
  );
  const darkJson = await darkBackdropRes.json();
  assert.equal(darkJson.ok, true);
  assert.equal(darkJson.mode, 'live_api');
  assert.equal(darkJson.resolvedModel, 'gemini-2.5-flash-image-preview');
  assert.ok(calledUrls.some(u => u.includes('api.openai.com')) && calledUrls.some(u => u.includes('generativelanguage.googleapis.com')));

  // 2. When all available image providers hit HTTP 429 and Gemini is absent, route surfaces explicit 429 quota_exhausted (no silent placeholder)
  const exhaustedEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-exhausted',
  };
  const { route: exhaustedRoute } = compileImageGenRoute(exhaustedEnv, async () =>
    Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 }),
  );
  const quotaRes = await exhaustedRoute.POST(
    makeGatewayPostRequest({
      modelId: 'gpt-image-1.5',
      prompt: 'Editorial cover geometry',
      allowDeterministicFallback: false,
    }),
  );
  assert.equal(quotaRes.status, 429);
  const quotaJson = await quotaRes.json();
  assert.equal(quotaJson.ok, false);
  assert.equal(quotaJson.errorCode, 'image_provider_quota_exhausted');
});
