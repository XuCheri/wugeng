// 《五更天》数值总表 —— 所有可调数值集中在这里（PLAN §3、§4）。
// 逻辑代码里不应出现散落的魔法数字；调平衡只改这个文件。
// 百分比一律用小数（0.15 = +15%）。

// ───────────────────────── 基础 ─────────────────────────
export const DT = 1 / 60;
export const MAIN_DURATION = 600; // 主线 10 分钟
export const WATCH_DURATION = 120; // 每更 2 分钟
export const WATCH_NAMES = ['', '一更', '二更', '三更', '四更', '五更', '鸡鸣'];

// 夜色遮罩：一更 0.15 → 五更 0.75，鸡鸣归 0；无尽模式为「残夜」
export const DARKNESS = {
  watch1: 0.15,
  watch5: 0.75,
  dawn: 0,
  endless: 0.45,
  smooth: 6, // 每次换更时用多少秒平滑过渡
};

// ───────────────────────── 玩家 ─────────────────────────
export const PLAYER_BASE = {
  r: 12,
  maxHp: 100,
  speed: 102.7,
  armor: 0,
  pickupRange: 64, // 魂火吸附半径
  collectRadius: 16, // 实际拾取距离（叠加玩家半径）
  critChance: 0.05,
  critMult: 2,
  hurtFlash: 0.25,
};

export const REVIVE = {
  invuln: 3, // 复活无敌秒数
  mainMax: 1,
  endlessMax: 1,
};

export const REROLL = {
  free: 2, // 每局免费刷新
  adGrant: 3, // 每次广告 +3
  adGrantMax: 2, // 每局最多看 2 次
};

// ───────────────────────── 经验曲线（PLAN §4.1）─────────────────────────
/** 从 L 级升到 L+1 级需要的经验 */
export function xpForLevel(L) {
  const k = L - 1;
  return 5 + 6 * k + 0.35 * k * k;
}

// ───────────────────────── 伤害规则（PLAN §4.2）─────────────────────────
export const DAMAGE = {
  cooldownFloor: 0.55, // 冷却 = 基础 × max(0.55, 1 − Σ冷却缩减)
  minTaken: 1, // 受到伤害 = max(1, 原始 − 护甲)
  hitFlash: 0.12,
  overflowMult: 1.12, // 溢出签：伤害 ×1.12（乘算）
};

/** 冷却倍率（带下限） */
export function cooldownMul(cdr) {
  return Math.max(DAMAGE.cooldownFloor, 1 - cdr);
}

/** 玩家实际受到的伤害 */
export function damageTaken(raw, armor) {
  return Math.max(DAMAGE.minTaken, raw - armor);
}

/** 期望伤害公式：D = B × (1 + Σ增伤%) × Crit × M开光 × 溢出 */
export function computeDamage(base, dmgPct, crit, evoMult = 1, overflow = 1) {
  return base * (1 + dmgPct) * (crit ? PLAYER_BASE.critMult : 1) * evoMult * overflow;
}

// ───────────────────────── 敌人（PLAN §3.2）─────────────────────────
// hp/speed/dmg 为基础值；xp 为掉落魂火经验；r 为碰撞半径
export const ENEMIES = {
  paperkid: { name: '纸扎童子', hp: 8, speed: 50, dmg: 5, r: 11, xp: 1 },
  shade: { name: '影祟', hp: 5, speed: 85, dmg: 4, r: 10, xp: 1 },
  lanternghost: { name: '灯笼鬼', hp: 32, speed: 40, dmg: 8, r: 15, xp: 3 },
  weasel: { name: '黄皮子', hp: 18, speed: 70, dmg: 7, r: 12, xp: 2 },
  sedan: { name: '纸轿子', hp: 120, speed: 30, dmg: 12, r: 20, xp: 4 },
  drowned: { name: '水鬼', hp: 45, speed: 45, dmg: 9, r: 13, xp: 3 },
  horse: { name: '纸马将军', hp: 1800, speed: 60, dmg: 11, r: 30, xp: 40, boss: true },
  umbrella: { name: '无面伞女', hp: 6000, speed: 45, dmg: 18, r: 28, xp: 80, boss: true },
  youshen: { name: '夜游神', hp: 24000, speed: 52, dmg: 22, r: 40, xp: 0, boss: true },
};
export const ENEMY_NAMES = Object.fromEntries(Object.entries(ENEMIES).map(([k, v]) => [k, v.name]));
export const MAX_ENEMY_RADIUS = 40;

