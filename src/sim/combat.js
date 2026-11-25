// 战斗结算：对敌人造成伤害、击杀处理（掉落、分裂、阴火自爆、阳炎爆裂、Boss 结算）、可重入范围伤害。
// 伤害公式（PLAN §4.2）：D = B × (1 + Σ增伤%) × 状态易伤 × Crit × 溢出签

import {
  PLAYER_BASE, DAMAGE, ULT, PICKUPS, ENEMIES, ENEMY_AI, BOSS_AI, ELITE, ELITE_AFFIXES, WEAPONS, RELICS,
  enemyDmgScale, designMinutes,
} from './balance.js';
import { fsin, fcos } from '../core/math.js';
import { dropXp, dropPickup } from './pickups.js';
import { queueSpawn, currentHpScale } from './enemies.js';
import { onBossKilled } from './bosses.js';
import { hitPropsCircle } from './props.js';
import { healPlayer } from './player.js';
import { BLESSING_TUNING } from './blessings.js';
import { SYNERGY_TUNING } from './synergies.js';
import { coopPartySize } from './coop.js';

function pushHitEvent(run, x, y, amount, crit, enemyId, weaponId) {
  const sys = run._sys;
  if (sys && sys.hitPool) {
    const idx = sys.hitPoolIdx++;
    let ev = sys.hitPool[idx];
    if (!ev) {
      ev = { type: 'hit', x, y, amount, crit, enemyId, weaponId };
      sys.hitPool[idx] = ev;
    } else {
      ev.x = x;
      ev.y = y;
      ev.amount = amount;
      ev.crit = crit;
      ev.enemyId = enemyId;
      ev.weaponId = weaponId;
    }
    run.events.push(ev);
  } else {
    run.events.push({ type: 'hit', x, y, amount, crit, enemyId, weaponId });
  }
}

