// Integration-only launcher: never reads or mutates the user's Vinext CLI lock.
import { createServer } from 'vite';
import { resolve } from 'node:path';

const [rawPort, nonce] = process.argv.slice(2);
const port = Number(rawPort);
if (!process.send || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(nonce ?? '')) {
  throw new Error('Test launcher requires a valid port, nonce and owned IPC channel');
}
const hostname = 'localhost';
const runRoot = process.env.EVI_X_TEST_RUN_ROOT;
if (!runRoot) throw new Error('An isolated test root is required');
let vite;
let startup;
let closing = false;
const identity = { nonce, pid: process.pid, port, hostname, cwd: resolve(process.cwd()) };
async function close() {
  if (closing) return;
  closing = true;
  try {
    // Startup includes plugin/workerd creation AND listen. A timeout-triggered
    // stop must not certify disposal while either of those is still in flight.
    const started = await startup;
    await started.close();
    if (process.connected) process.send({ type: 'evix-test-stopped', ...identity }, () => process.exit(0));
    else process.exit(0);
  } catch (error) { console.error(error); process.exit(1); }
}
process.on('message', message => {
  if (message?.type === 'evix-test-stop' && message.nonce === nonce) void close();
});
process.once('disconnect', close);
process.once('SIGTERM', close);
process.once('SIGINT', close);
startup = (async () => {
  vite = await createServer({ cacheDir: resolve(runRoot, `vite-cache-${nonce}`), server: { host: hostname, port, strictPort: true, hmr: false } });
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === 'string' || address.port !== port) throw new Error('Test server did not bind the exact requested port');
    return vite;
  } catch (error) { await vite.close(); throw error; }
})();
await startup;
if (!closing) process.send({ type: 'evix-test-ready', ...identity });
