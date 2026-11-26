// TapTap 排行榜线上配置（F12 总榜 + v4 M3 每日异事榜与守夜令榜）
// - 五更守夜总榜真实线上 ID：c5mzumajes9houq0ra（单位：分，降序排列，保留周期内最佳成绩）
// - 每日异事榜真实线上 ID：ofuwiinc9n5khd1ehh（每日重置，单位：分，降序排列，保留周期内最佳成绩）
// - 守夜令榜真实线上 ID：hxw70v121367vj083y（每月重置，单位：分，降序排列，保留周期内最佳成绩）

export const PRIMARY_LEADERBOARD_ID = 'c5mzumajes9houq0ra';
export const PRIMARY_LEADERBOARD_NAME = '五更守夜总榜';
export const PRIMARY_LEADERBOARD_UNIT = '分';

export const DAILY_LEADERBOARD_ID = 'ofuwiinc9n5khd1ehh';
export const DAILY_LEADERBOARD_NAME = '每日异事榜';

export const SEASON_LEADERBOARD_ID = 'hxw70v121367vj083y';
export const SEASON_LEADERBOARD_NAME = '守夜令榜';

export const LEADERBOARD_COLLECTIONS = Object.freeze({
  PUBLIC: 'public',
  FRIENDS: 'friends',
});

export const LEADERBOARD_MAX_SUBMIT_BATCH = 5;
export const LEADERBOARD_MAX_PAGE_SIZE = 200;
export const LEADERBOARD_DEFAULT_PAGE_SIZE = 20;

export function getLeaderboardConfig() {
  return {
    leaderboardId: PRIMARY_LEADERBOARD_ID,
    dailyLeaderboardId: DAILY_LEADERBOARD_ID,
    seasonLeaderboardId: SEASON_LEADERBOARD_ID,
    name: PRIMARY_LEADERBOARD_NAME,
    unit: PRIMARY_LEADERBOARD_UNIT,
    sortOrder: 'desc',
    scorePolicy: 'best',
  };
}
