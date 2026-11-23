// 一局流程测试：确定性、刷新 / 广告 / 复活上限、多路径开光条件、三选一合法性、无尽成长、小头目与 Boss 时间轴、性能。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun, stepRun, chooseUpgrade, rerollChoices, grantAdRerolls, openChest, revive, enterEndless, endRun, canRevive,
  dismissShrine,
} from '../../src/sim/run.js';
import { generateChoices, allMaxed, describeUpgrade, applyChoice, findNewlyEvolvableWeapon } from '../../src/sim/levelup.js';
import { addOrUpgradeWeapon, getWeapon, canEvolve, evolvableWeapons } from '../../src/sim/weapons.js';
import { addOrUpgradeRelic } from '../../src/sim/relics.js';
import { recomputeMods } from '../../src/sim/player.js';
import { spawnEnemy, rebuildHash } from '../../src/sim/enemies.js';
import { spawnBoss } from '../../src/sim/bosses.js';
import { killEnemy } from '../../src/sim/combat.js';
import {
  WEAPON_IDS, RELIC_IDS, MAX_WEAPONS, MAX_RELICS, ENDLESS, REROLL, DAMAGE, DARKNESS, SPAWN,
} from '../../src/sim/balance.js';
import { Rng } from '../../src/core/rng.js';

