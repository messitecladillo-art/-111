import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(app, 'public/knowledge-assets/tesseract-7.0.0');
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.workerVersion !== '7.0.0' || manifest.coreVersion !== '7.0.0') throw Error('Unexpected OCR resource versions');
for (const name of ['tesseract.js', 'tesseract.js-core']) {
  const installed = JSON.parse(await readFile(path.join(app, '../../node_modules', name, 'package.json'), 'utf8'));
  if (installed.version !== '7.0.0') throw Error('OCR dependency differs from pinned resources: ' + name);
}
const actual = [];
async function enumerate(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error('OCR assets cannot contain links');
    if (item.isDirectory()) await enumerate(path.join(directory, item.name), prefix + item.name + '/');
    else if (item.isFile() && item.name !== 'manifest.json' && item.name !== 'README.md') actual.push(prefix + item.name);
  }
}
await enumerate(directory);
if (actual.sort().join('\n') !== manifest.files.map(item => item.path).sort().join('\n')) throw Error('OCR asset inventory changed');
for (const item of manifest.files) {
  if (!/^(?:lang\/)?[a-zA-Z0-9._-]+$/.test(item.path) || item.path.includes('..') || !/^https:\/\/(?:github\.com|registry\.npmjs\.org)\//.test(item.source)) throw Error('Invalid OCR source manifest');
  const bytes = await readFile(path.join(directory, item.path));
  if (bytes.byteLength !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('OCR resource hash mismatch: ' + item.path);
  if (item.upstreamFile) {
    const packagePath = path.join(app, '../../node_modules', item.upstreamFile);
    const installed = await readFile(packagePath);
    if (!installed.equals(bytes)) throw Error('Vendored OCR asset differs from locked upstream: ' + item.path);
  }
}
console.log(JSON.stringify({ status: 'pass', workerVersion: manifest.workerVersion, coreVersion: manifest.coreVersion, assets: manifest.files.length, sameOrigin: true }));
