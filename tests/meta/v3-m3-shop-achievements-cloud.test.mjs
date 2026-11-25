import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVE_VERSION,
  DEFAULT_UNLOCKED_WEAPONS,
  HERO_IDS,
  WEAPON_IDS,
  defaultSave,
  migrateSave,
  mergeSaves,
  saveProgressScore,
  getHeroStarterWeapon,
  setHeroStarterWeapon,
} from '../../src/meta/save.js';
import {
  HERO_SKINS,
  ATTACK_VFX_LIST,
  buyCosmetic,
  cosmeticShopSpent,
  equipHeroSkin,
  equipAttackVfx,
  getEquippedHeroSkin,
  getEquippedAttackVfx,
  isCosmeticOwned,
} from '../../src/meta/cosmetics.js';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  reconcileAchievements,
  getAchievementProgress,
  getUnclaimedAchievementCount,
  claimAchievement,
  claimAllAchievements,
} from '../../src/meta/achievements.js';
import { createCloudSave, ARCHIVE_NAME } from '../../src/meta/cloud-save.js';
import { recordRun } from '../../src/meta/unlocks.js';

test('v3 M3 Save 迁移：旧版迁移、道号 XSS 清洗、自选初始兵刃记忆与越界回退', () => {
  assert.equal(SAVE_VERSION, 4);
  const s0 = defaultSave();
  assert.equal(s0.version, SAVE_VERSION);
  assert.deepEqual(s0.unlockedWeapons, [...DEFAULT_UNLOCKED_WEAPONS]);
  assert.equal(getHeroStarterWeapon(s0, 'zhou'), 'gong');
  assert.equal(getHeroStarterWeapon(s0, 'nuoxi'), 'nuo_drum');

  // 旧 v1 存档无损升级至最新版本，同时拦截 XSS 与超长道号、脏武器/外观 ID
  const v1 = migrateSave({
    version: 1,
    daoName: '<script>alert(1)</script>守夜老道长名字超长截断',
    coins: -999,
    unlockedHeroes: ['zhou', 'tiejiang', '__bogus__'],
    selectedHero: 'tiejiang',
    unlockedWeapons: ['gong', '__hack_sword__'],
    selectedStarterWeapon: '__hack_sword__',
    cosmetics: {
      owned: ['__fake_skin__', 'jade_ghostfire', 'jade_ghostfire'],
      equipped: {
        attackVfx: '__bad_vfx__',
        heroSkins: { zhou: '__bad_skin__', tiejiang: 'tiejiang_crimson_furnace' },
      },
    },
    achievements: { firstClear: 1700000001234, kills800: 1700000002345 },
  });

  assert.equal(v1.version, SAVE_VERSION);
  assert.equal(v1.coins, 0);
  assert.equal(/[<>]/.test(v1.daoName), false, 'daoName 必须剥除尖括号防 XSS');
  assert.ok(v1.daoName.length <= 12, 'daoName 长度上限为 12 字符');
  assert.ok(v1.unlockedHeroes.includes('tiejiang'));
  assert.ok(v1.unlockedWeapons.includes('suohun_chain'), '已解锁铁匠自动回填本命兵刃锁魂铁链');
  assert.equal(v1.unlockedWeapons.includes('__hack_sword__'), false);
  assert.equal(getHeroStarterWeapon(v1, 'tiejiang'), 'suohun_chain', '非法起手武器自动回退至角色本命兵刃');
  assert.deepEqual(v1.cosmetics.owned, ['jade_ghostfire']);
  assert.equal(v1.cosmetics.equipped.attackVfx, 'default');
  assert.equal(v1.cosmetics.equipped.heroSkins.tiejiang, undefined, '未拥有的非默认皮肤不得在迁移后强行穿戴');

  // 切换角色自选起手兵刃记忆互不污染
  const sPick = migrateSave({
    version: 3,
    unlockedHeroes: ['zhou', 'nuoxi'],
    unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS, 'taomujian'],
  });
  assert.equal(setHeroStarterWeapon(sPick, 'zhou', 'taomujian'), true);
  assert.equal(setHeroStarterWeapon(sPick, 'zhou', 'zhinian_kite'), false, '未解锁秘器不可选为初始兵刃');
  assert.equal(getHeroStarterWeapon(sPick, 'zhou'), 'taomujian');
  assert.equal(getHeroStarterWeapon(sPick, 'nuoxi'), 'nuo_drum', '青衣傩师保持各自本命初始兵刃');
});

