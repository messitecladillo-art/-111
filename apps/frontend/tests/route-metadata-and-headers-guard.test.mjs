import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import manifest from '../app/manifest.ts';
import nextConfig from '../next.config.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(FRONTEND_ROOT, 'app');

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const BRACES_RE = /[{}]/u;
const HEX_COLOR_RE = /#[0-9A-Fa-f]{6}\b/u;
const CJK_RE = /[\u4e00-\u9fff]/u;
const PRIVATE_TECH_JARGON_RE =
  /\b(?:ReAct|EpistemicGraph|BYOK|Bento|Atypica)\b|Track\s*[12]|有向图|算子|沙盒|本地开发密钥|自定义模型\s*ID|去\s*AI\s*味|离线演示引擎/iu;

function parseTsxFile(fullPath) {
  const source = fs.readFileSync(fullPath, 'utf8');
  const sf = ts.createSourceFile(
    fullPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    fullPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return { source, sf };
}

function collectPageFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPageFiles(full, acc);
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      acc.push(full);
    }
  }
  return acc.sort();
}

function evalStaticLiteral(node) {
  if (!node) return undefined;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return evalStaticLiteral(node.expression);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => evalStaticLiteral(el));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key =
          ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
            ? prop.name.text
            : prop.name.getText();
        out[key] = evalStaticLiteral(prop.initializer);
      }
    }
    return out;
  }
  return undefined;
}

function extractExportedMetadata(sf) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === 'metadata' && decl.initializer) {
        return evalStaticLiteral(decl.initializer);
      }
    }
  }
  return null;
}

