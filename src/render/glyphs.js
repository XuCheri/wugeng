// glyphs.js —— 自绘「印章体」数字（计时器、伤害、等级），以及印章盖印
import { INK, VERM, PAPER, FONT_CN } from './palette.js';
import { makeCanvas, makeRng, hashStr, roughRectPath } from './ink.js';

// 4×6 网格上的方折笔画（篆刻感：等粗、方折）
const DIGITS = {
  '0': [[[0.9, 0], [3.1, 0], [4, 0.9], [4, 5.1], [3.1, 6], [0.9, 6], [0, 5.1], [0, 0.9], [0.9, 0]]],
  '1': [[[0.9, 1.2], [2, 0], [2, 6]], [[0.6, 6], [3.4, 6]]],
  '2': [[[0, 0.4], [0, 0], [4, 0], [4, 3], [0, 3], [0, 6], [4, 6]]],
  '3': [[[0, 0], [4, 0], [4, 6], [0, 6]], [[1, 3], [4, 3]]],
  '4': [[[0, 0], [0, 4], [4, 4]], [[3, 1.6], [3, 6]]],
  '5': [[[4, 0], [0, 0], [0, 3], [4, 3], [4, 6], [0, 6], [0, 5.4]]],
  '6': [[[4, 0], [0, 0], [0, 6], [4, 6], [4, 3], [0, 3]]],
  '7': [[[0, 0.9], [0, 0], [4, 0], [4, 2.2], [2.2, 4.2], [2.2, 6]]],
  '8': [[[0.6, 0], [3.4, 0], [3.4, 2.9], [0.6, 2.9], [0.6, 0]], [[0, 2.9], [4, 2.9], [4, 6], [0, 6], [0, 2.9]]],
  '9': [[[4, 3], [0, 3], [0, 0], [4, 0], [4, 6], [0, 6]]],
};

const GW = 4;
const GH = 6;

export function isSealChar(ch) {
  return DIGITS[ch] !== undefined || ch === ':' || ch === '.' || ch === '+' || ch === '-';
}

/** 单字宽度（以字号 size = 字高） */
export function sealCharWidth(ch, size) {
  if (DIGITS[ch]) return size * 0.62;
  if (ch === ':' || ch === '.') return size * 0.3;
  if (ch === '+' || ch === '-') return size * 0.55;
  if (ch === ' ') return size * 0.3;
  return size * 1.02; // 中文（万、亿、更…）
}

const glyphCache = new Map();
let glyphScale = 2;
export function setGlyphScale(s) {
  if (s !== glyphScale) {
    glyphScale = s;
    glyphCache.clear();
  }
}

