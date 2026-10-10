/** Draft questionnaire design only. No respondent data, network, storage, or validity certification. */
export const DESIGN_LIMITS = { bytes: 300_000, questions: 80, choices: 30, history: 40 } as const;
export const QUESTION_TYPES = { single: "单选", multi: "多选", likert: "量表单题", number: "数值", text: "开放题" } as const;
export const ANALYSIS_PLANS = { undecided: "尚未确定", description: "描述分布", comparison: "组间比较", association: "关联分析", measurement: "测量质量", coding: "文本编码", routing: "筛选 / 路由" } as const;
export type QuestionType = keyof typeof QUESTION_TYPES;
export type AnalysisPlan = keyof typeof ANALYSIS_PLANS;
export type Choice = { code: string; label: string };
export type DesignQuestion = {
  id: string; variable: string; text: string; type: QuestionType; required: boolean;
  purpose: "research" | "screening" | "background"; researchQuestion: string; construct: string;
  analysis: AnalysisPlan; decisionUse: string; source: string; choices: Choice[];
  min: number | null; max: number | null; minLabel: string; maxLabel: string; reverse: boolean;
  condition: null | { questionId: string; codes: string[] };
};
export type Questionnaire = {
  schema: "questionnaire-design/v1"; classification: "proposed";
  title: string; objective: string; population: string; geography: string; period: string;
  recruitment: string; introduction: string; pilotNotes: string; questions: DesignQuestion[];
};
export type DesignIssue = { code: string; level: "blocker" | "review"; questionId: string | null; message: string };

export type QuestionFilter = "all" | "blocker" | "unmapped" | "conditional" | "pending";
export function questionIsMapped(q: DesignQuestion): boolean {
  return (q.purpose !== "research" || !!q.researchQuestion.trim()) && q.analysis !== "undecided" && !!q.decisionUse.trim();
}
/** View-only projection: original question order/IDs and editable drafts never change. */
export function questionDirectory(d: Questionnaire, query = "", filter: QuestionFilter = "all", pendingIds: readonly string[] = []) {
  const issues = questionnaireIssues(d), pending = new Set(pendingIds);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return d.questions.map((question, index) => ({
    question, number: index + 1,
    blockers: issues.filter(i => i.questionId === question.id && i.level === "blocker").length,
    reviews: issues.filter(i => i.questionId === question.id && i.level === "review").length,
    mapped: questionIsMapped(question), pending: pending.has(question.id),
  })).filter(entry => {
    const q = entry.question;
    const haystack = [q.variable, q.text, q.construct, q.researchQuestion, QUESTION_TYPES[q.type]].join(" ").toLocaleLowerCase();
    const matches = filter === "all" || (filter === "blocker" && entry.blockers > 0) ||
      (filter === "unmapped" && !entry.mapped) || (filter === "conditional" && !!q.condition) || (filter === "pending" && entry.pending);
    return matches && terms.every(term => haystack.includes(term));
  });
}

export function newQuestion(id: string, variable: string): DesignQuestion {
  return { id, variable, text: "", type: "single", required: false, purpose: "research", researchQuestion: "", construct: "", analysis: "undecided", decisionUse: "", source: "", choices: [{ code: "1", label: "" }, { code: "2", label: "" }], min: 1, max: 5, minLabel: "", maxLabel: "", reverse: false, condition: null };
}
export function newQuestionnaire(): Questionnaire {
  return { schema: "questionnaire-design/v1", classification: "proposed", title: "未命名问卷设计", objective: "", population: "", geography: "", period: "", recruitment: "", introduction: "", pilotNotes: "", questions: [newQuestion("initial-question", "Q1")] };
}

