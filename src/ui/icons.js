// 器物 / 英雄小图：优先用渲染层 src/render/sprites.js 的 iconDataURL（程序绘制的剪影），
// 没有时退回一个墨字小印，保证界面在任何时候都能用。
import { h } from './dom.js';

let iconFn = null;
let loading = null;
const cache = new Map();

export function preloadIcons() {
  if (!loading) {
    loading = import('../render/sprites.js')
      .then((m) => { if (typeof m.iconDataURL === 'function') iconFn = m.iconDataURL; })
      .catch(() => { iconFn = null; });
  }
  return loading;
}

function urlFor(kind, id, size) {
  if (!iconFn) return null;
  const key = `${kind}:${id}:${size}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try { url = iconFn(kind, id, size) || null; } catch { url = null; }
  cache.set(key, url);
  return url;
}

/** kind: 'weapon'|'relic'|'hero'|'coin'|'bun'|'overflow'；glyph 为退回时显示的单字。 */
export function icon(kind, id, size, glyph) {
  const url = urlFor(kind, id, size);
  if (url) {
    return h('img', { class: 'icon', src: url, width: size, height: size, alt: '', draggable: 'false' });
  }
  return h('span', {
    class: 'icon icon--glyph', 'aria-hidden': 'true',
    style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.52) + 'px' },
  }, glyph || '？');
}
