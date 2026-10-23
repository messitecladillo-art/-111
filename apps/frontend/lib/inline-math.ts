// `$…$` is inline math when it hugs its content (“$x_i$”, not “$5 和 $6”); `\$` stays a literal dollar sign.
const INLINE_MATH = /(?<!\\)\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)(?<!\\)\$/g;

/** Text split into plain runs and inline formulas, shared by the Word export and the live preview. */
export function splitInlineMath(text: string): { text: string; math: boolean }[] {
  const out: { text: string; math: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_MATH)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index).replace(/\\\$/g, '$'), math: false });
    out.push({ text: match[1], math: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last).replace(/\\\$/g, '$'), math: false });
  return out;
}
