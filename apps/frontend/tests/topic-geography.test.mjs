import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOPIC_REGION_CATALOG as catalog, getRegionByCode } from '../lib/topic-advisor/regions.ts';
import { geographicKey, parseProfileRegionFields, profileRegionStatus, assertProfileRegionExecutable, patternGeographyFit, matchesProfileGeography, profileMatchesGeography, eventRegionIncludesProfile } from '../lib/topic-advisor/geography.ts';

const ref = (code, catalogVersion = catalog.catalogVersion) => ({ code, catalogVersion });
const profile = (code, fields = {}) => ({ region: '', city: '', schemaVersion: 2, regionRef: ref(code), ...fields });
const constraints = (regionTags = [], cityTags = []) => ({ regionTags, cityTags });
const event = (level, region = '', city = '') => ({ level, region, city });
const vectors = JSON.parse(fs.readFileSync(new URL('../../../packages/evi-x-shared/fixtures/topic-region-v2.json', import.meta.url), 'utf8'));

test('shared authored-synthetic reference vectors bind the current catalog and reproduce every scope result', () => {
  assert.equal(vectors.schemaVersion, 1); assert.equal(vectors.dataClass, 'authored_synthetic'); assert.equal(vectors.catalogVersion, catalog.catalogVersion);
  assert.equal(new Set(vectors.cases.map(c => c.id)).size, vectors.cases.length);
  for (const c of vectors.cases) {
    const before = structuredClone(c);
    assert.equal(profileRegionStatus(c.profile), c.status, `${c.id}: status`);
    if (c.executable) assert.doesNotThrow(() => assertProfileRegionExecutable(c.profile), c.id);
    else assert.throws(() => assertProfileRegionExecutable(c.profile), /明确确认迁移/, c.id);
    for (const p of c.patterns) {
      assert.equal(patternGeographyFit(p, c.profile), p.fit, `${c.id}: ${JSON.stringify(p)}`);
      assert.equal(matchesProfileGeography(c.profile, p), p.constraint, `${c.id}: constraint`);
    }
    for (const p of c.places) assert.equal(profileMatchesGeography(c.profile, p.text), p.matches, `${c.id}: place ${p.text}`);
    for (const e of c.events) assert.equal(eventRegionIncludesProfile(c.profile, e.geography), e.included, `${c.id}: event ${JSON.stringify(e.geography)}`);
    assert.deepEqual(c, before, `${c.id}: pure inputs`);
  }
});

test('profile extension shape preserves old and unknown refs without silently upgrading legacy profiles', () => {
  assert.deepEqual(parseProfileRegionFields({ region: '湖北', city: '武汉' }), {});
  assert.deepEqual(parseProfileRegionFields({ schemaVersion: 2, regionRef: null }), { schemaVersion: 2, regionRef: null });
  const old = { schemaVersion: 2, regionRef: ref('511402', 'cn-admin-1988-history') }, before = structuredClone(old);
  assert.deepEqual(parseProfileRegionFields(old), old); assert.deepEqual(old, before); assert.equal(profileRegionStatus(old), 'migration_required');
  assert.deepEqual(parseProfileRegionFields({ schemaVersion: 2, regionRef: ref('999999') }).regionRef, ref('999999'));
});

