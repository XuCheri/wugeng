// 互联网多人联机确定性锁步（Lockstep）控制器与状态哈希分片纠偏（v4 M4.3）：
// - 回合粒度：1 Turn = 6 逻辑帧（100ms = 10 Turn/s，完美匹配 TapTap <=10 次/秒消息预算）
// - 输入延迟：2 Turn（200ms），开局预填 Turn 0..1 零输入，第 0 帧零等待起跑
// - 紧凑位打包输入：8 bit 方向角 + 3 bit 推杆幅度 + 1 bit 大招 + 1 bit 交互（单整数 0..8191）
// - 本地视觉移动预测与权威回合平滑收敛（消除 200ms 手感延迟且绝不污染权威 run 坐标）
// - 缺包等待：>1s 提示「等待道友…」，>8s 房主广播从第 T 回合起转交道友 AI 接管
// - 每 20 回合（约 2 秒）双端比对 computeRunHash(run)，不一致时房主下发 <=1.8KB 分片快照纠偏

import { PI, TAU, fatan2, fcos, fsin, lerp } from '../core/math.js';
import { computeRunHash } from '../sim/hash.js';
import { rebuildHash } from '../sim/enemies.js';

export const FRAMES_PER_TURN = 6;
export const INPUT_DELAY_TURNS = 2;
export const HASH_CHECK_EVERY_TURNS = 20;
export const WAIT_BANNER_MS = 1000;
export const DISCONNECT_TAKEOVER_MS = 8000;
export const MAX_CHUNK_BYTES = 1800;

const ULT_BIT = 1 << 11;
const INTERACT_BIT = 1 << 12;

function utf8Bytes(str) {
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(str).length;
  }
  return unescape(encodeURIComponent(str)).length;
}

/**
 * 将单帧采样输入打包为 13 位非负整数：
 * bits [0..7]: 角度 (-PI..PI] 量化为 0..255
 * bits [8..10]: 幅度 [0..1] 量化为 0..7（0 表示静止）
 * bit 11: ultimate
 * bit 12: interact
 */
export function packInput(inp) {
  if (!inp || typeof inp !== 'object') return 0;
  const mx = Number.isFinite(+inp.moveX) ? +inp.moveX : 0;
  const my = Number.isFinite(+inp.moveY) ? +inp.moveY : 0;
  const rawMag = Math.min(1, Math.sqrt(mx * mx + my * my));
  const qMag = rawMag < 0.08 ? 0 : Math.max(1, Math.min(7, Math.round(rawMag * 7)));
  let angByte = 0;
  if (qMag > 0) {
    const a = fatan2(my, mx); // (-PI, PI]
    const norm = (a + PI) / TAU;
    angByte = ((Math.round(norm * 256) % 256) + 256) % 256;
  }
  let packed = (angByte & 0xff) | ((qMag & 0x07) << 8);
  if (inp.ultimate || inp.ult) packed |= ULT_BIT;
  if (inp.interact) packed |= INTERACT_BIT;
  return packed >>> 0;
}

/**
 * 将打包整数还原为跨端位级完全一致的模拟输入（使用查表 fcos/fsin）。
 * isFirstFrameOfTurn=false 时抑制单次触发类按键（ultimate / interact），防止单回合连触 6 次。
 */
export function unpackInput(packed, isFirstFrameOfTurn = true) {
  const n = Number.isFinite(packed) ? (packed >>> 0) : 0;
  const qMag = (n >>> 8) & 0x07;
  let moveX = 0;
  let moveY = 0;
  if (qMag > 0) {
    const angByte = n & 0xff;
    const a = (angByte / 256) * TAU - PI;
    const mag = qMag / 7;
    moveX = fcos(a) * mag;
    moveY = fsin(a) * mag;
  }
  return {
    moveX,
    moveY,
    ultimate: Boolean(isFirstFrameOfTurn && (n & ULT_BIT)),
    interact: Boolean(isFirstFrameOfTurn && (n & INTERACT_BIT)),
  };
}

/**
 * 构造房主权威纠偏分片（每片 JSON 严格 <= 1800 字节 < 2048 字节上限）。
 */
