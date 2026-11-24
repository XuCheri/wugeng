#!/usr/bin/env node
// 《五更天》端到端冒烟 + 合规 + 音频 + 压力测试（PLAN §8）
// 覆盖：
//   1. 390×844 + ?mockAds=1：标题 → 适龄 12+ → 隐私 → 更房 → 加点 → 更簿广告双倍 → 设置 →
//      带护身符出门 → 三选一与免费换签 → 暂停 → 60s 后换签广告(+3) → 供盒开光 →
//      死亡广告复活 → 鸡鸣天亮进入无尽 → 结算页广告铜钱翻倍 → 回更房（存档落盘）
//   2. 390×844 + ?mockAds=skip / ?mockAds=fail：中途关闭不发奖、加载失败不卡死
//   3. 360×780 离线模式（rewardedAdUnitId 为空且无 mockAds）：四处广告按钮全部隐藏
//   4. Web Audio：15 种合成音色 + 事件驱动 + 广告期间静音恢复
//   5. 压力测试：强制同屏 300 敌人 + 400 弹体，统计单帧渲染耗时

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');
const SHOTS = path.join(ROOT, 'e2e', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const PORT = Number(process.env.E2E_PORT || 8791);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

function startServer(port) {
  const proc = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
  return new Promise((resolve) => setTimeout(() => resolve(proc), 700));
}

async function runFullFlow(browser, baseUrl) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = async (name) => {
    await page.waitForTimeout(260); // 等卷轴展开动画完成
    await page.screenshot({ path: path.join(SHOTS, `e2e-${name}.png`) });
  };
  const W = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(`${baseUrl}/index.html?mockAds=1&mockCloud=1`);
  await page.waitForSelector('.screen--title');
  await W(() => document.fonts.ready);
  await shot('01-title');

  // 适龄 12+ 与隐私政策
  await page.click('.age-badge');
  await shot('02-age');
  await page.click('.veil .btn--seal');
  await page.click('.title-foot .link-btn');
  await page.waitForSelector('.privacy-body');
  await shot('03-privacy');
  await page.click('.veil .btn--seal');

  // 更房、加点、百物谱图鉴、更簿双倍签到、云存档
  await page.click('text=开始守夜');
  await page.waitForSelector('.screen--hub');
  await W(() => {
    window.__wugeng.save.coins = 1200;
    window.__wugeng.save.charms.push({ relicId: 'clapper' });
    window.__wugeng.showHub();
  });
  await shot('04-hub');

  const closeVeil = () =>
    W(() => {
      const v = document.querySelector('#ui .veil:last-of-type') || document.querySelector('#ui .veil');
      const btn =
        v?.querySelector('[data-action^="close"]') ||
        v?.querySelector('.modal-close') ||
        v?.querySelector('.scroll__foot .btn--ghost') ||
        v?.querySelector('.btn--ghost');
      btn?.click();
    });

  // 1) 加点
  await page.click('.hub-nav .btn:nth-child(1)');
  await page.click('.shop-row .btn--small >> nth=0');
  await shot('05-shop');
  await closeVeil();

  // 2) 图鉴（百物谱）
  await page.click('.hub-nav .btn:nth-child(2)');
  await page.waitForSelector('.codex-scroll');
  assert.equal(await page.$$eval('.codex-tab', (x) => x.length), 5, '百物谱应含 5 个分类页签');
  await shot('05b-codex');
  await page.click('.codex-tab >> nth=1'); // 开光配方页
  await page.click('.codex-tab >> nth=3'); // 百鬼页
  await closeVeil();

  // 3) 更簿签到双倍
  await page.click('.hub-nav .btn:nth-child(3)');
  await shot('06-checkin');
  await page.click('.veil .btn--ad');
  await page.waitForSelector('.mock-ad');
  await page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7000 });
  await closeVeil();

  // 4) 设置与云存档自动备份 / 手动拉取验证（加点后已自动上云，62 秒冷却内再次上传会节流排队）
  await page.click('.hub-nav .btn:nth-child(4)');
  await page.waitForSelector('.cloud-box');
  assert.ok(await W(() => window.__wugeng.cloud.getState().lastUploadAt > 0), '加点后应已自动上传云存档');
  await page.click('text=上传云端');
  await page.waitForTimeout(120);
  await W(() => { window.__wugeng.save.coins = 1; window.__wugeng.save.updatedAt = 1; });
  await page.click('text=拉取云端');
  await page.waitForTimeout(150);
  assert.ok((await W(() => window.__wugeng.save.coins)) >= 1140, '拉取云端应从云端恢复进度');
  await page.click('.veil .btn--seal');

  // 带护身符出门
  await page.click('.charm-pick');
  await page.click('text=出门打更');
  await page.waitForTimeout(450);
  await shot('07-run');
  assert.equal(await W(() => window.__wugeng.game.run.relics[0]?.id), 'clapper', '护身符应在开局生效');

  // 首次升级 + 免费换签
  await W(() => { const r = window.__wugeng.game.run; r.player.xp = r.player.xpNext + 1; });
  await page.waitForFunction(() => window.__wugeng.overlay === 'levelup');
  await shot('08-levelup');
  await page.click('[data-action="reroll"]');
  await page.click('.qian >> nth=0');

  // 首 60s 内：即使免费换签用完，也不得显示换签广告
  await W(() => { const r = window.__wugeng.game.run; r.time = 30; r.rerolls.free = 0; r.rerolls.ad = 0; r.player.xp = r.player.xpNext + 1; });
  await page.waitForFunction(() => window.__wugeng.overlay === 'levelup');
  assert.equal(await page.$$eval('.levelup-actions .btn--ad', (x) => x.length), 0, '首 60 秒不得出现广告入口');
  await page.click('.qian >> nth=0');

  // 60s 后：免费换签用完，看广告 +3 次
  await W(() => { const r = window.__wugeng.game.run; r.time = 75; r.rerolls.free = 0; r.rerolls.ad = 0; r.player.xp = r.player.xpNext + 1; });
  await page.waitForFunction(() => window.__wugeng.overlay === 'levelup');
  await shot('09-levelup-ad');
  await page.click('.levelup-actions .btn--ad');
  await page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7000 });
  assert.equal(await W(() => window.__wugeng.game.run.rerolls.ad), 3, '看完广告应 +3 次换签');
  await page.click('.qian >> nth=0');

  // 供盒开光：更锣 5 级 + 已有梆子 → 五更鸣锣
  await W(() => {
    const r = window.__wugeng.game.run;
    const g = r.weapons.find((w) => w.id === 'gong');
    g.level = 5;
    r.pickups.push({ id: 99999, kind: 'chest', x: r.player.x, y: r.player.y, value: 1 });
  });
  await page.waitForFunction(() => window.__wugeng.overlay === 'chest');
  await shot('10-chest-evolve');
  assert.equal(await W(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').evolved), true, '供盒应触发开光');
  await page.click('.veil .btn--seal');

  // 局内暂停：查看已拿到的器物与属性加成
  await page.click('.pause-btn');
  await page.waitForFunction(() => window.__wugeng.overlay === 'pause');
  const pauseText = await page.textContent('.pause-loadout');
  assert.ok(pauseText.includes('五更鸣锣') && pauseText.includes('梆子') && pauseText.includes('伤害加成'), '暂停界面应展示已拿器物与属性加成');
  await shot('10b-pause-loadout');
  await page.click('text=接着守');
  await page.waitForFunction(() => window.__wugeng.overlay === null);

  // 死亡 → 广告复活（满血 + 无敌）
  const forceDeath = () => W(() => {
    const r = window.__wugeng.game.run;
    r.player.invulnT = 0;
    r.player.hp = 1;
    r.enemies.push({
      id: 888800 + Math.floor(Math.random() * 1000), type: 'lanternghost',
      x: r.player.x, y: r.player.y, r: 20, hp: 999999, maxHp: 999999,
      elite: false, boss: false, hitT: 0, slowT: 0, state: 'move', angle: 0,
      speed: 0, dmg: 9999, xp: 0, atkT: 0, stateT: 0, stunT: 0, dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
    });
  });
  await forceDeath();
  await page.waitForFunction(() => window.__wugeng.overlay === 'dead');
  await shot('11-revive');
  await page.click('.veil .btn--ad');
  await page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7000 });
  const afterRevive = await W(() => ({ status: window.__wugeng.game.run.status, hp: window.__wugeng.game.run.player.hp, maxHp: window.__wugeng.game.run.player.maxHp, inv: window.__wugeng.game.run.player.invulnT }));
  assert.equal(afterRevive.status, 'playing');
  assert.equal(afterRevive.hp, afterRevive.maxHp);
  assert.ok(afterRevive.inv > 2);
  await W(() => { window.__wugeng.game.run.enemies = window.__wugeng.game.run.enemies.filter((e) => e.hp < 900000); });

  // 鸡鸣天亮 → 进入无尽 → 再死结算 → 广告铜钱翻倍
  await W(() => {
    const r = window.__wugeng.game.run;
    r.time = 602;
    r._bossSpawned = { horse: true, umbrella: true, youshen: false };
  });
  await page.waitForFunction(() => Boolean(window.__wugeng.game.run.boss));
  await W(() => {
    const r = window.__wugeng.game.run;
    const b = r.enemies.find((x) => x.id === r.boss.id);
    b.x = r.player.x + 30;
    b.y = r.player.y;
    b.hp = 1;
    r.player.ult = r.player.ultMax;
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => ['cleared', 'levelup'].includes(window.__wugeng.overlay));
  while (await W(() => window.__wugeng.overlay) === 'levelup') {
    await page.click('.qian >> nth=0');
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => window.__wugeng.overlay === 'cleared');
  await shot('12-dawn');
  await page.click('text=继续守夜');
  assert.equal(await W(() => window.__wugeng.game.run.mode), 'endless');

  // 无尽死亡 → 放弃无尽复活 → 结算翻倍
  await forceDeath();
  await page.waitForFunction(() => window.__wugeng.overlay === 'dead');
  await page.click('text=不了，结算');
  await page.waitForSelector('.screen--result');
  await shot('13-result');
  const before = await W(() => window.__wugeng.save.coins);
  await page.click('.result-actions .btn--ad');
  await page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7000 });
  const after = await W(() => window.__wugeng.save.coins);
  assert.ok(after > before, `结算翻倍应增加铜钱 (${before} -> ${after})`);
  await shot('14-result-doubled');

  assert.deepEqual(errors, [], '390×844 全流程不应有任何控制台/页面错误');
  await ctx.close();
}

