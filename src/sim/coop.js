// 多人同守五更纯确定性协同模拟内核（F14）：
// - 支持 1–4 名守夜人同场模拟（run.players，run.player === run.players[0] 保持单人 100% 兼容）
// - 朱砂八卦阵倒地读条救援（REVIVE_RADIUS = 48, REVIVE_SECONDS = 2.4，恢复 50% 生命 + 2.5s 无敌帧）
// - 人数动态血量缩放（1 + 0.55*(N-1)）与刷怪速率缩放（1 + 0.30*(N-1)）
// - 智能道友 AI 走位、风筝与优先画阵救人（isBot: true）
// - 严守 T5-WB-07 纯净度：零宿主/浏览器/定时器/非确定性全局对象。

import { HEROES, WEAPONS, RELICS, WEAPON_IDS, ULT, ENEMIES, isHeroSignatureWeapon } from './balance.js';
import { fsin, fcos } from '../core/math.js';
import { Rng, mixSeed } from '../core/rng.js';
import { createPlayer, recomputeMods, updatePlayer, hurtPlayer } from './player.js';
import { addOrUpgradeWeapon } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { candidateChoices, applyChoice } from './levelup.js';
import { resolveChest } from './evolutions.js';
import { knockback } from './combat.js';

export const REVIVE_RADIUS = 48;
export const REVIVE_SECONDS = 2.4;
export const COOP_REVIVE_HP_PCT = 0.5;
export const COOP_REVIVE_INVULN = 2.5;
export const COOP_REVIVE_PUSH_RADIUS = 150;
export const COOP_REVIVE_PUSH_FORCE = 300;
export const COOP_HP_SCALE_PER_ALLY = 0.55;
export const COOP_SPAWN_SCALE_PER_ALLY = 0.30;
export const MAX_COOP_PLAYERS = 4;

const BOT_DIRS = (() => {
  const dirs = [{ x: 0, y: 0 }];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    dirs.push({ x: fcos(a), y: fsin(a) });
  }
  return dirs;
})();

export function coopPartySize(run) {
  return Array.isArray(run?.players) && run.players.length > 1 ? run.players.length : 1;
}

export function coopHpScale(run) {
  const n = coopPartySize(run);
  return n >= 2 ? 1 + COOP_HP_SCALE_PER_ALLY * (n - 1) : 1;
}

export function coopSpawnScale(run) {
  const n = coopPartySize(run);
  return n >= 2 ? 1 + COOP_SPAWN_SCALE_PER_ALLY * (n - 1) : 1;
}

function ensurePlayerRt(run, p) {
  if (p._rt) return p._rt;
  const rt = {
    buildRng: new Rng(mixSeed(run?._seedNum || 1, (p.slot || 0) + 1, 0x636f6f70)),
    aiMem: {},
    mods: null,
    synergies: { counts: { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 }, active: [] },
    synergyMaxTier: { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 },
    auraSlow: 1,
    stepChargeDist: 0,
    ultFrenzyT: 0,
    summonFrenzyT: 0,
    nuoDanceT: 0,
    daofaThunderCd: 0,
    zhenhunGongT: null,
    zhizhaImpT: null,
    papermanFireT: 0,
    paperSoulUsed: false,
    glutinousKills: 0,
    coinswordEvoHits: 0,
    taomujianHits: 0,
    lastTalismanVolleyArray: 0,
  };
  Object.defineProperty(p, '_rt', { value: rt, enumerable: false, configurable: true });
  return rt;
}

