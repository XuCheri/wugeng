#!/usr/bin/env node
// 用游戏真实的 Canvas 程序绘图模块（ink.js / sprites.js / 霞鹜文楷）生成 TapTap 商店素材，
// 100% 保证商店图标、横竖宣传图与实机画风一致，彻底杜绝「商店图与实机画风不符」拒审。

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');
const OUT = path.join(ROOT, 'store');
mkdirSync(OUT, { recursive: true });

const PORT = process.env.STORE_PORT || '8080';
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

const PAGE_HTML = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/styles.css">
<style>html,body{margin:0;background:#EFE6D2;overflow:hidden}canvas{display:block}</style>
<canvas id="c"></canvas>
<script type="module">
import { INK, VERM, PAPER, LANTERN, inkA, lanternA } from '/src/render/palette.js';
import { getPaperTile, brushStroke, setMisregistration, withMisreg } from '/src/render/ink.js';
import { setSpriteScale, blit, heroSprite, handLanternSprite, heroHand, enemySprite, projSprite, shadowSprite } from '/src/render/sprites.js';

await document.fonts.ready;
setMisregistration(true);

window.drawAsset = function(kind, W, H) {
  const c = document.getElementById('c');
  c.width = W; c.height = H;
  c.style.width = W + 'px'; c.style.height = H + 'px';
  setSpriteScale(3);
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = g.createPattern(getPaperTile(256), 'repeat');
  g.fillRect(0, 0, W, H);

  // 四周淡墨暗角
  const vig = g.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.2, W * 0.5, H * 0.52, Math.max(W, H) * 0.72);
  vig.addColorStop(0, 'rgba(28,26,23,0)');
  vig.addColorStop(1, 'rgba(28,26,23,0.42)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  if (kind === 'icon') {
    const cx = W * 0.48, cy = H * 0.68, sc = W / 96;
    // 灯笼暖光圆
    const lg = g.createRadialGradient(cx + sc * 7.5, cy - sc * 12, sc * 2, cx + sc * 7.5, cy - sc * 12, W * 0.42);
    lg.addColorStop(0, lanternA(0.58));
    lg.addColorStop(0.6, lanternA(0.18));
    lg.addColorStop(1, lanternA(0));
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    // 环形笔触刀光
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = -0.9 + (i / 24) * 4.2;
      pts.push([cx + Math.cos(a) * W * 0.34, (cy - sc * 14) + Math.sin(a) * W * 0.34]);
    }
    brushStroke(g, pts, W * 0.045, { seed: 11, dry: 0.45, taperIn: 0.25, taperOut: 0.45 });
    // 老周 + 手提灯笼
    blit(g, shadowSprite(10), cx, cy, sc, sc);
    blit(g, heroSprite('zhou', 1, false), cx, cy, sc, sc);
    const h = heroHand();
    blit(g, handLanternSprite('lantern_cinnabar'), cx + h.x * sc, cy + h.y * sc, sc, sc, -0.14);
    // 右上朱红方印「五更」
    const sx = W * 0.73, sy = H * 0.12, sw = W * 0.16, sh = W * 0.25;
    withMisreg(g, () => {
      g.fillStyle = VERM;
      g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = PAPER;
      g.lineWidth = Math.max(3, W * 0.008);
      g.strokeRect(sx + sw * 0.1, sy + sw * 0.1, sw * 0.8, sh - sw * 0.2);
      g.fillStyle = PAPER;
      g.font = Math.round(sw * 0.56) + 'px "WenKai", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('五', sx + sw * 0.5, sy + sh * 0.31);
      g.fillText('更', sx + sw * 0.5, sy + sh * 0.71);
    });
    // 外框细墨线
    g.strokeStyle = inkA(0.5);
    g.lineWidth = Math.max(4, W * 0.01);
    g.strokeRect(W * 0.03, H * 0.03, W * 0.94, H * 0.94);
    return;
  }

  // 横版 / 竖版 / 方形海报
  const isWide = W > H;
  const isSquare = W === H;
  const cx = isWide ? W * 0.62 : W * 0.5;
  const cy = isWide ? H * 0.64 : isSquare ? H * 0.71 : H * 0.64;
  const unit = Math.min(W, H) * (isSquare ? 0.80 : 1);
  const sc = unit / 150;

  // 灯笼暖光
  const lg = g.createRadialGradient(cx, cy - sc * 12, sc * 4, cx, cy - sc * 12, unit * 0.34);
  lg.addColorStop(0, lanternA(0.55));
  lg.addColorStop(0.65, lanternA(0.16));
  lg.addColorStop(1, lanternA(0));
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);

  // 笔触圆弧
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const a = -0.6 + (i / 28) * 4.5;
    pts.push([cx + Math.cos(a) * unit * 0.24, (cy - sc * 10) + Math.sin(a) * unit * 0.24]);
  }
  brushStroke(g, pts, unit * 0.028, { seed: 7, dry: 0.5, taperIn: 0.2, taperOut: 0.45 });

  // 四周群鬼剪影
  const ring = [
    ['shade', -0.36, -0.14, 1], ['paperkid', -0.30, 0.16, 1], ['lanternghost', -0.22, -0.26, 1],
    ['weasel', 0.30, 0.18, -1], ['shade', 0.34, -0.08, -1], ['sedan', 0.26, -0.24, -1],
    ['drowned', -0.14, 0.27, 1], ['paperkid', 0.16, 0.28, -1],
  ];
  for (const [t, dx, dy, flip] of ring) {
    const ex = cx + dx * unit, ey = cy + dy * unit;
    blit(g, shadowSprite(12), ex, ey, sc * 0.85, sc * 0.85);
    blit(g, enemySprite(t, 0, false), ex, ey, sc * 0.85 * flip, sc * 0.85);
  }
  // 飞行符纸与铜钱剑
  blit(g, projSprite('talismanEvo'), cx - unit * 0.16, cy - unit * 0.12, sc * 0.9, sc * 0.9, -0.6);
  blit(g, projSprite('coinsword'), cx + unit * 0.18, cy - unit * 0.08, sc * 0.9, sc * 0.9, 0.5);

  // 主角老周
  blit(g, shadowSprite(10), cx, cy, sc * 1.15, sc * 1.15);
  blit(g, heroSprite('zhou', 1, false), cx, cy, sc * 1.15, sc * 1.15);
  const h = heroHand();
  blit(g, handLanternSprite('lantern_cinnabar'), cx + h.x * sc * 1.15, cy + h.y * sc * 1.15, sc * 1.15, sc * 1.15, -0.12);

  // 标题《五更天》+ 朱印「守夜」
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (isWide) {
    const tx = W * 0.23, ty = H * 0.44;
    const fs = Math.round(H * 0.15);
    g.font = fs + 'px "WenKai", serif';
    ['五', '更', '天'].forEach((ch, i) => g.fillText(ch, tx, ty + (i - 1) * fs * 1.08));
    g.font = Math.round(H * 0.036) + 'px "WenKai", serif';
    g.fillStyle = inkA(0.72);
    g.fillText('一更起 · 五更止 · 鸡鸣天亮', tx, H * 0.84);
    // 朱印
    const sw = H * 0.075, sh = H * 0.13, sx = tx + fs * 0.62, sy = ty - fs * 1.45;
    g.fillStyle = VERM; g.fillRect(sx, sy, sw, sh);
    g.strokeStyle = PAPER; g.lineWidth = 2; g.strokeRect(sx + 4, sy + 4, sw - 8, sh - 8);
    g.fillStyle = PAPER; g.font = Math.round(sw * 0.54) + 'px "WenKai", serif';
    g.fillText('守', sx + sw / 2, sy + sh * 0.32);
    g.fillText('夜', sx + sw / 2, sy + sh * 0.72);
  } else {
    const fs = Math.round(W * (isSquare ? 0.11 : 0.13));
    const ty = isSquare ? H * 0.13 : H * 0.18;
    g.font = fs + 'px "WenKai", serif';
    g.fillText('五 更 天', W * 0.5, ty);
    g.font = Math.round(W * (isSquare ? 0.032 : 0.036)) + 'px "WenKai", serif';
    g.fillStyle = inkA(0.72);
    g.fillText('一更起 · 五更止 · 鸡鸣天亮', W * 0.5, ty + fs * 0.78);
  }
};
window.__ready = true;
</script>`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route(`http://localhost:${PORT}/__store_canvas__.html`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE_HTML }));
  await page.goto(`http://localhost:${PORT}/__store_canvas__.html`);
  await page.waitForFunction(() => window.__ready === true);

  const specs = [
    ['icon-512.png', 'icon', 512, 512],
    ['icon-1024.png', 'icon', 1024, 1024],
    ['banner-1920x1080.png', 'banner', 1920, 1080],
    ['poster-1080x1920.png', 'poster', 1080, 1920],
    ['square-1080x1080.png', 'square', 1080, 1080],
  ];
  for (const [file, kind, w, h] of specs) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(([k, W, H]) => window.drawAsset(k, W, H), [kind, w, h]);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log('saved', file, `${w}x${h}`);
  }
} finally {
  await browser.close();
}
