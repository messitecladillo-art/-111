import { and, asc, desc, eq } from "drizzle-orm";
import {
  CONTROL_CONTRACT_META,
  GATE_NAMES,
  GATE_VALUES,
  PROJECT_STAGES,
  type GateName,
  type GateValue,
  type ProjectStage,
} from "@/data/control-plane-contract.generated";
import type { AppDatabase } from "./index";
import {
  projectEvents,
  projects,
  type ProjectEventRow,
  type ProjectRow,
} from "./schema";

export {
  GATE_NAMES,
  GATE_VALUES,
  PROJECT_STAGES,
  type GateName,
  type GateValue,
  type ProjectStage,
};

export type GateStatusMap = Record<GateName, GateValue>;
export type ProjectAuthority =
  | "web_registry"
  | "agentctl_verified"
  | "legacy_unverified";
export type ProjectIntegrity =
  | "current"
  | "stale"
  | "contract_mismatch"
  | "needs_revalidation";

export type ProjectView = {
  id: string;
  title: string;
  controlStatus: ProjectStage;
  competitionStage: string;
  gateStatus: GateStatusMap;
  statusRevision: number;
  authority: ProjectAuthority;
  integrity: ProjectIntegrity;
  contract: {
    workflow: { id: string; version: string; sha256: string };
    gates: { id: string; version: string; sha256: string };
  };
  legacy: {
    controlStatus: string | null;
    gateStatus: Record<string, string> | null;
    migratedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectEventView = Omit<ProjectEventRow, "payload"> & {
  payload: Record<string, unknown>;
};

export type ProjectCreate = {
  id: string;
  clientKeyHash: string;
  title: string;
  createdAt: string;
};

type DemoStore = {
  projects: ProjectRow[];
  events: ProjectEventRow[];
  nextEventId: number;
};

const demoGlobal = globalThis as typeof globalThis & {
  __EVI_X_DEMO_PROJECT_STORE__?: DemoStore;
};

const PROJECT_LIST_LIMIT = 20;
const PROJECT_EVENT_LIMIT = 100;

function getDemoStore(): DemoStore {
  demoGlobal.__EVI_X_DEMO_PROJECT_STORE__ ??= {
    projects: [],
    events: [],
    nextEventId: 1,
  };
  return demoGlobal.__EVI_X_DEMO_PROJECT_STORE__;
}

export function emptyGateStatus(): GateStatusMap {
  return Object.fromEntries(
    GATE_NAMES.map((name) => [name, "not_run"]),
  ) as GateStatusMap;
}

function decodeGateStatus(value: string): {
  gateStatus: GateStatusMap;
  canonical: boolean;
} {
  const output = emptyGateStatus();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { gateStatus: output, canonical: false };
    }

    const record = parsed as Record<string, unknown>;
    let canonical = Object.keys(record).every((name) =>
      (GATE_NAMES as readonly string[]).includes(name),
    );
    for (const gate of GATE_NAMES) {
      const raw = record[gate];
      const status =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>).status
          : raw;
      if (raw && typeof raw === "object") canonical = false;
      if ((GATE_VALUES as readonly unknown[]).includes(status)) {
        output[gate] = status as GateValue;
      } else if (status === "pending") {
        output[gate] = "not_run";
        canonical = false;
      } else {
        canonical = false;
      }
    }
    return { gateStatus: output, canonical };
  } catch {
    return { gateStatus: output, canonical: false };
  }
}

export function parseGateStatus(value: string): GateStatusMap {
  return decodeGateStatus(value).gateStatus;
}

function parseLegacyGateStatus(value: string | null): Record<string, string> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .slice(0, 20)
        .map(([name, raw]) => {
          const status =
            raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>).status
              : raw;
          return [name, typeof status === "string" ? status : "unknown"];
        }),
    );
  } catch {
    return null;
  }
}

function normalizeAuthority(value: string): ProjectAuthority {
  if (
    value === "web_registry" ||
    value === "agentctl_verified" ||
    value === "legacy_unverified"
  ) {
    return value;
  }
  return "legacy_unverified";
}

function normalizeIntegrity(value: string): ProjectIntegrity {
  if (
    value === "current" ||
    value === "stale" ||
    value === "contract_mismatch" ||
    value === "needs_revalidation"
  ) {
    return value;
  }
  return "needs_revalidation";
}

