import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = resolve(appRoot, '../../skill/zhengda-cup-champion/assets/runtime');
const sourcePaths = {
  script: join(appRoot, 'scripts/sync-control-contract.mjs'),
  snapshot: join(appRoot, 'data/control-plane-contract.snapshot.json'),
  generated: join(appRoot, 'data/control-plane-contract.generated.ts'),
  workflow: join(runtimeRoot, 'workflow.json'),
  gates: join(runtimeRoot, 'gates.json'),
};
const sources = Object.fromEntries(await Promise.all(
  Object.entries(sourcePaths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));
const temporaryParent = resolve(tmpdir());
const temporaryRoot = await mkdtemp(join(temporaryParent, 'evix-control-contract-'));
assert.ok(temporaryRoot.startsWith(temporaryParent + sep));
// This directory contains only fixtures created by this test, never project state.
test.after(async () => { await rm(temporaryRoot, { recursive: true, force: true }); });
let fixtureIndex = 0;

async function runFixture({ eol = '\n', transform = () => {} } = {}) {
  const root = join(temporaryRoot, String(++fixtureIndex));
  const app = join(root, 'apps/evi-x-platform');
  const runtime = join(root, 'skill/zhengda-cup-champion/assets/runtime');
  await Promise.all([
    mkdir(join(app, 'scripts'), { recursive: true }),
    mkdir(join(app, 'data'), { recursive: true }),
    mkdir(runtime, { recursive: true }),
  ]);
  const files = Object.fromEntries(Object.entries(sources).map(([key, value]) =>
    [key, value.replace(/\r\n/g, '\n').replace(/\n/g, eol)],
  ));
  transform(files);
  await Promise.all([
    writeFile(join(app, 'scripts/sync-control-contract.mjs'), files.script),
    writeFile(join(app, 'data/control-plane-contract.snapshot.json'), files.snapshot),
    writeFile(join(app, 'data/control-plane-contract.generated.ts'), files.generated),
    writeFile(join(runtime, 'workflow.json'), files.workflow),
    writeFile(join(runtime, 'gates.json'), files.gates),
  ]);
  try {
    return { ok: true, result: JSON.parse(execFileSync(process.execPath,
      ['scripts/sync-control-contract.mjs', '--check'], { cwd: app, encoding: 'utf8', stdio: 'pipe' })) };
  } catch (error) {
    return { ok: false, message: String(error.stderr), exitCode: error.status };
  }
}

test('control contract checker accepts both LF repository and CRLF checkout bytes', async () => {
  const lf = await runFixture();
  const crlf = await runFixture({ eol: '\r\n' });
  assert.equal(lf.ok, true);
  assert.equal(crlf.ok, true);
  assert.deepEqual(crlf.result, lf.result);
  assert.equal(lf.result.sourceChecked, true);
  assert.equal(lf.result.mutationGuards, 3);
});

test('non-EOL formatting changes still fail the exact repository fingerprint', async () => {
  const receipt = await runFixture({ transform: files => {
    files.workflow = files.workflow.replace('"initial_status":', '"initial_status" :');
  } });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.exitCode, 1);
  assert.match(receipt.message, /drift detected at workflowRawSha256/);
});

test('Gate source changes remain blocked on a CRLF checkout', async () => {
  const receipt = await runFixture({ eol: '\r\n', transform: files => {
    files.gates = files.gates.replace('"warning"', '"deferred"');
  } });
  assert.equal(receipt.ok, false);
  assert.match(receipt.message, /drift detected at gatesRawSha256/);
});

test('generated TypeScript content changes remain blocked independently of EOL', async () => {
  const receipt = await runFixture({ eol: '\r\n', transform: files => {
    files.generated += '// changed contract export\r\n';
  } });
  assert.equal(receipt.ok, false);
  assert.match(receipt.message, /Generated TypeScript contract is stale/);
});

test('normalization does not discard BOM or lone carriage return bytes', async () => {
  const bom = await runFixture({ transform: files => { files.workflow = '\ufeff' + files.workflow; } });
  const loneCR = await runFixture({ transform: files => { files.workflow += '\r'; } });
  assert.equal(bom.ok, false);
  assert.equal(loneCR.ok, false);
  assert.match(loneCR.message, /drift detected at workflowRawSha256/);
});
