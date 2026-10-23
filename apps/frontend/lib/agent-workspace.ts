import type { Questionnaire } from '@evix/shared';
import type { QuestionnaireGenerationRequest } from '@/lib/questionnaire-proposals';

export type AgentAction = { label: string; href: string };
export type AgentIntent = 'questionnaire' | 'topic' | 'analysis' | 'report' | 'defense' | 'help';
export type AgentToolStatus = 'running' | 'done' | 'failed' | 'unknown';

export type AgentMessage =
  | { id: string; role: 'user'; text: string; at: string }
  | { id: string; role: 'assistant'; kind: 'text'; text: string; at: string; source: 'local' | 'model'; tone: 'normal' | 'error'; actions?: AgentAction[] }
  | { id: string; role: 'assistant'; kind: 'tool'; at: string; tool: 'questionnaire.generate'; status: AgentToolStatus; detail: string; errorCode?: string; canReconcile?: boolean }
  | { id: string; role: 'assistant'; kind: 'consent'; at: string; status: 'pending' | 'submitted' | 'cancelled'; brief: string; serviceId: string; serviceLabel: string; error?: string };

export type AgentArtifact = {
  kind: 'questionnaire';
  id: string;
  title: string;
  objective: string;
  questionCount: number;
  inputRevision: number;
  serviceLabel: string;
  createdAt: string;
  design: Questionnaire;
  questions: Array<{ id: string; text: string; type: string }>;
};

export type PendingGeneration = {
  request: QuestionnaireGenerationRequest;
  serviceLabel: string;
  toolMessageId: string;
  createdAt: string;
};

export type AgentSession = {
  version: 1;
  id: string;
  ownerId: string;
  title: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  artifacts: AgentArtifact[];
  pending: PendingGeneration | null;
};

