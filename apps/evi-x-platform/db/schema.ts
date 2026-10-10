import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { CONTROL_CONTRACT_META } from "../data/control-plane-contract.generated";

/**
 * Only workflow metadata is persisted. Raw survey rows, respondent details,
 * contact information, and free-form evidence files do not belong in D1.
 */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    clientKeyHash: text("client_key_hash").notNull(),
    title: text("title").notNull(),
    // `stage` is retained as the physical column name for migration safety;
    // application code exposes it as `controlStatus` and never confuses it
    // with the competition stage.
    // Keep the legacy physical default so SQLite/D1 can migrate by ADD COLUMN
    // without rebuilding this parent table and cascading project_events.
    // Application code always writes the canonical `intake` value explicitly.
    stage: text("stage").notNull().default("initialized"),
    competitionStage: text("competition_stage").notNull().default("unknown"),
    gateStatus: text("gate_status").notNull(),
    statusRevision: integer("status_revision").notNull().default(0),
    workflowVersion: text("workflow_version")
      .notNull()
      .default(CONTROL_CONTRACT_META.workflowVersion),
    workflowSha256: text("workflow_sha256")
      .notNull()
      .default(CONTROL_CONTRACT_META.workflowSha256),
    gatesVersion: text("gates_version")
      .notNull()
      .default(CONTROL_CONTRACT_META.gatesVersion),
    gatesSha256: text("gates_sha256")
      .notNull()
      .default(CONTROL_CONTRACT_META.gatesSha256),
    // Defaults are deliberately fail-closed. Canonical registry creation
    // writes web_registry/current explicitly after binding the contract.
    authority: text("authority").notNull().default("legacy_unverified"),
    integrity: text("integrity").notNull().default("needs_revalidation"),
    legacyStage: text("legacy_stage"),
    legacyGateStatus: text("legacy_gate_status"),
    migratedAt: text("migrated_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("projects_client_key_hash_idx").on(table.clientKeyHash),
    index("projects_client_updated_idx").on(
      table.clientKeyHash,
      table.updatedAt,
    ),
  ],
);

