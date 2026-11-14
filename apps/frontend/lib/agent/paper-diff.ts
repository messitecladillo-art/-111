/** Pure helpers for in-paper diff cards and 3-way paper navigation/synapse targeting. */
import type { EditorContent } from '../editor-model.ts';
import { matchBlueprintNode } from '../report-blueprint.ts';
import { benchmarkReport } from '../report-benchmark.ts';
import { reportPart } from '../report-format.ts';
import { sectionIssues } from './advisors.ts';
import type { ArtifactRecord } from './artifact-library.ts';
import type { ReportChange } from './report-run.ts';

export type ParagraphDiffChunk = {
  kind: 'removed' | 'added' | 'changed';
  index: number;
  before?: string;
  after?: string;
};

export type PaperSectionDiff = {
  sectionId: string;
  title: string;
  mode: 'candidate' | 'revision';
  changeType: 'added' | 'updated' | 'removed';
  chunks: ParagraphDiffChunk[];
  totalChanged: number;
  locked?: boolean;
  details?: string[];
};

const splitLines = (text: string): string[] =>
  text
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean);

/** Compute concise paragraph/line-level diffs using LCS alignment, merging adjacent replace pairs. */
export function diffParagraphLines(beforeLines: readonly string[], afterLines: readonly string[]): {
  chunks: ParagraphDiffChunk[];
  totalChanged: number;
} {
  const a = beforeLines.map(s => s.trim()).filter(Boolean);
  const b = afterLines.map(s => s.trim()).filter(Boolean);
  const n = a.length;
  const m = b.length;

  // Guard LCS allocation on very large sections; fall back to paired line comparison.
  if (n * m > 4000) {
    const raw: ParagraphDiffChunk[] = [];
    const len = Math.max(n, m);
    for (let i = 0; i < len; i++) {
      if (a[i] === b[i]) continue;
      if (i < n && i < m) raw.push({ kind: 'changed', index: i, before: a[i], after: b[i] });
      else if (i < n) raw.push({ kind: 'removed', index: i, before: a[i] });
      else raw.push({ kind: 'added', index: i, after: b[i] });
    }
    return { chunks: raw.slice(0, 6), totalChanged: raw.length };
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: { kind: 'same' | 'removed' | 'added'; text: string; idx: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', text: a[i], idx: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'removed', text: a[i], idx: i });
      i++;
    } else {
      ops.push({ kind: 'added', text: b[j], idx: j });
      j++;
    }
  }
  while (i < n) { ops.push({ kind: 'removed', text: a[i], idx: i }); i++; }
  while (j < m) { ops.push({ kind: 'added', text: b[j], idx: j }); j++; }

  const merged: ParagraphDiffChunk[] = [];
  let k = 0;
  while (k < ops.length) {
    const cur = ops[k];
    if (cur.kind === 'same') { k++; continue; }
    if (cur.kind === 'removed' && ops[k + 1]?.kind === 'added') {
      merged.push({ kind: 'changed', index: cur.idx, before: cur.text, after: ops[k + 1].text });
      k += 2;
      continue;
    }
    merged.push(
      cur.kind === 'removed'
        ? { kind: 'removed', index: cur.idx, before: cur.text }
        : { kind: 'added', index: cur.idx, after: cur.text },
    );
    k++;
  }

  return { chunks: merged.slice(0, 6), totalChanged: merged.length };
}

/** Build paper-canvas diff descriptors for both candidate reports and single-section AI revisions. */
export function buildPaperSectionDiffs(input: {
  changes?: readonly ReportChange[];
  lockedSectionIds?: readonly string[];
  revision?: {
    active: boolean;
    sectionId: string;
    title: string;
    original: readonly string[];
    proposed: readonly string[];
  } | null;
}): PaperSectionDiff[] {
  const locked = new Set(input.lockedSectionIds ?? []);
  const bySection = new Map<string, PaperSectionDiff>();

  for (const change of input.changes ?? []) {
    const { chunks, totalChanged } = diffParagraphLines(splitLines(change.before), splitLines(change.after));
    bySection.set(change.sectionId, {
      sectionId: change.sectionId,
      title: change.title,
      mode: 'candidate',
      changeType: change.changeType,
      chunks,
      totalChanged,
      locked: locked.has(change.sectionId),
      details: change.details,
    });
  }

  if (input.revision?.active && !bySection.has(input.revision.sectionId)) {
    const { chunks, totalChanged } = diffParagraphLines(input.revision.original, input.revision.proposed);
    bySection.set(input.revision.sectionId, {
      sectionId: input.revision.sectionId,
      title: input.revision.title,
      mode: 'revision',
      changeType: 'updated',
      chunks,
      totalChanged,
    });
  }

  return [...bySection.values()];
}

