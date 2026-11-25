// Tier 1 (Part 6): Feature Happy-Path E2E Tests for v4 M4 True Online Co-op (F19)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  bootToHub,
  closeActiveModal,
  createCoopPages,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  stepCoopFrames,
} from './harness.mjs';

/**
 * Injects a realistic TapTap `window.tap.getOnlineBattleManager()` mock backed by an isolated
 * relay BroadcastChannel (distinct from the game's local BroadcastChannel) that strictly enforces:
 * 1. registerListener() MUST be called before connect()
 * 2. <= 15 API calls/sec shared across sendCustomMessage / updateRoomProperties / updatePlayerCustomProperties
 * 3. <= 2048 UTF-8 bytes per msg string
 * 4. Wrapped { roomInfo: { id, ownerId, maxPlayerCount, type, customProperties, players } } responses
 */
export function tapOnlineBattleInitScript(channelName = '__e2e_tap_battle_v4__') {
  const OrigBC = window.BroadcastChannel;
  const relay = new OrigBC(channelName);

  let listener = null;
  let connected = false;
  let networkMuted = false;
  const myId = 'tap_p_' + Math.random().toString(36).slice(2, 10);
  let activeRoomId = '';
  const rooms = new Map();
  const apiStamps = [];
  const stats = {
    listenerBeforeConnect: false,
    connectCalls: 0,
    createCalls: 0,
    joinCalls: 0,
    matchCalls: 0,
    msgSentCalls: 0,
    maxRateObserved: 0,
    maxBytesObserved: 0,
    violations: [],
  };

  function checkRateAndSize(rawStr) {
    const now = performance.now();
    apiStamps.push(now);
    while (apiStamps.length > 0 && apiStamps[0] <= now - 1000) apiStamps.shift();
    if (apiStamps.length > stats.maxRateObserved) stats.maxRateObserved = apiStamps.length;
    if (apiStamps.length > 15) {
      stats.violations.push(`rate_exceeded:${apiStamps.length}`);
      throw new Error(`TapTap OnlineBattle rate limit >15/s exceeded: ${apiStamps.length}`);
    }
    const bytes = new TextEncoder().encode(String(rawStr || '')).length;
    if (bytes > stats.maxBytesObserved) stats.maxBytesObserved = bytes;
    if (bytes > 2048) {
      stats.violations.push(`bytes_exceeded:${bytes}`);
      throw new Error(`TapTap OnlineBattle payload >2048B: ${bytes}`);
    }
  }

  relay.onmessage = (ev) => {
    if (networkMuted) return;
    const d = ev?.data;
    if (!d || typeof d !== 'object') return;
    if (d.kind === 'room_upsert' && d.room) {
      rooms.set(d.room.id, d.room);
      if (activeRoomId === d.room.id && d.triggerProps && d.sender !== myId) {
        listener?.onRoomPropertiesChange?.({
          properties: d.room.customProperties,
          ownerId: d.room.ownerId,
        });
      }
      return;
    }
    if (d.kind === 'player_enter' && d.roomId === activeRoomId && d.playerInfo?.id !== myId) {
      const rm = rooms.get(d.roomId);
      if (rm && !rm.players.some((p) => p.id === d.playerInfo.id)) {
        rm.players.push(d.playerInfo);
      }
      listener?.playerEnterRoom?.({ roomId: d.roomId, playerInfo: d.playerInfo });
      return;
    }
    if (d.kind === 'player_leave' && d.roomId === activeRoomId && d.playerId !== myId) {
      listener?.playerLeaveRoom?.({ roomId: d.roomId, playerInfo: { id: d.playerId }, playerId: d.playerId });
      return;
    }
    if (d.kind === 'custom_msg' && d.roomId === activeRoomId && d.fromPlayerId !== myId) {
      listener?.onCustomMessage?.({
        fromPlayerId: d.fromPlayerId,
        msg: d.msg,
        type: 0,
      });
    }
  };

  function syncRoomFromPeers() {
    return new Promise((resolve) => {
      const askCh = new OrigBC(channelName + '_sync');
      const onReply = (ev) => {
        if (ev?.data?.kind === 'sync_dump' && Array.isArray(ev.data.rooms)) {
          for (const r of ev.data.rooms) rooms.set(r.id, r);
        }
      };
      askCh.onmessage = onReply;
      askCh.postMessage({ kind: 'sync_req', from: myId });
      setTimeout(() => {
        askCh.close();
        resolve();
      }, 25);
    });
  }

  const syncResponder = new OrigBC(channelName + '_sync');
  syncResponder.onmessage = (ev) => {
    if (ev?.data?.kind === 'sync_req' && ev.data.from !== myId && rooms.size > 0) {
      syncResponder.postMessage({ kind: 'sync_dump', rooms: [...rooms.values()] });
    }
  };

  const mgr = {
    registerListener(l) {
      if (!connected) stats.listenerBeforeConnect = true;
      listener = l;
    },
    connect() {
      stats.connectCalls++;
      if (!listener) {
        stats.violations.push('connect_before_registerListener');
        return Promise.reject(new Error('registerListener must be called before connect'));
      }
      connected = true;
      return Promise.resolve({ playerId: myId, errMsg: 'connect:ok' });
    },
    async createRoom(opt) {
      stats.createCalls++;
      const cfg = opt?.data?.roomCfg || {};
      const pCfg = opt?.data?.playerCfg || {};
      const roomId = String(20 + Math.floor(Math.random() * 70)); // numeric short ID like "25"
      const me = { id: myId, status: 1, customProperties: pCfg.customProperties || '{}' };
      const roomInfo = {
        id: roomId,
        name: cfg.name || '',
        ownerId: myId,
        maxPlayerCount: cfg.maxPlayerCount || 4,
        type: cfg.type || 'wugeng_v4_priv',
        customProperties: cfg.customProperties || '{}',
        players: [me],
      };
      activeRoomId = roomId;
      rooms.set(roomId, roomInfo);
      relay.postMessage({ kind: 'room_upsert', room: roomInfo, sender: myId });
      return { roomInfo: JSON.parse(JSON.stringify(roomInfo)), errMsg: 'createRoom:ok' };
    },
    async getRoomList(opt) {
      await syncRoomFromPeers();
      const wantType = opt?.data?.type;
      const list = [...rooms.values()].filter((r) => !wantType || r.type === wantType);
      return { roomList: JSON.parse(JSON.stringify(list)), errMsg: 'getRoomList:ok' };
    },
    async joinRoom(opt) {
      stats.joinCalls++;
      await syncRoomFromPeers();
      const roomId = String(opt?.data?.roomId || '');
      const rm = rooms.get(roomId);
      if (!rm) throw new Error('joinRoom:fail room not found');
      if (rm.players.length >= rm.maxPlayerCount) throw new Error('joinRoom:fail room full');
      const me = { id: myId, status: 1, customProperties: opt?.data?.playerCfg?.customProperties || '{}' };
      if (!rm.players.some((p) => p.id === myId)) rm.players.push(me);
      activeRoomId = rm.id;
      relay.postMessage({ kind: 'room_upsert', room: rm, sender: myId });
      relay.postMessage({ kind: 'player_enter', roomId: rm.id, playerInfo: me });
      return { roomInfo: JSON.parse(JSON.stringify(rm)), errMsg: 'joinRoom:ok' };
    },
    async matchRoom(opt) {
      stats.matchCalls++;
      await syncRoomFromPeers();
      const cfg = opt?.data?.roomCfg || {};
      const wantType = cfg.type || 'wugeng_v4';
      const me = { id: myId, status: 1, customProperties: opt?.data?.playerCfg?.customProperties || '{}' };
      const openRoom = [...rooms.values()].find((r) => r.type === wantType && r.players.length < r.maxPlayerCount);
      if (openRoom) {
        if (!openRoom.players.some((p) => p.id === myId)) openRoom.players.push(me);
        activeRoomId = openRoom.id;
        relay.postMessage({ kind: 'room_upsert', room: openRoom, sender: myId });
        relay.postMessage({ kind: 'player_enter', roomId: openRoom.id, playerInfo: me });
        return { roomInfo: JSON.parse(JSON.stringify(openRoom)), errMsg: 'matchRoom:ok' };
      }
      const roomId = 'm_' + Math.random().toString(36).slice(2, 8);
      const created = {
        id: roomId,
        name: cfg.name || '',
        ownerId: myId,
        maxPlayerCount: cfg.maxPlayerCount || 4,
        type: wantType,
        customProperties: cfg.customProperties || '{}',
        players: [me],
      };
      activeRoomId = roomId;
      rooms.set(roomId, created);
      relay.postMessage({ kind: 'room_upsert', room: created, sender: myId });
      return { roomInfo: JSON.parse(JSON.stringify(created)), errMsg: 'matchRoom:ok' };
    },
    updateRoomProperties(opt) {
      const str = opt?.data?.customProperties || '{}';
      checkRateAndSize(str);
      const rm = rooms.get(activeRoomId);
      if (rm) {
        rm.customProperties = str;
        relay.postMessage({ kind: 'room_upsert', room: rm, sender: myId, triggerProps: true });
      }
      return Promise.resolve();
    },
    updatePlayerCustomProperties(opt) {
      const str = opt?.properties || '{}';
      checkRateAndSize(str);
      return Promise.resolve();
    },
    sendCustomMessage(opt) {
      const msg = opt?.data?.msg;
      if (typeof msg !== 'string') {
        stats.violations.push('non_string_msg');
        return Promise.reject(new Error('data.msg must be string'));
      }
      checkRateAndSize(msg);
      stats.msgSentCalls++;
      if (!networkMuted && activeRoomId) {
        relay.postMessage({
          kind: 'custom_msg',
          roomId: activeRoomId,
          fromPlayerId: myId,
          msg,
        });
      }
      return Promise.resolve();
    },
    leaveRoom() {
      if (activeRoomId) {
        const rid = activeRoomId;
        activeRoomId = '';
        relay.postMessage({ kind: 'player_leave', roomId: rid, playerId: myId });
      }
      return Promise.resolve();
    },
  };

  window.__e2eTapBattle = {
    stats,
    setMuted: (m) => { networkMuted = Boolean(m); },
    get playerId() { return myId; },
  };

  window.tap = Object.assign(window.tap || {}, {
    getOnlineBattleManager: () => mgr,
    shareAppMessage(opts) {
      window.__e2eLastShare = opts;
      opts?.success?.();
    },
  });
}

