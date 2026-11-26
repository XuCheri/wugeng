// 多人「同守五更」联机管理与双模传输层（F14 + v4 M4 真·互联网联机）：
// 1. 优先通道：TapTap 官方多人联机 SDK（tap.getOnlineBattleManager + 100ms 确定性锁步 + 32 位状态哈希校准 + 独立三选一）
// 2. 本地/测试回退通道：浏览器原生 BroadcastChannel（支持同源多标签页零延迟联机与自动化回归）
// 3. 优雅降级：二者皆不可用时明确提示「当前环境暂不支持联机」，绝不抛错且保留智能道友 AI 协战
// 铁律：使用 sessionStorage['wugeng.peerId'] 隔离同源标签页身份，严禁把 peerId 写入共享 localStorage！

import { sanitizeRoomCode } from '../meta/friends.js';
import {
  DEFAULT_DAO_NAME,
  HERO_IDS,
  HERO_START_WEAPON,
  getHeroStarterWeapon,
  sanitizeDaoName,
} from '../meta/save.js';
import { getEquippedAttackVfx, getEquippedHeroSkin } from '../meta/cosmetics.js';
import { MAX_COOP_PLAYERS } from '../sim/coop.js';
import { chooseCoopUpgrade } from '../sim/run.js';
import { createTapBattleTransport, hasTapOnlineBattle } from './tap-battle-transport.js';
import { createLockstepController } from './lockstep.js';

export const PEER_STORAGE_KEY = 'wugeng.peerId';
export const LOBBY_CHANNEL_NAME = 'wugeng.coop.lobby.v3';
export const ROOM_CHANNEL_PREFIX = 'wugeng.coop.room.v3.';
export const QUICK_MATCH_BOT_FILL_MS = 20_000;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DAOIST_BOT_PROFILES = [
  { heroId: 'nuoxi', name: '道友·青衣傩舞', skinId: 'nuoxi_azure_phoenix', attackVfx: 'violet_thunder' },
  { heroId: 'tiejiang', name: '道友·石敢当', skinId: 'tiejiang_jade_taotie', attackVfx: 'gilded_imperial' },
  { heroId: 'yinyang', name: '道友·沈观星', skinId: 'yinyang_frost_astrolabe', attackVfx: 'frost_moon' },
  { heroId: 'daotong', name: '道友·玄真小道', skinId: 'daotong_violet_thunder', attackVfx: 'jade_ghostfire' },
  { heroId: 'mian', name: '道友·巧手阿绵', skinId: 'mian_azure_bride', attackVfx: 'frost_moon' },
  { heroId: 'zhou', name: '道友·镇岳老周', skinId: 'zhou_jade_watch', attackVfx: 'gilded_imperial' },
];

function randomRoomCode() {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return out;
}

function randomPeerToken() {
  let s = '';
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 10; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return `peer_${s}`;
}

function encodeBase64Json(obj) {
  const json = JSON.stringify(obj);
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  return Buffer.from(json, 'utf8').toString('base64');
}

