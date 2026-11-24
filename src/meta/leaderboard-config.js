// TapTap「五更守夜总榜」真实线上配置（F12）
// 线上已开通真实榜单 ID：c5mzumajes9houq0ra（单位：分，降序排列，保留周期内最佳成绩）

export const PRIMARY_LEADERBOARD_ID = 'c5mzumajes9houq0ra';
export const PRIMARY_LEADERBOARD_NAME = '五更守夜总榜';
export const PRIMARY_LEADERBOARD_UNIT = '分';

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
    name: PRIMARY_LEADERBOARD_NAME,
    unit: PRIMARY_LEADERBOARD_UNIT,
    sortOrder: 'desc',
    scorePolicy: 'best',
  };
}
