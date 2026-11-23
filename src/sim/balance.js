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

// ───────────────────────── 四门流派标签 ─────────────────────────
export const SCHOOL_TAGS = {
  zhenhun: { id: 'zhenhun', name: '镇魂', desc: '震慑控场·破甲鸣锣' },
  daofa: { id: 'daofa', name: '道法', desc: '暴击天雷·穿刺急敕' },
  zhizha: { id: 'zhizha', name: '纸扎', desc: '纸兵疾攻·墨纸裂伤' },
  yangyan: { id: 'yangyan', name: '阳炎', desc: '烈焰扩域·灼魂净夜' },
};
export const SCHOOL_TAG_IDS = ['zhenhun', 'daofa', 'zhizha', 'yangyan'];
export const SCHOOL_NAMES = {
  zhenhun: '镇魂',
  daofa: '道法',
  zhizha: '纸扎',
  yangyan: '阳炎',
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
  hurtInvuln: 0.24, // 受击无敌帧秒数
  hurtPushRadius: 58, // 受击护体震退半径
  hurtPushForce: 220, // 受击护体震退速度脉冲
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
  critKnockMul: 1.35, // 暴击额外击退倍率
};

/** 冷却倍率（带下限） */
export function cooldownMul(cdr, floor = DAMAGE.cooldownFloor) {
  return Math.max(floor, 1 - cdr);
}

/** 玩家实际受到的伤害 */
export function damageTaken(raw, armor) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const a = Number.isFinite(armor) ? armor : 0;
  return Math.max(DAMAGE.minTaken, raw - a);
}

/** 期望伤害公式：D = B × (1 + Σ增伤%) × Crit × M开光 × 溢出 */
export function computeDamage(base, dmgPct, crit, evoMult = 1, overflow = 1, critMult = PLAYER_BASE.critMult) {
  return base * (1 + dmgPct) * (crit ? critMult : 1) * evoMult * overflow;
}

// ───────────────────────── 敌人（PLAN §3.2 + F10）─────────────────────────
// hp/speed/dmg 为基础值；xp 为掉落魂火经验；r 为碰撞半径
export const ENEMIES = {
  paperkid: { name: '纸扎童子', hp: 8, speed: 50, dmg: 5, r: 11, xp: 1 },
  shade: { name: '影祟', hp: 5, speed: 72, dmg: 4, r: 10, xp: 1 },
  lanternghost: { name: '灯笼鬼', hp: 32, speed: 40, dmg: 8, r: 15, xp: 3 },
  weasel: { name: '黄皮子', hp: 23, speed: 70, dmg: 9, r: 12, xp: 2 },
  sedan: { name: '纸轿子', hp: 120, speed: 30, dmg: 12, r: 20, xp: 4 },
  drowned: { name: '水鬼', hp: 54, speed: 50, dmg: 11, r: 13, xp: 3 },
  suona: { name: '吹鼓鬼', hp: 48, speed: 44, dmg: 8, r: 14, xp: 2 },
  paperbride: { name: '红衣纸新娘', hp: 62, speed: 56, dmg: 10, r: 13, xp: 2 },
  cinder: { name: '阴火骷髅', hp: 32, speed: 64, dmg: 9, r: 12, xp: 1 },
  horse: { name: '纸马将军', hp: 3050, speed: 60, dmg: 18, r: 30, xp: 40, boss: true },
  umbrella: { name: '无面伞女', hp: 31000, speed: 52, dmg: 26, r: 28, xp: 80, boss: true },
  youshen: { name: '夜游神', hp: 96000, speed: 58, dmg: 65, r: 40, xp: 0, boss: true },
};
export const ENEMY_IDS = Object.keys(ENEMIES);
export const REGULAR_ENEMY_IDS = ENEMY_IDS.filter((k) => !ENEMIES[k].boss);
export const ENEMY_NAMES = Object.fromEntries(Object.entries(ENEMIES).map(([k, v]) => [k, v.name]));
export const MAX_ENEMY_RADIUS = 40;

