// 通用数学工具：向量、插值、角度，以及跨平台位级一致的 4096 档查表三角函数（fsin / fcos / fatan2）。
// 坐标系 y 轴向下，角度 0 = 向右，顺时针为正。

export const PI = 3.141592653589793;
export const HALF_PI = PI * 0.5;
export const TAU = PI * 2;
export const DEG = PI / 180;

export const TRIG_LUT_SIZE = 4096;
const QUAD_SIZE = TRIG_LUT_SIZE >> 2; // 1024
const INV_TAU = 1 / TAU;

// 纯 IEEE-754 四则运算 + Math.sqrt 构建查表（完全不调用宿主 Math.sin / Math.atan2，杜绝 V8/JSC 微差）
const SIN_LUT = (() => {
  const tbl = new Float64Array(TRIG_LUT_SIZE + 1);
  tbl[0] = 0;
  tbl[QUAD_SIZE] = 1;
  for (let i = 1; i < QUAD_SIZE; i++) {
    const x = (i / QUAD_SIZE) * HALF_PI;
    const x2 = x * x;
    tbl[i] = x * (1 - x2 * (1 / 6 - x2 * (1 / 120 - x2 * (1 / 5040 - x2 * (1 / 362880 - x2 / 39916800)))));
  }
  for (let i = QUAD_SIZE + 1; i <= QUAD_SIZE * 2; i++) {
    tbl[i] = tbl[QUAD_SIZE * 2 - i];
  }
  for (let i = QUAD_SIZE * 2 + 1; i < TRIG_LUT_SIZE; i++) {
    tbl[i] = -tbl[i - QUAD_SIZE * 2];
  }
  tbl[TRIG_LUT_SIZE] = 0;
  return tbl;
})();

const ATAN_LUT = (() => {
  const tbl = new Float64Array(TRIG_LUT_SIZE + 1);
  tbl[0] = 0;
  tbl[TRIG_LUT_SIZE] = PI * 0.25;
  for (let i = 1; i < TRIG_LUT_SIZE; i++) {
    const t = i / TRIG_LUT_SIZE;
    const t1 = t / (1 + Math.sqrt(1 + t * t));
    const t2 = t1 / (1 + Math.sqrt(1 + t1 * t1));
    const u2 = t2 * t2;
    tbl[i] = 4 * t2 * (1 - u2 * (1 / 3 - u2 * (1 / 5 - u2 * (1 / 7 - u2 * (1 / 9 - u2 / 11)))));
  }
  return tbl;
})();

/** 4096 档线性插值正弦（与 Math.sin 误差 < 1e-6，跨平台位级完全一致） */
export function fsin(a) {
  if (!Number.isFinite(a)) return 0;
  let u = (a * INV_TAU) % 1;
  if (u < 0) u += 1;
  const pos = u * TRIG_LUT_SIZE;
  const idx = pos >= TRIG_LUT_SIZE ? TRIG_LUT_SIZE - 1 : (pos | 0);
  const frac = pos - idx;
  return SIN_LUT[idx] + (SIN_LUT[idx + 1] - SIN_LUT[idx]) * frac;
}

/** 4096 档线性插值余弦（与 Math.cos 误差 < 1e-6，跨平台位级完全一致） */
export function fcos(a) {
  return fsin(a + HALF_PI);
}

/** 4096 档八分象限归约反正切（与 Math.atan2 误差 < 1e-6，跨平台位级完全一致） */
export function fatan2(y, x) {
  if (!Number.isFinite(y) || !Number.isFinite(x)) return 0;
  if (x === 0 && y === 0) return 0;
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  let base;
  if (ax >= ay) {
    const r = ay / ax;
    const pos = r * TRIG_LUT_SIZE;
    const idx = pos >= TRIG_LUT_SIZE ? TRIG_LUT_SIZE - 1 : (pos | 0);
    const frac = pos - idx;
    base = ATAN_LUT[idx] + (ATAN_LUT[idx + 1] - ATAN_LUT[idx]) * frac;
  } else {
    const r = ax / ay;
    const pos = r * TRIG_LUT_SIZE;
    const idx = pos >= TRIG_LUT_SIZE ? TRIG_LUT_SIZE - 1 : (pos | 0);
    const frac = pos - idx;
    base = HALF_PI - (ATAN_LUT[idx] + (ATAN_LUT[idx + 1] - ATAN_LUT[idx]) * frac);
  }
  if (x < 0) base = PI - base;
  return y < 0 ? -base : base;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, v) {
  return a === b ? 0 : (v - a) / (b - a);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function len(x, y) {
  return Math.sqrt(x * x + y * y);
}

/** 归一化；零向量返回 {x:0,y:0} */
export function norm(x, y) {
  const l = Math.sqrt(x * x + y * y);
  return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

export function angleOf(x, y) {
  return fatan2(y, x);
}

export function angleTo(ax, ay, bx, by) {
  return fatan2(by - ay, bx - ax);
}

/** 把角度规范到 (-π, π] */
export function wrapAngle(a) {
  a %= TAU;
  if (a > PI) a -= TAU;
  else if (a <= -PI) a += TAU;
  return a;
}

/** 从 a 转到 b 的最短有向角差 */
export function angleDiff(a, b) {
  return wrapAngle(b - a);
}

/** 角度 a 向 b 最多转 maxStep */
export function turnToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function fromAngle(a, l = 1) {
  return { x: fcos(a) * l, y: fsin(a) * l };
}

/** 指数衰减系数：每秒保留 keepPerSec 比例 */
export function decay(keepPerSec, dt) {
  return Math.pow(keepPerSec, dt);
}