export function buildCorrectionChunks(run, turn, corrId = 1) {
  if (!run) return [];
  const headerData = {
    time: Math.round(run.time * 10000) / 10000,
    watch: run.watch | 0,
    mode: run.mode,
    darkness: Math.round((run.darkness || 0) * 1000) / 1000,
    rng: run.rng ? (run.rng.getState() >>> 0) : 1,
    spawnAcc: Math.round((run._spawnAcc || 0) * 1000) / 1000,
    stats: {
      kills: run.stats?.kills || 0,
      coins: run.stats?.coins || 0,
      coopRevives: run.stats?.coopRevives || 0,
    },
    players: (run.players || [run.player]).map((p, idx) => ({
      s: p.slot ?? idx,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      hp: Math.round(p.hp * 10) / 10,
      mhp: Math.round(p.maxHp * 10) / 10,
      lv: p.level | 0,
      xp: Math.round((p.xp || 0) * 10) / 10,
      xpn: p.xpNext || 10,
      ult: Math.round((p.ult || 0) * 10) / 10,
      dn: p.downed ? 1 : 0,
      rp: Math.round((p.reviveProgress || 0) * 100) / 100,
      bot: p.isBot ? 1 : 0,
    })),
  };

  const aliveEnemies = (run.enemies || [])
    .filter((e) => e && !e.dead)
    .slice(0, 120)
    .map((e) => [
      e.id | 0,
      e.type,
      Math.round(e.x * 10) / 10,
      Math.round(e.y * 10) / 10,
      Math.round(e.hp * 10) / 10,
      Math.round(e.maxHp * 10) / 10,
      e.r || 12,
      e.speed || 40,
      e.dmg || 8,
      e.elite ? 1 : 0,
      e.boss ? 1 : 0,
    ]);

  const enemySlices = [];
  let curSlice = [];
  for (let i = 0; i < aliveEnemies.length; i++) {
    curSlice.push(aliveEnemies[i]);
    const probe = JSON.stringify({
      type: 'ls_corr',
      cid: corrId,
      t: turn,
      idx: enemySlices.length + 1,
      tot: 99,
      ens: curSlice,
    });
    if (utf8Bytes(probe) > MAX_CHUNK_BYTES - 120) {
      const last = curSlice.pop();
      if (curSlice.length > 0) enemySlices.push(curSlice);
      curSlice = [last];
    }
  }
  if (curSlice.length > 0) enemySlices.push(curSlice);

  const total = 1 + enemySlices.length;
  const packets = [
    {
      type: 'ls_corr',
      cid: corrId,
      t: turn,
      idx: 0,
      tot: total,
      hdr: headerData,
    },
  ];
  for (let i = 0; i < enemySlices.length; i++) {
    packets.push({
      type: 'ls_corr',
      cid: corrId,
      t: turn,
      idx: i + 1,
      tot: total,
      ens: enemySlices[i],
    });
  }
  return packets;
}

/**
 * 将收齐的分片纠偏包原子写回客机 run 实例。
 */
export function applyCorrectionToRun(run, sortedPackets) {
  if (!run || !Array.isArray(sortedPackets) || sortedPackets.length === 0) return false;
  const p0 = sortedPackets.find((p) => p.idx === 0 && p.hdr);
  if (!p0) return false;
  const hdr = p0.hdr;

  run.time = hdr.time;
  run.watch = hdr.watch;
  if (hdr.mode === 'main' || hdr.mode === 'endless') run.mode = hdr.mode;
  run.darkness = hdr.darkness;
  if (run.rng && Number.isFinite(hdr.rng)) {
    run.rng.setState(hdr.rng >>> 0);
  }
  if (Number.isFinite(hdr.spawnAcc)) run._spawnAcc = hdr.spawnAcc;
  if (hdr.stats && run.stats) {
    run.stats.kills = hdr.stats.kills || 0;
    run.stats.coins = hdr.stats.coins || 0;
    run.stats.coopRevives = hdr.stats.coopRevives || 0;
  }

  if (Array.isArray(hdr.players) && Array.isArray(run.players)) {
    for (const sp of hdr.players) {
      const pl = run.players[sp.s];
      if (!pl) continue;
      pl.x = sp.x;
      pl.y = sp.y;
      pl.hp = sp.hp;
      if (sp.mhp > 0) pl.maxHp = sp.mhp;
      pl.level = sp.lv;
      pl.xp = sp.xp;
      pl.xpNext = sp.xpn;
      pl.ult = sp.ult;
      pl.downed = Boolean(sp.dn);
      pl.reviveProgress = sp.rp || 0;
      pl.isBot = Boolean(sp.bot);
    }
  }

  const rebuiltEnemies = [];
  for (let i = 0; i < sortedPackets.length; i++) {
    const pkt = sortedPackets[i];
    if (!Array.isArray(pkt.ens)) continue;
    for (const row of pkt.ens) {
      const [id, type, x, y, hp, maxHp, r, speed, dmg, elite, boss] = row;
      rebuiltEnemies.push({
        id,
        type,
        x,
        y,
        hp,
        maxHp,
        r,
        speed,
        dmg,
        xp: 2,
        elite: Boolean(elite),
        boss: Boolean(boss),
        state: 'move',
        angle: 0,
        atkT: 0,
        stateT: 0,
        hitT: 0,
        slowT: 0,
        stunT: 0,
        dx: 0,
        dy: 0,
        kbx: 0,
        kby: 0,
        dead: false,
      });
    }
  }
  run.enemies = rebuiltEnemies;
  rebuildHash(run);
  return true;
}

