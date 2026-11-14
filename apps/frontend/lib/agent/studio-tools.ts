/**
 * Pure domain logic shared across Agent left-sidebar studios:
 * 1. Smart Cross-Reference matcher & injector (`CrossRefStudio`)
 * 2. Q/A report index, crimson hit extractor & Defense script `.md`/`.docx` exporter (`QaDefenseStudio`)
 * 3. Streamlined Questionnaire generator (`QuickSurveyStudio`)
 * 4. Image Workshop procedural SVG generator & SaaS metering specs (`ImageWorkshopStudio`)
 * 5. IP Strategy & 6-member Team Liaison roster constants (`TeamLiaisonStudio`)
 */
import MiniSearch from 'minisearch';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { EditorContent, ReportSection } from '../editor-model.ts';
import { newQuestion, newQuestionnaire, parseQuestionnaire, type DesignQuestion, type Questionnaire } from '../questionnaire.ts';
import { emptyReference, type ReferenceEntry } from '../references.ts';
import { parseEditorContent } from '../editor-model.ts';

export const MAX_TEAM_MEMBERS = 6;

/* ───────── 1. Smart Cross-Reference Matcher ───────── */

export interface LiteratureCandidate {
  id: string;
  title: string;
  authors: string;
  year: string;
  journal?: string;
  keywords?: string[];
  claim?: string;
  url?: string;
}

export interface CrossRefMatch {
  sectionId: string;
  sectionTitle: string;
  paragraphIndex: number;
  snippet: string;
  score: number;
  matchedTerms: string[];
}

function tokenizeChineseAndLatin(text: string): string[] {
  const out = new Set<string>();
  const normalized = text.toLowerCase();
  for (const latin of normalized.match(/[a-z0-9]{2,}/g) ?? []) {
    out.add(latin);
  }
  const cjkRuns = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length <= 6) out.add(run);
    for (let i = 0; i <= run.length - 2; i++) {
      out.add(run.slice(i, i + 2));
      if (i <= run.length - 3) out.add(run.slice(i, i + 3));
    }
  }
  return [...out];
}

