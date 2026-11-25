// 玩家：创建、属性汇总（法器 + 羁绊 + 命签 + 英雄 + 更房）、移动、受伤（含无敌帧与震退脉冲）与治疗。

import { PLAYER_BASE, HEROES, WEAPONS, ULT, DAMAGE, xpForLevel, cooldownMul, damageTaken } from './balance.js';
import { relicTotals } from './relics.js';
import { syncSynergies, synergyStatMods } from './synergies.js';
import { computeBlessingMods, BLESSING_TUNING } from './blessings.js';
import { clamp } from '../core/math.js';

export function createPlayer(heroId, extra = {}) {
  const safeExtra = extra && typeof extra === 'object' ? extra : {};
  const validHero = typeof heroId === 'string' && Object.hasOwn(HEROES, heroId) ? heroId : 'zhou';
  const validStartWeapon =
    typeof safeExtra.startWeapon === 'string' && Object.hasOwn(WEAPONS, safeExtra.startWeapon)
      ? safeExtra.startWeapon
      : HEROES[validHero].startWeapon;
  return {
    slot: safeExtra.slot ?? 0,
    peerId: safeExtra.peerId ?? 'local',
    name: (typeof safeExtra.name === 'string' && safeExtra.name) || HEROES[validHero].short,
    heroId: validHero,
    startWeapon: validStartWeapon,
    skinId: safeExtra.skinId ?? null,
    attackVfx: safeExtra.attackVfx ?? null,
    isBot: !!safeExtra.isBot,
    x: safeExtra.x ?? 0,
    y: safeExtra.y ?? 0,
    vx: 0,
    vy: 0,
    r: PLAYER_BASE.r,
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    armor: PLAYER_BASE.armor,
    speed: PLAYER_BASE.speed,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    facingX: 0,
    facingY: -1,
    moving: false,
    ult: 0,
    ultMax: ULT.max,
    invulnT: 0,
    hurtT: 0,
    soulBarrier: 0,
    soulBarrierMax: 0,
    downed: false,
    downedTimer: 0,
    reviveProgress: 0,
    weapons: Array.isArray(safeExtra.weapons) ? safeExtra.weapons : [],
    relics: Array.isArray(safeExtra.relics) ? safeExtra.relics : [],
    stats: {
      damageDealt: 0,
      kills: 0,
      revivesDone: 0,
    },
  };
}

