// 升级三选一（PLAN §2.4 / §3 + F8）：多路径开光感知权重、弃签（Banish）、留签（Lock）、命签兼容及签面文案。

import {
  WEAPONS, WEAPON_IDS, RELICS, RELIC_IDS, MAX_WEAPON_LEVEL, MAX_RELIC_LEVEL, MAX_WEAPONS, MAX_RELICS,
  LEVELUP, DAMAGE, EVOLUTION, WEAPON_NAMES, RELIC_NAMES, EVOLVED_NAMES, SCHOOL_NAMES,
} from './balance.js';
import { getWeapon, addOrUpgradeWeapon, getEvolutionRecipe, canEvolve, countOwnedTag } from './weapons.js';
import { getRelic, addOrUpgradeRelic, relicEffect } from './relics.js';
import { recomputeMods, healPlayer, earnCoins } from './player.js';
import { applyBlessingChoice } from './blessings.js';

/** 模拟拾取/升级 (kind, id) 后，是否会让某把原本未达标的武器新满足多路径开光条件；返回该武器 ID 或 null */
export function findNewlyEvolvableWeapon(run, kind, id) {
  const prevReady = new Set();
  for (const w of run.weapons) {
    if (w.evolved || canEvolve(run, w)) prevReady.add(w.id);
  }

  const simWeapons = run.weapons.map((w) => ({ ...w }));
  const simRelics = run.relics.map((r) => ({ ...r }));

  if (kind === 'weapon') {
    const sw = simWeapons.find((w) => w.id === id);
    if (sw) {
      if (sw.level >= MAX_WEAPON_LEVEL) return null;
      sw.level++;
    } else if (simWeapons.length < MAX_WEAPONS) {
      simWeapons.push({ id, level: 1, evolved: false, altarReady: false });
    } else {
      return null;
    }
  } else if (kind === 'relic') {
    const sr = simRelics.find((r) => r.id === id);
    if (sr) {
      if (sr.level >= MAX_RELIC_LEVEL) return null;
      sr.level++;
    } else if (simRelics.length < MAX_RELICS) {
      simRelics.push({ id, level: 1 });
    } else {
      return null;
    }
  } else {
    return null;
  }

  const simRun = {
    weapons: simWeapons,
    relics: simRelics,
    _allSchoolBonus: run._allSchoolBonus || 0,
  };
  for (const sw of simWeapons) {
    if (!sw.evolved && !prevReady.has(sw.id) && getEvolutionRecipe(simRun, sw)) {
      return sw.id;
    }
  }
  return null;
}

/** 所有合法的器物候选（带权重，排除已弃签项） */
export function candidateChoices(run) {
  const out = [];
  const banished = run.banished || [];

  const add = (kind, id, level, isNew, weight) => {
    if (banished.includes(id)) return;
    const evolveTargetId = findNewlyEvolvableWeapon(run, kind, id);
    const evolvable = !!evolveTargetId;
    out.push({
      kind,
      id,
      level,
      isNew,
      evolvable,
      evolveTargetId,
      weight: weight * (evolvable ? LEVELUP.evolvableBonus : 1),
    });
  };

  for (const w of run.weapons) {
    if (w.level < MAX_WEAPON_LEVEL) add('weapon', w.id, w.level + 1, false, LEVELUP.wOwnedWeapon);
  }
  for (const r of run.relics) {
    if (r.level < MAX_RELIC_LEVEL) add('relic', r.id, r.level + 1, false, LEVELUP.wOwnedRelic);
  }
  if (run.weapons.length < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) {
      if (getWeapon(run, id)) continue;
      const sharesTag = WEAPONS[id].tags?.some((t) => countOwnedTag(run, t) > 0);
      add('weapon', id, 1, true, LEVELUP.wNewWeapon * (sharesTag ? LEVELUP.synergyBonus : 1));
    }
  }
  if (run.relics.length < MAX_RELICS) {
    for (const id of RELIC_IDS) {
      if (getRelic(run, id)) continue;
      const paired = !!getWeapon(run, RELICS[id].pair);
      const sharesTag = RELICS[id].tags?.some((t) => countOwnedTag(run, t) > 0);
      const synMul = !paired && sharesTag ? LEVELUP.synergyBonus : 1;
      add('relic', id, 1, true, LEVELUP.wNewRelic * (paired ? LEVELUP.pairBonus : 1) * synMul);
    }
  }
  return out;
}

