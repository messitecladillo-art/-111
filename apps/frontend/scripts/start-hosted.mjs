import { cpSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = path.join(root, '.next/standalone/apps/frontend');
const server = path.join(bundle, 'server.js');
if (!existsSync(server)) throw new Error('请先运行 npm run build:web，生成标准 Next.js 服务。');
const inside = (base, candidate) => {
  const relative = path.relative(base, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const realRoot = realpathSync(root), realBundle = realpathSync(bundle);
if (!inside(realRoot, realBundle)) throw new Error('Standalone output must remain inside this application checkout.');
const validateSourceTree = (entry, sourceRoot) => {
  const metadata = lstatSync(entry);
  if (metadata.isSymbolicLink()) throw new Error('Asset inputs must not contain symbolic links or junctions.');
  const resolved = realpathSync(entry);
  if (resolved !== sourceRoot && !inside(sourceRoot, resolved)) throw new Error('Asset input escapes its source directory.');
  if (metadata.isDirectory()) {
    for (const name of readdirSync(entry)) validateSourceTree(path.join(entry, name), sourceRoot);
  } else if (!metadata.isFile()) throw new Error('Asset inputs must contain only regular files and directories.');
};
// Validate both trees before changing any generated output.
const assetPairs = [['public', 'public'], ['.next/static', '.next/static']].map(([source, target]) => {
  const sourcePath = path.join(root, source), targetPath = path.join(bundle, target);
  if (!inside(realRoot, realpathSync(sourcePath))) throw new Error('Asset input must remain inside this checkout.');
  validateSourceTree(sourcePath, realpathSync(sourcePath));
  let ancestor = targetPath;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (ancestor !== bundle && !inside(realBundle, realpathSync(ancestor))) throw new Error('Asset output escapes the standalone bundle.');
  if (existsSync(targetPath)) {
    if (lstatSync(targetPath).isSymbolicLink() || !inside(realBundle, realpathSync(targetPath))) throw new Error('Asset output must be a local generated directory.');
  }
  return [sourcePath, targetPath];
});
// Next's standalone output deliberately excludes these public/static assets.
// Mirror rather than overlay: a retired public asset must not survive a restart.
for (const [sourcePath, targetPath] of assetPairs) {
  rmSync(targetPath, { recursive: true, force: true });
  cpSync(sourcePath, targetPath, { recursive: true });
}
const child = spawn(process.execPath, [server], {
  cwd: bundle,
  env: { ...process.env, NODE_ENV: 'production', PORT: process.env.PORT || '3180', HOSTNAME: process.env.EVIX_WEB_HOST || '127.0.0.1' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
