// 角色与衣冠高精木版立绘贴图加载器（浏览器端懒加载 + 多级平滑缩略缓存 + 受击朱砂闪白；Node 测试环境自动回退程序化绘制）
import { HERO_SKIN_IDS, normalizeHeroSkinId } from '../meta/cosmetics.js';
import { VERM } from './palette.js';

const HAS_DOM_IMAGE = typeof Image !== 'undefined' && typeof document !== 'undefined';
const HERO_ASSET_DIR = 'assets/heroes/';
const FOOT_ANCHOR_RATIO = 354 / 360; // build_hero_sprites.py: target_h=360, foot_pad=6

const entries = new Map();
const mipCache = new Map();
const readyListeners = new Set();
let preloadAllPromise = null;

function notifyReady(skinId) {
  for (const fn of readyListeners) {
    try {
      fn(skinId);
    } catch {}
  }
}

export function onHeroImageReady(fn) {
  if (typeof fn !== 'function') return () => {};
  readyListeners.add(fn);
  return () => readyListeners.delete(fn);
}

export function resolveHeroSkinAssetKey(heroId = 'zhou', skinId = null) {
  return normalizeHeroSkinId(heroId || 'zhou', skinId);
}

function ensureEntry(key) {
  if (!HAS_DOM_IMAGE || !key) return null;
  let ent = entries.get(key);
  if (ent) return ent;
  const img = new Image();
  img.decoding = 'async';
  ent = {
    key,
    img,
    ready: false,
    failed: false,
    promise: null,
  };
  ent.promise = new Promise((resolve) => {
    img.onload = () => {
      ent.ready = img.naturalWidth > 0 && img.naturalHeight > 0;
      notifyReady(key);
      resolve(ent.ready ? img : null);
    };
    img.onerror = () => {
      ent.failed = true;
      resolve(null);
    };
  });
  img.src = `${HERO_ASSET_DIR}${key}.webp`;
  if (img.complete && img.naturalWidth > 0) {
    ent.ready = true;
  }
  entries.set(key, ent);
  return ent;
}

export function getHeroImage(heroId = 'zhou', skinId = null) {
  if (!HAS_DOM_IMAGE) return null;
  const key = resolveHeroSkinAssetKey(heroId, skinId);
  const ent = ensureEntry(key);
  if (!ent || !ent.ready) return null;
  return ent.img;
}

export function isHeroImageReady(heroId = 'zhou', skinId = null) {
  return Boolean(getHeroImage(heroId, skinId));
}

export function preloadHeroSkinImage(heroId = 'zhou', skinId = null) {
  if (!HAS_DOM_IMAGE) return Promise.resolve(null);
  const key = resolveHeroSkinAssetKey(heroId, skinId);
  const ent = ensureEntry(key);
  return ent ? ent.promise : Promise.resolve(null);
}

export function preloadAllHeroImages(timeoutMs = 2500) {
  if (!HAS_DOM_IMAGE) return Promise.resolve();
  if (!preloadAllPromise) {
    const tasks = HERO_SKIN_IDS.map((id) => {
      const ent = ensureEntry(id);
      return ent ? ent.promise : Promise.resolve(null);
    });
    preloadAllPromise = Promise.allSettled(tasks);
  }
  if (!(timeoutMs > 0)) return preloadAllPromise;
  return Promise.race([
    preloadAllPromise,
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

function makeOffscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function getHalfStepCanvas(key, img) {
  const halfKey = `half:${key}`;
  let c = mipCache.get(halfKey);
  if (c) return c;
  const hw = Math.max(1, Math.round(img.naturalWidth * 0.5));
  const hh = Math.max(1, Math.round(img.naturalHeight * 0.5));
  c = makeOffscreen(hw, hh);
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, hw, hh);
  }
  mipCache.set(halfKey, c);
  return c;
}

function getBakedMip(key, img, targetPxH, flash = false) {
  const qH = Math.max(36, Math.min(360, Math.ceil(targetPxH / 16) * 16));
  if (qH >= 320 && !flash) {
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  }
  const cacheKey = `${key}|${qH}|${flash ? 1 : 0}`;
  let hit = mipCache.get(cacheKey);
  if (hit) return hit;

  const aspect = img.naturalWidth / img.naturalHeight;
  const cw = Math.max(1, Math.round(qH * aspect));
  const ch = qH;
  const src = qH <= 180 ? getHalfStepCanvas(key, img) : img;
  const c = makeOffscreen(cw, ch);
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, cw, ch);
    if (flash) {
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.8;
      g.fillStyle = VERM;
      g.fillRect(0, 0, cw, ch);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }
  hit = { source: c, w: cw, h: ch };
  mipCache.set(cacheKey, hit);
  return hit;
}

