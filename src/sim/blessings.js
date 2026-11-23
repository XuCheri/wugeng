// 守夜命签（F7）：18 道打破常规的吉签与凶签（不占 4+4 器物栏位）。
// 在换更节点（120s / 240s / 360s / 480s）及土地香案求签时触发。

import { DAMAGE, LEVELUP, MAX_WEAPON_LEVEL, MAX_RELIC_LEVEL } from './balance.js';
import { countSchoolItems } from './synergies.js';

const pct = (v) => Math.round(v * 100);
const fmt = (v) => (Number.isInteger(v) ? String(v) : Number(v.toFixed(2)).toString());

export const BLESSING_TUNING = {
  cinnabar_ink: { critChance: 0.08, splashMul: 0.35, splashRadius: 48 },
  lantern_oil: { areaPct: 0.14, lightPct: 0.16, pickHealPct: 0.15, watchHealPct: 0.20 },
  watchman_step: { speedPct: 0.09, stepDist: 240, ultGain: 6 },
  paper_soul: { amount: 1, reviveHpPct: 0.50, reviveInvuln: 2.0 },
  thunder_decree: { ultGrant: 35, frenzySec: 6, frenzyCdMul: 0.75, frenzyCdFloor: 0.38, frenzyCritDmg: 0.50 },
  soul_gourd: { pickupPct: 0.30, xpPct: 0.10, pulseRadius: 200, pulseBaseDmg: 35 },
  earth_blessing: { armor: 1, maxHp: 20, hurtInvuln: 0.12 },
  ghost_coin: { coinGrant: 35, perCoins: 25, dmgPerStep: 0.03, dmgCap: 0.36 },
  incense_resonance: { schoolBonus: 1, sealGrant: 1 },
  morning_dew: { hpRegen: 0.45, fullHpDmgPct: 0.20 },
  executioner_blade: { lowHpRatio: 0.25, executeBonus: 0.60, bossBonus: 0.18 },
  artisan_craft: { evoMultBonus: 0.18, fallbackCoins: 25 },
  blood_oath: { maxHpMul: 0.70, dmgPct: 0.36, critChance: 0.10 },
  ghost_feast: { spawnRateMul: 1.22, eliteChanceMul: 1.80, xpPct: 0.20, coinDropMul: 1.80 },
  heavy_bronze: { speedPenalty: 0.12, armor: 4, areaPct: 0.24, knockbackMul: 1.40 },
  glass_talisman: { takenDmgMul: 1.25, cdr: 0.20, cooldownFloor: 0.40, amount: 1 },
  cursed_lantern: { lightMul: 0.75, bunHealMul: 0.50, critMultBonus: 0.50, killBlastChance: 0.12 },
  hungry_ghost: { hpDrain: 1.3, dmgPct: 0.32, killEvery: 12, killHeal: 5 },
};

const V = BLESSING_TUNING;

