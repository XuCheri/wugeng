// TapTap 小游戏成就服务桥接封装（tap.createAchievementManager）
// - 对接 createAchievementManager / registerListener / unregisterListener / unlockAchievement / incrementAchievement / showAchievements
// - 局内或结算实时达成时开启原生冒泡（toastEnable = true），启动与云存档回填历史进度时静默同步（toastEnable = false）
// - 已确认同步的成就 ID 独立记录于本机 wugeng.tap_ach_synced，不污染存档结构；未发布或离线失败项下次启动自动补传
// - 支持 ?mockTap=1 与 ?mockAchievement=1 内存模拟宿主，普通浏览器无宿主时安全降级不报错

import { ACHIEVEMENTS, getAchievementProgress } from './achievements.js';
import {
  TAP_ACHIEVEMENT_BY_ID,
  TAP_ACHIEVEMENT_SPECS,
  isValidTapAchievementId,
  resolveTapAchievementId,
} from './tap-achievements-config.js';

export const TAP_ACH_SYNCED_KEY = 'wugeng.tap_ach_synced';
const SILENT_TOAST_RESTORE_MS = 600;

export function parseMockTapAchievement(search) {
  if (typeof search !== 'string' || !search) return false;
  try {
    const params = new URLSearchParams(search);
    for (const key of ['mockAchievement', 'mockTap']) {
      const v = params.get(key);
      if (v !== null && v !== '0' && v !== 'off') return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function createMockTapAchievementHost() {
  let singleton = null;
  return {
    __isMockTapAchievementHost: true,
    createAchievementManager(options = {}) {
      if (singleton) return singleton;
      const listeners = new Set();
      const unlockedMap = new Map();
      const stepMap = new Map();
      let platinumUnlocked = false;
      let overlayOpens = 0;

      const emitSuccess = (code, payload) => {
        for (const l of [...listeners]) {
          try { l?.onAchievementSuccess?.(code, payload); } catch {}
        }
      };
      const emitFailure = (id, code, msg) => {
        for (const l of [...listeners]) {
          try { l?.onAchievementFailure?.(id, code, msg); } catch {}
        }
      };

      singleton = {
        toastEnable: options?.toastEnable !== false,
        get overlayOpenCount() { return overlayOpens; },
        get unlockedIds() { return [...unlockedMap.keys()]; },
        registerListener(listener) {
          if (listener && typeof listener === 'object') listeners.add(listener);
        },
        unregisterListener(listener) {
          if (listener) listeners.delete(listener);
          else listeners.clear();
        },
        unlockAchievement(opt = {}) {
          const achievementId = opt?.achievementId;
          if (!isValidTapAchievementId(achievementId)) {
            emitFailure(String(achievementId || ''), 700001, 'invalid achievementId');
            return;
          }
          if (unlockedMap.has(achievementId)) return;
          const spec = TAP_ACHIEVEMENT_BY_ID[achievementId];
          const entry = {
            achievementId,
            achievementName: spec?.name || achievementId,
            achievementType: 0,
          };
          unlockedMap.set(achievementId, entry);
          emitSuccess(70001, entry);

          if (!platinumUnlocked && unlockedMap.size >= TAP_ACHIEVEMENT_SPECS.length) {
            platinumUnlocked = true;
            emitSuccess(70001, {
              achievementId: 'platinumAll',
              achievementName: '五更天守夜白金',
              achievementType: 1,
            });
          }
        },
        incrementAchievement(opt = {}) {
          const achievementId = opt?.achievementId;
          const steps = Number(opt?.steps);
          if (!isValidTapAchievementId(achievementId) || !Number.isFinite(steps) || steps <= 0) {
            emitFailure(String(achievementId || ''), 700002, 'invalid increment option');
            return;
          }
          if (unlockedMap.has(achievementId)) return;
          const add = Math.max(1, Math.floor(steps));
          const cur = (stepMap.get(achievementId) || 0) + add;
          stepMap.set(achievementId, cur);
          const spec = TAP_ACHIEVEMENT_BY_ID[achievementId];
          const target = spec?.target || 1;
          const entry = {
            achievementId,
            achievementName: spec?.name || achievementId,
            achievementType: 0,
            currentStep: cur,
          };
          if (cur >= target) {
            unlockedMap.set(achievementId, entry);
          }
          emitSuccess(70002, entry);
        },
        showAchievements() {
          overlayOpens += 1;
        },
      };
      return singleton;
    },
  };
}

function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function defaultSearch() {
  try {
    return typeof window !== 'undefined' && window.location ? window.location.search : '';
  } catch {
    return '';
  }
}

function defaultTapHost() {
  try {
    return typeof window !== 'undefined' ? window.tap : null;
  } catch {
    return null;
  }
}

function readSyncedSet(storage) {
  const out = new Set();
  if (!storage || typeof storage.getItem !== 'function') return out;
  try {
    const raw = storage.getItem(TAP_ACH_SYNCED_KEY);
    if (!raw) return out;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (isValidTapAchievementId(item)) out.add(item);
      }
    }
  } catch {}
  return out;
}

function writeSyncedSet(storage, set) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(TAP_ACH_SYNCED_KEY, JSON.stringify([...set]));
  } catch {}
}

