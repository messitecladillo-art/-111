import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'content/topic-advisor'),target=path.resolve(root,'../evi-x-api/src/evix_api/topic_assets');
const write=process.argv.includes('--write'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={schemaVersion:1,sha256:{}};
if(write)await mkdir(target,{recursive:true});
for(const name of ['catalog','sources','hotspot-events','train']){
  const raw=await readFile(path.join(source,name+'.json'));JSON.parse(raw.toString('utf8'));
  manifest.sha256[name]=hash(raw);
  const to=path.join(target,name+'.json');
  if(write)await writeFile(to,raw);
  else if(hash(await readFile(to))!==manifest.sha256[name])throw Error(`Packaged topic source drift: ${name}`);
}
const body=JSON.stringify(manifest,null,2)+'\n',out=path.join(target,'manifest.json');
if(write)await writeFile(out,body);else if((await readFile(out,'utf8')).replace(/\r\n/g,'\n')!==body)throw Error('Topic manifest drift');
console.log('Topic specialist API assets match the four frozen source files.');
