import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAlignedDatasetValue,
  fetchAutonomousRuns,
  fetchProjectEpistemicMemory,
  hydrateAutonomousRunToQuality,
  prepareSandboxSvgForArtifact,
  queryProjectCountyGazetteer,
  readAutonomousRunStream,
  resumeAutonomousResearch,
  runProjectPlotSandbox,
  runProjectStatSandbox,
  sandboxSvgToDataUri,
  sanitizeAdvisorDisplayText,
  serializeDatasetForAutonomousSandbox,
  STAT_SANDBOX_PRESETS,
  streamAutonomousResearch,
  verifyProjectCitation,
} from '../lib/agent/autonomous-agent.ts';
import { assertTrueVector } from '../lib/svg-safety.ts';
import { assertTrueVector as assertStrictSvg } from '../lib/vector-svg.ts';
import { artifactImageMime } from '../lib/agent/artifact-library.ts';
import {
  detectReportEvidenceGaps,
  generateFullReportWithAgent,
} from '../lib/agent/full-report-pipeline.ts';
import { newQuestion, newQuestionnaire } from '../lib/questionnaire.ts';
import { digestText, snapshotRecipe, verifyResearchQuality } from '../lib/research-quality.ts';
import { buildDeterministicStorylineBrief, formatStorylineForSection } from '../lib/agent/storyline-brief.ts';
import { decomposeTopic } from '../lib/agent/demo-study.ts';
import { route } from '../lib/agent/router.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { generateInterviewCorpus } from '../lib/agent/interview-corpus-deai.ts';
import { parseFigureRequest } from '../lib/agent/figure-tweak.ts';
import { auditStatisticalMethodGuardrails } from '../lib/agent/numeric-verifier.ts';

test('serializeDatasetForAutonomousSandbox strips open-text PII columns before dispatch', () => {
  const design = {
    version: 1,
    title: '测试问卷',
    objective: '验证脱敏',
    population: '居民',
    scale: 5,
    questions: [
      { id: 'q1', variable: 'living_mode', text: '居住方式', type: 'single', required: true, condition: null, purpose: 'subgroup', analysis: 'crosstab', choices: [{ code: 'solo', label: '独居' }], min: null, max: null, minLabel: '', maxLabel: '', reverse: false },
      { id: 'q2', variable: 'trust_1', text: '信赖度', type: 'likert', required: true, condition: null, purpose: 'scale', analysis: 'alpha', choices: [], min: 1, max: 5, minLabel: '低', maxLabel: '高', reverse: false },
      { id: 'q3', variable: 'open_note', text: '隐私开放反馈', type: 'text', required: false, condition: null, purpose: 'open', analysis: 'withheld', choices: [], min: null, max: null, minLabel: '', maxLabel: '', reverse: false },
    ],
  };
  const dataset = {
    name: '测试样本',
    sourceHash: 'a'.repeat(64),
    kind: 'user_provided',
    missingCodes: [],
    lineage: [],
    table: {
      headers: ['living_mode', 'trust_1', 'open_note'],
      skippedBlankLines: 0,
      delimiter: ',',
      rows: [
        ['solo', '4', '姓名张三手机13800138000希望改界面'],
        ['solo', '5', '家庭住址保密内容'],
      ],
    },
  };

  const payload = serializeDatasetForAutonomousSandbox(design, dataset);
  assert.ok(payload);
  assert.equal(payload.rows[0].visibility.q3, false);
  assert.equal(payload.rows[0].answers.q2, 4);
  assert.equal('q3' in payload.rows[0].answers, false);
  assert.equal(JSON.stringify(payload).includes('13800138000'), false);
});

test('hydrateAutonomousRunToQuality produces SHA-256 valid snapshots & storyline autonomous pivots', async () => {
  const sha = 'b'.repeat(64);
  const run = {
    schemaVersion: 1,
    runId: '11111111-1111-4111-8111-111111111122',
    projectId: 'proj-1',
    status: 'completed',
    createdAt: '2026-11-23T01:00:00Z',
    lease: {
      leaseId: '22222222-2222-4222-8222-222222222233',
      mode: 'pi_autonomous',
      maxToolCalls: 28,
      usedToolCalls: 14,
      datasetSha256: sha,
      privacyGuarantee: 'aggregate_isa_only_zero_raw_rows_sent_to_llm',
      expiresAt: '2026-11-23T01:30:00Z',
    },
    datasetSummary: {
      title: '银发智守采纳机制研究',
      datasetRef: 'benchmark:planted-4-traps',
      datasetMode: 'planted_trap_benchmark',
      classification: 'simulated',
      rawRowCount: 240,
      cleanedRowCount: 226,
      variables: 12,
      sha256: sha,
    },
    reasoningTrace: [
      {
        phase: 'explore_and_pivot_data',
        iteration: 3,
        agentRole: 'data',
        thought: '剔除负 CITC 异常题 Q_trap',
        operator: 'purify_scale_reliability',
        args: { drop_negative_or_low_citc: true },
        diagnostics: ['SCALE_PURIFIED_DROPPED:Q_trap'],
        pivotTaken: '自主量表净化：剔除 Q_trap',
        snapshotId: 'snap_111111111111',
        observationSummary: 'α 由 0.42 提升至 0.86。',
      },
      {
        phase: 'explore_and_pivot_data',
        iteration: 6,
        agentRole: 'data',
        thought: '检查子群方向反转',
        operator: 'scan_subgroup_heterogeneity',
        args: { moderators: ['living_mode'] },
        diagnostics: ['SUBGROUP_SIGN_REVERSAL:living_mode'],
        pivotTaken: '捕获辛普森悖论式子群符号反转',
        snapshotId: 'snap_222222222222',
        observationSummary: '共居正向 vs 独居负向。',
      },
    ],
    epistemicGraph: {
      project_id: 'proj-1',
      nodes: [],
      edges: [],
      pivot_log: [],
      completeness: {
        passed: true,
        nodeCount: 8,
        edgeCount: 7,
        pivotCount: 2,
        dirtyNodes: [],
        unsupportedClaims: [],
        hasVerifiedMotherInsight: true,
        hasFalsificationCheck: true,
        graphHash: 'c'.repeat(64),
      },
    },
    motherInsight: {
      headline: '居住模式触发采纳意愿方向反转',
      mechanism: '经量表净化与子群扫描验证的分化路径。',
      paradoxDetail: '共居群体正向驱动而独居群体反向抑制。',
      scopeBoundary: '基于 226 份有效清洗样本。',
      supportingSnapshots: ['snap_111111111111', 'snap_222222222222'],
    },
    falsificationReport: {
      decision: 'approve',
      summary: '审稿核验通过',
      findings: [],
      consistencyChecks: [],
      ethicsAndPrivacy: [],
    },
    deliverable: {},
    registeredResults: [
      {
        id: 'snap_111111111111',
        title: '[1] 量表纯化检验',
        sourceName: '银发智守',
        sourceUrl: '',
        sourceHash: sha,
        resultHash: '0'.repeat(64),
        classification: 'simulated',
        method: 'alpha',
        n: 226,
        total: 240,
        headers: ['题项', 'CITC', '决策'],
        rows: [['Q_trap', -0.41, '已剔除']],
        metrics: [{ label: '纯化后 α', value: 0.86 }],
        warnings: ['SCALE_PURIFIED_DROPPED:Q_trap'],
        variables: ['service_perception'],
      },
      {
        id: 'snap_222222222222',
        title: '[2] 子群异质性扫描',
        sourceName: '银发智守',
        sourceUrl: '',
        sourceHash: sha,
        resultHash: '0'.repeat(64),
        classification: 'simulated',
        method: 'interaction',
        n: 226,
        total: 240,
        headers: ['分组', '斜率', 'p'],
        rows: [['cohabit', 0.72, 0.001], ['solo', -0.68, 0.001]],
        metrics: [{ label: '子群反转数', value: 1 }],
        warnings: ['SUBGROUP_SIGN_REVERSAL:living_mode'],
        variables: ['adopt_intention', 'living_mode'],
      },
    ],
  };

  const quality = await hydrateAutonomousRunToQuality(run);
  await verifyResearchQuality(quality);
  assert.equal(quality.results.length, 2);
  assert.equal(quality.findings.length, 3);
  assert.ok(quality.findings.every(f => f.status === 'confirmed'));

  const aligned = buildAlignedDatasetValue(run, null);
  assert.equal(aligned.sourceHash, sha);
  assert.equal(aligned.kind, 'simulated');

  const content = { ...createEditorContent(), title: run.datasetSummary.title, quality };
  const brief = buildDeterministicStorylineBrief(
    { design: null, dataset: aligned, report: content },
    decomposeTopic(run.datasetSummary.title),
    'demonstration',
  );
  assert.ok(brief.autonomousPivots && brief.autonomousPivots.length >= 2);
  const formatted = formatStorylineForSection(brief, 'data.testing');
  assert.match(formatted, /实证统计诊断自愈轨迹/);
});