test('v3 M3 F8 鬼市商铺：18 皮肤 + 5 特效目录、铜钱购买防重扣、功绩专属禁铜钱购入与穿戴联动', () => {
  assert.equal(HERO_SKINS.length, 18);
  assert.equal(ATTACK_VFX_LIST.length, 5);
  for (const hid of HERO_IDS) {
    assert.equal(HERO_SKINS.filter((s) => s.heroId === hid).length, 3, `${hid} 必须拥有 3 套皮肤`);
  }
  const copperSkins = HERO_SKINS.filter((s) => s.unlock === 'shop');
  const achSkins = HERO_SKINS.filter((s) => s.unlock === 'achievement');
  assert.ok(copperSkins.length >= 9);
  assert.equal(achSkins.length, 3);

  const save = defaultSave();
  save.coins = 1000;

  // 铜钱不足拒绝购买，余额零变动
  const expensive = HERO_SKINS.find((s) => s.id === 'tiejiang_violet_asura');
  assert.ok(expensive && expensive.price > 1000);
  const failCoins = buyCosmetic(save, expensive.id);
  assert.equal(failCoins.ok, false);
  assert.equal(failCoins.reason, 'coins');
  assert.equal(save.coins, 1000);

  // 功绩专属皮肤即使持有巨额铜钱也禁止铜钱购买
  save.coins = 99_999;
  const achSkin = HERO_SKINS.find((s) => s.unlock === 'achievement');
  const failAch = buyCosmetic(save, achSkin.id);
  assert.equal(failAch.ok, false);
  assert.equal(failAch.reason, 'achievement_only');
  assert.equal(save.coins, 99_999);
  assert.equal(equipHeroSkin(save, achSkin.heroId, achSkin.id).ok, false);

  // 正常购买 + 同步连点防重扣 + cosmeticShopSpent 记账
  save.coins = 2000;
  const buy1 = buyCosmetic(save, 'jade_ghostfire');
  const buy2 = buyCosmetic(save, 'jade_ghostfire');
  assert.equal(buy1.ok, true);
  assert.equal(buy1.alreadyOwned, false);
  assert.equal(buy2.ok, true);
  assert.equal(buy2.alreadyOwned, true);
  assert.equal(save.coins, 2000 - buy1.price);
  assert.equal(cosmeticShopSpent(save.cosmetics.owned), buy1.price);
  assert.equal(save.cosmetics.owned.filter((x) => x === 'jade_ghostfire').length, 1);

  assert.equal(equipAttackVfx(save, 'jade_ghostfire').ok, true);
  assert.equal(getEquippedAttackVfx(save), 'jade_ghostfire');

  const zhouShopSkin = HERO_SKINS.find((s) => s.heroId === 'zhou' && s.unlock === 'shop');
  assert.equal(buyCosmetic(save, zhouShopSkin.id).ok, true);
  assert.equal(equipHeroSkin(save, 'zhou', zhouShopSkin.id).ok, true);
  assert.equal(getEquippedHeroSkin(save, 'zhou'), zhouShopSkin.id);
  assert.equal(equipHeroSkin(save, 'zhou', 'zhou_default').ok, true);
  assert.equal(getEquippedHeroSkin(save, 'zhou'), 'zhou_default');
});

