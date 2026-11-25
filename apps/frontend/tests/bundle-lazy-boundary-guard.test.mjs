import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extract all top-level static value import/re-export module specifiers from a TS/TSX file.
 * Pure `import type ...` and `import { type A, type B } ...` are excluded because TypeScript
 * erases them completely at compile time; dynamic `import('...')` calls are also excluded
 * because bundlers split them into async chunks.
 */
function collectStaticValueModuleSpecifiers(filename, sourceText) {
  const kind = filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, kind);
  const staticValueImports = [];

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const specifier = stmt.moduleSpecifier.text;
      const line = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;
      const clause = stmt.importClause;

      // Bare side-effect import: `import 'pkg';`
      if (!clause) {
        staticValueImports.push({ specifier, line, text: stmt.getText(sf).trim() });
        continue;
      }
      if (clause.isTypeOnly) {
        continue;
      }

      const hasDefaultValue = Boolean(clause.name);
      let hasNamedValue = false;
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          hasNamedValue = true;
        } else if (ts.isNamedImports(clause.namedBindings)) {
          hasNamedValue = clause.namedBindings.elements.some(el => !el.isTypeOnly);
        }
      }

      if (hasDefaultValue || hasNamedValue) {
        staticValueImports.push({ specifier, line, text: stmt.getText(sf).trim() });
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      !stmt.isTypeOnly
    ) {
      const specifier = stmt.moduleSpecifier.text;
      const line = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;
      let hasValueExport = true;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        hasValueExport = stmt.exportClause.elements.some(el => !el.isTypeOnly);
      }
      if (hasValueExport) {
        staticValueImports.push({ specifier, line, text: stmt.getText(sf).trim() });
      }
    }
  }

  return staticValueImports;
}

function readStaticImports(relPath) {
  const sourceText = fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');
  return collectStaticValueModuleSpecifiers(relPath, sourceText);
}

test('AST static-value-import detector distinguishes runtime imports from erased type imports and dynamic import()', () => {
  const sample = [
    "import type { AgentTurn, Span } from '@/lib/agent/router';",
    "import { type DemoPack } from '@/lib/agent/demo-study';",
    "import { matchCommands } from '@/lib/agent/commands';",
    "import 'katex/dist/katex.min.css';",
    "import { Document, type Paragraph } from 'docx';",
    "export type { Command } from './commands';",
    "export { COMMANDS } from './commands';",
    "async function load() { return import('@/lib/agent/router'); }",
  ].join('\n');

  const found = collectStaticValueModuleSpecifiers('sample.tsx', sample);
  assert.deepEqual(
    found.map(item => item.specifier),
    ['@/lib/agent/commands', 'katex/dist/katex.min.css', 'docx', './commands'],
  );
});

test('(a) root layout & GlobalAgentDock never statically pull @/lib/agent/router into initial shell bundle', () => {
  for (const relPath of ['app/layout.tsx', 'components/agent/GlobalAgentDock.tsx']) {
    const imports = readStaticImports(relPath);
    const forbidden = imports.filter(item => /(?:^|\/)agent\/router(?:\.ts)?$/u.test(item.specifier));
    assert.deepEqual(
      forbidden,
      [],
      `${relPath} must not statically value-import agent/router (use import type + async import() or @/lib/agent/commands)`,
    );
  }

  // Also ensure the extracted lightweight commands module never pulls heavy graph/catalog modules
  if (fs.existsSync(new URL('../lib/agent/commands.ts', import.meta.url))) {
    const cmdImports = readStaticImports('lib/agent/commands.ts');
    const heavy = cmdImports.filter(item => !/^\.\/rooms(?:\.ts)?$/u.test(item.specifier));
    assert.deepEqual(
      heavy,
      [],
      'lib/agent/commands.ts must remain a lightweight leaf depending only on ./rooms',
    );
  }
});

