import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is unavailable; run this check through npm run verify.");
}
const checks = [
  [process.execPath, [npmCli, "run", "contract:check"]],
  [process.execPath, [npmCli, "run", "rules:check"]],
  [process.execPath, [npmCli, "run", "security:assets"]],
  [process.execPath, [npmCli, "run", "test:bridge"]],
  [process.execPath, [npmCli, "run", "typecheck"]],
  [process.execPath, [npmCli, "run", "lint"]],
  [process.execPath, [npmCli, "run", "build"]],
  [process.execPath, ["tests/run-tests.mjs"]],
  [process.execPath, [npmCli, "audit", "--audit-level=moderate"]],
];

for (const [command, args] of checks) {
  console.log(`\n[verify] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[verify] all release checks passed");
