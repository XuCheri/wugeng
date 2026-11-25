// 一局的总控（ARCHITECTURE §3 + F1–F10）：创建、逐帧推进、三选一、弃签/留签、命签、供盒自选开光、奇遇地标、复活、无尽、结算。
// 纯逻辑：不访问浏览器全局对象或系统时间；同种子 + 同输入序列 → 完全相同的结果。

import {
  DT, MAIN_DURATION, WATCH_DURATION, DARKNESS, REROLL, REVIVE, HEROES, WEAPONS, RELICS, WEAPON_IDS, ENDLESS, COIN_REWARD, LEVELUP,
  SCORE_TUNING, sanitizeNightLevel, nightModifiers, emptyMetaBonuses, isHeroSignatureWeapon,
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
import { updateSynergyRuntime, computeSynergies } from './synergies.js';
import { generateBlessingChoices, BLESSING_TUNING } from './blessings.js';
import { updateShrines, interactShrineImpl, resolveShrineImpl, dismissShrineImpl } from './shrines.js';
import { WATCH_EVENT_KINDS, startWatchEvent, updateWatchEvents } from './events.js';
import {
  coopPartySize,
  withPlayerContext,
  initCoopPlayers,
  normalizeSlotInputs,
  stepCoopAlliesMovement,
  markPlayerDowned,
  areAllPlayersDowned,
  updateCoopRevives,
  syncAlliesOnTeamProgress,
  buildSquadSummary,
} from './coop.js';
import { computeRunHash } from './hash.js';

export { DT, getEvolutionRecipe, canEvolve, describeUpgrade, describeEvolution, WATCH_EVENT_KINDS, startWatchEvent, computeRunHash };

/**
 * 创建一局（100% 向后兼容旧版单人参表，并支持自选初始武器、解锁池过滤与 2–4 人协同联机）。
 */
function isOwnHero(id) {
  return typeof id === 'string' && Object.hasOwn(HEROES, id);
}

function isOwnWeapon(id) {
  return typeof id === 'string' && Object.hasOwn(WEAPONS, id);
}

function sanitizeMetaBonuses(meta) {
  const out = emptyMetaBonuses();
  if (!meta || typeof meta !== 'object') return out;
  for (const k of Object.keys(out)) {
    const rawV = meta[k];
    if (rawV == null || typeof rawV === 'boolean') continue;
    const num = typeof rawV === 'string' && rawV.trim() === '' ? NaN : +rawV;
    if (!Number.isFinite(num)) continue;
    if (k === 'freeRerolls' || k === 'armor') {
      out[k] = Math.max(0, Math.min(999, Math.floor(num)));
    } else {
      out[k] = Math.max(-0.9, Math.min(100, num));
    }
  }
  return out;
}

function sanitizeRunRules(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const numOr = (v, def, min, max) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    mode: raw.mode === 'daily' ? 'daily' : raw.mode === 'season' ? 'season' : 'normal',
    dailyDate: typeof raw.dailyDate === 'string' ? raw.dailyDate.slice(0, 16) : null,
    seasonRuleActive: Boolean(raw.seasonRuleActive),
    ruleIds: Array.isArray(raw.ruleIds) ? raw.ruleIds.filter((x) => typeof x === 'string').slice(0, 8) : [],
    onlySchool: typeof raw.onlySchool === 'string' ? raw.onlySchool : null,
    autoMagnetXp: Boolean(raw.autoMagnetXp),
    swapWeaponPerWatch: Boolean(raw.swapWeaponPerWatch),
    noBuns: Boolean(raw.noBuns),
    dmgPct: numOr(raw.dmgPct, 0, -0.8, 5),
    cdr: numOr(raw.cdr, 0, -0.8, 0.8),
    amount: Math.round(numOr(raw.amount, 0, -3, 6)),
    areaPct: numOr(raw.areaPct, 0, -0.5, 3),
    maxHpMul: numOr(raw.maxHpMul, 1, 0.2, 5),
    playerSpeedMul: numOr(raw.playerSpeedMul, 1, 0.4, 3),
    enemySpeedMul: numOr(raw.enemySpeedMul, 1, 0.4, 3),
    eliteChanceMul: numOr(raw.eliteChanceMul, 1, 0.2, 5),
    xpMul: numOr(raw.xpMul, 1, 0.2, 5),
    coinDropMul: numOr(raw.coinDropMul, 1, 0.2, 5),
    pickupPct: numOr(raw.pickupPct, 0, -0.5, 5),
    ultChargePct: numOr(raw.ultChargePct, 0, -0.5, 5),
    lightMul: numOr(raw.lightMul, 1, 0.35, 3),
    critChance: numOr(raw.critChance, 0, -0.5, 1),
    critDmg: numOr(raw.critDmg, 0, -1, 5),
    spawnRateMul: numOr(raw.spawnRateMul, 1, 0.3, 4),
    scoreMul: numOr(raw.scoreMul, 1, 0.5, 5),
  };
}

