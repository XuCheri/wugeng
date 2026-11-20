// ink.js —— 纸墨版画质感的底层工具：种子随机、纸纹、笔触、套色错位、墨点飞溅
// 仅在被调用时才访问 DOM，模块顶层不碰 document（便于 Node 下导入纯函数）。
import { INK, VERM, PAPER, PAPER_SHADE, RGB } from './palette.js';

/* ------------------------------------------------------------------ */
/* 种子随机                                                            */
/* ------------------------------------------------------------------ */

/** mulberry32：返回 [0,1) 随机数生成器 */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 整数坐标哈希 → uint32 */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((seed | 0) + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 1D 值噪声，返回 [0,1) */
export function noise1(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, 0, seed) / 4294967296;
  const b = hash2(i + 1, 0, seed) / 4294967296;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/* ------------------------------------------------------------------ */
/* Canvas 工具                                                         */
/* ------------------------------------------------------------------ */

export function makeCanvas(w, h) {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }
  return new OffscreenCanvas(W, H);
}

/* ------------------------------------------------------------------ */
/* 套色错位                                                            */
/* ------------------------------------------------------------------ */

const misreg = { x: 0.8, y: 0.55, on: true };

/** 打开/关闭朱红层套色错位（低画质关闭） */
export function setMisregistration(on) {
  misreg.on = !!on;
}
export function misregOffset() {
  return misreg.on ? misreg : { x: 0, y: 0 };
}

/** 在偏移后的坐标系里绘制朱红层：模拟双色印刷没对准 */
export function withMisreg(ctx, fn) {
  const o = misregOffset();
  if (!o.x && !o.y) {
    fn(ctx);
    return;
  }
  ctx.save();
  ctx.translate(o.x, o.y);
  fn(ctx);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 纸纹                                                                */
/* ------------------------------------------------------------------ */

let paperTileCache = null;

function periodicValueNoise(size, period, seed) {
  const lat = new Float32Array(period * period);
  const rng = makeRng(seed);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const out = new Float32Array(size * size);
  const cell = size / period;
  for (let y = 0; y < size; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const uy = fy * fy * (3 - 2 * fy);
    const r0 = (y0 % period) * period;
    const r1 = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const ux = fx * fx * (3 - 2 * fx);
      const c0 = x0 % period;
      const c1 = (x0 + 1) % period;
      const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * ux;
      const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * ux;
      out[y * size + x] = a + (b - a) * uy;
    }
  }
  return out;
}

/**
 * 生成 256² 可平铺的宣纸纹理：底色 + 低频色斑 + 颗粒 + 纤维。结果缓存。
 */