export const ENEMY_AI = {
  contactCd: 0.48, // 同一只敌人两次接触伤害的间隔
  separation: 0.55, // 软分离强度（每帧推开重叠量的比例）
  playerSoftSepRatio: 0.85, // 与玩家最小贴合半径系数（防钻入圆心粘人，同时保留接触判定）
  playerSoftPush: 0.65, // 玩家软分离回推系数
  contactBounce: 95, // 普通怪撞击玩家后的微回弹速度
  knockbackDecay: 0.008, // 击退速度每秒保留比例（调优打击反馈）
  maxKnockbackSpeed: 460, // 击退速度上限
  slowMul: 0.5, // 被减速时移速倍率
  // 黄皮子：靠近后停顿蓄力，再定速直线扑击（与分钟移速成长解耦）
  weasel: { triggerDist: 175, pause: 0.72, dashSpeed: 255, dashMul: 3.4, dashTime: 0.52, recover: 1.4 },
  // 纸轿子：打破后裂成 4 个纸扎童子（带短暂出生攻击保护与外扩冲量）
  sedan: { splitCount: 4, splitType: 'paperkid', splitSpread: 26, splitGrace: 0.40, splitImpulse: 135 },
  // 水鬼：减速光环
  drowned: { auraRadius: 88, playerSlow: 0.80, wellMin: 260, wellMax: 720 },
  // 吹鼓鬼：鼓乐增益光环（不叠加）
  suona: { auraRadius: 135, speedBuff: 1.22, dmgBuff: 1.20, holdDist: 165, retreatDist: 95 },
  // 红衣纸新娘：中距游走抛射纸钱弹
  paperbride: {
    preferMin: 149, preferMax: 224, fireCd: 1.18, firstFireMin: 0.48, firstFireMax: 0.90,
    fireRange: 360, bulletSpeed: 230, bulletDmg: 19, bulletR: 7, bulletLife: 3.4, bulletStyle: 'paperMoney',
  },
  // 阴火骷髅：毙命后留阴火核延时爆裂（敌我皆伤）
  cinder: { fuseTime: 0.90, blastRadius: 68, enemyBlastMul: 1.5, playerBlastDmg: 18 },
};

export const BOSS_AI = {
  spawnDist: 430,
  hpMul: 1.65, // Boss 血量整体倍率（校准后）
  firstAttackDelay: 1.5,
  knockbackMul: 0.08,
  leashDist: 700, // 超出这个距离 Boss 会被拉回
  horse: {
    chase: 2.8, windup: 0.92, chargeSpeed: 426, chargeTime: 0.55, gap: 0.22, charges: 3, rest: 1.7,
    rewindMul: 0.65, // 连冲之间的再蓄力 = gap + windup × 0.65
    chargeDmgMul: 1.25,
  },
  umbrella: {
    shieldTime: 5, openTime: 4, shieldDr: 0.7, spinSpeed: 2.4, shieldMoveMul: 0.5, firstRingDelay: 0.3,
    ringInterval: 0.50, ringCount: 20, bulletSpeed: 198, bulletDmg: 34, bulletR: 7, bulletLife: 6,
  },
  youshen: {
    hpMul: 3.42,
    phase2At: 0.88, phase3At: 0.70,
    summonInterval: 2.8, summonCount: 11, summonTypes: ['shade', 'weasel', 'lanternghost'], summonDist: 140,
    spiralInterval: 0.072, spiralArms: 4, spiralTurn: 0.33,
    bulletSpeed: 220, bulletDmg: 51, bulletR: 7, bulletLife: 6,
    enrageSpeedMul: 1.60, enrageSummonInterval: 2.0, enrageRingInterval: 0.46, enrageRingCount: 23, ringTurn: 0.2,
    lungeEvery: 5.6, lungeWindup: 0.75, lungeSpeed: 450, lungeTime: 0.44, lungeDmgMul: 1.90, lungeRecover: 0.25,
  },
};

// 精英：普通敌人的强化版与词缀
export const ELITE = {
  baseChance: 0.028,
  perNight: 0.004, // 夜色每级额外概率
  hpMul: 10,
  rMul: 1.35,
  dmgMul: 1.45,
  xpMul: 5,
  speedMul: 1.05,
  bannerChance: 0.06, // 精英额外掉招魂幡的概率
};

