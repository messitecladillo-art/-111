import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiterature, mergeRecords, detectFormat, referenceKey, normalizeDoi } from '../lib/topic-lab/parse.ts';
import { termKey, parseThesaurus, buildTermIndex, defaultSource } from '../lib/topic-lab/terms.ts';
import { louvain, buildTermMap, cooccurrence } from '../lib/topic-lab/network.ts';
import { corpusYears, termTrend } from '../lib/topic-lab/trend.ts';
import { paperGraph, topCitedReferences } from '../lib/topic-lab/papers.ts';
import { layoutCloud, fontScale } from '../lib/topic-lab/wordcloud.ts';
import { hypergeomLowerTail, benjaminiHochberg, gapCandidates, matchTitleTerms, evaluateTopic, similarAwardCases, titleFeature, awardFeatureBase, awardCaseRecords, logGamma } from '../lib/topic-lab/evaluate.ts';
import { awardCases } from '../data/award-cases.ts';

// All bibliographic records below are synthetic test fixtures (titles like "Synthetic …"); none are real papers.
const wos = `FN Clarivate Analytics Web of Science
VR 1.0
PT J
AU Alpha, A
   Beta, B
TI Synthetic study of electric vehicles and
   charging behaviour
SO SYNTHETIC JOURNAL
DE Electric vehicles; Charging infrastructure; Consumer adoption
ID ELECTRIC VEHICLE; ADOPTION
AB A synthetic abstract.
CR Gamma C, 2010, SYNTH J, V1, P1, DOI 10.1000/abc.1
   Delta D, 2012, SYNTH REV, V2, P3
TC 12
PY 2021
DI 10.1000/xyz.9
ER

PT J
AU Gamma, C
TI Synthetic smart grid pricing
SO SYNTHETIC ENERGY
DE smart grids; pricing
CR Gamma C, 2010, SYNTH J, V1, P1, DOI 10.1000/ABC.1
TC 3
PY 2023
ER
EF`;

const ris = `TY  - JOUR
AU  - 示例作者
TI  - 合成样例：上海市预制菜消费意愿
T2  - 合成期刊
PY  - 2022
KW  - 预制菜
KW  - 消费意愿
DO  - 10.1000/RIS.1
ER  -
`;

const bib = `@article{synth1,
  title = {Synthetic {Topic} Modelling of Policy},
  author = {Alpha, A and Beta, B},
  journal = {Synthetic Letters},
  year = {2020},
  keywords = {policy; topic model},
  Times-Cited = {7},
  Cited-References = {Gamma C, 2010, SYNTH J, V1, P1, DOI 10.1000/abc.1
Zeta Z, 2015, SYNTH Q, V3, P9},
  doi = {10.1000/bib.1}
}`;

const refworks = `RT Journal Article
SR 1
A1 示例甲;示例乙
T1 合成样例：Z世代国潮消费研究
JF 合成学报
YR 2024
vo 12
K1 Z世代;国潮;消费偏好
AB 合成摘要。
DS CNKI
`;

const endnote = `%0 Journal Article
%A 示例丙
%T 合成样例：乡村旅游满意度
%J 合成旅游
%D 2019
%K 乡村旅游;满意度
%X 合成摘要。
`;

test('format detection covers the five supported exports and rejects unknown text', () => {
  assert.equal(detectFormat(wos), 'wos');
  assert.equal(detectFormat(ris), 'ris');
  assert.equal(detectFormat(bib), 'bibtex');
  assert.equal(detectFormat(refworks), 'refworks');
  assert.equal(detectFormat(endnote), 'endnote');
  assert.equal(detectFormat('hello world'), 'unknown');
  const r = parseLiterature('hello world');
  assert.equal(r.records.length, 0);
  assert.match(r.warnings[0], /无法识别/);
});

