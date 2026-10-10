import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Preserve the original module identity for relative imports, while reading
// archived Cloudflare route source in regression-only tests.
export function legacySource(input) {
  const filename = input instanceof URL ? fileURLToPath(input) : input;
  if (existsSync(filename)) return filename;
  const marker = `${path.sep}app${path.sep}api${path.sep}`;
  if (!filename.includes(marker) || !filename.endsWith(`${path.sep}route.ts`)) return filename;
  const archived = filename.replace(marker, `${path.sep}legacy${path.sep}cloudflare-api${path.sep}`);
  return existsSync(archived) ? archived : filename;
}
