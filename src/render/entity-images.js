// 战场百鬼、奇遇神龛、街巷民俗机关与标题主视觉木刻贴图加载器（浏览器端按需懒加载 + 半分辨率缩略缓存 + 朱砂受击闪白；Node 单测自动回退）
import { VERM, LANTERN } from './palette.js';

const HAS_DOM_IMAGE = typeof Image !== 'undefined' && typeof document !== 'undefined';

export const REGULAR_ENEMY_ASSET_IDS = new Set([
  'paperkid', 'shade', 'lanternghost', 'weasel', 'sedan', 'drowned',
  'suona', 'paperbride', 'cinder', 'archer_ghost', 'firecracker_boy', 'twin_paper',
  'shaman', 'water_lurker', 'paper_raft', 'water_puller',
]);

export const SHRINE_ASSET_IDS = new Set(['altar', 'trial', 'peddler']);
export const HAZARD_ASSET_IDS = new Set(['hazard_barrel', 'hazard_bell', 'hazard_seal']);

const imageMap = new Map();
const mipCache = new Map();
let entityDpr = 1;

export function setEntitySpriteScale(s) {
  entityDpr = Math.max(1, Math.min(2, Number(s) || 1));
}

function ensureImage(cacheKey, url) {
  if (!HAS_DOM_IMAGE) return null;
  let ent = imageMap.get(cacheKey);
  if (ent) return ent;
  const img = new Image();
  img.decoding = 'async';
  ent = { img, ready: false, failed: false };
  img.onload = () => {
    ent.ready = img.naturalWidth > 0 && img.naturalHeight > 0;
  };
  img.onerror = () => {
    ent.failed = true;
  };
  img.src = url;
  if (img.complete && img.naturalWidth > 0) ent.ready = true;
  imageMap.set(cacheKey, ent);
  return ent;
}

function makeOffscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function getBakedMip(cacheKey, img, targetPxH, flash = false, flipped = false) {
  const qh = Math.max(24, Math.min(220, Math.round(targetPxH / 8) * 8));
  const key = `${cacheKey}@${qh}${flipped ? ':L' : ':R'}${flash ? ':F' : ''}`;
  const hit = mipCache.get(key);
  if (hit) return hit;

  const aspect = img.naturalWidth / img.naturalHeight;
  const pw = Math.max(1, Math.round(qh * aspect));
  const c = makeOffscreen(pw, qh);
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = true;
    if (flipped) {
      g.translate(pw, 0);
      g.scale(-1, 1);
    }
    g.drawImage(img, 0, 0, pw, qh);
    if (flipped) g.setTransform(1, 0, 0, 1, 0, 0);
    if (flash) {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.62;
      g.fillStyle = VERM;
      g.fillRect(0, 0, pw, qh);
      g.globalAlpha = 0.25;
      g.fillStyle = LANTERN;
      g.fillRect(0, 0, pw, qh);
      g.restore();
    }
  }
  if (mipCache.size > 380) mipCache.clear();
  mipCache.set(key, c);
  return c;
}

/** 16 种常驻/水路邪祟差异化程序步态参数（5 类动作骨架） */
export function computeEnemyGait(type, clock, id = 0, s = 1) {
  if (type === 'paperkid' || type === 'twin_paper' || type === 'firecracker_boy') {
    // 纸扎蹦跳骨架：干脆折纸抛物线起落 + 左右折角摆动
    const ph = clock * 8.6 + id * 0.7;
    const hop = Math.abs(Math.sin(ph));
    return {
      oy: -hop * 3.0 * s,
      rot: Math.cos(ph) * 0.08,
      gx: 1 + (1 - hop) * 0.04,
      gy: 1 + hop * 0.05 - (1 - hop) * 0.03,
    };
  }
  if (type === 'shade' || type === 'lanternghost' || type === 'paperbride' || type === 'shaman') {
    // 幽魂悬飘骨架：阴柔正弦浮沉 + 衣袂轻摆
    return {
      oy: -2.2 - Math.sin(clock * 3.1 + id) * 2.0 * s,
      rot: Math.sin(clock * 2.3 + id * 0.6) * 0.055,
      gx: 1,
      gy: 1 + Math.cos(clock * 3.1 + id) * 0.025,
    };
  }
  if (type === 'weasel' || type === 'cinder') {
    // 扑跃敏捷骨架：伏地奔袭弹性伸缩
    const ph = clock * 10.2 + id * 0.9;
    const str = Math.sin(ph);
    return {
      oy: -Math.max(0, str) * 2.1 * s,
      rot: str * 0.06,
      gx: 1 + str * 0.05,
      gy: 1 - str * 0.04,
    };
  }
  if (type === 'drowned' || type === 'water_lurker' || type === 'paper_raft' || type === 'water_puller') {
    // 水路浮潜骨架：水波晃动与湿沉呼吸
    const ph = clock * 3.8 + id * 0.5;
    return {
      oy: Math.sin(ph) * 1.4 * s,
      rot: Math.cos(ph * 0.8) * 0.045,
      gx: 1 + Math.sin(ph) * 0.025,
      gy: 1 - Math.sin(ph) * 0.02,
    };
  }
  // 抬轿纸人 / 吹鼓鬼 / 纸射手：稳重颠轿巡街步
  const ph = clock * 6.4 + id * 0.5;
  return {
    oy: -Math.abs(Math.sin(ph)) * 1.6 * s,
    rot: Math.sin(ph * 0.5) * 0.04,
    gx: 1,
    gy: 1 + Math.abs(Math.sin(ph)) * 0.025,
  };
}