test('Web of Science plain text keeps wrapped titles, per-line authors, refs and times cited', () => {
  const { records, format } = parseLiterature(wos);
  assert.equal(format, 'wos');
  assert.equal(records.length, 2);
  const [a, b] = records;
  assert.equal(a.title, 'Synthetic study of electric vehicles and charging behaviour');
  assert.deepEqual(a.authors, ['Alpha, A', 'Beta, B']);
  assert.deepEqual(a.keywords, ['Electric vehicles', 'Charging infrastructure', 'Consumer adoption']);
  assert.deepEqual(a.keywordsPlus, ['ELECTRIC VEHICLE', 'ADOPTION']);
  assert.equal(a.year, 2021);
  assert.equal(a.citations, 12);
  assert.equal(a.doi, '10.1000/xyz.9');
  assert.equal(a.refs.length, 2);
  // The same cited work keys identically whatever the DOI case.
  assert.equal(a.refs[0], b.refs[0]);
  assert.equal(a.refs[0], 'doi:10.1000/abc.1');
  assert.equal(a.refs[1], 'DELTA D|2012|SYNTH REV');
});

test('RIS, BibTeX, RefWorks and EndNote map their fields without inventing missing ones', () => {
  const r = parseLiterature(ris).records[0];
  assert.equal(r.title, '合成样例：上海市预制菜消费意愿');
  assert.deepEqual(r.keywords, ['预制菜', '消费意愿']);
  assert.equal(r.year, 2022);
  assert.equal(r.doi, '10.1000/ris.1');
  assert.equal(r.citations, null);
  const b = parseLiterature(bib).records[0];
  assert.equal(b.title, 'Synthetic Topic Modelling of Policy');
  assert.equal(b.citations, 7);
  assert.equal(b.refs.length, 2);
  assert.deepEqual(b.authors, ['Alpha, A', 'Beta, B']);
  const w = parseLiterature(refworks).records[0];
  assert.equal(w.title, '合成样例：Z世代国潮消费研究');
  assert.deepEqual(w.keywords, ['Z世代', '国潮', '消费偏好']);
  assert.equal(w.year, 2024);
  assert.equal(w.source, '合成学报');
  const e = parseLiterature(endnote).records[0];
  assert.equal(e.title, '合成样例：乡村旅游满意度');
  assert.deepEqual(e.keywords, ['乡村旅游', '满意度']);
  assert.equal(e.year, 2019);
});

test('merge removes duplicates by DOI and by title + year', () => {
  const a = parseLiterature(wos).records, b = parseLiterature(wos).records;
  const merged = mergeRecords([a, b]);
  assert.equal(merged.records.length, 2);
  assert.equal(merged.duplicates, 2);
  assert.deepEqual(merged.records.map(r => r.id), ['p0', 'p1']);
});

test('reference keys and DOIs normalize', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1234/ABC.def.'), '10.1234/abc.def');
  assert.equal(referenceKey('Smith J, 2001, J TEST, V1, P2'), 'SMITH J|2001|J TEST');
});

test('term keys fold width, case and simple English plurals but keep Chinese and protected words', () => {
  assert.equal(termKey('Electric Vehicles'), 'electric vehicle');
  assert.equal(termKey('policies'), 'policy');
  assert.equal(termKey('Analysis'), 'analysis');
  assert.equal(termKey('Smart Grids'), 'smart grid');
  assert.equal(termKey('data'), 'data');
  assert.equal(termKey('上海市'), '上海市');
  assert.equal(termKey('Ｚ世代'), 'z世代');
  assert.equal(termKey('“预制菜”'), '预制菜');
});

test('thesaurus lines become synonyms or exclusions', () => {
  const { synonyms, exclude } = parseThesaurus('EVs => electric vehicle\n# comment\nchina\n新能源汽车 → 电动汽车');
  assert.equal(synonyms.get('ev'), 'electric vehicle');
  assert.equal(synonyms.get('新能源汽车'), '电动汽车');
  assert.ok(exclude.has('china'));
  assert.equal(exclude.size, 1);
});

/** A deterministic synthetic corpus with two planted topics and a planted trend. */
function synthCorpus() {
  const recs = [];
  let id = 0;
  const add = (year, keywords, citations = 0, refs = []) => recs.push({ id: `p${id++}`, title: `Synthetic record ${id}`, authors: [], year, source: 'SYNTH', keywords, keywordsPlus: [], abstract: '', citations, doi: '', refs, refLabels: refs, format: 'wos' });
  for (let i = 0; i < 40; i++) add(2014 + (i % 6), ['electric vehicle', 'charging', i % 2 ? 'consumer adoption' : 'policy'], i, ['R1', 'R2', `X${i}`]);
  for (let i = 0; i < 40; i++) add(2014 + (i % 6), ['rural tourism', 'satisfaction', i % 2 ? 'homestay' : 'policy'], i, ['R7', 'R8', `Y${i}`]);
  // Recent window: "digital twin" appears only recently.
  for (let i = 0; i < 30; i++) add(2021 + (i % 3), ['digital twin', i % 2 ? 'electric vehicle' : 'rural tourism'], 1, ['R1', `Z${i}`]);
  return recs;
}