function strokeGlyph(g, ch, size, lw) {
  const sx = (size * 0.62 - lw) / GW;
  const sy = (size - lw) / GH;
  const ox = lw / 2;
  const oy = lw / 2;
  if (DIGITS[ch]) {
    for (const line of DIGITS[ch]) {
      g.beginPath();
      line.forEach(([x, y], i) => {
        const px = ox + x * sx;
        const py = oy + y * sy;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.stroke();
    }
  } else if (ch === ':') {
    const s = lw * 1.1;
    g.fillRect(size * 0.15 - s / 2, size * 0.28 - s / 2, s, s);
    g.fillRect(size * 0.15 - s / 2, size * 0.72 - s / 2, s, s);
  } else if (ch === '.') {
    const s = lw * 1.1;
    g.fillRect(size * 0.15 - s / 2, size - s, s, s);
  } else if (ch === '+' || ch === '-') {
    g.beginPath();
    g.moveTo(lw, size / 2);
    g.lineTo(size * 0.55 - lw, size / 2);
    if (ch === '+') {
      g.moveTo(size * 0.275, size * 0.25);
      g.lineTo(size * 0.275, size * 0.75);
    }
    g.stroke();
  }
}

/**
 * 取一个字形的缓存画布。style: 'plain' | 'outlined'（带宣纸描边，便于在复杂背景上阅读）
 */
function getGlyph(ch, size, color, style, weight) {
  const key = ch + '|' + size + '|' + color + '|' + style + '|' + weight;
  let e = glyphCache.get(key);
  if (e) return e;
  const pad = style === 'outlined' ? Math.ceil(size * 0.22) + 1 : 2;
  const w = sealCharWidth(ch, size);
  const s = glyphScale;
  const c = makeCanvas((w + pad * 2) * s, (size + pad * 2) * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  g.translate(pad, pad);
  const lw = Math.max(1.2, size * 0.17 * weight);
  g.lineCap = 'square';
  g.lineJoin = 'miter';
  if (isSealChar(ch)) {
    if (style === 'outlined') {
      g.strokeStyle = PAPER;
      g.fillStyle = PAPER;
      g.lineWidth = lw + size * 0.26;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      strokeGlyph(g, ch, size, lw);
      g.lineCap = 'square';
      g.lineJoin = 'miter';
    }
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = lw;
    strokeGlyph(g, ch, size, lw);
    // 刻刀崩口：随机啃掉几处
    const rng = makeRng(hashStr(key));
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(rng() * w, rng() * size, lw * (0.15 + rng() * 0.25), 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  } else {
    g.font = `${Math.round(size * 1.05)}px ${FONT_CN}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    if (style === 'outlined') {
      g.strokeStyle = PAPER;
      g.lineWidth = size * 0.26;
      g.lineJoin = 'round';
      g.strokeText(ch, 0, size * 0.52);
    }
    g.fillStyle = color;
    g.fillText(ch, 0, size * 0.52);
  }
  e = { canvas: c, pad, w };
  // 中文字依赖字体加载，加载前不缓存
  if (isSealChar(ch) || fontsReady()) glyphCache.set(key, e);
  return e;
}

function fontsReady() {
  try {
    return typeof document !== 'undefined' && document.fonts && document.fonts.status === 'loaded';
  } catch {
    return false;
  }
}

export function measureSeal(str, size) {
  let w = 0;
  for (const ch of str) w += sealCharWidth(ch, size) + size * 0.1;
  return Math.max(0, w - size * 0.1);
}

/**
 * 绘制印章体字符串。align: 'left'|'center'|'right'；y 为字形垂直中心。
 */
export function drawSeal(ctx, str, x, y, size, color = INK, align = 'center', style = 'plain', weight = 1) {
  const total = measureSeal(str, size);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const top = y - size / 2;
  for (const ch of str) {
    const w = sealCharWidth(ch, size);
    if (ch !== ' ') {
      const g = getGlyph(ch, size, color, style, weight);
      ctx.drawImage(g.canvas, cx - g.pad, top - g.pad, g.w + g.pad * 2, size + g.pad * 2);
    }
    cx += w + size * 0.1;
  }
  return total;
}

/**
 * 朱红方印（阴刻：朱底留白字）。用于暴击伤害、等级印等。
 * (x,y) 为印的中心。返回印的宽高。
 */
const stampBgCache = new Map();
export function stampBox(w, h, color = VERM, seed = 1) {
  const qw = Math.round(w);
  const qh = Math.round(h);
  const key = qw + 'x' + qh + color + (seed % 4) + '@' + glyphScale;
  let c = stampBgCache.get(key);
  if (c) return c;
  const s = glyphScale;
  c = makeCanvas((qw + 4) * s, (qh + 4) * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  const rng = makeRng(seed * 977 + qw * 31 + qh);
  g.fillStyle = color;
  roughRectPath(g, 2, 2, qw, qh, rng, Math.min(1.4, qw * 0.04));
  g.fill();
  // 印泥不均：边缘啃缺 + 内部斑驳
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6 + qw * 0.15; i++) {
    const side = Math.floor(rng() * 4);
    const t = rng();
    const px = side === 0 ? 2 + t * qw : side === 1 ? 2 + qw : side === 2 ? 2 + t * qw : 2;
    const py = side === 0 ? 2 : side === 1 ? 2 + t * qh : side === 2 ? 2 + qh : 2 + t * qh;
    g.beginPath();
    g.arc(px, py, 0.5 + rng() * 1.3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < qw * qh * 0.012; i++) {
    g.globalAlpha = 0.3 + rng() * 0.5;
    g.beginPath();
    g.arc(2 + rng() * qw, 2 + rng() * qh, 0.3 + rng() * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  stampBgCache.set(key, c);
  if (stampBgCache.size > 300) stampBgCache.delete(stampBgCache.keys().next().value);
  return c;
}

/** 盖印：朱底 + 宣纸色印章体字 */
export function drawStamp(ctx, str, x, y, size, opts = {}) {
  const tw = measureSeal(str, size);
  const padX = size * 0.32;
  const padY = size * 0.26;
  const w = tw + padX * 2;
  const h = size + padY * 2;
  const bg = stampBox(w, h, opts.color || VERM, opts.seed ?? 1);
  ctx.save();
  ctx.translate(x, y);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.scale && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
  ctx.drawImage(bg, -Math.round(w) / 2 - 2, -Math.round(h) / 2 - 2, Math.round(w) + 4, Math.round(h) + 4);
  drawSeal(ctx, str, 0, 0, size, opts.textColor || PAPER, 'center', 'plain', opts.weight ?? 1);
  ctx.restore();
  return { w, h };
}
