// TapTap 小游戏官方多人联机 SDK 传输层封装（v4 M4.2）：
// - 严格遵循官方时序：getOnlineBattleManager() -> registerListener(...) -> connect()
// - 正确拆包 result.roomInfo.id / result.roomInfo.players 与 info.playerInfo.id
// - 兼容 onCustomMessage 的 fromPlayerId|playerId|fromUserId 与 msg|message|content 字段
// - 共享节流器 + 自动合包（_batch）：严格限制 <= 10 次/秒（低于官方 15 次/秒红线），单包 <= 2048 UTF-8 字节

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REGISTERED_MANAGERS = new WeakMap();

export const TAP_ROOM_TYPE_MATCH = 'wugeng_v4';
export const TAP_ROOM_TYPE_PRIVATE = 'wugeng_v4_priv';
export const MAX_TAP_MSG_BYTES = 2048;
export const SAFE_BATCH_BYTES = 1920;
export const MIN_SEND_INTERVAL_MS = 100; // <= 10 次/秒，留足安全余量（官方上限 15 次/秒）

function utf8ByteLen(str) {
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(str).length;
  }
  return unescape(encodeURIComponent(str)).length;
}

function safeJsonParse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** 从任意服务器 roomInfo.id 确定性派生 6 位大写字母数字房号（两端同 roomId 必得同码） */
export function deriveRoomCodeFromId(roomId) {
  const s = String(roomId || '').trim();
  if (/^[A-Za-z0-9]{6}$/.test(s)) return s.toUpperCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i * 17), 0x85ebca6b) >>> 0;
  }
  let out = '';
  let v = h1;
  for (let i = 0; i < 6; i++) {
    if (i === 3) v = h2;
    out += ROOM_ALPHABET[v % ROOM_ALPHABET.length];
    v = Math.floor(v / ROOM_ALPHABET.length) ^ (h1 >>> (i * 3));
  }
  return out;
}

/** 支持 Promise 与 success/fail 双风格 SDK 方法调用 */
function callTapApi(mgr, methodName, option = {}) {
  if (!mgr || typeof mgr[methodName] !== 'function') {
    return Promise.reject(new Error(`missing_api:${methodName}`));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const doneOk = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    const doneErr = (err) => {
      if (settled) return;
      settled = true;
      reject(err || new Error(`${methodName}:fail`));
    };
    try {
      const ret = mgr[methodName]({
        ...option,
        success: (res) => {
          option.success?.(res);
          doneOk(res);
        },
        fail: (err) => {
          option.fail?.(err);
          doneErr(err);
        },
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(doneOk, doneErr);
      }
    } catch (err) {
      doneErr(err);
    }
  });
}

function getOrInstallMultiplexer(mgr) {
  let mux = REGISTERED_MANAGERS.get(mgr);
  if (mux) return mux;
  const subs = new Set();
  const fanout = (eventName, payload) => {
    for (const sub of [...subs]) {
      try {
        sub[eventName]?.(payload);
      } catch {
        // 隔离单个订阅者异常，防止阻断底层 SDK 回调链
      }
    }
  };
  // 铁律：registerListener 必须在 connect() 之前同步完成注册！
  if (typeof mgr.registerListener === 'function') {
    mgr.registerListener({
      onDisconnected: (info) => fanout('onDisconnected', info),
      playerEnterRoom: (info) => fanout('playerEnterRoom', info),
      playerLeaveRoom: (info) => fanout('playerLeaveRoom', info),
      onPlayerLeft: (info) => fanout('playerLeaveRoom', info),
      playerOffline: (info) => fanout('playerOffline', info),
      onCustomMessage: (info) => fanout('onCustomMessage', info),
      onPlayerCustomPropertiesChange: (info) => fanout('onPlayerCustomPropertiesChange', info),
      onRoomPropertiesChange: (info) => fanout('onRoomPropertiesChange', info),
      onBattleStart: (info) => fanout('onBattleStart', info),
      onBattleStop: (info) => fanout('onBattleStop', info),
      onBattleServiceError: (info) => fanout('onBattleServiceError', info),
      onPlayerKicked: (info) => fanout('onPlayerKicked', info),
    });
  }
  mux = { subs };
  REGISTERED_MANAGERS.set(mgr, mux);
  return mux;
}

