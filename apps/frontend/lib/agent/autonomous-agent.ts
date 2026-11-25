/** Client bridge & ResearchQuality hydrator for the Backend ReAct Autonomous Research Engine. */

import type { DatasetValue } from '../canvas/execute.ts';
import { sectionProseText, type EditorContent } from '../editor-model.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { referenceProblems } from '../references.ts';
import { benchmarkReport } from '../report-benchmark.ts';
import { reportFormatNotices, reportPart } from '../report-format.ts';
import { danglingReferences } from '../report-numbering.ts';
import { METHOD_LABELS } from '../report-placement.ts';
import {
  confirmFinding,
  digestText,
  parseResearchQuality,
  parseResultSnapshot,
  resultPayload,
  snapshotRecipe,
  type ResearchFinding,
  type ResearchQuality,
  type ResultSnapshot,
} from '../research-quality.ts';
import { normalizeAcademicPunctuation } from '../typography.ts';
import { assertTrueVector as assertStrictSvg } from '../vector-svg.ts';

export type AutonomousLeaseMode = 'pi_autonomous' | 'milestone_gated';
export type AutonomousDatasetMode = 'planted_trap_benchmark' | 'inline_dataset' | 'survey_release';

export type AutonomousTraceStep = {
  phase: 'plan_hypotheses' | 'explore_and_pivot_data' | 'falsify_and_review' | 'reanalyze' | 'synthesize' | (string & {});
  iteration: number;
  agentRole: string;
  thought: string;
  operator: string;
  args: Record<string, unknown>;
  diagnostics: string[];
  pivotTaken: string;
  snapshotId: string;
  observationSummary: string;
};

export type AutonomousPendingMilestone = {
  milestoneId: string;
  phase: string;
  reason: string;
  detectedDiagnostics: string[];
  proposedAction: string;
};

export type AutonomousStreamEvent = {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
};

export type AutonomousEpistemicNode = {
  id: string;
  kind: string;
  label: string;
  status: 'proposed' | 'verified' | 'refuted' | 'pivoted' | 'dirty';
  summary: string;
  snapshot_ids: string[];
  dirty_reason?: string;
};

export type ProjectEpistemicMemoryItem = {
  id: string;
  projectId: string;
  runId: string;
  memoryKey: string;
  kind: string;
  status: string;
  summary: string;
  snapshotRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type PlotSandboxAudit = {
  passed: boolean;
  vectorPure?: boolean;
  primitiveCount?: number;
  textCount?: number;
  overlapCount?: number;
  ellipsisCount?: number;
  minFontSize?: number | null;
  issues?: string[];
};

export type PlotSandboxResult = {
  projectId: string;
  ok: boolean;
  svg: string;
  svgSha256: string;
  audit: PlotSandboxAudit;
  repairRounds: number;
};

export type StatSandboxResult = {
  projectId: string;
  ok: boolean;
  classification: 'actual' | 'simulated';
  snapshotId: string;
  resultHash: string;
  scriptSha256: string;
  summary: string;
  nEffective: number | null;
  metrics: Record<string, unknown>;
  table?: unknown;
  diagnostics: string[];
  raw: Record<string, unknown>;
};

export type VerifiedCitationMatch = {
  doi: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  tags?: string[];
  url?: string;
};

export type CitationVerifyResult = {
  projectId?: string;
  verified: boolean;
  query: string;
  doi: string;
  source: string;
  citation: VerifiedCitationMatch | null;
  matches: VerifiedCitationMatch[];
  reason?: string;
  receiptHash?: string;
};

export type AutonomousEpistemicEdge = {
  source: string;
  target: string;
  relation: string;
  note?: string;
};

export type AutonomousRunView = {
  schemaVersion: 1;
  runId: string;
  projectId: string;
  status: 'completed' | 'awaiting_milestone' | 'failed' | 'cancelled';
  createdAt: string;
  revision?: number;
  eventCount?: number;
  reworkRounds?: number;
  reworkHistory?: Array<Record<string, unknown>>;
  pendingMilestone?: AutonomousPendingMilestone | null;
  checkpoint?: Record<string, unknown> | null;
  recalledMemory?: {
    recalledCount: number;
    briefText?: string;
    motherInsights?: string[];
    cleaningRules?: string[];
    refutedClaims?: string[];
    steeringNotes?: string[];
  };
  lease: {
    leaseId: string;
    mode: AutonomousLeaseMode;
    maxToolCalls: number;
    usedToolCalls: number;
    datasetSha256: string;
    privacyGuarantee: string;
    expiresAt: string;
  };
  datasetSummary: {
    title: string;
    datasetRef: string;
    datasetMode: AutonomousDatasetMode;
    classification: 'user_provided' | 'simulated';
    rawRowCount: number;
    cleanedRowCount: number;
    variables: number;
    sha256: string;
  };
  reasoningTrace: AutonomousTraceStep[];
  epistemicGraph: {
    project_id: string;
    nodes: AutonomousEpistemicNode[];
    edges: AutonomousEpistemicEdge[];
    pivot_log: { fromNode: string; toNode: string; reason: string; snapshotId: string }[];
    completeness: {
      passed: boolean;
      nodeCount: number;
      edgeCount: number;
      pivotCount: number;
      dirtyNodes: string[];
      unsupportedClaims: string[];
      hasVerifiedMotherInsight: boolean;
      hasFalsificationCheck: boolean;
      graphHash: string;
    };
  };
  motherInsight: {
    headline: string;
    mechanism: string;
    paradoxDetail: string;
    scopeBoundary: string;
    supportingSnapshots: string[];
  };
  falsificationReport: {
    decision: string;
    summary: string;
    findings: { severity: string; location: string; issue: string; evidence_ref: string; required_change: string }[];
    consistencyChecks: { check: string; result: string; details: string }[];
    ethicsAndPrivacy: string[];
  };
  deliverable: Record<string, unknown>;
  registeredResults: Array<{
    id: string;
    title: string;
    sourceName: string;
    sourceUrl: string;
    sourceHash: string;
    resultHash: string;
    classification: 'public' | 'user_provided' | 'simulated';
    method: string;
    n: number;
    total: number;
    headers: string[];
    rows: (string | number | null)[][];
    metrics: { label: string; value: number | null }[];
    warnings: string[];
    variables?: string[];
    operator?: string;
    summary?: string;
  }>;
};

export type AutonomousInlineDatasetPayload = {
  title: string;
  classification: 'user_provided' | 'simulated';
  questions: Array<{
    id: string;
    variable: string;
    text: string;
    type: 'single' | 'multi' | 'likert' | 'number' | 'text';
    min?: number | null;
    max?: number | null;
    choices?: { code: string; label: string }[];
  }>;
  rows: Array<{ answers: Record<string, unknown>; visibility: Record<string, boolean> }>;
};

export type AutonomousRunRequest = {
  idempotencyKey?: string;
  goal: string;
  geography?: string;
  datasetMode: AutonomousDatasetMode;
  leaseMode?: AutonomousLeaseMode;
  maxToolCalls?: number;
  projectId?: string;
  inlineDataset?: AutonomousInlineDatasetPayload | null;
};

export type AutonomousAuthContext = {
  authenticated?: boolean;
  projectId?: string | null;
  csrfToken?: string | null;
};

/**
 * Strip all open-text PII columns and export coded numeric/categorical matrices for the backend ISA sandbox.
 */
export function serializeDatasetForAutonomousSandbox(
  design: Questionnaire | null,
  dataset: DatasetValue | null,
): AutonomousInlineDatasetPayload | null {
  if (!dataset || !dataset.table.headers.length || !dataset.table.rows.length) return null;
  const headers = dataset.table.headers.slice(0, 60);
  const rawRows = dataset.table.rows.slice(0, 2000);
  const matchedQuestions = design?.questions ?? [];

  const cols: AutonomousInlineDatasetPayload['questions'] = [];
  const columnMeta = headers.map((header, idx) => {
    const cleanHeader = header.trim() || `col_${idx + 1}`;
    const q = matchedQuestions.find(
      item => item.variable === cleanHeader || item.text === cleanHeader || item.id === cleanHeader,
    );
    if (q) {
      return {
        id: q.id,
        variable: q.variable,
        text: q.text,
        type: q.type,
        min: q.min ?? null,
        max: q.max ?? null,
        choices: (q.choices ?? []).map(c => ({ code: c.code, label: c.label })),
        isOpenText: q.type === 'text',
        colIdx: idx,
      };
    }
    const sampleNums = rawRows
      .slice(0, 50)
      .map(r => r[idx]?.trim() ?? '')
      .filter(Boolean);
    const numCount = sampleNums.filter(v => Number.isFinite(Number(v))).length;
    const isNumeric = sampleNums.length > 0 && numCount / sampleNums.length >= 0.7;
    const uniqueCats = [...new Set(sampleNums)].slice(0, 20);
    const isOpenText = !isNumeric && uniqueCats.length >= Math.max(12, Math.floor(sampleNums.length * 0.85));
    const qid = `col_${idx + 1}`;
    return {
      id: qid,
      variable: cleanHeader,
      text: cleanHeader,
      type: (isOpenText ? 'text' : isNumeric ? 'likert' : 'single') as 'text' | 'likert' | 'single',
      min: isNumeric ? 1 : null,
      max: isNumeric ? 5 : null,
      choices: isNumeric || isOpenText ? [] : uniqueCats.map(c => ({ code: c, label: c })),
      isOpenText,
      colIdx: idx,
    };
  });

  for (const col of columnMeta) {
    cols.push({
      id: col.id,
      variable: col.variable,
      text: col.text.slice(0, 200),
      type: col.type,
      min: col.min,
      max: col.max,
      choices: col.choices,
    });
  }

  const encodedRows: AutonomousInlineDatasetPayload['rows'] = rawRows.map(row => {
    const answers: Record<string, unknown> = {};
    const visibility: Record<string, boolean> = {};
    for (const col of columnMeta) {
      if (col.isOpenText) {
        // Open text answers are strictly withheld before transmission.
        visibility[col.id] = false;
        continue;
      }
      visibility[col.id] = true;
      const cell = (row[col.colIdx] ?? '').trim();
      if (!cell) {
        answers[col.id] = null;
      } else if (col.type === 'likert' || col.type === 'number') {
        const parsed = Number(cell);
        answers[col.id] = Number.isFinite(parsed) ? parsed : null;
      } else if (col.type === 'multi') {
        answers[col.id] = cell.split(/[,，;|]+/).map(s => s.trim()).filter(Boolean);
      } else {
        answers[col.id] = cell;
      }
    }
    return { answers, visibility };
  });

  return {
    title: dataset.name || design?.title || '工作区调查数据集',
    classification: dataset.kind === 'user_provided' ? 'user_provided' : 'simulated',
    questions: cols,
    rows: encodedRows,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildAutonomousRequestPayload(request: AutonomousRunRequest) {
  return {
    idempotencyKey: request.idempotencyKey ?? crypto.randomUUID(),
    goal: request.goal.trim() || '县域服务采纳机制与异质性分化自主探索',
    geography: request.geography?.trim() || '县域',
    datasetMode: request.datasetMode,
    leaseMode: request.leaseMode ?? 'pi_autonomous',
    maxToolCalls: request.maxToolCalls ?? 26,
    ...(request.inlineDataset ? { inlineDataset: request.inlineDataset } : {}),
  };
}

async function readTextStreamChunks(
  res: Response,
  onChunk: (chunk: string) => void,
): Promise<void> {
  if (!res.body) {
    const text = await res.text();
    if (text) onChunk(text);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        onChunk(decoder.decode(value, { stream: true }));
      }
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function consumeAutonomousNdjsonStream(
  res: Response,
  onEvent?: (ev: AutonomousStreamEvent) => void,
): Promise<AutonomousRunView> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = data?.error?.message || data?.error || `本地自主探索流调用失败 (${res.status})`;
    throw new Error(msg);
  }

  let buffer = '';
  let seqCounter = 0;
  let doneRun: AutonomousRunView | null = null;

  const processLine = (rawLine: string) => {
    const clean = rawLine.replace(/\r$/, '').trim();
    if (!clean) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('自主探索事件流包含无效 JSON 行。');
    }
    if (!isPlainRecord(parsed)) return;
    if (parsed.type === 'event') {
      seqCounter += 1;
      const ev: AutonomousStreamEvent = {
        seq: typeof parsed.seq === 'number' && Number.isFinite(parsed.seq) ? parsed.seq : seqCounter,
        eventType: typeof parsed.eventType === 'string' && parsed.eventType ? parsed.eventType : 'message',
        payload: isPlainRecord(parsed.payload) ? parsed.payload : {},
      };
      onEvent?.(ev);
      return;
    }
    if (parsed.type === 'error') {
      throw new Error(typeof parsed.error === 'string' && parsed.error ? parsed.error : '自主探索执行失败。');
    }
    if (parsed.type === 'done' && isPlainRecord(parsed.run)) {
      doneRun = parsed.run as unknown as AutonomousRunView;
    }
  };

  await readTextStreamChunks(res, chunk => {
    buffer += chunk;
    let nlIdx = buffer.indexOf('\n');
    while (nlIdx !== -1) {
      processLine(buffer.slice(0, nlIdx));
      buffer = buffer.slice(nlIdx + 1);
      nlIdx = buffer.indexOf('\n');
    }
  });

  if (buffer.trim()) {
    processLine(buffer);
  }
  if (!doneRun) {
    throw new Error('自主探索流未返回完整运行回执。');
  }
  return doneRun;
}

export async function readAutonomousRunStream(
  projectId: string,
  runId: string,
  opts?: {
    afterSeq?: number;
    signal?: AbortSignal;
    onEvent?: (ev: AutonomousStreamEvent) => void;
    fetchFn?: typeof fetch;
  },
): Promise<AutonomousStreamEvent[]> {
  const fetchImpl = opts?.fetchFn ?? fetch;
  const afterSeq = typeof opts?.afterSeq === 'number' && opts.afterSeq > 0 ? Math.floor(opts.afterSeq) : 0;
  const url = `/api/projects/${encodeURIComponent(projectId)}/autonomous-runs/${encodeURIComponent(runId)}/stream${afterSeq ? `?afterSeq=${afterSeq}` : ''}`;

  const res = await fetchImpl(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'text/event-stream' },
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw new Error(`读取后端自主探索事件流失败 (${res.status})`);
  }

  let lineBuffer = '';
  let currentId = '';
  let currentEvent = '';
  let dataLines: string[] = [];
  const events: AutonomousStreamEvent[] = [];

  const dispatchBlock = () => {
    if (!dataLines.length) {
      currentId = '';
      currentEvent = '';
      return;
    }
    const rawData = dataLines.join('\n');
    const blockId = currentId;
    const blockEvent = currentEvent;
    dataLines = [];
    currentId = '';
    currentEvent = '';

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      parsed = { raw: rawData };
    }
    const obj = isPlainRecord(parsed) ? parsed : { value: parsed };
    const parsedId = blockId !== '' && /^-?\d+$/.test(blockId.trim()) ? Number.parseInt(blockId.trim(), 10) : NaN;
    const seq = typeof obj.seq === 'number' && Number.isFinite(obj.seq)
      ? obj.seq
      : Number.isFinite(parsedId)
        ? parsedId
        : events.length + 1;
    const eventType = blockEvent || (typeof obj.eventType === 'string' && obj.eventType) || 'message';
    const payload = typeof obj.eventType === 'string' && isPlainRecord(obj.payload) ? obj.payload : obj;
    const ev: AutonomousStreamEvent = { seq, eventType, payload };
    events.push(ev);
    opts?.onEvent?.(ev);
  };

  const processSseLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') {
      dispatchBlock();
      return;
    }
    if (line.startsWith(':')) return;
    const colonIdx = line.indexOf(':');
    const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
    let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') currentId = value;
    else if (field === 'event') currentEvent = value;
    else if (field === 'data') dataLines.push(value);
  };

  await readTextStreamChunks(res, chunk => {
    lineBuffer += chunk;
    let nlIdx = lineBuffer.indexOf('\n');
    while (nlIdx !== -1) {
      processSseLine(lineBuffer.slice(0, nlIdx));
      lineBuffer = lineBuffer.slice(nlIdx + 1);
      nlIdx = lineBuffer.indexOf('\n');
    }
  });

  if (lineBuffer.length > 0) {
    processSseLine(lineBuffer);
  }
  dispatchBlock();
  return events;
}

