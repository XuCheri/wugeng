// 守夜功绩成就系统（F9：20 项分类功绩，完整保留 7 项经典 ID，奖励涵盖新兵刃、典藏皮肤、玄霜特效与铜钱赏格）
import {
  DEFAULT_UNLOCKED_WEAPONS,
  HERO_IDS,
  WEAPON_IDS,
  canMutateArray,
  canMutateObj,
  canWriteProp,
  isPlainObj,
  markAchievement,
  toFiniteNumber,
} from './save.js';
import { getCodexCounts } from './codex.js';
import { grantCosmeticUnlock } from './cosmetics.js';

const safeNum = (v, max = 1e15) => {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
};
const safeInt = (v, max = 1e12) => Math.floor(safeNum(v, max));

function effectiveBestScore(save) {
  const lbBest = safeInt(save?.leaderboard?.bestScore, 1e12);
  const st = isPlainObj(save?.stats) ? save.stats : {};
  const est = safeInt(st.bestKills, 1e9) * 10
    + Math.floor(safeNum(st.bestTimeSec, 1e9)) * 15
    + (safeInt(st.clears, 1e9) > 0 ? 5000 : 0);
  return Math.max(lbBest, est);
}

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'combat', label: '守夜斩祟' },
  { id: 'arsenal', label: '神兵百器' },
  { id: 'challenge', label: '险境奇功' },
  { id: 'honor', label: '同守天榜' },
];

