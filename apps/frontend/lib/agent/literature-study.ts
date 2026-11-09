export type StudyPaper = {
  id: string;
  title: string;
  filename: string;
  pageCount: number;
  pages: Array<{ page: number; text: string }>;
};

const KINDS = ['question', 'method', 'result', 'limitation'] as const;
type EvidenceKind = typeof KINDS[number];

export type StudyEvidence = {
  id: string;
  paperId: string;
  page: number;
  kind: EvidenceKind;
  quote: string;
};

const DOMAINS = ['general', 'social', 'computing', 'business'] as const;
export type StudyDomain = typeof DOMAINS[number];

export type LiteratureStudy = {
  papers: StudyPaper[];
  evidence: StudyEvidence[];
  domain: StudyDomain;
  executedFor?: string;
};

export const LITERATURE_STUDY_LIMITS = {
  papers: 6,
  pagesPerPaper: 50,
  pageChars: 8_000,
  evidence: 40,
  quoteChars: 1_500,
  titleChars: 260,
  filenameChars: 260,
  directionChars: 1_200,
  bytes: 700 * 1024,
} as const;

type EvidenceRow = { paper: StudyPaper; cells: Record<EvidenceKind, StudyEvidence[]> };
type TopicCandidate = {
  id: string;
  title: string;
  question: string;
  design: string;
  evidenceIds: string[];
  caveat: string;
};
type StudyStage = {
  id: 'lead' | 'reader' | 'analyst' | 'writer' | 'reviewer';
  status: 'done' | 'blocked' | 'waiting';
  summary: string;
  artifactIds: string[];
};
type StudyResult = { rows: EvidenceRow[]; candidates: TopicCandidate[]; issues: string[]; stages: StudyStage[] };

const LIMITS = LITERATURE_STUDY_LIMITS;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const LABELS: Record<EvidenceKind, string> = { question: '研究问题', method: '方法', result: '结果', limitation: '局限' };

export function emptyLiteratureStudy(): LiteratureStudy {
  return { papers: [], evidence: [], domain: 'general' };
}

function invalid(message: string): never {
  throw new Error(`文献研读：${message}`);
}

function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) invalid('对象格式无效。');
  const fields = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(fields)) {
    if (typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))
      || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')) invalid('包含未知字段或访问器。');
  }
  if (required.some(key => !Object.hasOwn(fields, key))) invalid('缺少必要字段。');
  return value as Record<string, unknown>;
}

function array<T>(value: unknown, max: number, parse: (entry: unknown) => T): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max
    || Reflect.ownKeys(value).length !== value.length + 1) invalid('列表格式无效或超过条数限制。');
  return Array.from({ length: value.length }, (_, index) => {
    const field = Object.getOwnPropertyDescriptor(value, index);
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) invalid('列表包含空项或访问器。');
    return parse(field.value);
  });
}

function text(value: unknown, max: number, allowBlank = false): string {
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value) || (!allowBlank && !value.trim())) {
    invalid('文本为空、格式无效或超长。');
  }
  return value;
}

function pageNumber(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) invalid('物理页码无效。');
  return value;
}

function member<T extends string>(value: unknown, choices: readonly T[]): T {
  const found = choices.find(choice => choice === value);
  if (!found) invalid('领域或证据类别无效。');
  return found;
}

