import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const mode = process.argv[2];
if (!new Set(["--check", "--write"]).has(mode)) {
  throw new Error("Usage: node scripts/sync-rule-corpus.mjs --check|--write");
}

const appRoot = process.cwd();
const sourcePath = resolve(
  appRoot,
  "../../corpus-source/official-rules/edition16-undergrad-rules.json",
);
const snapshotPath = resolve(appRoot, "data/rule-corpus.snapshot.json");
const generatedPath = resolve(appRoot, "data/rule-corpus.generated.ts");
const sourceAvailable = await exists(sourcePath);

if (mode === "--write") {
  if (!sourceAvailable) {
    throw new Error("Canonical rule corpus is unavailable; refusing to regenerate from a packaged snapshot.");
  }
  const sourceRaw = await readFile(sourcePath, "utf8");
  const sourceDocument = JSON.parse(sourceRaw);
  validateRuleDocument(sourceDocument);
  const provenance = await verifyProvenance(sourceDocument);
  const snapshot = {
    contractId: "evi-x.rule-corpus",
    version: "1.0.0",
    source: {
      repositoryPath: "corpus-source/official-rules/edition16-undergrad-rules.json",
      rawSha256: sha256(sourceRaw),
      provenance,
    },
    ...sourceDocument,
  };
  validateSnapshot(snapshot);
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(generatedPath, renderGeneratedModule(snapshot), "utf8");
  console.log(
    `[rules] synchronized ${snapshot.rules.length} rules from ${snapshot.sources.length} source`,
  );
} else {
  const snapshotRaw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotRaw);
  validateSnapshot(snapshot);

  if (sourceAvailable) {
    const sourceRaw = await readFile(sourcePath, "utf8");
    const sourceDocument = JSON.parse(sourceRaw);
    validateRuleDocument(sourceDocument);
    if (sha256(sourceRaw) !== snapshot.source.rawSha256) {
      throw new Error("Canonical rule corpus hash drifted; run npm run rules:sync after review.");
    }
    if (JSON.stringify(sourceDocument) !== JSON.stringify(snapshotPayload(snapshot))) {
      throw new Error("Packaged rule snapshot no longer matches the canonical corpus.");
    }
    const provenance = await verifyProvenance(sourceDocument);
    if (JSON.stringify(provenance) !== JSON.stringify(snapshot.source.provenance)) {
      throw new Error("Rule-source provenance hash drifted; refresh the reviewed snapshot.");
    }
  }

  const generated = await readFile(generatedPath, "utf8");
  if (generated !== renderGeneratedModule(snapshot)) {
    throw new Error("Generated rule module is stale; run npm run rules:sync.");
  }
  console.log(
    `[rules] verified ${snapshot.rules.length} scoped rules; canonical source ${sourceAvailable ? "present" : "packaged"}`,
  );
}

function validateSnapshot(snapshot) {
  if (snapshot?.contractId !== "evi-x.rule-corpus" || major(snapshot.version) !== 1) {
    throw new Error("Unsupported rule corpus contract.");
  }
  if (!/^[0-9a-f]{64}$/.test(snapshot?.source?.rawSha256 ?? "")) {
    throw new Error("Rule corpus source hash is missing or invalid.");
  }
  validateRuleDocument(snapshot);
}

function validateRuleDocument(document) {
  if (!document?.snapshot || !Array.isArray(document.sources) || !Array.isArray(document.scopes) || !Array.isArray(document.rules)) {
    throw new Error("Rule corpus must contain snapshot, sources, scopes, and rules.");
  }
  for (const key of ["edition", "group", "region", "track", "stage", "verified_at"]) {
    if (typeof document.snapshot[key] !== "string" || !document.snapshot[key].trim()) {
      throw new Error(`Rule snapshot is missing ${key}.`);
    }
  }
  assertUnique(document.sources.map((item) => item.id), "source ids");
  assertUnique(document.scopes.map((item) => item.id), "scope ids");
  assertUnique(document.rules.map((item) => item.id), "rule ids");
  const sourceIds = new Set(document.sources.map((item) => item.id));
  const scopeIds = new Set(document.scopes.map((item) => item.id));
  for (const scope of document.scopes) {
    for (const dimension of ["edition", "group", "region", "track", "stage"]) {
      const selector = scope[dimension];
      if (!selector || !new Set(["all", "values"]).has(selector.mode)) {
        throw new Error(`Scope ${scope.id} has an invalid ${dimension} selector.`);
      }
      if (selector.mode === "values" && (!Array.isArray(selector.values) || selector.values.length === 0)) {
        throw new Error(`Scope ${scope.id} must enumerate ${dimension} values.`);
      }
    }
  }
  for (const rule of document.rules) {
    if (!scopeIds.has(rule.scope_id) || !sourceIds.has(rule.source_id)) {
      throw new Error(`Rule ${rule.id} references an unknown scope or source.`);
    }
    if (!new Set(["hard", "disqualifying"]).has(rule.severity)) {
      throw new Error(`Rule ${rule.id} has unsupported severity ${rule.severity}.`);
    }
    if (typeof rule.rule !== "string" || !rule.rule.trim()) {
      throw new Error(`Rule ${rule.id} has no rule text.`);
    }
  }
}

async function verifyProvenance(document) {
  const checks = [];
  for (const source of document.sources) {
    const repositoryPath = `corpus-source/official-rules/${source.id}-source.txt`;
    const localPath = resolve(appRoot, "../..", repositoryPath);
    if (!(await exists(localPath))) {
      throw new Error(`Missing provenance record for ${source.id}.`);
    }
    const raw = await readFile(localPath);
    const actual = sha256(raw);
    if (actual !== source.sha256) {
      throw new Error(`Provenance hash mismatch for ${source.id}.`);
    }
    checks.push({ id: source.id, repositoryPath, sha256: actual });
  }
  return checks;
}

function snapshotPayload(snapshot) {
  return {
    snapshot: snapshot.snapshot,
    sources: snapshot.sources,
    scopes: snapshot.scopes,
    rules: snapshot.rules,
  };
}

function renderGeneratedModule(snapshot) {
  return `// Generated by scripts/sync-rule-corpus.mjs. Do not edit manually.\n` +
    `export const RULE_CORPUS_META = ${json({
      contractId: snapshot.contractId,
      version: snapshot.version,
      sourceRawSha256: snapshot.source.rawSha256,
      provenance: snapshot.source.provenance,
      snapshot: snapshot.snapshot,
    })} as const;\n\n` +
    `export const RULE_SOURCES = ${json(snapshot.sources)} as const;\n\n` +
    `export const RULE_SCOPES = ${json(snapshot.scopes)} as const;\n\n` +
    `export const COMPETITION_RULES = ${json(snapshot.rules)} as const;\n`;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function major(version) {
  return Number.parseInt(String(version).split(".")[0], 10);
}

function assertUnique(values, label) {
  if (values.some((value) => typeof value !== "string" || !value) || new Set(values).size !== values.length) {
    throw new Error(`Rule corpus contains missing or duplicate ${label}.`);
  }
}

async function exists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