test('(b) KnowledgeProvider defers KnowledgeEntryView, catalog JSON, and katex out of non-knowledge initial bundles', () => {
  const imports = readStaticImports('components/knowledge/KnowledgeProvider.tsx');
  const forbidden = imports.filter(item =>
    /(?:^|\/)(?:KnowledgeEntryView|KnowledgeGuideView|KnowledgeLookupPanel|KnowledgeProjectReferences|catalog|knowledge-bundle|research-materials|research-method-guide|worker-client)(?:\.tsx?)?$|^katex(?:\/|$)|(?:^|\/)math\/Tex(?:\.tsx)?$/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbidden,
    [],
    'KnowledgeProvider.tsx must lazy-load KnowledgeEntryView, catalog/knowledge-bundle, and KaTeX instead of top-level static value imports',
  );
});

test('(c) studio-tools loads docx asynchronously on export instead of top-level static import', () => {
  const imports = readStaticImports('lib/agent/studio-tools.ts');
  const forbidden = imports.filter(item => /^docx(?:\/|$)/u.test(item.specifier));
  assert.deepEqual(
    forbidden,
    [],
    'lib/agent/studio-tools.ts must dynamically await import("docx") inside export helpers',
  );
});

test('(d) EviXPlatform defers @/lib/agent/demo-study to on-demand sample generation', () => {
  const imports = readStaticImports('components/EviXPlatform.tsx');
  const forbidden = imports.filter(item => /(?:^|\/)demo-study(?:\.ts)?$/u.test(item.specifier));
  assert.deepEqual(
    forbidden,
    [],
    'EviXPlatform.tsx must only import type from @/lib/agent/demo-study at top level and await import() on click',
  );
});

test('(e) AgentShell defers demo-study and non-default heavy stage panels out of /agent initial synchronous bundle', () => {
  const imports = readStaticImports('components/agent/AgentShell.tsx');
  const forbidden = imports.filter(item =>
    /(?:^|\/)(?:demo-study|StudioPanel|ResourceLibraryStudio|AutonomousAgentTheater|Advisors|ResearchWorkspace|AgentRunReview)(?:\.tsx?)?$/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbidden,
    [],
    'AgentShell.tsx must not top-level value-import demo-study or deferred stage panels',
  );
});

test('(f) ReportPaper never top-level value-imports LatexWorkbench, ReportFormatPanel, or ReportFramePanel', () => {
  const imports = readStaticImports('components/editors/ReportPaper.tsx');
  const forbidden = imports.filter(item =>
    /(?:^|\/)(?:LatexWorkbench|ReportFormatPanel|ReportFramePanel|quality-export|editor-export|latex-report)(?:\.tsx?)?$/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbidden,
    [],
    'ReportPaper.tsx must keep heavy formatting/workbench modals and exporters out of synchronous paper imports',
  );
});

test('(g) EviXPlatform never top-level value-imports 1.1MB topic-advisor catalog.json or TopicModelProposal', () => {
  const imports = readStaticImports('components/EviXPlatform.tsx');
  const forbidden = imports.filter(item =>
    /(?:^|\/)(?:topic-advisor\/catalog(?:\.json)?|TopicModelProposal(?:\.tsx?)?)$/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbidden,
    [],
    'EviXPlatform.tsx must lazy-load TopicModelProposal and content/topic-advisor/catalog.json instead of top-level static value imports',
  );
});