// PDF line breaks and spacing can vary. Preserve wording, punctuation and case.
function normalized(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function paper(value: unknown): StudyPaper {
  const fields = record(value, ['id', 'title', 'filename', 'pageCount', 'pages']);
  const id = text(fields.id, 64);
  if (!SHA256.test(id)) invalid('PDF 指纹格式无效。');
  const pageCount = pageNumber(fields.pageCount);
  const seen = new Set<number>();
  const pages = array(fields.pages, LIMITS.pagesPerPaper, value => {
    const entry = record(value, ['page', 'text']);
    const page = pageNumber(entry.page, pageCount);
    if (seen.has(page)) invalid('同一 PDF 的物理页码重复。');
    seen.add(page);
    return { page, text: text(entry.text, LIMITS.pageChars, true) };
  });
  return {
    id, pageCount, pages,
    title: text(fields.title, LIMITS.titleChars),
    filename: text(fields.filename, LIMITS.filenameChars),
  };
}

export function parseLiteratureStudy(value: unknown): LiteratureStudy {
  const fields = record(value, ['papers', 'evidence', 'domain'], ['executedFor']);
  const papers = array(fields.papers, LIMITS.papers, paper);
  const byPaper = new Map(papers.map(source => [source.id, new Map(source.pages.map(entry => [entry.page, normalized(entry.text)]))]));
  if (byPaper.size !== papers.length) invalid('同一 PDF 指纹重复。');

  const seenIds = new Set<string>();
  const seenQuotes = new Set<string>();
  const evidence = array(fields.evidence, LIMITS.evidence, value => {
    const fields = record(value, ['id', 'paperId', 'page', 'kind', 'quote']);
    const id = text(fields.id, 160);
    const paperId = text(fields.paperId, 64);
    const page = pageNumber(fields.page);
    const kind = member(fields.kind, KINDS);
    const quote = text(fields.quote, LIMITS.quoteChars);
    const snippet = normalized(quote);
    const source = byPaper.get(paperId)?.get(page);
    if (!source?.includes(snippet)) invalid('摘录未在对应 PDF 的已提取物理页中找到。');
    const quoteKey = JSON.stringify([paperId, snippet]);
    if (seenIds.has(id) || seenQuotes.has(quoteKey)) invalid('证据标识或同一论文的摘录重复。');
    seenIds.add(id);
    seenQuotes.add(quoteKey);
    return { id, paperId, page, kind, quote };
  });
  const parsed: LiteratureStudy = { papers, evidence, domain: member(fields.domain, DOMAINS) };
  if (Object.hasOwn(fields, 'executedFor')) parsed.executedFor = text(fields.executedFor, LIMITS.directionChars, true);
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > LIMITS.bytes) invalid('超过 700 KiB 文献研读存储上限。');
  return parsed;
}

const HEADINGS: Record<EvidenceKind, string> = {
  question: 'research questions?|objectives?|研究问题|研究目的|研究目标|目的',
  method: 'materials and methods?|research methods?|methodology|methods?|study design|材料与方法|研究方法|研究设计|方法',
  result: 'main findings|findings|results?|主要发现|研究发现|研究结果|主要结论|结果',
  limitation: 'study limitations?|limitations?|局限性|研究局限性?|研究不足|局限',
};
const headings = Object.values(HEADINGS).join('|');
const otherSections = 'abstract|introduction|background|discussion|conclusions?|references|摘要|引言|背景|讨论|结论|参考文献';
const SECTION = new RegExp(
  `(?:^|(?<=[。！？!?])|(?<=\\.)[ \\t]+)[ \\t]*(?:\\d+(?:\\.\\d+)*[.)、]?[ \\t]+)?(${headings}|${otherSections})[ \\t]*(?:[：:]|\\.(?=\\s)|$)[ \\t]*`,
  'gimu',
);
const HEADING_ONLY = new RegExp(`^(?:${headings})[：:.。]?$`, 'iu');

