// TapTap 排行榜服务封装（F12：五更守夜总榜 c5mzumajes9houq0ra）
// - 完整对接 tap.getLeaderboardManager() 的 submitScores / loadLeaderboardScores / loadCurrentPlayerLeaderboardScore / openLeaderboard
// - 支持 collection: 'public'（全服总榜）与 'friends'（好友榜）
// - 兼容双参数 onFailure(code, message) 与对象错误；对 1025/103/104 好友未授权、500001 及离线环境提供友好中文降级与本地荣誉榜
// - 支持 pendingScore 待重传队列，以及 ?mockLeaderboard=1|1025|500001 与 ?mockTap=1 模拟宿主

import {
  LEADERBOARD_COLLECTIONS,
  LEADERBOARD_DEFAULT_PAGE_SIZE,
  LEADERBOARD_MAX_PAGE_SIZE,
  LEADERBOARD_MAX_SUBMIT_BATCH,
  PRIMARY_LEADERBOARD_ID,
  PRIMARY_LEADERBOARD_NAME,
  PRIMARY_LEADERBOARD_UNIT,
  getLeaderboardConfig,
} from './leaderboard-config.js';
import { DEFAULT_DAO_NAME, HERO_IDS, sanitizeDaoName, saveSave } from './save.js';

const PERMISSION_ERROR_CODES = new Set([1025, 103, 104, '1025', '103', '104']);
const NOT_FOUND_ERROR_CODES = new Set([500001, '500001']);
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

