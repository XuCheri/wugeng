// 升级三选一（PLAN §2.4 / §3）：权重、保底、溢出签，以及签面文案。
// 规则：
//  · 已拥有且未满级的器物权重最高（构筑会收敛）；
//  · 只有槽位有空时才会出现新器物；
//  · 让某把武器满足开光条件的签有额外权重，并标记 evolvable；
//  · 所有器物都满级后改出「溢出签」（伤害 ×1.12 乘算）；候选不足 3 张时用「铜钱」「包子」保底。

import {
  WEAPONS, WEAPON_IDS, RELICS, RELIC_IDS, MAX_WEAPON_LEVEL, MAX_RELIC_LEVEL, MAX_WEAPONS, MAX_RELICS,
  LEVELUP, DAMAGE, WEAPON_NAMES, RELIC_NAMES, EVOLVED_NAMES,
} from './balance.js';
import { getWeapon, addOrUpgradeWeapon } from './weapons.js';
import { getRelic, addOrUpgradeRelic, relicEffect } from './relics.js';
import { recomputeMods, healPlayer } from './player.js';

/** 拿了这张签之后，是否会有武器满足开光条件（且此前不满足） */
function makesEvolvable(run, kind, id) {
  if (kind === 'weapon') {
    const w = getWeapon(run, id);
    return !!w && !w.evolved && w.level === MAX_WEAPON_LEVEL - 1 && !!getRelic(run, WEAPONS[id].pair);
  }
  if (kind === 'relic' && !getRelic(run, id)) {
    const w = getWeapon(run, RELICS[id].pair);
    return !!w && !w.evolved && w.level >= MAX_WEAPON_LEVEL;
  }
  return false;
}

/** 所有合法的器物候选（带权重） */
export function candidateChoices(run) {
  const out = [];
  const add = (kind, id, level, isNew, weight) => {
    const evolvable = makesEvolvable(run, kind, id);
    out.push({ kind, id, level, isNew, evolvable, weight: weight * (evolvable ? LEVELUP.evolvableBonus : 1) });
  };
  for (const w of run.weapons) if (w.level < MAX_WEAPON_LEVEL) add('weapon', w.id, w.level + 1, false, LEVELUP.wOwnedWeapon);
  for (const r of run.relics) if (r.level < MAX_RELIC_LEVEL) add('relic', r.id, r.level + 1, false, LEVELUP.wOwnedRelic);
  if (run.weapons.length < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) if (!getWeapon(run, id)) add('weapon', id, 1, true, LEVELUP.wNewWeapon);
  }
  if (run.relics.length < MAX_RELICS) {
    for (const id of RELIC_IDS) {
      if (getRelic(run, id)) continue;
      const paired = !!getWeapon(run, RELICS[id].pair);
      add('relic', id, 1, true, LEVELUP.wNewRelic * (paired ? LEVELUP.pairBonus : 1));
    }
  }
  return out;
}

export function allMaxed(run) {
  return (
    run.weapons.length >= MAX_WEAPONS && run.relics.length >= MAX_RELICS &&
    run.weapons.every((w) => w.level >= MAX_WEAPON_LEVEL) && run.relics.every((r) => r.level >= MAX_RELIC_LEVEL)
  );
}

function strip(c) {
  return { kind: c.kind, id: c.id, level: c.level, isNew: c.isNew, evolvable: c.evolvable };
}

/** 生成三选一 */
export function generateChoices(run) {
  const n = LEVELUP.choices;
  const pool = candidateChoices(run);
  const picked = [];
  while (picked.length < n && pool.length) {
    const c = run.rng.weighted(pool, (x) => x.weight);
    pool.splice(pool.indexOf(c), 1);
    picked.push(strip(c));
  }
  if (!picked.length && allMaxed(run)) {
    picked.push({ kind: 'overflow', id: 'overflow', level: run.mods.overflowStacks + 1, isNew: false, evolvable: false });
  }
  const fillers = [
    { kind: 'coin', id: 'coin', level: 0, isNew: false, evolvable: false },
    { kind: 'bun', id: 'bun', level: 0, isNew: false, evolvable: false },
  ];
  for (const f of fillers) if (picked.length < n) picked.push(f);
  run.choices = picked;
  return picked;
}

/** 应用一张签；返回是否成功 */
export function applyChoice(run, c) {
  switch (c.kind) {
    case 'weapon':
      if (!addOrUpgradeWeapon(run, c.id)) return false;
      break;
    case 'relic':
      if (!addOrUpgradeRelic(run, c.id)) return false;
      break;
    case 'overflow':
      run.mods.overflowMult *= DAMAGE.overflowMult;
      run.mods.overflowStacks++;
      break;
    case 'coin':
      run.stats.coins += LEVELUP.coinValue;
      break;
    case 'bun':
      healPlayer(run, LEVELUP.bunHeal);
      break;
    default:
      return false;
  }
  recomputeMods(run);
  return true;
}

// ───────────────────────── 签面文案 ─────────────────────────

const WEAPON_INTRO = {
  gong: '以自身为中心敲出震波，击退周围敌人',
  lantern: '灯笼绕身旋转，持续灼烧碰到的敌人',
  talisman: '自动追踪最近敌人的符纸',
  brush: '朝移动方向扇形挥砍',
  coinsword: '掷出回旋的铜钱剑，来回穿透',
  paperman: '召唤纸人冲向敌人撕咬',
  firecracker: '把爆竹抛向敌人最密集处，范围爆炸',
  bell: '铜铃声在敌人之间弹跳连锁',
};

