// 阴阳合契（v7 双神兵「二合一腾槽」宗师超武系统）：
// 当玩家同时拥有配方中的两把已开光神兵（evolved === true）时，开启供盒可敕封合契为 1 把宗师超武，
// 自动腾出 1 个兵刃槽位（6/6 → 5/6）供后续继续抽取第 7 把新兵刃，并完整保留两把前置神兵的流派羁绊标签！

import { WEAPONS } from './balance.js';

export const FUSION_DMG_MUL = 1.42;

export const FUSIONS = {
  grand_zhenhun_sound: {
    id: 'grand_zhenhun_sound',
    name: '十方震魂天音',
    primaryId: 'gong',
    secondaryId: 'bell',
    desc: '五更鸣锣与千铃引魂二合一（腾出 1 兵刃槽）：鸣锣双环金波齐发并激荡三十六跳摄魂雷音，震晕群祟引发天音共鸣',
  },
  grand_crimson_lotus: {
    id: 'grand_crimson_lotus',
    name: '八荒业火莲台',
    primaryId: 'lantern',
    secondaryId: 'firecracker',
    desc: '长明灯与满堂红二合一（腾出 1 兵刃槽）：护体业火莲灯增至 6 盏高速旋绕，周期齐掷连环红炮铺开八荒火海',
  },
  grand_celestial_formation: {
    id: 'grand_celestial_formation',
    name: '紫微天罡剑箓',
    primaryId: 'talisman',
    secondaryId: 'coinsword',
    desc: '天师符阵与七星剑阵二合一（腾出 1 兵刃槽）：五雷符阵与折返七星飞剑齐发，剑符交汇处引落紫微天雷轰顶',
  },
  grand_night_parade: {
    id: 'grand_night_parade',
    name: '阴司百鬼巡游',
    primaryId: 'paperman',
    secondaryId: 'paperhorse',
    desc: '纸扎仪仗与百鬼夜行图二合一（腾出 1 兵刃槽）：阴司甲士护驾冲锋，并周期号令成列纸马铁骑贯屏踏爆群祟',
  },
  grand_underworld_decree: {
    id: 'grand_underworld_decree',
    name: '幽冥勾魂敕令',
    primaryId: 'suohun_chain',
    secondaryId: 'soulbanner',
    desc: '黑白无常夺魄索与无常勾魂幡二合一（腾出 1 兵刃槽）：夺魄铁索拽聚群祟入巨幡斩杀圈，护体魂障上限升至 3 层',
  },
  grand_cosmos_sundial: {
    id: 'grand_cosmos_sundial',
    name: '周天乾坤晷',
    primaryId: 'compass',
    secondaryId: 'bronze_mirror',
    desc: '天星定穴盘与乾坤赤阳镜二合一（腾出 1 兵刃槽）：定穴引力奇点锁敌，赤阳神光横扫奇点引爆连环纯阳耀斑',
  },
};

export const FUSION_IDS = Object.keys(FUSIONS);

export function getFusionById(id) {
  return typeof id === 'string' && Object.hasOwn(FUSIONS, id) ? FUSIONS[id] : null;
}

/** 扫描当前局内满足双开光条件的宗师合契列表 */
export function availableFusions(run) {
  if (!run || !Array.isArray(run.weapons)) return [];
  const out = [];
  for (const fid of FUSION_IDS) {
    const f = FUSIONS[fid];
    const wA = run.weapons.find((w) => w.id === f.primaryId && w.evolved && !w.fusionId);
    const wB = run.weapons.find((w) => w.id === f.secondaryId && w.evolved && !w.fusionId);
    if (wA && wB) out.push(f);
  }
  return out;
}

/** 执行双神兵二合一合契：升级主兵刃，吞并副兵刃腾出 1 个槽位，并继承副兵刃流派标签 */
export function applyWeaponFusion(run, fusionId) {
  const f = getFusionById(fusionId);
  if (!f || !run || !Array.isArray(run.weapons)) return null;
  const wA = run.weapons.find((w) => w.id === f.primaryId && w.evolved && !w.fusionId);
  const idxB = run.weapons.findIndex((w) => w.id === f.secondaryId && w.evolved && !w.fusionId);
  if (!wA || idxB < 0) return null;

  const wB = run.weapons[idxB];
  const secTags = WEAPONS[f.secondaryId]?.tags ? [...WEAPONS[f.secondaryId].tags] : [];
  wA.fusionId = f.id;
  wA.fusionName = f.name;
  wA.fusedSecondaryId = f.secondaryId;
  wA.bonusSynergyTags = [...(wA.bonusSynergyTags || []), ...secTags];
  wA._fusionSubCd = 0.25;
  if (wB.signature) wA.signature = true;

  // 移除被合契吞并的副兵刃，立即腾出 1 个兵刃槽位！
  run.weapons.splice(idxB, 1);
  if (!Array.isArray(run._fusedOutWeapons)) run._fusedOutWeapons = [];
  if (!run._fusedOutWeapons.includes(f.secondaryId)) {
    run._fusedOutWeapons.push(f.secondaryId);
  }

  // 清理副兵刃残留的常驻召唤物（若有）
  if (Array.isArray(run.projectiles)) {
    const ownerSlot = run.player?.slot ?? 0;
    for (const pr of run.projectiles) {
      if (pr.persistent && pr.weaponId === f.secondaryId && (pr.ownerSlot ?? 0) === ownerSlot) {
        pr.dead = true;
      }
    }
  }

  run.events.push({
    type: 'fusion',
    fusionId: f.id,
    fusionName: f.name,
    primaryId: f.primaryId,
    secondaryId: f.secondaryId,
  });
  return f;
}
