import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Offline and deterministic: this command never fetches or upgrades the source.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(appRoot, '../../corpus-source/topic-advisor/regions');
const output = path.join(appRoot, 'content/topic-advisor/regions.catalog.json');
const commit = 'e2c2b2e1fb4ce1fb76e879aa0b80e229adaf950c';
const expected = {
  'areacodes-2025.raw.json': '8c4e8afc5dfc16b77d34cf39b2547d07ab6a46e46b414679d494e50353970edc',
  'areacodes.LICENSE': 'a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499',
  'areacodes.README.md': 'd1cd78d7989dcdf718415f6654ee3eb5c75c48affb9b4cd071b9d7af90e26cbd',
};
const hash = raw => createHash('sha256').update(raw).digest('hex');
const metadata = JSON.parse(await readFile(path.join(sourceRoot, 'source.json'), 'utf8'));
if (metadata.commit !== commit || metadata.dataAsOf !== '2025-12-31' || metadata.license !== 'CC0-1.0') throw Error('Region source identity drift');
let original;
for (const [name, digest] of Object.entries(expected)) {
  const bytes = await readFile(path.join(sourceRoot, name));
  if (hash(bytes) !== digest || metadata.files.find(f => f.path === name)?.sha256 !== digest) throw Error(`Region source hash mismatch: ${name}`);
  if (name.endsWith('.raw.json')) original = JSON.parse(bytes.toString('utf8'));
}
const year = 2025;
const all = [];
function visit(rows, parentCode = null) {
  if (!Array.isArray(rows)) throw Error('Invalid source tree');
  for (const item of rows) {
    if (!Number.isInteger(item.code) || item.code < 100000 || item.code > 999999 || typeof item.name !== 'string' || !Number.isInteger(item.start)) throw Error('Invalid source node');
    all.push({ ...item, parentCode: parentCode === null ? null : String(parentCode) });
    if (item.children) visit(item.children, item.code);
  }
}
visit(original.items);
const active = all.filter(r => r.start <= year && (r.end === undefined || r.end > year));
const activeCodes = new Set(active.map(r => String(r.code)));
if (activeCodes.size !== active.length) throw Error('Duplicate active region codes');
const byCode = new Map();
for (const row of all) {
  const code = String(row.code);
  byCode.set(code, [...(byCode.get(code) ?? []), row]);
}
const level = code => Number(code) % 10000 === 0 ? 'province' : Number(code) % 100 === 0 ? 'prefecture' : 'county';
const records = active.map(row => ({
  code: String(row.code), name: row.name, level: level(row.code), parentCode: row.parentCode,
  provinceCode: String(row.code).slice(0, 2) + '0000', startYear: row.start,
})).sort((a, b) => a.code.localeCompare(b.code));
for (const row of records) if (row.parentCode && !activeCodes.has(row.parentCode)) throw Error(`Inactive parent: ${row.code}`);

// Successors are possible current locations, never automatic identity replacements.
function successorCandidates(row, visited = new Set(), entryYear = row.start) {
  // A numeric code can be reused by an unrelated place decades later. Follow
  // the exact historical entity and resolve each edge at its effective year.
  const identity = JSON.stringify([row.code, row.start, row.end ?? null, row.parentCode, row.name, entryYear]);
  if (visited.has(identity) || row.start > year) return [];
  const nextVisited = new Set(visited).add(identity);
  const candidates = row.end === undefined || row.end > year ? [String(row.code)] : [];
  for (const successor of row.succ ?? []) {
    const effectiveYear = successor.time ?? row.end;
    if (effectiveYear === undefined || effectiveYear < entryYear || effectiveYear > year) continue;
    const targets = (byCode.get(String(successor.code)) ?? []).filter(target => target.start <= effectiveYear && (target.end === undefined || target.end > effectiveYear));
    for (const target of targets) candidates.push(...successorCandidates(target, nextVisited, effectiveYear));
  }
  return [...new Set(candidates)].sort();
}
const historicalNames = all.filter(row => row.end !== undefined && row.end <= year).map(row => ({
  code: String(row.code), name: row.name, parentCode: row.parentCode, startYear: row.start, endYear: row.end,
  candidateCodes: successorCandidates(row), relation: 'historical_candidate',
})).sort((a, b) => a.code.localeCompare(b.code) || a.startYear - b.startYear || a.name.localeCompare(b.name, 'zh-CN'));
const catalog = {
  schemaVersion: 1,
  catalogVersion: `cn-admin-2025-${commit.slice(0, 12)}`,
  asOf: '2025-12-31',
  source: {
    id: metadata.sourceId, repository: metadata.repository, commit,
    rawPath: 'corpus-source/topic-advisor/regions/areacodes-2025.raw.json', rawSha256: expected['areacodes-2025.raw.json'],
    license: 'CC0-1.0', officialSource: metadata.officialSource,
    verification: 'community_compilation_official_full_recheck_pending',
  },
  coverage: {
    provinceCount: records.filter(r => r.level === 'province').length,
    prefectureCount: records.filter(r => r.level === 'prefecture').length,
    countyCount: records.filter(r => r.level === 'county').length,
    provinceOnlyCodes: ['710000', '810000', '820000'],
    countyContent: 'directory_only',
    limitations: metadata.limitations.concat('台湾省、香港特别行政区、澳门特别行政区在此数据源中仅有省级节点；未提供县区明细。', '目录节点不代表当地已有经审校热点或特色资料包。'),
  },
  records,
  historicalNames,
  // No guessed industrial-park or campus boundaries. Curated entries may be added separately.
  functionalAreas: [],
};
const body = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--write')) await writeFile(output, body);
else if ((await readFile(output, 'utf8')).replace(/\r\n/g, '\n') !== body) throw Error('Region catalog drift: run node scripts/sync-topic-regions.mjs --write');
console.log(JSON.stringify({ catalogVersion: catalog.catalogVersion, asOf: catalog.asOf, rawSha256: catalog.source.rawSha256, ...catalog.coverage, historicalNameCount: historicalNames.length, mode: process.argv.includes('--write') ? 'write' : 'check' }));
