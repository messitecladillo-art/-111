import assert from 'node:assert/strict';
import {existsSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';

const ALLOWED = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'LC_ALL', 'TERM']);

/** A fresh synthetic-test child context, never a change to the parent/user environment. */
export function createIsolatedTestEnv({rootDir, inherited = process.env, platform = process.platform} = {}) {
  assert.ok(typeof rootDir === 'string' && isAbsolute(rootDir), 'Absolute test directory required');
  const root = resolve(rootDir);
  assert.ok(existsSync(root) && lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), 'Existing real test directory required');
  const canonical = realpathSync(root);
  assert.equal(platform === 'win32' ? canonical.toLowerCase() : canonical,
    platform === 'win32' ? root.toLowerCase() : root, 'Redirected test directory refused');
  const paths = Object.fromEntries(['profile', 'config', 'cache', 'temp', 'appdata', 'localappdata', 'logs', 'registry']
    .map(name => [name, join(root, `isolated-${name}`)]));
  // Refuse reuse or links instead of overwriting a prior context.
  for (const path of Object.values(paths)) assert.ok(!existsSync(path), 'Test environment already exists');
  for (const path of Object.values(paths)) mkdirSync(path);
  const env = Object.create(null);
  for (const name of Object.keys(inherited)) {
    const upper = name.toUpperCase();
    if (ALLOWED.has(upper) && typeof inherited[name] === 'string') env[upper] = inherited[name];
  }
  // These are child home/config locations, not repurposed shell variables.
  Object.assign(env, {USERPROFILE: paths.profile, APPDATA: paths.appdata, LOCALAPPDATA: paths.localappdata,
    XDG_CONFIG_HOME: paths.config, XDG_CACHE_HOME: paths.cache, TEMP: paths.temp, TMP: paths.temp,
    TMPDIR: paths.temp, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_SEND_ERROR_REPORTS: 'false',
    WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: paths.logs, MINIFLARE_REGISTRY_PATH: paths.registry});
  if (platform !== 'win32') env.HOME = paths.profile;
  return {env, paths};
}
