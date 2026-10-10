import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(appRoot, "dist");
const forbidden = [
  "agentctl_read_bridge.py",
  "bridge.config.json",
  "evx_local_",
  "subprocess.Popen",
  "ZHENGDA_AGENT_FAULT_POINT",
];
const findings = [];
let filesScanned = 0;

if (!(await stat(distRoot)).isDirectory()) {
  throw new Error("dist is unavailable; run this check after the production build.");
}

await scan(distRoot);
if (findings.length > 0) {
  console.error(JSON.stringify({ status: "fail", code: "local_bridge_leaked_into_cloud_bundle", findings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "pass", filesScanned, policy: "local_bridge_runtime_and_secrets_excluded_from_cloud_bundle" }));

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (!entry.isFile()) continue;
    filesScanned += 1;
    const content = await readFile(path);
    for (const marker of forbidden) {
      if (content.includes(Buffer.from(marker))) {
        findings.push({ path: path.slice(distRoot.length + 1).replaceAll("\\", "/"), marker });
      }
    }
  }
}
