// 地界配置与「河灯水口」地形判定（纯确定性几何，零浏览器全局对象）。
// - 青石镇（qingshi）：默认开放，无水面减速，积分系数 1.00；
// - 河灯水口（hedeng）：通关青石镇任意夜色解锁，夜河水面移速 ×0.75，木板桥段不减速，积分系数 1.12。

import { clamp, fsin } from '../core/math.js';
import { mixSeed } from '../core/rng.js';

export const MAP_IDS = ['qingshi', 'hedeng'];

export const MAPS = Object.freeze({
  qingshi: Object.freeze({
    id: 'qingshi',
    name: '青石镇',
    stamp: '镇',
    subtitle: '青石长街 · 古巷暖灯',
    unlockText: '默认开放',
    scoreMul: 1.0,
    waterSlowMul: 1.0,
  }),
  hedeng: Object.freeze({
    id: 'hedeng',
    name: '河灯水口',
    stamp: '河',
    subtitle: '沧水夜流 · 木板跨河 · 浮灯引魂',
    unlockText: '通关青石镇任意夜色解锁',
    scoreMul: 1.12,
    waterSlowMul: 0.75,
  }),
});

export const RIVER_GAP_Y = 380;
export const RIVER_HALF_W = 54;
export const BRIDGE_GAP_X = 320;
export const BRIDGE_HALF_W = 34;
export const SPAWN_DRY_RADIUS = 92;

export function normalizeMapId(mapId) {
  return mapId === 'hedeng' ? 'hedeng' : 'qingshi';
}

export function getMapConfig(mapId) {
  return MAPS[normalizeMapId(mapId)];
}

/** 第 k 条夜河河道的基础纵坐标（k=0 固定在 y=175，紧邻出生点下方但留出干爽码头） */
export function riverBaseY(k, seedNum = 1) {
  const s = (seedNum >>> 0) || 1;
  if (k === 0) return 175;
  const jitter = ((mixSeed(s, k, 0x517) >>> 0) % 68) - 34;
  return 175 + k * RIVER_GAP_Y + jitter;
}

/** 第 k 条河道在横坐标 x 处的蜿蜒中心纵坐标 */
export function riverChannelYAt(x, k, seedNum = 1) {
  const phase = ((k * 17) & 31) * 0.19634954084936207;
  return riverBaseY(k, seedNum) + fsin(x * 0.0085 + phase) * 16;
}

/** 第 k 条河道上第 b 座木板跨桥的横坐标（b=0,k=0 固定在 x=0 正南直通） */
export function bridgeCenterX(b, k, seedNum = 1) {
  const s = (seedNum >>> 0) || 1;
  if (b === 0 && k === 0) return 0;
  const jitter = ((mixSeed(s, b * 31 + k, 0x821) >>> 0) % 76) - 38;
  return b * BRIDGE_GAP_X + jitter;
}

/** 查找离横坐标 x 最近的木板跨桥中心 X */
export function findNearestBridgeX(x, k = 0, seedNum = 1) {
  const b0 = Math.round(x / BRIDGE_GAP_X);
  let bestX = bridgeCenterX(b0, k, seedNum);
  let bestDist = Math.abs(x - bestX);
  for (let b = b0 - 1; b <= b0 + 1; b++) {
    if (b === b0) continue;
    const cx = bridgeCenterX(b, k, seedNum);
    const d = Math.abs(x - cx);
    if (d < bestDist) {
      bestDist = d;
      bestX = cx;
    }
  }
  return bestX;
}

/** 坐标 (x, y) 是否位于某条夜河河槽范围内（不含出生点安全圆） */
export function isInRiverChannel(x, y, seedNum = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x * x + y * y < SPAWN_DRY_RADIUS * SPAWN_DRY_RADIUS) return false;
  const kApprox = Math.round((y - 175) / RIVER_GAP_Y);
  for (let k = kApprox - 1; k <= kApprox + 1; k++) {
    const cy = riverChannelYAt(x, k, seedNum);
    if (Math.abs(y - cy) <= RIVER_HALF_W) return true;
  }
  return false;
}

/** 坐标 (x, y) 是否位于横跨夜河的木板桥面上（桥面不减速） */
export function isWoodenBridge(x, y, seedNum = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const kApprox = Math.round((y - 175) / RIVER_GAP_Y);
  for (let k = kApprox - 1; k <= kApprox + 1; k++) {
    const cy = riverChannelYAt(x, k, seedNum);
    if (Math.abs(y - cy) > RIVER_HALF_W + 10) continue;
    const bApprox = Math.round(x / BRIDGE_GAP_X);
    for (let b = bApprox - 1; b <= bApprox + 1; b++) {
      const bx = bridgeCenterX(b, k, seedNum);
      if (Math.abs(x - bx) <= BRIDGE_HALF_W) return true;
    }
  }
  return false;
}

/** 坐标 (x, y) 是否处于真正淌水的夜河水面（河槽内且不在木桥上） */
export function isRiverWater(x, y, seedNum = 1) {
  return isInRiverChannel(x, y, seedNum) && !isWoodenBridge(x, y, seedNum);
}

/** 计算地界水面对角色的移速倍率（受减速抗性减免） */
export function terrainMoveMul(mapId, x, y, seedNum = 1, slowResist = 0) {
  if (mapId !== 'hedeng') return 1;
  if (!isRiverWater(x, y, seedNum)) return 1;
  const raw = MAPS.hedeng.waterSlowMul;
  const resist = clamp(Number.isFinite(slowResist) ? slowResist : 0, 0, 0.9);
  return 1 - (1 - raw) * (1 - resist);
}
