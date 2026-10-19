import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sax from 'sax';
import { createEditorContent } from '../lib/editor-model.ts';
import { buildPptx } from '../lib/editor-export.ts';

function xmlTexts(xml) {
  const texts = []; let current = null;
  const parser = sax.parser(true, { xmlns: true });
  parser.onerror = error => { throw error; };
  parser.onopentag = node => { if (node.name === 'a:t') current = ''; };
  parser.ontext = text => { if (current !== null) current += text; };
  parser.onclosetag = name => { if (name === 'a:t') { texts.push(current); current = null; } };
  parser.write(xml).close();
  return texts;
}

test('PowerPoint text runs declare Chinese language and explicit East Asian font without changing content or geometry', async () => {
  const content = createEditorContent();
  content.slides = ['cover', 'content', 'two-column'].map((layout, index) => ({
    id: `cjk-layout-${index}`, layout, title: `研究发现（第 ${index + 1} 页）`,
    body: '类别甲：18 / 30，占比 60.00%。\n类别乙：12 / 30，占比 40.00%。\n核对报告、幻灯片与答辩中的数值一致。',
    aside: '适用范围：中文与 English；保留 <、>、& 符号。',
    notes: `来源：版本 ${index + 1}。\n“完整讲稿”保持原文，不改变标点！`,
  }));
  const before = structuredClone(content);
  const zip = await JSZip.loadAsync(await (await buildPptx(content)).arrayBuffer());
  assert.deepEqual(content, before, 'export never changes saved content, IDs or notes');
  assert.match(await zip.file('ppt/presentation.xml').async('string'), /cx="12192000" cy="6858000"/);
  for (const [index, slide] of content.slides.entries()) {
    const xml = await zip.file(`ppt/slides/slide${index + 1}.xml`).async('string');
    const runs = [...xml.matchAll(/<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/g)].map(match => match[0]);
    assert.ok(runs.length >= 5, 'title, every body paragraph and page number have explicit run properties');
    for (const run of runs) {
      assert.match(run, /^<a:rPr\b[^>]*\blang="zh-CN"/);
      assert.match(run, /<a:latin\b[^>]*typeface="Microsoft YaHei"/);
      assert.match(run, /<a:ea\b[^>]*typeface="Microsoft YaHei"/);
    }
    assert.deepEqual(xmlTexts(xml), [slide.title, ...slide.body.split('\n'), ...(slide.layout === 'two-column' ? [slide.aside] : []), String(index + 1).padStart(2, '0')]);
    const notes = await zip.file(`ppt/notesSlides/notesSlide${index + 1}.xml`).async('string');
    assert.ok(xmlTexts(notes).map(text => text.replace(/\r\n/g, '\n')).includes(slide.notes), 'complete speaker notes remain unchanged apart from OOXML line endings');
    const bodyXfrm = `cx="${Math.round((slide.layout === 'two-column' ? 7.1 : 11.95) * 914400)}" cy="${Math.round((slide.layout === 'cover' ? 2.4 : 4.55) * 914400)}"`;
    assert.ok(xml.includes(bodyXfrm), 'body dimensions stay unchanged');
  }
});
