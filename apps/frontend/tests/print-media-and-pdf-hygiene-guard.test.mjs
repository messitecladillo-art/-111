import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sanitizeCssPreservingStructure(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, '');
  return withoutComments.replace(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gu, '""');
}

/**
 * Verify global curly-brace balance and extract the inner CSS text of all `@media print { ... }`
 * blocks in a stylesheet. Throws if curly braces are unbalanced anywhere in the file.
 */
function extractPrintMediaBlocks(relPath, rawSource) {
  const clean = sanitizeCssPreservingStructure(rawSource);

  let globalDepth = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '{') {
      globalDepth += 1;
    } else if (ch === '}') {
      globalDepth -= 1;
      if (globalDepth < 0) {
        throw new Error(`${relPath} has an unexpected closing brace "}" at offset ${i}`);
      }
    }
  }
  if (globalDepth !== 0) {
    throw new Error(`${relPath} has ${globalDepth} unclosed "{" brace(s)`);
  }

  const blocks = [];
  const headerRe = /@media\s+(?:only\s+)?print\b[^{]*\{/giu;
  let match = headerRe.exec(clean);
  while (match !== null) {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    while (cursor < clean.length && depth > 0) {
      const ch = clean[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) {
      throw new Error(`${relPath} has an unclosed @media print block starting at offset ${match.index}`);
    }
    blocks.push(clean.slice(bodyStart, cursor - 1));
    headerRe.lastIndex = cursor;
    match = headerRe.exec(clean);
  }

  return blocks;
}

function readPrintCss(relPath) {
  const raw = fs.readFileSync(path.join(FRONTEND_ROOT, relPath), 'utf8');
  const blocks = extractPrintMediaBlocks(relPath, raw);
  return { blocks, combined: blocks.join('\n') };
}

test('extractPrintMediaBlocks isolates nested @media print rules, ignores comments, and rejects unbalanced braces', () => {
  const commented = '/* @media print { .x { display: none; } } */ .screen { color: #111; }';
  assert.deepEqual(extractPrintMediaBlocks('commented.css', commented), []);

  const valid = [
    '.shell { height: 100vh; overflow: hidden; }',
    '@media print {',
    '  .rail, .sidebar { display: none !important; }',
    '  .shell { height: auto !important; overflow: visible !important; }',
    '}',
  ].join('\n');
  const extracted = extractPrintMediaBlocks('valid.css', valid);
  assert.equal(extracted.length, 1);
  assert.match(extracted[0], /overflow\s*:\s*visible/u);

  assert.throws(() => extractPrintMediaBlocks('broken.css', '@media print { .a { display: none; }'));
});

test('all six core workbench/paper CSS modules plus globals.css contain brace-balanced @media print blocks', () => {
  const requiredModules = [
    'components/editors/PaperPages.module.css',
    'components/editors/PaperBlocks.module.css',
    'components/agent/AgentShell.module.css',
    'components/agent/ReportWorkspace.module.css',
    'components/agent/GlobalAgentDock.module.css',
    'components/knowledge/Knowledge.module.css',
    'app/globals.css',
  ];

  for (const relPath of requiredModules) {
    const { blocks, combined } = readPrintCss(relPath);
    assert.ok(blocks.length >= 1, `${relPath} must declare at least one @media print block`);
    assert.ok(combined.trim().length > 20, `${relPath} @media print block must not be empty`);
  }
});

test('@media print unlocks 100vh/overflow:hidden shell and scaled paper frames to prevent first-page PDF truncation', () => {
  const agentShellPrint = readPrintCss('components/agent/AgentShell.module.css').combined;
  for (const selector of ['.shell', '.main', '.centre']) {
    assert.ok(
      agentShellPrint.includes(selector),
      `AgentShell.module.css @media print must reset ${selector} to unlock multi-page flow`,
    );
  }
  assert.match(agentShellPrint, /overflow\s*:\s*visible\b/iu);
  assert.match(agentShellPrint, /height\s*:\s*auto\b/iu);

  const paperPagesPrint = readPrintCss('components/editors/PaperPages.module.css').combined;
  for (const selector of ['.viewer', '.pagesFrame']) {
    assert.ok(
      paperPagesPrint.includes(selector),
      `PaperPages.module.css @media print must reset ${selector}`,
    );
  }
  assert.match(paperPagesPrint, /overflow\s*:\s*visible\b/iu);
  assert.match(paperPagesPrint, /height\s*:\s*auto\b/iu);
  assert.match(paperPagesPrint, /transform\s*:\s*none\b/iu);

  const globalsPrint = readPrintCss('app/globals.css').combined;
  assert.match(globalsPrint, /\.workbench\b/u);
  assert.match(globalsPrint, /overflow\s*:\s*visible\b/iu);
  assert.match(globalsPrint, /height\s*:\s*auto\b/iu);
});

test('@media print hides floating docks, toolbars, sidebars, and knowledge portals with display: none', () => {
  const matrix = [
    {
      relPath: 'components/agent/AgentShell.module.css',
      selectors: ['.rail', '.sidebar', '.top', '.floatingDock', '.panel'],
    },
    {
      relPath: 'components/agent/ReportWorkspace.module.css',
      selectors: ['.toolbarWrap', '.utilityRow', '.liveHud', '.previewNote', '.popover'],
    },
    {
      relPath: 'components/agent/GlobalAgentDock.module.css',
      selectors: ['.dockContainer'],
    },
    {
      relPath: 'components/knowledge/Knowledge.module.css',
      selectors: ['.root', '.launcher', '.mirror', '.command'],
    },
    {
      relPath: 'components/editors/PaperPages.module.css',
      selectors: ['.dock', '.status', '.selBar'],
    },
  ];

  for (const { relPath, selectors } of matrix) {
    const printCss = readPrintCss(relPath).combined;
    assert.match(
      printCss,
      /display\s*:\s*none\b/iu,
      `${relPath} @media print must hide screen-only chrome with display: none`,
    );
    for (const selector of selectors) {
      assert.ok(
        printCss.includes(selector),
        `${relPath} @media print must target ${selector} so it cannot cover printed pages`,
      );
    }
  }
});

test('@media print enforces break-inside: avoid, heading break-after: avoid, and exact color fidelity on figures and three-line tables', () => {
  for (const relPath of [
    'components/editors/PaperBlocks.module.css',
    'components/editors/PaperPages.module.css',
  ]) {
    const printCss = readPrintCss(relPath).combined;
    assert.match(
      printCss,
      /break-inside\s*:\s*avoid\b/iu,
      `${relPath} @media print must protect figures/tables/equations with break-inside: avoid`,
    );
    assert.match(
      printCss,
      /print-color-adjust\s*:\s*exact\b/iu,
      `${relPath} @media print must preserve vector chart and booktabs rules via print-color-adjust: exact`,
    );
    assert.match(
      printCss,
      /-webkit-print-color-adjust\s*:\s*exact\b/iu,
      `${relPath} @media print must include -webkit-print-color-adjust: exact for Chromium PDF export`,
    );
    assert.match(
      printCss,
      /break-after\s*:\s*avoid\b/iu,
      `${relPath} @media print must prevent orphan section/table headings with break-after: avoid`,
    );
  }
});

function extractMediaQueryBlocksWithRanges(relPath, rawSource, headerPattern) {
  const clean = sanitizeCssPreservingStructure(rawSource);

  let globalDepth = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '{') {
      globalDepth += 1;
    } else if (ch === '}') {
      globalDepth -= 1;
      if (globalDepth < 0) {
        throw new Error(`${relPath} has an unexpected closing brace "}" at offset ${i}`);
      }
    }
  }
  if (globalDepth !== 0) {
    throw new Error(`${relPath} has ${globalDepth} unclosed "{" brace(s)`);
  }

  const flags = headerPattern.flags.includes('g') ? headerPattern.flags : `${headerPattern.flags}g`;
  const headerRe = new RegExp(headerPattern.source, flags);
  const ranges = [];
  let match = headerRe.exec(clean);
  while (match !== null) {
    const start = match.index;
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    while (cursor < clean.length && depth > 0) {
      const ch = clean[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) {
      throw new Error(`${relPath} has an unclosed @media block starting at offset ${start}`);
    }
    ranges.push({
      start,
      end: cursor,
      body: clean.slice(bodyStart, cursor - 1),
    });
    headerRe.lastIndex = cursor;
    match = headerRe.exec(clean);
  }

  return ranges;
}

function collectCssFiles(relDir, acc = []) {
  const absDir = path.join(FRONTEND_ROOT, relDir);
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const childRel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      collectCssFiles(childRel, acc);
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      acc.push(childRel);
    }
  }
  return acc;
}