test('(h) router, AgentShell, GlobalAgentDock, and dock defer 3.8MB county gazetteer, 4-catalog recommender, and dagre to async chunks', () => {
  const heavyResourcePattern =
    /(?:^|\/)(?:router-heavy-actions|china-county-gazetteer|landmark-illustrations|regions\.catalog|smart-recommender|chart-catalog|table-catalog|diagram-catalog|visual-catalog|diagram-figures|chart-example-renderer|bento-infographic-renderer)(?:\.(?:ts|tsx|json))?$|^@dagrejs\/dagre(?:\/|$)/u;

  for (const relPath of [
    'lib/agent/router.ts',
    'components/agent/AgentShell.tsx',
    'components/agent/GlobalAgentDock.tsx',
    'lib/agent/dock.ts',
  ]) {
    const imports = readStaticImports(relPath);
    const forbidden = imports.filter(item => heavyResourcePattern.test(item.specifier));
    assert.deepEqual(
      forbidden,
      [],
      `${relPath} must not top-level value-import router-heavy-actions, county gazetteer, resource catalogs, or @dagrejs/dagre`,
    );
  }

  // Also ensure router-heavy-actions.ts keeps county gazetteer and smart-recommender behind per-branch dynamic import()
  const heavyResolverImports = readStaticImports('lib/agent/router-heavy-actions.ts');
  const eagerInResolver = heavyResolverImports.filter(item =>
    /(?:^|\/)(?:china-county-gazetteer|landmark-illustrations|regions\.catalog|smart-recommender|chart-catalog|table-catalog|diagram-catalog|visual-catalog|diagram-figures)(?:\.(?:ts|tsx|json))?$|^@dagrejs\/dagre(?:\/|$)/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    eagerInResolver,
    [],
    'lib/agent/router-heavy-actions.ts must load china-county-gazetteer and smart-recommender via dynamic import() per branch',
  );
});

test('(i) ReportWorkspace, topic-lab/workspace, and questionnaire-repository sever parallel static chains into latex-report and 1.4MB regions.catalog.json', () => {
  const reportWorkspaceImports = readStaticImports('components/agent/ReportWorkspace.tsx');
  const forbiddenReportWorkspace = reportWorkspaceImports.filter(item =>
    /(?:^|\/)(?:latex-report|editor-export|quality-export|method-figures|snapshot-vector-bridge|china-county-gazetteer|landmark-illustrations|smart-recommender|chart-catalog|table-catalog|diagram-catalog|visual-catalog|diagram-figures)(?:\.(?:ts|tsx|json))?$|^@dagrejs\/dagre(?:\/|$)/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbiddenReportWorkspace,
    [],
    'ReportWorkspace.tsx must load latex-report and heavy export/figure bridges lazily via dynamic import()',
  );

  const topicLabWorkspaceImports = readStaticImports('lib/topic-lab/workspace.ts');
  const forbiddenTopicLab = topicLabWorkspaceImports.filter(item =>
    /(?:^|\/)(?:topic-advisor\/|regions\.catalog)/u.test(item.specifier),
  );
  assert.deepEqual(
    forbiddenTopicLab,
    [],
    'lib/topic-lab/workspace.ts must not value-import topic-advisor/* (which pulls 1.4MB regions.catalog.json into /workspace and /agent)',
  );

  const questionnaireRepoImports = readStaticImports('components/hosted/questionnaire-repository.ts');
  const forbiddenQuestionnaireRepo = questionnaireRepoImports.filter(item =>
    /(?:^|\/)(?:topic-questionnaire-api|topic-project|topic-advisor\/|regions\.catalog)(?:\.(?:ts|tsx|json))?$/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbiddenQuestionnaireRepo,
    [],
    'components/hosted/questionnaire-repository.ts must import type TopicBindingReceipt at top level and await import("@/lib/topic-questionnaire-api") inside bindingFor()',
  );
});

const parsedStaticSpecifierCache = new Map();

function getCachedStaticSpecifiers(relPath) {
  let cached = parsedStaticSpecifierCache.get(relPath);
  if (!cached) {
    const fullPath = path.join(FRONTEND_ROOT, relPath);
    const sourceText = fs.readFileSync(fullPath, 'utf8');
    cached = collectStaticValueModuleSpecifiers(relPath, sourceText);
    parsedStaticSpecifierCache.set(relPath, cached);
  }
  return cached;
}