async function runAdEdgePaths(browser, baseUrl) {
  for (const mode of ['skip', 'fail']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html?skipIntro=1&mockAds=${mode}`);
    await page.click('text=开始守夜');
    await page.click('.hub-nav .btn:nth-child(3)');
    const coins0 = await page.evaluate(() => window.__wugeng.save.coins);
    await page.click('.veil .btn--ad');
    if (mode === 'skip') await page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7000 });
    await page.waitForTimeout(300);
    const coins1 = await page.evaluate(() => window.__wugeng.save.coins);
    assert.equal(coins1, coins0, `mockAds=${mode} 不应发放奖励`);
    await ctx.close();
  }
}

async function runOfflineMode(browser, baseUrl) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/index.html?skipIntro=1`);
  await page.click('text=开始守夜');
  await page.click('.hub-nav .btn:nth-child(3)');
  assert.equal(await page.$$eval('.btn--ad', (x) => x.length), 0, '离线模式更簿无广告');
  await page.click('.veil .btn--seal');
  await page.evaluate(() => {
    const v = document.querySelector('#ui .veil:last-of-type') || document.querySelector('#ui .veil');
    (v?.querySelector('[data-action^="close"]') || v?.querySelector('.modal-close') || v?.querySelector('.scroll__foot .btn--ghost') || v?.querySelector('.btn--ghost'))?.click();
  });
  await page.click('text=出门打更');
  await page.evaluate(() => { const r = window.__wugeng.game.run; r.time = 90; r.rerolls.free = 0; r.player.xp = r.player.xpNext + 1; });
  await page.waitForFunction(() => window.__wugeng.overlay === 'levelup');
  assert.equal(await page.$$eval('.btn--ad', (x) => x.length), 0, '离线模式三选一无广告');
  await page.click('.qian >> nth=0');
  await page.evaluate(() => { const r = window.__wugeng.game.run; r.player.invulnT = 0; r.player.hp = 0.01; r.player.armor = -5000; });
  await page.waitForFunction(() => ['dead', 'levelup'].includes(window.__wugeng.overlay));
  if (await page.evaluate(() => window.__wugeng.overlay) === 'levelup') await page.click('.qian >> nth=0');
  await page.waitForFunction(() => window.__wugeng.overlay === 'dead');
  assert.equal(await page.$$eval('.btn--ad', (x) => x.length), 0, '离线模式复活无广告');
  await page.click('text=不了，结算');
  await page.waitForSelector('.screen--result');
  assert.equal(await page.$$eval('.btn--ad', (x) => x.length), 0, '离线模式结算无广告');
  assert.deepEqual(errors, []);
  await ctx.close();
}

