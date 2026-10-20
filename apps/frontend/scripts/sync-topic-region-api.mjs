import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Independent from topic-advisor's other assets. No fetch, generation or upgrade.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(appRoot, 'content/topic-advisor/regions.catalog.json');
const target = path.resolve(appRoot, '../backend/src/multi_agent/agents/research_agent/topic_assets');
if (process.argv.slice(2).some(flag => flag !== '--write')) throw Error('Only --write is supported');
const write = process.argv.includes('--write');
const raw = await readFile(source);
const catalog = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
if (catalog.schemaVersion !== 1 || !/^cn-admin-[a-zA-Z0-9-]+$/u.test(catalog.catalogVersion)
  || !/^\d{4}-12-31$/u.test(catalog.asOf) || !Array.isArray(catalog.records) || !catalog.records.length) {
  throw Error('Invalid source region catalog identity');
}
const manifest = {
  schemaVersion: 1, catalogVersion: catalog.catalogVersion, asOf: catalog.asOf,
  bytes: raw.byteLength, sha256: { 'regions.catalog.json': createHash('sha256').update(raw).digest('hex') },
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
if (write) {
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'regions.catalog.json'), raw);
  await writeFile(path.join(target, 'regions.manifest.json'), manifestBytes);
} else {
  if (!(await readFile(path.join(target, 'regions.catalog.json'))).equals(raw)) throw Error('Packaged region catalog drift');
  if (!(await readFile(path.join(target, 'regions.manifest.json'))).equals(manifestBytes)) throw Error('Packaged region manifest drift');
}
console.log(JSON.stringify({ status: write ? 'written' : 'matched', catalogVersion: manifest.catalogVersion, bytes: manifest.bytes, sha256: manifest.sha256['regions.catalog.json'] }));
