// 器物 / 开光神兵 / 百鬼 / 英雄 / 命签小图：
// 优先同步调用 src/render/sprites.js 的 iconDataURL（民俗版画离屏 Canvas 烘焙）；
// 命签与奇遇使用版画朱印，无 DOM 环境（Node 单测）或未知图标安全退回墨印。
import * as Sprites from '../render/sprites.js';
import { h } from './dom.js';

const CANVAS_KINDS = new Set(['weapon', 'evo', 'relic', 'enemy', 'hero', 'coin', 'bun', 'overflow']);
const cache = new Map();
const placeholderCheckCache = new Map();

export function preloadIcons() {
  return Promise.resolve();
}

function hashId(s) {
  let v = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    v ^= str.charCodeAt(i);
    v = Math.imul(v, 16777619);
  }
  return v >>> 0;
}

/**
 * 检测渲染层在并行开发期是否将尚未注册的新 ID 退回到了默认铜钱/纸童模板；
 * 一旦 M2 实装专属图标，像素差异远超阈值，自动 100% 透传 M2 原生版画 PNG。
 */
function isSilentPlaceholder(kind, id) {
  if (kind === 'coin' || kind === 'bun' || kind === 'overflow' || kind === 'hero') return false;
  if (kind === 'enemy' && id === 'paperkid') return false;
  const checkKey = `${kind}:${id}`;
  if (placeholderCheckCache.has(checkKey)) return placeholderCheckCache.get(checkKey);

  let isFallback = false;
  try {
    if (typeof document !== 'undefined' && typeof Sprites.drawIcon === 'function') {
      if (kind === 'weapon' || kind === 'relic') {
        const c1 = document.createElement('canvas');
        const c2 = document.createElement('canvas');
        c1.width = c2.width = 32;
        c1.height = c2.height = 32;
        const g1 = c1.getContext('2d');
        const g2 = c2.getContext('2d');
        Sprites.drawIcon(g1, kind, id, 16, 16, 28);
        Sprites.drawIcon(g2, kind, '__m3_probe_missing__', 16, 16, 28);
        const d1 = g1.getImageData(0, 0, 32, 32).data;
        const d2 = g2.getImageData(0, 0, 32, 32).data;
        let diff = 0;
        for (let i = 0; i < d1.length; i += 4) {
          if (Math.abs(d1[i] - d2[i]) > 6 || Math.abs(d1[i + 3] - d2[i + 3]) > 6) {
            diff++;
            break;
          }
        }
        isFallback = diff === 0;
      } else if (kind === 'evo' && typeof Sprites.iconDataURL === 'function') {
        // 若开光图标尚未独立绘制且底层 weapon 仍是占位，也生成专属木刻神兵印
        if (isSilentPlaceholder('weapon', id)) {
          const u1 = Sprites.iconDataURL('evo', id, 32);
          const u2 = Sprites.iconDataURL('evo', '__m3_probe_missing__', 32);
          isFallback = typeof u1 === 'string' && typeof u2 === 'string' && u1.length === u2.length;
        }
      } else if (kind === 'enemy' && typeof Sprites.enemySprite === 'function') {
        const s1 = Sprites.enemySprite(id, 0, false);
        const s2 = Sprites.enemySprite('__m3_probe_missing__', 0, false);
        if (s1?.canvas && s2?.canvas && s1.w === s2.w && s1.h === s2.h) {
          const d1 = s1.canvas.getContext('2d').getImageData(0, 0, s1.canvas.width, s1.canvas.height).data;
          const d2 = s2.canvas.getContext('2d').getImageData(0, 0, s2.canvas.width, s2.canvas.height).data;
          let diffPx = 0;
          const totalPx = Math.max(1, d1.length / 4);
          for (let i = 0; i < d1.length; i += 4) {
            if (Math.abs(d1[i] - d2[i]) > 12 || Math.abs(d1[i + 3] - d2[i + 3]) > 12) diffPx++;
          }
          isFallback = diffPx / totalPx < 0.03;
        }
      }
    }
  } catch {
    isFallback = false;
  }
  placeholderCheckCache.set(checkKey, isFallback);
  return isFallback;
}