/**
 * 创建确定性锁步控制器。
 */
export function createLockstepController({
  role = 'host',
  mySlot = 0,
  party = [],
  nowFn = () => Date.now(),
  sendPacket = () => {},
  onWaitChange = null,
  onAiTakeover = null,
  onDesyncRecovered = null,
} = {}) {
  const slotCount = Math.max(1, party.length);
  const aiFromTurn = new Array(slotCount).fill(Infinity);
  for (let i = 0; i < slotCount; i++) {
    if (party[i]?.isBot) aiFromTurn[i] = 0;
  }

  // turn -> Map<slot, packedInt>
  const turnBuffer = new Map();
  const sentTurns = new Set();
  const localHashes = new Map();
  const hostHashes = new Map();
  const pendingCorr = new Map(); // cid -> Map<idx, pkt>

  let frameIndex = 0;
  let pendingUltLatch = false;
  let pendingInteractLatch = false;
  let waitStartMs = 0;
  let waitingPeer = false;
  let corrSeq = 1;
  let desyncCount = 0;
  let recoveredCount = 0;

  // 本地视觉预测偏移（仅用于渲染平滑，绝不写回权威坐标）
  const pred = { x: 0, y: 0 };

  // 预填 Turn 0 .. INPUT_DELAY_TURNS - 1 为静止输入，保证开局第 0 帧零阻塞
  for (let t = 0; t < INPUT_DELAY_TURNS; t++) {
    const m = new Map();
    for (let s = 0; s < slotCount; s++) {
      if (aiFromTurn[s] > t) m.set(s, 0);
    }
    turnBuffer.set(t, m);
    sentTurns.add(t);
  }

  function ensureTurnMap(t) {
    let m = turnBuffer.get(t);
    if (!m) {
      m = new Map();
      turnBuffer.set(t, m);
    }
    return m;
  }

  function recordSlotTurnInput(turn, slot, packed) {
    if (!Number.isInteger(turn) || turn < 0 || slot < 0 || slot >= slotCount) return;
    const m = ensureTurnMap(turn);
    if (!m.has(slot)) {
      m.set(slot, packed >>> 0);
    }
  }

  function captureLocalSample(sampled) {
    if (sampled?.ultimate || sampled?.ult) pendingUltLatch = true;
    if (sampled?.interact) pendingInteractLatch = true;
  }

  function flushScheduledTurnSend(currentTurn, sampled) {
    captureLocalSample(sampled);
    const targetTurn = currentTurn + INPUT_DELAY_TURNS;
    if (sentTurns.has(targetTurn)) return;
    sentTurns.add(targetTurn);

    if (aiFromTurn[mySlot] <= targetTurn) return;
    const mergedSample = {
      moveX: sampled?.moveX || 0,
      moveY: sampled?.moveY || 0,
      ultimate: Boolean(sampled?.ultimate || sampled?.ult || pendingUltLatch),
      interact: Boolean(sampled?.interact || pendingInteractLatch),
    };
    pendingUltLatch = false;
    pendingInteractLatch = false;

    const packed = packInput(mergedSample);
    recordSlotTurnInput(targetTurn, mySlot, packed);
    sendPacket({
      type: 'ls_turn',
      t: targetTurn,
      s: mySlot,
      in: packed,
    });
  }

  function getMissingSlots(turn) {
    const m = turnBuffer.get(turn);
    const missing = [];
    for (let s = 0; s < slotCount; s++) {
      if (aiFromTurn[s] <= turn) continue;
      if (!m || !m.has(s)) missing.push(s);
    }
    return missing;
  }

  function activateAiTakeover(slot, fromTurn, run, broadcast = false) {
    if (slot < 0 || slot >= slotCount) return;
    aiFromTurn[slot] = Math.min(aiFromTurn[slot], fromTurn);
    if (run?.players?.[slot]) {
      run.players[slot].isBot = true;
    }
    if (broadcast && role === 'host') {
      sendPacket({
        type: 'ls_ai_takeover',
        slot,
        fromTurn,
      });
    }
    onAiTakeover?.({ slot, fromTurn });
  }

  function broadcastCorrection(run, turn) {
    if (role !== 'host' || !run) return [];
    const cid = corrSeq++;
    const chunks = buildCorrectionChunks(run, turn, cid);
    for (const pkt of chunks) {
      sendPacket(pkt);
    }
    return chunks;
  }

  /**
   * 尝试推进一帧（60Hz）：
   * - 若当前回合全员输入已齐备，返回 `{ ready: true, stepInput: { slots }, turn, frameIndex }` 并递增帧号；
   * - 若缺远端道友输入，返回 `{ ready: false, waitingPeer, missingSlots, turn }`，并在超时 8s 后自动切换 AI 接管。
   */
  function pollStep(sampled, run) {
    const turn = (frameIndex / FRAMES_PER_TURN) | 0;
    const frameInTurn = frameIndex % FRAMES_PER_TURN;

    if (frameInTurn === 0) {
      flushScheduledTurnSend(turn, sampled);
    } else {
      captureLocalSample(sampled);
    }

    let missing = getMissingSlots(turn);
    if (missing.length > 0) {
      const now = nowFn();
      if (!waitStartMs) waitStartMs = now;
      const waitedMs = now - waitStartMs;
      if (waitedMs >= WAIT_BANNER_MS && !waitingPeer) {
        waitingPeer = true;
        onWaitChange?.(true, missing);
      }
      if (waitedMs >= DISCONNECT_TAKEOVER_MS) {
        for (const s of missing) {
          if (s !== mySlot) {
            activateAiTakeover(s, turn, run, role === 'host');
          }
        }
        missing = getMissingSlots(turn);
      }
      if (missing.length > 0) {
        return {
          ready: false,
          waitingPeer,
          missingSlots: missing,
          turn,
          frameIndex,
        };
      }
    }

    if (waitStartMs) {
      waitStartMs = 0;
      if (waitingPeer) {
        waitingPeer = false;
        onWaitChange?.(false, []);
      }
    }

    const m = turnBuffer.get(turn);
    const isFirst = frameInTurn === 0;
    const slots = {};
    for (let s = 0; s < slotCount; s++) {
      if (aiFromTurn[s] <= turn) {
        if (run?.players?.[s] && !run.players[s].isBot) {
          run.players[s].isBot = true;
        }
        continue; // 交由 sim/coop.js 的 computeDaoistBotInput 确定性计算 AI 走位
      }
      const packed = m ? m.get(s) : 0;
      slots[s] = unpackInput(packed, isFirst);
    }

    // 本地视觉预测平滑更新（采样方向领先权威方向时提供细腻前瞻手感，停手后平滑归零）
    const myCommitted = slots[mySlot] || { moveX: 0, moveY: 0 };
    const spd = run?.players?.[mySlot]?.speed || 105;
    const leadVx = ((sampled?.moveX || 0) - myCommitted.moveX) * spd * 0.12;
    const leadVy = ((sampled?.moveY || 0) - myCommitted.moveY) * spd * 0.12;
    pred.x = lerp(pred.x, Math.max(-18, Math.min(18, leadVx)), 0.25);
    pred.y = lerp(pred.y, Math.max(-18, Math.min(18, leadVy)), 0.25);
    if (run) {
      run._localSlot = mySlot;
      run._predOffset = { x: pred.x, y: pred.y };
    }

    frameIndex++;
    return {
      ready: true,
      waitingPeer: false,
      stepInput: { slots },
      turn,
      frameIndex,
      completedTurn: (frameIndex % FRAMES_PER_TURN === 0) ? turn : -1,
    };
  }

  /**
   * 在 stepRun 执行完毕后调用：在每 20 回合边界计算并校验 32 位状态哈希。
   */
  function afterStep(run, completedTurn) {
    if (!run || completedTurn < 0) return;
    // 清理旧回合缓冲
    for (const k of turnBuffer.keys()) {
      if (k < completedTurn - 8) turnBuffer.delete(k);
    }

    if (completedTurn > 0 && completedTurn % HASH_CHECK_EVERY_TURNS === 0) {
      const h = computeRunHash(run);
      localHashes.set(completedTurn, h);
      for (const hk of localHashes.keys()) {
        if (hk < completedTurn - 100) localHashes.delete(hk);
      }

      if (role === 'host') {
        sendPacket({ type: 'ls_hash', t: completedTurn, h });
      } else if (hostHashes.has(completedTurn)) {
        const hh = hostHashes.get(completedTurn);
        if (hh !== h) {
          desyncCount++;
          sendPacket({ type: 'ls_hash_mismatch', t: completedTurn, gh: h, hh });
        }
      }
    }
  }

  /**
   * 接收来自网络层的锁步协议包（ls_turn / ls_ai_takeover / ls_hash / ls_hash_mismatch / ls_corr）。
   */
  function handlePacket(pkt, run = null) {
    if (!pkt || typeof pkt !== 'object') return false;
    switch (pkt.type) {
      case 'ls_turn': {
        recordSlotTurnInput(pkt.t, pkt.s, pkt.in);
        return true;
      }
      case 'ls_ai_takeover': {
        if (Number.isInteger(pkt.slot) && Number.isInteger(pkt.fromTurn)) {
          activateAiTakeover(pkt.slot, pkt.fromTurn, run, false);
        }
        return true;
      }
      case 'ls_hash': {
        if (role === 'guest' && Number.isInteger(pkt.t) && Number.isFinite(pkt.h)) {
          const hh = pkt.h >>> 0;
          hostHashes.set(pkt.t, hh);
          if (localHashes.has(pkt.t)) {
            const lh = localHashes.get(pkt.t);
            if (lh !== hh) {
              desyncCount++;
              sendPacket({ type: 'ls_hash_mismatch', t: pkt.t, gh: lh, hh });
            }
          }
        }
        return true;
      }
      case 'ls_hash_mismatch': {
        if (role === 'host' && run) {
          desyncCount++;
          const curTurn = (frameIndex / FRAMES_PER_TURN) | 0;
          broadcastCorrection(run, curTurn);
        }
        return true;
      }
      case 'ls_corr': {
        if (role === 'guest' && run && Number.isInteger(pkt.cid) && Number.isInteger(pkt.idx) && Number.isInteger(pkt.tot)) {
          let bucket = pendingCorr.get(pkt.cid);
          if (!bucket) {
            bucket = new Map();
            pendingCorr.set(pkt.cid, bucket);
          }
          bucket.set(pkt.idx, pkt);
          if (bucket.size >= pkt.tot) {
            const sorted = [...bucket.values()].sort((a, b) => a.idx - b.idx);
            pendingCorr.delete(pkt.cid);
            if (applyCorrectionToRun(run, sorted)) {
              recoveredCount++;
              onDesyncRecovered?.({ turn: pkt.t, corrId: pkt.cid });
            }
          }
        }
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * 远端玩家主动离开或 SDK 通知掉线时，由房主从下一待定回合起平滑移交 AI。
   */
  function notifyPeerDisconnected(slot, run = null) {
    if (slot <= 0 || slot >= slotCount) return;
    const curTurn = (frameIndex / FRAMES_PER_TURN) | 0;
    if (role === 'host') {
      activateAiTakeover(slot, curTurn, run, true);
    }
  }

  return {
    get frameIndex() { return frameIndex; },
    get currentTurn() { return (frameIndex / FRAMES_PER_TURN) | 0; },
    get waitingPeer() { return waitingPeer; },
    get desyncCount() { return desyncCount; },
    get recoveredCount() { return recoveredCount; },
    get visualOffset() { return { x: pred.x, y: pred.y }; },
    isSlotBot: (s) => aiFromTurn[s] <= ((frameIndex / FRAMES_PER_TURN) | 0),
    pollStep,
    afterStep,
    handlePacket,
    notifyPeerDisconnected,
    broadcastCorrection,
  };
}