test('@media print unlocks root html/body, nested scroll containers, and suppresses modal/drawer chrome across multi-page exports', () => {
  const globalsPrint = readPrintCss('app/globals.css').combined;
  for (const rootToken of ['html', 'body', '.workbench-main', '.workbench-content', '.workspace-shell', '.wb-panel']) {
    assert.ok(
      globalsPrint.includes(rootToken),
      `app/globals.css @media print must unlock ${rootToken} for multi-page flow`,
    );
  }
  assert.match(globalsPrint, /min-height\s*:\s*0\b/iu);
  assert.match(globalsPrint, /transform\s*:\s*none\b/iu);
  for (const hiddenChrome of [
    '.site-header',
    '.site-footer',
    '.workbench-sidebar',
    '.workbench-topbar',
    '.wb-command-dialog',
    '.drawer-layer',
  ]) {
    assert.ok(
      globalsPrint.includes(hiddenChrome),
      `app/globals.css @media print must suppress ${hiddenChrome}`,
    );
  }

  const agentShellPrint = readPrintCss('components/agent/AgentShell.module.css').combined;
  for (const scrollTarget of ['.paperStage', '.chatColumn', '.scroll', '.researchDrawer']) {
    assert.ok(
      agentShellPrint.includes(scrollTarget),
      `AgentShell.module.css @media print must unlock nested container ${scrollTarget}`,
    );
  }
  assert.match(agentShellPrint, /position\s*:\s*static\b/iu);
  assert.match(agentShellPrint, /max-height\s*:\s*none\b/iu);
  assert.match(agentShellPrint, /transform\s*:\s*none\b/iu);
  for (const overlayTarget of [
    '.composerWrap',
    '.dockComposerWrap',
    '.brainModalBackdrop',
    '.siliconModalBackdrop',
  ]) {
    assert.ok(
      agentShellPrint.includes(overlayTarget),
      `AgentShell.module.css @media print must hide ${overlayTarget}`,
    );
  }
  for (const exhibitTarget of ['.replyTableWrap', '.studioSvgStage', '.cardFigure', '.mathBlock']) {
    assert.ok(
      agentShellPrint.includes(exhibitTarget),
      `AgentShell.module.css @media print must protect inline exhibit ${exhibitTarget} from mid-page splits`,
    );
  }
  assert.match(agentShellPrint, /break-inside\s*:\s*avoid\b/iu);
  assert.match(agentShellPrint, /print-color-adjust\s*:\s*exact\b/iu);

  const knowledgePrint = readPrintCss('components/knowledge/Knowledge.module.css').combined;
  for (const unlockedIndex of ['.indexBody', '.indexList', '.indexDetail']) {
    assert.ok(
      knowledgePrint.includes(unlockedIndex),
      `Knowledge.module.css @media print must unlock ${unlockedIndex} when printing standalone knowledge views`,
    );
  }
  assert.match(knowledgePrint, /height\s*:\s*auto\b/iu);
  assert.match(knowledgePrint, /max-height\s*:\s*none\b/iu);
  assert.match(knowledgePrint, /overflow\s*:\s*visible\b/iu);

  const globalDockPrint = readPrintCss('components/agent/GlobalAgentDock.module.css').combined;
  for (const dockPiece of ['.dockContainer', '.replyCard', '.commandPalette', '.capsule']) {
    assert.ok(
      globalDockPrint.includes(dockPiece),
      `GlobalAgentDock.module.css @media print must hide ${dockPiece}`,
    );
  }

  const reportWorkspacePrint = readPrintCss('components/agent/ReportWorkspace.module.css').combined;
  for (const workspaceChrome of ['.toolbar', '.latexSourceDrawer', '.nav', '.inspector']) {
    assert.ok(
      reportWorkspacePrint.includes(workspaceChrome),
      `ReportWorkspace.module.css @media print must hide ${workspaceChrome}`,
    );
  }
});