export type AgentSessionIndexEntry = {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const SESSION_PREFIX = 'evix.agent.session.v1:';
const INDEX_PREFIX = 'evix.agent.index.v1:';
const ACTIVE_PREFIX = 'evix.agent.active.v1:';
const MAX_SESSIONS = 40;
const MAX_MESSAGES = 120;
const MAX_ARTIFACTS = 12;
const DEFAULT_TITLE = '新的研究会话';

const sessionKey = (ownerId: string, id: string) => `${SESSION_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(id)}`;
const indexKey = (ownerId: string) => `${INDEX_PREFIX}${encodeURIComponent(ownerId)}`;
const activeKey = (ownerId: string) => `${ACTIVE_PREFIX}${encodeURIComponent(ownerId)}`;

export function nowIso(): string { return new Date().toISOString(); }
export function newAgentId(): string { return crypto.randomUUID(); }

function text(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return null;
  if (!allowEmpty && !value.trim()) return null;
  return value;
}
function iso(value: unknown): string | null {
  const result = text(value, 50);
  return result && Number.isFinite(Date.parse(result)) ? result : null;
}
function plain(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null;
}
function projectId(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return text(value, 80);
}

function parseAction(value: unknown): AgentAction | null {
  const row = plain(value);
  if (!row || Object.keys(row).length !== 2) return null;
  const label = text(row.label, 40), href = text(row.href, 300);
  if (!label || !href || !href.startsWith('/') || href.startsWith('//')) return null;
  return { label, href };
}

function parseMessage(value: unknown): AgentMessage | null {
  const row = plain(value);
  if (!row) return null;
  const id = text(row.id, 80), role = row.role, at = iso(row.at);
  if (!id || !at) return null;
  if (role === 'user') {
    const body = text(row.text, 6000);
    return body ? { id, role, text: body, at } : null;
  }
  if (role !== 'assistant') return null;
  if (row.kind === 'text') {
    const body = text(row.text, 8000), source = row.source;
    if (!body || (source !== 'local' && source !== 'model')) return null;
    const tone = row.tone === 'error' ? 'error' : 'normal';
    const actions = Array.isArray(row.actions) ? row.actions.map(parseAction).filter((item): item is AgentAction => Boolean(item)).slice(0, 3) : [];
    return { id, role, kind: 'text', text: body, at, source, tone, ...(actions.length ? { actions } : {}) };
  }
  if (row.kind === 'tool') {
    if (row.tool !== 'questionnaire.generate') return null;
    const status = row.status, detail = text(row.detail, 1200, true);
    if (!['running', 'done', 'failed', 'unknown'].includes(status as string) || detail === null) return null;
    const errorCode = row.errorCode === undefined ? undefined : text(row.errorCode, 100) ?? undefined;
    return { id, role, kind: 'tool', tool: 'questionnaire.generate', status: status as AgentToolStatus, detail, at, ...(errorCode ? { errorCode } : {}), ...(row.canReconcile === true ? { canReconcile: true } : {}) };
  }
  if (row.kind === 'consent') {
    const status = row.status, brief = text(row.brief, 6000, true), serviceId = text(row.serviceId, 80, true), serviceLabel = text(row.serviceLabel, 80, true);
    if (!['pending', 'submitted', 'cancelled'].includes(status as string) || brief === null || serviceId === null || serviceLabel === null) return null;
    const error = row.error === undefined ? undefined : text(row.error, 400, true) ?? undefined;
    return { id, role, kind: 'consent', status: status as 'pending' | 'submitted' | 'cancelled', brief, serviceId, serviceLabel, at, ...(error ? { error } : {}) };
  }
  return null;
}

function parseRequest(value: unknown): QuestionnaireGenerationRequest | null {
  const row = plain(value);
  if (!row || Object.keys(row).length !== 6) return null;
  const serviceId = text(row.serviceId, 80), brief = text(row.brief, 6000), idempotencyKey = text(row.idempotencyKey, 80);
  const serviceRevision = row.serviceRevision, expectedQuestionnaireRevision = row.expectedQuestionnaireRevision;
  if (!serviceId || !brief || !idempotencyKey || row.consent !== true) return null;
  if (!Number.isSafeInteger(serviceRevision) || (serviceRevision as number) < 1) return null;
  if (!Number.isSafeInteger(expectedQuestionnaireRevision) || (expectedQuestionnaireRevision as number) < 0) return null;
  return { serviceId, serviceRevision: serviceRevision as number, brief, expectedQuestionnaireRevision: expectedQuestionnaireRevision as number, idempotencyKey, consent: true };
}

function parsePending(value: unknown): PendingGeneration | null {
  if (value === null || value === undefined) return null;
  const row = plain(value);
  if (!row || Object.keys(row).length !== 4) return null;
  const request = parseRequest(row.request), serviceLabel = text(row.serviceLabel, 80), toolMessageId = text(row.toolMessageId, 80), createdAt = iso(row.createdAt);
  if (!request || !serviceLabel || !toolMessageId || !createdAt) return null;
  return { request, serviceLabel, toolMessageId, createdAt };
}

function parseArtifact(value: unknown): AgentArtifact | null {
  const row = plain(value);
  if (!row || row.kind !== 'questionnaire') return null;
  const id = text(row.id, 80), title = text(row.title, 160, true), objective = text(row.objective, 4000, true), serviceLabel = text(row.serviceLabel, 80, true), createdAt = iso(row.createdAt);
  const design = plain(row.design);
  if (!id || title === null || objective === null || serviceLabel === null || !createdAt || !design) return null;
  if (!Number.isSafeInteger(row.questionCount) || (row.questionCount as number) < 0) return null;
  if (!Number.isSafeInteger(row.inputRevision) || (row.inputRevision as number) < 0) return null;
  if (!Array.isArray(row.questions) || row.questions.length > 200) return null;
  const questions: AgentArtifact['questions'] = [];
  for (const entry of row.questions) {
    const question = plain(entry);
    const qid = text(question?.id, 80), qtext = text(question?.text, 600, true), qtype = text(question?.type, 40, true);
    if (!qid || qtext === null || qtype === null) return null;
    questions.push({ id: qid, text: qtext, type: qtype });
  }
  return { kind: 'questionnaire', id, title, objective, questionCount: row.questionCount as number, inputRevision: row.inputRevision as number, serviceLabel, createdAt, design: design as unknown as Questionnaire, questions };
}

export function parseAgentSession(value: unknown, ownerId: string, expectedId?: string): AgentSession | null {
  const row = plain(value);
  if (!row || row.version !== 1) return null;
  const id = text(row.id, 80), rowOwner = text(row.ownerId, 80), title = text(row.title, 160), createdAt = iso(row.createdAt), updatedAt = iso(row.updatedAt);
  if (!id || rowOwner !== ownerId || !title || !createdAt || !updatedAt) return null;
  if (expectedId && id !== expectedId) return null;
  if (!Array.isArray(row.messages) || !Array.isArray(row.artifacts)) return null;
  const messages = row.messages.map(parseMessage).filter((item): item is AgentMessage => Boolean(item)).slice(-MAX_MESSAGES);
  const artifacts = row.artifacts.map(parseArtifact).filter((item): item is AgentArtifact => Boolean(item)).slice(-MAX_ARTIFACTS);
  const pending = parsePending(row.pending);
  const boundProject = projectId(row.projectId);
  if (boundProject === undefined) return null;
  return { version: 1, id, ownerId: rowOwner, title, projectId: boundProject, createdAt, updatedAt, messages, artifacts, pending };
}

function readJson(store: AgentStorage | null, key: string): unknown {
  if (!store) return null;
  try { const raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function loadSessionIndex(ownerId: string, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): AgentSessionIndexEntry[] {
  if (!ownerId) return [];
  const row = plain(readJson(store, indexKey(ownerId)));
  if (!row || row.version !== 1 || !Array.isArray(row.sessions)) return [];
  const seen = new Set<string>();
  const result: AgentSessionIndexEntry[] = [];
  for (const value of row.sessions) {
    const entry = plain(value);
    const id = text(entry?.id, 80), title = text(entry?.title, 160), createdAt = iso(entry?.createdAt), updatedAt = iso(entry?.updatedAt);
    const boundProject = projectId(entry?.projectId);
    if (!id || !title || !createdAt || !updatedAt || boundProject === undefined || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, title, projectId: boundProject, createdAt, updatedAt });
  }
  return result.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, MAX_SESSIONS);
}

export function saveSessionIndex(ownerId: string, sessions: AgentSession[], store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  if (!ownerId || !store) return false;
  const rows: AgentSessionIndexEntry[] = sessions
    .filter(session => session.ownerId === ownerId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, MAX_SESSIONS)
    .map(session => ({ id: session.id, title: session.title, projectId: session.projectId, createdAt: session.createdAt, updatedAt: session.updatedAt }));
  try { store.setItem(indexKey(ownerId), JSON.stringify({ version: 1, sessions: rows })); return true; } catch { return false; }
}

export function loadAgentSession(ownerId: string, id: string, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): AgentSession | null {
  if (!ownerId || !id) return null;
  return parseAgentSession(readJson(store, sessionKey(ownerId, id)), ownerId, id);
}

export function loadAgentSessions(ownerId: string, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): AgentSession[] {
  return loadSessionIndex(ownerId, store)
    .map(entry => loadAgentSession(ownerId, entry.id, store))
    .filter((session): session is AgentSession => Boolean(session))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function saveAgentSession(session: AgentSession, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  if (!store || !session.ownerId || !session.id) return false;
  const value: AgentSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES),
    artifacts: session.artifacts.slice(-MAX_ARTIFACTS),
  };
  try { store.setItem(sessionKey(session.ownerId, session.id), JSON.stringify(value)); return true; } catch { return false; }
}

