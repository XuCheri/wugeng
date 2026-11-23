// TapTap H5 / 小游戏云存档对接（官方规范：tap.getCloudSaveManager + tap.getFileSystemManager）。
// 关键约束：
// 1. 存档名（archiveMetaData.name）<= 60 字节，禁含空格或中文，固定用 'wugeng_save'。
// 2. 数据先写本地 tapfile://usr/wugeng_save.json，再调 createArchive / updateArchive。
// 3. 平台限制每分钟最多上传 1 次（错误码 400001）：内置 62 秒节流与尾部合并队列，
//    平时先落本机 localStorage，关键节点（结算、签到、加点、手动同步）合并上云。
// 4. 调试：URL 带 ?mockCloud=1 时启用内存/会话级模拟云端，便于浏览器与 E2E 验证。

import { SAVE_VERSION, migrateSave, mergeSaves, isFreshSave, toFiniteNumber, isPlainObj } from './save.js';

export const ARCHIVE_NAME = 'wugeng_save';
export const UPLOAD_COOLDOWN_MS = 62_000;
export const COALESCE_DELAY_MS = 1_200;
const MOCK_STORAGE_KEY = 'wugeng.mockCloudArchive';
const isObj = isPlainObj;
const clampTs = (v) => {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(9e15, Math.floor(n))) : 0;
};

export function parseMockCloud(search) {
  if (typeof search !== 'string' || !search) return false;
  try {
    const v = new URLSearchParams(search).get('mockCloud');
    return v !== null && v !== '0' && v !== 'off';
  } catch {
    return false;
  }
}