/** 计算局内走动/待机呼吸姿态参数 */
export function computeHeroMotion(clock = 0, moving = false, flip = 1) {
  if (moving) {
    const ph = clock * 11.2;
    const s = Math.sin(ph);
    const bounce = Math.abs(s);
    const squashY = 1 + bounce * 0.042 - (1 - bounce) * 0.022;
    return {
      bob: -bounce * 2.2,
      lean: 0.05 * flip + s * 0.032,
      squashX: 1 / Math.sqrt(squashY),
      squashY,
    };
  }
  const br = Math.sin(clock * 2.4);
  return {
    bob: br * 0.45,
    lean: Math.sin(clock * 1.3) * 0.01,
    squashX: 1 - br * 0.011,
    squashY: 1 + br * 0.016,
  };
}

/**
 * 在 (x, y) 脚底锚点处绘制立绘角色；若贴图尚未就绪返回 false，调用方可无缝回退程序化小人。
 */
export function drawHeroImage(ctx, {
  heroId = 'zhou',
  skinId = null,
  x = 0,
  y = 0,
  logicalH = 56,
  scale = 1,
  flip = 1,
  lean = 0,
  squashX = 1,
  squashY = 1,
  flash = false,
  alpha = 1,
} = {}) {
  if (!ctx || alpha <= 0) return false;
  const key = resolveHeroSkinAssetKey(heroId, skinId);
  const img = getHeroImage(heroId, skinId);
  if (!img) return false;

  const drawH = logicalH * scale;
  const drawW = drawH * (img.naturalWidth / img.naturalHeight);
  let ctxScale = 1;
  if (typeof ctx.getTransform === 'function') {
    const m = ctx.getTransform();
    ctxScale = Math.max(1, Math.min(3, Math.hypot(m.a, m.b) || 1));
  } else if (typeof window !== 'undefined') {
    ctxScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  }
  const mip = getBakedMip(key, img, drawH * ctxScale, flash);

  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (lean) ctx.rotate(lean);
  ctx.scale((flip < 0 ? -1 : 1) * squashX, squashY);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mip.source, -drawW * 0.5, -drawH * FOOT_ANCHOR_RATIO, drawW, drawH);
  ctx.restore();
  return true;
}

const BOSS_ASSET_IDS = new Set(['horse', 'umbrella', 'youshen', 'hebo_wedding']);
const bossEntries = new Map();

function ensureBossEntry(bossType) {
  if (!HAS_DOM_IMAGE || !BOSS_ASSET_IDS.has(bossType)) return null;
  let ent = bossEntries.get(bossType);
  if (ent) return ent;
  const img = new Image();
  img.decoding = 'async';
  ent = { img, ready: false };
  img.onload = () => {
    ent.ready = img.naturalWidth > 0 && img.naturalHeight > 0;
    notifyReady(`boss_${bossType}`);
  };
  img.src = `assets/bosses/boss_${bossType}.webp`;
  if (img.complete && img.naturalWidth > 0) ent.ready = true;
  bossEntries.set(bossType, ent);
  return ent;
}

/** 绘制四大夜主高精木版立绘；未加载完成或 Node 单测时返回 false 回退程序化精灵 */
export function drawBossImage(ctx, {
  bossType,
  x = 0,
  y = 0,
  logicalH = 96,
  sx = 1,
  sy = 1,
  rot = 0,
  flash = false,
  alpha = 1,
} = {}) {
  if (!ctx || alpha <= 0 || !BOSS_ASSET_IDS.has(bossType)) return false;
  const ent = ensureBossEntry(bossType);
  if (!ent || !ent.ready) return false;
  const img = ent.img;
  const flip = sx < 0 ? -1 : 1;
  const absSx = Math.abs(sx);
  const drawH = logicalH * sy;
  const drawW = (logicalH * (img.naturalWidth / img.naturalHeight)) * absSx;
  let ctxScale = 1;
  if (typeof ctx.getTransform === 'function') {
    const m = ctx.getTransform();
    ctxScale = Math.max(1, Math.min(3, Math.hypot(m.a, m.b) || 1));
  }
  const mip = getBakedMip(`boss_${bossType}`, img, drawH * ctxScale, flash);

  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(flip, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mip.source, -drawW * 0.5, -drawH * (378 / 384), drawW, drawH);
  ctx.restore();
  return true;
}
