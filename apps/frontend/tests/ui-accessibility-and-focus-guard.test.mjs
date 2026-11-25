import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * Wave 16–17 permanent WCAG accessibility & focus-management AST guard.
 * Scoped strictly to settled Wave-16 components so parallel Wave-17 edits never race.
 */
const FORM_CONTROL_FILES = [
  'components/editors/LatexWorkbench.tsx',
  'components/editors/ReportFormatPanel.tsx',
  'components/editors/ReportFramePanel.tsx',
  'components/agent/ArtifactShelf.tsx',
  'components/agent/StudioCards.tsx',
  'components/agent/studios/SteeringAnnotationStudio.tsx',
  'components/agent/studios/QuickSurveyStudio.tsx',
  'components/agent/studios/QaDefenseStudio.tsx',
  'components/agent/studios/TeamLiaisonStudio.tsx',
  'components/agent/studios/DrawDiagramStudio.tsx',
  'components/agent/studios/ImageWorkshopStudio.tsx',
  'components/topic-lab/TopicLab.tsx',
  'components/hosted/HostedFrame.tsx',
  'components/hosted/HostedProjects.tsx',
  'components/hosted/HostedServices.tsx',
  'components/hosted/HostedMembers.tsx',
  'components/hosted/HostedInvites.tsx',
  'components/hosted/HostedLogin.tsx',
  'components/icons/EvixIcons.tsx',
  'components/agent/CursorTrail.tsx',
];

const HOSTED_AND_STUDIO_BUTTON_FILES = [
  'components/hosted/HostedFrame.tsx',
  'components/hosted/HostedTopic.tsx',
  'components/hosted/HostedProjects.tsx',
  'components/hosted/HostedServices.tsx',
  'components/hosted/HostedMembers.tsx',
  'components/hosted/HostedInvites.tsx',
  'components/hosted/HostedLogin.tsx',
  'components/editors/LatexWorkbench.tsx',
  'components/agent/studios/SteeringAnnotationStudio.tsx',
  'components/agent/studios/QuickSurveyStudio.tsx',
  'components/agent/studios/QaDefenseStudio.tsx',
  'components/agent/studios/TeamLiaisonStudio.tsx',
  'components/agent/studios/DrawDiagramStudio.tsx',
];

const MODAL_DIALOG_FILES = [
  'components/editors/LatexWorkbench.tsx',
  'components/editors/ReportFormatPanel.tsx',
  'components/agent/studios/QuickSurveyStudio.tsx',
  'components/agent/studios/ImageWorkshopStudio.tsx',
];

function parseJsxAttributes(openingNode, sf) {
  const attrs = new Map();
  for (const prop of openingNode.attributes.properties) {
    if (ts.isJsxAttribute(prop)) {
      const name = prop.name.getText(sf);
      if (!prop.initializer) {
        attrs.set(name, 'true');
      } else if (ts.isStringLiteral(prop.initializer)) {
        attrs.set(name, prop.initializer.text);
      } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        attrs.set(name, `{${prop.initializer.expression.getText(sf)}}`);
      } else {
        attrs.set(name, prop.initializer.getText(sf));
      }
    }
  }
  return attrs;
}

