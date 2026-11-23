// 四门民俗流派羁绊（F6：镇魂 · 道法 · 纸扎 · 阳炎）。
// 统计当前已拥有的武器与法器流派标签，激活 2 / 4 / 6 件阶梯效果（同门内各阶效果累加）。

import { WEAPONS, RELICS, SCHOOL_TAG_IDS, SCHOOL_TAGS, DAMAGE, ENEMY_AI } from './balance.js';
import { damageCircle } from './combat.js';

const pct = (v) => Math.round(v * 100);
const fmt = (v) => (Number.isInteger(v) ? String(v) : Number(v.toFixed(2)).toString());

export const SYNERGY_TIERS = [2, 4, 6];

export const SYNERGY_TUNING = {
  zhenhun2: { knockbackPct: 0.30, controlDurPct: 0.25, armor: 1 },
  zhenhun4: { vulnDmgMul: 1.22, vulnSec: 2 },
  zhenhun6: { intervalSec: 6 },
  daofa2: { critChance: 0.08, durPct: 0.15 },
  daofa4: { cdSec: 0.35 },
  daofa6: { cdr: 0.12, cooldownFloor: 0.42, critMultBonus: 0.35, bonusPierce: 2 },
  zhizha2: { dmgPct: 0.20, hastePct: 0.20 },
  zhizha4: { intervalSec: 3.5 },
  zhizha6: { amount: 1, bleedSec: 3, bleedVulnMul: 1.15 },
  yangyan2: { areaPct: 0.15, lightPct: 0.20 },
  yangyan4: { burnSec: 3.5, slowDur: 1.0 },
  yangyan6: { burnDmgMul: 1.30 },
};

const T = SYNERGY_TUNING;

export const SYNERGIES = {
  zhenhun: {
    id: 'zhenhun',
    name: SCHOOL_TAGS.zhenhun.name,
    tiers: [
      { tier: 2, name: '镇魂·初鸣', summary: `击退 +${pct(T.zhenhun2.knockbackPct)}%，定身减速时长 +${pct(T.zhenhun2.controlDurPct)}%，护甲 +${T.zhenhun2.armor}` },
      { tier: 4, name: '镇魂·摄魄', summary: `受控邪祟易伤 +${pct(T.zhenhun4.vulnDmgMul - 1)}%，控场命中附加 ${T.zhenhun4.vulnSec} 秒破绽` },
      { tier: 6, name: '镇魂·五更镇煞', summary: `每 ${T.zhenhun6.intervalSec} 秒自动敲响镇煞锣，震退群祟并震碎敌弹` },
    ],
  },
  daofa: {
    id: 'daofa',
    name: SCHOOL_TAGS.daofa.name,
    tiers: [
      { tier: 2, name: '道法·开坛', summary: `暴击率 +${pct(T.daofa2.critChance)}%，弹速与持续时间 +${pct(T.daofa2.durPct)}%` },
      { tier: 4, name: '道法·掌心雷', summary: `暴击引落掌心雷轰击目标周围（内置 ${fmt(T.daofa4.cdSec)} 秒冷却）` },
      { tier: 6, name: '道法·九天玄敕', summary: `冷却缩减 +${pct(T.daofa6.cdr)}%，冷却下限降至 ${fmt(T.daofa6.cooldownFloor)}，暴击伤害 +${pct(T.daofa6.critMultBonus)}%，弹体穿透 +${T.daofa6.bonusPierce}` },
    ],
  },
  zhizha: {
    id: 'zhizha',
    name: SCHOOL_TAGS.zhizha.name,
    tiers: [
      { tier: 2, name: '纸扎·点睛', summary: `纸扎系与召唤物伤害 +${pct(T.zhizha2.dmgPct)}%，纸人移速攻速 +${pct(T.zhizha2.hastePct)}%` },
      { tier: 4, name: '纸扎·剪纸成兵', summary: `每 ${fmt(T.zhizha4.intervalSec)} 秒扎出一只追魂红纸童冲阵自爆` },
      { tier: 6, name: '纸扎·百鬼夜行', summary: `投射与召唤数量 +${T.zhizha6.amount}，纸扎命中撕开 ${T.zhizha6.bleedSec} 秒纸裂流血（易伤 +${pct(T.zhizha6.bleedVulnMul - 1)}%）` },
    ],
  },
  yangyan: {
    id: 'yangyan',
    name: SCHOOL_TAGS.yangyan.name,
    tiers: [
      { tier: 2, name: '阳炎·添薪', summary: `攻击范围 +${pct(T.yangyan2.areaPct)}%，灯笼照亮范围 +${pct(T.yangyan2.lightPct)}%` },
      { tier: 4, name: '阳炎·灼魂', summary: `阳炎器物引燃邪祟 ${fmt(T.yangyan4.burnSec)} 秒，灼烧持续伤敌并减速 ${pct(1 - ENEMY_AI.slowMul)}%` },
      { tier: 6, name: '阳炎·焚天净夜', summary: `对灼烧或阳炎印记目标伤害 ×${T.yangyan6.burnDmgMul.toFixed(2)}，燃尽毙命引发阳炎爆裂` },
    ],
  },
};