function resolveFrontendLocalModule(fromRelPath, specifier) {
  let candidateBase = null;
  if (specifier.startsWith('@/')) {
    candidateBase = path.join(FRONTEND_ROOT, specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    candidateBase = path.resolve(path.dirname(path.join(FRONTEND_ROOT, fromRelPath)), specifier);
  } else {
    return null;
  }

  const suffixes = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '.css', '/index.ts', '/index.tsx', '/index.js'];
  for (const suffix of suffixes) {
    const full = `${candidateBase}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const rel = path.relative(FRONTEND_ROOT, full).replace(/\\/gu, '/');
      if (!rel.startsWith('..')) {
        return rel;
      }
    }
  }

  if (/\.(?:js|mjs)$/u.test(candidateBase)) {
    const stem = candidateBase.replace(/\.(?:js|mjs)$/u, '');
    for (const ext of ['.ts', '.tsx']) {
      const full = `${stem}${ext}`;
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        const rel = path.relative(FRONTEND_ROOT, full).replace(/\\/gu, '/');
        if (!rel.startsWith('..')) {
          return rel;
        }
      }
    }
  }

  return null;
}

function traceStaticValueClosure(entryRelPath) {
  const parentByModule = new Map([[entryRelPath, null]]);
  const externalPackages = new Map();
  const queue = [entryRelPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!/\.(?:ts|tsx|js|mjs)$/u.test(current)) {
      continue;
    }
    for (const edge of getCachedStaticSpecifiers(current)) {
      const resolvedLocal = resolveFrontendLocalModule(current, edge.specifier);
      if (resolvedLocal) {
        if (!parentByModule.has(resolvedLocal)) {
          parentByModule.set(resolvedLocal, current);
          queue.push(resolvedLocal);
        }
      } else if (!externalPackages.has(edge.specifier)) {
        externalPackages.set(edge.specifier, current);
      }
    }
  }

  function formatChainTo(leafRelOrPkg, viaRel) {
    const chain = [leafRelOrPkg];
    let cur = viaRel;
    while (cur !== null && cur !== undefined) {
      chain.push(cur);
      cur = parentByModule.get(cur) ?? null;
    }
    return chain.reverse().join(' -> ');
  }

  return { parentByModule, externalPackages, formatChainTo };
}

test('(j) recursive static value-import closure from AgentShell, KnowledgeIndex, and all 10 core UI routes never reaches katex, Tex.tsx, omml.ts, report-insert.ts, or ReportPaper.tsx', () => {
  const forbiddenLocalModules = [
    'components/math/Tex.tsx',
    'lib/omml.ts',
    'lib/report-insert.ts',
    'components/editors/ReportPaper.tsx',
  ];

  const guardedEntries = [
    'components/agent/AgentShell.tsx',
    'components/knowledge/KnowledgeIndex.tsx',
    'app/layout.tsx',
    'app/error.tsx',
    'app/global-error.tsx',
    'app/not-found.tsx',
    'app/page.tsx',
    'app/login/page.tsx',
    'app/explore/page.tsx',
    'app/services/page.tsx',
    'app/projects/page.tsx',
    'app/projects/[projectId]/page.tsx',
    'app/preflight/page.tsx',
    'app/knowledge/page.tsx',
    'app/workspace/page.tsx',
    'app/agent/page.tsx',
    'app/agent/workspace/page.tsx',
    'app/chronicle/page.tsx',
    'app/invites/page.tsx',
    'app/s/[token]/page.tsx',
  ];

  for (const entry of ['components/agent/AgentShell.tsx', 'components/knowledge/KnowledgeIndex.tsx']) {
    const closure = traceStaticValueClosure(entry);
    assert.ok(
      closure.parentByModule.size >= 5,
      `Expected ${entry} static closure to resolve multiple modules, got ${closure.parentByModule.size}`,
    );
  }

  for (const entry of guardedEntries) {
    const closure = traceStaticValueClosure(entry);
    const katexHits = [...closure.externalPackages.entries()]
      .filter(([spec]) => /^katex(?:\/|$)/u.test(spec))
      .map(([spec, from]) => closure.formatChainTo(spec, from));
    assert.deepEqual(
      katexHits,
      [],
      `${entry} synchronous static value-import closure must never reach katex: ${katexHits.join(' | ')}`,
    );

    const localViolations = forbiddenLocalModules
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      localViolations,
      [],
      `${entry} synchronous static value-import closure must never reach eager math/paper modules: ${localViolations.join(' | ')}`,
    );
  }
});

test('(k) recursive static value-import closure keeps /knowledge free of published.json & catalog.ts and keeps /agent & /workspace free of LifecycleWarRoom, zhengda-empirical-anatomy, AnatomyStageCard, and silicon runtimes', () => {
  const knowledgeForbidden = [
    'content/knowledge/published.json',
    'components/knowledge/catalog.ts',
  ];

  for (const entry of [
    'app/knowledge/page.tsx',
    'components/knowledge/KnowledgeIndex.tsx',
    'components/knowledge/KnowledgeEntryView.tsx',
    'app/layout.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = knowledgeForbidden
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach 465KB published.json or catalog.ts: ${hits.join(' | ')}`,
    );
  }

  const workbenchForbidden = [
    'components/LifecycleWarRoom.tsx',
    'data/zhengda-empirical-anatomy.ts',
    'components/figures/report-workstation/AnatomyStageCard.tsx',
    'lib/silicon/example.ts',
    'lib/silicon/persona.ts',
    'lib/silicon/run.ts',
  ];

  for (const entry of [
    'app/agent/page.tsx',
    'app/workspace/page.tsx',
    'components/agent/AgentShell.tsx',
    'components/workspace/ProjectPortal.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = workbenchForbidden
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach heavy anatomy/war-room/silicon modules: ${hits.join(' | ')}`,
    );
  }
});

test('(l) recursive static value-import closure keeps /agent & AgentShell below 2.0MB by deferring ReportWorkspace, ReportLiveTheater, SectionRevision, OutputPanel, PaperBlocks, submission-preflight, and page-art', () => {
  const agentSub2MbForbidden = [
    'components/agent/ReportWorkspace.tsx',
    'components/agent/ReportLiveTheater.tsx',
    'components/agent/SectionRevision.tsx',
    'components/agent/OutputPanel.tsx',
    'components/editors/PaperBlocks.tsx',
    'lib/submission-preflight.ts',
    'lib/page-art.ts',
  ];

  for (const entry of [
    'app/agent/page.tsx',
    'components/agent/AgentShell.tsx',
    'components/agent/useLiveReportChoreography.ts',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = agentSub2MbForbidden
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach deferred paper/drawer/preflight/page-art modules: ${hits.join(' | ')}`,
    );
  }

  // Also ensure /workspace stays free of lib/page-art.ts via page-art-schema.ts split
  const workspaceClosure = traceStaticValueClosure('app/workspace/page.tsx');
  if (workspaceClosure.parentByModule.has('lib/page-art.ts')) {
    assert.fail(
      `app/workspace/page.tsx synchronously reaches lib/page-art.ts: ${workspaceClosure.formatChainTo('lib/page-art.ts', workspaceClosure.parentByModule.get('lib/page-art.ts'))}`,
    );
  }
});

