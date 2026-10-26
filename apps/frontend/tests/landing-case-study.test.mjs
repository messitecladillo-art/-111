import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LANDING_CASE_STUDY as study } from '../data/landing-case-study.ts';

const provenance = JSON.parse(readFileSync(new URL('../data/asset-provenance.json', import.meta.url), 'utf8'));
const materials = JSON.parse(readFileSync(new URL('../data/research-materials.json', import.meta.url), 'utf8'));

test('the homepage study is bound to the selected reference-library source, not the team report', () => {
  const material = materials.sources.find(item => item.id === study.source.materialId);
  assert.ok(material, 'the source must already exist in the provided research library');
  assert.equal(material.sha256, study.source.sha256);
  assert.equal(material.filename, study.source.filename);
  assert.equal(study.source.materialId, 'material-275');
  assert.deepEqual(study.pages.map(page => [page.pdfPage, page.page]), [[43, 32], [14, 3], [41, 30], [57, 46], [79, 68]]);
  assert.equal(new Set(study.pages.map(page => page.id)).size, 5);
  assert.equal(study.pages.some(page => /长衫|新蓝领|LPA/.test(`${page.title}${page.text}${page.alt}`)), false);
});

test('every displayed preview is an original structure guide, not a published report-page derivative', () => {
  for (const page of study.pages) {
    assert.match(page.imageBase, /^\/landing\/structure-camping-[a-z]+$/);
    assert.ok(page.pdfPage <= study.source.pdfPageCount);
    const path = `public${page.imageBase}.svg`;
    const entry = provenance.assets.find(item => item.path === path);
    assert.ok(entry, `missing provenance for ${path}`);
    const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `changed or swapped guide: ${path}`);
    const svg = bytes.toString('utf8');
    assert.match(svg, /width="560" height="792" viewBox="0 0 560 792"/);
    assert.match(svg, /结构导览/);
    assert.match(svg, /非报告原页/);
    assert.match(svg, /不承载统计数值/);
    assert.doesNotMatch(svg, /<(?:image|foreignObject|script|filter)\b|data:|(?:xlink:)?href=/i);
    assert.match(page.alt, /非报告原页/);
    assert.match(entry.origin, /Original code-drawn/);
    assert.equal(entry.review.statisticalResult, 'not_a_statistical_result');
  }
  const evidence = readFileSync(new URL('../components/landing/CaseEvidence.tsx', import.meta.url), 'utf8');
  const landing = readFileSync(new URL('../components/landing/LandingPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(evidence + landing + JSON.stringify(study), /library-camping-|\.imageBase\}-(?:560|1240)\.webp/);
  assert.match(evidence, /展开结构导览/);
  assert.match(landing, /原文可在案例库本地阅读/);
});