test('v3 M3 F9 守夜功绩：保留 7 项经典成就、799/800 边界拒领、双把新秘器与 3 套典藏皮肤领赏幂等', () => {
  assert.ok(ACHIEVEMENTS.length >= 18);
  for (const legacyId of ['firstClear', 'kills800', 'noBun480', 'endless10', 'hit10k', 'hit100m', 'night10']) {
    assert.ok(ACHIEVEMENTS_BY_ID[legacyId], `必须保留旧成就 ID: ${legacyId}`);
  }

  // 799 / 800 严格差一边界不可解锁或领赏
  const s799 = migrateSave({
    version: 3,
    coins: 100,
    stats: { runs: 1, bestKills: 799, totalKills: 799 },
  });
  reconcileAchievements(s799);
  assert.equal(getAchievementProgress(s799, 'kills800').unlocked, false);
  assert.equal(claimAchievement(s799, 'kills800').ok, false);
  assert.equal(s799.coins, 100);

  // 回溯解锁桃木飞剑（totalKills1500）、纸鸢火鸦（evolve5）、3 套典藏皮肤与玄霜寒月特效
  const sRich = migrateSave({
    version: 3,
    coins: 200,
    unlockedHeroes: [...HERO_IDS],
    nightUnlocked: 10,
    nightCleared: 10,
    codex: {
      weapons: [...WEAPON_IDS],
      evolutions: [...WEAPON_IDS],
      relics: ['clapper', 'censer', 'cinnabar', 'inkstone'],
      enemies: { paperkid: 100, horse: 3, umbrella: 3, youshen: 3 },
    },
    leaderboard: { bestScore: 60_000, bestEndlessSec: 700, bestKills: 3000, history: [] },
    stats: {
      runs: 25,
      clears: 8,
      firstRunDone: true,
      bestTimeSec: 1250,
      bestKills: 3000,
      bestHit: 120_000_000,
      totalKills: 20_000,
      totalEvolutions: 25,
      totalBossKills: 18,
      coopRuns: 3,
      coopRevives: 5,
    },
  });

  reconcileAchievements(sRich);
  assert.ok(getUnclaimedAchievementCount(sRich) >= 12);

  // 单项领取桃木飞剑并验证重复点击幂等
  const cTao1 = claimAchievement(sRich, 'totalKills1500');
  const cTao2 = claimAchievement(sRich, 'totalKills1500');
  assert.equal(cTao1.ok, true);
  assert.equal(cTao2.ok, false);
  assert.ok(sRich.unlockedWeapons.includes('taomujian'));
  assert.equal(sRich.unlockedWeapons.filter((w) => w === 'taomujian').length, 1);

  // 一键领赏全部剩余已达成功绩
  const batch1 = claimAllAchievements(sRich);
  assert.equal(batch1.ok, true);
  assert.ok(sRich.unlockedWeapons.includes('zhinian_kite'));
  assert.equal(isCosmeticOwned(sRich, 'zhou_imperial_bell'), true);
  assert.equal(isCosmeticOwned(sRich, 'daotong_jade_immortal'), true);
  assert.equal(isCosmeticOwned(sRich, 'yinyang_gold_oracle'), true);
  assert.equal(isCosmeticOwned(sRich, 'frost_moon'), true);

  const coinsAfterAll = sRich.coins;
  const batch2 = claimAllAchievements(sRich);
  assert.equal(batch2.ok, false, '二次一键领赏不得重复发奖');
  assert.equal(sRich.coins, coinsAfterAll);
  assert.equal(getUnclaimedAchievementCount(sRich), 0);
});