test('one-sided, undefined, unknown-version, dynamic or extra reference fields are rejected', () => {
  for (const invalid of [
    { schemaVersion: 2 }, { regionRef: null }, { schemaVersion: undefined }, { regionRef: undefined },
    { schemaVersion: undefined, regionRef: undefined }, { schemaVersion: 2, regionRef: undefined },
    { schemaVersion: 1, regionRef: null }, { schemaVersion: '2', regionRef: null },
    { schemaVersion: 2, regionRef: { ...ref('420100'), label: '武汉市' } },
    { schemaVersion: 2, regionRef: { code: '４２０１００', catalogVersion: catalog.catalogVersion } },
    { schemaVersion: 2, regionRef: { code: 420100, catalogVersion: catalog.catalogVersion } },
    { schemaVersion: 2, regionRef: { code: '420100', catalogVersion: ' cn-admin-2025 ' } },
    { schemaVersion: 2, regionRef: { code: '420100', catalogVersion: `${catalog.catalogVersion}\n` } },
  ]) assert.throws(() => parseProfileRegionFields(invalid), JSON.stringify(invalid));
  let calls = 0; const accessor = { schemaVersion: 2 };
  Object.defineProperty(accessor, 'regionRef', { enumerable: true, get() { calls++; return null; } });
  assert.throws(() => parseProfileRegionFields(accessor)); assert.equal(calls, 0);
  assert.throws(() => parseProfileRegionFields({ schemaVersion: 2, regionRef: null, [Symbol('ref')]: true }));
  const hidden = { schemaVersion: 2, regionRef: null }; Object.defineProperty(hidden, 'hidden', { value: 1 }); assert.throws(() => parseProfileRegionFields(hidden));
});

test('legacy v1 retains NFKC and trim-only matching across all missing/known constraints', () => {
  const keys = ['', '湖北', ' 湖北 ', '湖北省', '武汉', '武汉市', '　Ｗｕｈａｎ　', 'Wuhan', 'Wu han', '\t武汉\n'];
  const legacy = (p, c) => {
    if (!c.regionTags.length && !c.cityTags.length) return 'transferable';
    let unknown = false;
    for (const [tags, value] of [[c.regionTags, p.region], [c.cityTags, p.city]]) {
      if (!tags.length) continue;
      if (!value) { unknown = true; continue; }
      if (!tags.some(t => t.normalize('NFKC').trim() === value.normalize('NFKC').trim())) return 'mismatch';
    }
    return unknown ? 'unknown' : 'exact';
  };
  for (const region of keys) for (const city of keys) for (const c of [constraints(), constraints(['湖北']), constraints([], ['武汉']), constraints(['湖北'], ['武汉']), constraints(['湖北省', '湖北'], ['武汉市', '武汉'])]) {
    const p = { region, city }; assert.equal(patternGeographyFit(c, p), legacy(p, c), JSON.stringify({ p, c }));
  }
  assert.equal(geographicKey(' Ｗｕｈａｎ '), 'Wuhan'); assert.equal(geographicKey('Wu han'), 'Wu han');
});

test('v2 uses canonical ancestry and explicit aliases, with no substring or arbitrary suffix stripping', () => {
  for (const [code, alias] of [['150000', '内蒙古'], ['450000', '广西'], ['540000', '西藏'], ['640000', '宁夏'], ['650000', '新疆'], ['810000', '香港'], ['820000', '澳门']]) {
    assert.equal(patternGeographyFit(constraints([alias]), profile(code)), 'exact');
    assert.equal(patternGeographyFit(constraints([getRegionByCode(code).name]), profile(code)), 'exact');
  }
  assert.equal(patternGeographyFit(constraints(['湖北'], ['武汉市']), profile('420106')), 'exact');
  for (const name of ['武', '汉', '武昌', '武汉市洪山区', '湖北武汉', '武 汉']) assert.equal(profileMatchesGeography(profile('420106'), name), false, name);
  assert.equal(profileMatchesGeography(profile('420106'), '　武汉　'), true);
  assert.equal(patternGeographyFit(constraints([], ['鄂托克前旗']), profile('150623')), 'exact');
  assert.equal(patternGeographyFit(constraints([], ['鄂托克前']), profile('150623')), 'mismatch');
});

test('province-direct counties and municipality paths do not invent intermediate prefectures', () => {
  assert.equal(patternGeographyFit(constraints(['新疆'], ['石河子市']), profile('659001')), 'exact');
  assert.equal(patternGeographyFit(constraints(['新疆'], ['石河子']), profile('659001')), 'mismatch');
  assert.equal(patternGeographyFit(constraints(['湖北'], ['神农架林区']), profile('429021')), 'exact');
  for (const [code, name] of [['110000', '北京'], ['120000', '天津'], ['310000', '上海'], ['500000', '重庆']]) assert.equal(patternGeographyFit(constraints([], [name]), profile(code)), 'exact');
  for (const [code, name] of [['710000', '台湾'], ['810000', '香港'], ['820000', '澳门']]) {
    assert.equal(patternGeographyFit(constraints([], [name]), profile(code)), 'unknown');
    assert.equal(eventRegionIncludesProfile(profile(code), event('city', name, name)), false);
  }
});