export const ACHIEVEMENTS = [
  // ── 7 项原版经典成就（完整保留 ID 与判定语义） ──
  {
    id: 'firstClear',
    category: 'challenge',
    name: '头回见天亮',
    desc: '守过五更击败夜游神，头一回见到鸡鸣天亮',
    target: 1,
    reward: { type: 'coins', amount: 300, label: '铜钱 +300' },
    rawCurrent: (s) => Math.max(s?.achievements?.firstClear ? 1 : 0, Math.min(1, safeInt(s?.stats?.clears))),
  },
  {
    id: 'kills800',
    category: 'combat',
    name: '一夜八百鬼',
    desc: '单局打散 800 只邪祟',
    target: 800,
    reward: { type: 'coins', amount: 260, label: '铜钱 +260' },
    rawCurrent: (s) => Math.max(s?.achievements?.kills800 ? 800 : 0, safeInt(s?.stats?.bestKills)),
  },
  {
    id: 'noBun480',
    category: 'challenge',
    name: '饿着肚子守到五更',
    desc: '前 480 秒滴水不食包子，熬进五更',
    target: 480,
    reward: { type: 'coins', amount: 320, label: '铜钱 +320' },
    rawCurrent: (s) => (s?.achievements?.noBun480 ? 480 : 0),
  },
  {
    id: 'endless10',
    category: 'challenge',
    name: '残夜又守十分钟',
    desc: '进入残夜无尽后单局累计撑满 1200 秒（20 分钟）',
    target: 1200,
    reward: { type: 'coins', amount: 420, label: '铜钱 +420' },
    rawCurrent: (s) => {
      if (s?.achievements?.endless10) return 1200;
      const clears = safeInt(s?.stats?.clears);
      const endlessBest = safeInt(s?.leaderboard?.bestEndlessSec);
      if (endlessBest >= 600) return 1200;
      return clears > 0 ? Math.floor(safeNum(s?.stats?.bestTimeSec)) : 0;
    },
  },
  {
    id: 'hit10k',
    category: 'combat',
    name: '一击过万',
    desc: '单次伤害突破 10000',
    target: 10000,
    reward: { type: 'coins', amount: 240, label: '铜钱 +240' },
    rawCurrent: (s) => Math.max(s?.achievements?.hit10k ? 10000 : 0, Math.floor(safeNum(s?.stats?.bestHit))),
  },
  {
    id: 'hit100m',
    category: 'combat',
    name: '一击过亿',
    desc: '单次伤害突破 100000000',
    target: 100000000,
    reward: { type: 'coins', amount: 880, label: '铜钱 +880' },
    rawCurrent: (s) => Math.max(s?.achievements?.hit100m ? 100000000 : 0, Math.floor(safeNum(s?.stats?.bestHit))),
  },
  {
    id: 'night10',
    category: 'honor',
    name: '夜色十，天照亮',
    desc: '通关最高难度「夜色十」',
    target: 10,
    reward: { type: 'coins', amount: 1000, label: '铜钱 +1000' },
    rawCurrent: (s) => {
      if (s?.achievements?.night10) return 10;
      const nc = toFiniteNumber(s?.nightCleared);
      return Number.isFinite(nc) && nc >= 0 ? Math.floor(nc) : 0;
    },
  },

  // ── 2 项专属新兵刃解锁功绩 ──
  {
    id: 'totalKills1500',
    category: 'arsenal',
    name: '桃木诛邪',
    desc: '累计打散 1500 只邪祟，获赠道门飞剑秘器',
    target: 1500,
    reward: { type: 'weapon', weaponId: 'taomujian', label: '解锁兵刃「桃木飞剑」' },
    rawCurrent: (s) => safeInt(s?.stats?.totalKills),
  },
  {
    id: 'evolve5',
    category: 'arsenal',
    name: '火鸦破夜',
    desc: '累计敕封开光 5 把神兵，习得机关火鸦奇术',
    target: 5,
    reward: { type: 'weapon', weaponId: 'zhinian_kite', label: '解锁兵刃「纸鸢火鸦」' },
    rawCurrent: (s) => safeInt(s?.stats?.totalEvolutions),
  },

  // ── 3 项角色典藏皮肤 + 1 项攻击特效解锁功绩 ──
  {
    id: 'night5',
    category: 'honor',
    name: '五重镇岳',
    desc: '通关「夜色五」或更高难度',
    target: 5,
    reward: { type: 'skin', skinId: 'zhou_imperial_bell', heroId: 'zhou', label: '解锁皮肤「紫金鸣鸿甲」' },
    rawCurrent: (s) => {
      const nc = toFiniteNumber(s?.nightCleared);
      return Number.isFinite(nc) && nc >= 0 ? Math.floor(nc) : 0;
    },
  },
  {
    id: 'evolve12',
    category: 'arsenal',
    name: '万法开光',
    desc: '累计敕封开光 12 把神兵',
    target: 12,
    reward: { type: 'skin', skinId: 'daotong_jade_immortal', heroId: 'daotong', label: '解锁皮肤「碧落乘鹤衣」' },
    rawCurrent: (s) => safeInt(s?.stats?.totalEvolutions),
  },
  {
    id: 'score50k',
    category: 'honor',
    name: '名动五更榜',
    desc: '单局综合守夜积分突破 50000 分',
    target: 50000,
    reward: { type: 'skin', skinId: 'yinyang_gold_oracle', heroId: 'yinyang', label: '解锁皮肤「鎏金太乙诏」' },
    rawCurrent: (s) => effectiveBestScore(s),
  },
  {
    id: 'endless15',
    category: 'challenge',
    name: '玄霜孤月',
    desc: '单局守夜存活时长达到 900 秒（15 分钟）',
    target: 900,
    reward: { type: 'vfx', vfxId: 'frost_moon', label: '解锁特效「玄霜寒月」' },
    rawCurrent: (s) => Math.floor(safeNum(s?.stats?.bestTimeSec)),
  },

  // ── 7 项进阶守夜挑战与收集功绩 ──
  {
    id: 'bossKills3',
    category: 'combat',
    name: '三斩夜主',
    desc: '累计打散 3 尊夜主首领',
    target: 3,
    reward: { type: 'coins', amount: 280, label: '铜钱 +280' },
    rawCurrent: (s) => safeInt(s?.stats?.totalBossKills),
  },
  {
    id: 'bossKills15',
    category: 'combat',
    name: '威镇百鬼王',
    desc: '累计打散 15 尊夜主首领',
    target: 15,
    reward: { type: 'coins', amount: 520, label: '铜钱 +520' },
    rawCurrent: (s) => safeInt(s?.stats?.totalBossKills),
  },
  {
    id: 'totalKills8000',
    category: 'combat',
    name: '万邪莫近',
    desc: '累计打散 8000 只邪祟',
    target: 8000,
    reward: { type: 'coins', amount: 480, label: '铜钱 +480' },
    rawCurrent: (s) => safeInt(s?.stats?.totalKills),
  },
  {
    id: 'heroes4',
    category: 'arsenal',
    name: '更房聚义',
    desc: '解锁至少 4 名守夜打更人',
    target: 4,
    reward: { type: 'coins', amount: 320, label: '铜钱 +320' },
    rawCurrent: (s) => (Array.isArray(s?.unlockedHeroes)
      ? HERO_IDS.filter((h) => s.unlockedHeroes.includes(h)).length
      : 1),
  },
  {
    id: 'codex30',
    category: 'arsenal',
    name: '百物通晓',
    desc: '百物谱累计收录达到 30 项',
    target: 30,
    reward: { type: 'coins', amount: 360, label: '铜钱 +360' },
    rawCurrent: (s) => getCodexCounts(s).have,
  },
  {
    id: 'clears5',
    category: 'challenge',
    name: '五度破晓',
    desc: '累计守满五更通关 5 回',
    target: 5,
    reward: { type: 'coins', amount: 460, label: '铜钱 +460' },
    rawCurrent: (s) => safeInt(s?.stats?.clears),
  },
  {
    id: 'coop3',
    category: 'honor',
    name: '同守五更灯',
    desc: '参与同守五更联机或画阵扶起队友累计 3 次',
    target: 3,
    reward: { type: 'coins', amount: 380, label: '铜钱 +380' },
    rawCurrent: (s) => Math.max(safeInt(s?.stats?.coopRuns), safeInt(s?.stats?.coopRevives)),
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const ACHIEVEMENTS_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function isAchievementClaimed(save, id) {
  if (typeof id !== 'string' || !id) return false;
  return Array.isArray(save?.achievementClaims) && save.achievementClaims.includes(id);
}

export function getAchievementProgress(save, id) {
  if (typeof id !== 'string' || !Object.hasOwn(ACHIEVEMENTS_BY_ID, id)) {
    return { id: String(id || ''), current: 0, target: 1, ratio: 0, unlocked: false, claimed: false };
  }
  const def = ACHIEVEMENTS_BY_ID[id];
  const marked = Boolean(isPlainObj(save?.achievements) && save.achievements[id]);
  const raw = Math.max(0, def.rawCurrent(save) || 0);
  const unlocked = marked || raw >= def.target;
  const current = unlocked ? Math.max(raw, def.target) : raw;
  const ratio = def.target > 0 ? Math.min(1, Math.max(0, current / def.target)) : (unlocked ? 1 : 0);
  const claimed = isAchievementClaimed(save, id);
  return {
    id,
    def,
    current,
    target: def.target,
    ratio,
    unlocked,
    claimed,
    claimable: unlocked && !claimed,
  };
}

export function getAchievementStates(save, category = 'all') {
  const list = category && category !== 'all'
    ? ACHIEVEMENTS.filter((a) => a.category === category)
    : ACHIEVEMENTS;
  return list.map((a) => getAchievementProgress(save, a.id));
}

export function getUnclaimedAchievementCount(save) {
  let cnt = 0;
  for (const a of ACHIEVEMENTS) {
    const p = getAchievementProgress(save, a.id);
    if (p.claimable) cnt++;
  }
  return cnt;
}

export function reconcileAchievements(save, now = Date.now()) {
  if (!canMutateObj(save)) return [];
  const newlyUnlocked = [];
  for (const a of ACHIEVEMENTS) {
    const p = getAchievementProgress(save, a.id);
    if (p.unlocked && !save.achievements?.[a.id]) {
      if (markAchievement(save, a.id, now)) {
        newlyUnlocked.push(a.id);
      }
    }
  }
  return newlyUnlocked;
}

export function claimAchievement(save, id, now = Date.now()) {
  if (!canMutateObj(save) || typeof id !== 'string' || !Object.hasOwn(ACHIEVEMENTS_BY_ID, id)) {
    return { ok: false, reason: 'invalid' };
  }
  const prog = getAchievementProgress(save, id);
  if (!prog.unlocked) {
    return { ok: false, reason: 'locked' };
  }
  if (!Array.isArray(save.achievementClaims)) {
    if (!canWriteProp(save, 'achievementClaims')) return { ok: false, reason: 'immutable' };
    save.achievementClaims = [];
  } else if (!canMutateArray(save.achievementClaims)) {
    return { ok: false, reason: 'immutable' };
  }
  if (save.achievementClaims.includes(id)) {
    return { ok: false, reason: 'already_claimed' };
  }

  markAchievement(save, id, now);
  save.achievementClaims.push(id);

  const def = ACHIEVEMENTS_BY_ID[id];
  const rw = def.reward;
  if (rw.type === 'coins') {
    const cur = safeInt(save.coins, 1e12);
    if (canWriteProp(save, 'coins')) {
      save.coins = Math.min(1e12, cur + Math.max(0, Math.floor(rw.amount || 0)));
    }
  } else if (rw.type === 'weapon' && rw.weaponId && WEAPON_IDS.includes(rw.weaponId)) {
    if (!Array.isArray(save.unlockedWeapons) && canWriteProp(save, 'unlockedWeapons')) {
      save.unlockedWeapons = [...DEFAULT_UNLOCKED_WEAPONS];
    }
    if (Array.isArray(save.unlockedWeapons) && canMutateArray(save.unlockedWeapons)) {
      if (!save.unlockedWeapons.includes(rw.weaponId)) {
        save.unlockedWeapons.push(rw.weaponId);
      }
    }
    if (isPlainObj(save.codex) && Array.isArray(save.codex.weapons) && canMutateArray(save.codex.weapons)) {
      if (!save.codex.weapons.includes(rw.weaponId)) {
        save.codex.weapons.push(rw.weaponId);
      }
    }
  } else if (rw.type === 'skin' && rw.skinId) {
    grantCosmeticUnlock(save, rw.skinId);
  } else if (rw.type === 'vfx' && rw.vfxId) {
    grantCosmeticUnlock(save, rw.vfxId);
  }

  return { ok: true, id, reward: { ...rw } };
}

export function claimAllAchievements(save, now = Date.now()) {
  if (!canMutateObj(save)) {
    return { ok: false, claimed: [], coinsGained: 0, weaponsUnlocked: [], cosmeticsUnlocked: [] };
  }
  const claimed = [];
  let coinsGained = 0;
  const weaponsUnlocked = [];
  const cosmeticsUnlocked = [];
  for (const a of ACHIEVEMENTS) {
    const res = claimAchievement(save, a.id, now);
    if (res.ok) {
      claimed.push(a.id);
      if (res.reward.type === 'coins') coinsGained += res.reward.amount || 0;
      else if (res.reward.type === 'weapon' && res.reward.weaponId) weaponsUnlocked.push(res.reward.weaponId);
      else if (res.reward.skinId) cosmeticsUnlocked.push(res.reward.skinId);
      else if (res.reward.vfxId) cosmeticsUnlocked.push(res.reward.vfxId);
    }
  }
  return {
    ok: claimed.length > 0,
    claimed,
    coinsGained,
    weaponsUnlocked,
    cosmeticsUnlocked,
  };
}
