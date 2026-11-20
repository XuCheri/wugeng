// sprites.js —— 程序绘制的角色 / 敌人 / Boss / 拾取物 / 场景物件 / 武器弹体
// 所有精灵预渲染到离屏 Canvas（按 类型|帧|受击闪 缓存），运行时只做 drawImage + 变换。
// 坐标约定：精灵锚点 (0,0) 在脚底中心，y 向上为负。单位 = CSS 像素。
import { INK, VERM, VERM_DARK, PAPER, PAPER_SHADE, LANTERN, inkA, paperA, vermA } from './palette.js';
import { makeCanvas, makeRng, hashStr, withMisreg, printSpeckle, brushStroke, arcPoints, blobPath, splatter } from './ink.js';
import { setGlyphScale } from './glyphs.js';

const TAU = Math.PI * 2;
const LW = 1.4; // 统一描边粗细（普通敌人）

let SCALE = 2;
const cache = new Map();

/** 设置精灵烘焙分辨率（= dpr）。变化时清空缓存 */
export function setSpriteScale(s) {
  const v = Math.max(1, Math.min(3, s));
  if (v !== SCALE) {
    SCALE = v;
    cache.clear();
  }
  setGlyphScale(v);
}
export function clearSpriteCache() {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* 绘制小工具                                                          */
/* ------------------------------------------------------------------ */

function ink(g, lw = LW, color = INK) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.lineCap = 'round';
}
function poly(g, pts, close = true) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) g.moveTo(p[0], p[1]);
    else g.lineTo(p[0], p[1]);
  }
  if (close) g.closePath();
}
function circ(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}
function ell(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
}
function fs(g, fill, lw = LW) {
  g.fillStyle = fill;
  g.fill();
  ink(g, lw);
  g.stroke();
}
/** 朱红层（套色错位）填充：pathFn 负责建立路径 */
function vfill(g, pathFn, color = VERM) {
  withMisreg(g, () => {
    pathFn();
    g.fillStyle = color;
    g.fill();
  });
}
function line(g, x0, y0, x1, y1, lw = LW, color = INK) {
  ink(g, lw, color);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
/** 镂空（剪纸挖洞）：露出下面的地面 */
function cut(g, pathFn) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  pathFn();
  g.fillStyle = '#000';
  g.fill();
  g.restore();
}
function almond(g, x, y, w, h, tilt) {
  g.beginPath();
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.moveTo(-w / 2, 0);
  g.quadraticCurveTo(0, -h, w / 2, 0);
  g.quadraticCurveTo(0, h * 0.6, -w / 2, 0);
  g.restore();
}

/* ------------------------------------------------------------------ */
/* 缓存                                                                */
/* ------------------------------------------------------------------ */

function bake(key, w, h, ax, ay, drawFn, opts = {}) {
  let s = cache.get(key);
  if (s) return s;
  const c = makeCanvas(w * SCALE, h * SCALE);
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  g.save();
  g.translate(ax, ay);
  const rng = makeRng(hashStr(key.split('|')[0]) + 7);
  drawFn(g, rng);
  g.restore();
  if (opts.speckle !== false) printSpeckle(g, w, h, makeRng(hashStr(key) + 3), opts.speckle ?? 0.006, 0.7);
  if (opts.flash) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = vermA(0.82);
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  s = { canvas: c, w, h, ax, ay };
  cache.set(key, s);
  return s;
}