function object(value: unknown, keys: string[], at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${at} 必须为普通对象。`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) throw new Error(`${at} 字段缺失或包含未知字段，请使用本工作台的 JSON 备份。`);
  return record;
}
function string(value: unknown, max: number, at: string): asserts value is string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new Error(`${at} 必须为不超过 ${max} 字的文本，且不能包含控制字符。`);
}
function enumValue(value: unknown, options: readonly string[], at: string) { if (typeof value !== "string" || !options.includes(value)) throw new Error(`${at} 取值不支持。`); }
function bound(value: unknown, at: string) { if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e9)) throw new Error(`${at} 必须为空或绝对值不超过十亿的有限数值。`); }
export function rejectDuplicateMembers(raw: string) {
  // JSON.parse has already checked syntax. Inspect decoded keys before its last-wins behavior can be accepted.
  const stack: { object: boolean; key: boolean; keys: Set<string> }[] = [];
  const tokens = raw.matchAll(/"(?:\\.|[^"\\])*"|[{}[\],:]/g);
  for (const match of tokens) {
    const token = match[0], top = stack.at(-1);
    if (token === "{" || token === "[") {
      if (stack.length >= 16) throw new Error("JSON 嵌套过深，不是本工具支持的备份结构。");
      stack.push({ object: token === "{", key: token === "{", keys: new Set() });
    } else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && top?.object) top.key = true;
    else if (token.startsWith('"') && top?.object && top.key) {
      const key = JSON.parse(token) as string;
      if (top.keys.has(key)) throw new Error("JSON 对象存在重复字段，未选择其中任一值；请核对原始备份。");
      top.keys.add(key); top.key = false;
    }
  }
}
export function parseBoundDraft(raw: string): { value: number | null; error: string } {
  const text = raw.trim();
  if (!text) return { value: null, error: "" };
  if (text.length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return { value: null, error: "数值尚未完整，输入将暂存；请输入完整数值，或清空以取消边界。" };
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > 1e9 || (value === 0 && /[1-9]/.test(text.split(/e/i)[0]))) return { value: null, error: "数值超出可表示范围（绝对值不超过十亿，且不能下溢为零），未应用。" };
  return { value: value === 0 ? 0 : value, error: "" };
}
export function parseQuestionnaire(raw: string): Questionnaire {
  if (new TextEncoder().encode(raw).length > DESIGN_LIMITS.bytes) throw new Error("备份超过 300 KB，未读取。最多 80 道题。");
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { throw new Error("无法解析 JSON，请选择完整的问卷设计备份。"); }
  rejectDuplicateMembers(raw);
  const d = object(value, ["schema", "classification", "title", "objective", "population", "geography", "period", "recruitment", "introduction", "pilotNotes", "questions"], "问卷");
  if (d.schema !== "questionnaire-design/v1" || d.classification !== "proposed") throw new Error("备份版本或内容分类不支持；本工具只处理待实施的问卷设计。");
  for (const key of ["title", "population", "geography", "period"]) string(d[key], 160, key);
  for (const key of ["objective", "recruitment"]) string(d[key], 600, key);
  for (const key of ["introduction", "pilotNotes"]) string(d[key], 2000, key);
  if (!Array.isArray(d.questions) || d.questions.length > DESIGN_LIMITS.questions) throw new Error("题目列表无效，最多 80 道题。");
  const ids = new Set<string>();
  d.questions.forEach((entry, i) => {
    const at = `第 ${i + 1} 题`;
    const q = object(entry, ["id", "variable", "text", "type", "required", "purpose", "researchQuestion", "construct", "analysis", "decisionUse", "source", "choices", "min", "max", "minLabel", "maxLabel", "reverse", "condition"], at);
    string(q.id, 64, `${at} ID`);
    if (!/^[A-Za-z0-9_-]+$/.test(q.id) || ids.has(q.id)) throw new Error(`${at} ID 无效或重复。`);
    ids.add(q.id);
    string(q.variable, 32, `${at} 变量`); string(q.text, 600, `${at} 题干`);
    for (const key of ["researchQuestion", "decisionUse", "source"]) string(q[key], 500, `${at} ${key}`);
    for (const key of ["construct", "minLabel", "maxLabel"]) string(q[key], 120, `${at} ${key}`);
    enumValue(q.type, Object.keys(QUESTION_TYPES), `${at} 题型`); enumValue(q.analysis, Object.keys(ANALYSIS_PLANS), `${at} 分析计划`); enumValue(q.purpose, ["research", "screening", "background"], `${at} 用途`);
    if (typeof q.required !== "boolean" || typeof q.reverse !== "boolean") throw new Error(`${at} 布尔配置无效。`);
    bound(q.min, `${at} 下限`); bound(q.max, `${at} 上限`);
    // JSON backups have no distinct negative-zero representation; numeric semantics are unchanged.
    if (q.min === 0) q.min = 0;
    if (q.max === 0) q.max = 0;
    if (!Array.isArray(q.choices) || q.choices.length > DESIGN_LIMITS.choices) throw new Error(`${at} 选项无效，最多 30 项。`);
    q.choices.forEach((choice, j) => { const c = object(choice, ["code", "label"], `${at} 选项 ${j + 1}`); string(c.code, 16, "选项编码"); string(c.label, 160, "选项文字"); });
    if (q.condition !== null) {
      const c = object(q.condition, ["questionId", "codes"], `${at} 显示条件`);
      string(c.questionId, 64, "来源题 ID");
      if (!Array.isArray(c.codes) || c.codes.length > 30) throw new Error(`${at} 条件编码无效。`);
      c.codes.forEach(code => string(code, 16, "条件编码"));
    }
  });
  // Semantic gaps are preserved as editable drafts, never silently repaired or certified.
  // Bound the actual formatted backup too, so every accepted draft can be restored.
  if (new TextEncoder().encode(JSON.stringify(value, null, 2)).length > DESIGN_LIMITS.bytes) throw new Error("格式化备份超过 300 KB，请减少题目或文字长度。");
  return value as Questionnaire;
}

export function questionnaireIssues(d: Questionnaire): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (code: string, level: DesignIssue["level"], questionId: string | null, message: string) => issues.push({ code, level, questionId, message });
  for (const [key, label] of [["title", "问卷名称"], ["objective", "决策目标"], ["population", "调查对象与纳入条件"], ["period", "问题参照期"], ["recruitment", "招募与抽样方案"], ["introduction", "告知与自愿参与说明"]] as const) if (!d[key].trim()) add(`brief_${key}`, "review", null, `补充${label}，不要由系统推测。`);
  if (!d.pilotNotes.trim()) add("pilot_missing", "review", null, "记录预试计划或已完成预试的时间、对象与发现；填了文字也不代表预试已验证。");
  if (!d.questions.length) add("empty", "blocker", null, "还没有题目。");
  const vars = d.questions.map(q => q.variable.trim().toLowerCase());
  d.questions.forEach((q, i) => {
    if (!q.text.trim()) add("text_missing", "blocker", q.id, "题干为空。");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(q.variable)) add("variable_invalid", "blocker", q.id, "变量编码以英文字母开头，只用字母、数字、下划线，最长 32 字符。");
    else if (vars.filter(v => v === q.variable.toLowerCase()).length > 1) add("variable_duplicate", "blocker", q.id, `变量 ${q.variable} 重复（不区分大小写）。`);
    if (q.purpose === "research" && !q.researchQuestion.trim()) add("question_unmapped", "review", q.id, "尚未说明这道题回答哪一个研究问题。");
    if (!q.decisionUse.trim()) add("use_unmapped", "review", q.id, q.purpose === "screening" ? "补充筛选或分支路由的用途。" : "补充本题结果将影响什么判断或行动。");
    if (q.analysis === "undecided") add("analysis_missing", "review", q.id, "尚未选择计划分析用途。");
    if (q.analysis === "routing" && q.purpose !== "screening") add("routing_mismatch", "review", q.id, "路由用途通常用于筛选题，请核对题目角色。");
    if (q.type === "single" || q.type === "multi") {
      if (q.choices.length < 2) add("choices_short", "blocker", q.id, "单选或多选至少需要两个明确选项。");
      const codes = q.choices.map(c => c.code.trim()), labels = q.choices.map(c => c.label.trim());
      if (q.choices.some(c => c.code !== c.code.trim()) || codes.some(c => !/^[A-Za-z0-9_-]{1,16}$/.test(c)) || new Set(codes).size !== codes.length) add("choice_codes", "blocker", q.id, "选项编码必须唯一且非空，只用字母、数字、下划线或短横线，不含空格。");
      if (labels.some(v => !v) || new Set(labels).size !== labels.length) add("choice_labels", "blocker", q.id, "选项文字为空或重复。");
      if (labels.some(v => /不知道|不适用|拒绝|不愿/.test(v))) add("special_answers", "review", q.id, "已定义特殊回答。数据分析时须明确其含义，不要自动与未作答合并或计为 0 分。");
    }
    if (q.type === "likert") {
      if (q.min === null || q.max === null || !Number.isInteger(q.min) || !Number.isInteger(q.max) || q.max <= q.min || q.max - q.min > 14) add("scale_bounds", "blocker", q.id, "量表单题需要 2–15 个连续整数计分点；这是本编辑器能力范围，不是量表质量标准。");
      if (!q.minLabel.trim() || !q.maxLabel.trim()) add("scale_anchors", "blocker", q.id, "填写量表两端的明确文字锚点。");
      if (!q.construct.trim()) add("construct_missing", "review", q.id, "明确拟测量的构念；同一构念的多道题才能讨论内部一致性。");
      if (!q.source.trim()) add("scale_source", "review", q.id, "注明量表来源及改编依据；自编题明确写自编及依据，不冒称成熟量表。");
      if (q.reverse) add("reverse_review", "review", q.id, "反向计分只在分析端使用，受访者看到的题干不改写；请按原题语义核对。");
    } else if (q.reverse) add("reverse_type", "blocker", q.id, "当前题型不支持反向计分，需取消该设置。");
    if (q.type === "number" && q.min !== null && q.max !== null && q.min > q.max) add("number_bounds", "blocker", q.id, "数值下限不能大于上限。");
    if (q.type === "text" && q.required) add("required_text", "review", q.id, "必答开放题可能增加负担，核对是否有必要并保留合理拒答安排。");
    if (q.analysis === "measurement" && q.type !== "likert") add("measurement_type", "review", q.id, "当前题型不直接等于量表，请明确测量模型，不对名义编码机械计算 α。");
    if (/众所周知|显然|难道|理所当然/.test(q.text)) add("leading_possible", "review", q.id, "措辞可能带有预设立场，请人工检查；关键词提示不能替代认知访谈。");
    if (/并且|以及|同时/.test(q.text)) add("double_possible", "review", q.id, "可能在一道题里要求多个判断，请确认能否由一个答案表达。");
    const c = q.condition;
    if (c) {
      const parentIndex = d.questions.findIndex(item => item.id === c.questionId), parent = d.questions[parentIndex];
      if (!parent || parentIndex >= i || parent.type !== "single") add("route_source", "blocker", q.id, "显示条件必须引用排在本题之前的单选题，不能自引用、后向依赖或引用已删除题。");
      if (!c.codes.length || new Set(c.codes).size !== c.codes.length || (parent && c.codes.some(code => !parent.choices.some(o => o.code === code)))) add("route_codes", "blocker", q.id, "显示条件中的选项编码为空、重复或不存在。");
      if (parent && (parent.choices.length < 2 || parent.choices.some(o => !/^[A-Za-z0-9_-]{1,16}$/.test(o.code)) || new Set(parent.choices.map(o=>o.code)).size !== parent.choices.length)) add("route_ambiguous", "blocker", q.id, "来源题选项编码无效或不唯一，暂不演练此分支。");
    }
  });
  return issues;
}

export function routeDependencies(d: Questionnaire, questionId: string, code?: string): DesignQuestion[] {
  return d.questions.filter(q => q.condition?.questionId === questionId && (code === undefined || q.condition.codes.includes(code)));
}
export function visibleQuestionIds(d: Questionnaire, answers: Record<string, string>): string[] {
  const visible = new Set<string>();
  const blockers = questionnaireIssues(d).filter(i => i.code === "route_source" || i.code === "route_codes" || i.code === "route_ambiguous");
  for (const q of d.questions) {
    if (blockers.some(i => i.questionId === q.id)) continue;
    if (!q.condition || (visible.has(q.condition.questionId) && Object.hasOwn(answers, q.condition.questionId) && q.condition.codes.includes(answers[q.condition.questionId]))) visible.add(q.id);
  }
  return [...visible];
}
export function nextVariable(d: Questionnaire): string {
  const existing = new Set(d.questions.map(q => q.variable.toLowerCase()));
  let n = 1; while (existing.has(`q${n}`)) n++; return `Q${n}`;
}
export function questionnaireText(d: Questionnaire): string {
  const issues = questionnaireIssues(d);
  const text = ["【问卷设计草稿 · 待实施，不是已验证问卷】", d.title || "未命名问卷", `结构阻断项：${issues.filter(i=>i.level==='blocker').length}；待人工复核：${issues.filter(i=>i.level==='review').length}`, "此稿不收集答卷。发放前须完成专家审查、认知访谈/预试、伦理与适用规则检查。", "", "调查说明", d.introduction || "[待填写告知与自愿参与说明]", ""];
  d.questions.forEach((q,i) => {
    text.push(`${i+1}. [${q.variable || '变量待填写'}] ${q.text || '[题干待填写]'}（${QUESTION_TYPES[q.type]}${q.required?' · 拟必答':''}）`);
    if (q.condition) { const parentIndex=d.questions.findIndex(p=>p.id===q.condition?.questionId), parent=d.questions[parentIndex]; text.push(`[显示条件：${parent?`第 ${parentIndex+1} 题 ${parent.variable || '[变量待填写]'}`:'[来源题缺失]'} 的回答编码属于 ${q.condition.codes.join(' / ') || '[待选择]'}；来源题隐藏或未答时不显示]`); }
    if(q.type==='single'||q.type==='multi') q.choices.forEach(c=>text.push(`  ${c.code || '[未编码]'}. ${c.label || '[选项待填写]'}`));
    if(q.type==='likert') text.push(`  ${q.min??'[下限待填]'}（${q.minLabel||'[锚点待填]'}）至 ${q.max??'[上限待填]'}（${q.maxLabel||'[锚点待填]'}），按整数点作答。`);
    if(q.type==='number') text.push(`  数值范围：${q.min??'未限定'} 至 ${q.max??'未限定'}`);
    if(q.type==='text') text.push('  __________________________________________________');
    text.push('');
  });
  return text.join('\n');
}
export function designDictionary(d: Questionnaire) {
  return { schema: "questionnaire-codebook/v1", classification: "proposed", title: d.title, objective: d.objective, population: d.population, geography: d.geography, period: d.period, recruitment: d.recruitment, pilotNotes: d.pilotNotes, variables: d.questions.map((q,i)=>({ order:i+1, questionId:q.id, variable:q.variable, text:q.text, type:q.type, required:q.required, purpose:q.purpose, researchQuestion:q.researchQuestion, construct:q.construct, analysis:q.analysis, decisionUse:q.decisionUse, source:q.source, choices:q.type==='single'||q.type==='multi'?q.choices:[], min:q.type==='number'||q.type==='likert'?q.min:null, max:q.type==='number'||q.type==='likert'?q.max:null, anchors:q.type==='likert'?[q.minLabel,q.maxLabel]:null, reverse:q.reverse, condition:q.condition, scoring:q.reverse?"min + max - raw value; only after explicit missing handling":null })), issues:questionnaireIssues(d), limitations:["Source fields are user statements, not independently verified citations.","Missing, refusal, don't know and not applicable must be distinguished in the data dictionary before analysis.","Not a validated scale or approved competition submission."] };
}

export function exampleQuestionnaire(): Questionnaire {
  const d = newQuestionnaire();
  d.title="校园服务体验 · 教学问卷草稿"; d.objective="了解使用环节的困难，为服务改进选择优先事项。"; d.population="拟调查本校在校学生；具体校区与纳入条件待补充。"; d.period="过去 30 天"; d.recruitment="尚未确定招募渠道与抽样方案，不声称代表全体学生。";
  d.introduction="【教学示例，发放前请改写】本调查拟了解校园服务使用体验。参与自愿，可跳过不愿回答的问题或随时退出。预计时长、数据用途、保存期限及咨询渠道待研究团队补充。请勿填写姓名、学号和联系方式。";
  const a=newQuestion('demo-screen','USED'); a.text="过去 30 天，您是否使用过本项目所研究的校园服务？"; a.purpose='screening'; a.analysis='routing'; a.decisionUse='只向使用过服务的同学询问体验。'; a.choices=[{code:'1',label:'使用过'},{code:'0',label:'未使用过'}];
  const b=newQuestion('demo-experience','CLARITY'); b.text="回想过去 30 天最近一次使用，办理步骤对您来说有多清楚？"; b.type='likert'; b.construct='流程清晰度'; b.researchQuestion='服务流程的清晰程度如何？'; b.analysis='description'; b.decisionUse='识别流程说明的改进需求。'; b.source='自编教学题，尚未经认知访谈、预试或效度验证。'; b.minLabel='完全不清楚'; b.maxLabel='非常清楚'; b.condition={questionId:a.id,codes:['1']};
  const c=newQuestion('demo-open','SUGGESTION'); c.text='若愿意，请描述您最近一次办理时遇到的一个具体困难。'; c.type='text'; c.researchQuestion='哪些环节存在具体阻碍？'; c.analysis='coding'; c.decisionUse='形成待核实的改进线索，不把单条意见当作总体结论。'; c.condition={questionId:a.id,codes:['1']};
  d.questions=[a,b,c]; return d;
}