export const BLESSINGS = {
  // ───────────────────────── 吉签（12 道）─────────────────────────
  cinnabar_ink: {
    id: 'cinnabar_ink',
    name: '朱砂饮墨',
    tier: 'auspicious',
    tags: ['daofa', 'zhizha'],
    maxStacks: 2,
    desc: `暴击率 +${pct(V.cinnabar_ink.critChance)}%，暴击时溅射 ${pct(V.cinnabar_ink.splashMul)}% 范围墨伤`,
  },
  lantern_oil: {
    id: 'lantern_oil',
    name: '添油续命',
    tier: 'auspicious',
    tags: ['yangyan'],
    maxStacks: 2,
    desc: `攻击范围 +${pct(V.lantern_oil.areaPct)}%，照亮范围 +${pct(V.lantern_oil.lightPct)}%；立回 ${pct(V.lantern_oil.pickHealPct)}% 生命，每次换更回 ${pct(V.lantern_oil.watchHealPct)}% 生命`,
  },
  watchman_step: {
    id: 'watchman_step',
    name: '夜行神行',
    tier: 'auspicious',
    tags: ['zhenhun'],
    maxStacks: 2,
    desc: `移速 +${pct(V.watchman_step.speedPct)}%，每移动 ${V.watchman_step.stepDist} 距离攒 ${V.watchman_step.ultGain} 点大招气`,
  },
  paper_soul: {
    id: 'paper_soul',
    name: '借纸还魂',
    tier: 'auspicious',
    tags: ['zhizha'],
    maxStacks: 1,
    desc: `器物数量 +${V.paper_soul.amount}，致命伤时纸人替死一次并回 ${pct(V.paper_soul.reviveHpPct)}% 生命`,
  },
  thunder_decree: {
    id: 'thunder_decree',
    name: '五雷号令',
    tier: 'auspicious',
    tags: ['daofa'],
    maxStacks: 2,
    desc: `立得 ${V.thunder_decree.ultGrant} 大招气；放大招后 ${V.thunder_decree.frenzySec} 秒内冷却 −${pct(1 - V.thunder_decree.frenzyCdMul)}%、暴伤 +${pct(V.thunder_decree.frenzyCritDmg)}%`,
  },
  soul_gourd: {
    id: 'soul_gourd',
    name: '收魂紫金葫',
    tier: 'auspicious',
    tags: ['zhenhun', 'yangyan'],
    maxStacks: 2,
    desc: `拾取范围 +${pct(V.soul_gourd.pickupPct)}%，经验 +${pct(V.soul_gourd.xpPct)}%，拾幡或供盒震退群祟`,
  },
  earth_blessing: {
    id: 'earth_blessing',
    name: '土地护佑',
    tier: 'auspicious',
    tags: ['zhenhun'],
    maxStacks: 2,
    desc: `护甲 +${V.earth_blessing.armor}，最大生命 +${V.earth_blessing.maxHp}，受击无敌延长 ${fmt(V.earth_blessing.hurtInvuln)} 秒`,
  },
  ghost_coin: {
    id: 'ghost_coin',
    name: '买路阴钱',
    tier: 'auspicious',
    tags: ['daofa', 'yangyan'],
    maxStacks: 2,
    desc: `立得 ${V.ghost_coin.coinGrant} 铜钱；每持有 ${V.ghost_coin.perCoins} 铜钱伤害 +${pct(V.ghost_coin.dmgPerStep)}%（上限 +${pct(V.ghost_coin.dmgCap)}%）`,
  },
  incense_resonance: {
    id: 'incense_resonance',
    name: '百神同契',
    tier: 'auspicious',
    tags: ['zhenhun', 'daofa', 'zhizha', 'yangyan'],
    maxStacks: 1,
    desc: `四门流派羁绊计数均 +${V.incense_resonance.schoolBonus}，并得换签与弃签各 ${V.incense_resonance.sealGrant} 次`,
  },
  morning_dew: {
    id: 'morning_dew',
    name: '五更甘露',
    tier: 'auspicious',
    tags: ['zhenhun', 'zhizha'],
    maxStacks: 2,
    desc: `每秒回复 ${fmt(V.morning_dew.hpRegen)} 生命，气血全满时伤害 +${pct(V.morning_dew.fullHpDmgPct)}%`,
  },
  executioner_blade: {
    id: 'executioner_blade',
    name: '斩祟断魂',
    tier: 'auspicious',
    tags: ['daofa'],
    maxStacks: 2,
    desc: `对残血（≤${pct(V.executioner_blade.lowHpRatio)}%）邪祟伤害 +${pct(V.executioner_blade.executeBonus)}%，对夜主伤害 +${pct(V.executioner_blade.bossBonus)}%`,
  },
  artisan_craft: {
    id: 'artisan_craft',
    name: '巧匠开物',
    tier: 'auspicious',
    tags: ['zhizha', 'yangyan'],
    maxStacks: 1,
    desc: `开光神兵伤害倍率 +${fmt(V.artisan_craft.evoMultBonus)}，并立即随机升 1 级已有器物`,
  },

  // ───────────────────────── 凶签（6 道）─────────────────────────
  blood_oath: {
    id: 'blood_oath',
    name: '血煞孤星',
    tier: 'cursed',
    tags: ['daofa', 'yangyan'],
    maxStacks: 1,
    desc: `【凶签】最大生命 −${pct(1 - V.blood_oath.maxHpMul)}%，但所有伤害 +${pct(V.blood_oath.dmgPct)}%、暴击率 +${pct(V.blood_oath.critChance)}%`,
  },
  ghost_feast: {
    id: 'ghost_feast',
    name: '百鬼夜宴',
    tier: 'cursed',
    tags: ['zhenhun', 'yangyan'],
    maxStacks: 1,
    desc: `【凶签】刷怪速度 +${pct(V.ghost_feast.spawnRateMul - 1)}%、精英率 +${pct(V.ghost_feast.eliteChanceMul - 1)}%，但经验 +${pct(V.ghost_feast.xpPct)}%、铜钱掉落 +${pct(V.ghost_feast.coinDropMul - 1)}%`,
  },
  heavy_bronze: {
    id: 'heavy_bronze',
    name: '千钧铜躯',
    tier: 'cursed',
    tags: ['zhenhun'],
    maxStacks: 1,
    desc: `【凶签】移速 −${pct(V.heavy_bronze.speedPenalty)}%，但护甲 +${V.heavy_bronze.armor}、范围 +${pct(V.heavy_bronze.areaPct)}%、击退 +${pct(V.heavy_bronze.knockbackMul - 1)}%`,
  },
  glass_talisman: {
    id: 'glass_talisman',
    name: '焚身敕令',
    tier: 'cursed',
    tags: ['daofa'],
    maxStacks: 1,
    desc: `【凶签】护甲归零且受伤 +${pct(V.glass_talisman.takenDmgMul - 1)}%，但冷却缩减 +${pct(V.glass_talisman.cdr)}%（下限 ${fmt(V.glass_talisman.cooldownFloor)}）、数量 +${V.glass_talisman.amount}`,
  },
  cursed_lantern: {
    id: 'cursed_lantern',
    name: '幽冥鬼火',
    tier: 'cursed',
    tags: ['yangyan', 'zhizha'],
    maxStacks: 1,
    desc: `【凶签】光照 −${pct(1 - V.cursed_lantern.lightMul)}%、包子回复减半，但暴伤 +${pct(V.cursed_lantern.critMultBonus)}% 且击杀 ${pct(V.cursed_lantern.killBlastChance)}% 爆阴火`,
  },
  hungry_ghost: {
    id: 'hungry_ghost',
    name: '饿鬼道契',
    tier: 'cursed',
    tags: ['zhizha'],
    maxStacks: 1,
    desc: `【凶签】每秒流失 ${fmt(V.hungry_ghost.hpDrain)} 生命（不致死），但伤害 +${pct(V.hungry_ghost.dmgPct)}% 且每 ${V.hungry_ghost.killEvery} 杀回 ${V.hungry_ghost.killHeal} 血`,
  },
};

