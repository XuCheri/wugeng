#!/usr/bin/env node
// 录制《五更天》真实实机录屏（720×1280, 24fps, ~18s, H.264 MP4）及新版百物谱/暂停行囊 1080×1920 截图。
// 严格遵循 TapTap gameplay_demo_video 规范：
// - 前 5 秒内直接进入核心战斗玩法，核心玩法持续 16+ 秒
// - 无额外人声配音、无外加字幕、无画中画与手机外壳边框

import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');

const PORT = 8794;
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const STORE_DIR = path.join(ROOT, 'store');
const FRAMES_DIR = '/tmp/wugeng_demo_frames';

fs.mkdirSync(STORE_DIR, { recursive: true });
fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

function startServer(port) {
  const proc = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
  return new Promise((resolve) => setTimeout(() => resolve(proc), 600));
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

try {
  // 1) 先截两张 1080×1920（360×640 @ dpr=3）实机图：百物谱图鉴 & 局内暂停行囊加成
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.click('text=开始守夜');
    await page.waitForSelector('.screen--hub');
    await page.evaluate(() => {
      const s = window.__wugeng.save;
      s.coins = 680;
      s.unlockedHeroes = ['zhou', 'mian'];
      s.codex.weapons = ['gong', 'lantern', 'talisman', 'coinsword', 'paperman'];
      s.codex.evolutions = ['gong', 'lantern'];
      s.codex.relics = ['clapper', 'censer', 'bagua', 'cinnabar'];
      s.codex.enemies = { paperkid: 420, shade: 260, lanternghost: 190, weasel: 85, horse: 3 };
      window.__wugeng.showHub();
    });
    await page.click('.hub-nav .btn:nth-child(2)');
    await page.waitForSelector('.codex-scroll');
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(STORE_DIR, 'shot-5-codex.png') });
    await page.click('.veil .btn--ghost');

    await page.click('text=出门打更');
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const r = window.__wugeng.game.run;
      r.watch = 3;
      r.time = 265;
      r.stats.kills = 412;
      r.stats.coins = 38;
      r.player.level = 14;
      r.weapons = [
        { id: 'gong', level: 5, evolved: true, cd: 0.4 },
        { id: 'talisman', level: 4, evolved: false, cd: 0.2 },
        { id: 'lantern', level: 3, evolved: false, cd: 0.2 },
      ];
      r.relics = [
        { id: 'clapper', level: 3 },
        { id: 'cinnabar', level: 2 },
        { id: 'bagua', level: 2 },
      ];
    });
    await page.click('.pause-btn');
    await page.waitForSelector('.pause-loadout');
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(STORE_DIR, 'shot-6-pause.png') });
    await ctx.close();
  }

  // 2) 录制 18 秒 720×1280 (360×640 @ dpr=2) 24fps 纯实机核心战斗视频（共 432 帧）
  {
    const FPS = 24;
    const TOTAL_FRAMES = FPS * 18; // 18.0 秒
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.click('text=开始守夜');
    await page.click('text=出门打更');
    // 关闭首局提示，配置二更丰富构筑，保持真实主循环运行以完整呈现刀光、墨迹、伤害朱印与粒子特效
    await page.evaluate(async () => {
      document.querySelector('.run-hint')?.remove();
      const { addOrUpgradeWeapon } = await import('./src/sim/weapons.js');
      const { addOrUpgradeRelic } = await import('./src/sim/relics.js');
      const { recomputeMods } = await import('./src/sim/player.js');
      const g = window.__wugeng.game;
      const r = g.run;
      r.time = 152;
      r.watch = 2;
      addOrUpgradeWeapon(r, 'gong');
      addOrUpgradeWeapon(r, 'talisman');
      addOrUpgradeWeapon(r, 'talisman');
      addOrUpgradeWeapon(r, 'lantern');
      addOrUpgradeWeapon(r, 'brush');
      addOrUpgradeWeapon(r, 'coinsword');
      addOrUpgradeRelic(r, 'clapper');
      addOrUpgradeRelic(r, 'censer');
      recomputeMods(r);
      r.player.hp = r.player.maxHp;
      r.player.invulnT = 20; // 演示核心战斗过程不意外中断
    });

    // 通过虚拟触控按住在屏幕下方做平滑「8」字走位风筝
    await page.mouse.move(180, 510);
    await page.mouse.down();
    let overlayHold = 0;
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const a = f * 0.065;
      await page.mouse.move(180 + Math.cos(a) * 34, 510 + Math.sin(a * 2) * 26);

      if (f === 190) {
        await page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (r.status === 'playing') r.player.xp = r.player.xpNext + 1;
        });
      }
      if (f === 300) {
        await page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.player.ult = r.player.ultMax;
        });
        await page.keyboard.press('Space');
      }

      const ov = await page.evaluate(() => window.__wugeng.overlay);
      if (ov === 'levelup') {
        overlayHold++;
        if (overlayHold >= 24) {
          await page.mouse.up();
          await page.click('.qian >> nth=0');
          await page.mouse.move(180, 510);
          await page.mouse.down();
          overlayHold = 0;
        }
      } else if (ov === 'chest') {
        overlayHold++;
        if (overlayHold >= 20) {
          await page.mouse.up();
          await page.click('.veil .btn--seal');
          await page.mouse.move(180, 510);
          await page.mouse.down();
          overlayHold = 0;
        }
      }
      await page.waitForTimeout(34);
      const fp = path.join(FRAMES_DIR, `f_${String(f).padStart(4, '0')}.jpg`);
      await page.screenshot({ path: fp, type: 'jpeg', quality: 90 });
    }
    await page.mouse.up();
    await ctx.close();

    const outMp4 = path.join(STORE_DIR, 'gameplay-demo.mp4');
    execFileSync('/usr/bin/ffmpeg', [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(FRAMES_DIR, 'f_%04d.jpg'),
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outMp4,
    ], { stdio: 'inherit' });
    console.log('Recorded video:', outMp4, fs.statSync(outMp4).size, 'bytes');
  }
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}