export function matchCrossReferences(
  report: readonly ReportSection[],
  candidate: LiteratureCandidate,
  limit = 5,
): CrossRefMatch[] {
  const queryText = [
    candidate.title,
    candidate.claim ?? '',
    ...(candidate.keywords ?? []),
  ].join(' ');
  const queryTokens = new Set(tokenizeChineseAndLatin(queryText));
  if (!queryTokens.size) return [];

  const matches: CrossRefMatch[] = [];
  for (const sec of report) {
    if (/^(?:封面|目录|参考文献|附录)/u.test(sec.title.trim())) continue;
    const paras = sec.body.split(/\n+/).map(s => s.trim()).filter(s => s.length >= 12);
    paras.forEach((para, idx) => {
      const pTokens = new Set(tokenizeChineseAndLatin(para));
      const overlap = [...queryTokens].filter(t => pTokens.has(t));
      const longestBoost = overlap.filter(t => t.length >= 3).length * 0.8;
      const introBoost = /文献|背景|理论|框架|机制|满意|回归|模型/u.test(sec.title) ? 0.45 : 0;
      const rawScore = overlap.length + longestBoost + introBoost;
      if (overlap.length >= 1 && rawScore > 0.8) {
        const score = Math.min(0.99, Number((rawScore / Math.max(4, queryTokens.size * 0.45)).toFixed(2)));
        matches.push({
          sectionId: sec.id,
          sectionTitle: sec.title,
          paragraphIndex: idx,
          snippet: para.length > 96 ? `${para.slice(0, 96)}…` : para,
          score,
          matchedTerms: [...new Set(overlap)].sort((a, b) => b.length - a.length).slice(0, 5),
        });
      }
    });
  }

  // Fallback to intro/literature section if corpus is short or newly created.
  if (!matches.length) {
    const preferred = report.find(s => /文献|背景|绪论/u.test(s.title)) ?? report.find(s => !/^(?:封面|目录|参考文献|附录)/u.test(s.title));
    if (preferred) {
      matches.push({
        sectionId: preferred.id,
        sectionTitle: preferred.title,
        paragraphIndex: 0,
        snippet: preferred.body.slice(0, 90) || '建议插入文献综述与理论支撑开篇处。',
        score: 0.42,
        matchedTerms: (candidate.keywords ?? []).slice(0, 3),
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function applyCrossReferenceToContent(
  content: EditorContent,
  candidate: LiteratureCandidate,
  target: Pick<CrossRefMatch, 'sectionId' | 'paragraphIndex'>,
): { content: EditorContent; citeNumber: number; refId: string } {
  const existingRefs = content.references ?? [];
  let refIndex = existingRefs.findIndex(r => r.title.trim() === candidate.title.trim());
  const nextRefs: ReferenceEntry[] = [...existingRefs];
  let refId: string;

  if (refIndex >= 0) {
    refId = existingRefs[refIndex].id;
  } else {
    refId = `ref-${crypto.randomUUID().slice(0, 8)}`;
    const authors = candidate.authors
      .split(/[,，、;；]+/u)
      .map(s => s.trim())
      .filter(Boolean);
    nextRefs.push({
      ...emptyReference('J'),
      id: refId,
      authors: authors.length ? authors : ['佚名'],
      title: candidate.title.trim(),
      source: candidate.journal?.trim() || '待补充期刊来源',
      year: candidate.year.trim() || String(new Date().getFullYear()),
      url: candidate.url?.trim() ?? '',
      verification: candidate.url?.trim() ? 'verified' : 'metadata_only',
    });
    refIndex = nextRefs.length - 1;
  }

  const citeNumber = refIndex + 1;
  const citeTag = `[[引:${refId}]]`;
  const nextReport = content.report.map(sec => {
    if (sec.id !== target.sectionId) return sec;
    const paras = sec.body.split('\n');
    const safeIdx = Math.max(0, Math.min(paras.length - 1, target.paragraphIndex));
    const current = paras[safeIdx] ?? '';
    if (current.includes(citeTag)) return sec;
    const updatedPara = current.trim()
      ? current.replace(/([。！？；.])$/, `${citeTag}$1`) === current
        ? `${current.trim()}${citeTag}。`
        : current.replace(/([。！？；.])$/, `${citeTag}$1`)
      : `${candidate.claim || candidate.title}${citeTag}。`;
    paras[safeIdx] = updatedPara;
    return { ...sec, body: paras.join('\n') };
  });

  const parsed = parseEditorContent({
    ...content,
    references: nextRefs,
    report: nextReport,
  });
  return { content: parsed, citeNumber, refId };
}

/* ───────── 2. Q/A & Defense Engine (MiniSearch + Ask + .md/.docx) ───────── */

export interface QaSearchHit {
  id: string;
  sectionId: string;
  sectionTitle: string;
  paragraphIndex: number;
  text: string;
  score: number;
  matchedTerms: string[];
}

export interface QaDefenseItem {
  id: string;
  question: string;
  sourceMode: 'report_hit' | 'external_fallback';
  hits: QaSearchHit[];
  highlightTerms: string[];
  answerDraft: string;
  followUpTip: string;
  createdAt: string;
}

type IndexedChunk = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  paragraphIndex: number;
  text: string;
  ngram: string;
};

const QA_STOP_TOKENS = new Set([
  '你们', '我们', '如何', '是否', '为什么', '什么', '怎么', '怎样', '哪些', '哪里',
  '具有', '进行', '可以', '部分', '问题', '当前', '出来', '没有', '为何', '多少',
  '因为', '所以', '因此', '如果', '这个', '那个', '一种', '一些', '本是',
]);

export function searchReportForQa(content: EditorContent, question: string, limit = 5): {
  hits: QaSearchHit[];
  highlightTerms: string[];
} {
  const docs: IndexedChunk[] = [];
  for (const sec of content.report) {
    if (/^(?:封面|目录)/u.test(sec.title.trim())) continue;
    const parts = sec.body.split(/\n+/).map(s => s.trim()).filter(Boolean);
    parts.forEach((text, idx) => {
      docs.push({
        id: `${sec.id}::${idx}`,
        sectionId: sec.id,
        sectionTitle: sec.title,
        paragraphIndex: idx,
        text,
        ngram: tokenizeChineseAndLatin(text).join(' '),
      });
    });
  }
  const rawTokens = tokenizeChineseAndLatin(question);
  const meaningfulTokens = rawTokens.filter(t => !QA_STOP_TOKENS.has(t));
  const queryTokens = meaningfulTokens.length ? meaningfulTokens : rawTokens;
  if (!docs.length || !queryTokens.length) return { hits: [], highlightTerms: [] };

  const mini = new MiniSearch<IndexedChunk>({
    fields: ['sectionTitle', 'ngram', 'text'],
    storeFields: ['sectionId', 'sectionTitle', 'paragraphIndex', 'text'],
    searchOptions: { boost: { sectionTitle: 1.8, text: 1.2 }, prefix: true, fuzzy: 0.15 },
  });
  mini.addAll(docs);

  const rawHits = mini.search(queryTokens.join(' '), { combineWith: 'OR' });
  const hits: QaSearchHit[] = [];
  const termFreq = new Map<string, number>();

  for (const item of rawHits.slice(0, limit * 2)) {
    const text = String(item.text);
    const matched = queryTokens.filter(t => text.toLowerCase().includes(t)).sort((a, b) => b.length - a.length);
    if (!matched.length && item.score < 0.8) continue;
    for (const term of matched.slice(0, 6)) {
      termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    }
    hits.push({
      id: String(item.id),
      sectionId: String(item.sectionId),
      sectionTitle: String(item.sectionTitle),
      paragraphIndex: Number(item.paragraphIndex),
      text,
      score: Number(item.score.toFixed(2)),
      matchedTerms: matched.slice(0, 5),
    });
  }

  const finalHits = hits.slice(0, limit);
  const highlightTerms = [...termFreq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([t]) => t)
    .filter(t => t.length >= 2)
    .slice(0, 10);

  return { hits: finalHits, highlightTerms };
}

export function buildDefenseScriptMarkdown(
  reportTitle: string,
  items: readonly QaDefenseItem[],
): string {
  const lines = [
    `# ${reportTitle || '调研报告'} · 竞赛答辩问答（Q/A）问辩稿`,
    '',
    `> 生成时间：${new Date().toLocaleString('zh-CN')} · 共整理 ${items.length} 道答辩预案题`,
    '',
  ];
  items.forEach((item, index) => {
    lines.push(`## Q${index + 1}. ${item.question}`);
    lines.push(`- **依据来源**：${item.sourceMode === 'report_hit' ? `已定位当前报告原文（${item.hits.map(h => h.sectionTitle).slice(0, 3).join('、')}）` : '报告未直接覆盖 · 已结合外部学术知识框架补充回应'}`);
    if (item.hits.length) {
      lines.push(`- **报告原文高亮摘录**：`);
      item.hits.slice(0, 2).forEach(h => {
        lines.push(`  - [${h.sectionTitle}] “${h.text.slice(0, 140)}${h.text.length > 140 ? '…' : ''}”`);
      });
    }
    lines.push('');
    lines.push(`**【推荐现场回答口径】**`);
    lines.push(item.answerDraft);
    lines.push('');
    lines.push(`**【评委二次追问预判与防线】**`);
    lines.push(item.followUpTip);
    lines.push('');
  });
  return lines.join('\n');
}

export async function buildDefenseScriptDocx(
  reportTitle: string,
  items: readonly QaDefenseItem[],
): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      text: `${reportTitle || '调研报告'} · 竞赛答辩问答（Q/A）问辩稿`,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `生成时间：${new Date().toLocaleString('zh-CN')} · 共 ${items.length} 道高频答辩预案`, color: '475569', size: 20 }),
      ],
    }),
  ];

  items.forEach((item, idx) => {
    children.push(
      new Paragraph({ text: `Q${idx + 1}. ${item.question}`, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun({ text: '依据来源：', bold: true }),
          new TextRun({
            text: item.sourceMode === 'report_hit'
              ? `已关联报告原文（${item.hits.map(h => h.sectionTitle).join('、')}）`
              : '报告暂未详述（采用通用科研方法与外部资料补充应答）',
          }),
        ],
      }),
    );
    if (item.hits.length) {
      for (const hit of item.hits.slice(0, 2)) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `【原文定位 · ${hit.sectionTitle}】`, bold: true, color: 'B91C1C' }),
              new TextRun({ text: hit.text }),
            ],
          }),
        );
      }
    }
    children.push(
      new Paragraph({
        children: [new TextRun({ text: '推荐现场回答口径：', bold: true }), new TextRun({ text: item.answerDraft })],
      }),
      new Paragraph({
        children: [new TextRun({ text: '追问防线提示：', bold: true }), new TextRun({ text: item.followUpTip })],
      }),
    );
  });

  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toArrayBuffer(doc);
  return new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ───────── 3. Simplified Quick Questionnaire Workshop ───────── */

