import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(appRoot, "dist");
const nextRoot = resolve(appRoot, ".next");
const nextStaticRoot = resolve(nextRoot, "static");
const nextServerRoot = resolve(nextRoot, "server");

const forbidden = [
  "agentctl_read_bridge.py",
  "bridge.config.json",
  "evx_local_",
  "subprocess.Popen",
  "ZHENGDA_AGENT_FAULT_POINT",
  "node:child_process",
  "cloudflare:workers",
  "drizzle-orm",
  "EVIX_AUTH_SECRET",
  "EVIX_KEYRING",
  "EVI_X_AGENT_MASTER_KEY",
  "EVI_X_ONLYOFFICE_JWT_SECRET",
  "EVIX_MIGRATION_DATABASE_URL",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "DASHSCOPE_API_KEY",
];

async function isDirectory(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveBundleTarget(argv) {
  const targetIdx = argv.indexOf("--target");
  if (targetIdx !== -1 && argv[targetIdx + 1]) {
    const explicit = resolve(argv[targetIdx + 1]);
    if (!(await isDirectory(explicit))) {
      throw new Error("Target bundle directory is unavailable.");
    }
    return { targetRoot: explicit, bundleKind: "explicit" };
  }
  if (await isDirectory(distRoot)) {
    return { targetRoot: distRoot, bundleKind: "dist" };
  }
  if ((await isDirectory(nextStaticRoot)) && (await isDirectory(nextServerRoot))) {
    return { targetRoot: nextStaticRoot, bundleKind: ".next/static" };
  }
  throw new Error(
    "Neither dist nor .next production build output is available; run the production build first.",
  );
}

const { targetRoot, bundleKind } = await resolveBundleTarget(process.argv.slice(2));
const findings = [];
let filesScanned = 0;

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(filePath);
      continue;
    }
    if (!entry.isFile()) continue;
    filesScanned += 1;
    const content = await readFile(filePath);
    for (const marker of forbidden) {
      if (content.includes(Buffer.from(marker))) {
        findings.push({
          path: filePath.slice(targetRoot.length + 1).replaceAll("\\", "/"),
          marker,
        });
      }
    }
  }
}

await scan(targetRoot);

if (filesScanned === 0) {
  console.error(
    JSON.stringify(
      {
        status: "fail",
        code: "empty_client_bundle",
        bundleKind,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "fail",
        code: "local_bridge_leaked_into_cloud_bundle",
        bundleKind,
        findings,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: "pass",
    bundleKind,
    filesScanned,
    policy: "local_bridge_runtime_and_secrets_excluded_from_cloud_bundle",
  }),
);