test('(m) recursive static value-import closure keeps /workspace below 1.0MB (9/10 routes sub-1MB) and /agent free of ReportCaseLibrary, DiagnosisActions, ProjectPortal, and WorkbenchShell', () => {
  const sharedDeferredPanels = [
    'components/cases/ReportCaseLibrary.tsx',
    'components/DiagnosisActions.tsx',
    'components/workspace/ProjectPortal.tsx',
  ];

  for (const entry of [
    'app/workspace/page.tsx',
    'components/EviXPlatform.tsx',
    'app/agent/page.tsx',
    'components/agent/AgentShell.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = sharedDeferredPanels
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach ReportCaseLibrary (252.9KB), DiagnosisActions, or ProjectPortal: ${hits.join(' | ')}`,
    );
  }

  for (const entry of [
    'app/agent/page.tsx',
    'components/agent/AgentShell.tsx',
    'components/workbench/nav-context.ts',
  ]) {
    const closure = traceStaticValueClosure(entry);
    if (closure.parentByModule.has('components/WorkbenchShell.tsx')) {
      assert.fail(
        `${entry} synchronously reaches components/WorkbenchShell.tsx: ${closure.formatChainTo('components/WorkbenchShell.tsx', closure.parentByModule.get('components/WorkbenchShell.tsx'))}`,
      );
    }
  }
});

test('(n) recursive static value-import closure keeps all 10 core UI routes, editor-model, and topic-lab/workspace free of report-storyboard.ts and cloud-shapes.ts', () => {
  const deferredHeavyGenerators = [
    'lib/report-storyboard.ts',
    'lib/topic-lab/cloud-shapes.ts',
  ];

  const guardedEntries = [
    'app/workspace/page.tsx',
    'components/EviXPlatform.tsx',
    'app/agent/page.tsx',
    'components/agent/AgentShell.tsx',
    'lib/editor-model.ts',
    'lib/topic-lab/workspace.ts',
    'lib/report-storyboard-schema.ts',
    'lib/topic-lab/cloud-appearance-schema.ts',
    'app/page.tsx',
    'app/login/page.tsx',
    'app/explore/page.tsx',
    'app/services/page.tsx',
    'app/projects/page.tsx',
    'app/preflight/page.tsx',
    'app/not-found.tsx',
    'app/knowledge/page.tsx',
  ];

  for (const entry of guardedEntries) {
    const closure = traceStaticValueClosure(entry);
    const hits = deferredHeavyGenerators
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach report-storyboard.ts (33.2KB) or cloud-shapes.ts (24.9KB): ${hits.join(' | ')}`,
    );
  }
});

