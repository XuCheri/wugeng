// 敌弹净除统一口径（v5 难度回调）：
// - 兵刃/羁绊只能「拨落近身的少量普通敌弹」（半径封顶 + 每次数量上限，就近优先）；
// - 夜主弹幕（bossBullet）只能被大招、开光礼成、神龛与复活等硬清除，保住 Boss 战压迫感。

/** 兵刃清弹半径硬上限（≈ 竖屏半宽的 0.6，避免一锣清全屏） */
export const WEAPON_CLEAR_RADIUS_CAP = 120;

/**
 * 净除 (x,y) 半径 radius 内的敌弹，就近优先，最多 maxCount 颗。
 * @param {object} run
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {number} [maxCount]
 * @param {{ includeBoss?: boolean, cap?: number }} [opts]
 * @returns {number} 实际净除数量
 */
export function clearBulletsNear(run, x, y, radius, maxCount = Infinity, opts = {}) {
  const includeBoss = !!opts.includeBoss;
  const R = opts.cap ? Math.min(radius, opts.cap) : radius;
  if (!(R > 0) || !(maxCount > 0)) return 0;
  const hits = [];
  const list = run.projectiles;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.kind !== 'enemyBullet' || b.dead) continue;
    if (b.bossBullet && !includeBoss) continue;
    const rr = R + (b.r || 0);
    const d2 = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d2 <= rr * rr) hits.push({ d2, b });
  }
  if (hits.length > maxCount) hits.sort((a, c) => a.d2 - c.d2);
  const n = Math.min(maxCount, hits.length);
  for (let i = 0; i < n; i++) hits[i].b.dead = true;
  return n;
}

/** 兵刃口径：封顶半径 + 数量上限 + 不碰夜主弹幕 */
export function weaponClearBullets(run, x, y, radius, maxCount) {
  return clearBulletsNear(run, x, y, radius, maxCount, { cap: WEAPON_CLEAR_RADIUS_CAP });
}