/** 绘制已缓存精灵：(x,y) 为锚点位置 */
export function blit(ctx, spr, x, y, sx = 1, sy = 1, rot = 0, alpha = 1) {
  if (alpha <= 0) return;
  if (rot === 0 && sx === 1 && sy === 1 && alpha === 1) {
    ctx.drawImage(spr.canvas, x - spr.ax, y - spr.ay, spr.w, spr.h);
    return;
  }
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(spr.canvas, -spr.ax, -spr.ay, spr.w, spr.h);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 英雄                                                                */
/* ------------------------------------------------------------------ */

const HERO_HAND = { x: 7.5, y: -12 };
export function heroHand() {
  return HERO_HAND;
}

function heroLegs(g, f) {
  const s = [0, 1, 0, -1][f];
  ink(g, 2.3);
  g.beginPath();
  g.moveTo(-2.2, -8);
  g.lineTo(-2.6 + s * 1.8, -0.4 - (s > 0 ? 1 : 0));
  g.moveTo(2.2, -8);
  g.lineTo(2.6 - s * 1.8, -0.4 - (s < 0 ? 1 : 0));
  g.stroke();
}

function heroRobe(g, sashColor = VERM, outfit = null) {
  // 墨色短褂（更簿第 7 天外观只在宣纸/墨/朱红本色板内变化肌理与剪裁）
  const robeFill = outfit === 'outfit_hemp' ? PAPER_SHADE : outfit === 'outfit_straw' ? PAPER : INK;
  poly(g, [[-4.6, -20], [4.6, -20], [6.6, -6.5], [0, -5.5], [-6.6, -6.5]]);
  g.fillStyle = robeFill;
  g.fill();
  ink(g, 1.1);
  g.stroke();
  if (outfit === 'outfit_straw') {
    // 蓑衣草纹
    ink(g, 0.7, inkA(0.65));
    for (const y of [-17, -13.5, -10]) {
      for (const x of [-4, -1.5, 1.5, 4]) line(g, x, y, x * 1.15, y + 2.4, 0.7, inkA(0.65));
    }
  } else if (outfit === 'outfit_indigo' || outfit === 'outfit_ink') {
    // 长衫下摆墨边
    poly(g, [[-6.8, -6.8], [6.8, -6.8], [7.2, -3.8], [-7.2, -3.8]]);
    fs(g, outfit === 'outfit_ink' ? INK : PAPER_SHADE, 0.9);
  }
  // 前伸提灯的手臂
  ink(g, 2.6);
  g.beginPath();
  g.moveTo(3, -18);
  g.quadraticCurveTo(6.5, -16, HERO_HAND.x, HERO_HAND.y);
  g.stroke();
  // 腰带（朱红，错位）
  vfill(g, () => poly(g, [[-6.1, -12.6], [6.1, -12.2], [6.3, -10.4], [-6.3, -10.6]]), sashColor);
  vfill(g, () => poly(g, [[-4.6, -11], [-3.3, -11], [-4.4, -6.6], [-5.8, -7]]), sashColor);
  // 领口宣纸色
  ink(g, 1, robeFill === INK ? PAPER : INK);
  g.beginPath();
  g.moveTo(-2.4, -19.6);
  g.lineTo(0, -16.6);
  g.lineTo(2.4, -19.6);
  g.stroke();
}

function drawZhou(g, rng, f, outfit) {
  // 背后的更锣
  circ(g, -6.8, -16.5, 5);
  fs(g, PAPER_SHADE, 1.2);
  circ(g, -6.8, -16.5, 2.2);
  ink(g, 0.9);
  g.stroke();
  heroLegs(g, f);
  heroRobe(g, VERM, outfit);
  // 头
  circ(g, 0, -22.4, 3.7);
  fs(g, PAPER, 1.1);
  g.fillStyle = INK;
  circ(g, 1.6, -21.6, 0.65);
  g.fill();
  circ(g, -1.2, -21.6, 0.65);
  g.fill();
  // 斗笠
  g.beginPath();
  g.moveTo(-12, -23.2);
  g.quadraticCurveTo(-5, -30, 0, -34);
  g.quadraticCurveTo(5, -30, 12, -23.2);
  g.quadraticCurveTo(0, -21.4, -12, -23.2);
  g.closePath();
  fs(g, PAPER_SHADE, 1.3);
  ink(g, 0.7, inkA(0.6));
  g.beginPath();
  for (const x of [-7.5, -3.8, 0, 3.8, 7.5]) {
    g.moveTo(0, -33.2);
    g.lineTo(x, -22.6 + Math.abs(x) * -0.06);
  }
  g.stroke();
  // 斗笠帽顶
  circ(g, 0, -34, 1.1);
  g.fillStyle = INK;
  g.fill();
}

function drawMian(g, rng, f, outfit) {
  // 背后的剪刀
  ink(g, 1.2);
  g.beginPath();
  g.moveTo(-8, -26);
  g.lineTo(-3, -14);
  g.moveTo(-3.5, -26.5);
  g.lineTo(-6.5, -14);
  g.stroke();
  circ(g, -3.2, -12.8, 1.6);
  ink(g, 1);
  g.stroke();
  circ(g, -6.9, -12.8, 1.6);
  g.stroke();
  heroLegs(g, f);
  heroRobe(g, VERM, outfit);
  // 朱红围裙
  vfill(g, () => poly(g, [[-3.6, -10.4], [3.6, -10.2], [4.4, -5.6], [-4.4, -5.8]]));
  // 头
  circ(g, 0, -22.6, 4.1);
  fs(g, PAPER, 1.1);
  // 刘海 + 双髻
  g.beginPath();
  g.arc(0, -22.6, 4.1, Math.PI * 1.02, Math.PI * 1.98);
  g.quadraticCurveTo(1, -23.6, -4.1, -22.4);
  g.fillStyle = INK;
  g.fill();
  circ(g, -4.6, -27, 2.4);
  g.fill();
  circ(g, 4.6, -27, 2.4);
  g.fill();
  // 发髻上的朱红头绳
  vfill(g, () => {
    g.beginPath();
    g.rect(-5.6, -25.4, 2.2, 1);
    g.rect(3.6, -25.4, 2.2, 1);
  });
  g.fillStyle = INK;
  circ(g, 1.6, -21.6, 0.6);
  g.fill();
  circ(g, -1.2, -21.6, 0.6);
  g.fill();
  vfill(g, () => {
    g.beginPath();
    g.arc(2.6, -20.4, 0.9, 0, TAU);
    g.arc(-2.4, -20.4, 0.9, 0, TAU);
  });
}

function drawDaotong(g, rng, f, outfit) {
  // 背后的桃木剑（朱红）
  vfill(g, () => poly(g, [[-9, -30], [-7.6, -30.6], [-1.5, -12.5], [-2.8, -12]]));
  line(g, -6.2, -18.6, -3.4, -19.8, 1.4);
  heroLegs(g, f);
  heroRobe(g, VERM, outfit);
  // 宣纸色交领
  ink(g, 1.2, PAPER);
  g.beginPath();
  g.moveTo(-3.4, -19.4);
  g.lineTo(2.2, -13);
  g.moveTo(3.4, -19.4);
  g.lineTo(-0.6, -15.2);
  g.stroke();
  circ(g, 0, -22, 3.7);
  fs(g, PAPER, 1.1);
  g.fillStyle = INK;
  circ(g, 1.5, -21.2, 0.6);
  g.fill();
  circ(g, -1.2, -21.2, 0.6);
  g.fill();
  // 混元巾（黑道冠）+ 发髻簪
  g.beginPath();
  g.moveTo(-4.4, -23.4);
  g.quadraticCurveTo(-4.8, -29.6, 0, -30);
  g.quadraticCurveTo(4.8, -29.6, 4.4, -23.4);
  g.quadraticCurveTo(0, -24.8, -4.4, -23.4);
  g.fillStyle = INK;
  g.fill();
  line(g, -3, -30.6, 3.2, -30.2, 1.1);
  vfill(g, () => {
    circ(g, 0, -31.2, 1.2);
  });
}

/** 手提灯笼（单独精灵，运行时以手为轴摆动） */
function drawHandLantern(g, style = null) {
  line(g, 0, 0, 0, 2.6, 0.8);
  const bodyFill = style === 'lantern_cinnabar' ? VERM : style === 'lantern_plain' ? PAPER : LANTERN;
  if (style === 'lantern_lotus') {
    // 莲瓣灯罩
    for (const dx of [-3.2, 0, 3.2]) {
      ell(g, dx, 7.2, 2.4, 4.4, dx * 0.08);
      fs(g, LANTERN, 0.9);
    }
    vfill(g, () => poly(g, [[-3.6, 10.2], [0, 12.2], [3.6, 10.2]]));
  } else if (style === 'lantern_carp') {
    // 鲤鱼灯
    poly(g, [[-4.2, 6.5], [1.5, 3.4], [4.6, 7], [1.5, 10.6]]);
    fs(g, LANTERN, 1);
    vfill(g, () => poly(g, [[-4.2, 6.5], [-6.4, 4.2], [-5.8, 8.8]]));
    circ(g, 2.4, 6.4, 0.7);
    g.fillStyle = INK;
    g.fill();
  } else {
    ell(g, 0, 7, 4.4, 4.6);
    g.fillStyle = bodyFill;
    g.fill();
    ink(g, 1);
    g.stroke();
    ink(g, 0.6, style === 'lantern_cinnabar' ? paperA(0.7) : inkA(0.55));
    g.beginPath();
    g.ellipse(0, 7, 1.8, 4.5, 0, 0, TAU);
    g.stroke();
  }
  g.fillStyle = INK;
  g.fillRect(-2.6, 2.2, 5.2, 1.4);
  g.fillRect(-2.6, 10.6, 5.2, 1.3);
  vfill(g, () => poly(g, [[-0.6, 11.9], [0.6, 11.9], [0.9, 15.4], [-0.9, 15.4]]));
}

const HEROES = { zhou: drawZhou, mian: drawMian, daotong: drawDaotong };

export function heroSprite(heroId, frame = 0, flash = false, outfit = null) {
  const fn = HEROES[heroId] || drawZhou;
  return bake(`hero_${heroId}|${outfit || ''}|${frame}|${flash ? 1 : 0}`, 36, 46, 18, 42, (g, r) => fn(g, r, frame, outfit), { flash, speckle: 0.003 });
}
export function handLanternSprite(style = null) {
  return bake(`handlantern|${style || '0'}`, 16, 20, 8, 2, (g) => drawHandLantern(g, style), { speckle: 0.002 });
}

/* ------------------------------------------------------------------ */
/* 敌人                                                                */
/* ------------------------------------------------------------------ */

function drawPaperkid(g, rng, f) {
  // 纸扎童子：宣纸身体 + 墨线 + 朱红腮红（扎纸人的特征）
  const hop = f % 2;
  // 腿
  poly(g, [[-4.4, -7], [-1.2, -7], [-1.4, -0.2 - hop], [-4.2, -0.2 - hop]]);
  fs(g, PAPER, 1.1);
  poly(g, [[1.2, -7], [4.4, -7], [4.2, -0.2 - (1 - hop)], [1.4, -0.2 - (1 - hop)]]);
  fs(g, PAPER, 1.1);
  // 僵直的袖子
  poly(g, [[-5.2, -18.4], [-11, -11.2], [-8.6, -9.4], [-4.6, -14]]);
  fs(g, PAPER, 1.2);
  poly(g, [[5.2, -18.4], [11, -11.2], [8.6, -9.4], [4.6, -14]]);
  fs(g, PAPER, 1.2);
  // 袍身
  poly(g, [[-5.8, -19.2], [5.8, -19.2], [8.2, -6], [-8.2, -6]]);
  fs(g, PAPER, 1.3);
  // 下摆朱红宽边 + 胸口朱红团花
  vfill(g, () => poly(g, [[-7.7, -8.8], [7.7, -8.8], [8.2, -6], [-8.2, -6]]));
  vfill(g, () => {
    g.beginPath();
    g.moveTo(0, -16.2);
    g.lineTo(2.2, -14);
    g.lineTo(0, -11.8);
    g.lineTo(-2.2, -14);
    g.closePath();
  });
  poly(g, [[-5.8, -19.2], [5.8, -19.2], [8.2, -6], [-8.2, -6]]);
  ink(g, 1.3);
  g.stroke();
  // 竹篾骨架缝
  ink(g, 0.6, inkA(0.45));
  g.beginPath();
  g.moveTo(-6.8, -12.5);
  g.lineTo(6.8, -12.5);
  g.stroke();
  // 头
  circ(g, 0, -24.6, 6.1);
  fs(g, PAPER, 1.3);
  // 墨发：锅盖头 + 两个小髻
  g.beginPath();
  g.arc(0, -24.6, 6.1, Math.PI * 1.03, Math.PI * 1.97);
  g.lineTo(5.6, -26.6);
  g.lineTo(-5.6, -26.6);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  circ(g, -4.6, -30.4, 2.1);
  g.fill();
  circ(g, 4.6, -30.4, 2.1);
  g.fill();
  // 腮红（错位朱红）
  vfill(g, () => {
    g.beginPath();
    g.arc(-3.3, -22.6, 1.55, 0, TAU);
    g.arc(3.3, -22.6, 1.55, 0, TAU);
  });
  // 眯眼 + 小口
  ink(g, 1);
  g.beginPath();
  g.moveTo(-3, -24.6);
  g.quadraticCurveTo(-2, -25.4, -1, -24.6);
  g.moveTo(1, -24.6);
  g.quadraticCurveTo(2, -25.4, 3, -24.6);
  g.stroke();
  vfill(g, () => {
    g.beginPath();
    g.ellipse(0, -21.4, 0.9, 0.7, 0, 0, TAU);
  });
}

function drawShade(g, rng, f) {
  // 影祟：一缕浓墨，尾部随帧飘动；镂空的眼
  const p = (f / 4) * TAU;
  const w1 = Math.sin(p) * 2.2;
  const w2 = Math.sin(p + 2.1) * 2.2;
  const w3 = Math.sin(p + 4.2) * 2.2;
  g.beginPath();
  g.moveTo(0, -31);
  g.bezierCurveTo(6.5, -31, 8.6, -25, 8, -19);
  g.bezierCurveTo(7.6, -13, 9.5, -8, 6 + w1, -1.5);
  g.quadraticCurveTo(4, -5, 2.4 + w2 * 0.5, -6.4);
  g.quadraticCurveTo(1.2, -2, -1.4 + w2, 0.6);
  g.quadraticCurveTo(-2.8, -4.6, -4.4, -5.2);
  g.quadraticCurveTo(-6.4, -3, -9.6 + w3, -2.4);
  g.bezierCurveTo(-7.6, -9, -8.6, -14, -8, -19);
  g.bezierCurveTo(-8.6, -25, -6.5, -31, 0, -31);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  // 两缕细手
  brushStroke(g, [[-7.6, -17], [-11.4, -13.6 + w1 * 0.4], [-12.6, -10.4]], 2.6, { seed: 3 + f, dry: 0.1, taperIn: 0.05 });
  brushStroke(g, [[7.4, -17], [11.4, -14 + w3 * 0.4], [12.6, -11]], 2.6, { seed: 9 + f, dry: 0.1, taperIn: 0.05 });
  // 镂空的眼：斜吊
  cut(g, () => {
    almond(g, -3.1, -22.4, 4.2, 2.4, 0.3);
    g.closePath();
    almond(g, 3.1, -22.4, 4.2, 2.4, -0.3);
  });
}

function drawLanternghost(g, rng, f) {
  // 灯笼鬼：朱红纸灯笼，撕开的眼口
  // 提钩
  ink(g, 1.3);
  g.beginPath();
  g.moveTo(0, -33);
  g.lineTo(0, -36.5);
  g.arc(2, -36.5, 2, Math.PI, Math.PI * 1.9);
  g.stroke();
  // 灯身
  vfill(g, () => ell(g, 0, -20.5, 12.6, 11.6));
  ell(g, 0, -20.5, 12.6, 11.6);
  ink(g, 1.5);
  g.stroke();
  // 竹骨
  ink(g, 0.8, inkA(0.6));
  for (const rx of [4.2, 8.6]) {
    g.beginPath();
    g.ellipse(0, -20.5, rx, 11.4, 0, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.beginPath();
    g.ellipse(0, -20.5, rx, 11.4, 0, Math.PI / 2, Math.PI * 1.5);
    g.stroke();
  }
  // 上下灯口
  g.fillStyle = INK;
  g.fillRect(-6.2, -33.6, 12.4, 3.2);
  g.fillRect(-6, -10.6, 12, 3);
  // 撕开的眼口（露出宣纸）
  g.beginPath();
  g.moveTo(-7.2, -25.4);
  g.lineTo(-2, -23.4);
  g.lineTo(-6, -21.2);
  g.closePath();
  g.moveTo(7.2, -25.4);
  g.lineTo(2, -23.4);
  g.lineTo(6, -21.2);
  g.closePath();
  fs(g, PAPER, 1);
  g.beginPath();
  g.moveTo(-6.4, -17.4);
  g.lineTo(-4.4, -15.2);
  g.lineTo(-2.4, -17.2);
  g.lineTo(-0.4, -14.6);
  g.lineTo(1.8, -17.2);
  g.lineTo(3.8, -14.8);
  g.lineTo(6.2, -17.4);
  g.lineTo(4.8, -12.8);
  g.lineTo(-5, -12.8);
  g.closePath();
  fs(g, PAPER, 1);
  // 撕破一角
  poly(g, [[9.8, -27], [13.6, -25.6], [11.4, -23.2]]);
  fs(g, PAPER_SHADE, 0.9);
  // 流苏
  ink(g, 1);
  g.beginPath();
  const sway = [0, 1, 0, -1][f] * 0.8;
  for (let i = -2; i <= 2; i++) {
    g.moveTo(i * 1.4, -7.6);
    g.quadraticCurveTo(i * 1.4 + sway, -4, i * 1.7 + sway * 1.6, -0.8);
  }
  g.stroke();
}

function drawWeasel(g, rng, f) {
  // 黄皮子：直立的墨色剪影，朱红小围脖，镂空眼
  const s = [0, 1, 0, -1][f];
  // 大尾巴
  brushStroke(g, [[-2, -7], [-9, -9], [-12.6, -15], [-11, -22], [-7.6, -25.6]], 7, { seed: 5, dry: 0.28, taperIn: 0.25, taperOut: 0.45, startWidth: 0.7 });
  // 腿
  ink(g, 2.4);
  g.beginPath();
  g.moveTo(-1.6, -6);
  g.lineTo(-2.4 + s, -0.4);
  g.lineTo(-0.4 + s, -0.4);
  g.moveTo(2, -6);
  g.lineTo(2.8 - s, -0.4);
  g.lineTo(4.6 - s, -0.4);
  g.stroke();
  // 身体（前倾）
  g.beginPath();
  g.moveTo(-3.6, -5.2);
  g.bezierCurveTo(-5, -12, -2, -18, 2.6, -20.6);
  g.lineTo(6.6, -19);
  g.bezierCurveTo(6.6, -14, 5.6, -9, 4.6, -5);
  g.quadraticCurveTo(0.6, -3.6, -3.6, -5.2);
  g.fillStyle = INK;
  g.fill();
  // 前爪
  ink(g, 1.8);
  g.beginPath();
  g.moveTo(5, -15.4);
  g.lineTo(9, -15.8);
  g.lineTo(10, -17.6);
  g.stroke();
  // 头 + 尖嘴 + 耳
  g.beginPath();
  g.moveTo(1.4, -22);
  g.bezierCurveTo(1.6, -26.8, 6, -27.6, 8, -25.4);
  g.lineTo(12.2, -22.6);
  g.lineTo(7.6, -20.6);
  g.quadraticCurveTo(3.4, -19, 1.4, -22);
  g.fillStyle = INK;
  g.fill();
  poly(g, [[2.6, -25.2], [3, -29.4], [5.2, -26.6]]);
  g.fill();
  poly(g, [[5.4, -26.6], [7.2, -30], [8, -25.8]]);
  g.fill();
  // 朱红围脖
  vfill(g, () => poly(g, [[1.4, -20.8], [7.6, -19.6], [7.2, -17.6], [1.8, -18.6]]));
  vfill(g, () => poly(g, [[2, -19.6], [3.4, -19.2], [1.4, -14.6], [0.2, -15.4]]));
  // 镂空眼
  cut(g, () => almond(g, 7, -23.6, 2.8, 1.6, -0.35));
}

function drawSedan(g, rng, f) {
  // 纸轿子：朱红轿身、墨顶、窗里两只眼
  // 轿杠
  line(g, -26, -15, 26, -15, 2.4);
  // 轿身
  vfill(g, () => poly(g, [[-13.6, -38], [13.6, -38], [14.4, -9], [-14.4, -9]]));
  poly(g, [[-13.6, -38], [13.6, -38], [14.4, -9], [-14.4, -9]]);
  ink(g, 1.6);
  g.stroke();
  // 立柱
  g.fillStyle = INK;
  g.fillRect(-14.6, -38, 3, 29);
  g.fillRect(11.6, -38, 3, 29);
  // 窗：墨色，里面两只宣纸眼
  g.beginPath();
  g.rect(-6.4, -33.4, 12.8, 10.6);
  fs(g, INK, 1);
  ink(g, 0.8, PAPER_SHADE);
  g.beginPath();
  g.rect(-5.2, -32.2, 10.4, 8.2);
  g.stroke();
  g.fillStyle = PAPER;
  circ(g, -2.4, -28, 1.3);
  g.fill();
  circ(g, 2.4, -28, 1.3);
  g.fill();
  g.fillStyle = INK;
  circ(g, -2.1, -27.8, 0.55);
  g.fill();
  circ(g, 2.7, -27.8, 0.55);
  g.fill();
  // 帘子：宣纸 + 回纹
  g.beginPath();
  g.rect(-8.4, -21.2, 16.8, 10.8);
  fs(g, PAPER, 1);
  ink(g, 0.9, VERM);
  g.beginPath();
  g.rect(-5.6, -19, 11.2, 6.6);
  g.rect(-3, -17.2, 6, 3);
  g.stroke();
  // 帘下流苏
  ink(g, 0.9);
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = -7.6 + i * 3;
    g.moveTo(x, -10.4);
    g.lineTo(x + 0.4, -7.2);
  }
  g.stroke();
  // 底座
  g.fillStyle = INK;
  g.fillRect(-15.4, -10, 30.8, 3);
  // 轿顶：起翘的檐
  g.beginPath();
  g.moveTo(-20.5, -36.4);
  g.quadraticCurveTo(-16, -38.6, -13.6, -40);
  g.quadraticCurveTo(-6, -44, 0, -48.4);
  g.quadraticCurveTo(6, -44, 13.6, -40);
  g.quadraticCurveTo(16, -38.6, 20.5, -36.4);
  g.quadraticCurveTo(17, -36.2, 14.4, -37.2);
  g.lineTo(-14.4, -37.2);
  g.quadraticCurveTo(-17, -36.2, -20.5, -36.4);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  ink(g, 0.7, paperA(0.7));
  g.beginPath();
  g.moveTo(-11, -40);
  g.quadraticCurveTo(0, -45.2, 11, -40);
  g.stroke();
  circ(g, 0, -50.4, 2.1);
  g.fillStyle = INK;
  g.fill();
  vfill(g, () => {
    circ(g, 0, -50.6, 1);
  });
  // 角上垂下的朱红纸穗
  const sw = [0, 0.8, 0, -0.8][f];
  vfill(g, () => {
    poly(g, [[-19.6, -36.4], [-18.4, -36.4], [-18.6 + sw, -30], [-19.8 + sw, -30.4]]);
    poly(g, [[18.4, -36.4], [19.6, -36.4], [19.8 + sw, -30.4], [18.6 + sw, -30]]);
  });
}

function drawDrowned(g, rng, f) {
  // 水鬼：佝偻的墨影，湿发垂面，下身化成水滴
  const d = [0, 1, 2, 1][f];
  g.beginPath();
  g.moveTo(-3, -31);
  g.bezierCurveTo(4, -33, 8.6, -28, 8.6, -21);
  g.bezierCurveTo(9, -14, 8, -9, 7.4, -5);
  g.quadraticCurveTo(6.2, -2, 5, -4.4);
  g.quadraticCurveTo(3.6, 0.4, 1.8, -3.6);
  g.quadraticCurveTo(0, 1, -2, -3.8);
  g.quadraticCurveTo(-4, -1, -5.6, -4.4);
  g.quadraticCurveTo(-7.6, -2.6, -8, -6);
  g.bezierCurveTo(-9, -12, -9.4, -20, -8, -25);
  g.bezierCurveTo(-7, -29, -5.4, -30.6, -3, -31);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  // 前伸的手臂
  brushStroke(g, [[5, -20], [10, -18.4], [14.6, -15.6]], 3.2, { seed: 21, dry: 0.15, taperIn: 0.05, taperOut: 0.3, endWidth: 0.35 });
  ink(g, 0.9);
  g.beginPath();
  g.moveTo(14.4, -15.6);
  g.lineTo(15.4, -12.6);
  g.moveTo(13.6, -15.4);
  g.lineTo(13.8, -12.2);
  g.stroke();
  // 湿发：镂空的发丝
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 0.75;
  g.strokeStyle = '#000';
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x0 = -5 + i * 2.4;
    g.beginPath();
    g.moveTo(x0, -28.5);
    g.bezierCurveTo(x0 + 1.4, -24, x0 - 0.8, -19, x0 + 0.6 + (i % 2), -13 - (i % 3) * 1.4);
    g.stroke();
  }
  g.restore();
  // 一只露出的眼
  g.fillStyle = PAPER;
  circ(g, 4.6, -22.6, 1.5);
  g.fill();
  g.fillStyle = INK;
  circ(g, 5, -22.4, 0.6);
  g.fill();
  // 滴落的水
  g.fillStyle = INK;
  circ(g, -1, 1.6 + d, 0.8);
  g.fill();
  circ(g, 5.6, 0.4 + ((d + 1) % 3), 0.6);
  g.fill();
}

