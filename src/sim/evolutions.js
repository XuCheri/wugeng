// 开光进化与供盒（PLAN §3.3 / §3.6）。
// 供盒：若有武器满足「满级 + 对应法器」则开光（取槽位顺序第一把）；否则随机升级 1–3 件已拥有的器物。

import { CHEST } from './balance.js';
import { evolvableWeapons, evolveWeapon, addOrUpgradeWeapon } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { candidateChoices } from './levelup.js';
import { recomputeMods } from './player.js';

export function resolveChest(run) {
  const evo = evolvableWeapons(run);
  if (evo.length) {
    evolveWeapon(run, evo[0].id);
    recomputeMods(run);
    return { evolved: evo[0].id, upgrades: [], coins: 0 };
  }
  const upgrades = [];
  const n = run.rng.weighted(CHEST.upgradeCountWeights, (x) => x.w).n;
  for (let i = 0; i < n; i++) {
    // 只升级已拥有的器物
    const pool = candidateChoices(run).filter((c) => !c.isNew);
    const c = run.rng.weighted(pool, (x) => x.weight);
    if (!c) break;
    const lv = c.kind === 'weapon' ? addOrUpgradeWeapon(run, c.id) : addOrUpgradeRelic(run, c.id);
    if (lv) upgrades.push({ kind: c.kind, id: c.id, level: lv });
  }
  let coins = 0;
  if (!upgrades.length) {
    coins = CHEST.fallbackCoins;
    run.stats.coins += coins;
  }
  recomputeMods(run);
  return { evolved: null, upgrades, coins };
}