export function buildQuickQuestionnaire(params: {
  title: string;
  objective: string;
  population: string;
  groupQuestion: string;
  groupChoices: string[];
  dimensions: string[];
  includeAttentionCheck?: boolean;
}): Questionnaire {
  const base = newQuestionnaire();
  const questions: DesignQuestion[] = [];

  questions.push({
    ...newQuestion('quick-q1', 'Q1'),
    text: params.groupQuestion.trim() || '您目前所属的主要群体类别是？',
    type: 'single',
    required: true,
    source: 'Agent 极简问卷坊生成',
    choices: (params.groupChoices.length >= 2 ? params.groupChoices : ['高频体验者', '低频/潜在体验者']).map((label, idx) => ({
      code: String(idx + 1),
      label: label.trim() || `选项${idx + 1}`,
    })),
    min: null,
    max: null,
    purpose: 'background',
    analysis: 'comparison',
    researchQuestion: '不同受访群体在核心态度与行为特征上是否存在显著差异？',
    construct: '受访者分组特征',
    decisionUse: '用于分层抽样配额控制与异质性对照分析',
  });

  const dims = (params.dimensions.length ? params.dimensions : ['服务效率', '环境体验', '价格透明度']).slice(0, 8);
  dims.forEach((dim, i) => {
    const cleanDim = dim.trim() || `核心维度 ${i + 1}`;
    questions.push({
      ...newQuestion(`quick-q${i + 2}`, `Q${i + 2}`),
      text: `请评价您对「${cleanDim}」的实际体验满意度（1=非常不满意，5=非常满意）：`,
      type: 'likert',
      required: true,
      source: 'Agent 极简问卷坊生成',
      choices: [],
      min: 1,
      max: 5,
      minLabel: '非常不满意',
      maxLabel: '非常满意',
      purpose: 'research',
      analysis: 'measurement',
      researchQuestion: `${cleanDim}对整体满意度与持续意愿的边际驱动强度如何？`,
      construct: cleanDim,
      decisionUse: '进入信效度检验、回归与 IPA 优先改进矩阵',
    });
  });

  if (params.includeAttentionCheck !== false) {
    questions.push({
      ...newQuestion('quick-attn', `Q${questions.length + 1}`),
      text: '【质量甄别题】为确认认真作答，本题请固定选择一般中立选项（3 分）。',
      type: 'likert',
      required: true,
      source: 'Agent 极简问卷坊生成',
      choices: [],
      min: 1,
      max: 5,
      minLabel: '非常不同意',
      maxLabel: '非常同意',
      purpose: 'screening',
      analysis: 'routing',
      researchQuestion: '识别机械作答或随意勾选的低质量问卷',
      construct: '作答注意力质控',
      decisionUse: '剔除未通过注意力检验的无效答卷',
    });
  }

  const nextVarIdx = questions.length + 1;
  questions.push({
    ...newQuestion('quick-overall', `Q${nextVarIdx}`),
    text: '总体而言，您对本次调研对象的整体满意度评价如何？',
    type: 'likert',
    required: true,
    source: 'Agent 极简问卷坊生成',
    choices: [],
    min: 1,
    max: 5,
    minLabel: '非常不满意',
    maxLabel: '非常满意',
    purpose: 'research',
    analysis: 'association',
    researchQuestion: '受访者总体满意水平现状如何？',
    construct: '总体满意度',
    decisionUse: '作为回归模型与路径检验的核心因变量',
  });

  return parseQuestionnaire(JSON.stringify({
    ...base,
    title: params.title.trim() || '专题实证调查问卷',
    objective: params.objective.trim() || '探究各影响维度与受访者满意度及意愿的关系',
    population: params.population.trim() || '目标区域常住成年受访者',
    geography: '重点调研覆盖区县',
    period: '近六个月实际体验周期',
    recruitment: '分层配额抽样结合线上/线下问卷调查',
    introduction: '您好！本问卷仅用于学术调研统计分析，所有作答严格匿名保密。',
    pilotNotes: '建议先发放 30 份预试样本检验 Cronbach α 与题干清晰度。',
    questions,
  }));
}

