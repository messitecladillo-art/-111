/** Offline, hash-only public bindings for the existing API receipt contract. No source text is emitted. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiAssets = path.resolve(appRoot, '../evi-x-api/src/evix_api/topic_assets');
const names = ['catalog', 'sources', 'hotspot-events', 'train'];
const sha256 = raw => createHash('sha256').update(raw).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw Error('Source-version manifest fields are invalid'); return value; }
function digest(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Source-version digest is invalid'); return value; }
function strictJson(raw) {
  const text = raw.toString('utf8'), value = JSON.parse(text), stack = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}[\],:]/g)) {
    const token = match[0], top = stack.at(-1);
    if (token === '{' || token === '[') { if (stack.length >= 16) throw Error('Source manifest nesting is invalid'); stack.push({ object: token === '{', key: token === '{', keys: new Set() }); }
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && top?.object) top.key = true;
    else if (token.startsWith('"') && top?.object && top.key) { const key = JSON.parse(token); if (top.keys.has(key)) throw Error('Source manifest has duplicate members'); top.keys.add(key); top.key = false; }
  }
  return value;
}

/** Exported for tamper checks using detached byte inputs; never writes any assets. */
export function deriveTopicSourceVersions({ topicManifest, regionManifest, topicAssets, regionCatalog, browserAssets = topicAssets, browserRegionCatalog = regionCatalog }) {
  const topic = exact(strictJson(topicManifest), ['schemaVersion', 'sha256']);
  if (topic.schemaVersion !== 1) throw Error('Topic manifest version is invalid');
  exact(topic.sha256, names);
  for (const name of names) {
    const expected = digest(topic.sha256[name]);
    if (sha256(topicAssets[name]) !== expected || sha256(browserAssets[name]) !== expected) throw Error(`Topic source bytes drift: ${name}`);
  }
  const region = exact(strictJson(regionManifest), ['schemaVersion', 'catalogVersion', 'asOf', 'bytes', 'sha256']);
  exact(region.sha256, ['regions.catalog.json']);
  const regionHash = digest(region.sha256['regions.catalog.json']), catalog = strictJson(regionCatalog);
  if (region.schemaVersion !== 1 || !Number.isSafeInteger(region.bytes) || region.bytes !== regionCatalog.byteLength || regionHash !== sha256(regionCatalog) || regionHash !== sha256(browserRegionCatalog)) throw Error('Region source bytes drift');
  if (typeof region.catalogVersion !== 'string' || !/^cn-admin-[A-Za-z0-9-]+$/.test(region.catalogVersion) || region.catalogVersion.trim() !== region.catalogVersion || !/^\d{4}-12-31$/.test(region.asOf) || catalog.catalogVersion !== region.catalogVersion || catalog.asOf !== region.asOf) throw Error('Region source identity drift');
  return { topicDigest: sha256(canonical(topic)), regionCatalog: { catalogVersion: region.catalogVersion, asOf: region.asOf, catalogSha256: regionHash } };
}

export async function loadTopicSourceVersions() {
  const [topicManifest, regionManifest, regionCatalog, browserRegionCatalog, assets] = await Promise.all([
    readFile(path.join(apiAssets, 'manifest.json')), readFile(path.join(apiAssets, 'regions.manifest.json')),
    readFile(path.join(apiAssets, 'regions.catalog.json')), readFile(path.join(appRoot, 'content/topic-advisor/regions.catalog.json')),
    Promise.all(names.map(async name => [name, await readFile(path.join(apiAssets, `${name}.json`)), await readFile(path.join(appRoot, `content/topic-advisor/${name}.json`))])),
  ]);
  return deriveTopicSourceVersions({ topicManifest, regionManifest, regionCatalog, browserRegionCatalog, topicAssets: Object.fromEntries(assets.map(([name, raw]) => [name, raw])), browserAssets: Object.fromEntries(assets.map(([name, , raw]) => [name, raw])) });
}
export function checkPublicTopicSourceVersions(raw, expected) {
  const body=JSON.stringify(expected,null,2)+'\n';
  if(raw.toString('utf8').replace(/\r\n/g,'\n')!==body)throw Error('Public topic source-version binding drift');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--write')) throw Error('Use --write to refresh the public source-version binding; default checks it');
  const result = await loadTopicSourceVersions(), body = JSON.stringify(result, null, 2) + '\n', output = path.join(appRoot, 'content/topic-advisor/source-versions.json');
  if (process.argv.includes('--write')) await writeFile(output, body);
  else checkPublicTopicSourceVersions(await readFile(output),result);
  console.log('Public topic source-version hashes match validated offline API and browser assets.');
}