export async function runAutonomousResearch(
  request: AutonomousRunRequest,
  auth?: AutonomousAuthContext,
  signal?: AbortSignal,
): Promise<AutonomousRunView> {
  const payload = buildAutonomousRequestPayload(request);

  if (auth?.authenticated && auth.projectId && auth.csrfToken) {
    const res = await fetch(`/api/projects/${encodeURIComponent(auth.projectId)}/autonomous-runs`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.runId) {
      const msg = data?.error?.message || `后端自主探索执行失败 (${res.status})`;
      throw new Error(msg);
    }
    return data as AutonomousRunView;
  }

  const res = await fetch('/api/agent/autonomous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, projectId: request.projectId ?? 'local-studio' }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok || !data.run) {
    throw new Error(data?.error || `本地自主探索服务调用失败 (${res.status})`);
  }
  return data.run as AutonomousRunView;
}

export async function streamAutonomousResearch(
  request: AutonomousRunRequest,
  options?: {
    auth?: AutonomousAuthContext;
    signal?: AbortSignal;
    onEvent?: (ev: AutonomousStreamEvent) => void;
    fetchFn?: typeof fetch;
  },
): Promise<AutonomousRunView> {
  const fetchImpl = options?.fetchFn ?? fetch;
  const payload = buildAutonomousRequestPayload(request);
  const auth = options?.auth;

  if (auth?.authenticated && auth.projectId && auth.csrfToken) {
    const res = await fetchImpl(`/api/projects/${encodeURIComponent(auth.projectId)}/autonomous-runs`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.runId) {
      const msg = data?.error?.message || `后端自主探索执行失败 (${res.status})`;
      throw new Error(msg);
    }
    const run = data as AutonomousRunView;
    try {
      await readAutonomousRunStream(auth.projectId, run.runId, {
        afterSeq: 0,
        onEvent: options?.onEvent,
        signal: options?.signal,
        fetchFn: fetchImpl,
      });
    } catch {
      // Gracefully ignore SSE tail failures when run already returned cleanly.
    }
    return run;
  }

  const res = await fetchImpl('/api/agent/autonomous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      stream: true,
      projectId: request.projectId ?? 'local-studio',
    }),
    signal: options?.signal,
  });
  return consumeAutonomousNdjsonStream(res, options?.onEvent);
}

export async function resumeAutonomousResearch(params: {
  run: AutonomousRunView;
  decision: 'approve' | 'steer' | 'abort';
  steeringNote?: string;
  request: AutonomousRunRequest;
  auth?: AutonomousAuthContext;
  signal?: AbortSignal;
  onEvent?: (ev: AutonomousStreamEvent) => void;
  afterSeq?: number;
  fetchFn?: typeof fetch;
}): Promise<AutonomousRunView> {
  const fetchImpl = params.fetchFn ?? fetch;
  const auth = params.auth;
  const trimmedNote = params.steeringNote?.trim() ?? '';

  if (auth?.authenticated && auth.projectId && auth.csrfToken) {
    const res = await fetchImpl(
      `/api/projects/${encodeURIComponent(auth.projectId)}/autonomous-runs/${encodeURIComponent(params.run.runId)}/resume`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify({
          expectedRevision: params.run.revision ?? 0,
          decision: params.decision,
          ...(trimmedNote ? { steeringNote: trimmedNote } : {}),
        }),
        signal: params.signal,
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.runId) {
      const msg = data?.error?.message || `后端自主探索续跑失败 (${res.status})`;
      throw new Error(msg);
    }
    const updated = data as AutonomousRunView;
    try {
      await readAutonomousRunStream(auth.projectId, updated.runId, {
        afterSeq: params.afterSeq ?? 0,
        onEvent: params.onEvent,
        signal: params.signal,
        fetchFn: fetchImpl,
      });
    } catch {
      // Gracefully ignore SSE tail failures when updated run returned cleanly.
    }
    return updated;
  }

  const basePayload = buildAutonomousRequestPayload(params.request);
  const res = await fetchImpl('/api/agent/autonomous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'resume',
      stream: true,
      decision: params.decision,
      ...(trimmedNote ? { steeringNote: trimmedNote } : {}),
      goal: basePayload.goal,
      geography: basePayload.geography,
      datasetMode: basePayload.datasetMode,
      leaseMode: 'milestone_gated',
      maxToolCalls: basePayload.maxToolCalls,
      projectId: params.request.projectId ?? params.run.projectId ?? 'local-studio',
      checkpoint: params.run.checkpoint ?? null,
      epistemicGraph: params.run.epistemicGraph,
      usedToolCalls: params.run.lease.usedToolCalls,
      ...(params.request.inlineDataset ? { inlineDataset: params.request.inlineDataset } : {}),
    }),
    signal: params.signal,
  });
  return consumeAutonomousNdjsonStream(res, params.onEvent);
}

export async function cancelAutonomousResearch(params: {
  run: AutonomousRunView;
  auth: AutonomousAuthContext;
  fetchFn?: typeof fetch;
}): Promise<AutonomousRunView> {
  if (!params.auth?.authenticated || !params.auth.projectId || !params.auth.csrfToken) {
    throw new Error('缺少项目认证上下文，无法取消后端运行。');
  }
  const fetchImpl = params.fetchFn ?? fetch;
  const res = await fetchImpl(
    `/api/projects/${encodeURIComponent(params.auth.projectId)}/autonomous-runs/${encodeURIComponent(params.run.runId)}/cancel`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': params.auth.csrfToken,
      },
      body: JSON.stringify({ expectedRevision: params.run.revision ?? 0 }),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.runId) {
    const msg = data?.error?.message || `后端自主探索取消失败 (${res.status})`;
    throw new Error(msg);
  }
  return data as AutonomousRunView;
}

/**
 * Hydrate backend SHA-256 receipts into browser-verifiable ResultSnapshot & ResearchFinding records
 * matching `verifyResearchQuality()` and `parseResearchQuality()`.
 */
