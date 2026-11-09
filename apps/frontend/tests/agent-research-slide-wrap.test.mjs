import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { buildDemoPack } from '../lib/agent/demo-study.ts';
import { buildPptx } from '../lib/editor-export.ts';
import { buildReportBlockSlide, reportLinkState } from '../lib/report-storyboard.ts';

const fromXml = text => text
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'").replaceAll('&amp;', '&');

test('the Agent demonstration screening table wraps native cells within the slide and rejects undersized objects', async () => {
  const { report: content } = await buildDemoPack('城市社区嵌入式养老服务的使用体验与满意度调查');
  const section = content.report.find(item => item.blocks?.some(block => block.kind === 'table'));
  const block = section?.blocks.find(item => item.kind === 'table');
  assert.equal(block?.text, '问卷有效性筛查表');
  const result = content.quality.results.find(item => item.id === block.evidenceId);
  const slide = await buildReportBlockSlide(content, section.id, block.id);
  assert.equal(await reportLinkState(content, slide), 'current');
  const object = slide.objects.find(item => item.kind === 'table');
  assert.equal(object.sourceBlockId, block.id);
  assert.ok(object.fontSize >= 16);

  const pptx = await buildPptx({ ...content, slides: [slide] });
  const archive = await JSZip.loadAsync(await pptx.arrayBuffer(), { checkCRC32: true });
  const xml = await archive.file('ppt/slides/slide1.xml').async('string');
  const table = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)?.[0];
  assert.ok(table, 'table is editable OOXML');
  const rows = [...table.matchAll(/<a:tr h="(\d+)"[^>]*>([\s\S]*?)<\/a:tr>/g)];
  const heights = rows.map(row => Number(row[1]));
  const widths = [...table.matchAll(/<a:gridCol w="(\d+)"/g)].map(column => Number(column[1]));
  const cells = rows.map(row => [...row[2].matchAll(/<a:tc>[\s\S]*?<\/a:tc>/g)].map(cell => {
    assert.match(cell[0], /<a:pPr[^>]*algn="ctr"/);
    return [...cell[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(text => fromXml(text[1])).join('\n');
  }));
  assert.deepEqual(cells, [result.headers, ...result.rows].map(row => row.map(String)));
  assert.equal(widths.length, result.headers.length);
  assert.ok(widths.every(width => width > 0));
  assert.ok(widths.reduce((sum, width) => sum + width, 0) <= Math.ceil(object.width / 100 * 12192000) + widths.length);
  assert.ok(heights.slice(1).every(height => height > heights[0]), 'long cells get multiple-line height');
  assert.ok(heights.reduce((sum, height) => sum + height, 0) <= Math.round((object.height / 100 * 7.5 - .35) * 914400));
  assert.equal((rows[0][2].match(/w="19050"/g) ?? []).length, widths.length);
  assert.equal((rows[0][2].match(/w="9525"/g) ?? []).length, widths.length);
  assert.equal((rows.at(-1)[2].match(/w="19050"/g) ?? []).length, widths.length);

  const { reportLink, ...unlinked } = slide;
  assert.ok(reportLink);
  const tooShort = { ...unlinked, objects: slide.objects.map(item => item === object ? { ...item, height: 8 } : item) };
  await assert.rejects(buildPptx({ ...content, slides: [tooShort] }), /表格容量超出/);
});