test('router routes /自主探索 and natural phrasings to #research/analysis without adding to 14 tools', () => {
  const ctx = {
    room: null,
    light: illuminate({ design: null, dataset: null, report: null, resultPending: false }),
    theme: 'light',
  };
  const r1 = route('/自主探索', ctx);
  assert.ok('turn' in r1);
  assert.deepEqual(r1.turn.act, { type: 'href', href: '#research/analysis' });

  const r2 = route('启动自主统计探索', ctx);
  assert.ok('turn' in r2);
  assert.deepEqual(r2.turn.act, { type: 'href', href: '#research/analysis' });
});

function makeChunkedResponse(chunks, headers = { 'content-type': 'application/x-ndjson; charset=utf-8' }, status = 200) {
  const encoder = new TextEncoder();
  const byteChunks = chunks.map(c => (typeof c === 'string' ? encoder.encode(c) : c));
  let idx = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (idx < byteChunks.length) {
        controller.enqueue(byteChunks[idx++]);
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status, headers });
}

function makeSampleRun(overrides = {}) {
  const sha = 'd'.repeat(64);
  return {
    schemaVersion: 1,
    runId: '33333333-3333-4333-8333-333333333344',
    projectId: 'proj-p2',
    status: 'completed',
    createdAt: '2026-11-23T08:00:00Z',
    revision: 2,
    eventCount: 5,
    reworkRounds: 0,
    reworkHistory: [],
    pendingMilestone: null,
    checkpoint: { phase: 'explore_and_pivot_data', iteration: 4 },
    lease: {
      leaseId: '44444444-4444-4444-8444-444444444455',
      mode: 'milestone_gated',
      maxToolCalls: 28,
      usedToolCalls: 8,
      datasetSha256: sha,
      privacyGuarantee: 'aggregate_isa_only_zero_raw_rows_sent_to_llm',
      expiresAt: '2026-11-23T09:00:00Z',
    },
    datasetSummary: {
      title: '县域助餐服务二期探索',
      datasetRef: 'benchmark:planted-4-traps',
      datasetMode: 'planted_trap_benchmark',
      classification: 'simulated',
      rawRowCount: 240,
      cleanedRowCount: 224,
      variables: 12,
      sha256: sha,
    },
    reasoningTrace: [
      {
        phase: 'explore_and_pivot_data',
        iteration: 3,
        agentRole: 'data',
        thought: '量表存在负向干扰题，执行纯化剔除',
        operator: 'purify_scale_reliability',
        args: { drop_negative_or_low_citc: true },
        diagnostics: ['SCALE_PURIFIED_DROPPED:Q_trap'],
        pivotTaken: '量表纯化剔除 Q_trap',
        snapshotId: 'snap_333333333333',
        observationSummary: 'α 升至 0.88。',
      },
    ],
    epistemicGraph: {
      project_id: 'proj-p2',
      nodes: [],
      edges: [],
      pivot_log: [],
      completeness: {
        passed: true,
        nodeCount: 6,
        edgeCount: 5,
        pivotCount: 1,
        dirtyNodes: [],
        unsupportedClaims: [],
        hasVerifiedMotherInsight: true,
        hasFalsificationCheck: true,
        graphHash: 'e'.repeat(64),
      },
    },
    motherInsight: {
      headline: '居住模式显著调节助餐采纳斜率',
      mechanism: '经量表纯化与岭回归校验的调节机制。',
      paradoxDetail: '共居群体正向驱动而独居群体因操作门槛负向抑制。',
      scopeBoundary: '基于 224 份清洗样本。',
      supportingSnapshots: ['snap_333333333333'],
    },
    falsificationReport: {
      decision: 'approve',
      summary: '审稿核验通过',
      findings: [],
      consistencyChecks: [],
      ethicsAndPrivacy: [],
    },
    deliverable: {},
    registeredResults: [
      {
        id: 'snap_333333333333',
        title: '[1] 量表纯化与异质性快照',
        sourceName: '县域助餐服务二期探索',
        sourceUrl: '',
        sourceHash: sha,
        resultHash: '0'.repeat(64),
        classification: 'simulated',
        method: 'alpha',
        n: 224,
        total: 240,
        headers: ['题项', 'CITC', '结论'],
        rows: [['Q_trust_1', 0.74, '保留']],
        metrics: [{ label: 'Cronbach α', value: 0.88 }],
        warnings: [],
        variables: ['trust'],
      },
    ],
    ...overrides,
  };
}

test('streamAutonomousResearch parses chunked NDJSON events in order, resolves done run, and rejects on error frame', async () => {
  const sampleRun = makeSampleRun();
  const line1 = JSON.stringify({ type: 'event', seq: 1, eventType: 'run_started', payload: { goal: '县域助餐调研' } });
  const line2 = JSON.stringify({ type: 'event', seq: 2, eventType: 'pivot', payload: { pivotTaken: '切换高 VIF 岭回归' } });
  const line3 = JSON.stringify({ type: 'done', run: sampleRun });
  const fullBytes = new TextEncoder().encode(`${line1}\n${line2}\n${line3}\n`);
  // Split mid-UTF8 character and mid-JSON line to exercise incremental decoder & line buffering.
  const splitA = Math.floor(fullBytes.length * 0.27);
  const splitB = Math.floor(fullBytes.length * 0.61);
  const chunks = [
    fullBytes.slice(0, splitA),
    fullBytes.slice(splitA, splitB),
    fullBytes.slice(splitB),
  ];

  let capturedBody = null;
  const seenEvents = [];
  const res = await streamAutonomousResearch(
    {
      goal: '县域助餐调研',
      datasetMode: 'planted_trap_benchmark',
      leaseMode: 'pi_autonomous',
      maxToolCalls: 26,
      projectId: 'local-studio',
    },
    {
      onEvent: ev => seenEvents.push(ev),
      fetchFn: async (url, init) => {
        assert.equal(url, '/api/agent/autonomous');
        capturedBody = JSON.parse(String(init.body));
        return makeChunkedResponse(chunks);
      },
    },
  );

  assert.equal(capturedBody.stream, true);
  assert.deepEqual(seenEvents.map(e => [e.seq, e.eventType]), [[1, 'run_started'], [2, 'pivot']]);
  assert.equal(seenEvents[1].payload.pivotTaken, '切换高 VIF 岭回归');
  assert.equal(res.runId, sampleRun.runId);

  await assert.rejects(
    () => streamAutonomousResearch(
      { goal: '错误流测试', datasetMode: 'planted_trap_benchmark' },
      {
        fetchFn: async () => makeChunkedResponse([
          `${JSON.stringify({ type: 'event', seq: 1, eventType: 'run_started', payload: {} })}\n`,
          `${JSON.stringify({ type: 'error', error: '沙盒算子超时中断' })}\n`,
        ]),
      },
    ),
    /沙盒算子超时中断/,
  );
});

