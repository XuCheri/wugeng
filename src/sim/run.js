// 一局的总控（ARCHITECTURE §3 + F1–F10）：创建、逐帧推进、三选一、弃签/留签、命签、供盒自选开光、奇遇地标、复活、无尽、结算。
// 纯逻辑：不访问浏览器全局对象或系统时间；同种子 + 同输入序列 → 完全相同的结果。

import {
  DT, MAIN_DURATION, WATCH_DURATION, DARKNESS, REROLL, REVIVE, HEROES, ENDLESS, COIN_REWARD, LEVELUP,
  sanitizeNightLevel, nightModifiers, emptyMetaBonuses,
} from './balance.js';
import { Rng, hashSeed } from '../core/rng.js';
import { SpatialHash } from '../core/spatial-hash.js';
import { lerp } from '../core/math.js';
import { createPlayer, recomputeMods, updatePlayer, healPlayer } from './player.js';
import { addOrUpgradeWeapon, updateWeapons, getEvolutionRecipe, canEvolve } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { updateEnemies, flushSpawnQueue, compactEnemies, rebuildHash } from './enemies.js';
import { updateSpawner } from './spawner.js';
import { updateProjectiles, processScheduled } from './projectiles.js';
import { updatePickups, dropPickup } from './pickups.js';
import { updateProps } from './props.js';
import { updateUltimate, castUlt } from './ultimate.js';
import {
  generateChoices, applyChoice, banishChoiceImpl, toggleLockChoiceImpl, describeUpgrade, describeEvolution,
} from './levelup.js';
import { resolveChest, buildChestChoices } from './evolutions.js';
import { updateSynergyRuntime } from './synergies.js';
import { generateBlessingChoices, BLESSING_TUNING } from './blessings.js';
import { updateShrines, interactShrineImpl, resolveShrineImpl, dismissShrineImpl } from './shrines.js';

export { DT, getEvolutionRecipe, canEvolve, describeUpgrade, describeEvolution };

/**
 * 创建一局。
 * @param {{seed:any, heroId?:string, nightLevel?:number, meta?:object, charm?:{relicId:string}|null}} opts
 */
export function createRun({ seed = 1, heroId = 'zhou', nightLevel = 0, meta = {}, charm = null } = {}) {
  if (!HEROES[heroId]) heroId = 'zhou';
  nightLevel = sanitizeNightLevel(nightLevel);
  const seedNum = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashSeed(seed);
  const metaB = { ...emptyMetaBonuses(), ...(meta || {}) };
  const run = {
    seed,
    heroId,
    nightLevel,
    time: 0,
    watch: 1,
    mode: 'main',
    status: 'playing',
    choiceMode: 'normal',
    darkness: DARKNESS.watch1,
    player: createPlayer(heroId),
    enemies: [],
    projectiles: [],
    pickups: [],
    props: [],
    shrines: [],
    nearbyShrine: null,
    activeShrine: null,
    weapons: [],
    relics: [],
    synergies: { counts: { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 }, active: [] },
    blessings: [],
    choices: null,
    chestChoices: [],
    banishesLeft: LEVELUP.baseBanishes,
    banished: [],
    lockedChoice: null,
    coinsEarned: 0,
    coinsSpent: 0,
    rerolls: { free: REROLL.free + (metaB.freeRerolls | 0), ad: 0, adGrants: 0, adGrantMax: REROLL.adGrantMax },
    revives: { mainUsed: 0, endlessUsed: 0 },
    boss: null,
    stats: { kills: 0, coins: 0, bunsEaten: 0, firstBunTime: null, damageDealt: 0, maxHit: 0, killsByType: {}, ultsCast: 0 },
    events: [],
    // ↓ 内部状态
    meta: metaB,
    night: nightModifiers(nightLevel),
    mods: null,
    rng: new Rng(seedNum),
    _seedNum: seedNum,
    _initializing: true,
    _nextId: 1,
    _spawnAcc: 0,
    _spawnQueue: [],
    _scheduled: [],
    _pendingLevels: 0,
    _pendingBlessings: 0,
    _pendingChests: 0,
    _bossSpawned: {},
    _warderSpawned: {},
    _blessingWatches: { 1: true },
    _synergyMaxTier: { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 },
    _allSchoolBonus: 0,
    _endlessStart: null,
    _endlessBossT: 0,
    _endlessBossIdx: 0,
    _brokenProps: {},
    _propChunk: null,
    _propsDirty: false,
    _shrineChunk: null,
    _shrineMap: {},
    _starterShrinesReady: false,
    _xpCount: 0,
    _auraSlow: 1,
    _outbox: [],
    _cleared: false,
    _nextWaveT: null,
    _tele: { spawnHp: 0, dmg: 0, dmgNonBoss: 0, taken: 0 },
  };

  // 不可枚举的运行时结构（空间哈希、可重入临时缓冲池），避免被 JSON 序列化
  Object.defineProperty(run, '_sys', {
    value: {
      hash: new SpatialHash(64, 12),
      sepHash: new SpatialHash(48, 12),
      scratchArea: [],
      scratchAreaPool: [[], [], [], []],
      _areaDepth: 0,
      scratchSep: [],
      scratchAura: [],
      scratchW: [],
      scratchW2: [],
      scratchW3: [],
      scratchP: [],
      scratchProc: [],
      maxNonBossR: 11,
      liveBoss: null,
      hitPool: [],
      hitPoolIdx: 0,
    },
    enumerable: false,
  });

  recomputeMods(run, { emit: false });
  addOrUpgradeWeapon(run, HEROES[heroId].startWeapon);
  if (charm && charm.relicId) addOrUpgradeRelic(run, charm.relicId);
  recomputeMods(run, { emit: false });
  run._initializing = false;
  run.player.hp = run.player.maxHp;
  updateProps(run);
  updateShrines(run, 0, null);
  return run;
}