export function getPaperTile(size = 256) {
  if (paperTileCache && paperTileCache.width === size) return paperTileCache;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const n1 = periodicValueNoise(size, 4, 11);
  const n2 = periodicValueNoise(size, 8, 23);
  const n3 = periodicValueNoise(size, 32, 37);
  const rng = makeRng(991);
  const [pr, pg, pb] = RGB.paper;
  const [sr, sg, sb] = RGB.paperShade;
  for (let i = 0; i < size * size; i++) {
    // 色斑：低频噪声把底色向「宣纸阴影」推
    const blot = Math.max(0, n1[i] * 0.6 + n2[i] * 0.4 - 0.45) * 1.1;
    const grain = (rng() - 0.5) * 7 + (n3[i] - 0.5) * 6;
    let k = Math.min(0.55, blot);
    // 偶尔的深色杂质
    if (rng() < 0.0016) k += 0.9;
    const r = pr + (sr - pr) * k + grain;
    const gg = pg + (sg - pg) * k + grain;
    const b = pb + (sb - pb) * k + grain * 1.1;
    d[i * 4] = r;
    d[i * 4 + 1] = gg;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 纤维：细短弧线，九宫格偏移绘制以保证无缝
  const fr = makeRng(4242);
  const fibers = [];
  for (let i = 0; i < 150; i++) {
    const x = fr() * size;
    const y = fr() * size;
    const len = 5 + fr() * 18;
    const a = fr() * Math.PI * 2;
    const bend = (fr() - 0.5) * 0.9;
    const w = 0.4 + fr() * 0.7;
    const dark = fr() < 0.75;
    fibers.push({ x, y, len, a, bend, w, dark, alpha: 0.15 + fr() * 0.3 });
  }
  for (const f of fibers) {
    g.strokeStyle = f.dark ? `rgba(${sr - 30},${sg - 30},${sb - 30},${f.alpha})` : `rgba(250,245,232,${f.alpha + 0.2})`;
    g.lineWidth = f.w;
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const x0 = f.x + ox;
        const y0 = f.y + oy;
        if (x0 < -30 || y0 < -30 || x0 > size + 30 || y0 > size + 30) continue;
        g.beginPath();
        g.moveTo(x0, y0);
        const mx = x0 + Math.cos(f.a) * f.len * 0.5 + Math.cos(f.a + 1.57) * f.bend * f.len * 0.3;
        const my = y0 + Math.sin(f.a) * f.len * 0.5 + Math.sin(f.a + 1.57) * f.bend * f.len * 0.3;
        g.quadraticCurveTo(mx, my, x0 + Math.cos(f.a) * f.len, y0 + Math.sin(f.a) * f.len);
        g.stroke();
      }
    }
  }
  paperTileCache = c;
  return c;
}

let washTileCache = null;
/** 夜色墨晕用的云状噪声（灰度 alpha），128² 可平铺 */
export function getWashTile(size = 128) {
  if (washTileCache) return washTileCache;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const a = periodicValueNoise(size, 3, 71);
  const b = periodicValueNoise(size, 6, 83);
  const e = periodicValueNoise(size, 12, 97);
  for (let i = 0; i < size * size; i++) {
    const v = a[i] * 0.55 + b[i] * 0.3 + e[i] * 0.15;
    d[i * 4] = RGB.ink[0];
    d[i * 4 + 1] = RGB.ink[1];
    d[i * 4 + 2] = RGB.ink[2];
    d[i * 4 + 3] = Math.max(0, Math.min(255, (v - 0.25) * 2.2 * 255));
  }
  g.putImageData(img, 0, 0);
  washTileCache = c;
  return c;
}

/* ------------------------------------------------------------------ */
/* 笔触                                                                */
/* ------------------------------------------------------------------ */

function toXY(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : p;
}

function resample(pts, spacing) {
  const out = [];
  let prev = toXY(pts[0]);
  out.push({ x: prev.x, y: prev.y });
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = toXY(pts[i]);
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let d = spacing - carry;
    while (d <= len) {
      const k = d / len;
      out.push({ x: prev.x + dx * k, y: prev.y + dy * k });
      d += spacing;
    }
    carry = len - (d - spacing);
    prev = p;
  }
  const last = toXY(pts[pts.length - 1]);
  const lo = out[out.length - 1];
  if (Math.hypot(last.x - lo.x, last.y - lo.y) > spacing * 0.3) out.push({ x: last.x, y: last.y });
  return out;
}

/**
 * 毛笔笔触：起笔顿、收笔出锋、边缘飞白、种子抖动。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x,y}|[x,y]>} points 笔画中心线
 * @param {number} width 最大笔宽
 * @param {object} opts { color, seed, taperIn, taperOut, dry(0..1 飞白), jitter, alpha, pressure(t)→mul, endWidth }
 */
