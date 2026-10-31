/**
 * Text mining of open-ended survey answers: Chinese word segmentation with the runtime's own dictionary
 * (Intl.Segmenter, which ships with the browser and Node, so no third-party word list is bundled), function words
 * removed, then what a report states about open answers — how many answers mention each term (提及率), the terms
 * that set one group's answers apart from the others' (TF-IDF over groups), and which terms are mentioned together.
 * Pure computation on the answers the user imported; nothing is fetched or scraped.
 */

/**
 * Function words that carry no topic of their own. Deliberately short: words such as 希望 or 增加 often carry the
 * request itself in survey answers, so they stay; the author can drop more words per analysis.
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  '的', '了', '和', '与', '及', '或', '是', '在', '也', '就', '都', '而', '着', '把', '被', '让', '给', '对', '从', '向', '跟', '还',
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '大家', '自己', '这', '那', '这个', '那个', '这些', '那些', '这样', '那样',
  '什么', '怎么', '因为', '所以', '但是', '但', '如果', '虽然', '然后', '而且', '或者', '还是', '就是', '一个', '一些', '一下', '有点',
  '没有', '可以', '能够', '比较', '非常', '特别', '真的', '觉得', '感觉', '其实', '目前', '现在', '已经', '还有', '以及', '等等', '之类',
]);

export type TermRow = { term: string; count: number; answers: number; share: number };
export type TextRefusal = { refused: 'no-segmenter' | 'no-answers' | 'too-few-answers' | 'no-terms' | 'too-few-groups' };
/** Fewer answers than this give mention rates too coarse to report. */
export const MIN_ANSWERS = 5;

/**
 * Whether this runtime can segment Chinese words. Without it the counts are refused rather than approximated:
 * character bigrams (the fallback of the knowledge search) would count fragments such as 放时 as mentions.
 */
export const segmenterAvailable = (): boolean => typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function';
export const NO_SEGMENTER = '当前浏览器不支持中文分词（Intl.Segmenter），请更新浏览器后再分析开放题。';
const segmenter = () => {
  if (!segmenterAvailable()) throw Error(NO_SEGMENTER);
  return new Intl.Segmenter('zh', { granularity: 'word' });
};

/** The content words of one answer, in order: word-like segments, function words, numbers and single letters dropped. */
/**
 * Negators the segmenter returns as words of their own (不/满意, 没有/照明, 不太/方便). They are joined to the word they
 * negate, with any degree word between (不是/很/方便), so 不满意 is never counted as 满意.
 */
export const NEGATORS: ReadonlySet<string> = new Set(['不', '没', '没有', '未', '无', '非', '别', '不太', '不够', '不要', '不能', '不会', '不是', '不大', '不怎么', '没什么', '并不', '从不', '从没']);
// Words a negation takes into its phrase: degree words (不是/很/方便) and the scope words of 没有任何问题, 未发现问题,
// 无明显问题, so the 问题 after them is never counted as a problem raised.
const DEGREE: ReadonlySet<string> = new Set(['很', '太', '大', '够', '怎么', '那么', '特别', '非常', '是很', '任何', '什么', '明显', '发现', '存在', '其他']);
// Function words a negation passes through to the word it governs (不觉得方便, 不可以停车). Any other function word,
// such as the preposition in 没有在这里停车, ends the negation without a guess at what it governed.
const TRANSPARENT: ReadonlySet<string> = new Set(['觉得', '感觉', '可以', '能够', '是', '比较', '特别', '非常', '真的', '其实']);

export function terms(text: string, drop: ReadonlySet<string> = FUNCTION_WORDS): string[] {
  const out: string[] = [];
  let negation = '';
  // At a clause's end a negator with nothing after it is the complaint itself (停车位不够): a word of two or more
  // characters is counted; a lone 不 negates nothing that is counted.
  const flush = () => { if ([...negation].length >= 2) out.push(negation); negation = ''; };
  for (const { segment, isWordLike } of segmenter().segment(text.normalize('NFKC'))) {
    const word = segment.trim().toLowerCase();
    if (!word) continue;
    if (!isWordLike) { flush(); continue; }
    if (NEGATORS.has(word) || (negation && DEGREE.has(word))) { negation += word; continue; }
    // A function word is not a term, negated or not; a negation carries through a transparent one to the content word
    // it governs (不觉得方便 → 不方便) and is dropped at any other.
    if (drop.has(word)) { if (!TRANSPARENT.has(word)) negation = ''; continue; }
    const term = negation + word;
    negation = '';
    // A single Han character is almost always a function word or a fragment; numbers belong to the closed questions.
    if ([...term].length < 2 || /^[\p{N}.%]+$/u.test(term)) continue;
    out.push(term);
  }
  flush();
  return out;
}