test('(p) recursive static value-import closure keeps /explore free of CorpusObservatory and 291.6KB empirical corpus archives while retaining LandingDemo SSR', () => {
  const exploreDeferredCorpusModules = [
    'components/landing/CorpusObservatory.tsx',
    'data/zhengda-empirical-anatomy.ts',
    'data/zhengda-corpus-2015-2027.ts',
    'data/zhengda-award-archive-2015-2025.json',
  ];

  for (const entry of ['app/explore/page.tsx', 'components/landing/CorpusObservatoryLazy.tsx']) {
    const closure = traceStaticValueClosure(entry);
    const hits = exploreDeferredCorpusModules
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach CorpusObservatory or empirical corpus archives: ${hits.join(' | ')}`,
    );
  }

  const exploreClosure = traceStaticValueClosure('app/explore/page.tsx');
  assert.ok(
    exploreClosure.parentByModule.has('components/landing/LandingDemo.tsx'),
    'app/explore/page.tsx must retain synchronous LandingDemo import for SSR check-landing-routes parity',
  );
});

test('(q) recursive static value-import closure keeps /agent & AgentShell free of 90.8KB lib/agent/autonomous-agent.ts', () => {
  for (const entry of [
    'app/agent/page.tsx',
    'components/agent/AgentShell.tsx',
    'app/workspace/page.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    if (closure.parentByModule.has('lib/agent/autonomous-agent.ts')) {
      assert.fail(
        `${entry} synchronously reaches lib/agent/autonomous-agent.ts: ${closure.formatChainTo('lib/agent/autonomous-agent.ts', closure.parentByModule.get('lib/agent/autonomous-agent.ts'))}`,
      );
    }
  }
});

test('(r) recursive static value-import closure keeps home route (/) & LandingPage free of analysis-recipes, survey-analysis, inference, and silicon/persona runtimes', () => {
  const homeForbiddenModules = [
    'lib/analysis-recipes.ts',
    'lib/survey-analysis.ts',
    'lib/inference.ts',
    'lib/silicon/persona.ts',
  ];

  for (const entry of [
    'app/page.tsx',
    'components/landing/LandingPage.tsx',
    'lib/analysis-blocks-meta.ts',
    'lib/silicon/limits.ts',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = homeForbiddenModules
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach heavy analysis/persona runtimes: ${hits.join(' | ')}`,
    );
  }
});

