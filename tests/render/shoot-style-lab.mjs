// 风格检查截图：node tests/render/shoot-style-lab.mjs [port]
// 需要先在仓库根目录运行 python3 -m http.server <port>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'e2e/screenshots');
mkdirSync(out, { recursive: true });
const port = process.argv[2] || '8765';
const only = process.argv[3] || null;

const shots = [
  ['style-lab-watch1', 'watch=1&scene=crowd'],
  ['style-lab-watch3', 'watch=3&scene=crowd'],
  ['style-lab-watch5', 'watch=5&scene=crowd'],
  ['style-lab-dawn', 'watch=6&scene=crowd'],
  ['style-lab-boss', 'watch=4&scene=boss'],
  ['style-lab-hud', 'watch=5&scene=hud'],
  ['style-lab-sheet', 'scene=sheet'],
  ['style-lab-low', 'watch=3&scene=crowd&low=1'],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
for (const [name, qs] of shots) {
  if (only && !name.includes(only)) continue;
  await page.goto(`http://localhost:${port}/style-lab.html?${qs}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('saved', name);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
