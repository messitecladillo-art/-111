import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleKnowledgePublication, currentKnowledgeEntries } from '../lib/knowledge/publication.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root,'content/knowledge');
const manifest = JSON.parse(await readFile(path.join(directory,'release-manifest.json'),'utf8'));
if (manifest.schemaVersion!==1 || !/^[a-zA-Z0-9._-]{1,60}$/.test(manifest.release) || !Array.isArray(manifest.packs)) throw Error('Invalid knowledge release manifest');
const packs=[];
for(const item of manifest.packs) {
  if(!/^[a-z0-9-]+\.json$/.test(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('Invalid publication input path/hash');
  const raw=await readFile(path.join(directory,item.path));
  if(createHash('sha256').update(raw).digest('hex')!==item.sha256) throw Error('Reviewed source changed: '+item.path);
  packs.push(JSON.parse(raw));
}
const publicationFile=path.join(directory,'published.json');
let previous;
try { previous=JSON.parse(await readFile(publicationFile,'utf8')); }
catch(error) { if(error.code!=='ENOENT') throw error; }
const publication=assembleKnowledgePublication(manifest.release,packs,previous);
const publicText=JSON.stringify(publication,null,2)+'\n';
const apiText=JSON.stringify({ schemaVersion:1, release:manifest.release, entries:publication.entries.map(({id,version,review})=>({id,version,review})) },null,2)+'\n';
const outputs=[[publicationFile,publicText],[path.join(root,'../backend/src/multi_agent/agents/research_agent/knowledge-catalog.json'),apiText]];
if(process.argv.includes('--write')) {
  for(const [file,content] of outputs) await writeFile(file,content);
} else {
  // Generated projections may be checked out with CRLF; reviewed source hashes above remain byte-exact.
  for(const [file,content] of outputs) if((await readFile(file,'utf8')).replace(/\r\n/g,'\n')!==content) throw Error('Knowledge publication output is stale: '+path.basename(file));
}
console.log(JSON.stringify({status:'pass',release:manifest.release,concepts:currentKnowledgeEntries(publication).length,exactVersions:publication.entries.length,mode:process.argv.includes('--write')?'write':'check'}));