export const ENEMY_AI = {
  contactCd: 0.48, // 同一只敌人两次接触伤害的间隔
  separation: 0.55, // 软分离强度（每帧推开重叠量的比例）
  knockbackDecay: 0.0005, // 击退速度每秒保留比例
  slowMul: 0.5, // 被减速时移速倍率
  // 黄皮子：靠近后停顿，再直线扑击
  weasel: { triggerDist: 230, pause: 0.6, dashMul: 3.4, dashTime: 0.65, recover: 1.4 },
  // 纸轿子：打破后裂成 4 个纸扎童子
  sedan: { splitCount: 4, splitType: 'paperkid', splitSpread: 26 },
  // 水鬼：减速光环
  drowned: { auraRadius: 75, playerSlow: 0.72, wellMin: 260, wellMax: 720 },
};

export const BOSS_AI = {
  spawnDist: 430,
  hpMul: 1.45, // Boss 血量整体倍率（校准后）
  firstAttackDelay: 1.5,
  knockbackMul: 0.08,
  leashDist: 700, // 超出这个距离 Boss 会被拉回
  horse: {
    chase: 2.8, windup: 0.92, chargeSpeed: 410, chargeTime: 0.55, gap: 0.22, charges: 3, rest: 1.7,
    rewindMul: 0.65, // 连冲之间的再蓄力 = gap + windup × 0.65
    chargeDmgMul: 1.15,
  },
  umbrella: {
    shieldTime: 5, openTime: 4, shieldDr: 0.7, spinSpeed: 2.4, shieldMoveMul: 0.5, firstRingDelay: 0.3,
    ringInterval: 0.95, ringCount: 15, bulletSpeed: 132, bulletDmg: 12, bulletR: 7, bulletLife: 6,
  },
  youshen: {
    hpMul: 1.95,
    phase2At: 0.68, phase3At: 0.36,
    summonInterval: 4.0, summonCount: 9, summonTypes: ['shade', 'weasel', 'lanternghost'], summonDist: 140,
    spiralInterval: 0.11, spiralArms: 3, spiralTurn: 0.33,
    bulletSpeed: 151, bulletDmg: 16, bulletR: 7, bulletLife: 6,
    enrageSpeedMul: 2.06, enrageSummonInterval: 3.1, enrageRingInterval: 1.35, enrageRingCount: 16, ringTurn: 0.2,
  },
};

// 精英：普通敌人的强化版
export const ELITE = {
  baseChance: 0.026,
  perNight: 0.004, // 夜色每级额外概率
  hpMul: 10,
  rMul: 1.35,
  dmgMul: 1.4,
  xpMul: 5,
  speedMul: 1.05,
  bannerChance: 0.06, // 精英额外掉招魂幡的概率
};

// ───────────────────────── 刷怪（PLAN §4.3 + §4.4 校准）─────────────────────────
export const SPAWN = {
  cap: 260, // 同屏上限
  ringMin: 480,
  ringMax: 560,
  despawnDist: 820, // 超出这个距离的普通敌人被回收到前方圆环
  bossSpawnMul: 0.55, // 精英夜主在场时刷怪倍率
  youshenSpawnMul: 0.45,
  minuteHpGrowth: 0.24, // 经模拟器校准，使非 Boss 时段压力比落在 0.60–0.95
  minuteHpGrowth2: 0.006,
  nightHpGrowth: 0.15, // HP × (1 + 0.15N)
  rateA: 1.2,
  rateB: 0.55,
  rateC: 0.035,
  rateMul: 1.0,
  hpMul: 1.82,
  watch1LateAt: 52, // 一更后半（玩家升到 3–4 级后）灯笼鬼开始从巷口飘出，匹配前期火力跃升
  // 后期压力：三更起群鬼移速逐步跨过无加成的风筝线，局外脚力/护持/力道显著拉开生存率
  minuteSpeedGrowth: 0.058,
  speedGrowthCap: 1.64,
  minuteDmgGrowth: 0.045,
};

