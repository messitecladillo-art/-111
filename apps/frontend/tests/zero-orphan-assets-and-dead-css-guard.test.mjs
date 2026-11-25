import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..', '..');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function toRelPosix(fullPath) {
  return path.relative(FRONTEND_ROOT, fullPath).replace(/\\/gu, '/');
}

function resolveCssModuleSpecifier(fromRelFile, specifier) {
  if (!specifier.endsWith('.module.css')) return null;
  if (specifier.startsWith('@/')) {
    return path.posix.normalize(specifier.slice(2));
  }
  if (specifier.startsWith('.')) {
    const fromDir = path.posix.dirname(fromRelFile);
    return path.posix.normalize(path.posix.join(fromDir, specifier));
  }
  return null;
}

function collectImportsAndArtFromTsSource(relFile, sourceText) {
  const kind = relFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(relFile, sourceText, ts.ScriptTarget.Latest, true, kind);
  const cssImports = new Set();
  const artPaths = new Set();

  function recordArtCandidate(rawText) {
    for (const match of rawText.matchAll(/\/art\/[A-Za-z0-9._/-]+\.(?:png|jpg|jpeg|webp|svg|gif)/gu)) {
      artPaths.add(match[0]);
    }
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const resolved = resolveCssModuleSpecifier(relFile, node.moduleSpecifier.text);
      if (resolved) cssImports.add(resolved);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const resolved = resolveCssModuleSpecifier(relFile, node.arguments[0].text);
      if (resolved) cssImports.add(resolved);
    }

    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      recordArtCandidate(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { cssImports, artPaths };
}

test('self-test: AST CSS module resolver and /art/ asset detector accurately resolve relative and @/ specifiers', () => {
  const sample = [
    "import styles from './Panel.module.css';",
    "import shellStyles from '@/components/agent/AgentShell.module.css';",
    "const lazyCss = () => import('../shared/Card.module.css');",
    "const cover = '/art/cover-silver-illustrated.png';",
    'const cand = `/art/candidates/cover-cand-a.png`;',
  ].join('\n');

  const { cssImports, artPaths } = collectImportsAndArtFromTsSource('components/editors/Panel.tsx', sample);
  assert.deepEqual(
    [...cssImports].sort(),
    [
      'components/agent/AgentShell.module.css',
      'components/editors/Panel.module.css',
      'components/shared/Card.module.css',
    ],
  );
  assert.deepEqual(
    [...artPaths].sort(),
    ['/art/candidates/cover-cand-a.png', '/art/cover-silver-illustrated.png'],
  );
});

test('100% of .module.css files under app/ and components/ are explicitly imported by production .ts/.tsx modules (zero dead CSS)', () => {
  for (const removedOrphan of [
    'components/AgentServiceStudio.module.css',
    'components/agent/WorkflowTaskPanel.module.css',
  ]) {
    assert.equal(
      fs.existsSync(path.join(FRONTEND_ROOT, removedOrphan)),
      false,
      `Historical orphan stylesheet must stay deleted: ${removedOrphan}`,
    );
  }

  const allCssModules = [
    ...walkFiles(path.join(FRONTEND_ROOT, 'app')),
    ...walkFiles(path.join(FRONTEND_ROOT, 'components')),
  ]
    .filter(fullPath => fullPath.endsWith('.module.css'))
    .map(toRelPosix)
    .sort();

  assert.ok(
    allCssModules.length >= 100,
    `Expected >= 100 active .module.css stylesheets under app/ and components/, found ${allCssModules.length}`,
  );

  const prodCodeFiles = [
    ...walkFiles(path.join(FRONTEND_ROOT, 'app')),
    ...walkFiles(path.join(FRONTEND_ROOT, 'components')),
    ...walkFiles(path.join(FRONTEND_ROOT, 'lib')),
  ].filter(fullPath => /\.(?:ts|tsx)$/u.test(fullPath));

  const importedCssModules = new Set();
  for (const fullPath of prodCodeFiles) {
    const relPath = toRelPosix(fullPath);
    const src = fs.readFileSync(fullPath, 'utf8');
    const { cssImports } = collectImportsAndArtFromTsSource(relPath, src);
    for (const cssRel of cssImports) {
      importedCssModules.add(cssRel);
    }
  }

  const orphanModules = allCssModules.filter(cssRel => !importedCssModules.has(cssRel));
  assert.deepEqual(
    orphanModules,
    [],
    `Every .module.css under app/ and components/ must be imported by at least one production .ts/.tsx module. Orphans: ${orphanModules.join(', ')}`,
  );
});

test('100% of /art/... static image references across app/, components/, lib/, and data/ exist and are non-empty in public/art/', () => {
  const sourceRoots = ['app', 'components', 'lib', 'data'];
  const referencedArt = new Map();

  for (const rootName of sourceRoots) {
    for (const fullPath of walkFiles(path.join(FRONTEND_ROOT, rootName))) {
      const relFile = toRelPosix(fullPath);
      if (/\.(?:ts|tsx)$/u.test(fullPath)) {
        const { artPaths } = collectImportsAndArtFromTsSource(relFile, fs.readFileSync(fullPath, 'utf8'));
        for (const artUrl of artPaths) {
          if (!referencedArt.has(artUrl)) referencedArt.set(artUrl, []);
          referencedArt.get(artUrl).push(relFile);
        }
      } else if (/\.(?:css|json)$/u.test(fullPath)) {
        const raw = fs.readFileSync(fullPath, 'utf8');
        for (const match of raw.matchAll(/\/art\/[A-Za-z0-9._/-]+\.(?:png|jpg|jpeg|webp|svg|gif)/gu)) {
          const artUrl = match[0];
          if (!referencedArt.has(artUrl)) referencedArt.set(artUrl, []);
          referencedArt.get(artUrl).push(relFile);
        }
      }
    }
  }

  assert.ok(
    referencedArt.size >= 30,
    `Expected >= 30 referenced /art/... static assets across frontend source/data, found ${referencedArt.size}`,
  );

  const publicArtRoot = path.resolve(FRONTEND_ROOT, 'public', 'art');
  const brokenAssets = [];

  for (const [artUrl, callers] of [...referencedArt.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const diskPath = path.resolve(FRONTEND_ROOT, 'public', artUrl.slice(1));
    if (!diskPath.startsWith(publicArtRoot + path.sep)) {
      brokenAssets.push(`${artUrl} (escaped public/art boundary, referenced in ${callers[0]})`);
      continue;
    }
    if (!fs.existsSync(diskPath) || !fs.statSync(diskPath).isFile()) {
      brokenAssets.push(`${artUrl} (missing file on disk, referenced in ${callers.join(', ')})`);
      continue;
    }
    const stat = fs.statSync(diskPath);
    if (stat.size <= 0) {
      brokenAssets.push(`${artUrl} (0-byte empty file, referenced in ${callers.join(', ')})`);
      continue;
    }
    if (artUrl.toLowerCase().endsWith('.png')) {
      const fd = fs.openSync(diskPath, 'r');
      const header = Buffer.alloc(8);
      try {
        fs.readSync(fd, header, 0, 8, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (!header.equals(PNG_MAGIC)) {
        brokenAssets.push(`${artUrl} (invalid PNG header signature, referenced in ${callers[0]})`);
      }
    }
  }

  assert.deepEqual(
    brokenAssets,
    [],
    `Broken or missing /art/... static assets detected: ${brokenAssets.join(' | ')}`,
  );
});

test('app/, components/, lib/, data/, and public/art/ contain zero .bak/.orig/.tmp/.rej/.swp residual artifacts', () => {
  const strayPattern = /\.(?:bak|orig|tmp|rej|swp|swo)$|~$|^(?:Thumbs\.db|\.DS_Store)$/iu;
  const dirsToCheck = ['app', 'components', 'lib', 'data', path.join('public', 'art')];
  const strayFiles = [];

  for (const sub of dirsToCheck) {
    for (const fullPath of walkFiles(path.join(FRONTEND_ROOT, sub))) {
      const base = path.basename(fullPath);
      if (strayPattern.test(base)) {
        strayFiles.push(toRelPosix(fullPath));
      }
    }
  }

  assert.deepEqual(
    strayFiles,
    [],
    `Found residual backup/temp/reject files in production directories: ${strayFiles.join(', ')}`,
  );
});

const FRONTEND_PERMANENT_CI_GUARDS = [
  'apps/frontend/tests/ui-de-tech-and-typography-guard.test.mjs',
  'apps/frontend/tests/ui-accessibility-and-focus-guard.test.mjs',
  'apps/frontend/tests/bundle-lazy-boundary-guard.test.mjs',
  'apps/frontend/tests/css-responsive-and-motion-guard.test.mjs',
  'apps/frontend/tests/router-heavy-actions.test.mjs',
  'apps/frontend/tests/route-metadata-and-headers-guard.test.mjs',
  'apps/frontend/tests/print-media-and-pdf-hygiene-guard.test.mjs',
  'apps/frontend/tests/tex-lazy-and-global-boundaries.test.mjs',
  'apps/frontend/tests/statistical-symbol-spacing.test.mjs',
  'apps/frontend/tests/docx-and-pptx-export-hygiene-guard.test.mjs',
  'apps/frontend/tests/zero-orphan-assets-and-dead-css-guard.test.mjs',
  'apps/frontend/tests/latex-and-csv-export-hygiene-guard.test.mjs',
  'apps/frontend/tests/submission-preflight-and-anonymity-guard.test.mjs',
  'apps/frontend/tests/svg-chart-and-palette-hygiene-guard.test.mjs',
  'apps/frontend/tests/transcript-and-artifact-export-hygiene-guard.test.mjs',
  'apps/frontend/tests/nextjs-api-routes-security-and-hygiene-guard.test.mjs',
  'apps/frontend/tests/public-survey-and-collection-safety-guard.test.mjs',
  'apps/frontend/tests/report-benchmark-and-advisor-honesty-guard.test.mjs',
];

const BACKEND_PERMANENT_CI_GUARDS = [
  'apps/backend/tests/test_outbound_de_tech_and_prose_guard.py',
  'apps/backend/tests/test_api_error_hygiene.py',
  'apps/backend/tests/test_llm_error_hygiene.py',
  'apps/backend/tests/test_security_and_tenant_isolation_guard.py',
  'apps/backend/tests/test_public_art_assets_integrity.py',
  'apps/backend/tests/test_api_performance_headers.py',
  'apps/backend/tests/test_api_user_message_purity.py',
  'apps/backend/tests/test_protected_assets_sha256_guard.py',
  'apps/backend/tests/test_production_surface_lockdown.py',
  'apps/backend/tests/test_svg_and_latex_export_contracts.py',
  'apps/backend/tests/test_sse_and_streaming_hygiene.py',
  'apps/backend/tests/test_cross_stack_contract_parity.py',
  'apps/backend/tests/test_alembic_and_schema_integrity_guard.py',
  'apps/backend/tests/test_deterministic_seed_and_reproducibility.py',
  'apps/backend/tests/test_upload_and_archive_security_guard.py',
  'apps/backend/tests/test_idempotency_and_concurrency_guard.py',
  'apps/backend/tests/test_openapi_and_export_headers_guard.py',
  'apps/backend/tests/test_csrf_and_origin_enforcement_guard.py',
  'apps/backend/tests/test_audit_log_and_secret_redaction_guard.py',
  'apps/backend/tests/test_agent_tool_bus_and_hitl_guard.py',
  'apps/backend/tests/test_http_method_and_content_type_matrix_guard.py',
  'apps/backend/tests/test_epistemic_memory_and_grounding_guard.py',
  'apps/backend/tests/test_csv_formula_injection_and_export_safety_guard.py',
  'apps/backend/tests/test_team_rbac_and_invite_lifecycle_guard.py',
  'apps/backend/tests/test_plot_and_stat_sandbox_ast_security_guard.py',
  'apps/backend/tests/test_session_cookie_and_auth_lifecycle_guard.py',
  'apps/backend/tests/test_latex_and_report_compile_security_guard.py',
  'apps/backend/tests/test_model_services_and_ssrf_encryption_guard.py',
  'apps/backend/tests/test_questionnaires_and_proposals_integrity_guard.py',
  'apps/backend/tests/test_topics_and_topic_projects_security_guard.py',
  'apps/backend/tests/test_survey_runs_and_silicon_simulation_guard.py',
  'apps/backend/tests/test_knowledge_and_system_endpoints_guard.py',
];

function detectFocusOnlyLeaks(relPath, sourceText) {
  const leaks = [];
  if (relPath.endsWith('.mjs') || relPath.endsWith('.ts')) {
    const sf = ts.createSourceFile(relPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const runnerTargets = new Set(['test', 'describe', 'it']);
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'only' &&
        ts.isIdentifier(node.expression.expression) &&
        runnerTargets.has(node.expression.expression.text)
      ) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        leaks.push(`${relPath}:${line} (${node.expression.getText(sf)})`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } else {
    const stripped = sourceText
      .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/gu, '""')
      .replace(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gu, '""')
      .replace(/#[^\n]*/gu, '');
    const pyOnlyRe = /\b(?:pytest\.mark\.only|(?:test|describe|it)\.only\s*\()/gu;
    for (const match of stripped.matchAll(pyOnlyRe)) {
      leaks.push(`${relPath} (${match[0].trim()})`);
    }
  }
  return leaks;
}

test('50/50 permanent CI guard meta-registry lock (18 Frontend + 32 Backend): all 50 suites exist, >= 1,000 bytes, and zero .only focus traps', () => {
  // Self-check focus-leak detector on positive and comment-safe fixtures
  assert.equal(detectFocusOnlyLeaks('sample.mjs', '// comment about focused runner\ntest("ok", () => {});').length, 0);
  assert.equal(detectFocusOnlyLeaks('trap.mjs', ['test', '.only("leak", () => {});'].join('')).length, 1);
  assert.equal(detectFocusOnlyLeaks('trap2.mjs', ['describe', '.only("suite", () => {});'].join('')).length, 1);
  assert.equal(detectFocusOnlyLeaks('trap3.mjs', ['it', '.only("case", () => {});'].join('')).length, 1);
  assert.equal(detectFocusOnlyLeaks('trap.py', ['@pytest.mark', '.only\ndef test_x(): pass'].join('')).length, 1);

  assert.equal(FRONTEND_PERMANENT_CI_GUARDS.length, 18, 'Expected exact 18 Frontend Permanent CI Guards');
  assert.equal(BACKEND_PERMANENT_CI_GUARDS.length, 32, 'Expected exact 32 Backend Permanent CI Guards');

  const all50Guards = [...FRONTEND_PERMANENT_CI_GUARDS, ...BACKEND_PERMANENT_CI_GUARDS];
  assert.equal(new Set(all50Guards).size, 50, 'Expected exact 50 unique Permanent CI Guard files');

  const missingOrUndersized = [];
  const focusLeaks = [];

  for (const relPath of all50Guards) {
    const fullPath = path.join(REPO_ROOT, ...relPath.split('/'));
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      missingOrUndersized.push(`${relPath} (missing on disk)`);
      continue;
    }
    const size = fs.statSync(fullPath).size;
    if (size < 1000) {
      missingOrUndersized.push(`${relPath} (only ${size} bytes, expected >= 1,000 bytes)`);
    }
    const raw = fs.readFileSync(fullPath, 'utf8');
    focusLeaks.push(...detectFocusOnlyLeaks(relPath, raw));
  }

  assert.deepEqual(
    missingOrUndersized,
    [],
    `All 50/50 permanent CI guard suites must exist on disk and be >= 1,000 bytes: ${missingOrUndersized.join(', ')}`,
  );
  assert.deepEqual(
    focusLeaks,
    [],
    `Zero .only focus-leak traps allowed in any of the 50 permanent CI guard suites: ${focusLeaks.join(', ')}`,
  );
});
