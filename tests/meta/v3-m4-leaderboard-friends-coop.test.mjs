import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIMARY_LEADERBOARD_ID,
  PRIMARY_LEADERBOARD_NAME,
  PRIMARY_LEADERBOARD_UNIT,
  getLeaderboardConfig,
} from '../../src/meta/leaderboard-config.js';
import {
  buildLocalHonorEntries,
  clampLeaderboardPageSize,
  createLeaderboard,
  sanitizeLeaderboardScore,
} from '../../src/meta/leaderboard.js';
import {
  createFriends,
  extractLaunchRoomCode,
  sanitizeRoomCode,
} from '../../src/meta/friends.js';
import { createCoopManager, PEER_STORAGE_KEY } from '../../src/net/coop-net.js';
import { defaultSave } from '../../src/meta/save.js';
import { createRun, stepRun, DT } from '../../src/sim/run.js';

function makeMemStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    has: (k) => map.has(k),
  };
}

test('M4-F12-01: 线上主榜单配置锁定为真实 ID c5mzumajes9houq0ra 且积分/页长边界严格清洗', () => {
  assert.equal(PRIMARY_LEADERBOARD_ID, 'c5mzumajes9houq0ra');
  assert.equal(PRIMARY_LEADERBOARD_NAME, '五更守夜总榜');
  assert.equal(PRIMARY_LEADERBOARD_UNIT, '分');
  assert.equal(getLeaderboardConfig().leaderboardId, 'c5mzumajes9houq0ra');

  assert.equal(sanitizeLeaderboardScore(18650.4), 18650);
  assert.equal(sanitizeLeaderboardScore(199.6), 200);
  assert.equal(sanitizeLeaderboardScore(-42.7), 0);
  assert.equal(sanitizeLeaderboardScore(NaN), 0);
  assert.equal(sanitizeLeaderboardScore(Infinity), 0);
  assert.equal(sanitizeLeaderboardScore(''), 0);

  assert.equal(clampLeaderboardPageSize(0), 1);
  assert.equal(clampLeaderboardPageSize(-20), 1);
  assert.equal(clampLeaderboardPageSize(999), 200);
  assert.equal(clampLeaderboardPageSize(25), 25);
});

