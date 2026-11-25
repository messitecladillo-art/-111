import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectCssFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectCssFiles(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '');
}

function stripCssCommentsAndStrings(source) {
  return stripCssComments(source).replace(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gu, '""');
}

function hasCssKeyframeOrAnimation(cleanCss) {
  return /@(?:-webkit-)?keyframes\b|(?:^|[;{]\s*)animation(?:-name)?\s*:/mu.test(cleanCss);
}

function hasReducedMotionMediaQuery(cleanCss) {
  return /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce[^)]*\)/iu.test(cleanCss);
}

function readCleanCss(relPath) {
  const fullPath = path.join(FRONTEND_ROOT, relPath);
  return stripCssComments(fs.readFileSync(fullPath, 'utf8'));
}

test('CSS motion detector ignores commented-out rules and catches @keyframes / animation declarations', () => {
  const commentedOnly = stripCssComments('/* @keyframes spin {} .x { animation: spin 1s linear; } */ .ok { color: inherit; }');
  assert.equal(hasCssKeyframeOrAnimation(commentedOnly), false);

  const activeKeyframe = stripCssComments('@keyframes pulse { from { opacity: 0.4; } to { opacity: 1; } }');
  assert.equal(hasCssKeyframeOrAnimation(activeKeyframe), true);
  assert.equal(hasReducedMotionMediaQuery(activeKeyframe), false);

  const activeAnimWithGuard = stripCssComments(
    '.badge { animation-name: pulse; } @media (prefers-reduced-motion: reduce) { .badge { animation: none; } }',
  );
  assert.equal(hasCssKeyframeOrAnimation(activeAnimWithGuard), true);
  assert.equal(hasReducedMotionMediaQuery(activeAnimWithGuard), true);
});

test('100% of animated stylesheets across app/ and components/ include @media (prefers-reduced-motion: reduce) with balanced braces', () => {
  const cssFiles = [
    ...collectCssFiles(path.join(FRONTEND_ROOT, 'app')),
    ...collectCssFiles(path.join(FRONTEND_ROOT, 'components')),
  ].sort();

  assert.ok(cssFiles.length >= 100, `Expected >= 100 CSS files under app/ and components/, found ${cssFiles.length}`);

  const unbalanced = [];
  const missingReducedMotion = [];
  let animatedCount = 0;

  for (const fullPath of cssFiles) {
    const relPath = path.relative(FRONTEND_ROOT, fullPath).replace(/\\/gu, '/');
    const raw = fs.readFileSync(fullPath, 'utf8');
    const clean = stripCssComments(raw);
    const structural = stripCssCommentsAndStrings(raw);

    const opens = (structural.match(/\{/gu) ?? []).length;
    const closes = (structural.match(/\}/gu) ?? []).length;
    if (opens !== closes) {
      unbalanced.push(`${relPath} ({=${opens}, }=${closes})`);
    }

    if (hasCssKeyframeOrAnimation(clean)) {
      animatedCount += 1;
      if (!hasReducedMotionMediaQuery(clean)) {
        missingReducedMotion.push(relPath);
      }
    }
  }

  assert.deepEqual(unbalanced, [], `CSS files with unbalanced curly braces: ${unbalanced.join(', ')}`);
  assert.ok(animatedCount >= 50, `Expected >= 50 animated CSS files, found ${animatedCount}`);
  assert.deepEqual(
    missingReducedMotion,
    [],
    `Every stylesheet using @keyframes or animation/animation-name must declare @media (prefers-reduced-motion: reduce): ${missingReducedMotion.join(', ')}`,
  );
});

test('multi-column workbench stylesheets enforce @media (max-width) single-column collapse breakpoints', () => {
  const requiredResponsiveFiles = [
    'components/editors/LatexWorkbench.module.css',
    'components/knowledge/Knowledge.module.css',
    'components/survey/SurveyCollection.module.css',
    'components/analysis/SpreadsheetImportPanel.module.css',
  ];

  for (const relPath of requiredResponsiveFiles) {
    const clean = readCleanCss(relPath);
    assert.match(
      clean,
      /@media\s*\([^)]*max-width\s*:\s*\d+px[^)]*\)/iu,
      `${relPath} must define an @media (max-width: ...px) responsive breakpoint`,
    );
    assert.match(
      clean,
      /grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)/iu,
      `${relPath} must collapse rigid multi-column grids to minmax(0, 1fr) on narrow viewports`,
    );
  }
});