test('document frequencies count each term once per record', () => {
  const recs = synthCorpus();
  recs[0].keywords.push('Charging');
  const idx = buildTermIndex(recs, { source: 'keywords' });
  assert.equal(idx.terms.get('charging').df, 40);
  assert.equal(idx.terms.get('electric vehicle').df, 55);
  assert.equal(defaultSource(recs), 'keywords');
});

test('Louvain is deterministic and separates two dense groups joined by a weak bridge', () => {
  const edges = [[0, 1, 5], [1, 2, 5], [0, 2, 5], [3, 4, 5], [4, 5, 5], [3, 5, 5], [2, 3, 1]];
  const a = louvain(6, edges), b = louvain(6, edges);
  assert.deepEqual(a, b);
  assert.equal(a[0], a[1]); assert.equal(a[1], a[2]);
  assert.equal(a[3], a[4]); assert.equal(a[4], a[5]);
  assert.notEqual(a[0], a[3]);
});

test('keyword map clusters the planted topics and reports association strength', () => {
  const idx = buildTermIndex(synthCorpus(), { source: 'keywords' });
  const map = buildTermMap(idx, { minDf: 2 });
  const c = k => map.nodes.find(n => n.key === k).cluster;
  assert.equal(c('electric vehicle'), c('charging'));
  assert.equal(c('rural tourism'), c('satisfaction'));
  assert.notEqual(c('charging'), c('satisfaction'));
  const i = map.nodes.findIndex(n => n.key === 'charging'), j = map.nodes.findIndex(n => n.key === 'satisfaction');
  assert.ok(!map.links.some(l => (l.a === i && l.b === j) || (l.a === j && l.b === i)));
  const link = map.links.find(l => [l.a, l.b].includes(map.nodes.findIndex(n => n.key === 'electric vehicle')) && [l.a, l.b].includes(i));
  // strength = c · N / (df_a · df_b) = 40 · 110 / (55 · 40)
  assert.ok(Math.abs(link.strength - 40 * 110 / (55 * 40)) < 1e-9);
  assert.deepEqual(buildTermMap(idx, { minDf: 2 }).nodes.map(n => [n.x, n.y]), map.nodes.map(n => [n.x, n.y]));
  for (const n of map.nodes) { assert.ok(n.x >= 0 && n.x <= 1); assert.ok(n.y >= 0 && n.y <= 1); }
});

test('co-occurrence counts pairs once per record', () => {
  const co = cooccurrence([['a', 'b', 'c'], ['a', 'b'], ['c']], ['a', 'b', 'c']);
  assert.equal(co.get(0 * 3 + 1), 2);
  assert.equal(co.get(0 * 3 + 2), 1);
  assert.equal(co.get(1 * 3 + 2), 1);
});

test('trend test flags a term concentrated in the recent window and not a flat one', () => {
  const idx = buildTermIndex(synthCorpus(), { source: 'keywords' });
  const cy = corpusYears(idx, 3, new Date('2030-01-01'));
  assert.equal(cy.recentFrom, 2021);
  assert.equal(cy.usable, true);
  assert.equal(termTrend(idx, 'digital twin', cy).signal, 'rising');
  assert.equal(termTrend(idx, 'charging', cy).signal, 'falling');
  // z by hand for "digital twin": recent 30/30, early 0/80.
  const t = termTrend(idx, 'digital twin', cy), p = 30 / 110, se = Math.sqrt(p * (1 - p) * (1 / 30 + 1 / 80));
  assert.ok(Math.abs(t.z - 1 / se) < 1e-9);
  const small = buildTermIndex(synthCorpus().slice(0, 30), { source: 'keywords' });
  assert.equal(termTrend(small, 'charging', corpusYears(small)).signal, 'insufficient');
});