/** 击退：沿 (dx,dy) 方向施加速度（Boss 几乎免疫，纸甲减免正向击退，限速防飞出） */
export function knockback(e, dx, dy, force) {
  if (!e || typeof force !== 'number' || typeof dx !== 'number' || typeof dy !== 'number') return;
  if (!force || !Number.isFinite(force) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const l2 = dx * dx + dy * dy;
  let nx = 1;
  let ny = 0;
  if (l2 > 1e-8) {
    if (Number.isFinite(l2)) {
      const invL = 1 / Math.sqrt(l2);
      nx = dx * invL;
      ny = dy * invL;
    } else {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const sdx = dx / m;
      const sdy = dy / m;
      const sl = Math.hypot(sdx, sdy);
      nx = sdx / sl;
      ny = sdy / sl;
    }
  }
  const maxS = ENEMY_AI.maxKnockbackSpeed;
  const bossMul = e.boss ? BOSS_AI.knockbackMul : 1;
  const resist = !e.boss && e.kbResist && force > 0 ? 1 - e.kbResist : 1;
  let effForce = Math.max(-maxS * 20, Math.min(maxS * 20, force));
  if (!e.boss && force > 0 && force < 170) {
    if (e.kbx * e.kbx + e.kby * e.kby > 75 * 75) effForce *= 0.25;
  }
  const k = bossMul * resist * effForce;
  e.kbx += nx * k;
  e.kby += ny * k;
  const spd2 = e.kbx * e.kbx + e.kby * e.kby;
  if (spd2 > maxS * maxS) {
    if (e.kby === 0) {
      e.kbx = e.kbx > 0 ? maxS : -maxS;
    } else if (e.kbx === 0) {
      e.kby = e.kby > 0 ? maxS : -maxS;
    } else {
      const s = maxS / Math.sqrt(spd2);
      e.kbx *= s;
      e.kby *= s;
    }
  }
}

export function applyStun(run, e, dur) {
  if (!run || !e || e.boss || typeof dur !== 'number' || !Number.isFinite(dur) || !(dur > 0)) return;
  const d = Math.min(dur, 3600) * (run.mods?.controlDurMul || 1);
  e.stunT = Math.max(e.stunT, d);
  if (run.mods?.zhenhun4) e.vulnT = Math.max(e.vulnT || 0, SYNERGY_TUNING.zhenhun4.vulnSec);
}

export function applySlow(run, e, dur) {
  if (!run || !e || typeof dur !== 'number' || !Number.isFinite(dur) || !(dur > 0)) return;
  let d = Math.min(dur, 3600) * (run.mods?.controlDurMul || 1);
  if (e.affix === 'swift_step') d *= ELITE_AFFIXES.swift_step.slowMul;
  e.slowT = Math.max(e.slowT, d);
  if (run.mods?.zhenhun4) e.vulnT = Math.max(e.vulnT || 0, SYNERGY_TUNING.zhenhun4.vulnSec);
}

export function applyVuln(e, dur, pct = 0.25) {
  if (!e || typeof dur !== 'number' || !Number.isFinite(dur) || !(dur > 0)) return;
  const safeDur = Math.min(dur, 3600);
  const safePct = typeof pct === 'number' && Number.isFinite(pct) && pct > 0 ? Math.min(pct, 10) : 0.25;
  e.vulnT = Math.max(e.vulnT || 0, safeDur);
  e.vulnPct = Math.max(e.vulnPct || 0, safePct);
}

/**
 * 对单个敌人造成伤害；返回实际伤害（整数）。
 * opts.noCrit：不判定暴击
 * opts.noProc：不触发暴击天雷/溅射等二次衍生效果（防递归）
 * opts.direct：环境/自爆真实倍算伤害（不吃玩家面板，不记入 maxHit）
 * opts.armorBreak：无视伞女撑伞减伤与精英纸甲
 * opts.knock / opts.originX / opts.originY：自定义击退力度与震源
 */
export function damageEnemy(run, e, raw, weaponId, opts) {
  if (!run || !e || e.dead || typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  raw = Math.min(raw, 1e9);

  if (opts && (opts.vuln > 0 || opts.vulnT > 0)) {
    applyVuln(e, opts.vuln || opts.vulnT, opts.vulnPct || 0.25);
  }

  // 环境伤害（如阴火骷髅自爆波及同类）：不吃玩家增伤与暴击，不污染 maxHit
  if (opts && opts.direct) {
    let dmg = raw;
    if (e.type === 'umbrella' && e.state === 'shield' && !opts.armorBreak) {
      dmg *= 1 - BOSS_AI.umbrella.shieldDr;
    }
    if (e.type === 'hebo_wedding' && e.wardShieldActive && !opts.armorBreak) {
      dmg *= 1 - BOSS_AI.hebo_wedding.wardShieldDr;
    }
    if (e.type === 'water_lurker' && e.submerged && !opts.armorBreak) {
      dmg *= 1 - ENEMY_AI.water_lurker.submergeDr;
    }
    if (e.paperArmor > 0 && !(e.vulnT > 0) && !opts.armorBreak) {
      dmg *= 1 - ELITE_AFFIXES.paper_armor.dmgReduce;
      e.paperArmor--;
    }
    dmg = Math.min(1e9, Math.max(1, Math.round(dmg)));
    e.hp -= dmg;
    e.hitT = DAMAGE.hitFlash;
    run._tele.dmg = Math.min(Number.MAX_SAFE_INTEGER, run._tele.dmg + dmg);
    if (!e.boss) run._tele.dmgNonBoss = Math.min(Number.MAX_SAFE_INTEGER, run._tele.dmgNonBoss + dmg);
    if (opts.knock && e.hp > 0) {
      const kdx = opts.knockDx !== undefined ? opts.knockDx : e.x - (opts.originX ?? run.player.x);
      const kdy = opts.knockDy !== undefined ? opts.knockDy : e.y - (opts.originY ?? run.player.y);
      knockback(e, kdx, kdy, opts.knock);
    }
    pushHitEvent(run, e.x, e.y, dmg, false, e.id, weaponId);
    if (e.hp <= 0) killEnemy(run, e, opts);
    return dmg;
  }

  const m = run.mods;
  const wTags = typeof weaponId === 'string' && Object.hasOwn(WEAPONS, weaponId) ? WEAPONS[weaponId].tags || null : null;
  const isSummon = weaponId === 'paperman' || weaponId === 'paperhorse' || weaponId === 'zhinian_kite' || !!(opts && opts.isSummon);
  let summonAdd = isSummon ? m.summonDmgPct : 0;
  if (!isSummon && wTags && wTags.includes('zhizha')) {
    summonAdd += m.zhizhaDmgPct || 0;
  }

  let condDmgPct = 0;
  if (m.ghostCoinStacks > 0) {
    const GC = BLESSING_TUNING.ghost_coin;
    condDmgPct += Math.min(
      GC.dmgCap * m.ghostCoinStacks,
      Math.floor(Math.max(0, run.stats.coins) / GC.perCoins) * GC.dmgPerStep * m.ghostCoinStacks,
    );
  }
  if (m.morningDewStacks > 0 && run.player.hp >= run.player.maxHp - 0.5) {
    condDmgPct += BLESSING_TUNING.morning_dew.fullHpDmgPct * m.morningDewStacks;
  }

  let dmg = raw * (1 + m.dmgPct + summonAdd + condDmgPct) * m.overflowMult;

  // 目标状态乘算易伤
  if (e.vulnT > 0) {
    if (e.vulnPct > 0) dmg *= 1 + e.vulnPct;
    else if (!m.zhenhun4) dmg *= 1.25;
  }
  if (m.zhenhun4 && (e.stunT > 0 || e.slowT > 0 || e.vulnT > 0)) {
    dmg *= SYNERGY_TUNING.zhenhun4.vulnDmgMul;
  }
  if (m.zhizha6 && e.bleedT > 0) {
    dmg *= SYNERGY_TUNING.zhizha6.bleedVulnMul;
  }
  if (m.yangyan6 && (e.burnT > 0 || e.yangyanMarkT > 0)) {
    dmg *= SYNERGY_TUNING.yangyan6.burnDmgMul;
  }
  if (m.executionerStacks > 0) {
    const EB = BLESSING_TUNING.executioner_blade;
    if (e.boss) dmg *= 1 + EB.bossBonus * m.executionerStacks;
    else if (e.hp <= e.maxHp * EB.lowHpRatio) dmg *= 1 + EB.executeBonus * m.executionerStacks;
  }

  const crit = !(opts && opts.noCrit) && run.rng.next() < m.critChance;
  if (crit) dmg *= m.critMult ?? PLAYER_BASE.critMult;

  // 无面伞女撑伞减伤、河神夜婚万灯护盾、沉水鬼潜行减伤 & 精英纸甲（破甲攻击可贯穿）
  const armorBreak = !!(opts && opts.armorBreak);
  if (e.type === 'umbrella' && e.state === 'shield' && !armorBreak) {
    dmg *= 1 - BOSS_AI.umbrella.shieldDr;
  }
  if (e.type === 'hebo_wedding' && e.wardShieldActive && !armorBreak) {
    dmg *= 1 - BOSS_AI.hebo_wedding.wardShieldDr;
  }
  if (e.type === 'water_lurker' && e.submerged && !armorBreak) {
    dmg *= 1 - ENEMY_AI.water_lurker.submergeDr;
  }
  if (e.paperArmor > 0 && !(e.vulnT > 0) && !armorBreak) {
    dmg *= 1 - ELITE_AFFIXES.paper_armor.dmgReduce;
    e.paperArmor--;
  }
  if (armorBreak && e.paperArmor > 0) {
    e.paperArmor = 0;
  }

  dmg = Number.isFinite(dmg) ? Math.min(1e9, Math.max(1, Math.round(dmg))) : 1e9;
  e.hp -= dmg;
  e.hitT = DAMAGE.hitFlash;

  const st = run.stats;
  st.damageDealt = Math.min(Number.MAX_SAFE_INTEGER, st.damageDealt + dmg);
  if (typeof weaponId === 'string' && weaponId) {
    if (!st.damageByWeapon || typeof st.damageByWeapon !== 'object') st.damageByWeapon = {};
    st.damageByWeapon[weaponId] = Math.min(Number.MAX_SAFE_INTEGER, (st.damageByWeapon[weaponId] || 0) + dmg);
  }
  if (run.player?.stats) {
    run.player.stats.damageDealt = Math.min(Number.MAX_SAFE_INTEGER, (run.player.stats.damageDealt || 0) + dmg);
  }
  if (dmg > st.maxHit) st.maxHit = dmg;
  run._tele.dmg = Math.min(Number.MAX_SAFE_INTEGER, run._tele.dmg + dmg);
  if (!e.boss) run._tele.dmgNonBoss = Math.min(Number.MAX_SAFE_INTEGER, run._tele.dmgNonBoss + dmg);

  // 存活敌人的受击硬直击退、词缀分身与流派持续异常
  if (e.hp > 0) {
    const baseKnock = opts && opts.knock !== undefined ? opts.knock : WEAPONS[weaponId]?.knockback || 0;
    if (baseKnock !== 0) {
      const kdx = opts && opts.knockDx !== undefined ? opts.knockDx : e.x - (opts?.originX ?? run.player.x);
      const kdy = opts && opts.knockDy !== undefined ? opts.knockDy : e.y - (opts?.originY ?? run.player.y);
      const critK = crit && baseKnock > 0 ? DAMAGE.critKnockMul : 1;
      const schoolK = baseKnock > 0 ? (m.knockbackMul || 1) : 1;
      knockback(e, kdx, kdy, baseKnock * critK * schoolK);
    }

    if (e.affix === 'mirror_twin' && !e._mirrored && e.hp <= e.maxHp * ELITE_AFFIXES.mirror_twin.splitAtHpRatio) {
      e._mirrored = true;
      const mt = ELITE_AFFIXES.mirror_twin;
      const a = run.rng.range(0, Math.PI * 2);
      const ca = fcos(a);
      const sa = fsin(a);
      queueSpawn(run, e.type, e.x + ca * mt.twinOffset, e.y + sa * mt.twinOffset, {
        elite: true,
        affix: null,
        mirrorClone: true,
        fixedHp: Math.max(1, Math.round(e.maxHp * mt.twinHpRatio)),
        atkT: 0.35,
        kbx: ca * 110,
        kby: sa * 110,
      });
    }

    if (!(opts && opts.noProc) && wTags) {
      if (m.zhizha6 && wTags.includes('zhizha')) {
        e.bleedT = SYNERGY_TUNING.zhizha6.bleedSec;
        e.bleedDps = Math.max(e.bleedDps || 0, raw * 0.35);
        e.bleedSlot = run._activeSlot || 0;
        if (!(e._bleedTick > 0)) e._bleedTick = 0.5;
      }
      if (m.yangyan4 && wTags.includes('yangyan')) {
        e.burnT = SYNERGY_TUNING.yangyan4.burnSec;
        e.burnDps = Math.max(e.burnDps || 0, 10 + 3 * run.player.level);
        e.burnSlot = run._activeSlot || 0;
        if (!(e._burnTick > 0)) e._burnTick = 0.5;
        applySlow(run, e, SYNERGY_TUNING.yangyan4.slowDur);
      }
    }
  }

  pushHitEvent(run, e.x, e.y, dmg, crit, e.id, weaponId);

  // 暴击衍生：道法 4 件掌心雷 & 朱砂饮墨溅射
  if (crit && !(opts && opts.noProc)) {
    if (m.daofa4 && !(run._daofaThunderCd > 0)) {
      run._daofaThunderCd = SYNERGY_TUNING.daofa4.cdSec;
      const tr = 52 * m.areaMul;
      damageCircle(run, e.x, e.y, tr, Math.max(8, raw * 0.45), 'talisman', { noCrit: true, noProc: true, knock: 40 });
      run.projectiles.push({
        id: run._nextId++,
        kind: 'thunderBolt',
        weaponId: 'talisman',
        ownerSlot: run._activeSlot || 0,
        x: e.x,
        y: e.y,
        r: 10,
        radius: tr,
        angle: 0,
        t: 0,
        life: 0.24,
      });
    }
    if (m.cinnabarInkStacks > 0) {
      const CI = BLESSING_TUNING.cinnabar_ink;
      damageCircle(run, e.x, e.y, CI.splashRadius * m.areaMul, Math.max(4, raw * CI.splashMul * m.cinnabarInkStacks), weaponId, {
        noCrit: true,
        noProc: true,
        knock: 0,
      });
    }
  }

  if (e.hp <= 0) killEnemy(run, e, opts);
  return dmg;
}

/** 击杀：事件、攒气、糯米回血、招魂幡叠盾、掉落、分裂、阴火延时爆、阳炎爆裂、Boss 结算 */
export function killEnemy(run, e, opts) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  const st = run.stats;
  st.kills++;
  st.killsByType[e.type] = (st.killsByType[e.type] || 0) + 1;
  st.combo = (st.combo || 0) + 1;
  st.comboT = 2.6;
  if (st.combo > (st.maxCombo || 0)) st.maxCombo = st.combo;
  run.events.push({ type: 'kill', x: e.x, y: e.y, enemyType: e.type, elite: e.elite, boss: e.boss });

  const p = run.player;
  if (!(opts && opts.direct) && p?.stats) {
    p.stats.kills = (p.stats.kills || 0) + 1;
  }
  // 大招攒气：普通击杀随时间衰减，精英 / Boss 固定；联机下存活队友共享 35% 灵气
  let charge;
  if (e.boss) charge = ULT.bossCharge;
  else if (e.elite) charge = ULT.eliteCharge;
  else charge = ULT.killCharge / (1 + ULT.decayPerMin * designMinutes(run.time));
  if (!e.summoned || e.elite) {
    p.ult = Math.min(p.ultMax, p.ult + charge * run.mods.ultChargeMul);
    if (coopPartySize(run) > 1) {
      for (let i = 0; i < run.players.length; i++) {
        const ally = run.players[i];
        if (ally === p || ally.downed || ally.hp <= 0) continue;
        const allyMul = ally._rt?.mods?.ultChargeMul || 1;
        ally.ult = Math.min(ally.ultMax ?? ULT.max, ally.ult + charge * 0.35 * allyMul);
      }
    }
  }

  // 糯米法器：累积击杀点数回复气血（不计入吃包子数）
  if (run.mods?.killHeal > 0) {
    const credits = e.boss ? 10 : e.elite ? 3 : 1;
    run._glutinousKills = (run._glutinousKills || 0) + credits;
    const interval = RELICS.glutinous.killInterval || 25;
    while (run._glutinousKills >= interval) {
      run._glutinousKills -= interval;
      const healed = healPlayer(run, run.mods.killHeal);
      if (healed > 0) run.events.push({ type: 'heal', amount: healed, source: 'glutinous', x: p.x, y: p.y });
    }
  }

  // 招魂幡：收魂凝聚护体魂障（受冷却节流防无限无敌）
  const sb = run.weapons.find((w) => w.id === 'soulbanner');
  if (sb && p.soulBarrierMax > 0) {
    const need = sb.evolved ? WEAPONS.soulbanner.evo.killsPerShield : WEAPONS.soulbanner.killsPerShield;
    const minGap = sb.evolved ? (WEAPONS.soulbanner.evo.shieldCd || 9) : (WEAPONS.soulbanner.shieldCd || 12);
    sb._kills = (sb._kills || 0) + (e.boss ? 6 : e.elite ? 2 : 1);
    while (sb._kills >= need) {
      sb._kills -= need;
      if (p.soulBarrier < p.soulBarrierMax && run.time >= (sb._nextShieldAt || 0)) {
        p.soulBarrier++;
        sb._nextShieldAt = run.time + minGap;
      }
    }
  }

  // 饿鬼道契命签：每 N 杀回血
  if (run.mods?.hungryGhost && st.kills % BLESSING_TUNING.hungry_ghost.killEvery === 0) {
    const healed = healPlayer(run, BLESSING_TUNING.hungry_ghost.killHeal);
    if (healed > 0) run.events.push({ type: 'heal', amount: healed, source: 'hungry_ghost', x: p.x, y: p.y });
  }

  // 掉落
  if (e.xp > 0) dropXp(run, e.x, e.y, e.xp, e.boss ? PICKUPS.bossXpSplit : 1);
  const coinMul = run.mods?.coinDropMul || 1;

  if (e.boss) {
    dropPickup(run, 'coin', e.x + 18, e.y, Math.max(1, Math.round(PICKUPS.bossCoinValue * coinMul)));
    onBossKilled(run, e);
  } else {
    if (e.chest) {
      dropPickup(run, 'chest', e.x, e.y, 0);
    }
    if (e.elite) {
      dropPickup(run, 'coin', e.x + 10, e.y, Math.max(1, Math.round(PICKUPS.eliteCoinValue * coinMul)));
      if (run.rng.chance(ELITE.bannerChance)) dropPickup(run, 'banner', e.x - 10, e.y, 0);
      if (e.affix === 'treasure_bearer') {
        const tb = ELITE_AFFIXES.treasure_bearer;
        const eachCoin = Math.max(1, Math.round((tb.bonusCoins / 3) * coinMul));
        for (let c = 0; c < 3; c++) {
          dropPickup(run, 'coin', e.x + (c - 1) * 14, e.y + 12, eachCoin);
        }
        if (run.rng.chance(tb.bunChance)) dropPickup(run, 'bun', e.x, e.y - 12, 0);
        else dropPickup(run, 'banner', e.x, e.y - 12, 0);
      }
    } else if (!e.mirrorClone && run.rng.chance(PICKUPS.coinChance * coinMul)) {
      dropPickup(run, 'coin', e.x, e.y, PICKUPS.coinValue);
    }
  }

  // 纸轿子裂成 4 个纸扎童子（带短暂出生攻击保护与外扩冲量，防贴脸四连击）
  if (e.type === 'sedan') {
    const s = ENEMY_AI.sedan;
    for (let i = 0; i < s.splitCount; i++) {
      const a = (i / s.splitCount) * Math.PI * 2 + run.rng.range(-0.3, 0.3);
      const ca = fcos(a);
      const sa = fsin(a);
      queueSpawn(run, s.splitType, e.x + ca * s.splitSpread, e.y + sa * s.splitSpread, {
        summoned: false,
        split: true,
        atkT: s.splitGrace,
        kbx: ca * s.splitImpulse,
        kby: sa * s.splitImpulse,
      });
    }
  }

  // 剪纸双生：死亡分裂成 2 个小体，小体再分裂一次（最多 2 层）
  if (e.type === 'twin_paper') {
    const tp = ENEMY_AI.twin_paper;
    const nextDepth = (e.splitDepth || 0) + 1;
    if (nextDepth <= tp.maxDepth) {
      const baseA = run.rng.range(0, Math.PI * 2);
      for (let i = 0; i < tp.splitCount; i++) {
        const a = baseA + i * Math.PI + run.rng.range(-0.22, 0.22);
        const ca = fcos(a);
        const sa = fsin(a);
        queueSpawn(run, 'twin_paper', e.x + ca * tp.spread, e.y + sa * tp.spread, {
          splitDepth: nextDepth,
          mirrorClone: true,
          hpMul: tp.hpMulByDepth[nextDepth] || 0.25,
          rMul: tp.rMulByDepth[nextDepth] || 0.6,
          atkT: tp.grace,
          kbx: ca * tp.impulse,
          kby: sa * tp.impulse,
        });
      }
    }
  }

  // 阴火骷髅：死亡留下延时爆裂阴火核（敌我皆伤，可引爆周围鬼群）
  if (e.type === 'cinder') {
    const C = ENEMY_AI.cinder;
    const m = run.mode === 'endless' ? designMinutes(run._endlessStart) : designMinutes(run.time);
    run.projectiles.push({
      id: run._nextId++,
      kind: 'cinderCore',
      x: e.x,
      y: e.y,
      r: 6,
      radius: C.blastRadius,
      angle: 0,
      t: 0,
      life: C.fuseTime,
    });
    run._scheduled.push({
      delay: C.fuseTime,
      type: 'cinderBlast',
      x: e.x,
      y: e.y,
      radius: C.blastRadius,
      enemyDmg: Math.max(12, Math.round(ENEMIES.cinder.hp * currentHpScale(run) * C.enemyBlastMul)),
      playerDmg: Math.max(4, Math.round(C.playerBlastDmg * run.night.contactDmgMul * enemyDmgScale(m))),
    });
  }

  // 长明灯通用阳炎印记：任意武器击杀带阳炎印记的目标均触发爆裂
  const activeSlot = run._activeSlot || 0;
  if (e.yangyanMarkT > 0) {
    e.yangyanMarkT = 0;
    run._scheduled.push({
      delay: 0,
      type: 'explosion',
      x: e.x,
      y: e.y,
      radius: e.yangyanBurstR || 68,
      dmg: e.yangyanBurstDmg || 40,
      weaponId: 'lantern',
      evolved: true,
      explosionKind: 'yangyanBurst',
      knock: 95,
      noReburst: true,
      ownerSlot: activeSlot,
    });
  } else if (opts && opts.burst) {
    run._scheduled.push({
      delay: 0,
      type: 'explosion',
      x: e.x,
      y: e.y,
      radius: opts.burst.radius,
      dmg: opts.burst.dmg,
      weaponId: opts.burst.weaponId,
      evolved: true,
      explosionKind: 'yangyanBurst',
      knock: 95,
      noReburst: true,
      ownerSlot: activeSlot,
    });
  } else if (run.mods?.yangyan6 && e.burnT > 0 && !(opts && opts.noReburst)) {
    e.burnT = 0;
    run._scheduled.push({
      delay: 0.04,
      type: 'explosion',
      x: e.x,
      y: e.y,
      radius: 68 * run.mods.areaMul,
      dmg: 32 + 6 * p.level,
      weaponId: 'lantern',
      evolved: true,
      explosionKind: 'yangyanBurst',
      knock: 95,
      noReburst: true,
      ownerSlot: activeSlot,
    });
  }

  // 幽冥鬼火命签：概率引爆阴火
  if (run.mods?.killBlastChance > 0 && !(opts && opts.noReburst) && run.rng.chance(run.mods.killBlastChance)) {
    run._scheduled.push({
      delay: 0.03,
      type: 'explosion',
      x: e.x,
      y: e.y,
      radius: 60 * run.mods.areaMul,
      dmg: 28 + 5 * p.level,
      weaponId: 'firecracker',
      evolved: false,
      explosionKind: 'ghostFire',
      knock: 90,
      noReburst: true,
      ownerSlot: activeSlot,
    });
  }
}

const _circleOptsPool = [{}, {}, {}, {}];

/**
 * 圆形范围伤害（使用可重入零分配 scratchAreaPool，安全支持暴击衍生嵌套查询）。
 */
export function damageCircle(run, x, y, r, raw, weaponId, opts) {
  if (
    !run ||
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof r !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(r) ||
    r < 0 ||
    typeof raw !== 'number' ||
    !Number.isFinite(raw) ||
    !(raw > 0)
  ) {
    return 0;
  }
  const sys = run._sys;
  const depth = sys._areaDepth || 0;
  sys._areaDepth = depth + 1;
  const pool = sys.scratchAreaPool;
  const buf = pool ? pool[depth] || (pool[depth] = []) : sys.scratchArea;
  const subOpts = _circleOptsPool[depth] || {};
  subOpts.noCrit = opts?.noCrit || false;
  subOpts.noProc = opts?.noProc || false;
  subOpts.direct = opts?.direct || false;
  subOpts.armorBreak = opts?.armorBreak || false;
  subOpts.isSummon = opts?.isSummon || false;
  subOpts.noReburst = opts?.noReburst || false;
  subOpts.burst = opts?.burst || null;
  subOpts.knock = opts ? opts.knock : undefined;
  subOpts.knockDx = opts ? opts.knockDx : undefined;
  subOpts.knockDy = opts ? opts.knockDy : undefined;
  subOpts.vuln = 0;
  subOpts.vulnT = 0;
  subOpts.originX = opts?.originX ?? x;
  subOpts.originY = opts?.originY ?? y;
  try {
    const list = sys.hash.queryCircle(x, y, r, buf);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (opts) {
        if (opts.vuln > 0 || opts.vulnT > 0) applyVuln(e, opts.vuln || opts.vulnT, opts.vulnPct || 0.25);
        if (opts.stun > 0) applyStun(run, e, opts.stun);
        if (opts.slow > 0) applySlow(run, e, opts.slow);
      }
      damageEnemy(run, e, raw, weaponId, subOpts);
      n++;
    }
    hitPropsCircle(run, x, y, r);
    return n;
  } finally {
    sys._areaDepth = depth;
  }
}