/* ------------------------------------------------------------------ */
/* Boss                                                                */
/* ------------------------------------------------------------------ */

function drawHorse(g, rng, f) {
  // 纸马将军：宣纸扎的马 + 墨甲将军 + 朱红靠旗
  const s = [0, 1, 0, -1][f] * 1.6;
  // 靠旗（背后）
  const flags = [[-26, -104], [-14, -110], [-30, -90]];
  for (const [tx, ty] of flags) {
    vfill(g, () => poly(g, [[-4, -70], [tx, ty], [tx + 9, ty + 6], [-1, -66]]));
    poly(g, [[-4, -70], [tx, ty], [tx + 9, ty + 6], [-1, -66]]);
    ink(g, 1.4);
    g.stroke();
  }
  // 马尾
  brushStroke(g, [[-27, -42], [-36, -38], [-40, -28], [-38, -20]], 7, { seed: 41, dry: 0.4, taperOut: 0.5 });
  // 腿（僵直的纸扎腿）
  const legs = [[-21, -2 * s], [-12, 2 * s], [15, 2 * s], [24, -2 * s]];
  for (const [lx, o] of legs) {
    poly(g, [[lx - 3, -32], [lx + 3, -32], [lx + 2.8 + o, -3], [lx - 2.8 + o, -3]]);
    fs(g, PAPER, 1.8);
    g.fillStyle = INK;
    g.fillRect(lx - 3.2 + o, -4, 6.4, 4);
  }
  // 马身
  ell(g, 0, -38, 29, 12.6);
  fs(g, PAPER, 2);
  // 竹篾缝
  ink(g, 0.9, inkA(0.45));
  g.beginPath();
  for (const x of [-16, -6, 4, 14]) {
    g.moveTo(x, -49);
    g.quadraticCurveTo(x + 2, -38, x, -26.5);
  }
  g.stroke();
  // 脖子 + 头
  poly(g, [[16, -45], [29, -68], [37, -66], [28, -34]]);
  fs(g, PAPER, 2);
  poly(g, [[28, -69], [36, -73], [49, -60], [46, -55], [33, -60]]);
  fs(g, PAPER, 2);
  // 耳
  poly(g, [[30, -70], [31, -78], [35, -71]]);
  fs(g, PAPER, 1.4);
  // 鬃毛
  ink(g, 2);
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = 18 + t * 12;
    const y = -46 - t * 22;
    g.moveTo(x, y);
    g.lineTo(x - 6, y - 2.5);
  }
  g.stroke();
  // 马眼、腮红、鼻孔
  g.fillStyle = INK;
  circ(g, 37.6, -64.6, 1.6);
  g.fill();
  vfill(g, () => circ(g, 40.4, -59.4, 2.2));
  circ(g, 46.4, -57.6, 0.9);
  g.fill();
  // 朱红鞍鞯 + 缰绳
  vfill(g, () => poly(g, [[-13, -50], [12, -50], [15, -30], [-15, -30]]));
  poly(g, [[-13, -50], [12, -50], [15, -30], [-15, -30]]);
  ink(g, 1.4);
  g.stroke();
  ink(g, 1);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const x = -15 + i * 4.3;
    g.moveTo(x, -30);
    g.lineTo(x + 2.1, -27);
    g.lineTo(x + 4.3, -30);
  }
  g.stroke();
  ink(g, 1.5, VERM);
  g.beginPath();
  g.moveTo(36, -72);
  g.lineTo(41, -58);
  g.moveTo(32, -66);
  g.lineTo(46, -63);
  g.moveTo(41, -60);
  g.lineTo(18, -52);
  g.stroke();
  // 将军：墨甲
  poly(g, [[-9, -49], [9, -49], [7, -72], [-7, -72]]);
  g.fillStyle = INK;
  g.fill();
  // 腿跨在马上
  poly(g, [[-2, -52], [8, -52], [10, -36], [5, -36]]);
  g.fill();
  // 甲片纹（宣纸细线）
  ink(g, 0.7, paperA(0.55));
  g.beginPath();
  for (let y = -68; y < -52; y += 4) {
    g.moveTo(-6.5, y);
    g.lineTo(6.5, y);
  }
  g.stroke();
  // 护心镜
  circ(g, 0, -62, 3);
  fs(g, PAPER_SHADE, 1);
  // 头 + 盔 + 朱缨
  circ(g, 0, -77.5, 5.4);
  fs(g, PAPER, 1.4);
  g.fillStyle = INK;
  poly(g, [[-3.4, -79.4], [-0.8, -78.4], [-3.4, -77.8]]);
  g.fill();
  poly(g, [[3.4, -79.4], [0.8, -78.4], [3.4, -77.8]]);
  g.fill();
  g.beginPath();
  g.arc(0, -78, 6.2, Math.PI, TAU);
  g.lineTo(6.6, -77);
  g.lineTo(-6.6, -77);
  g.closePath();
  g.fill();
  brushStroke(g, [[0, -84], [2, -91], [-2, -97], [3, -101]], 4.4, { seed: 43, color: VERM, dry: 0.3 });
  // 长枪
  line(g, -10, -40, 40, -104, 2.2);
  poly(g, [[38, -101], [46, -112], [41, -99]]);
  fs(g, INK, 1);
  brushStroke(g, [[37.2, -99], [34, -94], [35, -90]], 3.6, { seed: 47, color: VERM, dry: 0.2 });
  // 握枪的拳
  circ(g, 8, -61, 2.6);
  fs(g, PAPER, 1.2);
}

