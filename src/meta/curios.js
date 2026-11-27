// 永久镇物法宝（v7 局外藏品佩挂系统）：最多同时佩挂 2 件入局，永不消耗；支持守夜里程碑免费解锁或铜钱铸造。

export const MAX_EQUIPPED_CURIOS = 2;

export const CURIOS = {
  curio_clapper: {
    id: 'curio_clapper',
    name: '巡夜祖传梆',
    cost: 150,
    unlockHint: '完成首局守夜或 150 铜钱铸造',
    desc: '移速 +5%，「踏罡步」瞬闪无敌时间延长 0.06 秒',
    checkUnlock: (s) => (s?.stats?.runs || 0) >= 1,
    bonuses: { speedPct: 0.05, dashInvulnBonus: 0.06 },
  },
  curio_horse_bell: {
    id: 'curio_horse_bell',
    name: '马面铜铃坠',
    cost: 320,
    unlockHint: '击败任意夜主 1 次或 320 铜钱铸造',
    desc: '对巡更头目与四大夜主伤害 +10%',
    checkUnlock: (s) => (s?.stats?.totalBossKills || 0) >= 1,
    bonuses: { bossDmgPct: 0.10 },
  },
  curio_umbrella_bone: {
    id: 'curio_umbrella_bone',
    name: '无面油伞骨',
    cost: 420,
    unlockHint: '累计击败夜主 3 次或 420 铜钱铸造',
    desc: '「擦弹破煞」判定圈扩大 +35%，受敌方远程弹幕伤害 -12%',
    checkUnlock: (s) => (s?.stats?.totalBossKills || 0) >= 3,
    bonuses: { grazeRadiusPct: 0.35, bulletDmgReduct: 0.12 },
  },
  curio_youshen_seal: {
    id: 'curio_youshen_seal',
    name: '游神敕封印',
    cost: 580,
    unlockHint: '首次守到五更天亮或 580 铜钱铸造',
    desc: '开局自带 +35 点大招攒气，全伤害 +6%',
    checkUnlock: (s) => (s?.stats?.clears || 0) >= 1,
    bonuses: { startUlt: 35, dmgPct: 0.06 },
  },
  curio_hebo_pearl: {
    id: 'curio_hebo_pearl',
    name: '河伯定水珠',
    cost: 580,
    unlockHint: '通关河灯水口或 580 铜钱铸造',
    desc: '涉水行步不受水流减速，拾取范围 +22%',
    checkUnlock: (s) => (s?.clearsByMap?.hedeng || 0) >= 1,
    bonuses: { waterWalk: 1, pickupPct: 0.22 },
  },
  curio_peach_core: {
    id: 'curio_peach_core',
    name: '百年雷击木心',
    cost: 480,
    unlockHint: '480 铜钱铸造（或累计敕封 6 把开光神兵解锁）',
    desc: '暴击率 +5%，所有飞射物穿透 +1',
    checkUnlock: (s) => (s?.stats?.totalEvolutions || 0) >= 6,
    bonuses: { critChance: 0.05, bonusPierce: 1 },
  },
  curio_abacus_bead: {
    id: 'curio_abacus_bead',
    name: '聚宝赤金珠',
    cost: 380,
    unlockHint: '380 铜钱铸造（或累计获得 2000 铜钱解锁）',
    desc: '局内铜钱与魂珠经验获取 +12%',
    checkUnlock: (s) => (s?.stats?.totalCoins || 0) >= 2000,
    bonuses: { coinPct: 0.12, xpPct: 0.12 },
  },
  curio_guardian_jade: {
    id: 'curio_guardian_jade',
    name: '守夜镇魂玉',
    cost: 880,
    unlockHint: '通关夜色二或 880 铜钱铸造',
    desc: '最大生命 +18，每局首次受致命伤时触发 1.5 秒镇魂金身免死并震退群祟',
    checkUnlock: (s) => (s?.nightCleared ?? -1) >= 2,
    bonuses: { flatMaxHp: 18, cheatDeathJade: 1 },
  },
};

export const CURIO_IDS = Object.keys(CURIOS);

export function defaultCurios() {
  return {
    owned: [],
    forged: [],
    equipped: [],
  };
}

export function sanitizeCurios(raw) {
  const out = defaultCurios();
  if (!raw || typeof raw !== 'object') return out;
  const ownedSet = new Set();
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (typeof id === 'string' && Object.hasOwn(CURIOS, id)) ownedSet.add(id);
    }
  }
  const forgedSet = new Set();
  if (Array.isArray(raw.forged)) {
    for (const id of raw.forged) {
      if (typeof id === 'string' && Object.hasOwn(CURIOS, id)) {
        forgedSet.add(id);
        ownedSet.add(id);
      }
    }
  }
  out.owned = CURIO_IDS.filter((id) => ownedSet.has(id));
  out.forged = CURIO_IDS.filter((id) => forgedSet.has(id));

  const eqSet = new Set();
  if (Array.isArray(raw.equipped)) {
    for (const id of raw.equipped) {
      if (typeof id === 'string' && ownedSet.has(id)) {
        eqSet.add(id);
        if (eqSet.size >= MAX_EQUIPPED_CURIOS) break;
      }
    }
  }
  out.equipped = [...eqSet];
  return out;
}