export function hasTapOnlineBattle(win = typeof window !== 'undefined' ? window : null) {
  return typeof win?.tap?.getOnlineBattleManager === 'function';
}

export function extractRoomInfo(res) {
  const roomInfo = res?.roomInfo || (res && typeof res === 'object' && res.id !== undefined ? res : null);
  if (!roomInfo || roomInfo.id === undefined || roomInfo.id === null) return null;
  const props = safeJsonParse(roomInfo.customProperties) || {};
  const roomId = String(roomInfo.id);
  const roomCode = (typeof props.roomCode === 'string' && /^[A-Za-z0-9]{4,8}$/.test(props.roomCode))
    ? props.roomCode.toUpperCase()
    : (typeof roomInfo.name === 'string' && /^[A-Za-z0-9]{4,8}$/.test(roomInfo.name))
      ? roomInfo.name.toUpperCase()
      : deriveRoomCodeFromId(roomId);
  const players = Array.isArray(roomInfo.players)
    ? roomInfo.players.map((p) => ({
      id: String(p?.id || ''),
      status: Number.isFinite(Number(p?.status)) ? Number(p.status) : 1,
      properties: safeJsonParse(p?.customProperties) || {},
    })).filter((p) => p.id)
    : [];
  return {
    roomId,
    roomCode,
    ownerId: String(roomInfo.ownerId || ''),
    maxPlayerCount: Number(roomInfo.maxPlayerCount) || 4,
    type: String(roomInfo.type || ''),
    properties: props,
    players,
  };
}

/**
 * 创建 TapTap 多人联机传输适配器。
 */