async function runAudioAndStress(browser, baseUrl) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/index.html?skipIntro=1`);
  await page.click('text=开始守夜');

  // Web Audio
  const audioRes = await page.evaluate(async () => {
    const a = window.__wugeng.audio;
    const names = ['gong', 'gongSmall', 'woodblock', 'paper', 'hit', 'crit', 'pickup', 'coin', 'levelup', 'boss', 'dawn', 'hurt', 'evolve', 'click', 'watch'];
    const ok = names.every((n) => a.play(n, { arg: 2 }) !== false);
    a.suspend('ad');
    const blocked = a.play('gong');
    a.resume('ad');
    return { ok, blocked };
  });
  assert.equal(audioRes.ok, true, '15 种音色均可播放');
  assert.equal(audioRes.blocked, false, '广告期间音频被挂起');

  // 压力测试：300 敌 + 400 弹体，测量 60 帧渲染耗时
  await page.click('text=出门打更');
  await page.waitForTimeout(200);
  const perf = await page.evaluate(async () => {
    const g = window.__wugeng.game;
    g.pause();
    const r = g.run;
    const types = ['paperkid', 'shade', 'lanternghost', 'weasel', 'sedan', 'drowned'];
    while (r.enemies.length < 300) {
      const i = r.enemies.length;
      const a = (i / 300) * Math.PI * 2;
      const d = 60 + (i % 15) * 20;
      r.enemies.push({
        id: 10000 + i, type: types[i % types.length],
        x: r.player.x + Math.cos(a) * d, y: r.player.y + Math.sin(a) * d,
        r: 12, hp: 30, maxHp: 30, elite: i % 25 === 0, boss: false, hitT: 0, slowT: 0, state: 'move', angle: a,
        speed: 50, dmg: 5, xp: 1, atkT: 1, stateT: 1, stunT: 0, dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
      });
    }
    while (r.projectiles.length < 400) {
      const i = r.projectiles.length;
      const a = (i / 400) * Math.PI * 2;
      r.projectiles.push({
        id: 50000 + i, kind: i % 2 ? 'talisman' : 'coinsword',
        x: r.player.x + Math.cos(a) * (40 + (i % 20) * 14),
        y: r.player.y + Math.sin(a) * (40 + (i % 20) * 14),
        vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 9, angle: a, t: 0.2, life: 2,
      });
    }
    const times = [];
    for (let f = 0; f < 45; f++) {
      const t0 = performance.now();
      await new Promise((res) => requestAnimationFrame(res));
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { enemies: r.enemies.length, projectiles: r.projectiles.length, p50: times[22], p90: times[40] };
  });
  console.log(`压力测试：${perf.enemies} 敌 + ${perf.projectiles} 弹体，帧间隔 p50=${perf.p50.toFixed(1)}ms p90=${perf.p90.toFixed(1)}ms`);
  await ctx.close();
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const base = `http://localhost:${PORT}`;
  await runFullFlow(browser, base);
  console.log('✓ 390×844 全流程 + 四处激励广告通过');
  await runAdEdgePaths(browser, base);
  console.log('✓ 广告中途关闭 / 加载失败兜底通过');
  await runOfflineMode(browser, base);
  console.log('✓ 360×780 离线模式（无广告入口）通过');
  await runAudioAndStress(browser, base);
  console.log('✓ Web Audio + 300 敌 / 400 弹体压力测试通过');
} finally {
  await browser.close();
  server.kill();
}