const CHECK_PATTERNS: { ids: readonly string[]; part?: string; nodePrefixes?: readonly string[]; titleRe: RegExp }[] = [
  { ids: ['abstract', 'keywords'], part: 'abstract', titleRe: /摘要/u },
  { ids: ['references', 'referenceFormat', 'citations', 'referenceVerification'], part: 'references', titleRe: /参考文献/u },
  { ids: ['aiDisclosure', 'reproducible'], part: 'appendix', titleRe: /附录/u },
  {
    ids: ['objectives', 'sampling', 'sampleSize', 'validRate', 'pilot', 'qualityControl', 'samplingWording', 'questionnaire'],
    nodePrefixes: ['design.', 'data.pilot'],
    titleRe: /设计|抽样|问卷|调查|方案/u,
  },
  {
    ids: ['tests', 'diagnostics', 'denominators', 'methods', 'reliability', 'validity', 'cleaning', 'oddsRatio', 'rankMedian', 'nullResult', 'clusterCircular', 'dynamicClaim', 'simulationRobust', 'captions', 'figureReferences', 'traceable', 'figureCount', 'tableCount'],
    nodePrefixes: ['data.', 'compare.', 'drivers.', 'sample.', 'diagnosis.'],
    titleRe: /数据|分析|检验|结果|质量|样本|描述/u,
  },
  {
    ids: ['findings', 'findingActions', 'executable', 'limitations', 'causal', 'paragraphs', 'unwritten', 'findingEvidence', 'simulated'],
    nodePrefixes: ['plan.', 'conclusion.', 'diagnosis.'],
    titleRe: /发现|建议|结论|对策|局限|问题/u,
  },
];

/** Map any benchmark check ID to the most relevant section ID on the current paper canvas. */
export function locateCheckSectionId(content: EditorContent, checkId: string): string | null {
  for (const section of content.report) {
    if (sectionIssues(content, section.id, benchmarkReport).some(item => item.check.id === checkId)) {
      return section.id;
    }
  }
  const rule = CHECK_PATTERNS.find(entry => entry.ids.includes(checkId));
  if (rule) {
    if (rule.part) {
      const byPart = content.report.find(section => reportPart(section.title) === rule.part);
      if (byPart) return byPart.id;
    }
    if (rule.nodePrefixes) {
      const byNode = content.report.find(section => {
        const nodeId = matchBlueprintNode(section.title)?.id ?? '';
        return rule.nodePrefixes!.some(prefix => nodeId.startsWith(prefix));
      });
      if (byNode) return byNode.id;
    }
    const byTitle = content.report.find(section => rule.titleRe.test(section.title));
    if (byTitle) return byTitle.id;
  }
  return content.report[0]?.id ?? null;
}

export type ArtifactLocationTarget = {
  sectionId: string | null;
  xrefBlockId?: string;
  pageZero?: boolean;
};

/** Resolve an ArtifactRecord back to its placement on the A4 paper canvas for scroll + synapse highlight. */
export function locateArtifactTarget(content: EditorContent, record: ArtifactRecord): ArtifactLocationTarget {
  const value = record.value;
  if (value.type === 'cover' || value.type === 'frame') {
    return { sectionId: null, pageZero: true };
  }
  if (value.type === 'block') {
    for (const section of content.report) {
      const hit = (section.blocks ?? []).find(block => block.id === value.block.id);
      if (hit) return { sectionId: section.id, xrefBlockId: hit.id };
    }
    const parts = record.familyId.split(':');
    if (parts[0] === 'block' && parts.length >= 3) {
      const section = content.report.find(item => item.id === parts[1]);
      if (section) return { sectionId: section.id, xrefBlockId: parts.slice(2).join(':') };
    }
  }
  if (value.type === 'figure') {
    for (const section of content.report) {
      const hit = (section.blocks ?? []).find(
        block => block.figureId === value.figure.id || block.evidenceId === value.result.id,
      );
      if (hit) return { sectionId: section.id, xrefBlockId: hit.id };
    }
  }
  if (value.type === 'text') {
    const section = content.report.find(item => item.id === value.section.id || item.title === value.section.title);
    if (section) return { sectionId: section.id };
  }
  if (record.familyId.startsWith('section:')) {
    const sid = record.familyId.slice('section:'.length);
    const section = content.report.find(item => item.id === sid);
    if (section) return { sectionId: section.id };
  }
  return { sectionId: null };
}
