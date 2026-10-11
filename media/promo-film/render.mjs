// Renders film.html to an MP4: parallel headless-Chromium workers capture frames from the
// deterministic window.renderFrame(t), pipe them straight into ffmpeg segments, then the segments are
// joined and muxed with the synthesized score (two-pass loudness normalisation to -14 LUFS).
//
//   node media/promo-film/render.mjs [--workers 4] [--out media/promo-film/out] [--from 0] [--to 80]
//
// Needs Playwright (set PW_ROOT to the folder that holds node_modules/playwright if it is global),
// ffmpeg on PATH, and python3 with numpy for the score.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const cues = JSON.parse(readFileSync(join(HERE, 'cues.json'), 'utf8'));
const FPS = cues.fps, WORKERS = Number(args.workers ?? 4), OUT = resolve(args.out ?? join(HERE, 'out'));
const FROM = Math.round(Number(args.from ?? 0) * FPS), TO = Math.round(Number(args.to ?? cues.duration) * FPS);
mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.PW_ROOT ? process.env.PW_ROOT + '/' : import.meta.url);
const { chromium } = require('playwright');

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const path = resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/media/promo-film/film.html`;

function ffmpeg(argv, input) {
  const p = spawn('ffmpeg', argv, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  return { proc: p, done: new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`))))) };
}

async function worker(k, from, to) {
  const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: cues.width, height: cues.height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.ready);
  const seg = join(OUT, `seg-${String(k).padStart(2, '0')}.mp4`);
  const enc = ffmpeg(['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'film', '-pix_fmt', 'yuv420p', '-r', String(FPS), seg], true);
  const started = Date.now();
  for (let f = from; f < to; f++) {
    await page.evaluate(t => window.renderFrame(t), f / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!enc.proc.stdin.write(jpg)) await new Promise(r => enc.proc.stdin.once('drain', r));
    if ((f - from) % 150 === 149) console.log(`worker ${k}: ${f - from + 1}/${to - from} frames · ${((Date.now() - started) / (f - from + 1)).toFixed(0)} ms/frame`);
  }
  enc.proc.stdin.end();
  await enc.done;
  await browser.close();
  if (errors.length) throw new Error(`worker ${k}: ${errors.join('; ')}`);
  return seg;
}

const total = TO - FROM, size = Math.ceil(total / WORKERS), t0 = Date.now();
console.log(`rendering ${total} frames (${(total / FPS).toFixed(1)}s) with ${WORKERS} workers → ${OUT}`);
const segs = await Promise.all(Array.from({ length: WORKERS }, (_, k) => [FROM + k * size, Math.min(TO, FROM + (k + 1) * size)]).filter(([a, b]) => b > a).map(([a, b], k) => worker(k, a, b)));
server.close();
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

writeFileSync(join(OUT, 'segments.txt'), segs.map(s => `file '${s}'`).join('\n') + '\n');
const video = join(OUT, 'video.mp4');
await ffmpeg(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'segments.txt'), '-c', 'copy', video]).done;

const wav = join(OUT, 'score.wav');
if (!existsSync(wav) || statSync(wav).mtimeMs < statSync(join(HERE, 'score.py')).mtimeMs) {
  const r = spawnSync('python3', [join(HERE, 'score.py'), wav], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('score.py failed');
}
// Two-pass loudness normalisation for online video (-14 LUFS, -1.5 dBTP).
const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{'), probe.stderr.lastIndexOf('}') + 1));
const ln = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
const final = join(OUT, args.name ?? 'evi-x-promo-1080p.mp4');
const startSec = FROM / FPS, durSec = total / FPS;
await ffmpeg(['-y', '-loglevel', 'error', '-i', video, '-ss', String(startSec), '-t', String(durSec), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', ln + ',aresample=48000', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', final]).done;
console.log(`wrote ${final} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