function drawUmbrella(g, rng, f) {
  // 无面伞女：朱红油纸伞、无面宣纸脸、墨色长裙
  const ph = (f / 4) * (TAU / 8);
  // 长发（背后）
  g.beginPath();
  g.moveTo(-8, -66);
  g.bezierCurveTo(-14, -50, -14, -36, -18, -22);
  g.lineTo(-6, -30);
  g.lineTo(-2, -60);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  // 长裙
  g.beginPath();
  g.moveTo(-8, -56);
  g.lineTo(8, -56);
  g.bezierCurveTo(12, -40, 18, -18, 22, -2);
  g.quadraticCurveTo(16, -5, 12, -1);
  g.quadraticCurveTo(6, -4, 1, 0);
  g.quadraticCurveTo(-5, -4, -10, -0.6);
  g.quadraticCurveTo(-16, -4, -22, -1.6);
  g.bezierCurveTo(-18, -18, -12, -40, -8, -56);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  // 裙摆朱红里衬
  vfill(g, () => {
    g.beginPath();
    g.moveTo(22, -2);
    g.quadraticCurveTo(16, -5, 12, -1);
    g.quadraticCurveTo(6, -4, 1, 0);
    g.quadraticCurveTo(-5, -4, -10, -0.6);
    g.quadraticCurveTo(-16, -4, -22, -1.6);
    g.lineTo(-21.4, -4.6);
    g.quadraticCurveTo(-16, -7, -10, -3.6);
    g.quadraticCurveTo(-5, -7, 1, -3);
    g.quadraticCurveTo(6, -7, 12, -4);
    g.quadraticCurveTo(16, -8, 21.4, -5);
    g.closePath();
  });
  // 宣纸腰带
  ink(g, 2.2, PAPER_SHADE);
  g.beginPath();
  g.moveTo(-8.6, -45);
  g.lineTo(9.4, -45);
  g.stroke();
  // 举伞的袖子
  g.beginPath();
  g.moveTo(5, -54);
  g.quadraticCurveTo(12, -56, 13, -66);
  g.lineTo(9.6, -67);
  g.quadraticCurveTo(8, -60, 2, -50);
  g.fillStyle = INK;
  g.fill();
  // 无面的脸
  ell(g, 0, -62, 6.4, 8);
  fs(g, PAPER, 1.4);
  g.beginPath();
  g.arc(0, -62.6, 6.8, Math.PI * 1.05, Math.PI * 1.95);
  g.quadraticCurveTo(0, -66, -6.6, -63.6);
  g.fillStyle = INK;
  g.fill();
  // 伞柄
  line(g, 11.4, -66, 4, -101, 1.8);
  // 伞面
  const top = -106;
  const rimY = -80;
  const R = 44;
  vfill(g, () => {
    g.beginPath();
    g.moveTo(-R, rimY);
    g.quadraticCurveTo(-R * 0.86, top + 6, 0, top);
    g.quadraticCurveTo(R * 0.86, top + 6, R, rimY);
    for (let i = 8; i >= 0; i--) {
      const x = -R + (i / 8) * 2 * R;
      g.quadraticCurveTo(x + R / 8, rimY + 3.4, x, rimY);
    }
    g.closePath();
  });
  // 伞骨：随帧旋转
  ink(g, 1.1);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = ph + (i / 8) * TAU;
    const c = Math.cos(a);
    if (Math.sin(a) < -0.15) continue;
    const x = c * R;
    g.moveTo(0, top);
    g.quadraticCurveTo(x * 0.8, top + 6 + Math.abs(c) * 2, x, rimY + 1);
  }
  g.stroke();
  // 伞面上的宣纸圈带
  ink(g, 2, PAPER_SHADE);
  g.beginPath();
  g.ellipse(0, top + 7.4, 15, 3.2, 0, Math.PI * 0.05, Math.PI * 0.95);
  g.stroke();
  // 伞轮廓
  g.beginPath();
  g.moveTo(-R, rimY);
  g.quadraticCurveTo(-R * 0.86, top + 6, 0, top);
  g.quadraticCurveTo(R * 0.86, top + 6, R, rimY);
  for (let i = 8; i >= 0; i--) {
    const x = -R + (i / 8) * 2 * R;
    g.quadraticCurveTo(x + R / 8, rimY + 3.4, x, rimY);
  }
  g.closePath();
  ink(g, 1.8);
  g.stroke();
  circ(g, 0, top - 1.6, 2.2);
  g.fillStyle = INK;
  g.fill();
}