test('v3 M3 F11 云存档 v3 合并：防跨端买皮肤退铜钱漏洞、全字段无损并集与 TapTap 桥接容错', async () => {
  // 1) 防刷钱测试：云端快照保存于购入皮肤前（coins=2000, updatedAt=50000），本机花 880 购入特效（coins=1120, updatedAt=50000 时间戳平局）
  const preBuyRemote = migrateSave({
    version: 3,
    updatedAt: 50_000,
    coins: 2000,
    unlockedHeroes: ['zhou', 'mian'],
  });
  const postBuyLocal = structuredClone(preBuyRemote);
  const bought = buyCosmetic(postBuyLocal, 'jade_ghostfire');
  assert.equal(bought.ok, true);
  postBuyLocal.updatedAt = 50_000; // 强制同毫秒平局，靠 saveProgressScore 裁决

  assert.ok(
    saveProgressScore(postBuyLocal) > saveProgressScore(preBuyRemote),
    '购入鬼市外观后的存档进度分必须严格高于购入前快照（防止铜钱退回刷外观）',
  );
  const antiExploitMerged = mergeSaves(postBuyLocal, preBuyRemote);
  assert.equal(antiExploitMerged.coins, 2000 - bought.price, '合并后严禁退回已花掉的鬼市铜钱');
  assert.ok(antiExploitMerged.cosmetics.owned.includes('jade_ghostfire'));

  // 2) 跨设备双向异构进度无损合并（6 角色、秘器、皮肤穿戴、功绩领赏、排行榜高分）
  const devA = migrateSave({
    version: 3,
    updatedAt: 80_000,
    daoName: '甲端打更人',
    coins: 640,
    unlockedHeroes: ['zhou', 'yinyang'],
    unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS, 'taomujian'],
    starterWeaponByHero: { zhou: 'taomujian' },
    cosmetics: {
      owned: ['violet_thunder'],
      cosmeticShopSpent: 1180,
      equipped: { attackVfx: 'violet_thunder', heroSkins: {} },
    },
    achievements: { firstClear: 1700000005000 },
    achievementClaims: ['totalKills1500'],
    leaderboard: {
      bestScore: 18_500,
      bestEndlessSec: 180,
      bestKills: 920,
      history: [{ score: 18_500, heroId: 'yinyang', nightLevel: 2, kills: 920, timeSec: 600, at: 79_000 }],
    },
    stats: { runs: 6, clears: 2, totalKills: 3200, totalEvolutions: 4, totalBossKills: 5 },
  });

  const devB = migrateSave({
    version: 3,
    updatedAt: 90_000,
    daoName: '乙端掌灯使',
    coins: 910,
    unlockedHeroes: ['zhou', 'nuoxi'],
    unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS, 'zhinian_kite'],
    starterWeaponByHero: { nuoxi: 'zhinian_kite' },
    cosmetics: {
      owned: ['nuoxi_azure_phoenix'],
      cosmeticShopSpent: 860,
      equipped: { attackVfx: 'default', heroSkins: { nuoxi: 'nuoxi_azure_phoenix' } },
    },
    achievements: { firstClear: 1700000001000, kills800: 1700000003000 },
    achievementClaims: ['evolve5'],
    leaderboard: {
      bestScore: 24_200,
      bestEndlessSec: 420,
      bestKills: 1450,
      history: [{ score: 24_200, heroId: 'nuoxi', nightLevel: 4, kills: 1450, timeSec: 900, at: 89_000 }],
    },
    stats: { runs: 9, clears: 4, totalKills: 5100, totalEvolutions: 7, totalBossKills: 9 },
  });

  const mergedAB = mergeSaves(devA, devB);
  assert.equal(mergedAB.version, SAVE_VERSION);
  assert.equal(mergedAB.coins, 910, '更新时间戳端余额胜出');
  assert.ok(mergedAB.unlockedHeroes.includes('yinyang') && mergedAB.unlockedHeroes.includes('nuoxi'));
  assert.ok(mergedAB.unlockedWeapons.includes('taomujian') && mergedAB.unlockedWeapons.includes('zhinian_kite'));
  assert.equal(getHeroStarterWeapon(mergedAB, 'zhou'), 'taomujian');
  assert.equal(getHeroStarterWeapon(mergedAB, 'nuoxi'), 'zhinian_kite');
  assert.ok(mergedAB.cosmetics.owned.includes('violet_thunder') && mergedAB.cosmetics.owned.includes('nuoxi_azure_phoenix'));
  assert.equal(mergedAB.cosmetics.equipped.heroSkins.nuoxi, 'nuoxi_azure_phoenix');
  assert.equal(mergedAB.achievements.firstClear, 1700000001000, '同名成就保留最早达成时间戳');
  assert.ok(mergedAB.achievementClaims.includes('totalKills1500') && mergedAB.achievementClaims.includes('evolve5'));
  assert.equal(mergedAB.leaderboard.bestScore, 24_200);
  assert.equal(mergedAB.leaderboard.history.length, 2);
  assert.equal(mergedAB.leaderboard.history[0].score, 24_200);

  // 3) TapTap 云存档 SDK res.archives 字段兼容、时间戳不覆盖与 errno=400001 频控降级
  const tapFiles = new Map();
  let storedPayload = null;
  let forceRateLimit = false;
  let clock = 1_700_100_000_000;
  const tap = {
    env: { USER_DATA_PATH: 'tapfile://usr' },
    getFileSystemManager() {
      return {
        writeFile({ filePath, data, success }) {
          tapFiles.set(filePath, String(data));
          success?.({ errMsg: 'writeFile:ok' });
        },
        readFile({ filePath, success, fail }) {
          if (!tapFiles.has(filePath)) {
            fail?.(new Error('missing file'));
            return;
          }
          success?.({ data: tapFiles.get(filePath) });
        },
      };
    },
    getCloudSaveManager() {
      return {
        getArchiveList({ success }) {
          success?.(storedPayload
            ? { archives: [{ archiveId: 'tap_1', fileId: 'file_1', name: ARCHIVE_NAME, updatedAt: clock }] }
            : { archives: [] });
        },
        getArchiveData({ targetFilePath, success }) {
          tapFiles.set(targetFilePath, storedPayload);
          success?.({ filePath: targetFilePath });
        },
        createArchive({ archiveFilePath, success, fail }) {
          if (forceRateLimit) { fail?.({ errno: 400001, message: 'rate limited' }); return; }
          storedPayload = tapFiles.get(archiveFilePath);
          success?.({ archiveId: 'tap_1', fileId: 'file_1' });
        },
        updateArchive({ archiveFilePath, success, fail }) {
          if (forceRateLimit) { fail?.({ errno: 400001, message: 'rate limited' }); return; }
          storedPayload = tapFiles.get(archiveFilePath);
          success?.({ archiveId: 'tap_1', fileId: 'file_1' });
        },
      };
    },
  };

  const cloud = createCloudSave({ win: { tap }, now: () => clock });
  assert.equal(cloud.isAvailable(), true);
  const up1 = await cloud.uploadNow(devA);
  assert.equal(up1.ok, true);
  assert.equal(JSON.parse(storedPayload).updatedAt, 80_000, '显式 updatedAt > 0 不得被系统时钟冲掉');

  clock += 65_000;
  const pullRes = await cloud.pullFromCloud(devB);
  assert.equal(pullRes.ok, true);
  assert.equal(pullRes.hasRemote, true);
  assert.ok(pullRes.merged.unlockedWeapons.includes('taomujian'));
  assert.ok(pullRes.merged.unlockedWeapons.includes('zhinian_kite'));

  forceRateLimit = true;
  const rlRes = await cloud.uploadNow(pullRes.merged);
  assert.equal(rlRes.ok, false);
  assert.equal(rlRes.reason, 'error');
  assert.equal(cloud.getState().dirty, true, '命中 400001 频控后必须保留 dirtySave 等待冷却后自动补传');
  cloud.destroy();

  // recordRun 统计单调不减不回退
  recordRun(pullRes.merged, { timeSec: 5, kills: 0, maxHit: 0, cleared: false, mode: 'main', heroId: 'zhou', nightLevel: 0 }, clock);
  assert.equal(pullRes.merged.stats.totalKills, 5100);
  assert.equal(pullRes.merged.leaderboard.bestScore, 24_200);
});
