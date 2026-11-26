import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultSave, migrateSave, mergeSaves, saveProgressScore } from '../../src/meta/save.js';
import {
  DAILY_TASK_POOL,
  WEEKLY_CHESTS,
  claimDailyTask,
  claimWeeklyChest,
  drawDailyTasks,
  getDailyState,
  localMondayString,
  recordDailyRun,
} from '../../src/meta/daily.js';
import {
  DAILY_CHALLENGE_FIRST_COINS,
  DAILY_CHALLENGE_FIRST_SEASON_XP,
  DAILY_CHALLENGE_FIRST_WEEKLY_PTS,
  DAILY_RULES,
  buildCombinedRunRules,
  getDailyChallengeSpec,
  getDailyChallengeState,
  recordDailyChallengeRun,
} from '../../src/meta/daily-challenge.js';
import { SEASONS, buildSeasonPassTable } from '../../src/meta/season-config.js';
import {
  addSeasonXp,
  buildSeasonRunRules,
  claimAllSeasonTiers,
  claimSeasonTier,
  equipSeasonTitle,
  getSeasonState,
  recordSeasonRun,
  setSeasonRuleActive,
} from '../../src/meta/season.js';
import { buyCosmetic, equipHeroSkin, getEquippedHeroSkin, isCosmeticOwned } from '../../src/meta/cosmetics.js';
import {
  DAILY_LEADERBOARD_ID,
  SEASON_LEADERBOARD_ID,
  getLeaderboardConfig,
} from '../../src/meta/leaderboard-config.js';
import { createLeaderboard } from '../../src/meta/leaderboard.js';
import { createRun, stepRun, endRun } from '../../src/sim/run.js';
import { candidateChoices } from '../../src/sim/levelup.js';
import { dropPickup } from '../../src/sim/pickups.js';

test('M3.1 每日差事与周赏供盒：30 题池不重类抽取、联机与单机结算推进、跨日保留周分、跨周一重置与防回拨', () => {
  assert.equal(DAILY_TASK_POOL.length, 30);
  assert.deepEqual(WEEKLY_CHESTS.map((c) => c.points), [30, 60, 100, 150]);
  for (const t of DAILY_TASK_POOL) {
    assert.ok(t.coins >= 60 && t.coins <= 120, `差事 ${t.id} 铜钱应在 60..120 之间`);
  }

  const d1 = drawDailyTasks('2026-12-02'); // 周三
  const d1Again = drawDailyTasks('2026-12-02');
  assert.deepEqual(d1.map((t) => t.id), d1Again.map((t) => t.id), '同日抽取必须完全确定');
  assert.equal(new Set(d1.map((t) => t.group)).size, 3, '同日 3 条差事必须分属 3 个不同类别');

  assert.equal(localMondayString('2026-12-02'), '2026-11-30');
  assert.equal(localMondayString('2026-12-06'), '2026-11-30');
  assert.equal(localMondayString('2026-12-07'), '2026-12-07');

  const save = defaultSave();
  // 模拟一局丰厚战果（兼容同守联机 coopSize=2），一次性达成当天全部 3 条差事
  const bigSummary = {
    heroId: 'zhou',
    startWeapon: 'gong',
    signatureStart: true,
    cleared: true,
    reachedWatch: 6,
    timeSec: 420,
    level: 25,
    kills: 650,
    coins: 160,
    maxHit: 2400,
    maxCombo: 90,
    evolvedCount: 3,
    maxSynergyTier: 6,
    bossKills: 3,
    eventsCompleted: 3,
    coopSize: 2,
    weapons: [
      { id: 'gong', level: 8, evolved: true },
      { id: 'talisman', level: 8, evolved: true },
      { id: 'paperman', level: 8, evolved: true },
      { id: 'lantern', level: 5, evolved: false },
    ],
    relics: [{ id: 'clapper', level: 3 }],
  };

  recordDailyRun(save, bigSummary, '2026-12-02');
  // 再补一局以满足可能抽到的 runs>=2 差事
  recordDailyRun(save, bigSummary, '2026-12-02');
  const stDay1 = getDailyState(save, '2026-12-02');
  assert.equal(stDay1.tasks.every((t) => t.canClaim), true, '两局丰厚战果后当日 3 条差事均应可领');

  for (const t of stDay1.tasks) {
    const cRes = claimDailyTask(save, t.id, '2026-12-02');
    assert.equal(cRes.ok, true);
    assert.equal(claimDailyTask(save, t.id, '2026-12-02').ok, false, '同一差事不可重复领赏');
  }
  assert.equal(save.daily.weeklyPoints, 30, '领完 3 条差事应累计 30 周积分');
  assert.equal(save.season.xp, 60, '领完 3 条差事应累计 60 令火');

  // 开启 30 分初阶周赏供盒
  const chest30 = claimWeeklyChest(save, 30, '2026-12-02', { rng: () => 0.25 });
  assert.equal(chest30.ok, true);
  assert.equal(chest30.coins, 80);
  assert.equal(chest30.charms.length, 1);
  assert.equal(claimWeeklyChest(save, 30, '2026-12-02').ok, false, '周赏供盒不可重复开启');

  // 时钟回拨保护
  const rbState = getDailyState(save, '2026-12-01');
  assert.equal(rbState.rollback, true);

  // 同周跨天（周四）：差事刷新，周积分与已领周供盒保留
  const stDay2 = getDailyState(save, '2026-12-03');
  assert.equal(stDay2.weeklyPoints, 30);
  assert.equal(stDay2.chests[0].claimed, true);
  assert.equal(stDay2.tasks.every((t) => !t.claimed && t.have === 0), true);

  // 跨周一（下周一 2026-12-07）：周积分与供盒重置
  recordDailyRun(save, { kills: 10, timeSec: 20, reachedWatch: 1 }, '2026-12-07');
  assert.equal(save.daily.weeklyPoints, 0);
  assert.deepEqual(save.daily.weeklyClaimed, []);
});

