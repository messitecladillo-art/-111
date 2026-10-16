import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TOPIC_REGION_CATALOG as catalog, parseRegionCatalog, searchRegions, resolveLegacyRegion, regionPath, validateRegionRef, getRegionByCode } from '../lib/topic-advisor/regions.ts';

const ref = code => ({ code, catalogVersion: catalog.catalogVersion });
const copy = () => structuredClone(catalog);

test('fixed CC0 source hashes and effective annual nodes reproduce independently', async () => {
  const root = new URL('../../../corpus-source/topic-advisor/regions/', import.meta.url);
  const metadata = JSON.parse(await readFile(new URL('source.json', root), 'utf8'));
  assert.equal(metadata.commit, 'e2c2b2e1fb4ce1fb76e879aa0b80e229adaf950c');
  assert.equal(metadata.license, 'CC0-1.0');
  for (const file of metadata.files) {
    const raw = await readFile(new URL(file.path, root));
    assert.equal(raw.byteLength, file.bytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), file.sha256);
  }
  const source = JSON.parse(await readFile(new URL('areacodes-2025.raw.json', root), 'utf8'));
  const nodes = [];
  const visit = (items, parent = null) => { for (const item of items) { nodes.push({ item, parent }); if (item.children) visit(item.children, String(item.code)); } };
  visit(source.items);
  const effective = nodes.filter(({ item }) => item.start <= 2025 && (item.end === undefined || item.end > 2025));
  assert.equal(nodes.length, 6824);
  assert.equal(effective.length, 3212);
  assert.equal(catalog.records.length, 3212);
  const actual = new Map(catalog.records.map(r => [r.code, r]));
  for (const { item, parent } of effective) {
    const row = actual.get(String(item.code));
    assert.ok(row);
    assert.equal(row.name, item.name);
    assert.equal(row.parentCode, parent);
  }
  assert.deepEqual([catalog.coverage.provinceCount, catalog.coverage.prefectureCount, catalog.coverage.countyCount], [34, 333, 2845]);
  assert.equal(catalog.historicalNames.length, 3612);
  assert.equal(catalog.source.verification, 'community_compilation_official_full_recheck_pending');
  assert.equal(catalog.asOf, '2025-12-31');
});