function drawYoushen(g, rng, f) {
  // 夜游神：巨大的墨袍神祇，朱面、乌纱、长戟
  const sw = [0, 1, 0, -1][f];
  // 长戟（身后）
  line(g, 38, -136, 30, -2, 3);
  g.beginPath();
  g.moveTo(38.4, -134);
  g.quadraticCurveTo(50, -130, 50, -116);
  g.quadraticCurveTo(44, -124, 37.6, -124);
  g.closePath();
  fs(g, INK, 1);
  poly(g, [[36.6, -136], [38, -150], [40, -136]]);
  fs(g, INK, 1);
  brushStroke(g, [[37, -122], [32 + sw, -114], [34 + sw, -106]], 5, { seed: 61, color: VERM, dry: 0.25 });
  // 袍
  g.beginPath();
  g.moveTo(-14, -96);
  g.lineTo(14, -96);
  g.bezierCurveTo(26, -92, 34, -76, 46, -54);
  g.lineTo(32, -46);
  g.bezierCurveTo(34, -30, 36, -14, 38, -1);
  g.quadraticCurveTo(26, -6, 16, -1);
  g.quadraticCurveTo(6, -5, -4, 0);
  g.quadraticCurveTo(-16, -5, -26, -0.4);
  g.quadraticCurveTo(-32, -4, -38, -1);
  g.bezierCurveTo(-36, -14, -34, -30, -32, -46);
  g.lineTo(-46, -54);
  g.bezierCurveTo(-34, -76, -26, -92, -14, -96);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  // 袍纹：宣纸细线（云纹）
  ink(g, 1, paperA(0.5));
  g.beginPath();
  g.moveTo(-28, -24);
  g.quadraticCurveTo(-20, -30, -14, -22);
  g.quadraticCurveTo(-10, -16, -4, -22);
  g.moveTo(10, -18);
  g.quadraticCurveTo(16, -26, 24, -18);
  g.moveTo(-32, -50);
  g.lineTo(-44, -55);
  g.moveTo(32, -50);
  g.lineTo(44, -55);
  g.stroke();
  // 交领（宣纸）
  ink(g, 2.6, PAPER);
  g.beginPath();
  g.moveTo(-9, -95);
  g.lineTo(5, -66);
  g.moveTo(9, -95);
  g.lineTo(-1, -76);
  g.stroke();
  // 朱红玉带
  vfill(g, () => poly(g, [[-25, -62], [25, -62], [26, -55], [-26, -55]]));
  g.fillStyle = INK;
  for (const x of [-16, -6, 4, 14]) g.fillRect(x, -61, 3, 5);
  // 握戟的手
  circ(g, 33, -64, 4.4);
  fs(g, PAPER, 1.6);
  // 朱红脸
  vfill(g, () => ell(g, 0, -104, 10.6, 12.4));
  ell(g, 0, -104, 10.6, 12.4);
  ink(g, 1.8);
  g.stroke();
  // 怒眉
  brushStroke(g, [[-9, -110], [-4, -107.4], [-1.4, -108]], 3, { seed: 63, dry: 0.15 });
  brushStroke(g, [[9, -110], [4, -107.4], [1.4, -108]], 3, { seed: 67, dry: 0.15 });
  // 眼
  g.fillStyle = PAPER;
  ell(g, -4.4, -104, 2.6, 1.8);
  g.fill();
  ell(g, 4.4, -104, 2.6, 1.8);
  g.fill();
  g.fillStyle = INK;
  circ(g, -4, -104, 1.1);
  g.fill();
  circ(g, 4.8, -104, 1.1);
  g.fill();
  // 墨髯
  brushStroke(g, [[-4, -97], [-6, -90], [-4 + sw, -82]], 4, { seed: 69, dry: 0.35 });
  brushStroke(g, [[0, -96.6], [0, -88], [1 + sw, -79]], 4.4, { seed: 71, dry: 0.35 });
  brushStroke(g, [[4, -97], [6, -90], [5 + sw, -82]], 4, { seed: 73, dry: 0.35 });
  // 乌纱帽 + 帽翅
  g.beginPath();
  g.moveTo(-11, -112);
  g.lineTo(11, -112);
  g.lineTo(9.6, -127);
  g.quadraticCurveTo(0, -131, -9.6, -127);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  ink(g, 1.4, PAPER_SHADE);
  g.beginPath();
  g.moveTo(-10.4, -116);
  g.lineTo(10.4, -116);
  g.stroke();
  line(g, -10, -121, -32, -124, 1.8);
  line(g, 10, -121, 32, -124, 1.8);
  ell(g, -34, -124.4, 5, 3, -0.1);
  fs(g, INK, 1);
  ell(g, 34, -124.4, 5, 3, 0.1);
  fs(g, INK, 1);
}

/* ------------------------------------------------------------------ */
/* 实体精灵表                                                          */
/* ------------------------------------------------------------------ */

// w/h：缓存盒尺寸；ax/ay：脚底锚点；r：设计时的碰撞半径（运行时按 entity.r 缩放）
// eyes：眼睛在精灵里的位置（夜色里画出「黑暗中的眼」）
const ENEMY_DEFS = {
  paperkid: { w: 28, h: 36, ax: 14, ay: 34, r: 11, frames: 2, draw: drawPaperkid, eyes: null },
  shade: { w: 32, h: 36, ax: 16, ay: 33, r: 10, frames: 4, draw: drawShade, eyes: [[-3.1, -22.4], [3.1, -22.4]] },
  lanternghost: { w: 34, h: 42, ax: 17, ay: 39, r: 15, frames: 4, draw: drawLanternghost, eyes: null },
  weasel: { w: 32, h: 36, ax: 16, ay: 33, r: 12, frames: 4, draw: drawWeasel, eyes: [[7, -23.6]] },
  sedan: { w: 56, h: 58, ax: 28, ay: 54, r: 22, frames: 4, draw: drawSedan, eyes: null },
  drowned: { w: 36, h: 40, ax: 17, ay: 36, r: 13, frames: 4, draw: drawDrowned, eyes: [[4.6, -22.6]] },
  horse: { w: 112, h: 124, ax: 50, ay: 118, r: 34, frames: 4, draw: drawHorse, eyes: null, lw: 2 },
  umbrella: { w: 100, h: 116, ax: 50, ay: 110, r: 30, frames: 4, draw: drawUmbrella, eyes: null },
  youshen: { w: 104, h: 160, ax: 50, ay: 154, r: 44, frames: 4, draw: drawYoushen, eyes: [[-4, -104], [4.8, -104]] },
};

export const ENEMY_TYPES = Object.keys(ENEMY_DEFS);
export function enemyDef(type) {
  return ENEMY_DEFS[type] || ENEMY_DEFS.paperkid;
}

export function enemySprite(type, frame = 0, flash = false) {
  const d = enemyDef(type);
  const fr = frame % d.frames;
  return bake(`en_${type}|${fr}|${flash ? 1 : 0}`, d.w, d.h, d.ax, d.ay, (g, r) => d.draw(g, r, fr), {
    flash,
    speckle: 0.006,
  });
}

/** 地面墨影（椭圆淡墨），缓存 */
export function shadowSprite(rx) {
  const q = Math.max(4, Math.round(rx));
  return bake(`shadow|${q}`, q * 2 + 4, q + 4, q + 2, q / 2 + 2, (g, rng) => {
    g.fillStyle = inkA(0.16);
    blobPath(g, 0, 0, q, rng, 0.12, 10, 0.42);
    g.fill();
  }, { speckle: false });
}

/** 精英标记：脚下朱红笔圈 */
export function eliteRingSprite(r) {
  const q = Math.max(8, Math.round(r));
  return bake(`elitering|${q}`, q * 2 + 16, q + 14, q + 8, q / 2 + 7, (g) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = -0.6 + (i / 40) * (TAU + 0.5);
      pts.push([Math.cos(a) * q, Math.sin(a) * q * 0.42]);
    }
    brushStroke(g, pts, 3.2, { color: VERM, seed: q, dry: 0.5, taperIn: 0.1, taperOut: 0.3 });
  }, { speckle: false });
}

/* ------------------------------------------------------------------ */
/* 场景物件                                                            */
/* ------------------------------------------------------------------ */

function drawLanternpost(g) {
  // 石基
  poly(g, [[-6.4, -6.4], [6.4, -6.4], [7.4, 0], [-7.4, 0]]);
  fs(g, PAPER_SHADE, 1.3);
  // 木柱
  g.fillStyle = INK;
  g.fillRect(-1.7, -60, 3.4, 54);
  // 挑杆 + 斜撑
  line(g, -1, -57, 13, -57, 2.4);
  line(g, 0, -48, 8, -57, 1.4);
  // 柱上的朱红符纸
  vfill(g, () => poly(g, [[-2.6, -34], [2.6, -34], [2.4, -24], [-2.4, -24]]));
  // 未点亮的灯笼（朱红）
  line(g, 11, -57, 11, -52, 0.9);
  vfill(g, () => ell(g, 11, -45.6, 5.4, 6.2));
  ell(g, 11, -45.6, 5.4, 6.2);
  ink(g, 1.2);
  g.stroke();
  ink(g, 0.6, inkA(0.6));
  g.beginPath();
  g.ellipse(11, -45.6, 2.4, 6, 0, 0, TAU);
  g.stroke();
  g.fillStyle = INK;
  g.fillRect(8.2, -52.6, 5.6, 1.8);
  g.fillRect(8.2, -40.2, 5.6, 1.6);
  ink(g, 0.9);
  g.beginPath();
  g.moveTo(10.2, -38.6);
  g.lineTo(10, -34.6);
  g.moveTo(11.8, -38.6);
  g.lineTo(12, -34.6);
  g.stroke();
}