test('M3.2 每日异事挑战：12 规则池确定性同种、sim 层纯规则生效、首局 200 铜钱重赏与同日试手防重发', () => {
  assert.equal(DAILY_RULES.length, 12);
  const specA = getDailyChallengeSpec('2026-12-05');
  const specB = getDailyChallengeSpec('2026-12-05');
  const specNext = getDailyChallengeSpec('2026-12-06');
  assert.equal(specA.seed, specB.seed);
  assert.equal(specA.heroId, specB.heroId);
  assert.equal(specA.startWeapon, specB.startWeapon);
  assert.deepEqual(specA.rules.map((r) => r.id), specB.rules.map((r) => r.id));
  assert.notEqual(specA.seed, specNext.seed);

  // 验证 sim 层纯数据规则：onlySchool + autoMagnetXp + noBuns + swapWeaponPerWatch + glass_blade
  const customRules = buildCombinedRunRules([
    DAILY_RULES.find((r) => r.id === 'only_daofa'),
    DAILY_RULES.find((r) => r.id === 'magnet_rush'),
    DAILY_RULES.find((r) => r.id === 'swift_fasting'),
    DAILY_RULES.find((r) => r.id === 'watch_swap'),
    DAILY_RULES.find((r) => r.id === 'glass_blade'),
  ], { mode: 'daily', dailyDate: '2026-12-05' });

  const baseRun = createRun({ seed: 77, heroId: 'zhou', startWeapon: 'talisman' });
  const ruledRun = createRun({ seed: 77, heroId: 'zhou', startWeapon: 'talisman', runRules: customRules });
  assert.ok(ruledRun.player.maxHp < baseRun.player.maxHp, '脆身重刃应降低最大气血');
  assert.ok(ruledRun.player.speed > baseRun.player.speed, '疾步轻身应提高移速');

  // onlySchool 升级候选池过滤
  const cands = candidateChoices(ruledRun);
  assert.ok(cands.length > 0);
  assert.equal(cands.every((c) => c.id === 'talisman' || (c.kind === 'weapon' || c.kind === 'relic')), true);

  // noBuns 将肉包转为魂火，且 autoMagnetXp 全屏自动吸附远端魂火
  const dropped = dropPickup(ruledRun, 'bun', ruledRun.player.x + 900, ruledRun.player.y + 900, 25);
  assert.equal(dropped.kind, 'xp', '禁肉包词条下掉落肉包应转为魂火');
  stepRun(ruledRun, { moveX: 0, moveY: 0 }, 1 / 60);
  assert.equal(dropped.mag, true, '魂火自飞词条应使远端魂火立即进入吸附态');

  // swapWeaponPerWatch 换更易兵
  ruledRun.weapons.push({ id: 'gong', level: 3, cd: 0, evolved: false, altarReady: false });
  ruledRun.time = 84.1;
  stepRun(ruledRun, { moveX: 0, moveY: 0 }, 1 / 60);
  assert.notEqual(ruledRun.weapons[1].id, 'gong', '每更易兵词条应在换更时轮换未开光副兵刃');
  assert.equal(ruledRun.weapons[1].level, 3, '轮换后兵刃等级保持不变');

  const summary1 = endRun(ruledRun);
  assert.equal(summary1.isDailyChallenge, true);
  assert.equal(summary1.dailyDate, '2026-12-05');

  // 首局发 200 铜钱 + 30 周分 + 50 令火；同日第二局试手不重复发赏但更新最高分
  const save = defaultSave();
  const r1 = recordDailyChallengeRun(save, { ...summary1, score: 4000, dailyScore: 4800 }, '2026-12-05');
  assert.equal(r1.ok, true);
  assert.equal(r1.rewarded, true);
  assert.equal(r1.coins, DAILY_CHALLENGE_FIRST_COINS);
  assert.equal(save.coins, DAILY_CHALLENGE_FIRST_COINS);
  assert.equal(save.daily.weeklyPoints, DAILY_CHALLENGE_FIRST_WEEKLY_PTS);
  assert.equal(save.season.xp, DAILY_CHALLENGE_FIRST_SEASON_XP);

  const coinsAfterFirst = save.coins;
  const r2 = recordDailyChallengeRun(save, { ...summary1, score: 6000, dailyScore: 7200 }, '2026-12-05');
  assert.equal(r2.rewarded, false, '同日第二局试手不得重复发放首局赏银');
  assert.equal(save.coins, coinsAfterFirst);
  assert.equal(getDailyChallengeState(save, '2026-12-05').todayBestScore, 7200, '同日试手更高异事分必须刷新');
});