test('offline regeneration detects drift without network or source changes', () => {
  const result = spawnSync(process.execPath, ['scripts/sync-topic-regions.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).countyCount, 2845);
});

test('code and exact name search keep same-name counties distinct and filter by ancestors', () => {
  const matches = searchRegions('朝阳区');
  assert.deepEqual(matches.map(r => r.code), ['110105', '220104']);
  assert.equal(searchRegions('朝阳区', '220000')[0].code, '220104');
  assert.equal(searchRegions('朝阳区', ref('110000'))[0].code, '110105');
  assert.equal(searchRegions('420106')[0].name, '武昌区');
  assert.equal(searchRegions('４２０１０６')[0].code, '420106');
  assert.equal(searchRegions('内蒙古')[0].code, '150000');
  assert.ok(searchRegions('42', null, 100).every(r => r.code.startsWith('42')));
});

test('blank queries expose actual immediate children without virtual prefectures', () => {
  assert.equal(searchRegions('', null, 100).length, 34);
  const hubei = searchRegions('', '420000', 100);
  assert.ok(hubei.some(r => r.code === '420100' && r.level === 'prefecture'));
  assert.ok(hubei.some(r => r.code === '429004' && r.level === 'county'));
  assert.ok(!hubei.some(r => r.code === '429000'));
  assert.equal(searchRegions('', '110000', 100).length, 16);
});

test('municipalities, province-direct counties, flags and forest districts retain their real paths', () => {
  assert.deepEqual(regionPath('110101').map(r => r.code), ['110000', '110101']);
  assert.deepEqual(regionPath('500155').map(r => r.code), ['500000', '500155']);
  assert.deepEqual(regionPath('429004').map(r => r.code), ['420000', '429004']);
  assert.deepEqual(regionPath('659001').map(r => r.code), ['650000', '659001']);
  assert.equal(getRegionByCode('429021').name, '神农架林区');
  assert.equal(getRegionByCode('150623').level, 'county');
  assert.equal(getRegionByCode('150623').name, '鄂托克前旗');
  assert.deepEqual(regionPath(ref('150623')).map(r => r.level), ['province', 'prefecture', 'county']);
});

test('county-to-district names return explicit historical candidates, never a persisted reference', () => {
  const matches = searchRegions('长泰县');
  assert.equal(matches[0].code, '350605');
  assert.equal(matches[0].name, '长泰区');
  assert.equal(matches[0].match, 'historical');
  assert.equal(matches[0].requiresConfirmation, true);
  assert.ok(!('ref' in matches[0]));
  assert.equal(searchRegions('350625')[0].code, '350605');
  assert.throws(() => validateRegionRef(ref('350625')), /未在该目录/);
});

test('historical split is represented as multiple possible destinations', () => {
  const historic = catalog.historicalNames.find(r => r.code === '130103' && r.startYear === 1983);
  assert.deepEqual(historic.candidateCodes, ['130102', '130104']);
  const matches = searchRegions('130103', '130100');
  assert.deepEqual(matches.map(r => r.code), ['130102', '130104']);
  assert.ok(matches.every(r => r.requiresConfirmation && r.match === 'historical'));
  const migrated = resolveLegacyRegion('河北', '130103');
  assert.equal(migrated.status, 'ambiguous');
  assert.equal(migrated.candidates.length, 2);
  // A still-active code keeps its current meaning despite past transfers of territory.
  assert.deepEqual(searchRegions('130123').map(r => r.code), ['130123']);
});

test('legacy province/city inputs only offer candidates and never infer a county', () => {
  const migrated = resolveLegacyRegion('湖北', '武汉');
  assert.equal(migrated.status, 'candidates');
  assert.equal(migrated.requiresConfirmation, true);
  assert.deepEqual(migrated.candidates.map(r => r.code), ['420100']);
  assert.ok(migrated.candidates.every(r => r.level === 'prefecture' && r.requiresConfirmation));
  assert.equal(resolveLegacyRegion('', '朝阳区').status, 'ambiguous');
  assert.equal(resolveLegacyRegion('湖北', '苏州').status, 'unmatched');
  assert.equal(resolveLegacyRegion('不明省', '武汉').status, 'unmatched');
  assert.equal(resolveLegacyRegion('', '').status, 'empty');
  assert.equal(resolveLegacyRegion('湖北省', '').candidates[0].level, 'province');
});

test('reused numeric codes do not merge unrelated historical entities', () => {
  const historic = (code, name) => catalog.historicalNames.find(r => r.code === code && r.name === name);
  assert.deepEqual(historic('511402', '枳城区').candidateCodes, ['500102']);
  assert.equal(getRegionByCode('511402').name, '东坡区');
  assert.deepEqual(searchRegions('枳城区').map(r => r.code), ['500102']);
  assert.deepEqual(historic('421024', '松滋县').candidateCodes, ['421087']);
  assert.equal(getRegionByCode('421024').name, '江陵县');
  assert.deepEqual(historic('419001', '义马市').candidateCodes, ['411281']);
  assert.equal(getRegionByCode('419001').name, '济源市');
  assert.deepEqual(historic('132201', '南宫市').candidateCodes, ['130581']);
  assert.ok(!historic('132201', '邢台市').candidateCodes.includes('130581'));
  assert.ok(historic('132201', '邢台市').candidateCodes.length > 0);
});

test('a county cannot be reassigned to another prefecture within the same province', () => {
  const fixture = copy();
  fixture.records.find(r => r.code === '420106').parentCode = '420200';
  assert.throws(() => parseRegionCatalog(fixture), /地级父级/);
  fixture.records.find(r => r.code === '420106').parentCode = '420000';
  assert.throws(() => parseRegionCatalog(fixture), /地级父级/);
});

test('province-only coverage and missing county content remain explicit gaps', () => {
  for (const province of ['710000', '810000', '820000']) {
    assert.equal(getRegionByCode(province).level, 'province');
    assert.deepEqual(searchRegions('', province, 100), []);
    assert.ok(catalog.coverage.provinceOnlyCodes.includes(province));
  }
  assert.ok(resolveLegacyRegion('香港', '').notices.some(n => n.includes('尚无下级明细')));
  assert.equal(catalog.coverage.countyContent, 'directory_only');
  assert.ok(catalog.coverage.limitations.some(n => n.includes('不代表当地已有')));
  assert.ok(!('hotspots' in getRegionByCode('421222')));
});

test('functional areas stay separate and cannot impersonate administrative county codes', () => {
  const fixture = copy();
  fixture.functionalAreas = [{ id: 'test:campus', name: '合成测试校园', kind: 'campus', regionCodes: ['420106'], sourceIds: [], classification: 'user_defined' }];
  const parsed = parseRegionCatalog(fixture);
  assert.equal(parsed.coverage.countyCount, 2845);
  assert.equal(parsed.functionalAreas.length, 1);
  assert.deepEqual(searchRegions('合成测试校园', null, 20, parsed), []);
  assert.throws(() => validateRegionRef({ code: 'test:campus', catalogVersion: parsed.catalogVersion }, parsed), /6位/);
  fixture.functionalAreas[0].classification = 'curated';
  assert.throws(() => parseRegionCatalog(fixture), /来源/);
  fixture.functionalAreas[0].sourceIds = ['synthetic:test'];
  fixture.functionalAreas[0].regionCodes = ['999999'];
  assert.throws(() => parseRegionCatalog(fixture), /关联/);
});

test('references are exact-version, active-code and strict-schema bound', () => {
  assert.deepEqual(validateRegionRef(ref('420106')), ref('420106'));
  assert.throws(() => validateRegionRef({ code: '420106', catalogVersion: 'cn-admin-2024-old' }), /版本/);
  assert.throws(() => validateRegionRef({ ...ref('420106'), school: 'cannot grant access' }), /不支持字段/);
  assert.throws(() => validateRegionRef(ref('999999')), /未在/);
  assert.throws(() => validateRegionRef({ ...ref('420106'), code: 420106 }), /文字/);
  assert.throws(() => searchRegions('武汉', '999999'), /父级/);
  assert.throws(() => searchRegions('武汉', null, 101), /数量/);
});

test('catalog parsing rejects duplicate, inconsistent and unsafe metadata', () => {
  const duplicate = copy(); duplicate.records.push(duplicate.records[0]);
  assert.throws(() => parseRegionCatalog(duplicate), /重复/);
  const wrongLevel = copy(); wrongLevel.records.find(r => r.code === '420106').level = 'prefecture';
  assert.throws(() => parseRegionCatalog(wrongLevel), /级别/);
  const wrongParent = copy(); wrongParent.records.find(r => r.code === '420106').parentCode = '320100';
  assert.throws(() => parseRegionCatalog(wrongParent), /父级/);
  const wrongCount = copy(); wrongCount.coverage.countyCount++;
  assert.throws(() => parseRegionCatalog(wrongCount), /计数/);
  const overclaim = copy(); overclaim.source.verification = 'official_verified_2026';
  assert.throws(() => parseRegionCatalog(overclaim), /核验状态/);
  const url = copy(); url.source.officialSource = 'javascript:alert(1)';
  assert.throws(() => parseRegionCatalog(url), /来源/);
  const raw = JSON.stringify(catalog).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
  assert.throws(() => parseRegionCatalog(raw), /重复/);
  const path = copy(); path.source.rawPath = '../secrets';
  assert.throws(() => parseRegionCatalog(path), /路径/);
  let accessed = false;
  const getter = copy(); Object.defineProperty(getter, 'records', { enumerable: true, get() { accessed = true; return []; } });
  assert.throws(() => parseRegionCatalog(getter), /动态属性/);
  assert.equal(accessed, false);
});

test('shipped catalog is deeply frozen and stable across lookups', () => {
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog.records[0]));
  assert.ok(Object.isFrozen(catalog.historicalNames[0].candidateCodes));
  assert.throws(() => { catalog.records[0].name = 'mutated'; }, TypeError);
  assert.deepEqual(parseRegionCatalog(JSON.stringify(catalog)), catalog);
});