test('command palettes, knowledge drawers, and collaborative editor headers enforce min-width: 0 overflow guards', () => {
  const requiredOverflowFiles = [
    'components/agent/GlobalAgentDock.module.css',
    'components/editors/OnlyOfficeEditor.module.css',
    'components/knowledge/Knowledge.module.css',
  ];

  for (const relPath of requiredOverflowFiles) {
    const clean = readCleanCss(relPath);
    assert.match(
      clean,
      /min-width\s*:\s*0\b/iu,
      `${relPath} must include min-width: 0 to prevent flex/grid text children from blowing out horizontal scroll`,
    );
  }

  const dockCss = readCleanCss('components/agent/GlobalAgentDock.module.css');
  assert.match(
    dockCss,
    /\.commandOption\s+span\s*\{[^}]*min-width\s*:\s*0\b/isu,
    'GlobalAgentDock.module.css .commandOption span must declare min-width: 0',
  );
  assert.match(
    dockCss,
    /max-width\s*:\s*calc\(\s*100vw\s*-\s*24px\s*\)/iu,
    'GlobalAgentDock.module.css must clamp narrow viewport width with max-width: calc(100vw - 24px)',
  );

  const officeCss = readCleanCss('components/editors/OnlyOfficeEditor.module.css');
  assert.match(
    officeCss,
    /\.title\s*\{[^}]*min-width\s*:\s*0\b/isu,
    'OnlyOfficeEditor.module.css .title must declare min-width: 0',
  );
  assert.match(
    officeCss,
    /flex-wrap\s*:\s*wrap\b/iu,
    'OnlyOfficeEditor.module.css must protect narrow header actions with flex-wrap: wrap',
  );

  const knowledgeCss = readCleanCss('components/knowledge/Knowledge.module.css');
  assert.match(
    knowledgeCss,
    /\.pinned\s*\{[^}]*max-width\s*:\s*calc\(\s*100vw\s*-\s*24px\s*\)/isu,
    'Knowledge.module.css .pinned drawer must clamp width with max-width: calc(100vw - 24px)',
  );
  assert.match(
    knowledgeCss,
    /\.commandResults[\s\S]*?small\s*\{[^}]*min-width\s*:\s*0\b/isu,
    'Knowledge.module.css .commandResults small must declare min-width: 0',
  );
});

function extractMediaBlocks(cleanCss, headerPattern) {
  const blocks = [];
  const regex = new RegExp(headerPattern.source, 'giu');
  for (const match of cleanCss.matchAll(regex)) {
    const openBraceIdx = cleanCss.indexOf('{', match.index);
    assert.notEqual(openBraceIdx, -1, 'Matched @media rule must have an opening curly brace');
    let depth = 0;
    let closeBraceIdx = -1;
    for (let i = openBraceIdx; i < cleanCss.length; i += 1) {
      const ch = cleanCss[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          closeBraceIdx = i;
          break;
        }
      }
    }
    assert.notEqual(closeBraceIdx, -1, 'Matched @media rule must have balanced closing curly brace');
    blocks.push(cleanCss.slice(openBraceIdx + 1, closeBraceIdx).trim());
  }
  return blocks;
}

