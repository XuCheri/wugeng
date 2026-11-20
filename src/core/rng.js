// 可设种子的随机数发生器（mulberry32）。
// 设计意图：sim 层禁止使用 Math.random，所有随机都从这里取，保证同种子 + 同输入 → 完全相同的一局。
// 状态只有一个 32 位整数 `s`，可直接 JSON 序列化 / 还原。

/** 把任意字符串或数字散列成 32 位无符号整数种子（xmur3 变体） */
export function hashSeed(seed) {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** 把若干整数混合成一个 32 位种子（用于按区块生成道具等派生随机流） */
export function mixSeed(...nums) {
  let h = 0x9e3779b9;
  for (const n of nums) {
    h ^= (n | 0) + 0x7f4a7c15 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    this.s = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 0x6d2b79f5;
  }

  /** [0,1) 均匀分布 */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [a,b) 浮点 */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** [a,b] 整数（含两端） */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** 以概率 p 返回 true */
  chance(p) {
    return this.next() < p;
  }

  /** 随机取数组中的一项；空数组返回 undefined */
  pick(arr) {
    return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined;
  }

  /** 按权重取一项；weightFn(item) 返回非负权重。全部为 0 时返回 undefined */
  weighted(items, weightFn = (x) => x.weight) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  getState() {
    return this.s;
  }

  setState(s) {
    this.s = s >>> 0;
  }
}

export function createRng(seed) {
  return new Rng(seed);
}