test('M4-F12-02: TapTap 排行榜上报、pendingScore 失败重传队列及 1025/103/104/500001 中文降级', async () => {
  const save = defaultSave();
  save.daoName = '测试打更人';
  save.leaderboard.history = [
    { score: 9200, heroId: 'zhou', daoName: '测试打更人', nightLevel: 0, kills: 120, timeSec: 180, cleared: false, at: 1 },
    { score: 24500, heroId: 'nuoxi', daoName: '测试打更人', nightLevel: 2, kills: 650, timeSec: 600, cleared: true, at: 2 },
  ];

  const localHonor = buildLocalHonorEntries(save);
  assert.equal(localHonor[0].score, 24500);
  assert.equal(localHonor[1].score, 9200);

  let failSubmitOnce = true;
  const submitted = [];
  const opened = [];
  const fakeWin = {
    location: { search: '' },
    tap: {
      getLeaderboardManager() {
        return {
          submitScores(p) {
            submitted.push(p.scores);
            if (failSubmitOnce) {
              failSubmitOnce = false;
              p.callback?.onFailure?.(500000, 'network timeout');
            } else {
              p.callback?.onSuccess?.({ results: p.scores });
            }
          },
          loadLeaderboardScores(p) {
            if (p.collection === 'friends') {
              p.callback?.onFailure?.(1025, 'friend permission not granted');
              return;
            }
            p.callback?.onSuccess?.({
              scores: [{ rank: 1, score: 58000, user: { name: '天榜魁首' } }],
              nextContinuationToken: 'tok_2',
            });
          },
          loadCurrentPlayerLeaderboardScore(p) {
            p.callback?.onSuccess?.({
              currentUserScore: { rank: 3, score: 31000, user: { name: '测试打更人' } },
            });
          },
          openLeaderboard(p) {
            opened.push(p);
            p.callback?.onSuccess?.({});
          },
        };
      },
    },
  };

  let persistedCount = 0;
  const lb = createLeaderboard({
    win: fakeWin,
    getSave: () => save,
    persistSave: () => { persistedCount++; },
  });

  // 首次上报模拟网络失败 -> 进入 pendingScore 队列
  const r1 = await lb.submitScore(31000, save);
  assert.equal(r1.ok, false);
  assert.equal(save.leaderboard.pendingScore, 31000);
  assert.equal(save.leaderboard.bestScore, 31000);
  assert.ok(persistedCount >= 1);

  // 打开全服总榜自动冲刷 pendingScore 队列并返回规范化名次
  const pubBoard = await lb.fetchBoard({ collection: 'public', maxSize: 500, save });
  assert.equal(save.leaderboard.pendingScore, 0);
  assert.equal(pubBoard.ok, true);
  assert.equal(pubBoard.entries[0].name, '天榜魁首');
  assert.equal(pubBoard.entries[0].score, 58000);
  assert.equal(pubBoard.currentPlayer.rank, 3);
  assert.equal(pubBoard.currentPlayer.score, 31000);
  assert.equal(submitted[0][0].leaderboardId, PRIMARY_LEADERBOARD_ID);

  // 好友榜遇到双参数 1025 权限错误 -> 中文友好说明 + 本地降级且不泄露英文报错
  const friendBoard = await lb.fetchBoard({ collection: 'friends', save });
  assert.equal(friendBoard.ok, false);
  assert.equal(friendBoard.source, 'permission_fallback');
  assert.ok(/授权|权限|暂不可用|本机/.test(friendBoard.notice));
  assert.equal(friendBoard.notice.includes('friend permission'), false);
  assert.equal(friendBoard.entries[0].score, 31000);
  assert.equal(friendBoard.entries[1].score, 24500);

  // 原生榜单面板唤起
  const nativeRes = await lb.openNativeLeaderboard({ collection: 'friends' });
  assert.equal(nativeRes.ok, true);
  assert.equal(opened[0].leaderboardId, PRIMARY_LEADERBOARD_ID);
  assert.equal(opened[0].collection, 'friends');
});

test('M4-F12-03: 好友榜码 112（隐私指引未声明）给出后台配置指引、可重新展卷，并先拉起隐私授权', async () => {
  const save = defaultSave();
  let friendsCode = 112;
  let privacyCalls = 0;
  const fakeWin = {
    location: { search: '' },
    tap: {
      requirePrivacyAuthorize(o) { privacyCalls++; o?.success?.(); },
      getLeaderboardManager() {
        return {
          loadLeaderboardScores(p) {
            if (p.collection === 'friends' && friendsCode) {
              p.callback?.onFailure?.({ errno: friendsCode, errMsg: 'api scope is not declared in the privacy agreement' });
              return;
            }
            p.callback?.onSuccess?.({ scores: [{ rank: 1, score: 8800, user: { name: '青衫道友' } }] });
          },
          loadCurrentPlayerLeaderboardScore(p) { p.callback?.onSuccess?.({}); },
        };
      },
    },
  };
  const lb = createLeaderboard({ win: fakeWin, getSave: () => save, persistSave: () => {} });

  const r112 = await lb.fetchBoard({ collection: 'friends', save });
  assert.equal(r112.ok, false);
  assert.equal(r112.source, 'permission_fallback');
  assert.equal(r112.code, 112);
  assert.equal(r112.retryable, true);
  assert.ok(/隐私合规/.test(r112.notice) && /好友关系/.test(r112.notice) && /112/.test(r112.notice));
  assert.equal(/privacy agreement/.test(r112.notice), false);
  assert.equal(privacyCalls, 1);

  // 后台补齐声明后「重新展卷」即可连通；已授权则不再重复拉起弹窗
  friendsCode = 0;
  const ok = await lb.fetchBoard({ collection: 'friends', save });
  assert.equal(ok.ok, true);
  assert.equal(ok.entries[0].name, '青衫道友');
  assert.equal(privacyCalls, 1);
});

