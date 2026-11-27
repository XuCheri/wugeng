// 守夜司命盘（v7 局外三脉秘传星盘）：镇魂、道法、阳炎三脉各 4 阶（共 12 阶），第 4 阶解锁核心流派秘传（Keystone）。

export const ASTROLABE_IDS = ['zhenhun', 'daofa', 'yangyan'];
export const ASTROLABE_MAX_LEVEL = 4;
export const ASTROLABE_COSTS = [120, 260, 450, 720];

export const ASTROLABE_BRANCHES = {
  zhenhun: {
    id: 'zhenhun',
    name: '镇魂脉',
    subtitle: '身法·破煞',
    tiers: [
      { level: 1, cost: 120, name: '沉岳桩', desc: '兵刃震退力度 +15%，最大生命 +6%' },
      { level: 2, cost: 260, name: '疾踏罡', desc: '「踏罡步」瞬闪冷却缩短 0.5 秒' },
      { level: 3, cost: 450, name: '破煞气', desc: '「擦弹破煞」大招充能提升 +50%' },
      { level: 4, cost: 720, name: '秘传·罡步镇煞', keystone: true, desc: '踏罡步穿过邪祟时落下一道镇魂雷符，震伤周围并定身 0.8 秒' },
    ],
  },
  daofa: {
    id: 'daofa',
    name: '道法脉',
    subtitle: '百器·合契',
    tiers: [
      { level: 1, cost: 120, name: '御气诀', desc: '飞射物弹速与法阵持续时间 +10%' },
      { level: 2, cost: 260, name: '择吉签', desc: '每局额外获赠 +1 次弃签机会与 +1 次免费重抽' },
      { level: 3, cost: 450, name: '敕神锋', desc: '开光神兵与「阴阳合契」宗师神兵伤害 +12%' },
      { level: 4, cost: 720, name: '秘传·乾坤借法', keystone: true, desc: '每局首次开启供盒时，额外免费升阶 1 件已持有的法器' },
    ],
  },
  yangyan: {
    id: 'yangyan',
    name: '阳炎脉',
    subtitle: '暴烈·街巷',
    tiers: [
      { level: 1, cost: 120, name: '淬纯阳', desc: '暴击伤害 +18%' },
      { level: 2, cost: 260, name: '引火巷', desc: '街巷爆竹火桶与定魂敕符桩威力及范围 +28%' },
      { level: 3, cost: 450, name: '诛夜魁', desc: '对巡更头目与四大夜主伤害 +14%' },
      { level: 4, cost: 720, name: '秘传·赤阳焚夜', keystone: true, desc: '本局每击败 1 名精英或夜主，永久叠层 +2% 全伤害（上限 +20%）' },
    ],
  },
};

export function defaultAstrolabe() {
  return { zhenhun: 0, daofa: 0, yangyan: 0 };
}

function toSafeTier(v) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(ASTROLABE_MAX_LEVEL, Math.max(0, Math.floor(n)));
}

export function sanitizeAstrolabe(raw) {
  const out = defaultAstrolabe();
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ASTROLABE_IDS) {
    out[id] = toSafeTier(raw[id]);
  }
  return out;
}

export function getAstrolabeLevel(save, branchId) {
  if (typeof branchId !== 'string' || !Object.hasOwn(ASTROLABE_BRANCHES, branchId)) return 0;
  if (!save || typeof save !== 'object' || !save.astrolabe || typeof save.astrolabe !== 'object') return 0;
  return toSafeTier(save.astrolabe[branchId]);
}

export function nextAstrolabeCost(save, branchId) {
  if (typeof branchId !== 'string' || !Object.hasOwn(ASTROLABE_BRANCHES, branchId)) return null;
  const lv = getAstrolabeLevel(save, branchId);
  if (lv >= ASTROLABE_MAX_LEVEL) return null;
  return ASTROLABE_COSTS[lv] ?? null;
}

export function buyAstrolabeLevel(save, branchId) {
  if (typeof branchId !== 'string' || !Object.hasOwn(ASTROLABE_BRANCHES, branchId)) {
    return { ok: false, reason: 'unknown', cost: null, level: 0 };
  }
  if (!save || typeof save !== 'object' || Object.isFrozen(save)) {
    return { ok: false, reason: 'invalid', cost: null, level: 0 };
  }
  const lv = getAstrolabeLevel(save, branchId);
  if (lv >= ASTROLABE_MAX_LEVEL) {
    return { ok: false, reason: 'max', cost: null, level: lv };
  }
  const cost = ASTROLABE_COSTS[lv];
  const coins = typeof save.coins === 'number' && Number.isFinite(save.coins) ? Math.floor(save.coins) : -1;
  if (coins < cost) {
    return { ok: false, reason: 'coins', cost, level: lv };
  }
  if (!save.astrolabe || typeof save.astrolabe !== 'object' || Object.isFrozen(save.astrolabe)) {
    save.astrolabe = defaultAstrolabe();
  }
  save.coins = coins - cost;
  save.astrolabe[branchId] = lv + 1;
  return { ok: true, cost, level: lv + 1 };
}

export function astrolabeSpent(astrolabe) {
  if (!astrolabe || typeof astrolabe !== 'object') return 0;
  let sum = 0;
  for (const id of ASTROLABE_IDS) {
    const lv = toSafeTier(astrolabe[id]);
    for (let i = 0; i < lv; i++) sum += ASTROLABE_COSTS[i];
  }
  return sum;
}

export function computeAstrolabeBonuses(save) {
  const z = getAstrolabeLevel(save, 'zhenhun');
  const d = getAstrolabeLevel(save, 'daofa');
  const y = getAstrolabeLevel(save, 'yangyan');
  return {
    maxHpPct: z >= 1 ? 0.06 : 0,
    knockbackPct: z >= 1 ? 0.15 : 0,
    dashCdReduce: z >= 2 ? 0.5 : 0,
    grazeUltPct: z >= 3 ? 0.50 : 0,
    dashThunderSeal: z >= 4 ? 1 : 0,

    durPct: d >= 1 ? 0.10 : 0,
    bonusBanishes: d >= 2 ? 1 : 0,
    freeRerolls: d >= 2 ? 1 : 0,
    evolvedDmgPct: d >= 3 ? 0.12 : 0,
    firstChestBonusRelic: d >= 4 ? 1 : 0,

    critDmg: y >= 1 ? 0.18 : 0,
    hazardPowerPct: y >= 2 ? 0.28 : 0,
    bossDmgPct: y >= 3 ? 0.14 : 0,
    eliteSlayerStack: y >= 4 ? 1 : 0,
  };
}
