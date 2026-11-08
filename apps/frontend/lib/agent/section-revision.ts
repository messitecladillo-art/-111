/** A local proposal, never a report until the mounted editor accepts its exact input revision. */
import { parseEditorContent, type EditorContent, type ReportSection } from '../editor-model.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { draftFacts, draftText, type DraftReceipt, type DraftRequest, type Fact } from './draft.ts';
import { standingFindings } from './router.ts';
import { sameReportRunScope, type ReportRunScope } from './report-work.ts';

export type RevisionSnapshot = { content: EditorContent; version: number; inputVersion: string };
export type RevisionAnchor = { scope: ReportRunScope; editorVersion: number; inputVersion: string; sectionId: string; section: string; basis: string };
export type PreparedRevision = {
  anchor: RevisionAnchor; request: DraftRequest; facts: Fact[]; original: string[];
  evidence: { id: string; text: string }[];
};
export type SectionRevisionProposal = { id: string; anchor: RevisionAnchor; paragraphs: string[] };
export type RevisionApplyResult = { ok: true } | { ok: false; reason: string };

const clip = (s: string, n: number) => s.slice(0, n);
const lines = (s: string) => s.split(/\n+/u).filter(p => p.trim());
// The declaration stays verbatim even when the model omits it. It is not editable prose.
const declaration = (s: string) => /^【教学模拟数据/u.test(s.trim());
const editableBody = (s: ReportSection) => lines(s.body).filter(p => !declaration(p));
export const revisionProse = (s: ReportSection) => [...editableBody(s), ...(s.blocks ?? []).filter(b => b.kind === 'paragraph').flatMap(b => lines(b.text))];
const basis = (c: EditorContent, design: Questionnaire | null) => JSON.stringify({ title: c.title, subtitle: c.subtitle, quality: c.quality ?? null, references: c.references ?? null, design });

export function revisionProblem(anchor: RevisionAnchor, snapshot: RevisionSnapshot, design: Questionnaire | null, scope: ReportRunScope): string | null {
  if (!sameReportRunScope(anchor.scope, scope)) return '账户或研究会话已变化，请重新选择章节。';
  if (anchor.inputVersion !== snapshot.inputVersion) return '数据版本或待处理输入已变化，请重新修订。';
  const section = snapshot.content.report.find(s => s.id === anchor.sectionId);
  if (!section) return '目标章节已移除，请重新选择章节。';
  if (JSON.stringify(section) !== anchor.section) return '本节原文、图表或来源已更新，请基于新版本重新修订。';
  if (basis(snapshot.content, design) !== anchor.basis) return '研究材料或登记依据已更新，请基于新版本重新修订。';
  if (snapshot.version !== anchor.editorVersion) return '报告已发生编辑或撤销，请基于当前版本重新修订。';
  return null;
}