function createMockTapLeaderboardManager(mode, getSave) {
  let submittedBest = 0;
  let openCalls = 0;

  const buildRankedList = (collection) => {
    const save = getSave?.();
    const myName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);
    const myHero = HERO_IDS.includes(save?.selectedHero) ? save.selectedHero : 'zhou';
    const myBest = Math.max(submittedBest, sanitizeLeaderboardScore(save?.leaderboard?.bestScore || 0));
    const seeds = collection === LEADERBOARD_COLLECTIONS.FRIENDS ? MOCK_FRIENDS_SEEDS : MOCK_PUBLIC_SEEDS;
    const combined = seeds.map((s) => ({
      score: s.score,
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
        const s = sanitizeLeaderboardScore(item?.score);
        if (s > submittedBest) submittedBest = s;
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
      if ((mode === '1025' || mode === '103' || mode === '104') && col === LEADERBOARD_COLLECTIONS.FRIENDS) {
        params?.callback?.onFailure?.(Number(mode), 'friend permission not granted');
        return;
      }
      const scores = buildRankedList(col).slice(0, sz);
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
      if ((mode === '1025' || mode === '103' || mode === '104') && col === LEADERBOARD_COLLECTIONS.FRIENDS) {
        params?.callback?.onFailure?.(Number(mode), 'friend permission not granted');
        return;
      }
      const ranked = buildRankedList(col);
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

export function createLeaderboard({
  win = typeof window !== 'undefined' ? window : null,
  getSave = () => null,
  persistSave = null,
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

  function resolveManager() {
    const q = readQueryParams(win);
    const mockLb = (q.get('mockLeaderboard') || '').trim();
    if (mockLb === '1025' || mockLb === '103' || mockLb === '104' || mockLb === '500001' || mockLb === '1' || mockLb === 'true') {
      const normKey = mockLb === 'true' ? '1' : mockLb;
      if (cachedMockKey !== normKey || !cachedMockMgr) {
        cachedMockKey = normKey;
        cachedMockMgr = createMockTapLeaderboardManager(normKey, getSave);
      }
      return { mgr: cachedMockMgr, mode: `mock:${normKey}` };
    }
    try {
      if (win?.tap && typeof win.tap.getLeaderboardManager === 'function') {
        const nativeMgr = win.tap.getLeaderboardManager();
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
        cachedMockMgr = createMockTapLeaderboardManager('1', getSave);
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

  async function fetchBoard({
    collection = LEADERBOARD_COLLECTIONS.PUBLIC,
    maxSize = LEADERBOARD_DEFAULT_PAGE_SIZE,
    continuationToken = null,
    save: explicitSave = null,
  } = {}) {
    const save = explicitSave || getSave?.() || null;
    const col = normalizeCollection(collection);
    const safeMaxSize = clampLeaderboardPageSize(maxSize);
    const daoName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);
    const localEntries = buildLocalHonorEntries(save);
    const bestLocal = sanitizeLeaderboardScore(save?.leaderboard?.bestScore || 0);
    const localCurrent = bestLocal > 0
      ? { rank: 1, score: bestLocal, name: daoName, isLocal: true }
      : { rank: null, score: 0, name: daoName, isLocal: true };

    await flushPendingScore(save);

    const { mgr } = resolveManager();
    if (!mgr || typeof mgr.loadLeaderboardScores !== 'function') {
      return {
        ok: false,
        source: 'local',
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

    const scoresPromise = new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        const req = {
          leaderboardId: PRIMARY_LEADERBOARD_ID,
          collection: col,
          maxSize: safeMaxSize,
          callback: {
            onSuccess: (data) => finish({ ok: true, data }),
            onFailure: (a1, a2) => finish({ ok: false, err: parseFailureArgs(a1, a2) }),
          },
        };
        if (typeof continuationToken === 'string' && continuationToken) {
          req.continuationToken = continuationToken;
        }
        mgr.loadLeaderboardScores(req);
      } catch {
        finish({ ok: false, err: { code: -1, rawMessage: '' } });
      }
    });

    const currentPromise = typeof mgr.loadCurrentPlayerLeaderboardScore === 'function'
      ? new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        try {
          mgr.loadCurrentPlayerLeaderboardScore({
            leaderboardId: PRIMARY_LEADERBOARD_ID,
            collection: col,
            callback: {
              onSuccess: (data) => finish({ ok: true, data }),
              onFailure: () => finish({ ok: false }),
            },
          });
        } catch {
          finish({ ok: false });
        }
      })
      : Promise.resolve({ ok: false });

    const [scoresRes, curRes] = await Promise.all([scoresPromise, currentPromise]);

    if (!scoresRes.ok) {
      const code = scoresRes.err?.code;
      if (isPermissionCode(code)) {
        return {
          ok: false,
          source: 'permission_fallback',
          code,
          collection: col,
          leaderboardId: PRIMARY_LEADERBOARD_ID,
          notice: '暂未开通或未获得 TapTap 好友关系权限授权，好友榜暂不可用，已为你回退展示本机荣誉榜记录。',
          entries: localEntries,
          currentPlayer: localCurrent,
          nextContinuationToken: null,
        };
      }
      return {
        ok: false,
        source: 'error_fallback',
        code,
        collection: col,
        leaderboardId: PRIMARY_LEADERBOARD_ID,
        notice: '云端榜单暂忙，当前回退展示本机五更守夜荣誉榜。',
        entries: localEntries,
        currentPlayer: localCurrent,
        nextContinuationToken: null,
      };
    }

    const norm = normalizeRemoteScores(scoresRes.data);
    const remoteCurrent = curRes.ok ? normalizeCurrentPlayer(curRes.data, daoName) : null;
    const effectiveCurrent = remoteCurrent || (bestLocal > 0 ? { rank: null, score: bestLocal, name: daoName } : null);
    const entries = norm.entries.length > 0 ? norm.entries : localEntries;

    return {
      ok: true,
      source: norm.entries.length > 0 ? 'tap' : 'tap_empty_local',
      collection: col,
      leaderboardId: PRIMARY_LEADERBOARD_ID,
      notice: norm.entries.length === 0 && localEntries.length > 0
        ? '云端暂无上榜记录，以下展示本机历史荣誉战绩。'
        : '',
      entries,
      currentPlayer: effectiveCurrent,
      nextContinuationToken: norm.nextContinuationToken,
    };
  }

  function openNativeLeaderboard({ collection = LEADERBOARD_COLLECTIONS.PUBLIC } = {}) {
    const col = normalizeCollection(collection);
    const { mgr } = resolveManager();
    if (!mgr || typeof mgr.openLeaderboard !== 'function') {
      return Promise.resolve({
        ok: false,
        reason: 'unavailable',
        leaderboardId: PRIMARY_LEADERBOARD_ID,
        collection: col,
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        mgr.openLeaderboard({
          leaderboardId: PRIMARY_LEADERBOARD_ID,
          collection: col,
          callback: {
            onSuccess: (res) => done({ ok: true, leaderboardId: PRIMARY_LEADERBOARD_ID, collection: col, raw: res || null }),
            onFailure: (a1, a2) => {
              const err = parseFailureArgs(a1, a2);
              done({ ok: false, code: err.code, leaderboardId: PRIMARY_LEADERBOARD_ID, collection: col });
            },
          },
        });
      } catch {
        done({ ok: false, reason: 'exception', leaderboardId: PRIMARY_LEADERBOARD_ID, collection: col });
      }
    });
  }

  return {
    PRIMARY_LEADERBOARD_ID,
    leaderboardId: PRIMARY_LEADERBOARD_ID,
    name: PRIMARY_LEADERBOARD_NAME,
    unit: PRIMARY_LEADERBOARD_UNIT,
    getConfig: getLeaderboardConfig,
    isAvailable,
    submitScore,
    submitRunScore: submitScore,
    submit: submitScore,
    submitScores: submitScoresBatch,
    flushPendingScore,
    fetchBoard,
    loadScores: fetchBoard,
    openNativeLeaderboard,
    openLeaderboard: openNativeLeaderboard,
  };
}
