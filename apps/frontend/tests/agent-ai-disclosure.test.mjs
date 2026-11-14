import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorContent } from '../lib/editor-model.ts';
import {
  buildAiDisclosureLines,
  formatAiDisclosureMarkdown,
  inspectReportDocxLocal,
} from '../lib/agent/ai-disclosure.ts';

function sampleContent(title = '城市夜间商业消费调研报告', bodyExtra = '') {
  const base = createEditorContent();
  return {
    ...base,
    title,
    subtitle: '第十七届市场调查研究报告',
    report: base.report.map((sec, index) =>
      index === 0 ? { ...sec, body: `围绕夜间商圈客流与消费偏好展开实证调查。${bodyExtra}` } : sec,
    ),
  };
}

test('buildAiDisclosureLines keeps unavailable and zero-record partial ledgers strictly honest', () => {
  const unavailableLines = buildAiDisclosureLines({
    content: sampleContent(),
    ledger: null,
    workflowCalls: [],
    fullReportSummary: null,
  });
  const unavailableText = unavailableLines.join('\n');
  assert.match(unavailableText, /coverage=unavailable/u);
  assert.match(unavailableText, /核验范围说明/u);
  assert.doesNotMatch(unavailableText, /未使用生成式人工智能工具/u);
  assert.match(unavailableText, /报告中暂无由研究平台生成的统计图、表与公式/u);

  const partialEmptyLines = buildAiDisclosureLines({
    content: sampleContent(),
    ledger: {
      schema: 'AiUsageLedger/v1',
      coverage: 'partial',
      projectId: 'proj-42',
      scope: 'own-questionnaire-proposals/latest-200',
      records: [],
    },
    workflowCalls: [],
  });
  const partialEmptyText = partialEmptyLines.join('\n');
  assert.match(partialEmptyText, /coverage=partial/u);
  assert.match(partialEmptyText, /own-questionnaire-proposals\/latest-200/u);
  assert.match(partialEmptyText, /返回 0 条/u);
});

test('buildAiDisclosureLines merges AiUsageLedger records, workflow receipts, and honest missing-token markers', () => {
  const lines = buildAiDisclosureLines({
    content: sampleContent(),
    ledger: {
      schema: 'AiUsageLedger/v1',
      coverage: 'partial',
      projectId: 'proj-99',
      scope: 'own-questionnaire-proposals/latest-200',
      records: [
        {
          id: 'rec-1',
          provider: 'deepseek',
          model: 'deepseek-chat',
          purpose: 'questionnaire',
          status: 'succeeded',
          requestedAt: '2026-11-10T09:00:00Z',
          finishedAt: '2026-11-10T09:00:12Z',
          inputHash: 'in-123',
          outputHash: 'out-abcdef123456',
          usage: { inputTokens: 1200, outputTokens: 850, cost: null, currency: null },
        },
        {
          id: 'rec-2',
          provider: 'qwen',
          model: 'qwen-plus',
          purpose: 'report-draft',
          status: 'succeeded',
          requestedAt: '2026-11-10T09:10:00Z',
          finishedAt: null,
          inputHash: null,
          outputHash: null,
          usage: { inputTokens: null, outputTokens: null, cost: null, currency: null },
        },
      ],
    },
    workflowCalls: [
      {
        id: 'call-1',
        taskId: 'task-7',
        projectId: 'proj-99',
        executionId: 'exec-1',
        step: 'data:analyze',
        status: 'completed',
        inputRevision: 2,
        inputHash: 'ih-1',
        consentHash: 'ch-1',
        serviceId: 'svc-data',
        serviceRevision: 4,
        providerMode: 'byok',
        startedAt: '2026-11-10T09:15:00Z',
        finishedAt: '2026-11-10T09:15:08Z',
        resultHash: 'rh-998877665544',
        usage: null,
        errorCode: null,
      },
    ],
    fullReportSummary: {
      used: true,
      modelLabel: 'Research Model（gpt-4.1）',
      sectionCount: 5,
      note: '研究模式：真实资料',
    },
  });

  const text = lines.join('\n');
  assert.match(text, /coverage=partial.*返回 2 条/u);
  assert.match(text, /\[服务端台账 rec-1\].*deepseek\/deepseek-chat.*输入 1200 \/ 输出 850 tokens.*out-abcdef12/u);
  assert.match(text, /\[服务端台账 rec-2\].*未返回 Token 统计/u);
  assert.match(text, /\[工作流回执 call-1\].*数据分析（data:analyze）.*svc-data#v4（自带密钥）.*未返回 Token 统计.*rh-998877665/u);
  assert.match(text, /\[整稿草稿辅助\].*Research Model（gpt-4\.1）.*涉及章节数：5/u);
});

test('formatAiDisclosureMarkdown formats standalone compliance document with metadata', () => {
  const md = formatAiDisclosureMarkdown({
    content: sampleContent('文旅夜经济调研报告'),
    projectId: 'proj-abc',
    generatedAt: '2026-11-14T02:00:00Z',
    ledger: {
      schema: 'AiUsageLedger/v1',
      coverage: 'unavailable',
      projectId: 'proj-abc',
      records: [],
    },
    manualToolsNote: 'Claude 3.7 Sonnet',
  });

  assert.match(md, /^# AI 工具使用情况说明/u);
  assert.match(md, /- 报告题目：文旅夜经济调研报告/u);
  assert.match(md, /- 项目标识：proj-abc/u);
  assert.match(md, /- 生成时间：2026-11-14T02:00:00Z/u);
  assert.match(md, /- 台账覆盖状态：unavailable/u);
  assert.match(md, /Claude 3\.7 Sonnet/u);
});

test('inspectReportDocxLocal builds a valid .docx archive and flags supplied identity terms locally', async () => {
  const result = await inspectReportDocxLocal(
    sampleContent('校园外卖配送效率调查', '本研究在星海大学东校区开展问卷调研。'),
    {
      filename: 'test-report.docx',
      identityTerms: ['星海大学'],
    },
  );

  assert.equal(result.filename, 'test-report.docx');
  assert.equal(result.report.schema, 'submission-preflight/v1');
  assert.equal(result.report.format, 'docx');
  assert.ok(result.report.bytes > 0);
  assert.ok(result.report.sha256.length === 64);
  assert.equal(result.report.status, 'issues_found');
  assert.ok(result.report.findings.some(f => f.code === 'forbidden_identity_term' && f.location === 'word/document.xml'));
});
