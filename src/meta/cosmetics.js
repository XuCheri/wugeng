// 鬼市衣冠与重彩锋芒目录（F5 6角色×3套=18套皮肤 + F6 5套攻击特效主题 + 购买/穿戴/防刷钱计价）
import { HERO_IDS } from '../sim/balance.js';

function isPlainObj(v) {
  if (v === null || typeof v !== 'object') return false;
  try {
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function canMutateObj(v) {
  return isPlainObj(v) && !Object.isFrozen(v);
}

export const ATTACK_VFX_IDS = [
  'default',
  'jade_ghostfire',
  'violet_thunder',
  'gilded_imperial',
  'frost_moon',
];

export const ATTACK_VFX_THEMES = {
  default: {
    id: 'default',
    name: '古墨朱砂',
    subtitle: '原装民俗木刻',
    desc: '浓墨飞白配朱砂套印，恪守五更民俗版画本色。',
    price: 0,
    unlock: 'default',
    achievementId: null,
  },
  jade_ghostfire: {
    id: 'jade_ghostfire',
    name: '青冥幽火',
    subtitle: '石绿磷火旋涡',
    desc: '青碧鬼火盘旋成涡，刀锋拖曳幽冥燐焰与符纹残影。',
    price: 880,
    unlock: 'shop',
    achievementId: null,
  },
  violet_thunder: {
    id: 'violet_thunder',
    name: '紫电天罡',
    subtitle: '紫金雷篆裂芒',
    desc: '天罡紫电锯齿迸裂，震波化八角雷篆与叉状电弧。',
    price: 1180,
    unlock: 'shop',
    achievementId: null,
  },
  gilded_imperial: {
    id: 'gilded_imperial',
    name: '鎏金神诏',
    subtitle: '赤金日冕敕令',
    desc: '帝王赤金日冕耀世，双环神诏携十字金芒破邪。',
    price: 1480,
    unlock: 'shop',
    achievementId: null,
  },
  frost_moon: {
    id: 'frost_moon',
    name: '玄霜寒月',
    subtitle: '石青六棱冰晶',
    desc: '寒月剑气凝霜成晶，绽放六棱雪花法环与碎冰残弧。',
    price: 1280,
    unlock: 'shop',
    achievementId: 'endless15',
  },
};

export const ATTACK_VFX_LIST = ATTACK_VFX_IDS.map((id) => ATTACK_VFX_THEMES[id]);

// 6 名守夜人 × 3 套截然不同外观皮肤 = 18 套
// 分布：6 套默认免费（原版6色木版画）+ 9 套铜钱鬼市款（6×Tier1 + 3×Tier2）+ 3 套守夜功绩专属奖励款
export const HERO_SKINS = [
  // 1. 周更夫 (zhou)
  {
    id: 'zhou_default',
    heroId: 'zhou',
    tier: 0,
    name: '乌毡巡夜',
    subtitle: '原装竹笠短褐',
    desc: '竹编尖顶斗笠配乌墨号褂，背负旧铜更锣，暖灯巡街。',
    price: 0,
    unlock: 'default',
    achievementId: null,
    mineral: 'woodblock',
  },
  {
    id: 'zhou_jade_watch',
    heroId: 'zhou',
    tier: 1,
    name: '青冥镇岳蓑',
    subtitle: '靖夜展翅冠·双令旗',
    desc: '头戴靖夜司双翅乌纱，背插青冥巡夜双令旗，阔摆石绿蓑氅踏四方步罡阵。',
    price: 680,
    unlock: 'shop',
    achievementId: null,
    mineral: 'jade',
  },
  {
    id: 'zhou_imperial_bell',
    heroId: 'zhou',
    tier: 2,
    name: '紫金鸣鸿甲',
    subtitle: '凤翅金冠·背光洪钟',
    desc: '三叉凤翅金盔映紫金神环，肩悬镇城洪钟，长披风扬起敕令八角金阵。',
    price: 0,
    unlock: 'achievement',
    achievementId: 'night5',
    mineral: 'violet_gold',
  },

  // 2. 巧手阿绵 (mian)
  {
    id: 'mian_default',
    heroId: 'mian',
    tier: 0,
    name: '红绳素剪',
    subtitle: '原装双髻纸匠',
    desc: '红头绳束双丫髻，朱砂小围裙配裁纸铁剪，轻巧灵动。',
    price: 0,
    unlock: 'default',
    achievementId: null,
    mineral: 'woodblock',
  },
  {
    id: 'mian_azure_bride',
    heroId: 'mian',
    tier: 1,
    name: '石青百蝶帔',
    subtitle: '点翠凤冠·双折扇翅',
    desc: '点翠博鬓花冠配背后巨型石青双折扇翼，广袖百褶霞帔流转冰轮蝶阵。',
    price: 720,
    unlock: 'shop',
    achievementId: null,
    mineral: 'azure',
  },
  {
    id: 'mian_gold_puppeteer',
    heroId: 'mian',
    tier: 2,
    name: '鎏金千机戏',
    subtitle: '折角金帽·十字悬丝架',
    desc: '高耸折角傀儡金冠，背负巨幅十字鎏金提线木架，不对称灯笼裙踏星盘阵。',
    price: 1480,
    unlock: 'shop',
    achievementId: null,
    mineral: 'gold',
  },

  // 3. 玄真道童 (daotong)
  {
    id: 'daotong_default',
    heroId: 'daotong',
    tier: 0,
    name: '混元桃木',
    subtitle: '原装道巾短袍',
    desc: '混元乌道巾配交领短袍，斜背朱砂桃木剑，清正纯阳。',
    price: 0,
    unlock: 'default',
    achievementId: null,
    mineral: 'woodblock',
  },
  {
    id: 'daotong_violet_thunder',
    heroId: 'daotong',
    tier: 1,
    name: '紫电天师箓',
    subtitle: '五岳莲冠·五剑雷轮',
    desc: '紫金五岳莲花高冠，背后悬浮五柄紫电飞剑剑轮，八卦鹤氅踏六芒雷阵。',
    price: 780,
    unlock: 'shop',
    achievementId: null,
    mineral: 'violet',
  },
  {
    id: 'daotong_jade_immortal',
    heroId: 'daotong',
    tier: 2,
    name: '碧落乘鹤衣',
    subtitle: '满月玉轮·仙葫长绶',
    desc: '散仙发髻映偏心碧玉满月轮，肩扛灵药大葫芦，长曳青霞羽衣踏太极莲阵。',
    price: 0,
    unlock: 'achievement',
    achievementId: 'evolve12',
    mineral: 'jade',
  },

  // 4. 沈观星 (yinyang)
  {
    id: 'yinyang_default',
    heroId: 'yinyang',
    tier: 0,
    name: '玄象步罡',
    subtitle: '原装方冠罗盘',
    desc: '方正阴阳道冠蓄三缕清髯，背负定穴木罗盘，推演更筹。',
    price: 0,
    unlock: 'default',
    achievementId: null,
    mineral: 'woodblock',
  },
  {
    id: 'yinyang_frost_astrolabe',
    heroId: 'yinyang',
    tier: 1,
    name: '玄霜浑天仪',
    subtitle: '平天冕旒·巨型浑天仪',
    desc: '星官平天冠垂冰晶玉旒，背后悬浮双环石青浑天星轨仪，宽博祭裳踏星宿阵。',
    price: 820,
    unlock: 'shop',
    achievementId: null,
    mineral: 'azure',
  },
  {
    id: 'yinyang_gold_oracle',
    heroId: 'yinyang',
    tier: 2,
    name: '鎏金太乙诏',
    subtitle: '日冕神翼冠·招星金幡',
    desc: '冲天火焰日冕金冠展双翼，背立太乙招星金幡，斜披赤金流苏法氅踏日晷阵。',
    price: 0,
    unlock: 'achievement',
    achievementId: 'score50k',
    mineral: 'gold',
  },

  // 5. 石敢当 (tiejiang)
  {
    id: 'tiejiang_default',
    heroId: 'tiejiang',
    tier: 0,
    name: '赤膊锻魂',
    subtitle: '原装束额重锤',
    desc: '朱红抹额配锻炉厚皮围裙，斜背百炼大铁锤，刚猛无俦。',
    price: 0,
    unlock: 'default',
    achievementId: null,
    mineral: 'woodblock',
  },
  {
    id: 'tiejiang_jade_taotie',
    heroId: 'tiejiang',
    tier: 1,
    name: '青铜饕餮铠',
    subtitle: '双角重盔·交叉巨斧',
    desc: '弯角青铜饕餮重盔，背负交叉双柄宽刃青铜巨斧，重甲铁裙踏雷纹方鼎阵。',
    price: 880,
    unlock: 'shop',
    achievementId: null,
    mineral: 'jade',
  },
  {
    id: 'tiejiang_violet_asura',
    heroId: 'tiejiang',
    tier: 2,
    name: '紫焰修罗炉',
    subtitle: '冲天紫发·镇狱熔炉',
    desc: '狂放紫焰怒发冲冠，背负喷涌紫火的镇狱锻魂巨炉，拖地锁链踏八荒熔炉阵。',
    price: 1580,
    unlock: 'shop',
    achievementId: null,
    mineral: 'violet',
  },

  // 6. 柳青衣 (nuoxi)
  {
    id: 'nuoxi_default',
    heroId: 'nuoxi',
    tier: 0,
    name: '朱颜半傩',
    subtitle: '原装雉翎云肩',
    desc: '斜戴朱金半面傩具插双雉翎，金彩云肩配背负小战鼓。',
    price: 0,
    unlock: 'default',
    achievementId: null,
    mineral: 'woodblock',
  },
  {
    id: 'nuoxi_azure_phoenix',
    heroId: 'nuoxi',
    tier: 1,
    name: '石青沧溟鸾',
    subtitle: '展翼鸾冠·雀尾广袖',
    desc: '全覆式石青鸾鸟巨翼神面冠，孔雀翠羽广袖舞裙曳地，踏沧溟鸾羽旋舞阵。',
    price: 860,
    unlock: 'shop',
    achievementId: null,
    mineral: 'azure',
  },
  {
    id: 'nuoxi_gold_nuo_god',
    heroId: 'nuoxi',
    tier: 2,
    name: '赤金方相神',
    subtitle: '四靠旗神面·悬空雷鼓',
    desc: '四目赤金方相神面配背插四杆大靠旗，身侧悬空雷纹巨鼓与红金绶带踏五雷坛。',
    price: 1680,
    unlock: 'shop',
    achievementId: null,
    mineral: 'gold',
  },
];

export const HERO_SKINS_BY_ID = Object.fromEntries(HERO_SKINS.map((s) => [s.id, s]));

export const HERO_SKINS_BY_HERO = Object.fromEntries(
  HERO_IDS.map((hid) => [hid, HERO_SKINS.filter((s) => s.heroId === hid)]),
);

export const HERO_SKIN_IDS = HERO_SKINS.map((s) => s.id);

export function normalizeAttackVfxId(vfxId) {
  if (typeof vfxId === 'string' && Object.hasOwn(ATTACK_VFX_THEMES, vfxId)) {
    return vfxId;
  }
  return 'default';
}

export function getDefaultHeroSkinId(heroId) {
  const safeHero = typeof heroId === 'string' && HERO_IDS.includes(heroId) ? heroId : 'zhou';
  return `${safeHero}_default`;
}

export function normalizeHeroSkinId(heroId, skinId) {
  const safeHero = typeof heroId === 'string' && HERO_IDS.includes(heroId) ? heroId : 'zhou';
  if (typeof skinId === 'string' && Object.hasOwn(HERO_SKINS_BY_ID, skinId)) {
    const def = HERO_SKINS_BY_ID[skinId];
    if (def.heroId === safeHero) return skinId;
  }
  return `${safeHero}_default`;
}

export function getHeroSkins(heroId) {
  const safeHero = typeof heroId === 'string' && HERO_IDS.includes(heroId) ? heroId : 'zhou';
  return HERO_SKINS_BY_HERO[safeHero] || HERO_SKINS_BY_HERO.zhou;
}

export function getSkinDef(skinId, fallbackHeroId = 'zhou') {
  if (typeof skinId === 'string' && Object.hasOwn(HERO_SKINS_BY_ID, skinId)) {
    return HERO_SKINS_BY_ID[skinId];
  }
  return HERO_SKINS_BY_ID[getDefaultHeroSkinId(fallbackHeroId)];
}

export function getAttackVfxDef(vfxId) {
  return ATTACK_VFX_THEMES[normalizeAttackVfxId(vfxId)];
}

export function isDefaultCosmeticId(itemId) {
  if (itemId === 'default') return true;
  if (typeof itemId === 'string' && Object.hasOwn(HERO_SKINS_BY_ID, itemId)) {
    return HERO_SKINS_BY_ID[itemId].unlock === 'default';
  }
  return false;
}

export function isCosmeticOwned(save, itemId) {
  if (isDefaultCosmeticId(itemId)) return true;
  if (typeof itemId !== 'string' || !itemId) return false;
  const owned = save?.cosmetics?.owned;
  return Array.isArray(owned) && owned.includes(itemId);
}

export function ensureCosmeticsStruct(save) {
  if (!canMutateObj(save)) return null;
  if (!isPlainObj(save.cosmetics)) {
    save.cosmetics = { owned: [], equipped: { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} } };
  }
  if (!Array.isArray(save.cosmetics.owned)) {
    save.cosmetics.owned = [];
  }
  if (!isPlainObj(save.cosmetics.equipped)) {
    save.cosmetics.equipped = { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} };
  }
  if (!isPlainObj(save.cosmetics.equipped.heroSkins)) {
    save.cosmetics.equipped.heroSkins = {};
  }
  if (typeof save.cosmetics.equipped.attackVfx !== 'string') {
    save.cosmetics.equipped.attackVfx = 'default';
  }
  return save.cosmetics;
}