function saveRunToRt(run, p) {
  if (!run || !p) return;
  const rt = ensurePlayerRt(run, p);
  rt.mods = run.mods;
  rt.synergies = run.synergies;
  rt.synergyMaxTier = run._synergyMaxTier;
  rt.auraSlow = run._auraSlow;
  rt.stepChargeDist = run._stepChargeDist || 0;
  rt.ultFrenzyT = run._ultFrenzyT || 0;
  rt.summonFrenzyT = run._summonFrenzyT || 0;
  rt.nuoDanceT = run._nuoDanceT || 0;
  rt.daofaThunderCd = run._daofaThunderCd || 0;
  rt.zhenhunGongT = run._zhenhunGongT;
  rt.zhizhaImpT = run._zhizhaImpT;
  rt.papermanFireT = run._papermanFireT || 0;
  rt.paperSoulUsed = !!run._paperSoulUsed;
  rt.glutinousKills = run._glutinousKills || 0;
  rt.coinswordEvoHits = run._coinswordEvoHits || 0;
  rt.taomujianHits = run._taomujianHits || 0;
  rt.lastTalismanVolleyArray = run._lastTalismanVolleyArray || 0;
}

function loadRtToRun(run, p, fallbackMods = null) {
  const rt = ensurePlayerRt(run, p);
  run.player = p;
  run.heroId = p.heroId;
  run.weapons = p.weapons;
  run.relics = p.relics;
  run.mods = rt.mods || fallbackMods;
  run.synergies = rt.synergies;
  run._synergyMaxTier = rt.synergyMaxTier;
  run._auraSlow = rt.auraSlow;
  run._stepChargeDist = rt.stepChargeDist;
  run._ultFrenzyT = rt.ultFrenzyT;
  run._summonFrenzyT = rt.summonFrenzyT;
  run._nuoDanceT = rt.nuoDanceT;
  run._daofaThunderCd = rt.daofaThunderCd;
  run._zhenhunGongT = rt.zhenhunGongT;
  run._zhizhaImpT = rt.zhizhaImpT;
  run._papermanFireT = rt.papermanFireT;
  run._paperSoulUsed = rt.paperSoulUsed;
  run._glutinousKills = rt.glutinousKills;
  run._coinswordEvoHits = rt.coinswordEvoHits;
  run._taomujianHits = rt.taomujianHits;
  run._lastTalismanVolleyArray = rt.lastTalismanVolleyArray;
  run._activeSlot = p.slot ?? 0;
}

/**
 * 临时将 run 的当前活跃角色上下文切换到指定守夜人 p（完全可重入，支持 0 -> 1 -> 0 任意深度嵌套切换）。
 */
export function withPlayerContext(run, p, fn) {
  if (!run || !p) return fn();
  if (p === run.player) {
    const prevSlot = run._activeSlot || 0;
    run._activeSlot = p.slot ?? 0;
    try {
      return fn();
    } finally {
      run._activeSlot = prevSlot;
    }
  }

  const prevPrimary = run._primaryPlayer;
  const prevPlayer = run.player;
  const prevHero = run.heroId;
  const prevWeapons = run.weapons;
  const prevRelics = run.relics;
  const prevMods = run.mods;
  const prevSlot = run._activeSlot || 0;

  saveRunToRt(run, prevPlayer);
  run._primaryPlayer = prevPrimary || ((prevPlayer?.slot ?? 0) === 0 ? prevPlayer : run.players?.[0] || prevPlayer);
  loadRtToRun(run, p, prevMods);

  try {
    return fn();
  } finally {
    saveRunToRt(run, p);
    run._primaryPlayer = prevPrimary;
    if (prevPlayer) {
      loadRtToRun(run, prevPlayer, prevMods);
    }
    run.heroId = prevHero;
    run.weapons = prevWeapons;
    run.relics = prevRelics;
    run._activeSlot = prevSlot;
  }
}

/**
 * 初始化单人或 2–4 人协同队伍；单人时零额外 Rng 调用，保持与 v2 100% 同构确定性。
 */