test('paper graph uses bibliographic coupling when references exist and cosine weights', () => {
  const recs = synthCorpus(), idx = buildTermIndex(recs, { source: 'keywords' });
  const g = paperGraph(recs, idx.docs, { max: 60 });
  assert.equal(g.mode, 'coupling');
  const l = g.links[0], a = recs[g.nodes[l.a].index], b = recs[g.nodes[l.b].index];
  const shared = a.refs.filter(r => b.refs.includes(r)).length;
  assert.equal(l.shared, shared);
  assert.ok(Math.abs(l.weight - shared / Math.sqrt(a.refs.length * b.refs.length)) < 1e-9);
  const noRefs = recs.map(r => ({ ...r, refs: [], refLabels: [] }));
  assert.equal(paperGraph(noRefs, idx.docs).mode, 'keywords');
  const top = topCitedReferences(recs, 3);
  assert.equal(top[0].key, 'R1');
  assert.equal(top[0].count, 70);
});

test('word cloud never overlaps, keeps inside the canvas, and reports what did not fit', () => {
  const measure = (t, s) => ({ w: t.length * s * .6, h: s });
  const items = Array.from({ length: 80 }, (_, i) => ({ key: `k${i}`, label: `term${i}`, weight: 80 - i }));
  const { placed, dropped } = layoutCloud(items, { width: 600, height: 360, measure });
  assert.equal(placed.length + dropped.length, 80);
  for (const p of placed) { assert.ok(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 600); assert.ok(p.y - p.h / 2 >= 0 && p.y + p.h / 2 <= 360); }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.y - b.y) * 2 >= a.h + b.h);
  }
  assert.deepEqual(layoutCloud(items, { width: 600, height: 360, measure }).placed, placed);
  const s = fontScale([1, 100], 10, 50);
  assert.equal(s(1), 10); assert.equal(s(100), 50);
  // Area (∝ size²) grows linearly with weight above the floor: √w scaling.
  assert.ok(Math.abs((s(25) - 10) / 40 - (5 - 1) / 9) < 1e-9);
});

test('hypergeometric lower tail matches a hand calculation and Fisher limits', () => {
  // N=10, K=4, n=5: P(X=0)=C(6,5)/C(10,5)=6/252, P(X=1)=C(4,1)C(6,4)/252=60/252
  assert.ok(Math.abs(hypergeomLowerTail(0, 10, 4, 5) - 6 / 252) < 1e-12);
  assert.ok(Math.abs(hypergeomLowerTail(1, 10, 4, 5) - 66 / 252) < 1e-12);
  assert.equal(hypergeomLowerTail(4, 10, 4, 5), 1);
  assert.ok(Math.abs(logGamma(10) - Math.log(362880)) < 1e-9);
  // Large N stays finite.
  const p = hypergeomLowerTail(0, 20000, 800, 900);
  assert.ok(p >= 0 && p < 1e-10);
});

test('Benjamini–Hochberg adjusts in rank order and stays monotone', () => {
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.2]);
  assert.deepEqual(q.map(v => +v.toFixed(4)), [0.04, 0.0533, 0.0533, 0.2]);
});

test('gap candidates find planted under-combined pairs and not co-occurring ones', () => {
  const idx = buildTermIndex(synthCorpus(), { source: 'keywords' });
  const gaps = gapCandidates(idx, { minDf: 5 });
  assert.ok(gaps.tested > 0);
  const pair = (x, y) => gaps.candidates.find(c => (c.a.key === x && c.b.key === y) || (c.a.key === y && c.b.key === x));
  const g = pair('charging', 'satisfaction');
  assert.ok(g, 'two planted topics never co-occur');
  assert.equal(g.observed, 0);
  assert.ok(Math.abs(g.expected - 40 * 40 / 110) < 1e-9);
  assert.ok(g.q <= .05);
  assert.equal(pair('electric vehicle', 'charging'), undefined);
  for (const c of gaps.candidates) assert.ok(c.ratio <= .5);
});