function drawWell(g, rng) {
  // 古井：俯视的石圈 + 墨色井水 + 辘轳架（锚点 = 井心）
  // 井壁前沿
  g.beginPath();
  g.ellipse(0, 0, 25, 13.4, 0, 0, Math.PI);
  g.lineTo(-25, 5);
  g.ellipse(0, 5, 25, 13.4, 0, Math.PI, 0, true);
  g.closePath();
  fs(g, PAPER_SHADE, 1.5);
  ink(g, 0.8, inkA(0.6));
  g.beginPath();
  for (const a of [0.35, 0.9, 1.55, 2.2, 2.8]) {
    const x = Math.cos(a) * 25;
    const y = Math.sin(a) * 13.4;
    g.moveTo(x, y);
    g.lineTo(x, y + 5);
  }
  g.stroke();
  // 井口
  ell(g, 0, 0, 25, 13.4);
  fs(g, PAPER_SHADE, 1.6);
  ink(g, 0.8, inkA(0.6));
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.2;
    g.moveTo(Math.cos(a) * 16.4, Math.sin(a) * 8.3);
    g.lineTo(Math.cos(a) * 24.4, Math.sin(a) * 13);
  }
  g.stroke();
  ell(g, 0, 0, 16, 7.8);
  fs(g, INK, 1.2);
  // 水面上的一道宣纸涟漪
  ink(g, 0.8, paperA(0.7));
  g.beginPath();
  g.ellipse(-2, 1, 7, 2.6, 0, Math.PI * 1.1, Math.PI * 1.7);
  g.stroke();
  // 辘轳架
  line(g, -21, -1, -21, -32, 2.6);
  line(g, 21, -1, 21, -32, 2.6);
  line(g, -24, -31, 24, -31, 3.2);
  ell(g, 0, -31, 4.2, 3.4);
  fs(g, PAPER_SHADE, 1.2);
  line(g, 0, -28, 0, -10, 0.9);
  poly(g, [[-2.6, -11], [2.6, -11], [2, -6.6], [-2, -6.6]]);
  fs(g, PAPER_SHADE, 1);
}

function drawArch(g) {
  // 牌坊：四柱三间，朱红匾额
  const pil = [-58, -22, 22, 58];
  // 抱鼓石
  for (const x of pil) {
    poly(g, [[x - 6, -9], [x + 6, -9], [x + 7, 0], [x - 7, 0]]);
    fs(g, PAPER_SHADE, 1.4);
  }
  // 柱
  g.fillStyle = INK;
  for (const x of pil) {
    const top = Math.abs(x) < 30 ? -104 : -86;
    g.fillRect(x - 3, top, 6, top * -1 - 9);
  }
  // 额枋
  g.fillRect(-64, -78, 128, 4.4);
  g.fillRect(-26, -96, 52, 4);
  poly(g, [[-62, -70], [62, -70], [62, -66.6], [-62, -66.6]]);
  g.fill();
  // 侧间的宣纸花板
  for (const s of [-1, 1]) {
    g.beginPath();
    g.rect(s > 0 ? 25 : -55, -73.6, 30, 3.6);
    fs(g, PAPER_SHADE, 0.9);
  }
  // 中间朱红匾额
  vfill(g, () => {
    g.beginPath();
    g.rect(-15, -114, 30, 16);
  });
  g.beginPath();
  g.rect(-15, -114, 30, 16);
  ink(g, 1.6);
  g.stroke();
  ink(g, 0.9, PAPER);
  g.beginPath();
  g.rect(-12.4, -111.4, 24.8, 10.8);
  g.stroke();
  // 匾心两道墨笔（不写字，留意象）
  brushStroke(g, [[-7, -108.4], [7, -107.6]], 2.2, { seed: 81, dry: 0.4 });
  brushStroke(g, [[-6, -103.8], [6, -104.4]], 2.2, { seed: 83, dry: 0.4 });
  // 屋顶
  const roof = (cx, y, hw, h) => {
    g.beginPath();
    g.moveTo(cx - hw - 6, y - 1);
    g.quadraticCurveTo(cx - hw, y - 2, cx - hw + 4, y - h * 0.6);
    g.lineTo(cx + hw - 4, y - h * 0.6);
    g.quadraticCurveTo(cx + hw, y - 2, cx + hw + 6, y - 1);
    g.quadraticCurveTo(cx + hw, y + 2.4, cx + hw - 6, y + 2.6);
    g.lineTo(cx - hw + 6, y + 2.6);
    g.quadraticCurveTo(cx - hw, y + 2.4, cx - hw - 6, y - 1);
    g.closePath();
    g.fillStyle = INK;
    g.fill();
    // 正脊
    g.fillRect(cx - hw + 3, y - h, (hw - 3) * 2, h * 0.42);
    // 鸱吻
    g.beginPath();
    g.moveTo(cx - hw + 3, y - h);
    g.quadraticCurveTo(cx - hw - 1, y - h - 4, cx - hw + 1, y - h - 6);
    g.lineTo(cx - hw + 5, y - h + 1);
    g.moveTo(cx + hw - 3, y - h);
    g.quadraticCurveTo(cx + hw + 1, y - h - 4, cx + hw - 1, y - h - 6);
    g.lineTo(cx + hw - 5, y - h + 1);
    g.fill();
    // 瓦垄（宣纸线）
    ink(g, 0.8, paperA(0.55));
    g.beginPath();
    for (let x = cx - hw + 6; x < cx + hw - 4; x += 5) {
      g.moveTo(x, y - h * 0.55);
      g.lineTo(x + 0.6, y + 1.8);
    }
    g.stroke();
  };
  roof(-40, -86, 22, 9);
  roof(40, -86, 22, 9);
  roof(0, -116, 30, 11);
}

const PROP_DEFS = {
  lanternpost: { w: 34, h: 66, ax: 12, ay: 62, draw: drawLanternpost },
  well: { w: 60, h: 58, ax: 30, ay: 38, draw: drawWell },
  arch: { w: 150, h: 140, ax: 75, ay: 132, draw: drawArch },
};
export function propSprite(kind, flash = false) {
  const d = PROP_DEFS[kind] || PROP_DEFS.lanternpost;
  return bake(`prop_${kind}|0|${flash ? 1 : 0}`, d.w, d.h, d.ax, d.ay, (g, r) => d.draw(g, r), { flash, speckle: 0.004 });
}

/* ------------------------------------------------------------------ */
/* 拾取物                                                              */
/* ------------------------------------------------------------------ */

function drawSoulFlame(g, tier) {
  // 魂火：琥珀色火苗，宣纸芯，细墨边
  const s = [0, 0.75, 1, 1.35][tier] || 1;
  g.save();
  g.scale(s, s);
  const flame = (ox, oy, k) => {
    g.beginPath();
    g.moveTo(ox, oy - 12 * k);
    g.bezierCurveTo(ox + 2 * k, oy - 7 * k, ox + 6 * k, oy - 5 * k, ox + 5.6 * k, oy - 1 * k);
    g.bezierCurveTo(ox + 5.2 * k, oy + 3.4 * k, ox - 5.2 * k, oy + 3.4 * k, ox - 5.6 * k, oy - 1 * k);
    g.bezierCurveTo(ox - 6 * k, oy - 5 * k, ox - 1.4 * k, oy - 7 * k, ox, oy - 12 * k);
    g.closePath();
  };
  if (tier >= 3) {
    flame(-4.4, -1, 0.6);
    g.fillStyle = LANTERN;
    g.fill();
    ink(g, 0.9);
    g.stroke();
  }
  flame(0, 0, 1);
  g.fillStyle = LANTERN;
  g.fill();
  ink(g, 1.1);
  g.stroke();
  // 宣纸火芯
  g.beginPath();
  g.moveTo(0, -6.6);
  g.quadraticCurveTo(2.6, -2, 2.2, 0);
  g.quadraticCurveTo(0, 2, -2.2, 0);
  g.quadraticCurveTo(-2.6, -2, 0, -6.6);
  g.fillStyle = PAPER;
  g.fill();
  g.restore();
}

function drawCoin(g) {
  circ(g, 0, 0, 6);
  fs(g, PAPER_SHADE, 1.5);
  circ(g, 0, 0, 4.4);
  ink(g, 0.6, inkA(0.6));
  g.stroke();
  g.beginPath();
  g.rect(-1.8, -1.8, 3.6, 3.6);
  fs(g, PAPER, 1.1);
  ink(g, 0.9);
  g.beginPath();
  g.moveTo(-0.7, -3.4);
  g.lineTo(0.7, -3.4);
  g.moveTo(-0.7, 3.4);
  g.lineTo(0.7, 3.4);
  g.moveTo(-3.4, -0.7);
  g.lineTo(-3.4, 0.7);
  g.moveTo(3.4, -0.7);
  g.lineTo(3.4, 0.7);
  g.stroke();
}

function drawBun(g) {
  g.beginPath();
  g.moveTo(-8, 1);
  g.bezierCurveTo(-8.6, -7, 8.6, -7, 8, 1);
  g.quadraticCurveTo(0, 3.4, -8, 1);
  g.closePath();
  fs(g, PAPER, 1.4);
  ink(g, 0.9, inkA(0.75));
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (1.15 + i * 0.17);
    g.moveTo(Math.cos(a) * 1.6, -4.4 + Math.sin(a) * 0.8);
    g.quadraticCurveTo(Math.cos(a) * 3.4, -2.6, Math.cos(a) * 6, -1.4 + Math.sin(a) * 0.4);
  }
  g.stroke();
  vfill(g, () => circ(g, 0, -4.4, 1.3));
}

function drawBanner(g) {
  // 招魂幡：竹竿 + 竖长白幡 + 朱红边
  line(g, -5, 2, -5, -34, 1.8);
  line(g, -7, -33, 6, -33, 1.6);
  poly(g, [[-3.6, -32], [5.6, -32], [5.6, -7], [1, -11.4], [-3.6, -7]]);
  fs(g, PAPER, 1.2);
  vfill(g, () => {
    g.beginPath();
    g.rect(-3.4, -31.8, 1.4, 22);
    g.rect(3.9, -31.8, 1.4, 22);
  });
  ink(g, 1.1);
  g.beginPath();
  g.moveTo(1, -27);
  g.lineTo(1, -16);
  g.moveTo(-1, -24);
  g.lineTo(3, -24);
  g.stroke();
  ink(g, 0.8);
  g.beginPath();
  g.moveTo(-3, -7.5);
  g.lineTo(-3.4, -3);
  g.moveTo(5, -7.5);
  g.lineTo(5.6, -3);
  g.stroke();
}