/** 按里程碑自动补发永久镇物（返回本次新解锁的镇物 ID 数组；若空位未满则自动佩挂） */
export function reconcileCurios(save) {
  if (!save || typeof save !== 'object' || Object.isFrozen(save)) return [];
  const cur = sanitizeCurios(save.curios);
  const ownedSet = new Set(cur.owned);
  const newlyUnlocked = [];
  for (const id of CURIO_IDS) {
    if (ownedSet.has(id)) continue;
    if (CURIOS[id].checkUnlock?.(save)) {
      ownedSet.add(id);
      newlyUnlocked.push(id);
    }
  }
  if (!newlyUnlocked.length && save.curios && Array.isArray(save.curios.owned)) {
    return [];
  }
  cur.owned = CURIO_IDS.filter((id) => ownedSet.has(id));
  for (const nid of newlyUnlocked) {
    if (cur.equipped.length < MAX_EQUIPPED_CURIOS && !cur.equipped.includes(nid)) {
      cur.equipped.push(nid);
    }
  }
  save.curios = cur;
  return newlyUnlocked;
}

/** 铜钱铸造镇物（已拥有不可重复铸造；铸造成功后若佩挂槽有空位则自动佩挂） */
export function buyCurio(save, curioId) {
  if (typeof curioId !== 'string' || !Object.hasOwn(CURIOS, curioId)) {
    return { ok: false, reason: 'unknown', cost: null };
  }
  if (!save || typeof save !== 'object' || Object.isFrozen(save)) {
    return { ok: false, reason: 'invalid', cost: null };
  }
  const def = CURIOS[curioId];
  const cur = sanitizeCurios(save.curios);
  if (cur.owned.includes(curioId)) {
    return { ok: false, reason: 'owned', cost: null };
  }
  const coins = typeof save.coins === 'number' && Number.isFinite(save.coins) ? Math.floor(save.coins) : -1;
  if (coins < def.cost) {
    return { ok: false, reason: 'coins', cost: def.cost };
  }
  save.coins = coins - def.cost;
  cur.owned = CURIO_IDS.filter((id) => id === curioId || cur.owned.includes(id));
  cur.forged = CURIO_IDS.filter((id) => id === curioId || cur.forged.includes(id));
  if (cur.equipped.length < MAX_EQUIPPED_CURIOS && !cur.equipped.includes(curioId)) {
    cur.equipped.push(curioId);
  }
  save.curios = cur;
  return { ok: true, cost: def.cost, equipped: cur.equipped.includes(curioId) };
}

/** 切换佩挂状态（满 2 件时自动顶替最早佩挂的第 1 件，单手交互一步到位） */
export function toggleEquipCurio(save, curioId) {
  if (typeof curioId !== 'string' || !Object.hasOwn(CURIOS, curioId)) {
    return { ok: false, equipped: false };
  }
  if (!save || typeof save !== 'object' || Object.isFrozen(save)) {
    return { ok: false, equipped: false };
  }
  const cur = sanitizeCurios(save.curios);
  if (!cur.owned.includes(curioId)) {
    return { ok: false, equipped: false };
  }
  const idx = cur.equipped.indexOf(curioId);
  if (idx >= 0) {
    cur.equipped.splice(idx, 1);
    save.curios = cur;
    return { ok: true, equipped: false, list: [...cur.equipped] };
  }
  if (cur.equipped.length >= MAX_EQUIPPED_CURIOS) {
    cur.equipped.shift();
  }
  cur.equipped.push(curioId);
  save.curios = cur;
  return { ok: true, equipped: true, list: [...cur.equipped] };
}

export function curiosSpent(curios) {
  if (!curios || typeof curios !== 'object' || !Array.isArray(curios.forged)) return 0;
  let sum = 0;
  for (const id of curios.forged) {
    if (typeof id === 'string' && Object.hasOwn(CURIOS, id)) sum += CURIOS[id].cost;
  }
  return sum;
}

export function computeCurioBonuses(save) {
  const out = {
    speedPct: 0,
    dashInvulnBonus: 0,
    bossDmgPct: 0,
    grazeRadiusPct: 0,
    bulletDmgReduct: 0,
    startUlt: 0,
    dmgPct: 0,
    waterWalk: 0,
    pickupPct: 0,
    critChance: 0,
    bonusPierce: 0,
    coinPct: 0,
    xpPct: 0,
    flatMaxHp: 0,
    cheatDeathJade: 0,
  };
  const eq = Array.isArray(save?.curios?.equipped) ? save.curios.equipped : [];
  const owned = new Set(Array.isArray(save?.curios?.owned) ? save.curios.owned : []);
  let count = 0;
  for (const id of eq) {
    if (count >= MAX_EQUIPPED_CURIOS) break;
    if (!owned.has(id) || !Object.hasOwn(CURIOS, id)) continue;
    count++;
    for (const [k, v] of Object.entries(CURIOS[id].bonuses)) {
      out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}