function watchDarknessLevel(w) {
  return lerp(DARKNESS.watch1, DARKNESS.watch5, (Math.min(5, w) - 1) / 4);
}

/** 夜色遮罩：纯函数，按时间在相邻两更之间平滑过渡 */
export function darknessAt(run) {
  if (run.mode === 'endless') return DARKNESS.endless;
  if (run.watch >= 6) return DARKNESS.dawn;
  const w = run.watch;
  const into = run.time - (w - 1) * WATCH_DURATION;
  if (w === 1 || into >= DARKNESS.smooth) return watchDarknessLevel(w);
  return lerp(watchDarknessLevel(w - 1), watchDarknessLevel(w), into / DARKNESS.smooth);
}

function updateWatch(run, dt) {
  if (run.mode !== 'main' || run.watch >= 6) {
    run.darkness = darknessAt(run);
    return;
  }
  const w = Math.min(5, Math.floor(run.time / WATCH_DURATION) + 1);
  if (w !== run.watch) {
    run.watch = w;
    run.events.push({ type: 'watchChange', watch: w });

    // 添油续命命签：换更回血
    const oilStacks = run.mods?.lanternOilStacks || 0;
    if (oilStacks > 0 && run.player.hp > 0) {
      const healed = healPlayer(run, Math.round(run.player.maxHp * BLESSING_TUNING.lantern_oil.watchHealPct * oilStacks));
      if (healed > 0) {
        run.events.push({ type: 'heal', amount: healed, source: 'lantern_oil', x: run.player.x, y: run.player.y });
      }
    }

    // 守夜命签触发：仅在正常推进跨过换更边界（120s/240s/360s/480s）且未到 600s 终点时提供命签；
    // 对测试脚本直接修改 run.time 跳过多更的情况，自动标记中间更次已跳过，防止阻断烟雾测试
    if (!run._blessingWatches) run._blessingWatches = { 1: true };
    const into = run.time - (w - 1) * WATCH_DURATION;
    if (run.mode === 'main' && run.time < MAIN_DURATION && into < dt * 2 + 0.05 && !run._blessingWatches[w]) {
      for (let k = 1; k <= w; k++) run._blessingWatches[k] = true;
      run._pendingBlessings = (run._pendingBlessings || 0) + 1;
    } else {
      for (let k = 1; k <= w; k++) run._blessingWatches[k] = true;
    }
  }
  run.darkness = darknessAt(run);
}

