// TapTap 排行榜服务封装（F12：五更守夜总榜 c5mzumajes9houq0ra）
// - 完整对接 tap.getLeaderboardManager() 的 submitScores / loadLeaderboardScores / loadCurrentPlayerLeaderboardScore / openLeaderboard
// - 支持 collection: 'public'（全服总榜）与 'friends'（好友榜）
// - 兼容双参数 onFailure(code, message) 与对象错误；对 112/1025/103/104 好友未授权、500001 及离线环境提供友好中文降级与本地荣誉榜
// - 支持 pendingScore 待重传队列，以及 ?mockLeaderboard=1|112|1025|103|104|500001 与 ?mockTap=1 模拟宿主

import {
  DAILY_LEADERBOARD_ID,
  DAILY_LEADERBOARD_NAME,
  LEADERBOARD_COLLECTIONS,
  LEADERBOARD_DEFAULT_PAGE_SIZE,
  LEADERBOARD_MAX_PAGE_SIZE,
  LEADERBOARD_MAX_SUBMIT_BATCH,
  PRIMARY_LEADERBOARD_ID,
  PRIMARY_LEADERBOARD_NAME,
  PRIMARY_LEADERBOARD_UNIT,
  SEASON_LEADERBOARD_ID,
  SEASON_LEADERBOARD_NAME,
  getLeaderboardConfig,
} from './leaderboard-config.js';
import { DEFAULT_DAO_NAME, HERO_IDS, sanitizeDaoName, saveSave } from './save.js';
import { buildLocalDailyEntries } from './daily-challenge.js';

// 112：接口 scope 未在《小游戏隐私保护指引》中声明（宿主沿用小游戏通用错误码）；1025：未申明使用好友关系信息
const PRIVACY_DECLARE_CODES = new Set([112, 1025, '112', '1025']);
// 103：玩家未授权好友关系；104：玩家未同意隐私协议
const USER_CONSENT_CODES = new Set([103, 104, '103', '104']);
const PERMISSION_ERROR_CODES = new Set([...PRIVACY_DECLARE_CODES, ...USER_CONSENT_CODES]);
const MOCK_PERMISSION_MODES = new Set(['112', '1025', '103', '104']);
const PRIVACY_AUTH_TIMEOUT_MS = 6000;
const NOT_FOUND_ERROR_CODES = new Set([500001, '500001']);
// 确定性配置类错误（榜单 ID 不存在 / 与游戏不匹配 / ID 为空 / maxSize 非法）：重试无意义
const CONFIG_ERROR_CODES = new Set([500001, 500002, 500198, 500201, '500001', '500002', '500198', '500201']);
const SDK_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 900;
const MOCK_PUBLIC_SEEDS = [
  { name: '镇岳老更夫', heroId: 'zhou', score: 46800 },
  { name: '太乙观星客', heroId: 'yinyang', score: 39200 },
  { name: '沧溟傩舞娘', heroId: 'nuoxi', score: 33500 },
  { name: '纯阳小道童', heroId: 'daotong', score: 27400 },
  { name: '巧手剪纸绵', heroId: 'mian', score: 21900 },
  { name: '镇狱石敢当', heroId: 'tiejiang', score: 16200 },
];
const MOCK_FRIENDS_SEEDS = [
  { name: '青衫道友', heroId: 'daotong', score: 31200 },
  { name: '提灯阿鲤', heroId: 'mian', score: 22400 },
  { name: '巡夜铁牛', heroId: 'tiejiang', score: 14500 },
];

export function sanitizeLeaderboardScore(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
  const n = typeof raw === 'string' ? (raw.trim() === '' ? NaN : Number(raw)) : raw;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(9_999_999_999, Math.max(0, Math.round(n)));
}

export function clampLeaderboardPageSize(rawSize) {
  const n = Number(rawSize);
  if (!Number.isFinite(n)) return LEADERBOARD_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(LEADERBOARD_MAX_PAGE_SIZE, Math.floor(n)));
}

export function normalizeCollection(col) {
  return col === LEADERBOARD_COLLECTIONS.FRIENDS
    ? LEADERBOARD_COLLECTIONS.FRIENDS
    : LEADERBOARD_COLLECTIONS.PUBLIC;
}

function parseFailureArgs(arg1, arg2) {
  if (arg1 && typeof arg1 === 'object') {
    const rawCode = arg1.code ?? arg1.errCode ?? arg1.errno ?? arg1.statusCode ?? -1;
    const numCode = Number(rawCode);
    return {
      code: Number.isFinite(numCode) ? numCode : String(rawCode),
      rawMessage: typeof (arg1.message ?? arg1.errMsg) === 'string' ? (arg1.message ?? arg1.errMsg) : '',
    };
  }
  const numCode = Number(arg1);
  return {
    code: Number.isFinite(numCode) ? numCode : (arg1 !== undefined && arg1 !== null ? String(arg1) : -1),
    rawMessage: typeof arg2 === 'string' ? arg2 : '',
  };
}

function isPermissionCode(code) {
  return PERMISSION_ERROR_CODES.has(code);
}

function ensureSaveLeaderboard(save) {
  if (!save || typeof save !== 'object') {
    return { bestScore: 0, bestEndlessSec: 0, bestKills: 0, pendingScore: 0, history: [] };
  }
  if (!save.leaderboard || typeof save.leaderboard !== 'object') {
    save.leaderboard = { bestScore: 0, bestEndlessSec: 0, bestKills: 0, pendingScore: 0, history: [] };
  }
  return save.leaderboard;
}

