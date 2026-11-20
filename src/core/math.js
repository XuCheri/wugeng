// 通用数学工具：向量、插值、角度。坐标系 y 轴向下，角度 0 = 向右，顺时针为正。

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

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
  return Math.atan2(y, x);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** 把角度规范到 (-π, π] */
export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
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
  return { x: Math.cos(a) * l, y: Math.sin(a) * l };
}

/** 指数衰减系数：每秒保留 keepPerSec 比例 */
export function decay(keepPerSec, dt) {
  return Math.pow(keepPerSec, dt);
}