export function createTapBattleTransport({
  win = typeof window !== 'undefined' ? window : null,
  nowFn = () => Date.now(),
  onMessage = null,
  onPlayerEnter = null,
  onPlayerLeave = null,
  onPlayerOffline = null,
  onRoomProperties = null,
  onPlayerProperties = null,
  onDisconnected = null,
  onError = null,
} = {}) {
  let mgr = null;
  let muxSub = null;
  let connectPromise = null;
  let myPlayerId = '';
  let currentRoomId = '';
  let currentRoomCode = '';
  let destroyed = false;

  // 共享 API 节流队列（sendCustomMessage / updateRoomProperties / updatePlayerCustomProperties 合计 <= 10 次/秒）
  const outbox = [];
  let flushTimer = 0;
  let lastApiCallAt = 0;
  let sentCountWindow = [];

  function recordCallStamp(ts) {
    lastApiCallAt = ts;
    sentCountWindow.push(ts);
    const cutoff = ts - 1000;
    while (sentCountWindow.length > 0 && sentCountWindow[0] <= cutoff) {
      sentCountWindow.shift();
    }
  }

  function canCallNow(ts) {
    const cutoff = ts - 1000;
    while (sentCountWindow.length > 0 && sentCountWindow[0] <= cutoff) {
      sentCountWindow.shift();
    }
    return (ts - lastApiCallAt) >= MIN_SEND_INTERVAL_MS && sentCountWindow.length < 10;
  }

  function scheduleFlush() {
    if (flushTimer || destroyed || outbox.length === 0) return;
    const now = nowFn();
    const waitMs = Math.max(10, MIN_SEND_INTERVAL_MS - (now - lastApiCallAt));
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      flushOutbox();
    }, waitMs);
  }

  function flushOutbox() {
    if (destroyed || !mgr || !currentRoomId || outbox.length === 0) return;
    const now = nowFn();
    if (!canCallNow(now)) {
      scheduleFlush();
      return;
    }

    const head = outbox[0];
    if (head.kind === 'roomProps') {
      outbox.shift();
      recordCallStamp(now);
      const str = JSON.stringify(head.props || {}).slice(0, MAX_TAP_MSG_BYTES);
      callTapApi(mgr, 'updateRoomProperties', {
        data: {
          name: head.name || currentRoomCode || undefined,
          customProperties: str,
        },
      }).catch((err) => onError?.(err));
    } else if (head.kind === 'playerProps') {
      outbox.shift();
      recordCallStamp(now);
      const str = JSON.stringify(head.props || {}).slice(0, MAX_TAP_MSG_BYTES);
      callTapApi(mgr, 'updatePlayerCustomProperties', {
        properties: str,
      }).catch((err) => onError?.(err));
    } else {
      // 合并多条待发 customMessage 为单次 _batch 调用，最大化吞吐同时严守 <= 10 次/秒与 <= 2048B
      const batch = [];
      let estBytes = 16; // {"_batch":[]}
      while (outbox.length > 0 && outbox[0].kind === 'msg') {
        const candidate = outbox[0];
        const itemJson = JSON.stringify(candidate.payload);
        const itemBytes = utf8ByteLen(itemJson) + 2;
        if (batch.length > 0 && estBytes + itemBytes > SAFE_BATCH_BYTES) {
          break;
        }
        outbox.shift();
        if (itemBytes > MAX_TAP_MSG_BYTES - 4) {
          onError?.(new Error('custom_message_too_large'));
          continue;
        }
        batch.push(candidate.payload);
        estBytes += itemBytes;
        if (batch.length >= 16) break;
      }
      if (batch.length > 0) {
        recordCallStamp(now);
        const msgStr = batch.length === 1 ? JSON.stringify(batch[0]) : JSON.stringify({ _batch: batch });
        callTapApi(mgr, 'sendCustomMessage', {
          data: {
            msg: msgStr,
            type: 0,
          },
        }).catch((err) => onError?.(err));
      }
    }

    if (outbox.length > 0) {
      scheduleFlush();
    }
  }

  function handleIncomingCustomMessage(info) {
    if (destroyed || !info) return;
    const fromId = String(info.fromPlayerId || info.playerId || info.fromUserId || '');
    if (fromId && myPlayerId && fromId === myPlayerId) return;
    const msgRaw = info.msg ?? info.message ?? info.content;
    const parsed = safeJsonParse(msgRaw);
    if (!parsed) return;
    if (Array.isArray(parsed._batch)) {
      for (const subPkt of parsed._batch) {
        if (subPkt && typeof subPkt === 'object') {
          onMessage?.({ ...subPkt, senderId: subPkt.senderId || fromId }, fromId);
        }
      }
    } else {
      onMessage?.({ ...parsed, senderId: parsed.senderId || fromId }, fromId);
    }
  }

  function ensureManagerAndListeners() {
    if (mgr) return mgr;
    if (!hasTapOnlineBattle(win)) return null;
    mgr = win.tap.getOnlineBattleManager();
    if (!mgr) return null;

    // 必须在 connect() 前注册监听！
    const mux = getOrInstallMultiplexer(mgr);
    muxSub = {
      onDisconnected: (info) => {
        currentRoomId = '';
        onDisconnected?.({
          reason: info?.reason || 'disconnected',
          code: Number(info?.code) || 0,
        });
      },
      playerEnterRoom: (info) => {
        const pInfo = info?.playerInfo || info;
        const pid = String(pInfo?.id || info?.playerId || '');
        if (!pid || (myPlayerId && pid === myPlayerId)) return;
        const props = safeJsonParse(pInfo?.customProperties) || {};
        onPlayerEnter?.({ playerId: pid, properties: props, roomId: String(info?.roomId || currentRoomId) });
      },
      playerLeaveRoom: (info) => {
        const pid = String(info?.playerInfo?.id || info?.playerId || info?.id || '');
        if (!pid) return;
        onPlayerLeave?.({ playerId: pid, roomId: String(info?.roomId || currentRoomId) });
      },
      playerOffline: (info) => {
        const pid = String(info?.playerInfo?.id || info?.playerId || info?.id || '');
        if (!pid) return;
        onPlayerOffline?.({ playerId: pid, roomId: String(info?.roomId || currentRoomId) });
      },
      onCustomMessage: handleIncomingCustomMessage,
      onPlayerCustomPropertiesChange: (info) => {
        const pid = String(info?.playerId || info?.playerInfo?.id || '');
        const props = safeJsonParse(info?.properties) || {};
        if (pid) onPlayerProperties?.({ playerId: pid, properties: props });
      },
      onRoomPropertiesChange: (info) => {
        const props = safeJsonParse(info?.properties) || {};
        const ownerId = info?.ownerId ? String(info.ownerId) : '';
        onRoomProperties?.({ properties: props, ownerId });
      },
      onBattleServiceError: (errInfo) => {
        onError?.(errInfo);
      },
    };
    mux.subs.add(muxSub);
    return mgr;
  }

  async function ensureConnected() {
    const m = ensureManagerAndListeners();
    if (!m) {
      return { ok: false, reason: 'unavailable', playerId: '' };
    }
    if (myPlayerId) {
      return { ok: true, playerId: myPlayerId };
    }
    if (!connectPromise) {
      connectPromise = callTapApi(m, 'connect', {})
        .then((res) => {
          const pid = String(res?.playerId || '');
          if (!pid) throw new Error('empty_player_id');
          myPlayerId = pid;
          return { ok: true, playerId: myPlayerId };
        })
        .catch((err) => {
          connectPromise = null;
          onError?.(err);
          return { ok: false, reason: 'connect_failed', error: err, playerId: '' };
        });
    }
    return connectPromise;
  }

  async function createRoom({ roomCode, maxPlayerCount = 4, roomProps = {}, playerProps = {} } = {}) {
    const conn = await ensureConnected();
    if (!conn.ok) return { ok: false, reason: conn.reason };
    try {
      const customRoomProps = { ...roomProps, roomCode: roomCode || undefined };
      const res = typeof mgr.createRoom === 'function'
        ? await callTapApi(mgr, 'createRoom', {
          data: {
            roomCfg: {
              name: roomCode || undefined,
              maxPlayerCount,
              type: TAP_ROOM_TYPE_PRIVATE,
              customProperties: JSON.stringify(customRoomProps),
              matchParams: roomCode ? { roomCode } : {},
            },
            playerCfg: {
              customProperties: JSON.stringify(playerProps || {}),
            },
          },
        })
        : await callTapApi(mgr, 'matchRoom', {
          data: {
            roomCfg: {
              name: roomCode || undefined,
              maxPlayerCount,
              type: roomCode ? `${TAP_ROOM_TYPE_PRIVATE}_${roomCode}` : TAP_ROOM_TYPE_PRIVATE,
              customProperties: JSON.stringify(customRoomProps),
              matchParams: roomCode ? { roomCode } : {},
            },
            playerCfg: {
              customProperties: JSON.stringify(playerProps || {}),
            },
          },
        });
      const info = extractRoomInfo(res);
      if (!info) return { ok: false, reason: 'invalid_room_info' };
      currentRoomId = info.roomId;
      currentRoomCode = info.roomCode;
      return { ok: true, playerId: myPlayerId, room: info };
    } catch (err) {
      return { ok: false, reason: 'create_failed', error: err };
    }
  }

  async function joinRoomByCode({ roomCode, playerProps = {} } = {}) {
    const conn = await ensureConnected();
    if (!conn.ok) return { ok: false, reason: conn.reason };
    const normCode = String(roomCode || '').trim().toUpperCase();
    if (!normCode) return { ok: false, reason: 'invalid_code' };

    let targetRoomId = normCode;
    // 若 SDK 支持 getRoomList，先按 6 位房号查找服务器真实 roomInfo.id（兼容数字短 ID 如 "25"）
    if (typeof mgr.getRoomList === 'function') {
      for (const rType of [TAP_ROOM_TYPE_PRIVATE, TAP_ROOM_TYPE_MATCH]) {
        try {
          const listRes = await callTapApi(mgr, 'getRoomList', { data: { type: rType } });
          const rooms = Array.isArray(listRes?.roomList) ? listRes.roomList : (Array.isArray(listRes?.rooms) ? listRes.rooms : []);
          for (const rawRoom of rooms) {
            const parsed = extractRoomInfo({ roomInfo: rawRoom });
            if (parsed && (parsed.roomCode === normCode || parsed.roomId.toUpperCase() === normCode)) {
              targetRoomId = parsed.roomId;
              break;
            }
          }
          if (targetRoomId !== normCode) break;
        } catch {
          // 忽略列表查询异常，继续直接尝试 joinRoom
        }
      }
    }

    try {
      if (typeof mgr.joinRoom === 'function') {
        const res = await callTapApi(mgr, 'joinRoom', {
          data: {
            roomId: targetRoomId,
            playerCfg: {
              customProperties: JSON.stringify(playerProps || {}),
            },
          },
        });
        const info = extractRoomInfo(res);
        if (!info) return { ok: false, reason: 'not_found' };
        currentRoomId = info.roomId;
        currentRoomCode = info.roomCode;
        return { ok: true, playerId: myPlayerId, room: info };
      }
      return { ok: false, reason: 'join_unsupported' };
    } catch (err) {
      const msg = String(err?.errMsg || err?.message || err || '').toLowerCase();
      const isFull = /full|max|满/.test(msg);
      return { ok: false, reason: isFull ? 'full' : 'not_found', error: err };
    }
  }

  async function matchRoom({ maxPlayerCount = 4, playerProps = {}, roomProps = {} } = {}) {
    const conn = await ensureConnected();
    if (!conn.ok) return { ok: false, reason: conn.reason };
    try {
      const res = await callTapApi(mgr, 'matchRoom', {
        data: {
          roomCfg: {
            maxPlayerCount,
            type: TAP_ROOM_TYPE_MATCH,
            matchParams: {},
            customProperties: JSON.stringify(roomProps || {}),
          },
          playerCfg: {
            customProperties: JSON.stringify(playerProps || {}),
          },
        },
      });
      const info = extractRoomInfo(res);
      if (!info) return { ok: false, reason: 'match_failed' };
      currentRoomId = info.roomId;
      currentRoomCode = info.roomCode;
      return { ok: true, playerId: myPlayerId, room: info };
    } catch (err) {
      return { ok: false, reason: 'match_failed', error: err };
    }
  }

  function sendMessage(payload) {
    if (destroyed || !payload || typeof payload !== 'object') return false;
    outbox.push({ kind: 'msg', payload });
    flushOutbox();
    return true;
  }

  function updateRoomProperties(props, name = '') {
    if (destroyed || !props || typeof props !== 'object') return false;
    outbox.push({ kind: 'roomProps', props, name });
    flushOutbox();
    return true;
  }

  function updatePlayerProperties(props) {
    if (destroyed || !props || typeof props !== 'object') return false;
    outbox.push({ kind: 'playerProps', props });
    flushOutbox();
    return true;
  }

  async function leaveRoom() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = 0;
    }
    outbox.length = 0;
    const hadRoom = Boolean(currentRoomId);
    currentRoomId = '';
    currentRoomCode = '';
    if (mgr && hadRoom && typeof mgr.leaveRoom === 'function') {
      try {
        await callTapApi(mgr, 'leaveRoom', {});
      } catch {
        // 忽略退出异常
      }
    }
  }

  function destroy() {
    destroyed = true;
    leaveRoom();
    if (mgr && muxSub) {
      const mux = REGISTERED_MANAGERS.get(mgr);
      mux?.subs?.delete(muxSub);
      muxSub = null;
    }
  }

  return {
    isAvailable: () => hasTapOnlineBattle(win),
    get playerId() { return myPlayerId; },
    get roomId() { return currentRoomId; },
    get roomCode() { return currentRoomCode; },
    get recentSendRate() {
      const cutoff = nowFn() - 1000;
      return sentCountWindow.filter((t) => t > cutoff).length;
    },
    ensureConnected,
    createRoom,
    joinRoomByCode,
    matchRoom,
    sendMessage,
    updateRoomProperties,
    updatePlayerProperties,
    leaveRoom,
    destroy,
  };
}