/* ───────── 4. Visual Image Workshop & Metering Architecture ───────── */

export type StudioImagePreset = 'cover' | 'frame' | 'mascot' | 'avatar' | 'illustration';

export interface ImagePricingPlan {
  id: string;
  name: string;
  billing: string;
  quota: string;
  features: string[];
}

export const IMAGE_PRICING_PLANS: readonly ImagePricingPlan[] = [
  {
    id: 'free-sandbox',
    name: '科研体验版（当前本地矢量引擎）',
    billing: '免费 / 零外部 API 扣费',
    quota: '无限次矢量封面、框饰、徽章与 Q 版头像合成',
    features: ['纯本地 SVG 无损渲染', '一键套用 Word / LaTeX / 报告主题色', '零 API Key 泄露风险'],
  },
  {
    id: 'pay-per-gen',
    name: '按次生图点数包（商业化接入规划）',
    billing: '¥0.20 / 次（4K 科研封面/写实配图）',
    quota: '按实际后端回执 Usage 扣减，超时未落账不扣费',
    features: ['接入多模态生图 API 网关', '支持提示词增强与参考图重绘', '自动留存高清 PNG 与水印版'],
  },
  {
    id: 'pro-subscription',
    name: '竞赛团队订阅版（后期会员体系）',
    billing: '¥39 / 月 或 ¥128 / 赛季（6 人团队共享）',
    quota: '每月 200 次高清生图 + 全套国奖排版特权 + 问辩库',
    features: ['6 人协作席位与实时在线房间', '团队共享素材资产库与自定义 IP 徽章', '优先高速渲染通道'],
  },
];

