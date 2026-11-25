import { parseEditorContent, type EditorContent } from '../editor-model.ts';

/**
 * The agent's report draft, kept in this browser so a reload does not lose it: an account's in local storage under its
 * own ID, a guest's for the tab only, as conversations are. Another identity never reads it. A draft that no longer
 * parses is dropped rather than half-loaded. Writes are coalesced, since a report is rewritten on every keystroke.
 *
 * Multi-illustration v3 reports (~3–5 MB) retain full page art in an in-process memory cache so browser 5 MB origin
 * Storage quotas never block candidate adoption or version rollback during a session, while storing a lightweight
 * text+evidence copy in Web Storage when full base64 page art exceeds Storage quota.
 */
const PREFIX = 'evix.agent.report-draft.v1:', DELAY = 800;
const projectKey = (owner: string, projectId: string | null) =>
  projectId ? `evix.agent.report-draft.v2:${encodeURIComponent(owner)}:${encodeURIComponent(projectId)}` : PREFIX + owner;
const memoryKey = (owner: string, projectId: string | null) =>
  `${owner === 'guest' ? 'session' : 'local'}:${projectKey(owner, projectId)}`;

const memoryCache = new Map<string, string>();
const memoryVersions = new Map<string, { savedAt: string; serialized: string }[]>();

const storage = (owner: string): Storage | null => {
  try { return owner === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; }
};

function hasHeavyArt(content: EditorContent): boolean {
  return Boolean(content.coverImage || content.frameImage || content.illustrations?.length);
}

function stripHeavyArt(content: EditorContent): EditorContent {
  const rest: EditorContent = { ...content };
  delete rest.coverImage;
  delete rest.frameImage;
  delete rest.illustrations;
  return rest;
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

function evictStoredVersionKeys(target: Storage, keepKey?: string): void {
  try {
    if (typeof target.length !== 'number' || typeof target.key !== 'function') return;
    const keys: string[] = [];
    for (let i = 0; i < target.length; i++) {
      const k = target.key(i);
      if (k && k !== keepKey && k.startsWith('evix.agent.report-draft.') && k.endsWith(':versions')) {
        keys.push(k);
      }
    }
    for (const k of keys) target.removeItem(k);
  } catch { /* ignore storage iteration errors */ }
}

export function readReportDraft(owner: string, projectId: string | null = null): EditorContent | null {
  const mKey = memoryKey(owner, projectId);
  const memRaw = memoryCache.get(mKey);
  if (memRaw !== undefined) {
    try { return parseEditorContent(JSON.parse(memRaw)); } catch { memoryCache.delete(mKey); }
  }
  try {
    const raw = storage(owner)?.getItem(projectKey(owner, projectId));
    return raw ? parseEditorContent(JSON.parse(raw)) : null;
  } catch { return null; }
}

let pending: { owner: string; projectId: string | null; content: EditorContent } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Writes what is pending now; returns whether the browser kept it. */
export function flushReportDraft(): boolean {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending) return true;
  const { owner, projectId, content } = pending;
  pending = null;
  let serialized: string;
  try { serialized = JSON.stringify(content); } catch { return false; }
  const target = storage(owner);
  if (!target) return false;
  const sKey = projectKey(owner, projectId);
  const mKey = memoryKey(owner, projectId);
  try {
    target.setItem(sKey, serialized);
    memoryCache.set(mKey, serialized);
    return true;
  } catch (err) {
    const quota = isQuotaExceeded(err) || hasHeavyArt(content) || serialized.length > 250_000;
    if (!quota) return false;
    try {
      target.removeItem(`${sKey}:versions`);
      evictStoredVersionKeys(target);
      if (serialized.length < 4_200_000) {
        target.setItem(sKey, serialized);
        memoryCache.set(mKey, serialized);
        return true;
      }
    } catch { /* fall through to lightweight storage + full memoryCache */ }
    if (hasHeavyArt(content)) {
      try {
        target.setItem(sKey, JSON.stringify(stripHeavyArt(content)));
        memoryCache.set(mKey, serialized);
        return true;
      } catch (retryErr) {
        if (isQuotaExceeded(retryErr)) {
          memoryCache.set(mKey, serialized);
          return true;
        }
      }
    }
    if (isQuotaExceeded(err)) {
      memoryCache.set(mKey, serialized);
      return true;
    }
    return false;
  }
}

