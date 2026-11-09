import type { TopicProjectDocument } from '../topic-project.ts';
import { literalText } from '../report-templates.ts';
import type { LiteratureStudy } from './literature-study.ts';

/** Hand off locating information for the adopted evidence, without exporting page text. */
export function adoptedLiteratureLines(selection: TopicProjectDocument, study: LiteratureStudy): string[] {
  const pages = new Map<string, Set<number>>();
  for (const source of selection.brief.sources) {
    const evidence = study.evidence.find(entry => entry.id === source.id && entry.quote === source.snippet);
    if (!evidence) throw Error('选题引用的文献摘录已变化。');
    const held = pages.get(evidence.paperId) ?? new Set<number>();
    held.add(evidence.page);
    pages.set(evidence.paperId, held);
  }
  return study.papers.filter(paper => pages.has(paper.id)).map(paper => {
    const numbers = [...pages.get(paper.id)!].sort((a, b) => a - b).join('、');
    const title = literalText(paper.title.replace(/\s+/gu, ' ').trim());
    return `《${title}》 · PDF 第 ${numbers} 页 · SHA-256 ${paper.id}`;
  });
}