function drawChest(g) {
  // 供盒：朱漆盒 + 墨盖 + 宣纸回纹
  vfill(g, () => poly(g, [[-9, -12], [9, -12], [9.6, 0], [-9.6, 0]]));
  poly(g, [[-9, -12], [9, -12], [9.6, 0], [-9.6, 0]]);
  ink(g, 1.4);
  g.stroke();
  poly(g, [[-10.6, -16], [10.6, -16], [10, -11.4], [-10, -11.4]]);
  fs(g, INK, 1.2);
  ink(g, 1, PAPER);
  g.beginPath();
  g.rect(-4, -9.4, 8, 6.6);
  g.rect(-1.8, -7.2, 3.6, 2.2);
  g.stroke();
  // 盖顶的宣纸封条
  g.beginPath();
  g.rect(-1.6, -17.6, 3.2, 8);
  fs(g, PAPER, 0.8);
}

export function pickupSprite(kind, tier = 1) {
  switch (kind) {
    case 'xp':
      return bake(`pk_xp|${tier}`, 22, 26, 11, 18, (g) => drawSoulFlame(g, tier), { speckle: 0.002 });
    case 'coin':
      return bake('pk_coin|0', 16, 16, 8, 8, (g) => drawCoin(g), { speckle: 0.003 });
    case 'bun':
      return bake('pk_bun|0', 22, 14, 11, 9, (g) => drawBun(g), { speckle: 0.002 });
    case 'banner':
      return bake('pk_banner|0', 18, 40, 9, 36, (g) => drawBanner(g), { speckle: 0.003 });
    case 'chest':
      return bake('pk_chest|0', 26, 22, 13, 19, (g) => drawChest(g), { speckle: 0.004 });
    default:
      return bake('pk_coin|0', 16, 16, 8, 8, (g) => drawCoin(g));
  }
}

/* ------------------------------------------------------------------ */
/* 武器 / 弹体                                                         */
/* ------------------------------------------------------------------ */

function drawTalisman(g, evolved) {
  // 符纸：竖长纸条，朱红边框 + 朱砂符印（抽象笔画，不写伪字）
  poly(g, [[-4, -10], [4, -10], [4, 10], [-4, 10]]);
  fs(g, evolved ? VERM : PAPER, 1.1);
  const c = evolved ? PAPER : VERM;
  withMisreg(g, () => {
    ink(g, 0.8, c);
    g.beginPath();
    g.rect(-2.8, -8.8, 5.6, 17.6);
    g.stroke();
    ink(g, 1.2, c);
    g.beginPath();
    g.moveTo(0, -6.6);
    g.lineTo(0, 6.4);
    g.moveTo(-1.8, -4.6);
    g.lineTo(1.8, -4.6);
    g.moveTo(-1.6, 3.6);
    g.quadraticCurveTo(0, 1, 1.6, 3.6);
    g.stroke();
    g.beginPath();
    g.arc(0, -1, 1.4, 0, TAU);
    g.stroke();
  });
  g.fillStyle = evolved ? PAPER : INK;
  g.fillRect(-1.3, -9.4, 2.6, 1.6);
}

function drawCoinsword(g, evolved) {
  // 铜钱剑：一串铜钱 + 朱红绳 + 剑柄，水平朝右
  ink(g, 1.4, VERM);
  g.beginPath();
  g.moveTo(-13, 0);
  g.lineTo(13, 0);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const x = -8 + i * 4.8;
    circ(g, x, 0, 2.8);
    fs(g, evolved ? PAPER : PAPER_SHADE, 1);
    g.fillStyle = INK;
    g.fillRect(x - 0.8, -0.8, 1.6, 1.6);
  }
  poly(g, [[13, -1.6], [17.4, 0], [13, 1.6]]);
  fs(g, INK, 0.8);
  // 剑柄 + 穗
  line(g, -12.4, -3.4, -12.4, 3.4, 1.8);
  line(g, -12.4, 0, -16.4, 0, 2.2);
  vfill(g, () => poly(g, [[-16.6, -1], [-19.6, -2.4], [-20.4, 2], [-16.6, 1]]));
}

function drawOrbLantern(g, evolved) {
  // 环绕灯笼：小朱红纸灯 + 朱红火舌
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.7;
    vfill(g, () => {
      g.beginPath();
      g.moveTo(Math.cos(a) * 9.6, Math.sin(a) * 9.6);
      g.quadraticCurveTo(Math.cos(a + 0.4) * 6, Math.sin(a + 0.4) * 6, Math.cos(a) * 5, Math.sin(a) * 5);
      g.quadraticCurveTo(Math.cos(a - 0.4) * 6, Math.sin(a - 0.4) * 6, Math.cos(a) * 9.6, Math.sin(a) * 9.6);
    });
  }
  ell(g, 0, 0, 5.4, 6);
  g.fillStyle = evolved ? VERM : VERM;
  withMisreg(g, () => {
    ell(g, 0, 0, 5.4, 6);
    g.fill();
  });
  ell(g, 0, 0, 5.4, 6);
  ink(g, 1.2);
  g.stroke();
  ink(g, 0.6, inkA(0.6));
  g.beginPath();
  g.ellipse(0, 0, 2.4, 5.8, 0, 0, TAU);
  g.stroke();
  g.fillStyle = INK;
  g.fillRect(-2.8, -7, 5.6, 1.8);
  g.fillRect(-2.8, 5.2, 5.6, 1.6);
}

function drawFlameTongue(g) {
  // 长明灯火环上的一簇朱红火舌（朝上）
  vfill(g, () => {
    g.beginPath();
    g.moveTo(0, -9);
    g.bezierCurveTo(2, -5, 4.4, -3, 3.8, 0);
    g.quadraticCurveTo(0, 2.6, -3.8, 0);
    g.bezierCurveTo(-4.4, -3, -2, -5, 0, -9);
  });
  ink(g, 0.9);
  g.beginPath();
  g.moveTo(0, -9);
  g.bezierCurveTo(2, -5, 4.4, -3, 3.8, 0);
  g.quadraticCurveTo(0, 2.6, -3.8, 0);
  g.bezierCurveTo(-4.4, -3, -2, -5, 0, -9);
  g.stroke();
  g.fillStyle = PAPER;
  g.beginPath();
  g.moveTo(0, -3.8);
  g.quadraticCurveTo(1.4, -1, 0, 0.6);
  g.quadraticCurveTo(-1.4, -1, 0, -3.8);
  g.fill();
}

function drawPaperman(g, f, evolved) {
  // 纸人召唤物：朱红剪纸小人（镂空花纹），与敌方宣纸童子区分
  const s = f ? 1 : -1;
  withMisreg(g, () => {
    g.fillStyle = VERM;
    circ(g, 0, -15.6, 3.6);
    g.fill();
    poly(g, [[-3.6, -12], [3.6, -12], [5.6, -4], [-5.6, -4]]);
    g.fill();
    poly(g, [[-3.4, -11.4], [-7.6, -7 + s], [-6.4, -6 + s], [-2.4, -9]]);
    g.fill();
    poly(g, [[3.4, -11.4], [7.6, -7 - s], [6.4, -6 - s], [2.4, -9]]);
    g.fill();
    poly(g, [[-3.6, -4.4], [-1, -4.4], [-1.6 + s * 1.2, 0], [-3.6 + s * 1.2, 0]]);
    g.fill();
    poly(g, [[1, -4.4], [3.6, -4.4], [3.6 - s * 1.2, 0], [1.6 - s * 1.2, 0]]);
    g.fill();
  });
  // 剪纸镂空：眼、胸前菱花
  cut(g, () => {
    g.beginPath();
    g.rect(-2, -16.6, 1.2, 1.2);
    g.rect(0.8, -16.6, 1.2, 1.2);
    g.moveTo(0, -10.6);
    g.lineTo(1.6, -8.4);
    g.lineTo(0, -6.2);
    g.lineTo(-1.6, -8.4);
    g.closePath();
  });
  if (evolved) {
    line(g, 6.4, -6, 6.4, -22, 1);
    poly(g, [[6.4, -22], [11.6, -20.4], [6.4, -17.6]]);
    fs(g, PAPER, 0.8);
  }
}

function drawFirecracker(g) {
  vfill(g, () => {
    g.beginPath();
    g.rect(-2.6, -5.4, 5.2, 10.8);
  });
  g.beginPath();
  g.rect(-2.6, -5.4, 5.2, 10.8);
  ink(g, 1);
  g.stroke();
  g.fillStyle = INK;
  g.fillRect(-2.8, -5.8, 5.6, 1.6);
  g.fillRect(-2.8, 4.2, 5.6, 1.6);
  ink(g, 0.8, PAPER);
  g.beginPath();
  g.moveTo(-1.6, -1);
  g.lineTo(1.6, 1);
  g.stroke();
  ink(g, 0.9);
  g.beginPath();
  g.moveTo(0, -5.8);
  g.quadraticCurveTo(2, -8, 1, -10);
  g.stroke();
}

function drawBell(g) {
  // 铜铃：宣纸铃身 + 墨线 + 朱红铃绳
  ink(g, 1, VERM);
  g.beginPath();
  g.moveTo(0, -7);
  g.lineTo(0, -4.6);
  g.stroke();
  g.beginPath();
  g.moveTo(-3.6, 2.6);
  g.bezierCurveTo(-4, -4.4, 4, -4.4, 3.6, 2.6);
  g.lineTo(4.6, 3.6);
  g.lineTo(-4.6, 3.6);
  g.closePath();
  fs(g, PAPER_SHADE, 1.1);
  circ(g, 0, 4.6, 1.2);
  g.fillStyle = INK;
  g.fill();
}

function drawPaperMoney(g) {
  // 纸钱弹：宣纸圆钱 + 朱红粗边（敌方弹幕需醒目）
  circ(g, 0, 0, 5.4);
  g.fillStyle = PAPER;
  g.fill();
  ink(g, 1.8, VERM);
  g.stroke();
  g.beginPath();
  g.rect(-1.5, -1.5, 3, 3);
  ink(g, 1);
  g.stroke();
  cut(g, () => {
    g.beginPath();
    g.rect(-1.1, -1.1, 2.2, 2.2);
  });
}