export function getEquippedHeroSkin(save, heroId) {
  const safeHero = typeof heroId === 'string' && HERO_IDS.includes(heroId) ? heroId : 'zhou';
  const rawSkin = save?.cosmetics?.equipped?.heroSkins?.[safeHero];
  const norm = normalizeHeroSkinId(safeHero, rawSkin);
  return isCosmeticOwned(save, norm) ? norm : getDefaultHeroSkinId(safeHero);
}

export function getEquippedAttackVfx(save) {
  const rawVfx = save?.cosmetics?.equipped?.attackVfx;
  const norm = normalizeAttackVfxId(rawVfx);
  return isCosmeticOwned(save, norm) ? norm : 'default';
}

export function grantCosmeticUnlock(save, itemId) {
  const cos = ensureCosmeticsStruct(save);
  if (!cos || typeof itemId !== 'string') return false;
  const validSkin = Object.hasOwn(HERO_SKINS_BY_ID, itemId);
  const validVfx = Object.hasOwn(ATTACK_VFX_THEMES, itemId);
  if (!validSkin && !validVfx) return false;
  if (isDefaultCosmeticId(itemId)) return true;
  if (!cos.owned.includes(itemId)) {
    cos.owned.push(itemId);
    return true;
  }
  return false;
}

export function buyCosmetic(save, itemId) {
  const cos = ensureCosmeticsStruct(save);
  if (!cos || typeof itemId !== 'string') return { ok: false, reason: 'invalid' };
  const def = Object.hasOwn(HERO_SKINS_BY_ID, itemId)
    ? HERO_SKINS_BY_ID[itemId]
    : Object.hasOwn(ATTACK_VFX_THEMES, itemId)
      ? ATTACK_VFX_THEMES[itemId]
      : null;
  if (!def) return { ok: false, reason: 'unknown' };
  if (isCosmeticOwned(save, itemId)) return { ok: true, alreadyOwned: true, price: 0 };
  if (def.unlock === 'achievement' && !(def.price > 0)) {
    return { ok: false, reason: 'achievement_only' };
  }
  const price = Math.max(0, Math.floor(def.price || 0));
  const curCoins = Number.isFinite(save.coins) ? Math.floor(save.coins) : 0;
  if (curCoins < price) {
    return { ok: false, reason: 'coins', price };
  }
  save.coins = curCoins - price;
  if (!cos.owned.includes(itemId)) cos.owned.push(itemId);
  return { ok: true, alreadyOwned: false, price };
}