export const ELITE_AFFIXES = {
  paper_armor: { id: 'paper_armor', name: '纸甲', armorHits: 6, dmgReduce: 0.35, kbResist: 0.55 },
  swift_step: { id: 'swift_step', name: '疾行', speedMul: 1.32, slowMul: 0.5 },
  soul_fire: {
    id: 'soul_fire', name: '阴火', fireInterval: 1.85, fireRange: 340, bulletCount: 3, spread: 0.30,
    bulletSpeed: 160, bulletDmg: 15, bulletR: 6, bulletLife: 3.2,
  },
  mirror_twin: { id: 'mirror_twin', name: '分身', splitAtHpRatio: 0.5, twinHpRatio: 0.42, twinOffset: 24 },
  treasure_bearer: { id: 'treasure_bearer', name: '藏宝', hpMul: 1.25, bonusCoins: 12, bunChance: 0.65 },
};
export const ELITE_AFFIX_IDS = Object.keys(ELITE_AFFIXES);

// 巡更小头目：2:30 与 6:00 必落供盒，扩充开光节奏
export const MINI_WARDERS = [
  { id: 'warder_150', time: 150, type: 'sedan', affix: 'paper_armor', name: '巡街轿头', hpMul: 1.8, rMul: 1.15, chest: true },
  { id: 'warder_360', time: 360, type: 'paperbride', affix: 'soul_fire', name: '冥婚喜娘', hpMul: 2.2, rMul: 1.2, chest: true },
];

// ───────────────────────── 刷怪（PLAN §4.3 + §4.4 校准）─────────────────────────
export const SPAWN = {
  cap: 260, // 同屏上限
  ringMin: 430,
  ringMax: 510,
  despawnDist: 820, // 超出这个距离的普通敌人被回收到前方圆环
  bossSpawnMul: 0.55, // 精英夜主在场时刷怪倍率
  youshenSpawnMul: 0.45,
  minuteHpGrowth: 0.44, // 经模拟器校准，使非 Boss 时段压力比落在 0.60–0.95
  minuteHpGrowth2: 0.088,
  nightHpGrowth: 0.15, // HP × (1 + 0.15N)
  rateA: 1.2,
  rateB: 0.55,
  rateC: 0.035,
  rateMul: 0.76,
  hpMul: 2.05,
  watch1LateAt: 52, // 一更后半（玩家升到 3–4 级后）灯笼鬼开始从巷口飘出
  watch2LateAt: 175, // 二更后半纸轿与黄皮子先遣队入场，衔接三更压力
  watch3LateAt: 285, // 三更后半（纸马将军退场后）红衣纸新娘与水鬼冥婚仪仗入场
  // 平滑移速成长曲线：杜绝后期全屏超速粘死
  minuteSpeedGrowth: 0.032,
  speedGrowthCap: 1.35,
  minuteDmgGrowth: 0.22,
};

// 合围：每隔一段时间在玩家四周刷一圈同种敌人向内收拢（考验突围走位）
export const WAVES = {
  enabled: true,
  firstAt: 95,
  every: 27,
  baseCount: 18,
  perMinute: 4.0, // 每分钟多几只
  maxCount: 54,
  radius: 315,
  types: { 1: 'paperkid', 2: 'shade', 3: 'cinder', 4: 'lanternghost', 5: 'shade' },
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
  const n = Number.isFinite(+night) ? Math.max(0, Math.min(MAX_NIGHT, +night)) : 0;
  return SPAWN.hpMul * (1 + SPAWN.minuteHpGrowth * m + SPAWN.minuteHpGrowth2 * m * m) * (1 + SPAWN.nightHpGrowth * n) * Math.pow(ENDLESS.hpGrowth, endlessK);
}