test('(s) recursive static value-import closure keeps /preflight main thread free of submission-preflight.ts, questionnaire.ts, and pako', () => {
  const preflightForbiddenLocal = [
    'lib/submission-preflight.ts',
    'lib/questionnaire.ts',
  ];

  for (const entry of [
    'app/preflight/page.tsx',
    'components/preflight/SubmissionPreflight.tsx',
    'lib/preflight-upload.ts',
    'lib/submission-preflight-schema.ts',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const localHits = preflightForbiddenLocal
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      localHits,
      [],
      `${entry} synchronous static value-import closure must never reach submission-preflight.ts or questionnaire.ts: ${localHits.join(' | ')}`,
    );

    const archivePkgHits = [...closure.externalPackages.entries()]
      .filter(([spec]) => /^(?:pako|sax)(?:\/|$)/u.test(spec))
      .map(([spec, from]) => closure.formatChainTo(spec, from));
    assert.deepEqual(
      archivePkgHits,
      [],
      `${entry} synchronous static value-import closure must never reach pako/sax on main thread: ${archivePkgHits.join(' | ')}`,
    );
  }
});

test('(t) /agent & AgentShell sever synchronous reachability to transcript-export, report-appendices, and paper-diff plus top-level figure-tweak value imports', () => {
  const agentDeferredActionModules = [
    'lib/agent/transcript-export.ts',
    'lib/report-appendices.ts',
    'lib/agent/paper-diff.ts',
  ];

  for (const entry of ['app/agent/page.tsx', 'components/agent/AgentShell.tsx']) {
    const closure = traceStaticValueClosure(entry);
    const hits = agentDeferredActionModules
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach action-only export/appendix/diff helpers: ${hits.join(' | ')}`,
    );
  }

  const agentShellTopImports = readStaticImports('components/agent/AgentShell.tsx');
  const forbiddenTop = agentShellTopImports.filter(item =>
    /(?:^|\/)(?:transcript-export|report-appendices|paper-diff|figure-tweak)(?:\.ts)?$/u.test(
      item.specifier,
    ),
  );
  assert.deepEqual(
    forbiddenTop,
    [],
    'AgentShell.tsx must have zero top-level static value imports of transcript-export, report-appendices, paper-diff, and figure-tweak',
  );
});

test('(u) /examples/bank-marketing & QualityExample sever synchronous reachability to EditingStudio, quality-example.json, and katex (100% 14/14 route zero-sync katex)', () => {
  const exampleForbiddenLocal = [
    'components/editors/EditingStudio.tsx',
    'data/quality-example.json',
    'components/math/Tex.tsx',
    'lib/omml.ts',
  ];

  for (const entry of [
    'app/examples/bank-marketing/page.tsx',
    'components/editors/QualityExample.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const localHits = exampleForbiddenLocal
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      localHits,
      [],
      `${entry} synchronous static value-import closure must never reach EditingStudio.tsx, quality-example.json, Tex.tsx, or omml.ts: ${localHits.join(' | ')}`,
    );

    const katexHits = [...closure.externalPackages.entries()]
      .filter(([spec]) => /^katex(?:\/|$)/u.test(spec))
      .map(([spec, from]) => closure.formatChainTo(spec, from));
    assert.deepEqual(
      katexHits,
      [],
      `${entry} synchronous static value-import closure must never reach katex: ${katexHits.join(' | ')}`,
    );
  }
});

test('(v) /projects/[projectId] & HostedProjectLazy sever 1.8+ MB synchronous reachability to HostedProject, TopicQuestionnaireProposal, and 1.4MB regions.catalog.json', () => {
  const projectDetailForbidden = [
    'components/hosted/HostedProject.tsx',
    'components/topic-advisor/TopicQuestionnaireProposal.tsx',
    'lib/topic-advisor/regions.ts',
    'content/topic-advisor/regions.catalog.json',
  ];

  for (const entry of [
    'app/projects/[projectId]/page.tsx',
    'components/hosted/HostedProjectLazy.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = projectDetailForbidden
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach HostedProject or 1.4MB regions.catalog.json: ${hits.join(' | ')}`,
    );
  }
});

