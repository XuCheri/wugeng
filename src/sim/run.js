// 一局的总控（ARCHITECTURE §3）：创建、逐帧推进、三选一、刷新、供盒、复活、无尽、结算。
// 纯逻辑：不访问 DOM / 时间 / Math.random；同种子 + 同输入序列 → 完全相同的结果。

import {
  DT, MAIN_DURATION, WATCH_DURATION, DARKNESS, REROLL, REVIVE, HEROES, ENDLESS, COIN_REWARD,
  nightModifiers, emptyMetaBonuses,
} from './balance.js';
import { Rng, hashSeed } from '../core/rng.js';
import { SpatialHash } from '../core/spatial-hash.js';
import { lerp } from '../core/math.js';
import { createPlayer, recomputeMods, updatePlayer } from './player.js';
import { addOrUpgradeWeapon, updateWeapons } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { updateEnemies, flushSpawnQueue, compactEnemies, rebuildHash } from './enemies.js';
import { updateSpawner } from './spawner.js';
import { updateProjectiles, processScheduled } from './projectiles.js';
import { updatePickups } from './pickups.js';
import { updateProps } from './props.js';
import { updateUltimate, castUlt } from './ultimate.js';
import { generateChoices, applyChoice } from './levelup.js';
import { resolveChest } from './evolutions.js';

export { DT };

/**
 * 创建一局。
 * @param {{seed:any, heroId?:string, nightLevel?:number, meta?:object, charm?:{relicId:string}|null}} opts
 */
export function createRun({ seed = 1, heroId = 'zhou', nightLevel = 0, meta = {}, charm = null } = {}) {
  if (!HEROES[heroId]) heroId = 'zhou';
  const seedNum = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  const metaB = { ...emptyMetaBonuses(), ...(meta || {}) };
  const run = {
    seed,
    heroId,
    nightLevel,
    time: 0,
    watch: 1,
    mode: 'main',
    status: 'playing',
    darkness: DARKNESS.watch1,
    player: createPlayer(heroId),
    enemies: [],
    projectiles: [],
    pickups: [],
    props: [],
    weapons: [],
    relics: [],
    choices: null,
    rerolls: { free: REROLL.free + (metaB.freeRerolls | 0), ad: 0, adGrants: 0, adGrantMax: REROLL.adGrantMax },
    revives: { mainUsed: 0, endlessUsed: 0 },
    boss: null,
    stats: { kills: 0, coins: 0, bunsEaten: 0, firstBunTime: null, damageDealt: 0, maxHit: 0, killsByType: {}, ultsCast: 0 },
    events: [],
    // ↓ 内部状态（UI / 渲染层不要依赖）
    meta: metaB,
    night: nightModifiers(nightLevel),
    mods: null,
    rng: new Rng(seedNum),
    _seedNum: seedNum,
    _nextId: 1,
    _spawnAcc: 0,
    _spawnQueue: [],
    _scheduled: [],
    _pendingLevels: 0,
    _pendingChests: 0,
    _bossSpawned: {},
    _endlessStart: null,
    _endlessBossT: 0,
    _endlessBossIdx: 0,
    _brokenProps: {},
    _propChunk: null,
    _propsDirty: false,
    _xpCount: 0,
    _auraSlow: 1,
    _outbox: [],
    _cleared: false,
    _nextWaveT: null,
    _tele: { spawnHp: 0, dmg: 0, dmgNonBoss: 0, taken: 0 },
  };
  // 不可枚举的运行时结构（空间哈希、临时数组），避免被 JSON 序列化
  Object.defineProperty(run, '_sys', {
    value: {
      hash: new SpatialHash(64, 12),
      scratchArea: [],
      scratchSep: [],
      scratchW: [],
      scratchW2: [],
      scratchP: [],
    },
    enumerable: false,
  });
  recomputeMods(run);
  addOrUpgradeWeapon(run, HEROES[heroId].startWeapon);
  if (charm && charm.relicId) addOrUpgradeRelic(run, charm.relicId);
  recomputeMods(run);
  run.player.hp = run.player.maxHp;
  updateProps(run);
  return run;
}

/** 夜色遮罩：纯函数，按时间在相邻两更之间平滑过渡 */
export function darknessAt(run) {
  if (run.mode === 'endless') return DARKNESS.endless;
  if (run.watch >= 6) return DARKNESS.dawn;
  const lvl = (w) => lerp(DARKNESS.watch1, DARKNESS.watch5, (Math.min(5, w) - 1) / 4);
  const w = run.watch;
  const into = run.time - (w - 1) * WATCH_DURATION;
  if (w === 1 || into >= DARKNESS.smooth) return lvl(w);
  return lerp(lvl(w - 1), lvl(w), into / DARKNESS.smooth);
}

function updateWatch(run) {
  if (run.mode !== 'main' || run.watch >= 6) {
    run.darkness = darknessAt(run);
    return;
  }
  const w = Math.min(5, Math.floor(run.time / WATCH_DURATION) + 1);
  if (w !== run.watch) {
    run.watch = w;
    run.events.push({ type: 'watchChange', watch: w });
  }
  run.darkness = darknessAt(run);
}

/** 本帧结束后决定状态：死亡 > 通关 > 供盒 > 升级 */
function settleStatus(run) {
  if (run.status === 'cleared') return;
  if (run.player.hp <= 0) {
    run.status = 'dead';
    return;
  }
  if (run._pendingChests > 0) run.status = 'chest';
  else if (run._pendingLevels > 0) {
    run.status = 'levelup';
    generateChoices(run);
  } else run.status = 'playing';
}