/** 绘制 16 种普通/精英邪祟木刻立绘；未加载就绪时返回 false 回退原矢量绘制 */
export function drawRegularEnemyImage(ctx, {
  enemyType,
  x = 0,
  y = 0,
  baseR = 12,
  sx = 1,
  sy = 1,
  rot = 0,
  flash = false,
  alpha = 1,
  fastBlit = false,
} = {}) {
  if (!ctx || alpha <= 0 || !REGULAR_ENEMY_ASSET_IDS.has(enemyType)) return false;
  const ent = ensureImage(`enemy_${enemyType}`, `assets/enemies/enemy_${enemyType}.webp`);
  if (!ent || !ent.ready) return false;
  const img = ent.img;

  const logicalH = 34 + (baseR - 10) * 2.25;
  const flipped = sx < 0;
  const absSx = Math.abs(sx);
  const drawH = logicalH * sy;
  const drawW = (logicalH * (img.naturalWidth / img.naturalHeight)) * absSx;
  // 以无步态抖动的基准高度查缩略缓存，杜绝每帧呼吸缩放引发缓存重建
  const mip = getBakedMip(`enemy_${enemyType}`, img, logicalH * entityDpr, flash, flipped);

  if (fastBlit || Math.abs(rot) < 0.02) {
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;
    ctx.drawImage(mip, x - drawW * 0.5, y - drawH * (164 / 168), drawW, drawH);
    if (alpha !== 1) ctx.globalAlpha = prevAlpha;
    return true;
  }

  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(mip, -drawW * 0.5, -drawH * (164 / 168), drawW, drawH);
  ctx.restore();
  return true;
}

/** 绘制三座街角奇遇神龛木刻立绘（香案 / 试炼碑 / 鬼市货郎） */
export function drawShrineImage(ctx, {
  kind,
  x = 0,
  y = 0,
  logicalH = 68,
  scale = 1,
  used = false,
  alpha = 1,
} = {}) {
  if (!ctx || alpha <= 0 || !SHRINE_ASSET_IDS.has(kind)) return false;
  const ent = ensureImage(`shrine_${kind}`, `assets/shrines/shrine_${kind}.webp`);
  if (!ent || !ent.ready) return false;
  const img = ent.img;
  const drawH = logicalH * scale;
  const drawW = drawH * (img.naturalWidth / img.naturalHeight);
  const mip = getBakedMip(`shrine_${kind}`, img, drawH * 2, false);

  ctx.save();
  ctx.globalAlpha *= alpha * (used ? 0.52 : 1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mip, x - drawW * 0.5, y - drawH * (180 / 184), drawW, drawH);
  ctx.restore();
  return true;
}

/** 绘制三类街巷可交互民俗机关木刻立绘（爆竹火桶 / 招魂铜铃 / 定魂敕符桩） */
export function drawHazardImage(ctx, {
  kind,
  x = 0,
  y = 0,
  clock = 0,
  id = 0,
  alpha = 1,
} = {}) {
  if (!ctx || alpha <= 0 || !HAZARD_ASSET_IDS.has(kind)) return false;
  const ent = ensureImage(kind, `assets/props/${kind}.webp`);
  if (!ent || !ent.ready) return false;
  const img = ent.img;
  const logicalH = kind === 'hazard_seal' ? 50 : 46;
  const drawH = logicalH;
  const drawW = drawH * (img.naturalWidth / img.naturalHeight);
  const mip = getBakedMip(kind, img, drawH * 2, false);
  const rot = kind === 'hazard_bell' ? Math.sin(clock * 3.4 + id) * 0.05 : 0;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mip, -drawW * 0.5, -drawH * (144 / 148), drawW, drawH);
  if (kind === 'hazard_barrel') {
    // 桶顶引信暖金火星闪烁
    const sp = 2.0 + Math.sin(clock * 22 + id) * 1.1;
    ctx.fillStyle = LANTERN;
    ctx.beginPath();
    ctx.arc(4, -drawH * 0.88, Math.max(1.2, sp), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return true;
}

let titleBgAllowAt = 0;

/** 懒加载标题首屏《五更巡街夜行图》竖版木刻主视觉（避让首屏 DOM 挂载关键 120ms 窗口） */
export function getTitleBackdropImage() {
  if (!HAS_DOM_IMAGE) return null;
  const now = typeof performance !== 'undefined' ? performance.now() : 999;
  if (!titleBgAllowAt) titleBgAllowAt = now + 120;
  if (now < titleBgAllowAt && !imageMap.has('title_bg')) return null;
  const ent = ensureImage('title_bg', 'assets/ui/title-bg.webp');
  return ent && ent.ready ? ent.img : null;
}
