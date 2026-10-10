import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vinext",
  ".wrangler",
  "build",
  "dist",
  "node_modules",
]);
const forbiddenExtensions = new Set([
  ".avif",
  ".heic",
  ".heif",
  ".icns",
  ".jxl",
]);
const findings = [];
let filesScanned = 0;

await scan(appRoot);

if (findings.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "fail",
        code: "unsafe_build_time_image_input",
        reason:
          "Vinext embeds an image-size parser affected by infinite-loop advisories. Review and convert these assets to PNG/WebP before build.",
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
    filesScanned,
    policy: "reject_icns_jxl_heif_avif_build_inputs",
  }),
);

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      await scan(path);
      continue;
    }
    if (!entry.isFile()) continue;
    filesScanned += 1;
    const extension = extname(entry.name).toLowerCase();
    if (forbiddenExtensions.has(extension)) {
      findings.push({ path: relative(path), reason: `forbidden_extension:${extension}` });
      continue;
    }
    const content = await readFile(path);
    const signature = detectRiskyImageSignature(content);
    if (signature) {
      findings.push({ path: relative(path), reason: `forbidden_signature:${signature}` });
    }
  }
}

function detectRiskyImageSignature(content) {
  if (content.length >= 4 && content.subarray(0, 4).toString("ascii") === "icns") {
    return "icns";
  }
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0x0a) {
    return "jxl_codestream";
  }
  const jxlContainer = Buffer.from([
    0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
  ]);
  if (content.length >= jxlContainer.length && content.subarray(0, 12).equals(jxlContainer)) {
    return "jxl_container";
  }
  if (content.length >= 12 && content.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = content.subarray(8, 12).toString("ascii").toLowerCase();
    if (["avif", "heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return `heif_family:${brand}`;
    }
  }
  return null;
}

function relative(path) {
  return path.slice(appRoot.length + 1).replaceAll("\\", "/");
}