/** 局内获得铜钱（支持五帝钱小额累加加成，并记录 coinsEarned） */
export function earnCoins(run, amount, applyRelicBonus = false) {
  if (!run || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
  amount = Math.min(amount, 1e9);
  let gain;
  const bonusPct = applyRelicBonus ? (run.mods?.relicCoinPct || 0) : 0;
  if (bonusPct > 0) {
    const scaled = amount * (1 + bonusPct);
    if (!Number.isFinite(scaled)) return 0;
    const prevFrac = Number.isFinite(run._coinFrac) ? run._coinFrac : 0;
    run._coinFrac = prevFrac + scaled;
    gain = Math.min(1e9, Math.floor(run._coinFrac + 1e-9));
    run._coinFrac = Math.max(0, run._coinFrac - gain);
  } else {
    gain = Math.min(1e9, Math.max(0, Math.round(amount)));
  }
  run.stats.coins = Math.min(1e9, (Number.isFinite(run.stats.coins) ? run.stats.coins : 0) + gain);
  run.coinsEarned = Math.min(1e9, (Number.isFinite(run.coinsEarned) ? run.coinsEarned : 0) + gain);
  return gain;
}

/** 局内消费铜钱（鬼市货郎用，绝不扣成负数） */
export function spendCoins(run, cost) {
  if (!run || typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return false;
  const c = Math.round(cost);
  if (!(run.stats.coins >= c)) return false;
  run.stats.coins -= c;
  run.coinsSpent = (run.coinsSpent || 0) + c;
  return true;
}

/**
 * 重新计算派生属性 run.mods，并同步到 player 上的公开字段。
 * 增伤%（朱砂、剪刀、更房、命签）加算；开光倍率和溢出签在伤害结算时乘算。
 */
export function recomputeMods(run, opts = {}) {
  const rel = relicTotals(run.relics);
  const synRes = syncSynergies(run, { emit: opts.emit !== undefined ? opts.emit : !run._initializing });
  const syn = synergyStatMods(synRes);
  const bl = computeBlessingMods(run);
  const activeHeroId = run.player?.heroId || run.heroId;
  const hero = (typeof activeHeroId === 'string' && Object.hasOwn(HEROES, activeHeroId) ? HEROES[activeHeroId]?.mods : null) || {};
  const meta = run.meta;
  const prevMax = run.player.maxHp;
  const overflowMult = run.mods ? run.mods.overflowMult : 1;
  const overflowStacks = run.mods ? run.mods.overflowStacks : 0;

  const lanternEvo = run.weapons.some((w) => w.id === 'lantern' && w.evolved);
  const frenzyActive = (run._ultFrenzyT || 0) > 0;
  const summonFrenzyActive = (run._summonFrenzyT || 0) > 0;
  const nuoDanceActive = (run._nuoDanceT || 0) > 0;

  const cooldownFloor = Math.min(DAMAGE.cooldownFloor, syn.cooldownFloor, bl.cooldownFloor);
  const cdr = rel.cdr + (hero.cdr || 0) + syn.cdr + bl.cdr;
  let cdMul = cooldownMul(cdr, cooldownFloor);
  if (frenzyActive && bl.thunderDecreeStacks > 0) {
    cdMul = Math.max(BLESSING_TUNING.thunder_decree.frenzyCdFloor, cdMul * BLESSING_TUNING.thunder_decree.frenzyCdMul);
  }
  if (nuoDanceActive) {
    cdMul = Math.max(0.46, cdMul * ULT.nuoxi.danceCdMul);
  }

  const rr = run.runRules || null;
  const lightMul = (1 + rel.lightPct + (lanternEvo ? WEAPONS.lantern.evo.lightBonusPct : 0)) * syn.lightMul * bl.lightMul * (rr ? rr.lightMul : 1);
  const lightRadius = Math.round(118 * lightMul);
  const critMult =
    PLAYER_BASE.critMult +
    rel.critDmg +
    syn.critMultBonus +
    bl.critMultBonus +
    (rr ? rr.critDmg : 0) +
    (frenzyActive ? BLESSING_TUNING.thunder_decree.frenzyCritDmg * bl.thunderDecreeStacks : 0);

  const cdrTotal = rel.cdr + (hero.cdr || 0) + syn.cdr + bl.cdr + (rr ? rr.cdr : 0);
  let cdMulFinal = cooldownMul(cdrTotal, cooldownFloor);
  if (frenzyActive && bl.thunderDecreeStacks > 0) {
    cdMulFinal = Math.max(BLESSING_TUNING.thunder_decree.frenzyCdFloor, cdMulFinal * BLESSING_TUNING.thunder_decree.frenzyCdMul);
  }
  if (nuoDanceActive) {
    cdMulFinal = Math.max(0.46, cdMulFinal * ULT.nuoxi.danceCdMul);
  }

  const mods = {
    dmgPct: rel.dmgPct + (hero.dmgPct || 0) + (meta.dmgPct || 0) + bl.dmgPct + (rr ? rr.dmgPct : 0),
    summonDmgPct: (hero.summonDmgPct || 0) + syn.summonDmgPct,
    zhizhaDmgPct: syn.zhizhaDmgPct,
    summonHasteMul: syn.summonHasteMul * (summonFrenzyActive ? ULT.mian.frenzyMul : 1),
    cdr: cdrTotal,
    cooldownFloor,
    cdMul: cdMulFinal,
    areaMul: Math.max(0.4, 1 + rel.areaPct + (hero.areaPct || 0) + syn.areaPct + bl.areaPct + (rr ? rr.areaPct : 0)),
    durMul: Math.max(0.4, 1 + rel.durPct + (hero.durPct || 0) + syn.durPct),
    amount: rel.amount + syn.amount + bl.amount + (rr ? rr.amount : 0),
    bonusPierce: (rel.bonusPierce || 0) + syn.bonusPierce,
    critChance: PLAYER_BASE.critChance + rel.critChance + (hero.critChance || 0) + syn.critChance + bl.critChance + (rr ? rr.critChance : 0),
    critMult,
    xpMul: (1 + rel.xpPct + (meta.xpPct || 0) + bl.xpPct) * run.night.xpMul * (rr ? rr.xpMul : 1),
    pickupRange: PLAYER_BASE.pickupRange * (1 + rel.pickupPct + (meta.pickupPct || 0) + bl.pickupPct + (rr ? rr.pickupPct : 0)),
    ultChargeMul: 1 + (hero.ultChargePct || 0) + rel.ultChargePct + (rr ? rr.ultChargePct : 0),
    ultCdRefund: rel.ultCdRefund,
    lightMul,
    lightRadius,
    hurtInvuln: PLAYER_BASE.hurtInvuln + rel.hurtInvuln + bl.bonusHurtInvuln,
    killHeal: rel.killHeal,
    slowResist: clamp(rel.slowResist, 0, 0.9),
    relicCoinPct: rel.coinPct,
    coinDropMul: bl.coinDropMul * (rr ? rr.coinDropMul : 1),
    spawnRateMul: bl.spawnRateMul * (rr ? rr.spawnRateMul : 1),
    eliteChanceMul: bl.eliteChanceMul * (rr ? rr.eliteChanceMul : 1),
    knockbackMul: syn.knockbackMul * bl.knockbackMul,
    controlDurMul: syn.controlDurMul * (1 + (rel.controlDurPct || 0)),
    takenDmgMul: bl.takenDmgMul,
    bunHealMul: bl.bunHealMul,
    hpRegen: bl.hpRegen,
    hpDrain: bl.hpDrain,
    evoMultBonus: bl.evoMultBonus,
    killBlastChance: bl.killBlastChance,
    zhenhun4: syn.zhenhun4,
    zhenhun6: syn.zhenhun6,
    daofa4: syn.daofa4,
    zhizha4: syn.zhizha4,
    zhizha6: syn.zhizha6,
    yangyan4: syn.yangyan4,
    yangyan6: syn.yangyan6,
    cinnabarInkStacks: bl.cinnabarInkStacks,
    lanternOilStacks: bl.lanternOilStacks,
    watchmanStepStacks: bl.watchmanStepStacks,
    thunderDecreeStacks: bl.thunderDecreeStacks,
    soulGourdStacks: bl.soulGourdStacks,
    ghostCoinStacks: bl.ghostCoinStacks,
    morningDewStacks: bl.morningDewStacks,
    executionerStacks: bl.executionerStacks,
    paperSoul: bl.paperSoul,
    hungryGhost: bl.hungryGhost,
    overflowMult,
    overflowStacks,
  };
  run.mods = mods;

  const p = run.player;
  if ((p.slot ?? 0) === 0) {
    p.weapons = run.weapons;
    p.relics = run.relics;
  }
  p.armor = bl.zeroArmor ? 0 : PLAYER_BASE.armor + rel.armor + (hero.armor || 0) + (meta.armor || 0) + syn.bonusArmor + bl.bonusArmor;
  const rawMaxHp = (PLAYER_BASE.maxHp + rel.maxHp + bl.bonusMaxHp) * (1 + (meta.maxHpPct || 0) + (hero.maxHpPct || 0)) * bl.maxHpMul * (rr ? rr.maxHpMul : 1);
  p.maxHp = Math.max(10, Math.round(rawMaxHp));
  p.speed = Math.max(
    40,
    PLAYER_BASE.speed * (1 + rel.speedPct + (hero.speedPct || 0) + (meta.speedPct || 0) + bl.speedPct) * (nuoDanceActive ? ULT.nuoxi.danceSpeedMul : 1) * (rr ? rr.playerSpeedMul : 1),
  );

  const sb = run.weapons.find((w) => w.id === 'soulbanner');
  p.soulBarrierMax = sb ? (sb.evolved ? WEAPONS.soulbanner.evo.shieldMax : WEAPONS.soulbanner.shieldMax) : 0;
  if (p.soulBarrier > p.soulBarrierMax) p.soulBarrier = p.soulBarrierMax;

  if (p.downed) {
    p.hp = 0;
  } else {
    // 最大生命提升时，当前生命同步增加相同数值
    if (p.maxHp > prevMax) p.hp += p.maxHp - prevMax;
    p.hp = Math.min(p.hp, p.maxHp);
    if (bl.maxHpMul < 1 && prevMax > p.maxHp && p.hp <= 0) p.hp = 1;
  }
  return mods;
}

/** 移动：input.moveX/moveY 已归一化（长度 ≤ 1） */
export function updatePlayer(run, input, dt) {
  if (!run || !run.player) return;
  dt = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
  const p = run.player;
  const rawMx = input != null && typeof input.moveX !== 'boolean' ? +input.moveX : 0;
  const rawMy = input != null && typeof input.moveY !== 'boolean' ? +input.moveY : 0;
  let mx = Number.isFinite(rawMx) ? rawMx || 0 : 0;
  let my = Number.isFinite(rawMy) ? rawMy || 0 : 0;
  let l = Math.hypot(mx, my);
  if (l > 1) {
    if (!Number.isFinite(l)) {
      const sx = Math.sign(mx);
      const sy = Math.sign(my);
      const norm = sx !== 0 && sy !== 0 ? Math.SQRT1_2 : 1;
      mx = (sx * norm) || 0;
      my = (sy * norm) || 0;
      l = 1;
    } else {
      mx /= l;
      my /= l;
    }
  }
  p.moving = l > 0.05;
  if (p.moving) {
    const inv = 1 / Math.max(l, 1e-6);
    p.facingX = mx * inv;
    p.facingY = my * inv;
  }

  const rawSlow = run._auraSlow ?? 1;
  const resist = clamp(run.mods?.slowResist || 0, 0, 0.9);
  const effSlow = rawSlow < 1 ? 1 - (1 - rawSlow) * (1 - resist) : rawSlow;
  const spd = p.speed * effSlow;
  const dx = mx * spd * dt;
  const dy = my * spd * dt;
  p.vx = dt > 0 ? dx / dt : 0;
  p.vy = dt > 0 ? dy / dt : 0;
  p.x += dx;
  p.y += dy;

  if (p.moving && (run.mods?.watchmanStepStacks || 0) > 0) {
    const stepDist = BLESSING_TUNING.watchman_step.stepDist;
    const ultGain = BLESSING_TUNING.watchman_step.ultGain * run.mods.watchmanStepStacks * run.mods.ultChargeMul;
    const prevDist = Number.isFinite(run._stepChargeDist) && run._stepChargeDist > 0 ? run._stepChargeDist : 0;
    const totalDist = prevDist + Math.hypot(dx, dy);
    if (Number.isFinite(totalDist) && stepDist > 0 && totalDist >= stepDist) {
      const triggers = Math.floor(totalDist / stepDist);
      run._stepChargeDist = totalDist - triggers * stepDist;
      p.ult = Math.min(p.ultMax, p.ult + triggers * ultGain);
    } else {
      run._stepChargeDist = Number.isFinite(totalDist) ? totalDist : 0;
    }
  }

  if (run.mods?.hpRegen > 0 && p.hp > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + run.mods.hpRegen * dt);
  }
  if (run.mods?.hpDrain > 0 && p.hp > 1) {
    p.hp = Math.max(1, p.hp - run.mods.hpDrain * dt);
  }

  if (run._ultFrenzyT > 0) {
    run._ultFrenzyT = Math.max(0, run._ultFrenzyT - dt);
    if (run._ultFrenzyT === 0) recomputeMods(run);
  }
  if (run._summonFrenzyT > 0) {
    run._summonFrenzyT = Math.max(0, run._summonFrenzyT - dt);
    if (run._summonFrenzyT === 0) recomputeMods(run);
  }
  if (run._nuoDanceT > 0) {
    run._nuoDanceT = Math.max(0, run._nuoDanceT - dt);
    if (run._nuoDanceT === 0) recomputeMods(run);
  }

  if (p.invulnT > 0) p.invulnT = Math.max(0, p.invulnT - dt);
  if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt);
}