// 合围：每隔一段时间在玩家四周刷一圈同种敌人向内收拢（考验突围走位）
export const WAVES = {
  enabled: true,
  firstAt: 95,
  every: 34,
  baseCount: 18,
  perMinute: 3.0, // 每分钟多几只
  maxCount: 46,
  radius: 380,
  types: { 1: 'paperkid', 2: 'shade', 3: 'shade', 4: 'lanternghost', 5: 'shade' },
};

/** 敌人移速 / 接触伤害的分钟成长倍率 */
export function enemySpeedScale(m) {
  return Math.min(SPAWN.speedGrowthCap, 1 + SPAWN.minuteSpeedGrowth * m);
}
export function enemyDmgScale(m) {
  return 1 + SPAWN.minuteDmgGrowth * m;
}

/** 每秒刷怪数 S(m) = a + b·m + c·m² */
export function spawnRate(m) {
  return (SPAWN.rateA + SPAWN.rateB * m + SPAWN.rateC * m * m) * SPAWN.rateMul;
}

/** 敌人生命成长倍率；endlessK 为进入无尽后的分钟数 */
export function enemyHpScale(m, night, endlessK = 0) {
  return SPAWN.hpMul * (1 + SPAWN.minuteHpGrowth * m + SPAWN.minuteHpGrowth2 * m * m) * (1 + SPAWN.nightHpGrowth * night) * Math.pow(ENDLESS.hpGrowth, endlessK);
}

// 每更的刷怪权重（第 5 更同样用于无尽；1b 为一更后半段）
export const ROSTER = {
  1: { paperkid: 70, shade: 30 },
  '1b': { paperkid: 30, shade: 18, lanternghost: 52 },
  2: { paperkid: 22, shade: 14, lanternghost: 64 },
  3: { paperkid: 22, shade: 20, lanternghost: 24, weasel: 18, sedan: 16 },
  4: { paperkid: 18, shade: 18, lanternghost: 20, weasel: 18, sedan: 11, drowned: 15 },
  5: { paperkid: 12, shade: 20, lanternghost: 18, weasel: 20, sedan: 13, drowned: 17 },
};

// Boss 时间轴
export const BOSS_TIMELINE = [
  { time: 240, type: 'horse', chest: true },
  { time: 480, type: 'umbrella', chest: true },
  { time: 600, type: 'youshen', chest: false, final: true },
];

// ───────────────────────── 无尽（PLAN §4.5）─────────────────────────
export const ENDLESS = {
  hpGrowth: 1.22, // 每分钟 ×1.22
  rateMinuteCap: 14, // 刷怪公式的分钟数上限（反正受 cap 限制）
  bossEvery: 150, // 无尽中每 150 秒来一只夜主（轮换），掉供盒
  bossCycle: ['horse', 'umbrella'],
  bossHpMul: 2.0, // 无尽夜主在 ×1.22^k 之外的额外倍率
};