export function buildLocalHonorEntries(save) {
  const lb = ensureSaveLeaderboard(save);
  const daoName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);
  const rawHist = Array.isArray(lb.history) ? lb.history : [];
  const entries = rawHist
    .filter((item) => item && typeof item === 'object' && Number.isFinite(Number(item.score)) && Number(item.score) >= 0)
    .map((item) => ({
      score: sanitizeLeaderboardScore(item.score),
      name: sanitizeDaoName(item.daoName || daoName),
      heroId: HERO_IDS.includes(item.heroId) ? item.heroId : 'zhou',
      nightLevel: Number.isFinite(Number(item.nightLevel)) ? Math.max(0, Math.floor(Number(item.nightLevel))) : 0,
      kills: Number.isFinite(Number(item.kills)) ? Math.max(0, Math.floor(Number(item.kills))) : 0,
      timeSec: Number.isFinite(Number(item.timeSec)) ? Math.max(0, Math.floor(Number(item.timeSec))) : 0,
      cleared: Boolean(item.cleared),
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : 0,
      isSelf: true,
    }));

  const bestScore = sanitizeLeaderboardScore(lb.bestScore);
  if (bestScore > 0 && !entries.some((e) => e.score === bestScore)) {
    entries.push({
      score: bestScore,
      name: daoName,
      heroId: HERO_IDS.includes(save?.selectedHero) ? save.selectedHero : 'zhou',
      nightLevel: Number(save?.nightCleared) > 0 ? Number(save.nightCleared) : 0,
      kills: Number(lb.bestKills || save?.stats?.bestKills || 0),
      timeSec: Number(save?.stats?.bestTimeSec || 0),
      cleared: Number(save?.stats?.clears || 0) > 0,
      at: Number(save?.updatedAt || 0),
      isSelf: true,
    });
  }

  entries.sort((a, b) => (b.score - a.score) || (b.at - a.at));
  return entries.slice(0, 10).map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}

function normalizeRemoteScores(rawRes) {
  const arr = Array.isArray(rawRes?.scores)
    ? rawRes.scores
    : Array.isArray(rawRes?.items)
      ? rawRes.items
      : Array.isArray(rawRes?.list)
        ? rawRes.list
        : [];
  const entries = arr
    .filter((it) => it && typeof it === 'object')
    .map((it, idx) => {
      const rankNum = Number(it.rank ?? it.position ?? idx + 1);
      const userObj = it.user && typeof it.user === 'object' ? it.user : {};
      const rawName = userObj.name || userObj.nickname || userObj.nickName || it.userName || it.playerName || it.name || '守夜道友';
      return {
        rank: Number.isFinite(rankNum) && rankNum >= 1 ? Math.floor(rankNum) : idx + 1,
        score: sanitizeLeaderboardScore(it.score ?? it.value ?? it.scoreValue ?? 0),
        name: sanitizeDaoName(rawName),
        heroId: HERO_IDS.includes(it.heroId) ? it.heroId : null,
        avatar: typeof userObj.avatar === 'string' ? userObj.avatar : null,
        isSelf: Boolean(it.isSelf || it.isCurrentUser),
      };
    });
  entries.sort((a, b) => a.rank - b.rank || b.score - a.score);
  return {
    entries,
    nextContinuationToken: typeof rawRes?.nextContinuationToken === 'string' ? rawRes.nextContinuationToken : null,
  };
}

function normalizeCurrentPlayer(rawRes, fallbackName) {
  if (!rawRes || typeof rawRes !== 'object') return null;
  const node = rawRes.currentUserScore && typeof rawRes.currentUserScore === 'object'
    ? rawRes.currentUserScore
    : rawRes.playerScore && typeof rawRes.playerScore === 'object'
      ? rawRes.playerScore
      : (rawRes.score !== undefined || rawRes.rank !== undefined)
        ? rawRes
        : null;
  if (!node || typeof node !== 'object') return null;
  const hasRank = node.rank !== undefined && node.rank !== null && Number.isFinite(Number(node.rank)) && Number(node.rank) > 0;
  const hasScore = node.score !== undefined && node.score !== null && Number.isFinite(Number(node.score));
  if (!hasRank && !hasScore) return null;
  const userObj = node.user && typeof node.user === 'object' ? node.user : {};
  return {
    rank: hasRank ? Math.floor(Number(node.rank)) : null,
    score: sanitizeLeaderboardScore(node.score ?? 0),
    name: sanitizeDaoName(userObj.name || userObj.nickname || fallbackName || DEFAULT_DAO_NAME),
  };
}

function readQueryParams(win) {
  try {
    const search = win?.location?.search || '';
    return new URLSearchParams(search);
  } catch {
    return new URLSearchParams();
  }
}