/** 受击护体震退脉冲：直接遍历 run.enemies，零 scratch 冲突且单元测试免依赖 hash */
export function pushEnemiesFromPlayer(run, pushR, pushF) {
  const p = run.player;
  const ens = run.enemies;
  for (let i = 0; i < ens.length; i++) {
    const e = ens[i];
    if (e.dead || e.boss) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = pushR + (e.r || 0);
    const d2 = dx * dx + dy * dy;
    if (d2 <= rr * rr) {
      const d = Math.sqrt(d2);
      const nx = d > 1e-4 ? dx / d : e.id & 1 ? 1 : -1;
      const ny = d > 1e-4 ? dy / d : 0;
      const falloff = 1 - 0.45 * Math.min(1, d / Math.max(1, rr));
      const resist = e.kbResist ? 1 - e.kbResist : 1;
      e.kbx += nx * pushF * falloff * resist;
      e.kby += ny * pushF * falloff * resist;
      if (e.atkT < 0.16) e.atkT = 0.16;
    }
  }
}

/** 玩家受伤：max(1, 原始 − 护甲)；触发受击无敌帧与护体震退脉冲；返回实际伤害 */
export function hurtPlayer(run, raw) {
  if (!run || !run.player || typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  raw = Math.min(raw, 1e9);
  const p = run.player;
  if (p.invulnT > 0 || !(p.hp > 0)) return 0;

  // 招魂幡护体魂障：免疫本次受击并震退近身邪祟
  if (p.soulBarrier > 0) {
    p.soulBarrier--;
    p.invulnT = Math.max(p.invulnT, 0.45);
    pushEnemiesFromPlayer(run, PLAYER_BASE.hurtPushRadius, PLAYER_BASE.hurtPushForce);
    run.events.push({ type: 'shieldBlock', x: p.x, y: p.y, remaining: p.soulBarrier });
    return 0;
  }

  const effRaw = raw * (run.mods?.takenDmgMul || 1);
  const dmg = damageTaken(effRaw, p.armor);

  // 借纸还魂命签：致命伤时纸人替死一次并回半血
  if (p.hp - dmg <= 0 && run.mods?.paperSoul && !run._paperSoulUsed) {
    run._paperSoulUsed = true;
    p.hp = Math.max(1, Math.ceil(p.maxHp * BLESSING_TUNING.paper_soul.reviveHpPct));
    p.invulnT = Math.max(p.invulnT, BLESSING_TUNING.paper_soul.reviveInvuln);
    p.hurtT = PLAYER_BASE.hurtFlash;
    for (const pr of run.projectiles) if (pr.kind === 'enemyBullet') pr.dead = true;
    pushEnemiesFromPlayer(run, 160, 320);
    run.events.push({ type: 'revive', source: 'paper_soul', x: p.x, y: p.y });
    return 0;
  }

  p.hp = Math.max(0, p.hp - dmg);
  if (dmg > 0) {
    const hurtInvuln = run.mods?.hurtInvuln ?? PLAYER_BASE.hurtInvuln;
    p.invulnT = Math.max(p.invulnT, hurtInvuln);
    if (p.hp > 0 || (run.players?.length || 1) <= 1) {
      pushEnemiesFromPlayer(run, PLAYER_BASE.hurtPushRadius, PLAYER_BASE.hurtPushForce);
    }
  }
  p.hurtT = PLAYER_BASE.hurtFlash;
  run.events.push({ type: 'playerHurt', amount: dmg, x: p.x, y: p.y });
  run._tele.taken = Math.min(Number.MAX_SAFE_INTEGER, (run._tele.taken || 0) + dmg);
  return dmg;
}

export function healPlayer(run, amount) {
  if (!run || !run.player || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
  const p = run.player;
  if (p.downed) return 0;
  amount = Math.min(amount, 1e9);
  const before = p.hp;
  p.hp = clamp(p.hp + amount, 0, p.maxHp);
  return p.hp - before;
}