test('(w) /agent, AgentShell, and StudioCards sever synchronous reachability to StudioCardsImpl, Lobby, CursorTrail, tools-schema, and full-report-client (< 1.7 MB breakthrough)', () => {
  const agentSub1700KbForbidden = [
    'components/agent/StudioCardsImpl.tsx',
    'components/agent/Lobby.tsx',
    'components/agent/CursorTrail.tsx',
    'lib/agent/tools-schema.ts',
    'components/agent/full-report-client.ts',
    'data/corpus-reserve-summary.ts',
  ];

  for (const entry of [
    'app/agent/page.tsx',
    'components/agent/AgentShell.tsx',
    'components/agent/StudioCards.tsx',
  ]) {
    const closure = traceStaticValueClosure(entry);
    const hits = agentSub1700KbForbidden
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      hits,
      [],
      `${entry} synchronous static value-import closure must never reach deferred studio/lobby/trail/schema modules: ${hits.join(' | ')}`,
    );
  }
});

function discoverAllAppRouterPageEntries(dir = path.join(FRONTEND_ROOT, 'app'), acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      discoverAllAppRouterPageEntries(full, acc);
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      acc.push(path.relative(FRONTEND_ROOT, full).replace(/\\/gu, '/'));
    }
  }
  return acc.sort();
}

test('(x) 100% of all 17/17 Next.js App Router UI page entries (plus layout and error.tsx) achieve ZERO synchronous reachability to katex, pako, Tex.tsx, and omml.ts', () => {
  const pageFiles = discoverAllAppRouterPageEntries();
  const uiRouteEntries = [...pageFiles, 'app/not-found.tsx', 'app/global-error.tsx'];
  assert.ok(
    uiRouteEntries.length >= 17,
    `Expected >= 17 App Router UI page entries (15 page.tsx + not-found.tsx + global-error.tsx), found ${uiRouteEntries.length}`,
  );

  const forbiddenLocal = ['components/math/Tex.tsx', 'lib/omml.ts'];
  const allGuardedEntries = [...uiRouteEntries, 'app/layout.tsx', 'app/error.tsx'];

  for (const entry of allGuardedEntries) {
    const closure = traceStaticValueClosure(entry);

    const localHits = forbiddenLocal
      .filter(target => closure.parentByModule.has(target))
      .map(target => closure.formatChainTo(target, closure.parentByModule.get(target)));
    assert.deepEqual(
      localHits,
      [],
      `${entry} synchronous static value-import closure must never reach Tex.tsx or omml.ts: ${localHits.join(' | ')}`,
    );

    const pkgHits = [...closure.externalPackages.entries()]
      .filter(([spec]) => /^(?:katex|pako)(?:\/|$)/u.test(spec))
      .map(([spec, from]) => closure.formatChainTo(spec, from));
    assert.deepEqual(
      pkgHits,
      [],
      `${entry} synchronous static value-import closure must never reach katex or pako: ${pkgHits.join(' | ')}`,
    );
  }
});
