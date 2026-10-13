import { parseReportSlideLink, type ReportSlideLink } from './report-storyboard.ts';
import { parseReportFormatSettings, type ReportFormatSettings } from './report-format.ts';
export type ReportSection = { id: string; title: string; body: string; source: string };
export type SlideLayout = "cover" | "content" | "two-column";
export type Slide = { id: string; title: string; body: string; aside: string; notes: string; layout: SlideLayout; reportLink?: ReportSlideLink };
export type LatexReport = { version: 1; body: string; reportHash: string };
export type EditorContent = {
  version: 1;
  title: string;
  subtitle: string;
  report: ReportSection[];
  slides: Slide[];
  accent: "teal" | "blue" | "burgundy";
  reportFormat?: ReportFormatSettings;
  latex?: LatexReport;
};
export type DraftSummary = { id: string; title: string; revision: number; updatedAt: string };
export type Draft = DraftSummary & { content: EditorContent };
export type DraftVersionSummary = { id: string; draftId: string; label: string; sourceRevision: number; createdAt: string };
export type DraftVersion = DraftVersionSummary & { content: EditorContent };
export const DRAFT_VERSION_LIMIT = 20;

export function parseVersionLabel(value: unknown): string {
  if (typeof value !== "string" || value.length > 80 || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("版本名称需为 1–80 字的单行文本。");
  }
  return value.trim();
}
export const ACCENTS = { teal: "0F766E", blue: "234E80", burgundy: "8A3449" } as const;
export const EDITOR_LIMITS = { sections: 40, slides: 40, body: 12000, slideBody: 1800, latexBody: 120000, bytes: 500000 } as const;

export function createEditorContent(): EditorContent {
  const sections = [
    ["摘要", "【摘要写作提示】\n概括研究问题、调查方式、核心发现与行动建议。"],
    ["一、研究背景与问题", "1. 现实问题：谁在什么情境下遇到什么困难？\n2. 研究对象：明确地域、人群、时间与纳入条件。\n3. 决策目标：这份调查将帮助谁做什么决定？"],
    ["二、调查方案与问卷", "先写研究问题，再列变量和分析计划，最后设计题项。\n筛选题 → 行为与经历 → 态度量表 → 基本信息。\n量表注明来源与改编依据；通过访谈和预测试检查措辞、跳题和作答时间。"],
    ["三、数据质量与分析", "记录实际回收量、有效量、剔除规则与缺失处理，不补造数据。\n信度关注一致性，效度关注是否测到了目标概念；阈值不能代替研究设计。\n从描述统计开始，根据变量类型与假设选择差异检验、回归或聚类，并报告适用条件与局限。"],
    ["四、发现与行动建议", "每项建议对应一条发现与来源：\n发现是什么 → 证据在哪里 → 谁来执行 → 具体动作 → 如何评估。\n把相关关系与因果判断分开，说明样本外推的边界。"],
    ["参考文献与附录", "列出实际使用的文献、问卷、访谈提纲和数据处理说明。\n提交前按当届、组别、赛区与阶段规则检查匿名、页数、格式和 AI 使用披露。"],
  ];
  return {
    version: 1, title: "我的市场调查研究", subtitle: "研究报告 · 写作草稿", accent: "teal",
    report: sections.map(([title, body], i) => ({ id: `section-${i + 1}`, title, body, source: "" })),
    slides: [
      { id: "slide-1", title: "我的市场调查研究", body: "从真实问题到可执行的建议", aside: "", notes: "先介绍研究对象和核心问题。", layout: "cover" },
      { id: "slide-2", title: "我们想解决什么问题？", body: "研究对象与边界\n决策主体与实际困难\n本次调查要回答的问题", aside: "填写实际研究背景与来源。", notes: "用一个具体问题进入研究，不要堆积背景。", layout: "two-column" },
      { id: "slide-3", title: "证据如何支持行动", body: "调查设计与质量检查\n关键发现与证据\n建议、执行主体与评估指标", aside: "", notes: "解释方法为什么适合问题，并说明结论边界。", layout: "content" },
    ],
  };
}