test('readAutonomousRunStream parses SSE id/event/data blocks across split packets', async () => {
  const sseText = [
    ': heartbeat keepalive\n\n',
    'id: 4\r\nevent: tool_result\r\ndata: {"operator":"scan_subgroup_heterogeneity",\r\n',
    'data: "observationSummary":"独居与共居斜率反转"}\r\n\r\n',
    'id: 5\nevent: milestone_pause\ndata: {"seq":5,"eventType":"milestone_pause","payload":{"reason":"发现辛普森悖论，请 PI 确认"}}\n\n',
  ].join('');
  const raw = new TextEncoder().encode(sseText);
  const packets = [
    raw.slice(0, 31),
    raw.slice(31, 95),
    raw.slice(95, 148),
    raw.slice(148),
  ];

  const fired = [];
  let seenInit = null;
  let seenUrl = '';
  const events = await readAutonomousRunStream('proj/a', 'run 1', {
    afterSeq: 3,
    onEvent: ev => fired.push(ev),
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return makeChunkedResponse(packets, { 'content-type': 'text/event-stream' });
    },
  });

  assert.equal(seenUrl, '/api/projects/proj%2Fa/autonomous-runs/run%201/stream?afterSeq=3');
  assert.equal(seenInit.credentials, 'same-origin');
  assert.equal(seenInit.headers.Accept, 'text/event-stream');
  assert.equal(events.length, 2);
  assert.deepEqual(fired, events);
  assert.equal(events[0].seq, 4);
  assert.equal(events[0].eventType, 'tool_result');
  assert.equal(events[0].payload.observationSummary, '独居与共居斜率反转');
  assert.equal(events[1].seq, 5);
  assert.equal(events[1].eventType, 'milestone_pause');
  assert.equal(events[1].payload.reason, '发现辛普森悖论，请 PI 确认');
});

