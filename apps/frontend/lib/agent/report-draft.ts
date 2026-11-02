import { parseEditorContent, type EditorContent } from '../editor-model.ts';

/**
 * The agent's report draft, kept in this browser so a reload does not lose it: an account's in local storage under its
 * own ID, a guest's for the tab only, as conversations are. Another identity never reads it. A draft that no longer
 * parses is dropped rather than half-loaded. Writes are coalesced, since a report is rewritten on every keystroke.
 */
const PREFIX = 'evix.agent.report-draft.v1:', DELAY = 800;
const storage = (owner: string): Storage | null => {
  try { return owner === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; }
};

export function readReportDraft(owner: string): EditorContent | null {
  try {
    const raw = storage(owner)?.getItem(PREFIX + owner);
    return raw ? parseEditorContent(JSON.parse(raw)) : null;
  } catch { return null; }
}

let pending: { owner: string; content: EditorContent } | null = null, timer: ReturnType<typeof setTimeout> | null = null;
/** Writes what is pending now; returns whether the browser kept it. */
export function flushReportDraft(): boolean {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending) return true;
  const { owner, content } = pending;
  pending = null;
  try { storage(owner)?.setItem(PREFIX + owner, JSON.stringify(content)); return true; } catch { return false; }
}
export function saveReportDraft(owner: string, content: EditorContent) {
  // A different identity's write goes out first, so one never overwrites the other's.
  if (pending && pending.owner !== owner) flushReportDraft();
  pending = { owner, content };
  if (!timer) timer = setTimeout(flushReportDraft, DELAY);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushReportDraft);