export const BLESSING_IDS = Object.keys(BLESSINGS);

export function getBlessingStacks(run, id) {
  if (!run || !run.blessings) return 0;
  const b = run.blessings.find((x) => x.id === id);
  return b ? b.stacks : 0;
}

export function hasBlessing(run, id) {
  return getBlessingStacks(run, id) > 0;
}

/** 汇总所有已选命签对属性的修正 */
export function computeBlessingMods(run) {
  const m = {
    dmgPct: 0,
    critChance: 0,
    critMultBonus: 0,
    areaPct: 0,
    lightMul: 1,
    speedPct: 0,
    amount: 0,
    pickupPct: 0,
    xpPct: 0,
    bonusArmor: 0,
    bonusMaxHp: 0,
    bonusHurtInvuln: 0,
    hpRegen: 0,
    hpDrain: 0,
    evoMultBonus: 0,
    maxHpMul: 1,
    spawnRateMul: 1,
    eliteChanceMul: 1,
    coinDropMul: 1,
    knockbackMul: 1,
    zeroArmor: false,
    takenDmgMul: 1,
    cdr: 0,
    cooldownFloor: DAMAGE.cooldownFloor,
    bunHealMul: 1,
    killBlastChance: 0,
    cinnabarInkStacks: 0,
    lanternOilStacks: 0,
    watchmanStepStacks: 0,
    thunderDecreeStacks: 0,
    soulGourdStacks: 0,
    ghostCoinStacks: 0,
    morningDewStacks: 0,
    executionerStacks: 0,
    paperSoul: false,
    hungryGhost: false,
  };

  if (!run || !run.blessings) return m;

  for (const entry of run.blessings) {
    const s = entry.stacks;
    if (s <= 0) continue;
    switch (entry.id) {
      case 'cinnabar_ink':
        m.critChance += V.cinnabar_ink.critChance * s;
        m.cinnabarInkStacks += s;
        break;
      case 'lantern_oil':
        m.areaPct += V.lantern_oil.areaPct * s;
        m.lightMul *= 1 + V.lantern_oil.lightPct * s;
        m.lanternOilStacks += s;
        break;
      case 'watchman_step':
        m.speedPct += V.watchman_step.speedPct * s;
        m.watchmanStepStacks += s;
        break;
      case 'paper_soul':
        m.amount += V.paper_soul.amount * s;
        m.paperSoul = true;
        break;
      case 'thunder_decree':
        m.thunderDecreeStacks += s;
        break;
      case 'soul_gourd':
        m.pickupPct += V.soul_gourd.pickupPct * s;
        m.xpPct += V.soul_gourd.xpPct * s;
        m.soulGourdStacks += s;
        break;
      case 'earth_blessing':
        m.bonusArmor += V.earth_blessing.armor * s;
        m.bonusMaxHp += V.earth_blessing.maxHp * s;
        m.bonusHurtInvuln += V.earth_blessing.hurtInvuln * s;
        break;
      case 'ghost_coin':
        m.ghostCoinStacks += s;
        break;
      case 'incense_resonance':
        break;
      case 'morning_dew':
        m.hpRegen += V.morning_dew.hpRegen * s;
        m.morningDewStacks += s;
        break;
      case 'executioner_blade':
        m.executionerStacks += s;
        break;
      case 'artisan_craft':
        m.evoMultBonus += V.artisan_craft.evoMultBonus * s;
        break;
      case 'blood_oath':
        m.maxHpMul *= V.blood_oath.maxHpMul;
        m.dmgPct += V.blood_oath.dmgPct;
        m.critChance += V.blood_oath.critChance;
        break;
      case 'ghost_feast':
        m.spawnRateMul *= V.ghost_feast.spawnRateMul;
        m.eliteChanceMul *= V.ghost_feast.eliteChanceMul;
        m.xpPct += V.ghost_feast.xpPct;
        m.coinDropMul *= V.ghost_feast.coinDropMul;
        break;
      case 'heavy_bronze':
        m.speedPct -= V.heavy_bronze.speedPenalty;
        m.bonusArmor += V.heavy_bronze.armor;
        m.areaPct += V.heavy_bronze.areaPct;
        m.knockbackMul *= V.heavy_bronze.knockbackMul;
        break;
      case 'glass_talisman':
        m.zeroArmor = true;
        m.takenDmgMul *= V.glass_talisman.takenDmgMul;
        m.cdr += V.glass_talisman.cdr;
        m.cooldownFloor = Math.min(m.cooldownFloor, V.glass_talisman.cooldownFloor);
        m.amount += V.glass_talisman.amount;
        break;
      case 'cursed_lantern':
        m.lightMul *= V.cursed_lantern.lightMul;
        m.bunHealMul *= V.cursed_lantern.bunHealMul;
        m.critMultBonus += V.cursed_lantern.critMultBonus;
        m.killBlastChance += V.cursed_lantern.killBlastChance;
        break;
      case 'hungry_ghost':
        m.hpDrain += V.hungry_ghost.hpDrain;
        m.dmgPct += V.hungry_ghost.dmgPct;
        m.hungryGhost = true;
        break;
    }
  }
  return m;
}

