// 拾取物（PLAN §3.6）：魂火（三档）、铜钱（支持五帝钱加成）、包子、招魂幡、供盒。

import { PICKUPS, HEROES } from './balance.js';
import { fsin, fcos } from '../core/math.js';
import { gainXp } from './xp.js';
import { healPlayer, earnCoins, recomputeMods } from './player.js';
import { BLESSING_TUNING } from './blessings.js';
import { coopPartySize, nearestLivingPlayer, withPlayerContext } from './coop.js';

export function xpTier(value) {
  return value >= PICKUPS.xpTier3 ? 3 : value >= PICKUPS.xpTier2 ? 2 : 1;
}

export function dropPickup(run, kind, x, y, value) {
  if (kind === 'bun' && run.runRules?.noBuns) {
    kind = 'xp';
    value = PICKUPS.xpTier2;
  }
  const p = { id: run._nextId++, kind, x, y, value, tier: kind === 'xp' ? xpTier(value) : 1, mag: false, ms: 0, batchMult: 1 };
  run.pickups.push(p);
  if (kind === 'xp') run._xpCount++;
  return p;
}

/** 掉落魂火；split > 1 时拆成多颗散开（Boss） */
export function dropXp(run, x, y, value, split = 1) {
  if (split > 1) {
    const each = value / split;
    for (let i = 0; i < split; i++) {
      const a = (i / split) * Math.PI * 2;
      dropXp(run, x + fcos(a) * 30, y + fsin(a) * 30, each, 1);
    }
    return;
  }
  if (run._xpCount >= PICKUPS.xpOrbCap) {
    let best = null;
    let bd = Infinity;
    for (const o of run.pickups) {
      if (o.kind !== 'xp') continue;
      const d = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      best.value += value;
      best.tier = xpTier(best.value);
      return;
    }
  }
  dropPickup(run, 'xp', x, y, value);
}

function tickQiansuanziHarvest(run, actor, rangeBase, dt) {
  if (!actor || actor.downed || actor.hp <= 0) return;
  const cfg = HEROES.qiansuanzi;
  const interval = cfg?.abacusInterval || 3.0;
  actor._abacusPulseT = (actor._abacusPulseT || 0) + dt;
  if (actor._abacusPulseT < interval) return;
  actor._abacusPulseT -= interval;

  const pulseR = Math.max(cfg?.abacusRadius || 280, rangeBase * 2.8);
  const pulseR2 = pulseR * pulseR;
  const matched = [];
  for (let i = 0; i < run.pickups.length; i++) {
    const o = run.pickups[i];
    if (o.kind !== 'xp' || o.mag) continue;
    const dx = actor.x - o.x;
    const dy = actor.y - o.y;
    if (dx * dx + dy * dy <= pulseR2) matched.push(o);
  }
  if (matched.length > 0) {
    const mult = Math.min(cfg?.abacusMaxMult || 2.0, 1 + (cfg?.abacusPerOrb || 0.08) * matched.length);
    for (let i = 0; i < matched.length; i++) {
      const o = matched[i];
      o.mag = true;
      o.ms = PICKUPS.magnetStartSpeed * 1.5;
      o.batchMult = Math.max(o.batchMult || 1, mult);
    }
    run.projectiles.push({
      id: run._nextId++,
      kind: 'gongPulse',
      weaponId: 'gold_abacus',
      ownerSlot: actor.slot || 0,
      fixedPos: true,
      x: actor.x,
      y: actor.y,
      r: Math.min(180, pulseR * 0.62),
      radius: 0,
      maxRadius: Math.min(180, pulseR * 0.62),
      angle: 0,
      t: 0,
      life: 0.28,
      evolved: mult >= 1.5,
    });
  }
}

