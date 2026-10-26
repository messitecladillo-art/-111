/**
 * The report as a plan of work: the sections of the report blueprint this project calls for, how much of each is
 * written and which of the elements it needs it has, then the benchmark's gaps. The outline comes from the project
 * itself (the blueprint's required sections, the optional ones the report already has, and those its registered
 * results belong in) with the criterion-referenced benchmark; no exemplar's chapters or counts are imposed on it.
 */
import type { EditorContent } from '../editor-model.ts';
import { writtenLines, type BenchmarkResult } from '../report-benchmark.ts';
import { blueprintOutline, matchBlueprintNode, type BlueprintElement } from '../report-blueprint.ts';

export type PlanSection = {
  node: string; title: string; kind: 'abstract' | 'chapter' | 'section';
  /** Whether the report has this section yet; drafting or placing creates it from the blueprint. */
  present: boolean;
  /** Characters written, guidance excluded. */
  written: number; length: readonly [number, number] | null;
  needs: { label: string; met: boolean }[];
  /** Prose the model may draft here: every section but the analyses, whose numbers come from placing results. */
  draftable: boolean;
};
export type ReportPlan = {
  sections: PlanSection[];
  score: number | null; passed: number; total: number;
  /** The benchmark's failing or partial checks, failures first. */
  gaps: { label: string; detail: string }[];
};

const HAS: Record<BlueprintElement, (blocks: { kind: string; text: string }[], text: string) => boolean> = {
  figure: blocks => blocks.some(b => b.kind === 'chart'),
  table: blocks => blocks.some(b => b.kind === 'table'),
  formula: blocks => blocks.some(b => b.kind === 'formula'),
  citation: (blocks, text) => /\[\[引:|［\d+］|\[\d+\]/u.test(text) || blocks.some(b => b.kind === 'citation'),
  finding: (_, text) => text.length > 0,
};

/** `resultNodes`: the blueprint sections the registered results belong in, so the outline makes room for them. */
export function reportPlan(content: EditorContent, benchmark: BenchmarkResult | null, resultNodes: readonly string[] = []): ReportPlan {
  const held = new Map<string, { blocks: { kind: string; text: string }[]; lines: string[] }>();
  for (const section of content.report) {
    const node = matchBlueprintNode(section.title);
    if (!node) continue;
    const blocks = section.blocks ?? [], entry = held.get(node.id) ?? { blocks: [], lines: [] };
    entry.blocks.push(...blocks);
    entry.lines.push(...writtenLines(section.body), ...blocks.filter(b => b.kind === 'paragraph').flatMap(b => writtenLines(b.text)));
    held.set(node.id, entry);
  }
  const sections = blueprintOutline({ nodes: [...held.keys(), ...resultNodes] }).flatMap(({ node }) => {
    if (node.kind === 'references' || node.kind === 'appendix') return [];
    const found = held.get(node.id), text = found?.lines.join('\n') ?? '';
    return [{
      node: node.id, title: node.title, kind: node.kind as PlanSection['kind'], present: !!found,
      written: text.replace(/\s+/gu, '').length, length: node.length ?? null,
      needs: node.needs.map(need => ({ label: need.label, met: !!found && HAS[need.element](found.blocks, text) })),
      draftable: node.kind !== 'chapter' && node.module !== 'analysis',
    }];
  });
  const checks = benchmark?.checks ?? [];
  const gaps = checks.filter(c => c.status === 'fail').concat(checks.filter(c => c.status === 'partial')).slice(0, 4).map(c => ({ label: c.label, detail: c.detail }));
  const scored = checks.filter(c => c.status !== 'na');
  return { sections, score: benchmark ? benchmark.score : null, passed: scored.filter(c => c.status === 'pass').length, total: scored.length, gaps };
}

/** Where a section stands: not in the report yet, nothing written, under way (short of its length or an element), or in place. */
export function sectionState(s: PlanSection): 'missing' | 'empty' | 'partial' | 'done' {
  if (!s.present) return 'missing';
  if (!s.written && s.needs.every(n => !n.met)) return 'empty';
  if ((s.length && s.written < s.length[0]) || s.needs.some(n => !n.met)) return 'partial';
  return 'done';
}
