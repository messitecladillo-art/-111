// Synthetic test infrastructure, not a general process sandbox. Natural exit and
// closed streams plus captured-identity cleanup do NOT prove Job Object containment.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const identity = row => `${row.pid}:${row.created}`;

/** Expand only from CURRENT matching parents. Captured orphans remain anchors. */
export function updateOwnedProcesses(records, captured) {
  assert.ok(Array.isArray(records), 'Invalid process snapshot');
  const seen = new Set();
  for (const row of records) {
    assert.ok(row && Number.isInteger(row.pid) && row.pid > 0 && Number.isInteger(row.parent) && row.parent >= 0 &&
      (row.created === null || typeof row.created === 'string' && Number.isFinite(Date.parse(row.created))) &&
      !seen.has(row.pid), 'Invalid process metadata');
    seen.add(row.pid);
  }
  const known = new Map(captured.map(row => [identity(row), row]));
  for (const row of records) {
    if (row.created === null && captured.some(old => old.pid === row.pid)) throw new Error('Owned metadata missing');
  }
  for (let changed = true; changed;) {
    changed = false;
    const live = records.filter(row => known.has(identity(row)));
    for (const row of records) {
      if (known.has(identity(row))) continue;
      const parent = live.find(owner => owner.pid === row.parent);
      if (!parent) continue;
      assert.ok(row.created && Date.parse(row.created) >= Date.parse(parent.created), 'Descendant metadata missing');
      known.set(identity(row), row); changed = true;
    }
  }
  return {captured: [...known.values()], remaining: records.filter(row => known.has(identity(row)))};
}

function powershell(command, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const runtimeNames = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'OS']);
    const metadataEnv = Object.create(null);
    for (const name of Object.keys(process.env)) {
      if (runtimeNames.has(name.toUpperCase())) metadataEnv[name.toUpperCase()] = process.env[name];
    }
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      {windowsHide: true, env: metadataEnv, stdio: ['ignore', 'pipe', 'pipe']});
    let chunks = [], bytes = 0, failed = false;
    const fail = () => {if (!failed) {failed = true; child.kill(); reject(new Error('Process metadata/action unavailable'));}};
    const timer = setTimeout(fail, timeoutMs);
    child.once('error', fail);
    child.stdout.on('data', chunk => {bytes += chunk.length; if (bytes > 2 * 1024 * 1024) fail(); else chunks.push(chunk);});
    child.stdout.on('error', fail); child.stderr.on('error', fail); child.stderr.resume();
    child.once('close', code => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0) {fail(); return;}
      try {resolve(JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '').trim()));}
      catch {fail();}
    });
  });
}

export function createWindowsProcessAdapter() {
  if (process.platform !== 'win32') throw new Error('Default ownership adapter supports Windows only; explicit adapter required');
  return {
    readProcesses: () => powershell("$ErrorActionPreference='Stop'; $items=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | Where-Object {$_.ProcessId -gt 0} | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;created=$(if($null -eq $_.CreationDate){$null}else{$_.CreationDate.ToUniversalTime().ToString('o')})}}); ConvertTo-Json -InputObject $items -Compress"),
    stopIdentity: row => {
      assert.ok(Number.isInteger(row.pid) && row.pid > 0 && typeof row.created === 'string' && Number.isFinite(Date.parse(row.created)));
      const encoded = Buffer.from(JSON.stringify({pid: row.pid, created: row.created})).toString('base64');
      return powershell(`$ErrorActionPreference='Stop'; $p=$null; $result='failed'; $item=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json; try{$p=[Diagnostics.Process]::GetProcessById([int]$item.pid); $null=$p.Handle; $expected=[DateTimeOffset]::Parse($item.created).UtcDateTime; if([Math]::Abs(($p.StartTime.ToUniversalTime()-$expected).TotalMilliseconds) -gt 1){$result='identity-mismatch'}else{$p.Kill();$result='stop-requested'}}catch [ArgumentException]{$result='already-gone'}catch [InvalidOperationException]{$result='already-gone'}catch{$result='failed'}finally{if($null -ne $p){$p.Dispose()}}; ConvertTo-Json -InputObject $result -Compress`);
    },
  };
}

/**
 * Adapter methods must be bounded and return metadata only. The additional race
 * bounds faulty injected promises, but cannot cancel arbitrary adapter side effects.
 * onOutput is a trusted synchronous log sink; throw => fail plus owned cleanup.
 */