export function initCoopPlayers(run, coop, charm = null) {
  const p0 = run.player;
  p0.weapons = run.weapons;
  p0.relics = run.relics;
  p0.startWeapon = run.startWeapon;

  const rawParty = Array.isArray(coop)
    ? coop
    : coop && typeof coop === 'object' && Array.isArray(coop.party)
      ? coop.party
      : null;

  if (!rawParty || rawParty.length === 0) {
    run.players = [p0];
    return run.players;
  }

  const party = rawParty.slice(0, MAX_COOP_PLAYERS);
  const e0 = party[0] || {};
  p0.slot = 0;
  if (typeof e0.peerId === 'string' && e0.peerId) p0.peerId = e0.peerId;
  if (typeof e0.name === 'string' && e0.name) p0.name = e0.name;
  if (e0.skinId !== undefined) p0.skinId = e0.skinId;
  if (e0.attackVfx !== undefined) p0.attackVfx = e0.attackVfx;
  p0.isBot = !!e0.isBot;

  if (party.length === 1) {
    if (p0.isBot) ensurePlayerRt(run, p0);
    run.players = [p0];
    return run.players;
  }

  const players = [p0];
  const allyCount = party.length - 1;
  for (let slot = 1; slot < party.length; slot++) {
    const entry = party[slot] && typeof party[slot] === 'object' ? party[slot] : {};
    const allyHero = typeof entry.heroId === 'string' && Object.hasOwn(HEROES, entry.heroId) ? entry.heroId : 'zhou';
    const allyStart =
      typeof entry.startWeapon === 'string' && Object.hasOwn(WEAPONS, entry.startWeapon)
        ? entry.startWeapon
        : HEROES[allyHero].startWeapon;
    const formAngle = ((slot - 1) / Math.max(1, allyCount)) * Math.PI * 2;
    const sx = Math.round(fcos(formAngle) * 28 * 100) / 100;
    const sy = Math.round(fsin(formAngle) * 28 * 100) / 100;

    const ally = createPlayer(allyHero, {
      slot,
      peerId: typeof entry.peerId === 'string' && entry.peerId ? entry.peerId : `peer_${slot}`,
      name:
        typeof entry.name === 'string' && entry.name
          ? entry.name
          : entry.isBot
            ? `道友·${HEROES[allyHero].short}`
            : HEROES[allyHero].short,
      startWeapon: allyStart,
      skinId: entry.skinId ?? null,
      attackVfx: entry.attackVfx ?? null,
      isBot: !!entry.isBot,
      x: sx,
      y: sy,
      weapons: [],
      relics: [],
    });

    ensurePlayerRt(run, ally);
    withPlayerContext(run, ally, () => {
      run.mods = null;
      recomputeMods(run, { emit: false });
      addOrUpgradeWeapon(run, allyStart, ally);
      if (charm && typeof charm === 'object' && typeof charm.relicId === 'string' && Object.hasOwn(RELICS, charm.relicId)) {
        addOrUpgradeRelic(run, charm.relicId);
      }
      recomputeMods(run, { emit: false });
      ally.hp = ally.maxHp;
    });
    players.push(ally);
  }

  run.players = players;
  return players;
}

/** 挑选最近的未倒地存活守夜人（敌人追击、远程索敌与软分离目标） */
export function nearestLivingPlayer(run, x, y) {
  const pls = run?.players;
  if (!pls || pls.length <= 1) return run.player;
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < pls.length; i++) {
    const pl = pls[i];
    if (pl.downed || pl.hp <= 0) continue;
    const dx = pl.x - x;
    const dy = pl.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = pl;
    }
  }
  return best || pls[0];
}

function cleanSingleInput(inp) {
  if (!inp || typeof inp !== 'object') {
    return { moveX: 0, moveY: 0, ultimate: false, interact: false };
  }
  const rawMx = typeof inp.moveX !== 'boolean' ? +inp.moveX : 0;
  const rawMy = typeof inp.moveY !== 'boolean' ? +inp.moveY : 0;
  return {
    moveX: Number.isFinite(rawMx) ? rawMx : 0,
    moveY: Number.isFinite(rawMy) ? rawMy : 0,
    ultimate: Boolean(inp.ultimate || inp.ult),
    interact: Boolean(inp.interact),
  };
}

