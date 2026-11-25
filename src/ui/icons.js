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

const KNOWN_ENEMY_SPRITES = new Set([
  'paperkid', 'shade', 'lanternghost', 'weasel', 'sedan', 'drowned',
  'suona', 'paperbride', 'cinder', 'archer_ghost', 'firecracker_boy', 'twin_paper', 'shaman',
  'water_lurker', 'paper_raft', 'water_puller',
  'horse', 'umbrella', 'youshen', 'hebo_wedding',
]);

function isSilentPlaceholder(kind, id) {
  if (kind === 'coin' || kind === 'bun' || kind === 'overflow') return false;
  if (kind === 'weapon') return !Object.hasOwn(Sprites.WEAPON_ICONS || {}, id);
  if (kind === 'evo') return !Object.hasOwn(Sprites.EVO_WEAPON_ICONS || {}, id) && !Object.hasOwn(Sprites.WEAPON_ICONS || {}, id);
  if (kind === 'relic') return !Object.hasOwn(Sprites.RELIC_ICONS || {}, id);
  if (kind === 'hero') return !Object.hasOwn(Sprites.HERO_ICONS || {}, id);
  if (kind === 'enemy') return !KNOWN_ENEMY_SPRITES.has(id);
  return false;
}

/** 严格使用 6 色民俗木刻色板绘制独立几何纹章 PNG（仅在未知条目时兜底）。 */
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
  const url = c.toDataURL('image/png');
  c.width = 0;
  c.height = 0;
  return url;
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