test('M4-F13-01: 房号 XSS 清洗、启动/前台拉起解析、被动分享钩子与异常兜底', async () => {
  assert.equal(sanitizeRoomCode('ab23cd'), 'AB23CD');
  assert.equal(sanitizeRoomCode('<script>alert(1)</script>'), null);
  assert.equal(sanitizeRoomCode('"><svg onload=1>'), null);
  assert.equal(sanitizeRoomCode('X'), null);
  assert.equal(sanitizeRoomCode('ABCDEFGHIJKLMNOPQRSTUVWX'), null);

  let shareHook = null;
  let showHook = null;
  const joinedCodes = [];
  const sharedPayloads = [];

  const fakeWin = {
    location: { search: '?skipIntro=1', origin: 'http://127.0.0.1:8080', pathname: '/index.html' },
    tap: {
      getLaunchOptionsSync: () => ({ scene: 1001, query: { sceneParam: 'room=jk67mn' } }),
      onShareMessage: (cb) => { shareHook = cb; },
      onShow: (cb) => { showHook = cb; },
      openFriendList: () => { throw new Error('module unavailable'); },
      shareAppMessage: (p) => { sharedPayloads.push(p); p?.success?.({}); },
    },
  };

  assert.equal(extractLaunchRoomCode(fakeWin), 'JK67MN');

  let currentCode = 'ZX89CV';
  const friends = createFriends({
    win: fakeWin,
    getActiveRoomCode: () => currentCode,
    onRoomInviteJoin: (code) => joinedCodes.push(code),
  });

  // 被动分享携带当前房号
  assert.equal(typeof shareHook, 'function');
  assert.equal(shareHook().query, 'room=ZX89CV');

  // openFriendList 同步抛错被安全吞并
  const openRes = friends.openFriendList();
  assert.equal(openRes.ok, false);

  // 主动分享邀请携带 room=
  const invRes = await friends.inviteFriendToRoom({ roomCode: 'ZX89CV' });
  assert.equal(invRes.ok, true);
  assert.equal(sharedPayloads[0].query, 'room=ZX89CV');

  // tap.onShow 空查询不触发进房，有效房号才触发进房
  showHook({ scene: 1001, query: {} });
  assert.equal(joinedCodes.length, 0);
  showHook({ scene: 1001, query: { sceneParam: 'room=PQ89RS' } });
  assert.deepEqual(joinedCodes, ['PQ89RS']);
});

