/**
 * TeX → Office Math (OMML), so formulas reach Word as native, editable equations rather than images or text.
 * KaTeX parses the TeX and emits presentation MathML; this module maps the MathML subset KaTeX produces onto
 * OMML elements. Spacing is left to Word, which applies its own math spacing rules.
 */
import katex from 'katex';

type Node = { tag: string; attrs: Record<string, string>; children: (Node | string)[] };

/** A minimal parser for KaTeX's well-formed MathML: elements, attributes, text and character entities. */
function parseXml(src: string): Node {
  let i = 0;
  const entity = (s: string) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e]);
  const element = (): Node => {
    const open = /^<([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/.exec(src.slice(i));
    if (!open) throw Error('公式结构无法解析。');
    i += open[0].length;
    const attrs: Record<string, string> = {};
    for (const a of open[2].matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = entity(a[2]);
    const node: Node = { tag: open[1], attrs, children: [] };
    if (open[3]) return node;
    for (;;) {
      if (i >= src.length) throw Error('公式结构无法解析。');
      if (src.startsWith('</', i)) { i = src.indexOf('>', i) + 1; return node; }
      if (src[i] === '<') node.children.push(element());
      else { const j = src.indexOf('<', i); node.children.push(entity(src.slice(i, j < 0 ? src.length : j))); i = j < 0 ? src.length : j; }
    }
  };
  i = src.indexOf('<math');
  if (i < 0) throw Error('公式结构无法解析。');
  return element();
}

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const text = (n: Node | string): string => typeof n === 'string' ? n : n.children.map(text).join('');
const elements = (n: Node) => n.children.filter((c): c is Node => typeof c !== 'string');

const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂', '⋁', '⋀', '⨁', '⨂']);
/** Operators that end the operand of a sum or integral. */
const OPERAND_END = new Set(['+', '−', '-', '=', '<', '>', '≤', '≥', '≈', '≠', '±', '∓', ',', ';', '∣', '⇒', '→', '⟹', '∼', '≡', '∝']);
const OPEN = ['(', '[', '{', '⟨', '|', '‖', '⌊', '⌈'];
const CLOSE = [')', ']', '}', '⟩', '|', '‖', '⌋', '⌉'];
/** MathML accent marks → OMML combining characters. */
const ACCENTS: Record<string, string> = {
  'ˉ': '̅', '¯': '̅', '‾': '̅', '^': '̂', 'ˆ': '̂', '~': '̃', '˜': '̃', '˙': '̇', '¨': '̈',
  '⃗': '⃗', '→': '⃗', 'ˇ': '̌', '˘': '̆', 'ˊ': '́', 'ˋ': '̀', '˚': '̊',
};
const MATH_FONT = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>';
type Style = 'p' | 'b' | 'i' | 'bi' | undefined;
const run = (t: string, style?: Style) => `<m:r>${style ? `<m:rPr><m:sty m:val="${style}"/></m:rPr>` : ''}${MATH_FONT}<m:t xml:space="preserve">${escape(t)}</m:t></m:r>`;
/** Chinese and other words inside \text{} stay ordinary text in the body font. */
const textRun = (t: string) => `<m:r><m:rPr><m:nor/></m:rPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:hint="eastAsia"/></w:rPr><m:t xml:space="preserve">${escape(t)}</m:t></m:r>`;
const wrap = (tag: string, n: Node | undefined) => `<m:${tag}>${n ? convert(n) : ''}</m:${tag}>`;
/** Word handles thin spacing itself; only deliberate gaps of about \; or wider survive. */
function space(width: number): string {
  if (width >= 0.9) return run(' '.repeat(Math.max(1, Math.round(width))));
  return width >= 0.27 ? run(' ') : '';
}

function sequence(nodes: Node[]): string {
  let out = '';
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    // Paired \left … \right fences become one growing delimiter; an unpaired opener (cases) spans the row.
    if (n.tag === 'mo' && n.attrs.fence === 'true' && (OPEN.includes(text(n)) || text(n) === '')) {
      let depth = 1, close = -1;
      for (let j = k + 1; j < nodes.length; j++) {
        const m = nodes[j];
        if (m.tag !== 'mo' || m.attrs.fence !== 'true') continue;
        const t = text(m);
        if (CLOSE.includes(t) || t === '') { if (--depth === 0) { close = j; break; } }
        else if (OPEN.includes(t)) depth++;
      }
      const inner = close > 0 ? nodes.slice(k + 1, close) : nodes.slice(k + 1);
      out += `<m:d><m:dPr><m:begChr m:val="${escape(text(n))}"/><m:endChr m:val="${close > 0 ? escape(text(nodes[close])) : ''}"/></m:dPr><m:e>${sequence(inner)}</m:e></m:d>`;
      if (close < 0) break;
      k = close;
      continue;
    }
    // A big operator takes the following terms as its operand, up to the next relation or sum.
    const base = ['munderover', 'munder', 'mover', 'msubsup', 'msub', 'msup'].includes(n.tag) ? elements(n)[0] : null;
    if (base?.tag === 'mo' && NARY.has(text(base))) {
      let j = k + 1;
      while (j < nodes.length && !(nodes[j].tag === 'mo' && OPERAND_END.has(text(nodes[j])))) j++;
      const parts = elements(n);
      const lower = ['munderover', 'munder', 'msubsup', 'msub'].includes(n.tag) ? parts[1] : undefined;
      const upper = n.tag === 'munderover' || n.tag === 'msubsup' ? parts[2] : n.tag === 'mover' || n.tag === 'msup' ? parts[1] : undefined;
      const limits = n.tag.startsWith('mu') || n.tag === 'mover' ? 'undOvr' : 'subSup';
      out += `<m:nary><m:naryPr><m:chr m:val="${escape(text(base))}"/><m:limLoc m:val="${limits}"/>${lower ? '' : '<m:subHide m:val="1"/>'}${upper ? '' : '<m:supHide m:val="1"/>'}</m:naryPr>`
        + `${wrap('sub', lower)}${wrap('sup', upper)}<m:e>${sequence(nodes.slice(k + 1, j))}</m:e></m:nary>`;
      k = j - 1;
      continue;
    }
    out += convert(n);
  }
  return out;
}

function convert(n: Node): string {
  const kids = elements(n);
  switch (n.tag) {
    case 'math': case 'mrow': case 'mstyle': case 'mpadded': return sequence(kids);
    case 'semantics': return kids[0] ? convert(kids[0]) : '';
    case 'annotation': case 'annotation-xml': case 'mphantom': return '';
    case 'mi': {
      const v = n.attrs.mathvariant, t = text(n);
      return run(t, v === 'bold' ? 'b' : v === 'bold-italic' ? 'bi' : v === 'italic' ? 'i' : v === 'normal' || [...t].length > 1 ? 'p' : undefined);
    }
    case 'mn': return run(text(n), n.attrs.mathvariant === 'bold' ? 'b' : 'p');
    case 'mo': {
      const t = text(n);
      return t === '⁡' || t === '⁢' || t === '⁣' ? '' : run(t, 'p');
    }
    case 'mtext': {
      const t = text(n);
      if (!/\S/.test(t.replace(/[      ]/g, ' '))) {
        // KaTeX writes \, \: \; and ~ as whitespace text: keep only the wider ones.
        const width = [...t].reduce((w, c) => w + (c === ' ' ? 1 : c === ' ' ? .5 : c === ' ' || c === ' ' ? .28 : c === ' ' ? .25 : .17), 0);
        return space(width);
      }
      return textRun(t);
    }
    case 'mspace': return space(parseFloat(n.attrs.width ?? '0') || 0);
    case 'msub': return `<m:sSub>${wrap('e', kids[0])}${wrap('sub', kids[1])}</m:sSub>`;
    case 'msup': return `<m:sSup>${wrap('e', kids[0])}${wrap('sup', kids[1])}</m:sSup>`;
    case 'msubsup': return `<m:sSubSup>${wrap('e', kids[0])}${wrap('sub', kids[1])}${wrap('sup', kids[2])}</m:sSubSup>`;
    case 'mfrac': {
      const bar = n.attrs.linethickness === '0' || n.attrs.linethickness === '0px' || n.attrs.linethickness === '0em';
      return `<m:f>${bar ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}${wrap('num', kids[0])}${wrap('den', kids[1])}</m:f>`;
    }
    case 'msqrt': return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${sequence(kids)}</m:e></m:rad>`;
    case 'mroot': return `<m:rad>${wrap('deg', kids[1])}${wrap('e', kids[0])}</m:rad>`;
    case 'mover': {
      const mark = kids[1], t = mark ? text(mark) : '';
      const stretchy = mark?.tag === 'mo' && mark.attrs.stretchy === 'true';
      if (stretchy && ['⏞', '⎴', '︷'].includes(t)) return `<m:groupChr><m:groupChrPr><m:chr m:val="⏞"/><m:pos m:val="top"/><m:vertJc m:val="bot"/></m:groupChrPr>${wrap('e', kids[0])}</m:groupChr>`;
      if (n.attrs.accent === 'true' && stretchy && ['‾', '¯'].includes(t)) return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${wrap('e', kids[0])}</m:bar>`;
      if (n.attrs.accent === 'true' && ACCENTS[t]) return `<m:acc><m:accPr><m:chr m:val="${ACCENTS[t]}"/></m:accPr>${wrap('e', kids[0])}</m:acc>`;
      return `<m:limUpp>${wrap('e', kids[0])}${wrap('lim', kids[1])}</m:limUpp>`;
    }
    case 'munder': {
      const mark = kids[1], t = mark ? text(mark) : '';
      const stretchy = mark?.tag === 'mo' && mark.attrs.stretchy === 'true';
      if (stretchy && ['⏟', '⎵', '︸'].includes(t)) return `<m:groupChr><m:groupChrPr><m:chr m:val="⏟"/><m:pos m:val="bot"/><m:vertJc m:val="top"/></m:groupChrPr>${wrap('e', kids[0])}</m:groupChr>`;
      if (stretchy && ['‾', '_', '¯'].includes(t)) return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${wrap('e', kids[0])}</m:bar>`;
      return `<m:limLow>${wrap('e', kids[0])}${wrap('lim', kids[1])}</m:limLow>`;
    }
    case 'munderover': return `<m:limUpp><m:e><m:limLow>${wrap('e', kids[0])}${wrap('lim', kids[1])}</m:limLow></m:e>${wrap('lim', kids[2])}</m:limUpp>`;
    case 'menclose': return `<m:borderBox>${`<m:e>${sequence(kids)}</m:e>`}</m:borderBox>`;
    case 'mtable': {
      const rows = kids.filter(r => r.tag === 'mtr');
      const cells = (r: Node) => elements(r).filter(c => c.tag === 'mtd');
      const columns = Math.max(1, ...rows.map(r => cells(r).length));
      if (columns === 1) return `<m:eqArr>${rows.map(r => `<m:e>${cells(r)[0] ? sequence(elements(cells(r)[0])) : ''}</m:e>`).join('')}</m:eqArr>`;
      const align = (n.attrs.columnalign ?? '').split(/\s+/)[0] === 'left' ? 'left' : 'center';
      return `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${columns}"/><m:mcJc m:val="${align}"/></m:mcPr></m:mc></m:mcs></m:mPr>`
        + rows.map(r => `<m:mr>${Array.from({ length: columns }, (_, c) => `<m:e>${cells(r)[c] ? sequence(elements(cells(r)[c])) : ''}</m:e>`).join('')}</m:mr>`).join('') + '</m:m>';
    }
    default: return sequence(kids);
  }
}

/** One TeX formula as an OMML `<m:oMath>` element. Display formulas are wrapped in `<m:oMathPara>` by the caller. */
export function texToOmml(tex: string, displayMode = true): string {
  if (typeof tex !== 'string' || !tex.trim()) throw Error('公式为空。');
  let mathml: string;
  try {
    mathml = katex.renderToString(tex, { output: 'mathml', displayMode, throwOnError: true, strict: 'ignore', trust: false });
  } catch (error) {
    throw Error(`公式无法解析：${(error as Error).message.replace(/^KaTeX parse error:\s*/, '')}`);
  }
  return `<m:oMath>${convert(parseXml(mathml))}</m:oMath>`;
}
