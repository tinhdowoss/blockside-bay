// BLOCKSIDE BAY screenshot tool: serves game/ on a local port, opens each ?shot= scene in headless
// Chromium (playwright-core), waits for window.__shotReady and saves a 1280x720 JPEG under 256 KiB.
// Usage: PW_DIR=/path/with/node_modules node tools/capture.mjs [name ...] [--out dir]
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
const require = createRequire(join(process.env.PW_DIR || root, 'package.json'));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(root, 'screenshots');
const only = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8')).filter((s) => !only.length || only.some((o) => s.name.includes(o)));
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(gameDir, path === '/' ? 'index.html' : path);
  if (!file.startsWith(gameDir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

for (const s of shots) {
  const url = `http://127.0.0.1:${port}/index.html${s.query}`;
  console.log('shot', s.name, url);
  await page.goto(url);
  await page.waitForFunction('window.__shotReady === true', null, { timeout: 60000 });
  await page.waitForTimeout(300);
  let q = 88, buf;
  do {
    buf = await page.screenshot({ type: 'jpeg', quality: q });
    q -= 4;
  } while (buf.length > 250 * 1024 && q > 40);
  writeFileSync(join(outDir, s.name), buf);
  console.log(`  saved ${s.name} ${(buf.length / 1024).toFixed(0)} KiB q=${q + 4}`);
}
await browser.close();
server.close();
