import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as presentation from '../lib/county-evidence.ts';
import { EMPTY_TOPIC_PROFILE, ACCESS_OPTIONS } from '../lib/topic-advisor/types.ts';
import { TOPIC_REGION_CATALOG, getRegionByCode } from '../lib/topic-advisor/regions.ts';
import { prepareTopicPublication, applyTopicPublication, freshTopicPublication, TOPIC_PUBLICATION_UI_FIELDS, TOPIC_PUBLICATION_UI_CONTRACT } from '../lib/topic-publication.ts';

// Synthetic publication records only. Render the production TSX through the real React server renderer.
// These checks do not certify browser layout, keyboard behavior or publication of actual county data.
const require = createRequire(import.meta.url), ts = require('typescript');
const css = new Proxy({}, { get: (_target, key) => String(key) });
const code = ts.transpileModule(fs.readFileSync(new URL('../components/topic-advisor/CountyEvidencePanel.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const imports = { 'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/topic-advisor/types': { ACCESS_OPTIONS }, '@/lib/county-evidence': presentation, './CountyEvidencePanel.module.css': { __esModule: true, default: css } };
const box = { exports: {}, require: name => { assert.ok(name in imports, name); return imports[name]; } };
vm.runInNewContext(code, box);
const Panel = box.exports.default, clone = value => structuredClone(value), version = TOPIC_REGION_CATALOG.catalogVersion;
const profile = (code = '320106') => ({ ...clone(EMPTY_TOPIC_PROFILE), schemaVersion: 2, regionRef: code ? { code, catalogVersion: version } : null, region: '不参与匹配的旧文字', city: '不参与匹配的旧文字' });
const render = (p, records) => renderToStaticMarkup(createElement(Panel, { profile: p, published: records }));
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const marker = 'Synthetic historical record 🧭', proposed = 'Synthetic proposed investigation';
const now = '2026-10-15T10:00:00.000Z', readAt = '2026-10-15T08:00:00.000Z';
async function published(countyCode = '320106', suffix = 'one') {
  const sources = ['body', 'listing'].map(id => ({ id, title: `Synthetic ${id} source`, url: `https://example.gov.cn/${id}?from=county`, publishedAt: id === 'body' ? '2026-01-05' : null, retrievedAt: '2026-10-15', authority: 'Synthetic department self-report', locator: `Source locator ${id}`, supportedClaims: [id === 'body' ? marker : 'Synthetic historical listing'] }));
  const county = { id: `county-${countyCode}`, regionRef: { code: countyCode, catalogVersion: version }, displayName: getRegionByCode(countyCode).name, tags: [], facts: [
    { id: 'fact-body', text: marker, sourceIds: ['body'], temporalKind: 'historical_reference', asOfDate: null },
    { id: 'fact-listing', text: 'Synthetic historical listing', sourceIds: ['listing'], temporalKind: 'historical_reference', asOfDate: '2022-12-07' },
  ], directions: [{ id: 'direction-one', title: proposed, question: '哪些服务仍需验证？', decisionOwner: '拟沟通的服务负责人', decision: '比较服务说明的可理解性', population: '自愿参加的成年居民', requiredAccess: ['community_residents'], minimumEvidence: ['核实接触许可', '开展小范围认知访谈', '记录比较依据'], sourceIds: ['body'], classification: 'proposed' }], status: 'draft', gaps: ['当前服务与招募入口尚未核实'] };
  const pack = { schemaVersion: 1, id: `synthetic-${countyCode}-${suffix}`, contentVersion: 'test-1', catalogVersion: version, sources, profiles: [county] };
  const reads = sources.map(s => ({ sourceId: s.id, coverage: s.id === 'body' ? 'fulltext' : 'listing_only', readAt, locator: `Actually read locator ${s.id}`, supportedFactIds: [s.id === 'body' ? 'fact-body' : 'fact-listing'] }));
  const draft = await prepareTopicPublication(JSON.stringify(pack), 'synthetic-author', reads);
  const decision = { id: `synthetic-decision-${suffix}`, packId: pack.id, contentVersion: pack.contentVersion, packHash: draft.packHash, profileIds: [county.id], expectedPreviousHash: null, action: 'publish', ui: { contractVersion: TOPIC_PUBLICATION_UI_CONTRACT, fields: [...TOPIC_PUBLICATION_UI_FIELDS] }, reviews: draft.items.map(item => ({ id: `synthetic-review-${suffix}-${item.id}`, packId: pack.id, contentVersion: pack.contentVersion, packHash: draft.packHash, itemId: item.id, itemHash: item.itemHash, author: 'synthetic-author', reviewer: 'synthetic-reviewer', reviewedAt: '2026-10-15T09:00:00.000Z', decision: 'approve', scope: item.kind === 'direction' ? 'proposed' : item.id === 'fact-body' ? 'body_claim' : 'listing_entry' })) };
  return (await freshTopicPublication(await applyTopicPublication({ rawPack: draft.rawPack, author: draft.author, sourceReads: draft.sourceReads, history: [], decision, now })))[0];
}

test('production panel renders all six disclosure fields from a real synthetic publication without altering its draft', async () => {
  const record = await published(), p = profile(), before = clone({ record, p }), html = render(p, [record]), words = text(html);
  assert.match(html, /data-county-state="ready"/);
  assert.match(html, new RegExp(`data-publication-contract="${TOPIC_PUBLICATION_UI_CONTRACT}"`));
  for (const field of TOPIC_PUBLICATION_UI_FIELDS) assert.ok(html.includes(`data-evidence-field="${field}"`), field);
  for (const phrase of ['历史记录', marker, '历史参考', '拟议研究', proposed, '江苏省 · 南京市 · 鼓楼区', '已发布资料', '拟议研究的背景资料', '当前服务与招募入口尚未核实']) assert.ok(words.includes(phrase), phrase);
  assert.match(words, /事实日期 \/ 截止日：\s*尚未确认/);
  assert.match(words, /事实日期 \/ 截止日： 2022-12-07/);
  assert.ok(words.includes('来源发布 尚未确认'));
  assert.ok(words.includes('2026-01-05'));
  assert.ok(words.includes('2026-10-15 08:00:00.000 UTC'));
  assert.ok(words.includes('Source locator body') && words.includes('Actually read locator body'));
  assert.match(html, /href="https:\/\/example.gov.cn\/body\?from=county" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<(?:button|input|form)\b/);
  assert.ok(html.includes('<details') && html.includes('<summary'));
  assert.equal(record.profile.status, 'draft');
  assert.deepEqual({ record, p }, before);
});

test('legacy text, explicit unset, parent selections and invalid or historical refs never leak county content', async () => {
  const record = await published(), cases = [
    [{ ...clone(EMPTY_TOPIC_PROFILE), region: '江苏省', city: '鼓楼区' }, 'select_county'],
    [profile(null), 'select_county'], [profile('320000'), 'select_county'], [profile('320100'), 'select_county'],
    [{ ...profile(), regionRef: { code: '320106', catalogVersion: 'cn-admin-old' } }, 'stale'],
    [profile('999999'), 'stale'], [{ ...profile(), regionRef: { code: '320106' } }, 'invalid'],
    [{ ...profile(), schemaVersion: 1 }, 'invalid'],
  ];
  for (const [p, expected] of cases) {
    const html = render(p, [record]); assert.ok(html.includes(`data-county-state="${expected}"`), html);
    assert.ok(!html.includes(marker) && !html.includes(proposed) && !html.includes('example.gov.cn'));
  }
});

test('same-name counties and siblings are isolated by current code, while empty coverage does not claim no local problems', async () => {
  const nanjing = await published(), xuzhou = clone(await published('320302')); xuzhou.profile.facts[0].text = 'Only Xuzhou synthetic fact';
  const html = render(profile('320302'), [nanjing, xuzhou]);
  assert.ok(html.includes('Only Xuzhou synthetic fact') && !html.includes(marker));
  assert.ok(text(html).includes('江苏省 · 徐州市 · 鼓楼区'));
  const sibling = render(profile('320102'), [nanjing]); assert.ok(sibling.includes('data-county-state="empty"') && !sibling.includes(marker));
  assert.ok(text(sibling).includes('当前资料库尚未覆盖该地区'));
});

test('multiple current records for one county fail closed regardless of pack order, release hash or internal name', async () => {
  const first = await published(), second = await published('320106', 'two');
  for (const records of [[first, second], [second, first], [first, first]]) {
    const html = render(profile(), records); assert.ok(html.includes('data-county-state="ambiguous"'));
    for (const secret of [marker, proposed, 'example.gov.cn', first.packHash, second.releaseHash]) assert.ok(!html.includes(secret));
  }
});

test('old catalog records, unconfirmed wrapper states, mismatched canonical names and classification corruption cannot render facts', async () => {
  const record = await published();
  const old = clone(record); old.profile.regionRef.catalogVersion = 'cn-admin-old';
  assert.ok(render(profile(), [old]).includes('data-county-state="stale"'));
  for (const change of [r => { r.status = 'draft'; }, r => { r.profile.status = 'published'; }, r => { r.profile.displayName = '鼓楼'; }, r => { r.profile.facts[0].temporalKind = 'current'; }, r => { r.profile.directions[0].classification = 'actual'; }, r => { r.releaseHash = 'not-a-release-hash'; }]) {
    const invalid = clone(record); change(invalid); const html = render(profile(), [invalid]);
    assert.ok(html.includes('data-county-state="invalid"')); assert.ok(!html.includes(marker) && !html.includes(proposed));
  }
  assert.ok(render(profile(), [old, record]).includes('data-county-state="ready"'));
});

test('municipal direct counties and province-direct county cities resolve their actual canonical paths', async () => {
  for (const [countyCode, expected] of [['110105', '北京市 · 朝阳区'], ['429004', '湖北省 · 仙桃市']]) {
    const record = await published(countyCode), html = render(profile(countyCode), [record]);
    assert.ok(html.includes('data-county-state="ready"')); assert.ok(text(html).includes(expected));
    assert.ok(!text(html).includes('不参与匹配的旧文字'));
  }
});

test('source IDs alone never become full-text reads or fact support; source and read dates remain distinct', async () => {
  const record = clone(await published()); record.sourceReads = [];
  let html = render(profile(), [record]), words = text(html);
  assert.ok(words.includes('未登记实际阅读') && words.includes('未登记支持此事实') && words.includes('实际阅读 尚未确认'));
  assert.ok(!words.includes('已读原文') && !words.includes('已登记支持此事实'));
  assert.ok(words.includes('2026-01-05') && words.includes('2026-10-15'));
  assert.ok(!words.includes('2026-10-15 08:00'));
  record.sourceReads = [{ sourceId: 'body', coverage: 'fulltext', readAt, locator: 'read but not bound', supportedFactIds: [] }];
  const row = presentation.countySourceEvidence(record, ['body'], 'fact-body')[0];
  assert.equal(row.scopeLabel, '已读原文'); assert.equal(row.supportLabel, '未登记支持此事实');
  html = render(profile(), [record]); assert.ok(!text(html).includes('已登记支持此事实'));
});

test('listing-only scope is shown as a listing, unread/invalid/duplicate reads cannot imply support', async () => {
  const record = clone(await published());
  const listing = presentation.countySourceEvidence(record, ['listing'], 'fact-listing')[0];
  assert.equal(listing.coverage, 'listing_only'); assert.ok(listing.supportLabel.includes('仅限题录 / 名单'));
  const bodyRead = clone(record.sourceReads[0]);
  for (const reads of [[], [{ ...bodyRead, coverage: 'unread', readAt: null }], [{ ...bodyRead, readAt: null }], [{ ...bodyRead, readAt: '2026-10-14T08:00:00Z' }], [{ ...bodyRead, readAt: '2026-02-30T08:00:00Z' }], [bodyRead, bodyRead]]) {
    record.sourceReads = reads;
    const row = presentation.countySourceEvidence(record, ['body'], 'fact-body')[0];
    assert.ok(!row.supportLabel.startsWith('已登记')); assert.equal(row.readAt, null);
    assert.ok(row.coverage === 'unrecorded' || row.coverage === 'unread');
  }
});

test('missing/ambiguous sources and hostile links are displayed without executable citations or accidental support', async () => {
  const record = clone(await published());
  record.sources[0].url = 'javascript:alert(1)'; record.profile.facts[0].text = '<script>synthetic</script> 中文 🧭';
  let html = render(profile(), [record]);
  assert.ok(html.includes('&lt;script&gt;synthetic&lt;/script&gt; 中文 🧭')); assert.ok(!html.includes('href="javascript:'));
  record.sources.push(clone(record.sources[0]));
  const row = presentation.countySourceEvidence(record, ['body', 'body'], 'fact-body');
  assert.equal(row.length, 1); assert.equal(row[0].url, null); assert.equal(row[0].coverage, 'unrecorded');
  assert.ok(row[0].title.includes('来源记录缺失'));
  record.sources = []; html = render(profile(), [record]); assert.ok(text(html).includes('来源记录缺失'));
});

test('profile switches render synchronously without retaining another county facts or a prior ready view', async () => {
  const record = await published(), p = profile(), before = clone(record);
  assert.ok(render(p, [record]).includes(marker));
  for (const next of [profile('320302'), profile(null), { ...p, regionRef: { ...p.regionRef, catalogVersion: 'cn-admin-old' } }]) assert.ok(!render(next, [record]).includes(marker));
  assert.ok(render(p, [record]).includes(marker)); assert.deepEqual(record, before);
});
