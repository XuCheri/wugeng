// 拾取物（PLAN §3.6）：魂火（三档）、铜钱（支持五帝钱加成）、包子、招魂幡、供盒。

import { PICKUPS } from './balance.js';
import { gainXp } from './xp.js';
import { healPlayer, earnCoins } from './player.js';
import { BLESSING_TUNING } from './blessings.js';

export function xpTier(value) {
  return value >= PICKUPS.xpTier3 ? 3 : value >= PICKUPS.xpTier2 ? 2 : 1;
}

export function dropPickup(run, kind, x, y, value) {
  const p = { id: run._nextId++, kind, x, y, value, tier: kind === 'xp' ? xpTier(value) : 1, mag: false, ms: 0 };
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
      dropXp(run, x + Math.cos(a) * 30, y + Math.sin(a) * 30, each, 1);
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

/** 吸附 + 拾取 */
export function updatePickups(run, dt) {
  const pl = run.player;
  const range = run.mods.pickupRange;
  const range2 = range * range;
  const collect = pl.r + PICKUPS.touchRadius * 0.6;
  const touch2 = (pl.r + PICKUPS.touchRadius) ** 2;
  const arr = run.pickups;
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    const dx = pl.x - o.x;
    const dy = pl.y - o.y;
    const d2 = dx * dx + dy * dy;
    let taken = false;
    if (o.kind === 'xp' || o.kind === 'coin') {
      if (!o.mag && d2 <= range2) {
        o.mag = true;
        o.ms = PICKUPS.magnetStartSpeed;
      }
      if (o.mag) {
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
    if (taken) collectPickup(run, o);
    else arr[w++] = o;
  }
  arr.length = w;
}

function triggerSoulGourdIfOwned(run) {
  const s = run.mods?.soulGourdStacks || 0;
  if (s <= 0) return;
  const SG = BLESSING_TUNING.soul_gourd;
  run._scheduled.push({
    delay: 0,
    type: 'soulGourdPulse',
    radius: SG.pulseRadius * (run.mods?.areaMul || 1),
    dmg: SG.pulseBaseDmg * s + run.player.level * 4,
  });
}

function collectPickup(run, o) {
  switch (o.kind) {
    case 'xp':
      run._xpCount--;
      gainXp(run, o.value);
      break;
    case 'coin':
      o.value = earnCoins(run, o.value, true);
      break;
    case 'bun': {
      const heal = PICKUPS.bunHeal * run.night.bunHealMul * (run.mods?.bunHealMul || 1);
      healPlayer(run, heal);
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
      triggerSoulGourdIfOwned(run);
      break;
    case 'chest':
      run._pendingChests++;
      triggerSoulGourdIfOwned(run);
      break;
  }
  run.events.push({ type: 'pickup', kind: o.kind, value: o.value });
}