function collectMetadataStrings(value, keyPath = '', out = []) {
  if (typeof value === 'string') {
    out.push({ keyPath, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectMetadataStrings(item, `${keyPath}[${idx}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      collectMetadataStrings(v, keyPath ? `${keyPath}.${k}` : k, out);
    }
  }
  return out;
}

function assertCleanMetadataStrings(metadata, relLabel) {
  const nonCodeKeys = new Set([
    'type',
    'locale',
    'url',
    'card',
    'referrer',
    'images[0]',
    'openGraph.type',
    'openGraph.locale',
    'openGraph.images[0].url',
    'twitter.card',
    'twitter.images[0]',
  ]);
  const entries = collectMetadataStrings(metadata);
  for (const { keyPath, text } of entries) {
    assert.doesNotMatch(
      text,
      FORBIDDEN_BRACKETS_RE,
      `${relLabel} metadata.${keyPath} must not contain lenticular or corner brackets`,
    );
    assert.doesNotMatch(
      text,
      BRACES_RE,
      `${relLabel} metadata.${keyPath} must not contain raw braces`,
    );
    assert.doesNotMatch(
      text,
      HEX_COLOR_RE,
      `${relLabel} metadata.${keyPath} must not expose raw #RRGGBB codes`,
    );
    assert.doesNotMatch(
      text,
      PRIVATE_TECH_JARGON_RE,
      `${relLabel} metadata.${keyPath} must not expose private engineering jargon`,
    );
    if (!nonCodeKeys.has(keyPath)) {
      assert.match(
        text,
        CJK_RE,
        `${relLabel} metadata.${keyPath} ("${text}") must contain Chinese copy`,
      );
    }
  }
}

function collectVisibleJsxTextAndAttributes(sf) {
  const texts = [];
  const attrs = new Set(['title', 'subtitle', 'aria-label', 'placeholder', 'alt']);
  function visit(node) {
    if (ts.isJsxText(node)) {
      const trimmed = node.getText(sf).trim();
      if (trimmed) texts.push(trimmed);
    } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && attrs.has(node.name.text)) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        texts.push(node.initializer.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return texts;
}

test('(a) app/layout.tsx declares <html lang="zh-CN"> and pure Chinese global metadata with zero forbidden tokens', () => {
  const layoutPath = path.join(APP_DIR, 'layout.tsx');
  const { sf } = parseTsxFile(layoutPath);

  let htmlLang = null;
  function findHtmlElement(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(sf) === 'html') {
      for (const prop of node.attributes.properties) {
        if (
          ts.isJsxAttribute(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'lang' &&
          prop.initializer &&
          ts.isStringLiteral(prop.initializer)
        ) {
          htmlLang = prop.initializer.text;
        }
      }
    }
    ts.forEachChild(node, findHtmlElement);
  }
  findHtmlElement(sf);

  assert.equal(htmlLang, 'zh-CN', 'Root <html> in app/layout.tsx must declare lang="zh-CN"');

  const metadata = extractExportedMetadata(sf);
  assert.ok(metadata, 'app/layout.tsx must export static metadata');
  assert.equal(metadata.title, '证见 EVI-X｜实证调查研究工作台');
  assert.equal(metadata.applicationName, '证见 EVI-X');
  assert.equal(metadata.openGraph?.locale, 'zh_CN');
  assert.ok(
    typeof metadata.description === 'string' && metadata.description.length >= 20,
    'app/layout.tsx metadata.description must be a substantive Chinese summary',
  );
  assertCleanMetadataStrings(metadata, 'app/layout.tsx');
});

test('(b) all app/**/page.tsx metadata exports enforce unified brand title suffixes and zero forbidden brackets/jargon', () => {
  const pageFiles = collectPageFiles(APP_DIR);
  assert.ok(pageFiles.length >= 15, `expected at least 15 app/**/page.tsx routes, found ${pageFiles.length}`);

  let metadataCount = 0;
  for (const pageFile of pageFiles) {
    const rel = path.relative(FRONTEND_ROOT, pageFile).replace(/\\/gu, '/');
    const { sf } = parseTsxFile(pageFile);
    const metadata = extractExportedMetadata(sf);

    if (!metadata) {
      // Only /invites intentionally inherits root layout metadata while passing Chinese HostedFrame props.
      assert.equal(rel, 'app/invites/page.tsx', `${rel} should export route-specific metadata`);
      continue;
    }

    metadataCount += 1;
    assert.equal(typeof metadata.title, 'string', `${rel} metadata.title must be a string`);
    assertCleanMetadataStrings(metadata, rel);

    if (rel === 'app/page.tsx') {
      assert.ok(
        metadata.title.startsWith('证见 EVI-X｜'),
        `Root landing ${rel} title ("${metadata.title}") must start with "证见 EVI-X｜"`,
      );
    } else if (rel === 'app/s/[token]/page.tsx') {
      // Respondent-facing public survey route keeps neutral title and strict noindex/no-referrer privacy.
      assert.equal(metadata.title, '调查问卷');
      assert.deepEqual(metadata.robots, { index: false, follow: false });
      assert.equal(metadata.referrer, 'no-referrer');
    } else {
      assert.ok(
        metadata.title.endsWith('｜证见 EVI-X'),
        `${rel} metadata.title ("${metadata.title}") must end with unified brand suffix "｜证见 EVI-X"`,
      );
      const prefix = metadata.title.slice(0, -'｜证见 EVI-X'.length).trim();
      assert.ok(
        prefix.length >= 2 && CJK_RE.test(prefix),
        `${rel} metadata.title prefix ("${prefix}") must be non-empty Chinese text`,
      );
    }
  }

  assert.ok(metadataCount >= 14, `expected at least 14 page.tsx files with exported metadata, got ${metadataCount}`);
});

test('(c) app/not-found.tsx and app/error.tsx exist with pure Chinese recovery copy and zero stack/raw-error leakage', () => {
  const notFoundPath = path.join(APP_DIR, 'not-found.tsx');
  const errorPath = path.join(APP_DIR, 'error.tsx');
  assert.ok(fs.existsSync(notFoundPath), 'app/not-found.tsx must exist');
  assert.ok(fs.existsSync(errorPath), 'app/error.tsx must exist');

  // 1. Verify app/not-found.tsx
  const notFound = parseTsxFile(notFoundPath);
  assert.doesNotMatch(
    notFound.source,
    /^['"]use client['"]/mu,
    'app/not-found.tsx should remain a lightweight Server Component',
  );
  const nfMeta = extractExportedMetadata(notFound.sf);
  assert.ok(nfMeta, 'app/not-found.tsx must export metadata');
  assert.equal(nfMeta.title, '页面未找到｜证见 EVI-X');
  assertCleanMetadataStrings(nfMeta, 'app/not-found.tsx');

  const nfVisible = collectVisibleJsxTextAndAttributes(notFound.sf).join('\n');
  assert.match(nfVisible, /未找到所访问的页面/u);
  assert.match(nfVisible, /返回工作台首页/u);
  assert.doesNotMatch(
    nfVisible,
    /This page could not be found|Page Not Found/iu,
    'app/not-found.tsx must never contain default English 404 copy',
  );
  assert.doesNotMatch(nfVisible, FORBIDDEN_BRACKETS_RE);
  assert.doesNotMatch(nfVisible, PRIVATE_TECH_JARGON_RE);

  // 2. Verify app/error.tsx
  const errBoundary = parseTsxFile(errorPath);
  assert.match(
    errBoundary.source,
    /^['"]use client['"]/mu,
    'app/error.tsx must declare "use client" as required by Next.js error boundaries',
  );
  const errVisible = collectVisibleJsxTextAndAttributes(errBoundary.sf).join('\n');
  assert.match(errVisible, CJK_RE);
  assert.match(errVisible, /重新载入当前内容/u);
  assert.match(errVisible, /返回工作台首页/u);
  assert.doesNotMatch(errVisible, FORBIDDEN_BRACKETS_RE);
  assert.doesNotMatch(errVisible, PRIVATE_TECH_JARGON_RE);

  let hasAlertRole = false;
  let hasExplicitButtonType = false;
  const forbiddenErrorProps = [];

  function inspectErrorAst(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(errBoundary.sf);
      const propMap = new Map();
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name)) {
          const val =
            prop.initializer && ts.isStringLiteral(prop.initializer)
              ? prop.initializer.text
              : prop.initializer?.getText(errBoundary.sf) ?? '';
          propMap.set(prop.name.text, val);
        }
      }
      if (propMap.get('role') === 'alert') hasAlertRole = true;
      if (tag === 'button') {
        assert.equal(
          propMap.get('type'),
          'button',
          'Recovery <button> in app/error.tsx must declare explicit type="button"',
        );
        hasExplicitButtonType = true;
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'error' &&
      ['stack', 'message', 'cause'].includes(node.name.text)
    ) {
      forbiddenErrorProps.push(`error.${node.name.text}`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'error'
    ) {
      forbiddenErrorProps.push(node.getText(errBoundary.sf));
    }
    ts.forEachChild(node, inspectErrorAst);
  }
  inspectErrorAst(errBoundary.sf);

  assert.equal(hasAlertRole, true, 'app/error.tsx must render an accessible role="alert" container');
  assert.equal(hasExplicitButtonType, true, 'app/error.tsx must render a reset <button type="button">');
  assert.deepEqual(
    forbiddenErrorProps,
    [],
    `app/error.tsx must never access or render raw error.stack / error.message: ${forbiddenErrorProps.join(', ')}`,
  );
});

test('(d) next.config.ts locks poweredByHeader:false, productionBrowserSourceMaps:false, nosniff, X-Frame-Options, and /agent + /api noindex headers', async () => {
  assert.equal(nextConfig.poweredByHeader, false, 'next.config.ts must disable X-Powered-By header');
  assert.equal(
    nextConfig.productionBrowserSourceMaps,
    false,
    'next.config.ts must disable production browser source maps',
  );
  assert.equal(typeof nextConfig.headers, 'function', 'next.config.ts must define async headers()');

  const rules = await nextConfig.headers();
  const bySource = new Map(
    rules.map((rule) => [
      rule.source,
      new Map(rule.headers.map((h) => [h.key.toLowerCase(), h.value])),
    ]),
  );

  // /api/:path* security & robot indexing lock
  const apiHeaders = bySource.get('/api/:path*');
  assert.ok(apiHeaders, 'next.config.ts must configure headers for /api/:path*');
  assert.equal(apiHeaders.get('x-content-type-options'), 'nosniff');
  assert.equal(apiHeaders.get('x-frame-options'), 'DENY');
  assert.match(apiHeaders.get('x-robots-tag') ?? '', /\bnoindex\b/iu);
  assert.match(apiHeaders.get('x-robots-tag') ?? '', /\bnofollow\b/iu);

  // /agent/:path* security & robot indexing lock
  const agentHeaders = bySource.get('/agent/:path*');
  assert.ok(agentHeaders, 'next.config.ts must configure headers for /agent/:path*');
  assert.equal(agentHeaders.get('x-content-type-options'), 'nosniff');
  assert.equal(agentHeaders.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(agentHeaders.get('x-robots-tag') ?? '', /\bnoindex\b/iu);

  // /knowledge-assets/:path* CSP & nosniff lock
  const assetHeaders = bySource.get('/knowledge-assets/:path*');
  assert.ok(assetHeaders, 'next.config.ts must configure headers for /knowledge-assets/:path*');
  assert.equal(assetHeaders.get('x-content-type-options'), 'nosniff');
  assert.match(assetHeaders.get('content-security-policy') ?? '', /default-src 'none'/u);
  assert.match(assetHeaders.get('content-security-policy') ?? '', /object-src 'none'/u);
});

test('(e) app/global-error.tsx renders <html lang="zh-CN">, role="alert", type="button", zero error.* access, and zero #RRGGBB/brackets/jargon', () => {
  const globalErrorPath = path.join(APP_DIR, 'global-error.tsx');
  assert.ok(fs.existsSync(globalErrorPath), 'app/global-error.tsx must exist');

  const ge = parseTsxFile(globalErrorPath);
  assert.match(
    ge.source,
    /^['"]use client['"]/mu,
    'app/global-error.tsx must declare "use client"',
  );
  assert.doesNotMatch(
    ge.source,
    /#[0-9A-Fa-f]{3,8}\b/u,
    'app/global-error.tsx must not contain any #RRGGBB or #RGB hex color literals',
  );
  assert.doesNotMatch(ge.source, FORBIDDEN_BRACKETS_RE);
  assert.doesNotMatch(ge.source, PRIVATE_TECH_JARGON_RE);

  let htmlLang = null;
  let hasBody = false;
  let hasAlertRole = false;
  let hasExplicitResetButton = false;
  let hasHomeAnchor = false;
  const runtimeImports = [];
  const forbiddenErrorRefs = [];

  for (const stmt of ge.sf.statements) {
    if (ts.isImportDeclaration(stmt) && !stmt.importClause?.isTypeOnly) {
      runtimeImports.push(stmt.moduleSpecifier.getText(ge.sf));
    }
  }
  assert.deepEqual(
    runtimeImports,
    [],
    `app/global-error.tsx must stay zero-dependency with 0 runtime imports, found: ${runtimeImports.join(', ')}`,
  );

  function inspectGlobalErrorAst(node) {
    if (ts.isFunctionDeclaration(node) && node.parameters.length > 0) {
      const firstParam = node.parameters[0].name;
      if (ts.isIdentifier(firstParam) && firstParam.text === 'error') {
        forbiddenErrorRefs.push('bound parameter error');
      } else if (ts.isObjectBindingPattern(firstParam)) {
        for (const el of firstParam.elements) {
          const propName = (el.propertyName ?? el.name).getText(ge.sf);
          if (propName === 'error') {
            forbiddenErrorRefs.push('destructured { error }');
          }
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ge.sf);
      const propMap = new Map();
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name)) {
          const val =
            prop.initializer && ts.isStringLiteral(prop.initializer)
              ? prop.initializer.text
              : prop.initializer?.getText(ge.sf) ?? '';
          propMap.set(prop.name.text, val);
        }
      }
      if (tag === 'html') htmlLang = propMap.get('lang') ?? null;
      if (tag === 'body') hasBody = true;
      if (propMap.get('role') === 'alert') hasAlertRole = true;
      if (tag === 'button') {
        assert.equal(
          propMap.get('type'),
          'button',
          'Recovery <button> in app/global-error.tsx must declare explicit type="button"',
        );
        hasExplicitResetButton = true;
      }
      if (tag === 'a' && propMap.get('href') === '/') {
        hasHomeAnchor = true;
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'error'
    ) {
      forbiddenErrorRefs.push(node.getText(ge.sf));
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'error'
    ) {
      forbiddenErrorRefs.push(node.getText(ge.sf));
    }
    ts.forEachChild(node, inspectGlobalErrorAst);
  }
  inspectGlobalErrorAst(ge.sf);

  assert.equal(htmlLang, 'zh-CN', 'app/global-error.tsx must render <html lang="zh-CN">');
  assert.equal(hasBody, true, 'app/global-error.tsx must render <body>');
  assert.equal(hasAlertRole, true, 'app/global-error.tsx must declare role="alert"');
  assert.equal(hasExplicitResetButton, true, 'app/global-error.tsx must render a reset <button type="button">');
  assert.equal(hasHomeAnchor, true, 'app/global-error.tsx must render a full-document <a href="/"> link');
  assert.deepEqual(
    forbiddenErrorRefs,
    [],
    `app/global-error.tsx must never bind or read error.* properties: ${forbiddenErrorRefs.join(', ')}`,
  );

  const visible = collectVisibleJsxTextAndAttributes(ge.sf).join('\n');
  assert.match(visible, /系统界面暂时中断｜证见 EVI-X/u);
  assert.match(visible, /重新载入当前内容/u);
  assert.match(visible, /返回工作台首页/u);
});

test('(f) public/robots.txt (without conflicting app/robots.*) and app/manifest.ts disallow private routes and enforce zh-CN pure Chinese manifest without #RRGGBB', () => {
  // 1. Prevent Next.js 500 conflict between public/robots.txt and app/robots.*
  for (const conflictExt of ['robots.ts', 'robots.tsx', 'robots.js', 'robots.txt']) {
    assert.equal(
      fs.existsSync(path.join(APP_DIR, conflictExt)),
      false,
      `app/${conflictExt} must not coexist with public/robots.txt (causes Next.js 500 route conflict)`,
    );
  }
  const robotsTxtPath = path.join(FRONTEND_ROOT, 'public', 'robots.txt');
  assert.equal(fs.existsSync(robotsTxtPath), true, 'public/robots.txt must exist');
  const robotsLines = fs
    .readFileSync(robotsTxtPath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const disallowedSet = new Set(
    robotsLines
      .filter((line) => /^Disallow:\s*/iu.test(line))
      .map((line) => line.replace(/^Disallow:\s*/iu, '').trim()),
  );
  const allowedSet = new Set(
    robotsLines
      .filter((line) => /^Allow:\s*/iu.test(line))
      .map((line) => line.replace(/^Allow:\s*/iu, '').trim()),
  );

  for (const requiredDisallowed of ['/s/', '/api/', '/agent/', '/projects/', '/workspace/', '/services/', '/preflight/', '/invites/', '/login/', '/_next/']) {
    assert.ok(
      disallowedSet.has(requiredDisallowed),
      `public/robots.txt must disallow "${requiredDisallowed}" (got: ${[...disallowedSet].join(', ')})`,
    );
  }
  for (const requiredAllowed of ['/', '/explore', '/knowledge']) {
    assert.ok(
      allowedSet.has(requiredAllowed),
      `public/robots.txt must allow public route "${requiredAllowed}"`,
    );
  }

  // 2. Runtime execution & source hygiene of app/manifest.ts
  const manifestSource = fs.readFileSync(path.join(APP_DIR, 'manifest.ts'), 'utf8');
  assert.doesNotMatch(
    manifestSource,
    /#[0-9A-Fa-f]{3,8}\b/u,
    'app/manifest.ts source must not contain any #RRGGBB hex color literals',
  );

  const manifestData = manifest();
  assert.equal(manifestData.lang, 'zh-CN', 'manifest().lang must be "zh-CN"');
  assert.equal(manifestData.start_url, '/');
  assert.equal(manifestData.display, 'standalone');

  for (const [field, value] of [
    ['name', manifestData.name],
    ['short_name', manifestData.short_name],
    ['description', manifestData.description],
  ]) {
    assert.equal(typeof value, 'string', `manifest().${field} must be a string`);
    assert.match(value, CJK_RE, `manifest().${field} must be Chinese text`);
    assert.doesNotMatch(value, FORBIDDEN_BRACKETS_RE);
    assert.doesNotMatch(value, BRACES_RE);
    assert.doesNotMatch(value, PRIVATE_TECH_JARGON_RE);
  }

  const serializedManifest = JSON.stringify(manifestData);
  assert.doesNotMatch(
    serializedManifest,
    /#[0-9A-Fa-f]{3,8}\b/u,
    'Serialized manifest() output must contain zero #RRGGBB hex color literals',
  );
  assert.ok(
    Array.isArray(manifestData.icons) && manifestData.icons.some((icon) => icon.src === '/icon.svg'),
    'manifest().icons must reference /icon.svg',
  );
});

test('(g) all 14 static/SSR UI routes + 2 dynamic routes remain Server Components with exact Chinese titles and zero forbidden visible tokens', () => {
  const expectedStaticRouteTitles = new Map([
    ['app/page.tsx', '证见 EVI-X｜实证调查研究工作台'],
    ['app/login/page.tsx', '账号登录｜证见 EVI-X'],
    ['app/explore/page.tsx', '了解证见｜证见 EVI-X'],
    ['app/services/page.tsx', '服务设置｜证见 EVI-X'],
    ['app/projects/page.tsx', '我的项目｜证见 EVI-X'],
    ['app/knowledge/page.tsx', '知识索引｜证见 EVI-X'],
    ['app/preflight/page.tsx', '提交前体检｜证见 EVI-X'],
    ['app/not-found.tsx', '页面未找到｜证见 EVI-X'],
    ['app/workspace/page.tsx', '研究工具｜证见 EVI-X'],
    ['app/agent/page.tsx', '镜室｜证见 EVI-X'],
    ['app/chronicle/page.tsx', '寻证之旅｜证见 EVI-X'],
    ['app/examples/bank-marketing/page.tsx', '公开数据成果样板｜证见 EVI-X'],
    ['app/agent/workspace/page.tsx', '对话工作区｜证见 EVI-X'],
  ]);

  const allFourteenStaticRoutes = [
    ...expectedStaticRouteTitles.keys(),
    'app/invites/page.tsx',
  ];
  assert.equal(allFourteenStaticRoutes.length, 14, 'Expected exactly 14 static/SSR UI route entries');

  const requiringSubstantiveDescriptions = new Set([
    'app/page.tsx',
    'app/login/page.tsx',
    'app/explore/page.tsx',
    'app/services/page.tsx',
    'app/projects/page.tsx',
    'app/preflight/page.tsx',
    'app/not-found.tsx',
    'app/workspace/page.tsx',
    'app/agent/page.tsx',
    'app/chronicle/page.tsx',
    'app/agent/workspace/page.tsx',
  ]);

  for (const rel of allFourteenStaticRoutes) {
    const fullPath = path.join(FRONTEND_ROOT, rel);
    assert.equal(fs.existsSync(fullPath), true, `Static/SSR route file ${rel} must exist`);
    const { source, sf } = parseTsxFile(fullPath);

    assert.doesNotMatch(
      source,
      /^['"]use client['"]/mu,
      `${rel} must remain a Server Component so Next.js App Router honors static metadata`,
    );
    assert.doesNotMatch(
      source,
      HEX_COLOR_RE,
      `${rel} must not hardcode raw hex colors in route entry JSX`,
    );

    const visibleTexts = collectVisibleJsxTextAndAttributes(sf);
    for (const txt of visibleTexts) {
      assert.doesNotMatch(txt, FORBIDDEN_BRACKETS_RE, `${rel} visible copy contains forbidden brackets`);
      assert.doesNotMatch(txt, BRACES_RE, `${rel} visible copy contains raw braces`);
      assert.doesNotMatch(txt, HEX_COLOR_RE, `${rel} visible copy contains raw hex color`);
      assert.doesNotMatch(txt, PRIVATE_TECH_JARGON_RE, `${rel} visible copy contains private tech jargon`);
    }

    if (rel === 'app/invites/page.tsx') {
      assert.ok(
        visibleTexts.includes('邀请码'),
        'app/invites/page.tsx must pass Chinese HostedFrame title "邀请码"',
      );
      assert.ok(
        visibleTexts.some((t) => t.includes('邀请码') && t.length >= 10),
        'app/invites/page.tsx must pass a substantive Chinese subtitle to HostedFrame',
      );
      continue;
    }

    const meta = extractExportedMetadata(sf);
    assert.ok(meta, `${rel} must export static metadata`);
    assert.equal(
      meta.title,
      expectedStaticRouteTitles.get(rel),
      `${rel} metadata.title mismatch`,
    );
    assertCleanMetadataStrings(meta, rel);

    if (requiringSubstantiveDescriptions.has(rel)) {
      assert.ok(
        typeof meta.description === 'string' && meta.description.length >= 16 && CJK_RE.test(meta.description),
        `${rel} must export a substantive Chinese metadata.description`,
      );
    }
  }

  // Dynamic routes: /projects/[projectId] & /s/[token]
  const dynamicProject = parseTsxFile(path.join(FRONTEND_ROOT, 'app/projects/[projectId]/page.tsx'));
  assert.doesNotMatch(dynamicProject.source, /^['"]use client['"]/mu);
  const dpMeta = extractExportedMetadata(dynamicProject.sf);
  assert.equal(dpMeta?.title, '项目工作台｜证见 EVI-X');
  assertCleanMetadataStrings(dpMeta, 'app/projects/[projectId]/page.tsx');

  const dynamicSurvey = parseTsxFile(path.join(FRONTEND_ROOT, 'app/s/[token]/page.tsx'));
  assert.doesNotMatch(dynamicSurvey.source, /^['"]use client['"]/mu);
  assert.match(
    dynamicSurvey.source,
    /\^\[\s*A-Za-z0-9_-\s*\]\{43\}\$/u,
    'app/s/[token]/page.tsx must validate 43-char base64url respondent token before rendering PublicSurvey',
  );
  assert.match(dynamicSurvey.source, /\bnotFound\(\)/u);
});

test('(h) dual error boundaries (app/error.tsx and app/global-error.tsx) enforce zero exception/stack reflection, zero hex colors, and assertive Chinese recovery landmarks', () => {
  const boundarySpecs = [
    { rel: 'app/error.tsx', headingId: 'route-error-heading' },
    { rel: 'app/global-error.tsx', headingId: 'global-error-heading' },
  ];

  for (const { rel, headingId } of boundarySpecs) {
    const fullPath = path.join(FRONTEND_ROOT, rel);
    const { source, sf } = parseTsxFile(fullPath);

    assert.match(source, /^['"]use client['"]/mu, `${rel} must declare 'use client'`);
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{3,8}\b/u, `${rel} must contain zero hex color literals`);
    assert.doesNotMatch(source, FORBIDDEN_BRACKETS_RE, `${rel} must contain zero forbidden brackets`);
    assert.doesNotMatch(source, PRIVATE_TECH_JARGON_RE, `${rel} must contain zero private tech jargon`);

    let hasAssertiveAlert = false;
    let hasLabelledHeading = false;
    let hasResetCall = false;
    let hasHomeEscape = false;
    const leakedErrorTokens = [];

    function walkBoundary(node) {
      if (ts.isFunctionDeclaration(node) && node.parameters.length > 0) {
        const param = node.parameters[0].name;
        if (ts.isIdentifier(param) && param.text === 'error') {
          leakedErrorTokens.push('parameter error');
        } else if (ts.isObjectBindingPattern(param)) {
          for (const el of param.elements) {
            const key = (el.propertyName ?? el.name).getText(sf);
            if (key === 'error') leakedErrorTokens.push('destructured error');
          }
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'reset') {
        hasResetCall = true;
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sf);
        const attrs = new Map();
        for (const prop of node.attributes.properties) {
          if (ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name)) {
            const val =
              prop.initializer && ts.isStringLiteral(prop.initializer)
                ? prop.initializer.text
                : prop.initializer?.getText(sf) ?? '';
            attrs.set(prop.name.text, val);
          }
        }
        if (
          attrs.get('role') === 'alert' &&
          attrs.get('aria-live') === 'assertive' &&
          attrs.get('aria-labelledby') === headingId
        ) {
          hasAssertiveAlert = true;
        }
        if (tag === 'h1' && attrs.get('id') === headingId) {
          hasLabelledHeading = true;
        }
        if ((tag === 'a' || tag === 'Link') && attrs.get('href') === '/') {
          hasHomeEscape = true;
        }
      }
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'error'
      ) {
        leakedErrorTokens.push(node.getText(sf));
      }
      ts.forEachChild(node, walkBoundary);
    }
    walkBoundary(sf);

    assert.equal(hasAssertiveAlert, true, `${rel} must render role="alert" aria-live="assertive" aria-labelledby="${headingId}"`);
    assert.equal(hasLabelledHeading, true, `${rel} must render <h1 id="${headingId}">`);
    assert.equal(hasResetCall, true, `${rel} must invoke reset() from its recovery action`);
    assert.equal(hasHomeEscape, true, `${rel} must provide a home "/" navigation link`);
    assert.deepEqual(leakedErrorTokens, [], `${rel} must never bind or read error.*: ${leakedErrorTokens.join(', ')}`);

    const copy = collectVisibleJsxTextAndAttributes(sf).join('\n');
    assert.doesNotMatch(
      copy,
      /Application error|Something went wrong|Unhandled Runtime Error|stack trace/iu,
      `${rel} must never expose English crash boilerplate`,
    );
  }
});

test('(i) next.config.ts security/rewrite invariants, public/robots.txt allow/disallow parity, and manifest()/icon.svg rgb() & accessibility contracts stay aligned', async () => {
  // 1. next.config.ts standalone, header hardening & API origin rewrite guard
  assert.equal(nextConfig.output, 'standalone', 'next.config.ts must lock output: "standalone"');
  const configSource = fs.readFileSync(path.join(FRONTEND_ROOT, 'next.config.ts'), 'utf8');
  assert.match(
    configSource,
    /parsed\.username\s*\|\|\s*parsed\.password/u,
    'next.config.ts must reject embedded URL credentials in EVIX_API_ORIGIN',
  );

  const headerRules = await nextConfig.headers();
  const headersBySource = new Map(
    headerRules.map((rule) => [
      rule.source,
      new Map(rule.headers.map((h) => [h.key.toLowerCase(), h.value])),
    ]),
  );

  const apiHdrs = headersBySource.get('/api/:path*');
  assert.equal(apiHdrs?.get('referrer-policy'), 'same-origin');
  for (const directive of ['noindex', 'nofollow', 'noarchive', 'nosnippet']) {
    assert.match(apiHdrs?.get('x-robots-tag') ?? '', new RegExp(`\\b${directive}\\b`, 'iu'));
  }

  const agentHdrs = headersBySource.get('/agent/:path*');
  for (const directive of ['noindex', 'noarchive']) {
    assert.match(agentHdrs?.get('x-robots-tag') ?? '', new RegExp(`\\b${directive}\\b`, 'iu'));
  }

  const assetHdrs = headersBySource.get('/knowledge-assets/:path*');
  assert.match(assetHdrs?.get('cache-control') ?? '', /\bimmutable\b/iu);
  assert.match(assetHdrs?.get('content-security-policy') ?? '', /base-uri 'none'/u);

  assert.equal(typeof nextConfig.rewrites, 'function', 'next.config.ts must define async rewrites()');
  const rewrites = await nextConfig.rewrites();
  assert.ok(Array.isArray(rewrites.afterFiles) && rewrites.afterFiles.length >= 1);
  for (const rw of rewrites.afterFiles) {
    const destUrl = new URL(rw.destination.replace(/\/:path.*$/u, '/'));
    assert.ok(['http:', 'https:'].includes(destUrl.protocol));
    assert.equal(destUrl.username, '');
    assert.equal(destUrl.password, '');
  }

  // 2. public/robots.txt full 5-allow / 10-disallow parity & zero localhost sitemap leak
  const robotsRaw = fs.readFileSync(path.join(FRONTEND_ROOT, 'public', 'robots.txt'), 'utf8');
  assert.doesNotMatch(robotsRaw, /localhost|127\.0\.0\.1/iu, 'public/robots.txt must not leak local dev hosts');
  for (const pubRoute of ['/', '/explore', '/knowledge', '/chronicle', '/examples']) {
    assert.match(robotsRaw, new RegExp(`^Allow:\\s*${pubRoute.replace(/\//gu, '\\/')}\\s*$`, 'mu'));
  }

  // 3. manifest() strict rgb(...) color format & /icon.svg accessible SVG verification
  const rgbPattern = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/u;
  const mf = manifest();
  assert.match(mf.background_color ?? '', rgbPattern, 'manifest().background_color must use rgb(r, g, b)');
  assert.match(mf.theme_color ?? '', rgbPattern, 'manifest().theme_color must use rgb(r, g, b)');

  const iconSvgPath = path.join(APP_DIR, 'icon.svg');
  assert.equal(fs.existsSync(iconSvgPath), true, 'app/icon.svg referenced by manifest() must exist');
  const iconSvg = fs.readFileSync(iconSvgPath, 'utf8');
  assert.match(iconSvg, /<svg\b[^>]*viewBox="0 0 512 512"/u);
  assert.match(iconSvg, /<title\b[^>]*>[^<]*证见 EVI-X[^<]*<\/title>/u);
  assert.doesNotMatch(iconSvg, /<script\b/iu, 'app/icon.svg must contain zero <script> elements');
});