/** 只对关键状态做散列（含命签、羁绊、弃签/留签、奇遇地标与铜钱收支） */
function stateHash(run) {
  const pick = {
    t: run.time.toFixed(6),
    st: run.status,
    cm: run.choiceMode,
    p: [run.player.x, run.player.y, run.player.hp, run.player.level, run.player.xp, run.player.ult].map((v) => v.toFixed(6)),
    e: run.enemies.map((e) => [e.id, e.type, e.x.toFixed(4), e.y.toFixed(4), e.hp, e.affix]),
    pr: run.projectiles.map((p) => [p.id, p.kind, p.x.toFixed(4), p.y.toFixed(4)]),
    pk: run.pickups.map((p) => [p.id, p.kind, p.value]),
    w: run.weapons.map((w) => [w.id, w.level, w.evolved, w.evolvedRecipe]),
    r: run.relics.map((r) => [r.id, r.level]),
    bl: run.blessings,
    sy: run.synergies?.active,
    bn: [run.banishesLeft, run.banished],
    lk: run.lockedChoice,
    sh: run.shrines.map((s) => [s.id, s.kind, s.used, s.active, s.timer.toFixed(3)]),
    cs: [run.coinsEarned, run.coinsSpent],
    s: run.stats,
    rng: run.rng.getState(),
  };
  const str = JSON.stringify(pick);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/** 用脚本输入跑 seconds 秒（升级选签、供盒直接开、奇遇关闭或触发） */
function scripted(seed, seconds, heroId = 'zhou') {
  const run = createRun({ seed, heroId, meta: { maxHpPct: 4 } });
  let i = 0;
  while (run.time < seconds && run.status !== 'dead' && run.status !== 'cleared') {
    if (run.status === 'levelup') {
      chooseUpgrade(run, i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2);
      continue;
    }
    if (run.status === 'chest') {
      openChest(run);
      continue;
    }
    if (run.status === 'shrine') {
      dismissShrine(run);
      continue;
    }
    const a = run.time * 0.7 + Math.sin(run.time * 0.13) * 2;
    stepRun(run, { moveX: Math.cos(a), moveY: Math.sin(a), ultimate: i % 97 === 0 });
    i++;
  }
  return run;
}

/** 把待处理的三选一 / 供盒 / 地标清掉，回到 playing */
function drain(run) {
  while (run.status === 'levelup' || run.status === 'chest' || run.status === 'shrine') {
    if (run.status === 'levelup') chooseUpgrade(run, 0);
    else if (run.status === 'chest') openChest(run);
    else dismissShrine(run);
  }
}

function forceLevelup(run) {
  run._pendingLevels = 1;
  run.status = 'levelup';
  generateChoices(run);
}

test('确定性：同种子 + 同输入跑 3 分钟，状态散列一致；不同种子不同', () => {
  const a = scripted(20261120, 180);
  const b = scripted(20261120, 180);
  const c = scripted(777, 180);
  assert.equal(stateHash(a), stateHash(b));
  assert.notEqual(stateHash(a), stateHash(c));
  assert.ok(a.stats.kills > 50, `kills=${a.stats.kills}`);
});

test('RNG 状态可序列化 / 还原', () => {
  const r = new Rng('wugeng');
  r.next();
  const s = r.getState();
  const x = [r.next(), r.next()];
  const r2 = new Rng(1);
  r2.setState(s);
  assert.deepEqual([r2.next(), r2.next()], x);
});

test('stepRun：status 非 playing 时不推进；每帧开头清空 events', () => {
  const run = createRun({ seed: 1 });
  stepRun(run, {});
  run.events.push({ type: 'fake' });
  stepRun(run, {});
  assert.ok(!run.events.some((e) => e.type === 'fake'));
  forceLevelup(run);
  const t = run.time;
  stepRun(run, { moveX: 1 });
  assert.equal(run.time, t);
});

test('刷新：免费 2 + 机缘，再看广告 +3（每局最多 2 次）', () => {
  const run = createRun({ seed: 5, meta: { freeRerolls: 1 } });
  assert.equal(run.rerolls.free, REROLL.free + 1);
  assert.equal(rerollChoices(run), false, '不在三选一时不能刷新');
  forceLevelup(run);
  for (let i = 0; i < 3; i++) assert.equal(rerollChoices(run), true);
  assert.equal(rerollChoices(run), false);
  assert.equal(grantAdRerolls(run), true);
  assert.equal(grantAdRerolls(run), true);
  assert.equal(grantAdRerolls(run), false, '每局最多 2 次广告');
  assert.equal(run.rerolls.ad, 6);
  for (let i = 0; i < 6; i++) assert.equal(rerollChoices(run), true);
  assert.equal(rerollChoices(run), false);
  assert.equal(run.rerolls.adGrants, 2);
});

test('复活：主线 1 次，无尽再 1 次；满血 + 无敌 3 秒 + 清屏（保留小头目供盒）', () => {
  const run = createRun({ seed: 9 });
  assert.equal(revive(run), false, '没死不能复活');
  for (let i = 0; i < 20; i++) spawnEnemy(run, 'paperkid', 30 + i, 0);
  const warder = spawnEnemy(run, 'sedan', 90, 0, { elite: true, warder: true, chest: true });
  assert.ok(warder.chest);
  run.player.hp = 0;
  stepRun(run, {});
  assert.equal(run.status, 'dead');
  assert.equal(revive(run), true);
  assert.equal(run.status, 'playing');
  assert.equal(run.player.hp, run.player.maxHp);
  assert.ok(run.player.invulnT >= 2.9);
  assert.equal(run.enemies.filter((e) => !e.boss).length, 0);
  assert.ok(run.pickups.some((p) => p.kind === 'chest'), '复活清屏不应吞掉小头目的必掉供盒');
  stepRun(run, {});
  assert.ok(run.events.some((e) => e.type === 'revive'), 'revive 事件在下一帧交给渲染层');
  drain(run);
  run.player.invulnT = 0;
  run.player.hp = 0;
  stepRun(run, {});
  assert.equal(run.status, 'dead');
  assert.equal(canRevive(run), false);
  assert.equal(revive(run), false, '主线只能复活 1 次');
  // 进入无尽后还能再复活 1 次
  run.status = 'cleared';
  run.player.hp = run.player.maxHp;
  assert.equal(enterEndless(run), true);
  assert.equal(run.mode, 'endless');
  drain(run);
  run.player.hp = 0;
  stepRun(run, {});
  assert.equal(run.status, 'dead');
  assert.equal(revive(run), true);
  drain(run);
  run.player.invulnT = 0;
  run.player.hp = 0;
  stepRun(run, {});
  assert.equal(run.status, 'dead');
  assert.equal(revive(run), false);
  const sum = endRun(run);
  assert.equal(sum.cleared, true);
  assert.equal(sum.mode, 'endless');
});

test('开光：武器满级 + 多路径条件（本命法器 / 流派共鸣 / 满级法器 / 香案），通过供盒触发', () => {
  const run = createRun({ seed: 11, heroId: 'zhou' });
  const gong = getWeapon(run, 'gong');
  for (let i = 0; i < 3; i++) addOrUpgradeWeapon(run, 'gong');
  assert.equal(gong.level, 4);
  addOrUpgradeRelic(run, 'clapper');
  assert.equal(canEvolve(run, gong), false, '4 级不能开光');
  addOrUpgradeWeapon(run, 'gong');
  assert.equal(canEvolve(run, gong), true);
  // 既无配对法器、也无 3 件同门共鸣、也无 5 级法器时，供盒只给升级
  const run2 = createRun({ seed: 12, heroId: 'zhou' });
  for (let i = 0; i < 4; i++) addOrUpgradeWeapon(run2, 'gong');
  addOrUpgradeRelic(run2, 'censer');
  run2._pendingChests = 1;
  run2.status = 'chest';
  const r2 = openChest(run2);
  assert.equal(r2.evolved, null);
  assert.equal(getWeapon(run2, 'gong').evolved, false);
  // 有对应法器：开光
  run._pendingChests = 1;
  run.status = 'chest';
  const r = openChest(run);
  assert.equal(r.evolved, 'gong');
  assert.equal(r.recipe, 'paired');
  assert.equal(gong.evolved, true);
  assert.equal(run.status, 'playing');
  stepRun(run, {});
  assert.ok(run.events.some((e) => e.type === 'evolve' && e.weaponId === 'gong' && e.recipe === 'paired'));
});

test('三选一从不给出非法选项（12 武器 + 12 法器多路径随机构筑 fuzz）', () => {
  const rng = new Rng(99);
  for (let iter = 0; iter < 400; iter++) {
    const run = createRun({ seed: iter, heroId: rng.pick(['zhou', 'mian', 'daotong']) });
    const nW = rng.int(1, MAX_WEAPONS);
    const nR = rng.int(0, MAX_RELICS);
    while (run.weapons.length < nW) addOrUpgradeWeapon(run, rng.pick(WEAPON_IDS));
    while (run.relics.length < nR) addOrUpgradeRelic(run, rng.pick(RELIC_IDS));
    const maxAll = rng.chance(0.15);
    for (const w of run.weapons) {
      const n = maxAll ? 5 : rng.int(0, 5);
      for (let i = 0; i < n; i++) addOrUpgradeWeapon(run, w.id);
    }
    for (const r of run.relics) {
      const n = maxAll ? 5 : rng.int(0, 5);
      for (let i = 0; i < n; i++) addOrUpgradeRelic(run, r.id);
    }
    recomputeMods(run);
    const choices = generateChoices(run);
    assert.equal(choices.length, 3);
    const keys = choices.map((c) => c.kind + ':' + c.id);
    assert.equal(new Set(keys).size, 3, `重复签 ${keys}`);
    for (const c of choices) {
      if (c.kind === 'weapon') {
        const w = getWeapon(run, c.id);
        if (c.isNew) {
          assert.equal(w, null);
          assert.ok(run.weapons.length < MAX_WEAPONS, '武器槽已满还给新武器');
          assert.equal(c.level, 1);
        } else {
          assert.ok(w && w.level < 5 && c.level === w.level + 1);
        }
      } else if (c.kind === 'relic') {
        const r = run.relics.find((x) => x.id === c.id);
        if (c.isNew) {
          assert.ok(!r && run.relics.length < MAX_RELICS);
        } else {
          assert.ok(r && r.level < 5 && c.level === r.level + 1);
        }
      } else if (c.kind === 'overflow') {
        assert.ok(allMaxed(run), '没全满级不该出溢出签');
      } else {
        assert.ok(c.kind === 'coin' || c.kind === 'bun');
      }
      const d = describeUpgrade(c);
      assert.ok(d.name && typeof d.desc === 'string' && d.desc.length > 0);
      // evolvable 标记必须与真实多路径开光判定一致
      if (c.evolvable) {
        const targetId = findNewlyEvolvableWeapon(run, c.kind, c.id);
        assert.ok(targetId, `evolvable=true 但未找到新解锁武器: ${c.kind}:${c.id}`);
      }
    }
    if (allMaxed(run)) assert.equal(choices[0].kind, 'overflow');
    const prevReady = new Set(evolvableWeapons(run).map((w) => w.id));
    const pickChoice = choices[rng.int(0, 2)];
    assert.equal(applyChoice(run, pickChoice), true);
    if (pickChoice.evolvable) {
      const nowReady = evolvableWeapons(run).map((w) => w.id);
      assert.ok(nowReady.some((id) => !prevReady.has(id)), '应用 evolvable 选项后应有新武器满足开光条件');
    }
  }
});

test('chooseUpgrade 应用选项并在没有待升级时回到 playing', () => {
  const run = createRun({ seed: 2 });
  forceLevelup(run);
  const c = run.choices[0];
  assert.equal(chooseUpgrade(run, 0), true);
  assert.equal(run.status, 'playing');
  assert.equal(run.choices, null);
  if (c.kind === 'weapon') assert.ok(getWeapon(run, c.id));
  assert.equal(chooseUpgrade(run, 0), false);
});

test('无尽：敌人生命按分钟 ×1.22；溢出签伤害 ×1.12 乘算', () => {
  const run = createRun({ seed: 4 });
  run.time = 640;
  run.status = 'cleared';
  run._cleared = true;
  enterEndless(run);
  assert.equal(run.mode, 'endless');
  assert.equal(run.darkness, DARKNESS.endless);
  const e0 = spawnEnemy(run, 'lanternghost', 500, 0);
  run.time += 120;
  const e2 = spawnEnemy(run, 'lanternghost', 500, 0);
  const ratio = e2.maxHp / e0.maxHp;
  assert.ok(Math.abs(ratio - ENDLESS.hpGrowth ** 2) < 0.05, `ratio=${ratio}`);
  for (const id of ['gong', 'lantern', 'talisman']) while (addOrUpgradeWeapon(run, id));
  while (addOrUpgradeWeapon(run, 'bell'));
  for (const id of ['clapper', 'censer', 'cinnabar', 'redstring']) while (addOrUpgradeRelic(run, id));
  recomputeMods(run);
  assert.ok(allMaxed(run));
  forceLevelup(run);
  assert.equal(run.choices[0].kind, 'overflow');
  chooseUpgrade(run, 0);
  forceLevelup(run);
  chooseUpgrade(run, 0);
  assert.ok(Math.abs(run.mods.overflowMult - DAMAGE.overflowMult ** 2) < 1e-9);
  assert.equal(run.mods.overflowStacks, 2);
});

test('巡更小头目（150s/360s）与 Boss 时间轴（240s/480s/600s）；打败夜游神即天亮', () => {
  const run = createRun({ seed: 8 });
  const seen = {};
  const warders = {};
  const jumpTo = (t) => {
    run.time = t - 0.05;
    for (let i = 0; i < 6; i++) {
      run.player.invulnT = 99;
      stepRun(run, {});
      for (const ev of run.events) {
        if (ev.type === 'bossSpawn') seen[ev.bossType] = run.time;
        if (ev.type === 'warderSpawn') warders[ev.warderId] = run.time;
      }
      if (run.status === 'levelup' && run.time < t) {
        chooseUpgrade(run, 0);
        continue;
      }
      if (run.status !== 'playing') break;
    }
  };

  jumpTo(150);
  assert.ok(warders.warder_150 >= 150 && warders.warder_150 < 150.1, `warder_150 @ ${warders.warder_150}`);
  assert.equal(run.boss, null, '巡更小头目不占用 Boss 血条');

  jumpTo(240);
  assert.ok(seen.horse >= 240 && seen.horse < 240.1, `horse @ ${seen.horse}`);
  assert.equal(seen.umbrella, undefined);
  // 240s 换三更会弹守夜命签，选掉后回到 playing
  drain(run);

  // 打败纸马：掉供盒，拾取后进入 chest 状态
  const horse = run.enemies.find((e) => e.type === 'horse');
  rebuildHash(run);
  killEnemy(run, horse);
  const chest = run.pickups.find((p) => p.kind === 'chest');
  assert.ok(chest, '纸马掉供盒');
  run.player.x = chest.x;
  run.player.y = chest.y;
  stepRun(run, {});
  assert.equal(run.status, 'chest');
  openChest(run);
  drain(run);

  jumpTo(360);
  assert.ok(warders.warder_360 >= 360 && warders.warder_360 < 360.1, `warder_360 @ ${warders.warder_360}`);
  drain(run);

  jumpTo(480);
  assert.ok(seen.umbrella >= 480 && seen.umbrella < 480.1);
  drain(run);

  jumpTo(600);
  assert.ok(seen.youshen >= 600 && seen.youshen < 600.1);
  assert.equal(run.watch, 5);
  const ys = run.enemies.find((e) => e.type === 'youshen');
  assert.equal(run.boss.type, 'youshen');
  killEnemy(run, ys);
  assert.equal(run.status, 'cleared');
  assert.equal(run.watch, 6);
  assert.equal(run.darkness, 0);
  assert.ok(run.events.some((e) => e.type === 'dawn'));
  stepRun(run, {});
  assert.equal(run.status, 'cleared', 'cleared 时 stepRun 不推进');
  const sum = endRun(run);
  assert.equal(sum.cleared, true);
  assert.equal(sum.reachedWatch, 6);
});

test('夜色遮罩：一更 0.15 → 五更 0.75', () => {
  const run = createRun({ seed: 1 });
  assert.equal(run.darkness, DARKNESS.watch1);
  run.time = 8 * 60 + 30;
  stepRun(run, {});
  assert.equal(run.watch, 5);
  assert.ok(Math.abs(run.darkness - DARKNESS.watch5) < 1e-9);
});

test('Boss 能正常行动并发射弹幕', () => {
  const run = createRun({ seed: 3 });
  run.time = 500;
  spawnBoss(run, 'umbrella', { chest: true });
  for (let i = 0; i < 180; i++) {
    run.player.invulnT = 99;
    stepRun(run, {});
  }
  assert.ok(run.projectiles.some((p) => p.kind === 'enemyBullet' && p.style === 'paperMoney'));
});

test('性能：300 敌人 + 400 弹体 + 开光与流派羁绊，每步远低于 4ms', () => {
  const run = createRun({ seed: 13 });
  for (const id of ['talisman', 'lantern', 'firecracker', 'compass']) while (addOrUpgradeWeapon(run, id));
  for (const id of ['cinnabar', 'censer', 'soulwick', 'fivecoins']) while (addOrUpgradeRelic(run, id));
  recomputeMods(run);
  run.player.invulnT = 1e9;
  run.player.hp = run.player.maxHp = 1e9;
  const types = ['paperkid', 'lanternghost', 'sedan', 'drowned', 'weasel', 'suona', 'paperbride', 'cinder'];
  const refill = () => {
    let k = 0;
    while (run.enemies.length < 300) {
      const a = k++ * 2.399;
      const d = 60 + (k % 40) * 11;
      const e = spawnEnemy(run, types[k % types.length], run.player.x + Math.cos(a) * d, run.player.y + Math.sin(a) * d);
      e.hp = e.maxHp = 1e7;
    }
    while (run.projectiles.length < 400) {
      const a = run.projectiles.length * 0.7;
      run.projectiles.push({
        id: run._nextId++,
        kind: 'enemyBullet',
        x: run.player.x + Math.cos(a) * 300,
        y: run.player.y + Math.sin(a) * 300,
        r: 6,
        angle: a,
        t: 0,
        life: 50,
        vx: Math.cos(a) * 10,
        vy: Math.sin(a) * 10,
        style: 'ink',
        dmg: 0,
      });
    }
  };
  for (let i = 0; i < 30; i++) {
    refill();
    stepRun(run, { moveX: 0.3, moveY: 0.1 });
    drain(run);
  }
  const N = 240;
  let wallTotal = 0;
  let cpuTotalUs = 0;
  for (let i = 0; i < N; i++) {
    refill();
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    stepRun(run, { moveX: 0.3, moveY: 0.1 });
    wallTotal += performance.now() - t0;
    const dc = process.cpuUsage(c0);
    cpuTotalUs += dc.user + dc.system;
    drain(run);
  }
  const wallAvg = wallTotal / N;
  const cpuAvg = cpuTotalUs / 1000 / N;
  const avg = Math.min(wallAvg, cpuAvg);
  assert.ok(avg < 4, `wall=${wallAvg.toFixed(3)}ms/step, cpu=${cpuAvg.toFixed(3)}ms/step`);
  console.log(
    `  性能：${run.enemies.length} 敌 / ${run.projectiles.length} 弹体，平均 ${avg.toFixed(3)} ms/step (wall=${wallAvg.toFixed(3)}, cpu=${cpuAvg.toFixed(3)})`,
  );
});
