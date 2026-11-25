import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx, buildPptx } from '../lib/editor-export.ts';
import { inspectOfficePackage } from '../lib/office-package.ts';
import { digestText, makeSlideObject, resultPayload } from '../lib/research-quality.ts';

const glue = (left, right) => `${left}${right}`;
const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function extractWordParagraphTexts(xml) {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)]
    .map(m =>
      [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
        .map(t => decodeXmlEntities(t[1]))
        .join(''),
    )
    .filter(Boolean);
}

function extractPptParagraphTexts(xml) {
  return [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/gu)]
    .map(m =>
      [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu)]
        .map(t => decodeXmlEntities(t[1]))
        .join(''),
    )
    .filter(Boolean);
}

async function buildBlemishedFixture() {
  const gluedMw = glue('Mann-Whitney', 'U');
  const gluedCliff = glue("Cliff's", 'δ');
  const gluedKw = glue('Kruskal-Wallis', 'H');
  const gluedCronbach = glue("Cronbach's", 'α');
  const gluedSpearman = glue('Spearman', 'ρ');

  const result = {
    id: 'living-mode-freq',
    title: '「当前居住模式」样本结构结果',
    sourceName: '【实地入户】抽样数据',
    sourceUrl: 'https://example.org/survey',
    sourceHash: 'b'.repeat(64),
    resultHash: '0'.repeat(64),
    classification: 'user_provided',
    method: 'frequency',
    n: 320,
    total: 340,
    headers: ['「当前居住模式」类别', '有效频数', '占比'],
    rows: [
      ['「居家养老」', 180, 0.5625],
      ['「社区驿站」', 96, 0.3],
      ['「机构照护」', 44, 0.1375],
    ],
    metrics: [],
    warnings: [],
  };
  result.resultHash = await digestText(JSON.stringify(resultPayload(result)));

  const content = createEditorContent();
  content.version = 2;
  content.title = '银发群体「当前居住模式」与智慧服务采纳意愿调研';
  content.subtitle = '【双阶段】分层抽样与稳健性实证检验';
  content.quality = { version: 1, results: [result], findings: [] };
  content.report = [
    {
      id: 'sec-abstract',
      title: '摘要',
      body: [
        `本研究围绕「当前居住模式」差异开展分层抽样调查，检验结果显著（p=0.000）。`,
        `关键词：智慧养老；当前居住模式；${gluedMw} 与 ${gluedCliff}；${gluedKw}；${gluedCronbach}`,
      ].join('\n'),
      source: '',
      blocks: [],
    },
    {
      id: 'sec-empirical',
      title: '一、实证检验与稳健性分析',
      body: `【Spearman 秩相关稳健矩阵】比较不同「当前居住模式」受访者的终端接受度，${gluedMw} 与 ${gluedCliff} 检验结果均显著（p=0.000，rho=0.618），且样本子集满足行内关系 $x_i + y_i = z_i$。`,
      source: '「实地调研」原始统计台账',
      blocks: [
        {
          id: 'blk-tbl',
          kind: 'table',
          text: '受访者「当前居住模式」频数与占比三线表',
          evidenceId: 'living-mode-freq',
          valueColumn: 1,
        },
        {
          id: 'blk-fig',
          kind: 'chart',
          text: '受访者「当前居住模式」分布结构图',
          evidenceId: 'living-mode-freq',
          valueColumn: 1,
        },
        {
          id: 'blk-eq',
          kind: 'formula',
          text: 'x_i + y_i = z_i',
          evidenceId: '',
          valueColumn: 1,
        },
      ],
    },
  ];
  content.slides = [
    {
      id: 'slide-objects',
      title: '「当前居住模式」检验与图表',
      body: '',
      aside: '',
      notes: `【Spearman 秩相关稳健矩阵】讲稿提示：${gluedMw}、${gluedCliff} 与 ${gluedSpearman} 均达显著水平（p=0.000）。`,
      layout: 'chart',
      objects: [
        makeSlideObject('text', {
          text: `【Spearman 秩相关稳健矩阵】「当前居住模式」组间检验：${gluedMw} 与 ${gluedCliff}（p=0.000）`,
          x: 5,
          y: 4,
          width: 88,
          height: 14,
          fontSize: 18,
        }),
        makeSlideObject('chart', {
          evidenceId: 'living-mode-freq',
          x: 5,
          y: 22,
          width: 50,
          height: 64,
        }),
        makeSlideObject('table', {
          evidenceId: 'living-mode-freq',
          x: 58,
          y: 22,
          width: 37,
          height: 58,
          fontSize: 15,
        }),
      ],
    },
    {
      id: 'slide-two-col',
      title: '「当前居住模式」稳健性结论',
      body: `【Spearman 秩相关稳健矩阵】综合 ${gluedMw} 与 ${gluedCliff} 效应量，组间差异稳健（p=0.000）。`,
      aside: `「社区驿站」子样本 ${gluedKw} 复核一致（p=0.000）。`,
      notes: '答辩补充说明',
      layout: 'two-column',
    },
  ];

  return parseEditorContent(content);
}

