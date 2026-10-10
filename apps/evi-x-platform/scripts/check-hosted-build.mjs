import fs from 'node:fs';
import path from 'node:path';

const build = path.resolve('.next');
if (!fs.existsSync(path.join(build, 'BUILD_ID'))) throw new Error('Production Next build missing');
let checked = 0;
function walk(dir, client) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, item.name);
    if (item.isDirectory()) walk(filename, client);
    else if (/\.(?:js|mjs|cjs)$/.test(item.name)) {
      const source = fs.readFileSync(filename, 'utf8');
      if (/["']cloudflare:workers["']/.test(source)) throw new Error(`Cloudflare runtime dependency: ${filename}`);
      if (client && /EVIX_AUTH_SECRET|EVIX_KEYRING|EVI_X_AGENT_MASTER_KEY|EVI_X_ONLYOFFICE_JWT_SECRET/.test(source)) {
        throw new Error(`Server secret configuration referenced by client bundle: ${filename}`);
      }
      checked++;
    }
  }
}
walk(path.join(build, 'server'), false);
walk(path.join(build, 'static'), true);
console.log(JSON.stringify({ status: 'passed', checked, runtime: 'standard-next', cloudflare: false }));
