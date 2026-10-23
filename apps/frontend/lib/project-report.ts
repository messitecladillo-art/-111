import { createEditorContent, parseEditorContent, type EditorContent, type ReportSection } from './editor-model.ts';
import {parseEvidence, type EvidenceInput} from './research-flow.ts';
import { blueprintSections, insertBeforeBackMatter } from './report-blueprint.ts';

export type ProjectReport = { id: string; projectId: string; revision: number; title: string; updatedAt: string; content: EditorContent };
export type ProjectReportSummary = Omit<ProjectReport, 'content'>;
export type ReportProposal = { id: string; section: ReportSection };
export type SaveReportRequest = { content: EditorContent; expectedRevision: number; idempotencyKey: string };
/** Compare schema values rather than insertion order, while retaining invalid in-progress edits as dirty. */
export function reportContentsEqual(left: EditorContent, right: EditorContent): boolean {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map(key => [key, ordered(record[key])]));
    }
    return value;
  }
  try { return JSON.stringify(ordered(parseEditorContent(left))) === JSON.stringify(ordered(parseEditorContent(right))); }
  catch { return false; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseProjectReport(value: unknown, projectId: string, full: false): ProjectReportSummary;
export function parseProjectReport(value: unknown, projectId: string, full?: true): ProjectReport;
export function parseProjectReport(value: unknown, projectId: string, full = true): ProjectReport | ProjectReportSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('报告回执无效。');
  const r = value as Record<string, unknown>;
  const fields = ['id', 'projectId', 'revision', 'title', 'updatedAt', ...(full ? ['content'] : [])];
  if (Object.keys(r).length !== fields.length || fields.some(key => !Object.hasOwn(r, key)) || typeof r.id !== 'string' || !uuid.test(r.id) || r.projectId !== projectId || !Number.isSafeInteger(r.revision) || (r.revision as number) < 1 || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 120 || typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))) throw Error('报告回执与当前项目不匹配。');
  const result = { id: r.id, projectId, revision: r.revision as number, title: r.title, updatedAt: r.updatedAt };
  if (!full) return result;
  const content = parseEditorContent(r.content);
  if (content.title !== result.title) throw Error('报告标题与回执不一致。');
  return { ...result, content };
}
export function parseReportHead(value: unknown, projectId: string): ProjectReport | null {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'report')) throw Error('报告回执无效。');
  const report = (value as { report: unknown }).report;
  return report === null ? null : parseProjectReport(report, projectId);
}
export function appendEvidenceSection(content: EditorContent, section: ReportSection): EditorContent {
  // Preserve the original proposal bytes and every existing report/slide object; place it before the back matter.
  if (content.report.some(item => item.id === section.id)) throw Error('这份提案已加入报告。');
  return parseEditorContent({ ...content, report: insertBeforeBackMatter(content.report, { ...section }) });
}
/** New project reports start from the blueprint's default report type; IDs are fixed so an untouched draft compares equal. */
export function newProjectReport(title: string): EditorContent {
  const content = createEditorContent();
  let shortened='';
  for(const character of title){if(shortened.length+character.length>120)break;shortened+=character;}
  content.title = shortened || content.title;
  content.report = blueprintSections();
  return content;
}

/** Stable per calculation input, so double clicks and reopening cannot duplicate an evidence section. */
export async function evidenceSectionId(input:EvidenceInput):Promise<string>{
  const value=new TextEncoder().encode(JSON.stringify(parseEvidence(input)));
  const hash=await crypto.subtle.digest('SHA-256',value);
  return 'evidence-'+[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