test('@media print enforces A4 page breaks without trailing blank pages, repeated table headers, and clean inline citations', () => {
  const paperPagesPrint = readPrintCss('components/editors/PaperPages.module.css').combined;
  assert.match(paperPagesPrint, /inline-size\s*:\s*210mm\b/iu);
  assert.match(paperPagesPrint, /break-after\s*:\s*page\b/iu);
  assert.match(paperPagesPrint, /\.page:last-child\s*\{[^}]*break-after\s*:\s*auto\b/isu);
  for (const protectedNode of ['.figure', '.table', '.equation', '.coverMeta']) {
    assert.ok(
      paperPagesPrint.includes(protectedNode),
      `PaperPages.module.css @media print must protect ${protectedNode} with break-inside: avoid`,
    );
  }
  for (const headingNode of ['.h1', '.h2', '.h3', '.tableCaption']) {
    assert.ok(
      paperPagesPrint.includes(headingNode),
      `PaperPages.module.css @media print must keep ${headingNode} attached to following content`,
    );
  }
  for (const transientUi of ['.workDock', '.workOverlay', '.caret', '.noteBadge', '.watermark', '.review', '.diffBox', '.measure']) {
    assert.ok(
      paperPagesPrint.includes(transientUi),
      `PaperPages.module.css @media print must suppress authoring overlay ${transientUi}`,
    );
  }

  const paperBlocksPrint = readPrintCss('components/editors/PaperBlocks.module.css').combined;
  for (const blockNode of ['.block', '.figure', '.tableScroll', '.table', '.equation', '.callout']) {
    assert.ok(
      paperBlocksPrint.includes(blockNode),
      `PaperBlocks.module.css @media print must protect ${blockNode} from mid-element page splits`,
    );
  }
  assert.match(
    paperBlocksPrint,
    /\.tableScroll\s*\{[^}]*overflow\s*:\s*visible\b/isu,
    'PaperBlocks.module.css @media print must unclip .tableScroll horizontal overflow',
  );
  assert.match(
    paperBlocksPrint,
    /\.table\s+thead\s*\{[^}]*display\s*:\s*table-header-group\b/isu,
    'PaperBlocks.module.css @media print must repeat multi-page three-line table headers via table-header-group',
  );
  assert.match(
    paperBlocksPrint,
    /\.table\s+tr\s*\{[^}]*break-inside\s*:\s*avoid\b/isu,
    'PaperBlocks.module.css @media print must prevent row splits inside three-line tables',
  );
  for (const inlineRef of ['.cite', '.xrefPill']) {
    assert.ok(
      paperBlocksPrint.includes(inlineRef),
      `PaperBlocks.module.css @media print must strip button chrome from ${inlineRef}`,
    );
  }
});