function makeSlip(run, id) {
  const def = BLESSINGS[id];
  const stacks = getBlessingStacks(run, id);
  return {
    kind: 'blessing',
    id: def.id,
    name: def.name,
    desc: def.desc,
    tier: def.tier,
    tags: [...def.tags],
    level: stacks + 1,
    stacks: stacks + 1,
    maxStacks: def.maxStacks,
    isNew: stacks === 0,
    evolvable: false,
  };
}

/** 抽取 3 张守夜命签（默认 2 吉签 + 1 凶签，按已拥有流派标签加权） */
export function generateBlessingChoices(run) {
  const n = LEVELUP.choices;
  const counts = countSchoolItems(run);
  const weightOf = (def) => {
    let match = 0;
    for (const t of def.tags) if (counts[t] > 0) match++;
    return 1 + 0.25 * match;
  };

  const ausp = [];
  const cursed = [];
  for (const id of BLESSING_IDS) {
    const def = BLESSINGS[id];
    if (getBlessingStacks(run, id) >= def.maxStacks) continue;
    const item = { id, def, weight: weightOf(def) };
    if (def.tier === 'cursed') cursed.push(item);
    else ausp.push(item);
  }

  const picked = [];
  const drawFrom = (pool) => {
    if (!pool.length) return false;
    const c = run.rng.weighted(pool, (x) => x.weight);
    if (!c) return false;
    pool.splice(pool.indexOf(c), 1);
    picked.push(makeSlip(run, c.id));
    return true;
  };

  drawFrom(ausp);
  drawFrom(ausp);
  drawFrom(cursed);

  while (picked.length < n && (ausp.length || cursed.length)) {
    if (!drawFrom(ausp)) drawFrom(cursed);
  }

  const fillers = [
    { kind: 'coin', id: 'coin', level: 0, isNew: false, evolvable: false },
    { kind: 'bun', id: 'bun', level: 0, isNew: false, evolvable: false },
    { kind: 'overflow', id: 'overflow', level: (run.mods?.overflowStacks || 0) + 1, isNew: false, evolvable: false },
  ];
  for (const f of fillers) {
    if (picked.length < n) picked.push(f);
  }

  run.choiceMode = 'blessing';
  run.choices = picked;
  return picked;
}

