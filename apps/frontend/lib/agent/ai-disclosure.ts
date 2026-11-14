/**
 * Helpers for competition-ready final delivery:
 * 1) Aggregate AiUsageLedger/v1 + workflow model-call receipts into honest disclosure lines
 *    and downloadable Markdown (never overclaiming ledger coverage or fabricating tokens).
 * 2) Build the main .docx archive and run local anonymity/compliance preflight in-browser.
 */
import type { EditorContent } from '../editor-model.ts';
import { parseEditorContent } from '../editor-model.ts';
import type { AiUsageLedger, AiUsageRecord } from '../evidence-appendices.ts';
import { aiAppendix } from '../report-appendices.ts';
import { DEFAULT_REPORT_SETTINGS, reportExportOptions } from '../report-format.ts';
import { inspectSubmissionLocal, normalizeIdentityTerms, type PreflightReport } from '../submission-preflight.ts';
import { ROLE_META, type WorkflowModelCallReceipt, type WorkflowRole } from './workflow-task-client.ts';

export type FullReportDisclosureSummary = {
  used?: boolean;
  modelLabel?: string | null;
  sectionCount?: number;
  note?: string | null;
};

export type AiDisclosureInput = {
  content: EditorContent;
  ledger?: AiUsageLedger | null;
  workflowCalls?: readonly WorkflowModelCallReceipt[];
  fullReportSummary?: FullReportDisclosureSummary | null;
  manualToolsNote?: string;
};

const PURPOSE_LABELS: Record<AiUsageRecord['purpose'], string> = {
  planning: '研究规划',
  questionnaire: '问卷提案',
  'analysis-explanation': '分析解释',
  'report-draft': '报告草稿',
  'slide-draft': '幻灯片草稿',
  'visual-concept': '视觉概念',
  other: '其他用途',
};

const RECORD_STATUS_LABELS: Record<AiUsageRecord['status'], string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  unknown: '待核对',
};

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  succeeded: '已完成',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  running: '执行中',
  dispatched: '已发出',
};

function stepRoleLabel(step: string): string {
  const prefix = step.split(/[:._-]/u)[0] as WorkflowRole;
  const meta = ROLE_META[prefix];
  return meta ? `${meta.label}（${step}）` : step;
}

function formatRecordTokens(usage: AiUsageRecord['usage']): string {
  if (usage.inputTokens == null && usage.outputTokens == null) return '未返回 Token 统计';
  const parts: string[] = [];
  if (usage.inputTokens != null) parts.push(`输入 ${usage.inputTokens}`);
  if (usage.outputTokens != null) parts.push(`输出 ${usage.outputTokens}`);
  return `${parts.join(' / ')} tokens`;
}

function formatReceiptTokens(usage: WorkflowModelCallReceipt['usage']): string {
  if (!usage) return '未返回 Token 统计';
  const parts: string[] = [];
  if (usage.inputTokens != null) parts.push(`输入 ${usage.inputTokens}`);
  if (usage.outputTokens != null) parts.push(`输出 ${usage.outputTokens}`);
  if (usage.totalTokens != null) parts.push(`合计 ${usage.totalTokens}`);
  return parts.length ? `${parts.join(' / ')} tokens` : '未返回 Token 统计';
}

function collectToolLabels(input: AiDisclosureInput): string[] {
  const labels = new Set<string>();
  for (const record of input.ledger?.records ?? []) {
    const provider = record.provider ?? '外部模型';
    const model = record.model ? `（${record.model}）` : '';
    labels.add(`${provider}${model}`);
  }
  for (const call of input.workflowCalls ?? []) {
    labels.add(`${call.serviceId}#v${call.serviceRevision}`);
  }
  if (input.fullReportSummary?.used && input.fullReportSummary.modelLabel) {
    labels.add(input.fullReportSummary.modelLabel);
  }
  if (input.manualToolsNote?.trim()) {
    labels.add(input.manualToolsNote.trim());
  }
  return [...labels];
}

function collectUses(input: AiDisclosureInput): string[] {
  const uses = new Set<string>();
  for (const record of input.ledger?.records ?? []) {
    uses.add(PURPOSE_LABELS[record.purpose] ?? record.purpose);
  }
  if ((input.workflowCalls ?? []).length > 0) uses.add('多角色研究任务协助');
  if (input.fullReportSummary?.used) uses.add('报告结构梳理与草稿生成');
  if (input.manualToolsNote?.trim()) uses.add('作者补录用途');
  return uses.size ? [...uses] : ['研究辅助撰写与校对'];
}

/**
 * Build structured plain-text lines for the "appendix.ai" section.
 * Stays strictly honest when server ledger coverage is unavailable or partial.
 */