function toProjectView(row: ProjectRow): ProjectView {
  const decodedGates = decodeGateStatus(row.gateStatus);
  const canonicalStage = (PROJECT_STAGES as readonly string[]).includes(row.stage);
  const contractCurrent =
    row.workflowVersion === CONTROL_CONTRACT_META.workflowVersion &&
    row.workflowSha256 === CONTROL_CONTRACT_META.workflowSha256 &&
    row.gatesVersion === CONTROL_CONTRACT_META.gatesVersion &&
    row.gatesSha256 === CONTROL_CONTRACT_META.gatesSha256;

  let integrity = normalizeIntegrity(row.integrity);
  if (!contractCurrent) integrity = "contract_mismatch";
  else if (!canonicalStage || !decodedGates.canonical) {
    integrity = "needs_revalidation";
  }

  const authority = normalizeAuthority(row.authority);
  if (authority === "legacy_unverified" && integrity === "current") {
    integrity = "needs_revalidation";
  }
  return {
    id: row.id,
    title: row.title,
    controlStatus: canonicalStage ? (row.stage as ProjectStage) : "intake",
    competitionStage: row.competitionStage,
    gateStatus: decodedGates.gateStatus,
    statusRevision: row.statusRevision,
    authority,
    integrity,
    contract: {
      workflow: {
        id: CONTROL_CONTRACT_META.workflowContractId,
        version: row.workflowVersion,
        sha256: row.workflowSha256,
      },
      gates: {
        id: CONTROL_CONTRACT_META.gatesContractId,
        version: row.gatesVersion,
        sha256: row.gatesSha256,
      },
    },
    legacy:
      authority === "legacy_unverified" || row.legacyStage || row.legacyGateStatus
        ? {
            controlStatus: row.legacyStage,
            gateStatus: parseLegacyGateStatus(row.legacyGateStatus),
            migratedAt: row.migratedAt,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProjectEventView(row: ProjectEventRow): ProjectEventView {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = { integrity: "unreadable_legacy_payload" };
  }
  return { ...row, payload };
}

export async function listProjects(
  db: AppDatabase | null,
  clientKeyHash: string,
): Promise<ProjectView[]> {
  if (!db) {
    return getDemoStore()
      .projects.filter((row) => row.clientKeyHash === clientKeyHash)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, PROJECT_LIST_LIMIT)
      .map(toProjectView);
  }

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.clientKeyHash, clientKeyHash))
    .orderBy(desc(projects.updatedAt), desc(projects.id))
    .limit(PROJECT_LIST_LIMIT);
  return rows.map(toProjectView);
}

export async function createProject(
  db: AppDatabase | null,
  input: ProjectCreate,
): Promise<ProjectView> {
  const stored: ProjectRow = {
    id: input.id,
    clientKeyHash: input.clientKeyHash,
    title: input.title,
    stage: "intake",
    competitionStage: "unknown",
    gateStatus: JSON.stringify(emptyGateStatus()),
    statusRevision: 0,
    workflowVersion: CONTROL_CONTRACT_META.workflowVersion,
    workflowSha256: CONTROL_CONTRACT_META.workflowSha256,
    gatesVersion: CONTROL_CONTRACT_META.gatesVersion,
    gatesSha256: CONTROL_CONTRACT_META.gatesSha256,
    authority: "web_registry",
    integrity: "current",
    legacyStage: null,
    legacyGateStatus: null,
    migratedAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  const eventPayload = JSON.stringify({
    authority: "web_registry",
    integrity: "current",
    executorConnected: false,
  });

  if (!db) {
    const store = getDemoStore();
    store.projects.push(stored);
    store.events.push({
      id: store.nextEventId++,
      projectId: input.id,
      eventType: "registry_project_created",
      stageFrom: null,
      stageTo: "intake",
      gateName: null,
      gateStatus: null,
      payload: eventPayload,
      statusRevision: 0,
      workflowVersion: CONTROL_CONTRACT_META.workflowVersion,
      createdAt: input.createdAt,
    });
    return toProjectView(stored);
  }

  const [createdRows] = await db.batch([
    db.insert(projects).values(stored).returning(),
    db.insert(projectEvents).values({
      projectId: input.id,
      eventType: "registry_project_created",
      stageTo: "intake",
      payload: eventPayload,
      statusRevision: 0,
      workflowVersion: CONTROL_CONTRACT_META.workflowVersion,
      createdAt: input.createdAt,
    }),
  ]);
  const [created] = createdRows;
  if (!created) throw new Error("D1_PROJECT_CREATE_DID_NOT_RETURN_ROW");
  return toProjectView(created);
}

export async function getProject(
  db: AppDatabase | null,
  id: string,
  clientKeyHash: string,
): Promise<ProjectView | null> {
  if (!db) {
    const row = getDemoStore().projects.find(
      (candidate) =>
        candidate.id === id && candidate.clientKeyHash === clientKeyHash,
    );
    return row ? toProjectView(row) : null;
  }

  const [row] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, id), eq(projects.clientKeyHash, clientKeyHash)),
    )
    .limit(1);
  return row ? toProjectView(row) : null;
}

export async function listProjectEvents(
  db: AppDatabase | null,
  projectId: string,
): Promise<ProjectEventView[]> {
  if (!db) {
    return getDemoStore()
      .events.filter((event) => event.projectId === projectId)
      .sort((a, b) => a.id - b.id)
      .slice(0, PROJECT_EVENT_LIMIT)
      .map(toProjectEventView);
  }

  const rows = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(asc(projectEvents.id))
    .limit(PROJECT_EVENT_LIMIT);
  return rows.map(toProjectEventView);
}