/** 严格使用 6 色民俗木刻色板绘制独立几何纹章 PNG（仅在 M2 未落地某新条目时兜底）。 */
function bakeWoodblockFallbackURL(kind, id, size, glyph) {
  if (typeof document === 'undefined') return null;
  const s = 2;
  const c = document.createElement('canvas');
  c.width = size * s;
  c.height = size * s;
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(s, s);

  const PAPER = '#EFE6D2';
  const PAPER_SHADE = '#E0D2B4';
  const INK = '#1C1A17';
  const VERM = '#C23B26';
  const VERM_DARK = '#8E2A1B';
  const LANTERN = '#F0BE62';

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const seed = hashId(`${kind}:${id}`);

  if (kind === 'evo') {
    g.strokeStyle = VERM;
    g.lineWidth = 2.2;
    g.strokeRect(3, 3, size - 6, size - 6);
    g.fillStyle = LANTERN;
    g.fillRect(5.5, 5.5, size - 11, size - 11);
    g.fillStyle = PAPER;
    g.fillRect(8, 8, size - 16, size - 16);
  } else {
    g.fillStyle = PAPER_SHADE;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = kind === 'enemy' ? VERM_DARK : INK;
    g.lineWidth = 2;
    g.stroke();
  }

  // 按条目生成各不相同的木刻几何阵纹
  const spokes = 4 + (seed % 5);
  const rot = ((seed >> 4) % 12) * (Math.PI / 6);
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.strokeStyle = kind === 'evo' ? VERM : INK;
  g.lineWidth = 1.6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * (r * 0.36), Math.sin(a) * (r * 0.36));
    g.lineTo(Math.cos(a) * (r * 0.78), Math.sin(a) * (r * 0.78));
    g.stroke();
  }
  g.restore();

  g.fillStyle = kind === 'evo' ? VERM_DARK : INK;
  g.font = `${Math.round(size * 0.42)}px "WenKai", "Noto Serif CJK SC", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph || '印', cx, cy + 1);
  return c.toDataURL('image/png');
}

function urlFor(kind, id, size, glyph) {
  if (typeof document === 'undefined' || !CANVAS_KINDS.has(kind)) return null;
  const key = `${kind}:${id}:${size}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    if (isSilentPlaceholder(kind, id)) {
      url = bakeWoodblockFallbackURL(kind, id, size, glyph);
    } else if (typeof Sprites.iconDataURL === 'function') {
      const candidate = Sprites.iconDataURL(kind, id, size);
      if (typeof candidate === 'string' && candidate.startsWith('data:image/')) {
        url = candidate;
      }
    }
  } catch {
    url = null;
  }
  if (url) cache.set(key, url);
  return url;
}

/**
 * kind: 'weapon'|'evo'|'relic'|'enemy'|'hero'|'coin'|'bun'|'overflow'|'blessing'|'shrine'
 * glyph 为退回或朱印显示的单字；opts.tone: 'auspicious'|'cursed'|'shrine'
 */
export function icon(kind, id, size, glyph, opts = {}) {
  if (kind === 'blessing' || kind === 'shrine' || kind === 'synergy') {
    const tone = opts.tone || (kind === 'shrine' ? 'shrine' : 'auspicious');
    return h('span', {
      class: `icon icon--glyph icon--seal icon--${tone}`,
      'aria-hidden': 'true',
      style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.5) + 'px' },
    }, glyph || '签');
  }
  const url = urlFor(kind, id, size, glyph);
  if (url) {
    return h('img', { class: 'icon', src: url, width: size, height: size, alt: '', draggable: 'false' });
  }
  return h('span', {
    class: 'icon icon--glyph',
    'aria-hidden': 'true',
    style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.52) + 'px' },
  }, glyph || '？');
}