// 每更的刷怪权重（第 5 更同样用于无尽；1b/2b/3b 为后半更过渡）
export const ROSTER = {
  1: { paperkid: 70, shade: 30 },
  '1b': { paperkid: 30, shade: 18, lanternghost: 52 },
  2: { paperkid: 18, shade: 14, lanternghost: 46, cinder: 14, suona: 8 },
  '2b': { paperkid: 11, shade: 12, lanternghost: 30, weasel: 11, sedan: 17, cinder: 10, suona: 9 },
  3: { paperkid: 11, shade: 15, lanternghost: 22, weasel: 17, sedan: 13, cinder: 12, suona: 7, paperbride: 3 },
  '3b': { paperkid: 6, shade: 11, lanternghost: 12, weasel: 15, sedan: 12, drowned: 10, cinder: 10, suona: 6, paperbride: 18 },
  4: { paperkid: 7, shade: 12, lanternghost: 13, weasel: 14, sedan: 13, drowned: 13, cinder: 8, suona: 6, paperbride: 14 },
  5: { paperkid: 10, shade: 16, lanternghost: 15, weasel: 16, sedan: 9, drowned: 12, cinder: 9, suona: 7, paperbride: 6 },
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

// ───────────────────────── 开光总则（F3 / F4）─────────────────────────
export const EVOLUTION = {
  evoCdMul: 0.82, // 开光神兵全局攻击冷却 ×0.82
  pairedMasteryMul: 1.18, // 拥有本命配对法器时开光伤害额外 ×1.18
  resonanceCount: 3, // 同门流派器物 ≥ 3 件即可共鸣开光
};

// ───────────────────────── 武器（12 把：经典 8 + 新增 4）─────────────────────────
export const WEAPONS = {
  gong: {
    name: '更锣', pair: 'clapper', tags: ['zhenhun'], evoName: '五更鸣锣',
    evoDesc: '三叠震魂波聚怪易伤，末响震碎敌弹并重创定身',
    evoMult: 1.85,
    dmg: [14, 19, 25, 31, 38], radius: [70, 80, 90, 100, 110], cd: [2.2, 2.05, 1.9, 1.75, 1.6],
    knockback: 155, pulseLife: 0.35,
    evo: {
      pulses: 3, interval: 0.22, waveRadius: 165, finalRadius: 220, pullForce: 135,
      safeInnerR: 54, staggerStun: 0.45, finalStun: 0.90, vulnDur: 3.0, vulnPct: 0.25,
      finalDmgMul: 1.45, finalKnock: 220, stun: 0.90,
    },
  },
  lantern: {
    name: '灯笼', pair: 'censer', tags: ['yangyan'], evoName: '长明灯',
    evoDesc: '双层火莲疾速灼烧并刻印阳炎，亡魂爆裂、夜主六叠爆燃、照亮扩域',
    evoMult: 1.85,
    count: [1, 2, 2, 3, 3], dmg: [8, 10, 13, 16, 19], tick: 0.5,
    orbitR: [62, 66, 70, 74, 78], hitR: 18, angSpeed: 3.0, knockback: 12,
    evo: {
      ringRadius: 115, innerLotusRadius: 64, tick: 0.25, ringTick: 0.25,
      ringDmgMul: 0.65, innerLotusMul: 0.30, markDuration: 3.0,
      burstRadius: 68, burstDmgMul: 1.30, bossStacks: 6, bossFlareDmgMul: 2.2, bossFlareRadius: 85,
      lightBonusPct: 0.25,
    },
  },
  talisman: {
    name: '符纸', pair: 'cinnabar', tags: ['daofa'], evoName: '天师符阵',
    evoDesc: '齐射增符穿透连锁，首中布下八卦天雷阵四落神雷',
    evoMult: 1.88,
    count: [1, 2, 3, 3, 4], dmg: [12, 15, 18, 21, 25], cd: [1.0, 0.96, 0.92, 0.88, 0.84],
    speed: 350, life: 1.6, r: 8, turnRate: 7.5, seekRange: 290, knockback: 16,
    evo: {
      bonusCount: 2, pierce: 3, chain: 2, chainRange: 135, chainDmgMul: 0.55,
      arrayRadius: 95, arrayLife: 1.8, arrayStrikes: 4, arrayInterval: 0.42, arrayDmgMul: 0.55,
    },
  },
  brush: {
    name: '墨笔', pair: 'inkstone', tags: ['zhizha'], evoName: '泼墨山河',
    evoDesc: '周天泼墨横扫全屏，破空墨浪贯穿群祟并铺开镇邪墨河',
    evoMult: 1.95,
    dmg: [20, 27, 34, 42, 50], spread: [90, 105, 120, 135, 150], radius: [95, 100, 106, 112, 118],
    cd: [1.4, 1.35, 1.3, 1.25, 1.2], arcLife: 0.22, knockback: 105,
    evo: {
      slashRadiusBonus: 22, arcLife: 0.32, waveSpeed: 480, waveRange: 360, waveRadius: 26, waveDmgMul: 0.78,
      poolRadius: 78, poolLife: 2.8, poolTick: 0.40, poolDmgMul: 0.38,
    },
  },
  coinsword: {
    name: '铜钱剑', pair: 'bagua', tags: ['daofa'], evoName: '七星剑阵',
    evoDesc: '北斗七剑索敌往返穿刺，每七剑引发星芒裂阵爆斩',
    evoMult: 1.92,
    dmg: [16, 21, 27, 33, 40], count: [1, 1, 2, 2, 2], cd: [1.8, 1.75, 1.7, 1.65, 1.6],
    range: 225, speed: 380, r: 12, spreadAngle: 0.35, knockback: 28,
    evo: {
      swords: 7, seekRange: 315, speed: 460, range: 315,
      cleaveEvery: 7, cleaveRadius: 75, cleaveDmgMul: 1.35,
    },
  },
  paperman: {
    name: '纸人', pair: 'scissors', tags: ['zhizha'], evoName: '纸扎仪仗',
    evoDesc: '内卫纸甲拦弹护主，外阵红衣纸骑疾驰穿阵冲杀',
    evoMult: 1.88,
    count: [1, 2, 2, 3, 3], dmg: [12, 16, 20, 25, 31], speed: 220, atkCd: 0.30, r: 13,
    seekRange: 300, leash: 520, knockback: 26,
    evo: {
      count: 8, guards: 3, guardR: 52, guardAngSpeed: 2.4, guardBlockR: 15, guardBlockCd: 0.65, guardHitR: 22, guardAtkCd: 0.32,
      cavalry: 4, cavalrySpeed: 320, seekRange: 420, leash: 560, chargeDur: 0.28,
      cavalryHitCd: 0.32, cavalryDmgMul: 1.10, cavalryKnock: 55,
    },
  },
  firecracker: {
    name: '爆竹', pair: 'tinder', tags: ['yangyan'], evoName: '满堂红',
    evoDesc: '多枚红炮齐投，落地绽开六瓣莲花连爆并留灼热余烬场',
    evoMult: 2.15,
    dmg: [24, 32, 40, 49, 58], cd: [2.5, 2.35, 2.2, 2.0, 1.8], radius: [55, 58, 62, 66, 72],
    count: [1, 1, 2, 2, 3], flight: 0.50, range: 275, sample: 12, densityR: 65, knockback: 120,
    evo: {
      bonusCount: 1, flight: 0.44, mainRadiusMul: 1.15, lotusCount: 6, lotusDelay: 0.06,
      lotusSpreadMul: 0.78, lotusRadiusMul: 0.72, lotusDmgMul: 0.40,
      emberLife: 2.0, emberTick: 0.40, emberDmgMul: 0.24,
    },
  },
  bell: {
    name: '铜铃', pair: 'redstring', tags: ['zhenhun'], evoName: '千铃引魂',
    evoDesc: '铃音三十二重裂变清群，孤立夜主承受四叠递增摄魂回响',
    evoMult: 1.90,
    bounces: [3, 4, 5, 6, 7], dmg: [11, 15, 19, 24, 29], cd: [1.5, 1.45, 1.4, 1.35, 1.3],
    range: 235, chainRange: 155, chainLife: 0.25, knockback: 14,
    evo: { forks: 2, maxHits: 32, echoHits: 4, echoStepPct: 0.15, echoDelay: 0.08 },
  },
  compass: {
    name: '罗盘', pair: 'soulwick', tags: ['daofa'], evoName: '天星定穴盘',
    evoDesc: '定穴磁阵强力牵引群祟并附破绽，收阵连爆两重天星余震',
    evoMult: 1.90,
    dmg: [14, 18, 23, 29, 36], radius: [78, 84, 90, 96, 104], cd: [3.0, 2.85, 2.7, 2.55, 2.4],
    count: [1, 1, 1, 1, 1], range: 265, fieldLife: 2.0, tick: 0.40, tickDmgMul: 0.42,
    blastDmgMul: 1.35, pullForce: 115, knockback: 0,
    evo: {
      radiusMul: 1.32, fieldLife: 2.5, tick: 0.32, pullForce: 195, tickDmgMul: 0.50,
      blastDmgMul: 1.25, aftershocks: 2, vulnDur: 2.5, vulnPct: 0.25,
    },
  },
  soulbanner: {
    name: '招魂幡', pair: 'glutinous', tags: ['zhenhun'], evoName: '无常勾魂幡',
    evoDesc: '巨幡往返横扫破除纸甲伞盾，残血斩杀并凝聚护体魂障抵挡伤害',
    evoMult: 1.95,
    dmg: [22, 30, 39, 49, 60], radius: [108, 114, 120, 128, 136], spread: [115, 120, 125, 130, 140],
    cd: [1.9, 1.8, 1.7, 1.6, 1.5], knockback: 135, sweepLife: 0.28,
    vulnDur: 2.5, vulnPct: 0.20, killsPerShield: 45, shieldCd: 14, shieldMax: 1,
    evo: {
      radiusMul: 1.28, spread: 210, doubleSweepDelay: 0.18, secondDmgMul: 1.15,
      executeHpRatio: 0.45, executeBonusMul: 1.20, vulnDur: 4.0, vulnPct: 0.30,
      stunDur: 0.65, killsPerShield: 32, bossHitsPerShield: 8, shieldCd: 10, shieldMax: 2,
    },
  },
  bronze_mirror: {
    name: '照妖铜镜', pair: 'fivecoins', tags: ['daofa', 'yangyan'], evoName: '乾坤赤阳镜',
    evoDesc: '赤阳神光横扫焚毁敌方弹幕，持续照射叠伤并引爆纯阳耀斑',
    evoMult: 1.88,
    dmg: [8, 11, 15, 19, 24], length: [195, 210, 225, 240, 260], width: [18, 20, 22, 24, 26],
    cd: [2.4, 2.28, 2.16, 2.04, 1.9], beamLife: 0.95, tick: 0.15, turnSpeed: 3.4,
    rampPerHit: 0.14, rampMax: 0.84, knockback: 14,
    evo: {
      beamLife: 1.30, lengthMul: 1.22, widthMul: 1.35, tick: 0.12,
      rampPerHit: 0.18, rampMax: 1.26, solarEvery: 8, solarBurstR: 65, solarBurstMul: 1.55,
    },
  },
  paperhorse: {
    name: '纸马镖', pair: 'strawshoes', tags: ['zhizha'], evoName: '百鬼夜行图',
    evoDesc: '成列纸马铁骑贯穿全屏冲阵，铁蹄踏碎敌群连环爆裂',
    evoMult: 1.95,
    count: [1, 2, 2, 3, 3], dmg: [20, 27, 35, 44, 55], cd: [2.1, 1.98, 1.86, 1.74, 1.6],
    speed: 440, span: 560, r: 20, knockback: 105,
    evo: { bonusCount: 2, speed: 520, span: 680, r: 26, trampleExplodeR: 48, trampleExplodeMul: 0.48 },
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

// ───────────────────────── 法器（12 件：经典 8 + 新增 4）─────────────────────────
export const RELICS = {
  clapper: { name: '梆子', pair: 'gong', tags: ['zhenhun'], perLevel: { cdr: 0.08 } },
  censer: { name: '香炉', pair: 'lantern', tags: ['yangyan'], perLevel: { areaPct: 0.10 } },
  cinnabar: { name: '朱砂', pair: 'talisman', tags: ['daofa'], perLevel: { dmgPct: 0.08 } },
  inkstone: { name: '砚台', pair: 'brush', tags: ['zhizha'], perLevel: { durPct: 0.10 } },
  bagua: { name: '八卦镜', pair: 'coinsword', tags: ['daofa'], perLevel: { armor: 1, maxHp: 10 } },
  scissors: { name: '剪刀', pair: 'paperman', tags: ['zhizha'], amountLevels: [2, 5], dmgPerOtherLevel: 0.04 },
  tinder: { name: '火折子', pair: 'firecracker', tags: ['yangyan'], perLevel: { xpPct: 0.08, pickupPct: 0.10 } },
  redstring: { name: '红绳', pair: 'bell', tags: ['zhenhun'], perLevel: { critChance: 0.05 } },
  strawshoes: { name: '草鞋', pair: 'paperhorse', tags: ['zhenhun'], perLevel: { speedPct: 0.06, slowResist: 0.14 } },
  glutinous: { name: '糯米', pair: 'soulbanner', tags: ['zhenhun'], perLevel: { hurtInvuln: 0.04, killHeal: 2 }, killInterval: 35 },
  fivecoins: { name: '五帝钱', pair: 'bronze_mirror', tags: ['daofa', 'yangyan'], perLevel: { critDmg: 0.18, coinPct: 0.10 } },
  soulwick: { name: '引魂灯芯', pair: 'compass', tags: ['zhizha', 'yangyan'], perLevel: { lightPct: 0.08, ultChargePct: 0.10, ultCdRefund: 0.10 } },
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

// ───────────────────────── 英雄专属大招（F10）─────────────────────────
export const ULT = {
  max: 100,
  cost: 100,
  killCharge: 1, // 普通击杀 +1
  eliteCharge: 8, // 精英 +8
  bossCharge: 28,
  // 普通击杀攒气随时间衰减：× 1/(1 + decayPerMin × m)，让主线大约 50–80 秒放一次
  decayPerMin: 2.5,
  radius: 220,
  baseDmg: 85,
  perLevelDmg: 12,
  knockback: 420,
  pulseLife: 0.5,
  zhou: {
    name: '五更镇魂锣',
    radii: [240, 275, 310],
    waveDelays: [0.22, 0.44],
    waveDmgMuls: [0.95, 0.55, 0.70],
    stun: 1.3,
    vulnT: 4.0,
    vulnPct: 0.30,
  },
  mian: {
    name: '百鬼纸马阵',
    burstR: 155,
    burstDmgMul: 0.65,
    horses: 8,
    horseSpeed: 360,
    horseLife: 1.35,
    horseR: 14,
    horseHitR: 22,
    horseDmgMul: 0.80,
    frenzyT: 5.0,
    frenzyMul: 1.5,
  },
  daotong: {
    name: '九天玄雷敕',
    burstR: 165,
    burstDmgMul: 0.60,
    strikes: 9,
    strikeInterval: 0.09,
    strikeRadius: 64,
    strikeDmgMul: 0.68,
    seekRange: 380,
    stun: 0.6,
  },
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

// ───────────────────────── 场景道具与民俗奇遇地标 ─────────────────────────
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
  drop: { bun: 0.42, coin: 0.43, banner: 0.15 },
};

export const SHRINE_KINDS = ['altar', 'trial', 'peddler'];
export const SHRINES = {
  chunk: 1200,
  activeRadius: 1,
  radius: 24,
  interactRadius: 76,
  starterMinDist: 250,
  starterMaxDist: 380,
  chunkChance: 0.42,
  minSpacing: 380,
  trialDuration: 18,
  trialWaveEvery: 4.5,
  peddlerCosts: { upgrade: 25, seals: 18, elixir: 12 },
  peddlerSealRerolls: 2,
  peddlerSealBanishes: 1,
  peddlerElixirHeal: 60,
  peddlerElixirUlt: 35,
  altarHpPct: 0.30,
  altarUpgradeLevels: 2,
  altarWardInvuln: 3.5,
  altarClearRadius: 180,
};

// ───────────────────────── 升级三选一（levelup.js 用）─────────────────────────
export const LEVELUP = {
  choices: 3,
  wOwnedWeapon: 3.4,
  wOwnedRelic: 2.4,
  wNewWeapon: 0.90,
  wNewRelic: 0.80,
  pairBonus: 1.45, // 新法器正好配对已有武器
  synergyBonus: 1.35, // 同门流派羁绊权重加成
  evolvableBonus: 1.75, // 这次升级会让某把武器满足开光条件
  coinValue: 18, // 「铜钱」保底签
  bunHeal: 40, // 「包子」保底签
  baseBanishes: 2, // 每局基础弃签次数
};

// 供盒：开光神兵或随机升级 1–3 件器物
export const CHEST = {
  upgradeCountWeights: [
    { n: 1, w: 50 },
    { n: 2, w: 35 },
    { n: 3, w: 15 },
  ],
  fallbackCoins: 25,
  evolveUltGrant: 50,
  evolveClearRadius: 180,
  evolvePushForce: 320,
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
  { id: 'shadeFast', name: '影祟加速', mods: { shadeSpeedMul: 1.12 } },
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

/** 规范化夜色等级到整数 [0, MAX_NIGHT]（过滤 NaN / ±Infinity / 越界值） */
export function sanitizeNightLevel(level) {
  if (level == null || typeof level === 'boolean') return 0;
  const n = typeof level === 'string' && level.trim() === '' ? NaN : +level;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_NIGHT, Math.floor(n)));
}

/** 汇总夜色等级 1..N 的全部词缀（乘算叠加） */
export function nightModifiers(level) {
  const lv = sanitizeNightLevel(level);
  const m = {
    shadeSpeedMul: 1, bunHealMul: 1, enemySpeedMul: 1, eliteHpMul: 1, spawnMul: 1,
    contactDmgMul: 1, bossHpMul: 1, xpMul: 1, weaselDashMul: 1,
    eliteChance: ELITE.baseChance + ELITE.perNight * lv,
    affixes: [],
  };
  for (let i = 1; i <= lv; i++) {
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
