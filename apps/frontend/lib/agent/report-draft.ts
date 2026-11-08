import { parseEditorContent, type EditorContent } from '../editor-model.ts';

/**
 * The agent's report draft, kept in this browser so a reload does not lose it: an account's in local storage under its
 * own ID, a guest's for the tab only, as conversations are. Another identity never reads it. A draft that no longer
 * parses is dropped rather than half-loaded. Writes are coalesced, since a report is rewritten on every keystroke.
 */
const PREFIX = 'evix.agent.report-draft.v1:', DELAY = 800;
const projectKey=(owner:string,projectId:string|null)=>projectId?`evix.agent.report-draft.v2:${encodeURIComponent(owner)}:${encodeURIComponent(projectId)}`:PREFIX+owner;
const storage = (owner: string): Storage | null => {
  try { return owner === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; }
};

export function readReportDraft(owner: string, projectId: string|null = null): EditorContent | null {
  try {
    const raw = storage(owner)?.getItem(projectKey(owner,projectId));
    return raw ? parseEditorContent(JSON.parse(raw)) : null;
  } catch { return null; }
}

let pending: { owner: string; projectId:string|null; content: EditorContent } | null = null, timer: ReturnType<typeof setTimeout> | null = null;
/** Writes what is pending now; returns whether the browser kept it. */
export function flushReportDraft(): boolean {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending) return true;
  const { owner, projectId, content } = pending;
  pending = null;
  try { const target=storage(owner);if(!target)return false;target.setItem(projectKey(owner,projectId), JSON.stringify(content)); return true; } catch { return false; }
}
export function saveReportDraft(owner: string, content: EditorContent, projectId:string|null=null) {
  // A different identity's write goes out first, so one never overwrites the other's.
  if (pending && (pending.owner !== owner||pending.projectId!==projectId)) flushReportDraft();
  pending = { owner, projectId, content };
  if (!timer) timer = setTimeout(flushReportDraft, DELAY);
}
/** The three most recent report snapshots, separate from current questionnaire/data. */
export function archiveReportDraft(owner:string,projectId:string|null,content:EditorContent):boolean{
  try{
    const target=storage(owner);if(!target)return false;
    const key=`${projectKey(owner,projectId)}:versions`;let value:unknown;
    try{value=JSON.parse(target.getItem(key)??'[]');}catch{value=[];}
    const previous=Array.isArray(value)?value.slice(-2):[];
    target.setItem(key,JSON.stringify([...previous,{savedAt:new Date().toISOString(),content}]));return true;
  }catch{return false;}
}
export function readReportVersions(owner:string,projectId:string|null=null):{savedAt:string;content:EditorContent}[]{
  try{
    const value:unknown=JSON.parse(storage(owner)?.getItem(`${projectKey(owner,projectId)}:versions`)??'[]');
    if(!Array.isArray(value))return [];
    return value.flatMap(item=>{try{return typeof item?.savedAt==='string'?[{savedAt:item.savedAt,content:parseEditorContent(item.content)}]:[];}catch{return [];}}).slice(-3);
  }catch{return [];}
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushReportDraft);
