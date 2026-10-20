// Synthetic process-only fixtures. No server, network, user data or cloud CLI.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const mode = process.argv[2];
if (mode === 'zero') process.stdout.write('synthetic-ok\n');
else if (mode === 'nonzero') {process.stderr.write('synthetic-error\n'); process.exitCode = 7;}
else if (mode === 'hang') setInterval(() => {}, 1000);
else if (mode === 'overflow') process.stdout.write('x'.repeat(256 * 1024));
else if (mode === 'pipeheld') {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'finite-pipe'],
    {windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']});
  child.unref();
} else if (mode === 'finite-pipe') setTimeout(() => {}, 8000);
else if (mode === 'latechild') {
  setTimeout(() => spawn(process.execPath, [fileURLToPath(import.meta.url), 'finite-pipe'],
    {windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']}), 500);
  setTimeout(() => {}, 8000);
} else throw new Error('Unknown synthetic fixture');
