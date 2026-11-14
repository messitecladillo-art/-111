import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceAgentTask,
  approveAgentTask,
  buildTaskPayloadFromWorkspace,
  buildWorkflowModelPlan,
  cancelAgentTask,
  classifyWorkflowGate,
  createAgentTask,
  getModelCalls,
  getModelPreview,
  listAgentTasks,
  listProjectSurveys,
  provideTaskInput,
  workflowStageProgress,
} from '../lib/agent/workflow-task-client.ts';

const SERVICES = [
  { id: 'svc-research', label: 'Research Model', model: 'deepseek-chat', capabilities: ['research'], revision: 3 },
  { id: 'svc-survey', label: 'Survey Model', model: 'qwen-plus', capabilities: ['questionnaire'], revision: 2 },
  { id: 'svc-report', label: 'Report Model', model: 'gpt-4.1', capabilities: ['report'], revision: 5 },
];

test('buildWorkflowModelPlan resolves capabilities per role and detects missing capabilities', () => {
  const full = buildWorkflowModelPlan('full_research', SERVICES, null, 'svc-report');
  assert.equal(full.ok, true);
  assert.deepEqual(full.plan, {
    schemaVersion: 1,
    default: { serviceId: 'svc-report', revision: 5 },
    roles: {
      research: { serviceId: 'svc-research', revision: 3 },
      survey: { serviceId: 'svc-survey', revision: 2 },
      data: { serviceId: 'svc-research', revision: 3 },
      writing: { serviceId: 'svc-report', revision: 5 },
      reviewer: { serviceId: 'svc-report', revision: 5 },
    },
  });

  const withoutSurvey = SERVICES.filter(s => s.id !== 'svc-survey');
  const blockedFull = buildWorkflowModelPlan('full_research', withoutSurvey);
  assert.equal(blockedFull.ok, false);
  assert.deepEqual(blockedFull.missingRoles, [{ role: 'survey', capability: 'questionnaire' }]);

  const topicOnly = buildWorkflowModelPlan('topic_design', withoutSurvey);
  assert.equal(topicOnly.ok, true);
  assert.deepEqual(Object.keys(topicOnly.plan.roles ?? {}), ['research', 'reviewer']);
});

test('buildTaskPayloadFromWorkspace maps brief and literature study excerpts without extra keys', () => {
  const payload = buildTaskPayloadFromWorkspace({
    taskType: 'full_research',
    direction: '高校生防晒消费行为研究',
    brief: {
      title: 'Z 世代户外防晒决策机制调研',
      decisionOwner: '品牌营销团队',
      decision: '确定校园渠道产品定价与功效沟通重点',
      population: '18-24岁在校大学生',
      geography: '华东三省高校',
      inclusion: '近一年购买过防晒产品',
      exclusion: '皮肤科从业者',
      evidencePlan: '问卷+交叉检验',
      questions: [{ id: 'q1', text: '消费者更看重SPF倍数还是肤感？' }],
      constructs: [],
      differentiators: [],
      unknowns: [],
      firstWeekPlan: [],
      sources: [],
    },
    literatureStudy: {
      domain: 'business',
      papers: [{ id: 'p1', title: '防晒消费行为综述', filename: 'sunscreen.pdf', pageCount: 8, pages: [] }],
      evidence: [{ id: 'e1', paperId: 'p1', page: 3, kind: 'result', quote: '黏腻感是大学生复购率下降的首要痛点。' }],
    },
    inputArtifactRefs: ['survey-release:11111111-1111-4111-8111-111111111111'],
  });

  assert.equal(payload.taskType, 'full_research');
  assert.equal(payload.requirements.title, 'Z 世代户外防晒决策机制调研');
  assert.equal(payload.requirements.goal, '确定校园渠道产品定价与功效沟通重点');
  assert.deepEqual(payload.requirements.researchQuestions, ['消费者更看重SPF倍数还是肤感？']);
  assert.equal(payload.context?.literature?.length, 1);
  assert.equal(payload.context?.literature?.[0].location, '第 3 页 (result)');
  assert.deepEqual(payload.inputArtifactRefs, ['survey-release:11111111-1111-4111-8111-111111111111']);
});