export function brushStroke(ctx, points, width, opts = {}) {
  if (!points || points.length < 2) return;
  const color = opts.color || INK;
  const seed = opts.seed ?? 1;
  const taperIn = opts.taperIn ?? 0.16;
  const taperOut = opts.taperOut ?? 0.4;
  const dry = opts.dry ?? 0.35;
  const jitter = opts.jitter ?? 0.5;
  const endWidth = opts.endWidth ?? 0.06;
  const startWidth = opts.startWidth ?? 0.5;
  const pressure = opts.pressure || null;
  const S = resample(points, Math.max(0.8, Math.min(width * 0.28, 6)));
  const n = S.length;
  if (n < 2) return;

  const W = new Float32Array(n);
  const NX = new Float32Array(n);
  const NY = new Float32Array(n);
  const CX = new Float32Array(n);
  const CY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)];
    const b = S[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    NX[i] = -ty;
    NY[i] = tx;
    const t = i / (n - 1);
    let w = 1;
    if (t < taperIn) {
      const k = t / taperIn;
      w = startWidth + (1 - startWidth) * (1 - (1 - k) * (1 - k)) + Math.sin(k * Math.PI) * 0.08;
    }
    if (t > 1 - taperOut) {
      const k = (1 - t) / taperOut;
      w = Math.min(w, endWidth + (1 - endWidth) * Math.pow(k, 0.75));
    }
    if (pressure) w *= pressure(t);
    w *= 1 + (noise1(seed, t * 7) - 0.5) * jitter * 0.4;
    W[i] = Math.max(0.2, w * width);
    const wob = (noise1(seed + 7, t * 3.5) - 0.5) * jitter * width * 0.18;
    CX[i] = S[i].x + NX[i] * wob;
    CY[i] = S[i].y + NY[i] * wob;
  }

  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  ctx.fillStyle = color;

  // 墨芯：越往后越窄，留出飞白
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const core = 1 - dry * (0.25 + 0.55 * t);
    const r = (noise1(seed + 13, i * 0.9) - 0.5) * 0.12;
    const hw = W[i] * 0.5 * (core + r);
    const x = CX[i] + NX[i] * hw;
    const y = CY[i] + NY[i] * hw;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const t = i / (n - 1);
    const core = 1 - dry * (0.25 + 0.55 * t);
    const r = (noise1(seed + 17, i * 0.9) - 0.5) * 0.12;
    const hw = W[i] * 0.5 * (core + r);
    ctx.lineTo(CX[i] - NX[i] * hw, CY[i] - NY[i] * hw);
  }
  ctx.closePath();
  ctx.fill();

  // 飞白：若干束毛，按噪声断开
  if (dry > 0.01) {
    const B = Math.max(5, Math.min(16, Math.round(width / 1.6)));
    const bw = 1.3 / B;
    for (let b = 0; b < B; b++) {
      const o = -0.5 + (b + 0.5) / B;
      const edge = Math.abs(o) * 2;
      const bseed = seed * 31 + b * 17 + 3;
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          ctx.beginPath();
          for (let k = 0; k < run.length; k++) {
            const i = run[k];
            const hw0 = (o - bw * 0.5) * W[i];
            const x = CX[i] + NX[i] * hw0;
            const y = CY[i] + NY[i] * hw0;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          for (let k = run.length - 1; k >= 0; k--) {
            const i = run[k];
            const hw1 = (o + bw * 0.5) * W[i];
            ctx.lineTo(CX[i] + NX[i] * hw1, CY[i] + NY[i] * hw1);
          }
          ctx.closePath();
          ctx.fill();
        }
        run = [];
      };
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const thr = dry * (0.12 + Math.pow(edge, 1.4) * 0.9) * (0.35 + 0.95 * t);
        const gap = noise1(bseed, i * 0.22) < thr;
        if (gap) flush();
        else run.push(i);
      }
      flush();
    }
  }
  ctx.restore();
}

/** 圆形/弧形笔触的中心线点 */
export function arcPoints(cx, cy, r, a0, a1, step = 0.08) {
  const pts = [];
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/* 形状辅助：手剪的不规则路径                                          */
/* ------------------------------------------------------------------ */

/** 不规则墨团路径（平滑闭合） */
export function blobPath(ctx, x, y, r, rng, irregular = 0.25, n = 11, sy = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3;
    const rr = r * (1 - irregular * 0.5 + rng() * irregular);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * sy]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    if (i === 0) {
      const l = pts[n - 1];
      ctx.moveTo((l[0] + p[0]) / 2, (l[1] + p[1]) / 2);
    }
    ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  ctx.closePath();
}

