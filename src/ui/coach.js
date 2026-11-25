// 情境新手旁白与更房渐进开放（M1.3）：
// - 局内 5 个关键时刻弹出不打断的水墨旁白条（3.5 秒淡出，每个仅出现一次，老存档迁移默认已读）
// - 更房按局数逐步开放：第 1 局聚焦「出门打更」；第 2 局开加点与图鉴；第 3 局开鬼市/功绩/天榜；首通开同守联机
import { h } from './dom.js';
import { COACH_KEYS } from '../meta/save.js';

export const COACH_WHISPERS = {
  firstLevelUp: '魂火满溢，择一器物随身，三同门可成羁绊。',
  firstChest: '供盒已落，拾起可敕封满阶神兵开光。',
  firstUltReady: '更锣气满！点右下角鸣锣清场退祟。',
  firstEvolve: '神兵已开光！器物大成，威势倍增。',
  firstElite: '红印精怪现身，留神朱砂预警线，斩之落重赏。',
};

const WHISPER_SHOW_MS = 3500;
const WHISPER_FADE_MS = 320;

/**
 * 查询更房某项功能的渐进开放状态。
 * @param {object} save
 * @param {'shop'|'codex'|'market'|'achievements'|'leaderboard'|'coop'} feature
 * @returns {{ locked: boolean, label: string, toast: string }}
 */
export function getHubFeatureLock(save, feature) {
  const runs = Math.max(
    Number(save?.stats?.runs) || 0,
    Number(save?.coach?.runsPlayed) || 0,
  );
  const clears = Number(save?.stats?.clears) || 0;
  const coins = Number(save?.coins) || 0;
  const ownedCos = Array.isArray(save?.cosmetics?.owned) ? save.cosmetics.owned.length : 0;
  const claimedAch = Array.isArray(save?.achievementClaims) ? save.achievementClaims.length : 0;

  if (feature === 'shop' || feature === 'codex' || feature === 'daily') {
    if (runs >= 1 || clears >= 1 || coins > 0) return { locked: false, label: '', toast: '' };
    const name = feature === 'shop' ? '加点' : feature === 'codex' ? '图鉴' : '差事';
    return { locked: true, label: '1夜开', toast: `先出门守过 1 夜，即刻开放「${name}」` };
  }

  if (feature === 'market' || feature === 'achievements' || feature === 'leaderboard') {
    if (runs >= 2 || clears >= 1 || ownedCos > 0 || claimedAch > 0) {
      return { locked: false, label: '', toast: '' };
    }
    const rem = Math.max(1, 2 - runs);
    const name = feature === 'market' ? '鬼市' : feature === 'achievements' ? '功绩' : '天榜';
    return { locked: true, label: `${rem}夜开`, toast: `再守 ${rem} 夜开放「${name}」` };
  }

  if (feature === 'coop') {
    const nightCleared = Number.isFinite(Number(save?.nightCleared)) ? Number(save.nightCleared) : -1;
    if (clears >= 1 || nightCleared >= 0) return { locked: false, label: '', toast: '' };
    return { locked: true, label: '首通开', toast: '守到鸡鸣天亮一次，即刻开放「同守」' };
  }

  return { locked: false, label: '', toast: '' };
}

function ensureCoachBucket(save) {
  if (!save || typeof save !== 'object') return null;
  if (!save.coach || typeof save.coach !== 'object') {
    save.coach = { seen: {}, runsPlayed: Number(save.stats?.runs) || 0 };
  }
  if (!save.coach.seen || typeof save.coach.seen !== 'object') {
    save.coach.seen = {};
  }
  return save.coach;
}

export function createCoach(root, { save, persist = () => {} } = {}) {
  let el = null;
  let fadeTimer = 0;
  let removeTimer = 0;
  const queue = [];

  function clearTimers() {
    clearTimeout(fadeTimer);
    clearTimeout(removeTimer);
    fadeTimer = 0;
    removeTimer = 0;
  }

  function showNext() {
    if (el || !queue.length || !root) return;
    const key = queue.shift();
    const text = COACH_WHISPERS[key];
    if (!text) {
      showNext();
      return;
    }
    el = h('div', {
      class: 'coach-whisper',
      role: 'status',
      'aria-live': 'polite',
      dataset: { coachKey: key },
    },
    h('i', { class: 'stamp stamp--xs' }, '点'),
    h('div', { class: 'coach-whisper__body' },
      h('span', { class: 'coach-whisper__tag' }, '老更夫提点'),
      h('p', { class: 'coach-whisper__text' }, text)));
    root.appendChild(el);
    fadeTimer = setTimeout(() => {
      el?.classList.add('is-out');
      removeTimer = setTimeout(() => {
        el?.remove();
        el = null;
        showNext();
      }, WHISPER_FADE_MS);
    }, WHISPER_SHOW_MS);
  }

  function trigger(key) {
    if (!COACH_KEYS.includes(key)) return false;
    const bucket = ensureCoachBucket(save);
    if (!bucket || bucket.seen[key]) return false;
    bucket.seen[key] = true;
    persist(false);
    queue.push(key);
    showNext();
    return true;
  }

  function onStatus(run) {
    if (!run) return;
    if (run.status === 'levelup') trigger('firstLevelUp');
    else if (run.status === 'chest') trigger('firstChest');
  }

  function onEvents(events, run) {
    if (!Array.isArray(events) || !events.length) return;
    const bucket = ensureCoachBucket(save);
    if (!bucket) return;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e || typeof e !== 'object') continue;
      if (e.type === 'levelup') trigger('firstLevelUp');
      else if (e.type === 'evolve') trigger('firstEvolve');
      else if (e.type === 'warderSpawn') trigger('firstElite');
      else if (e.type === 'ultReady') trigger('firstUltReady');
      else if (e.type === 'pickup' && e.kind === 'chest') trigger('firstChest');
    }
    if (run && !bucket.seen.firstUltReady && run.player && run.player.ult >= run.player.ultMax) {
      trigger('firstUltReady');
    }
    if (run && !bucket.seen.firstChest && Array.isArray(run.pickups) && run.pickups.some((p) => p && p.kind === 'chest')) {
      trigger('firstChest');
    }
    if (run && !bucket.seen.firstElite && Array.isArray(run.enemies) && run.player) {
      const px = run.player.x;
      const py = run.player.y;
      for (let i = 0; i < run.enemies.length; i++) {
        const en = run.enemies[i];
        if (!en || en.dead || !en.elite) continue;
        const dx = en.x - px;
        const dy = en.y - py;
        if (dx * dx + dy * dy <= 280 * 280) {
          trigger('firstElite');
          break;
        }
      }
    }
  }

  function reset() {
    clearTimers();
    queue.length = 0;
    el?.remove();
    el = null;
  }

  return {
    trigger,
    onStatus,
    onEvents,
    reset,
    get activeKey() { return el?.dataset?.coachKey || null; },
  };
}