function hasSubstance(quote: string): boolean {
  return (quote.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 4 && !HEADING_ONLY.test(normalized(quote));
}

function firstPassage(value: string): string {
  const passage = value.trim().split(/\r?\n\s*\r?\n/u, 1)[0];
  return Array.from(passage).slice(0, 420).join('').trimEnd();
}

export function suggestLiteratureEvidence(source: StudyPaper): Array<Omit<StudyEvidence, 'id' | 'paperId'>> {
  const suggestions = new Map<EvidenceKind, Omit<StudyEvidence, 'id' | 'paperId'>>();
  for (const entry of source.pages) {
    const matches = [...entry.text.matchAll(SECTION)];
    matches.forEach((match, index) => {
      const kind = KINDS.find(kind => new RegExp(`^(?:${HEADINGS[kind]})$`, 'iu').test(match[1]));
      if (!kind || suggestions.has(kind)) return;
      const quote = firstPassage(entry.text.slice(match.index + match[0].length, matches[index + 1]?.index));
      if (hasSubstance(quote)) suggestions.set(kind, { page: entry.page, kind, quote });
    });
  }
  return [...suggestions.values()];
}

const DESIGN_CONTROL: Record<StudyDomain, string> = {
  general: '研究对象、观察时段和指标口径',
  social: '招募条件、量表及测量时点',
  computing: '数据划分、基线版本和指标实现',
  business: '业务场景、观察窗口及指标分母',
};

function shortLabel(value: string, max: number): string {
  const chars = Array.from(normalized(value));
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : chars.join('');
}

function distinctEvidenceRows(rows: EvidenceRow[]): EvidenceRow[] {
  const distinct: EvidenceRow[] = [];
  const overlaps = (first: StudyEvidence[], second: StudyEvidence[]) =>
    first.some(entry => second.some(other => normalized(entry.quote) === normalized(other.quote)));
  for (const row of rows) {
    const repeated = distinct.some(other => overlaps(row.cells.method, other.cells.method)
      && overlaps(row.cells.result, other.cells.result));
    if (!repeated) distinct.push(row);
  }
  return distinct;
}

function propose(rows: EvidenceRow[], scope: string, domain: StudyDomain): TopicCandidate[] {
  const [primary, comparison] = rows;
  const method = primary.cells.method[0], result = primary.cells.result[0];
  const reference = comparison.cells.method[0], referenceResult = comparison.cells.result[0];
  const core = [method.id, result.id, reference.id, referenceResult.id];
  const title = shortLabel(scope, 64);
  const cite = (row: EvidenceRow, entry: StudyEvidence) => `《${shortLabel(row.paper.title, 52)}》第 ${entry.page} 页`;
  const excerpt = (entry: StudyEvidence) => `「${shortLabel(entry.quote, 88)}」`;
  const aMethod = cite(primary, method), aResult = cite(primary, result);
  const bMethod = cite(comparison, reference), bResult = cite(comparison, referenceResult);
  const controls = DESIGN_CONTROL[domain];
  const candidates: TopicCandidate[] = [
    {
      id: 'replicate',
      title: `${title}的原方法复核`,
      question: `在「${scope}」的范围内按原文指标重测，估计和不确定性是否与 ${aResult} 的结果 ${excerpt(result)} 相容？`,
      design: `复核 ${aMethod} 的方法摘录 ${excerpt(method)}，用 ${bMethod} 的方法摘录 ${excerpt(reference)} 检查可替代做法。登记复核样本、主要指标和判断标准，固定${controls}，再收集独立数据并报告偏离和估计区间。`,
      evidenceIds: core,
      caveat: '先核对研究对象与当前方向的适用性，再确认原方法可执行细节及原结果的不确定性。若信息不足，可先做可行性试测。',
    },
    {
      id: 'compare',
      title: `${title}的统一口径对照`,
      question: `在「${scope}」内，${aResult} 的 ${excerpt(result)} 与 ${bResult} 的 ${excerpt(referenceResult)} 能否对齐到同一指标？`,
      design: `用 ${aMethod} 的 ${excerpt(method)} 与 ${bMethod} 的 ${excerpt(reference)} 建立口径表，逐项核对${controls}并记录可转换的单位及纳排条件。若找到共同指标，在同一数据上执行两种方案并报告估计差值和不确定性。`,
      evidenceIds: core,
      caveat: '先核实两个文件是否对应独立研究，并核对研究对象与当前方向的关系。若没有共同指标，保留并列证据及不可比项。',
    },
  ];
  const limited = rows.find(row => row.cells.limitation.length > 0);
  if (limited) {
    const limitation = limited.cells.limitation[0];
    candidates.push({
      id: 'limits',
      title: `${title}的适用边界检验`,
      question: `在「${scope}」内，改变 ${cite(limited, limitation)} 的局限摘录 ${excerpt(limitation)} 所涉及的一个条件时，同一指标的估计变化有多大？`,
      design: `根据局限摘录定义基准与替代条件。沿用 ${cite(limited, limited.cells.method[0])} 所述方法，固定${controls}中的其余项目，对 ${cite(limited, limited.cells.result[0])} 的结果指标分别记录各条件的样本量、估计和不确定性。`,
      evidenceIds: [...new Set([...core, limited.cells.method[0].id, limited.cells.result[0].id, limitation.id])],
      caveat: '先核对当前方向是否涉及该局限，并确认条件可观察或可控制。观察数据所得差异按关联解释。',
    });
  }
  return candidates;
}

function auditCandidates(candidates: TopicCandidate[], rows: EvidenceRow[], evidence: Map<string, StudyEvidence>): boolean {
  const ids = new Set(candidates.map(candidate => candidate.id));
  return ids.size === candidates.length && candidates.every(candidate => {
    const references = new Set(candidate.evidenceIds);
    const supported = rows.filter(row => row.cells.method.some(item => references.has(item.id))
      && row.cells.result.some(item => references.has(item.id)));
    return Boolean(candidate.title.trim() && candidate.question.trim() && candidate.design.trim() && candidate.caveat.trim())
      && references.size === candidate.evidenceIds.length && [...references].every(id => evidence.has(id))
      && supported.length >= 2
      && (candidate.id !== 'limits' || [...references].some(id => evidence.get(id)?.kind === 'limitation'));
  });
}

function receipt(id: StudyStage['id'], status: StudyStage['status'], summary: string, artifactIds: string[] = []): StudyStage {
  return { id, status, summary, artifactIds };
}

export function buildLiteratureStudy(input: LiteratureStudy, direction: string): StudyResult {
  let study: LiteratureStudy;
  let scope: string;
  try {
    study = parseLiteratureStudy(input);
    scope = normalized(text(direction, LIMITS.directionChars, true));
  } catch (error) {
    const issue = error instanceof Error ? error.message : '文献研读输入无效。';
    return { rows: [], candidates: [], issues: [issue], stages: [
      receipt('lead', 'blocked', issue),
      receipt('reader', 'waiting', '等待有效的文献与页码摘录。'),
      receipt('analyst', 'waiting', '等待可核对的证据。'),
      receipt('writer', 'waiting', '等待证据对照。'),
      receipt('reviewer', 'waiting', '等待待审候选。'),
    ] };
  }

  const validScope = /\p{L}/u.test(scope) && (scope.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2;
  const evidence = new Map(study.evidence.filter(item => hasSubstance(item.quote)).map(item => [item.id, item]));
  const rows: EvidenceRow[] = study.papers.map(paper => {
    const cells: EvidenceRow['cells'] = { question: [], method: [], result: [], limitation: [] };
    for (const item of evidence.values()) {
      if (item.paperId === paper.id) cells[item.kind].push(item);
    }
    return { paper, cells };
  });
  const eligible = rows.filter(row => row.cells.method.length && row.cells.result.length);
  const distinct = distinctEvidenceRows(eligible);
  const issues: string[] = [];
  if (!validScope) issues.push('请填写具体研究方向，建议明确对象或场景。');
  if (!rows.length) issues.push('请添加包含可提取文本的论文 PDF。');
  if (evidence.size !== study.evidence.length) issues.push('只有标题或内容过短的摘录已留待补充。');
  for (const row of rows) {
    const missing = KINDS.filter(kind => !row.cells[kind].length).map(kind => LABELS[kind]);
    if (missing.length) issues.push(`《${row.paper.title}》缺少已核对的${missing.join('、')}摘录。`);
  }
  if (eligible.length < 2) issues.push('生成跨论文候选需要至少两篇不同 PDF，且每篇均有已核对的方法和结果摘录。');
  if (distinct.length < eligible.length) issues.push('有 PDF 同时包含相同的方法和结果摘录，请核对是否为同一研究的不同文件。');
  const proposals = validScope && distinct.length >= 2 ? propose(distinct, scope, study.domain) : [];
  const reviewed = proposals.length > 0 && auditCandidates(proposals, distinct, evidence);
  const reviewFailed = proposals.length > 0 && !reviewed;
  if (reviewFailed) issues.push('候选与摘录的引用关系校验失败。');
  const candidates = reviewed ? proposals : [];
  const candidateIds = candidates.map(candidate => candidate.id);
  return { rows, candidates, issues, stages: [
    receipt('lead', validScope ? 'done' : 'blocked', validScope ? '已登记本轮研究方向与领域。' : '请补充具体研究方向。', validScope ? ['study-scope'] : []),
    receipt('reader', evidence.size ? 'done' : 'blocked',
      evidence.size ? `已在对应 PDF 页核对 ${evidence.size} 条摘录。` : '等待可核对的原文摘录。', [...evidence.keys()]),
    receipt('analyst', evidence.size ? 'done' : 'waiting',
      evidence.size ? `已建立 ${rows.length} 篇论文的对照表，其中 ${eligible.length} 篇具备方法与结果摘录。` : '等待证据后填写对照表。',
      evidence.size ? rows.map(row => row.paper.id) : []),
    receipt('writer', proposals.length ? 'done' : 'blocked',
      proposals.length ? `已拟定 ${proposals.length} 项待验证的研究设计。` : '请补齐研究方向或两篇论文的方法与结果摘录。', candidateIds),
    receipt('reviewer', reviewFailed ? 'blocked' : reviewed ? 'done' : 'waiting',
      reviewed ? '已核对候选与原文摘录的引用关系。方向适用性、研究独立性和可比性待人工确认。'
        : reviewFailed ? '候选证据引用校验失败。' : '等待可审查的候选。', candidateIds),
  ] };
}
