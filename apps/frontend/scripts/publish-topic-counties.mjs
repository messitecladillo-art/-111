import { readFile, writeFile } from 'node:fs/promises';
import { projectCountyPublications } from '../lib/topic-publication-projection.ts';

// Explicit maintainer operation. No network, project permission, or browser-supplied receipt.
if (process.argv.slice(2).some(argument => argument !== '--write') || process.argv.slice(2).length > 1) throw Error('Usage: publish-topic-counties.mjs [--write]');
const source = new URL('../../../corpus-source/topic-advisor/county-publications.json', import.meta.url);
const target = new URL('../content/topic-advisor/published-counties.json', import.meta.url);
const projection = await projectCountyPublications(await readFile(source, 'utf8'));
const body = JSON.stringify(projection, null, 2) + '\n';
if (process.argv.includes('--write')) await writeFile(target, body, 'utf8');
else if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== body) throw Error('County public projection is stale; review the registry before explicit regeneration.');
console.log(JSON.stringify({ countyPublication: 'verified', publishedProfiles: projection.profiles.length, registrySha256: projection.registrySha256 }));