/** 吸附 + 拾取 */
export function updatePickups(run, dt) {
  const isCoop = coopPartySize(run) > 1;
  const p0 = run.player;
  const baseRange = run.mods.pickupRange;
  const autoMagnetXp = Boolean(run.runRules?.autoMagnetXp);

  if (isCoop) {
    for (let k = 0; k < run.players.length; k++) {
      const pl = run.players[k];
      if (pl?.heroId === 'qiansuanzi') {
        tickQiansuanziHarvest(run, pl, pl === p0 ? baseRange : (pl._rt?.mods?.pickupRange || baseRange), dt);
      }
    }
  } else if ((p0.heroId || run.heroId) === 'qiansuanzi') {
    tickQiansuanziHarvest(run, p0, baseRange, dt);
  }

  const arr = run.pickups;
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    const pl = isCoop ? nearestLivingPlayer(run, o.x, o.y) : p0;
    const range = isCoop && pl !== p0 ? (pl._rt?.mods?.pickupRange || baseRange) : baseRange;
    const range2 = range * range;
    const collect = pl.r + PICKUPS.touchRadius * 0.6;
    const collect2 = collect * collect;
    const touch2 = (pl.r + PICKUPS.touchRadius) ** 2;
    const dx = pl.x - o.x;
    const dy = pl.y - o.y;
    const d2 = dx * dx + dy * dy;
    let taken = false;
    if (o.kind === 'xp' || o.kind === 'coin') {
      const suppressAutoXp = o.kind === 'xp' && !autoMagnetXp && ((pl.heroId || run.heroId) === 'qiansuanzi');
      if (d2 <= collect2) {
        taken = true;
      } else if (!o.mag && !suppressAutoXp && (d2 <= range2 || (autoMagnetXp && o.kind === 'xp'))) {
        o.mag = true;
        o.ms = PICKUPS.magnetStartSpeed;
      }
      if (!taken && o.mag) {
        o.ms += PICKUPS.magnetAccel * dt;
        const d = Math.sqrt(d2) || 1;
        const step = Math.min(d, o.ms * dt);
        o.x += (dx / d) * step;
        o.y += (dy / d) * step;
        if (d - step <= collect) taken = true;
      }
    } else if (d2 <= touch2) {
      taken = true;
    }
    if (taken) collectPickup(run, o, isCoop ? pl : p0);
    else arr[w++] = o;
  }
  arr.length = w;
}

function triggerSoulGourdIfOwned(run, actor) {
  const s = run.mods?.soulGourdStacks || 0;
  if (s <= 0) return;
  const SG = BLESSING_TUNING.soul_gourd;
  run._scheduled.push({
    delay: 0,
    type: 'soulGourdPulse',
    radius: SG.pulseRadius * (run.mods?.areaMul || 1),
    dmg: SG.pulseBaseDmg * s + run.player.level * 4,
    ownerSlot: actor?.slot || 0,
  });
}

export function collectPickup(run, o, collector = run.player) {
  const caps = run.mods?.capstones || {};
  let comboStep = 0;
  switch (o.kind) {
    case 'xp': {
      run._xpCount--;
      run.stats.xpOrbsCollected = (run.stats.xpOrbsCollected || 0) + 1;
      if (run.time - (run._lastXpPickupT ?? -99) <= 0.65) {
        run._xpComboCount = Math.min(9, (run._xpComboCount || 0) + 1);
      } else {
        run._xpComboCount = 0;
      }
      run._lastXpPickupT = run.time;
      comboStep = run._xpComboCount;

      if (caps.tinder && Array.isArray(run._scheduled)) {
        run._tinderOrbs = (run._tinderOrbs || 0) + 1;
        if (run._tinderOrbs >= 12) {
          run._tinderOrbs -= 12;
          const actor = collector || run.player;
          run._scheduled.push({
            delay: 0,
            type: 'tinderRing',
            x: actor.x,
            y: actor.y,
            radius: 82 * (run.mods?.areaMul || 1),
            dmg: 22 + (actor.level || 1) * 4,
            ownerSlot: actor.slot || 0,
          });
        }
      }
      gainXp(run, o.value * (o.batchMult || 1));
      if (coopPartySize(run) > 1) {
        for (let i = 1; i < run.players.length; i++) {
          const al = run.players[i];
          al.level = run.player.level;
          al.xp = run.player.xp;
          al.xpNext = run.player.xpNext;
        }
      }
      break;
    }
    case 'coin':
      o.value = earnCoins(run, o.value, true);
      if (caps.fivecoins && collector) {
        collector._fivecoinsBuffT = 3.0;
        recomputeMods(run);
      }
      if (caps.ledger_book) {
        recomputeMods(run);
      }
      break;
    case 'bun': {
      const targetPl = collector || run.player;
      if (caps.folk_rice && targetPl && (targetPl._folkRiceBonusHp || 0) < 24) {
        targetPl._folkRiceBonusHp = Math.min(24, (targetPl._folkRiceBonusHp || 0) + 4);
        recomputeMods(run);
      }
      const heal = PICKUPS.bunHeal * run.night.bunHealMul * (run.mods?.bunHealMul || 1);
      if (collector && collector !== run.player) {
        withPlayerContext(run, collector, () => healPlayer(run, heal));
      } else {
        healPlayer(run, heal);
      }
      run.stats.bunsEaten++;
      if (run.stats.firstBunTime === null) run.stats.firstBunTime = run.time;
      o.value = heal;
      break;
    }
    case 'banner':
      for (const p of run.pickups) {
        if (p.kind === 'xp' && !p.mag) {
          p.mag = true;
          p.ms = PICKUPS.magnetStartSpeed;
        }
      }
      triggerSoulGourdIfOwned(run, collector);
      break;
    case 'chest':
      run._pendingChests++;
      triggerSoulGourdIfOwned(run, collector);
      break;
  }
  run.events.push({ type: 'pickup', kind: o.kind, value: o.value, comboStep });
}