export function saveReportDraft(owner: string, content: EditorContent, projectId: string | null = null) {
  // A different identity's write goes out first, so one never overwrites the other's.
  if (pending && (pending.owner !== owner || pending.projectId !== projectId)) flushReportDraft();
  pending = { owner, projectId, content };
  if (!timer) timer = setTimeout(flushReportDraft, DELAY);
}

/** The three most recent report snapshots, separate from current questionnaire/data. */
export function archiveReportDraft(owner: string, projectId: string | null, content: EditorContent): boolean {
  let serialized: string;
  try { serialized = JSON.stringify(content); } catch { return false; }
  const target = storage(owner);
  if (!target) return false;
  const sKey = `${projectKey(owner, projectId)}:versions`;
  const mKey = memoryKey(owner, projectId);
  const savedAt = new Date().toISOString();

  let existingMem = memoryVersions.get(mKey);
  if (!existingMem) {
    try {
      const parsed: unknown = JSON.parse(target.getItem(sKey) ?? '[]');
      existingMem = Array.isArray(parsed)
        ? parsed.flatMap(item =>
            item && typeof item === 'object' && typeof (item as { savedAt?: unknown }).savedAt === 'string' && 'content' in item
              ? [{ savedAt: (item as { savedAt: string }).savedAt, serialized: JSON.stringify((item as { content: unknown }).content) }]
              : [],
          )
        : [];
    } catch { existingMem = []; }
  }
  const nextMem = [...existingMem.slice(-2), { savedAt, serialized }];

  try {
    let rawList: unknown;
    try { rawList = JSON.parse(target.getItem(sKey) ?? '[]'); } catch { rawList = []; }
    const previous = Array.isArray(rawList) ? rawList.slice(-2) : [];
    const storageContent = serialized.length > 600_000 && hasHeavyArt(content) ? stripHeavyArt(content) : content;
    target.setItem(sKey, JSON.stringify([...previous, { savedAt, content: storageContent }]));
    memoryVersions.set(mKey, nextMem);
    return true;
  } catch (err) {
    const quota = isQuotaExceeded(err) || hasHeavyArt(content) || serialized.length > 250_000;
    if (!quota) return false;
    try {
      evictStoredVersionKeys(target, sKey);
      const compactList = nextMem.map(entry => {
        try {
          const parsed = JSON.parse(entry.serialized) as EditorContent;
          return { savedAt: entry.savedAt, content: hasHeavyArt(parsed) ? stripHeavyArt(parsed) : parsed };
        } catch { return null; }
      }).filter(Boolean);
      target.setItem(sKey, JSON.stringify(compactList));
      memoryVersions.set(mKey, nextMem);
      return true;
    } catch (retryErr) {
      if (isQuotaExceeded(retryErr) || isQuotaExceeded(err) || hasHeavyArt(content)) {
        try { target.removeItem(sKey); } catch { /* ignore */ }
        memoryVersions.set(mKey, nextMem);
        return true;
      }
      return false;
    }
  }
}

export function readReportVersions(owner: string, projectId: string | null = null): { savedAt: string; content: EditorContent }[] {
  const mKey = memoryKey(owner, projectId);
  const memList = memoryVersions.get(mKey);
  if (memList && memList.length > 0) {
    return memList
      .flatMap(item => {
        try { return [{ savedAt: item.savedAt, content: parseEditorContent(JSON.parse(item.serialized)) }]; }
        catch { return []; }
      })
      .slice(-3);
  }
  try {
    const value: unknown = JSON.parse(storage(owner)?.getItem(`${projectKey(owner, projectId)}:versions`) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .flatMap(item => {
        try { return typeof item?.savedAt === 'string' ? [{ savedAt: item.savedAt, content: parseEditorContent(item.content) }] : []; }
        catch { return []; }
      })
      .slice(-3);
  } catch { return []; }
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushReportDraft);