export function deleteAgentSession(ownerId: string, id: string, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): void {
  if (!store || !ownerId || !id) return;
  try { store.removeItem(sessionKey(ownerId, id)); } catch { /* The index rewrite still removes the row from this browser. */ }
}

export function loadActiveSessionId(ownerId: string, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): string | null {
  if (!ownerId || !store) return null;
  try { return text(store.getItem(activeKey(ownerId)), 80); } catch { return null; }
}

export function saveActiveSessionId(ownerId: string, id: string | null, store: AgentStorage | null = typeof window === 'undefined' ? null : window.localStorage): void {
  if (!ownerId || !store) return;
  try { if (id) store.setItem(activeKey(ownerId), id); else store.removeItem(activeKey(ownerId)); } catch { /* Selecting a session is a convenience, not saved research data. */ }
}

export function createAgentSession(ownerId: string, projectId: string | null = null): AgentSession {
  const at = nowIso();
  return { version: 1, id: newAgentId(), ownerId, title: DEFAULT_TITLE, projectId, createdAt: at, updatedAt: at, messages: [], artifacts: [], pending: null };
}

export function titleFromMessage(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (!compact) return DEFAULT_TITLE;
  return compact.length > 26 ? `${compact.slice(0, 26)}…` : compact;
}

export function appendAgentMessage(session: AgentSession, message: AgentMessage): AgentSession {
  const titled = session.messages.length === 0 && message.role === 'user' && session.title === DEFAULT_TITLE
    ? { ...session, title: titleFromMessage(message.text) }
    : session;
  return { ...titled, messages: [...titled.messages, message].slice(-MAX_MESSAGES), updatedAt: message.at };
}

export function updateAgentMessage(session: AgentSession, id: string, update: (message: AgentMessage) => AgentMessage): AgentSession {
  let changed = false;
  const messages = session.messages.map(message => {
    if (message.id !== id) return message;
    const next = update(message);
    if (next !== message) changed = true;
    return next;
  });
  return changed ? { ...session, messages, updatedAt: nowIso() } : session;
}

export function userMessage(textValue: string): AgentMessage {
  return { id: newAgentId(), role: 'user', text: textValue, at: nowIso() };
}
export function assistantText(textValue: string, options: { source?: 'local' | 'model'; tone?: 'normal' | 'error'; actions?: AgentAction[] } = {}): AgentMessage {
  return { id: newAgentId(), role: 'assistant', kind: 'text', text: textValue, at: nowIso(), source: options.source ?? 'local', tone: options.tone ?? 'normal', ...(options.actions?.length ? { actions: options.actions.slice(0, 3) } : {}) };
}
export function questionnaireToolMessage(id: string, status: AgentToolStatus, detail: string, extra: { errorCode?: string; canReconcile?: boolean } = {}): AgentMessage {
  return { id, role: 'assistant', kind: 'tool', tool: 'questionnaire.generate', status, detail, at: nowIso(), ...extra };
}
export function consentMessage(input: { brief: string; serviceId: string; serviceLabel: string }): AgentMessage {
  return { id: newAgentId(), role: 'assistant', kind: 'consent', status: 'pending', brief: input.brief, serviceId: input.serviceId, serviceLabel: input.serviceLabel, at: nowIso() };
}