export const TIER1_F19 = [
  {
    id: 'T1-F19-01',
    tier: 1,
    feature: 'F19',
    name: '[M4.2/M4.4] Three-entry Co-op Lobby + TapTap OnlineBattle createRoom (numeric roomInfo.id) <-> 6-char joinRoom',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_f19_01_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl);
        await bootToHub(coop.guestPage, baseUrl);

        await fastClick(coop.hostPage, '[data-action="open-coop"]', 'Open Co-op Lobby on Host');
        await requireOpenSelector(coop.hostPage, '.coop-entry-grid', 'Expected 3-entry .coop-entry-grid');
        const p2pGone = await coop.hostPage.evaluate(() => document.querySelectorAll('.coop-p2p-toggle').length);
        assert.equal(p2pGone, 0, 'Legacy copy-paste SDP P2P button must be removed from UI');

        await fastClick(coop.hostPage, '[data-action="coop-create"]', 'Host creates TapTap room');
        await coop.hostPage.waitForFunction(() => window.__e2eTapBattle?.stats?.createCalls >= 1);
        const code = await coop.hostPage.evaluate(() => document.querySelector('[data-room-code]')?.getAttribute('data-room-code') || '');
        assert.equal(code.length, 6, `Expected 6-char room code, got '${code}'`);

        await fastClick(coop.guestPage, '[data-action="open-coop"]', 'Open Co-op Lobby on Guest');
        await coop.guestPage.evaluate((c) => {
          const inp = document.querySelector('[data-room-input]');
          inp.value = c;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }, code);
        await fastClick(coop.guestPage, '[data-action="coop-join"]', 'Guest joins by 6-char code');

        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2, null, { timeout: 4000 });
        await coop.guestPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2, null, { timeout: 4000 });

        const check = await coop.hostPage.evaluate(() => window.__e2eTapBattle.stats);
        assert.equal(check.listenerBeforeConnect, true, 'registerListener MUST run before connect()');
        assert.deepEqual(check.violations, []);
        coop.assertNoErrors('T1-F19-01');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F19-02',
    tier: 1,
    feature: 'F19',
    name: '[M4.2/M4.4] TapTap Quick Match (matchRoom type="wugeng_v4") pairs two pages & supports auto-bot fill timeout',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_f19_02_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl);
        await bootToHub(coop.guestPage, baseUrl);

        await fastClick(coop.hostPage, '[data-action="open-coop"]');
        await fastClick(coop.guestPage, '[data-action="open-coop"]');

        await fastClick(coop.hostPage, '[data-action="coop-quick"]', 'Host clicks Quick Match');
        await coop.hostPage.waitForFunction(() => Boolean(window.__wugeng.coop.roomCode));
        await fastClick(coop.guestPage, '[data-action="coop-quick"]', 'Guest clicks Quick Match');

        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length >= 2, null, { timeout: 4000 });
        await coop.guestPage.waitForFunction(() => window.__wugeng.coop.getParty().length >= 2, null, { timeout: 4000 });

        const [hCode, gCode] = await Promise.all([
          coop.hostPage.evaluate(() => window.__wugeng.coop.roomCode),
          coop.guestPage.evaluate(() => window.__wugeng.coop.roomCode),
        ]);
        assert.equal(hCode, gCode, `Quick Match must pair both clients into the same room (${hCode} vs ${gCode})`);

        // Verify fast autoFillMs fills remaining seats with Daoist AI bots when solo-matched
        await coop.hostPage.evaluate(() => window.__wugeng.coop.leave());
        await coop.guestPage.evaluate(() => window.__wugeng.coop.leave());
        await coop.hostPage.evaluate(() => window.__wugeng.coop.quickMatch({ autoFillMs: 120 }));
        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 4, null, { timeout: 3000 });
        coop.assertNoErrors('T1-F19-02');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F19-03',
    tier: 1,
    feature: 'F19',
    timeoutMs: 20_000,
    name: '[M4.3] Real 2-page TapTap 100ms Lockstep combat sync: input delay, smooth movement & <=15 msg/s compliance',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_f19_03_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl, { savePatch: { selectedHero: 'zhou' } });
        await bootToHub(coop.guestPage, baseUrl, { savePatch: { selectedHero: 'mian' } });

        await fastClick(coop.hostPage, '[data-action="open-coop"]');
        await fastClick(coop.hostPage, '[data-action="coop-create"]');
        await coop.hostPage.waitForFunction(() => window.__e2eTapBattle?.stats?.createCalls >= 1);
        const code = await coop.hostPage.evaluate(() => window.__wugeng.coop.roomCode);

        await coop.guestPage.evaluate((c) => window.__wugeng.coop.joinRoom(c), code);
        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2);

        await fastClick(coop.hostPage, '[data-action="coop-start"]', 'Start TapTap lockstep match');
        await coop.hostPage.waitForFunction(() => Boolean(window.__wugeng.game.run?._coopLockstep));
        await coop.guestPage.waitForFunction(() => Boolean(window.__wugeng.game.run?._coopLockstep));

        // Hold KeyD on Guest and KeyW on Host across lockstep turns (with 110ms pacing so 10Hz throttle flushes turns)
        await coop.hostPage.keyboard.down('KeyW');
        await coop.guestPage.keyboard.down('KeyD');
        for (let t = 0; t < 6; t++) {
          await stepCoopFrames([coop.hostPage, coop.guestPage], 6, 6);
          await new Promise((r) => setTimeout(r, 110));
        }
        await coop.hostPage.keyboard.up('KeyW');
        await coop.guestPage.keyboard.up('KeyD');

        const [hSnap, gSnap] = await Promise.all([
          coop.hostPage.evaluate(() => ({
            turn: window.__wugeng.coop.getState().lockstepStats?.turn || 0,
            p0y: window.__wugeng.game.run.players[0].y,
            p1x: window.__wugeng.game.run.players[1].x,
            violations: window.__e2eTapBattle.stats.violations,
            maxRate: window.__e2eTapBattle.stats.maxRateObserved,
          })),
          coop.guestPage.evaluate(() => ({
            turn: window.__wugeng.coop.getState().lockstepStats?.turn || 0,
            p0y: window.__wugeng.game.run.players[0].y,
            p1x: window.__wugeng.game.run.players[1].x,
            violations: window.__e2eTapBattle.stats.violations,
            maxRate: window.__e2eTapBattle.stats.maxRateObserved,
          })),
        ]);

        assert.ok(hSnap.turn >= 4 && gSnap.turn >= 4, `Expected >=4 lockstep turns committed (${hSnap.turn}, ${gSnap.turn})`);
        assert.ok(hSnap.p0y < -5, `Expected Host KeyW movement applied (${hSnap.p0y})`);
        assert.ok(hSnap.p1x > 35, `Expected Guest KeyD movement synced via lockstep (${hSnap.p1x})`);
        assert.equal(hSnap.p1x, gSnap.p1x, 'Lockstep Guest X coordinate must be bit-identical on Host & Guest');
        assert.ok(hSnap.maxRate <= 15 && gSnap.maxRate <= 15, `Rate must stay <=15/s (${hSnap.maxRate}, ${gSnap.maxRate})`);
        assert.deepEqual(hSnap.violations, []);
        assert.deepEqual(gSnap.violations, []);
        coop.assertNoErrors('T1-F19-03');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F19-04',
    tier: 1,
    feature: 'F19',
    timeoutMs: 20_000,
    name: '[M4.3] Independent Co-op Level-Up: Host & Guest draw separate 3-card hands & resume together once both confirm',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_f19_04_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl, { savePatch: { selectedHero: 'zhou' } });
        await bootToHub(coop.guestPage, baseUrl, { savePatch: { selectedHero: 'mian' } });

        await coop.hostPage.evaluate(() => window.__wugeng.coop.createRoom().ready);
        const code = await coop.hostPage.evaluate(() => window.__wugeng.coop.roomCode);
        await coop.guestPage.evaluate((c) => window.__wugeng.coop.joinRoom(c), code);
        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2);
        await coop.hostPage.evaluate(() => window.__wugeng.coop.startMatch({ seed: 445566 }));
        await coop.guestPage.waitForFunction(() => Boolean(window.__wugeng.game.run?._coopLockstep));

        // Deterministically grant enough XP on both synchronized instances to trigger team level-up on next step
        await Promise.all([
          coop.hostPage.evaluate(() => { window.__wugeng.game.run._pendingLevels = 1; }),
          coop.guestPage.evaluate(() => { window.__wugeng.game.run._pendingLevels = 1; }),
        ]);
        await stepCoopFrames([coop.hostPage, coop.guestPage], 2, 2);

        await requireOpenSelector(coop.hostPage, '.overlay--levelup', 'Expected .overlay--levelup on Host');
        await requireOpenSelector(coop.guestPage, '.overlay--levelup', 'Expected .overlay--levelup on Guest');

        // Host picks card 0 first -> stays in levelup waiting for Guest
        await fastClick(coop.hostPage, '.overlay--levelup .qian[data-choice-index="0"]', 'Host picks choice 0');
        const midSub = await coop.hostPage.textContent('.levelup-sub');
        assert.ok(midSub.includes('静候同行道友确认'), `Expected waiting-for-teammate subtitle on Host, got: ${midSub}`);

        // Allow 110ms throttle window for ls_pick delivery, then Guest picks card 1 -> both resume playing!
        await new Promise((r) => setTimeout(r, 120));
        await fastClick(coop.guestPage, '.overlay--levelup .qian[data-choice-index="1"]', 'Guest picks choice 1');
        await new Promise((r) => setTimeout(r, 140));

        await coop.hostPage.waitForFunction(() => window.__wugeng.game.run.status === 'playing', null, { timeout: 3000 });
        await coop.guestPage.waitForFunction(() => window.__wugeng.game.run.status === 'playing', null, { timeout: 3000 });
        coop.assertNoErrors('T1-F19-04');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F19-05',
    tier: 1,
    feature: 'F19',
    name: '[M4.4] Direct [data-action="coop-invite-friend"] from idle 3-entry lobby creates room & shares 6-char roomCode',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: `__tap_f19_05_${Date.now()}`,
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-coop"]', 'Open Co-op Lobby');
        await fastClick(s.page, '[data-action="coop-invite-friend"]', 'Click 邀请好友 directly from entry card');
        await s.page.waitForSelector('[data-room-code]');

        const res = await s.page.evaluate(() => ({
          code: document.querySelector('[data-room-code]')?.getAttribute('data-room-code') || '',
          shared: window.__e2eLastShare || null,
        }));
        assert.equal(res.code.length, 6);
        assert.ok(res.shared, 'Expected tap.shareAppMessage invoked');
        assert.ok(JSON.stringify(res.shared).includes(res.code), `Expected shared payload to carry roomCode ${res.code}`);
        await closeActiveModal(s.page);
        s.assertNoErrors('T1-F19-05');
      } finally {
        await s.close();
      }
    },
  },
];