/** 本帧结束后决定状态：通关 > 死亡 > 奇遇地标 > 供盒 > 守夜命签 > 常规升级 */
function settleStatus(run) {
  if (run.status === 'cleared') {
    if (run.chestChoices.length) run.chestChoices.length = 0;
    run.activeShrine = null;
    if (run.projectiles.some((pr) => pr.dead || pr.kind === 'enemyBullet')) {
      run.projectiles = run.projectiles.filter((pr) => !pr.dead && pr.kind !== 'enemyBullet');
    }
    return;
  }
  if (run.player.hp <= 0) {
    run.activeShrine = null;
    if (run.chestChoices.length) run.chestChoices.length = 0;
    run.status = 'dead';
    return;
  }
  if (run.activeShrine) {
    run.status = 'shrine';
    if (run.chestChoices.length) run.chestChoices.length = 0;
    return;
  }
  if (run._pendingChests > 0) {
    run.status = 'chest';
    run.chestChoices = buildChestChoices(run);
    return;
  }
  if (run.chestChoices.length) run.chestChoices.length = 0;
  if (run._pendingBlessings > 0) {
    run.status = 'levelup';
    if (!run.choices || run.choiceMode !== 'blessing' || run.choices[0]?.kind !== 'blessing') {
      generateBlessingChoices(run);
    } else {
      run.choiceMode = 'blessing';
    }
  } else if (run._pendingLevels > 0) {
    run.status = 'levelup';
    if (!run.choices || run.choiceMode !== 'normal' || run.choices[0]?.kind === 'blessing') {
      generateChoices(run);
    } else {
      run.choiceMode = 'normal';
    }
  } else {
    run.status = 'playing';
    run.choiceMode = 'normal';
  }
}