/** 手绘感的矩形描边路径（每条边略有起伏，角不完全闭合） */
export function roughRectPath(ctx, x, y, w, h, rng, amt = 0.8) {
  const j = () => (rng() - 0.5) * amt * 2;
  ctx.beginPath();
  ctx.moveTo(x + j(), y + j());
  ctx.quadraticCurveTo(x + w * 0.5 + j(), y + j() * 0.6, x + w + j(), y + j());
  ctx.quadraticCurveTo(x + w + j() * 0.6, y + h * 0.5 + j(), x + w + j(), y + h + j());
  ctx.quadraticCurveTo(x + w * 0.5 + j(), y + h + j() * 0.6, x + j(), y + h + j());
  ctx.quadraticCurveTo(x + j() * 0.6, y + h * 0.5 + j(), x + j(), y + j());
  ctx.closePath();
}

/** 抖动折线路径 */
export function wobblePath(ctx, pts, rng, amt = 0.6, close = false) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = toXY(pts[i]);
    const x = p.x + (rng() - 0.5) * amt;
    const y = p.y + (rng() - 0.5) * amt;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* 墨点飞溅                                                            */
/* ------------------------------------------------------------------ */

/**
 * 墨点飞溅：主墨团 + 卫星墨点 + 甩出的拖尾。
 * opts: { color, dir(弧度, 可选，偏向某方向), spread, count, mainScale }
 */
export function splatter(ctx, x, y, size, rng, opts = {}) {
  const color = opts.color || INK;
  ctx.save();
  ctx.fillStyle = color;
  const main = opts.mainScale ?? 1;
  if (main > 0) {
    blobPath(ctx, x, y, size * 0.55 * main, rng, 0.45, 12);
    ctx.fill();
  }
  const count = opts.count ?? Math.round(8 + size * 0.5);
  const dir = opts.dir;
  const spread = opts.spread ?? Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = dir == null ? rng() * Math.PI * 2 : dir + (rng() - 0.5) * spread;
    const dist = size * (0.6 + Math.pow(rng(), 0.7) * 1.9);
    const rr = Math.max(0.5, size * 0.16 * (1.3 - dist / (size * 2.6)) * (0.4 + rng()));
    const px = x + Math.cos(a) * dist;
    const py = y + Math.sin(a) * dist;
    if (rng() < 0.3) {
      // 甩出的拖尾：细长水滴
      const l = rr * (2.5 + rng() * 3);
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(a) * l, py - Math.sin(a) * l);
      ctx.quadraticCurveTo(px + Math.cos(a + 1.57) * rr, py + Math.sin(a + 1.57) * rr, px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      ctx.quadraticCurveTo(px + Math.cos(a - 1.57) * rr, py + Math.sin(a - 1.57) * rr, px - Math.cos(a) * l, py - Math.sin(a) * l);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 为已绘制的实心墨色区域打上「没印实」的白点（risograph 质感），烘焙进缓存 */
export function printSpeckle(ctx, w, h, rng, density = 0.004, maxR = 0.9) {
  const count = Math.round(w * h * density);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (let i = 0; i < count; i++) {
    const r = 0.25 + rng() * maxR;
    ctx.globalAlpha = 0.35 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 软墨团（墨烟 / 墨晕），中心浓、边缘淡；缓存 */
const softCache = new Map();
export function softBlob(size = 64, color = 'ink') {
  const key = size + color;
  if (softCache.has(key)) return softCache.get(key);
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const rgb = color === 'verm' ? RGB.verm : RGB.ink;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
  grd.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.45)`);
  grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  softCache.set(key, c);
  return c;
}

export { INK, VERM, PAPER, PAPER_SHADE };