export function allMaxed(run) {
  return (
    run.weapons.length >= MAX_WEAPONS &&
    run.relics.length >= MAX_RELICS &&
    run.weapons.every((w) => w.level >= MAX_WEAPON_LEVEL) &&
    run.relics.every((r) => r.level >= MAX_RELIC_LEVEL)
  );
}

function strip(c, lockedChoice = null) {
  const tags = c.kind === 'weapon' ? WEAPONS[c.id]?.tags : c.kind === 'relic' ? RELICS[c.id]?.tags : [];
  const locked = !!(lockedChoice && lockedChoice.kind === c.kind && lockedChoice.id === c.id);
  return {
    kind: c.kind,
    id: c.id,
    level: c.level,
    isNew: c.isNew,
    evolvable: c.evolvable,
    evolveTargetId: c.evolveTargetId || null,
    tags: tags ? [...tags] : [],
    locked,
  };
}

/** 生成常规三选一（支持留签跨轮保留） */
export function generateChoices(run) {
  const n = LEVELUP.choices;
  const pool = candidateChoices(run);
  const picked = [];

  if (run.lockedChoice) {
    const lk = run.lockedChoice;
    const idx = pool.findIndex((x) => x.kind === lk.kind && x.id === lk.id);
    if (idx >= 0) {
      const matched = pool.splice(idx, 1)[0];
      picked.push(strip(matched, lk));
    } else if (lk.kind === 'coin' || lk.kind === 'bun') {
      picked.push({
        kind: lk.kind,
        id: lk.kind,
        level: 0,
        isNew: false,
        evolvable: false,
        evolveTargetId: null,
        tags: [],
        locked: true,
      });
    } else if (lk.kind === 'overflow' && (allMaxed(run) || pool.length === 0)) {
      picked.push({
        kind: 'overflow',
        id: 'overflow',
        level: (run.mods?.overflowStacks || 0) + 1,
        isNew: false,
        evolvable: false,
        evolveTargetId: null,
        tags: [],
        locked: true,
      });
    } else {
      run.lockedChoice = null;
    }
  }

  while (picked.length < n && pool.length) {
    const c = run.rng.weighted(pool, (x) => x.weight);
    pool.splice(pool.indexOf(c), 1);
    picked.push(strip(c, run.lockedChoice));
  }

  if (!picked.length && allMaxed(run)) {
    picked.push({
      kind: 'overflow',
      id: 'overflow',
      level: run.mods.overflowStacks + 1,
      isNew: false,
      evolvable: false,
      evolveTargetId: null,
      tags: [],
      locked: false,
    });
  }

  const fillers = [
    { kind: 'coin', id: 'coin', level: 0, isNew: false, evolvable: false, evolveTargetId: null, tags: [], locked: false },
    { kind: 'bun', id: 'bun', level: 0, isNew: false, evolvable: false, evolveTargetId: null, tags: [], locked: false },
    {
      kind: 'overflow',
      id: 'overflow',
      level: (run.mods?.overflowStacks || 0) + 1,
      isNew: false,
      evolvable: false,
      evolveTargetId: null,
      tags: [],
      locked: false,
    },
  ];
  for (const f of fillers) {
    if (picked.length >= n) break;
    if (!picked.some((p) => p.kind === f.kind && p.id === f.id)) picked.push(f);
  }

  run.choiceMode = 'normal';
  run.choices = picked;
  return picked;
}

function toChoiceIndex(index) {
  if (typeof index === 'number') return Number.isInteger(index) ? index : -1;
  if (typeof index === 'string' && index.trim() !== '') {
    const n = Number(index);
    return Number.isInteger(n) ? n : -1;
  }
  return -1;
}