/** 应用一张守夜命签（由 levelup / run 调用，传入即时奖励回调避免循环依赖） */
export function applyBlessingChoice(run, id, hooks = {}) {
  const def = BLESSINGS[id];
  if (!def) return false;
  const cur = run.blessings.find((x) => x.id === id);
  if (cur) {
    if (cur.stacks >= def.maxStacks) return false;
    cur.stacks++;
  } else {
    run.blessings.push({ id, stacks: 1 });
  }

  const p = run.player;
  if (id === 'incense_resonance') {
    run._allSchoolBonus = (run._allSchoolBonus || 0) + V.incense_resonance.schoolBonus;
    run.rerolls.free += V.incense_resonance.sealGrant;
    run.banishesLeft = (run.banishesLeft || 0) + V.incense_resonance.sealGrant;
  } else if (id === 'thunder_decree') {
    p.ult = Math.min(p.ultMax, p.ult + V.thunder_decree.ultGrant);
  } else if (id === 'ghost_coin') {
    if (hooks.earnCoins) hooks.earnCoins(run, V.ghost_coin.coinGrant, false);
    else run.stats.coins += V.ghost_coin.coinGrant;
  } else if (id === 'artisan_craft') {
    const upg = [];
    for (const w of run.weapons) if (w.level < MAX_WEAPON_LEVEL) upg.push({ kind: 'weapon', id: w.id });
    for (const r of run.relics) if (r.level < MAX_RELIC_LEVEL) upg.push({ kind: 'relic', id: r.id });
    if (upg.length && hooks.upgradeItem) {
      const target = run.rng.pick(upg);
      hooks.upgradeItem(run, target.kind, target.id);
    } else if (hooks.earnCoins) {
      hooks.earnCoins(run, V.artisan_craft.fallbackCoins, false);
    }
  }

  if (hooks.recomputeMods) hooks.recomputeMods(run);

  if (id === 'lantern_oil' && hooks.healPlayer) {
    const healed = hooks.healPlayer(run, Math.round(p.maxHp * V.lantern_oil.pickHealPct));
    if (healed > 0) run.events.push({ type: 'heal', amount: healed, source: 'lantern_oil', x: p.x, y: p.y });
  }

  run.events.push({ type: 'blessingPick', id: def.id, tier: def.tier });
  return true;
}