export function buildAiDisclosureLines(input: AiDisclosureInput): string[] {
  const ledger = input.ledger ?? null;
  const ledgerRecords = ledger?.records ?? [];
  const calls = input.workflowCalls ?? [];
  const tools = collectToolLabels(input);
  const used = tools.length > 0;
  const lines: string[] = [];

  if (used) {
    const base = aiAppendix(
      {
        used: true,
        tools: tools.join('、'),
        uses: collectUses(input),
        sections: input.fullReportSummary?.sectionCount ? `${input.fullReportSummary.sectionCount} 个章节` : '',
        checking: '对模型输出的数据口径、统计结论、图表标注与引用文献已逐项人工复核，未替代统计检验与事实核查。',
      },
      input.content,
    );
    lines.push(...base);
  } else {
    const [, platformStatement] = aiAppendix(
      { used: false, tools: '', uses: [], sections: '', checking: '' },
      input.content,
    );
    if (!ledger || ledger.coverage === 'unavailable') {
      lines.push(
        '核验范围说明：当前处于本地会话或尚未获取服务端项目 AI 审计台账，平台暂无已记录的生成式人工智能调用回执；若作者曾在平台外使用生成式 AI 工具辅助检索、润色或编程，须在提交前手动补录对应工具名称、版本、用途与人工复核过程。',
      );
    } else {
      lines.push(
        `账本核验说明：已连接项目服务端 AI 记录（覆盖范围：${ledger.scope ?? 'own-questionnaire-proposals/latest-200'}），当前暂无问卷提案类模型调用记录；除系统可核验范围外，如涉及平台外生成式 AI 辅助工作仍须由作者如实补录。`,
      );
    }
    lines.push(platformStatement);
  }

  if (!ledger || ledger.coverage === 'unavailable') {
    lines.push(
      '台账覆盖声明：当前未获得服务端 AiUsageLedger/v1 审计记录（coverage=unavailable），仅能覆盖本次会话可观测的调用信息。',
    );
  } else {
    lines.push(
      `台账覆盖声明：服务端 AiUsageLedger/v1 处于部分覆盖模式（coverage=partial，scope=${ledger.scope ?? 'own-questionnaire-proposals/latest-200'}），返回 ${ledgerRecords.length} 条模型调用记录；不代表全项目完整审计覆盖。`,
    );
  }

  for (const record of ledgerRecords) {
    const purpose = PURPOSE_LABELS[record.purpose] ?? record.purpose;
    const status = RECORD_STATUS_LABELS[record.status] ?? record.status;
    const model = record.model ?? '未记录模型名';
    const provider = record.provider ?? '未标注提供方';
    const when = record.finishedAt ?? record.requestedAt ?? '时间未记录';
    const tokens = formatRecordTokens(record.usage);
    const hash = record.outputHash ? `，输出摘要 ${record.outputHash.slice(0, 12)}` : '';
    lines.push(
      `- [服务端台账 ${record.id}] ${purpose} · ${provider}/${model} · 状态：${status} · ${tokens} · 时间：${when}${hash}`,
    );
  }

  for (const call of calls) {
    const status = WORKFLOW_STATUS_LABELS[call.status] ?? call.status;
    const mode = call.providerMode === 'byok' ? '自带密钥' : call.providerMode;
    const when = call.finishedAt ?? call.startedAt;
    const tokens = formatReceiptTokens(call.usage);
    const hash = call.resultHash ? `，结果摘要 ${call.resultHash.slice(0, 12)}` : '';
    const err = call.errorCode ? `，错误码 ${call.errorCode}` : '';
    lines.push(
      `- [工作流回执 ${call.id}] ${stepRoleLabel(call.step)} · ${call.serviceId}#v${call.serviceRevision}（${mode}） · 状态：${status} · ${tokens} · 时间：${when}${hash}${err}`,
    );
  }

  if (input.fullReportSummary?.used) {
    const modelText = input.fullReportSummary.modelLabel ?? '研究会话已选模型';
    const noteText = input.fullReportSummary.note ? `；${input.fullReportSummary.note}` : '';
    lines.push(
      `- [整稿草稿辅助] 模型：${modelText} · 涉及章节数：${input.fullReportSummary.sectionCount ?? input.content.report.length}${noteText}`,
    );
  }

  return lines;
}

/** Format a standalone downloadable《AI 工具使用情况说明》Markdown document. */
export function formatAiDisclosureMarkdown(
  input: AiDisclosureInput & { projectId?: string | null; generatedAt?: string },
): string {
  const title = input.content.title.trim() || '未命名研究报告';
  const lines = buildAiDisclosureLines(input);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const coverage = input.ledger?.coverage ?? 'unavailable';

  const header = [
    '# AI 工具使用情况说明',
    '',
    `- 报告题目：${title}`,
    `- 项目标识：${input.projectId ?? 'local-session'}`,
    `- 生成时间：${generatedAt}`,
    `- 台账覆盖状态：${coverage}`,
    '',
    '## 使用明细与合规声明',
    '',
    ...lines,
    '',
  ];

  return header.join('\n');
}

/** Build the export-ready main .docx and run browser-local anonymity & compliance preflight. */
export async function inspectReportDocxLocal(
  content: EditorContent,
  options: { filename?: string; identityTerms?: string[]; onPhase?: (phase: string) => void } = {},
): Promise<{ report: PreflightReport; filename: string; blob: Blob }> {
  const parsed = parseEditorContent(content);
  const { buildDocx, fileName } = await import('../editor-export.ts');
  const exportName = options.filename ?? `${fileName(parsed.title)}-参赛终稿.docx`;
  const formatOptions = reportExportOptions(
    parsed.reportFormat?.options ?? DEFAULT_REPORT_SETTINGS.options,
    'main',
  );
  const blob = await buildDocx(parsed, formatOptions);
  const buffer = await blob.arrayBuffer();
  const terms = normalizeIdentityTerms(options.identityTerms ?? []);
  const report = await inspectSubmissionLocal(buffer, exportName, terms, options.onPhase);
  return { report, filename: exportName, blob };
}