test('all core and repo-wide @media print stylesheets coexist cleanly with @media (forced-colors: active) with zero unbalanced braces', () => {
  const corePrintFiles = [
    'components/editors/PaperPages.module.css',
    'components/editors/PaperBlocks.module.css',
    'components/agent/AgentShell.module.css',
    'components/agent/ReportWorkspace.module.css',
    'components/agent/GlobalAgentDock.module.css',
    'components/knowledge/Knowledge.module.css',
    'app/globals.css',
  ];

  const allCssFiles = [...collectCssFiles('app'), ...collectCssFiles('components')].sort();
  const discoveredPrintFiles = allCssFiles.filter((relPath) => {
    const raw = fs.readFileSync(path.join(FRONTEND_ROOT, relPath), 'utf8');
    return /@media\s+(?:only\s+)?print\b/iu.test(sanitizeCssPreservingStructure(raw));
  });

  for (const required of corePrintFiles) {
    assert.ok(
      discoveredPrintFiles.includes(required),
      `Core print stylesheet ${required} must be present in discovered @media print set`,
    );
  }
  assert.ok(
    discoveredPrintFiles.length >= corePrintFiles.length,
    `Expected at least ${corePrintFiles.length} @media print stylesheets, found ${discoveredPrintFiles.length}`,
  );

  for (const relPath of discoveredPrintFiles) {
    const raw = fs.readFileSync(path.join(FRONTEND_ROOT, relPath), 'utf8');
    const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//gu, '');
    assert.doesNotMatch(
      withoutComments,
      /[\u3010\u3011\u300c\u300d\u300e\u300f]/u,
      `${relPath} active CSS declarations/content must not contain banned CJK bracket punctuation`,
    );

    const printRanges = extractMediaQueryBlocksWithRanges(
      relPath,
      raw,
      /@media\s+(?:only\s+)?print\b[^{]*\{/giu,
    );
    const forcedColorRanges = extractMediaQueryBlocksWithRanges(
      relPath,
      raw,
      /@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/giu,
    );

    assert.ok(printRanges.length >= 1, `${relPath} must contain at least one brace-balanced @media print block`);
    assert.ok(
      forcedColorRanges.length >= 1,
      `${relPath} must coexist with at least one brace-balanced @media (forced-colors: active) block`,
    );

    for (const pRange of printRanges) {
      assert.doesNotMatch(
        pRange.body,
        /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/iu,
        `${relPath} must not nest @media (forced-colors: active) inside @media print`,
      );
      for (const fcRange of forcedColorRanges) {
        const disjoint = pRange.end <= fcRange.start || fcRange.end <= pRange.start;
        assert.ok(
          disjoint,
          `${relPath} @media print [${pRange.start}, ${pRange.end}) and @media (forced-colors: active) [${fcRange.start}, ${fcRange.end}) must be cleanly disjoint`,
        );
      }
    }

    for (const fcRange of forcedColorRanges) {
      assert.doesNotMatch(
        fcRange.body,
        /@media\s+(?:only\s+)?print\b/iu,
        `${relPath} must not nest @media print inside @media (forced-colors: active)`,
      );
      assert.doesNotMatch(
        fcRange.body,
        /#[0-9A-Fa-f]{3,8}\b/u,
        `${relPath} @media (forced-colors: active) block must not contain raw #RRGGBB hex literals`,
      );
    }
  }

  assert.throws(
    () =>
      extractMediaQueryBlocksWithRanges(
        'swallowed-forced-colors.css',
        '@media print { .page { break-inside: avoid; } @media (forced-colors: active) { .page { color: CanvasText; } }',
        /@media\s+(?:only\s+)?print\b[^{]*\{/giu,
      ),
    /unclosed "\{" brace/u,
  );
});