export function createRun(rawOpts = {}) {
  let {
    seed = 1,
    heroId = 'zhou',
    startWeapon = null,
    unlockedWeapons = null,
    nightLevel = 0,
    meta = {},
    charm = null,
    coop = null,
    runRules = null,
  } = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
  const party0 = Array.isArray(coop) ? coop[0] : coop && typeof coop === 'object' ? coop.party?.[0] : null;
  if (isOwnHero(party0?.heroId)) heroId = party0.heroId;
  if (!isOwnHero(heroId)) heroId = 'zhou';
  if (!isOwnWeapon(startWeapon) && isOwnWeapon(party0?.startWeapon)) {
    startWeapon = party0.startWeapon;
  }
  const chosenStartWeapon = isOwnWeapon(startWeapon) ? startWeapon : HEROES[heroId].startWeapon;
  let normUnlockedWeapons = null;
  if (Array.isArray(unlockedWeapons)) {
    const uSet = new Set(unlockedWeapons.filter((id) => isOwnWeapon(id)));
    uSet.add(chosenStartWeapon);
    normUnlockedWeapons = WEAPON_IDS.filter((id) => uSet.has(id));
  }

  nightLevel = sanitizeNightLevel(nightLevel);
  const seedNum = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashSeed(seed);
  const metaB = sanitizeMetaBonuses(meta);
  const cleanRules = sanitizeRunRules(runRules);
  const run = {
    seed,
    heroId,
    startWeapon: chosenStartWeapon,
    signatureStart: isHeroSignatureWeapon(heroId, chosenStartWeapon),
    unlockedWeapons: normUnlockedWeapons,
    nightLevel,
    runRules: cleanRules,
    time: 0,
    watch: 1,
    mode: 'main',
    status: 'playing',
    choiceMode: 'normal',
    darkness: DARKNESS.watch1,
    player: createPlayer(heroId, { startWeapon: chosenStartWeapon }),
    players: null,
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
    watchEvent: null,
    watchEventResult: null,
    stats: {
      kills: 0,
      coins: 0,
      bunsEaten: 0,
      firstBunTime: null,
      damageDealt: 0,
      damageByWeapon: {},
      maxHit: 0,
      combo: 0,
      maxCombo: 0,
      comboT: 0,
      killsByType: {},
      ultsCast: 0,
      coopRevives: 0,
      eventsCompleted: 0,
    },
    events: [],
    // ↓ 内部状态
    meta: metaB,
    night: nightModifiers(nightLevel),
    mods: null,
    rng: new Rng(seedNum),
    eventRng: new Rng((seedNum ^ 0x9E3779B9) >>> 0),
    _seedNum: seedNum,
    _initializing: true,
    _activeSlot: 0,
    _nextId: 1,
    _spawnAcc: 0,
    _spawnQueue: [],
    _scheduled: [],
    _pendingLevels: 0,
    _pendingBlessings: 0,
    _pendingChests: 0,
    _bossSpawned: {},
    _warderSpawned: {},
    _watchEventsDone: {},
    _watchEventUsedKinds: [],
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
  addOrUpgradeWeapon(run, chosenStartWeapon);
  if (charm && typeof charm === 'object' && typeof charm.relicId === 'string' && Object.hasOwn(RELICS, charm.relicId)) {
    addOrUpgradeRelic(run, charm.relicId);
  }
  recomputeMods(run, { emit: false });
  initCoopPlayers(run, coop, charm);
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
    if (oilStacks > 0 && !run.player.downed && run.player.hp > 0) {
      const healed = healPlayer(run, Math.round(run.player.maxHp * BLESSING_TUNING.lantern_oil.watchHealPct * oilStacks));
      if (healed > 0) {
        run.events.push({ type: 'heal', amount: healed, source: 'lantern_oil', x: run.player.x, y: run.player.y });
      }
    }

    // 每日异事「每更易兵」词条：将一把未开光兵刃轮换为同阶未持有兵刃
    if (run.runRules?.swapWeaponPerWatch && Array.isArray(run.weapons) && run.weapons.length > 0) {
      const nonEvo = run.weapons.filter((wp) => wp && !wp.evolved);
      const targetWp = nonEvo.length > 1 ? nonEvo[1] : nonEvo[0] || null;
      if (targetWp) {
        const ownedIds = new Set(run.weapons.map((wp) => wp.id));
        const poolBase = Array.isArray(run.unlockedWeapons) && run.unlockedWeapons.length > 0
          ? run.unlockedWeapons
          : WEAPON_IDS;
        const swapPool = poolBase.filter((wid) => !ownedIds.has(wid) && Object.hasOwn(WEAPONS, wid));
        if (swapPool.length > 0) {
          const fromId = targetWp.id;
          const toId = swapPool[run.rng.int(0, swapPool.length - 1)];
          targetWp.id = toId;
          targetWp.cd = 0;
          targetWp.altarReady = false;
          recomputeMods(run, { emit: false });
          run.events.push({ type: 'dailySwap', fromId, toId, watch: w });
        }
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
  if (areAllPlayersDowned(run)) {
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

  run.player.weapons = run.weapons;
  run.player.relics = run.relics;
  const isCoop = coopPartySize(run) > 1;
  const slotInputs = normalizeSlotInputs(run, input);
  const inp0 = slotInputs[0];

  run.time += dt;
  if (run.stats.comboT > 0) {
    run.stats.comboT -= dt;
    if (run.stats.comboT <= 0) {
      run.stats.comboT = 0;
      run.stats.combo = 0;
    }
  }
  updateWatch(run, dt);
  if (isCoop) {
    if (run.player.downed || run.player.hp <= 0) {
      if (run.player.hp <= 0 && !run.player.downed) markPlayerDowned(run, run.player);
      run.player.vx = 0;
      run.player.vy = 0;
      run.player.moving = false;
    } else {
      updatePlayer(run, inp0, dt);
    }
    stepCoopAlliesMovement(run, slotInputs, dt);
  } else {
    updatePlayer(run, inp0, dt);
  }

  updateProps(run);
  updateShrines(run, dt, null);
  updateSpawner(run, dt);
  updateWatchEvents(run, dt);
  flushSpawnQueue(run);
  updateEnemies(run, dt);
  if (isCoop) updateCoopRevives(run, dt);

  if (!isCoop || (!run.player.downed && run.player.hp > 0)) {
    updateWeapons(run, dt);
    updateSynergyRuntime(run, dt);
  }
  if (isCoop) {
    for (let i = 1; i < run.players.length; i++) {
      const ally = run.players[i];
      if (!ally.downed && ally.hp > 0) {
        withPlayerContext(run, ally, () => {
          updateWeapons(run, dt);
          updateSynergyRuntime(run, dt);
        });
      }
    }
  }

  processScheduled(run, dt);
  updateProjectiles(run, dt);
  processScheduled(run, 0);

  if (!isCoop || (!run.player.downed && run.player.hp > 0)) {
    updateUltimate(run, inp0);
  }
  if (isCoop) {
    for (let i = 1; i < run.players.length; i++) {
      const ally = run.players[i];
      if (!ally.downed && ally.hp > 0) {
        withPlayerContext(run, ally, () => {
          updateUltimate(run, slotInputs[i]);
        });
      }
    }
  }

  processScheduled(run, 0);
  flushSpawnQueue(run);
  compactEnemies(run);
  updatePickups(run, dt);
  if (run._scheduled.length) {
    processScheduled(run, 0);
    compactEnemies(run);
  }
  if (inp0 && inp0.interact && run.nearbyShrine && run.status === 'playing') {
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
  if (run.events.length > start) {
    for (const e of run.events.splice(start)) {
      run._outbox.push(e && e.type === 'hit' ? { ...e } : e);
    }
  }
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
      syncAlliesOnTeamProgress(run, 'blessing');
    } else {
      if (run.lockedChoice && run.lockedChoice.kind === picked.kind && run.lockedChoice.id === picked.id) {
        run.lockedChoice = null;
      }
      run._pendingLevels = Math.max(0, run._pendingLevels - 1);
      syncAlliesOnTeamProgress(run, 'levelup');
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
    syncAlliesOnTeamProgress(run, 'chest');
    settleStatus(run);
    return res;
  });
}

export function interactShrine(run, shrineId = null) {
  const ok = interactShrineImpl(run, shrineId);
  if (!ok && run?.status === 'playing') settleStatus(run);
  return ok;
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
    p.downed = false;
    p.downedTimer = 0;
    p.reviveProgress = 0;
    p.hp = p.maxHp;
    p.invulnT = REVIVE.invuln;
    if (Array.isArray(run.players)) {
      for (let i = 1; i < run.players.length; i++) {
        const ally = run.players[i];
        ally.downed = false;
        ally.downedTimer = 0;
        ally.reviveProgress = 0;
        ally.hp = ally.maxHp;
        ally.invulnT = REVIVE.invuln;
      }
    }
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
    if (run.status !== 'cleared') run.status = 'playing';
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
  if (run.player.hp <= 0) run.player.hp = 1;
  if (Array.isArray(run.players)) {
    for (const pl of run.players) {
      pl.downed = false;
      pl.reviveProgress = 0;
      if (pl.hp <= 0) pl.hp = 1;
    }
  }
  run.status = 'playing';
  settleStatus(run);
  return true;
}

/** 计算单局综合守夜积分（正整数，供 TapTap 五更守夜总榜与本地荣誉榜共用） */
export function computeRunScore(run, clearedArg) {
  if (!run || typeof run !== 'object') return 0;
  const isCleared =
    clearedArg !== undefined ? Boolean(clearedArg) : Boolean(run._cleared || run.status === 'cleared' || run.mode === 'endless');
  const safeTime = Number.isFinite(run.time) && run.time > 0 ? Math.min(run.time, 1e7) : 0;
  const endlessStart =
    Number.isFinite(run._endlessStart) && run._endlessStart >= 0 ? Math.min(run._endlessStart, safeTime) : Math.min(safeTime, MAIN_DURATION);
  const mainSec = Math.min(safeTime, MAIN_DURATION);
  const endlessSec = run.mode === 'endless' ? Math.max(0, safeTime - endlessStart) : 0;
  const kills = Number.isFinite(run.stats?.kills) && run.stats.kills > 0 ? Math.min(1e9, Math.floor(run.stats.kills)) : 0;
  const kbt = run.stats && typeof run.stats.killsByType === 'object' && run.stats.killsByType ? run.stats.killsByType : {};
  const bossKills = Math.min(
    1e6,
    ['horse', 'umbrella', 'youshen'].reduce(
      (acc, k) => acc + (Number.isFinite(kbt[k]) && kbt[k] > 0 ? Math.min(1e6, Math.floor(kbt[k])) : 0),
      0,
    ),
  );
  const evolvedCount = Array.isArray(run.weapons) ? run.weapons.filter((w) => w && w.evolved).length : 0;
  const lv = Number.isFinite(run.player?.level) && run.player.level > 1 ? Math.min(999, Math.floor(run.player.level) - 1) : 0;
  const revivesDone = Array.isArray(run.players)
    ? run.players.reduce((s, p) => s + (Number.isFinite(p?.stats?.revivesDone) && p.stats.revivesDone > 0 ? Math.min(1e6, Math.floor(p.stats.revivesDone)) : 0), 0)
    : 0;
  const nightLv = sanitizeNightLevel(run.nightLevel);
  const raw =
    mainSec * SCORE_TUNING.perMainSec +
    endlessSec * SCORE_TUNING.perEndlessSec +
    kills * SCORE_TUNING.perKill +
    bossKills * SCORE_TUNING.perBossKill +
    evolvedCount * SCORE_TUNING.perEvolution +
    lv * SCORE_TUNING.perLevel +
    revivesDone * SCORE_TUNING.perCoopRevive +
    (isCleared ? SCORE_TUNING.clearBonus : 0);
  const mul = 1 + SCORE_TUNING.nightBonusPerLv * nightLv;
  const scaled = raw * mul;
  if (Number.isNaN(scaled) || scaled <= 0) return 0;
  if (scaled === Infinity) return SCORE_TUNING.maxScore;
  return Math.min(SCORE_TUNING.maxScore, Math.max(0, Math.round(scaled)));
}

/** 结算（铜钱已乘财运、五帝钱时间奖与夜色加成，不含广告翻倍；附守夜积分与联机 MVP 战绩） */
export function endRun(run, clearedArg) {
  if (!run || typeof run !== 'object') {
    const cleared = Boolean(clearedArg);
    return {
      heroId: 'zhou',
      startWeapon: 'gong',
      signatureStart: true,
      nightLevel: 0,
      cleared,
      mode: 'main',
      timeSec: 0,
      reachedWatch: cleared ? 6 : 1,
      level: 1,
      kills: 0,
      coins: 0,
      bunsEaten: 0,
      firstBunTime: null,
      maxHit: 0,
      maxCombo: 0,
      damageByWeapon: {},
      topWeapon: null,
      killsByType: {},
      weapons: [],
      relics: [],
      evolvedCount: 0,
      maxSynergyTier: 0,
      bossKills: 0,
      eventsCompleted: 0,
      score: 0,
      coopSize: 0,
      revivesDone: 0,
      squad: [],
    };
  }
  const cleared =
    clearedArg !== undefined ? Boolean(clearedArg) : Boolean(run._cleared || run.status === 'cleared' || run.mode === 'endless');
  const nightLv = sanitizeNightLevel(run.nightLevel);
  const safeTime = Number.isFinite(run.time) && run.time > 0 ? run.time : 0;
  const endlessStart = Number.isFinite(run._endlessStart) && run._endlessStart >= 0 ? Math.min(run._endlessStart, safeTime) : safeTime;
  const mainTime = Math.min(safeTime, endlessStart);
  const endlessTime = run.mode === 'endless' ? Math.max(0, safeTime - endlessStart) : 0;
  const st = run.stats && typeof run.stats === 'object' ? run.stats : {};
  const inRunCoins = Number.isFinite(st.coins) && st.coins > 0 ? Math.min(1e9, Math.max(0, st.coins)) : 0;
  const relicCoinPct = Number.isFinite(run.mods?.relicCoinPct) ? Math.max(0, Math.min(100, run.mods.relicCoinPct)) : 0;
  const metaCoinPct = Number.isFinite(run.meta?.coinPct) ? Math.max(0, Math.min(100, run.meta.coinPct)) : 0;
  const timeBonus =
    (COIN_REWARD.perMinute * (Math.min(mainTime, MAIN_DURATION) / 60) +
      (cleared ? COIN_REWARD.clearBonus : 0) +
      COIN_REWARD.endlessPerMinute * (Math.min(endlessTime, 1e7) / 60)) *
    (1 + relicCoinPct);
  const raw = inRunCoins + (Number.isFinite(timeBonus) ? timeBonus : 0);
  const scaled = raw * (1 + metaCoinPct + COIN_REWARD.nightPct * nightLv);
  const coins =
    Number.isNaN(scaled) || scaled <= 0
      ? 0
      : scaled === Infinity
        ? 1e9
        : Math.min(1e9, Math.max(0, Math.floor(scaled)));

  const safeWeapons = Array.isArray(run.weapons) ? run.weapons.filter(Boolean) : [];
  const safeRelics = Array.isArray(run.relics) ? run.relics.filter(Boolean) : [];
  const evolvedCount = safeWeapons.filter((w) => w.evolved).length;
  const synCalc = computeSynergies({ ...run, weapons: safeWeapons, relics: safeRelics });
  const maxSynergyTier = synCalc.active.reduce((m, a) => Math.max(m, a.tier || 0), 0);
  const rawKbt = st.killsByType && typeof st.killsByType === 'object' ? st.killsByType : {};
  const cleanKbt = {};
  for (const [k, v] of Object.entries(rawKbt)) {
    if (Number.isFinite(v) && v > 0) cleanKbt[k] = Math.min(1e9, Math.floor(v));
  }
  const bossKills = Math.min(
    1e6,
    ['horse', 'umbrella', 'youshen'].reduce(
      (acc, k) => acc + (Object.hasOwn(cleanKbt, k) ? Math.min(1e6, cleanKbt[k]) : 0),
      0,
    ),
  );
  const rawDbw = st.damageByWeapon && typeof st.damageByWeapon === 'object' ? st.damageByWeapon : {};
  const cleanDbw = {};
  let totalTrackedDmg = 0;
  for (const [k, v] of Object.entries(rawDbw)) {
    if (Number.isFinite(v) && v > 0) {
      const cv = Math.min(Number.MAX_SAFE_INTEGER, Math.round(v));
      cleanDbw[k] = cv;
      totalTrackedDmg += cv;
    }
  }
  const totalDmgDenom = Math.max(
    Number.isFinite(st.damageDealt) && st.damageDealt > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(st.damageDealt)) : 0,
    totalTrackedDmg,
  );
  let topWeapon = null;
  for (const [wid, dmgVal] of Object.entries(cleanDbw)) {
    if (!Object.hasOwn(WEAPONS, wid)) continue;
    if (!topWeapon || dmgVal > topWeapon.damage) {
      topWeapon = {
        id: wid,
        damage: dmgVal,
        share: totalDmgDenom > 0 ? Math.min(100, Math.max(1, Math.round((dmgVal / totalDmgDenom) * 100))) : 0,
      };
    }
  }
  const maxCombo = Number.isFinite(st.maxCombo) && st.maxCombo > 0 ? Math.min(1e9, Math.floor(st.maxCombo)) : 0;
  const eventsCompleted = Number.isFinite(st.eventsCompleted) && st.eventsCompleted > 0 ? Math.min(1e6, Math.floor(st.eventsCompleted)) : 0;
  const squad = buildSquadSummary(run);
  const coopSize = squad.length;
  const revivesDone = squad.reduce((s, m) => s + m.revivesDone, 0);
  const score = computeRunScore(run, cleared);
  const safeHeroId = isOwnHero(run.heroId) ? run.heroId : 'zhou';
  const safeStartWeapon = isOwnWeapon(run.startWeapon) ? run.startWeapon : HEROES[safeHeroId].startWeapon;
  const rawWatch = Number.isFinite(run.watch) ? Math.max(1, Math.min(5, Math.floor(run.watch))) : 1;

  const scoreMul = Number.isFinite(run.runRules?.scoreMul) && run.runRules.scoreMul > 0 ? run.runRules.scoreMul : 1;
  const dailyScore = Math.min(9_999_999_999, Math.max(0, Math.round(score * scoreMul)));

  run._ended = true;
  return {
    heroId: safeHeroId,
    startWeapon: safeStartWeapon,
    signatureStart: run.signatureStart !== undefined ? !!run.signatureStart : isHeroSignatureWeapon(safeHeroId, safeStartWeapon),
    nightLevel: nightLv,
    cleared,
    mode: run.mode === 'endless' ? 'endless' : 'main',
    isDailyChallenge: run.runRules?.mode === 'daily',
    dailyDate: run.runRules?.dailyDate || null,
    seasonRuleActive: Boolean(run.runRules?.seasonRuleActive),
    timeSec: Math.floor(Math.min(1e9, safeTime)),
    reachedWatch: cleared ? 6 : rawWatch,
    level: Number.isFinite(run.player?.level) && run.player.level >= 1 ? Math.min(1e9, Math.floor(run.player.level)) : 1,
    kills: Number.isFinite(st.kills) && st.kills > 0 ? Math.min(1e9, Math.floor(st.kills)) : 0,
    coins,
    bunsEaten: Number.isFinite(st.bunsEaten) && st.bunsEaten > 0 ? Math.min(1e9, Math.floor(st.bunsEaten)) : 0,
    firstBunTime: Number.isFinite(st.firstBunTime) && st.firstBunTime >= 0 ? st.firstBunTime : null,
    maxHit: Number.isFinite(st.maxHit) && st.maxHit > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(st.maxHit)) : 0,
    maxCombo,
    damageByWeapon: cleanDbw,
    topWeapon,
    killsByType: cleanKbt,
    weapons: safeWeapons.map((w) => ({ id: w.id, level: w.level, evolved: !!w.evolved })),
    relics: safeRelics.map((r) => ({ id: r.id, level: r.level })),
    evolvedCount,
    maxSynergyTier,
    bossKills,
    eventsCompleted,
    score,
    dailyScore,
    coopSize,
    revivesDone,
    squad,
  };
}
