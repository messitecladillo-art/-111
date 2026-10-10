import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = resolve(
  appRoot,
  "../../skill/zhengda-cup-champion/assets/runtime",
);
const workflowPath = resolve(runtimeRoot, "workflow.json");
const gatesPath = resolve(runtimeRoot, "gates.json");
const snapshotPath = resolve(
  appRoot,
  "data/control-plane-contract.snapshot.json",
);
const generatedPath = resolve(
  appRoot,
  "data/control-plane-contract.generated.ts",
);
const mode = process.argv[2] ?? "--check";
const canonicalStages = [
  "intake",
  "rule_lock",
  "problem_framing",
  "exploratory_research",
  "survey_design",
  "fieldwork",
  "data_analysis",
  "insight_action",
  "report_visual",
  "defense",
  "submission_ready",
  "closed",
];
const canonicalGateIds = [
  "rule",
  "problem",
  "design",
  "fieldwork",
  "data",
  "inference",
  "action",
  "visual",
  "submission",
];
const canonicalGateStatuses = [
  "not_run",
  "running",
  "pass",
  "warning",
  "fail",
  "unknown",
  "stale",
];

if (!new Set(["--check", "--write"]).has(mode)) {
  throw new Error("Usage: sync-control-contract.mjs --check|--write");
}

const sourceAvailable =
  (await exists(workflowPath)) && (await exists(gatesPath));

if (mode === "--write" && !sourceAvailable) {
  throw new Error(
    "Authoritative workflow.json and gates.json are required for --write.",
  );
}

if (mode === "--write") {
  const snapshot = await snapshotFromAuthoritativeSource();
  validateSnapshot(snapshot);
  const generated = renderGeneratedModule(snapshot);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(generatedPath, generated, "utf8");
  console.log(
    JSON.stringify({
      status: "written",
      workflowVersion: snapshot.workflow.version,
      gatesVersion: snapshot.gates.version,
      stages: snapshot.workflow.stages.length,
      gates: snapshot.gates.gate_ids.length,
    }),
  );
} else {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  validateSnapshot(snapshot);
  runMutationGuardTests(snapshot);
  if (sourceAvailable) {
    const current = await snapshotFromAuthoritativeSource();
    for (const field of [
      "workflowRawSha256",
      "workflowCanonicalSha256",
      "gatesRawSha256",
      "gatesCanonicalSha256",
    ]) {
      if (snapshot.source[field] !== current.source[field]) {
        throw new Error(
          `Control contract drift detected at ${field}; run npm run contract:sync.`,
        );
      }
    }
  }
  const expectedGenerated = renderGeneratedModule(snapshot);
  const currentGenerated = await readFile(generatedPath, "utf8");
  if (currentGenerated !== expectedGenerated) {
    throw new Error(
      "Generated TypeScript contract is stale; run npm run contract:sync.",
    );
  }
  console.log(
    JSON.stringify({
      status: "pass",
      sourceChecked: sourceAvailable,
      workflowVersion: snapshot.workflow.version,
      gatesVersion: snapshot.gates.version,
      stages: snapshot.workflow.stages.length,
      transitions: snapshot.workflow.allowed_transitions.length,
      gates: snapshot.gates.gate_ids.length,
      mutationGuards: 3,
    }),
  );
}

async function snapshotFromAuthoritativeSource() {
  const [workflowRaw, gatesRaw] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(gatesPath, "utf8"),
  ]);
  const workflow = JSON.parse(workflowRaw);
  const gates = JSON.parse(gatesRaw);
  return {
    schemaVersion: 1,
    source: {
      workflowPath:
        "skill/zhengda-cup-champion/assets/runtime/workflow.json",
      gatesPath: "skill/zhengda-cup-champion/assets/runtime/gates.json",
      workflowRawSha256: sha256(workflowRaw),
      workflowCanonicalSha256: sha256(canonicalJson(workflow)),
      gatesRawSha256: sha256(gatesRaw),
      gatesCanonicalSha256: sha256(canonicalJson(gates)),
    },
    workflow,
    gates,
  };
}

function validateSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== 1) {
    throw new Error("Unsupported control contract snapshot schema.");
  }
  const { workflow, gates, source } = snapshot;
  if (
    workflow?.contract_id !== "zhengda-cup-champion.workflow" ||
    gates?.contract_id !== "zhengda-cup-champion.gates"
  ) {
    throw new Error("Unexpected control contract identifiers.");
  }
  if (
    major(workflow.version) !== 1 ||
    major(gates.version) !== 1 ||
    gates.workflow_contract !== "workflow.json"
  ) {
    throw new Error("Unsupported control contract version.");
  }

  const stages = workflow.stages.map((item) => item.id);
  const gateIds = gates.gate_ids;
  const gateStatuses = gates.result_statuses;
  assertUnique(stages, "workflow stages");
  assertUnique(gateIds, "gate ids");
  assertUnique(gateStatuses, "gate statuses");
  assertExact(stages, canonicalStages, "workflow stages");
  assertExact(gateIds, canonicalGateIds, "gate ids");
  assertExact(gateStatuses, canonicalGateStatuses, "gate statuses");
  assertExact(
    workflow.gate_result_acceptance.accepted,
    ["pass", "warning"],
    "accepted gate statuses",
  );
  assertExact(
    workflow.gate_result_acceptance.blocking,
    ["not_run", "running", "fail", "unknown", "stale"],
    "blocking gate statuses",
  );
  const classifiedGateStatuses = [
    ...workflow.gate_result_acceptance.accepted,
    ...workflow.gate_result_acceptance.blocking,
  ];
  assertUnique(classifiedGateStatuses, "classified gate statuses");
  if (
    new Set(classifiedGateStatuses).size !== gateStatuses.length ||
    !gateStatuses.every((status) => classifiedGateStatuses.includes(status))
  ) {
    throw new Error(
      "Accepted and blocking gate statuses must be disjoint and exhaustive.",
    );
  }
  if (
    stages[0] !== workflow.initial_status ||
    stages.at(-1) !== "closed"
  ) {
    throw new Error("Canonical workflow stage boundary is invalid.");
  }
  if (workflow.allowed_transitions.length !== stages.length - 1) {
    throw new Error("Workflow must contain one adjacent transition per edge.");
  }
  workflow.allowed_transitions.forEach((transition, index) => {
    if (
      transition.from !== stages[index] ||
      transition.to !== stages[index + 1]
    ) {
      throw new Error(`Non-adjacent transition at ${transition.id}.`);
    }
    for (const gate of transition.required_gates) {
      if (!gateIds.includes(gate)) {
        throw new Error(`Unknown required gate ${gate} at ${transition.id}.`);
      }
    }
  });
  const definedGateIds = gates.gates.map((gate) => gate.id);
  if (JSON.stringify(definedGateIds) !== JSON.stringify(gateIds)) {
    throw new Error("Gate definition order does not match gate_ids.");
  }
  gates.gates.forEach((gate, index) => {
    if (gate.ordinal !== index + 1) {
      throw new Error(`Gate ${gate.id} has a non-canonical ordinal.`);
    }
    if (!stages.includes(gate.owner_status)) {
      throw new Error(`Gate ${gate.id} has unknown owner status ${gate.owner_status}.`);
    }
    for (const prerequisite of gate.prerequisite_gates) {
      if (!gateIds.includes(prerequisite)) {
        throw new Error(
          `Gate ${gate.id} has unknown prerequisite ${prerequisite}.`,
        );
      }
    }
  });
  if (
    source.workflowCanonicalSha256 !== sha256(canonicalJson(workflow)) ||
    source.gatesCanonicalSha256 !== sha256(canonicalJson(gates))
  ) {
    throw new Error("Snapshot canonical hash verification failed.");
  }
}

