import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseTsx(relPath) {
  const fullPath = path.join(FRONTEND_ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const sf = ts.createSourceFile(
    fullPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    fullPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return { fullPath, source, sf };
}

function collectStaticValueImports(sf) {
  const imports = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;
      if (!clause) {
        imports.push(spec);
        continue;
      }
      if (clause.isTypeOnly) continue;
      let hasValue = Boolean(clause.name);
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          hasValue = true;
        } else if (ts.isNamedImports(clause.namedBindings)) {
          hasValue = hasValue || clause.namedBindings.elements.some((el) => !el.isTypeOnly);
        }
      }
      if (hasValue) imports.push(spec);
    } else if (
      ts.isExportDeclaration(stmt) &&
      !stmt.isTypeOnly &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      imports.push(stmt.moduleSpecifier.text);
    }
  }
  return imports;
}

function createTranspiledMathHarness() {
  const counters = { texLoads: 0, katexLoads: 0 };
  const moduleCache = new Map();
  const cssProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '__esModule') return false;
        return typeof prop === 'string' ? prop : undefined;
      },
    },
  );

  function evaluateTsx(relPath) {
    if (moduleCache.has(relPath)) return moduleCache.get(relPath).exports;
    const { fullPath, source } = parseTsx(relPath);
    const { outputText } = ts.transpileModule(source, {
      fileName: fullPath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    const mod = { exports: {} };
    moduleCache.set(relPath, mod);

    const localRequire = (spec) => {
      if (spec.endsWith('.css')) return cssProxy;
      if (spec === './Tex' || spec === './Tex.tsx' || spec === '@/components/math/Tex') {
        counters.texLoads += 1;
        return evaluateTsx('components/math/Tex.tsx');
      }
      if (spec === 'katex') {
        counters.katexLoads += 1;
        return require('katex');
      }
      return require(spec);
    };

    const runner = new Function('exports', 'require', 'module', '__filename', '__dirname', outputText);
    runner(mod.exports, localRequire, mod, fullPath, path.dirname(fullPath));
    return mod.exports;
  }

  return {
    counters,
    loadTexLazy: () => evaluateTsx('components/math/TexLazy.tsx'),
  };
}

test('TexLazy AST guard: enforces "use client", zero static katex/Tex value imports, and full export parity', () => {
  const { source, sf } = parseTsx('components/math/TexLazy.tsx');
  assert.match(source.trimStart(), /^['"]use client['"];/u);

  const valueImports = collectStaticValueImports(sf);
  assert.deepEqual(valueImports, ['react', './Tex.module.css']);
  for (const spec of valueImports) {
    assert.equal(/katex|\/Tex(?:\.tsx)?$/u.test(spec), false, `unexpected eager math import: ${spec}`);
  }

  let dynamicTexImportCount = 0;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === './Tex'
    ) {
      dynamicTexImportCount += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  assert.equal(dynamicTexImportCount, 1, 'TexLazy must dynamically import("./Tex") in one singleton loader');

  const texOriginal = parseTsx('components/math/Tex.tsx');
  assert.match(texOriginal.source, /trust:\s*false/u);
  assert.match(texOriginal.source, /throwOnError:\s*false/u);
});

test('TexLazy runtime lifecycle: zero katex load on mount, semantic fallback before load, and synchronous singleton rendering after preload', async () => {
  const harness = createTranspiledMathHarness();
  const lazyMod = harness.loadTexLazy();

  assert.equal(typeof lazyMod.TexLazy, 'object');
  assert.equal(typeof lazyMod.FormulaLazy, 'object');
  assert.equal(typeof lazyMod.TexSpanLazy, 'object');
  assert.equal(typeof lazyMod.preloadTexModule, 'function');
  assert.equal(harness.counters.texLoads, 0, 'evaluating TexLazy module must not load ./Tex');
  assert.equal(harness.counters.katexLoads, 0, 'evaluating TexLazy module must not load katex');

  // Phase 1: pre-load micro-window renders semantic plain-text placeholders without throwing or loading katex
  const preInlineHtml = renderToStaticMarkup(
    React.createElement(lazyMod.TexLazy, { tex: 'x^2 + y^2', className: 'customMath' }),
  );
  assert.match(preInlineHtml, /data-tex-loading=""/u);
  assert.match(preInlineHtml, /class="inline customMath"/u);
  assert.match(preInlineHtml, /x\^2 \+ y\^2/u);

  const preFormulaHtml = renderToStaticMarkup(
    React.createElement(lazyMod.FormulaLazy, {
      tex: '\\hat{y} = \\beta_0 + \\beta_1 x',
      label: '线性回归模型',
      number: '4-1',
      print: true,
    }),
  );
  assert.match(preFormulaHtml, /^<figure /u);
  assert.match(preFormulaHtml, /data-tex-loading=""/u);
  assert.match(preFormulaHtml, /data-print="true"/u);
  assert.match(preFormulaHtml, /<figcaption>线性回归模型<\/figcaption>/u);
  assert.match(preFormulaHtml, /aria-label="线性回归模型（公式）"/u);
  assert.match(preFormulaHtml, /（4-1）/u);

  const preSpanHtml = renderToStaticMarkup(
    React.createElement(lazyMod.TexSpanLazy, {
      tex: 'p < 0.001',
      display: false,
      className: 'mathInline',
    }),
  );
  assert.match(preSpanHtml, /data-tex-loading=""/u);
  assert.match(preSpanHtml, /p &lt; 0\.001/u);
  assert.equal(harness.counters.texLoads, 0);
  assert.equal(harness.counters.katexLoads, 0);

  // Phase 2: singleton preload loads ./Tex & katex once and caches module reference
  const firstMod = await lazyMod.preloadTexModule();
  const secondMod = await lazyMod.preloadTexModule();
  assert.equal(firstMod, secondMod);
  assert.equal(harness.counters.texLoads, 1);
  assert.equal(harness.counters.katexLoads, 1);

  // Phase 3: subsequent mounts read loadedMod synchronously on first render with zero flicker
  const postInlineHtml = renderToStaticMarkup(
    React.createElement(lazyMod.TexLazy, { tex: 'R^2 = 0.842', className: 'customMath' }),
  );
  assert.doesNotMatch(postInlineHtml, /data-tex-loading/u);
  assert.match(postInlineHtml, /class="katex"/u);
  assert.match(postInlineHtml, /<math /u);

  const postFormulaHtml = renderToStaticMarkup(
    React.createElement(lazyMod.FormulaLazy, {
      tex: '\\mathrm{VIF}_j = \\frac{1}{1 - R_j^2}',
      label: '方差膨胀因子',
      number: '3-2',
    }),
  );
  assert.doesNotMatch(postFormulaHtml, /data-tex-loading/u);
  assert.match(postFormulaHtml, /class="katex-display"/u);
  assert.match(postFormulaHtml, /\(3-2\)/u);
  assert.match(postFormulaHtml, /<button type="button" class="copy"[^>]*aria-label="复制 LaTeX：方差膨胀因子"/u);

  const postSpanDisplayHtml = renderToStaticMarkup(
    React.createElement(lazyMod.TexSpanLazy, {
      tex: '\\chi^2 = 18.64',
      display: true,
      className: 'mathBlock',
    }),
  );
  assert.doesNotMatch(postSpanDisplayHtml, /data-tex-loading/u);
  assert.match(postSpanDisplayHtml, /class="mathBlock"/u);
  assert.match(postSpanDisplayHtml, /class="katex-display"/u);

  // KaTeX trust:false refuses unsafe \href commands instead of emitting an executable <a> link
  const untrustedHtml = renderToStaticMarkup(
    React.createElement(lazyMod.TexLazy, { tex: '\\href{javascript:alert(1)}{危险链接}' }),
  );
  assert.doesNotMatch(untrustedHtml, /<a\b[^>]*href=/iu);
  assert.match(untrustedHtml, /#cc0000/iu);
  assert.equal(harness.counters.texLoads, 1, 'singleton cache must never re-import ./Tex');
});

test('App-level not-found and error boundaries stay lightweight, pure Chinese, and free of stack or katex leaks', () => {
  for (const rel of ['app/not-found.tsx', 'app/error.tsx']) {
    const { source, sf } = parseTsx(rel);
    const valueImports = collectStaticValueImports(sf);
    for (const spec of valueImports) {
      assert.equal(
        /katex|Tex|router|gazetteer|recommender|echarts|dagre/iu.test(spec),
        false,
        `${rel} must stay ultra-lightweight, found import: ${spec}`,
      );
    }
    assert.doesNotMatch(source, /[\u3010\u3011\u300c\u300d\u300e\u300f]/u);
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{6}\b/u);
    assert.doesNotMatch(source, /This page could not be found|Application error/iu);
    assert.doesNotMatch(source, /\berror\.(?:stack|message|digest)\b/u);
  }
});