function decodeBase64Json(b64) {
  if (typeof b64 !== 'string' || !b64.trim()) return null;
  try {
    let json = '';
    if (typeof atob === 'function') {
      const bin = atob(b64.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    } else {
      json = Buffer.from(b64.trim(), 'base64').toString('utf8');
    }
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function ensureTabPeerId(win = typeof window !== 'undefined' ? window : null) {
  try {
    const ss = win?.sessionStorage;
    if (ss) {
      const existing = ss.getItem(PEER_STORAGE_KEY);
      if (typeof existing === 'string' && /^peer_[a-z0-9_]{4,32}$/i.test(existing)) {
        return existing;
      }
      const fresh = randomPeerToken();
      ss.setItem(PEER_STORAGE_KEY, fresh);
      return fresh;
    }
  } catch {
    // ignore sessionStorage sandbox restrictions
  }
  return randomPeerToken();
}

export function createCoopManager({
  win = typeof window !== 'undefined' ? window : null,
  getSave = () => null,
  onStartCoopRun = null,
  onWaitPeerChange = null,
  onCoopLevelSync = null,
  onAiTakeover = null,
  onError = null,
} = {}) {
  let memPeerId = ensureTabPeerId(win);
  let tapPlayerId = '';
  let clockOffsetMs = 0;

  const nowMs = () => Date.now() + clockOffsetMs;

  function isTapMode() {
    return hasTapOnlineBattle(win);
  }

  function isBroadcastAvailable() {
    const BC = win?.BroadcastChannel || globalThis.BroadcastChannel;
    return typeof BC === 'function';
  }

  function isOnlineSupported() {
    return isTapMode() || isBroadcastAvailable();
  }

  function getPeerId() {
    if (tapPlayerId) return tapPlayerId;
    memPeerId = ensureTabPeerId(win) || memPeerId;
    return memPeerId;
  }

  const listeners = new Set();
  let lobbyChannel = null;
  let roomChannel = null;
  let tapTransport = null;
  let lockstep = null;
  let lastCompletedTurn = -1;
  let rtcPeer = null;
  let rtcDataChannel = null;
  let joinTimer = 0;
  let joinRetryTimer = 0;
  let quickTimer = 0;
  let quickBotFillTimer = 0;
  let botSeq = 1;

  const guestHeldKeys = new Set();

  const state = {
    role: 'idle',        // 'idle' | 'host' | 'guest'
    status: 'idle',      // 'idle' | 'joining' | 'lobby' | 'in_run' | 'not_found' | 'rejected' | 'unsupported'
    transport: 'idle',   // 'idle' | 'tap' | 'local' | 'none'
    roomCode: '',
    pendingRoomCode: '',
    hostPeerId: '',
    quickMatchOpen: false,
    waitingPeer: false,
    nightLevel: 0,
    mySlot: 0,
    party: [],
    statusText: '',
    lastError: '',
    webrtcConnected: false,
  };

  // 本地 BroadcastChannel 模式房主维护的各槽位远端输入缓存
  const remoteInputs = {};
  const remoteUltLatch = {};
  const remoteInteractLatch = {};
  const remoteLastSeen = {};

  function emitChange() {
    const snap = getState();
    for (const fn of [...listeners]) {
      try { fn(snap); } catch {}
    }
  }

  function notifyError(msg) {
    state.lastError = msg;
    state.statusText = msg;
    if (typeof onError === 'function') {
      try { onError(msg); } catch {}
    }
    emitChange();
  }

  function clearTimers() {
    if (joinTimer) { clearTimeout(joinTimer); joinTimer = 0; }
    if (joinRetryTimer) { clearTimeout(joinRetryTimer); joinRetryTimer = 0; }
    if (quickTimer) { clearTimeout(quickTimer); quickTimer = 0; }
    if (quickBotFillTimer) { clearTimeout(quickBotFillTimer); quickBotFillTimer = 0; }
  }

  function getActiveRun() {
    return win?.__wugeng?.game?.run || null;
  }

  function buildLocalProfile() {
    const save = getSave?.() || {};
    const heroId = HERO_IDS.includes(save.selectedHero) ? save.selectedHero : 'zhou';
    const startWeapon = getHeroStarterWeapon(save, heroId);
    const skinId = getEquippedHeroSkin(save, heroId);
    const attackVfx = getEquippedAttackVfx(save);
    const name = sanitizeDaoName(save.daoName || DEFAULT_DAO_NAME);
    const nightLevel = Number.isFinite(Number(save.selectedNight)) ? Math.max(0, Math.floor(Number(save.selectedNight))) : 0;
    return {
      peerId: getPeerId(),
      name,
      heroId,
      startWeapon,
      skinId,
      attackVfx,
      nightLevel,
    };
  }

  function sanitizeMemberProfile(raw, slot, isHost = false) {
    const heroId = HERO_IDS.includes(raw?.heroId) ? raw.heroId : 'zhou';
    const startWeapon = typeof raw?.startWeapon === 'string' && raw.startWeapon
      ? raw.startWeapon
      : HERO_START_WEAPON[heroId];
    return {
      slot,
      peerId: typeof raw?.peerId === 'string' && raw.peerId ? raw.peerId : `peer_${slot}`,
      name: sanitizeDaoName(raw?.name || (raw?.isBot ? `道友${slot + 1}` : DEFAULT_DAO_NAME)),
      heroId,
      startWeapon,
      skinId: typeof raw?.skinId === 'string' && raw.skinId ? raw.skinId : `${heroId}_default`,
      attackVfx: typeof raw?.attackVfx === 'string' && raw.attackVfx ? raw.attackVfx : 'default',
      isBot: Boolean(raw?.isBot),
      isHost: Boolean(isHost),
      ready: raw?.ready !== undefined ? Boolean(raw.ready) : true,
    };
  }

  function ensureTapTransport() {
    if (tapTransport) return tapTransport;
    if (!isTapMode()) return null;
    tapTransport = createTapBattleTransport({
      win,
      nowFn: nowMs,
      onMessage: (pkt) => handlePacket(pkt, 'tap'),
      onPlayerEnter: ({ playerId, properties }) => {
        if (state.role === 'host' && state.status === 'lobby') {
          handlePacket({
            type: 'join_req',
            roomCode: state.roomCode,
            peerId: playerId,
            senderId: playerId,
            profile: properties,
          }, 'tap');
        }
      },
      onPlayerLeave: ({ playerId }) => {
        handlePacket({
          type: 'peer_leave',
          roomCode: state.roomCode,
          peerId: playerId,
          senderId: playerId,
          explicitLeave: true,
        }, 'tap');
      },
      onPlayerOffline: ({ playerId }) => {
        // 掉线不主动销毁房间；锁步层等待 8s 未恢复则自动广播转交道友 AI
        if (state.role === 'host' && state.status === 'lobby') {
          handlePacket({
            type: 'peer_leave',
            roomCode: state.roomCode,
            peerId: playerId,
            senderId: playerId,
            explicitLeave: false,
          }, 'tap');
        }
      },
      onRoomProperties: ({ properties, ownerId }) => {
        if (ownerId) state.hostPeerId = ownerId;
        if (properties && Array.isArray(properties.party) && state.role === 'guest' && state.status === 'lobby') {
          handlePacket({
            type: 'room_state',
            roomCode: properties.roomCode || state.roomCode,
            hostPeerId: ownerId || state.hostPeerId,
            nightLevel: properties.nightLevel ?? state.nightLevel,
            status: 'lobby',
            party: properties.party,
          }, 'tap');
        }
      },
      onDisconnected: () => {
        if (state.status === 'lobby') {
          notifyError('多人联机服务连接已断开');
        }
      },
    });
    return tapTransport;
  }

  function ensureLobbyChannel() {
    if (lobbyChannel) return lobbyChannel;
    const BC = win?.BroadcastChannel || globalThis.BroadcastChannel;
    if (typeof BC !== 'function') return null;
    try {
      lobbyChannel = new BC(LOBBY_CHANNEL_NAME);
      lobbyChannel.onmessage = (ev) => handlePacket(ev?.data, 'lobby');
    } catch {
      lobbyChannel = null;
    }
    return lobbyChannel;
  }

  function openLocalRoomTransports(code) {
    closeLocalRoomTransports();
    ensureLobbyChannel();
    const BC = win?.BroadcastChannel || globalThis.BroadcastChannel;
    if (typeof BC === 'function') {
      try {
        roomChannel = new BC(ROOM_CHANNEL_PREFIX + code);
        roomChannel.onmessage = (ev) => handlePacket(ev?.data, 'room');
      } catch {
        roomChannel = null;
      }
    }
  }

  function closeLocalRoomTransports() {
    if (roomChannel) {
      try { roomChannel.close(); } catch {}
      roomChannel = null;
    }
  }

  function closeRtc() {
    if (rtcDataChannel) {
      try { rtcDataChannel.close(); } catch {}
      rtcDataChannel = null;
    }
    if (rtcPeer) {
      try { rtcPeer.close(); } catch {}
      rtcPeer = null;
    }
    state.webrtcConnected = false;
  }

  function postRoom(packet) {
    const msg = { ...packet, senderId: getPeerId() };
    if (state.transport === 'tap' && tapTransport) {
      tapTransport.sendMessage(msg);
      return;
    }
    if (roomChannel) {
      try { roomChannel.postMessage(msg); } catch {}
    }
    if (rtcDataChannel && rtcDataChannel.readyState === 'open') {
      try { rtcDataChannel.send(JSON.stringify(msg)); } catch {}
    }
  }

  function postLobby(packet) {
    const ch = ensureLobbyChannel();
    const msg = { ...packet, senderId: getPeerId() };
    if (ch) {
      try { ch.postMessage(msg); } catch {}
    }
  }

  function reindexParty() {
    state.party.forEach((m, idx) => {
      m.slot = idx;
      m.isHost = idx === 0;
    });
    const myId = getPeerId();
    const foundIdx = state.party.findIndex((m) => m.peerId === myId);
    state.mySlot = foundIdx >= 0 ? foundIdx : 0;
  }

  function broadcastRoomState() {
    if (state.role !== 'host' || !state.roomCode) return;
    reindexParty();
    const partySnap = state.party.map((m) => ({ ...m }));
    const pkt = {
      type: 'room_state',
      roomCode: state.roomCode,
      hostPeerId: getPeerId(),
      nightLevel: state.nightLevel,
      status: state.status,
      party: partySnap,
    };
    postRoom(pkt);
    if (state.transport === 'tap' && tapTransport) {
      tapTransport.updateRoomProperties({
        roomCode: state.roomCode,
        nightLevel: state.nightLevel,
        party: partySnap,
      }, state.roomCode);
    }
    emitChange();
  }

  let pendingJoinResolve = null;

  function settlePendingJoin(val) {
    if (pendingJoinResolve) {
      const fn = pendingJoinResolve;
      pendingJoinResolve = null;
      fn(val);
    }
  }

  function initLockstepForMatch(party, role, mySlot) {
    lastCompletedTurn = -1;
    state.waitingPeer = false;
    onWaitPeerChange?.(false, '');
    const hasRemoteHuman = party.some((m, idx) => idx !== mySlot && !m.isBot);
    if (state.transport !== 'tap' || !hasRemoteHuman) {
      lockstep = null;
      return null;
    }
    lockstep = createLockstepController({
      role,
      mySlot,
      party,
      nowFn: nowMs,
      sendPacket: (pkt) => postRoom(pkt),
      onWaitChange: (waiting) => {
        state.waitingPeer = waiting;
        onWaitPeerChange?.(waiting, waiting ? '等待道友信号……' : '');
        emitChange();
      },
      onAiTakeover: ({ slot }) => {
        if (state.party[slot]) state.party[slot].isBot = true;
        state.waitingPeer = false;
        onWaitPeerChange?.(false, '');
        onAiTakeover?.(slot);
        emitChange();
      },
    });
    return lockstep;
  }

  function handlePacket(raw, channelKind) {
    if (!raw || typeof raw !== 'object') return;
    const myId = getPeerId();
    if (raw.senderId && raw.senderId === myId) return;

    if (lockstep && typeof raw.type === 'string' && raw.type.startsWith('ls_') && raw.type !== 'ls_pick') {
      lockstep.handlePacket(raw, getActiveRun());
      return;
    }

    switch (raw.type) {
      case 'ls_pick': {
        const activeRun = getActiveRun();
        if (activeRun && activeRun.status === 'levelup' && Number.isInteger(raw.s)) {
          chooseCoopUpgrade(activeRun, raw.s, raw.idx);
          onCoopLevelSync?.(activeRun);
        }
        break;
      }

      case 'quick_seek': {
        if (
          state.role === 'host' &&
          state.status === 'lobby' &&
          state.roomCode &&
          state.party.length < MAX_COOP_PLAYERS
        ) {
          postLobby({
            type: 'quick_offer',
            targetPeerId: raw.senderId,
            roomCode: state.roomCode,
            hostPeerId: myId,
          });
        }
        break;
      }

      case 'quick_host_ready': {
        if (
          state.role === 'host' &&
          state.status === 'lobby' &&
          state.quickMatchOpen &&
          state.party.length === 1 &&
          raw.roomCode &&
          raw.senderId &&
          myId > raw.senderId
        ) {
          joinRoom(raw.roomCode);
        }
        break;
      }

      case 'quick_offer': {
        if (raw.targetPeerId && raw.targetPeerId !== myId) return;
        if (quickTimer && raw.roomCode) {
          clearTimeout(quickTimer);
          quickTimer = 0;
          joinRoom(raw.roomCode);
        }
        break;
      }

      case 'join_req': {
        if (state.role !== 'host' || !state.roomCode) return;
        if (raw.roomCode && raw.roomCode.toUpperCase() !== state.roomCode.toUpperCase()) return;
        const joinerId = raw.peerId || raw.senderId;
        if (!joinerId) return;

        const existingIdx = state.party.findIndex((m) => m.peerId === joinerId);
        if (existingIdx >= 0) {
          state.party[existingIdx] = sanitizeMemberProfile(
            { ...state.party[existingIdx], ...raw.profile, peerId: joinerId, isBot: false },
            existingIdx,
            existingIdx === 0,
          );
          remoteLastSeen[existingIdx] = nowMs();
          broadcastRoomState();
          return;
        }

        if (state.party.length >= MAX_COOP_PLAYERS) {
          const rejectMsg = `守夜房间人数已满（上限 ${MAX_COOP_PLAYERS} 人），无法加入`;
          const pkt = {
            type: 'join_reject',
            roomCode: state.roomCode,
            targetPeerId: joinerId,
            reason: 'full',
            message: rejectMsg,
          };
          postRoom(pkt);
          if (channelKind === 'lobby') postLobby(pkt);
          return;
        }

        if (state.status !== 'lobby') {
          const pkt = {
            type: 'join_reject',
            roomCode: state.roomCode,
            targetPeerId: joinerId,
            reason: 'started',
            message: '该守夜房间已起更出战，无法中途加入',
          };
          postRoom(pkt);
          if (channelKind === 'lobby') postLobby(pkt);
          return;
        }

        const firstBotIdx = state.party.findIndex((m) => m.isBot);
        const insertIdx = firstBotIdx > 0 ? firstBotIdx : state.party.length;
        const guestMember = sanitizeMemberProfile(
          { ...raw.profile, peerId: joinerId, isBot: false, ready: true },
          insertIdx,
          false,
        );
        state.party.splice(insertIdx, 0, guestMember);

        const humanHeroes = new Set(state.party.filter((m) => !m.isBot).map((m) => m.heroId));
        const usedAll = new Set(humanHeroes);
        for (let i = 1; i < state.party.length; i++) {
          const m = state.party[i];
          if (!m.isBot) continue;
          if (usedAll.has(m.heroId)) {
            const alt = DAOIST_BOT_PROFILES.find((b) => !usedAll.has(b.heroId));
            if (alt) {
              m.heroId = alt.heroId;
              m.name = alt.name;
              m.startWeapon = HERO_START_WEAPON[alt.heroId];
              m.skinId = alt.skinId;
              m.attackVfx = alt.attackVfx;
            }
          }
          usedAll.add(m.heroId);
        }

        const joinStamp = nowMs();
        for (let i = 1; i < state.party.length; i++) {
          if (!state.party[i].isBot) remoteLastSeen[i] = joinStamp;
          else delete remoteLastSeen[i];
        }
        if (state.party.filter((m) => !m.isBot).length >= MAX_COOP_PLAYERS && quickBotFillTimer) {
          clearTimeout(quickBotFillTimer);
          quickBotFillTimer = 0;
        }
        state.statusText = `${sanitizeDaoName(raw.profile?.name || '同行道友')} 已入房结伴（${state.party.length}/${MAX_COOP_PLAYERS}）`;
        broadcastRoomState();
        break;
      }

      case 'join_reject': {
        if (raw.targetPeerId && raw.targetPeerId !== myId) return;
        if (state.role !== 'guest') return;
        clearTimers();
        state.status = 'rejected';
        state.party = [];
        const msg = typeof raw.message === 'string' && raw.message
          ? raw.message
          : '房间人数已满或无法加入';
        closeLocalRoomTransports();
        tapTransport?.leaveRoom?.();
        notifyError(msg);
        settlePendingJoin({ ok: false, reason: raw.reason || 'rejected', message: msg });
        break;
      }

      case 'room_state': {
        if (state.role !== 'guest') return;
        const targetCode = state.roomCode || state.pendingRoomCode;
        if (targetCode && raw.roomCode && raw.roomCode.toUpperCase() !== targetCode.toUpperCase()) return;
        clearTimers();
        state.roomCode = sanitizeRoomCode(raw.roomCode) || targetCode;
        state.pendingRoomCode = '';
        state.hostPeerId = raw.hostPeerId || raw.senderId || '';
        state.nightLevel = Number.isFinite(Number(raw.nightLevel)) ? Number(raw.nightLevel) : 0;
        state.party = Array.isArray(raw.party)
          ? raw.party.slice(0, MAX_COOP_PLAYERS).map((m, idx) => sanitizeMemberProfile(m, idx, idx === 0))
          : [];
        reindexParty();
        if (state.status !== 'in_run') {
          state.status = 'lobby';
        }
        state.lastError = '';
        state.statusText = `已连入守夜房 ${state.roomCode}（${state.party.length}/${MAX_COOP_PLAYERS} 人就绪）`;
        emitChange();
        settlePendingJoin({ ok: true, roomCode: state.roomCode, party: getParty() });
        break;
      }

      case 'member_update': {
        if (state.role !== 'host') return;
        const pid = raw.peerId || raw.senderId;
        const idx = state.party.findIndex((m) => m.peerId === pid);
        if (idx > 0) {
          state.party[idx] = sanitizeMemberProfile(
            { ...state.party[idx], ...raw.profile, peerId: pid, ready: raw.ready ?? state.party[idx].ready },
            idx,
            false,
          );
          remoteLastSeen[idx] = nowMs();
          broadcastRoomState();
        }
        break;
      }

      case 'peer_leave': {
        const pid = raw.peerId || raw.senderId;
        if (state.role === 'host') {
          const idx = state.party.findIndex((m) => m.peerId === pid);
          if (idx > 0) {
            if (state.status === 'lobby') {
              state.party.splice(idx, 1);
              broadcastRoomState();
            } else if (state.status === 'in_run') {
              const activeRun = getActiveRun();
              if (lockstep) {
                lockstep.notifyPeerDisconnected(idx, activeRun);
              } else {
                state.party[idx].isBot = true;
                delete remoteInputs[idx];
                if (activeRun?.players?.[idx]) {
                  activeRun.players[idx].isBot = true;
                }
              }
              if (activeRun?.status === 'levelup') {
                chooseCoopUpgrade(activeRun, idx, 0);
                onCoopLevelSync?.(activeRun);
              }
            }
          }
        } else if (state.role === 'guest' && pid === state.hostPeerId && state.status === 'lobby') {
          clearTimers();
          closeLocalRoomTransports();
          tapTransport?.leaveRoom?.();
          state.role = 'idle';
          state.status = 'idle';
          state.roomCode = '';
          state.party = [];
          notifyError('房主已解散守夜房间');
        }
        break;
      }

      case 'run_start': {
        if (state.role !== 'guest') return;
        if (state.roomCode && raw.roomCode && raw.roomCode.toUpperCase() !== state.roomCode.toUpperCase()) return;
        clearTimers();
        const party = Array.isArray(raw.party)
          ? raw.party.slice(0, MAX_COOP_PLAYERS).map((m, idx) => sanitizeMemberProfile(m, idx, idx === 0))
          : state.party;
        state.party = party;
        reindexParty();
        state.status = 'in_run';
        state.nightLevel = Number.isFinite(Number(raw.nightLevel)) ? Number(raw.nightLevel) : 0;
        const ls = raw.lockstep ? initLockstepForMatch(party, 'guest', state.mySlot) : null;
        emitChange();
        if (typeof onStartCoopRun === 'function') {
          onStartCoopRun({
            roomCode: state.roomCode,
            seed: raw.seed,
            nightLevel: state.nightLevel,
            party: party.map((m) => ({ ...m })),
            role: 'guest',
            mySlot: state.mySlot,
            lockstep: Boolean(ls),
          });
        }
        break;
      }

      case 'guest_input': {
        if (state.role !== 'host' || state.status !== 'in_run' || lockstep) return;
        const pid = raw.peerId || raw.senderId;
        let slot = Number.isInteger(raw.slot) ? raw.slot : -1;
        const byPeer = state.party.findIndex((m) => m.peerId === pid);
        if (byPeer > 0) slot = byPeer;
        if (slot <= 0 || slot >= MAX_COOP_PLAYERS) return;
        const inp = raw.input && typeof raw.input === 'object' ? raw.input : {};
        remoteInputs[slot] = {
          moveX: Number.isFinite(+inp.moveX) ? Math.max(-1, Math.min(1, +inp.moveX)) : 0,
          moveY: Number.isFinite(+inp.moveY) ? Math.max(-1, Math.min(1, +inp.moveY)) : 0,
          ultimate: Boolean(inp.ultimate || inp.ult),
          interact: Boolean(inp.interact),
        };
        if (remoteInputs[slot].ultimate) remoteUltLatch[slot] = true;
        if (remoteInputs[slot].interact) remoteInteractLatch[slot] = true;
        remoteLastSeen[slot] = nowMs();
        break;
      }

      case 'state_snap': {
        if (state.role !== 'guest' || state.status !== 'in_run' || lockstep) return;
        const activeRun = getActiveRun();
        if (activeRun) {
          applyHostSnapshot(activeRun, raw);
        }
        break;
      }

      default:
        break;
    }
  }

  function partyFromTapRoom(room, localId, localProf) {
    const out = [];
    const sorted = [...(room.players || [])].sort((a, b) => {
      if (a.id === room.ownerId) return -1;
      if (b.id === room.ownerId) return 1;
      return 0;
    });
    for (let i = 0; i < sorted.length && out.length < MAX_COOP_PLAYERS; i++) {
      const tp = sorted[i];
      const baseProps = tp.id === localId ? { ...tp.properties, ...localProf } : tp.properties;
      out.push(sanitizeMemberProfile(
        { ...baseProps, peerId: tp.id, isBot: false, ready: true },
        out.length,
        tp.id === room.ownerId || out.length === 0,
      ));
    }
    if (out.length === 0) {
      out.push(sanitizeMemberProfile({ ...localProf, peerId: localId, isBot: false, ready: true }, 0, true));
    }
    return out;
  }

  function scheduleQuickMatchBotFill(fillMs = QUICK_MATCH_BOT_FILL_MS) {
    if (quickBotFillTimer) clearTimeout(quickBotFillTimer);
    quickBotFillTimer = setTimeout(() => {
      quickBotFillTimer = 0;
      if (state.role === 'host' && state.status === 'lobby' && state.quickMatchOpen && state.party.length < MAX_COOP_PLAYERS) {
        fillWithDaoistBots(MAX_COOP_PLAYERS);
        state.statusText = `已自动召齐智能道友补位（${state.party.length}/${MAX_COOP_PLAYERS}），可即刻敲锣起更`;
        emitChange();
      }
    }, Math.max(50, fillMs));
  }

  function createRoom(opts = {}) {
    leave({ silent: true });
    const code = sanitizeRoomCode(opts.roomCode) || randomRoomCode();
    const prof = buildLocalProfile();
    state.role = 'host';
    state.status = 'lobby';
    state.roomCode = code;
    state.pendingRoomCode = '';
    state.hostPeerId = prof.peerId;
    state.quickMatchOpen = Boolean(opts.quickMatchOpen);
    state.nightLevel = prof.nightLevel;
    state.mySlot = 0;
    state.lastError = '';
    state.party = [sanitizeMemberProfile({ ...prof, isBot: false, ready: true }, 0, true)];

    if (isTapMode()) {
      state.transport = 'tap';
      state.statusText = `正在开启守夜房 ${code}……`;
      const tr = ensureTapTransport();
      const readyPromise = tr.createRoom({
        roomCode: code,
        maxPlayerCount: MAX_COOP_PLAYERS,
        roomProps: { roomCode: code, nightLevel: state.nightLevel },
        playerProps: prof,
      }).then((res) => {
        if (!res.ok || state.role !== 'host' || state.status !== 'lobby') {
          if (!res.ok && state.status === 'lobby') {
            notifyError('连接多人联机服务失败，请稍后再试');
          }
          return { ok: Boolean(res.ok), roomCode: state.roomCode, party: getParty() };
        }
        tapPlayerId = res.playerId;
        state.hostPeerId = res.playerId;
        state.roomCode = res.room.roomCode || code;
        if (state.party[0]) state.party[0].peerId = res.playerId;
        reindexParty();
        state.statusText = `守夜房 ${state.roomCode} 已连通云端，可邀好友或召唤道友同守`;
        broadcastRoomState();
        return { ok: true, roomCode: state.roomCode, party: getParty() };
      });
      emitChange();
      return { ok: true, roomCode: code, party: getParty(), ready: readyPromise };
    }

    if (!isBroadcastAvailable()) {
      state.transport = 'none';
      state.statusText = '当前环境暂不支持联机，可添加人机队友同守';
      emitChange();
      return { ok: true, offlineOnly: true, roomCode: code, party: getParty(), ready: Promise.resolve({ ok: true }) };
    }

    state.transport = 'local';
    state.statusText = `守夜房 ${code} 已开启，可邀好友或召唤道友同守`;
    openLocalRoomTransports(code);
    if (state.quickMatchOpen) {
      postLobby({ type: 'quick_host_ready', roomCode: code, hostPeerId: prof.peerId });
    }
    emitChange();
    return { ok: true, roomCode: code, party: getParty(), ready: Promise.resolve({ ok: true, roomCode: code }) };
  }

  function joinRoom(rawCode) {
    const code = sanitizeRoomCode(rawCode);
    if (!code) {
      const msg = '房号无效，请输入 6 位字母数字守夜房号';
      notifyError(msg);
      return Promise.resolve({ ok: false, reason: 'invalid_code', message: msg });
    }
    if (state.role === 'host' && state.roomCode === code && state.status === 'lobby') {
      return Promise.resolve({ ok: true, roomCode: code, party: getParty() });
    }

    leave({ silent: true });
    if (isTapMode()) {
      state.transport = 'tap';
      state.role = 'guest';
      state.status = 'joining';
      state.roomCode = '';
      state.pendingRoomCode = code;
      state.party = [];
      state.mySlot = 1;
      state.lastError = '';
      state.statusText = `正在寻访守夜房号 ${code}……`;
      emitChange();

      const tr = ensureTapTransport();
      const prof = buildLocalProfile();
      return tr.joinRoomByCode({ roomCode: code, playerProps: prof }).then((res) => {
        if (!res.ok) {
          state.status = res.reason === 'full' ? 'rejected' : 'not_found';
          const msg = res.reason === 'full'
            ? `守夜房间人数已满（上限 ${MAX_COOP_PLAYERS} 人），无法加入`
            : `未找到房号 ${code}（该守夜房间不存在、未开启或已过期）`;
          notifyError(msg);
          return { ok: false, reason: res.reason || 'not_found', roomCode: code, message: msg };
        }
        tapPlayerId = res.playerId;
        const finalProf = { ...prof, peerId: res.playerId };
        state.roomCode = res.room.roomCode || code;
        state.pendingRoomCode = '';
        state.hostPeerId = res.room.ownerId || '';
        state.role = res.room.ownerId === res.playerId ? 'host' : 'guest';
        state.status = 'lobby';
        state.party = partyFromTapRoom(res.room, res.playerId, finalProf);
        reindexParty();
        state.statusText = `已连入守夜房 ${state.roomCode}（${state.party.length}/${MAX_COOP_PLAYERS} 人就绪）`;
        if (state.role === 'guest') {
          postRoom({
            type: 'join_req',
            roomCode: state.roomCode,
            peerId: res.playerId,
            profile: finalProf,
          });
        }
        emitChange();
        return { ok: true, roomCode: state.roomCode, party: getParty() };
      });
    }

    if (!isBroadcastAvailable()) {
      state.transport = 'none';
      state.status = 'unsupported';
      const msg = '当前环境暂不支持联机';
      notifyError(msg);
      return Promise.resolve({ ok: false, reason: 'unsupported', message: msg });
    }

    const prof = buildLocalProfile();
    state.transport = 'local';
    state.role = 'guest';
    state.status = 'joining';
    state.roomCode = '';
    state.pendingRoomCode = code;
    state.party = [];
    state.mySlot = 1;
    state.lastError = '';
    state.statusText = `正在寻访守夜房号 ${code}……`;

    openLocalRoomTransports(code);
    emitChange();

    const sendReq = () => {
      const req = {
        type: 'join_req',
        roomCode: code,
        peerId: prof.peerId,
        profile: prof,
      };
      postRoom(req);
      postLobby(req);
    };

    return new Promise((resolve) => {
      pendingJoinResolve = resolve;
      sendReq();
      joinRetryTimer = setTimeout(() => {
        if (state.status === 'joining') sendReq();
      }, 65);
      joinTimer = setTimeout(() => {
        if (state.status === 'joining') {
          state.status = 'not_found';
          state.party = [];
          const msg = `未找到房号 ${code}（该守夜房间不存在、未开启或已过期）`;
          closeLocalRoomTransports();
          notifyError(msg);
          settlePendingJoin({ ok: false, reason: 'not_found', roomCode: code, message: msg });
        }
      }, 185);
    });
  }

  function quickMatch(opts = {}) {
    leave({ silent: true });
    if (isTapMode()) {
      state.transport = 'tap';
      state.status = 'joining';
      state.statusText = '正在匹配同行守夜道友……';
      emitChange();

      const tr = ensureTapTransport();
      const prof = buildLocalProfile();
      return tr.matchRoom({
        maxPlayerCount: MAX_COOP_PLAYERS,
        playerProps: prof,
        roomProps: { nightLevel: prof.nightLevel },
      }).then((res) => {
        if (!res.ok) {
          const msg = '快速匹配暂忙，请稍后重试或创建房间';
          notifyError(msg);
          return { ok: false, reason: res.reason || 'match_failed', message: msg };
        }
        tapPlayerId = res.playerId;
        const finalProf = { ...prof, peerId: res.playerId };
        const isOwner = !res.room.ownerId || res.room.ownerId === res.playerId;
        state.role = isOwner ? 'host' : 'guest';
        state.status = 'lobby';
        state.roomCode = res.room.roomCode;
        state.pendingRoomCode = '';
        state.hostPeerId = res.room.ownerId || res.playerId;
        state.quickMatchOpen = isOwner;
        state.nightLevel = prof.nightLevel;
        state.party = partyFromTapRoom(res.room, res.playerId, finalProf);
        reindexParty();

        if (isOwner) {
          state.statusText = `已开启匹配房 ${state.roomCode}（${state.party.length}/${MAX_COOP_PLAYERS}），20 秒未满自动补齐道友`;
          broadcastRoomState();
          if (state.party.length < MAX_COOP_PLAYERS) {
            scheduleQuickMatchBotFill(opts.autoFillMs ?? QUICK_MATCH_BOT_FILL_MS);
          }
        } else {
          state.statusText = `已匹配进入守夜房 ${state.roomCode}（${state.party.length}/${MAX_COOP_PLAYERS} 人就绪）`;
          postRoom({
            type: 'join_req',
            roomCode: state.roomCode,
            peerId: res.playerId,
            profile: finalProf,
          });
        }
        emitChange();
        return { ok: true, roomCode: state.roomCode, party: getParty() };
      });
    }

    if (!isBroadcastAvailable()) {
      state.transport = 'none';
      state.status = 'unsupported';
      const msg = '当前环境暂不支持联机';
      notifyError(msg);
      return Promise.resolve({ ok: false, reason: 'unsupported', message: msg });
    }

    state.transport = 'local';
    ensureLobbyChannel();
    state.status = 'joining';
    state.statusText = '正在寻访同行守夜道友……';
    emitChange();

    return new Promise((resolve) => {
      postLobby({
        type: 'quick_seek',
        peerId: getPeerId(),
        profile: buildLocalProfile(),
      });
      quickTimer = setTimeout(() => {
        quickTimer = 0;
        if (state.status === 'joining' && !state.roomCode) {
          const created = createRoom({ quickMatchOpen: true });
          state.statusText = `已开启快速匹配守夜房 ${created.roomCode}，静候道友或点添加道友即刻起更`;
          if (opts.autoFillMs !== undefined) {
            scheduleQuickMatchBotFill(opts.autoFillMs);
          }
          emitChange();
          resolve(created);
        } else {
          resolve({ ok: true, roomCode: state.roomCode, party: getParty() });
        }
      }, 55);
    });
  }

  function addBot() {
    if (state.role === 'guest') {
      return { ok: false, reason: 'not_host', message: '仅房主可召唤智能道友补位' };
    }
    if (state.status !== 'lobby' || !state.roomCode) {
      createRoom();
    }
    if (state.party.length >= MAX_COOP_PLAYERS) {
      const msg = `房间人数已达 ${MAX_COOP_PLAYERS} 人上限`;
      state.statusText = msg;
      emitChange();
      return { ok: false, reason: 'full', message: msg };
    }

    const usedHeroes = new Set(state.party.map((m) => m.heroId));
    const pick = DAOIST_BOT_PROFILES.find((b) => !usedHeroes.has(b.heroId))
      || DAOIST_BOT_PROFILES[(state.party.length + botSeq) % DAOIST_BOT_PROFILES.length];
    const slot = state.party.length;
    const botMember = sanitizeMemberProfile({
      peerId: `daoist_bot_${botSeq++}`,
      name: pick.name,
      heroId: pick.heroId,
      startWeapon: HERO_START_WEAPON[pick.heroId],
      skinId: pick.skinId,
      attackVfx: pick.attackVfx,
      isBot: true,
      ready: true,
    }, slot, false);

    state.party.push(botMember);
    state.statusText = `${botMember.name} 已应召入阵（${state.party.length}/${MAX_COOP_PLAYERS}）`;
    broadcastRoomState();
    return { ok: true, bot: botMember, party: getParty() };
  }

  function fillWithDaoistBots(targetSize = MAX_COOP_PLAYERS) {
    const cap = Math.max(2, Math.min(MAX_COOP_PLAYERS, Math.floor(Number(targetSize) || 2)));
    if (state.status !== 'lobby' || !state.roomCode) createRoom();
    while (state.party.length < cap) {
      const r = addBot();
      if (!r.ok) break;
    }
    return getParty();
  }

  function toggleReady(forceReady = undefined) {
    const myId = getPeerId();
    const idx = state.party.findIndex((m) => m.peerId === myId);
    if (idx < 0) return false;
    const nextReady = forceReady !== undefined ? Boolean(forceReady) : !state.party[idx].ready;
    state.party[idx].ready = nextReady;
    if (state.role === 'host') {
      broadcastRoomState();
    } else if (state.role === 'guest') {
      postRoom({
        type: 'member_update',
        roomCode: state.roomCode,
        peerId: myId,
        ready: nextReady,
        profile: buildLocalProfile(),
      });
      emitChange();
    }
    return nextReady;
  }

  function syncLocalProfile() {
    if (state.status !== 'lobby') return;
    const prof = buildLocalProfile();
    const idx = state.party.findIndex((m) => m.peerId === prof.peerId);
    if (idx >= 0) {
      state.party[idx] = sanitizeMemberProfile(
        { ...state.party[idx], ...prof, isBot: false },
        idx,
        idx === 0,
      );
      if (state.role === 'host') {
        state.nightLevel = prof.nightLevel;
        broadcastRoomState();
      } else if (state.role === 'guest') {
        postRoom({
          type: 'member_update',
          roomCode: state.roomCode,
          peerId: prof.peerId,
          ready: state.party[idx].ready,
          profile: prof,
        });
        emitChange();
      }
    }
  }

  function startMatch(opts = {}) {
    if (state.role === 'guest') {
      return { ok: false, reason: 'not_host', message: '请等待房主敲锣起更' };
    }
    if (state.status !== 'lobby' || !state.roomCode) {
      createRoom();
    }
    clearTimers();
    syncLocalProfile();
    if (state.party.length < 2) {
      addBot();
    }
    reindexParty();
    for (const k of Object.keys(remoteInputs)) delete remoteInputs[k];
    for (const k of Object.keys(remoteUltLatch)) delete remoteUltLatch[k];
    for (const k of Object.keys(remoteInteractLatch)) delete remoteInteractLatch[k];

    const seed = opts.seed ?? ((nowMs() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    const nightLevel = opts.nightLevel ?? state.nightLevel ?? 0;
    const partyCopy = state.party.slice(0, MAX_COOP_PLAYERS).map((m, idx) => sanitizeMemberProfile(m, idx, idx === 0));
    state.party = partyCopy;
    state.status = 'in_run';
    const ts = nowMs();
    for (let i = 1; i < partyCopy.length; i++) {
      if (!partyCopy[i].isBot) remoteLastSeen[i] = ts;
    }

    const ls = initLockstepForMatch(partyCopy, 'host', 0);

    postRoom({
      type: 'run_start',
      roomCode: state.roomCode,
      seed,
      nightLevel,
      party: partyCopy,
      lockstep: Boolean(ls),
    });
    emitChange();

    if (typeof onStartCoopRun === 'function') {
      onStartCoopRun({
        roomCode: state.roomCode,
        seed,
        nightLevel,
        party: partyCopy,
        role: 'host',
        mySlot: 0,
        lockstep: Boolean(ls),
      });
    }
    return { ok: true, roomCode: state.roomCode, seed, party: partyCopy, lockstep: Boolean(ls) };
  }

  function submitLevelChoice(slot, choiceIndex) {
    const activeRun = getActiveRun();
    if (!activeRun || activeRun.status !== 'levelup') {
      return { ok: false, committed: false };
    }
    postRoom({
      type: 'ls_pick',
      seq: activeRun._coopLevelSeq || 0,
      s: slot,
      idx: choiceIndex,
    });
    const res = chooseCoopUpgrade(activeRun, slot, choiceIndex);
    onCoopLevelSync?.(activeRun);
    return res;
  }

  // ───────── 兼容编程接口：无后端 WebRTC P2P 信令辅助（保留供 F14 测试契约调用）─────────
  function attachDataChannel(dc) {
    rtcDataChannel = dc;
    dc.onopen = () => {
      state.webrtcConnected = true;
      if (state.role === 'guest' && state.roomCode) {
        postRoom({
          type: 'join_req',
          roomCode: state.roomCode,
          peerId: getPeerId(),
          profile: buildLocalProfile(),
        });
      } else if (state.role === 'host') {
        broadcastRoomState();
      }
      emitChange();
    };
    dc.onclose = () => {
      state.webrtcConnected = false;
      emitChange();
    };
    dc.onmessage = (ev) => {
      try {
        const pkt = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
        if (pkt) handlePacket(pkt, 'webrtc');
      } catch {}
    };
  }

  function waitIceGathering(pc, timeoutMs = 150) {
    if (!pc || pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) finish();
      };
    });
  }

  async function createWebRtcOffer() {
    const RTCPC = win?.RTCPeerConnection || globalThis.RTCPeerConnection;
    if (typeof RTCPC !== 'function') {
      return { ok: false, reason: 'unsupported', code: '' };
    }
    if (state.status !== 'lobby' || !state.roomCode || state.role !== 'host') {
      createRoom();
    }
    closeRtc();
    try {
      const pc = new RTCPC({ iceServers: [] });
      rtcPeer = pc;
      const dc = pc.createDataChannel('wugeng-coop-v3', { ordered: false });
      attachDataChannel(dc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceGathering(pc, 150);
      const localDesc = pc.localDescription || offer;
      const code = 'WG3O:' + encodeBase64Json({
        v: 3,
        t: 'offer',
        r: state.roomCode,
        p: getPeerId(),
        sdp: localDesc.sdp,
      });
      emitChange();
      return code;
    } catch {
      closeRtc();
      return { ok: false, reason: 'webrtc_error', code: '' };
    }
  }

  async function acceptWebRtcOffer(offerCode) {
    if (typeof offerCode !== 'string' || !offerCode.trim().startsWith('WG3O:')) {
      const msg = '邀请口令格式无效，请确认完整复制后再试';
      notifyError(msg);
      return { ok: false, reason: 'invalid_sdp', message: msg };
    }
    const payload = decodeBase64Json(offerCode.trim().slice(5));
    if (!payload || payload.t !== 'offer' || typeof payload.sdp !== 'string' || !payload.sdp.includes('v=0')) {
      const msg = '邀请口令已损坏或无效';
      notifyError(msg);
      return { ok: false, reason: 'invalid_sdp', message: msg };
    }
    const RTCPC = win?.RTCPeerConnection || globalThis.RTCPeerConnection;
    if (typeof RTCPC !== 'function') {
      return { ok: false, reason: 'unsupported', message: '当前环境暂不支持联机' };
    }

    const roomCode = sanitizeRoomCode(payload.r) || randomRoomCode();
    leave({ silent: true });
    closeRtc();
    try {
      const pc = new RTCPC({ iceServers: [] });
      rtcPeer = pc;
      pc.ondatachannel = (ev) => {
        if (ev?.channel) attachDataChannel(ev.channel);
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIceGathering(pc, 150);

      state.transport = 'local';
      state.role = 'guest';
      state.status = 'lobby';
      state.roomCode = roomCode;
      state.hostPeerId = payload.p || '';
      state.party = [
        sanitizeMemberProfile({ peerId: payload.p || 'host', name: '守夜房主', heroId: 'zhou', ready: true }, 0, true),
        sanitizeMemberProfile({ ...buildLocalProfile(), ready: true }, 1, false),
      ];
      reindexParty();
      openLocalRoomTransports(roomCode);

      const localDesc = pc.localDescription || answer;
      const ansCode = 'WG3A:' + encodeBase64Json({
        v: 3,
        t: 'answer',
        r: roomCode,
        p: getPeerId(),
        sdp: localDesc.sdp,
      });
      emitChange();
      return ansCode;
    } catch {
      closeRtc();
      const msg = '解析口令失败，请重新生成';
      notifyError(msg);
      return { ok: false, reason: 'invalid_sdp', message: msg };
    }
  }

  async function acceptWebRtcAnswer(answerCode) {
    if (typeof answerCode !== 'string' || !answerCode.trim().startsWith('WG3A:')) {
      return { ok: false, reason: 'invalid_sdp', message: '应答口令格式无效' };
    }
    const payload = decodeBase64Json(answerCode.trim().slice(5));
    if (!payload || payload.t !== 'answer' || typeof payload.sdp !== 'string' || !payload.sdp.includes('v=0') || !rtcPeer) {
      return { ok: false, reason: 'invalid_sdp', message: '应答口令无效或当前无待配对房间' };
    }
    try {
      await rtcPeer.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      emitChange();
      return { ok: true, roomCode: state.roomCode };
    } catch {
      return { ok: false, reason: 'invalid_sdp', message: '应答口令握手失败' };
    }
  }

  // ───────── 局内同步钩子（锁步模式 vs 本地 BroadcastChannel 模式）─────────
  function sendLocalInput(inp) {
    if (state.role !== 'guest' || state.status !== 'in_run' || lockstep) return;
    postRoom({
      type: 'guest_input',
      roomCode: state.roomCode,
      peerId: getPeerId(),
      slot: state.mySlot,
      input: {
        moveX: Number.isFinite(+inp?.moveX) ? +inp.moveX : 0,
        moveY: Number.isFinite(+inp?.moveY) ? +inp.moveY : 0,
        ultimate: Boolean(inp?.ultimate || inp?.ult),
        interact: Boolean(inp?.interact),
      },
    });
  }

  function buildStepInputs(localInput, run) {
    if (state.status !== 'in_run' || !run || !Array.isArray(run.players) || run.players.length <= 1) {
      return localInput;
    }

    // 1. TapTap 确定性锁步模式
    if (lockstep) {
      const res = lockstep.pollStep(localInput, run);
      if (!res.ready) {
        return { holdStep: true };
      }
      lastCompletedTurn = res.completedTurn;
      return res.stepInput;
    }

    // 2. 本地 BroadcastChannel 低延迟直通模式
    if (state.role === 'guest') {
      sendLocalInput(localInput);
      const slots = {};
      for (let i = 0; i < run.players.length; i++) {
        if (i === state.mySlot) {
          slots[i] = localInput;
        } else if (!run.players[i]?.isBot) {
          slots[i] = { moveX: 0, moveY: 0, ultimate: false, interact: false };
        }
      }
      return { slots };
    }

    const ts = nowMs();
    const slots = { 0: localInput };
    for (let i = 1; i < run.players.length; i++) {
      const pl = run.players[i];
      if (!pl || pl.isBot) continue;
      if (remoteLastSeen[i] && ts - remoteLastSeen[i] > 6000) {
        pl.isBot = true;
        continue;
      }
      const rInp = remoteInputs[i] || { moveX: 0, moveY: 0, ultimate: false, interact: false };
      const ult = Boolean(rInp.ultimate || remoteUltLatch[i]);
      const inter = Boolean(rInp.interact || remoteInteractLatch[i]);
      remoteUltLatch[i] = false;
      remoteInteractLatch[i] = false;
      rInp.ultimate = false;
      rInp.interact = false;
      slots[i] = {
        moveX: rInp.moveX,
        moveY: rInp.moveY,
        ultimate: ult,
        interact: inter,
      };
    }
    return { slots };
  }

  function onStepCommitted(run) {
    if (lockstep && lastCompletedTurn >= 0) {
      const doneTurn = lastCompletedTurn;
      lastCompletedTurn = -1;
      lockstep.afterStep(run, doneTurn);
    }
  }

  function broadcastRunSnapshot(run) {
    if (lockstep) return; // 锁步模式下不广播逐帧全量快照，仅发 10Hz 输入包与 0.5Hz 状态哈希
    if (state.role !== 'host' || state.status !== 'in_run' || !run || !Array.isArray(run.players)) return;
    postRoom({
      type: 'state_snap',
      roomCode: state.roomCode,
      time: run.time,
      watch: run.watch,
      mode: run.mode,
      status: run.status,
      darkness: run.darkness,
      stats: {
        kills: run.stats?.kills || 0,
        coins: run.stats?.coins || 0,
        coopRevives: run.stats?.coopRevives || 0,
      },
      players: run.players.map((p, idx) => ({
        slot: p.slot ?? idx,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        facingX: p.facingX,
        facingY: p.facingY,
        moving: Boolean(p.moving),
        hp: p.hp,
        maxHp: p.maxHp,
        invulnT: p.invulnT || 0,
        hurtT: p.hurtT || 0,
        downed: Boolean(p.downed),
        downedTimer: p.downedTimer || 0,
        reviveProgress: p.reviveProgress || 0,
        level: p.level || 1,
        xp: p.xp || 0,
        xpNext: p.xpNext || 10,
        ult: p.ult || 0,
        stats: {
          damageDealt: p.stats?.damageDealt || 0,
          kills: p.stats?.kills || 0,
          revivesDone: p.stats?.revivesDone || 0,
        },
      })),
    });
  }

  function applyHostSnapshot(run, snap) {
    if (!run || !snap || !Array.isArray(snap.players) || !Array.isArray(run.players)) return;
    if (Number.isFinite(snap.time)) run.time = snap.time;
    if (Number.isFinite(snap.watch)) run.watch = snap.watch;
    if (snap.mode === 'main' || snap.mode === 'endless') run.mode = snap.mode;
    if (Number.isFinite(snap.darkness)) run.darkness = snap.darkness;
    if (snap.stats && run.stats) {
      if (Number.isFinite(snap.stats.kills)) run.stats.kills = snap.stats.kills;
      if (Number.isFinite(snap.stats.coins)) run.stats.coins = snap.stats.coins;
      if (Number.isFinite(snap.stats.coopRevives)) run.stats.coopRevives = snap.stats.coopRevives;
    }
    for (const sp of snap.players) {
      const target = run.players[sp.slot];
      if (!target) continue;
      if (Number.isFinite(sp.x)) target.x = sp.x;
      if (Number.isFinite(sp.y)) target.y = sp.y;
      if (Number.isFinite(sp.vx)) target.vx = sp.vx;
      if (Number.isFinite(sp.vy)) target.vy = sp.vy;
      if (Number.isFinite(sp.facingX)) target.facingX = sp.facingX;
      if (Number.isFinite(sp.facingY)) target.facingY = sp.facingY;
      target.moving = Boolean(sp.moving);
      if (Number.isFinite(sp.maxHp) && sp.maxHp > 0) target.maxHp = sp.maxHp;
      if (Number.isFinite(sp.hp)) target.hp = sp.hp;
      if (Number.isFinite(sp.invulnT)) target.invulnT = sp.invulnT;
      if (Number.isFinite(sp.hurtT)) target.hurtT = sp.hurtT;
      target.downed = Boolean(sp.downed);
      if (Number.isFinite(sp.downedTimer)) target.downedTimer = sp.downedTimer;
      if (Number.isFinite(sp.reviveProgress)) target.reviveProgress = sp.reviveProgress;
      if (Number.isFinite(sp.level)) target.level = sp.level;
      if (Number.isFinite(sp.xp)) target.xp = sp.xp;
      if (Number.isFinite(sp.xpNext)) target.xpNext = sp.xpNext;
      if (Number.isFinite(sp.ult)) target.ult = sp.ult;
      if (sp.stats && target.stats) {
        target.stats.damageDealt = sp.stats.damageDealt || 0;
        target.stats.kills = sp.stats.kills || 0;
        target.stats.revivesDone = sp.stats.revivesDone || 0;
      }
    }
    if (snap.status === 'dead' || snap.status === 'cleared') {
      run.status = snap.status;
    }
  }

  function onGuestKeyEvent(ev) {
    if (state.role !== 'guest' || state.status !== 'in_run' || lockstep) return;
    const k = (ev.key || '').toLowerCase();
    if (ev.type === 'keydown') guestHeldKeys.add(k);
    else guestHeldKeys.delete(k);
    let mx = (guestHeldKeys.has('d') || guestHeldKeys.has('arrowright') ? 1 : 0)
      - (guestHeldKeys.has('a') || guestHeldKeys.has('arrowleft') ? 1 : 0);
    let my = (guestHeldKeys.has('s') || guestHeldKeys.has('arrowdown') ? 1 : 0)
      - (guestHeldKeys.has('w') || guestHeldKeys.has('arrowup') ? 1 : 0);
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    sendLocalInput({
      moveX: mx,
      moveY: my,
      ultimate: ev.type === 'keydown' && k === ' ',
      interact: ev.type === 'keydown' && !ev.repeat && (k === 'e' || k === 'f'),
    });
  }

  function onPageUnload() {
    if (state.roomCode && (state.status === 'lobby' || state.status === 'in_run')) {
      postRoom({ type: 'peer_leave', roomCode: state.roomCode, peerId: getPeerId() });
    }
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('keydown', onGuestKeyEvent);
    win.addEventListener('keyup', onGuestKeyEvent);
    win.addEventListener('pagehide', onPageUnload);
    win.addEventListener('beforeunload', onPageUnload);
  }

  function leave({ silent = false } = {}) {
    clearTimers();
    guestHeldKeys.clear();
    settlePendingJoin({ ok: false, reason: 'left' });
    if (state.roomCode && (state.status === 'lobby' || state.status === 'in_run') && state.transport === 'local') {
      postRoom({ type: 'peer_leave', roomCode: state.roomCode, peerId: getPeerId() });
    }
    closeLocalRoomTransports();
    closeRtc();
    if (tapTransport) {
      tapTransport.leaveRoom();
    }
    if (lobbyChannel) {
      try { lobbyChannel.close(); } catch {}
      lobbyChannel = null;
    }
    lockstep = null;
    lastCompletedTurn = -1;
    if (state.waitingPeer) {
      state.waitingPeer = false;
      onWaitPeerChange?.(false, '');
    }
    state.role = 'idle';
    state.status = 'idle';
    state.transport = 'idle';
    state.roomCode = '';
    state.pendingRoomCode = '';
    state.hostPeerId = '';
    state.quickMatchOpen = false;
    state.party = [];
    state.mySlot = 0;
    if (!silent) {
      state.lastError = '';
      state.statusText = '';
      emitChange();
    }
  }

  function onRunFinished() {
    if (state.status === 'in_run') {
      leave({ silent: true });
      emitChange();
    }
  }

  function getParty() {
    ensureTabPeerId(win);
    return state.party.map((m) => ({ ...m }));
  }

  function getState() {
    const pid = getPeerId();
    return {
      peerId: pid,
      onlineSupported: isOnlineSupported(),
      tapMode: isTapMode(),
      transport: state.transport,
      active: state.status === 'lobby' || state.status === 'joining' || state.status === 'in_run',
      role: state.role,
      status: state.status,
      roomCode: state.roomCode || state.pendingRoomCode || '',
      confirmedRoomCode: state.roomCode || '',
      pendingRoomCode: state.pendingRoomCode || '',
      mySlot: state.mySlot,
      waitingPeer: state.waitingPeer,
      lockstepActive: Boolean(lockstep),
      lockstepStats: lockstep ? {
        turn: lockstep.currentTurn,
        frameIndex: lockstep.frameIndex,
        desyncCount: lockstep.desyncCount,
        recoveredCount: lockstep.recoveredCount,
      } : null,
      nightLevel: state.nightLevel,
      party: getParty(),
      statusText: state.statusText,
      lastError: state.lastError,
      webrtcConnected: state.webrtcConnected,
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    leave({ silent: true });
    if (tapTransport) {
      tapTransport.destroy();
      tapTransport = null;
    }
    if (lobbyChannel) {
      try { lobbyChannel.close(); } catch {}
      lobbyChannel = null;
    }
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('keydown', onGuestKeyEvent);
      win.removeEventListener('keyup', onGuestKeyEvent);
      win.removeEventListener('pagehide', onPageUnload);
      win.removeEventListener('beforeunload', onPageUnload);
    }
    listeners.clear();
  }

  return {
    get peerId() { return getPeerId(); },
    get roomCode() { return state.roomCode || state.pendingRoomCode || ''; },
    get party() { return getParty(); },
    get state() { return getState(); },
    get lockstep() { return lockstep; },
    getState,
    getParty,
    isOnlineSupported,
    isTapMode,
    isActive: () => state.status === 'lobby' || state.status === 'joining' || state.status === 'in_run',
    isInRun: () => state.status === 'in_run',
    advanceClock: (ms) => { clockOffsetMs += Math.max(0, Number(ms) || 0); },
    subscribe,
    createRoom,
    joinRoom,
    quickMatch,
    addBot,
    fillWithDaoistBots,
    toggleReady,
    syncLocalProfile,
    startMatch,
    submitLevelChoice,
    createWebRtcOffer,
    acceptWebRtcOffer,
    acceptWebRtcAnswer,
    sendLocalInput,
    buildStepInputs,
    onStepCommitted,
    broadcastRunSnapshot,
    applyHostSnapshot,
    onRunFinished,
    leave,
    close: leave,
    disconnect: leave,
    destroy,
  };
}

export function createCoopSession(opts = {}) {
  const mgr = createCoopManager(opts);
  if (opts.mode === 'host') mgr.createRoom({ roomCode: opts.roomCode });
  else if (opts.mode === 'join' && opts.roomCode) mgr.joinRoom(opts.roomCode);
  else if (opts.mode === 'quick') mgr.quickMatch();
  return mgr;
}