/** 统计四门流派件数（含百神同契命签的全流派 +1） */
export function countSchoolItems(run) {
  const counts = { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 };
  if (!run) return counts;
  for (const w of run.weapons) {
    const tags = WEAPONS[w.id]?.tags;
    if (tags) for (const t of tags) if (counts[t] !== undefined) counts[t]++;
  }
  for (const r of run.relics) {
    const tags = RELICS[r.id]?.tags;
    if (tags) for (const t of tags) if (counts[t] !== undefined) counts[t]++;
  }
  const bonus = run._allSchoolBonus || 0;
  if (bonus > 0 && run.weapons.length + run.relics.length > 0) {
    for (const t of SCHOOL_TAG_IDS) counts[t] += bonus;
  }
  return counts;
}

/** 计算当前羁绊计数与激活阶梯 */
export function computeSynergies(run) {
  const counts = countSchoolItems(run);
  const tiers = { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 };
  const active = [];
  for (const tag of SCHOOL_TAG_IDS) {
    const c = counts[tag];
    const def = SYNERGIES[tag];
    let top = null;
    for (const td of def.tiers) {
      if (c >= td.tier) top = td;
    }
    if (top) {
      tiers[tag] = top.tier;
      active.push({
        tag,
        tier: top.tier,
        name: top.name,
        summary: top.summary,
        count: c,
      });
    }
  }
  return { counts, tiers, active };
}

/** 同步 run.synergies，并在新阶梯首次达成时推送防刷屏 synergyUp 事件 */
export function syncSynergies(run, { emit = true } = {}) {
  const res = computeSynergies(run);
  run.synergies = { counts: res.counts, active: res.active };
  if (!run._synergyMaxTier) {
    run._synergyMaxTier = { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 };
  }
  for (const entry of res.active) {
    const prev = run._synergyMaxTier[entry.tag] || 0;
    if (entry.tier > prev) {
      run._synergyMaxTier[entry.tag] = entry.tier;
      if (emit) {
        run.events.push({
          type: 'synergyUp',
          tag: entry.tag,
          tier: entry.tier,
          name: entry.name,
        });
      }
    }
  }
  return res;
}