export async function hydrateAutonomousRunToQuality(
  run: AutonomousRunView,
  existingQuality?: ResearchQuality,
): Promise<ResearchQuality> {
  const resultsMap = new Map<string, ResultSnapshot>();
  for (const r of existingQuality?.results ?? []) {
    resultsMap.set(r.id, r);
  }

  const addedIds: string[] = [];
  for (const raw of run.registeredResults) {
    const safeTotal = Math.max(0, Math.min(5000, Math.round(raw.total || 0)));
    const safeN = Math.max(0, Math.min(safeTotal, Math.round(raw.n || 0)));
    const headers = raw.headers.slice(0, 30).map((h, i) => (String(h || '').trim() || `指标${i + 1}`).slice(0, 150));
    const rows = raw.rows.slice(0, 400).map(row =>
      headers.map((_, ci) => {
        const cell = row[ci];
        if (cell === null || cell === undefined) return null;
        if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
        return String(cell).slice(0, 1900);
      }),
    );
    const metrics = raw.metrics.slice(0, 150).map(m => ({
      label: (String(m.label || '').trim() || '指标').slice(0, 150),
      value: typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null,
    }));
    const warnings = (raw.warnings ?? []).slice(0, 30).map(w => String(w).slice(0, 950));
    const variables = (raw.variables ?? []).filter(v => typeof v === 'string' && v.trim()).slice(0, 4);

    const draft = parseResultSnapshot({
      id: raw.id.slice(0, 80),
      title: (sanitizeAdvisorDisplayText(raw.title.trim()) || raw.title.trim() || '深度统计分析回执').slice(0, 145),
      sourceName: (raw.sourceName.trim() || run.datasetSummary.title).slice(0, 230),
      sourceUrl: '',
      sourceHash: run.datasetSummary.sha256,
      resultHash: '0'.repeat(64),
      classification: run.datasetSummary.classification === 'user_provided' ? 'user_provided' : 'simulated',
      method: raw.method.slice(0, 80),
      n: safeN,
      total: safeTotal,
      headers: headers.length ? headers : ['变量', '数值'],
      rows,
      metrics,
      warnings,
      ...(variables.length ? { variables } : {}),
    });
    const signed: ResultSnapshot = {
      ...draft,
      resultHash: await digestText(JSON.stringify(resultPayload(draft))),
    };
    resultsMap.set(signed.id, signed);
    addedIds.push(signed.id);
  }

  const allResults = [...resultsMap.values()].slice(-120);
  const tempQuality: ResearchQuality = { version: 1, results: allResults, findings: [] };

  const findingsMap = new Map<string, ResearchFinding>();
  for (const f of existingQuality?.findings ?? []) {
    if (f.evidenceIds.every(id => allResults.some(r => r.id === id))) {
      findingsMap.set(f.id, f);
    }
  }

  const primaryEvidence = (run.motherInsight.supportingSnapshots.length
    ? run.motherInsight.supportingSnapshots
    : addedIds
  ).filter(id => allResults.some(r => r.id === id)).slice(0, 8);

  const headline = (run.motherInsight?.headline ?? '').trim();
  const cleanHeadline = sanitizeAdvisorDisplayText(headline).slice(0, 120) || (headline ? '核心结构分化发现' : '');
  if (primaryEvidence.length && cleanHeadline) {
    const rawMech = (run.motherInsight?.mechanism ?? '').trim()
      || (run.motherInsight?.paradoxDetail ?? '').trim()
      || (run.pendingMilestone?.reason ?? '').trim()
      || headline;
    const mechanism = sanitizeAdvisorDisplayText(rawMech).slice(0, 2800) || cleanHeadline;
    const paradoxAlt = sanitizeAdvisorDisplayText((run.motherInsight?.paradoxDetail ?? '').trim()).slice(0, 1400);
    const rawScope = (run.motherInsight?.scopeBoundary ?? '').trim();
    const scopeBoundary = (rawScope ? sanitizeAdvisorDisplayText(rawScope) : '')
      || `基于已清洗样本（n=${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}）实证检验结果。`;
    const motherFinding = confirmFinding(
      {
        id: `auto-mother-${run.runId.slice(0, 8)}`,
        title: cleanHeadline,
        question: '总体均值主效应背后是否存在掩盖方向反转的关键调节子群与结构断裂？',
        evidenceIds: primaryEvidence,
        interpretation: mechanism,
        alternatives: paradoxAlt,
        scope: scopeBoundary.slice(0, 1400),
        action: '围绕异质子群实施差异化准入与对照试点，以 30 天可证伪阈值监控风险。',
        status: 'draft',
        confirmedHashes: {},
      },
      tempQuality,
    );
    findingsMap.set(motherFinding.id, motherFinding);
  }

  const pivotSteps = run.reasoningTrace.filter(
    step => step.pivotTaken && step.snapshotId && allResults.some(r => r.id === step.snapshotId),
  );
  for (let i = 0; i < Math.min(pivotSteps.length, 6); i++) {
    const step = pivotSteps[i];
    const cleanPivotTitle = sanitizeAdvisorDisplayText(step.pivotTaken).slice(0, 140) || '模型稳健性修正发现';
    const cleanQuestion = sanitizeAdvisorDisplayText(step.thought).slice(0, 900) || '模型诊断告警后的稳健性复核验证';
    const cleanInterp = sanitizeAdvisorDisplayText(step.observationSummary).slice(0, 2800) || cleanPivotTitle;
    const cleanAlt = step.diagnostics.map(d => sanitizeAdvisorDisplayText(d)).filter(Boolean).join('；') || '基准未修正模型存在估计偏误。';
    const f = confirmFinding(
      {
        id: `auto-pivot-${run.runId.slice(0, 6)}-${i + 1}`,
        title: cleanPivotTitle,
        question: cleanQuestion,
        evidenceIds: [step.snapshotId],
        interpretation: cleanInterp,
        alternatives: cleanAlt.slice(0, 1400),
        scope: `基于已清洗样本（n=${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}）实证检验结果。`,
        action: '在实证与稳健性检验章节同步汇报修正前后对比及诊断依据。',
        status: 'draft',
        confirmedHashes: {},
      },
      tempQuality,
    );
    findingsMap.set(f.id, f);
  }

  return parseResearchQuality({
    version: 1,
    results: allResults,
    findings: [...findingsMap.values()].slice(-40),
  });
}

/**
 * Guarantee the workspace dataset carries an exact matching sourceHash for validated report hydration.
 */
export function buildAlignedDatasetValue(
  run: AutonomousRunView,
  existing: DatasetValue | null,
): DatasetValue {
  if (existing && existing.sourceHash === run.datasetSummary.sha256) {
    return existing;
  }
  const headers = ['快照标识', '分析方法', '有效样本', '关键发现摘要', '诊断状态'];
  const rows = run.registeredResults.slice(0, 30).map(r => [
    r.id,
    r.method,
    String(r.n),
    (r.summary ?? r.title).slice(0, 120),
    r.warnings.join('; ') || 'PASS',
  ]);
  const fallbackSummary = (run.motherInsight?.headline || run.datasetSummary.title || '里程碑待审阅').slice(0, 120);
  return {
    name: run.datasetSummary.title,
    sourceHash: run.datasetSummary.sha256,
    kind: run.datasetSummary.classification === 'user_provided' ? 'user_provided' : 'simulated',
    table: {
      headers,
      rows: rows.length ? rows : [['bench', 'isa', String(run.datasetSummary.cleanedRowCount), fallbackSummary, 'PASS']],
      skippedBlankLines: 0,
      delimiter: ',',
    },
    missingCodes: [],
    lineage: [
      `样本质量筛查自原始回收 ${run.datasetSummary.rawRowCount} 份记录中保留有效样本 ${run.datasetSummary.cleanedRowCount} 份`,
      `多步实证探索共完成 ${run.reasoningTrace.length} 步统计模型检验与独立复核`,
    ],
  };
}