test('M4-F14-01: 双标签页 BroadcastChannel 房间同步、4 人上限拦截、帧输入转发与掉线 AI 托管', async () => {
  // 内存模拟同源 BroadcastChannel 总线
  const channelsByName = new Map();
  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this._closed = false;
      if (!channelsByName.has(name)) channelsByName.set(name, new Set());
      channelsByName.get(name).add(this);
    }
    postMessage(data) {
      if (this._closed) return;
      const peers = channelsByName.get(this.name) || new Set();
      const clone = JSON.parse(JSON.stringify(data));
      for (const ch of peers) {
        if (ch !== this && !ch._closed && typeof ch.onmessage === 'function') {
          queueMicrotask(() => ch.onmessage({ data: clone }));
        }
      }
    }
    close() {
      this._closed = true;
      channelsByName.get(this.name)?.delete(this);
    }
  }

  const hostSS = makeMemStorage();
  const guestSS = makeMemStorage();
  const extraSS = makeMemStorage();
  const sharedLS = makeMemStorage();

  const hostSave = defaultSave();
  hostSave.daoName = '房主老周';
  hostSave.selectedHero = 'zhou';

  const guestSave = defaultSave();
  guestSave.daoName = '客机青衣';
  guestSave.selectedHero = 'nuoxi';

  let hostRun = null;
  let guestRun = null;

  const hostWin = {
    sessionStorage: hostSS,
    localStorage: sharedLS,
    BroadcastChannel: MockBroadcastChannel,
    addEventListener() {},
    removeEventListener() {},
    get __wugeng() { return { game: { run: hostRun } }; },
  };
  const guestWin = {
    sessionStorage: guestSS,
    localStorage: sharedLS,
    BroadcastChannel: MockBroadcastChannel,
    addEventListener() {},
    removeEventListener() {},
    get __wugeng() { return { game: { run: guestRun } }; },
  };
  const extraWin = {
    sessionStorage: extraSS,
    localStorage: sharedLS,
    BroadcastChannel: MockBroadcastChannel,
    addEventListener() {},
    removeEventListener() {},
  };

  const hostCoop = createCoopManager({
    win: hostWin,
    getSave: () => hostSave,
    onStartCoopRun: ({ seed, party }) => {
      hostRun = createRun({ seed, heroId: party[0].heroId, coop: { party } });
    },
  });
  const guestCoop = createCoopManager({
    win: guestWin,
    getSave: () => guestSave,
    onStartCoopRun: ({ seed, party }) => {
      guestRun = createRun({ seed, heroId: party[0].heroId, coop: { party } });
    },
  });
  const extraCoop = createCoopManager({
    win: extraWin,
    getSave: () => defaultSave(),
  });

  try {
    // 1. sessionStorage 独立 peerId 且绝不污染共享 localStorage
    assert.notEqual(hostCoop.peerId, guestCoop.peerId);
    assert.equal(hostSS.has(PEER_STORAGE_KEY), true);
    assert.equal(guestSS.has(PEER_STORAGE_KEY), true);
    assert.equal(sharedLS.has(PEER_STORAGE_KEY), false);

    // 2. 房主建房 + 客机输码加入 + 添加 2 名道友满 4 人
    const created = hostCoop.createRoom();
    assert.match(created.roomCode, /^[A-Z0-9]{6}$/);

    const joined = await guestCoop.joinRoom(created.roomCode);
    assert.equal(joined.ok, true);
    assert.equal(hostCoop.party.length, 2);

    assert.equal(hostCoop.addBot().ok, true);
    assert.equal(hostCoop.addBot().ok, true);
    assert.equal(hostCoop.addBot().ok, false); // 第 5 人被拦截
    assert.equal(hostCoop.party.length, 4);

    // 3. 第 5 个标签页尝试加入满员房间收到中文满员拒绝
    const fullReject = await extraCoop.joinRoom(created.roomCode);
    assert.equal(fullReject.ok, false);
    assert.ok(/满|上限/.test(fullReject.message));

    // 4. 非法 WebRTC SDP 口令码被安全拒绝
    const badSdp = await hostCoop.acceptWebRtcOffer('@@@invalid_sdp@@@');
    assert.equal(badSdp.ok, false);

    // 5. 开局同守 + 客机输入转发 + 房主快照同步 + 客机离开转 AI 托管
    hostCoop.startMatch({ seed: 20261124 });
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(hostRun.players.length, 4);
    assert.equal(guestRun.players.length, 4);
    assert.equal(guestRun.players[1].heroId, 'nuoxi');

    const x0 = hostRun.players[1].x;
    guestCoop.sendLocalInput({ moveX: 1, moveY: 0, ultimate: false, interact: false });
    await new Promise((r) => setTimeout(r, 10));

    for (let i = 0; i < 12; i++) {
      guestCoop.sendLocalInput({ moveX: 1, moveY: 0, ultimate: false, interact: false });
      await new Promise((r) => setTimeout(r, 2));
      const inpMap = hostCoop.buildStepInputs({ moveX: 0, moveY: 0, ultimate: false, interact: false }, hostRun);
      stepRun(hostRun, inpMap, DT);
      hostCoop.broadcastRunSnapshot(hostRun);
    }
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(hostRun.players[1].x > x0 + 5);
    assert.equal(guestRun.players[1].x, hostRun.players[1].x);

    // 客机断开后槽位 1 平滑切换为智能道友 AI 托管
    guestCoop.leave();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(hostRun.players[1].isBot, true);
  } finally {
    hostCoop.destroy();
    guestCoop.destroy();
    extraCoop.destroy();
  }
});
