import {spawnSync} from 'node:child_process';

// Metadata only: never read command lines, environment, user names or secrets.
export function readWindowsProcesses() {
  const command = "$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate -ErrorAction Stop | Where-Object { $_.ProcessId -gt 0 } | ForEach-Object { [pscustomobject]@{ pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; created=$(if($null -eq $_.CreationDate){$null}else{$_.CreationDate.ToUniversalTime().ToString('o')}) } }) | ConvertTo-Json -Compress";
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw new Error('Process-tree metadata unavailable; retain isolated test state');
  return validateProcesses(JSON.parse(result.stdout.replace(/^\uFEFF/, '')));
}

export function validateProcesses(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('Missing process snapshot');
  const seen = new Set();
  for (const row of records) {
    if (!row || !Number.isInteger(row.pid) || row.pid <= 0 || !Number.isInteger(row.parent) || row.parent < 0 ||
        (row.created !== null && (typeof row.created !== 'string' || !Number.isFinite(Date.parse(row.created)))) || seen.has(row.pid)) throw new Error('Invalid process snapshot');
    seen.add(row.pid);
  }
  return records;
}

export function captureOwnedTree(records, pid, startedAfter) {
  validateProcesses(records);
  const root = records.find(row => row.pid === pid);
  if (!Number.isFinite(startedAfter) || !root?.created || Date.parse(root.created) < startedAfter) throw new Error('Test process ownership could not be verified');
  return extendTree(records, [root]);
}

function extendTree(records, known) {
  const tree = [...known];
  const identities = new Set(tree.map(row => `${row.pid}:${row.created}`));
  for (let index = 0; index < tree.length; index++) {
    const parent = tree[index];
    for (const row of records) {
      if ((row.parent === parent.pid || row.pid === parent.pid) && row.created === null) throw new Error('Owned process metadata incomplete; retain state');
      const key = `${row.pid}:${row.created}`;
      if (!identities.has(key) && row.parent === parent.pid && Date.parse(row.created) >= Date.parse(parent.created)) {
        identities.add(key); tree.push(row);
      }
    }
  }
  return tree;
}

export function remainingOwnedProcesses(records, captured) {
  validateProcesses(records);
  if (!Array.isArray(captured) || !captured.length) throw new Error('Missing owned process tree');
  // Include descendants appearing during shutdown, and retain known descendants
  // even when their exited parent is absent. PID reuse never grants kill rights.
  const expanded = extendTree(records, captured);
  return records.filter(row => expanded.some(owned => row.pid === owned.pid && row.created === owned.created));
}