/** 构造模拟的 tap 云存档宿主（用于 ?mockCloud=1 与测试）。 */
function createMockTapHost(backingStore) {
  const files = new Map();
  const getRemote = () => {
    try {
      const raw = backingStore?.getItem?.(MOCK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const setRemote = (obj) => {
    try { backingStore?.setItem?.(MOCK_STORAGE_KEY, JSON.stringify(obj)); } catch {}
  };

  return {
    env: { USER_DATA_PATH: 'tapfile://usr', TEMP_DATA_PATH: 'tapfile://tmp' },
    getFileSystemManager() {
      return {
        writeFile({ filePath, data, success, fail }) {
          try {
            files.set(filePath, String(data));
            success?.({ errMsg: 'writeFile:ok' });
          } catch (e) {
            fail?.(e);
          }
        },
        readFile({ filePath, success, fail }) {
          if (!files.has(filePath)) {
            fail?.(new Error('file not found: ' + filePath));
            return;
          }
          success?.({ data: files.get(filePath) });
        },
      };
    },
    getCloudSaveManager() {
      return {
        getArchiveList({ success, fail }) {
          try {
            const cur = getRemote();
            success?.({ saves: cur ? [cur.meta] : [] });
          } catch (e) {
            fail?.(e);
          }
        },
        createArchive({ archiveMetaData, archiveFilePath, success, fail }) {
          try {
            const data = files.get(archiveFilePath);
            if (data === undefined) throw new Error('missing archiveFilePath');
            const meta = {
              uuid: 'mock-uuid-1',
              fileId: 'mock-file-1',
              name: archiveMetaData?.name || ARCHIVE_NAME,
              summary: archiveMetaData?.summary || '',
              playtime: archiveMetaData?.playtime || 0,
              modifiedTime: Date.now(),
            };
            setRemote({ meta, data });
            success?.(meta);
          } catch (e) {
            fail?.(e);
          }
        },
        updateArchive({ archiveUUID, archiveMetaData, archiveFilePath, success, fail }) {
          try {
            const data = files.get(archiveFilePath);
            if (data === undefined) throw new Error('missing archiveFilePath');
            const prev = getRemote();
            const meta = {
              uuid: archiveUUID || prev?.meta?.uuid || 'mock-uuid-1',
              fileId: 'mock-file-' + Date.now(),
              name: archiveMetaData?.name || ARCHIVE_NAME,
              summary: archiveMetaData?.summary || '',
              playtime: archiveMetaData?.playtime || 0,
              modifiedTime: Date.now(),
            };
            setRemote({ meta, data });
            success?.(meta);
          } catch (e) {
            fail?.(e);
          }
        },
        getArchiveData({ targetFilePath, success, fail }) {
          try {
            const cur = getRemote();
            if (!cur) throw new Error('archive not found');
            files.set(targetFilePath, cur.data);
            success?.({ filePath: targetFilePath });
          } catch (e) {
            fail?.(e);
          }
        },
      };
    },
  };
}

/**
 * 创建云存档同步器。
 * @param {{ win?: any, search?: string, now?: () => number, cooldownMs?: number, coalesceMs?: number, mockStore?: any, onStateChange?: (st:any)=>void }} opts
 */
export function createCloudSave(opts = {}) {
  const getWin = () => opts.win ?? globalThis.window;
  const rawNowFn = opts.now ?? (() => Date.now());
  const safeNow = () => {
    try { return clampTs(rawNowFn()); } catch { return 0; }
  };
  const cooldownMs = opts.cooldownMs ?? UPLOAD_COOLDOWN_MS;
  const coalesceMs = opts.coalesceMs ?? COALESCE_DELAY_MS;
  const onStateChange = opts.onStateChange ?? (() => {});

  let mockHost = null;
  let lastUploadAt = 0;
  let lastSyncAt = 0;
  let syncing = false;
  let dirtySave = null;
  let timer = null;
  let lastError = null;

  function resolveTap() {
    const search = opts.search ?? getWin()?.location?.search ?? '';
    if (parseMockCloud(search)) {
      if (!mockHost) {
        let store = opts.mockStore;
        if (!store) {
          try { store = getWin()?.sessionStorage ?? null; } catch { store = null; }
        }
        mockHost = createMockTapHost(store);
      }
      return mockHost;
    }
    const tap = getWin()?.tap;
    if (tap && typeof tap.getCloudSaveManager === 'function' && typeof tap.getFileSystemManager === 'function') {
      return tap;
    }
    return null;
  }

  function isAvailable() {
    return resolveTap() !== null;
  }

  function cooldownLeftMs() {
    if (!lastUploadAt) return 0;
    return Math.max(0, lastUploadAt + cooldownMs - safeNow());
  }

  function getState() {
    return {
      available: isAvailable(),
      syncing,
      dirty: dirtySave !== null,
      lastUploadAt,
      lastSyncAt,
      cooldownSec: Math.ceil(cooldownLeftMs() / 1000),
      lastError,
    };
  }

  function emit() {
    try { onStateChange(getState()); } catch {}
  }

  function getArchiveList(cloud) {
    return new Promise((resolve, reject) => {
      cloud.getArchiveList({
        success: (res) => resolve(Array.isArray(res?.saves) ? res.saves : []),
        fail: (err) => reject(err || new Error('getArchiveList failed')),
      });
    });
  }

  function writeLocalTapFile(fs, filePath, text) {
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: text,
        encoding: 'utf8',
        success: () => resolve(),
        fail: (err) => reject(err || new Error('writeFile failed')),
      });
    });
  }

  function readLocalTapFile(fs, filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        encoding: 'utf8',
        success: (res) => resolve(res?.data ?? ''),
        fail: (err) => reject(err || new Error('readFile failed')),
      });
    });
  }

  async function rawUpload(tap, saveSnapshot) {
    const cloud = tap.getCloudSaveManager();
    const fs = tap.getFileSystemManager();
    const basePath = tap.env?.USER_DATA_PATH || 'tapfile://usr';
    const filePath = `${basePath}/${ARCHIVE_NAME}.json`;
    const clean = migrateSave(saveSnapshot);
    const nowTs = safeNow();
    const payload = {
      ...clean,
      version: SAVE_VERSION,
      updatedAt: Math.max(clean.updatedAt || 0, nowTs),
      savedAt: nowTs,
    };
    await writeLocalTapFile(fs, filePath, JSON.stringify(payload));
    const saves = await getArchiveList(cloud);
    const existing = saves.find((s) => s && s.name === ARCHIVE_NAME);
    const summary = `Runs ${payload.stats?.runs || 0} | Clears ${payload.stats?.clears || 0} | Coins ${payload.coins || 0}`;
    const playtime = Math.max(0, Math.floor(payload.stats?.totalPlaySec || 0));

    await new Promise((resolve, reject) => {
      const options = {
        archiveMetaData: {
          name: ARCHIVE_NAME,
          summary: summary.slice(0, 120),
          playtime,
        },
        archiveFilePath: filePath,
        success: (res) => resolve(res),
        fail: (err) => reject(err || new Error('cloud archive write failed')),
      };
      if (existing && existing.uuid) {
        cloud.updateArchive({ archiveUUID: existing.uuid, ...options });
      } else {
        cloud.createArchive(options);
      }
    });
  }

  async function flushDirty() {
    clearTimeout(timer);
    timer = null;
    if (!dirtySave || syncing) return { ok: false, reason: 'idle' };
    const tap = resolveTap();
    if (!tap) { dirtySave = null; emit(); return { ok: false, reason: 'unavailable' }; }
    const wait = cooldownLeftMs();
    if (wait > 0) {
      timer = setTimeout(() => { flushDirty(); }, wait + 50);
      emit();
      return { ok: false, reason: 'cooldown', waitSec: Math.ceil(wait / 1000) };
    }
    const target = dirtySave;
    dirtySave = null;
    syncing = true;
    lastError = null;
    emit();
    try {
      await rawUpload(tap, target);
      lastUploadAt = safeNow();
      lastSyncAt = lastUploadAt;
      syncing = false;
      emit();
      // 上传期间若又有新变动，排入下一轮冷却窗口
      if (dirtySave) {
        const nextWait = Math.max(coalesceMs, cooldownLeftMs() + 50);
        timer = setTimeout(() => { flushDirty(); }, nextWait);
      }
      return { ok: true };
    } catch (err) {
      syncing = false;
      const code = err?.errCode ?? err?.code ?? '';
      lastError = String(code || err?.errMsg || err?.message || 'upload_failed');
      // 若命中 400001 频率限制，记一次冷却稍后自动补传
      if (String(code) === '400001' || /400001|freq|limit/i.test(lastError)) {
        lastUploadAt = safeNow();
        dirtySave = dirtySave || target;
        timer = setTimeout(() => { flushDirty(); }, cooldownMs + 200);
      }
      emit();
      return { ok: false, reason: 'error', error: lastError };
    }
  }

  /** 业务关键节点（结算、签到、加点）调用：自动合并多次修改并遵守每分钟 1 次上限。 */
  function scheduleSync(save) {
    if (!isObj(save)) return false;
    const tap = resolveTap();
    if (!tap) return false;
    dirtySave = migrateSave(save);
    clearTimeout(timer);
    const delay = Math.max(coalesceMs, cooldownLeftMs() + 50);
    timer = setTimeout(() => { flushDirty(); }, delay);
    emit();
    return true;
  }

  /** 设置页手动点击「上传云端」：若不在冷却期则立即上传。 */
  async function uploadNow(save) {
    if (!isObj(save)) return { ok: false, reason: 'invalid' };
    const tap = resolveTap();
    if (!tap) return { ok: false, reason: 'unavailable' };
    if (syncing) return { ok: false, reason: 'busy' };
    const wait = cooldownLeftMs();
    if (wait > 0) {
      dirtySave = migrateSave(save);
      clearTimeout(timer);
      timer = setTimeout(() => { flushDirty(); }, wait + 50);
      emit();
      return { ok: false, reason: 'cooldown', waitSec: Math.ceil(wait / 1000) };
    }
    dirtySave = migrateSave(save);
    return flushDirty();
  }

  /** 启动时或手动点击「拉取云端」：下载云端存档并与本机存档安全合并。 */
  async function pullFromCloud(localSave) {
    const tap = resolveTap();
    if (!tap) return { ok: false, reason: 'unavailable' };
    if (syncing) return { ok: false, reason: 'busy' };
    syncing = true;
    lastError = null;
    emit();
    try {
      const cloud = tap.getCloudSaveManager();
      const fs = tap.getFileSystemManager();
      const basePath = tap.env?.USER_DATA_PATH || 'tapfile://usr';
      const saves = await getArchiveList(cloud);
      const slot = saves.find((s) => s && s.name === ARCHIVE_NAME);
      if (!slot) {
        syncing = false;
        lastSyncAt = safeNow();
        emit();
        // 云端尚无存档且本机已有进度时，自动排一次首传
        if (isObj(localSave) && !isFreshSave(localSave)) scheduleSync(localSave);
        return { ok: true, hasRemote: false, updated: false, merged: migrateSave(localSave) };
      }
      const tempPath = `${basePath}/${ARCHIVE_NAME}_remote.json`;
      const dlPath = await new Promise((resolve, reject) => {
        cloud.getArchiveData({
          archiveUUID: slot.uuid,
          archiveFileId: slot.fileId,
          targetFilePath: tempPath,
          success: (res) => resolve(res?.filePath || tempPath),
          fail: (err) => reject(err || new Error('getArchiveData failed')),
        });
      });
      const text = await readLocalTapFile(fs, dlPath);
      const remoteRaw = JSON.parse(text);
      const beforeJson = JSON.stringify(migrateSave(localSave));
      const merged = mergeSaves(localSave, remoteRaw);
      const afterJson = JSON.stringify(merged);
      syncing = false;
      lastSyncAt = safeNow();
      emit();
      return {
        ok: true,
        hasRemote: true,
        updated: beforeJson !== afterJson,
        merged,
      };
    } catch (err) {
      syncing = false;
      lastError = String(err?.errCode || err?.errMsg || err?.message || 'pull_failed');
      emit();
      return { ok: false, reason: 'error', error: lastError };
    }
  }

  function destroy() {
    clearTimeout(timer);
    timer = null;
  }

  return {
    isAvailable,
    getState,
    scheduleSync,
    uploadNow,
    pullFromCloud,
    flushDirty,
    destroy,
  };
}