export function classifyAgentIntent(message: string): AgentIntent {
  if (/生成.*问卷|设计.*问卷|问卷.*(生成|草稿|建议)|量表设计|题项设计/.test(message)) return 'questionnaire';
  if (/分析|统计|信度|效度|回归|方差|聚类|SPSS|数据质量|清洗/.test(message)) return 'analysis';
  if (/选题|研究方向|研究问题|候选方向|缩小|可行性|研究计划/.test(message)) return 'topic';
  if (/报告|PPT|幻灯片|写作|排版|Word|附录/.test(message)) return 'report';
  if (/答辩|路演|演练|评委|提问|匿名|提交体检/.test(message)) return 'defense';
  return 'help';
}

export function localReply(intent: Exclude<AgentIntent, 'questionnaire'>, projectId: string | null): { text: string; actions: AgentAction[] } {
  const projectHref = projectId ? `/projects/${projectId}` : '/projects';
  if (intent === 'topic') {
    return {
      text: '选题这一步目前由项目工作台里的「选题与研究简报」承担：它结合地区、时间、预算和渠道，用资料库或个人模型给出可核实的候选方向，并保存真实回执。第一版 Agent 对话还没有代你操作这个页面。',
      actions: [{ label: '打开项目工作台', href: projectHref }, { label: '我的项目', href: '/projects' }],
    };
  }
  if (intent === 'analysis') {
    return {
      text: '数据分析在项目工作台的「数据分析」里：数据质量检查、量表信度、变量分布和图表工作室都在那里。当前对话不会替你上传数据，也不会编造分析结果。',
      actions: [{ label: '打开数据分析', href: projectHref }, { label: '研究工具', href: '/workspace#analysis' }],
    };
  }
  if (intent === 'report') {
    return {
      text: '报告与 PPT 编辑器在项目工作台里，支持版本保存、撤销与导出。我可以先把要写的内容拆成章节，但这一版还没有接通写作模型，不会替你生成虚构结论。',
      actions: [{ label: '打开报告与 PPT', href: projectHref }, { label: '研究工具', href: '/workspace#editor' }],
    };
  }
  if (intent === 'defense') {
    return {
      text: '答辩训练在项目工作台的「路演与答辩」中，包含问题库、依据状态声明和可调节计时。提交前体检在「研究工具」里，检查身份与编辑残留。',
      actions: [{ label: '打开答辩工作台', href: projectHref }, { label: '提交前体检', href: '/workspace#preflight' }],
    };
  }
  return {
    text: '这一版真正接通的链路是「问卷生成」：绑定项目、选择你的模型服务并明确确认后，我会调用模型，把可编辑的问卷提案放进右侧产物面板。选题、分析、报告和答辩目前是入口指引，不会伪装成已完成。',
    actions: [{ label: '配置模型服务', href: '/services' }, { label: '查看我的项目', href: '/projects' }],
  };
}

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function groupSessionsByDay(sessions: AgentSession[], now: Date = new Date()): Array<{ label: string; sessions: AgentSession[] }> {
  const today = startOfDay(now), yesterday = today - 86_400_000;
  const groups: Array<{ label: string; sessions: AgentSession[] }> = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '更早', sessions: [] },
  ];
  for (const session of [...sessions].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))) {
    const time = Date.parse(session.updatedAt);
    if (!Number.isFinite(time)) continue;
    const day = startOfDay(new Date(time));
    groups[day >= today ? 0 : day >= yesterday ? 1 : 2].sessions.push(session);
  }
  return groups.filter(group => group.sessions.length > 0);
}

export function formatRelativeTime(value: string, now: Date = new Date()): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const delta = Math.max(0, now.getTime() - time);
  if (delta < 60_000) return '刚刚';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000 && startOfDay(now) === startOfDay(new Date(time))) return `${Math.floor(delta / 3_600_000)} 小时前`;
  const day = startOfDay(new Date(time));
  if (day === startOfDay(now) - 86_400_000) return '昨天';
  return `${new Date(time).getMonth() + 1}月${new Date(time).getDate()}日`;
}

export function filterSessions(sessions: AgentSession[], query: string): AgentSession[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sessions;
  return sessions.filter(session => session.title.toLowerCase().includes(needle) || session.messages.some(message => message.role === 'user' && message.text.toLowerCase().includes(needle)));
}