// ───────────────────────── 武器（PLAN §3.3）─────────────────────────
// 每个数组是 Lv1..Lv5；evo 为开光后的参数，evoMult 为开光乘算倍率（1.5–2.0）
export const WEAPONS = {
  gong: {
    name: '更锣', pair: 'clapper', evoName: '五更鸣锣', evoMult: 1.6,
    dmg: [14, 20, 26, 33, 40], radius: [70, 80, 90, 100, 110], cd: [2.2, 2.05, 1.9, 1.75, 1.6],
    knockback: 140, pulseLife: 0.35,
    evo: { pulses: 3, interval: 0.25, stun: 0.8 },
  },
  lantern: {
    name: '灯笼', pair: 'censer', evoName: '长明灯', evoMult: 1.6,
    count: [1, 2, 2, 3, 3], dmg: [8, 11, 14, 17, 20], tick: 0.5,
    orbitR: [62, 66, 70, 74, 78], hitR: 18, angSpeed: 3.0,
    evo: { ringRadius: 100, ringTick: 0.5, ringDmgMul: 0.55, burstRadius: 55, burstDmgMul: 1.2 },
  },
  talisman: {
    name: '符纸', pair: 'cinnabar', evoName: '天师符阵', evoMult: 1.7,
    count: [1, 2, 3, 3, 4], dmg: [12, 15, 18, 22, 26], cd: [1.0, 0.96, 0.92, 0.88, 0.84],
    speed: 350, life: 1.8, r: 8, turnRate: 7.5, seekRange: 420,
    evo: { pierce: 3, chain: 2, chainRange: 130, chainDmgMul: 0.6 },
  },
  brush: {
    name: '墨笔', pair: 'inkstone', evoName: '泼墨山河', evoMult: 1.8,
    dmg: [20, 28, 36, 45, 55], spread: [90, 105, 120, 135, 150], radius: [95, 100, 106, 112, 118],
    cd: [1.4, 1.35, 1.3, 1.25, 1.2], arcLife: 0.22,
    evo: { poolLife: 2.5, poolRadius: 52, poolTick: 0.5, poolDmgMul: 0.35 },
  },
  coinsword: {
    name: '铜钱剑', pair: 'bagua', evoName: '七星剑阵', evoMult: 1.8,
    dmg: [16, 22, 28, 35, 42], count: [1, 1, 2, 2, 2], cd: [1.8, 1.75, 1.7, 1.65, 1.6],
    range: 240, speed: 380, r: 12, spreadAngle: 0.35,
    evo: { swords: 7, orbitTime: 1.1, orbitR: 72, orbitSpeed: 6, range: 420 },
  },
  paperman: {
    name: '纸人', pair: 'scissors', evoName: '纸扎仪仗', evoMult: 1.6,
    count: [1, 2, 2, 3, 3], dmg: [12, 16, 21, 27, 34], speed: 220, atkCd: 0.30, r: 13,
    seekRange: 400, leash: 520,
    evo: { count: 8, patrolR: 115, angSpeed: 1.8, atkCd: 0.28, hitR: 22 },
  },
  firecracker: {
    name: '爆竹', pair: 'tinder', evoName: '满堂红', evoMult: 2.0,
    dmg: [30, 42, 54, 67, 80], cd: [2.6, 2.4, 2.2, 2.0, 1.8], radius: [55, 58, 62, 66, 70],
    count: [1, 1, 1, 1, 1], flight: 0.55, range: 360, sample: 12, densityR: 60,
    evo: { chains: 4, chainDelay: 0.15, chainSpread: 70, chainRadiusMul: 0.8, chainDmgMul: 0.7 },
  },
  bell: {
    name: '铜铃', pair: 'redstring', evoName: '千铃引魂', evoMult: 1.7,
    bounces: [3, 4, 5, 6, 7], dmg: [11, 15, 20, 25, 30], cd: [1.5, 1.45, 1.4, 1.35, 1.3],
    range: 240, chainRange: 150, chainLife: 0.25,
    evo: { forks: 2, maxHits: 22 },
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const WEAPON_NAMES = Object.fromEntries(WEAPON_IDS.map((k) => [k, WEAPONS[k].name]));
export const EVOLVED_NAMES = Object.fromEntries(WEAPON_IDS.map((k) => [k, WEAPONS[k].evoName]));
export const MAX_WEAPON_LEVEL = 5;
export const MAX_WEAPONS = 4;

// 武器 / 弹体的通用表现参数
export const FX = {
  firstFireDelay: 0.3, // 新武器首次发射延迟
  retryDelay: 0.2, // 没有目标时的重试间隔
  talismanFan: 0.12, // 多张符纸的扇形间隔（弧度）
  inkPoolOffset: 0.6, // 墨迹落在刀光半径的比例处
  inkSlowExtra: 0.2, // 墨迹减速比跳伤间隔多持续的秒数
  coinswordMaxLife: 6,
  coinswordSpin: 14,
  coinswordReturnMul: 1.15,
  firecrackerR: 6,
  summonOffset: 36, // 纸人跟随玩家时的距离
  summonReach: 2,
  explosionLife: 0.3,
  chainLife: 0.25,
};

// ───────────────────────── 法器（PLAN §3.4）─────────────────────────
// perLevel 为每级增量；scissors 的数量/伤害按级别单独处理
export const RELICS = {
  clapper: { name: '梆子', pair: 'gong', perLevel: { cdr: 0.08 } },
  censer: { name: '香炉', pair: 'lantern', perLevel: { areaPct: 0.10 } },
  cinnabar: { name: '朱砂', pair: 'talisman', perLevel: { dmgPct: 0.08 } },
  inkstone: { name: '砚台', pair: 'brush', perLevel: { durPct: 0.10 } },
  bagua: { name: '八卦镜', pair: 'coinsword', perLevel: { armor: 1, maxHp: 10 } },
  scissors: { name: '剪刀', pair: 'paperman', amountLevels: [2, 5], dmgPerOtherLevel: 0.04 },
  tinder: { name: '火折子', pair: 'firecracker', perLevel: { xpPct: 0.08, pickupPct: 0.10 } },
  redstring: { name: '红绳', pair: 'bell', perLevel: { critChance: 0.05 } },
};
export const RELIC_IDS = Object.keys(RELICS);
export const RELIC_NAMES = Object.fromEntries(RELIC_IDS.map((k) => [k, RELICS[k].name]));
export const MAX_RELIC_LEVEL = 5;
export const MAX_RELICS = 4;

// ───────────────────────── 英雄（PLAN §4.7）─────────────────────────
export const HEROES = {
  zhou: {
    id: 'zhou', name: '打更人·老周', short: '老周', startWeapon: 'gong',
    trait: '大招攒气 +25%', mods: { ultChargePct: 0.25 },
    unlock: { kind: 'default', desc: '默认' },
  },
  mian: {
    id: 'mian', name: '纸扎匠·阿绵', short: '阿绵', startWeapon: 'paperman',
    trait: '召唤物伤害 +20%，最大生命 −10%', mods: { summonDmgPct: 0.2, maxHpPct: -0.1 },
    unlock: { kind: 'kills', value: 800, desc: '单局打败 800 只敌人' },
  },
  daotong: {
    id: 'daotong', name: '小道童', short: '小道童', startWeapon: 'talisman',
    trait: '暴击率 +10%', mods: { critChance: 0.1 },
    unlock: { kind: 'noBunWatch5', value: 480, desc: '不吃一个包子守到五更（撑到 8:00）' },
  },
};
export const HERO_IDS = Object.keys(HEROES);

// ───────────────────────── 大招「敲更锣」（PLAN §3.5）─────────────────────────
export const ULT = {
  max: 100,
  killCharge: 1, // 普通击杀 +1
  eliteCharge: 10, // 精英 +10
  bossCharge: 30,
  // 普通击杀攒气随时间衰减：× 1/(1 + decayPerMin × m)，让主线大约 60–90 秒放一次
  decayPerMin: 1.8,
  radius: 220,
  baseDmg: 110,
  perLevelDmg: 22,
  knockback: 420,
  pulseLife: 0.5,
};

// ───────────────────────── 拾取物（PLAN §3.6）─────────────────────────
export const PICKUPS = {
  xpTier2: 3, // value ≥ 3 → 2 档
  xpTier3: 10, // value ≥ 10 → 3 档
  xpOrbCap: 220, // 魂火数量上限，超出后合并到最近的魂火上
  magnetAccel: 1400,
  magnetStartSpeed: 160,
  coinChance: 0.04, // 普通敌人掉铜钱概率
  coinValue: 1,
  eliteCoinValue: 3,
  bossCoinValue: 20,
  bunHeal: 30,
  touchRadius: 26, // 包子 / 幡 / 供盒：贴近即拾取
  bossXpSplit: 8, // Boss 魂火拆成多颗
};

// ───────────────────────── 场景道具 ─────────────────────────
export const PROPS = {
  chunk: 480,
  activeRadius: 1, // 以玩家所在区块为中心的 (2r+1)² 个区块
  lanternpostMax: 2, // 每区块灯笼柱 0..2
  lanternpostChance: 0.75,
  wellChance: 0.22,
  archChance: 0.14,
  lanternpostR: 12,
  wellR: 22,
  archR: 30,
  lanternpostHp: 1,
  safeRadius: 120, // 出生点附近不放道具
  // 灯笼柱掉落
  drop: { bun: 0.6, coin: 0.3, banner: 0.1 },
};

// ───────────────────────── 升级三选一（levelup.js 用）─────────────────────────
export const LEVELUP = {
  choices: 3,
  wOwnedWeapon: 3.0,
  wOwnedRelic: 2.0,
  wNewWeapon: 1.2,
  wNewRelic: 1.0,
  pairBonus: 1.5, // 新法器正好配对已有武器
  evolvableBonus: 1.6, // 这次升级会让某把武器满足开光条件
  coinValue: 15, // 「铜钱」保底签
  bunHeal: 40, // 「包子」保底签
};

// 供盒：不满足开光时随机升级 1–3 件器物
export const CHEST = {
  upgradeCountWeights: [
    { n: 1, w: 50 },
    { n: 2, w: 35 },
    { n: 3, w: 15 },
  ],
  fallbackCoins: 25,
};

// ───────────────────────── 铜钱结算 ─────────────────────────
export const COIN_REWARD = {
  perMinute: 5, // 每坚持 1 分钟的基础铜钱（6 分钟死约 140–160，通关约 350–420）
  clearBonus: 55, // 通关额外
  endlessPerMinute: 12,
  nightPct: 0.15, // 夜色每级 +15%
};

// ───────────────────────── 夜色 1–10（PLAN §4.7）─────────────────────────
// 每级：敌人生命 +15%（见 enemyHpScale）、精英更频繁（ELITE.perNight），并累加一条词缀
export const NIGHT_AFFIXES = [
  null,
  { id: 'shadeFast', name: '影祟加速', mods: { shadeSpeedMul: 1.25 } },
  { id: 'bunHalf', name: '包子减半', mods: { bunHealMul: 0.5 } },
  { id: 'swift', name: '群鬼疾行', mods: { enemySpeedMul: 1.08 } },
  { id: 'eliteTough', name: '精英更硬', mods: { eliteHpMul: 1.3 } },
  { id: 'horde', name: '百鬼成群', mods: { spawnMul: 1.15 } },
  { id: 'sharp', name: '阴气伤人', mods: { contactDmgMul: 1.2 } },
  { id: 'bossTough', name: '夜主更凶', mods: { bossHpMul: 1.25 } },
  { id: 'dim', name: '魂火黯淡', mods: { xpMul: 0.9 } },
  { id: 'horde2', name: '鬼门大开', mods: { spawnMul: 1.15 } },
  { id: 'weaselRush', name: '黄皮子扑得更快', mods: { weaselDashMul: 1.3 } },
];
export const MAX_NIGHT = 10;

/** 汇总夜色等级 1..N 的全部词缀（乘算叠加） */
export function nightModifiers(level) {
  const m = {
    shadeSpeedMul: 1, bunHealMul: 1, enemySpeedMul: 1, eliteHpMul: 1, spawnMul: 1,
    contactDmgMul: 1, bossHpMul: 1, xpMul: 1, weaselDashMul: 1,
    eliteChance: ELITE.baseChance + ELITE.perNight * level,
    affixes: [],
  };
  for (let i = 1; i <= Math.min(level, MAX_NIGHT); i++) {
    const a = NIGHT_AFFIXES[i];
    for (const [k, v] of Object.entries(a.mods)) m[k] *= v;
    m.affixes.push(a.name);
  }
  return m;
}

// ───────────────────────── 更房（PLAN §4.6）─────────────────────────
// 价格：PLAN 写的是 floor(60·ℓ^1.6)，但同时给出的表是 60/181/347/553/794（单项合计 1,935）。
// 两者在 4、5 级不完全一致（公式算出 551/787），这里以 PLAN 给出的价目表为准，保证与文案一致。
export const META_COSTS = [60, 181, 347, 553, 794];
export const META_MAX_LEVEL = 5;

/** 从 level-1 升到 level 的价格（level 1..5）；超出返回 Infinity */
export function metaCost(level) {
  return level >= 1 && level <= META_MAX_LEVEL ? META_COSTS[level - 1] : Infinity;
}

export const META_SHOP = [
  { id: 'tizhi', name: '体魄', stat: 'maxHpPct', perLevel: 0.05, desc: '最大生命 +5%' },
  { id: 'lidao', name: '力道', stat: 'dmgPct', perLevel: 0.03, desc: '伤害 +3%' },
  { id: 'jiaoli', name: '脚力', stat: 'speedPct', perLevel: 0.03, desc: '移速 +3%' },
  { id: 'yanli', name: '眼力', stat: 'pickupPct', perLevel: 0.06, desc: '拾取范围 +6%' },
  { id: 'wuxing', name: '悟性', stat: 'xpPct', perLevel: 0.03, desc: '经验 +3%' },
  { id: 'caiyun', name: '财运', stat: 'coinPct', perLevel: 0.05, desc: '铜钱 +5%' },
  { id: 'jiyuan', name: '机缘', stat: 'freeRerolls', atLevels: [2, 4], desc: '2 级、4 级各 +1 次免费换签' },
  { id: 'huchi', name: '护持', stat: 'armor', atLevels: [3, 5], desc: '3 级、5 级各 +1 护甲' },
].map((it) => ({ ...it, maxLevel: META_MAX_LEVEL, costs: META_COSTS }));
export const META_IDS = META_SHOP.map((it) => it.id);

export function emptyMetaBonuses() {
  return { maxHpPct: 0, dmgPct: 0, speedPct: 0, pickupPct: 0, xpPct: 0, coinPct: 0, freeRerolls: 0, armor: 0 };
}

/** levels: { tizhi: 0..5, ... } → 局外加成（ARCHITECTURE §5 的 getMetaBonuses 形状） */
export function metaBonusesFromLevels(levels = {}) {
  const b = emptyMetaBonuses();
  for (const it of META_SHOP) {
    const lv = Math.max(0, Math.min(META_MAX_LEVEL, Math.floor(levels[it.id] || 0)));
    if (it.atLevels) b[it.stat] += it.atLevels.filter((x) => lv >= x).length;
    else b[it.stat] += +(it.perLevel * lv).toFixed(4);
  }
  return b;
}

/** 某项更房在 level 级时的效果文案 */
export function describeMeta(id, level) {
  const it = META_SHOP.find((x) => x.id === id);
  if (!it) return '';
  if (it.atLevels) {
    const n = it.atLevels.filter((x) => level >= x).length;
    return it.stat === 'armor' ? `护甲 +${n}` : `免费换签 +${n}`;
  }
  const label = { maxHpPct: '最大生命', dmgPct: '伤害', speedPct: '移速', pickupPct: '拾取范围', xpPct: '经验', coinPct: '铜钱' }[it.stat];
  return `${label} +${Math.round(it.perLevel * level * 100)}%`;
}
