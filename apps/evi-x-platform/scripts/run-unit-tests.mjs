import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// These suites target the archived D1/Office HTTP server and remain migration
// references. They are exercised only with that server's explicit test harness.
const archivedHttp = new Set(['editor-api.test.mjs', 'editor-recovery-api.test.mjs', 'native-editor-api.test.mjs', 'office-api.test.mjs', 'rendered-html.test.mjs', 'research-flow-api.test.mjs']);
const files = readdirSync('tests').filter(name => name.endsWith('.test.mjs') && !archivedHttp.has(name)).sort();
if (!files.length) throw new Error('No unit regression files found');
console.log(JSON.stringify({suite:'preserved-local-and-contract-regression', files:files.length, archivedHttpSuites:[...archivedHttp]}));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files.map(name => `tests/${name}`)], {stdio:'inherit', windowsHide:true});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