function hasExplicitInput(inp) {
  if (!inp || typeof inp !== 'object') return false;
  return (
    Object.hasOwn(inp, 'moveX') ||
    Object.hasOwn(inp, 'moveY') ||
    Object.hasOwn(inp, 'ultimate') ||
    Object.hasOwn(inp, 'ult') ||
    Object.hasOwn(inp, 'interact')
  );
}

/**
 * 归一化单人或 2–4 人槽位输入映射，并为未提供人工输入的智能道友（isBot: true）计算 AI 走位与大招指令。
 */
export function normalizeSlotInputs(run, inputOrSlotMap) {
  const pls = run?.players;
  if (!pls || pls.length <= 1) {
    const p0 = run.player;
    if (p0?.isBot && !hasExplicitInput(inputOrSlotMap)) {
      return [computeDaoistBotInput(run, p0)];
    }
    return [cleanSingleInput(inputOrSlotMap)];
  }

  let slotSource = null;
  if (Array.isArray(inputOrSlotMap)) {
    slotSource = inputOrSlotMap;
  } else if (inputOrSlotMap && typeof inputOrSlotMap === 'object') {
    if (inputOrSlotMap.slots && typeof inputOrSlotMap.slots === 'object') {
      slotSource = inputOrSlotMap.slots;
    } else if (inputOrSlotMap.inputs && typeof inputOrSlotMap.inputs === 'object') {
      slotSource = inputOrSlotMap.inputs;
    } else if (
      !hasExplicitInput(inputOrSlotMap) &&
      (Object.hasOwn(inputOrSlotMap, '0') ||
        Object.hasOwn(inputOrSlotMap, '1') ||
        Object.hasOwn(inputOrSlotMap, '2') ||
        Object.hasOwn(inputOrSlotMap, '3'))
    ) {
      slotSource = inputOrSlotMap;
    }
  }

  const out = new Array(pls.length);
  for (let i = 0; i < pls.length; i++) {
    const p = pls[i];
    const slot = p.slot ?? i;
    const raw = slotSource ? slotSource[slot] : slot === 0 ? inputOrSlotMap : null;
    if (p.downed) {
      out[i] = { moveX: 0, moveY: 0, ultimate: false, interact: false };
    } else if (p.isBot && !hasExplicitInput(raw)) {
      out[i] = computeDaoistBotInput(run, p);
    } else {
      out[i] = cleanSingleInput(raw);
    }
  }
  return out;
}

export function stepCoopAlliesMovement(run, slotInputs, dt) {
  const pls = run?.players;
  if (!pls || pls.length <= 1) return;
  for (let i = 1; i < pls.length; i++) {
    const ally = pls[i];
    if (ally.downed || ally.hp <= 0) {
      if (ally.hp <= 0 && !ally.downed) markPlayerDowned(run, ally);
      ally.vx = 0;
      ally.vy = 0;
      ally.moving = false;
      continue;
    }
    withPlayerContext(run, ally, () => {
      updatePlayer(run, slotInputs[i], dt);
    });
  }
}

export function markPlayerDowned(run, target) {
  if (!target || target.downed) return;
  target.downed = true;
  target.hp = 0;
  target.downedTimer = 0;
  target.reviveProgress = 0;
  target.vx = 0;
  target.vy = 0;
  target.moving = false;
  run.events.push({
    type: 'allyDowned',
    slot: target.slot ?? 0,
    heroId: target.heroId,
    name: target.name,
    x: target.x,
    y: target.y,
  });
}

export function areAllPlayersDowned(run) {
  if (coopPartySize(run) <= 1) {
    return run.player.hp <= 0;
  }
  for (let i = 0; i < run.players.length; i++) {
    const p = run.players[i];
    if (p.hp <= 0 && !p.downed) markPlayerDowned(run, p);
  }
  return run.players.every((p) => p.downed || p.hp <= 0);
}

