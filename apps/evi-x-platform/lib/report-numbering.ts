/**
 * Chapter-based numbers for figures, tables and display equations ("图 4-1", "表 4-1", "（4-1）"), and the
 * `[[图:块ID]]` reference tokens that resolve to them. Numbers are derived at export and preview time from the
 * block order, so moving a block never leaves a stale number behind.
 */
import type { EditorContent, ReportSection } from './editor-model.ts';
import { reportHeadingLevel, reportPart } from './report-format.ts';

export type LabelKind = 'figure' | 'table' | 'equation';
export type BlockLabel = { kind: LabelKind; number: string; label: string; reference: string };

const NAMES: Record<LabelKind, string> = { figure: '图', table: '表', equation: '式' };
const KINDS: Record<string, LabelKind> = { 图: 'figure', 表: 'table', 式: 'equation' };
const kindOf = (blockKind: string): LabelKind | null => blockKind === 'chart' ? 'figure' : blockKind === 'table' ? 'table' : blockKind === 'formula' ? 'equation' : null;

/** Captions look labels up by section and block, since a block ID is only unique within its section. */
export const labelKey = (sectionId: string, blockId: string) => `${sectionId}\u0000${blockId}`;
export const blockLabel = (labels: Map<string, BlockLabel>, sectionId: string, blockId: string) => labels.get(labelKey(sectionId, blockId));

/**
 * Numbers restart in every body chapter (一、二、…); appendices use their own 附图 / 附表 sequence.
 * The map holds every block under its section-qualified key, and under its bare ID only when that ID is unique
 * in the report, so a reference to a repeated ID is reported as broken rather than resolved to the wrong block.
 */
export function reportLabels(report: readonly ReportSection[]): Map<string, BlockLabel> {
  const labels = new Map<string, BlockLabel>();
  const byId = new Map<string, BlockLabel | null>();
  let chapter = 0;
  let body = { figure: 0, table: 0, equation: 0 };
  const appendix = { figure: 0, table: 0, equation: 0 };
  for (const section of report) {
    const part = reportPart(section.title);
    if (part === 'body' && reportHeadingLevel(section.title) === 1) { chapter++; body = { figure: 0, table: 0, equation: 0 }; }
    for (const block of section.blocks ?? []) {
      const kind = kindOf(block.kind);
      if (!kind) continue;
      let label: BlockLabel;
      if (part === 'appendix') {
        const n = ++appendix[kind];
        label = kind === 'equation'
          ? { kind, number: `附${n}`, label: `（附${n}）`, reference: `式（附${n}）` }
          : { kind, number: String(n), label: `附${NAMES[kind]} ${n}`, reference: `附${NAMES[kind]} ${n}` };
      } else {
        const number = chapter ? `${chapter}-${++body[kind]}` : String(++body[kind]);
        label = kind === 'equation'
          ? { kind, number, label: `（${number}）`, reference: `式（${number}）` }
          : { kind, number, label: `${NAMES[kind]} ${number}`, reference: `${NAMES[kind]} ${number}` };
      }
      labels.set(labelKey(section.id, block.id), label);
      byId.set(block.id, byId.has(block.id) ? null : label);
    }
  }
  for (const [id, label] of byId) if (label) labels.set(id, label);
  return labels;
}

/** A caption with its number: "图 4-1  每周使用频次" (two spaces between number and title). */
export function numberedCaption(label: BlockLabel | undefined, title: string): string {
  return label ? `${label.label}  ${title}`.trim() : title;
}

export const referenceToken = (kind: LabelKind, blockId: string) => `[[${NAMES[kind]}:${blockId}]]`;
const TOKEN = /\[\[(图|表|式):([^\]\n]{1,80})\]\]/g;
export type ReferenceSegment = { text: string; missing?: boolean };

/** Text split into plain runs and resolved references; a reference to a missing or mismatched block is flagged. */
export function referenceSegments(text: string, labels: Map<string, BlockLabel>): ReferenceSegment[] {
  const out: ReferenceSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    const label = labels.get(match[2]);
    out.push(label && label.kind === KINDS[match[1]] ? { text: label.reference } : { text: `${match[1]}（引用失效）`, missing: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Export-time resolution: a dangling reference stops the export rather than printing a wrong number. */
export function resolveReferences(text: string, labels: Map<string, BlockLabel>, where: string): string {
  const segments = referenceSegments(text, labels);
  if (segments.some(s => s.missing)) throw Error(`「${where}」中有图表引用已失效（对应的图、表或公式已删除、类型不符或被复制成两处），请重新插入引用后再导出。`);
  return segments.map(s => s.text).join('');
}

/** Every dangling reference in the report, for the editor to point at before export. */
export function danglingReferences(content: EditorContent): { sectionId: string; title: string }[] {
  const labels = reportLabels(content.report);
  return content.report.filter(section => [section.body, ...(section.blocks ?? []).map(b => b.text)]
    .some(text => referenceSegments(text, labels).some(s => s.missing)))
    .map(section => ({ sectionId: section.id, title: section.title }));
}