/** 弃签（F8）：消耗 1 次弃签，永久封禁该武器/法器并当场补抽新签 */
export function banishChoiceImpl(run, index) {
  if (!run || run.status !== 'levelup' || run.choiceMode === 'blessing') return false;
  if ((run.banishesLeft || 0) <= 0 || !run.choices) return false;
  const idx = toChoiceIndex(index);
  if (idx < 0 || idx >= run.choices.length || !run.choices[idx]) return false;
  const target = run.choices[idx];
  if (target.kind !== 'weapon' && target.kind !== 'relic') return false;

  run.banishesLeft--;
  if (!run.banished) run.banished = [];
  if (!run.banished.includes(target.id)) run.banished.push(target.id);
  if (run.lockedChoice && run.lockedChoice.kind === target.kind && run.lockedChoice.id === target.id) {
    run.lockedChoice = null;
  }

  const otherKeys = new Set();
  for (let i = 0; i < run.choices.length; i++) {
    if (i !== idx) otherKeys.add(`${run.choices[i].kind}:${run.choices[i].id}`);
  }

  const pool = candidateChoices(run).filter((c) => !otherKeys.has(`${c.kind}:${c.id}`));
  if (pool.length) {
    const picked = run.rng.weighted(pool, (x) => x.weight);
    run.choices[idx] = strip(picked, run.lockedChoice);
  } else {
    const fallbacks = [
      ...(allMaxed(run)
        ? [{ kind: 'overflow', id: 'overflow', level: run.mods.overflowStacks + 1, isNew: false, evolvable: false, evolveTargetId: null, tags: [], locked: false }]
        : []),
      { kind: 'coin', id: 'coin', level: 0, isNew: false, evolvable: false, evolveTargetId: null, tags: [], locked: false },
      { kind: 'bun', id: 'bun', level: 0, isNew: false, evolvable: false, evolveTargetId: null, tags: [], locked: false },
      { kind: 'overflow', id: 'overflow', level: (run.mods?.overflowStacks || 0) + 1, isNew: false, evolvable: false, evolveTargetId: null, tags: [], locked: false },
    ];
    const replacement = fallbacks.find((f) => !otherKeys.has(`${f.kind}:${f.id}`)) || fallbacks[0];
    run.choices[idx] = replacement;
  }

  run.events.push({ type: 'banish', itemId: target.id, itemKind: target.kind });
  return true;
}

/** 留签（F8）：锁定或解锁某张升级签，保留至下次常规升级 */
export function toggleLockChoiceImpl(run, index) {
  if (!run || run.status !== 'levelup' || run.choiceMode === 'blessing' || !run.choices) return false;
  const idx = toChoiceIndex(index);
  if (idx < 0 || idx >= run.choices.length || !run.choices[idx]) return false;
  const c = run.choices[idx];
  if (run.lockedChoice && run.lockedChoice.kind === c.kind && run.lockedChoice.id === c.id) {
    run.lockedChoice = null;
    for (const ch of run.choices) ch.locked = false;
    return true;
  }
  run.lockedChoice = { kind: c.kind, id: c.id };
  for (let i = 0; i < run.choices.length; i++) {
    run.choices[i].locked = i === idx;
  }
  return true;
}

/** 应用一张签（兼容常规升级签与守夜命签）；返回是否成功 */
export function applyChoice(run, c) {
  if (!c) return false;
  if (c.kind === 'blessing') {
    return applyBlessingChoice(run, c.id, {
      recomputeMods,
      healPlayer,
      earnCoins,
      upgradeItem: (r, kind, id) => (kind === 'weapon' ? addOrUpgradeWeapon(r, id) : addOrUpgradeRelic(r, id)),
    });
  }

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
      earnCoins(run, LEVELUP.coinValue, true);
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
  compass: '在鬼群密集处布下定穴磁阵，牵引聚怪并引爆地脉',
  soulbanner: '挥动招魂大幡重扫前方，附带破甲易伤并凝聚护体魂障',
  bronze_mirror: '射出持续横扫的赤阳神光，焚毁敌弹并持续灼伤叠伤',
  paperhorse: '唤出纸马铁骑从后方奔袭贯穿全屏，撞退沿途群祟',
};

