import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TAP_MSG_BYTES,
  TAP_ROOM_TYPE_MATCH,
  createTapBattleTransport,
} from '../../src/net/tap-battle-transport.js';
import {
  DISCONNECT_TAKEOVER_MS,
  FRAMES_PER_TURN,
  MAX_CHUNK_BYTES,
  WAIT_BANNER_MS,
  buildCorrectionChunks,
  createLockstepController,
  packInput,
  unpackInput,
} from '../../src/net/lockstep.js';
import {
  DT,
  chooseCoopUpgrade,
  computeRunHash,
  createRun,
  stepRun,
} from '../../src/sim/run.js';

test('M4.2 TapTap OnlineBattle 传输层：监听器先于 connect 注册、roomInfo 拆包、getRoomList 房号映射与 <=10条/秒合包节流', async () => {
  const callLog = [];
  let listenerObj = null;
  let clock = 10_000;
  const sendStamps = [];
  const deliveredPayloads = [];

  const mockMgr = {
    registerListener(l) {
      callLog.push('registerListener');
      listenerObj = l;
    },
    connect() {
      callLog.push('connect');
      assert.ok(listenerObj, 'registerListener 必须在 connect 之前调用');
      return Promise.resolve({ playerId: 'tap_host_01', errMsg: 'connect:ok' });
    },
    createRoom(opt) {
      callLog.push('createRoom');
      return Promise.resolve({
        roomInfo: {
          id: '25', // TapTap 真实短数字房间 ID
          ownerId: 'tap_host_01',
          maxPlayerCount: opt.data.roomCfg.maxPlayerCount,
          type: opt.data.roomCfg.type,
          customProperties: opt.data.roomCfg.customProperties,
          players: [
            { id: 'tap_host_01', status: 1, customProperties: opt.data.playerCfg.customProperties },
          ],
        },
        errMsg: 'createRoom:ok',
      });
    },
    getRoomList() {
      return Promise.resolve({
        roomList: [
          {
            id: '25',
            ownerId: 'tap_host_01',
            maxPlayerCount: 4,
            type: 'wugeng_v4_priv',
            customProperties: JSON.stringify({ roomCode: 'WG8899' }),
            players: [{ id: 'tap_host_01', status: 1, customProperties: '{}' }],
          },
        ],
      });
    },
    joinRoom(opt) {
      assert.equal(opt.data.roomId, '25', '6 位房号 WG8899 应通过 getRoomList 精确解析为底层 roomId "25"');
      return Promise.resolve({
        roomInfo: {
          id: '25',
          ownerId: 'tap_host_01',
          maxPlayerCount: 4,
          type: 'wugeng_v4_priv',
          customProperties: JSON.stringify({ roomCode: 'WG8899' }),
          players: [
            { id: 'tap_host_01', status: 1, customProperties: '{"name":"房主"}' },
            { id: 'tap_guest_02', status: 1, customProperties: '{"name":"客机"}' },
          ],
        },
      });
    },
    matchRoom(opt) {
      assert.equal(opt.data.roomCfg.type, TAP_ROOM_TYPE_MATCH);
      return Promise.resolve({
        roomInfo: {
          id: 'room_match_77',
          ownerId: 'tap_host_01',
          maxPlayerCount: 4,
          type: TAP_ROOM_TYPE_MATCH,
          customProperties: '{}',
          players: [{ id: 'tap_host_01', status: 1, customProperties: '{}' }],
        },
      });
    },
    sendCustomMessage(opt) {
      assert.equal(typeof opt?.data?.msg, 'string', 'sendCustomMessage data.msg 必须是字符串');
      assert.ok(Buffer.byteLength(opt.data.msg, 'utf8') <= MAX_TAP_MSG_BYTES, '单包不得超过 2048 字节');
      sendStamps.push(clock);
      const inLastSec = sendStamps.filter((t) => t > clock - 1000).length;
      assert.ok(inLastSec <= 15, `违反 TapTap 15 次/秒硬限：1 秒内发送了 ${inLastSec} 次`);
      deliveredPayloads.push(opt.data.msg);
      return Promise.resolve();
    },
    leaveRoom() {
      return Promise.resolve();
    },
  };

  const received = [];
  const tr = createTapBattleTransport({
    win: { tap: { getOnlineBattleManager: () => mockMgr } },
    nowFn: () => clock,
    onMessage: (pkt) => received.push(pkt),
  });

  const cRes = await tr.createRoom({ roomCode: 'WG8899', playerProps: { name: '老周' } });
  assert.equal(cRes.ok, true);
  assert.equal(callLog[0], 'registerListener');
  assert.equal(callLog[1], 'connect');
  assert.equal(cRes.room.roomId, '25');
  assert.equal(cRes.room.roomCode, 'WG8899');

  const jRes = await tr.joinRoomByCode({ roomCode: 'WG8899' });
  assert.equal(jRes.ok, true);
  assert.equal(jRes.room.players.length, 2);

  // 突发塞入 35 条锁步输入包：必须合包并严格受限于 <= 10 次/秒
  for (let i = 0; i < 35; i++) {
    tr.sendMessage({ type: 'ls_turn', t: i, s: 0, in: i * 3 });
  }
  for (let step = 0; step < 6; step++) {
    clock += 110;
    await new Promise((r) => setTimeout(r, 115));
  }
  assert.ok(sendStamps.length <= 6, `35 条突发消息应被合包为 <=6 次 API 调用，实测 ${sendStamps.length}`);

  // 把发出的 _batch 字符串回灌给接收端 onCustomMessage（覆盖不同字段名兼容与自发过滤）
  listenerObj.onCustomMessage({ fromPlayerId: 'tap_host_01', msg: deliveredPayloads[0] });
  assert.equal(received.length, 0, '自身发出的消息如被回推应安全忽略');

  for (const rawStr of deliveredPayloads) {
    listenerObj.onCustomMessage({ playerId: 'tap_guest_02', message: rawStr });
  }
  assert.equal(received.length, 35, '合包后的 35 条消息在接收端必须一字不差按序解包');
  assert.equal(received[0].t, 0);
  assert.equal(received[34].t, 34);

  const mRes = await tr.matchRoom({ maxPlayerCount: 4 });
  assert.equal(mRes.ok, true);
  assert.equal(mRes.room.roomCode.length, 6);
  tr.destroy();
});

