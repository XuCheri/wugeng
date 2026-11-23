// 开光进化与供盒（F3）：支持多把可开光武器自选、+50 大招气与无伤净场震波。

import { CHEST, ULT, WEAPONS } from './balance.js';
import { getEvolutionRecipe, evolvableWeapons, evolveWeapon, addOrUpgradeWeapon } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { candidateChoices } from './levelup.js';
import { recomputeMods, earnCoins } from './player.js';
import { knockback } from './combat.js';

/** 生成当前供盒可选的开光候选列表（供 run.chestChoices 与 UI 展示） */
export function buildChestChoices(run) {
  const out = [];
  for (const w of run.weapons) {
    const rec = getEvolutionRecipe(run, w);
    if (!rec) continue;
    const def = WEAPONS[w.id];
    out.push({
      id: w.id,
      name: def.name,
      evoName: def.evoName,
      evoDesc: def.evoDesc || '',
      recipe: rec.recipe,
    });
  }
  return out;
}

/** 开光礼成：补充 +50 大招攒气，清除半径 180 内敌弹并无伤震退近身群祟 */
export function applyEvolutionCeremonyPulse(run) {
  const p = run.player;
  const cap = p.ultMax ?? ULT.cost;
  p.ult = Math.min(cap, p.ult + CHEST.evolveUltGrant);

  const R = CHEST.evolveClearRadius;
  for (let i = 0; i < run.projectiles.length; i++) {
    const pr = run.projectiles[i];
    if (pr.kind === 'enemyBullet' && !pr.dead) {
      const rr = R + (pr.r || 0);
      if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= rr * rr) pr.dead = true;
    }
  }
  run.projectiles = run.projectiles.filter((pr) => !(pr.kind === 'enemyBullet' && pr.dead));

  for (let i = 0; i < run.enemies.length; i++) {
    const e = run.enemies[i];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = R + (e.r || 0);
    if (dx * dx + dy * dy <= rr * rr) {
      knockback(e, dx || 1, dy, CHEST.evolvePushForce);
    }
  }
}

export function resolveChest(run, preferredWeaponId = null) {
  const evo = evolvableWeapons(run);
  if (evo.length) {
    const target = (preferredWeaponId && evo.find((w) => w.id === preferredWeaponId)) || evo[0];
    const rec = getEvolutionRecipe(run, target);
    evolveWeapon(run, target.id, rec?.recipe || null);
    recomputeMods(run);
    applyEvolutionCeremonyPulse(run);
    return { evolved: target.id, recipe: rec?.recipe || null, upgrades: [], coins: 0 };
  }

  const upgrades = [];
  const n = run.rng.weighted(CHEST.upgradeCountWeights, (x) => x.w).n;
  for (let i = 0; i < n; i++) {
    const pool = candidateChoices(run).filter((c) => !c.isNew);
    const c = run.rng.weighted(pool, (x) => x.weight);
    if (!c) break;
    const lv = c.kind === 'weapon' ? addOrUpgradeWeapon(run, c.id) : addOrUpgradeRelic(run, c.id);
    if (lv) upgrades.push({ kind: c.kind, id: c.id, level: lv });
  }
  let coins = 0;
  if (!upgrades.length) {
    coins = earnCoins(run, CHEST.fallbackCoins, true);
  }
  recomputeMods(run);
  return { evolved: null, recipe: null, upgrades, coins };
}