export const projectEvents = sqliteTable(
  "project_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    stageFrom: text("stage_from"),
    stageTo: text("stage_to"),
    gateName: text("gate_name"),
    gateStatus: text("gate_status"),
    payload: text("payload").notNull().default("{}"),
    statusRevision: integer("status_revision"),
    // Legacy events predate the canonical contract and must remain NULL.
    // New events bind a version explicitly in repository code.
    workflowVersion: text("workflow_version"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

/**
 * Diagnoses deliberately retain scores, categorical codes, and a coarse
 * structural fingerprint only. The user's title/problem statement and other
 * free text are never stored.
 */
export const diagnoses = sqliteTable(
  "diagnoses",
  {
    id: text("id").primaryKey(),
    inputFingerprint: text("input_fingerprint").notNull(),
    readiness: integer("readiness").notNull(),
    qScore: integer("q_score").notNull(),
    dScore: integer("d_score").notNull(),
    iScore: integer("i_score").notNull(),
    aScore: integer("a_score").notNull(),
    riskCodes: text("risk_codes").notNull(),
    nextStepCodes: text("next_step_codes").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("diagnoses_created_at_idx").on(table.createdAt),
    index("diagnoses_fingerprint_idx").on(table.inputFingerprint),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectEventRow = typeof projectEvents.$inferSelect;

// User-authored report/slide text. Separate from workflow evidence and Gates.
export const editorDrafts = sqliteTable("editor_drafts", {
  id: text("id").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("editor_drafts_owner_updated_idx").on(table.ownerHash, table.updatedAt)]);

// Immutable, explicitly named user snapshots; never competition Gate evidence.
// No pruning/deletion endpoint: restoring opens a new draft, leaving both sources intact.
export const editorVersions = sqliteTable("editor_versions", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull().references(() => editorDrafts.id),
  label: text("label").notNull(),
  sourceRevision: integer("source_revision").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("editor_versions_draft_created_idx").on(table.draftId, table.createdAt)]);

// Logical questionnaire projects are groups of immutable, explicitly saved design snapshots.
// No relation to control-plane projects, no raw answers, no mutable current-content row.
export const questionnaireVersions = sqliteTable("questionnaire_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerHash: text("owner_hash").notNull(),
  revision: integer("revision").notNull(),
  baseRevision: integer("base_revision").notNull(),
  operation: text("operation").notNull(),
  label: text("label").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentSha256: text("content_sha256").notNull(),
  requestSha256: text("request_sha256").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
  // Optional provenance only; no human approval or mutable repair status.
  repairReviewId: text("repair_review_id"),
  repairQuestionId: text("repair_question_id"),
  repairCode: text("repair_code"),
}, table => [
  uniqueIndex("questionnaire_versions_project_revision_idx").on(table.projectId, table.revision),
  index("questionnaire_versions_owner_project_idx").on(table.ownerHash, table.projectId, table.revision),
  check("questionnaire_versions_revision_check", sql`typeof(${table.revision}) = 'integer' AND ${table.revision} BETWEEN 1 AND 40 AND ${table.revision} = ${table.baseRevision} + 1`),
  check("questionnaire_versions_operation_check", sql`(${table.operation} = 'create' AND ${table.baseRevision} = 0) OR (${table.operation} = 'append' AND ${table.baseRevision} BETWEEN 1 AND 39)`),
  check("questionnaire_versions_size_check", sql`${table.size} BETWEEN 1 AND 300000`),
  check("questionnaire_versions_content_hash_check", sql`length(${table.contentSha256}) = 64 AND ${table.contentSha256} NOT GLOB '*[^0-9a-f]*'`),
  check("questionnaire_versions_request_hash_check", sql`length(${table.requestSha256}) = 64 AND ${table.requestSha256} NOT GLOB '*[^0-9a-f]*'`),
]);

// Server-executed mechanical checks of immutable saved designs, never a human/Gate approval.
export const questionnaireDesignReviews = sqliteTable("questionnaire_design_reviews", {
  id: text("id").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  projectId: text("project_id").notNull(),
  versionId: text("version_id").notNull().references(() => questionnaireVersions.id),
  sourceRevision: integer("source_revision").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  engineVersion: text("engine_version").notNull(),
  resultJson: text("result_json").notNull(),
  resultSha256: text("result_sha256").notNull(),
  resultSize: integer("result_size").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("questionnaire_reviews_owner_version_engine_idx").on(table.ownerHash, table.versionId, table.engineVersion),
  index("questionnaire_reviews_owner_project_idx").on(table.ownerHash, table.projectId),
  check("questionnaire_reviews_revision_check", sql`typeof(${table.sourceRevision}) = 'integer' AND ${table.sourceRevision} BETWEEN 1 AND 40`),
  check("questionnaire_reviews_size_check", sql`typeof(${table.resultSize}) = 'integer' AND ${table.resultSize} BETWEEN 1 AND 1048576`),
  check("questionnaire_reviews_source_hash_check", sql`length(${table.sourceSha256}) = 64 AND ${table.sourceSha256} NOT GLOB '*[^0-9a-f]*'`),
  check("questionnaire_reviews_result_hash_check", sql`length(${table.resultSha256}) = 64 AND ${table.resultSha256} NOT GLOB '*[^0-9a-f]*'`),
]);

// Bounded aggregate-to-report proposals. Never raw answers or competition Gates.
export const researchRuns = sqliteTable("research_runs", {
  id: text("id").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  draftId: text("draft_id").notNull().references(() => editorDrafts.id),
  baseRevision: integer("base_revision").notNull(),
  input: text("input").notNull(),
  inputHash: text("input_hash").notNull(),
  proposal: text("proposal").notNull(),
  proposalHash: text("proposal_hash").notNull(),
  status: text("status").notNull().default("pending"),
  beforeId: text("before_id").notNull().unique(),
  versionId: text("version_id").notNull().unique(),
  commitToken: text("commit_token"),
  acceptedRevision: integer("accepted_revision"),
  beforeReceiptId: text("before_receipt_id").references(() => editorVersions.id),
  afterReceiptId: text("after_receipt_id").references(() => editorVersions.id),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
}, table => [
  index("research_runs_owner_created_idx").on(table.ownerHash, table.createdAt),
  check("research_runs_state_check", sql`${table.status} IN ('pending','accepting','accepted','cancelled')`),
  check("research_runs_revision_check", sql`${table.baseRevision} >= 1`),
  check("research_runs_receipt_check", sql`${table.status} != 'accepted' OR (${table.acceptedRevision} IS NOT NULL AND ${table.acceptedRevision} = ${table.baseRevision}+1 AND ${table.beforeReceiptId} IS NOT NULL AND ${table.afterReceiptId} IS NOT NULL)`),
]);

// Binary authority remains in the private file bucket. These tables do not
// convert, overwrite or confer competition evidence status on text drafts.
export const officeFiles = sqliteTable("office_files", {
  id: text("id").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  kind: text("kind").notNull(),
  revision: integer("revision").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  index("office_files_owner_updated_idx").on(table.ownerHash, table.updatedAt),
  check("office_files_kind_check", sql`${table.kind} IN ('docx','pptx')`),
  check("office_files_revision_check", sql`${table.revision} BETWEEN 0 AND 20`),
]);
export const officeFileVersions = sqliteTable("office_file_versions", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull().references(() => officeFiles.id),
  revision: integer("revision").notNull(),
  filename: text("filename").notNull(),
  label: text("label").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  objectKey: text("object_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("office_file_versions_file_revision_idx").on(table.fileId, table.revision),
  check("office_file_versions_revision_check", sql`${table.revision} BETWEEN 1 AND 20`),
  check("office_file_versions_size_check", sql`${table.size} BETWEEN 1 AND 20971520`),
]);
// Four pending slots bound ambiguous storage attempts per owner; the
// repository reserves them atomically before object I/O.
export const officeUploadAttempts = sqliteTable("office_upload_attempts", {
  objectKey: text("object_key").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  index("office_upload_attempts_owner_status_idx").on(table.ownerHash, table.status),
  check("office_upload_attempts_status_check", sql`${table.status} IN ('pending','committed','discarded')`),
]);

// A recovery verifier is a domain-separated SHA-256, never the user-held key.
// Owner hashes are immutable; rotation updates only the verifier and revision.
export const editorRecoveryKeys = sqliteTable("editor_recovery_keys", {
  ownerHash: text("owner_hash").primaryKey(),
  verifierHash: text("verifier_hash").notNull(),
  revision: integer("revision").notNull(),
  updatedAtMs: integer("updated_at_ms").notNull(),
}, table => [
  uniqueIndex("editor_recovery_keys_verifier_idx").on(table.verifierHash),
  check("editor_recovery_keys_owner_check", sql`length(${table.ownerHash}) = 64 AND ${table.ownerHash} NOT GLOB '*[^0-9a-f]*'`),
  check("editor_recovery_keys_verifier_check", sql`length(${table.verifierHash}) = 64 AND ${table.verifierHash} NOT GLOB '*[^0-9a-f]*'`),
  check("editor_recovery_keys_revision_check", sql`typeof(${table.revision}) = 'integer' AND ${table.revision} BETWEEN 1 AND 9007199254740991`),
  check("editor_recovery_keys_updated_check", sql`typeof(${table.updatedAtMs}) = 'integer' AND ${table.updatedAtMs} BETWEEN 0 AND 8640000000000000`),
]);

// Permanent reservations: an old backup must never start authorizing a different
// owner (or be reactivated for its original owner) after the key is rotated.
export const editorRecoveryKeyHistory = sqliteTable("editor_recovery_key_history", {
  verifierHash: text("verifier_hash").primaryKey(),
  ownerHash: text("owner_hash").notNull().references(() => editorRecoveryKeys.ownerHash),
  registeredAtMs: integer("registered_at_ms").notNull(),
}, table => [
  index("editor_recovery_key_history_owner_idx").on(table.ownerHash),
  check("editor_recovery_key_history_verifier_check", sql`length(${table.verifierHash}) = 64 AND ${table.verifierHash} NOT GLOB '*[^0-9a-f]*'`),
  check("editor_recovery_key_history_registered_check", sql`typeof(${table.registeredAtMs}) = 'integer' AND ${table.registeredAtMs} BETWEEN 0 AND 8640000000000000`),
]);

// Append-only session links. Keeping expired rows is essential: a known expired
// token MUST NOT be interpreted as an unknown legacy editor-owner token.
// The verifier records the creating key for exact retries, not ongoing access:
// rotating a recovery key does not revoke already issued browser sessions.
export const editorRecoveredSessions = sqliteTable("editor_recovered_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  ownerHash: text("owner_hash").notNull().references(() => editorRecoveryKeys.ownerHash),
  verifierHash: text("verifier_hash").notNull(),
  createdAtMs: integer("created_at_ms").notNull(),
  expiresAtMs: integer("expires_at_ms").notNull(),
}, table => [
  index("editor_recovered_sessions_owner_expiry_idx").on(table.ownerHash, table.expiresAtMs),
  check("editor_recovered_sessions_token_check", sql`length(${table.tokenHash}) = 64 AND ${table.tokenHash} NOT GLOB '*[^0-9a-f]*'`),
  check("editor_recovered_sessions_verifier_check", sql`length(${table.verifierHash}) = 64 AND ${table.verifierHash} NOT GLOB '*[^0-9a-f]*'`),
  check("editor_recovered_sessions_created_check", sql`typeof(${table.createdAtMs}) = 'integer' AND ${table.createdAtMs} BETWEEN 0 AND 8639997408000000`),
  check("editor_recovered_sessions_expiry_check", sql`typeof(${table.expiresAtMs}) = 'integer' AND ${table.expiresAtMs} = ${table.createdAtMs} + 2592000000`),
]);

// ONLYOFFICE Docs has no browser Cookie. Its signed callback and source GET
// resolve an opaque, owner-bound session rather than accepting owner metadata
// from callback bodies or crossing the anonymous recovery identity boundary.
export const nativeEditorSessions = sqliteTable("native_editor_sessions", {
  key: text("key").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  fileId: text("file_id").notNull().references(() => officeFiles.id),
  sourceVersionId: text("source_version_id").notNull().references(() => officeFileVersions.id),
  sourceSha256: text("source_sha256").notNull(),
  filename: text("filename").notNull(),
  kind: text("kind").notNull(),
  baseRevision: integer("base_revision").notNull(),
  saveVersionId: text("save_version_id").notNull().unique(),
  state: text("state").notNull().default("open"),
  stateChangedAtMs: integer("state_changed_at_ms"),
  saveSha256: text("save_sha256"),
  savedRevision: integer("saved_revision"),
  createdAtMs: integer("created_at_ms").notNull(),
  expiresAtMs: integer("expires_at_ms").notNull(),
}, table => [
  index("native_editor_sessions_owner_state_idx").on(table.ownerHash, table.state, table.expiresAtMs),
  check("native_editor_sessions_kind_check", sql`${table.kind} IN ('docx','pptx')`),
  check("native_editor_sessions_revision_check", sql`${table.baseRevision} BETWEEN 1 AND 19`),
  check("native_editor_sessions_state_check", sql`${table.state} IN ('open','closing','saving','saved','conflict','error')`),
  check("native_editor_sessions_state_time_check", sql`${table.stateChangedAtMs} IS NULL OR ${table.stateChangedAtMs} BETWEEN ${table.createdAtMs} AND ${table.expiresAtMs}`),
  check("native_editor_sessions_source_hash_check", sql`length(${table.sourceSha256}) = 64 AND ${table.sourceSha256} NOT GLOB '*[^0-9a-f]*'`),
  check("native_editor_sessions_saved_hash_check", sql`${table.saveSha256} IS NULL OR (length(${table.saveSha256}) = 64 AND ${table.saveSha256} NOT GLOB '*[^0-9a-f]*')`),
  check("native_editor_sessions_time_check", sql`${table.expiresAtMs} = ${table.createdAtMs} + 28800000`),
]);

// A final callback that loses the source-file CAS still owns real user edits.
// Reserve exactly one bounded, owner-scoped recovery object per native session.
export const nativeEditorRecoveries = sqliteTable("native_editor_recoveries", {
  key: text("key").primaryKey().references(() => nativeEditorSessions.key),
  ownerHash: text("owner_hash").notNull(),
  objectKey: text("object_key").notNull().unique(),
  sha256: text("sha256").notNull(),
  size: integer("size").notNull(),
  state: text("state").notNull().default("reserved"),
  createdAtMs: integer("created_at_ms").notNull(),
  expiresAtMs: integer("expires_at_ms"),
}, table => [
  index("native_editor_recoveries_owner_expiry_idx").on(table.ownerHash, table.expiresAtMs),
  check("native_editor_recoveries_state_check", sql`${table.state} IN ('reserved','ready')`),
  check("native_editor_recoveries_size_check", sql`${table.size} BETWEEN 1 AND 20971520`),
  check("native_editor_recoveries_hash_check", sql`length(${table.sha256}) = 64 AND ${table.sha256} NOT GLOB '*[^0-9a-f]*'`),
  check("native_editor_recoveries_time_check", sql`${table.expiresAtMs} IS NULL OR (${table.expiresAtMs} > ${table.createdAtMs} AND ${table.expiresAtMs} <= ${table.createdAtMs} + 31536000000)`),
]);