function createMockTapLeaderboardManager(mode, getSave, boardIds = {}) {
  const submittedByBoard = new Map();
  let openCalls = 0;

  const resolveBoardKind = (leaderboardId) => {
    const id = typeof leaderboardId === 'string' ? leaderboardId.trim() : '';
    if (id && id === boardIds.dailyLeaderboardId) return 'daily';
    if (id && id === boardIds.seasonLeaderboardId) return 'season';
    return 'primary';
  };

  const buildRankedList = (collection, leaderboardId) => {
    const save = getSave?.();
    const myName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);
    const myHero = HERO_IDS.includes(save?.selectedHero) ? save.selectedHero : 'zhou';
    const lbKey = typeof leaderboardId === 'string' && leaderboardId.trim() ? leaderboardId.trim() : PRIMARY_LEADERBOARD_ID;
    const kind = resolveBoardKind(lbKey);
    const savedBest = kind === 'daily'
      ? sanitizeLeaderboardScore(save?.dailyChallenge?.todayBestScore || save?.dailyChallenge?.bestScore || 0)
      : kind === 'season'
        ? sanitizeLeaderboardScore(save?.season?.bestSeasonScore || save?.season?.xp || 0)
        : sanitizeLeaderboardScore(save?.leaderboard?.bestScore || 0);
    const myBest = Math.max(submittedByBoard.get(lbKey) || 0, savedBest);
    const seedMul = kind === 'daily' ? 0.55 : kind === 'season' ? 0.8 : 1;
    const seeds = collection === LEADERBOARD_COLLECTIONS.FRIENDS ? MOCK_FRIENDS_SEEDS : MOCK_PUBLIC_SEEDS;
    const combined = seeds.map((s) => ({
      score: sanitizeLeaderboardScore(s.score * seedMul),
      user: { name: s.name },
      heroId: s.heroId,
      isCurrentUser: false,
    }));
    combined.push({
      score: myBest,
      user: { name: myName },
      heroId: myHero,
      isCurrentUser: true,
    });
    combined.sort((a, b) => b.score - a.score);
    return combined.map((item, idx) => ({
      rank: idx + 1,
      score: item.score,
      heroId: item.heroId,
      isCurrentUser: item.isCurrentUser,
      user: item.user,
    }));
  };

  return {
    __isMock: true,
    getOpenCalls: () => openCalls,
    submitScores(params) {
      if (mode === '500001') {
        params?.callback?.onFailure?.(500001, 'leaderboard unavailable');
        return;
      }
      const list = Array.isArray(params?.scores) ? params.scores : [];
      for (const item of list) {
        const lbKey = typeof item?.leaderboardId === 'string' && item.leaderboardId.trim()
          ? item.leaderboardId.trim()
          : PRIMARY_LEADERBOARD_ID;
        const s = sanitizeLeaderboardScore(item?.score);
        if (s > (submittedByBoard.get(lbKey) || 0)) submittedByBoard.set(lbKey, s);
      }
      params?.callback?.onSuccess?.({ results: list.map((x) => ({ leaderboardId: x.leaderboardId, score: x.score })) });
    },
    loadLeaderboardScores(params) {
      const sz = params?.maxSize ?? LEADERBOARD_DEFAULT_PAGE_SIZE;
      if (sz < 1 || sz > LEADERBOARD_MAX_PAGE_SIZE) {
        params?.callback?.onFailure?.(500198, 'invalid maxSize');
        return;
      }
      if (mode === '500001') {
        params?.callback?.onFailure?.(500001, 'leaderboard unavailable');
        return;
      }
      const col = normalizeCollection(params?.collection);
      if (MOCK_PERMISSION_MODES.has(mode) && col === LEADERBOARD_COLLECTIONS.FRIENDS) {
        params?.callback?.onFailure?.(Number(mode), 'friend permission not granted');
        return;
      }
      const scores = buildRankedList(col, params?.leaderboardId).slice(0, sz);
      params?.callback?.onSuccess?.({
        scores,
        nextContinuationToken: null,
      });
    },
    loadCurrentPlayerLeaderboardScore(params) {
      if (mode === '500001') {
        params?.callback?.onFailure?.(500001, 'leaderboard unavailable');
        return;
      }
      const col = normalizeCollection(params?.collection);
      if (MOCK_PERMISSION_MODES.has(mode) && col === LEADERBOARD_COLLECTIONS.FRIENDS) {
        params?.callback?.onFailure?.(Number(mode), 'friend permission not granted');
        return;
      }
      const ranked = buildRankedList(col, params?.leaderboardId);
      const mine = ranked.find((r) => r.isCurrentUser) || ranked[ranked.length - 1];
      params?.callback?.onSuccess?.({
        currentUserScore: mine,
      });
    },
    openLeaderboard(params) {
      openCalls++;
      if (mode === '500001') {
        params?.callback?.onFailure?.(500001, 'leaderboard unavailable');
        return;
      }
      params?.callback?.onSuccess?.({ opened: true, collection: normalizeCollection(params?.collection) });
    },
  };
}