function hasEnclosingLabelElement(node, sf) {
  let cur = node.parent;
  while (cur) {
    if (ts.isJsxElement(cur) && cur.openingElement.tagName.getText(sf) === 'label') {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

function auditTsxAccessibility(filename, sourceText) {
  const sf = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labelTargets = new Set();

  function collectLabels(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sf) === 'label') {
        const attrs = parseJsxAttributes(node, sf);
        const htmlFor = attrs.get('htmlFor');
        if (htmlFor) labelTargets.add(htmlFor);
      }
    }
    ts.forEachChild(node, collectLabels);
  }
  collectLabels(sf);

  const unlabeledControls = [];
  const untypedButtons = [];
  const dialogViolations = [];
  let dialogCount = 0;

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      const attrs = parseJsxAttributes(node, sf);
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        const typeVal = attrs.get('type') ?? '';
        const isHidden =
          typeVal === 'hidden' ||
          attrs.has('hidden') ||
          attrs.get('aria-hidden') === 'true' ||
          attrs.get('aria-hidden') === '{true}';
        if (!isHidden) {
          const hasAriaName =
            Boolean(attrs.get('aria-label')?.trim()) || Boolean(attrs.get('aria-labelledby')?.trim());
          const idVal = attrs.get('id');
          const hasLabelAssociation =
            hasEnclosingLabelElement(node, sf) || Boolean(idVal && labelTargets.has(idVal));
          if (!hasAriaName && !hasLabelAssociation) {
            unlabeledControls.push(`${filename}:${line} <${tag}> missing accessible label`);
          }
        }
      }

      if (tag === 'button') {
        const btnType = attrs.get('type');
        if (!btnType || !['button', 'submit', 'reset'].includes(btnType)) {
          untypedButtons.push(`${filename}:${line} <button> missing explicit type="button|submit|reset"`);
        }
      }

      const role = attrs.get('role');
      if (role === 'dialog' || role === 'alertdialog') {
        dialogCount += 1;
        const ariaModal = attrs.get('aria-modal');
        if (ariaModal !== 'true' && ariaModal !== '{true}') {
          dialogViolations.push(`${filename}:${line} role="${role}" missing aria-modal="true"`);
        }
        const hasDialogName =
          Boolean(attrs.get('aria-label')?.trim()) || Boolean(attrs.get('aria-labelledby')?.trim());
        if (!hasDialogName) {
          dialogViolations.push(`${filename}:${line} role="${role}" missing aria-label or aria-labelledby`);
        }
        if (!sourceText.includes('Escape')) {
          dialogViolations.push(`${filename}:${line} role="${role}" missing Escape keyboard handler`);
        }
        if (!/\.focus\s*\(|autoFocus/u.test(sourceText)) {
          dialogViolations.push(`${filename}:${line} role="${role}" missing focus management (.focus() or autoFocus)`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { unlabeledControls, untypedButtons, dialogViolations, dialogCount };
}

test('WCAG form control AST guard: all visible inputs, selects, and textareas across 20 settled components have accessible names', () => {
  const syntheticBad = auditTsxAccessibility(
    'bad-form.tsx',
    [
      'export function BadForm() {',
      '  return <div><input placeholder="仅占位符" /><select><option>A</option></select><input type="file" hidden /></div>;',
      '}',
    ].join('\n'),
  );
  assert.equal(syntheticBad.unlabeledControls.length, 2, 'AST audit must flag unlabeled <input> and <select> while exempting hidden inputs');

  const allUnlabeled = [];
  for (const relPath of FORM_CONTROL_FILES) {
    const src = fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
    const { unlabeledControls } = auditTsxAccessibility(relPath, src);
    allUnlabeled.push(...unlabeledControls);
  }
  assert.deepEqual(allUnlabeled, []);
});

test('WCAG modal dialog & focus guard: role="dialog" / "alertdialog" and native <dialog> enforce aria-modal, accessible naming, Escape dismissal, and focus restoration', () => {
  const syntheticDialog = auditTsxAccessibility(
    'bad-dialog.tsx',
    'export function BadModal() { return <div role="dialog"><button type="button">关闭</button></div>; }',
  );
  assert.equal(syntheticDialog.dialogCount, 1);
  assert.equal(syntheticDialog.dialogViolations.length, 4, 'AST audit must catch missing aria-modal, label, Escape, and focus handling');

  const violations = [];
  let verifiedModalCount = 0;
  for (const relPath of MODAL_DIALOG_FILES) {
    const src = fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
    const res = auditTsxAccessibility(relPath, src);
    verifiedModalCount += res.dialogCount;
    violations.push(...res.dialogViolations);
  }
  assert.ok(verifiedModalCount >= 4, `Expected >=4 modal dialogs audited, got ${verifiedModalCount}`);
  assert.deepEqual(violations, []);

  const shelfSrc = fs.readFileSync(new URL('../components/agent/ArtifactShelf.tsx', import.meta.url), 'utf8');
  assert.match(shelfSrc, /<dialog\b[^>]*aria-label=/u);
  assert.match(shelfSrc, /\bautoFocus\b/u);
  assert.match(shelfSrc, /onClose=\{\(\)\s*=>\s*enlargeBtn\.current\?\.focus\(\)\}/u);
});

test('explicit button type & decorative canvas/icon semantics guard across hosted forms, studios, EvixIcons, and CursorTrail', () => {
  const syntheticBtn = auditTsxAccessibility(
    'bad-btn.tsx',
    'export function BadHosted() { return <form><button>隐式提交</button><button type="button">安全按钮</button></form>; }',
  );
  assert.equal(syntheticBtn.untypedButtons.length, 1);

  const untyped = [];
  for (const relPath of HOSTED_AND_STUDIO_BUTTON_FILES) {
    const src = fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
    const { untypedButtons } = auditTsxAccessibility(relPath, src);
    untyped.push(...untypedButtons);
  }
  assert.deepEqual(untyped, []);

  const iconsSrc = fs.readFileSync(new URL('../components/icons/EvixIcons.tsx', import.meta.url), 'utf8');
  const iconsSf = ts.createSourceFile('EvixIcons.tsx', iconsSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const iconIds = [];
  const iconLabels = new Map();

  ts.forEachChild(iconsSf, stmt => {
    if (!ts.isVariableStatement(stmt)) return;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = ts.isAsExpression(decl.initializer) ? decl.initializer.expression : decl.initializer;
      if (decl.name.text === 'EVIX_ICON_IDS' && ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (ts.isStringLiteral(el)) iconIds.push(el.text);
        }
      }
      if (decl.name.text === 'EVIX_ICON_LABELS' && ts.isObjectLiteralExpression(init)) {
        for (const prop of init.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
            const key = ts.isIdentifier(prop.name)
              ? prop.name.text
              : ts.isStringLiteral(prop.name)
                ? prop.name.text
                : prop.name.getText(iconsSf);
            iconLabels.set(key, prop.initializer.text);
          }
        }
      }
    }
  });

  assert.equal(iconIds.length, 32);
  assert.equal(iconLabels.size, 32);
  for (const iconId of iconIds) {
    const label = iconLabels.get(iconId);
    assert.ok(typeof label === 'string' && label.trim().length >= 2, `Missing accessible label for icon ${iconId}`);
    assert.doesNotMatch(label, /[【】「」『』]/u);
    assert.doesNotMatch(label, /硅基|ReAct|算子|沙盒/u);
  }
  assert.match(iconsSrc, /role=\{cleanTitle\s*\?\s*'img'\s*:\s*undefined\}/u);
  assert.match(iconsSrc, /aria-hidden=\{cleanTitle\s*\?\s*undefined\s*:\s*'true'\}/u);

  const trailSrc = fs.readFileSync(new URL('../components/agent/CursorTrail.tsx', import.meta.url), 'utf8');
  assert.match(trailSrc, /prefers-reduced-motion:\s*reduce/u);
  assert.match(trailSrc, /<canvas\b[^>]*aria-hidden="true"[^>]*tabIndex=\{-1\}/u);
});

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const CJK_RE = /[\u4e00-\u9fff]/u;

function collectLandmarkAndSkipAst(filename, sourceText) {
  const sf = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mains = [];
  const navLabels = [];
  const skipLinks = [];
  const elementIds = new Set();

  function getJsxInlineText(node) {
    if (!ts.isJsxElement(node)) return '';
    return node.children
      .map((child) => (ts.isJsxText(child) ? child.getText(sf).trim() : ''))
      .filter(Boolean)
      .join('');
  }

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      const attrs = parseJsxAttributes(node, sf);
      const idVal = attrs.get('id');
      if (idVal && !idVal.startsWith('{')) elementIds.add(idVal);

      if (tag === 'main') {
        mains.push({ id: idVal ?? null, tabIndex: attrs.get('tabIndex') ?? null });
      }
      if (tag === 'nav') {
        navLabels.push(attrs.get('aria-label') ?? attrs.get('aria-labelledby') ?? '');
      }
      if (tag === 'a') {
        const href = attrs.get('href') ?? '';
        const cls = attrs.get('className') ?? '';
        const text = ts.isJsxOpeningElement(node) ? getJsxInlineText(node.parent) : '';
        if (cls.includes('skip') || /跳到|跳过/u.test(text)) {
          skipLinks.push({ href, text });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { mains, navLabels, skipLinks, elementIds };
}

test('WCAG landmark & skip-link hygiene across LandingPage, ExplorePage, SubmissionPreflight, ChroniclePage, and HostedFrame', () => {
  const specs = [
    { relPath: 'components/landing/LandingPage.tsx', expectedAnchor: '#features' },
    { relPath: 'app/explore/page.tsx', expectedAnchor: '#demo' },
    { relPath: 'components/preflight/SubmissionPreflight.tsx', expectedAnchor: '#preflight-main', requireMainTabIndex: true },
    { relPath: 'components/landing/ChroniclePage.tsx', expectedAnchor: '{loginHref}' },
    {
      relPath: 'components/hosted/HostedFrame.tsx',
      companionPaths: ['components/workbench/shell-kit.tsx'],
      expectedAnchor: '#hosted-content',
      requireMainTabIndex: true,
    },
  ];

  for (const spec of specs) {
    const src = fs.readFileSync(new URL(`../${spec.relPath}`, import.meta.url), 'utf8');
    const { mains, navLabels, skipLinks, elementIds } = collectLandmarkAndSkipAst(spec.relPath, src);
    for (const compPath of spec.companionPaths ?? []) {
      const compSrc = fs.readFileSync(new URL(`../${compPath}`, import.meta.url), 'utf8');
      const compAst = collectLandmarkAndSkipAst(compPath, compSrc);
      navLabels.push(...compAst.navLabels);
    }

    assert.ok(mains.length >= 1, `${spec.relPath} must render a semantic <main> landmark`);
    assert.ok(navLabels.length >= 1, `${spec.relPath} must render at least one <nav> landmark`);
    for (const label of navLabels) {
      assert.ok(label.trim().length > 0, `${spec.relPath} <nav> must declare aria-label or aria-labelledby`);
      assert.doesNotMatch(label, FORBIDDEN_BRACKETS_RE, `${spec.relPath} <nav> label must not use forbidden brackets`);
    }

    assert.ok(skipLinks.length >= 1, `${spec.relPath} must render a keyboard skip-link`);
    assert.ok(
      skipLinks.some((link) => link.href === spec.expectedAnchor),
      `${spec.relPath} skip-link must target ${spec.expectedAnchor} (found: ${skipLinks.map((l) => l.href).join(', ')})`,
    );
    for (const link of skipLinks) {
      assert.match(link.text, CJK_RE, `${spec.relPath} skip-link text must be pure Chinese`);
      assert.doesNotMatch(link.text, FORBIDDEN_BRACKETS_RE);
    }

    if (spec.expectedAnchor.startsWith('#')) {
      const targetId = spec.expectedAnchor.slice(1);
      assert.ok(
        elementIds.has(targetId),
        `${spec.relPath} skip-link target id="${targetId}" must exist in the same route view`,
      );
    }
    if (spec.requireMainTabIndex) {
      assert.ok(
        mains.every((m) => m.tabIndex === '{-1}' || m.tabIndex === '-1'),
        `${spec.relPath} focusable <main> target must declare tabIndex={-1} for programmatic skip-link focus`,
      );
    }
  }
});

test('async lazy loading islands (CorpusObservatoryLazy, TexLazy, and dynamic shell panels) expose accessible live regions and semantic fallbacks', () => {
  // 1. CorpusObservatoryLazy.tsx preserves section heading target id="corpus-title" inside a polite status live region
  const corpusLazySrc = fs.readFileSync(
    new URL('../components/landing/CorpusObservatoryLazy.tsx', import.meta.url),
    'utf8',
  );
  const corpusSf = ts.createSourceFile(
    'CorpusObservatoryLazy.tsx',
    corpusLazySrc,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let hasPoliteStatus = false;
  let hasCorpusTitleId = false;
  const corpusTexts = [];
  function visitCorpus(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = parseJsxAttributes(node, corpusSf);
      if (attrs.get('role') === 'status' && attrs.get('aria-live') === 'polite') {
        hasPoliteStatus = true;
      }
      if (attrs.get('id') === 'corpus-title') {
        hasCorpusTitleId = true;
      }
    }
    if (ts.isJsxText(node)) {
      const trimmed = node.getText(corpusSf).trim();
      if (trimmed) corpusTexts.push(trimmed);
    }
    ts.forEachChild(node, visitCorpus);
  }
  visitCorpus(corpusSf);
  assert.equal(hasPoliteStatus, true, 'CorpusObservatoryLazy loading placeholder must declare role="status" and aria-live="polite"');
  assert.equal(hasCorpusTitleId, true, 'CorpusObservatoryLazy loading placeholder must preserve id="corpus-title" for aria-labelledby');
  assert.ok(corpusTexts.some((txt) => CJK_RE.test(txt)), 'CorpusObservatoryLazy loading copy must be Chinese');
  assert.doesNotMatch(corpusLazySrc, FORBIDDEN_BRACKETS_RE);
  assert.doesNotMatch(corpusLazySrc, /#[0-9A-Fa-f]{3,8}\b/u);

  // 2. TexLazy.tsx provides non-empty plain-text fallback & accessible figure semantics before KaTeX chunk loads
  const texLazySrc = fs.readFileSync(new URL('../components/math/TexLazy.tsx', import.meta.url), 'utf8');
  const texSf = ts.createSourceFile('TexLazy.tsx', texLazySrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let loadingMarkerCount = 0;
  let hasFocusableNamedFormulaFallback = false;
  function visitTexLazy(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = parseJsxAttributes(node, texSf);
      if (attrs.has('data-tex-loading')) loadingMarkerCount += 1;
      if (attrs.get('tabIndex') === '{0}' && Boolean(attrs.get('aria-label'))) {
        hasFocusableNamedFormulaFallback = true;
      }
    }
    ts.forEachChild(node, visitTexLazy);
  }
  visitTexLazy(texSf);
  assert.equal(loadingMarkerCount, 3, 'TexLazy, FormulaLazy, and TexSpanLazy must all render data-tex-loading semantic fallbacks');
  assert.equal(hasFocusableNamedFormulaFallback, true, 'FormulaLazy fallback must expose tabIndex={0} and Chinese aria-label');
  assert.doesNotMatch(texLazySrc, FORBIDDEN_BRACKETS_RE);

  // 3. Core shell dynamic() loading placeholders declare role="status"
  for (const relPath of ['components/EviXPlatform.tsx', 'components/agent/AgentShell.tsx', 'components/landing/LandingPage.tsx']) {
    const src = fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
    const loadingMatches = [...src.matchAll(/loading\s*:\s*\(\)\s*=>\s*(<[^\n;]+)/gu)];
    assert.ok(loadingMatches.length >= 1, `${relPath} must declare at least one dynamic() loading placeholder`);
    for (const [, snippet] of loadingMatches) {
      assert.match(snippet, /\brole="status"/u, `${relPath} dynamic() loading placeholder must declare role="status": ${snippet}`);
      assert.doesNotMatch(snippet, FORBIDDEN_BRACKETS_RE);
    }
  }
});

test('keyboard :focus-visible ring coverage and forced-colors Highlight outline guard across all 12 interactive shells', () => {
  const interactiveShellSheets = [
    'app/globals.css',
    'app/workbench.css',
    'app/hosted.css',
    'components/landing/LandingPage.module.css',
    'components/landing/LandingExplore.module.css',
    'components/landing/ChroniclePage.module.css',
    'components/preflight/SubmissionPreflight.module.css',
    'components/agent/AgentShell.module.css',
    'components/agent/GlobalAgentDock.module.css',
    'components/knowledge/Knowledge.module.css',
    'components/survey/PublicSurvey.module.css',
    'components/editors/PaperPages.module.css',
  ];
  assert.equal(interactiveShellSheets.length, 12);

  for (const relPath of interactiveShellSheets) {
    const raw = fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
    const clean = raw.replace(/\/\*[\s\S]*?\*\//gu, '');

    const focusVisibleCount = (clean.match(/:focus-visible\b/gu) ?? []).length;
    assert.ok(
      focusVisibleCount >= 2,
      `${relPath} must define explicit :focus-visible keyboard focus styles (found ${focusVisibleCount})`,
    );

    assert.match(
      clean,
      /:focus-visible[\s\S]{0,260}?(?:outline\s*:(?!\s*(?:none|0)\b)|box-shadow\s*:)/iu,
      `${relPath} :focus-visible rules must render a visible outline or focus ring`,
    );

    // Every interactive shell must also map :focus-visible to system Highlight under forced-colors
    assert.match(
      clean,
      /@media\s*\([^)]*forced-colors\s*:\s*active[^)]*\)[\s\S]*?:focus-visible[\s\S]*?Highlight/iu,
      `${relPath} @media (forced-colors: active) must guarantee a system Highlight focus indicator on :focus-visible`,
    );
  }
});