export function createTapAchievements(opts = {}) {
  const storage = opts.storage !== undefined ? opts.storage : defaultStorage();
  const search = opts.search !== undefined ? opts.search : defaultSearch();
  const mockEnabled = Boolean(opts.mock) || parseMockTapAchievement(search);

  let mockHost = null;
  let mgr = null;
  let listenerRegistered = false;
  let lastDispatchedId = null;
  let lastError = null;
  let overlayOpenCount = 0;
  let toastRestoreTimer = 0;

  const syncedIds = readSyncedSet(storage);
  const sessionDispatched = new Set();

  function resolveHost() {
    const explicit = opts.tapHost !== undefined ? opts.tapHost : defaultTapHost();
    if (explicit && typeof explicit.createAchievementManager === 'function') {
      return explicit;
    }
    if (mockEnabled) {
      if (!mockHost) mockHost = createMockTapAchievementHost();
      return mockHost;
    }
    return null;
  }

  function isNativeAvailable() {
    const explicit = opts.tapHost !== undefined ? opts.tapHost : defaultTapHost();
    return Boolean(explicit && typeof explicit.createAchievementManager === 'function' && !explicit.__isMockTapAchievementHost);
  }

  function isAvailable() {
    return Boolean(resolveHost());
  }

  function setManagerToast(enabled) {
    if (!mgr) return;
    const flag = Boolean(enabled);
    try { mgr.toastEnable = flag; } catch {}
    try {
      if (typeof mgr.setToastEnable === 'function') mgr.setToastEnable(flag);
    } catch {}
  }

  const listener = {
    onAchievementSuccess(code, achievement) {
      const rawId = achievement?.achievementId || achievement?.id || lastDispatchedId || '';
      if (isValidTapAchievementId(rawId) && achievement?.achievementType !== 1) {
        syncedIds.add(rawId);
        writeSyncedSet(storage, syncedIds);
      }
      if (achievement?.achievementType === 1) {
        opts.onPlatinum?.({ code, achievement });
      }
      opts.onSuccess?.({ code, achievement, achievementId: rawId });
    },
    onAchievementFailure(id, code, msg) {
      const cleanId = typeof id === 'string' && id ? id : (lastDispatchedId || '');
      if (cleanId) sessionDispatched.delete(cleanId);
      lastError = {
        id: cleanId,
        code: Number.isFinite(Number(code)) ? Number(code) : code,
        message: typeof msg === 'string' ? msg : '',
      };
      opts.onFailure?.(lastError);
    },
  };

  function ensureManager() {
    if (mgr) return mgr;
    const host = resolveHost();
    if (!host) return null;
    try {
      mgr = host.createAchievementManager({ toastEnable: true });
      if (mgr && !listenerRegistered && typeof mgr.registerListener === 'function') {
        mgr.registerListener(listener);
        listenerRegistered = true;
      }
      return mgr;
    } catch (err) {
      lastError = { id: '', code: -1, message: String(err?.message || err || '') };
      mgr = null;
      return null;
    }
  }

  function scheduleToastRestore() {
    if (toastRestoreTimer) clearTimeout(toastRestoreTimer);
    toastRestoreTimer = setTimeout(() => {
      toastRestoreTimer = 0;
      setManagerToast(true);
    }, SILENT_TOAST_RESTORE_MS);
  }

  function unlock(achId, { silent = false, force = false } = {}) {
    const tapId = resolveTapAchievementId(achId);
    if (!tapId) return { ok: false, reason: 'invalid_id' };
    if (!force && (syncedIds.has(tapId) || sessionDispatched.has(tapId))) {
      return { ok: true, skipped: true, achievementId: tapId };
    }
    const instance = ensureManager();
    if (!instance || typeof instance.unlockAchievement !== 'function') {
      return { ok: false, reason: 'unavailable', achievementId: tapId };
    }

    if (silent) {
      setManagerToast(false);
      scheduleToastRestore();
    } else {
      if (toastRestoreTimer) {
        clearTimeout(toastRestoreTimer);
        toastRestoreTimer = 0;
      }
      setManagerToast(true);
    }

    sessionDispatched.add(tapId);
    lastDispatchedId = tapId;
    try {
      const spec = TAP_ACHIEVEMENT_BY_ID[achId];
      if (spec?.stepped && typeof instance.incrementAchievement === 'function') {
        instance.incrementAchievement({ achievementId: tapId, steps: Math.max(1, Math.floor(spec.target || 1)) });
      } else {
        instance.unlockAchievement({ achievementId: tapId });
      }
      return { ok: true, skipped: false, achievementId: tapId };
    } catch (err) {
      sessionDispatched.delete(tapId);
      lastError = { id: tapId, code: -1, message: String(err?.message || err || '') };
      return { ok: false, reason: 'exception', achievementId: tapId };
    }
  }

  function unlockMany(achIds, { silent = false, force = false } = {}) {
    if (!Array.isArray(achIds) || achIds.length === 0) return { ok: true, dispatched: [] };
    const dispatched = [];
    for (const id of achIds) {
      const res = unlock(id, { silent, force });
      if (res.ok && !res.skipped) dispatched.push(res.achievementId);
    }
    return { ok: true, dispatched };
  }

  function increment(achId, steps = 1, { silent = false } = {}) {
    const tapId = resolveTapAchievementId(achId);
    const n = Math.floor(Number(steps));
    if (!tapId || !Number.isFinite(n) || n <= 0) {
      return { ok: false, reason: 'invalid_args' };
    }
    const instance = ensureManager();
    if (!instance || typeof instance.incrementAchievement !== 'function') {
      return { ok: false, reason: 'unavailable', achievementId: tapId };
    }
    if (silent) {
      setManagerToast(false);
      scheduleToastRestore();
    } else {
      if (toastRestoreTimer) {
        clearTimeout(toastRestoreTimer);
        toastRestoreTimer = 0;
      }
      setManagerToast(true);
    }
    lastDispatchedId = tapId;
    try {
      instance.incrementAchievement({ achievementId: tapId, steps: n });
      return { ok: true, achievementId: tapId, steps: n };
    } catch (err) {
      lastError = { id: tapId, code: -1, message: String(err?.message || err || '') };
      return { ok: false, reason: 'exception', achievementId: tapId };
    }
  }

  function syncUnlocked(save, { silent = true, force = false } = {}) {
    if (!save || typeof save !== 'object') return { ok: false, dispatched: [] };
    if (!isAvailable()) return { ok: false, reason: 'unavailable', dispatched: [] };
    const unlockedLocal = [];
    for (const a of ACHIEVEMENTS) {
      const prog = getAchievementProgress(save, a.id);
      if (prog.unlocked) {
        const tapId = resolveTapAchievementId(a.id);
        if (tapId && (force ? !syncedIds.has(tapId) : (!syncedIds.has(tapId) && !sessionDispatched.has(tapId)))) {
          unlockedLocal.push(a.id);
        }
      }
    }
    if (unlockedLocal.length === 0) return { ok: true, dispatched: [] };
    return unlockMany(unlockedLocal, { silent, force });
  }

  function openNativeAchievements(save = null) {
    const instance = ensureManager();
    if (!instance || typeof instance.showAchievements !== 'function') {
      return { ok: false, reason: 'unavailable' };
    }
    if (save) {
      syncUnlocked(save, { silent: true, force: true });
    }
    try {
      instance.showAchievements();
      overlayOpenCount += 1;
      return { ok: true, native: isNativeAvailable() };
    } catch (err) {
      lastError = { id: '', code: -1, message: String(err?.message || err || '') };
      return { ok: false, reason: 'exception' };
    }
  }

  function getState() {
    return {
      available: isAvailable(),
      native: isNativeAvailable(),
      toastEnable: mgr ? Boolean(mgr.toastEnable) : true,
      syncedIds: [...syncedIds],
      syncedCount: syncedIds.size,
      totalCount: TAP_ACHIEVEMENT_SPECS.length,
      overlayOpenCount,
      lastError,
    };
  }

  function teardown() {
    if (toastRestoreTimer) {
      clearTimeout(toastRestoreTimer);
      toastRestoreTimer = 0;
    }
    if (mgr && listenerRegistered && typeof mgr.unregisterListener === 'function') {
      try { mgr.unregisterListener(listener); } catch {}
    }
    listenerRegistered = false;
  }

  return {
    init: () => Boolean(ensureManager()),
    isAvailable,
    isNativeAvailable,
    unlock,
    unlockMany,
    increment,
    syncUnlocked,
    openNativeAchievements,
    getState,
    teardown,
  };
}