export function prepareSectionRevision(snapshot: RevisionSnapshot, sectionId: string, design: Questionnaire | null, scope: ReportRunScope, service: { id: string; revision: number }): PreparedRevision {
  if (!scope.owner) throw Error('请先登录，并选择报告拟稿服务。');
  const content = snapshot.content, section = content.report.find(s => s.id === sectionId);
  if (!section) throw Error('请先选择需要修订的章节。');
  const original = revisionProse(section), existing = original.join('\n');
  if (!existing.trim()) throw Error('本节还没有正文，请先起草内容。');
  if (existing.length > 3000) throw Error('本节正文超过 3000 字，请拆分为较小章节后修订。');
  const held = { results: content.quality?.results ?? [], findings: content.quality?.findings ?? [], pending: false, placed: [] };
  const facts = draftFacts(held, 'section.revision');
  const request: DraftRequest = {
    schemaVersion: 1, idempotencyKey: crypto.randomUUID(),
    section: { node: 'section.revision', title: clip(section.title || '未命名章节', 80), purpose: '修订指定章节已有正文，理顺论证与语言；不得新增调查事实、文献、实施效果或方法结果。', moves: ['保留原文研究问题与结论边界', '用登记事实支持表述，区分解释与实证结果', '改善段落衔接与准确性；不写其他章节'], needs: ['待人工复核的正文候选'], length: null },
    project: { title: clip(content.title, 80), objective: clip(design?.objective ?? '', 400), population: clip(design?.population ?? '', 200) },
    facts: facts.map(({ id, text }) => ({ id, text })),
    findings: standingFindings(held).slice(0, 20).map(f => ({ title: clip(f.title, 80), interpretation: clip(f.interpretation, 600), scope: clip(f.scope, 300), action: clip(f.action, 300) })),
    existing, serviceId: service.id, serviceRevision: service.revision, consent: true,
  };
  if (new TextEncoder().encode(JSON.stringify(request)).length > 40_000) throw Error('本节依据超出拟稿容量，请先缩小修订范围。');
  return {
    anchor: { scope: { ...scope }, editorVersion: snapshot.version, inputVersion: snapshot.inputVersion, sectionId, section: JSON.stringify(section), basis: basis(content, design) },
    request, facts, original,
    evidence: [
      { id: 'project', text: `课题：${request.project.title}${request.project.objective ? `；目的：${request.project.objective}` : ''}${request.project.population ? `；范围：${request.project.population}` : ''}` },
      ...facts.map(f => ({ id: f.id, text: f.text })),
      ...request.findings.map((f, i) => ({ id: `finding-${i}`, text: `${f.title}：${f.interpretation}；范围：${f.scope}；行动：${f.action}` })),
    ],
  };
}

export function proposalFromReceipt(prepared: PreparedRevision, receipt: DraftReceipt): SectionRevisionProposal {
  if (receipt.id !== prepared.request.idempotencyKey || receipt.node !== prepared.request.section.node) throw Error('回执与本次修订请求不一致，未接收候选。');
  if (receipt.status !== 'ready' || !receipt.paragraphs.length) throw Error('本次没有返回可用正文。');
  return { id: receipt.id, anchor: prepared.anchor, paragraphs: receipt.paragraphs.map(p => draftText(p, prepared.facts)) };
}

/** Preserve all non-prose objects and their ordering. New paragraphs occupy the original prose slots. */
export function applySectionRevision(snapshot: RevisionSnapshot, design: Questionnaire | null, scope: ReportRunScope, proposal: SectionRevisionProposal): EditorContent {
  const problem = revisionProblem(proposal.anchor, snapshot, design, scope);
  if (problem) throw Error(problem);
  if (!proposal.paragraphs.length || proposal.paragraphs.length > 8 || proposal.paragraphs.some(p => typeof p !== 'string' || !p.trim() || p.length > 2000)) throw Error('候选正文格式无效。');
  const section = snapshot.content.report.find(s => s.id === proposal.anchor.sectionId)!;
  const nextText = proposal.paragraphs.join('\n');
  const protectedTokens = revisionProse(section).join('\n').match(/\[\[[^\]]+\]\]|\$[^$\n]+\$/gu) ?? [];
  if (protectedTokens.some(token => !nextText.includes(token))) throw Error('候选遗漏行内引用或公式，请在编辑器中人工修订。');
  const bodyWeight = editableBody(section).length;
  const total = bodyWeight + (section.blocks ?? []).filter(b => b.kind === 'paragraph').reduce((n, b) => n + Math.max(1, lines(b.text).length), 0);
  let consumed = 0, weight = 0;
  const take = (count: number) => {
    weight += count;
    const end = Math.round(proposal.paragraphs.length * weight / Math.max(1, total));
    const text = proposal.paragraphs.slice(consumed, end).join('\n'); consumed = end; return text;
  };
  const body = [...lines(section.body).filter(declaration), ...(bodyWeight ? [take(bodyWeight)] : total ? [] : [nextText])].filter(Boolean).join('\n');
  const blocks = section.blocks?.map(b => b.kind === 'paragraph' ? { ...b, text: take(Math.max(1, lines(b.text).length)) } : b);
  const next = { ...snapshot.content, report: snapshot.content.report.map(s => s.id === section.id ? { ...s, body, ...(blocks ? { blocks } : {}) } : s) };
  return parseEditorContent(next);
}
