import assert from 'node:assert/strict';
import { test } from 'node:test';
import { texToOmml } from '../lib/omml.ts';
import { HANDBOOK } from '../lib/sampling-handbook.ts';

/** Every opening tag has its matching close, in order. */
function wellFormed(xml) {
  const stack = [];
  for (const m of xml.matchAll(/<(\/?)([\w:]+)(?:\s[^>]*?)?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0 && !/[<>]/.test(xml.replace(/<[^>]+>/g, ''));
}
const formulas = [];
const walk = value => {
  if (!value || typeof value === 'string') return;
  if (Array.isArray(value)) { value.forEach(walk); return; }
  if (typeof value === 'object') { if (typeof value.tex === 'string') formulas.push(value.tex); Object.values(value).forEach(walk); }
};
walk(HANDBOOK);

test('every handbook formula converts to well-formed OMML', () => {
  assert.ok(formulas.length >= 100, `found ${formulas.length} formulas`);
  for (const tex of formulas) {
    const omml = texToOmml(tex);
    assert.ok(omml.startsWith('<m:oMath>') && omml.endsWith('</m:oMath>'), tex);
    assert.ok(wellFormed(omml), `malformed OMML for ${tex}`);
    assert.doesNotMatch(omml, /⁡| /, `function-application or thin-space characters leak from ${tex}`);
  }
});

test('structures map onto native Word math objects', () => {
  const frac = texToOmml(String.raw`n_0=\frac{z^2p(1-p)}{e^2}`);
  assert.match(frac, /<m:sSub><m:e>.*n.*<\/m:e><m:sub>.*0.*<\/m:sub><\/m:sSub>/);
  assert.match(frac, /<m:f><m:num>.*<\/m:num><m:den>.*<\/m:den><\/m:f>/);
  const sum = texToOmml(String.raw`\bar{y}_{st}=\sum_{h=1}^{L}W_h\bar{y}_h+c`);
  assert.match(sum, /<m:nary><m:naryPr><m:chr m:val="∑"\/><m:limLoc m:val="undOvr"\/><\/m:naryPr><m:sub>.*h.*=.*1.*<\/m:sub><m:sup>.*L.*<\/m:sup><m:e>.*W.*<\/m:e><\/m:nary>/);
  assert.match(sum, /<\/m:nary><m:r>.*\+.*<\/m:r>/, 'the operand of the sum stops before the next plus sign');
  assert.match(sum, /<m:acc><m:accPr><m:chr m:val="̅"\/><\/m:accPr>/, '\\bar becomes a bar accent');
  assert.match(texToOmml(String.raw`\hat{\theta}`), /<m:chr m:val="̂"\/>/);
  assert.match(texToOmml(String.raw`\overline{xy}`), /<m:bar><m:barPr><m:pos m:val="top"\/>/);
  assert.match(texToOmml(String.raw`\sqrt[3]{x}+\sqrt{y}`), /<m:rad><m:deg>.*3.*<\/m:deg>.*<m:radPr><m:degHide m:val="1"\/>/);
  assert.match(texToOmml(String.raw`\left(\frac{a}{b}\right)`), /<m:d><m:dPr><m:begChr m:val="\("\/><m:endChr m:val="\)"\/><\/m:dPr>/);
});

test('cases, bold symbols, braces, text and spacing render as Word expects', () => {
  const cases = texToOmml(String.raw`f(x)=\begin{cases}1,&x>0\\0,&\text{其他情形}\end{cases}`);
  assert.match(cases, /<m:d><m:dPr><m:begChr m:val="\{"\/><m:endChr m:val=""\/><\/m:dPr><m:e><m:m>/, 'an unpaired brace spans the matrix');
  assert.match(cases, /<m:nor\/>.*其他情形/, 'Chinese text stays ordinary text');
  assert.match(texToOmml(String.raw`\boldsymbol{\beta}_j`), /<m:sty m:val="bi"\/>.*β/);
  const brace = texToOmml(String.raw`\underbrace{V(\hat\theta)}_{\text{抽样变异}}`);
  assert.match(brace, /<m:limLow><m:e><m:groupChr><m:groupChrPr><m:chr m:val="⏟"\/><m:pos m:val="bot"\/>/);
  const thin = texToOmml(String.raw`a\,b`), quad = texToOmml(String.raw`a\quad b`);
  assert.doesNotMatch(thin, / | | /, 'thin spaces are left to Word');
  assert.match(quad, / /, 'a quad survives as an em space');
  const named = texToOmml(String.raw`\operatorname{se}(\hat\theta)`);
  assert.match(named, /<m:sty m:val="p"\/>.*>se</);
  assert.match(texToOmml('a<b'), /&lt;/);
});

test('invalid TeX fails with a readable message instead of producing broken equations', () => {
  assert.throws(() => texToOmml(String.raw`\frac{a`), /公式无法解析/);
  assert.throws(() => texToOmml('  '), /公式为空/);
});

test('function names become Word functions, scripted or not, so Word spaces them', () => {
  const log = texToOmml(String.raw`\log_2 x+\sin x`);
  assert.match(log, /<m:func><m:fName><m:sSub><m:e>[\s\S]*?log[\s\S]*?<\/m:sSub><\/m:fName><m:e>[\s\S]*?x[\s\S]*?<\/m:e><\/m:func>/, 'log₂ keeps its subscript and takes x');
  assert.match(log, /<m:func><m:fName>[\s\S]*?sin[\s\S]*?<\/m:fName><m:e>[\s\S]*?x/);
  const min = texToOmml(String.raw`V=\sqrt{\frac{\chi^2}{n\,\min(r-1,\,c-1)}}`);
  assert.match(min, /<m:func><m:fName>[\s\S]*?min[\s\S]*?<\/m:fName><m:e>[\s\S]*?\([\s\S]*?\)[\s\S]*?<\/m:e><\/m:func>/, 'the bracketed group is the argument');
  assert.doesNotMatch(texToOmml(String.raw`\left(\min\right)`), /<m:func>/, 'a name with nothing to apply to stays a plain name');
  assert.doesNotMatch(min, /⁡/);
});