test('same-name counties require their real ancestors and explicit county event refs prevent parent confusion', () => {
  const beijing = profile('110105'), changchun = profile('220104');
  assert.equal(patternGeographyFit(constraints(['北京'], ['朝阳区']), beijing), 'exact');
  assert.equal(patternGeographyFit(constraints(['北京'], ['朝阳区']), changchun), 'mismatch');
  const countyEvent = { level: 'county', schemaVersion: 2, regionRef: ref('110105'), region: '北京', city: '朝阳区' };
  assert.equal(eventRegionIncludesProfile(beijing, countyEvent), true); assert.equal(eventRegionIncludesProfile(changchun, countyEvent), false);
  assert.equal(eventRegionIncludesProfile(beijing, { ...countyEvent, city: '北京市' }), true);
  assert.equal(eventRegionIncludesProfile(beijing, { ...countyEvent, region: '吉林' }), false);
  assert.equal(eventRegionIncludesProfile(beijing, { ...countyEvent, city: '朝阳' }), false);
});

test('same-province county-name ambiguity cannot rescue a different city while real city OR tags still match', () => {
  const nanjing = profile('320106'), xuzhou = profile('320302'), fuzhou = profile('350102');
  assert.equal(patternGeographyFit(constraints(['江苏'], ['鼓楼区']), xuzhou), 'mismatch');
  assert.equal(patternGeographyFit(constraints(['江苏'], ['南京', '鼓楼区']), xuzhou), 'mismatch');
  assert.equal(patternGeographyFit(constraints(['江苏'], ['南京', '鼓楼区']), nanjing), 'exact');
  assert.equal(patternGeographyFit(constraints(['江苏'], ['徐州', '鼓楼区']), xuzhou), 'exact');
  assert.equal(patternGeographyFit(constraints([], ['鼓楼区']), fuzhou), 'mismatch');
  assert.equal(patternGeographyFit(constraints(['福建'], ['鼓楼区']), fuzhou), 'exact');
  assert.equal(eventRegionIncludesProfile(xuzhou, event('city', '江苏', '鼓楼区')), false);
  assert.equal(eventRegionIncludesProfile(fuzhou, event('city', '', '鼓楼区')), false);
  assert.equal(eventRegionIncludesProfile(fuzhou, event('city', '福建', '鼓楼区')), true);
  assert.equal(eventRegionIncludesProfile(xuzhou, { level: 'county', schemaVersion: 2, regionRef: ref('320302'), region: '江苏', city: '鼓楼区' }), true);
  const legacy = { region: '江苏', city: '鼓楼区' };
  assert.equal(patternGeographyFit(constraints(['江苏'], ['鼓楼区']), legacy), 'exact');
  assert.equal(eventRegionIncludesProfile(legacy, event('city', '江苏', '鼓楼区')), true);
});

test('old or unknown refs never yield current local matches or automatically select historical successors', () => {
  const old = profile('511402', { regionRef: ref('511402', 'cn-admin-1988-history'), region: '四川', city: '枳城区' });
  assert.equal(profileRegionStatus(old), 'migration_required'); assert.equal(profileMatchesGeography(old, '东坡区'), false); assert.equal(profileMatchesGeography(old, '枳城区'), false);
  assert.equal(patternGeographyFit(constraints(['四川'], ['东坡区']), old), 'unknown');
  assert.equal(eventRegionIncludesProfile(old, event('province', '四川')), false); assert.throws(() => assertProfileRegionExecutable(old));
  const reused = profile('511402'); assert.equal(profileMatchesGeography(reused, '东坡区'), true); assert.equal(profileMatchesGeography(reused, '枳城区'), false);
  assert.equal(profileRegionStatus(profile('350625')), 'migration_required'); assert.equal(profileMatchesGeography(profile('350625'), '长泰区'), false);
});

