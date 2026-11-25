import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const scriptFile = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptFile), "..");

/**
 * Wave 17–29 measured uncompressed initial synchronous JS baselines (KB = KiB)
 * and Wave 30 17-route (100.0% of all Next.js App Router UI page entries, 16/17 sub-1MB, /agent < 1.7 MB)
 * anti-regression upper budgets enforced in CI / post-build verification:
 *   - /_global-error: < 760.0 KB
 *   - /knowledge & /invites: < 800.0 KB
 *   - /preflight: < 810.0 KB
 *   - /, /explore, /chronicle, /examples/bank-marketing, /projects/[projectId]: < 820.0 KB
 *   - /s/[token]: < 850.0 KB
 *   - /agent/workspace: < 880.0 KB
 *   - /workspace: < 975.0 KB
 *   - /login, /services, /projects, /_not-found: < 1050.0 KB
 *   - /agent workstation: < 1700.0 KB
 */
const ROUTE_SPECS = [
  { route: "/", appKey: "/page", htmlFile: "index.html", crmFile: "page_client-reference-manifest.js", baselineRawKb: 6389.0, wave18BaselineRawKb: 831.8, wave19BaselineRawKb: 831.9, wave20BaselineRawKb: 831.9, wave21BaselineRawKb: 832.3, wave22BaselineRawKb: 835.4, wave23BaselineRawKb: 837.7, wave24BaselineRawKb: 838.2, wave25BaselineRawKb: 838.5, wave26BaselineRawKb: 839.1, wave27BaselineRawKb: 839.2, wave28BaselineRawKb: 839.2, wave29BaselineRawKb: 803.5, budgetRawKb: 820.0 },
  { route: "/login", appKey: "/login/page", htmlFile: "login.html", crmFile: "login/page_client-reference-manifest.js", baselineRawKb: 6348.5, wave18BaselineRawKb: 704.8, wave19BaselineRawKb: 704.8, wave20BaselineRawKb: 704.9, wave21BaselineRawKb: 705.3, wave22BaselineRawKb: 708.3, wave23BaselineRawKb: 710.7, wave24BaselineRawKb: 710.8, wave25BaselineRawKb: 711.1, wave26BaselineRawKb: 711.7, wave27BaselineRawKb: 711.9, wave28BaselineRawKb: 711.8, wave29BaselineRawKb: 711.5, budgetRawKb: 1050.0 },
  { route: "/explore", appKey: "/explore/page", htmlFile: "explore.html", crmFile: "explore/page_client-reference-manifest.js", baselineRawKb: 6579.8, wave18BaselineRawKb: 972.9, wave19BaselineRawKb: 973.0, wave20BaselineRawKb: 973.0, wave21BaselineRawKb: 973.4, wave22BaselineRawKb: 976.3, wave23BaselineRawKb: 978.6, wave24BaselineRawKb: 980.0, wave25BaselineRawKb: 980.3, wave26BaselineRawKb: 980.9, wave27BaselineRawKb: 981.0, wave28BaselineRawKb: 750.5, wave29BaselineRawKb: 750.2, budgetRawKb: 820.0 },
  { route: "/services", appKey: "/services/page", htmlFile: "services.html", crmFile: "services/page_client-reference-manifest.js", baselineRawKb: 6354.4, wave18BaselineRawKb: 731.8, wave19BaselineRawKb: 731.8, wave20BaselineRawKb: 731.9, wave21BaselineRawKb: 732.2, wave22BaselineRawKb: 735.1, wave23BaselineRawKb: 737.5, wave24BaselineRawKb: 737.6, wave25BaselineRawKb: 737.9, wave26BaselineRawKb: 738.5, wave27BaselineRawKb: 738.6, wave28BaselineRawKb: 738.6, wave29BaselineRawKb: 738.3, budgetRawKb: 1050.0 },
  { route: "/projects", appKey: "/projects/page", htmlFile: "projects.html", crmFile: "projects/page_client-reference-manifest.js", baselineRawKb: 6326.8, wave18BaselineRawKb: 704.2, wave19BaselineRawKb: 704.2, wave20BaselineRawKb: 704.3, wave21BaselineRawKb: 704.7, wave22BaselineRawKb: 707.7, wave23BaselineRawKb: 710.1, wave24BaselineRawKb: 710.2, wave25BaselineRawKb: 710.5, wave26BaselineRawKb: 711.1, wave27BaselineRawKb: 711.3, wave28BaselineRawKb: 711.2, wave29BaselineRawKb: 710.9, budgetRawKb: 1050.0 },
  { route: "/projects/[projectId]", appKey: "/projects/[projectId]/page", htmlFile: null, crmFile: "projects/[projectId]/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: null, wave29BaselineRawKb: 1913.0, budgetRawKb: 820.0 },
  { route: "/knowledge", appKey: "/knowledge/page", htmlFile: "knowledge.html", crmFile: "knowledge/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: 1458.3, wave22BaselineRawKb: 1461.4, wave23BaselineRawKb: 1205.7, wave24BaselineRawKb: 715.3, wave25BaselineRawKb: 715.6, wave26BaselineRawKb: 716.2, wave27BaselineRawKb: 716.3, wave28BaselineRawKb: 716.3, wave29BaselineRawKb: 715.9, budgetRawKb: 800.0 },
  { route: "/preflight", appKey: "/preflight/page", htmlFile: "preflight.html", crmFile: "preflight/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: 898.9, wave22BaselineRawKb: 901.9, wave23BaselineRawKb: 904.3, wave24BaselineRawKb: 904.4, wave25BaselineRawKb: 904.8, wave26BaselineRawKb: 905.4, wave27BaselineRawKb: 905.5, wave28BaselineRawKb: 905.5, wave29BaselineRawKb: 720.2, budgetRawKb: 810.0 },
  { route: "/chronicle", appKey: "/chronicle/page", htmlFile: "chronicle.html", crmFile: "chronicle/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: 739.6, wave29BaselineRawKb: 739.2, budgetRawKb: 820.0 },
  { route: "/invites", appKey: "/invites/page", htmlFile: "invites.html", crmFile: "invites/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: 712.1, wave29BaselineRawKb: 711.8, budgetRawKb: 800.0 },
  { route: "/examples/bank-marketing", appKey: "/examples/bank-marketing/page", htmlFile: "examples/bank-marketing.html", crmFile: "examples/bank-marketing/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: 6080.6, wave29BaselineRawKb: 700.3, budgetRawKb: 820.0 },
  { route: "/s/[token]", appKey: "/s/[token]/page", htmlFile: null, crmFile: "s/[token]/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: null, wave29BaselineRawKb: 738.0, budgetRawKb: 850.0 },
  { route: "/_not-found", appKey: "/_not-found/page", htmlFile: "_not-found.html", crmFile: "_not-found/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: 689.8, wave22BaselineRawKb: 692.8, wave23BaselineRawKb: 695.2, wave24BaselineRawKb: 695.3, wave25BaselineRawKb: 695.6, wave26BaselineRawKb: 696.2, wave27BaselineRawKb: 696.3, wave28BaselineRawKb: 696.3, wave29BaselineRawKb: 695.9, budgetRawKb: 1050.0 },
  { route: "/_global-error", appKey: "/_global-error/page", htmlFile: "_global-error.html", crmFile: "_global-error/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: null, wave29BaselineRawKb: 567.5, budgetRawKb: 760.0 },
  { route: "/agent/workspace", appKey: "/agent/workspace/page", htmlFile: "agent/workspace.html", crmFile: "agent/workspace/page_client-reference-manifest.js", baselineRawKb: null, wave18BaselineRawKb: null, wave19BaselineRawKb: null, wave20BaselineRawKb: null, wave21BaselineRawKb: null, wave22BaselineRawKb: null, wave23BaselineRawKb: null, wave24BaselineRawKb: null, wave25BaselineRawKb: null, wave26BaselineRawKb: null, wave27BaselineRawKb: null, wave28BaselineRawKb: 804.0, wave29BaselineRawKb: 803.7, budgetRawKb: 880.0 },
  { route: "/workspace", appKey: "/workspace/page", htmlFile: "workspace.html", crmFile: "workspace/page_client-reference-manifest.js", baselineRawKb: 6620.7, wave18BaselineRawKb: 2139.7, wave19BaselineRawKb: 2139.7, wave20BaselineRawKb: 2037.2, wave21BaselineRawKb: 1089.7, wave22BaselineRawKb: 1092.7, wave23BaselineRawKb: 1095.1, wave24BaselineRawKb: 1063.2, wave25BaselineRawKb: 1051.4, wave26BaselineRawKb: 990.0, wave27BaselineRawKb: 956.6, wave28BaselineRawKb: 956.6, wave29BaselineRawKb: 956.2, budgetRawKb: 975.0 },
  { route: "/agent", appKey: "/agent/page", htmlFile: "agent.html", crmFile: "agent/page_client-reference-manifest.js", baselineRawKb: 9135.6, wave18BaselineRawKb: 6731.3, wave19BaselineRawKb: 6589.0, wave20BaselineRawKb: 6509.1, wave21BaselineRawKb: 2445.4, wave22BaselineRawKb: 2448.6, wave23BaselineRawKb: 2147.7, wave24BaselineRawKb: 2045.6, wave25BaselineRawKb: 1878.6, wave26BaselineRawKb: 1823.5, wave27BaselineRawKb: 1793.0, wave28BaselineRawKb: 1745.6, wave29BaselineRawKb: 1732.5, budgetRawKb: 1700.0 },
];

function parseArgs(argv) {
  let nextDir = path.resolve(appRoot, ".next");
  let reportOnly = false;
  let selfTest = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--report-only") {
      reportOnly = true;
    } else if (arg === "--self-test") {
      selfTest = true;
    } else if (arg === "--next-dir" && argv[i + 1]) {
      nextDir = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return { nextDir, reportOnly, selfTest };
}

function makeSyntheticNextFixture(sizesKb, extraUntrackedCrm = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evix-bundle-budget-selftest-"));
  const chunksDir = path.join(dir, "static", "chunks");
  const serverAppDir = path.join(dir, "server", "app");
  fs.mkdirSync(chunksDir, { recursive: true });
  fs.mkdirSync(serverAppDir, { recursive: true });

  const sharedRel = "static/chunks/main-shared.js";
  fs.writeFileSync(path.join(dir, sharedRel), "x".repeat(200 * 1024));
  fs.writeFileSync(
    path.join(dir, "build-manifest.json"),
    JSON.stringify({ polyfillFiles: [], rootMainFiles: [sharedRel], pages: {} }),
  );

  for (const spec of ROUTE_SPECS) {
    const totalKb = sizesKb[spec.route];
    const pageBytes = Math.max(1024, Math.round((totalKb - 200) * 1024));
    const crmDir = path.dirname(spec.crmFile);
    const chunkSubdir = crmDir === "." ? "app" : `app/${crmDir}`;
    const diskChunkRel = `static/chunks/${chunkSubdir}/page-test.js`;
    const diskChunkFull = path.join(dir, diskChunkRel);
    fs.mkdirSync(path.dirname(diskChunkFull), { recursive: true });
    fs.writeFileSync(diskChunkFull, "a".repeat(pageBytes));

    // Next.js URL-encodes dynamic bracket segments ([projectId], [token]) in manifest chunk URLs.
    const encodedChunkRel = diskChunkRel
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");

    const crmOutPath = path.join(serverAppDir, spec.crmFile);
    fs.mkdirSync(path.dirname(crmOutPath), { recursive: true });
    const crmPayload = {
      clientModules: {
        [`synthetic:${spec.appKey}`]: {
          id: spec.appKey,
          name: "*",
          chunks: [encodedChunkRel],
          async: false,
        },
      },
    };
    fs.writeFileSync(
      crmOutPath,
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(spec.appKey)}]=${JSON.stringify(crmPayload)};\n`,
    );

    if (spec.htmlFile) {
      const htmlOutPath = path.join(serverAppDir, spec.htmlFile);
      fs.mkdirSync(path.dirname(htmlOutPath), { recursive: true });
      fs.writeFileSync(
        htmlOutPath,
        `<!doctype html><html><head><script src="/_next/${sharedRel}"></script><script src="/_next/${encodedChunkRel}"></script></head><body></body></html>`,
      );
    }
  }

  if (extraUntrackedCrm) {
    const roguePath = path.join(serverAppDir, "rogue-untracked", "page_client-reference-manifest.js");
    fs.mkdirSync(path.dirname(roguePath), { recursive: true });
    fs.writeFileSync(roguePath, "globalThis.__RSC_MANIFEST={};\n");
  }

  return dir;
}

function runSelfTest() {
  const passSizes = {
    "/": 803.5,
    "/login": 711.5,
    "/explore": 750.2,
    "/services": 738.3,
    "/projects": 710.9,
    "/projects/[projectId]": 712.0,
    "/knowledge": 715.9,
    "/preflight": 720.2,
    "/chronicle": 739.2,
    "/invites": 711.8,
    "/examples/bank-marketing": 700.3,
    "/s/[token]": 738.0,
    "/_not-found": 695.9,
    "/_global-error": 567.5,
    "/agent/workspace": 803.7,
    "/workspace": 956.2,
    "/agent": 1665.0,
  };
  const passDir = makeSyntheticNextFixture(passSizes, false);
  const failDir = makeSyntheticNextFixture(
    {
      ...passSizes,
      "/projects/[projectId]": 1913.0,
      "/s/[token]": 890.0,
      "/_global-error": 790.0,
      "/agent": 1732.5,
    },
    true,
  );
  try {
    const passOut = JSON.parse(
      execFileSync(process.execPath, [scriptFile, "--next-dir", passDir], { encoding: "utf8" }),
    );
    assert.equal(passOut.status, "pass");
    assert.equal(passOut.enforced, true);
    assert.equal(passOut.routeCount, 17);
    assert.equal(passOut.wave17BenchmarkedRouteCount, 7);
    assert.equal(passOut.crmCoverage.complete, true);
    assert.equal(passOut.crmCoverage.expectedCount, 17);
    assert.equal(passOut.crmCoverage.discoveredCount, 17);
    assert.equal(passOut.violations.length, 0);

    const failRes = spawnSync(process.execPath, [scriptFile, "--next-dir", failDir], { encoding: "utf8" });
    assert.equal(failRes.status, 1);
    const failOut = JSON.parse(failRes.stdout);
    assert.equal(failOut.status, "fail");
    assert.equal(failOut.crmCoverage.complete, false);
    assert.deepEqual(failOut.crmCoverage.untrackedPageCrms, [
      "rogue-untracked/page_client-reference-manifest.js",
    ]);
    assert.deepEqual(
      failOut.violations.map((v) => v.route),
      ["/projects/[projectId]", "/s/[token]", "/_global-error", "/agent", "__crm_coverage_invariant__"],
    );
    console.log(
      JSON.stringify(
        {
          status: "pass",
          mode: "self-test",
          routeCount: 17,
          crmCoverageComplete: true,
          sixteenOfSeventeenSub1Mb: true,
          projectDetailBudgetRawKb: 820.0,
          publicSurveyBudgetRawKb: 850.0,
          globalErrorBudgetRawKb: 760.0,
          agentBudgetRawKb: 1700.0,
        },
        null,
        2,
      ),
    );
  } finally {
    fs.rmSync(passDir, { recursive: true, force: true });
    fs.rmSync(failDir, { recursive: true, force: true });
  }
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeChunkRel(raw) {
  if (typeof raw !== "string") return "";
  const stripped = raw.replace(/^\/?_next\//, "").replace(/^\/+/, "").split("?")[0];
  let clean = stripped;
  try {
    clean = decodeURIComponent(stripped);
  } catch {
    clean = stripped;
  }
  return clean.startsWith("static/") && clean.endsWith(".js") ? clean : "";
}

function extractHtmlSyncScripts(htmlPath) {
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, "utf8");
  const scripts = [];
  const seen = new Set();
  const scriptRe = /<script\b[^>]*\bsrc=["']\/_next\/(static\/[^"'<>]+\.js)["'][^>]*>/gi;
  let match = scriptRe.exec(html);
  while (match !== null) {
    const rel = normalizeChunkRel(match[1]);
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      scripts.push(rel);
    }
    match = scriptRe.exec(html);
  }
  return scripts.length > 0 ? scripts : null;
}

function extractClientRefManifestChunks(crmPath, appKey) {
  if (!fs.existsSync(crmPath)) return null;
  const raw = fs.readFileSync(crmPath, "utf8");
  const assignMatch = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(raw);
  if (!assignMatch) return null;
  const parsed = JSON.parse(assignMatch[1]);
  const chunks = [];
  const seen = new Set();

  if (parsed && typeof parsed.entryJSFiles === "object" && parsed.entryJSFiles !== null) {
    for (const list of Object.values(parsed.entryJSFiles)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const rel = normalizeChunkRel(item);
        if (rel && !seen.has(rel)) {
          seen.add(rel);
          chunks.push(rel);
        }
      }
    }
  }

  if (parsed && typeof parsed.clientModules === "object" && parsed.clientModules !== null) {
    for (const mod of Object.values(parsed.clientModules)) {
      if (!mod || typeof mod !== "object" || mod.async !== false || !Array.isArray(mod.chunks)) {
        continue;
      }
      const normalized = mod.chunks.map(normalizeChunkRel).filter(Boolean);
      // Exclude inherited root `/` sibling entry (`app/page-*.js`) when measuring non-root subroutes.
      if (
        appKey !== "/page" &&
        normalized.some((rel) => /^static\/chunks\/app\/page-[^/]+\.js$/.test(rel))
      ) {
        continue;
      }
      for (const rel of normalized) {
        if (!seen.has(rel)) {
          seen.add(rel);
          chunks.push(rel);
        }
      }
    }
  }
  return chunks.length > 0 ? chunks : null;
}

function discoverPageClientRefManifests(serverAppRoot) {
  const discovered = [];
  if (!fs.existsSync(serverAppRoot)) return discovered;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.name === "page_client-reference-manifest.js") {
        discovered.push(path.relative(serverAppRoot, full).replace(/\\/g, "/"));
      }
    }
  }
  walk(serverAppRoot);
  return discovered.sort();
}

function resolveRouteChunks(spec, nextDir, buildManifest, appBuildManifest) {
  const ordered = [];
  const seen = new Set();
  const pushAll = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const rel = normalizeChunkRel(item);
      if (rel && !seen.has(rel)) {
        seen.add(rel);
        ordered.push(rel);
      }
    }
  };

  // 1. Prerendered App Router HTML reflects exact initial <script> tags delivered on first paint.
  if (spec.htmlFile) {
    const htmlPath = path.join(nextDir, "server", "app", spec.htmlFile);
    const htmlScripts = extractHtmlSyncScripts(htmlPath);
    if (htmlScripts) {
      pushAll(buildManifest.rootMainFiles);
      pushAll(htmlScripts);
      return { source: "prerendered-html+build-manifest", chunks: ordered };
    }
  }

  // 2. Classic / custom .next/app-build-manifest.json + .next/build-manifest.json.
  const appPages = appBuildManifest && typeof appBuildManifest.pages === "object" ? appBuildManifest.pages : null;
  if (appPages && Array.isArray(appPages[spec.appKey])) {
    pushAll(buildManifest.polyfillFiles);
    pushAll(buildManifest.rootMainFiles);
    pushAll(appPages[spec.appKey]);
    return { source: "app-build-manifest+build-manifest", chunks: ordered };
  }

  // 3. Next.js 16 dynamic SSR route resolution via page_client-reference-manifest.js + build-manifest.json.
  const crmPath = path.join(nextDir, "server", "app", spec.crmFile);
  const crmChunks = extractClientRefManifestChunks(crmPath, spec.appKey);
  if (crmChunks) {
    pushAll(buildManifest.polyfillFiles);
    pushAll(buildManifest.rootMainFiles);
    pushAll(crmChunks);
    return { source: "client-reference-manifest+build-manifest", chunks: ordered };
  }

  // 4. Pages-router fallback in build-manifest.json if present.
  const pagesMap = buildManifest && typeof buildManifest.pages === "object" ? buildManifest.pages : null;
  if (pagesMap && Array.isArray(pagesMap[spec.route])) {
    pushAll(buildManifest.polyfillFiles);
    pushAll(buildManifest.rootMainFiles);
    pushAll(pagesMap[spec.route]);
    return { source: "build-manifest-pages", chunks: ordered };
  }

  throw new Error(`Unable to resolve initial JS chunks for route "${spec.route}" in ${nextDir}`);
}

const { nextDir, reportOnly, selfTest } = parseArgs(process.argv.slice(2));
if (selfTest) {
  runSelfTest();
  process.exit(0);
}
const buildManifestPath = path.join(nextDir, "build-manifest.json");
if (!fs.existsSync(buildManifestPath)) {
  console.error(
    JSON.stringify(
      {
        status: "error",
        code: "missing_build_manifest",
        message: "Next.js build-manifest.json is unavailable; run npm run build first.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const buildManifest = readJsonIfExists(buildManifestPath);
const appBuildManifest =
  readJsonIfExists(path.join(nextDir, "app-build-manifest.json")) ??
  readJsonIfExists(path.join(nextDir, "server", "app-build-manifest.json"));

const sizeCache = new Map();
function measureChunk(relPath) {
  const cached = sizeCache.get(relPath);
  if (cached) return cached;
  const fullPath = path.join(nextDir, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Referenced JS chunk missing on disk: ${relPath}`);
  }
  const buf = fs.readFileSync(fullPath);
  const gz = zlib.gzipSync(buf, { level: 9 });
  const metrics = {
    chunk: relPath,
    rawBytes: buf.byteLength,
    gzipBytes: gz.byteLength,
  };
  sizeCache.set(relPath, metrics);
  return metrics;
}

const routeReports = [];
const violations = [];

for (const spec of ROUTE_SPECS) {
  const { source, chunks } = resolveRouteChunks(spec, nextDir, buildManifest, appBuildManifest);
  const measured = chunks.map(measureChunk);
  const rawBytes = measured.reduce((acc, item) => acc + item.rawBytes, 0);
  const gzipBytes = measured.reduce((acc, item) => acc + item.gzipBytes, 0);
  const rawKb = Number((rawBytes / 1024).toFixed(1));
  const gzipKb = Number((gzipBytes / 1024).toFixed(1));
  const deltaKb = spec.baselineRawKb !== null ? Number((rawKb - spec.baselineRawKb).toFixed(1)) : null;
  const deltaVsWave18Kb = spec.wave18BaselineRawKb !== null ? Number((rawKb - spec.wave18BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave19Kb = spec.wave19BaselineRawKb !== null ? Number((rawKb - spec.wave19BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave20Kb = spec.wave20BaselineRawKb !== null ? Number((rawKb - spec.wave20BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave21Kb = spec.wave21BaselineRawKb !== null ? Number((rawKb - spec.wave21BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave22Kb = spec.wave22BaselineRawKb !== null ? Number((rawKb - spec.wave22BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave23Kb = spec.wave23BaselineRawKb !== null ? Number((rawKb - spec.wave23BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave24Kb = spec.wave24BaselineRawKb !== null ? Number((rawKb - spec.wave24BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave25Kb = spec.wave25BaselineRawKb !== null ? Number((rawKb - spec.wave25BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave26Kb = spec.wave26BaselineRawKb !== null ? Number((rawKb - spec.wave26BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave27Kb = spec.wave27BaselineRawKb !== null ? Number((rawKb - spec.wave27BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave28Kb = spec.wave28BaselineRawKb !== null ? Number((rawKb - spec.wave28BaselineRawKb).toFixed(1)) : null;
  const deltaVsWave29Kb = spec.wave29BaselineRawKb !== null ? Number((rawKb - spec.wave29BaselineRawKb).toFixed(1)) : null;
  const reductionPct =
    spec.baselineRawKb !== null ? Number((((spec.baselineRawKb - rawKb) / spec.baselineRawKb) * 100).toFixed(2)) : null;
  const withinBudget = rawKb < spec.budgetRawKb;

  const topChunks = [...measured]
    .sort((a, b) => b.rawBytes - a.rawBytes)
    .slice(0, 3)
    .map((c) => ({
      chunk: c.chunk,
      rawKb: Number((c.rawBytes / 1024).toFixed(1)),
      gzipKb: Number((c.gzipBytes / 1024).toFixed(1)),
    }));

  const entry = {
    route: spec.route,
    manifestSource: source,
    chunkCount: chunks.length,
    rawBytes,
    rawKb,
    gzipBytes,
    gzipKb,
    wave17BaselineRawKb: spec.baselineRawKb,
    wave18BaselineRawKb: spec.wave18BaselineRawKb,
    wave19BaselineRawKb: spec.wave19BaselineRawKb,
    wave20BaselineRawKb: spec.wave20BaselineRawKb,
    wave21BaselineRawKb: spec.wave21BaselineRawKb,
    wave22BaselineRawKb: spec.wave22BaselineRawKb,
    wave23BaselineRawKb: spec.wave23BaselineRawKb,
    wave24BaselineRawKb: spec.wave24BaselineRawKb,
    wave25BaselineRawKb: spec.wave25BaselineRawKb,
    wave26BaselineRawKb: spec.wave26BaselineRawKb,
    wave27BaselineRawKb: spec.wave27BaselineRawKb,
    wave28BaselineRawKb: spec.wave28BaselineRawKb,
    wave29BaselineRawKb: spec.wave29BaselineRawKb,
    deltaKb,
    deltaVsWave18Kb,
    deltaVsWave19Kb,
    deltaVsWave20Kb,
    deltaVsWave21Kb,
    deltaVsWave22Kb,
    deltaVsWave23Kb,
    deltaVsWave24Kb,
    deltaVsWave25Kb,
    deltaVsWave26Kb,
    deltaVsWave27Kb,
    deltaVsWave28Kb,
    deltaVsWave29Kb,
    reductionPct,
    budgetRawKb: spec.budgetRawKb,
    withinBudget,
    topChunks,
  };
  routeReports.push(entry);

  if (!withinBudget) {
    violations.push({
      route: spec.route,
      rawKb,
      budgetRawKb: spec.budgetRawKb,
      excessKb: Number((rawKb - spec.budgetRawKb).toFixed(1)),
    });
  }
}

const serverAppRoot = path.join(nextDir, "server", "app");
const configuredCrmSet = new Set(ROUTE_SPECS.map((s) => s.crmFile));
const discoveredPageCrms = discoverPageClientRefManifests(serverAppRoot);
const discoveredCrmSet = new Set(discoveredPageCrms);
const untrackedPageCrms = discoveredPageCrms.filter((rel) => !configuredCrmSet.has(rel));
const missingPageCrms = [...configuredCrmSet].filter((rel) => !discoveredCrmSet.has(rel)).sort();
const crmCoverageComplete = untrackedPageCrms.length === 0 && missingPageCrms.length === 0;

if (!crmCoverageComplete) {
  violations.push({
    route: "__crm_coverage_invariant__",
    untrackedPageCrms,
    missingPageCrms,
  });
}

const wave17Benchmarked = routeReports.filter((r) => typeof r.reductionPct === "number");
const avgReductionPct = Number(
  (wave17Benchmarked.reduce((acc, r) => acc + r.reductionPct, 0) / wave17Benchmarked.length).toFixed(2),
);

const summary = {
  status: violations.length === 0 ? "pass" : "fail",
  enforced: !reportOnly,
  routeCount: routeReports.length,
  sixteenOfSeventeenSub1Mb: routeReports.filter((r) => r.rawKb < 1000.0).length >= 16,
  crmCoverage: {
    complete: crmCoverageComplete,
    expectedCount: configuredCrmSet.size,
    discoveredCount: discoveredPageCrms.length,
    untrackedPageCrms,
    missingPageCrms,
  },
  wave17BenchmarkedRouteCount: wave17Benchmarked.length,
  uniqueChunksMeasured: sizeCache.size,
  averageReductionVsWave17Pct: avgReductionPct,
  routes: routeReports,
  violations,
};

console.log(JSON.stringify(summary, null, 2));

if (!reportOnly && violations.length > 0) {
  process.exit(1);
}