test('DOCX export heals legacy brackets, glued statistical symbols, and p=0.000 while emitting valid OMML math and three-line tables', async () => {
  const fixture = await buildBlemishedFixture();
  const docxBlob = await buildDocx(fixture, undefined, renderSvg);
  const docxBytes = new Uint8Array(await docxBlob.arrayBuffer());
  assert.equal(inspectOfficePackage(docxBytes, 'docx').kind, 'docx');

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file('word/document.xml').async('string');
  const fullText = extractWordParagraphTexts(docXml).join('\n');

  // (1) Zero forbidden brackets, zero glued statistical symbols, zero p=0.000 rounding artifact
  assert.doesNotMatch(docXml, /[【】「」『』]/u, 'word/document.xml must contain zero forbidden brackets');
  assert.doesNotMatch(fullText, /[【】「」『』]/u);
  assert.equal(fullText.includes(glue('Mann-Whitney', 'U')), false, 'Mann-Whitney U must not remain glued');
  assert.equal(fullText.includes(glue("Cliff's", 'δ')), false, "Cliff's δ must not remain glued");
  assert.equal(fullText.includes(glue('Kruskal-Wallis', 'H')), false, 'Kruskal-Wallis H must not remain glued');
  assert.equal(fullText.includes(glue("Cronbach's", 'α')), false, "Cronbach's α must not remain glued");
  assert.doesNotMatch(fullText, /\bp\s*=\s*0\.000\b/iu, 'p=0.000 must heal to p < 0.0001');

  assert.match(fullText, /Mann-Whitney U/u);
  assert.match(fullText, /Cliff's δ/u);
  assert.match(fullText, /Kruskal-Wallis H/u);
  assert.match(fullText, /Cronbach's α/u);
  assert.match(fullText, /“当前居住模式”/u);
  assert.match(fullText, /采用 Spearman 秩相关稳健矩阵 检验/u);
  assert.match(fullText, /p < 0\.0001/u);
  assert.match(fullText, /ρ=0\.618/u);

  // (2) Native Word OMML structure for both inline $x_i + y_i = z_i$ and display formula block
  assert.doesNotMatch(docXml, /§§OMML/u, 'no raw OMML placeholder may survive');
  const oMathMatches = [...docXml.matchAll(/<m:oMath\b[\s\S]*?<\/m:oMath>/gu)];
  assert.ok(oMathMatches.length >= 2, `expected >= 2 <m:oMath> structures (inline + block), got ${oMathMatches.length}`);
  assert.match(docXml, /<m:oMathPara>[\s\S]*?<m:oMath>[\s\S]*?<m:sSub>/u, 'subscripts x_i + y_i = z_i must compile to native OMML <m:sSub>');

  // (3) Native Booktabs three-line table borders (1.5pt = w:sz="12" top/bottom, 0.75pt = w:sz="6" header rule)
  assert.match(docXml, /<w:tbl>/u);
  assert.match(docXml, /w:sz="12"/u);
  assert.match(docXml, /w:sz="6"/u);
});

test('PPTX export heals legacy brackets, glued statistical symbols, and p=0.000 across all slides, tables, and speaker notes', async () => {
  const fixture = await buildBlemishedFixture();
  const pptxBlob = await buildPptx(fixture, renderSvg);
  const pptxBytes = new Uint8Array(await pptxBlob.arrayBuffer());
  assert.equal(inspectOfficePackage(pptxBytes, 'pptx').kind, 'pptx');

  const zip = await JSZip.loadAsync(pptxBytes);
  const slideNames = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
    .sort();
  assert.equal(slideNames.length, 2);

  const slideTexts = [];
  for (const name of slideNames) {
    const xml = await zip.file(name).async('string');
    assert.doesNotMatch(xml, /[【】「」『』]/u, `${name} must contain zero forbidden brackets`);
    slideTexts.push(...extractPptParagraphTexts(xml));
  }
  const combinedSlides = slideTexts.join('\n');

  assert.equal(combinedSlides.includes(glue('Mann-Whitney', 'U')), false);
  assert.equal(combinedSlides.includes(glue("Cliff's", 'δ')), false);
  assert.equal(combinedSlides.includes(glue('Kruskal-Wallis', 'H')), false);
  assert.doesNotMatch(combinedSlides, /\bp\s*=\s*0\.000\b/iu);

  assert.match(combinedSlides, /Mann-Whitney U/u);
  assert.match(combinedSlides, /Cliff's δ/u);
  assert.match(combinedSlides, /Kruskal-Wallis H/u);
  assert.match(combinedSlides, /“当前居住模式”/u);
  assert.match(combinedSlides, /p < 0\.0001/u);

  const noteNames = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(name));
  assert.ok(noteNames.length >= 1);
  for (const name of noteNames) {
    const noteXml = await zip.file(name).async('string');
    const noteText = extractPptParagraphTexts(noteXml).join('\n');
    assert.doesNotMatch(noteXml, /[【】「」『』]/u, `${name} speaker notes must contain zero forbidden brackets`);
    assert.equal(noteText.includes(glue('Spearman', 'ρ')), false);
    assert.doesNotMatch(noteText, /\bp\s*=\s*0\.000\b/iu);
  }
});

test('DOCX and PPTX docProps/core.xml enforce blind-review anonymity and zero host path leakage across all XML parts', async () => {
  const fixture = await buildBlemishedFixture();
  const [docxBlob, pptxBlob] = await Promise.all([
    buildDocx(fixture, undefined, renderSvg),
    buildPptx(fixture, renderSvg),
  ]);

  const hostLeakPattern = /C:\\Users\\|\/Users\/|\/home\/|AppData\\Local|[【】「」『』]/iu;

  for (const [label, blob] of [
    ['docx', docxBlob],
    ['pptx', pptxBlob],
  ]) {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const coreFile = zip.file('docProps/core.xml');
    assert.ok(coreFile, `${label} archive must contain docProps/core.xml`);
    const coreXml = await coreFile.async('string');

    // Creator & lastModifiedBy must be blank or neutral (never leaking OS username, school, or author identity)
    const creator = /<dc:creator>([\s\S]*?)<\/dc:creator>/u.exec(coreXml)?.[1]?.trim() ?? '';
    const modifier = /<cp:lastModifiedBy>([\s\S]*?)<\/cp:lastModifiedBy>/u.exec(coreXml)?.[1]?.trim() ?? '';
    assert.equal(creator, '', `${label} dc:creator must be empty for blind-review compliance, got "${creator}"`);
    assert.equal(modifier, '', `${label} cp:lastModifiedBy must be empty for blind-review compliance, got "${modifier}"`);

    const xmlEntries = Object.keys(zip.files).filter(name => /\.(?:xml|rels|svg)$/iu.test(name));
    assert.ok(xmlEntries.length >= 8, `${label} expected >= 8 XML/rels parts`);
    for (const entryName of xmlEntries) {
      const partXml = await zip.file(entryName).async('string');
      assert.doesNotMatch(
        partXml,
        hostLeakPattern,
        `${label}:${entryName} leaked host path or forbidden brackets`,
      );
    }
  }
});