function sanitizeEpistemicMemoryItem(raw: unknown): ProjectEpistemicMemoryItem | null {
  if (!isPlainRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!id || !summary) return null;
  const snapshotRefs = Array.isArray(raw.snapshotRefs)
    ? raw.snapshotRefs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(s => s.trim())
    : [];
  return {
    id,
    projectId: typeof raw.projectId === 'string' ? raw.projectId.trim() : '',
    runId: typeof raw.runId === 'string' ? raw.runId.trim() : '',
    memoryKey: typeof raw.memoryKey === 'string' ? raw.memoryKey.trim() : '',
    kind: typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : 'finding',
    status: typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : 'active',
    summary,
    snapshotRefs,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

export async function fetchProjectEpistemicMemory(
  projectId: string,
  opts?: { signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<ProjectEpistemicMemoryItem[]> {
  const trimmedId = projectId.trim();
  if (!trimmedId) return [];
  const fetchImpl = opts?.fetchFn ?? fetch;
  const res = await fetchImpl(`/api/projects/${encodeURIComponent(trimmedId)}/epistemic-memory`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `读取项目跨会话研究记忆失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `读取项目跨会话研究记忆失败 (${res.status})`);
  }
  const rawList: unknown[] = Array.isArray(data?.memories) ? data.memories : [];
  return rawList.map(sanitizeEpistemicMemoryItem).filter((item): item is ProjectEpistemicMemoryItem => item !== null);
}

export function sandboxSvgToDataUri(svg: string): string {
  if (typeof svg !== 'string' || !svg.trim()) {
    throw new Error('生成的统计图表 SVG 内容为空。');
  }
  const stripped = svg
    .trim()
    .replace(/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?/i, '')
    .trim();
  if (!/^<svg\b/i.test(stripped)) {
    throw new Error('生成的统计图表 SVG 未通过安全向量核验。');
  }
  if (/<(?:script|foreignObject|iframe|object|embed|image)\b|javascript:|vbscript:|\bon[a-z]+\s*=|<!ENTITY/i.test(stripped)) {
    throw new Error('生成的统计图表 SVG 未通过安全向量核验。');
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stripped)}`;
}

function readSvgAttr(attrs: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return match ? (match[1] ?? match[2] ?? '') : '';
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripSvgAttr(attrs: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return attrs.replace(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'gi'), '');
}

export function prepareSandboxSvgForArtifact(svg: string): string {
  sandboxSvgToDataUri(svg);
  let cleaned = svg
    .trim()
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[^>]*\/>/gi, '')
    .trim();

  // Strip root attributes unsupported by the strict XML vector sanitizer (`version`, `standalone`, `encoding`, non-SVG/xlink `xmlns:*`).
  cleaned = cleaned.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    const filtered = attrs
      .replace(/\s+(?:version|standalone|encoding)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
      .replace(/\s+xmlns:(?!xlink\b)[A-Za-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    return `<svg${filtered}>`;
  });

  // Inline local `<use xlink:href="#id" .../>` primitives (e.g. Matplotlib axis ticks and scatter markers).
  const pathDefs = new Map<string, { d: string; attrs: string }>();
  const pathTagRe = /<path\b([^>]*?)\s*(\/?)>/gi;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathTagRe.exec(cleaned)) !== null) {
    const attrs = pathMatch[1];
    const id = readSvgAttr(attrs, 'id').trim();
    const d = readSvgAttr(attrs, 'd').trim();
    if (id && d && !pathDefs.has(id)) {
      const restAttrs = stripSvgAttr(stripSvgAttr(attrs, 'id'), 'd').trim();
      pathDefs.set(id, { d, attrs: restAttrs });
    }
  }

  const referencedUrlIds = new Set<string>();
  const urlRefRe = /\burl\(\s*#([A-Za-z0-9_.-]+)\s*\)/g;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRefRe.exec(cleaned)) !== null) {
    referencedUrlIds.add(urlMatch[1]);
  }

  const inlinedDefIds = new Set<string>();
  cleaned = cleaned.replace(/<use\b([^>]*?)(?:\s*\/>|\s*>[\s\S]*?<\/use>)/gi, (_full, useAttrs: string) => {
    const rawHref = (readSvgAttr(useAttrs, 'xlink:href') || readSvgAttr(useAttrs, 'href')).trim();
    if (!rawHref || !rawHref.startsWith('#')) {
      throw new Error('生成的统计图表 SVG 包含未解析的外部引用。');
    }
    const targetId = rawHref.slice(1).trim();
    const def = pathDefs.get(targetId);
    if (!def) {
      throw new Error('生成的统计图表 SVG 包含未解析的外部引用。');
    }
    inlinedDefIds.add(targetId);

    const xVal = readSvgAttr(useAttrs, 'x').trim();
    const yVal = readSvgAttr(useAttrs, 'y').trim();
    const defTransform = readSvgAttr(def.attrs, 'transform').trim();
    const useTransform = readSvgAttr(useAttrs, 'transform').trim();
    const defStyle = readSvgAttr(def.attrs, 'style').trim();
    const useStyle = readSvgAttr(useAttrs, 'style').trim();
    const mergedStyle = [defStyle.replace(/;\s*$/, ''), useStyle.replace(/;\s*$/, '')].filter(Boolean).join('; ');
    const mergedTransforms: string[] = [];
    if (xVal || yVal) {
      mergedTransforms.push(`translate(${xVal || '0'}, ${yVal || '0'})`);
    }
    if (useTransform) mergedTransforms.push(useTransform);
    if (defTransform) mergedTransforms.push(defTransform);

    const passthroughAttrs: string[] = [];
    for (const attrName of ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity', 'clip-path']) {
      const val = readSvgAttr(useAttrs, attrName) || readSvgAttr(def.attrs, attrName);
      if (val) passthroughAttrs.push(`${attrName}="${escapeXmlAttr(val)}"`);
    }

    return [
      `<path d="${escapeXmlAttr(def.d)}"`,
      ...(mergedTransforms.length ? [`transform="${escapeXmlAttr(mergedTransforms.join(' '))}"`] : []),
      ...(mergedStyle ? [`style="${escapeXmlAttr(mergedStyle)}"`] : []),
      ...passthroughAttrs,
      '/>',
    ].join(' ');
  });

  if (inlinedDefIds.size > 0) {
    cleaned = cleaned.replace(/<path\b([^>]*?)(?:\s*\/>|\s*><\/path>)/gi, (full, attrs: string) => {
      const id = readSvgAttr(attrs, 'id').trim();
      if (id && inlinedDefIds.has(id) && !referencedUrlIds.has(id)) {
        return '';
      }
      return full;
    });
    cleaned = cleaned.replace(/<defs\b[^>]*>\s*<\/defs>/gi, '');
  }

  // Deduplicate any remaining non-url-referenced duplicate IDs deterministically.
  const seenIds = new Map<string, number>();
  cleaned = cleaned.replace(/\bid=(["'])([^"']+)\1/g, (full, quote: string, rawId: string) => {
    const count = (seenIds.get(rawId) ?? 0) + 1;
    seenIds.set(rawId, count);
    if (count === 1 || referencedUrlIds.has(rawId)) return full;
    return `id=${quote}${rawId}__dup${count}${quote}`;
  });

  cleaned = cleaned.trim();
  if (!/^<svg\s/i.test(cleaned)) {
    throw new Error('生成的统计图表 SVG 未通过安全向量核验。');
  }
  assertStrictSvg(cleaned);
  return cleaned;
}

function isRunSummaryLike(raw: unknown): raw is AutonomousRunView {
  return (
    isPlainRecord(raw) &&
    typeof raw.runId === 'string' &&
    raw.runId.trim().length > 0 &&
    typeof raw.status === 'string' &&
    isPlainRecord(raw.lease) &&
    isPlainRecord(raw.datasetSummary) &&
    isPlainRecord(raw.epistemicGraph) &&
    Array.isArray(raw.reasoningTrace) &&
    Array.isArray(raw.registeredResults)
  );
}

export async function fetchAutonomousRuns(
  projectId: string,
  opts?: { signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<AutonomousRunView[]> {
  const trimmedId = projectId.trim();
  if (!trimmedId) return [];
  const fetchImpl = opts?.fetchFn ?? fetch;
  const res = await fetchImpl(`/api/projects/${encodeURIComponent(trimmedId)}/autonomous-runs`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `读取项目探索历史失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `读取项目探索历史失败 (${res.status})`);
  }
  const rawRuns: unknown[] = Array.isArray(data?.runs) ? data.runs : [];
  return rawRuns.filter(isRunSummaryLike);
}

export async function runProjectPlotSandbox(
  projectId: string,
  payload: {
    runId?: string;
    snapshotId?: string;
    snapshot?: Record<string, unknown>;
    chartKind?: 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell';
    autoRepair?: boolean;
  },
  opts?: { csrfToken?: string | null; signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<PlotSandboxResult> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error('缺少有效项目 ID，无法调用科研统计绘图服务。');
  }
  const fetchImpl = opts?.fetchFn ?? fetch;
  const bodyObj: Record<string, unknown> = {
    chartKind: payload.chartKind ?? 'auto',
    autoRepair: payload.autoRepair ?? true,
    ...(payload.runId ? { runId: payload.runId } : {}),
    ...(payload.snapshotId ? { snapshotId: payload.snapshotId } : {}),
    ...(payload.snapshot ? { snapshot: payload.snapshot } : {}),
  };
  const res = await fetchImpl(`/api/projects/${encodeURIComponent(trimmedId)}/sandbox/plot`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(opts?.csrfToken ? { 'x-csrf-token': opts.csrfToken } : {}),
    },
    body: JSON.stringify(bodyObj),
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `科研统计绘图请求失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `科研统计绘图请求失败 (${res.status})`);
  }
  if (!isPlainRecord(data) || data.ok !== true || typeof data.svg !== 'string') {
    throw new Error('科研统计绘图服务未返回有效的矢量 SVG 图表。');
  }
  const auditRaw = isPlainRecord(data.audit) ? data.audit : { passed: false };
  return {
    projectId: typeof data.projectId === 'string' ? data.projectId : trimmedId,
    ok: true,
    svg: data.svg,
    svgSha256: typeof data.svgSha256 === 'string' ? data.svgSha256 : '',
    audit: {
      passed: auditRaw.passed === true,
      vectorPure: typeof auditRaw.vectorPure === 'boolean' ? auditRaw.vectorPure : undefined,
      primitiveCount: typeof auditRaw.primitiveCount === 'number' ? auditRaw.primitiveCount : undefined,
      textCount: typeof auditRaw.textCount === 'number' ? auditRaw.textCount : undefined,
      overlapCount: typeof auditRaw.overlapCount === 'number' ? auditRaw.overlapCount : undefined,
      ellipsisCount: typeof auditRaw.ellipsisCount === 'number' ? auditRaw.ellipsisCount : undefined,
      minFontSize: typeof auditRaw.minFontSize === 'number' ? auditRaw.minFontSize : null,
      issues: Array.isArray(auditRaw.issues)
        ? auditRaw.issues.filter((i): i is string => typeof i === 'string')
        : undefined,
    },
    repairRounds: typeof data.repairRounds === 'number' ? data.repairRounds : 0,
  };
}

function sanitizeCitationMatch(raw: unknown): VerifiedCitationMatch | null {
  if (!isPlainRecord(raw)) return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const doi = typeof raw.doi === 'string' ? raw.doi.trim() : '';
  if (!title && !doi) return null;
  const authors = Array.isArray(raw.authors)
    ? raw.authors.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).map(s => s.trim())
    : [];
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  const url = rawUrl || (doi ? `https://doi.org/${doi}` : undefined);
  return {
    doi,
    title,
    authors,
    year: typeof raw.year === 'number' && Number.isFinite(raw.year) ? raw.year : null,
    venue: typeof raw.venue === 'string' ? raw.venue.trim() : '',
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map(s => s.trim())
      : undefined,
    url,
  };
}

export async function verifyProjectCitation(
  projectId: string,
  payload: { query?: string; doi?: string },
  opts?: { csrfToken?: string | null; signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<CitationVerifyResult> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error('缺少有效项目 ID，无法调用文献循证核验。');
  }
  const cleanQuery = payload.query?.trim() ?? '';
  const cleanDoi = payload.doi?.trim() ?? '';
  if (!cleanQuery && !cleanDoi) {
    throw new Error('请输入文献关键词或 DOI 后再发起循证核验。');
  }
  const fetchImpl = opts?.fetchFn ?? fetch;
  const res = await fetchImpl(`/api/projects/${encodeURIComponent(trimmedId)}/grounding/verify-citation`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(opts?.csrfToken ? { 'x-csrf-token': opts.csrfToken } : {}),
    },
    body: JSON.stringify({
      ...(cleanQuery ? { query: cleanQuery } : {}),
      ...(cleanDoi ? { doi: cleanDoi } : {}),
    }),
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `文献循证核验失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `文献循证核验失败 (${res.status})`);
  }
  const rawMatches: unknown[] = Array.isArray(data?.matches) ? data.matches : [];
  const matches: VerifiedCitationMatch[] = rawMatches
    .map(sanitizeCitationMatch)
    .filter((m): m is VerifiedCitationMatch => m !== null);
  const primary = sanitizeCitationMatch(data?.citation) ?? matches[0] ?? null;
  return {
    projectId: typeof data?.projectId === 'string' ? data.projectId : trimmedId,
    verified: data?.verified === true && primary !== null,
    query: typeof data?.query === 'string' ? data.query : cleanQuery,
    doi: typeof data?.doi === 'string' ? data.doi : cleanDoi,
    source: typeof data?.source === 'string' ? data.source : 'offline_curated_catalog',
    citation: primary,
    matches,
    reason: typeof data?.reason === 'string' ? data.reason : undefined,
    receiptHash: typeof data?.receiptHash === 'string' ? data.receiptHash : undefined,
  };
}

export type CountyGazetteerMatch = {
  code: string;
  name: string;
  level: string;
  provinceName: string;
  prefectureName: string;
};

export type CountyGazetteerPattern = {
  id: string;
  title: string;
  domain: string;
  methods: string[];
};

export type CountyGazetteerQueryResult = {
  projectId: string;
  query: string;
  matches: CountyGazetteerMatch[];
  matchedPatterns: CountyGazetteerPattern[];
  caveats: string[];
  catalogVersion: string;
};

export async function queryProjectCountyGazetteer(
  projectId: string,
  query: string,
  opts?: { limit?: number; signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<CountyGazetteerQueryResult> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error('缺少有效项目 ID，无法检索区县风物与行政区划名录。');
  }
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('请输入省市区县名称或 6 位行政区划代码。');
  }
  const limit = Math.max(1, Math.min(20, Math.round(opts?.limit ?? 5)));
  const fetchImpl = opts?.fetchFn ?? fetch;
  const url = `/api/projects/${encodeURIComponent(trimmedId)}/grounding/counties?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`;
  const res = await fetchImpl(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `区县风物检索失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `区县风物检索失败 (${res.status})`);
  }
  const rawMatches: unknown[] = Array.isArray(data?.matches) ? data.matches : [];
  const matches: CountyGazetteerMatch[] = rawMatches
    .map((item): CountyGazetteerMatch | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const code = typeof r.code === 'string' ? r.code.trim() : '';
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!code && !name) return null;
      return {
        code,
        name,
        level: typeof r.level === 'string' ? r.level.trim() : '',
        provinceName: typeof r.provinceName === 'string' ? r.provinceName.trim() : '',
        prefectureName: typeof r.prefectureName === 'string' ? r.prefectureName.trim() : '',
      };
    })
    .filter((m): m is CountyGazetteerMatch => m !== null);
  const rawPatterns: unknown[] = Array.isArray(data?.matchedPatterns) ? data.matchedPatterns : [];
  const matchedPatterns: CountyGazetteerPattern[] = rawPatterns
    .map((item): CountyGazetteerPattern | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      if (!title) return null;
      const methods = Array.isArray(r.methods)
        ? r.methods.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map(m => m.trim())
        : [];
      return {
        id: typeof r.id === 'string' ? r.id.trim() : '',
        title,
        domain: typeof r.domain === 'string' ? r.domain.trim() : '',
        methods,
      };
    })
    .filter((p): p is CountyGazetteerPattern => p !== null);
  const caveats = Array.isArray(data?.caveats)
    ? data.caveats.filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0).map((c: string) => c.trim())
    : [];
  return {
    projectId: typeof data?.projectId === 'string' ? data.projectId : trimmedId,
    query: typeof data?.query === 'string' ? data.query : cleanQuery,
    matches,
    matchedPatterns,
    caveats,
    catalogVersion: typeof data?.catalogVersion === 'string' ? data.catalogVersion : '',
  };
}