export const IP_STRATEGY_BLUEPRINT = {
  brandName: '证见 · EVI-X（Evidence + X）',
  coreArchetype: '双视觉图腾体系：「棱镜罗盘」×「獬豸九门方印」',
  mascotPersona: '「见见（X-Scout）」与「守印官（Xiejian）」：前者化身赛博学术领航员，对应文献探索与词云挖掘；后者守卫数据真实性红线与计算指纹（杜绝编造数字）。',
  stagesToIpMapping: [
    '问题破局期：触发「棱镜罗盘」矢量微标，寓意从繁杂舆论中折射真问题；',
    '打字机拟稿期：Anatomy 机械工作站模拟老式铅字打字机实时击键，赋予调研人“主编监制”的仪式感；',
    '核验/答辩期：獬豸守印官盖下 SHA-256 证据防伪印鉴，形成比赛评委最信任的“零造假、全可溯源”差异化心智。',
  ],
  monetizationHooks: [
    '数字周边：队员专属 6 款可交互「证见勋章」动态头像框、答辩 PPT 专属水印角标；',
    '线下转化：决赛答辩定制手卡/海报视觉套件一键打包输出。',
  ],
} as const;

export function generateProceduralStudioSvg(params: {
  preset: StudioImagePreset;
  prompt: string;
  accentHex?: string;
  seedLabel?: string;
}): string {
  const accent = /^#[0-9A-Fa-f]{6}$/.test(params.accentHex ?? '') ? params.accentHex!.toUpperCase() : '#0F766E';
  const title = (params.prompt.trim() || '证见 EVI-X 科研视觉资产').slice(0, 26).replace(/[<>&"]/g, '');
  const sub = (params.seedLabel || 'EVI-X STUDIO · VECTOR ASSET').slice(0, 32).replace(/[<>&"]/g, '');

  if (params.preset === 'avatar') {
    const hash = [...title].reduce((a, c) => (a * 33 + c.charCodeAt(0)) % 360, 17);
    const bg1 = `hsl(${hash}, 62%, 92%)`;
    const fg = accent;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="120" fill="${bg1}" stroke="${fg}" stroke-width="6"/>
      <circle cx="120" cy="96" r="42" fill="${fg}" fill-opacity="0.16" stroke="${fg}" stroke-width="3.5"/>
      <circle cx="105" cy="92" r="5" fill="#1E293B"/>
      <circle cx="135" cy="92" r="5" fill="#1E293B"/>
      <path d="M107 108 Q120 118 133 108" fill="none" stroke="${fg}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M58 205 C64 156, 176 156, 182 205" fill="${fg}" fill-opacity="0.22" stroke="${fg}" stroke-width="3.5"/>
      <text x="120" y="223" text-anchor="middle" fill="#0F172A" style="font-size:13px;font-family:'Microsoft YaHei',sans-serif;font-weight:700">${title.slice(0, 8)}</text>
    </svg>`;
  }

  if (params.preset === 'mascot') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="320" viewBox="0 0 420 320">
      <rect width="420" height="320" rx="18" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
      <circle cx="210" cy="145" r="96" fill="${accent}" fill-opacity="0.08" stroke="${accent}" stroke-width="1.5" stroke-dasharray="6 4"/>
      <polygon points="210,56 266,145 210,234 154,145" fill="#FFFFFF" stroke="${accent}" stroke-width="4"/>
      <polygon points="210,78 248,145 210,212 172,145" fill="${accent}" fill-opacity="0.18"/>
      <circle cx="210" cy="145" r="14" fill="${accent}"/>
      <rect x="76" y="256" width="268" height="34" rx="17" fill="#0F172A"/>
      <text x="210" y="278" text-anchor="middle" fill="#FFFFFF" style="font-size:13px;font-family:'Microsoft YaHei',sans-serif;font-weight:700">${title}</text>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" rx="16" fill="#FCFAF5" stroke="${accent}" stroke-width="2"/>
    <rect x="18" y="18" width="564" height="364" rx="10" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="5 5"/>
    <circle cx="480" cy="105" r="78" fill="${accent}" fill-opacity="0.08"/>
    <rect x="44" y="54" width="84" height="6" rx="3" fill="${accent}"/>
    <text x="44" y="112" fill="#0F172A" style="font-size:24px;font-family:'Microsoft YaHei',sans-serif;font-weight:700">${title}</text>
    <text x="44" y="146" fill="#475569" style="font-size:13px;font-family:'Microsoft YaHei',sans-serif">${sub}</text>
    <path d="M44 290 C150 220, 260 330, 390 245 S520 275, 556 210" fill="none" stroke="${accent}" stroke-width="3"/>
    <circle cx="150" cy="255" r="6" fill="${accent}"/>
    <circle cx="325" cy="285" r="6" fill="#B88A44"/>
    <circle cx="495" cy="240" r="6" fill="${accent}"/>
    <text x="44" y="346" fill="#64748B" style="font-size:11.5px;font-family:'Microsoft YaHei',sans-serif">EVI-X 生图工坊 · 支持一键转存资产库或绑定正式商业生图网关</text>
  </svg>`;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