const EVOLVED_INTRO = Object.fromEntries(WEAPON_IDS.map((k) => [k, WEAPONS[k].evoDesc]));

const STAT_LABELS = [
  ['dmg', '伤害', ''],
  ['count', '数量', ''],
  ['bounces', '弹跳', '次'],
  ['radius', '半径', ''],
  ['length', '射程', ''],
  ['width', '光宽', ''],
  ['spread', '角度', '°'],
  ['cd', '冷却', '秒'],
];

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function weaponDesc(id, level) {
  const def = WEAPONS[id];
  if (!def) return '';
  if (level <= 1) {
    const parts = [];
    for (const [k, label, unit] of STAT_LABELS) {
      if (Array.isArray(def[k]) && (k === 'dmg' || k === 'count' || k === 'bounces')) {
        parts.push(`${label} ${fmt(def[k][0])}${unit}`);
      }
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
  speedPct: (v) => `移速 +${Math.round(v * 100)}%`,
  slowResist: (v) => `减速抗性 +${Math.round(v * 100)}%`,
  hurtInvuln: (v) => `受击无敌 +${fmt(v)}秒`,
  killHeal: (v) => `每${RELICS.glutinous.killInterval}杀回血 +${v}`,
  critDmg: (v) => `暴击伤害 +${Math.round(v * 100)}%`,
  coinPct: (v) => `铜钱获取 +${Math.round(v * 100)}%`,
  lightPct: (v) => `照亮范围 +${Math.round(v * 100)}%`,
  ultChargePct: (v) => `大招攒气 +${Math.round(v * 100)}%`,
  ultCdRefund: (v) => `大招返还冷却 ${Math.round(v * 100)}%`,
};

function relicDesc(id, level) {
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
  return level <= 1 ? `${s}（本命配对：${pairName}）` : `${s}（累计 ${total.join('，')}）`;
}

export function describeUpgrade(choice) {
  const c = choice;
  const base = {
    kind: c.kind,
    id: c.id,
    level: c.level,
    isNew: !!c.isNew,
    evolvable: !!c.evolvable,
    locked: !!c.locked,
    tags: c.tags || [],
    evolveHint: '',
  };
  switch (c.kind) {
    case 'weapon': {
      const d = WEAPONS[c.id];
      const tagLabel = (d.tags || []).map((t) => SCHOOL_NAMES[t]).filter(Boolean).join('/');
      const targetId = c.evolveTargetId || c.id;
      return {
        ...base,
        tags: d.tags ? [...d.tags] : [],
        name: WEAPON_NAMES[c.id],
        levelText: c.isNew ? '新' : `${c.level} 级`,
        desc: weaponDesc(c.id, c.level),
        evolveHint: c.evolvable
          ? `已可开光：开启供盒 → ${EVOLVED_NAMES[targetId]}`
          : `满级 +（${RELIC_NAMES[d.pair]} / ${EVOLUTION.resonanceCount}件${tagLabel} / 满级法器）→ ${EVOLVED_NAMES[c.id]}`,
      };
    }
    case 'relic': {
      const targetId = c.evolveTargetId || RELICS[c.id].pair;
      return {
        ...base,
        tags: RELICS[c.id]?.tags ? [...RELICS[c.id].tags] : [],
        name: RELIC_NAMES[c.id],
        levelText: c.isNew ? '新' : `${c.level} 级`,
        desc: relicDesc(c.id, c.level),
        evolveHint: c.evolvable ? `已可开光：开启供盒 → ${EVOLVED_NAMES[targetId]}` : '',
      };
    }
    case 'blessing':
      return {
        ...base,
        name: c.name,
        levelText: c.tier === 'cursed' ? '凶签' : '吉签',
        desc: c.desc,
        tier: c.tier,
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

export function describeEvolution(weaponId) {
  return {
    id: weaponId,
    name: EVOLVED_NAMES[weaponId],
    from: WEAPON_NAMES[weaponId],
    desc: EVOLVED_INTRO[weaponId] || '',
  };
}