/** 逐帧推进；status !== 'playing' 时什么都不做（UI 暂停） */
export function stepRun(run, input = {}, dt = DT) {
  if (!run || run.status !== 'playing') return run;
  const rawDt = dt === undefined ? DT : typeof dt === 'boolean' || dt === null ? NaN : +dt;
  if (!Number.isFinite(rawDt) || rawDt <= 0) return run;
  dt = Math.min(rawDt, 1);
  run.events.length = 0;
  run._sys.hitPoolIdx = 0;
  if (run._outbox.length) {
    for (const e of run._outbox) run.events.push(e);
    run._outbox.length = 0;
  }
  run.time += dt;
  updateWatch(run, dt);
  updatePlayer(run, input, dt);
  updateProps(run);
  updateShrines(run, dt, null);
  updateSpawner(run, dt);
  flushSpawnQueue(run);
  updateEnemies(run, dt);
  updateWeapons(run, dt);
  updateSynergyRuntime(run, dt);
  processScheduled(run, dt);
  updateProjectiles(run, dt);
  processScheduled(run, 0);
  updateUltimate(run, input);
  processScheduled(run, 0);
  flushSpawnQueue(run);
  compactEnemies(run);
  updatePickups(run, dt);
  if (run._scheduled.length) {
    processScheduled(run, 0);
    compactEnemies(run);
  }
  if (input && input.interact && run.nearbyShrine && run.status === 'playing') {
    interactShrineImpl(run, run.nearbyShrine.id);
  }
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

function toChoiceIndex(index) {
  if (typeof index === 'number') return Number.isInteger(index) ? index : -1;
  if (typeof index === 'string' && index.trim() !== '') {
    const n = Number(index);
    return Number.isInteger(n) ? n : -1;
  }
  return -1;
}

export function chooseUpgrade(run, index) {
  if (!run || run.status !== 'levelup' || !run.choices) return false;
  const idx = toChoiceIndex(index);
  if (idx < 0 || idx >= run.choices.length || !run.choices[idx]) return false;
  return outside(run, () => {
    const picked = run.choices[idx];
    const isBlessing = run.choiceMode === 'blessing' || picked.kind === 'blessing';
    if (!applyChoice(run, picked)) return false;

    if (isBlessing) {
      run._pendingBlessings = Math.max(0, (run._pendingBlessings || 0) - 1);
    } else {
      if (run.lockedChoice && run.lockedChoice.kind === picked.kind && run.lockedChoice.id === picked.id) {
        run.lockedChoice = null;
      }
      run._pendingLevels = Math.max(0, run._pendingLevels - 1);
    }
    run.choices = null;
    settleStatus(run);
    return true;
  });
}

export function rerollChoices(run) {
  if (!run || run.status !== 'levelup') return false;
  const r = run.rerolls;
  if (r.free > 0) r.free--;
  else if (r.ad > 0) r.ad--;
  else return false;
  if (run.choiceMode === 'blessing') generateBlessingChoices(run);
  else generateChoices(run);
  return true;
}

export function banishChoice(run, index) {
  if (!run || run.status !== 'levelup') return false;
  const idx = toChoiceIndex(index);
  if (idx < 0) return false;
  return outside(run, () => banishChoiceImpl(run, idx));
}

export function toggleLockChoice(run, index) {
  if (!run || run.status !== 'levelup') return false;
  const idx = toChoiceIndex(index);
  if (idx < 0) return false;
  return toggleLockChoiceImpl(run, idx);
}

export function grantAdRerolls(run) {
  if (!run || !run.rerolls) return false;
  const r = run.rerolls;
  if (r.adGrants >= r.adGrantMax) return false;
  r.adGrants++;
  r.ad += REROLL.adGrant;
  return true;
}

export function openChest(run, preferredWeaponId = null) {
  if (!run || run.status !== 'chest') return { evolved: null, recipe: null, upgrades: [], coins: 0 };
  return outside(run, () => {
    run._pendingChests = Math.max(0, run._pendingChests - 1);
    const res = resolveChest(run, preferredWeaponId);
    settleStatus(run);
    return res;
  });
}

export function interactShrine(run, shrineId = null) {
  return interactShrineImpl(run, shrineId);
}

export function resolveShrine(run, optionIndex) {
  if (!run || run.status !== 'shrine') return null;
  const idx = toChoiceIndex(optionIndex);
  if (idx < 0) return null;
  return outside(run, () => {
    const res = resolveShrineImpl(run, idx);
    if (res) {
      run.status = 'playing';
      settleStatus(run);
    }
    return res;
  });
}

export function dismissShrine(run) {
  if (!run) return;
  dismissShrineImpl(run);
  if (run.status === 'playing') settleStatus(run);
}

export function canRevive(run) {
  if (run.status !== 'dead') return false;
  return run.mode === 'main' ? run.revives.mainUsed < REVIVE.mainMax : run.revives.endlessUsed < REVIVE.endlessMax;
}

/** 广告复活：满血 + 自动大招清屏 + 无敌 3 秒（保留小头目必掉供盒） */
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
    processScheduled(run, 0);
    for (const e of run.enemies) {
      if (!e.boss && !e.dead) {
        if (e.chest) dropPickup(run, 'chest', e.x, e.y, 0);
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

/** 结算（铜钱已乘财运、五帝钱时间奖与夜色加成，不含广告翻倍） */
export function endRun(run) {
  const cleared = run._cleared || run.status === 'cleared' || run.mode === 'endless';
  const safeTime = Number.isFinite(run.time) && run.time > 0 ? run.time : 0;
  const endlessStart = Number.isFinite(run._endlessStart) ? run._endlessStart : safeTime;
  const mainTime = Math.min(safeTime, endlessStart);
  const endlessTime = run.mode === 'endless' ? Math.max(0, safeTime - endlessStart) : 0;
  const inRunCoins = Number.isFinite(run.stats.coins) ? Math.min(1e9, Math.max(0, run.stats.coins)) : 0;
  const timeBonus =
    (COIN_REWARD.perMinute * (Math.min(mainTime, MAIN_DURATION) / 60) +
      (cleared ? COIN_REWARD.clearBonus : 0) +
      COIN_REWARD.endlessPerMinute * (Math.min(endlessTime, 1e7) / 60)) *
    (1 + (run.mods?.relicCoinPct || 0));
  const raw = inRunCoins + (Number.isFinite(timeBonus) ? timeBonus : 0);
  const scaled = raw * (1 + (run.meta.coinPct || 0) + COIN_REWARD.nightPct * run.nightLevel);
  const coins = Number.isFinite(scaled) ? Math.min(1e9, Math.max(0, Math.floor(scaled))) : 1e9;
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