test('candidate topics match corpus terms, prefer specific phrases and report novelty honestly', () => {
  const recs = synthCorpus(), idx = buildTermIndex(recs, { source: 'keywords' }), cy = corpusYears(idx, 3, new Date('2030-01-01'));
  const terms = matchTitleTerms(idx, 'Digital twin for rural tourism homestays');
  assert.deepEqual([...terms].sort(), ['digital twin', 'homestay', 'rural tourism']);
  const ev = evaluateTopic({ title: 'Digital twin for rural tourism homestays', terms }, { index: idx, cy, cases: [] });
  assert.equal(ev.base.status, 'ok');
  assert.equal(ev.novelty.kind, 'none');
  assert.equal(ev.novelty.joint, 0);
  assert.ok(ev.trend.rising.includes('digital twin'));
  assert.equal(ev.feasibility.status, 'unknown');
  const crowded = evaluateTopic({ title: 'x', terms: ['electric vehicle', 'charging'] }, { index: idx, cy, cases: [] });
  assert.equal(crowded.novelty.kind, 'crowded');
  assert.equal(crowded.novelty.status, 'attention');
  const noCorpus = evaluateTopic({ title: '北京市老年人智慧养老需求', terms: [] }, { index: null, cy: null, cases: awardCases });
  assert.equal(noCorpus.base.status, 'unknown');
  assert.equal(noCorpus.novelty.status, 'unknown');
  for (const k of Object.keys(noCorpus)) assert.ok(!/probab|概率/i.test(k));
});

test('award-title reference is descriptive, sourced, and counts only official verified titles', () => {
  const base = awardFeatureBase(awardCases);
  const official = awardCases.filter(c => c.verification === 'official_verified').length;
  for (const f of base.features) { assert.equal(f.total, official); assert.ok(f.withFeature <= official); }
  assert.equal(titleFeature('银发出行——北京市老年人网约车使用意愿研究', 'hook'), '银发出行');
  assert.equal(titleFeature('北京市老年人网约车使用意愿研究', 'place'), '北京');
  assert.equal(titleFeature('北京市老年人网约车使用意愿研究', 'population'), '老年人');
  assert.equal(titleFeature('网约车研究', 'population'), null);
  const sim = similarAwardCases('北京市老旧小区改造居民满意度研究', awardCases);
  assert.ok(sim.length > 0);
  assert.match(sim[0].title, /老旧小区/);
  assert.ok(sim[0].sharedTags.includes('老旧小区改造'));
  assert.ok(sim[0].sourceUrl.startsWith('https://'));
  const ev = evaluateTopic({ title: '旧貌换新颜，老宅化美居——北京市老旧小区改造的居民满意度与需求意愿调研', terms: [] }, { index: null, cy: null, cases: awardCases });
  assert.equal(ev.award.status, 'attention');
  assert.ok(ev.award.nearDuplicate);
  const recs = awardCaseRecords(awardCases);
  assert.equal(recs.length, awardCases.length);
  assert.ok(recs.every(r => r.format === 'library' && r.citations === null && r.refs.length === 0));
  assert.ok(!recs.some(r => r.keywords.some(k => /题名/.test(k))));
});

import { kleinberg, strongestBursts } from '../lib/topic-lab/burst.ts';
import { betweenness, modularity, silhouette } from '../lib/topic-lab/metrics.ts';
import { cocitationGraph, refShortLabel, refYear, referenceYearSeries } from '../lib/topic-lab/papers.ts';

test('Kleinberg bursts find a planted spike and ignore a flat series', () => {
  const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];
  const d = years.map(() => 100);
  assert.deepEqual(kleinberg([5, 5, 5, 5, 5, 5, 5, 5], d, years), []);
  const b = kleinberg([2, 2, 2, 20, 22, 2, 2, 2], d, years);
  assert.equal(b.length, 1);
  assert.equal(b[0].begin, 2018);
  assert.equal(b[0].end, 2019);
  assert.ok(b[0].strength > 0);
  // A higher entry cost (γ) can only suppress or shorten bursts.
  assert.ok(kleinberg([2, 2, 2, 6, 2, 2, 2, 2], d, years, { gamma: 4 }).length <= kleinberg([2, 2, 2, 6, 2, 2, 2, 2], d, years, { gamma: .5 }).length);
  const idx = buildTermIndex(synthCorpus(), { source: 'keywords' });
  const totals = new Map(); for (const r of idx.records) totals.set(r.year, (totals.get(r.year) ?? 0) + 1);
  const { rows, years: span } = strongestBursts([...idx.terms.values()], totals);
  assert.equal(span[0], 2014); assert.equal(span[span.length - 1], 2023);
  assert.equal(rows[0].key, 'digital twin');
  assert.equal(rows[0].burst.end, 2023);
});

