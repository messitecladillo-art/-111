/** Stable call identities describe existing call paths, independently of provider or display name. */
export const MODEL_CALLS = {
  'research.conversation': { label: 'Agent 对话', capability: 'research' },
  'research.topic': { label: '选题顾问', capability: 'research' },
  'survey.questionnaire': { label: '问卷提案', capability: 'questionnaire' },
  'report.draft': { label: '章节起草', capability: 'report' },
  'report.revision': { label: '章节修订', capability: 'report' },
  'report.full': { label: '整份报告候选稿', capability: 'report' },
} as const;

export type ModelCallId = keyof typeof MODEL_CALLS;
export const MODEL_CALL_IDS = Object.freeze(Object.keys(MODEL_CALLS) as ModelCallId[]);
export const isModelCallId = (value: unknown): value is ModelCallId => typeof value === 'string' && Object.hasOwn(MODEL_CALLS, value);

export type ResearchStageId = 'topic' | 'diagnosis' | 'literature' | 'questionnaire' | 'sampling' | 'pilot'
  | 'collection' | 'quality' | 'analysis' | 'findings' | 'report' | 'review' | 'export' | 'defense';
export type ResearchStage = Readonly<{
  id: ResearchStageId;
  label: string;
  description: string;
  execution: 'model' | 'deterministic' | 'manual' | 'unavailable';
  modelCalls: readonly ModelCallId[];
  /** The stage has a current capability; this does not promise unattended end-to-end execution. */
  availability: 'available' | 'partial' | 'manual' | 'planned';
}>;

/** Product workflow, not competition CLI stages or a second execution state machine. */
export const RESEARCH_STAGES: readonly ResearchStage[] = Object.freeze([
  { id: 'topic', label: '方向与题目', description: '按团队条件推荐、比较和细化拟议选题；采纳后保存选题版本。', execution: 'model', modelCalls: ['research.topic'], availability: 'available' },
  { id: 'diagnosis', label: '选题诊断', description: '检查决策问题、人群、地域、资源和证据缺口。', execution: 'deterministic', modelCalls: [], availability: 'available' },
  { id: 'literature', label: '资料与文献', description: '查询知识资料；联网查证需已配置服务，检索摘要不等于已核读全文。', execution: 'deterministic', modelCalls: [], availability: 'partial' },
  { id: 'questionnaire', label: '问卷设计', description: '由已确认的研究问题生成待审阅问卷提案。', execution: 'model', modelCalls: ['survey.questionnaire'], availability: 'available' },
  { id: 'sampling', label: '抽样方案', description: '结合目标总体和实际渠道计算、记录拟议抽样方案。', execution: 'deterministic', modelCalls: [], availability: 'partial' },
  { id: 'pilot', label: '预测试', description: '组织真实预测试并记录修订；模拟样本仅用于教学或流程检查。', execution: 'manual', modelCalls: [], availability: 'manual' },
  { id: 'collection', label: '调查收集', description: '取得同意、实施调查并上传真实材料，不能用生成内容代替受访者。', execution: 'manual', modelCalls: [], availability: 'manual' },
  { id: 'quality', label: '数据质量', description: '检查已上传材料的缺失、异常和清洗记录。', execution: 'deterministic', modelCalls: [], availability: 'partial' },
  { id: 'analysis', label: '统计分析', description: '对真实数据执行适用分析并登记可追溯结果；后台 Data 执行器尚未接通。', execution: 'deterministic', modelCalls: [], availability: 'partial' },
  { id: 'findings', label: '发现与建议', description: '依据已登记结果组织并确认发现和行动建议。', execution: 'manual', modelCalls: [], availability: 'partial' },
  { id: 'report', label: '报告写作', description: '使用现有章节起草、修订或整稿候选路径；整稿每轮绑定一个服务。', execution: 'model', modelCalls: ['report.draft', 'report.revision', 'report.full'], availability: 'available' },
  { id: 'review', label: '一致性审查', description: '运行现有确定性检查，保留人工审阅；完整后台 Reviewer 执行器尚未接通。', execution: 'deterministic', modelCalls: [], availability: 'partial' },
  { id: 'export', label: '成果导出', description: '导出当前成果并核对格式、来源和匿名要求。', execution: 'deterministic', modelCalls: [], availability: 'partial' },
  { id: 'defense', label: '答辩准备', description: '用已有证据练习陈述、回答追问和检查用时。', execution: 'manual', modelCalls: [], availability: 'manual' },
].map(stage => Object.freeze({ ...stage, modelCalls: Object.freeze(stage.modelCalls) })) as ResearchStage[]);
