// A report section drafted with the user's own model service, held to the project's facts. The model sees each fact as
// a short statement carrying its numbers, named F1…Fn, and may write a number only as a placeholder; the browser puts
// the fact's own value in its place, so every number in an adopted draft comes from a registered result. The backend
// holds the same contract (apps/backend …/writing_agent/services/section_draft.py) and checks it again.
import type { EditorContent } from '../editor-model.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { writtenLines } from '../report-benchmark.ts';
import { blueprintNode, matchBlueprintNode, type BlueprintNode } from '../report-blueprint.ts';
import { suggestedNode } from '../report-placement.ts';
import { literalText } from '../report-templates.ts';
import type { ResultSnapshot } from '../research-quality.ts';
import { figure, isFrame, methodName, standingFindings, type Line, type ResultsView, type Span } from './router.ts';

/** `text` is what the model reads; `value` is what takes the place of its placeholder in the draft. */
export type Fact = { id: string; text: string; value: string };
export type DraftSection = { node: string; title: string; purpose: string; moves: string[]; needs: string[]; length: [number, number] | null };
export type DraftRequest = {
  schemaVersion: 1; idempotencyKey: string; section: DraftSection;
  project: { title: string; objective: string; population: string };
  facts: { id: string; text: string }[];
  findings: { title: string; interpretation: string; scope: string; action: string }[];
  existing: string; serviceId: string; serviceRevision: number; consent: true;
};
export type DraftStatus = 'running' | 'ready' | 'failed' | 'outcome_unknown';
export type DraftParagraph = { text: string; facts: string[] };
export type DraftReceipt = { id: string; status: DraftStatus; node: string; paragraphs: DraftParagraph[]; droppedParagraphs: number; errorCode: string | null };

export const MAX_FACTS = 80;
const PLACEHOLDER = /\{(F[1-9][0-9]{0,2})\}/gu;
const DIGIT = /[0-9０-９]/u;
const clip = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
const tidy = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** The section a sentence names, by its title or the words that recognise it: a section or the abstract, never a chapter heading or back matter. */
export function draftableNode(text: string): BlueprintNode | null {
  const node = matchBlueprintNode(text.trim());
  return node && (node.kind === 'section' || node.kind === 'abstract') ? node : null;
}

/** What the model is told about the section: its purpose, its moves in order, the elements it needs, its length. */
export function draftSection(nodeId: string): DraftSection {
  const node = blueprintNode(nodeId);
  return { node: node.id, title: clip(node.title, 80), purpose: clip(node.purpose, 200), moves: node.moves.slice(0, 8).map(m => clip(m, 200)),
    needs: node.needs.slice(0, 8).map(n => clip(n.label, 40)), length: node.length ? [node.length[0], node.length[1]] : null };
}