function drawInkBullet(g) {
  vfill(g, () => circ(g, 0, 0, 6.2));
  g.fillStyle = INK;
  blobPath(g, 0, 0, 4.8, makeRng(5), 0.3, 9);
  g.fill();
}

const PROJ_DEFS = {
  talisman: { w: 12, h: 24, ax: 6, ay: 12, draw: (g) => drawTalisman(g, false) },
  talismanEvo: { w: 12, h: 24, ax: 6, ay: 12, draw: (g) => drawTalisman(g, true) },
  coinsword: { w: 42, h: 12, ax: 21, ay: 6, draw: (g) => drawCoinsword(g, false) },
  coinswordEvo: { w: 42, h: 12, ax: 21, ay: 6, draw: (g) => drawCoinsword(g, true) },
  lantern: { w: 24, h: 26, ax: 12, ay: 14, draw: (g) => drawOrbLantern(g, false) },
  flame: { w: 12, h: 14, ax: 6, ay: 10, draw: (g) => drawFlameTongue(g) },
  paperman0: { w: 26, h: 26, ax: 13, ay: 22, draw: (g) => drawPaperman(g, 0, false) },
  paperman1: { w: 26, h: 26, ax: 13, ay: 22, draw: (g) => drawPaperman(g, 1, false) },
  papermanEvo0: { w: 26, h: 28, ax: 13, ay: 24, draw: (g) => drawPaperman(g, 0, true) },
  papermanEvo1: { w: 26, h: 28, ax: 13, ay: 24, draw: (g) => drawPaperman(g, 1, true) },
  firecracker: { w: 12, h: 24, ax: 6, ay: 12, draw: (g) => drawFirecracker(g) },
  bell: { w: 14, h: 16, ax: 7, ay: 8, draw: (g) => drawBell(g) },
  paperMoney: { w: 16, h: 16, ax: 8, ay: 8, draw: (g) => drawPaperMoney(g) },
  inkBullet: { w: 16, h: 16, ax: 8, ay: 8, draw: (g) => drawInkBullet(g) },
};

export function projSprite(name) {
  const d = PROJ_DEFS[name] || PROJ_DEFS.talisman;
  return bake(`pj_${name}|0`, d.w, d.h, d.ax, d.ay, d.draw, { speckle: 0.003 });
}

/** 震波环（墨/朱），按半径 100 烘焙，运行时缩放 */
export function ringSprite(variant = 'ink', seed = 0) {
  const R = 100;
  return bake(`ring_${variant}|${seed}`, R * 2 + 30, R * 2 + 30, R + 15, R + 15, (g) => {
    const color = variant === 'verm' || variant === 'vthin' ? VERM : INK;
    const width = variant === 'thin' || variant === 'vthin' ? 5 : 9;
    const a0 = seed * 1.7;
    brushStroke(g, arcPoints(0, 0, R, a0, a0 + TAU * 0.98, 0.05), width, {
      color,
      seed: 100 + seed,
      dry: 0.6,
      taperIn: 0.08,
      taperOut: 0.25,
      startWidth: 0.8,
      jitter: 0.8,
    });
    if (variant === 'ult') {
      brushStroke(g, arcPoints(0, 0, R * 0.9, a0 + 2, a0 + 2 + TAU * 0.9, 0.05), 5, {
        color: VERM,
        seed: 200 + seed,
        dry: 0.55,
        taperIn: 0.1,
        taperOut: 0.3,
      });
      const r2 = makeRng(seed + 9);
      for (let i = 0; i < 9; i++) {
        const a = r2() * TAU;
        splatter(g, Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02, 4 + r2() * 4, r2, { count: 5, dir: a, spread: 0.6 });
      }
    }
  }, { speckle: false });
}

/** 墨笔扇形刀光（按 半径/张角 分桶缓存），朝右（angle=0）烘焙 */
export function brushArcSprite(radius, spread, evolved = false) {
  const R = Math.max(30, Math.round(radius / 8) * 8);
  const S = Math.max(0.4, Math.round(spread * 10) / 10);
  const pad = 18;
  return bake(`barc_${R}_${S}_${evolved ? 1 : 0}|0`, R * 2 + pad * 2, R * 2 + pad * 2, R + pad, R + pad, (g) => {
    const a0 = -S / 2;
    const a1 = S / 2;
    // 主刀光：外缘最粗、向两端出锋
    brushStroke(g, arcPoints(0, 0, R * 0.88, a0, a1, 0.04), R * 0.2, {
      seed: R + 1,
      dry: 0.7,
      taperIn: 0.25,
      taperOut: 0.5,
      startWidth: 0.35,
      jitter: 0.7,
      color: INK,
    });
    // 内侧拖出的淡墨飞白
    g.globalAlpha = 0.35;
    brushStroke(g, arcPoints(0, 0, R * 0.7, a0 + 0.15, a1 - 0.1, 0.05), R * 0.1, {
      seed: R + 3,
      dry: 0.85,
      taperIn: 0.35,
      taperOut: 0.5,
      startWidth: 0.2,
      color: INK,
    });
    g.globalAlpha = 1;
    if (evolved) {
      brushStroke(g, arcPoints(0, 0, R * 1.0, a0 + 0.15, a1 - 0.1, 0.04), R * 0.08, {
        seed: R + 5,
        dry: 0.4,
        taperIn: 0.3,
        taperOut: 0.5,
        color: VERM,
      });
    }
    const rng = makeRng(R * 3 + 1);
    for (let i = 0; i < 6; i++) {
      const a = a1 + rng() * 0.3;
      splatter(g, Math.cos(a) * R * (0.8 + rng() * 0.2), Math.sin(a) * R * (0.8 + rng() * 0.2), 2 + rng() * 2.5, rng, {
        count: 3,
        dir: a + Math.PI / 2,
        spread: 0.8,
      });
    }
  }, { speckle: false });
}

/** 泼墨地面墨迹，按半径 50 烘焙 */
export function inkPoolSprite(seed = 0) {
  const R = 50;
  return bake(`inkpool|${seed % 4}`, R * 3, R * 3, R * 1.5, R * 1.5, (g, rng) => {
    const r = makeRng(seed * 31 + 7);
    g.fillStyle = inkA(0.42);
    blobPath(g, 0, 0, R * 0.9, r, 0.35, 14, 0.62);
    g.fill();
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU;
      blobPath(g, Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.45, R * (0.2 + r() * 0.2), r, 0.4, 9);
      g.fill();
    }
    // 墨聚处更浓
    g.fillStyle = inkA(0.5);
    blobPath(g, R * 0.1, R * 0.05, R * 0.45, r, 0.5, 10, 0.6);
    g.fill();
    g.fillStyle = INK;
    splatter(g, 0, 0, R * 0.75, r, { mainScale: 0, count: 22 });
    printSpeckle(g, R * 3, R * 3, r, 0.01, 1.4);
  }, { speckle: false });
}

/** 爆炸星芒（朱红墨团 + 墨溅），按半径 50 烘焙 */
export function burstSprite(seed = 0) {
  const R = 50;
  return bake(`burst|${seed % 3}`, R * 3, R * 3, R * 1.5, R * 1.5, (g) => {
    const r = makeRng(seed * 13 + 5);
    // 朱红爆团（尖刺）
    withMisreg(g, () => {
      g.fillStyle = VERM;
      g.beginPath();
      const n = 14;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * TAU;
        const rr = i % 2 === 0 ? R * (0.85 + r() * 0.3) : R * (0.45 + r() * 0.12);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
    });
    // 中心宣纸空白（爆光=留白）
    g.fillStyle = PAPER;
    blobPath(g, 0, 0, R * 0.3, r, 0.4, 9);
    g.fill();
    splatter(g, 0, 0, R * 0.55, r, { mainScale: 0, count: 22 });
  }, { speckle: false });
}

/** 墨点（粒子），按半径桶缓存 */
export function dotSprite(rq, color = 'ink') {
  const q = Math.max(1, Math.min(8, Math.round(rq)));
  return bake(`dot_${color}|${q}`, q * 2 + 4, q * 2 + 4, q + 2, q + 2, (g, rng) => {
    g.fillStyle = color === 'verm' ? VERM : color === 'paper' ? PAPER : INK;
    blobPath(g, 0, 0, q, makeRng(q * 7 + color.length), 0.3, 8);
    g.fill();
  }, { speckle: false });
}

/** 墨烟团：硬边、带飞白斑驳，半径 20 烘焙 */
export function puffSprite(i = 0) {
  return bakePuff(i % 3);
}
function bakePuff(k) {
  return bake(`puffx|${k}`, 56, 56, 28, 28, (g) => {
    const r = makeRng(k * 41 + 9);
    g.fillStyle = INK;
    blobPath(g, 0, 0, 14, r, 0.4, 10);
    g.fill();
    for (let j = 0; j < 4; j++) {
      const a = r() * TAU;
      blobPath(g, Math.cos(a) * 11, Math.sin(a) * 9, 6 + r() * 5, r, 0.4, 8);
      g.fill();
    }
    printSpeckle(g, 56, 56, r, 0.05, 1.6);
  }, { speckle: false });
}

/** 纸屑（粒子） */
export function scrapSprite(i, color = 'paper') {
  const k = i % 4;
  return bake(`scrap_${color}|${k}`, 12, 12, 6, 6, (g) => {
    const r = makeRng(k * 17 + 3);
    const pts = [];
    const n = 3 + (k % 2);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * TAU + r() * 0.8;
      const rr = 2.6 + r() * 2.4;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    poly(g, pts);
    if (color === 'verm') {
      g.fillStyle = VERM;
      g.fill();
    } else fs(g, PAPER, 0.8);
  }, { speckle: false });
}

export { drawIcon, iconDataURL } from './icons.js';
