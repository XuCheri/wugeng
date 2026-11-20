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
    for (const k of this.used) this.buckets[k].length = 0;
    this.used.length = 0;
    this.count = 0;
  }

  /** 插入一个带 x, y 的对象（按中心点落格） */
  insert(item) {
    const k = this._key(Math.floor(item.x * this.inv), Math.floor(item.y * this.inv));
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
    const R = r + pad;
    const inv = this.inv;
    const x0 = Math.floor((x - R) * inv);
    const x1 = Math.floor((x + R) * inv);
    const y0 = Math.floor((y - R) * inv);
    const y1 = Math.floor((y + R) * inv);
    const st = ++this.stamp;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets[this._key(cx, cy)];
        for (let i = 0; i < b.length; i++) {
          const it = b[i];
          if (it._qs === st) continue;
          it._qs = st;
          const dx = it.x - x;
          const dy = it.y - y;
          const rr = r + (it.r || 0);
          if (dx * dx + dy * dy <= rr * rr) out.push(it);
        }
      }
    }
    return out;
  }

  /** 查询离 (x,y) 最近、且满足 filter 的对象，搜索半径 maxR */
  nearest(x, y, maxR, scratch, filter = null) {
    this.queryCircle(x, y, maxR, scratch, 0);
    let best = null;
    let bd = Infinity;
    for (const it of scratch) {
      if (filter && !filter(it)) continue;
      const dx = it.x - x;
      const dy = it.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }
}
