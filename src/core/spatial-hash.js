// 均匀网格空间哈希：敌人粗筛查询（碰撞、范围伤害、分离力）。
// 设计意图：地图无限，所以不用二维数组，而是把格子坐标散列到固定数量的桶里；
// 桶冲突只会带来少量多余候选，最终都会做精确距离判断。
// 每帧 clear() + insert() 重建，零分配（桶数组复用）。

export class SpatialHash {
  /**
   * @param {number} cellSize 格子边长（建议 ≈ 最常见查询半径）
   * @param {number} bucketBits 桶数量 = 2^bucketBits
   */
  constructor(cellSize = 64, bucketBits = 12) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.mask = (1 << bucketBits) - 1;
    this.buckets = new Array(1 << bucketBits);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    this.used = []; // 本帧非空的桶下标，clear 时只清这些
    this.stamp = 0; // 查询去重戳
    this.count = 0;
  }

  _key(cx, cy) {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask;
  }

  clear() {
    const used = this.used;
    const buckets = this.buckets;
    for (let i = 0; i < used.length; i++) buckets[used[i]].length = 0;
    used.length = 0;
    this.count = 0;
  }

  /** 插入一个带 x, y 的对象（按中心点落格） */
  insert(item) {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return;
    const cx = Math.max(-1048576, Math.min(1048575, Math.floor(item.x * this.inv)));
    const cy = Math.max(-1048576, Math.min(1048575, Math.floor(item.y * this.inv)));
    const k = this._key(cx, cy);
    const b = this.buckets[k];
    if (b.length === 0) this.used.push(k);
    b.push(item);
    this.count++;
  }

  /**
   * 查询与圆 (x,y,r) 相交的对象（考虑对象自身半径 item.r，查询时额外扩展 pad）
   * @param {Array} out 输出数组（会先清空）；调用方各用各的数组，可安全嵌套查询
   * @param {number} pad 候选扩展距离，应 ≥ 最大对象半径
   */
  queryCircle(x, y, r, out, pad = 48) {
    out.length = 0;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r < 0) return out;
    const R = r + (Number.isFinite(pad) && pad > 0 ? pad : 0);
    const inv = this.inv;
    const st = (this.stamp = (this.stamp + 1) & 0x3fffffff);
    const buckets = this.buckets;
    if (Number.isFinite(R)) {
      const x0 = Math.floor((x - R) * inv);
      const x1 = Math.floor((x + R) * inv);
      const y0 = Math.floor((y - R) * inv);
      const y1 = Math.floor((y + R) * inv);
      if (
        Number.isSafeInteger(x0) &&
        Number.isSafeInteger(x1) &&
        Number.isSafeInteger(y0) &&
        Number.isSafeInteger(y1) &&
        x0 >= -1048576 &&
        x1 <= 1048575 &&
        y0 >= -1048576 &&
        y1 <= 1048575 &&
        (x1 - x0 + 1) * (y1 - y0 + 1) <= Math.max(64, this.used.length * 4)
      ) {
        const mask = this.mask;
        for (let cx = x0; cx <= x1; cx++) {
          const hx = Math.imul(cx, 73856093);
          for (let cy = y0; cy <= y1; cy++) {
            const b = buckets[(hx ^ Math.imul(cy, 19349663)) & mask];
            const bLen = b.length;
            for (let i = 0; i < bLen; i++) {
              const it = b[i];
              if (it._qs === st) continue;
              it._qs = st;
              const dx = it.x - x;
              const dy = it.y - y;
              const rr = r + (it.r || 0);
              const d2 = dx * dx + dy * dy;
              if (Number.isFinite(d2) ? d2 <= rr * rr : Math.hypot(dx, dy) <= rr) out.push(it);
            }
          }
        }
        return out;
      }
    }
    const used = this.used;
    for (let u = 0; u < used.length; u++) {
      const b = buckets[used[u]];
      const bLen = b.length;
      for (let i = 0; i < bLen; i++) {
        const it = b[i];
        if (it._qs === st) continue;
        it._qs = st;
        const dx = it.x - x;
        const dy = it.y - y;
        const rr = r + (it.r || 0);
        const d2 = dx * dx + dy * dy;
        if (Number.isFinite(d2) ? d2 <= rr * rr : Math.hypot(dx, dy) <= rr) out.push(it);
      }
    }
    return out;
  }

  /** 查询离 (x,y) 最近、且满足 filter 的对象，搜索半径 maxR */
  nearest(x, y, maxR, scratch, filter = null) {
    this.queryCircle(x, y, maxR, scratch, 48);
    let best = null;
    let bd = Infinity;
    let bdHypot = Infinity;
    for (let i = 0; i < scratch.length; i++) {
      const it = scratch[i];
      if (filter && !filter(it)) continue;
      const dx = it.x - x;
      const dy = it.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = it;
      } else if (bd === Infinity) {
        const h = Math.hypot(dx, dy);
        if (h < bdHypot) {
          bdHypot = h;
          best = it;
        }
      }
    }
    return best;
  }
}