/** 逐帧推进；status !== 'playing' 时什么都不做（UI 暂停） */
export function stepRun(run, input = {}, dt = DT) {
  if (run.status !== 'playing') return run;
  run.events.length = 0;
  if (run._outbox.length) {
    for (const e of run._outbox) run.events.push(e);
    run._outbox.length = 0;
  }
  run.time += dt;
  updateWatch(run);
  updatePlayer(run, input, dt);
  updateProps(run);
  updateSpawner(run, dt);
  flushSpawnQueue(run);
  updateEnemies(run, dt);
  updateWeapons(run, dt);
  processScheduled(run, dt);
  updateProjectiles(run, dt);
  updateUltimate(run, input);
  flushSpawnQueue(run);
  compactEnemies(run);
  updatePickups(run, dt);
  if (run.status === 'cleared') run._cleared = true;
  settleStatus(run);
  return run;
}

/** 在帧外调用的操作产生的事件放进 outbox，下一帧开头交给渲染层 */
function outside(run, fn) {
  const start = run.events.length;
  const res = fn();
  if (run.events.length > start) run._outbox.push(...run.events.splice(start));
  return res;
}

export function chooseUpgrade(run, index) {
  if (run.status !== 'levelup' || !run.choices || !run.choices[index]) return false;
  return outside(run, () => {
    if (!applyChoice(run, run.choices[index])) return false;
    run._pendingLevels = Math.max(0, run._pendingLevels - 1);
    run.choices = null;
    settleStatus(run);
    return true;
  });
}

export function rerollChoices(run) {
  if (run.status !== 'levelup') return false;
  const r = run.rerolls;
  if (r.free > 0) r.free--;
  else if (r.ad > 0) r.ad--;
  else return false;
  generateChoices(run);
  return true;
}

export function grantAdRerolls(run) {
  const r = run.rerolls;
  if (r.adGrants >= r.adGrantMax) return false;
  r.adGrants++;
  r.ad += REROLL.adGrant;
  return true;
}

export function openChest(run) {
  if (run.status !== 'chest') return { evolved: null, upgrades: [] };
  return outside(run, () => {
    run._pendingChests--;
    const res = resolveChest(run);
    settleStatus(run);
    return res;
  });
}

export function canRevive(run) {
  if (run.status !== 'dead') return false;
  return run.mode === 'main' ? run.revives.mainUsed < REVIVE.mainMax : run.revives.endlessUsed < REVIVE.endlessMax;
}

/** 广告复活：满血 + 自动敲锣清屏 + 无敌 3 秒 */
export function revive(run) {
  if (!canRevive(run)) return false;
  return outside(run, () => {
    if (run.mode === 'main') run.revives.mainUsed++;
    else run.revives.endlessUsed++;
    const p = run.player;
    p.hp = p.maxHp;
    p.invulnT = REVIVE.invuln;
    rebuildHash(run);
    castUlt(run, true);
    // 清屏：剩下的普通敌人化成纸屑（不掉落），弹幕清空
    for (const e of run.enemies) {
      if (!e.boss && !e.dead) {
        e.dead = true;
        run.events.push({ type: 'kill', x: e.x, y: e.y, enemyType: e.type, elite: e.elite, boss: false });
      }
    }
    compactEnemies(run);
    run.projectiles = run.projectiles.filter((pr) => pr.kind !== 'enemyBullet');
    run.events.push({ type: 'revive' });
    run.status = 'playing';
    settleStatus(run);
    return true;
  });
}

/** 通关后进入无尽 */
export function enterEndless(run) {
  if (run.status !== 'cleared') return false;
  run.mode = 'endless';
  run._endlessStart = run.time;
  run._endlessBossT = ENDLESS.bossEvery;
  run.darkness = DARKNESS.endless;
  run.status = 'playing';
  settleStatus(run);
  return true;
}

/** 结算（铜钱已乘财运、夜色加成，不含广告翻倍） */
export function endRun(run) {
  const cleared = run._cleared || run.status === 'cleared' || run.mode === 'endless';
  const mainTime = Math.min(run.time, run._endlessStart ?? run.time);
  const endlessTime = run.mode === 'endless' ? run.time - run._endlessStart : 0;
  const raw =
    run.stats.coins +
    COIN_REWARD.perMinute * (Math.min(mainTime, MAIN_DURATION) / 60) +
    (cleared ? COIN_REWARD.clearBonus : 0) +
    COIN_REWARD.endlessPerMinute * (endlessTime / 60);
  const coins = Math.floor(raw * (1 + (run.meta.coinPct || 0) + COIN_REWARD.nightPct * run.nightLevel));
  run._ended = true;
  return {
    heroId: run.heroId,
    nightLevel: run.nightLevel,
    cleared,
    mode: run.mode,
    timeSec: Math.floor(run.time),
    reachedWatch: cleared ? 6 : Math.min(5, run.watch),
    level: run.player.level,
    kills: run.stats.kills,
    coins,
    bunsEaten: run.stats.bunsEaten,
    firstBunTime: run.stats.firstBunTime,
    maxHit: run.stats.maxHit,
    killsByType: { ...run.stats.killsByType },
    weapons: run.weapons.map((w) => ({ id: w.id, level: w.level, evolved: w.evolved })),
    relics: run.relics.map((r) => ({ id: r.id, level: r.level })),
  };
}