test('classifyWorkflowGate and workflowStageProgress interpret backend states cleanly', () => {
  const baseState = {
    task_id: 't1',
    project_id: 'p1',
    task_type: 'full_research',
    requirements: {},
    context: {},
    input_artifact_refs: [],
    constraints: {},
    status: 'needs_input',
    current_role: 'data',
    awaiting_approval: 'upload_real_data',
    retry_count: {},
    max_retries: 2,
    artifact_refs: [],
    evidence_refs: [],
    unresolved_questions: [],
    errors: [],
    summary: '',
    revision: 3,
    agent_outputs: { research: { summary: 'ok' }, survey: { summary: 'ok' } },
    model_bindings: null,
  };
  const task = {
    id: 't1',
    projectId: 'p1',
    taskType: 'full_research',
    status: 'needs_input',
    revision: 3,
    state: baseState,
    createdAt: '2026-11-14T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
  };

  assert.equal(classifyWorkflowGate(task)?.kind, 'upload_real_data');
  assert.deepEqual(workflowStageProgress(task), [
    { role: 'research', label: '选题研究', state: 'done' },
    { role: 'survey', label: '问卷抽样', state: 'done' },
    { role: 'data', label: '数据分析', state: 'active' },
    { role: 'writing', label: '报告撰稿', state: 'waiting' },
    { role: 'reviewer', label: '质量审校', state: 'waiting' },
  ]);

  const approvalGate = classifyWorkflowGate({
    ...task,
    state: { ...baseState, awaiting_approval: 'approve_research' },
  });
  assert.deepEqual(approvalGate, {
    kind: 'approve_review',
    role: 'research',
    label: '「选题研究」阶段已通过审校，请确认放行或退回修改。',
  });
});

test('workflow transport helpers invoke expected REST paths and payloads', async () => {
  const log = [];
  const surveyPayload = {
    surveys: [{
      id: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      versionId: '33333333-3333-4333-8333-333333333333',
      questionnaireRevision: 1,
      revision: 1,
      status: 'open',
      token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      title: '正式问卷',
      classification: 'actual',
      responseCount: 42,
      responseBytes: 1024,
      limits: { responses: 5000, answerBytes: 2097152 },
      createdAt: '2026-11-14T00:00:00Z',
      closedAt: null,
    }],
  };
  const transport = {
    async request(url) {
      log.push({ method: 'GET', url });
      if (url.endsWith('/surveys')) return surveyPayload;
      if (url.endsWith('/agent-tasks')) return { tasks: [] };
      if (url.endsWith('/model-calls')) return { calls: [] };
      return { previewHash: 'abc', maxCalls: 2 };
    },
    async mutate(url, body, method = 'POST') {
      log.push({ method, url, body });
      return { id: 'task-1', revision: 1 };
    },
  };

  await listAgentTasks(transport, 'proj-1');
  await createAgentTask(transport, 'proj-1', { taskType: 'topic_design', requirements: { goal: 'test' } });
  await getModelPreview(transport, 'proj-1', 'task-1');
  await advanceAgentTask(transport, 'proj-1', 'task-1', { expectedRevision: 0, modelConsent: { accepted: true, previewHash: 'abc', maxCalls: 2 } });
  await getModelCalls(transport, 'proj-1', 'task-1');
  await approveAgentTask(transport, 'proj-1', 'task-1', { expectedRevision: 1, approved: true });
  await provideTaskInput(transport, 'proj-1', 'task-1', { expectedRevision: 2, artifactRefs: ['survey-release:11111111-1111-4111-8111-111111111111'] });
  await cancelAgentTask(transport, 'proj-1', 'task-1', 3);
  const surveys = await listProjectSurveys(transport, 'proj-1');

  assert.equal(surveys.length, 1);
  assert.equal(surveys[0].responseCount, 42);
  assert.deepEqual(
    log.map(item => `${item.method} ${item.url}`),
    [
      'GET /api/projects/proj-1/agent-tasks',
      'POST /api/projects/proj-1/agent-tasks',
      'GET /api/projects/proj-1/agent-tasks/task-1/model-preview',
      'POST /api/projects/proj-1/agent-tasks/task-1/advance',
      'GET /api/projects/proj-1/agent-tasks/task-1/model-calls',
      'POST /api/projects/proj-1/agent-tasks/task-1/approval',
      'POST /api/projects/proj-1/agent-tasks/task-1/input',
      'POST /api/projects/proj-1/agent-tasks/task-1/cancel',
      'GET /api/projects/proj-1/surveys',
    ],
  );
});