const EVOLVED_INTRO = {
  gong: '连震三次，并定身敌人',
  lantern: '常驻火环，被烧死的敌人会爆开',
  talisman: '符纸可穿透，命中时连锁',
  brush: '前后两刀，在地上留下墨迹持续伤害',
  coinsword: '七剑环绕后齐射',
  paperman: '一队 8 个纸人巡游',
  firecracker: '连环爆炸',
  bell: '每次弹跳分叉',
};

const STAT_LABELS = [
  ['dmg', '伤害', ''],
  ['count', '数量', ''],
  ['bounces', '弹跳', '次'],
  ['radius', '半径', ''],
  ['spread', '角度', '°'],
  ['cd', '冷却', '秒'],
];

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function weaponDesc(id, level) {
  const def = WEAPONS[id];
  if (level <= 1) {
    const parts = [];
    for (const [k, label, unit] of STAT_LABELS) {
      if (Array.isArray(def[k]) && (k === 'dmg' || k === 'count' || k === 'bounces')) parts.push(`${label} ${fmt(def[k][0])}${unit}`);
    }
    return `${WEAPON_INTRO[id]}（${parts.join('，')}）`;
  }
  const diffs = [];
  for (const [k, label, unit] of STAT_LABELS) {
    const arr = def[k];
    if (!Array.isArray(arr)) continue;
    const a = arr[level - 2];
    const b = arr[level - 1];
    if (a !== b) diffs.push(`${label} ${fmt(a)}→${fmt(b)}${unit}`);
  }
  return diffs.join('，') || '全面强化';
}

const RELIC_FIELD_TEXT = {
  cdr: (v) => `冷却 −${Math.round(v * 100)}%`,
  areaPct: (v) => `范围 +${Math.round(v * 100)}%`,
  dmgPct: (v) => `伤害 +${Math.round(v * 100)}%`,
  durPct: (v) => `持续时间和弹速 +${Math.round(v * 100)}%`,
  armor: (v) => `护甲 +${v}`,
  maxHp: (v) => `最大生命 +${v}`,
  amount: (v) => `数量 +${v}`,
  xpPct: (v) => `经验 +${Math.round(v * 100)}%`,
  pickupPct: (v) => `拾取范围 +${Math.round(v * 100)}%`,
  critChance: (v) => `暴击率 +${Math.round(v * 100)}%`,
};

function relicDesc(id, level) {
  // 本级增量 + 累计
  const now = relicEffect(id, level);
  const prev = relicEffect(id, level - 1);
  const step = [];
  const total = [];
  for (const k of Object.keys(RELIC_FIELD_TEXT)) {
    const d = +(now[k] - prev[k]).toFixed(4);
    if (d) step.push(RELIC_FIELD_TEXT[k](d));
    if (now[k]) total.push(RELIC_FIELD_TEXT[k](+now[k].toFixed(4)));
  }
  const pairName = WEAPON_NAMES[RELICS[id].pair];
  const s = step.join('，');
  return level <= 1 ? `${s}（可让${pairName}开光）` : `${s}（累计 ${total.join('，')}）`;
}

/**
 * 签面文案：{ kind, id, name, level, levelText, desc, isNew, evolvable, evolveHint }
 * UI 直接渲染：竖排 name、一行 desc、isNew 盖「新」字印、evolvable 时显示 evolveHint。
 */
export function describeUpgrade(choice) {
  const c = choice;
  const base = { kind: c.kind, id: c.id, level: c.level, isNew: !!c.isNew, evolvable: !!c.evolvable, evolveHint: '' };
  switch (c.kind) {
    case 'weapon': {
      const d = WEAPONS[c.id];
      return {
        ...base, name: WEAPON_NAMES[c.id], levelText: c.isNew ? '新' : `${c.level} 级`, desc: weaponDesc(c.id, c.level),
        evolveHint: c.evolvable ? `已可开光：打败夜主开供盒 → ${EVOLVED_NAMES[c.id]}` : `满级 + ${RELIC_NAMES[d.pair]} → ${EVOLVED_NAMES[c.id]}`,
      };
    }
    case 'relic':
      return {
        ...base, name: RELIC_NAMES[c.id], levelText: c.isNew ? '新' : `${c.level} 级`, desc: relicDesc(c.id, c.level),
        evolveHint: c.evolvable ? `已可开光：打败夜主开供盒 → ${EVOLVED_NAMES[RELICS[c.id].pair]}` : '',
      };
    case 'overflow':
      return { ...base, name: '溢出签', levelText: `第 ${c.level} 签`, desc: `所有伤害 ×${DAMAGE.overflowMult}（乘算）` };
    case 'coin':
      return { ...base, name: '铜钱', levelText: '', desc: `铜钱 +${LEVELUP.coinValue}` };
    case 'bun':
      return { ...base, name: '包子', levelText: '', desc: `回复 ${LEVELUP.bunHeal} 生命` };
    default:
      return { ...base, name: '', levelText: '', desc: '' };
  }
}

/** 开光后武器的名称与说明（供盒界面用） */
export function describeEvolution(weaponId) {
  return { id: weaponId, name: EVOLVED_NAMES[weaponId], from: WEAPON_NAMES[weaponId], desc: EVOLVED_INTRO[weaponId] };
}