export function equipHeroSkin(save, heroId, skinId) {
  const cos = ensureCosmeticsStruct(save);
  if (!cos) return { ok: false, reason: 'invalid' };
  const safeHero = typeof heroId === 'string' && HERO_IDS.includes(heroId) ? heroId : 'zhou';
  if (!skinId || skinId === 'default' || skinId === `${safeHero}_default`) {
    const defId = getDefaultHeroSkinId(safeHero);
    cos.equipped.heroSkins[safeHero] = defId;
    return { ok: true, skinId: defId };
  }
  if (!Object.hasOwn(HERO_SKINS_BY_ID, skinId) || HERO_SKINS_BY_ID[skinId].heroId !== safeHero) {
    return { ok: false, reason: 'mismatch' };
  }
  if (!isCosmeticOwned(save, skinId)) {
    return { ok: false, reason: 'unowned' };
  }
  cos.equipped.heroSkins[safeHero] = skinId;
  return { ok: true, skinId };
}

export function equipAttackVfx(save, vfxId) {
  const cos = ensureCosmeticsStruct(save);
  if (!cos) return { ok: false, reason: 'invalid' };
  if (!vfxId || vfxId === 'default') {
    cos.equipped.attackVfx = 'default';
    return { ok: true, vfxId: 'default' };
  }
  if (!Object.hasOwn(ATTACK_VFX_THEMES, vfxId)) {
    return { ok: false, reason: 'unknown' };
  }
  if (!isCosmeticOwned(save, vfxId)) {
    return { ok: false, reason: 'unowned' };
  }
  cos.equipped.attackVfx = vfxId;
  return { ok: true, vfxId };
}

export function cosmeticShopSpent(ownedList) {
  if (!Array.isArray(ownedList)) return 0;
  let sum = 0;
  const seen = new Set();
  for (const id of ownedList) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    const def = Object.hasOwn(HERO_SKINS_BY_ID, id)
      ? HERO_SKINS_BY_ID[id]
      : Object.hasOwn(ATTACK_VFX_THEMES, id)
        ? ATTACK_VFX_THEMES[id]
        : null;
    if (def && def.unlock === 'shop' && def.price > 0) {
      sum += Math.floor(def.price);
    }
  }
  return sum;
}

export function cosmeticShopCount(ownedList) {
  if (!Array.isArray(ownedList)) return 0;
  let cnt = 0;
  const seen = new Set();
  for (const id of ownedList) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    const def = Object.hasOwn(HERO_SKINS_BY_ID, id)
      ? HERO_SKINS_BY_ID[id]
      : Object.hasOwn(ATTACK_VFX_THEMES, id)
        ? ATTACK_VFX_THEMES[id]
        : null;
    if (def && def.unlock === 'shop' && def.price > 0) cnt++;
  }
  return cnt;
}
