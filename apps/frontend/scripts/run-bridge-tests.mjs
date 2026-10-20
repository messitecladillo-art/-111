import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const testPath = fileURLToPath(
  new URL("../local-bridge/tests/test_bridge.py", import.meta.url),
);

const candidates = process.env.EVI_X_PYTHON
  ? [[process.env.EVI_X_PYTHON, []]]
  : process.platform === "win32"
    ? [["python", []], ["py", ["-3"]]]
    : [["python3", []], ["python", []]];

let selected = null;
for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [
    ...prefix,
    "-B",
    "-X",
    "utf8",
    "-c",
    "import sys, yaml, jsonschema; assert sys.version_info >= (3, 9)",
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (!probe.error && probe.status === 0) {
    selected = [command, prefix];
    break;
  }
}

if (!selected) {
  throw new Error("Python 3.9+ with PyYAML and jsonschema is required for the local bridge regression tests.");
}

const [command, prefix] = selected;
const result = spawnSync(command, [...prefix, "-B", "-X", "utf8", testPath], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
  shell: false,
  windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