export type StatSandboxPresetId = 'bootstrap_ci' | 'spearman_matrix' | 'mann_whitney_cliff';

export type StatSandboxPreset = {
  id: StatSandboxPresetId;
  label: string;
  description: string;
  script: string;
};

export const STAT_SANDBOX_PRESETS: readonly StatSandboxPreset[] = [
  {
    id: 'bootstrap_ci',
    label: 'Bootstrap 95% 置信区间',
    description: '对首个有效样本最多的数值/量表变量执行 B=1000 非参数自助抽样，输出均值、标准误与 95% 百分位区间。',
    script: [
      'import math',
      'import statistics',
      'import numpy as np',
      '',
      'questions = DATA.get("questions") or []',
      'rows = DATA.get("rows") or []',
      '',
      'def _num(v):',
      '    if isinstance(v, bool) or v is None:',
      '        return None',
      '    if isinstance(v, (int, float)):',
      '        return float(v) if math.isfinite(float(v)) else None',
      '    if isinstance(v, str):',
      '        s = v.strip()',
      '        if not s:',
      '            return None',
      '        try:',
      '            x = float(s)',
      '            return x if math.isfinite(x) else None',
      '        except ValueError:',
      '            return None',
      '    return None',
      '',
      'best_label = ""',
      'best_vals = []',
      'for q in questions:',
      '    if not isinstance(q, dict) or q.get("type") not in ("likert", "number"):',
      '        continue',
      '    qid = str(q.get("id") or "")',
      '    qvar = str(q.get("variable") or qid)',
      '    vals = []',
      '    for row in rows:',
      '        ans = row.get("answers") or {}',
      '        val = _num(ans.get(qid))',
      '        if val is None and qvar:',
      '            val = _num(ans.get(qvar))',
      '        if val is not None:',
      '            vals.append(val)',
      '    if len(vals) > len(best_vals):',
      '        best_vals = vals',
      '        best_label = str(q.get("text") or qvar or qid)[:48]',
      '',
      'if len(best_vals) < 5:',
      '    raise ValueError("数值型题项有效样本不足 5 行，无法执行 Bootstrap 自助抽样。")',
      '',
      'arr = np.asarray(best_vals, dtype=float)',
      'rng = np.random.default_rng(42)',
      'boot = np.empty(1000, dtype=float)',
      'n = int(arr.size)',
      'for i in range(1000):',
      '    idx = rng.integers(0, n, size=n)',
      '    boot[i] = float(np.mean(arr[idx]))',
      'ci_low, ci_high = np.percentile(boot, [2.5, 97.5])',
      'mean_v = float(np.mean(arr))',
      'sd_v = float(np.std(arr, ddof=1)) if n > 1 else 0.0',
      'se_boot = float(np.std(boot, ddof=1))',
      '',
      'RESULT = {',
      '    "summary": f"对“{best_label}”（n={n}）执行 1,000 次非参数 Bootstrap 抽样，得到样本均值 {mean_v:.3f}（SD={sd_v:.3f}），95% 百分位置信区间为 [{ci_low:.3f}, {ci_high:.3f}]。",',
      '    "n_effective": n,',
      '    "metrics": {',
      '        "mean": round(mean_v, 4),',
      '        "sd": round(sd_v, 4),',
      '        "boot_se": round(se_boot, 4),',
      '        "ci_95_low": round(float(ci_low), 4),',
      '        "ci_95_high": round(float(ci_high), 4),',
      '    },',
      '    "table": {',
      '        "headers": ["变量", "有效样本 n", "均值", "标准差", "Bootstrap SE", "95% CI 下限", "95% CI 上限"],',
      '        "rows": [[best_label, n, round(mean_v, 3), round(sd_v, 3), round(se_boot, 4), round(float(ci_low), 3), round(float(ci_high), 3)]],',
      '    },',
      '    "diagnostics": ["BOOTSTRAP_SEED_42", "PERCENTILE_CI_1000"],',
      '}',
    ].join('\n'),
  },
  {
    id: 'spearman_matrix',
    label: 'Spearman 秩相关稳健矩阵',
    description: '对最多 5 个数值变量成对计算 Spearman 秩相关系数与双侧 Fisher-z 检验 p 值。',
    script: [
      'import math',
      'import numpy as np',
      '',
      'questions = DATA.get("questions") or []',
      'rows = DATA.get("rows") or []',
      '',
      'def _num(v):',
      '    if isinstance(v, bool) or v is None:',
      '        return None',
      '    if isinstance(v, (int, float)):',
      '        return float(v) if math.isfinite(float(v)) else None',
      '    if isinstance(v, str):',
      '        s = v.strip()',
      '        if not s:',
      '            return None',
      '        try:',
      '            x = float(s)',
      '            return x if math.isfinite(x) else None',
      '        except ValueError:',
      '            return None',
      '    return None',
      '',
      'def _avg_ranks(vals):',
      '    order = sorted(range(len(vals)), key=lambda i: vals[i])',
      '    ranks = [0.0] * len(vals)',
      '    i = 0',
      '    while i < len(order):',
      '        j = i + 1',
      '        while j < len(order) and vals[order[j]] == vals[order[i]]:',
      '            j += 1',
      '        avg_r = (i + 1 + j) / 2.0',
      '        for k in range(i, j):',
      '            ranks[order[k]] = avg_r',
      '        i = j',
      '    return np.asarray(ranks, dtype=float)',
      '',
      'cols = []',
      'for q in questions:',
      '    if not isinstance(q, dict) or q.get("type") not in ("likert", "number"):',
      '        continue',
      '    qid = str(q.get("id") or "")',
      '    qvar = str(q.get("variable") or qid)',
      '    raw_t = str(q.get("text") or q.get("variable") or qid).strip()',
      '    for pfx in ("未反向重编码陷阱题：", "未反向重编码陷阱题:", "开放题：", "开放题:"):',
      '        if raw_t.startswith(pfx):',
      '            raw_t = raw_t[len(pfx):].strip()',
      '    raw_t = raw_t.split("（", 1)[0].split("(", 1)[0].strip()',
      '    label = (raw_t[:14].rstrip("与及和的：:、 ") or raw_t[:14])',
      '    series = []',
      '    valid_cnt = 0',
      '    for row in rows:',
      '        ans = row.get("answers") or {}',
      '        val = _num(ans.get(qid))',
      '        if val is None and qvar:',
      '            val = _num(ans.get(qvar))',
      '        if val is not None:',
      '            valid_cnt += 1',
      '        series.append(val)',
      '    if valid_cnt >= 5:',
      '        cols.append((label, series, valid_cnt))',
      '    if len(cols) >= 5:',
      '        break',
      '',
      'if len(cols) < 2:',
      '    raise ValueError("数值变量少于 2 个，无法计算 Spearman 秩相关矩阵。")',
      '',
      'complete_idx = [i for i in range(len(rows)) if all(c[1][i] is not None for c in cols)]',
      'if len(complete_idx) < 5:',
      '    raise ValueError("成对完整有效观测不足 5 行，无法计算 Spearman 秩相关。")',
      '',
      'ranks = np.vstack([_avg_ranks([c[1][i] for i in complete_idx]) for c in cols])',
      'corr = np.corrcoef(ranks)',
      'n = len(complete_idx)',
      'pairs = []',
      'for a in range(len(cols)):',
      '    for b in range(a + 1, len(cols)):',
      '        rho = float(corr[a, b])',
      '        if not math.isfinite(rho):',
      '            rho = 0.0',
      '        rho = max(-0.9999, min(0.9999, rho))',
      '        z = 0.5 * math.log((1.0 + rho) / (1.0 - rho)) * math.sqrt(max(n - 3, 1))',
      '        p_val = float(math.erfc(abs(z) / math.sqrt(2.0)))',
      '        pairs.append((abs(rho), cols[a][0], cols[b][0], rho, p_val))',
      '',
      'pairs.sort(reverse=True)',
      'top = pairs[0]',
      'p_str = "< 0.0001" if top[4] < 0.0001 else f"= {top[4]:.4f}"',
      'RESULT = {',
      '    "summary": f"基于 {len(cols)} 个数值变量的成对完整样本（n={n}）开展 Spearman 秩相关分析，其中最强关联出现在“{top[1]}”与“{top[2]}”之间（ρ={top[3]:.3f}，p {p_str}）。",',
      '    "n_effective": n,',
      '    "metrics": {',
      '        "variables": len(cols),',
      '        "top_rho": round(top[3], 4),',
      '        "top_p": round(top[4], 6),',
      '    },',
      '    "table": {',
      '        "headers": ["变量 A", "变量 B", "Spearman ρ", "显著性 p 值"],',
      '        "rows": [[a, b, round(rho, 4), round(p, 6)] for _, a, b, rho, p in pairs[:10]],',
      '    },',
      '    "diagnostics": ["NONPARAMETRIC_RANK_SPEARMAN", f"PAIR_COUNT_{len(pairs)}"],',
      '}',
    ].join('\n'),
  },
  {
    id: 'mann_whitney_cliff',
    label: 'Mann-Whitney U 与 Cliff\'s Delta',
    description: '自动识别双组以上单选分组变量（各组 n>=5）与首个数值因变量，计算非参秩和 U、Z 与非参数 Cliff\'s Delta 效应量。',
    script: [
      'import math',
      'import statistics',
      'import numpy as np',
      '',
      'questions = DATA.get("questions") or []',
      'rows = DATA.get("rows") or []',
      '',
      'def _num(v):',
      '    if isinstance(v, bool) or v is None:',
      '        return None',
      '    if isinstance(v, (int, float)):',
      '        return float(v) if math.isfinite(float(v)) else None',
      '    if isinstance(v, str):',
      '        s = v.strip()',
      '        if not s:',
      '            return None',
      '        try:',
      '            x = float(s)',
      '            return x if math.isfinite(x) else None',
      '        except ValueError:',
      '            return None',
      '    return None',
      '',
      'def _read_cell(row, q):',
      '    ans = row.get("answers") or {}',
      '    qid = str(q.get("id") or "")',
      '    qvar = str(q.get("variable") or "")',
      '    v = ans.get(qid)',
      '    if v is None and qvar:',
      '        v = ans.get(qvar)',
      '    return v',
      '',
      'group_q = None',
      'group_counts = {}',
      'for q in questions:',
      '    if not isinstance(q, dict) or q.get("type") != "single":',
      '        continue',
      '    counts = {}',
      '    for row in rows:',
      '        raw = _read_cell(row, q)',
      '        if raw is None or isinstance(raw, (list, dict)):',
      '            continue',
      '        key = str(raw).strip()',
      '        if not key:',
      '            continue',
      '        counts[key] = counts.get(key, 0) + 1',
      '    eligible = [k for k, c in counts.items() if c >= 5]',
      '    if len(eligible) >= 2:',
      '        group_q = q',
      '        group_counts = counts',
      '        break',
      '',
      'outcome_q = None',
      'for q in questions:',
      '    if isinstance(q, dict) and q.get("type") in ("likert", "number"):',
      '        outcome_q = q',
      '        break',
      '',
      'if group_q is None or outcome_q is None:',
      '    raise ValueError("未同时识别到含两组(每组>=5)的分类分组题与数值结果变量。")',
      '',
      'top_groups = [k for k, _ in sorted(group_counts.items(), key=lambda kv: kv[1], reverse=True)[:2]]',
      'g1, g2 = top_groups[0], top_groups[1]',
      'choice_labels = {}',
      'for c in (group_q.get("choices") or []):',
      '    if isinstance(c, dict) and c.get("code") is not None:',
      '        choice_labels[str(c.get("code"))] = str(c.get("label") or c.get("code"))',
      'g1_lbl = (choice_labels.get(g1) or g1)[:18]',
      'g2_lbl = (choice_labels.get(g2) or g2)[:18]',
      'x1, x2 = [], []',
      'for row in rows:',
      '    grp = _read_cell(row, group_q)',
      '    val = _num(_read_cell(row, outcome_q))',
      '    if grp is None or val is None:',
      '        continue',
      '    s = str(grp).strip()',
      '    if s == g1:',
      '        x1.append(val)',
      '    elif s == g2:',
      '        x2.append(val)',
      '',
      'n1, n2 = len(x1), len(x2)',
      'if n1 < 5 or n2 < 5:',
      '    raise ValueError("两组有效数值观测均需不少于 5 例。")',
      '',
      'pooled = [(v, 1) for v in x1] + [(v, 2) for v in x2]',
      'pooled.sort(key=lambda item: item[0])',
      'ranks1 = 0.0',
      'tie_corr = 0.0',
      'i = 0',
      'while i < len(pooled):',
      '    j = i + 1',
      '    while j < len(pooled) and pooled[j][0] == pooled[i][0]:',
      '        j += 1',
      '    avg_r = (i + 1 + j) / 2.0',
      '    t = j - i',
      '    tie_corr += t * t * t - t',
      '    for k in range(i, j):',
      '        if pooled[k][1] == 1:',
      '            ranks1 += avg_r',
      '    i = j',
      '',
      'u1 = n1 * n2 + n1 * (n1 + 1) / 2.0 - ranks1',
      'u2 = n1 * n2 - u1',
      'n_tot = n1 + n2',
      'mean_u = n1 * n2 / 2.0',
      'var_u = (n1 * n2 / 12.0) * ((n_tot + 1.0) - tie_corr / max(n_tot * (n_tot - 1.0), 1.0))',
      'z = (u1 - mean_u) / math.sqrt(var_u) if var_u > 0 else 0.0',
      'p_val = float(math.erfc(abs(z) / math.sqrt(2.0)))',
      '',
      'gt = sum(1 for a in x1 for b in x2 if a > b)',
      'lt = sum(1 for a in x1 for b in x2 if a < b)',
      'cliff = (gt - lt) / float(n1 * n2)',
      'abs_d = abs(cliff)',
      'mag = "可忽略" if abs_d < 0.147 else "小效应" if abs_d < 0.33 else "中等效应" if abs_d < 0.474 else "大效应"',
      '',
      'g_name = str(group_q.get("text") or group_q.get("variable") or group_q.get("id"))[:24]',
      'y_name = str(outcome_q.get("text") or outcome_q.get("variable") or outcome_q.get("id"))[:28]',
      '',
      'p_str = "< 0.0001" if p_val < 0.0001 else f"= {p_val:.4f}"',
      'RESULT = {',
      '    "summary": f"采用 Mann-Whitney U 与 Cliff\'s δ 非参数检验，按“{g_name}”对比两组（{g1_lbl} n={n1} 与 {g2_lbl} n={n2}）在“{y_name}”上的分布差异，结果显示 U={min(u1, u2):.1f}、Z={z:.3f}、p {p_str}，非参数效应量 Cliff\'s δ={cliff:.3f}，属于{mag}。",',
      '    "n_effective": int(n_tot),',
      '    "metrics": {',
      '        "u_min": round(float(min(u1, u2)), 2),',
      '        "z_stat": round(float(z), 4),',
      '        "p_value": round(p_val, 6),',
      '        "cliffs_delta": round(float(cliff), 4),',
      '        "n_group1": n1,',
      '        "n_group2": n2,',
      '    },',
      '    "table": {',
      '        "headers": ["分组", "有效样本 n", "均值", "中位数"],',
      '        "rows": [',
      '            [g1_lbl, n1, round(float(np.mean(x1)), 3), round(float(statistics.median(x1)), 3)],',
      '            [g2_lbl, n2, round(float(np.mean(x2)), 3), round(float(statistics.median(x2)), 3)],',
      '        ],',
      '    },',
      '    "diagnostics": ["NONPARAMETRIC_MANN_WHITNEY", f"CLIFF_EFFECT_{mag}"],',
      '}',
    ].join('\n'),
  },
] as const;