export function buildLocalSeasonEntries(save) {
  const daoName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);
  const rawHist = Array.isArray(save?.season?.history) ? save.season.history : [];
  const entries = rawHist
    .filter((item) => item && typeof item === 'object' && Number.isFinite(Number(item.score)) && Number(item.score) >= 0)
    .map((item) => ({
      score: sanitizeLeaderboardScore(item.score),
      name: sanitizeDaoName(item.daoName || daoName),
      heroId: HERO_IDS.includes(item.heroId) ? item.heroId : 'zhou',
      nightLevel: Number.isFinite(Number(item.nightLevel)) ? Math.max(0, Math.floor(Number(item.nightLevel))) : 0,
      kills: Number.isFinite(Number(item.kills)) ? Math.max(0, Math.floor(Number(item.kills))) : 0,
      timeSec: Number.isFinite(Number(item.timeSec)) ? Math.max(0, Math.floor(Number(item.timeSec))) : 0,
      cleared: Boolean(item.cleared),
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : 0,
      isSelf: true,
    }));

  const bestSeason = sanitizeLeaderboardScore(save?.season?.bestSeasonScore || save?.season?.xp || 0);
  if (bestSeason > 0 && !entries.some((e) => e.score === bestSeason)) {
    entries.push({
      score: bestSeason,
      name: daoName,
      heroId: HERO_IDS.includes(save?.selectedHero) ? save.selectedHero : 'zhou',
      nightLevel: Number(save?.nightCleared) > 0 ? Number(save.nightCleared) : 0,
      kills: Number(save?.stats?.bestKills || 0),
      timeSec: Number(save?.stats?.bestTimeSec || 0),
      cleared: Number(save?.stats?.clears || 0) > 0,
      at: Number(save?.updatedAt || 0),
      isSelf: true,
    });
  }
  entries.sort((a, b) => (b.score - a.score) || (b.at - a.at));
  return entries.slice(0, 10).map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export function createLeaderboard({
  win = typeof window !== 'undefined' ? window : null,
  getSave = () => null,
  persistSave = null,
  dailyLeaderboardId = DAILY_LEADERBOARD_ID,
  seasonLeaderboardId = SEASON_LEADERBOARD_ID,
} = {}) {
  const saveFlush = (saveObj) => {
    if (typeof persistSave === 'function') {
      persistSave(saveObj);
    } else if (saveObj) {
      saveSave(saveObj);
    }
  };

  let cachedMockKey = null;
  let cachedMockMgr = null;
  let cachedNativeMgr = null;
  let cachedTapRef = null;
  const periodTokens = { primary: '', daily: '', season: '' };
  let lastDiagnostics = null;

  function resolveManager() {
    const q = readQueryParams(win);
    const mockLb = (q.get('mockLeaderboard') || '').trim();
    const boardIds = { dailyLeaderboardId, seasonLeaderboardId };
    if (MOCK_PERMISSION_MODES.has(mockLb) || mockLb === '500001' || mockLb === '1' || mockLb === 'true') {
      const normKey = mockLb === 'true' ? '1' : mockLb;
      if (cachedMockKey !== normKey || !cachedMockMgr) {
        cachedMockKey = normKey;
        cachedMockMgr = createMockTapLeaderboardManager(normKey, getSave, boardIds);
      }
      return { mgr: cachedMockMgr, mode: `mock:${normKey}` };
    }
    try {
      if (win?.tap && typeof win.tap.getLeaderboardManager === 'function') {
        // 宿主 LeaderboardManager 为单例：缓存后复用，避免反复创建桥接对象
        if (cachedTapRef !== win.tap) { cachedTapRef = win.tap; cachedNativeMgr = null; }
        const nativeMgr = cachedNativeMgr || win.tap.getLeaderboardManager();
        if (nativeMgr && typeof nativeMgr === 'object') cachedNativeMgr = nativeMgr;
        if (nativeMgr && typeof nativeMgr === 'object') {
          return { mgr: nativeMgr, mode: 'tap' };
        }
      }
    } catch {
      // ignore host bridge error and fall back cleanly
    }
    if (q.get('mockTap') === '1') {
      if (cachedMockKey !== 'tap1' || !cachedMockMgr) {
        cachedMockKey = 'tap1';
        cachedMockMgr = createMockTapLeaderboardManager('1', getSave, boardIds);
      }
      return { mgr: cachedMockMgr, mode: 'mock:tap' };
    }
    return { mgr: null, mode: 'local' };
  }

  function isAvailable() {
    return resolveManager().mgr !== null;
  }

  function submitScoresBatch(rawItems, targetSave = null) {
    const save = targetSave || getSave?.() || null;
    const lb = ensureSaveLeaderboard(save);
    const list = (Array.isArray(rawItems) ? rawItems : [rawItems])
      .slice(0, LEADERBOARD_MAX_SUBMIT_BATCH)
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return {
            leaderboardId: typeof entry.leaderboardId === 'string' && entry.leaderboardId.trim()
              ? entry.leaderboardId.trim()
              : PRIMARY_LEADERBOARD_ID,
            score: sanitizeLeaderboardScore(entry.score),
          };
        }
        return {
          leaderboardId: PRIMARY_LEADERBOARD_ID,
          score: sanitizeLeaderboardScore(entry),
        };
      });

    if (list.length === 0) {
      list.push({ leaderboardId: PRIMARY_LEADERBOARD_ID, score: 0 });
    }

    const primaryScore = list[0].score;
    if (save && primaryScore > (lb.bestScore || 0)) {
      lb.bestScore = primaryScore;
      saveFlush(save);
    }

    const { mgr } = resolveManager();
    if (!mgr || typeof mgr.submitScores !== 'function') {
      if (save && primaryScore > 0) {
        lb.pendingScore = Math.max(sanitizeLeaderboardScore(lb.pendingScore), primaryScore);
        saveFlush(save);
      }
      return Promise.resolve({
        ok: false,
        queued: primaryScore > 0,
        reason: 'unavailable',
        leaderboardId: PRIMARY_LEADERBOARD_ID,
        score: primaryScore,
      });
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      try {
        mgr.submitScores({
          scores: list,
          callback: {
            onSuccess(res) {
              if (save && primaryScore >= sanitizeLeaderboardScore(lb.pendingScore)) {
                lb.pendingScore = 0;
                saveFlush(save);
              }
              done({
                ok: true,
                queued: false,
                leaderboardId: list[0].leaderboardId,
                score: primaryScore,
                raw: res || null,
              });
            },
            onFailure(a1, a2) {
              const err = parseFailureArgs(a1, a2);
              if (save && primaryScore > 0) {
                lb.pendingScore = Math.max(sanitizeLeaderboardScore(lb.pendingScore), primaryScore);
                saveFlush(save);
              }
              done({
                ok: false,
                queued: primaryScore > 0,
                code: err.code,
                reason: NOT_FOUND_ERROR_CODES.has(err.code) ? 'not_found' : 'sdk_failure',
                leaderboardId: list[0].leaderboardId,
                score: primaryScore,
              });
            },
          },
        });
      } catch {
        if (save && primaryScore > 0) {
          lb.pendingScore = Math.max(sanitizeLeaderboardScore(lb.pendingScore), primaryScore);
          saveFlush(save);
        }
        done({
          ok: false,
          queued: primaryScore > 0,
          reason: 'exception',
          leaderboardId: list[0].leaderboardId,
          score: primaryScore,
        });
      }
    });
  }

  function submitScore(rawScore, targetSave = null) {
    return submitScoresBatch([{ leaderboardId: PRIMARY_LEADERBOARD_ID, score: sanitizeLeaderboardScore(rawScore) }], targetSave);
  }

  async function flushPendingScore(targetSave = null) {
    const save = targetSave || getSave?.() || null;
    if (!save) return { ok: false, flushed: false };
    const lb = ensureSaveLeaderboard(save);
    const pending = sanitizeLeaderboardScore(lb.pendingScore);
    if (pending <= 0) return { ok: true, flushed: false, score: 0 };
    const res = await submitScore(pending, save);
    if (res.ok) {
      lb.pendingScore = 0;
      saveFlush(save);
      return { ok: true, flushed: true, score: pending };
    }
    return { ok: false, flushed: false, score: pending, reason: res.reason };
  }

  // 单次 SDK 回调调用：带超时守护，防止宿主桥接永不回调导致界面一直「展卷中」
  function callSdk(mgr, method, req, timeoutMs = SDK_TIMEOUT_MS) {
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = (v) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        resolve(v);
      };
      try {
        timer = setTimeout(() => finish({ ok: false, err: { code: 'timeout', rawMessage: '' } }), timeoutMs);
        mgr[method]({
          ...req,
          callback: {
            onSuccess: (data) => finish({ ok: true, data }),
            onFailure: (a1, a2) => finish({ ok: false, err: parseFailureArgs(a1, a2) }),
          },
        });
      } catch {
        finish({ ok: false, err: { code: 'exception', rawMessage: '' } });
      }
    });
  }

  function rememberPeriod(boardKey, rawRes) {
    const tok = rawRes?.leaderboard?.period?.periodToken;
    if (typeof tok === 'string' && tok.trim()) {
      periodTokens[boardKey] = tok.trim();
    }
  }

  // 好友榜属隐私接口：宿主若提供 requirePrivacyAuthorize，则先拉起官方隐私授权弹窗（同意过则静默通过）
  let privacyAuthorized = false;
  function ensurePrivacyAuthorized() {
    const tap = win?.tap;
    if (privacyAuthorized || !tap || typeof tap.requirePrivacyAuthorize !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      const timer = setTimeout(() => finish(null), PRIVACY_AUTH_TIMEOUT_MS);
      try {
        const ret = tap.requirePrivacyAuthorize({
          success: () => { privacyAuthorized = true; finish(true); },
          fail: () => finish(false),
        });
        if (ret && typeof ret.then === 'function') {
          ret.then(() => { privacyAuthorized = true; finish(true); }, () => finish(false));
        }
      } catch {
        finish(null);
      }
    });
  }

  function buildFailureNotice(code, col, bLabel = '天榜') {
    if (PRIVACY_DECLARE_CODES.has(code)) {
      return `好友榜尚未开通（码 ${code}）：需在 TapTap 后台「隐私合规」勾选「好友关系」并填写用途，生效后点「重新展卷」即可连通。先为你展示本机荣誉榜。`;
    }
    if (code === 104 || code === '104') {
      return '需先同意《小游戏隐私保护指引》才能读取好友榜（码 104），点「重新展卷」可再次授权。先为你展示本机荣誉榜。';
    }
    if (isPermissionCode(code)) {
      return `尚未授权读取 TapTap 好友关系（码 ${code}），点「重新展卷」可再次授权。先为你展示本机荣誉榜。`;
    }
    if (code === 500000 || code === '500000') {
      return `本期${bLabel}已结算，新一期开榜后自动同步，先为你展示本机荣誉榜。`;
    }
    if (CONFIG_ERROR_CODES.has(code)) {
      return `${bLabel}尚未向当前账号开放（码 ${code}），先为你展示本机荣誉榜，榜单发布后自动同步。`;
    }
    if (code === 'timeout') {
      return `${bLabel}回信较缓，先为你展示本机荣誉榜，可点「重新展卷」再试。`;
    }
    const codeTxt = code !== undefined && code !== null && code !== -1 && code !== 'exception' ? `（码 ${code}）` : '';
    return col === LEADERBOARD_COLLECTIONS.FRIENDS
      ? `好友榜暂未连通${codeTxt}，先为你展示本机荣誉榜，可点「重新展卷」再试。`
      : `${bLabel}暂未连通${codeTxt}，先为你展示本机荣誉榜，可点「重新展卷」再试。`;
  }

  function resolveBoardId(boardType = 'primary') {
    if (boardType === 'daily') return typeof dailyLeaderboardId === 'string' ? dailyLeaderboardId.trim() : '';
    if (boardType === 'season') return typeof seasonLeaderboardId === 'string' ? seasonLeaderboardId.trim() : '';
    return PRIMARY_LEADERBOARD_ID;
  }

  function getSecondaryPendingScore(boardType, save) {
    if (!save || typeof save !== 'object') return 0;
    if (boardType === 'daily') return sanitizeLeaderboardScore(save.dailyChallenge?.pendingScore || 0);
    if (boardType === 'season') return sanitizeLeaderboardScore(save.season?.pendingScore || 0);
    return 0;
  }

  function writeSecondaryPendingScore(boardType, save, nextScore) {
    if (!save || typeof save !== 'object') return;
    if (boardType === 'daily' && save.dailyChallenge && typeof save.dailyChallenge === 'object') {
      save.dailyChallenge.pendingScore = sanitizeLeaderboardScore(nextScore);
      saveFlush(save);
    } else if (boardType === 'season' && save.season && typeof save.season === 'object') {
      save.season.pendingScore = sanitizeLeaderboardScore(nextScore);
      saveFlush(save);
    }
  }

  function queueSecondaryPendingScore(boardType, save, score) {
    if (!save || score <= 0) return;
    const prev = getSecondaryPendingScore(boardType, save);
    writeSecondaryPendingScore(boardType, save, Math.max(prev, score));
  }

  function submitSecondaryBoard(boardType, rawScore, targetSave = null) {
    const save = targetSave || getSave?.() || null;
    const score = sanitizeLeaderboardScore(rawScore);
    const boardId = resolveBoardId(boardType);
    if (!boardId) {
      return Promise.resolve({
        ok: false,
        queued: false,
        source: 'local',
        reason: 'unconfigured',
        leaderboardId: '',
        boardType,
        score,
      });
    }
    const { mgr } = resolveManager();
    if (!mgr || typeof mgr.submitScores !== 'function') {
      queueSecondaryPendingScore(boardType, save, score);
      return Promise.resolve({
        ok: false,
        queued: score > 0,
        reason: 'unavailable',
        leaderboardId: boardId,
        boardType,
        score,
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        mgr.submitScores({
          scores: [{ leaderboardId: boardId, score }],
          callback: {
            onSuccess(res) {
              const curPending = getSecondaryPendingScore(boardType, save);
              if (save && curPending > 0 && score >= curPending) {
                writeSecondaryPendingScore(boardType, save, 0);
              }
              done({ ok: true, queued: false, leaderboardId: boardId, boardType, score, raw: res || null });
            },
            onFailure(a1, a2) {
              const err = parseFailureArgs(a1, a2);
              queueSecondaryPendingScore(boardType, save, score);
              done({
                ok: false,
                queued: score > 0,
                code: err.code,
                reason: NOT_FOUND_ERROR_CODES.has(err.code) ? 'not_found' : 'sdk_failure',
                leaderboardId: boardId,
                boardType,
                score,
              });
            },
          },
        });
      } catch {
        queueSecondaryPendingScore(boardType, save, score);
        done({ ok: false, queued: score > 0, reason: 'exception', leaderboardId: boardId, boardType, score });
      }
    });
  }

  function submitDailyScore(rawScore, targetSave = null) {
    return submitSecondaryBoard('daily', rawScore, targetSave);
  }

  function submitSeasonScore(rawScore, targetSave = null) {
    return submitSecondaryBoard('season', rawScore, targetSave);
  }

  async function flushSecondaryPendingScore(boardType, targetSave = null) {
    const save = targetSave || getSave?.() || null;
    if (!save) return { ok: false, flushed: false };
    const pending = getSecondaryPendingScore(boardType, save);
    if (pending <= 0) return { ok: true, flushed: false, score: 0 };
    const res = await submitSecondaryBoard(boardType, pending, save);
    if (res.ok) {
      writeSecondaryPendingScore(boardType, save, 0);
      return { ok: true, flushed: true, score: pending };
    }
    return { ok: false, flushed: false, score: pending, reason: res.reason };
  }

  async function flushAllPendingScores(targetSave = null) {
    const save = targetSave || getSave?.() || null;
    const primary = await flushPendingScore(save);
    const daily = await flushSecondaryPendingScore('daily', save);
    const season = await flushSecondaryPendingScore('season', save);
    return {
      ok: primary.ok && daily.ok && season.ok,
      flushed: Boolean(primary.flushed || daily.flushed || season.flushed),
      primary,
      daily,
      season,
    };
  }

  async function fetchBoard({
    boardType = 'primary',
    collection = LEADERBOARD_COLLECTIONS.PUBLIC,
    maxSize = LEADERBOARD_DEFAULT_PAGE_SIZE,
    continuationToken = null,
    save: explicitSave = null,
  } = {}) {
    const save = explicitSave || getSave?.() || null;
    const normBoard = boardType === 'daily' || boardType === 'season' ? boardType : 'primary';
    const col = normalizeCollection(collection);
    const safeMaxSize = clampLeaderboardPageSize(maxSize);
    const daoName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);

    if (normBoard === 'daily' || normBoard === 'season') {
      const targetId = resolveBoardId(normBoard);
      const localSubEntries = normBoard === 'daily' ? buildLocalDailyEntries(save) : buildLocalSeasonEntries(save);
      const bestSub = normBoard === 'daily'
        ? sanitizeLeaderboardScore(save?.dailyChallenge?.todayBestScore || save?.dailyChallenge?.bestScore || 0)
        : sanitizeLeaderboardScore(save?.season?.bestSeasonScore || save?.season?.xp || 0);
      const localSubCurrent = bestSub > 0
        ? { rank: 1, score: bestSub, name: daoName, isLocal: true }
        : { rank: null, score: 0, name: daoName, isLocal: true };
      const bLabel = normBoard === 'daily' ? DAILY_LEADERBOARD_NAME : SEASON_LEADERBOARD_NAME;

      if (!targetId) {
        return {
          ok: false,
          source: 'local',
          boardType: normBoard,
          collection: col,
          leaderboardId: '',
          notice: `${bLabel}待配置云端编号，当前展示本机战绩记录。`,
          entries: localSubEntries,
          currentPlayer: localSubCurrent,
          nextContinuationToken: null,
        };
      }
      const { mgr, mode: subMode } = resolveManager();
      if (!mgr || typeof mgr.loadLeaderboardScores !== 'function') {
        return {
          ok: false,
          source: 'local',
          boardType: normBoard,
          collection: col,
          leaderboardId: targetId,
          notice: col === LEADERBOARD_COLLECTIONS.FRIENDS
            ? `当前处于离线或本机环境，暂无法读取好友关系，以下展示本机${bLabel}战绩。`
            : `当前展示本机${bLabel}战绩（在 TapTap 内打开可同步云端）。`,
          entries: localSubEntries,
          currentPlayer: localSubCurrent,
          nextContinuationToken: null,
        };
      }

      if (getSecondaryPendingScore(normBoard, save) > 0) {
        await flushSecondaryPendingScore(normBoard, save).catch(() => null);
      }

      const buildSubScoresReq = (withPeriod) => {
        const req = { leaderboardId: targetId, collection: col, maxSize: safeMaxSize };
        if (typeof continuationToken === 'string' && continuationToken) req.continuationToken = continuationToken;
        if (withPeriod && periodTokens[normBoard]) req.periodToken = periodTokens[normBoard];
        return req;
      };

      if (col === LEADERBOARD_COLLECTIONS.FRIENDS && subMode === 'tap') {
        await ensurePrivacyAuthorized();
      }

      const subPeriodBefore = periodTokens[normBoard];
      let subRes = await callSdk(mgr, 'loadLeaderboardScores', buildSubScoresReq(true));
      let subCur = { ok: false };
      if (typeof mgr.loadCurrentPlayerLeaderboardScore === 'function') {
        const curReq = { leaderboardId: targetId, collection: col };
        if (periodTokens[normBoard]) curReq.periodToken = periodTokens[normBoard];
        subCur = await callSdk(mgr, 'loadCurrentPlayerLeaderboardScore', curReq);
        if (subCur.ok) rememberPeriod(normBoard, subCur.data);
      }
      if (!subRes.ok && !isPermissionCode(subRes.err?.code) && periodTokens[normBoard] && periodTokens[normBoard] !== subPeriodBefore) {
        subRes = await callSdk(mgr, 'loadLeaderboardScores', buildSubScoresReq(true));
      }
      if (!subRes.ok && !isPermissionCode(subRes.err?.code) && !CONFIG_ERROR_CODES.has(subRes.err?.code)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        subRes = await callSdk(mgr, 'loadLeaderboardScores', buildSubScoresReq(true));
      }
      if (subRes.ok) rememberPeriod(normBoard, subRes.data);

      const remoteSubCur = subCur.ok ? normalizeCurrentPlayer(subCur.data, daoName) : null;
      if (!subRes.ok) {
        const subCode = subRes.err?.code;
        lastDiagnostics = { at: Date.now(), boardType: normBoard, collection: col, code: subCode, message: subRes.err?.rawMessage || '' };
        return {
          ok: false,
          source: isPermissionCode(subCode) ? 'permission_fallback' : 'error_fallback',
          code: subCode,
          retryable: !CONFIG_ERROR_CODES.has(subCode),
          boardType: normBoard,
          collection: col,
          leaderboardId: targetId,
          notice: buildFailureNotice(subCode, col, bLabel),
          entries: localSubEntries,
          currentPlayer: remoteSubCur || localSubCurrent,
          nextContinuationToken: null,
        };
      }
      lastDiagnostics = { at: Date.now(), boardType: normBoard, collection: col, code: 0, message: 'ok' };
      const normSub = normalizeRemoteScores(subRes.data);
      const effectiveSubCur = remoteSubCur || (bestSub > 0 ? { rank: null, score: bestSub, name: daoName } : localSubCurrent);
      return {
        ok: true,
        source: normSub.entries.length > 0 ? 'tap' : 'tap_empty_local',
        boardType: normBoard,
        collection: col,
        leaderboardId: targetId,
        notice: normSub.entries.length === 0 ? `${bLabel}已连通，当期虚位以待。` : '',
        entries: normSub.entries.length > 0 ? normSub.entries : localSubEntries,
        currentPlayer: effectiveSubCur,
        nextContinuationToken: normSub.nextContinuationToken,
      };
    }

    const localEntries = buildLocalHonorEntries(save);
    const bestLocal = sanitizeLeaderboardScore(save?.leaderboard?.bestScore || 0);
    const localCurrent = bestLocal > 0
      ? { rank: 1, score: bestLocal, name: daoName, isLocal: true }
      : { rank: null, score: 0, name: daoName, isLocal: true };

    const { mgr, mode } = resolveManager();
    if (!mgr || typeof mgr.loadLeaderboardScores !== 'function') {
      return {
        ok: false,
        source: 'local',
        boardType: 'primary',
        collection: col,
        leaderboardId: PRIMARY_LEADERBOARD_ID,
        notice: col === LEADERBOARD_COLLECTIONS.FRIENDS
          ? '当前处于离线或本机环境，暂无法读取好友关系，以下展示本机守夜荣誉榜。'
          : '当前展示本机五更守夜荣誉榜（在 TapTap 内打开可同步全服总榜）。',
        entries: localEntries,
        currentPlayer: localCurrent,
        nextContinuationToken: null,
      };
    }

    // 待重传成绩不阻塞读榜：失败也只是继续排队
    if (sanitizeLeaderboardScore(save?.leaderboard?.pendingScore) > 0) {
      await flushPendingScore(save).catch(() => null);
    }

    const buildScoresReq = (withPeriod) => {
      const req = { leaderboardId: PRIMARY_LEADERBOARD_ID, collection: col, maxSize: safeMaxSize };
      if (typeof continuationToken === 'string' && continuationToken) req.continuationToken = continuationToken;
      if (withPeriod && periodTokens.primary) req.periodToken = periodTokens.primary;
      return req;
    };

    if (col === LEADERBOARD_COLLECTIONS.FRIENDS && mode === 'tap') {
      await ensurePrivacyAuthorized();
    }

    // 顺序调用（部分宿主桥接不支持同时挂起多个排行榜回调）
    const periodBefore = periodTokens.primary;
    let scoresRes = await callSdk(mgr, 'loadLeaderboardScores', buildScoresReq(true));
    let curRes = { ok: false };
    if (typeof mgr.loadCurrentPlayerLeaderboardScore === 'function') {
      const curReq = { leaderboardId: PRIMARY_LEADERBOARD_ID, collection: col };
      if (periodTokens.primary) curReq.periodToken = periodTokens.primary;
      curRes = await callSdk(mgr, 'loadCurrentPlayerLeaderboardScore', curReq);
      if (curRes.ok) rememberPeriod('primary', curRes.data);
    }

    // 有重置周期的榜单：借「我的排名」返回的当期 periodToken 重拉一次
    if (!scoresRes.ok && !isPermissionCode(scoresRes.err?.code) && periodTokens.primary && periodTokens.primary !== periodBefore) {
      scoresRes = await callSdk(mgr, 'loadLeaderboardScores', buildScoresReq(true));
    }
    // 偶发网络错误 / 超时：静默退避重试一次（确定性的配置错误与权限错误不重试）
    if (!scoresRes.ok && !isPermissionCode(scoresRes.err?.code) && !CONFIG_ERROR_CODES.has(scoresRes.err?.code)) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      scoresRes = await callSdk(mgr, 'loadLeaderboardScores', buildScoresReq(true));
    }
    if (scoresRes.ok) rememberPeriod('primary', scoresRes.data);

    const remoteCurrent = curRes.ok ? normalizeCurrentPlayer(curRes.data, daoName) : null;

    if (!scoresRes.ok) {
      const code = scoresRes.err?.code;
      lastDiagnostics = { at: Date.now(), boardType: 'primary', collection: col, code, message: scoresRes.err?.rawMessage || '' };
      try { console.info?.('[wugeng] leaderboard fallback', col, code); } catch { /* noop */ }
      return {
        ok: false,
        source: isPermissionCode(code) ? 'permission_fallback' : 'error_fallback',
        code,
        // 权限类错误也允许「重新展卷」：后台补齐声明或玩家改为同意后无需重进游戏
        retryable: !CONFIG_ERROR_CODES.has(code),
        boardType: 'primary',
        collection: col,
        leaderboardId: PRIMARY_LEADERBOARD_ID,
        notice: buildFailureNotice(code, col),
        entries: localEntries,
        currentPlayer: remoteCurrent || localCurrent,
        nextContinuationToken: null,
      };
    }

    lastDiagnostics = { at: Date.now(), boardType: 'primary', collection: col, code: 0, message: 'ok' };
    const norm = normalizeRemoteScores(scoresRes.data);
    const effectiveCurrent = remoteCurrent || (bestLocal > 0 ? { rank: null, score: bestLocal, name: daoName } : null);
    const entries = norm.entries.length > 0 ? norm.entries : localEntries;

    return {
      ok: true,
      source: norm.entries.length > 0 ? 'tap' : 'tap_empty_local',
      boardType: 'primary',
      collection: col,
      leaderboardId: PRIMARY_LEADERBOARD_ID,
      notice: norm.entries.length === 0
        ? (localEntries.length > 0 ? '天榜已连通，本期尚无人登榜，以下先展示本机历史战绩。' : '天榜已连通，本期虚位以待，守完一局即可登榜。')
        : '',
      entries,
      currentPlayer: effectiveCurrent,
      nextContinuationToken: norm.nextContinuationToken,
    };
  }

  function openNativeLeaderboard({ boardType = 'primary', collection = LEADERBOARD_COLLECTIONS.PUBLIC } = {}) {
    const col = normalizeCollection(collection);
    const targetId = resolveBoardId(boardType);
    if (!targetId) {
      return Promise.resolve({ ok: false, reason: 'unconfigured', leaderboardId: '', collection: col });
    }
    const { mgr } = resolveManager();
    if (!mgr || typeof mgr.openLeaderboard !== 'function') {
      return Promise.resolve({
        ok: false,
        reason: 'unavailable',
        leaderboardId: targetId,
        collection: col,
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        mgr.openLeaderboard({
          leaderboardId: targetId,
          collection: col,
          callback: {
            onSuccess: (res) => done({ ok: true, leaderboardId: targetId, collection: col, raw: res || null }),
            onFailure: (a1, a2) => {
              const err = parseFailureArgs(a1, a2);
              done({ ok: false, code: err.code, leaderboardId: targetId, collection: col });
            },
          },
        });
      } catch {
        done({ ok: false, reason: 'exception', leaderboardId: targetId, collection: col });
      }
    });
  }

  return {
    PRIMARY_LEADERBOARD_ID,
    DAILY_LEADERBOARD_ID: dailyLeaderboardId,
    SEASON_LEADERBOARD_ID: seasonLeaderboardId,
    leaderboardId: PRIMARY_LEADERBOARD_ID,
    name: PRIMARY_LEADERBOARD_NAME,
    unit: PRIMARY_LEADERBOARD_UNIT,
    getConfig: getLeaderboardConfig,
    isAvailable,
    submitScore,
    submitRunScore: submitScore,
    submit: submitScore,
    submitDailyScore,
    submitSeasonScore,
    submitScores: submitScoresBatch,
    flushPendingScore,
    flushSecondaryPendingScore,
    flushAllPendingScores,
    fetchBoard,
    loadScores: fetchBoard,
    buildLocalSeasonEntries,
    openNativeLeaderboard,
    openLeaderboard: openNativeLeaderboard,
    getLastDiagnostics: () => (lastDiagnostics ? { ...lastDiagnostics } : null),
  };
}
