import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  CLEAN_BACKDROP_PRESETS,
  COVER_PIPELINE_MODES,
  COVER_TYPOGRAPHY_STYLES,
  COVER_TYPOGRAPHY_STYLE_OPTIONS,
  buildCleanBackdropPrompt,
  buildTransparentCoverTypographySvg,
  createInitialCoverLayeredState,
  requestBackendCoverAssembly,
  splitHeroAndTopicLines,
  svgToDataUrl,
} from '../lib/cover-assembly.ts';
import * as engine from '../lib/agent/image-gen-engine.ts';
import * as policy from '../lib/agent/local-gateway-policy.ts';
import { PAGE_ART_LIMITS, coverHasEmbeddedTitle, parseCoverImage } from '../lib/page-art.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');
const localOrigin = 'http://127.0.0.1:3180';

function compileImageGenRoute(envOverrides = {}, customFetch = null) {
  const routePath = path.join(frontendDir, 'app', 'api', 'agent', 'image-gen', 'route.ts');
  const source = fs.readFileSync(routePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  const exportsObj = {};
  const calls = [];
  const fetchImpl =
    customFetch ??
    (async (url, init) => {
      calls.push({ url: String(url), init });
      throw new Error('Unexpected live fetch in unit test');
    });

  vm.runInNewContext(
    outputText,
    {
      exports: exportsObj,
      require: specifier => {
        if (specifier === 'next/server') {
          return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
        }
        if (specifier === '@/lib/agent/image-gen-engine') return engine;
        if (specifier === '@/lib/agent/local-gateway-policy') return policy;
        return require(specifier);
      },
      process: { env: { ...envOverrides }, cwd: () => frontendDir },
      fetch: fetchImpl,
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

test('CLEAN_BACKDROP_PRESETS bind all 6 symmetric A4 1000x1414 backdrop & reference PNGs on disk (f, e, c, b, d, a)', () => {
  assert.deepEqual(COVER_PIPELINE_MODES, ['direct_illustrated', 'layered_assembly']);
  assert.deepEqual(COVER_TYPOGRAPHY_STYLES, [
    'sculpted_orbit',
    'cinnabar_vertical',
    'xuan_calligraphy',
    'staggered_poster',
    'editorial_serif',
    'modern_geometric',
  ]);
  assert.equal(COVER_TYPOGRAPHY_STYLE_OPTIONS.length, 6);
  assert.equal(CLEAN_BACKDROP_PRESETS.length, 6);
  assert.deepEqual(
    CLEAN_BACKDROP_PRESETS.map(p => p.id),
    ['f', 'e', 'c', 'b', 'd', 'a'],
  );
  assert.equal(CLEAN_BACKDROP_PRESETS.find(p => p.id === 'd')?.inkMode, 'light_on_dark');
  assert.equal(CLEAN_BACKDROP_PRESETS.find(p => p.id === 'f')?.inkMode, 'dark_on_light');

  for (const preset of CLEAN_BACKDROP_PRESETS) {
    for (const rel of [preset.backdropUrl, preset.referenceUrl]) {
      const absPath = path.join(frontendDir, 'public', rel);
      assert.ok(fs.existsSync(absPath), `Expected asset at ${rel}`);
      const bytes = fs.readFileSync(absPath);
      assert.ok(bytes.byteLength <= PAGE_ART_LIMITS.cover.bytes, `${rel} <= 1 MB`);
      const parsed = parseCoverImage({
        schema: 'CoverImage/v1',
        mime: 'image/png',
        data: bytes.toString('base64'),
        widthPx: bytes.readUInt32BE(16),
        heightPx: bytes.readUInt32BE(20),
        note: `Preset ${rel}`,
      });
      assert.equal(parsed.widthPx, 1000);
      assert.equal(parsed.heightPx, 1414);
    }
  }
});

test('buildTransparentCoverTypographySvg renders pure transparent A4 vector calligraphy across all 4 styles and composites onto backdrop', async () => {
  const title = '银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查';
  const subtitle = '基于多阶段分层抽样与社区实地入户调查的实证研究';

  const split = splitHeroAndTopicLines(title, subtitle);
  assert.equal(split.heroLead, '银发“智”守');
  assert.equal(Array.from(split.heroLead)[split.heroHighlightIndex], '智');
  assert.ok(split.topicLines.length >= 1);

  for (const style of COVER_TYPOGRAPHY_STYLES) {
    const svg = buildTransparentCoverTypographySvg({
      competitionName: '“正大杯”第十七届全国大学生市场调查与分析大赛', // should auto-correct to 益普索杯!
      title,
      subtitle,
      teamName: '某某大学李华测试调研队', // should scrub school & 测试!
      typographyStyle: style,
    });
    assert.match(svg, /^<svg\b[^>]*width="1000" height="1414"/u);
    assert.match(svg, /“益普索杯”第十七届全国大学生市场调查与分析大赛/u);
    assert.doesNotMatch(svg, /正大杯.*第十七届|某某大学|测试|市场调查与统计分析报告/u);
    assert.doesNotMatch(svg, /[【】「」『』]/u);
    assert.match(svg, /参赛团队：/u);
    // Must NEVER contain a full-canvas background rect
    assert.doesNotMatch(svg, /<rect[^>]*width="(?:1000|100%)"[^>]*height="(?:1414|100%)"/iu);

    // Rasterize via sharp and verify corner pixel (8, 8) is 100% transparent (alpha === 0)
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1000);
    assert.equal(info.height, 1414);
    assert.equal(data[(8 * info.width + 8) * 4 + 3], 0, `${style} SVG corner pixel must be transparent`);
  }

  // Composite sculpted_orbit SVG over backdrop-cand-f.png and verify valid <= 1 MB CoverImage/v1
  const state = createInitialCoverLayeredState({ presetId: 'f', mode: 'layered_assembly' });
  assert.equal(state.competitionName, '“益普索杯”第十七届全国大学生市场调查与分析大赛');
  assert.match(state.title, /^银发“智”守：/u);
  assert.doesNotMatch(state.title, /[【】「」『』]/u);
  assert.doesNotMatch(state.vectorTypographySvg, /[【】「」『』]/u);
  assert.equal(state.teamName, '银发智守调研队');
  assert.match(state.vectorTypographyDataUrl, /^data:image\/svg\+xml;charset=utf-8,/u);

  const backdropBytes = fs.readFileSync(path.join(frontendDir, 'public', state.backdropUrl));
  const compositedPng = await sharp(backdropBytes)
    .composite([{ input: Buffer.from(state.vectorTypographySvg), top: 0, left: 0 }])
    .png({ palette: true, quality: 88, colours: 256, compressionLevel: 9 })
    .toBuffer();
  const parsedCover = parseCoverImage({
    schema: 'CoverImage/v1',
    mime: 'image/png',
    data: compositedPng.toString('base64'),
    widthPx: 1000,
    heightPx: 1414,
    note: '国奖出版级分层组装 A4 封面（题名字形在图中）',
  });
  assert.equal(coverHasEmbeddedTitle(parsedCover), true);

  // Dark indigo preset `d` automatically activates `light_on_dark` luminous ivory-gold vector typography
  const darkState = createInitialCoverLayeredState({ presetId: 'd', mode: 'layered_assembly' });
  assert.equal(darkState.inkMode, 'light_on_dark');
  assert.match(darkState.vectorTypographySvg, /data-ink-mode="light_on_dark"/u);
  assert.match(darkState.vectorTypographySvg, /url\(#ivoryLuminousGrad\)|url\(#amberGlowGrad\)/u);
  const darkBackdropBytes = fs.readFileSync(path.join(frontendDir, 'public', darkState.backdropUrl));
  const darkCompositedPng = await sharp(darkBackdropBytes)
    .composite([{ input: Buffer.from(darkState.vectorTypographySvg), top: 0, left: 0 }])
    .png({ palette: true, quality: 88, colours: 256, compressionLevel: 9 })
    .toBuffer();
  const parsedDarkCover = parseCoverImage({
    schema: 'CoverImage/v1',
    mime: 'image/png',
    data: darkCompositedPng.toString('base64'),
    widthPx: 1000,
    heightPx: 1414,
    note: '深海靛蓝分层组装 A4 封面（题名字形在图中）',
  });
  assert.equal(coverHasEmbeddedTitle(parsedDarkCover), true);
});

test('requestBackendCoverAssembly consumes backend Bézier <path> SVG + PNG and falls back cleanly offline', async () => {
  const synthPng = await sharp({
    create: { width: 1000, height: 1414, channels: 3, background: { r: 252, g: 250, b: 245 } },
  })
    .png()
    .toBuffer();
  const synthDataUrl = `data:image/png;base64,${synthPng.toString('base64')}`;
  const bezierSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1414" width="1000" height="1414"><path d="M120 220 C160 180 220 180 260 220 Z" fill="#182433"/></svg>';

  let capturedBody = null;
  const liveRes = await requestBackendCoverAssembly({
    title: '银发「智」守：城市老年人智能健康监测设备调查',
    competitionName: '“正大杯”第十七届全国大学生市场调查与分析大赛',
    referencePreset: 'f',
    backdropPreset: 'f',
    typographyStyle: 'sculpted_orbit',
    endpoint: 'http://127.0.0.1:8180/api/reports/cover-assemble',
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({
        mode: 'layered_assembly',
        referenceAnalysis: CLEAN_BACKDROP_PRESETS[0].anchors,
        vectorTypographySvg: bezierSvg,
        vectorTypographyDataUrl: svgToDataUrl(bezierSvg),
        assembledDataUrl: synthDataUrl,
        width: 1000,
        height: 1414,
      });
    },
  });

  assert.equal(liveRes.ok, true);
  assert.equal(liveRes.source, 'backend_bezier');
  assert.equal(capturedBody.competitionName, '“益普索杯”第十七届全国大学生市场调查与分析大赛');
  assert.equal(capturedBody.teamName, '银发智守调研队');
  assert.match(liveRes.vectorTypographySvg, /<path d="M120 220/u);
  assert.ok(liveRes.coverImage);
  assert.equal(coverHasEmbeddedTitle(liveRes.coverImage), true);

  // Offline fallback returns isomorphic transparent vector SVG without throwing
  const offlineRes = await requestBackendCoverAssembly({
    title: '银发「智」守：城市老年人智能健康监测设备调查',
    backdropPreset: 'c',
    typographyStyle: 'cinnabar_vertical',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(offlineRes.ok, true);
  assert.equal(offlineRes.source, 'client_canvas');
  assert.match(offlineRes.vectorTypographySvg, /data-typography-style="cinnabar_vertical"/u);
});

test('/api/agent/image-gen supports coverPipelineMode and layer=clean_backdrop vs reference', async () => {
  const prompt = buildCleanBackdropPrompt({ title: '城市夜经济消费活力调查', breathRatio: 0.44 });
  assert.match(prompt, /strictly zero text, zero characters/iu);
  assert.match(prompt, /44%/u);
  assert.doesNotMatch(prompt, /老花镜|智能手表|Clean Textless Cover Backdrop|[【】「」『』]/u);

  const darkPrompt = buildCleanBackdropPrompt({
    title: '城市夜经济消费活力调查',
    breathRatio: 0.48,
    inkMode: 'light_on_dark',
    artDirection: '深夜霓虹街景微缩电影级质感',
  });
  assert.match(darkPrompt, /深色呼吸负空间/u);
  assert.match(darkPrompt, /深夜霓虹街景微缩电影级质感/u);

  const rawPng = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: { r: 251, g: 249, b: 243 } },
  })
    .png()
    .toBuffer();

  let capturedUpstreamBody = null;
  const devEnv = {
    NODE_ENV: 'development',
    EVIX_ENABLE_LOCAL_MODEL_GATEWAY: '1',
    EVIX_LOCAL_MODEL_GATEWAY_ORIGIN: localOrigin,
    OPENAI_API_KEY: 'sk-synthetic-wave8',
  };
  const { route } = compileImageGenRoute(devEnv, async (_url, init) => {
    capturedUpstreamBody = JSON.parse(String(init?.body ?? '{}'));
    return Response.json({ data: [{ b64_json: rawPng.toString('base64') }] });
  });

  // 1. layer: 'clean_backdrop' forces zero-text guardrail and never marks 题名字形在图中 even if allowEmbeddedTypography: true was passed
  const backdropResp = await route.POST(
    new Request(`${localOrigin}/api/agent/image-gen`, {
      method: 'POST',
      headers: {
        origin: localOrigin,
        host: '127.0.0.1:3180',
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({
        modelId: 'gpt-image-2',
        prompt: '光学玻璃老花镜与智能手表静物底图',
        aspect: '3:4',
        coverPipelineMode: 'layered_assembly',
        layer: 'clean_backdrop',
        allowEmbeddedTypography: true,
      }),
    }),
  );
  const backdropJson = await backdropResp.json();
  assert.equal(backdropJson.ok, true);
  assert.equal(backdropJson.coverPipelineMode, 'layered_assembly');
  assert.equal(backdropJson.layer, 'clean_backdrop');
  assert.match(capturedUpstreamBody.prompt, /Clean Cover Backdrop Layer rules: strictly zero embedded text/u);
  assert.equal(coverHasEmbeddedTitle(backdropJson.pageArt), false);

  // 2. layer: 'reference' marks 题名字形在图中 and injects Chinese typography guardrail
  const refResp = await route.POST(
    new Request(`${localOrigin}/api/agent/image-gen`, {
      method: 'POST',
      headers: {
        origin: localOrigin,
        host: '127.0.0.1:3180',
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({
        modelId: 'gpt-image-2',
        prompt: '“益普索杯”第十七届全国大学生市场调查与分析大赛 封面参照图',
        aspect: '3:4',
        coverPipelineMode: 'layered_assembly',
        layer: 'reference',
      }),
    }),
  );
  const refJson = await refResp.json();
  assert.equal(refJson.ok, true);
  assert.equal(refJson.layer, 'reference');
  assert.equal(coverHasEmbeddedTitle(refJson.pageArt), true);
});

test('editorial_serif & modern_geometric styles + V3 open showcase assets + domain-agnostic open briefs', () => {
  for (const style of ['editorial_serif', 'modern_geometric']) {
    for (const inkMode of ['dark_on_light', 'light_on_dark']) {
      const svg = buildTransparentCoverTypographySvg({
        title: '县域低空无人机农林植保消费意愿研究',
        subtitle: '基于多阶段分层抽样与感知风险模型的实证分析',
        typographyStyle: style,
        inkMode,
      });
      assert.match(svg, new RegExp(`data-typography-style="${style}"`, 'u'));
      assert.match(svg, new RegExp(`data-ink-mode="${inkMode}"`, 'u'));
      assert.equal(/<rect[^>]*width="1000"[^>]*height="1414"/iu.test(svg), false);
      if (style === 'editorial_serif') {
        assert.match(svg, /Noto Serif SC/u);
      } else {
        assert.match(svg, /Noto Sans SC/u);
      }
    }
  }

  assert.equal(engine.V3_OPEN_COVER_SHOWCASE.length, 4);
  for (const item of engine.V3_OPEN_COVER_SHOWCASE) {
    const absPath = path.join(frontendDir, 'public', item.staticAssetUrl);
    assert.ok(fs.existsSync(absPath), `Expected V3 cover at ${item.staticAssetUrl}`);
    const bytes = fs.readFileSync(absPath);
    assert.ok(bytes.byteLength <= PAGE_ART_LIMITS.cover.bytes, `${item.staticAssetUrl} <= 1 MB`);
    const parsed = parseCoverImage({
      schema: 'CoverImage/v1',
      mime: 'image/png',
      data: bytes.toString('base64'),
      widthPx: bytes.readUInt32BE(16),
      heightPx: bytes.readUInt32BE(20),
      note: item.label,
    });
    assert.equal(parsed.widthPx, 1000);
    assert.equal(parsed.heightPx, 1414);
  }

  const briefs = engine.buildOpenArtDirectionBriefs({
    topic: '县域低空无人机农林植保消费意愿研究',
    subtitle: '基于分层配额抽样与采纳扩散模型的调查分析',
    accent: 'teal',
  });
  assert.equal(briefs.length, 4);
  for (const b of briefs) {
    assert.ok(b.prompt.includes('县域低空无人机农林植保消费意愿研究'));
    for (const forbidden of ['银发', '闪电仓', '老花镜', '正大杯']) {
      assert.equal(b.prompt.includes(forbidden), false, `Found hardcoded leak ${forbidden}`);
    }
  }
});