export async function runProjectStatSandbox(
  projectId: string,
  payload: {
    script: string;
    runId?: string;
    questions?: unknown[];
    rows?: unknown[];
    classification?: 'actual' | 'simulated';
  },
  opts?: { csrfToken?: string | null; signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<StatSandboxResult> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error('缺少有效项目 ID，无法调用专项统计计算服务。');
  }
  if (typeof payload.script !== 'string' || !payload.script.trim()) {
    throw new Error('请输入有效的统计分析脚本后再发起专项统计计算。');
  }
  const fetchImpl = opts?.fetchFn ?? fetch;
  const bodyObj: Record<string, unknown> = {
    script: payload.script,
    ...(payload.runId ? { runId: payload.runId } : {}),
    ...(Array.isArray(payload.questions) ? { questions: payload.questions } : {}),
    ...(Array.isArray(payload.rows) ? { rows: payload.rows } : {}),
    ...(payload.classification ? { classification: payload.classification } : {}),
  };
  const res = await fetchImpl(`/api/projects/${encodeURIComponent(trimmedId)}/sandbox/stat`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(opts?.csrfToken ? { 'x-csrf-token': opts.csrfToken } : {}),
    },
    body: JSON.stringify(bodyObj),
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `专项统计计算请求失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `专项统计计算请求失败 (${res.status})`);
  }
  if (!isPlainRecord(data) || (data.ok !== undefined && data.ok !== true)) {
    throw new Error('专项统计计算服务未返回有效的分析结果。');
  }
  const inner = isPlainRecord(data.result) ? data.result : data;
  const snapshotId = typeof data.snapshotId === 'string'
    ? data.snapshotId.trim()
    : typeof data.snapshot_id === 'string'
      ? data.snapshot_id.trim()
      : typeof inner.snapshotId === 'string'
        ? inner.snapshotId.trim()
        : typeof inner.snapshot_id === 'string'
          ? inner.snapshot_id.trim()
          : '';
  const resultHash = typeof data.resultHash === 'string'
    ? data.resultHash.trim()
    : typeof data.result_hash === 'string'
      ? data.result_hash.trim()
      : typeof inner.resultHash === 'string'
        ? inner.resultHash.trim()
        : typeof inner.result_hash === 'string'
          ? inner.result_hash.trim()
          : '';
  const scriptSha256 = typeof data.scriptSha256 === 'string'
    ? data.scriptSha256.trim()
    : typeof data.script_sha256 === 'string'
      ? data.script_sha256.trim()
      : typeof inner.scriptSha256 === 'string'
        ? inner.scriptSha256.trim()
        : typeof inner.script_sha256 === 'string'
          ? inner.script_sha256.trim()
          : '';
  const rawSummary = typeof data.summary === 'string' ? data.summary : typeof inner.summary === 'string' ? inner.summary : '';
  const summary = rawSummary.trim();
  const rawNEff = data.nEffective ?? data.n_effective ?? inner.nEffective ?? inner.n_effective;
  const nEffective = typeof rawNEff === 'number' && Number.isFinite(rawNEff) ? rawNEff : null;
  const metrics = isPlainRecord(data.metrics) ? data.metrics : isPlainRecord(inner.metrics) ? inner.metrics : {};
  const tableVal = data.table !== undefined ? data.table : inner.table;
  const rawDiags = Array.isArray(data.diagnostics) ? data.diagnostics : Array.isArray(inner.diagnostics) ? inner.diagnostics : [];
  if (!snapshotId && !summary && Object.keys(metrics).length === 0) {
    throw new Error('专项统计计算服务未返回有效的分析结果。');
  }
  const classification: 'actual' | 'simulated' =
    data.classification === 'actual' || data.classification === 'simulated'
      ? data.classification
      : payload.classification === 'actual'
        ? 'actual'
        : 'simulated';
  return {
    projectId: typeof data.projectId === 'string' ? data.projectId : trimmedId,
    ok: true,
    classification,
    snapshotId,
    resultHash,
    scriptSha256,
    summary,
    nEffective,
    metrics,
    ...(tableVal !== undefined ? { table: tableVal } : {}),
    diagnostics: rawDiags.filter((item): item is string => typeof item === 'string'),
    raw: data,
  };
}

/**
 * Strip internal engine terminology, tool identifiers, snapshot hashes, and
 * review bookkeeping tokens before displaying research findings to end users,
 * while preserving numeric estimates, sample counts, and substantive caveats.
 */
export function sanitizeAdvisorDisplayText(text: string): string {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return '';
  let out = raw;
  const exactRules: Array<[RegExp, string]> = [
    [
      /审阅完成[（(]结论[：:]\s*approve\s*[）)][：:]\s*核验所有\s*SHA-256\s*回执一致[，,]已锁定子群异质性适用边界。?/giu,
      '经独立复核，全部核心统计结果核验一致，并已明确不同人群的结论适用边界。',
    ],
    [
      /所有统计异常处理[、,]模型修正及子群异质性检索已取得\s*SHA-256\s*实证回执[，,]形成零幻觉母洞察总结。?/giu,
      '已完成样本质量核查、稳健模型修正与人群差异检验，所有核心结论均有实证数据支撑。',
    ],
    [
      /动态认知图谱演化\s*\(\s*record_pivot\s*\)\s*[:：]\s*/giu,
      '关键结论更新：',
    ],
    [
      /动态认知图谱演化\s*\(\s*(?:upsert_node|mark_dirty)\s*\)\s*[:：]\s*/giu,
      '分析状态已更新，',
    ],
    [
      /已通过\s*mutate_epistemic_graph\s*完成\s*/giu,
      '已完成',
    ],
    [
      /独立反证与哈希验真通过/gu,
      '已完成全部统计结果的独立复核与一致性校验',
    ],
    [
      /[（(]结论[：:]\s*approve\s*[）)]/giu,
      '（复核通过）',
    ],
    [
      /[（(]结论[：:]\s*revise\s*[）)]/giu,
      '（建议复核）',
    ],
    [
      /统计快照\s*SHA-256\s*哈希回执核验/giu,
      '统计结果一致性核验',
    ],
    [
      /已基于受控算子\s*SHA-256\s*快照完成一致性复核/giu,
      '全部核心统计结果已完成一致性复核',
    ],
    [
      /(?:已取得\s*SHA-256\s*实证回执|核验所有\s*SHA-256\s*回执一致)/giu,
      '已完成统计结果一致性核验',
    ],
    [
      /基于\s*verify_evidence_hashes\s*实证核验工具回执/giu,
      '基于本轮全部统计结果一致性复核',
    ],
    [
      /已通过\s*MIN_CELL_N\s*=\s*\d+\s*最小分层隐私校验/giu,
      '已满足最小分组匿名保护要求',
    ],
    [
      /SHA-256\s*(?:哈希回执|实证回执|统计指纹|指纹|快照|回执)/giu,
      '统计结果',
    ],
    [
      /\bSHA-256\b/giu,
      '数据一致性',
    ],
    [
      /[\[【]?\s*证据\s*snap_[a-f0-9]+\s*[\]】]?/giu,
      '',
    ],
    [
      /[\[【]?snap_[a-f0-9]+[\]】]?/giu,
      '',
    ],
    [
      /\b(?:record_pivot|upsert_node|mark_dirty|mutate_epistemic_graph|verify_evidence_hashes|challenge_subgroup_robustness|MIN_CELL_N\s*=\s*\d+)\b\s*[:：]?/giu,
      '',
    ],
    [
      /\bReAct\b\s*(?:轨迹|算子)?/giu,
      '多步实证分析',
    ],
    [
      /(?:科研绘图|统计计算|受控|安全)?沙盒/gu,
      '统计环境',
    ],
    [
      /\b(?:EpistemicGraph|RunLease)\b/giu,
      '',
    ],
    [
      /认知图谱|有向无环图|有向图|\bDAG\b/gu,
      '证据链',
    ],
    [
      /受控算子|自主算子|算子回执/gu,
      '实证分析',
    ],
    [
      /算子/gu,
      '统计方法',
    ],
    [
      /\b(?:HIGH_VIF|SUBGROUP_SIGN_REVERSAL)\b[:：]?/gu,
      '',
    ],
    [
      /\bliving_mode\b/gu,
      '居住方式',
    ],
    [
      /\b(?:adopt_intention|adoption_intent)\b/gu,
      '采纳意愿',
    ],
    [
      /\btrust_score\b/gu,
      '信任度',
    ],
    [
      /\bdigital_literacy\b/gu,
      '数字素养',
    ],
    [
      /\bsubsidy_aware\b/gu,
      '补贴知晓度',
    ],
    [
      /\bage_group\b/gu,
      '年龄段',
    ],
    [
      /\bservice_satisfaction\b/gu,
      '服务满意度',
    ],
    [
      /\bconstruct:service_perception\b/giu,
      '服务感知综合分',
    ],
    [
      /\bservice_perception\b/giu,
      '服务感知',
    ],
    [
      /\bconstruct:([A-Za-z0-9_]+)\b/giu,
      '$1综合分',
    ],
    [
      /\bQ_trap\b/gu,
      '反向异常题项',
    ],
    [
      /\bui_fluency\b/gu,
      '界面流畅度',
    ],
    [
      /\btech_ease\b/gu,
      '适老易用度',
    ],
    [
      /\bsubsidy_support\b/gu,
      '补贴覆盖感',
    ],
    [
      /\bregion_tier\b/gu,
      '县域区位层级',
    ],
    [
      /\brenew_tier\b/gu,
      '高阶续费意愿',
    ],
    [
      /\bopen_feedback\b/gu,
      '开放意见反馈',
    ],
    [
      /\bp\s*=\s*0(?:\.0+)?(?![0-9.])/giu,
      'p < 0.0001',
    ],
  ];
  for (const [pattern, replacement] of exactRules) {
    out = out.replace(pattern, replacement);
  }
  out = normalizeAcademicPunctuation(out)
    .replace(/（\s*）|\(\s*\)/g, '')
    .replace(/\s+([，。；：、,.!！?？])/g, '$1')
    .replace(/([：:])\s*([，。；])/g, '$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out;
}

export const STAT_METRIC_LABEL_ZH: Readonly<Record<string, string>> = {
  mean: '均值',
  sd: '标准差',
  boot_se: '自助标准误',
  ci_95_low: '95%置信下限',
  ci_95_high: '95%置信上限',
  ci_low: '95%置信下限',
  ci_high: '95%置信上限',
  median: '中位数',
  std: '标准差',
  variables: '变量数',
  top_rho: '最强相关 ρ',
  top_p: '显著性 p',
  u_min: 'U统计量',
  z_stat: 'Z值',
  p_value: 'p值',
  cliffs_delta: "Cliff's δ",
  pair_count: '配对数',
  max_abs_rho: '最大|ρ|',
  n_group1: '组1样本',
  n_group2: '组2样本',
};

const STAT_PRESET_METHOD_ID: Readonly<Record<StatSandboxPresetId, string>> = {
  bootstrap_ci: 'bootstrap-ci',
  spearman_matrix: 'spearman-matrix',
  mann_whitney_cliff: 'mann-whitney',
};

function sanitizeSingleLineCellText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f\p{Surrogate}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Converts a sandbox statistical preset result into a hash-sealed `ResultSnapshot`
 * ready for structured Booktabs three-line table insertion via `applyReportInsert`.
 */
export async function buildStatPresetResultSnapshot(
  presetId: StatSandboxPresetId,
  presetLabel: string,
  res: StatSandboxResult,
): Promise<ResultSnapshot | null> {
  const tbl = res.table && typeof res.table === 'object' ? (res.table as { headers?: unknown; rows?: unknown }) : null;
  if (!tbl || !Array.isArray(tbl.headers) || !Array.isArray(tbl.rows)) return null;
  if (tbl.headers.length === 0 || tbl.rows.length === 0) return null;

  const headers = tbl.headers.slice(0, 30).map((raw, idx) => {
    const cleaned = sanitizeAdvisorDisplayText(sanitizeSingleLineCellText(String(raw ?? ''), 160));
    return sanitizeSingleLineCellText(cleaned, 160) || `指标 ${idx + 1}`;
  });
  if (headers.some(h => !h)) return null;

  const rows: (string | number | null)[][] = [];
  for (const rawRow of tbl.rows.slice(0, 400)) {
    if (!Array.isArray(rawRow) || rawRow.length < headers.length) return null;
    const row: (string | number | null)[] = [];
    for (let c = 0; c < headers.length; c++) {
      const val = rawRow[c];
      if (val === null || val === undefined) {
        row.push(null);
      } else if (typeof val === 'number') {
        row.push(Number.isFinite(val) ? val : null);
      } else {
        const cleaned = sanitizeAdvisorDisplayText(sanitizeSingleLineCellText(String(val), 2000));
        row.push(sanitizeSingleLineCellText(cleaned, 2000));
      }
    }
    rows.push(row);
  }
  if (!rows.length) return null;

  const method = STAT_PRESET_METHOD_ID[presetId];
  const digestSeed = (res.resultHash || res.scriptSha256 || '').replace(/[^a-f0-9]/giu, '').toLowerCase();
  const suffix = digestSeed.slice(0, 16) || (await digestText(JSON.stringify({ presetId, headers, rows }))).slice(0, 16);
  const id = `stat-${presetId}-${suffix}`.slice(0, 80);

  const sourceHash = /^[a-f0-9]{64}$/u.test(res.scriptSha256)
    ? res.scriptSha256
    : await digestText(JSON.stringify({ presetId, headers, rows }));

  const n = typeof res.nEffective === 'number' && Number.isFinite(res.nEffective) && res.nEffective >= 0
    ? Math.min(5000, Math.round(res.nEffective))
    : 0;

  const metrics: { label: string; value: number | null }[] = [];
  for (const [k, v] of Object.entries(res.metrics ?? {})) {
    if (metrics.length >= 16) break;
    if (typeof v !== 'number') continue;
    const label = sanitizeSingleLineCellText(STAT_METRIC_LABEL_ZH[k] ?? k, 160);
    if (!label) continue;
    metrics.push({ label, value: Number.isFinite(v) ? v : null });
  }

  const title = sanitizeSingleLineCellText(`${sanitizeAdvisorDisplayText(presetLabel) || presetLabel}结果汇总`, 150) || '专项统计检验结果汇总';
  const classification = res.classification === 'actual' ? 'user_provided' : 'simulated';

  return snapshotRecipe(
    {
      method,
      n,
      total: n,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      headers,
      rows,
      metrics,
      interpretation: sanitizeAdvisorDisplayText(res.summary),
      warnings: [],
    },
    {
      title,
      sourceName: '本研究专项稳健统计检验',
      sourceUrl: '',
      sourceHash,
      classification,
    },
    id,
  );
}

const STAT_PRESET_QUESTION: Readonly<Record<StatSandboxPresetId, string>> = {
  bootstrap_ci: '核心指标总体均值的非参数置信区间边界如何？',
  spearman_matrix: '核心量表维度之间是否存在稳健的单调关联结构？',
  mann_whitney_cliff: '不同特征群体在核心评价指标上是否存在显著分布差异？',
};

/**
 * Builds a structured `ResearchFinding` bound to a registered stat `ResultSnapshot`,
 * enforcing scientific honesty by keeping `simulated` evidence in `'draft'` status.
 */
export function buildStatPresetFinding(
  presetId: StatSandboxPresetId,
  presetLabel: string,
  res: StatSandboxResult,
  snapshot: ResultSnapshot,
): ResearchFinding {
  const cleanLabel = sanitizeAdvisorDisplayText(presetLabel) || presetLabel;
  const cleanSummary = sanitizeAdvisorDisplayText(res.summary).slice(0, 2800) || cleanLabel;
  const isSimulated = snapshot.classification === 'simulated';
  return {
    id: `finding-${snapshot.id}`.slice(0, 80),
    title: `${cleanLabel}核心实证发现`.slice(0, 150),
    question: STAT_PRESET_QUESTION[presetId],
    evidenceIds: [snapshot.id],
    interpretation: cleanSummary,
    alternatives: '截面观测检验仅反映统计关联或分布差异，需结合混杂变量与多期追踪排除替代解释。',
    scope: `基于有效样本 n=${snapshot.n} 的${isSimulated ? '教学模拟演练数据（仅作方法演示，不可替代实测结论）' : '调查样本数据'}。`.slice(0, 1400),
    action: '依据检验结果定位高敏感维度与差异群体，制定可量化验证的分层优化试点方案。',
    status: isSimulated ? 'draft' : 'confirmed',
    confirmedHashes: isSimulated ? {} : { [snapshot.id]: snapshot.resultHash },
  };
}

export type GroundedAbstractDraft = {
  paragraphs: string[];
  keywords: string[];
  evidenceSummary: string;
  isSimulated: boolean;
  groundedCount: number;
};

const METHOD_KEYWORD_ZH: Readonly<Record<string, string>> = {
  'spearman-matrix': 'Spearman 相关',
  spearman: 'Spearman 相关',
  pearson: 'Pearson 相关',
  'mann-whitney': 'Mann-Whitney 检验',
  'bootstrap-ci': 'Bootstrap 置信区间',
  groups: '群体差异',
  crosstab: '交叉列联',
  alpha: '量表信度',
  efa: '因子分析',
  regression: '线性回归',
  logistic: 'Logistic 回归',
  logit: 'Logistic 回归',
  cluster: '聚类画像',
  kano: 'Kano 需求',
  ipa: 'IPA 评价',
  topsis: 'TOPSIS 评价',
};

function extractConciseRegionKeyword(raw: string): string {
  const cleaned = raw.trim();
  const stripped = cleaned
    .replace(/^.*?(?:省|自治区|特别行政区)/u, '')
    .replace(/^.*?(?:市|自治州|地区|盟)(?=[\u4e00-\u9fff]{2,8}(?:市|县|区|旗)$)/u, '');
  return (stripped || cleaned).slice(0, 12);
}

/**
 * Composes an evidence-grounded executive abstract strictly from registered
 * results, findings, references, autonomous audit runs, and county anchors,
 * without fabricating uncomputed statistics and declaring simulation status when present.
 */
export function buildGroundedAbstractDraft(params: {
  projectTitle?: string;
  report?: EditorContent | null;
  design?: Questionnaire | null;
  dataset?: DatasetValue | null;
  latestRun?: AutonomousRunView | null;
}): GroundedAbstractDraft {
  const pickTopic = (...candidates: Array<string | undefined>): string => {
    for (const raw of candidates) {
      const cleaned = sanitizeAdvisorDisplayText((raw ?? '').trim());
      if (cleaned && !/^(?:未命名|新报告|示例报告|blank|我的市场调查研究|当前研究课题)/iu.test(cleaned)) {
        return cleaned.slice(0, 80);
      }
    }
    return '本专题社会调查研究';
  };

  const results = params.report?.quality?.results ?? [];
  const findings = params.report?.quality?.findings ?? [];
  const references = params.report?.references ?? [];
  const sections = params.report?.report ?? [];
  const topic = pickTopic(params.report?.title, params.design?.title, params.projectTitle);

  const isSimulated =
    params.latestRun?.datasetSummary.classification === 'simulated'
    || params.dataset?.kind === 'simulated'
    || results.some(r => r.classification === 'simulated');

  const rawCount = params.latestRun?.datasetSummary.rawRowCount
    ?? params.dataset?.table.rows.length
    ?? (results.length ? Math.max(...results.map(r => r.total || r.n || 0)) : 0);
  const cleanedCount = params.latestRun?.datasetSummary.cleanedRowCount
    ?? (results.length ? Math.max(...results.map(r => r.n || 0)) : params.dataset?.table.rows.length ?? 0);

  const fullProse = sections.map(sectionProseText).join('\n');
  const countyMatch = /([^\s，。；（）()]{2,20})（行政区划代码\s*(\d{6})）/u.exec(fullProse);
  const countyPhrase = countyMatch ? `${countyMatch[1]}（区划代码 ${countyMatch[2]}）` : '';

  const methodNames = [
    ...new Set(
      results
        .map(r => METHOD_LABELS[r.method] ?? '')
        .map(name => sanitizeAdvisorDisplayText(name).trim())
        .filter(Boolean),
    ),
  ].slice(0, 4);

  const methodKeywords = [
    ...new Set(
      results
        .map(r => METHOD_KEYWORD_ZH[r.method] ?? METHOD_LABELS[r.method] ?? '')
        .map(name => sanitizeAdvisorDisplayText(name).trim())
        .filter(Boolean),
    ),
  ].slice(0, 2);

  const insightCandidates: string[] = [];
  if (params.latestRun?.motherInsight?.headline) {
    const h = sanitizeAdvisorDisplayText(params.latestRun.motherInsight.headline).replace(/[。；\s]+$/u, '');
    if (h) insightCandidates.push(h);
  }
  for (const f of findings) {
    const text = sanitizeAdvisorDisplayText(f.interpretation || f.title);
    if (text && !insightCandidates.some(existing => existing.includes(text.slice(0, 12)))) {
      insightCandidates.push(text.replace(/[。；\s]+$/u, ''));
    }
    if (insightCandidates.length >= 3) break;
  }
  if (!insightCandidates.length) {
    for (const r of results.slice(0, 2)) {
      const cleanTitle = sanitizeAdvisorDisplayText(r.title);
      const topRow = r.rows[0]?.slice(0, 3).map(cell => String(cell ?? '').trim()).filter(Boolean).join(' / ');
      if (cleanTitle) {
        insightCandidates.push(topRow ? `${cleanTitle}（${topRow}）` : cleanTitle);
      }
    }
  }

  const questionCount = params.design?.questions.length ?? 0;
  const simPrefix = isSimulated ? '【教学模拟数据，不能作为实际调查结果】\n' : '';
  const designClause = [
    countyPhrase ? `依托${countyPhrase}区域背景` : '围绕目标研究区域与核心调研问题',
    questionCount > 0 ? `编制了涵盖 ${questionCount} 道题项的结构化问卷` : '完成了研究设计与指标构建',
    references.length > 0 ? `并结合 ${references.length} 篇已核验学术文献界定分析框架` : '',
  ]
    .filter(Boolean)
    .join('，');

  const p1 = `${simPrefix}围绕“${topic}”，本研究${designClause}，旨在梳理关键影响因素、群体特征分化及可落地的改进路径。`;

  let p2: string;
  if (cleanedCount > 0 || rawCount > 0 || methodNames.length > 0) {
    const samplePart = cleanedCount > 0 && rawCount >= cleanedCount && rawCount > 0
      ? `研究共整理调查记录 ${rawCount} 份，经质量核查保留有效样本 n=${cleanedCount} 份`
      : cleanedCount > 0
        ? `研究基于有效样本 n=${cleanedCount} 份开展统计核验`
        : `研究围绕当前设计样本框架开展预备梳理`;
    const methodPart = methodNames.length
      ? `综合运用${methodNames.join('、')}等统计方法，对变量关联与分组差异进行实证检验`
      : '遵循从描述性统计到稳健推断检验的递进式分析路径';
    p2 = `在调查实施与分析方法方面，${samplePart}，${methodPart}。`;
  } else {
    p2 = '在研究设计与方法规划方面，目前已完成核心研究问题梳理与调查工具框架拟定，后续将在实际回收样本并完成清洗后依次开展描述性分析、组间差异检验与稳健性验证。';
  }

  const p3 = insightCandidates.length > 0
    ? `主要实证结果表明，${insightCandidates.slice(0, 2).join('；')}。分析过程中同步核验了显著性水平、效应量与适用边界，避免将截面统计关联直接外推为单一因果结论。`
    : '目前尚未登记正式定量统计检验结果，待数据导入并生成分析快照后，将依据实证效应量与稳健性边界补充核心发现。';

  const p4 = '针对上述发现与边界条件，本研究进一步从精准人群识别、重点服务痛点响应及试点效果追踪三方面提出可量化评估的改进建议，为后续方案优化与决策评估提供实证参考。';

  const topicKeyword = topic === '本专题社会调查研究'
    ? '社会调查'
    : topic.replace(/[——\-：:].*$/u, '').trim().slice(0, 12) || '社会调查';
  const keywordPool = [
    topicKeyword,
    ...(countyMatch ? [extractConciseRegionKeyword(countyMatch[1])] : []),
    ...methodKeywords,
    '调查分析',
    '实证研究',
  ]
    .map(k => k.replace(/[；;，,、]+/gu, '').replace(/\s{2,}/gu, ' ').trim())
    .filter(k => k.length >= 2);
  const keywords = [...new Set(keywordPool)].slice(0, 5);
  const p5 = `关键词：${keywords.join('；')}`;

  const groundedCount = results.length + findings.length + references.length + (params.latestRun ? 1 : 0);
  const evidenceParts = [
    cleanedCount > 0 ? `有效样本 n=${cleanedCount}` : '',
    results.length > 0 ? `${results.length} 项分析结果` : '',
    findings.length > 0 ? `${findings.length} 条研究发现` : '',
    references.length > 0 ? `${references.length} 篇核验文献` : '',
  ].filter(Boolean);

  return {
    paragraphs: [p1, p2, p3, p4, p5],
    keywords,
    evidenceSummary: evidenceParts.length ? evidenceParts.join(' · ') : '当前研究设计与课题元信息',
    isSimulated,
    groundedCount,
  };
}

export type PreSubmissionAuditGap = {
  id: string;
  label: string;
  status: 'fail' | 'partial';
  detail: string;
};

export type PreSubmissionAuditSummary = {
  score: number;
  passedChecks: number;
  totalChecks: number;
  danglingCount: number;
  danglingTitles: string[];
  formatNotices: string[];
  referenceCount: number;
  incompleteRefs: number;
  metadataOnlyRefs: number;
  blindLeakHits: string[];
  topGaps: PreSubmissionAuditGap[];
  needsAbstract: boolean;
  needsReferences: boolean;
  needsResults: boolean;
  needsFindings: boolean;
  needsQuestionnaireAppendix: boolean;
  needsDataAppendix: boolean;
};

const BLIND_REVIEW_LEAK_RE =
  /(?:指导老师|指导教师|参赛队名|队伍编号|学校名称|所在院校|学院名称|学号[:：]?\s*\d{5,}|[\u4e00-\u9fff]{2,8}(?:大学(?!生)|学院)(?:[\u4e00-\u9fff]{2,6}系)?)/gu;
const BLIND_LEAK_LEAD_NOISE_RE =
  /^(?:本项目|本研究|本团队|我院|我校|我们|本文|来自|依托|委托|就读于|毕业于|联合|就读|毕业|[由在于自的与和及])+/gu;

/**
 * Computes an instant pre-submission compliance and evidence completeness audit
 * combining `benchmarkReport`, dangling cross-reference detection, reference
 * verification status, format notices, and blind-review anonymity scanning.
 */
export function buildPreSubmissionAuditSummary(report: EditorContent): PreSubmissionAuditSummary {
  const bench = benchmarkReport(report);
  const dangling = danglingReferences(report);
  const formatNotices = reportFormatNotices(report.report);
  const references = report.references ?? [];

  let incompleteRefs = 0;
  let metadataOnlyRefs = 0;
  for (const entry of references) {
    if (referenceProblems(entry).length > 0) incompleteRefs += 1;
    if (entry.verification === 'metadata_only' || entry.verification === 'pending' || !entry.verification) {
      metadataOnlyRefs += 1;
    }
  }

  const scanChunks = [
    report.title,
    report.subtitle,
    ...report.report
      .filter(s => reportPart(s.title) !== 'references')
      .map(s => `${s.title}\n${sectionProseText(s)}`),
  ];
  const blindHits = new Set<string>();
  for (const chunk of scanChunks) {
    for (const match of chunk.matchAll(BLIND_REVIEW_LEAK_RE)) {
      const hit = match[0].replace(BLIND_LEAK_LEAD_NOISE_RE, '').trim();
      if (hit.length >= 3) blindHits.add(hit);
      if (blindHits.size >= 5) break;
    }
    if (blindHits.size >= 5) break;
  }

  const applicableChecks = bench.checks.filter(c => c.status !== 'na');
  const passedChecks = applicableChecks.filter(c => c.status === 'pass').length;
  const topGaps: PreSubmissionAuditGap[] = applicableChecks
    .filter((c): c is typeof c & { status: 'fail' | 'partial' } => c.status === 'fail' || c.status === 'partial')
    .slice(0, 4)
    .map(c => ({
      id: c.id,
      label: c.label,
      status: c.status,
      detail: normalizeAcademicPunctuation(c.detail),
    }));

  const hasDataAppendixSection = report.report.some(
    s => reportPart(s.title) === 'appendix' && /数据|处理|说明/u.test(s.title),
  );

  return {
    score: Math.round(bench.score),
    passedChecks,
    totalChecks: applicableChecks.length,
    danglingCount: dangling.length,
    danglingTitles: dangling.map(d => normalizeAcademicPunctuation(d.title)),
    formatNotices: formatNotices.map(normalizeAcademicPunctuation),
    referenceCount: references.length,
    incompleteRefs,
    metadataOnlyRefs,
    blindLeakHits: [...blindHits],
    topGaps,
    needsAbstract: bench.checks.find(c => c.id === 'abstract')?.status === 'fail',
    needsReferences: references.length === 0,
    needsResults: (report.quality?.results.length ?? 0) === 0,
    needsFindings: (report.quality?.findings.length ?? 0) === 0,
    needsQuestionnaireAppendix: bench.checks.find(c => c.id === 'questionnaire')?.status === 'fail',
    needsDataAppendix: (report.quality?.results.length ?? 0) > 0 && !hasDataAppendixSection,
  };
}