const numeric = (cell: unknown): number | null => {
  const n = typeof cell === 'number' ? cell : typeof cell === 'string' && cell.trim() !== '' ? Number(cell) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * The facts a draft may cite: for each registered result, its method and effective sample, its statistics and the
 * numbers of its first rows; for each sampling frame, its planned sample. Results that belong in this section come
 * first, so a long project still gives the section its own numbers.
 */
export function draftFacts(held: NonNullable<ResultsView>, nodeId: string): Fact[] {
  const ordered = [...held.results].reverse().sort((a, b) => Number(suggestedNode(b) === nodeId) - Number(suggestedNode(a) === nodeId));
  const facts: Omit<Fact, 'id'>[] = [];
  const add = (text: string, value: string) => { if (facts.length < MAX_FACTS) facts.push({ text: clip(tidy(text), 160), value }); };
  for (const r of ordered) {
    const title = clip(r.title, 40);
    if (!isFrame(r)) add(`「${title}」：${methodName(r)}，有效样本 ${r.n}（共 ${r.total}）${r.classification === 'simulated' ? '，教学模拟数据' : ''}`, String(r.n));
    for (const m of r.metrics.slice(0, 4)) if (m.value !== null && Number.isFinite(m.value)) add(`「${title}」的${m.label}为 ${figure(m.value)}`, figure(m.value));
    if (!isFrame(r)) for (const row of r.rows.slice(0, 6)) rowFacts(r, row, title, add);
  }
  return facts.map((f, i) => ({ id: `F${i + 1}`, ...f }));
}

function rowFacts(r: ResultSnapshot, row: ResultSnapshot['rows'][number], title: string, add: (text: string, value: string) => void) {
  const label = row.filter(cell => typeof cell === 'string' && numeric(cell) === null).join('·');
  if (!label) return;
  let shown = 0;
  row.forEach((cell, i) => {
    const n = numeric(cell), header = r.headers[i] ?? '';
    if (n === null || shown >= 2 || !header) return;
    shown++;
    const share = /%|％/u.test(header), name = header.replace(/\s*[（(]\s*[%％]\s*[)）]/gu, '').trim(), value = `${figure(n)}${share ? '%' : ''}`;
    add(`「${title}」中「${clip(label, 30)}」的${name}为 ${value}`, value);
  });
}

/** What the section already says, so the draft adds to it rather than repeating it. */
export function sectionText(content: EditorContent, nodeId: string): string {
  const sections = content.report.filter(s => matchBlueprintNode(s.title)?.id === nodeId);
  const lines = sections.flatMap(s => [...writtenLines(s.body), ...(s.blocks ?? []).filter(b => b.kind === 'paragraph').flatMap(b => writtenLines(b.text))]);
  return clip(lines.join('\n'), 3000);
}

export function draftRequest(input: { nodeId: string; held: NonNullable<ResultsView>; content: EditorContent; design: Questionnaire | null; service: { id: string; revision: number } }): { request: DraftRequest; facts: Fact[] } {
  const facts = draftFacts(input.held, input.nodeId);
  return {
    facts,
    request: {
      schemaVersion: 1, idempotencyKey: crypto.randomUUID(), section: draftSection(input.nodeId),
      project: { title: clip(tidy(input.content.title || input.design?.title || ''), 80), objective: clip(tidy(input.design?.objective ?? ''), 400), population: clip(tidy(input.design?.population ?? ''), 200) },
      facts: facts.map(({ id, text }) => ({ id, text })),
      findings: standingFindings(input.held).slice(0, 20).map(f => ({ title: clip(tidy(f.title) || '未命名发现', 80), interpretation: clip(tidy(f.interpretation), 600), scope: clip(tidy(f.scope), 300), action: clip(tidy(f.action), 300) })),
      existing: sectionText(input.content, input.nodeId), serviceId: input.service.id, serviceRevision: input.service.revision, consent: true,
    },
  };
}

/** A receipt from the backend, checked again: a paragraph with a digit of its own or an unknown fact is dropped here too. */
export function parseDraftReceipt(value: unknown, factIds?: ReadonlySet<string>): DraftReceipt {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !['running', 'ready', 'failed', 'outcome_unknown'].includes(v.status as string)) throw Error('拟稿回执格式无效。');
  let dropped = typeof v.droppedParagraphs === 'number' ? v.droppedParagraphs : 0;
  const paragraphs = (Array.isArray(v.paragraphs) ? v.paragraphs : []).flatMap((row: unknown) => {
    const text = (row as { text?: unknown } | null)?.text;
    if (typeof text !== 'string' || !text.trim()) { dropped++; return []; }
    const cited = [...text.matchAll(PLACEHOLDER)].map(m => m[1]);
    if (DIGIT.test(text.replace(PLACEHOLDER, '')) || (factIds && cited.some(id => !factIds.has(id)))) { dropped++; return []; }
    return [{ text, facts: [...new Set(cited)] }];
  });
  return { id: v.id, status: v.status as DraftStatus, node: typeof v.node === 'string' ? v.node : '', paragraphs: paragraphs.slice(0, 8), droppedParagraphs: dropped, errorCode: typeof v.errorCode === 'string' ? v.errorCode : null };
}

/** A paragraph as the conversation shows it: the model's words, and each fact's value in gold where it cited one. */
export function draftLine(paragraph: DraftParagraph, facts: readonly Fact[]): Line {
  const byId = new Map(facts.map(f => [f.id, f])), spans: Span[] = [];
  let at = 0;
  for (const m of paragraph.text.matchAll(PLACEHOLDER)) {
    if (m.index > at) spans.push({ text: paragraph.text.slice(at, m.index), mark: 'cyan' });
    spans.push({ text: byId.get(m[1])?.value ?? '（缺少事实）', mark: 'gold' });
    at = m.index + m[0].length;
  }
  if (at < paragraph.text.length) spans.push({ text: paragraph.text.slice(at), mark: 'cyan' });
  return spans;
}

/** A paragraph as the report receives it: the model's words kept literal (no formulas or references of its own), values filled in. */
export function draftText(paragraph: DraftParagraph, facts: readonly Fact[]): string {
  const byId = new Map(facts.map(f => [f.id, f]));
  return paragraph.text.split(PLACEHOLDER).map((part, i) => i % 2 ? literalText(byId.get(part)?.value ?? '') : literalText(part)).join('');
}