/** The answers that say something: blank and non-answers (无, 没有, 不知道) do not count towards the mention rates. */
export function answered(answers: readonly string[]): string[] {
  // Judged without spaces and punctuation, after full-width forms are normalised: Ｎ／Ａ, N.A., N / A, ... and ??? are
  // not answers either.
  return answers.map(a => a.normalize('NFKC').trim()).filter(a => {
    const bare = a.replace(/[\s\p{P}\p{S}]/gu, '');
    // "Nothing to report" in its usual forms (没有任何问题, 暂无建议, 未发现问题) says nothing either.
    return bare !== '' && !/^(无|没有|暂无|不知道|不清楚|没|否|na|none|nil)$/iu.test(bare)
      && !/^(暂时|目前|暂)?(没有|没|无|暂无|未发现|未见|不存在)(任何|什么|明显的?|其他)?(问题|意见|建议|不满|缺点|要求)了?$/u.test(bare);
  });
}

/**
 * How often each term occurs and in how many answers, most-mentioned first; `share` is the mention rate among the
 * answers that say something. Ties are broken by total count, then by the term, so the order is reproducible.
 */
export function termTable(answers: readonly string[], options: { top?: number; drop?: ReadonlySet<string> } = {}): { n: number; rows: TermRow[] } | TextRefusal {
  if (!segmenterAvailable()) return { refused: 'no-segmenter' };
  const kept = answered(answers);
  if (!kept.length) return { refused: 'no-answers' };
  if (kept.length < MIN_ANSWERS) return { refused: 'too-few-answers' };
  const count = new Map<string, number>(), seen = new Map<string, number>();
  for (const answer of kept) {
    const words = terms(answer, options.drop);
    for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);
    for (const w of new Set(words)) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  if (!count.size) return { refused: 'no-terms' };
  const rows = [...count].map(([term, c]) => ({ term, count: c, answers: seen.get(term)!, share: seen.get(term)! / kept.length }))
    .sort((a, b) => b.answers - a.answers || b.count - a.count || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return { n: kept.length, rows: rows.slice(0, options.top ?? 30) };
}

/**
 * The terms that set each group's answers apart (for example by 年级 or 使用频率): TF-IDF with each group's answers
 * as one document, tf = the term's share of the group's words, idf = ln(groups / groups using the term). A term every
 * group uses scores zero, so what remains is what this group says and the others do not.
 */
export function distinctiveTerms(groups: readonly { name: string; answers: readonly string[] }[], options: { top?: number; drop?: ReadonlySet<string> } = {}): { name: string; n: number; terms: { term: string; tfidf: number; answers: number }[] }[] | TextRefusal {
  if (!segmenterAvailable()) return { refused: 'no-segmenter' };
  const bags = groups.map(g => { const kept = answered(g.answers); return { name: g.name, n: kept.length, docs: kept.map(a => terms(a, options.drop)) }; });
  // Only groups that say something are compared: an empty group would make every word of the others look distinctive.
  const compared = bags.filter(bag => bag.docs.some(d => d.length));
  if (compared.length < 2) return { refused: 'too-few-groups' };
  const df = new Map<string, number>();
  for (const bag of compared) for (const w of new Set(bag.docs.flat())) df.set(w, (df.get(w) ?? 0) + 1);
  return bags.map(bag => {
    if (!compared.includes(bag)) return { name: bag.name, n: bag.n, terms: [] };
    const words = bag.docs.flat(), tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    const scored = [...tf].map(([term, c]) => ({ term, tfidf: (c / words.length) * Math.log(compared.length / df.get(term)!), answers: bag.docs.filter(d => d.includes(term)).length }))
      .filter(t => t.tfidf > 0)
      .sort((a, b) => b.tfidf - a.tfidf || b.answers - a.answers || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
    return { name: bag.name, n: bag.n, terms: scored.slice(0, options.top ?? 10) };
  });
}

/**
 * How many answers mention both of two terms, for the given terms (usually the top of the term table), strongest
 * pairs first. Counted once per answer however often the words repeat.
 */
export function cooccurrence(answers: readonly string[], vocabulary: readonly string[], options: { drop?: ReadonlySet<string>; minimum?: number } = {}): { a: string; b: string; answers: number }[] | TextRefusal {
  if (!segmenterAvailable()) return { refused: 'no-segmenter' };
  const index = new Map(vocabulary.map((w, i) => [w, i])), pairs = new Map<string, number>();
  for (const answer of answered(answers)) {
    const present = [...new Set(terms(answer, options.drop))].filter(w => index.has(w)).sort((x, y) => index.get(x)! - index.get(y)!);
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
      const key = `${present[i]}\u0000${present[j]}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  return [...pairs].filter(([, c]) => c >= (options.minimum ?? 2)).map(([key, c]) => { const [a, b] = key.split('\u0000'); return { a, b, answers: c }; })
    .sort((x, y) => y.answers - x.answers || index.get(x.a)! - index.get(y.a)! || index.get(x.b)! - index.get(y.b)!);
}
