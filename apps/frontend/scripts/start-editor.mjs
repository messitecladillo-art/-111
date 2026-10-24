import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const state=resolve(root,process.env.EVI_X_D1_PERSIST_PATH || '.wrangler/editor-state');
const config=resolve(root,'dist/server/wrangler.json');
if(!existsSync(config)){console.error('请先运行 npm run build，再运行 npm run dev:editor。');process.exit(1);}
const env={...process.env,EVI_X_D1_PERSIST_PATH:state,EVI_X_OFFICE_LOCAL_FILES:process.env.EVI_X_OFFICE_LOCAL_FILES ?? '1',WRANGLER_WRITE_LOGS:'false'};
const migration=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','migrations','apply','DB','--local','--persist-to',state,'--config',config],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(migration.status!==0)process.exit(migration.status||1);
const server=spawn(process.execPath,[resolve(root,'node_modules/vinext/dist/cli.js'),'dev','--hostname','127.0.0.1','--port','3001'],{cwd:root,env,stdio:'inherit',windowsHide:true});
server.on('exit',code=>process.exit(code||0));
server.on('error',error=>{console.error(error.message);process.exit(1);});
