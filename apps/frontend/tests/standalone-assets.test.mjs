import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('standalone restart removes retired public files instead of retaining an overlay copy', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evix-standalone-assets-'));
  try {
    for (const relative of ['scripts', 'public/landing', '.next/static', '.next/standalone/apps/frontend']) {
      mkdirSync(path.join(root, relative), { recursive: true });
    }
    const script = path.join(root, 'scripts/start-hosted.mjs');
    copyFileSync(fileURLToPath(new URL('../scripts/start-hosted.mjs', import.meta.url)), script);
    writeFileSync(path.join(root, '.next/standalone/apps/frontend/server.js'), 'process.exit(0);');
    writeFileSync(path.join(root, 'public/landing/retired-page.webp'), 'synthetic retired asset');
    writeFileSync(path.join(root, '.next/static/chunk.js'), 'first-build');
    const run = () => {
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
    };
    run();
    const published = path.join(root, '.next/standalone/apps/frontend/public/landing');
    assert.equal(readFileSync(path.join(published, 'retired-page.webp'), 'utf8'), 'synthetic retired asset');
    rmSync(path.join(root, 'public/landing/retired-page.webp'));
    writeFileSync(path.join(root, 'public/landing/structure.svg'), '<svg/>');
    writeFileSync(path.join(root, '.next/static/chunk.js'), 'second-build');
    run();
    assert.equal(existsSync(path.join(published, 'retired-page.webp')), false);
    assert.equal(readFileSync(path.join(published, 'structure.svg'), 'utf8'), '<svg/>');
    assert.equal(readFileSync(path.join(root, '.next/standalone/apps/frontend/.next/static/chunk.js'), 'utf8'), 'second-build');
  } finally {
    // mkdtemp generated this exact test-only directory; source checkouts are untouched.
    assert.ok(path.basename(root).startsWith('evix-standalone-assets-'));
    rmSync(root, { recursive: true, force: true });
  }
});

for (const source of ['public', '.next/static']) {
  test(`standalone rejects a nested ${source} directory link before replacing either output`, () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), 'evix-standalone-assets-'));
    const root = path.join(sandbox, 'checkout'), external = path.join(sandbox, 'external');
    try {
      for (const relative of ['scripts', 'public', '.next/static', '.next/standalone/apps/frontend/public']) {
        mkdirSync(path.join(root, relative), { recursive: true });
      }
      mkdirSync(external);
      writeFileSync(path.join(external, 'sentinel.txt'), 'external fixture must stay private');
      writeFileSync(path.join(root, '.next/standalone/apps/frontend/public/previous.txt'), 'preserve until validation completes');
      const script = path.join(root, 'scripts/start-hosted.mjs');
      copyFileSync(fileURLToPath(new URL('../scripts/start-hosted.mjs', import.meta.url)), script);
      writeFileSync(path.join(root, '.next/standalone/apps/frontend/server.js'), 'process.exit(0);');
      symlinkSync(external, path.join(root, source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /symbolic links or junctions/);
      assert.equal(existsSync(path.join(root, '.next/standalone/apps/frontend/public/linked')), false);
      assert.equal(readFileSync(path.join(root, '.next/standalone/apps/frontend/public/previous.txt'), 'utf8'), 'preserve until validation completes');
      assert.equal(readFileSync(path.join(external, 'sentinel.txt'), 'utf8'), 'external fixture must stay private');
    } finally {
      assert.ok(path.basename(sandbox).startsWith('evix-standalone-assets-'));
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}