test('M4.3 锁步引擎：位打包精度、60 回合抖动同步、全员独立三选一、8s 断线转 AI 与 <=1.8KB 状态哈希校准', () => {
  // 1. 位打包往返校验 + 大招仅回合首步触发保护
  const raw = { moveX: 0.6, moveY: -0.8, ultimate: true, interact: true };
  const packed = packInput(raw);
  assert.ok(packed > 0 && packed < 8192);
  const f0 = unpackInput(packed, true);
  const f1 = unpackInput(packed, false);
  assert.ok(Math.abs(f0.moveX - 0.6) < 0.08);
  assert.ok(Math.abs(f0.moveY - (-0.8)) < 0.08);
  assert.equal(f0.ultimate, true);
  assert.equal(f1.ultimate, false, '非回合首步不得重复触发大招');

  // 2. 双端锁步 + 乱序队列模拟 45 回合战斗与每 20 回合哈希核验
  const party = [
    { slot: 0, peerId: 'p0', name: '甲', heroId: 'zhou', startWeapon: 'gong', isBot: false },
    { slot: 1, peerId: 'p1', name: '乙', heroId: 'mian', startWeapon: 'paperman', isBot: false },
  ];
  const hostRun = createRun({ seed: 991122, heroId: 'zhou', startWeapon: 'gong', coop: { party } });
  const guestRun = createRun({ seed: 991122, heroId: 'zhou', startWeapon: 'gong', coop: { party } });
  hostRun._coopLockstep = true;
  guestRun._coopLockstep = true;

  let simClock = 50_000;
  const hostToGuest = [];
  const guestToHost = [];

  const hostLs = createLockstepController({
    role: 'host',
    mySlot: 0,
    party,
    nowFn: () => simClock,
    sendPacket: (pkt) => hostToGuest.push(pkt),
  });
  const guestLs = createLockstepController({
    role: 'guest',
    mySlot: 1,
    party,
    nowFn: () => simClock,
    sendPacket: (pkt) => guestToHost.push(pkt),
  });

  const flushWire = () => {
    // 故意反转顺序投递以验证乱序容忍，并排空多跳应答（如 ls_hash -> ls_hash_mismatch -> ls_corr）
    while (hostToGuest.length > 0 || guestToHost.length > 0) {
      while (hostToGuest.length > 0) guestLs.handlePacket(hostToGuest.pop(), guestRun);
      while (guestToHost.length > 0) hostLs.handlePacket(guestToHost.pop(), hostRun);
    }
  };

  for (let turn = 0; turn < 45; turn++) {
    for (let f = 0; f < FRAMES_PER_TURN; f++) {
      const hStep = hostLs.pollStep({ moveX: 1, moveY: 0 }, hostRun);
      const gStep = guestLs.pollStep({ moveX: 0, moveY: -1 }, guestRun);
      flushWire();
      assert.equal(hStep.ready, true);
      assert.equal(gStep.ready, true);
      stepRun(hostRun, hStep.stepInput, DT);
      stepRun(guestRun, gStep.stepInput, DT);
      hostLs.afterStep(hostRun, hStep.completedTurn);
      guestLs.afterStep(guestRun, gStep.completedTurn);
      flushWire();
    }
  }
  assert.equal(computeRunHash(hostRun), computeRunHash(guestRun), '45 回合双端锁步状态哈希必须完全一致');
  assert.equal(guestLs.desyncCount, 0);

  // 3. 联机全员独立三选一：各槽位独立抽签，全员确认后双端同构提交
  hostRun._pendingLevels = 1;
  guestRun._pendingLevels = 1;
  stepRun(hostRun, { slots: { 0: {}, 1: {} } }, DT);
  stepRun(guestRun, { slots: { 0: {}, 1: {} } }, DT);
  assert.equal(hostRun.status, 'levelup');
  assert.equal(guestRun.status, 'levelup');
  assert.equal(hostRun.coopChoicesBySlot.length, 2);
  assert.deepEqual(hostRun.coopChoicesBySlot[0], guestRun.coopChoicesBySlot[0]);
  assert.deepEqual(hostRun.coopChoicesBySlot[1], guestRun.coopChoicesBySlot[1]);

  // 仅房主选第 0 张签：必须等待客机，尚不恢复 playing
  const partialH = chooseCoopUpgrade(hostRun, 0, 0);
  const partialG = chooseCoopUpgrade(guestRun, 0, 0);
  assert.equal(partialH.committed, false);
  assert.equal(partialG.committed, false);
  assert.equal(hostRun.status, 'levelup');

  // 客机选第 1 张签：双端同时提交并回到 playing，状态哈希继续严格一致！
  const fullH = chooseCoopUpgrade(hostRun, 1, 1);
  const fullG = chooseCoopUpgrade(guestRun, 1, 1);
  assert.equal(fullH.committed, true);
  assert.equal(fullG.committed, true);
  assert.equal(hostRun.status, 'playing');
  assert.equal(guestRun.status, 'playing');
  assert.equal(computeRunHash(hostRun), computeRunHash(guestRun), '独立三选一全员提交后双端哈希必须严格一致');

  // 4. 人为篡改客机状态 -> 在第 60 回合触发哈希失步与 <=1.8KB 分片校准恢复
  guestRun.players[1].x += 777;
  for (let i = 0; i < 45; i++) {
    hostRun.enemies.push({
      id: 7000 + i, type: 'lanternghost', x: i * 12, y: -i * 8,
      hp: 45, maxHp: 45, r: 12, speed: 42, dmg: 8, xp: 2,
      elite: false, boss: false, state: 'move', angle: 0,
      atkT: 0, stateT: 0, hitT: 0, slowT: 0, stunT: 0,
      dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
    });
  }
  const probeChunks = buildCorrectionChunks(hostRun, 60, 99);
  assert.ok(probeChunks.length >= 2, '45 只敌人应自动拆分为多片校准包');
  for (const ch of probeChunks) {
    const bytes = Buffer.byteLength(JSON.stringify(ch), 'utf8');
    assert.ok(bytes <= MAX_CHUNK_BYTES, `分片字节数 ${bytes} 必须 <= ${MAX_CHUNK_BYTES}`);
  }

  while (hostLs.currentTurn < 61) {
    const hStep = hostLs.pollStep({ moveX: 0, moveY: 0 }, hostRun);
    const gStep = guestLs.pollStep({ moveX: 0, moveY: 0 }, guestRun);
    flushWire();
    if (hStep.ready) {
      stepRun(hostRun, hStep.stepInput, DT);
      hostLs.afterStep(hostRun, hStep.completedTurn);
    }
    if (gStep.ready) {
      stepRun(guestRun, gStep.stepInput, DT);
      guestLs.afterStep(guestRun, gStep.completedTurn);
    }
    flushWire();
  }
  assert.ok(guestLs.desyncCount >= 1, '客机必须检测到第 60 回合哈希不一致');
  assert.equal(guestLs.recoveredCount, 1, '客机收齐分片后必须完成权威状态校准恢复');
  assert.ok(Math.abs(guestRun.players[1].x - hostRun.players[1].x) < 1, '校准后客机坐标应回到房主权威位置');

  // 5. 客机停止发包：>1s 置 waitingPeer=true，>8s 房主自动切换 AI 接管并恢复推进
  // 跑完预缓冲回合直到缺少客机新包
  let blocked = null;
  for (let guard = 0; guard < 30; guard++) {
    const r = hostLs.pollStep({ moveX: 1, moveY: 0 }, hostRun);
    if (!r.ready) { blocked = r; break; }
    stepRun(hostRun, r.stepInput, DT);
    hostLs.afterStep(hostRun, r.completedTurn);
  }
  assert.ok(blocked && !blocked.ready, '客机断流后房主应在回合边界等待');

  simClock += WAIT_BANNER_MS + 50;
  const waitCheck = hostLs.pollStep({ moveX: 1, moveY: 0 }, hostRun);
  assert.equal(waitCheck.ready, false);
  assert.equal(waitCheck.waitingPeer, true, '超过 1 秒应激活等待道友提示');

  simClock += DISCONNECT_TAKEOVER_MS;
  const takeoverStep = hostLs.pollStep({ moveX: 1, moveY: 0 }, hostRun);
  assert.equal(takeoverStep.ready, true, '超过 8 秒应自动切换 AI 接管并解除阻塞');
  assert.equal(hostRun.players[1].isBot, true, '断线客机角色应已切换为智能道友 AI');
});