/** Strict, shared parser: no HTML, URLs, executable content or silently discarded fields. */
export function parseEditorContent(value: unknown): EditorContent {
  function object(v: unknown, keys: string[]): Record<string, unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) throw new Error("草稿结构不受支持。");
    return v as Record<string, unknown>;
  }
  function str(v: unknown, max: number, min = 0): string {
    if (typeof v !== "string" || v.length > max || v.trim().length < min || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)) throw new Error(`文本长度或字符不符合要求（上限 ${max} 字）。`);
    return v;
  }
  function entries<T>(v: unknown, limit: number, parse: (x: unknown) => T & { id: string }): T[] {
    if (!Array.isArray(v) || v.length < 1 || v.length > limit) throw new Error(`至少保留 1 项，最多 ${limit} 项。`);
    const result = v.map(parse);
    if (new Set(result.map(x => x.id)).size !== result.length) throw new Error("内容标识重复。");
    return result;
  }
  const x = object(value, ["version", "title", "subtitle", "accent", "report", "slides", "reportFormat", "latex"]);
  if (x.version !== 1 || !["teal", "blue", "burgundy"].includes(x.accent as string)) throw new Error("草稿版本或主题不受支持。");
  let latex: LatexReport | undefined;
  if (Object.hasOwn(x, 'latex')) {
    const draft = object(x.latex, ['version', 'body', 'reportHash']);
    if (draft.version !== 1 || typeof draft.reportHash !== 'string' || !/^[a-f0-9]{64}$/.test(draft.reportHash)) throw Error('LaTeX 草稿版本或报告指纹无效。');
    latex = { version: 1, body: str(draft.body, EDITOR_LIMITS.latexBody), reportHash: draft.reportHash };
  }
  const parsed: EditorContent = {
    version: 1, title: str(x.title, 120, 1), subtitle: str(x.subtitle, 240), accent: x.accent as EditorContent["accent"],
    ...(Object.hasOwn(x, 'reportFormat') ? { reportFormat: parseReportFormatSettings(x.reportFormat) } : {}),
    ...(latex ? { latex } : {}),
    report: entries(x.report, EDITOR_LIMITS.sections, v => {
      const s = object(v, ["id", "title", "body", "source"]);
      return { id: str(s.id, 80, 1), title: str(s.title, 150), body: str(s.body, EDITOR_LIMITS.body), source: str(s.source, 1500) };
    }),
    slides: entries(x.slides, EDITOR_LIMITS.slides, v => {
      const s = object(v, ["id", "title", "body", "aside", "notes", "layout", "reportLink"]);
      if (!["cover", "content", "two-column"].includes(s.layout as string)) throw new Error("幻灯片版式不受支持。");
      return { id: str(s.id, 80, 1), title: str(s.title, 150), body: str(s.body, EDITOR_LIMITS.slideBody), aside: str(s.aside, EDITOR_LIMITS.slideBody), notes: str(s.notes, 6000), layout: s.layout as SlideLayout, ...(Object.hasOwn(s,'reportLink')?{reportLink:parseReportSlideLink(s.reportLink)}:{}) };
    }),
  };
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > EDITOR_LIMITS.bytes) throw new Error("草稿超过 500 KB，请拆分作品。");
  return parsed;
}

export function reportToSlides(content: EditorContent): Slide[] {
  if (content.report.length > 39) throw new Error("请先将报告合并到 39 章以内，另留 1 页封面。");
  if(content.report.some(s=>s.body.length>650||s.source.length>700))throw new Error('长章节请使用报告分镜，手动选择证据与边界；不再截断正文或来源。');
  return [{ id: crypto.randomUUID(), title: content.title, body: content.subtitle, aside: "", notes: "", layout: "cover" },
    ...content.report.map(section => ({ id: crypto.randomUUID(), title: section.title, body: section.body, aside: section.source, notes: section.body, layout: section.source ? "two-column" as const : "content" as const }))];
}