export async function runBoundedCommand({command, args = [], cwd, env, timeoutMs = 120000,
  maxOutputBytes = 2 * 1024 * 1024, pollIntervalMs = 1000, closeGraceMs = 1500,
  cleanupTimeoutMs = 15000, processAdapter, onOutput} = {}) {
  assert.ok(typeof command === 'string' && isAbsolute(command) && typeof cwd === 'string' && isAbsolute(cwd));
  assert.ok(Array.isArray(args) && args.every(arg => typeof arg === 'string') && env && typeof env === 'object');
  for (const [name, value] of Object.entries({timeoutMs, pollIntervalMs, closeGraceMs, cleanupTimeoutMs}))
    assert.ok(Number.isInteger(value) && value > 0 && value <= 600000, `Invalid ${name}`);
  assert.ok(Number.isInteger(maxOutputBytes) && maxOutputBytes > 0 && maxOutputBytes <= 64 * 1024 * 1024, 'Invalid maxOutputBytes');
  const adapter = processAdapter || createWindowsProcessAdapter();
  assert.equal(typeof adapter.readProcesses, 'function'); assert.equal(typeof adapter.stopIdentity, 'function');
  const start = Date.now(), monotonicStart = performance.now(), nonce = randomUUID();
  const elapsed = () => performance.now() - monotonicStart;
  const receipt = {schema: 'bounded-test-command/v1', started_at: new Date(start).toISOString(),
    command_exit_code: null, command_signal: null, launcher_exit_code: null, launcher_signal: null,
    command_exit_elapsed_ms: null, launcher_exit_elapsed_ms: null, streams_closed_elapsed_ms: null,
    natural_exit: false, streams_closed: false, timed_out: false, output_limit_exceeded: false,
    spawn_error: null, observation_error: null, forced_cleanup: false, ownership_confirmed: false,
    captured_tree_empty: false, cleanup_scope: 'captured-identities-only', remaining: [],
    observed_processes: [], stop_actions: [], passed: false};
  let captured = [], launcher, closeTime = null, commandExited = false, launcherExited = false,
    streamClosed = false, total = 0;
  const buffers = {stdout: [], stderr: []};
  const bounded = async (operation, ms) => {
    let timer;
    try {return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Adapter deadline')), ms);
    })]);} finally {clearTimeout(timer);}
  };
  async function snapshot() {
    const rows = await bounded(() => adapter.readProcesses(), Math.min(5000, cleanupTimeoutMs));
    const result = updateOwnedProcesses(rows, captured);
    captured = result.captured; receipt.observed_processes = captured;
    receipt.remaining = result.remaining;
    return rows;
  }
  try {
    // Permission/metadata preflight BEFORE even a gated launcher starts.
    await snapshot();
    launcher = (adapter.spawnLauncher || spawn)(process.execPath, [SELF, '--bounded-launcher', nonce],
      {cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    launcher.once('error', error => {receipt.spawn_error = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'LAUNCHER_SPAWN_ERROR';});
    launcher.once('exit', (code, signal) => {launcherExited = true; receipt.launcher_exit_code = code; receipt.launcher_signal = signal; receipt.launcher_exit_elapsed_ms = elapsed();});
    launcher.once('close', () => {streamClosed = true; receipt.streams_closed_elapsed_ms = elapsed();});
    launcher.on('message', message => {
      if (message?.nonce !== nonce) return;
      if (message.type === 'target-exit') {
        commandExited = true; closeTime = elapsed(); receipt.command_exit_elapsed_ms = closeTime;
        receipt.command_exit_code = message.code; receipt.command_signal = message.signal;
      } else if (message.type === 'target-spawn-error') receipt.spawn_error = 'TARGET_SPAWN_ERROR';
    });
    for (const channel of ['stdout', 'stderr']) {
      launcher[channel].on('data', chunk => {
        const keep = Math.max(0, Math.min(chunk.length, maxOutputBytes - total));
        if (keep) buffers[channel].push(chunk.subarray(0, keep));
        total += chunk.length;
        if (total > maxOutputBytes) receipt.output_limit_exceeded = true;
        try {if (keep && onOutput) onOutput({stream: channel, chunk: chunk.subarray(0, keep)});}
        catch {receipt.observation_error = 'OUTPUT_SINK_FAILED';}
      });
      launcher[channel].on('error', () => {receipt.observation_error = 'OUTPUT_STREAM_FAILED';});
    }
    assert.ok(launcher.pid, 'Launcher missing PID');
    const rows = await bounded(() => adapter.readProcesses(), Math.min(5000, cleanupTimeoutMs));
    updateOwnedProcesses(rows, []);
    const owner = rows.find(row => row.pid === launcher.pid);
    assert.ok(owner?.created && Date.parse(owner.created) >= start - 1000, 'Launcher ownership unverified');
    captured = [owner]; receipt.ownership_confirmed = true;
    await snapshot();
    if (elapsed() >= timeoutMs) receipt.timed_out = true;
    else launcher.send({nonce, type: 'run', command, args}, error => {if (error) receipt.observation_error = 'LAUNCHER_IPC_FAILED';});
    let nextPoll = elapsed();
    while (!streamClosed && !receipt.timed_out && !receipt.spawn_error && !receipt.output_limit_exceeded && !receipt.observation_error) {
      if (elapsed() >= timeoutMs) {receipt.timed_out = true; break;}
      if (commandExited && elapsed() - closeTime >= closeGraceMs) {receipt.observation_error = 'STREAM_CLOSE_TIMEOUT'; break;}
      await delay(Math.min(pollIntervalMs, 100));
      if (!streamClosed && elapsed() < timeoutMs && elapsed() >= nextPoll) {
        await snapshot(); nextPoll = elapsed() + pollIntervalMs;
      }
    }
  } catch {if (!receipt.spawn_error) receipt.observation_error ||= 'OWNERSHIP_OR_ADAPTER_FAILED';}
  if (launcher && !receipt.ownership_confirmed && !launcherExited) {
    // No target was released. Gracefully ask this exact IPC-connected launcher to
    // close itself; do not grant kill rights using an unverified/recycled PID.
    try {launcher.send({nonce, type: 'cancel'}, () => {});} catch { /* Remains unconfirmed. */ }
    await delay(Math.min(250, cleanupTimeoutMs));
  }
  if (receipt.ownership_confirmed) {
    const cleanupEnd = performance.now() + cleanupTimeoutMs;
    try {
      await snapshot();
      while (receipt.remaining.length && performance.now() < cleanupEnd) {
        receipt.forced_cleanup = true;
        // Root first, then captured identities; each adapter action rechecks birth.
        for (const row of receipt.remaining) {
          if (performance.now() >= cleanupEnd) break;
          const result = await bounded(() => adapter.stopIdentity(row), Math.min(5000, Math.max(1, cleanupEnd - performance.now())));
          receipt.stop_actions.push({pid: row.pid, created: row.created, result});
          if (!['already-gone', 'stop-requested'].includes(result)) receipt.observation_error ||= 'IDENTITY_STOP_REFUSED';
        }
        await delay(50);
        await snapshot();
      }
      receipt.captured_tree_empty = receipt.remaining.length === 0;
    } catch {
      receipt.observation_error ||= 'CLEANUP_METADATA_FAILED';
      // Snapshot failure must not skip cleanup of already captured identities.
      // stopIdentity must independently recheck creation; a cached PID is not authority.
      for (const row of captured) {
        if (performance.now() >= cleanupEnd) break;
        try {
          const result = await bounded(() => adapter.stopIdentity(row), Math.min(5000, Math.max(1, cleanupEnd - performance.now())));
          receipt.forced_cleanup = true;
          receipt.stop_actions.push({pid: row.pid, created: row.created, result});
        } catch { /* Retain unknown cleanup status and continue within the bound. */ }
      }
    }
  }
  // A final close grace is bounded; destroying our read ends is not child success.
  const streamEnd = performance.now() + closeGraceMs;
  while (!streamClosed && launcher && performance.now() < streamEnd) await delay(25);
  // Events may arrive while metadata is awaited, bypassing the loop body.
  // Completion timestamps, not only polling observations, enforce both bounds.
  const completionTimes = [receipt.command_exit_elapsed_ms, receipt.launcher_exit_elapsed_ms, receipt.streams_closed_elapsed_ms];
  if (completionTimes.some(value => value !== null && value > timeoutMs)) receipt.timed_out = true;
  if (commandExited && streamClosed && receipt.streams_closed_elapsed_ms - closeTime > closeGraceMs)
    receipt.observation_error ||= 'STREAM_CLOSE_TIMEOUT';
  receipt.streams_closed = streamClosed;
  receipt.natural_exit = commandExited && receipt.command_signal === null &&
    launcherExited && receipt.launcher_signal === null && !receipt.forced_cleanup;
  receipt.passed = receipt.natural_exit && receipt.command_exit_code === 0 && receipt.launcher_exit_code === 0 &&
    streamClosed && receipt.ownership_confirmed && receipt.captured_tree_empty && !receipt.timed_out &&
    !receipt.output_limit_exceeded && !receipt.spawn_error && !receipt.observation_error;
  receipt.finished_at = new Date().toISOString();
  if (launcher) {
    if (!streamClosed) {launcher.stdout.destroy(); launcher.stderr.destroy();}
    if (launcher.connected) {try {launcher.disconnect();} catch { /* Record remains unconfirmed. */ }}
    launcher.unref();
  }
  return {receipt, stdout: Buffer.concat(buffers.stdout).toString('utf8'), stderr: Buffer.concat(buffers.stderr).toString('utf8')};
}

function gatedLauncher(nonce) {
  let started = false;
  const send = value => {if (process.connected) process.send({...value, nonce}, () => {});};
  const finish = () => {if (process.connected) process.disconnect();};
  process.on('message', message => {
    if (message?.nonce !== nonce || started) return;
    if (message.type === 'cancel') {started = true; finish(); return;}
    if (message.type !== 'run') return;
    started = true;
    const target = spawn(message.command, message.args, {windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']});
    target.once('error', () => {process.exitCode = 1; send({type: 'target-spawn-error'});});
    target.once('exit', (code, signal) => {
      process.exitCode = code ?? 1;
      send({type: 'target-exit', code, signal});
    });
    target.once('close', finish);
  });
  // IPC closure before release cancels the gated launcher. After release the owned
  // target must finish or be identity-cleaned by the coordinator.
}
if (process.argv[1] === SELF && process.argv[2] === '--bounded-launcher') gatedLauncher(process.argv[3]);