test('resumeAutonomousResearch supports authenticated steer + SSE tail and local NDJSON resume', async () => {
  const pausedRun = makeSampleRun({
    status: 'awaiting_milestone',
    revision: 3,
    eventCount: 4,
    pendingMilestone: {
      milestoneId: 'ms-1',
      phase: 'explore_and_pivot_data',
      reason: '发现关键调节分化',
      detectedDiagnostics: ['SUBGROUP_SIGN_REVERSAL:living_mode'],
      proposedAction: '引入交互项重拟合',
    },
  });
  const resumedRun = makeSampleRun({
    status: 'completed',
    revision: 4,
    reworkRounds: 1,
    reworkHistory: [{ round: 1, reason: '人工纠偏重算' }],
  });

  const authCalls = [];
  const authEvents = [];
  const authUpdated = await resumeAutonomousResearch({
    run: pausedRun,
    decision: 'steer',
    steeringNote: '  保留年龄控制变量后重新验算  ',
    request: { goal: '县域助餐调研', datasetMode: 'planted_trap_benchmark', leaseMode: 'milestone_gated' },
    auth: { authenticated: true, projectId: 'proj-p2', csrfToken: 'csrf-xyz' },
    afterSeq: 4,
    onEvent: ev => authEvents.push(ev),
    fetchFn: async (url, init) => {
      authCalls.push({ url: String(url), init });
      if (String(url).endsWith('/resume')) {
        return new Response(JSON.stringify(resumedRun), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return makeChunkedResponse(
        ['id: 5\nevent: steering\ndata: {"steeringNote":"保留年龄控制变量后重新验算"}\n\nid: 6\nevent: completed\ndata: {"status":"completed"}\n\n'],
        { 'content-type': 'text/event-stream' },
      );
    },
  });

  assert.equal(authCalls.length, 2);
  assert.equal(authCalls[0].url, `/api/projects/proj-p2/autonomous-runs/${pausedRun.runId}/resume`);
  assert.equal(authCalls[0].init.headers['x-csrf-token'], 'csrf-xyz');
  assert.deepEqual(JSON.parse(String(authCalls[0].init.body)), {
    expectedRevision: 3,
    decision: 'steer',
    steeringNote: '保留年龄控制变量后重新验算',
  });
  assert.equal(authCalls[1].url, `/api/projects/proj-p2/autonomous-runs/${resumedRun.runId}/stream?afterSeq=4`);
  assert.deepEqual(authEvents.map(e => e.eventType), ['steering', 'completed']);
  assert.equal(authUpdated.status, 'completed');

  let localPayload = null;
  const localEvents = [];
  const localUpdated = await resumeAutonomousResearch({
    run: pausedRun,
    decision: 'approve',
    request: { goal: '县域助餐调研', datasetMode: 'planted_trap_benchmark', leaseMode: 'milestone_gated', maxToolCalls: 24 },
    onEvent: ev => localEvents.push(ev),
    fetchFn: async (url, init) => {
      assert.equal(url, '/api/agent/autonomous');
      localPayload = JSON.parse(String(init.body));
      return makeChunkedResponse([
        `${JSON.stringify({ type: 'event', seq: 5, eventType: 'reviewer_critique', payload: { decision: 'approve' } })}\n`,
        `${JSON.stringify({ type: 'done', run: resumedRun })}\n`,
      ]);
    },
  });

  assert.equal(localPayload.action, 'resume');
  assert.equal(localPayload.stream, true);
  assert.equal(localPayload.decision, 'approve');
  assert.deepEqual(localPayload.checkpoint, pausedRun.checkpoint);
  assert.equal(localPayload.usedToolCalls, pausedRun.lease.usedToolCalls);
  assert.deepEqual(localEvents.map(e => e.eventType), ['reviewer_critique']);
  assert.equal(localUpdated.reworkRounds, 1);
});

test('hydrateAutonomousRunToQuality handles awaiting_milestone and reworkRounds >= 1 cleanly', async () => {
  const pausedRun = makeSampleRun({
    status: 'awaiting_milestone',
    pendingMilestone: {
      milestoneId: 'ms-pause',
      phase: 'explore_and_pivot_data',
      reason: '等待确认剔除异常题项',
      detectedDiagnostics: ['SCALE_PURIFIED_DROPPED:Q_trap'],
      proposedAction: '继续子群异质性扫描',
    },
    motherInsight: {
      headline: '',
      mechanism: '',
      paradoxDetail: '',
      scopeBoundary: '',
      supportingSnapshots: [],
    },
  });

  const pausedQuality = await hydrateAutonomousRunToQuality(pausedRun);
  await verifyResearchQuality(pausedQuality);
  assert.equal(pausedQuality.results.length, 1);
  assert.equal(pausedQuality.findings.length, 1);
  assert.equal(pausedQuality.findings[0].status, 'confirmed');

  const reworkedRun = makeSampleRun({
    status: 'completed',
    reworkRounds: 1,
    reworkHistory: [{ round: 1, triggeredBy: 'reviewer_critique' }],
    reasoningTrace: [
      ...makeSampleRun().reasoningTrace,
      {
        phase: 'reanalyze',
        iteration: 7,
        agentRole: 'data',
        thought: '审稿人要求补充共线性惩罚验证',
        operator: 'fit_penalized_logistic',
        args: { l2_penalty: 1.0 },
        diagnostics: ['QUASI_SEPARATION_MITIGATED'],
        pivotTaken: '审稿返工：补充 L2 惩罚 Logit 稳健检验',
        snapshotId: 'snap_333333333333',
        observationSummary: '返工后估计系数收敛。',
      },
    ],
  });

  const reworkedQuality = await hydrateAutonomousRunToQuality(reworkedRun);
  await verifyResearchQuality(reworkedQuality);
  assert.equal(reworkedQuality.results.length, 1);
  assert.equal(reworkedQuality.findings.length, 3);
  assert.ok(reworkedQuality.findings.every(f => f.status === 'confirmed'));
});

function buildGapTestDesign() {
  const design = newQuestionnaire();
  design.title = '社区智慧助餐采纳调研';
  const q1 = newQuestion('q_living', 'Q1');
  q1.text = '您的日常居住方式是？';
  q1.type = 'single';
  q1.purpose = 'background';
  q1.analysis = 'comparison';
  q1.choices = [{ code: '1', label: '独居' }, { code: '2', label: '与家人共居' }];

  const makeLikert = (id, variable, text, construct, analysis = 'measurement') => {
    const q = newQuestion(id, variable);
    q.text = text;
    q.type = 'likert';
    q.purpose = 'research';
    q.construct = construct;
    q.analysis = analysis;
    q.choices = [];
    q.min = 1;
    q.max = 5;
    q.minLabel = '非常不同意';
    q.maxLabel = '非常同意';
    return q;
  };

  design.questions = [
    q1,
    makeLikert('q_trust_1', 'Q2', '我信任助餐服务的食品安全标准', '服务信任'),
    makeLikert('q_trust_2', 'Q3', '我对助餐点的配送准时性感到满意', '服务信任'),
    makeLikert('q_trust_3', 'Q4', '我认为助餐点收费标准透明合理', '服务信任'),
    makeLikert('q_adopt', 'Q5', '未来一个月我愿意持续使用智慧助餐服务', '采纳意愿', 'association'),
  ];
  return design;
}

test('detectReportEvidenceGaps flags missing reliability/modeling/heterogeneity and returns [] for plan mode', async () => {
  const design = buildGapTestDesign();
  const sourceHash = await digestText('Q1,Q2,Q3,Q4,Q5\n1,4,4,5,4\n2,3,4,4,5\n');
  const dataset = {
    name: 'meal-survey.csv',
    sourceHash,
    kind: 'user_provided',
    missingCodes: [],
    lineage: [],
    table: {
      headers: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
      rows: [
        ['1', '4', '4', '5', '4'],
        ['2', '3', '4', '4', '5'],
      ],
      delimiter: ',',
      skippedBlankLines: 0,
    },
  };
  const qcSnap = await snapshotRecipe(
    {
      method: 'quality-control',
      n: 120,
      total: 128,
      headers: ['筛查规则', '判定标准', '处理', '人数'],
      rows: [['注意力题', '未选4', '剔除', 8]],
      metrics: [{ label: '有效样本', value: 120 }],
      warnings: [],
    },
    { title: '问卷质量筛查', sourceName: 'meal-survey.csv', sourceUrl: '', sourceHash, classification: 'user_provided' },
    'snap-qc-1',
  );
  const crosstabSnap = await snapshotRecipe(
    {
      method: 'crosstab',
      n: 120,
      total: 120,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      interpretation: '不同居住方式在采纳意愿上存在组间差异。',
      headers: ['居住方式', '频数', '占比(%)'],
      rows: [['独居', 52, 43.3], ['共居', 68, 56.7]],
      metrics: [{ label: '卡方 χ²', value: 6.42 }],
      warnings: [],
    },
    { title: '居住方式与采纳交叉检验', sourceName: 'meal-survey.csv', sourceUrl: '', sourceHash, classification: 'user_provided' },
    'snap-crosstab-1',
  );
  const report = {
    ...createEditorContent(),
    version: 2,
    quality: { version: 1, results: [qcSnap, crosstabSnap], findings: [] },
  };

  assert.deepEqual(detectReportEvidenceGaps({ design, dataset, report }, 'plan'), []);
  assert.deepEqual(detectReportEvidenceGaps({ design, dataset: null, report }, 'empirical'), []);

  const gaps = detectReportEvidenceGaps({ design, dataset, report }, 'empirical');
  assert.deepEqual(
    gaps.map(g => g.kind),
    ['missing_reliability', 'missing_modeling', 'missing_heterogeneity'],
  );
  assert.equal(gaps[0].nodeId, 'data.testing');
  assert.equal(gaps[1].nodeId, 'drivers.model');
  assert.equal(gaps[2].nodeId, 'drivers.model');

  const testingOnly = detectReportEvidenceGaps({ design, dataset, report }, 'empirical', new Set(['data.testing']));
  assert.deepEqual(testingOnly.map(g => g.kind), ['missing_reliability']);
});

test('generateFullReportWithAgent invokes onEvidenceGap, merges verified snapshots before Wave 1 facts extraction, and rejects simulated snapshots under empirical mode', async () => {
  const design = buildGapTestDesign();
  const sourceHash = await digestText('Q1,Q2,Q3,Q4,Q5\n1,4,4,5,4\n2,3,4,4,5\n');
  const dataset = {
    name: 'meal-empirical.csv',
    sourceHash,
    kind: 'user_provided',
    missingCodes: [],
    lineage: [],
    table: {
      headers: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
      rows: [
        ['1', '4', '4', '5', '4'],
        ['2', '3', '4', '4', '5'],
      ],
      delimiter: ',',
      skippedBlankLines: 0,
    },
  };
  const qcSnap = await snapshotRecipe(
    {
      method: 'quality-control',
      n: 120,
      total: 128,
      headers: ['筛查规则', '判定标准', '处理', '人数'],
      rows: [['注意力题', '未选4', '剔除', 8]],
      metrics: [{ label: '有效样本', value: 120 }],
      warnings: [],
    },
    { title: '问卷质量筛查', sourceName: 'meal-empirical.csv', sourceUrl: '', sourceHash, classification: 'user_provided' },
    'snap-qc-base',
  );
  const validAlphaSnap = await snapshotRecipe(
    {
      method: 'alpha',
      n: 120,
      total: 120,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      interpretation: '服务信任量表 Cronbach α = 0.891。',
      reliability: { outOfRangeRows: 0 },
      headers: ['构念量表', '题项数', 'Cronbach α'],
      rows: [['服务信任量表', 3, 0.891]],
      metrics: [{ label: 'Cronbach α', value: 0.891 }],
      warnings: [],
    },
    { title: '服务信任量表信度补算', sourceName: 'meal-empirical.csv', sourceUrl: '', sourceHash, classification: 'user_provided' },
    'snap-alpha-verified',
  );
  const fraudSimSnap = await snapshotRecipe(
    {
      method: 'alpha',
      n: 120,
      total: 120,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      interpretation: '伪造模拟信度。',
      reliability: { outOfRangeRows: 0 },
      headers: ['构念量表', 'Cronbach α'],
      rows: [['伪造模拟量表', 0.99]],
      metrics: [{ label: 'Cronbach α', value: 0.99 }],
      warnings: [],
    },
    { title: '伪造模拟信度', sourceName: 'sim.csv', sourceUrl: '', sourceHash, classification: 'simulated' },
    'snap-fraud-sim',
  );
  const fraudHashSnap = await snapshotRecipe(
    {
      method: 'alpha',
      n: 120,
      total: 120,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      interpretation: '错指纹信度。',
      reliability: { outOfRangeRows: 0 },
      headers: ['构念量表', 'Cronbach α'],
      rows: [['指纹不匹配量表', 0.77]],
      metrics: [{ label: 'Cronbach α', value: 0.77 }],
      warnings: [],
    },
    { title: '错指纹信度', sourceName: 'other.csv', sourceUrl: '', sourceHash: 'f'.repeat(64), classification: 'user_provided' },
    'snap-fraud-hash',
  );

  const report = {
    ...createEditorContent(),
    version: 2,
    quality: { version: 1, results: [qcSnap], findings: [] },
  };
  const project = { projectId: 'proj-phase3-gap', runId: 'run-gap-1', inputRevision: 'rev-gap-1' };

  let gapCalls = 0;
  let seenAlphaFactId = '';
  const result = await generateFullReportWithAgent({
    mode: 'empirical',
    topic: '社区智慧助餐服务信任与采纳意愿调查',
    base: { design, dataset, report },
    project,
    sectionNodes: ['data.testing'],
    concurrency: 1,
    onEvidenceGap: async gaps => {
      gapCalls += 1;
      assert.deepEqual(gaps.map(g => g.kind), ['missing_reliability']);
      return [validAlphaSnap, fraudSimSnap, fraudHashSnap];
    },
    sectionGenerator: async req => {
      const marker = '资料 JSON：';
      const idx = req.prompt.indexOf(marker);
      assert.ok(idx >= 0);
      const material = JSON.parse(req.prompt.slice(idx + marker.length));
      const alphaFact = material.facts.find(f => f.text.includes('0.891'));
      assert.ok(alphaFact, 'merged alpha snapshot must enter Wave 1 facts before drafting');
      seenAlphaFactId = alphaFact.id;
      return {
        content: JSON.stringify({
          paragraphs: [{ text: `经量表内部一致性检验，服务信任量表信度系数达到{${alphaFact.id}}，表明测量结构稳定。` }],
        }),
        usage: { prompt: 10, completion: 10, total: 20 },
      };
    },
  });

  assert.equal(gapCalls, 1);
  assert.ok(seenAlphaFactId.startsWith('F'));
  const resultIds = (result.report.quality?.results ?? []).map(r => r.id);
  assert.ok(resultIds.includes('snap-alpha-verified'));
  assert.equal(resultIds.includes('snap-fraud-sim'), false);
  assert.equal(resultIds.includes('snap-fraud-hash'), false);
  assert.deepEqual(result.evidenceGapReport?.detected.map(g => g.kind), ['missing_reliability']);
  assert.deepEqual(result.evidenceGapReport?.supplementedResultIds, ['snap-alpha-verified']);
  assert.deepEqual(result.evidenceGapReport?.remaining, []);
  const testingSec = result.report.report.find(s => /数据检验|信度/u.test(s.title));
  assert.ok(testingSec && testingSec.body.includes('0.891'));
});

test('fetchProjectEpistemicMemory parses /api/projects/{id}/epistemic-memory cleanly and handles errors', async () => {
  let seenUrl = '';
  let seenInit = null;
  const items = await fetchProjectEpistemicMemory('proj/alpha', {
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(
        JSON.stringify({
          memories: [
            {
              id: 'mem-1',
              projectId: 'proj/alpha',
              runId: 'run-1',
              memoryKey: 'mother:living_mode',
              kind: 'mother_insight',
              status: 'active',
              summary: '共居与独居群体在助餐采纳斜率上存在显著反转。',
              snapshotRefs: ['snap_111111111111', 'snap_222222222222'],
              createdAt: '2026-11-23T08:00:00Z',
              updatedAt: '2026-11-23T08:05:00Z',
            },
            {
              id: 'mem-2',
              projectId: 'proj/alpha',
              runId: 'run-1',
              memoryKey: 'steering:1',
              kind: 'preference',
              status: 'active',
              summary: '请补充核查独居组在低支付意愿区间下的分层回归斜率。',
              snapshotRefs: [],
              createdAt: '2026-11-23T08:06:00Z',
              updatedAt: '2026-11-23T08:06:00Z',
            },
            {
              id: '',
              summary: 'invalid item without id',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  assert.equal(seenUrl, '/api/projects/proj%2Falpha/epistemic-memory');
  assert.equal(seenInit.method, 'GET');
  assert.equal(seenInit.credentials, 'same-origin');
  assert.equal(seenInit.cache, 'no-store');
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'mother_insight');
  assert.deepEqual(items[0].snapshotRefs, ['snap_111111111111', 'snap_222222222222']);
  assert.equal(items[1].kind, 'preference');
  assert.equal(items[1].memoryKey, 'steering:1');
  assert.deepEqual(items[1].snapshotRefs, []);

  const empty = await fetchProjectEpistemicMemory('proj-empty', {
    fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  });
  assert.deepEqual(empty, []);

  await assert.rejects(
    () => fetchProjectEpistemicMemory('proj-err', {
      fetchFn: async () => new Response(JSON.stringify({ error: { message: '未授权访问项目记忆' } }), { status: 401 }),
    }),
    /未授权访问项目记忆/,
  );
});

test('readAutonomousRunStream preserves thought and memory_recalled SSE event payloads cleanly', async () => {
  const sseText = [
    'id: 1\nevent: memory_recalled\ndata: {"seq":1,"eventType":"memory_recalled","payload":{"recalledCount":2,"briefText":"已召回 2 条历史研究记忆：Q_trap 剔除规则；居住模式异质性"}}\n\n',
    'id: 2\nevent: thought\ndata: {"operator":"fit_penalized_logistic","thought":"检测到高 VIF 与准完全分离，切换 L2 惩罚 Logit 重估"}\n\n',
  ].join('');
  const raw = new TextEncoder().encode(sseText);
  const events = await readAutonomousRunStream('proj-mem', 'run-mem-1', {
    fetchFn: async () => makeChunkedResponse(
      [raw.slice(0, 75), raw.slice(75)],
      { 'content-type': 'text/event-stream' },
    ),
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].eventType, 'memory_recalled');
  assert.equal(events[0].payload.recalledCount, 2);
  assert.equal(events[0].payload.briefText, '已召回 2 条历史研究记忆：Q_trap 剔除规则；居住模式异质性');
  assert.equal(events[1].eventType, 'thought');
  assert.equal(events[1].payload.operator, 'fit_penalized_logistic');
  assert.equal(events[1].payload.thought, '检测到高 VIF 与准完全分离，切换 L2 惩罚 Logit 重估');
});

test('fetchAutonomousRuns requests GET /api/projects/{id}/autonomous-runs with credentials and filters invalid runs', async () => {
  let seenUrl = '';
  let seenInit = null;
  const sha = 'c'.repeat(64);
  const validRun = {
    schemaVersion: 1,
    runId: 'run-valid-1',
    projectId: 'proj/hist',
    status: 'completed',
    createdAt: '2026-11-23T09:00:00Z',
    lease: {
      leaseId: 'lease-1',
      mode: 'pi_autonomous',
      maxToolCalls: 28,
      usedToolCalls: 8,
      datasetSha256: sha,
      privacyGuarantee: 'aggregate_isa_only_zero_raw_rows_sent_to_llm',
      expiresAt: '2026-11-23T09:30:00Z',
    },
    datasetSummary: {
      title: '历史运行恢复数据集',
      datasetRef: 'user:dataset.csv',
      datasetMode: 'user_provided',
      classification: 'user_provided',
      rawRowCount: 180,
      cleanedRowCount: 168,
      variables: 9,
      sha256: sha,
    },
    reasoningTrace: [],
    epistemicGraph: {
      project_id: 'proj/hist',
      nodes: [],
      edges: [],
      pivot_log: [],
      completeness: {
        passed: true,
        nodeCount: 2,
        edgeCount: 1,
        pivotCount: 0,
        dirtyNodes: [],
        unsupportedClaims: [],
        hasVerifiedMotherInsight: true,
        hasFalsificationCheck: true,
        graphHash: 'g'.repeat(64),
      },
    },
    motherInsight: {
      headline: '核心机制已稳健复现',
      mechanism: '信任度显著正向预测采纳率',
      boundaryCondition: '在低收入子群中斜率趋缓',
      falsificationResult: '通过安慰剂置换检验',
      counterEvidence: '未见反转',
      actionTarget: '服务渠道分级运营',
      actionMechanism: '优先完善透明度说明',
      supportingSnapshotIds: ['snap_111111111111'],
    },
    registeredResults: [],
  };

  const runs = await fetchAutonomousRuns('proj/hist', {
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(
        JSON.stringify({
          runs: [
            validRun,
            { runId: '', status: 'completed' },
            { runId: 'run-broken', status: 'completed', lease: null, datasetSummary: {}, epistemicGraph: {}, reasoningTrace: [], registeredResults: [] },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  assert.equal(seenUrl, '/api/projects/proj%2Fhist/autonomous-runs');
  assert.equal(seenInit.method, 'GET');
  assert.equal(seenInit.credentials, 'same-origin');
  assert.equal(seenInit.cache, 'no-store');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, 'run-valid-1');

  let emptyCalled = false;
  const emptyRuns = await fetchAutonomousRuns('   ', {
    fetchFn: async () => {
      emptyCalled = true;
      return new Response('{}', { status: 200 });
    },
  });
  assert.equal(emptyCalled, false);
  assert.deepEqual(emptyRuns, []);
});

test('runProjectPlotSandbox posts chartKind/autoRepair with CSRF header and parses audit payload', async () => {
  let seenUrl = '';
  let seenInit = null;
  const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><style>*{stroke-linejoin:round}</style><rect width="400" height="200" fill="#fff"/></svg>';
  const res = await runProjectPlotSandbox(
    'proj/plot',
    {
      runId: 'run-plot-1',
      snapshotId: 'snap_111111111111',
      chartKind: 'forest',
      autoRepair: false,
    },
    {
      csrfToken: 'csrf-plot-token',
      fetchFn: async (url, init) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(
          JSON.stringify({
            projectId: 'proj/plot',
            ok: true,
            svg: sampleSvg,
            svgSha256: 'd'.repeat(64),
            audit: {
              passed: true,
              vectorPure: true,
              primitiveCount: 24,
              textCount: 6,
              overlapCount: 0,
              ellipsisCount: 0,
              minFontSize: 10.5,
              issues: ['ok', 42],
            },
            repairRounds: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );

  assert.equal(seenUrl, '/api/projects/proj%2Fplot/sandbox/plot');
  assert.equal(seenInit.method, 'POST');
  assert.equal(seenInit.credentials, 'same-origin');
  assert.equal(seenInit.headers['x-csrf-token'], 'csrf-plot-token');
  assert.equal(seenInit.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seenInit.body), {
    chartKind: 'forest',
    autoRepair: false,
    runId: 'run-plot-1',
    snapshotId: 'snap_111111111111',
  });
  assert.equal(res.ok, true);
  assert.equal(res.svg, sampleSvg);
  assert.equal(res.svgSha256, 'd'.repeat(64));
  assert.equal(res.audit.passed, true);
  assert.equal(res.audit.vectorPure, true);
  assert.equal(res.audit.minFontSize, 10.5);
  assert.deepEqual(res.audit.issues, ['ok']);
  assert.equal(res.repairRounds, 1);
});

test('sandboxSvgToDataUri accepts Matplotlib <style> SVGs and rejects active/external unsafe primitives', () => {
  const matplotlibSvg = [
    '<?xml version="1.0" encoding="utf-8" standalone="no"?>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">',
    '<defs><style type="text/css">*{stroke-linejoin: round; stroke-linecap: butt}</style></defs>',
    '<path d="M 10 10 L 100 100" stroke="#0F766E"/>',
    '</svg>',
  ].join('\n');

  const dataUri = sandboxSvgToDataUri(matplotlibSvg);
  assert.ok(dataUri.startsWith('data:image/svg+xml;charset=utf-8,'));
  const decoded = decodeURIComponent(dataUri.slice('data:image/svg+xml;charset=utf-8,'.length));
  assert.ok(decoded.startsWith('<svg '));
  assert.ok(decoded.includes('<style type="text/css">'));

  for (const unsafe of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>html</div></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>',
  ]) {
    assert.throws(() => sandboxSvgToDataUri(unsafe), /安全向量核验/);
  }
});

test('verifyProjectCitation posts grounding request, fills default DOI URL, and enforces fail-closed unmatched state', async () => {
  let seenUrl = '';
  let seenInit = null;
  const hit = await verifyProjectCitation(
    'proj/cite',
    { doi: '10.1016/j.jeconom.2020.12.001' },
    {
      csrfToken: 'csrf-cite-token',
      fetchFn: async (url, init) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(
          JSON.stringify({
            projectId: 'proj/cite',
            verified: true,
            doi: '10.1016/j.jeconom.2020.12.001',
            source: 'offline_curated_catalog',
            citation: {
              doi: '10.1016/j.jeconom.2020.12.001',
              title: 'Difference-in-Differences with multiple time periods',
              authors: ['Brantly Callaway', 'Pedro H. C. Sant\'Anna'],
              year: 2021,
              venue: 'Journal of Econometrics',
              tags: ['DID', '事件研究法'],
            },
            matches: [
              {
                doi: '10.1016/j.jeconom.2020.12.001',
                title: 'Difference-in-Differences with multiple time periods',
                authors: ['Brantly Callaway', 'Pedro H. C. Sant\'Anna'],
                year: 2021,
                venue: 'Journal of Econometrics',
                tags: ['DID', '事件研究法'],
              },
            ],
            receiptHash: 'e'.repeat(64),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );

  assert.equal(seenUrl, '/api/projects/proj%2Fcite/grounding/verify-citation');
  assert.equal(seenInit.method, 'POST');
  assert.equal(seenInit.credentials, 'same-origin');
  assert.equal(seenInit.headers['x-csrf-token'], 'csrf-cite-token');
  assert.deepEqual(JSON.parse(seenInit.body), { doi: '10.1016/j.jeconom.2020.12.001' });
  assert.equal(hit.verified, true);
  assert.equal(hit.source, 'offline_curated_catalog');
  assert.equal(hit.matches.length, 1);
  assert.equal(hit.matches[0].url, 'https://doi.org/10.1016/j.jeconom.2020.12.001');
  assert.equal(hit.citation?.url, 'https://doi.org/10.1016/j.jeconom.2020.12.001');

  let missBody = '';
  const miss = await verifyProjectCitation(
    'proj/cite',
    { query: 'Unverified Fabricated Method 2099' },
    {
      fetchFn: async (_url, init) => {
        missBody = String(init.body);
        return new Response(
          JSON.stringify({
            projectId: 'proj/cite',
            verified: false,
            query: 'Unverified Fabricated Method 2099',
            source: 'openalex_live',
            citation: null,
            matches: [],
            reason: 'not_found',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );
  assert.deepEqual(JSON.parse(missBody), { query: 'Unverified Fabricated Method 2099' });
  assert.equal(miss.verified, false);
  assert.equal(miss.citation, null);
  assert.deepEqual(miss.matches, []);

  // Even if server returns verified:true with empty matches/citation, client must remain fail-closed.
  const failClosed = await verifyProjectCitation(
    'proj/cite',
    { query: 'Empty Server Payload' },
    {
      fetchFn: async () =>
        new Response(
          JSON.stringify({ verified: true, citation: null, matches: [], source: 'crossref_live' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    },
  );
  assert.equal(failClosed.verified, false);
  assert.equal(failClosed.citation, null);
});

test('prepareSandboxSvgForArtifact strips Matplotlib prolog/style so assertTrueVector passes and rejects unsafe SVG', () => {
  const matplotlibSvg = [
    '<?xml version="1.0" encoding="utf-8" standalone="no"?>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220">',
    '<defs><style type="text/css">*{stroke-linejoin: round; stroke-linecap: butt}</style></defs>',
    '<rect width="360" height="220" fill="#ffffff"/>',
    '<path d="M 12 20 L 180 140" stroke="#0F766E" stroke-width="2"/>',
    '</svg>',
  ].join('\n');

  assert.throws(() => assertTrueVector(matplotlibSvg), /真实 SVG/);
  const prepared = prepareSandboxSvgForArtifact(matplotlibSvg);
  assert.ok(prepared.startsWith('<svg '));
  assert.equal(prepared.includes('<?xml'), false);
  assert.equal(prepared.includes('<!DOCTYPE'), false);
  assert.equal(/<style\b/i.test(prepared), false);
  assert.equal(assertTrueVector(prepared), prepared);
  assert.equal(assertStrictSvg(prepared), prepared);
  assert.equal(artifactImageMime(new TextEncoder().encode(prepared)), 'image/svg+xml');

  const realisticMatplotlibSvg = [
    '<?xml version="1.0" encoding="utf-8" standalone="no"?>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" width="547.432188pt" height="345.360625pt" viewBox="0 0 547.432188 345.360625" xmlns="http://www.w3.org/2000/svg" version="1.1">',
    ' <metadata><rdf:RDF><cc:Work><dc:title>Chart</dc:title></cc:Work></rdf:RDF></metadata>',
    ' <defs><style type="text/css">*{stroke-linejoin: round; stroke-linecap: butt}</style></defs>',
    ' <g id="figure_1">',
    '  <g id="axes_1">',
    '   <g id="patch_2"><path d="M 80 280 L 140 280 L 140 120 L 80 120 Z" clip-path="url(#p1)" style="fill: #1f4e78"/></g>',
    '   <g id="xtick_1">',
    '    <g id="line2d_1">',
    '     <defs><path id="m43bf5abf4b" d="M 0 0 L 0 3.5" style="stroke: #000000; stroke-width: 0.8"/></defs>',
    '     <defs><path id="m43bf5abf4b" d="M 0 0 L 0 3.5" style="stroke: #000000; stroke-width: 0.8"/></defs>',
    '     <use xlink:href="#m43bf5abf4b" x="109.5" y="314.9" style="stroke: #000000; stroke-width: 0.8"/>',
    '    </g>',
    '   </g>',
    '   <text style="font-size: 10px; font-family: \'SimHei\', sans-serif; text-anchor: middle" x="110" y="112">240</text>',
    '  </g>',
    ' </g>',
    ' <defs><clipPath id="p1"><rect x="60" y="40" width="440" height="275"/></clipPath></defs>',
    '</svg>',
  ].join('\n');

  const preparedReal = prepareSandboxSvgForArtifact(realisticMatplotlibSvg);
  assert.equal(/<use\b/i.test(preparedReal), false);
  assert.equal(/<metadata\b/i.test(preparedReal), false);
  assert.ok(preparedReal.includes('<text'));
  assert.ok(preparedReal.includes('clip-path="url(#p1)"'));
  assert.equal(assertStrictSvg(preparedReal), preparedReal);
  assert.equal(artifactImageMime(new TextEncoder().encode(preparedReal)), 'image/svg+xml');

  for (const unsafe of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>html</div></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><rect width="10" height="10"/></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe "bad">]><svg xmlns="http://www.w3.org/2000/svg"></svg>',
  ]) {
    assert.throws(() => prepareSandboxSvgForArtifact(unsafe), /安全向量核验/);
  }
});

test('runProjectStatSandbox posts /sandbox/stat with x-csrf-token and parses SHA-256 snapshotId', async () => {
  let seenUrl = '';
  let seenInit = null;
  const shaHash = 'f'.repeat(64);
  const expectedSnapshotId = `snap_${shaHash.slice(0, 12)}`;
  const res = await runProjectStatSandbox(
    'proj/stat',
    {
      script: 'RESULT = {"summary": "加权均值 4.12", "n_effective": 188, "metrics": {"mean": 4.12}}',
      runId: 'run-stat-1',
      questions: [{ id: 'q1', type: 'likert' }],
      rows: [{ answers: { q1: 4 }, visibility: { q1: true } }],
      classification: 'actual',
    },
    {
      csrfToken: 'csrf-stat-token',
      fetchFn: async (url, init) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(
          JSON.stringify({
            projectId: 'proj/stat',
            ok: true,
            classification: 'actual',
            snapshotId: expectedSnapshotId,
            result_hash: shaHash,
            script_sha256: 'e'.repeat(64),
            evidenceRefs: [expectedSnapshotId],
            summary: '加权均值 4.12',
            n_effective: 188,
            metrics: { mean: 4.12 },
            diagnostics: ['MIN_CELL_PASS'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  );

  assert.equal(seenUrl, '/api/projects/proj%2Fstat/sandbox/stat');
  assert.equal(seenInit.method, 'POST');
  assert.equal(seenInit.credentials, 'same-origin');
  assert.equal(seenInit.headers['x-csrf-token'], 'csrf-stat-token');
  assert.equal(seenInit.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seenInit.body), {
    script: 'RESULT = {"summary": "加权均值 4.12", "n_effective": 188, "metrics": {"mean": 4.12}}',
    runId: 'run-stat-1',
    questions: [{ id: 'q1', type: 'likert' }],
    rows: [{ answers: { q1: 4 }, visibility: { q1: true } }],
    classification: 'actual',
  });
  assert.equal(res.ok, true);
  assert.equal(res.classification, 'actual');
  assert.equal(res.snapshotId, expectedSnapshotId);
  assert.equal(res.resultHash, shaHash);
  assert.equal(res.scriptSha256, 'e'.repeat(64));
  assert.equal(res.nEffective, 188);
  assert.equal(res.metrics.mean, 4.12);
  assert.deepEqual(res.diagnostics, ['MIN_CELL_PASS']);

  await assert.rejects(
    () => runProjectStatSandbox('proj/stat', { script: '   ' }),
    /统计分析脚本/,
  );
  await assert.rejects(
    () => runProjectStatSandbox('proj/stat', { script: 'RESULT = {}' }, {
      fetchFn: async () => new Response(JSON.stringify({ error: { message: '沙盒拒绝执行' } }), { status: 422 }),
    }),
    /沙盒拒绝执行/,
  );
});


test('STAT_SANDBOX_PRESETS exports three vetted pure-NumPy/stdlib readonly scripts without forbidden imports', () => {
  assert.equal(STAT_SANDBOX_PRESETS.length, 3);
  assert.deepEqual(
    STAT_SANDBOX_PRESETS.map(p => p.id),
    ['bootstrap_ci', 'spearman_matrix', 'mann_whitney_cliff'],
  );
  for (const preset of STAT_SANDBOX_PRESETS) {
    assert.ok(preset.label.trim().length > 0);
    assert.ok(preset.script.includes('DATA.get'));
    assert.ok(preset.script.includes('RESULT = {'));
    assert.ok(preset.script.includes('"n_effective"'));
    assert.equal(/\b(?:scipy|os|sys|subprocess|socket|open\s*\(|type\s*\()\b/.test(preset.script), false);
    if (preset.id === 'mann_whitney_cliff') {
      assert.ok(preset.script.includes('choice_labels'));
      assert.ok(preset.script.includes('group_q.get("choices")'));
      assert.ok(preset.script.includes('{g1_lbl} n={n1}'));
      assert.ok(preset.script.includes("Cliff's δ={cliff:.3f}"));
      assert.ok(preset.script.includes('< 0.0001'));
    }
    if (preset.id === 'spearman_matrix') {
      assert.ok(preset.script.includes('q.get("text") or q.get("variable")'));
      assert.ok(preset.script.includes('未反向重编码陷阱题：'));
      assert.ok(preset.script.includes('（ρ={top[3]:.3f}'));
      assert.ok(preset.script.includes('< 0.0001'));
    }
  }
});

test('sanitizeAdvisorDisplayText strips internal graph/hash/tool leaks while preserving quantitative metrics', () => {
  const dirtyPivot = '动态认知图谱演化(record_pivot): 捕获辛普森悖论式子群符号反转 B=0.58, p<0.001 [snap_a1b2c3d4]';
  const cleanedPivot = sanitizeAdvisorDisplayText(dirtyPivot);
  assert.equal(cleanedPivot.includes('record_pivot'), false);
  assert.equal(cleanedPivot.includes('动态认知图谱演化'), false);
  assert.equal(cleanedPivot.includes('snap_a1b2c3d4'), false);
  assert.ok(cleanedPivot.includes('关键结论更新：'));
  assert.ok(cleanedPivot.includes('B=0.58'));
  assert.ok(cleanedPivot.includes('p<0.001'));

  const dirtySummary = '审阅完成（结论：approve）：核验所有 SHA-256 回执一致，已锁定子群异质性适用边界。n=226';
  const cleanedSummary = sanitizeAdvisorDisplayText(dirtySummary);
  assert.equal(/(?:approve|SHA-256|verify_evidence_hashes|MIN_CELL_N|mutate_epistemic_graph)/iu.test(cleanedSummary), false);
  assert.ok(cleanedSummary.includes('n=226'));

  const dirtyCheck = '统计快照 SHA-256 哈希回执核验：基于 verify_evidence_hashes 实证核验工具回执，已通过 MIN_CELL_N=5 最小分层隐私校验。';
  const cleanedCheck = sanitizeAdvisorDisplayText(dirtyCheck);
  assert.equal(/(?:SHA-256|verify_evidence_hashes|MIN_CELL_N)/iu.test(cleanedCheck), false);
  assert.ok(cleanedCheck.includes('统计结果一致性核验'));
  assert.ok(cleanedCheck.includes('已满足最小分组匿名保护要求'));

  const dirtyCol = '『living_mode』存在辛普森方向反转（trust_score vs adopt_intention），构念 construct:service_perception 包含 ui_fluency、tech_ease 与 Q_trap';
  const cleanedCol = sanitizeAdvisorDisplayText(dirtyCol);
  assert.equal(/\b(?:living_mode|Q_trap|ui_fluency|tech_ease|service_perception)\b|construct:/iu.test(cleanedCol), false);
  assert.ok(cleanedCol.includes('“居住方式”存在辛普森方向反转'));
  assert.doesNotMatch(cleanedCol, /[【】「」『』{}]/u);
  assert.ok(cleanedCol.includes('信任度'));
  assert.ok(cleanedCol.includes('采纳意愿'));
  assert.ok(cleanedCol.includes('服务感知综合分'));
  assert.ok(cleanedCol.includes('界面流畅度'));
  assert.ok(cleanedCol.includes('适老易用度'));
  assert.ok(cleanedCol.includes('反向异常题项'));

  const messyStat = '（B=0.561, p=0.0）。；按「当前居住模式」对比【Spearman 秩相关稳健矩阵】相关系数 ρ=0.52（对比 p=0.05，模型参数 $\\alpha_{i} = 0.05$）';
  const cleanStat = sanitizeAdvisorDisplayText(messyStat);
  assert.ok(cleanStat.includes('p < 0.0001'));
  assert.ok(cleanStat.includes('p=0.05'));
  assert.ok(cleanStat.includes('$\\alpha_{i} = 0.05$'));
  assert.ok(cleanStat.includes('；按“当前居住模式”'));
  assert.ok(cleanStat.includes('采用 Spearman 秩相关稳健矩阵 检验，相关系数'));
  assert.equal(/Spearman 秩相关稳健矩阵[：:]|p=0\.0(?![0-9])|。；|[【】「」『』]/u.test(cleanStat), false);
});

test('queryProjectCountyGazetteer encodes GET query and parses county matches and patterns', async () => {
  const seenUrls = [];
  const res = await queryProjectCountyGazetteer('proj-1', '义乌市', {
    limit: 5,
    fetchFn: async (url) => {
      seenUrls.push(String(url));
      return new Response(
        JSON.stringify({
          projectId: 'proj-1',
          query: '义乌市',
          matches: [
            { code: '330782', name: '义乌市', level: 'county', provinceName: '浙江省', prefectureName: '金华市' },
          ],
          matchedPatterns: [
            { id: 'pat-1', title: '县域跨境电商与数字供应链协同调研', domain: '数字经济', methods: ['回归', '问卷'] },
          ],
          caveats: ['目录覆盖全国 34 省 333 市 2845 县。'],
          catalogVersion: 'cn-admin-2025',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  assert.equal(seenUrls.length, 1);
  assert.match(seenUrls[0], /\/api\/projects\/proj-1\/grounding\/counties\?q=%E4%B9%89%E4%B9%8C%E5%B8%82&limit=5$/);
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].code, '330782');
  assert.equal(res.matches[0].name, '义乌市');
  assert.equal(res.matchedPatterns[0].title, '县域跨境电商与数字供应链协同调研');
});

test('hydrateAutonomousRunToQuality strips technical pivot/operator jargon from hydrated research findings', async () => {
  const sha = 'e'.repeat(64);
  const run = {
    schemaVersion: 1,
    runId: 'run-clean-findings-1',
    projectId: 'proj-clean',
    status: 'completed',
    goal: '适老化服务体验调研',
    geography: '县域',
    datasetMode: 'planted_trap_benchmark',
    leaseMode: 'pi_autonomous',
    toolCallsUsed: 4,
    maxToolCalls: 28,
    reworkRounds: 0,
    datasetSummary: {
      datasetId: 'ds-clean',
      title: '调研数据集',
      classification: 'user_provided',
      rawRowCount: 250,
      cleanedRowCount: 240,
      variables: 6,
      sha256: sha,
    },
    motherInsight: {
      headline: 'record_pivot: 『living_mode』存在方向分化',
      mechanism: 'construct:service_perception 受 HIGH_VIF 影响需稳健回归',
      paradoxDetail: 'ui_fluency 在分群间存在反差',
      scopeBoundary: '基于算子回执锁定，含 Q_trap 过滤',
      supportingSnapshots: ['snap-1'],
    },
    falsificationReport: { decision: 'approve', summary: '通过' },
    pendingMilestone: null,
    registeredResults: [
      {
        id: 'snap-1',
        title: 'ui_fluency 检验',
        method: 'groups',
        n: 240,
        total: 250,
        sourceName: '调查样本',
        headers: ['分组', '均值'],
        rows: [['组A', 4.1]],
        metrics: [{ label: '均值', value: 4.1 }],
        warnings: [],
      },
    ],
    epistemicGraph: {
      nodes: [],
      edges: [],
      pivot_log: [],
      completeness: { totalNodes: 1, verifiedNodes: 1, dirtyNodes: 0, pivotCount: 1 },
    },
    reasoningTrace: [
      {
        phase: 'falsify_and_review',
        iteration: 1,
        agentRole: 'critic',
        thought: 'ReAct 轨迹检测 SUBGROUP_SIGN_REVERSAL 风险',
        operator: 'group_compare',
        args: {},
        diagnostics: ['HIGH_VIF: ui_fluency', 'SUBGROUP_SIGN_REVERSAL'],
        pivotTaken: 'record_pivot: 改用 Mann-Whitney 检验',
        snapshotId: 'snap-1',
        observationSummary: 'construct:service_perception 存在分组差异 [snap-1]',
      },
    ],
    epistemicMemories: [],
  };
  const quality = await hydrateAutonomousRunToQuality(run);
  await verifyResearchQuality(quality);
  const allText = quality.findings.map(f => `${f.title} ${f.question} ${f.interpretation} ${f.alternatives} ${f.scope}`).join('\n');
  assert.equal(/算子|record_pivot|HIGH_VIF|SUBGROUP_SIGN_REVERSAL|construct:|ui_fluency|living_mode|Q_trap|ReAct/.test(allText), false);
});

test('generateInterviewCorpus, parseFigureRequest, and auditStatisticalMethodGuardrails emit zero corner brackets', () => {
  const corpus = generateInterviewCorpus({
    topic: '城市社区老年助餐服务质量与满意度调研',
    stimulusNoun: '社区助餐服务',
    population: '年满 60 周岁常住老人',
    dimensions: ['餐食适口性', '规则透明度', '高峰配送稳定性'],
    groupChoices: ['独居长者', '家庭同住长者'],
    mechanismDimension: '预约确认便利度',
  });
  for (const g of corpus.guide) {
    assert.doesNotMatch(`${g.prompt}\n${g.followUp}`, /[「」『』]/u);
  }
  for (const t of corpus.transcripts) {
    assert.doesNotMatch(t.excerpt, /[「」『』]/u);
  }
  for (const row of corpus.codingMatrix) {
    assert.doesNotMatch(row.rawAnchor, /[「」『』]/u);
  }

  const figUnsupported = [
    ...(parseFigureRequest('把这张图改成直方图')?.unsupported ?? []),
    ...(parseFigureRequest('换成暖珊瑚红色系配色')?.unsupported ?? []),
  ].join('\n');
  assert.ok(figUnsupported.length > 0);
  assert.doesNotMatch(figUnsupported, /[「」『』]/u);

  const findings = auditStatisticalMethodGuardrails({
    sections: [
      {
        id: 'sec-causal',
        title: '三、核心回归发现',
        body: 'OLS 回归表明服务体验改善直接导致持续使用意愿大幅提升，并在小样本（样本量 n=45）下开展探索性因子分析 EFA。',
      },
    ],
    results: [],
  });
  assert.ok(findings.length >= 2);
  for (const f of findings) {
    assert.doesNotMatch(f.message, /[【】「」『』]/u);
  }
});
