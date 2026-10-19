import { normalizeKnowledgeText } from './search.ts';
import type { KnowledgeContext, KnowledgeEntry, KnowledgeModule, KnowledgeUserState, KnowledgeWindowPreference } from './types.ts';

const MODULES: Record<KnowledgeModule, { label: string; terms: string[] }> = {
  overview: { label: '研究准备', terms: ['研究问题', '操作化', '总体'] },
  design: { label: '问卷设计', terms: ['操作化', '反向题', '效度'] },
  sampling: { label: '抽样设计', terms: ['抽样框', '设计效应', '有限总体修正'] },
  analysis: { label: '数据分析', terms: ['置信区间', '效应量', '缺失值'] },
  editor: { label: '报告与 PPT', terms: ['相关与因果', '替代解释', '总体'] },
  defense: { label: '答辩', terms: ['可证伪性', '效应量', '选择偏差'] },
  silicon: { label: '硅基样本', terms: ['模拟数据', '数据泄漏', '预测试'] },
  canvas: { label: '研究画布', terms: ['DAG', '数据类型', 'API'] },
  cases: { label: '案例阅读', terms: ['研究问题', '操作化', '效度'] },
  diagnose: { label: '研究诊断', terms: ['研究问题', '抽样框', '可证伪性'] },
  exam: { label: '知识赛备考', terms: ['总体', '抽样框', '信度'] },
  rules: { label: '规则与门禁', terms: ['匿名化', '哈希', '证据'] },
  preflight: { label: '提交前体检', terms: ['元数据', '匿名化', '哈希'] },
  knowledge: { label: '知识索引', terms: ['操作化', '置信区间', '相关与因果'] },
};
export const KNOWLEDGE_HELP_TAGS: Record<string, string[]> = {
  reliability: ['Cronbach α', '反向题', '项目—总分相关'],
  scale: ['操作化', '反向题', '信度'],
  frequency: ['频数', '置信区间', '分母'],
  correlation: ['Pearson', 'Spearman', '相关与因果'],
  inference: ['p值', '置信区间', '效应量'],
  'response-quality': ['缺失值', '直线作答', '选择偏差'],
  sampling: ['抽样框', '设计效应', '有限总体修正'],
  report: ['相关与因果', '替代解释', '总体'],
};
/** Registered locations and explicit help tags only; never scrape form values. */
export function contextFromLocation(pathname: string, hash = '', helpTags: readonly string[] = []): KnowledgeContext {
  let section = hash.replace(/^#/, '').split(/[?&]/)[0];
  if (pathname === '/knowledge') section = 'knowledge';
  if (pathname.startsWith('/examples/')) section = section && Object.hasOwn(MODULES, section) ? section : 'analysis';
  const activeModule: KnowledgeModule = Object.hasOwn(MODULES, section) ? section as KnowledgeModule : 'overview';
  const explicit = helpTags.filter(tag => typeof tag === 'string' && tag.length <= 100).slice(0, 10);
  const projectId = pathname.match(/^\/projects\/([a-f0-9-]{16,64})(?:\/|$)/i)?.[1];
  return { module: activeModule, label: MODULES[activeModule].label, helpTags: explicit, ...(projectId ? { projectId } : {}) };
}
export function recommendKnowledge(entries: readonly KnowledgeEntry[], context: KnowledgeContext, limit = 3): KnowledgeEntry[] {
  const recommended = new Map<string, KnowledgeEntry>();
  const terms = [...context.helpTags.flatMap(tag => KNOWLEDGE_HELP_TAGS[tag] ?? [tag]), ...MODULES[context.module].terms];
  for (const term of terms) {
    const key = normalizeKnowledgeText(term).replace(/\s/g, '');
    const candidates = entries.filter(entry => entry.review.status === 'reviewed').map(entry => {
      const names = [entry.name, entry.englishName ?? '', ...entry.aliases].map(name => normalizeKnowledgeText(name).replace(/\s/g, ''));
      const score = entry.id === term ? 400 : names[0] === key ? 300 : names.includes(key) ? 250 : key.length >= 2 && names.some(name => name.startsWith(key)) ? 200 : 0;
      return { entry, score };
    }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
    // Metadata matching is cheap; the full index remains in its worker.
    const hit = candidates[0];
    if (hit) recommended.set(hit.entry.id, hit.entry);
    if (recommended.size >= Math.min(3, limit)) break;
  }
  return [...recommended.values()].slice(0, Math.max(0, Math.min(3, limit)));
}
const PRIVATE_SELECTOR = 'input,textarea,select,[data-private],[data-secret],[data-raw-answers],[data-knowledge-ignore],#services,[autocomplete="current-password"],[autocomplete="new-password"]';
function elementFor(node: Node | null): Element | null { return node?.nodeType === 1 ? node as Element : node?.parentElement ?? null; }
/** Explicit user selection, restricted to ordinary visible content; input values never read. */
export function selectedKnowledgeText(doc: Document = document): string {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
  const range = selection.getRangeAt(0);
  const anchor = elementFor(range.startContainer), focus = elementFor(range.endContainer);
  if (!anchor || !focus || anchor.closest(PRIVATE_SELECTOR) || focus.closest(PRIVATE_SELECTOR)) return '';
  const ancestor = elementFor(range.commonAncestorContainer);
  if (ancestor?.closest(PRIVATE_SELECTOR)) return '';
  // A wide selection spanning an excluded field must not accidentally include its content.
  for (const excluded of doc.querySelectorAll(PRIVATE_SELECTOR)) {
    try { if (range.intersectsNode(excluded)) return ''; } catch { /* Detached nodes cannot contribute. */ }
  }
  return selection.toString().normalize('NFKC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
}
export function registeredKnowledgeTags(doc: Document = document): string[] {
  const active = doc.querySelector('[data-knowledge-context="active"]');
  const value = active?.getAttribute('data-knowledge-tags') ?? '';
  return value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0 && tag.length <= 100).slice(0, 10);
}
export function emptyKnowledgeUserState(): KnowledgeUserState {
  return { schemaVersion: 1, version: 0, favorites: [], recent: [], window: { mode: 'float', x: 24, y: 80 } };
}
export function clampKnowledgeWindow(preference: KnowledgeWindowPreference, viewport: { width: number; height: number }, size = { width: 400, height: 560 }): KnowledgeWindowPreference {
  const width = Math.max(0, viewport.width), height = Math.max(0, viewport.height);
  return { mode: ['float', 'dock', 'reading'].includes(preference.mode) ? preference.mode : 'float', x: Math.max(8, Math.min(Number.isFinite(preference.x) ? preference.x : 24, Math.max(8, width - Math.min(size.width, width - 16) - 8))), y: Math.max(8, Math.min(Number.isFinite(preference.y) ? preference.y : 80, Math.max(8, height - Math.min(size.height, height - 16) - 8))) };
}
export function knowledgeUserStateKey(accountId: string | null): string | null {
  if (!accountId || accountId.length > 128 || /[\u0000-\u001f]/.test(accountId)) return null;
  return `evix.knowledge.user.v1:${encodeURIComponent(accountId)}`;
}
/** Account identity is bound both in the key and payload; malformed/foreign drafts restore empty. */
export function restoreKnowledgeUserState(serialized: string | null, accountId: string | null): KnowledgeUserState {
  const empty = emptyKnowledgeUserState();
  if (!serialized || !accountId || serialized.length > 100000) return empty;
  try {
    const envelope = JSON.parse(serialized);
    if (!envelope || envelope.accountId !== accountId || !envelope.state || envelope.state.schemaVersion !== 1) return empty;
    const state = envelope.state as KnowledgeUserState;
    if (!Number.isInteger(state.version) || state.version < 0 || !Array.isArray(state.favorites) || !Array.isArray(state.recent) || !state.window) return empty;
    const validReference = (item: { entryId: string; entryVersion: number }) => item && /^[a-z0-9][a-z0-9._-]{0,95}$/.test(item.entryId) && Number.isInteger(item.entryVersion) && item.entryVersion > 0;
    return { schemaVersion: 1, version: state.version, favorites: state.favorites.filter(validReference).slice(0, 300), recent: state.recent.filter(item => validReference(item) && (item.visitedAt === undefined || Number.isFinite(Date.parse(item.visitedAt)))).slice(0, 30), window: clampKnowledgeWindow(state.window, { width: 1920, height: 1080 }) };
  } catch { return empty; }
}
export function serializeKnowledgeUserState(accountId: string, state: KnowledgeUserState): string {
  return JSON.stringify({ accountId, state });
}
