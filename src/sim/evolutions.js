// 开光进化、阴阳合契与供盒（F3 + v7）：支持双神兵二合一腾槽宗师合契、多把可开光武器自选、+50 大招气与无伤净场震波。

import { CHEST, ULT, WEAPONS, MAX_RELIC_LEVEL } from './balance.js';
import { getEvolutionRecipe, evolvableWeapons, evolveWeapon, addOrUpgradeWeapon } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { candidateChoices } from './levelup.js';
import { recomputeMods, earnCoins } from './player.js';
import { knockback } from './combat.js';
import { availableFusions, applyWeaponFusion } from './fusions.js';

/** 生成当前供盒可选的宗师合契与开光候选列表（供 run.chestChoices 与 UI 展示） */
export function buildChestChoices(run) {
  const out = [];
  for (const f of availableFusions(run)) {
    const wA = WEAPONS[f.primaryId];
    const wB = WEAPONS[f.secondaryId];
    out.push({
      kind: 'fusion',
      id: f.id,
      primaryId: f.primaryId,
      secondaryId: f.secondaryId,
      name: `${wA?.evoName || f.primaryId} × ${wB?.evoName || f.secondaryId}`,
      evoName: f.name,
      evoDesc: f.desc,
      recipe: 'fusion',
    });
  }
  for (const w of run.weapons) {
    const rec = getEvolutionRecipe(run, w);
    if (!rec) continue;
    const def = WEAPONS[w.id];
    out.push({
      kind: 'evolve',
      id: w.id,
      name: def.name,
      evoName: def.evoName,
      evoDesc: def.evoDesc || '',
      recipe: rec.recipe,
    });
  }
  return out;
}

/** 开光/合契礼成：补充 +50 大招攒气，清除半径 180 内敌弹并无伤震退近身群祟 */
export function applyEvolutionCeremonyPulse(run, radiusMul = 1) {
  const p = run.player;
  const cap = p.ultMax ?? ULT.cost;
  p.ult = Math.min(cap, p.ult + CHEST.evolveUltGrant);

  const R = CHEST.evolveClearRadius * radiusMul;
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
      knockback(e, dx || 1, dy, CHEST.evolvePushForce * radiusMul);
    }
  }
}

/** 道法脉肆阶秘传【乾坤借法】：每局首次开启供盒额外升阶 1 件已持有且未满级的法器 */
function grantFirstChestBonusRelic(run, upgrades) {
  if (!(run.meta?.firstChestBonusRelic > 0) || run._firstChestRelicGranted) return;
  run._firstChestRelicGranted = true;
  const target = run.relics.find((r) => r && r.level < MAX_RELIC_LEVEL);
  if (target) {
    const lv = addOrUpgradeRelic(run, target.id);
    if (lv) upgrades.push({ kind: 'relic', id: target.id, level: lv, bonus: true });
  }
}

export function resolveChest(run, preferredWeaponId = null) {
  const fusions = availableFusions(run);
  const evo = evolvableWeapons(run);

  // 1) 若玩家显式选择了某个宗师合契，或当前无待开光兵刃但存在可合契双神兵 → 执行二合一腾槽宗师合契！
  const pickedFusion = (preferredWeaponId && fusions.find((f) => f.id === preferredWeaponId))
    || (!evo.length && fusions.length ? fusions[0] : null);
  if (pickedFusion) {
    const fused = applyWeaponFusion(run, pickedFusion.id);
    if (fused) {
      const bonusUpgrades = [];
      grantFirstChestBonusRelic(run, bonusUpgrades);
      recomputeMods(run);
      applyEvolutionCeremonyPulse(run, 1.25);
      return {
        evolved: fused.primaryId,
        fused: fused.id,
        fusionName: fused.name,
        freedSlotFrom: fused.secondaryId,
        recipe: 'fusion',
        upgrades: bonusUpgrades,
        coins: 0,
      };
    }
  }

  // 2) 单把神兵敕封开光
  if (evo.length) {
    const target = (preferredWeaponId && evo.find((w) => w.id === preferredWeaponId)) || evo[0];
    const rec = getEvolutionRecipe(run, target);
    evolveWeapon(run, target.id, rec?.recipe || null);
    const bonusUpgrades = [];
    grantFirstChestBonusRelic(run, bonusUpgrades);
    recomputeMods(run);
    applyEvolutionCeremonyPulse(run);
    return { evolved: target.id, recipe: rec?.recipe || null, upgrades: bonusUpgrades, coins: 0 };
  }

  // 3) 常规升阶供盒
  const upgrades = [];
  const n = run.rng.weighted(CHEST.upgradeCountWeights, (x) => x.w).n;
  for (let i = 0; i < n; i++) {
    const pool = candidateChoices(run).filter((c) => !c.isNew);
    const c = run.rng.weighted(pool, (x) => x.weight);
    if (!c) break;
    const lv = c.kind === 'weapon' ? addOrUpgradeWeapon(run, c.id) : addOrUpgradeRelic(run, c.id);
    if (lv) upgrades.push({ kind: c.kind, id: c.id, level: lv });
  }
  grantFirstChestBonusRelic(run, upgrades);
  let coins = 0;
  if (!upgrades.length) {
    coins = earnCoins(run, CHEST.fallbackCoins, true);
  }
  recomputeMods(run);
  return { evolved: null, recipe: null, upgrades, coins };
}