test('all 60 core route, portal, survey, preflight, paper, studio, analysis, defense, sampling, topic, canvas, theater, hosted, and global stylesheets enforce balanced, non-empty @media (forced-colors: active) high-contrast rules', () => {
  const requiredForcedColorFiles = [
    // Core shell, paper, knowledge, dock, hosted & root global sheets (11)
    'components/agent/AgentShell.module.css',
    'components/editors/PaperPages.module.css',
    'components/editors/PaperBlocks.module.css',
    'app/globals.css',
    'components/knowledge/Knowledge.module.css',
    'components/agent/GlobalAgentDock.module.css',
    'components/agent/ReportWorkspace.module.css',
    'components/hosted/HostedTopic.module.css',
    'components/hosted/HostedServices.module.css',
    'components/hosted/HostedDefense.module.css',
    'app/hosted.css',
    // Survey respondent/collection & submission preflight sheets (3)
    'components/survey/PublicSurvey.module.css',
    'components/preflight/SubmissionPreflight.module.css',
    'components/survey/SurveyCollection.module.css',
    // Landing & explore exhibition sheets (4)
    'components/landing/LandingPage.module.css',
    'components/landing/LandingExplore.module.css',
    'components/landing/CaseEvidence.module.css',
    'components/landing/LandingDemo.module.css',
    // Classic workbench & project portal sheets (2)
    'app/workbench.css',
    'components/workspace/ProjectPortal.module.css',
    // Creative studios, resource library, autonomous theater & artifact shelf sheets (4)
    'components/agent/studios/Studio.module.css',
    'components/agent/studios/ResourceLibrary.module.css',
    'components/agent/AutonomousAgentTheater.module.css',
    'components/agent/ArtifactShelf.module.css',
    // Chronicle, hero showcase, corpus observatory & report case library sheets (4)
    'components/landing/ChroniclePage.module.css',
    'components/landing/HeroShowcase.module.css',
    'components/landing/CorpusObservatory.module.css',
    'components/cases/ReportCaseLibrary.module.css',
    // Report editing, LaTeX workbench, quality studio & questionnaire studio sheets (4)
    'components/editors/EditingStudio.module.css',
    'components/editors/LatexWorkbench.module.css',
    'components/editors/QualityStudio.module.css',
    'components/design/QuestionnaireStudio.module.css',
    // Statistical survey lab, chart studio, defense studio & pitch rehearsal sheets (4)
    'components/analysis/SurveyLab.module.css',
    'components/analysis/ChartStudio.module.css',
    'components/defense/DefenseStudio.module.css',
    'components/defense/PitchRehearsal.module.css',
    // Sampling design, topic advisor, topic lab & model routing settings sheets (4)
    'components/sampling/Sampling.module.css',
    'components/topic-advisor/TopicAdvisor.module.css',
    'components/topic-lab/TopicLab.module.css',
    'components/agent/ModelRoutingSettings.module.css',
    // Agent workspace, literature study, research journey, workflow execution & advisors sheets (5)
    'components/agent/AgentWorkspace.module.css',
    'components/agent/LiteratureStudyPanel.module.css',
    'components/agent/ResearchJourney.module.css',
    'components/agent/WorkflowExecutionPanel.module.css',
    'components/agent/Advisors.module.css',
    // Silicon lab, live theater, canvas, optical workstation & evidence flight sheets (5)
    'components/silicon/SiliconLab.module.css',
    'components/silicon/AtypicaLiveTheater.module.css',
    'components/canvas/Canvas.module.css',
    'components/figures/report-workstation/ReportWorkstation.module.css',
    'components/EvidenceFlight.module.css',
    // Analysis recipes, net exam studio, office file library, storyboard & benchmark sheets (5)
    'components/analysis/AnalysisRecipes.module.css',
    'components/exam/NetExamStudio.module.css',
    'components/editors/OfficeFileLibrary.module.css',
    'components/editors/ReportStoryboard.module.css',
    'components/editors/BenchmarkPanel.module.css',
    // Topic agent, region picker, county evidence, sampling designer & overview sheets (5)
    'components/topic-advisor/TopicAgent.module.css',
    'components/topic-advisor/RegionPicker.module.css',
    'components/topic-advisor/CountyEvidencePanel.module.css',
    'components/sampling/SamplingDesigner.module.css',
    'components/overview/Overview.module.css',
  ];
  assert.equal(new Set(requiredForcedColorFiles).size, 60, 'Expected exact 60 unique forced-colors stylesheets');

  for (const relPath of requiredForcedColorFiles) {
    const raw = fs.readFileSync(path.join(FRONTEND_ROOT, relPath), 'utf8');
    const structural = stripCssCommentsAndStrings(raw);
    const opens = (structural.match(/\{/gu) ?? []).length;
    const closes = (structural.match(/\}/gu) ?? []).length;
    assert.equal(opens, closes, `${relPath} must keep strictly balanced curly braces ({=${opens}, }=${closes})`);

    const clean = stripCssComments(raw);
    const blocks = extractMediaBlocks(clean, /@media\s*\([^)]*forced-colors\s*:\s*active[^)]*\)/u);
    assert.ok(
      blocks.length >= 1,
      `${relPath} must declare at least one @media (forced-colors: active) block`,
    );

    const combined = blocks.join('\n');
    assert.ok(combined.length >= 80, `${relPath} @media (forced-colors: active) block must be non-empty`);
    assert.doesNotMatch(
      combined,
      /#[0-9A-Fa-f]{3,8}\b/u,
      `${relPath} @media (forced-colors: active) must use system color keywords rather than hardcoded hex colors`,
    );
    for (const sysColor of ['Highlight', 'HighlightText', 'ButtonText', 'CanvasText']) {
      assert.match(
        combined,
        new RegExp(`\\b${sysColor}\\b`, 'u'),
        `${relPath} @media (forced-colors: active) must map borders/states/tables to system keyword ${sysColor}`,
      );
    }
  }
});