/** 把当前羁绊折算为累加属性与被动开关 */
export function synergyStatMods(syn) {
  const counts = syn?.counts || { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 };
  const m = {
    knockbackMul: 1,
    controlDurMul: 1,
    bonusArmor: 0,
    critChance: 0,
    durPct: 0,
    cdr: 0,
    cooldownFloor: DAMAGE.cooldownFloor,
    critMultBonus: 0,
    bonusPierce: 0,
    summonDmgPct: 0,
    zhizhaDmgPct: 0,
    summonHasteMul: 1,
    amount: 0,
    areaPct: 0,
    lightMul: 1,
    zhenhun4: false,
    zhenhun6: false,
    daofa4: false,
    zhizha4: false,
    zhizha6: false,
    yangyan4: false,
    yangyan6: false,
  };

  if (counts.zhenhun >= 2) {
    m.knockbackMul *= 1 + T.zhenhun2.knockbackPct;
    m.controlDurMul *= 1 + T.zhenhun2.controlDurPct;
    m.bonusArmor += T.zhenhun2.armor;
  }
  if (counts.zhenhun >= 4) m.zhenhun4 = true;
  if (counts.zhenhun >= 6) m.zhenhun6 = true;

  if (counts.daofa >= 2) {
    m.critChance += T.daofa2.critChance;
    m.durPct += T.daofa2.durPct;
  }
  if (counts.daofa >= 4) m.daofa4 = true;
  if (counts.daofa >= 6) {
    m.cdr += T.daofa6.cdr;
    m.cooldownFloor = Math.min(m.cooldownFloor, T.daofa6.cooldownFloor);
    m.critMultBonus += T.daofa6.critMultBonus;
    m.bonusPierce += T.daofa6.bonusPierce;
  }

  if (counts.zhizha >= 2) {
    m.summonDmgPct += T.zhizha2.dmgPct;
    m.zhizhaDmgPct += T.zhizha2.dmgPct;
    m.summonHasteMul *= 1 + T.zhizha2.hastePct;
  }
  if (counts.zhizha >= 4) m.zhizha4 = true;
  if (counts.zhizha >= 6) {
    m.amount += T.zhizha6.amount;
    m.zhizha6 = true;
  }

  if (counts.yangyan >= 2) {
    m.areaPct += T.yangyan2.areaPct;
    m.lightMul *= 1 + T.yangyan2.lightPct;
  }
  if (counts.yangyan >= 4) m.yangyan4 = true;
  if (counts.yangyan >= 6) m.yangyan6 = true;

  return m;
}

/** 逐帧驱动羁绊主动周期效果（镇魂 6 件自动镇煞锣、纸扎 4 件剪纸成兵、道法掌心雷冷却） */
export function updateSynergyRuntime(run, dt) {
  if (run._daofaThunderCd > 0) run._daofaThunderCd = Math.max(0, run._daofaThunderCd - dt);
  const mods = run.mods;
  if (!mods) return;
  const p = run.player;

  if (mods.zhenhun6) {
    if (run._zhenhunGongT == null) run._zhenhunGongT = 3.0;
    run._zhenhunGongT -= dt;
    if (run._zhenhunGongT <= 0) {
      run._zhenhunGongT = T.zhenhun6.intervalSec;
      const R = 165 * mods.areaMul;
      damageCircle(run, p.x, p.y, R, 42 + 6 * p.level, 'gong', { knock: 220, stun: 0.9, vuln: 2.5, vulnPct: 0.25 });
      for (const pr of run.projectiles) {
        if (pr.kind === 'enemyBullet' && !pr.dead) {
          const rr = R + (pr.r || 0);
          if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= rr * rr) pr.dead = true;
        }
      }
      run.projectiles.push({
        id: run._nextId++,
        kind: 'gongPulse',
        weaponId: 'gong',
        x: p.x,
        y: p.y,
        r: Math.max(0, R),
        radius: 0,
        maxRadius: R,
        angle: 0,
        t: 0,
        life: 0.38,
        evolved: true,
      });
      run.events.push({ type: 'fire', weaponId: 'gong', evolved: true, x: p.x, y: p.y, angle: 0 });
    }
  }

  if (mods.zhizha4) {
    if (run._zhizhaImpT == null) run._zhizhaImpT = 2.0;
    run._zhizhaImpT -= dt;
    if (run._zhizhaImpT <= 0) {
      const scratch = run._sys.scratchW3 || run._sys.scratchW2;
      const tgt = run._sys.hash.nearest(p.x, p.y, 460, scratch, (e) => !e.dead);
      if (tgt) {
        run._zhizhaImpT = T.zhizha4.intervalSec;
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        run.projectiles.push({
          id: run._nextId++,
          kind: 'paperman',
          weaponId: 'paperman',
          role: 'imp',
          mode: 'imp',
          persistent: false,
          evolved: true,
          x: p.x + Math.cos(a) * 18,
          y: p.y + Math.sin(a) * 18,
          r: 12,
          angle: a,
          t: 0,
          life: 4.0,
          speed: 290,
          dmg: 28 + 5 * p.level,
          blastR: 54 * mods.areaMul,
          targetId: tgt.id,
        });
      } else {
        run._zhizhaImpT = 0.4;
      }
    }
  }
}