test('M3.3 守夜令 30 档通行证、老周·血月限定皮肤、血月开关隔离、云存档合并与副榜回退', async () => {
  assert.equal(SEASONS[0].id, 's1');
  assert.equal(SEASONS[0].name, '血月');
  const table = buildSeasonPassTable(SEASONS[0]);
  assert.equal(table.length, 30);
  assert.equal(table[29].id, 'zhou_bloodmoon');

  const save = defaultSave();
  // 默认血月开关关闭：主线不受影响
  assert.equal(buildSeasonRunRules(save, '2026-12-10'), null);
  setSeasonRuleActive(save, true, '2026-12-10');
  const bmRules = buildSeasonRunRules(save, '2026-12-10');
  assert.ok(bmRules);
  assert.equal(bmRules.seasonRuleActive, true);
  assert.ok(Math.abs(bmRules.enemySpeedMul - 1.12) < 1e-6);
  assert.ok(Math.abs(bmRules.xpMul - 1.15) < 1e-6);

  // 未满 30 档前不可铜钱购买或穿戴老周·血月
  save.coins = 50_000;
  assert.equal(buyCosmetic(save, 'zhou_bloodmoon').reason, 'season_only');
  assert.equal(equipHeroSkin(save, 'zhou', 'zhou_bloodmoon').ok, false);

  // 结算一局血月守夜积攒令火与当期最高分
  const sr = recordSeasonRun(save, {
    heroId: 'zhou',
    timeSec: 320,
    kills: 440,
    cleared: false,
    score: 15_000,
    dailyScore: 17_250,
    seasonRuleActive: true,
  }, '2026-12-10');
  assert.ok(sr.xpAdded >= 40);
  assert.equal(save.season.bestSeasonScore, 17_250);

  // 升满 3000 令火（30 档），一键领取全部奖励并穿戴名号与老周·血月
  addSeasonXp(save, 3000, '2026-12-10');
  const stBefore = getSeasonState(save, '2026-12-10');
  assert.equal(stBefore.currentTier, 30);
  assert.equal(stBefore.claimableCount, 30);

  const allClaimed = claimAllSeasonTiers(save, '2026-12-10');
  assert.equal(allClaimed.ok, true);
  assert.equal(allClaimed.claimedCount, 30);
  assert.equal(isCosmeticOwned(save, 'zhou_bloodmoon'), true);
  assert.equal(equipHeroSkin(save, 'zhou', 'zhou_bloodmoon').ok, true);
  assert.equal(getEquippedHeroSkin(save, 'zhou'), 'zhou_bloodmoon');
  assert.equal(equipSeasonTitle(save, 'title_bloodmoon_marshal', '2026-12-10').ok, true);
  assert.equal(claimSeasonTier(save, 30, '2026-12-10').ok, false, '第 30 档不可重复领取');

  // 云存档无损合并与幂等性校验
  const migrated = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.equal(isCosmeticOwned(migrated, 'zhou_bloodmoon'), true);
  const merged = mergeSaves(migrated, defaultSave());
  assert.equal(isCosmeticOwned(merged, 'zhou_bloodmoon'), true);
  assert.equal(merged.season.claimedTiers.length, 30);
  assert.equal(saveProgressScore(merged), saveProgressScore(mergeSaves(merged, merged)));

  // 线上真实副榜 ID 校验 + 未配置回退 + pendingScore 队列冲刷 + 周期令牌 periodToken 自动发现重试
  assert.equal(DAILY_LEADERBOARD_ID, 'ofuwiinc9n5khd1ehh');
  assert.equal(SEASON_LEADERBOARD_ID, 'hxw70v121367vj083y');
  assert.equal(getLeaderboardConfig().dailyLeaderboardId, 'ofuwiinc9n5khd1ehh');
  assert.equal(getLeaderboardConfig().seasonLeaderboardId, 'hxw70v121367vj083y');

  const lbUnconfigured = createLeaderboard({
    win: { location: { search: '?mockLeaderboard=1' } },
    getSave: () => merged,
    persistSave: () => {},
    dailyLeaderboardId: '',
    seasonLeaderboardId: '',
  });
  const dailyBoardLocal = await lbUnconfigured.fetchBoard({ boardType: 'daily', save: merged });
  const seasonBoardLocal = await lbUnconfigured.fetchBoard({ boardType: 'season', save: merged });
  assert.equal(dailyBoardLocal.source, 'local');
  assert.equal(seasonBoardLocal.source, 'local');
  assert.ok(seasonBoardLocal.entries.length >= 1);

  const lbOffline = createLeaderboard({ getSave: () => merged, persistSave: () => {} });
  const queuedDaily = await lbOffline.submitDailyScore(9120, merged);
  const queuedSeason = await lbOffline.submitSeasonScore(18400, merged);
  assert.equal(queuedDaily.ok, false);
  assert.equal(queuedDaily.queued, true);
  assert.equal(queuedSeason.ok, false);
  assert.equal(queuedSeason.queued, true);
  assert.equal(merged.dailyChallenge.pendingScore, 9120);
  assert.equal(merged.season.pendingScore, 18400);

  let seenDailyPeriod = '';
  const submittedBatches = [];
  const lbLive = createLeaderboard({
    win: {
      location: { search: '' },
      tap: {
        getLeaderboardManager() {
          return {
            submitScores(p) {
              submittedBatches.push(p.scores);
              p.callback?.onSuccess?.({ results: p.scores });
            },
            loadLeaderboardScores(p) {
              if (p.leaderboardId === DAILY_LEADERBOARD_ID && !p.periodToken) {
                p.callback?.onFailure?.(500101, 'missing periodToken');
                return;
              }
              seenDailyPeriod = p.periodToken || seenDailyPeriod;
              p.callback?.onSuccess?.({
                scores: [{ rank: 1, score: p.leaderboardId === DAILY_LEADERBOARD_ID ? 9120 : 18400, user: { name: '魁首道友' } }],
              });
            },
            loadCurrentPlayerLeaderboardScore(p) {
              p.callback?.onSuccess?.({
                leaderboard: { period: { periodToken: p.leaderboardId === DAILY_LEADERBOARD_ID ? 'daily_tok_1125' : 'season_tok_11' } },
                currentUserScore: { rank: 1, score: p.leaderboardId === DAILY_LEADERBOARD_ID ? 9120 : 18400, user: { name: '魁首道友' } },
              });
            },
            openLeaderboard(p) {
              p.callback?.onSuccess?.({ opened: true });
            },
          };
        },
      },
    },
    getSave: () => merged,
    persistSave: () => {},
  });

  const remoteDaily = await lbLive.fetchBoard({ boardType: 'daily', save: merged });
  assert.equal(remoteDaily.ok, true);
  assert.equal(remoteDaily.leaderboardId, 'ofuwiinc9n5khd1ehh');
  assert.equal(seenDailyPeriod, 'daily_tok_1125');
  assert.equal(merged.dailyChallenge.pendingScore, 0);

  const remoteSeason = await lbLive.fetchBoard({ boardType: 'season', save: merged });
  assert.equal(remoteSeason.ok, true);
  assert.equal(remoteSeason.leaderboardId, 'hxw70v121367vj083y');
  assert.equal(merged.season.pendingScore, 0);
  assert.ok(submittedBatches.some((b) => b[0]?.leaderboardId === 'ofuwiinc9n5khd1ehh' && b[0]?.score === 9120));
  assert.ok(submittedBatches.some((b) => b[0]?.leaderboardId === 'hxw70v121367vj083y' && b[0]?.score === 18400));
});
