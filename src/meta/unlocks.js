// 解锁与结算入账（PLAN §4.7）。
// - 阿绵：单局打败 ≥ 800 只敌人
// - 小道童：一个包子都不吃，守到五更（撑到 8:00 = 480 秒）
// - 夜色 N+1：通关夜色 N
import { NIGHT_MAX, markAchievement } from './save.js';
import { recordCodexSummary } from './codex.js';

export const MIAN_KILLS = 800;
export const DAOTONG_TIME = 480;

/**
 * 小道童条件：撑到 480 秒，且 480 秒前没吃过包子。
 * 优先看 summary.firstBunTime（null = 一个没吃）；字段缺失时回退 bunsEaten === 0。
 */
export function isNoBunDawn(summary) {
  if (!summary || (summary.timeSec || 0) < DAOTONG_TIME) return false;
  if ('firstBunTime' in summary && summary.firstBunTime !== undefined) {
    const t = summary.firstBunTime;
    return t === null || (Number.isFinite(t) && t >= DAOTONG_TIME);
  }
  return (summary.bunsEaten || 0) === 0;
}

/** 判定并写入 save，返回本次新解锁的列表 [{ kind: 'hero'|'night', id }]。 */
export function evaluateUnlocks(save, summary) {
  const out = [];
  if (!summary) return out;
  const unlockHero = (id) => {
    if (!save.unlockedHeroes.includes(id)) {
      save.unlockedHeroes.push(id);
      out.push({ kind: 'hero', id });
    }
  };
  if ((summary.kills || 0) >= MIAN_KILLS) unlockHero('mian');
  if (isNoBunDawn(summary)) unlockHero('daotong');

  if (summary.cleared) {
    const n = Math.max(0, Math.min(NIGHT_MAX, Math.floor(summary.nightLevel || 0)));
    if (n > save.nightCleared) save.nightCleared = n;
    const next = Math.min(NIGHT_MAX, n + 1);
    if (next > save.nightUnlocked) {
      save.nightUnlocked = next;
      out.push({ kind: 'night', id: next });
    }
  }
  return out;
}

/** 解锁条件说明（英雄选择界面给未解锁英雄看）。 */
export function heroUnlockProgress(save, heroId) {
  const s = save.stats || {};
  if (heroId === 'mian') return { have: Math.min(MIAN_KILLS, s.bestKills || 0), need: MIAN_KILLS };
  if (heroId === 'daotong') return null;
  return null;
}

/**
 * 一局结束入账：加铜钱、记统计、判解锁、记成就、同步图鉴。调用方负责 saveSave。
 * 返回 { coins, unlocks, achievements: [id] }
 */
export function recordRun(save, summary, now = Date.now()) {
  const coins = Math.max(0, Math.floor(summary?.coins || 0));
  save.coins += coins;
  const st = save.stats;
  st.runs += 1;
  st.firstRunDone = true;
  st.totalPlaySec += Math.max(0, summary?.timeSec || 0);
  st.totalKills += Math.max(0, summary?.kills || 0);
  st.totalCoins += coins;
  st.bestTimeSec = Math.max(st.bestTimeSec, summary?.timeSec || 0);
  st.bestKills = Math.max(st.bestKills, summary?.kills || 0);
  st.bestHit = Math.max(st.bestHit, summary?.maxHit || 0);
  if (summary?.cleared) st.clears += 1;

  const unlocks = evaluateUnlocks(save, summary);
  recordCodexSummary(save, summary);

  const achievements = [];
  const ach = (id, cond) => { if (cond && markAchievement(save, id, now)) achievements.push(id); };
  ach('firstClear', summary?.cleared);
  ach('kills800', (summary?.kills || 0) >= MIAN_KILLS);
  ach('noBun480', isNoBunDawn(summary));
  ach('endless10', summary?.mode === 'endless' && (summary?.timeSec || 0) >= 1200);
  ach('hit10k', (summary?.maxHit || 0) >= 1e4);
  ach('hit100m', (summary?.maxHit || 0) >= 1e8);
  ach('night10', summary?.cleared && (summary?.nightLevel || 0) >= NIGHT_MAX);
  return { coins, unlocks, achievements };
}

/** 结算页「广告 · 铜钱翻倍」：再给一份本局铜钱。 */
export function grantDoubleCoins(save, amount) {
  const add = Math.max(0, Math.floor(amount || 0));
  save.coins += add;
  save.stats.totalCoins += add;
  return add;
}
