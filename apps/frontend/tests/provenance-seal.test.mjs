import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import {
  buildProvenanceReceipt,
  computeSealDigest,
  renderProvenanceSealSvg,
  serializeSealPayload,
} from '../lib/provenance-seal.ts';
import { assertTrueVector, getVectorAsset, getVectorPrimitives, VECTOR_ASSETS } from '../lib/vector-assets.ts';
import { assertTrueVector as assertStrictVectorSvg } from '../lib/vector-svg.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { makeSlideObject } from '../lib/research-quality.ts';
import { buildPptx } from '../lib/editor-export.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { route } from '../lib/agent/router.ts';

const sampleGates = (allPassed = false) =>
  Array.from({ length: 9 }, (_, idx) => ({
    id: `G0${idx + 1}`,
    name: `门禁${idx + 1}`,
    status: allPassed || idx < 4 ? 'passed' : 'pending',
  }));

test('computeSealDigest and buildProvenanceReceipt are deterministic and detect any gate or Q-D-I-A mutation', () => {
  const inputA = {
    gates: sampleGates(false),
    qdia: { questions: 18, sampleRows: 420, results: 5, findings: 3 },
    verifiedDate: '2026-11-01',
  };
  const receiptA1 = buildProvenanceReceipt(inputA);
  const receiptA2 = buildProvenanceReceipt(inputA);
  assert.equal(receiptA1.schema, 'evix.provenance-seal.v1');
  assert.equal(receiptA1.digest, receiptA2.digest);
  assert.match(receiptA1.digest, /^EVX-9G-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(receiptA1.status, 'in-progress');
  assert.equal(receiptA1.passedCount, 4);
  assert.equal(receiptA1.totalGates, 9);

  const inputAllPassed = { ...inputA, gates: sampleGates(true) };
  const receiptAll = buildProvenanceReceipt(inputAllPassed);
  assert.equal(receiptAll.status, 'all-passed');
  assert.equal(receiptAll.passedCount, 9);
  assert.notEqual(receiptAll.digest, receiptA1.digest);

  const inputBlocked = {
    ...inputA,
    gates: inputA.gates.map((g, i) => (i === 0 ? { ...g, status: 'blocked' } : g)),
  };
  assert.equal(buildProvenanceReceipt(inputBlocked).status, 'blocked');
  assert.notEqual(computeSealDigest(inputBlocked), receiptA1.digest);

  const inputQdiaChanged = {
    ...inputA,
    qdia: { ...inputA.qdia, sampleRows: 421 },
  };
  assert.notEqual(serializeSealPayload(inputQdiaChanged), serializeSealPayload(inputA));
  assert.notEqual(computeSealDigest(inputQdiaChanged), receiptA1.digest);
});

test('renderProvenanceSealSvg produces strict self-contained vector SVG with gate states and digest', () => {
  const input = {
    gates: sampleGates(true),
    qdia: { questions: 20, sampleRows: 500, results: 6, findings: 4 },
    verifiedDate: '2026-11-01',
  };
  const svg = renderProvenanceSealSvg(input);
  assert.equal(assertStrictVectorSvg(svg), svg);
  assert.match(svg, /九门全准/);
  assert.match(svg, new RegExp(computeSealDigest(input)));
  assert.doesNotMatch(svg, /<image|data:image|<script|<foreignObject|<filter|href=|<style/i);
});

test('prism-compass and xiejian-seal vector assets pass strict SVG validation and export as native PPTX shapes', async () => {
  const ids = VECTOR_ASSETS.map(a => a.id);
  assert.ok(ids.includes('prism-compass'));
  assert.ok(ids.includes('xiejian-seal'));

  for (const id of ['prism-compass', 'xiejian-seal']) {
    const svg = getVectorAsset(id, '#00796F');
    assertTrueVector(svg);
    const primitives = getVectorPrimitives(id, '#00796F');
    assert.ok(primitives.length >= 8);
  }

  const content = createEditorContent();
  content.version = 2;
  content.quality = { version: 1, results: [], findings: [] };
  content.slides = [
    {
      id: 'slide-seal',
      title: '九门循证核验',
      body: '',
      aside: '',
      notes: '核验印鉴说明',
      layout: 'cover',
      objects: [
        makeSlideObject('vector', { assetId: 'prism-compass', x: 8, y: 18, width: 36, height: 60, color: '#00796F' }),
        makeSlideObject('vector', { assetId: 'xiejian-seal', x: 54, y: 18, width: 36, height: 60, color: '#85590A' }),
      ],
    },
  ];
  const parsed = parseEditorContent(content);
  assert.equal(parsed.slides[0].objects.length, 2);

  const zip = await JSZip.loadAsync(await (await buildPptx(parsed)).arrayBuffer());
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
  const expectedShapes = getVectorPrimitives('prism-compass').length + getVectorPrimitives('xiejian-seal').length;
  assert.equal([...slideXml.matchAll(/<p:sp>/g)].length, expectedShapes);
  assert.doesNotMatch(slideXml, /<p:pic>|svgBlip/);
});

test('/印鉴 command and natural phrasings return deterministic provenance seal digest in Agent router', () => {
  const emptyView = { design: null, dataset: null, report: null, resultPending: false };
  const ctx = { room: 'overview', light: illuminate(emptyView), traces: [] };
  const slashRes = route('/印鉴', ctx);
  assert.ok('turn' in slashRes);
  const flatText = slashRes.turn.lines.map(l => l.map(s => s.text).join('')).join('\n');
  assert.match(flatText, /EVX-9G-[0-9A-F]{4}-[0-9A-F]{4}/);
  assert.match(slashRes.turn.cards[0].title, /^核验印鉴 · EVX-9G-/);

  const naturalRes = route('查看九门印鉴', ctx);
  assert.ok('turn' in naturalRes);
  assert.equal(naturalRes.turn.cards[0].title, slashRes.turn.cards[0].title);
});