function renderGeneratedModule(snapshot) {
  const { workflow, gates, source } = snapshot;
  const stages = workflow.stages.map((item) => item.id);
  const transitions = workflow.allowed_transitions.map((item) => ({
    id: item.id,
    from: item.from,
    to: item.to,
    requiredGates: item.required_gates,
    requiredArtifacts: item.required_artifacts,
  }));
  const gateDefinitions = gates.gates.map((item) => ({
    id: item.id,
    ordinal: item.ordinal,
    ownerStatus: item.owner_status,
    prerequisiteGates: item.prerequisite_gates,
  }));
  return `// Generated by scripts/sync-control-contract.mjs. Do not edit manually.\n` +
    `export const CONTROL_CONTRACT_META = ${json({
      workflowContractId: workflow.contract_id,
      workflowVersion: workflow.version,
      workflowSha256: source.workflowRawSha256,
      gatesContractId: gates.contract_id,
      gatesVersion: gates.version,
      gatesSha256: source.gatesRawSha256,
      authority: "generated_from_agentctl_runtime_contracts",
    })} as const;\n\n` +
    `export const PROJECT_STAGES = ${json(stages)} as const;\n` +
    `export type ProjectStage = (typeof PROJECT_STAGES)[number];\n\n` +
    `export const GATE_NAMES = ${json(gates.gate_ids)} as const;\n` +
    `export type GateName = (typeof GATE_NAMES)[number];\n\n` +
    `export const GATE_VALUES = ${json(gates.result_statuses)} as const;\n` +
    `export type GateValue = (typeof GATE_VALUES)[number];\n\n` +
    `export const ACCEPTED_GATE_VALUES = ${json(workflow.gate_result_acceptance.accepted)} as const;\n` +
    `export const BLOCKING_GATE_VALUES = ${json(workflow.gate_result_acceptance.blocking)} as const;\n\n` +
    `export const ALLOWED_TRANSITIONS = ${json(transitions)} as const;\n\n` +
    `export const GATE_DEFINITIONS = ${json(gateDefinitions)} as const;\n`;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function canonicalJson(value) {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortRecursively(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function major(version) {
  return Number.parseInt(String(version).split(".")[0], 10);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label}.`);
  }
}

function assertExact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Canonical ${label} do not match the v1 contract.`);
  }
}

function runMutationGuardTests(snapshot) {
  const mutations = [
    {
      label: "renamed intermediate workflow stage",
      apply(candidate) {
        const previous = "rule_lock";
        const replacement = "rules_locked";
        candidate.workflow.stages.forEach((stage) => {
          if (stage.id === previous) stage.id = replacement;
        });
        candidate.workflow.allowed_transitions.forEach((transition) => {
          if (transition.from === previous) transition.from = replacement;
          if (transition.to === previous) transition.to = replacement;
        });
        candidate.gates.gates.forEach((gate) => {
          if (gate.owner_status === previous) gate.owner_status = replacement;
        });
      },
    },
    {
      label: "added gate status",
      apply(candidate) {
        candidate.gates.result_statuses.push("deferred");
        candidate.workflow.gate_result_acceptance.blocking.push("deferred");
      },
    },
    {
      label: "removed gate status",
      apply(candidate) {
        candidate.gates.result_statuses = candidate.gates.result_statuses.filter(
          (status) => status !== "stale",
        );
        candidate.workflow.gate_result_acceptance.blocking =
          candidate.workflow.gate_result_acceptance.blocking.filter(
            (status) => status !== "stale",
          );
      },
    },
  ];

  for (const mutation of mutations) {
    const candidate = structuredClone(snapshot);
    mutation.apply(candidate);
    candidate.source.workflowCanonicalSha256 = sha256(
      canonicalJson(candidate.workflow),
    );
    candidate.source.gatesCanonicalSha256 = sha256(
      canonicalJson(candidate.gates),
    );
    let rejected = false;
    try {
      validateSnapshot(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`Mutation guard failed: ${mutation.label}.`);
    }
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
