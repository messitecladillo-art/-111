import { parseProjectReport } from './project-report.ts';
import { reportLinkState, type LinkState } from './report-storyboard.ts';

export const DEFENSE_REFERENCE_LIMITS = { preview: 240 } as const;
export type DefenseSource = {
  schema: 'project-defense-source/v1';
  projectId: string; reportId: string; revision: number; title: string; updatedAt: string; contentHash: string;
  sections: { id: string; number: number; title: string; preview: string; body: string; source: string }[];
  slides: { id: string; number: number; title: string; preview: string; body: string; aside: string; notes: string; sourceSectionId: string | null; linkState: LinkState }[];
};
/** Display-only excerpt: original source text remains available in full. */
export function defenseReferencePreview(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= DEFENSE_REFERENCE_LIMITS.preview) return normalized;
  let preview = '';
  for (const character of normalized) { if (preview.length + character.length > DEFENSE_REFERENCE_LIMITS.preview - 1) break; preview += character; }
  return `${preview}…`;
}
export async function projectDefenseSource(value: unknown, projectId: string): Promise<DefenseSource> {
  // Parse first to detach the input and reject another project's receipt before hashing.
  const report = parseProjectReport(value, projectId);
  const bytes = new TextEncoder().encode(JSON.stringify(report.content));
  const contentHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const sections = report.content.report.map((section, index) => ({ id: section.id, number: index + 1, title: section.title, preview: defenseReferencePreview(section.body), body: section.body, source: section.source }));
  const slides = await Promise.all(report.content.slides.map(async (slide, index) => ({ id: slide.id, number: index + 1, title: slide.title, preview: defenseReferencePreview(slide.notes || slide.body), body: slide.body, aside: slide.aside, notes: slide.notes, sourceSectionId: slide.reportLink?.sectionId ?? null, linkState: await reportLinkState(report.content, slide) })));
  return { schema: 'project-defense-source/v1', projectId: report.projectId, reportId: report.id, revision: report.revision, title: report.title, updatedAt: report.updatedAt, contentHash, sections, slides };
}
export function defenseReferenceLocator(source: DefenseSource, kind: 'section' | 'slide', id: string): string {
  const item = kind === 'section' ? source.sections.find(section => section.id === id) : source.slides.find(slide => slide.id === id);
  if (!item) throw Error('所选参考条目不属于这一版报告。');
  return `${source.title} · 报告 v${source.revision}\n${kind === 'section' ? '章节' : 'PPT 页'} ${item.number}：${item.title}\n对象 ID：${item.id}\n项目 ID：${source.projectId}\n报告版本 ID：${source.reportId}\n内容 SHA-256：${source.contentHash}`;
}