const FORCED_COLOR_SYSTEM_TOKEN_RE =
  /\b(?:Canvas|CanvasText|ButtonBorder|ButtonFace|ButtonText|Highlight|HighlightText|GrayText|LinkText|forced-color-adjust)\b/u;

test('100.0% (105/105+) auto-discovered .css files across app/ and components/ enforce @media (forced-colors: active) with system semantic colors and zero hex literals', () => {
  const cssFiles = [
    ...collectCssFiles(path.join(FRONTEND_ROOT, 'app')),
    ...collectCssFiles(path.join(FRONTEND_ROOT, 'components')),
  ].sort();

  assert.ok(
    cssFiles.length >= 105,
    `Expected >= 105 auto-discovered .css files under app/ and components/, found ${cssFiles.length}`,
  );

  const missingForcedColors = [];
  const hexInForcedColors = [];
  const missingSystemTokens = [];
  const unbalancedFiles = [];

  for (const fullPath of cssFiles) {
    const relPath = path.relative(FRONTEND_ROOT, fullPath).replace(/\\/gu, '/');
    const raw = fs.readFileSync(fullPath, 'utf8');
    const structural = stripCssCommentsAndStrings(raw);
    const opens = (structural.match(/\{/gu) ?? []).length;
    const closes = (structural.match(/\}/gu) ?? []).length;
    if (opens !== closes) {
      unbalancedFiles.push(`${relPath} ({=${opens}, }=${closes})`);
      continue;
    }

    const clean = stripCssComments(raw);
    const blocks = extractMediaBlocks(clean, /@media\s*\([^)]*forced-colors\s*:\s*active[^)]*\)/u);
    const combined = blocks.join('\n').trim();
    if (!blocks.length || !combined.length) {
      missingForcedColors.push(relPath);
      continue;
    }

    const hexHit = /#[0-9A-Fa-f]{3,8}\b/u.exec(combined);
    if (hexHit) {
      hexInForcedColors.push(`${relPath} (${hexHit[0]})`);
    }

    if (!FORCED_COLOR_SYSTEM_TOKEN_RE.test(combined)) {
      missingSystemTokens.push(relPath);
    }
  }

  assert.deepEqual(unbalancedFiles, [], `CSS files with unbalanced curly braces: ${unbalancedFiles.join(', ')}`);
  assert.deepEqual(
    missingForcedColors,
    [],
    `Every .css file under app/ and components/ (100% parity) must declare a non-empty @media (forced-colors: active) block; missing: ${missingForcedColors.join(', ')}`,
  );
  assert.deepEqual(
    hexInForcedColors,
    [],
    `Zero #RRGGBB/#RGB hex literals allowed inside @media (forced-colors: active) blocks: ${hexInForcedColors.join(', ')}`,
  );
  assert.deepEqual(
    missingSystemTokens,
    [],
    `Every @media (forced-colors: active) block must use valid CSS system semantic colors: ${missingSystemTokens.join(', ')}`,
  );
});