test('betweenness, modularity and silhouette match textbook cases', () => {
  // Path 0-1-2: the middle node lies on the only path between the ends.
  assert.deepEqual(betweenness(3, [[0, 1, 1], [1, 2, 1]]), [0, 1, 0]);
  // Star with centre 0.
  const star = betweenness(5, [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]]);
  assert.equal(star[0], 1); assert.equal(star[1], 0);
  // Two disjoint triangles split perfectly: Q = 2 · (3/6 − (6/12)²) = 0.5.
  const tri = [[0, 1, 1], [1, 2, 1], [0, 2, 1], [3, 4, 1], [4, 5, 1], [3, 5, 1]];
  assert.ok(Math.abs(modularity(tri, [0, 0, 0, 1, 1, 1]) - .5) < 1e-12);
  assert.ok(Math.abs(modularity(tri, [0, 0, 0, 0, 0, 0])) < 1e-12);
  const s = silhouette(6, tri, [0, 0, 0, 1, 1, 1], [1, 1, 1, 1, 1, 1]);
  assert.ok(s.mean > .9);
  assert.ok(silhouette(6, tri, [0, 1, 0, 1, 0, 1], [1, 1, 1, 1, 1, 1]).mean < 0);
  const map = buildTermMap(buildTermIndex(synthCorpus(), { source: 'keywords' }), { minDf: 2 });
  // "policy" is planted in both topics, so it is the bridge with the highest betweenness.
  const top = [...map.nodes].sort((a, b) => b.centrality - a.centrality)[0];
  assert.equal(top.key, 'policy');
  assert.ok(map.modularity > .2 && map.modularity < .5);
  assert.ok(map.clusterInfo.every(c => c.size > 0 && c.label));
  for (const n of map.nodes) assert.ok(n.centrality >= 0 && n.centrality <= 1);
});

test('co-citation links references cited together and keeps labels readable', () => {
  assert.equal(refShortLabel('COLLINS AM, 2007, J VERB LEARN, V8, P240'), 'Collins 2007');
  assert.equal(refYear('Collins AM, 2007, J VERB LEARN, V8, P240'), 2007);
  const recs = synthCorpus();
  const g = cocitationGraph(recs, { top: 20 });
  const i1 = g.nodes.findIndex(n => n.key === 'R1'), i2 = g.nodes.findIndex(n => n.key === 'R2'), i7 = g.nodes.findIndex(n => n.key === 'R7');
  const link = (a, b) => g.links.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  assert.equal(link(i1, i2).shared, 40);
  assert.ok(Math.abs(link(i1, i2).weight - 40 / Math.sqrt(70 * 40)) < 1e-9);
  assert.equal(link(i1, i7), undefined);
  assert.equal(g.nodes[i1].cluster, g.nodes[i2].cluster);
  assert.notEqual(g.nodes[i1].cluster, g.nodes[i7].cluster);
  const { series, totals } = referenceYearSeries(recs, [{ key: 'R1', label: 'R1' }]);
  assert.equal([...series[0].byYear.values()].reduce((a, b) => a + b, 0), 70);
  assert.equal([...totals.values()].reduce((a, b) => a + b, 0), 110);
});

import { pathfinder } from '../lib/topic-lab/metrics.ts';
test('Pathfinder keeps the union of maximum spanning trees', () => {
  // Triangle with one weak side: the weak link is redundant (a stronger path exists).
  assert.deepEqual(pathfinder(3, [[0, 1, 5], [1, 2, 4], [0, 2, 1]]), [0, 1]);
  // Equal weights: every link lies on some spanning tree, so all survive.
  assert.deepEqual(pathfinder(3, [[0, 1, 2], [1, 2, 2], [0, 2, 2]]), [0, 1, 2]);
  const map = buildTermMap(buildTermIndex(synthCorpus(), { source: 'keywords' }), { minDf: 2 });
  assert.ok(map.backbone.length >= map.nodes.filter(n => n.cluster >= 0).length - 1);
  assert.ok(map.backbone.length <= map.totalLinks);
});
