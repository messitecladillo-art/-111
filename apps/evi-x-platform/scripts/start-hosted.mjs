import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = path.join(root, '.next/standalone/apps/evi-x-platform');
const server = path.join(bundle, 'server.js');
if (!existsSync(server)) throw new Error('请先运行 npm run build:web，生成标准 Next.js 服务。');
// Next's standalone output deliberately excludes these public/static assets.
for (const [source, target] of [['public', 'public'], ['.next/static', '.next/static']]) {
  cpSync(path.join(root, source), path.join(bundle, target), { recursive: true });
}
const child = spawn(process.execPath, [server], {
  cwd: bundle,
  env: { ...process.env, NODE_ENV: 'production', PORT: process.env.PORT || '3180', HOSTNAME: process.env.EVIX_WEB_HOST || '127.0.0.1' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