test('a new catalog using the same code cannot silently rebind a saved old-version profile', () => {
  const syntheticCatalog = { ...catalog, catalogVersion: 'cn-admin-2026-synthetic', records: catalog.records.map(r => r.code === '511402' ? { ...r, name: '合成新版县名' } : r) };
  const old = profile('511402');
  assert.equal(profileRegionStatus(old, syntheticCatalog), 'migration_required'); assert.throws(() => assertProfileRegionExecutable(old, syntheticCatalog));
  assert.equal(profileMatchesGeography(old, '合成新版县名', syntheticCatalog), false);
  const confirmed = profile('511402', { regionRef: ref('511402', syntheticCatalog.catalogVersion) });
  assert.equal(profileRegionStatus(confirmed, syntheticCatalog), 'current'); assert.equal(profileMatchesGeography(confirmed, '合成新版县名', syntheticCatalog), true);
  assert.equal(profileMatchesGeography(confirmed, '东坡区', syntheticCatalog), false);
});

test('explicit v2 unset scope remains nonblocking without a local boost even if legacy strings or school are present', () => {
  const p = { region: '湖北', city: '武汉', school: '武汉大学', schemaVersion: 2, regionRef: null };
  assert.equal(profileRegionStatus(p), 'unset'); assert.equal(matchesProfileGeography(p, constraints(['山西'], ['晋城'])), true);
  assert.equal(patternGeographyFit(constraints(['湖北'], ['武汉']), p), 'unknown'); assert.equal(profileMatchesGeography(p, '武汉'), false);
  assert.equal(eventRegionIncludesProfile(p, event('province', '湖北')), false); assert.equal(eventRegionIncludesProfile(p, event('national')), true);
});

test('event inclusion requires a known scope and preserves the exact legacy city-tagged county compatibility', () => {
  const county = event('city', '山西', '阳城县');
  assert.equal(eventRegionIncludesProfile(profile('140522'), county), true); assert.equal(eventRegionIncludesProfile(profile('140500'), county), false);
  assert.equal(eventRegionIncludesProfile(profile('140524'), county), false); assert.equal(eventRegionIncludesProfile(profile('140000'), county), false);
  assert.equal(eventRegionIncludesProfile(profile('140522'), event('city', '山西', '阳城')), false);
  for (const p of [{ region: '', city: '' }, profile('420000'), { region: '湖北', city: '', schemaVersion: 2, regionRef: null }]) {
    assert.equal(eventRegionIncludesProfile(p, event('city', '湖北', '武汉')), false); assert.equal(eventRegionIncludesProfile(p, event('province', '')), false);
  }
  assert.throws(() => eventRegionIncludesProfile(profile('420106'), event('unknown', '湖北', '武汉')), /已知地区层级/);
  assert.throws(() => eventRegionIncludesProfile(profile('140522'), { level: 'county', region: '山西', city: '阳城县' }), /版本化地区引用/);
});

test('inputs are read only and dynamic tag arrays cannot broaden matches', () => {
  const p = Object.freeze(profile('420106', { regionRef: Object.freeze(ref('420106')) })), c = Object.freeze({ regionTags: Object.freeze(['湖北']), cityTags: Object.freeze(['武汉']) });
  assert.equal(patternGeographyFit(c, p), 'exact');
  let calls = 0; const tags = []; Object.defineProperty(tags, '0', { enumerable: true, get() { calls++; return '武汉'; } });
  assert.throws(() => patternGeographyFit({ regionTags: [], cityTags: tags }, p)); assert.equal(calls, 0);
  const sparse = []; sparse.length = 1; assert.throws(() => patternGeographyFit({ regionTags: [], cityTags: sparse }, p));
});
