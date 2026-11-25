import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { fsin, fcos, fatan2, TRIG_LUT_SIZE, wrapAngle } from '../../src/core/math.js';
import { createRun, stepRun, chooseUpgrade, openChest, DT, computeRunHash } from '../../src/sim/run.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

test('M4.1 查表三角函数（4096 档线性插值）：全象限与边界与 Math.* 误差严格 < 1e-4', () => {
  assert.equal(TRIG_LUT_SIZE, 4096);
  assert.equal(fsin(0), 0);
  assert.ok(Math.abs(fcos(0) - 1) < 1e-9);
  assert.equal(fatan2(0, 0), 0);
  assert.equal(fsin(NaN), 0);
  assert.equal(fatan2(NaN, 1), 0);

  let maxSinErr = 0;
  let maxCosErr = 0;
  for (let i = -10000; i <= 10000; i++) {
    const a = i * 0.0137;
    maxSinErr = Math.max(maxSinErr, Math.abs(fsin(a) - Math.sin(a)));
    maxCosErr = Math.max(maxCosErr, Math.abs(fcos(a) - Math.cos(a)));
  }
  assert.ok(maxSinErr < 1e-4, `fsin 最大误差应 < 1e-4，实测 ${maxSinErr}`);
  assert.ok(maxCosErr < 1e-4, `fcos 最大误差应 < 1e-4，实测 ${maxCosErr}`);

  let maxAtanErr = 0;
  for (let yi = -45; yi <= 45; yi++) {
    for (let xi = -45; xi <= 45; xi++) {
      if (xi === 0 && yi === 0) continue;
      const y = yi * 0.37;
      const x = xi * 0.41;
      const diff = Math.abs(wrapAngle(fatan2(y, x) - Math.atan2(y, x)));
      maxAtanErr = Math.max(maxAtanErr, diff);
    }
  }
  assert.ok(maxAtanErr < 1e-4, `fatan2 最大误差应 < 1e-4，实测 ${maxAtanErr}`);
});

test('M4.1 静态审计：src/core 与 src/sim 零宿主 Math.sin / Math.cos / Math.atan2 调用', () => {
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const trigRe = /\bMath\.(?:sin|cos|atan2)\s*\(/g;
  for (const sub of ['src/core', 'src/sim']) {
    const dir = path.join(REPO_ROOT, sub);
    for (const ent of fs.readdirSync(dir)) {
      if (!ent.endsWith('.js')) continue;
      const clean = stripComments(fs.readFileSync(path.join(dir, ent), 'utf8'));
      const hits = [...clean.matchAll(trigRe)].map((m) => m[0]);
      assert.deepEqual(hits, [], `${sub}/${ent} 仍残留非确定性宿主三角调用: ${hits.join(', ')}`);
    }
  }
});

test('M4.1 双实例 3 分钟（10800 帧）联机模拟：即便宿主 Math.sin/cos/atan2 注入跨端浮点漂移，32 位状态哈希仍 100% 位级一致', () => {
  const coopCfg = {
    party: [
      { slot: 0, peerId: 'host', name: '甲', heroId: 'zhou', startWeapon: 'gong' },
      { slot: 1, peerId: 'guest', name: '乙', heroId: 'mian', startWeapon: 'paperman' },
    ],
  };

  function runThreeMinutes(injectLibmDrift = false) {
    const origSin = Math.sin;
    const origCos = Math.cos;
    const origAtan2 = Math.atan2;
    if (injectLibmDrift) {
      Math.sin = (x) => origSin(x) + 1e-7;
      Math.cos = (x) => origCos(x) - 1e-7;
      Math.atan2 = (y, x) => origAtan2(y, x) + 1e-7;
    }
    try {
      const r = createRun({ seed: 20261125, heroId: 'zhou', startWeapon: 'gong', coop: coopCfg });
      const hashes = [];
      for (let f = 0; f < 10_800; f++) {
        const turn = (f / 6) | 0;
        const a0 = (turn % 16) * (Math.PI / 8);
        const a1 = ((turn + 5) % 16) * (Math.PI / 8);
        const inp = {
          slots: {
            0: { moveX: fcos(a0), moveY: fsin(a0), ultimate: f % 600 === 599, interact: false },
            1: { moveX: fcos(a1), moveY: fsin(a1), ultimate: f % 720 === 719, interact: false },
          },
        };
        // 联机测试免死气血垫高以跑满完整 3 分钟密集怪潮与异事
        r.players[0].hp = Math.max(40, r.players[0].hp);
        r.players[1].hp = Math.max(40, r.players[1].hp);
        stepRun(r, inp, DT);
        while (r.status === 'levelup') {
          chooseUpgrade(r, turn % Math.max(1, r.choices.length));
        }
        while (r.status === 'chest') {
          openChest(r, null);
        }
        if (f % 120 === 119) {
          hashes.push(computeRunHash(r));
        }
      }
      return {
        finalHash: computeRunHash(r),
        hashes,
        rngState: r.rng.getState(),
        kills: r.stats.kills,
        p0: { x: r.players[0].x, y: r.players[0].y, lv: r.players[0].level },
        p1: { x: r.players[1].x, y: r.players[1].y, lv: r.players[1].level },
      };
    } finally {
      Math.sin = origSin;
      Math.cos = origCos;
      Math.atan2 = origAtan2;
    }
  }

  const runA = runThreeMinutes(false);
  const runB = runThreeMinutes(true);

  assert.equal(runA.hashes.length, 90);
  assert.deepEqual(runA.hashes, runB.hashes, '每 2 秒状态校验哈希序列必须完全一致');
  assert.equal(runA.finalHash, runB.finalHash);
  assert.equal(runA.rngState, runB.rngState);
  assert.deepEqual(runA.p0, runB.p0);
  assert.deepEqual(runA.p1, runB.p1);
  assert.ok(runA.kills > 50, `3 分钟联机战斗应产生充足击杀，实测 ${runA.kills}`);
});