export function hurtTargetPlayer(run, target, raw) {
  if (!target || coopPartySize(run) <= 1) {
    return hurtPlayer(run, raw);
  }
  if (target.downed || target.hp <= 0) return 0;
  const dealt = withPlayerContext(run, target, () => hurtPlayer(run, raw));
  if (target.hp <= 0 && !target.downed) {
    markPlayerDowned(run, target);
  }
  return dealt;
}

function pushEnemiesAroundSpot(run, x, y, pushR, pushF) {
  const ens = run.enemies;
  for (let i = 0; i < ens.length; i++) {
    const e = ens[i];
    if (e.dead || e.boss) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const rr = pushR + (e.r || 0);
    const d2 = dx * dx + dy * dy;
    if (d2 <= rr * rr) {
      const d = Math.sqrt(d2) || 1;
      knockback(e, d2 > 1e-6 ? dx / d : 1, d2 > 1e-6 ? dy / d : 0, pushF);
      if (e.atkT < 0.20) e.atkT = 0.20;
    }
  }
}

/**
 * 朱砂八卦阵倒地读条救援（REVIVE_RADIUS = 48, REVIVE_SECONDS = 2.4，多人同救线性叠加）。
 */
export function updateCoopRevives(run, dt) {
  if (coopPartySize(run) <= 1) return;
  if (areAllPlayersDowned(run)) return;

  const pls = run.players;
  const r2 = REVIVE_RADIUS * REVIVE_RADIUS;
  for (let i = 0; i < pls.length; i++) {
    const downedP = pls[i];
    if (!downedP.downed) continue;
    downedP.downedTimer = (downedP.downedTimer || 0) + dt;

    const rescuers = [];
    for (let j = 0; j < pls.length; j++) {
      const ally = pls[j];
      if (ally === downedP || ally.downed || ally.hp <= 0) continue;
      const dx = ally.x - downedP.x;
      const dy = ally.y - downedP.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        rescuers.push({ ally, d2 });
      }
    }

    if (rescuers.length > 0) {
      downedP.reviveProgress = Math.min(1, (downedP.reviveProgress || 0) + (rescuers.length * dt) / REVIVE_SECONDS);
      if (downedP.reviveProgress >= 1 - 1e-9) {
        rescuers.sort((a, b) => a.d2 - b.d2 || (a.ally.slot ?? 0) - (b.ally.slot ?? 0));
        const rescuer = rescuers[0].ally;
        rescuer.stats.revivesDone = (rescuer.stats.revivesDone || 0) + 1;
        run.stats.coopRevives = (run.stats.coopRevives || 0) + 1;

        downedP.downed = false;
        downedP.downedTimer = 0;
        downedP.reviveProgress = 0;
        downedP.hp = Math.max(1, Math.ceil(COOP_REVIVE_HP_PCT * downedP.maxHp));
        downedP.invulnT = Math.max(downedP.invulnT || 0, COOP_REVIVE_INVULN);

        pushEnemiesAroundSpot(run, downedP.x, downedP.y, COOP_REVIVE_PUSH_RADIUS, COOP_REVIVE_PUSH_FORCE);
        for (let k = 0; k < run.projectiles.length; k++) {
          const pr = run.projectiles[k];
          if (pr.kind === 'enemyBullet' && !pr.dead) {
            const br = 110 + (pr.r || 0);
            if ((pr.x - downedP.x) ** 2 + (pr.y - downedP.y) ** 2 <= br * br) pr.dead = true;
          }
        }

        run.events.push({
          type: 'coopRevive',
          slot: downedP.slot ?? i,
          rescuerSlot: rescuer.slot ?? 0,
          x: downedP.x,
          y: downedP.y,
        });
        run.events.push({
          type: 'revive',
          source: 'coop',
          slot: downedP.slot ?? i,
          rescuerSlot: rescuer.slot ?? 0,
          x: downedP.x,
          y: downedP.y,
        });
      }
    } else if (downedP.reviveProgress > 0) {
      downedP.reviveProgress = Math.max(0, downedP.reviveProgress - (dt / REVIVE_SECONDS) * 0.35);
    }
  }
}

function pointSegDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  if (l2 < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/**
 * 智能道友 AI：17 方向双前瞻威胁场评估 + 倒地队友最高优先级救援驻留 + 走位风筝 + 自动大招。
 */
export function computeDaoistBotInput(run, bot) {
  if (!bot || bot.downed || bot.hp <= 0) {
    return { moveX: 0, moveY: 0, ultimate: false, interact: false };
  }
  const rt = ensurePlayerRt(run, bot);
  const pls = run.players || [bot];

  // 1. 查找最近的倒地队友（最高优先级救援目标）
  let downedAlly = null;
  let downedDist = Infinity;
  for (let i = 0; i < pls.length; i++) {
    const al = pls[i];
    if (al === bot || !al.downed) continue;
    const d = Math.hypot(al.x - bot.x, al.y - bot.y);
    if (d < downedDist) {
      downedDist = d;
      downedAlly = al;
    }
  }

  // 2. 查找存活队长以保持小队协同阵型
  let leader = null;
  for (let i = 0; i < pls.length; i++) {
    if (pls[i] !== bot && !pls[i].downed && pls[i].hp > 0) {
      leader = pls[i];
      break;
    }
  }

  // 3. 扫描周围敌人与高危弹幕
  const ens = run.enemies;
  let nearestEnemy = null;
  let nearestEnemyD = Infinity;
  let nearbyEnemies = 0;
  let bossNear = false;
  for (let i = 0; i < ens.length; i++) {
    const e = ens[i];
    if (e.dead) continue;
    const d = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (d < 190) nearbyEnemies++;
    if (e.boss && d < 320) bossNear = true;
    if (d < nearestEnemyD) {
      nearestEnemyD = d;
      nearestEnemy = e;
    }
  }

  // 4. 扫描低血包子与近距离魂火/铜钱
  let goalPickup = null;
  let goalPickupWeight = 0;
  const wantBun = bot.hp < bot.maxHp * 0.65;
  for (let i = 0; i < run.pickups.length; i++) {
    const pk = run.pickups[i];
    const d = Math.hypot(pk.x - bot.x, pk.y - bot.y);
    if (wantBun && pk.kind === 'bun' && d < 320) {
      goalPickup = pk;
      goalPickupWeight = 36;
      break;
    }
    if (!goalPickup && (pk.kind === 'xp' || pk.kind === 'coin') && d < 135) {
      goalPickup = pk;
      goalPickupWeight = 8;
    }
  }

  const spd = bot.speed || 100;
  const invuln = (bot.invulnT || 0) > 0.08;
  const revProg = downedAlly ? downedAlly.reviveProgress || 0 : 0;
  let bestDir = BOT_DIRS[0];
  let bestScore = -Infinity;

  for (let di = 0; di < BOT_DIRS.length; di++) {
    const dir = BOT_DIRS[di];
    let score = rt.buildRng.range(-0.02, 0.02);
    const fx1 = bot.x + dir.x * spd * 0.16;
    const fy1 = bot.y + dir.y * spd * 0.16;
    const fx2 = bot.x + dir.x * spd * 0.36;
    const fy2 = bot.y + dir.y * spd * 0.36;

    // 救援最高优先级：奔赴倒地队友并在 <= 44px 八卦阵内驻留至扶起完成
    if (downedAlly) {
      const curD = downedDist;
      const nextD = Math.hypot(fx2 - downedAlly.x, fy2 - downedAlly.y);
      const holdBonus = revProg > 0.35 ? 215 + revProg * 120 : 140;
      const exitPenalty = revProg > 0.35 ? 780 : 520;
      if (curD > REVIVE_RADIUS - 6) {
        score += (curD - nextD) * (revProg > 0.35 ? 6.6 : 5.2);
      } else {
        if (nextD <= REVIVE_RADIUS - 4) {
          score += holdBonus - nextD * 0.5;
        } else {
          score -= exitPenalty;
        }
      }
    } else {
      // 小队聚拢与中距风筝输出
      if (leader) {
        const ld = Math.hypot(fx2 - leader.x, fy2 - leader.y);
        if (ld > 210) score -= (ld - 210) * 0.45;
      }
      if (nearestEnemy) {
        const ed = Math.hypot(fx2 - nearestEnemy.x, fy2 - nearestEnemy.y);
        if (ed > 145) score -= (ed - 145) * 0.22;
        else if (ed < 98) score -= (98 - ed) * 0.55;
      }
      if (goalPickup) {
        const pd0 = Math.hypot(bot.x - goalPickup.x, bot.y - goalPickup.y);
        const pd1 = Math.hypot(fx2 - goalPickup.x, fy2 - goalPickup.y);
        score += ((pd0 - pd1) / Math.max(1, spd * 0.36)) * goalPickupWeight;
      }
    }

    // 威胁规避（若已拥有受击无敌帧且正在救人，忽略普通怪碰撞以稳守八卦阵）
    const ignoreLightHazard = Boolean(downedAlly && invuln);
    if (!ignoreLightHazard) {
      for (let ei = 0; ei < ens.length; ei++) {
        const e = ens[ei];
        if (e.dead) continue;
        const ex = e.x;
        const ey = e.y;
        const safeGap = e.r + bot.r + (e.boss ? 38 : 26);
        const d1 = Math.hypot(fx1 - ex, fy1 - ey);
        if (d1 < safeGap) {
          const mobW = e.boss ? 5.0 : downedAlly ? (revProg > 0.35 && bot.hp > bot.maxHp * 0.28 ? 1.5 : 2.4) : 6.5;
          score -= (safeGap - d1) * mobW;
        }
        if (e.telegraphProgress > 0 && e.telegraphLen > 0) {
          const td = pointSegDist(fx2, fy2, e.x, e.y, e.telegraphX, e.telegraphY);
          const halfW = (e.telegraphWidth || 30) * 0.5 + bot.r + 12;
          if (td < halfW) {
            score -= (halfW - td) * 18;
          }
        }
      }

      const projs = run.projectiles;
      for (let pi = 0; pi < projs.length; pi++) {
        const pr = projs[pi];
        if (pr.dead) continue;
        if (pr.kind === 'enemyBullet') {
          const bx = pr.x + (pr.vx || 0) * 0.20;
          const by = pr.y + (pr.vy || 0) * 0.20;
          const bd = Math.hypot(fx1 - bx, fy1 - by);
          const br = (pr.r || 7) + bot.r + 16;
          if (bd < br) score -= (br - bd) * 9;
        } else if (pr.kind === 'cinderCore') {
          const cd = Math.hypot(fx2 - pr.x, fy2 - pr.y);
          const cr = (pr.radius || 68) + bot.r + 14;
          if (cd < cr) score -= (cr - cd) * 7;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  const ultReadyNow = bot.ult >= (bot.ultMax ?? ULT.cost);
  const wantUlt =
    ultReadyNow &&
    ((downedAlly && nearbyEnemies >= 1) || nearbyEnemies >= 4 || bossNear || bot.hp < bot.maxHp * 0.55);

  return {
    moveX: bestDir.x,
    moveY: bestDir.y,
    ultimate: wantUlt,
    interact: false,
  };
}

/**
 * 队伍共享等级与供盒进度时，为 1..3 号协战队友同步等级并确定性自动构筑百器。
 */
export function syncAlliesOnTeamProgress(run, trigger = 'levelup') {
  if (coopPartySize(run) <= 1) return;
  const p0 = run.players[0];
  for (let i = 1; i < run.players.length; i++) {
    const ally = run.players[i];
    ally.level = p0.level;
    ally.xp = p0.xp;
    ally.xpNext = p0.xpNext;
    const rt = ensurePlayerRt(run, ally);

    withPlayerContext(run, ally, () => {
      if (trigger === 'levelup') {
        const pool = candidateChoices(run);
        if (pool.length > 0) {
          let best = pool[0];
          let bestS = -Infinity;
          for (let k = 0; k < pool.length; k++) {
            const c = pool[k];
            const sig = c.kind === 'weapon' && isHeroSignatureWeapon(ally.heroId, c.id) ? 2.5 : 0;
            const evo = c.evolvable ? 4.0 : 0;
            const sc = c.weight + sig + evo + rt.buildRng.range(0, 0.35);
            if (sc > bestS) {
              bestS = sc;
              best = c;
            }
          }
          applyChoice(run, best);
        } else {
          recomputeMods(run, { emit: false });
        }
      } else if (trigger === 'chest') {
        const prevRng = run.rng;
        run.rng = rt.buildRng;
        try {
          resolveChest(run, null);
        } finally {
          run.rng = prevRng;
        }
      } else {
        recomputeMods(run, { emit: false });
      }
    });
  }
}

/**
 * 生成结算页小队贡献榜（squad）并按确定性规则评选唯一 MVP 印章得主。
 */
export function buildSquadSummary(run) {
  const pls =
    Array.isArray(run?.players) && run.players.length > 0
      ? run.players.filter(Boolean)
      : run?.player && typeof run.player === 'object'
        ? [run.player]
        : [];
  const isSolo = pls.length === 1;
  const squad = pls.map((p, idx) => {
    const slot = p.slot ?? idx;
    const rawDmg = Number.isFinite(p.stats?.damageDealt) && p.stats.damageDealt > 0 ? Math.floor(p.stats.damageDealt) : 0;
    const rawKills = Number.isFinite(p.stats?.kills) && p.stats.kills > 0 ? Math.floor(p.stats.kills) : 0;
    const revivesDone = Number.isFinite(p.stats?.revivesDone) && p.stats.revivesDone > 0 ? Math.floor(p.stats.revivesDone) : 0;
    const damageDealt =
      slot === 0 && isSolo
        ? Math.max(rawDmg, Number.isFinite(run.stats?.damageDealt) && run.stats.damageDealt > 0 ? Math.floor(run.stats.damageDealt) : 0)
        : rawDmg;
    const kills =
      slot === 0 && isSolo
        ? Math.max(rawKills, Number.isFinite(run.stats?.kills) && run.stats.kills > 0 ? Math.floor(run.stats.kills) : 0)
        : rawKills;
    const pHero =
      typeof p.heroId === 'string' && Object.hasOwn(HEROES, p.heroId)
        ? p.heroId
        : typeof run?.heroId === 'string' && Object.hasOwn(HEROES, run.heroId)
          ? run.heroId
          : 'zhou';
    return {
      slot,
      peerId: (typeof p.peerId === 'string' && p.peerId) || (slot === 0 ? 'local' : `peer_${slot}`),
      name: (typeof p.name === 'string' && p.name) || HEROES[pHero].short || '守夜人',
      heroId: pHero,
      skinId: p.skinId ?? null,
      damageDealt,
      kills,
      revivesDone,
      mvp: false,
    };
  });

  if (squad.length > 0) {
    let bestIdx = 0;
    const metric = (m) => m.damageDealt + m.kills * 45 + m.revivesDone * 600;
    for (let i = 1; i < squad.length; i++) {
      const a = squad[i];
      const b = squad[bestIdx];
      const ma = metric(a);
      const mb = metric(b);
      if (
        ma > mb ||
        (ma === mb &&
          (a.damageDealt > b.damageDealt ||
            (a.damageDealt === b.damageDealt &&
              (a.kills > b.kills ||
                (a.kills === b.kills && (a.revivesDone > b.revivesDone || (a.revivesDone === b.revivesDone && a.slot < b.slot)))))))
      ) {
        bestIdx = i;
      }
    }
    squad[bestIdx].mvp = true;
  }

  return squad;
}
