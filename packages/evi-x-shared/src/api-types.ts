import { parseQuestionnaire, type Questionnaire } from './questionnaire.ts';

export type MembershipRole = 'owner' | 'editor' | 'reviewer' | 'viewer';
export type Session = { authenticated: boolean; user?: { id: string; email: string }; csrfToken?: string; mode: 'local_test' | 'production' };
export type Team = { id: string; name: string; role: MembershipRole };
export type Member = { userId: string; email: string; role: MembershipRole };
export type Project = { id: string; title: string; teamId: string; revision: number; createdAt: string };
export type ServiceProvider = 'openai' | 'deepseek' | 'qwen' | 'anthropic' | 'gemini' | 'compatible';
export type ServiceCapability = 'questionnaire' | 'research' | 'report' | 'defense';
export type Service = { id: string; label: string; provider: ServiceProvider; baseUrl: string; model: string; maxOutputTokens: number; capabilities: ServiceCapability[]; revision: number };
export type QuestionnaireHead = { id: string; projectId: string; revision: number; design: Questionnaire; updatedAt: string };
export type QuestionnaireVersionSummary = { id: string; revision: number; createdAt: string; createdBy: string; title: string };
export type QuestionnaireVersion = Omit<QuestionnaireVersionSummary, 'title'> & { design: Questionnaire };
export type Proposal = { id: string; projectId: string; serviceId: string; serviceRevision: number; inputRevision: number; status: 'ready' | 'failed' | 'outcome_unknown' | 'running'; design?: Questionnaire; errorCode?: string; createdAt: string };
export type ProposalSummary = Omit<Proposal, 'design'> & { title: string };
export type QuestionnaireVersionPage = { versions: QuestionnaireVersionSummary[]; nextBeforeRevision: number | null };
export const PROVIDER_BASES: Record<Exclude<ServiceProvider, 'compatible'>, string> = { openai: 'https://api.openai.com/v1', deepseek: 'https://api.deepseek.com/v1', qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1', anthropic: 'https://api.anthropic.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta' };
export const CAPABILITY_LABELS: Record<ServiceCapability, string> = { questionnaire: '问卷设计', research: '研究规划', report: '报告写作', defense: '答辩准备' };
export const ROLE_LABELS: Record<MembershipRole, string> = { owner: '负责人', editor: '编辑成员', reviewer: '复核成员', viewer: '只读成员' };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function isUuid(value: unknown): value is string { return typeof value === 'string' && uuid.test(value); }
function bad(): never { throw Error('服务器回执格式不匹配，请刷新核对；当前编辑保留。'); }
function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) bad();
  const r = value as Record<string, unknown>;
  if (required.some(k => !Object.hasOwn(r, k)) || Reflect.ownKeys(r).some(k => typeof k !== 'string' || ![...required, ...optional].includes(k))) bad();
  if (Object.values(Object.getOwnPropertyDescriptors(r)).some(d => !('value' in d) || !d.enumerable)) bad();
  return r;
}
function string(value: unknown, max = 1000): string { if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) bad(); return value; }
function id(value: unknown): string { if (!isUuid(value)) bad(); return value; }
function integer(value: unknown, min = 1, max = 2_147_483_647): number { if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) bad(); return value; }
function timestamp(value: unknown): string {
  const s = string(value, 40), m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/), d = new Date(s);
  if (!m || !Number.isFinite(d.getTime()) || d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() + 1 !== Number(m[2]) || d.getUTCDate() !== Number(m[3]) || d.getUTCHours() !== Number(m[4]) || d.getUTCMinutes() !== Number(m[5]) || d.getUTCSeconds() !== Number(m[6])) bad();
  return s;
}
function role(value: unknown): MembershipRole { if (!['owner', 'editor', 'reviewer', 'viewer'].includes(value as string)) bad(); return value as MembershipRole; }
export function parseSession(value: unknown): Session {
  const r = record(value, ['authenticated', 'mode'], ['user', 'csrfToken']);
  if (typeof r.authenticated !== 'boolean' || !['local_test', 'production'].includes(r.mode as string)) bad();
  if (!r.authenticated) { if (r.user !== undefined || r.csrfToken !== undefined) bad(); return { authenticated: false, mode: r.mode as Session['mode'] }; }
  const user = record(r.user, ['id', 'email']), csrf = string(r.csrfToken, 256);
  if (!csrf) bad();
  return { authenticated: true, user: { id: id(user.id), email: string(user.email, 254) }, csrfToken: csrf, mode: r.mode as Session['mode'] };
}
export function parseProject(value: unknown): Project { const r = record(value, ['id', 'title', 'teamId', 'revision', 'createdAt']); return { id: id(r.id), title: string(r.title, 160), teamId: id(r.teamId), revision: integer(r.revision), createdAt: timestamp(r.createdAt) }; }
export function parseTeam(value: unknown): Team { const r = record(value, ['id', 'name', 'role']); return { id: id(r.id), name: string(r.name, 160), role: role(r.role) }; }
export function parseMember(value: unknown): Member { const r = record(value, ['userId', 'email', 'role']); return { userId: id(r.userId), email: string(r.email, 254), role: role(r.role) }; }
export function parseService(value: unknown): Service {
  const r = record(value, ['id', 'label', 'provider', 'baseUrl', 'model', 'maxOutputTokens', 'capabilities', 'revision']);
  if (!['openai', 'deepseek', 'qwen', 'anthropic', 'gemini', 'compatible'].includes(r.provider as string) || !Array.isArray(r.capabilities) || r.capabilities.length < 1 || r.capabilities.length > 4 || r.capabilities.some(c => !Object.hasOwn(CAPABILITY_LABELS, c)) || new Set(r.capabilities).size !== r.capabilities.length) bad();
  return { id: id(r.id), label: string(r.label, 80), provider: r.provider as ServiceProvider, baseUrl: string(r.baseUrl, 512), model: string(r.model, 120), maxOutputTokens: integer(r.maxOutputTokens, 128, 4096), capabilities: [...r.capabilities] as ServiceCapability[], revision: integer(r.revision) };
}
export function parseQuestionnaireHead(value: unknown): QuestionnaireHead { const r = record(value, ['id', 'projectId', 'revision', 'design', 'updatedAt']); return { id: id(r.id), projectId: id(r.projectId), revision: integer(r.revision), design: parseQuestionnaire(JSON.stringify(r.design)), updatedAt: timestamp(r.updatedAt) }; }
export function parseQuestionnaireVersion(value: unknown, full = false): QuestionnaireVersion | QuestionnaireVersionSummary {
  const r = record(value, ['id', 'revision', 'createdAt', 'createdBy', full ? 'design' : 'title']);
  const base = { id: id(r.id), revision: integer(r.revision), createdAt: timestamp(r.createdAt), createdBy: id(r.createdBy) };
  return full ? { ...base, design: parseQuestionnaire(JSON.stringify(r.design)) } : { ...base, title: string(r.title, 160) };
}
export function parseProposal(value: unknown): Proposal {
  const r = record(value, ['id', 'projectId', 'serviceId', 'serviceRevision', 'inputRevision', 'status', 'createdAt'], ['design', 'errorCode']);
  if (!['ready', 'failed', 'outcome_unknown', 'running'].includes(r.status as string)) bad();
  if (r.status === 'ready' && r.design === undefined) bad();
  return { id: id(r.id), projectId: id(r.projectId), serviceId: id(r.serviceId), serviceRevision: integer(r.serviceRevision), inputRevision: integer(r.inputRevision, 0), status: r.status as Proposal['status'], createdAt: timestamp(r.createdAt), ...(r.design === undefined ? {} : { design: parseQuestionnaire(JSON.stringify(r.design)) }), ...(r.errorCode === undefined ? {} : { errorCode: string(r.errorCode, 64) }) };
}
export function parseCollection<T>(value: unknown, key: string, parse: (value: unknown) => T, max = 1000): T[] { const r = record(value, [key]); if (!Array.isArray(r[key]) || (r[key] as unknown[]).length > max) bad(); return (r[key] as unknown[]).map(parse); }
export function summarizeProposal(proposal: Proposal): ProposalSummary { const { design, ...base } = proposal; return { ...base, title: design?.title || '' }; }
export function parseProposalSummary(value: unknown): ProposalSummary {
  const r = record(value, ['id', 'projectId', 'serviceId', 'serviceRevision', 'inputRevision', 'status', 'createdAt', 'title'], ['errorCode']);
  if (!['ready', 'failed', 'outcome_unknown', 'running'].includes(r.status as string)) bad();
  return { id: id(r.id), projectId: id(r.projectId), serviceId: id(r.serviceId), serviceRevision: integer(r.serviceRevision), inputRevision: integer(r.inputRevision, 0), status: r.status as Proposal['status'], createdAt: timestamp(r.createdAt), title: string(r.title, 160), ...(r.errorCode === undefined ? {} : { errorCode: string(r.errorCode, 64) }) };
}
export function parseVersionPage(value: unknown): QuestionnaireVersionPage {
  const r = record(value, ['versions', 'nextBeforeRevision']);
  if (!Array.isArray(r.versions) || r.versions.length > 100) bad();
  const versions = r.versions.map(v => parseQuestionnaireVersion(v) as QuestionnaireVersionSummary);
  if (versions.some((v, i) => i > 0 && v.revision >= versions[i - 1].revision)) bad();
  const nextBeforeRevision = r.nextBeforeRevision === null ? null : integer(r.nextBeforeRevision);
  if (nextBeforeRevision !== null && (!versions.length || nextBeforeRevision !== versions[versions.length - 1].revision)) bad();
  return { versions, nextBeforeRevision };
}
export function parseProjectResponse(value: unknown): { project: Project; membershipRole: MembershipRole } { const r = record(value, ['project', 'membershipRole']); return { project: parseProject(r.project), membershipRole: role(r.membershipRole) }; }
export function parseHeadResponse(value: unknown): QuestionnaireHead | null { const r = record(value, ['questionnaire']); return r.questionnaire === null ? null : parseQuestionnaireHead(r.questionnaire); }
