// skins.js —— 6 角色 × 3 套 = 18 套高辨识度重彩木刻皮肤（52×58 离屏画布 + 专属提灯 + 脚底灵阵）
// 铁律：第 0 套默认皮肤（*_default）严守原版 6 色暖木版画零冷色；
//       第 1/2 套在冠冕背饰、衣袍披风剪裁、手持提灯、国画矿物重彩（石绿/石青/紫金/鎏金）与脚底灵阵五个维度呈现显著轮廓与色彩反差。
import {
  INK, VERM, VERM_DARK, PAPER, PAPER_SHADE, LANTERN,
  inkA, paperA, vermA, lanternA,
} from './palette.js';
import { makeCanvas, makeRng, hashStr, withMisreg, printSpeckle } from './ink.js';
import { normalizeHeroSkinId } from '../meta/cosmetics.js';

const TAU = Math.PI * 2;

// 国画矿物重彩颜料（严格对齐真机视觉辨识度与色彩桶检测）
export const MINERAL = {
  jadeDeep: '#0E5C42',
  jade: '#1C9E72',
  jadeLight: '#3CD49E',
  azureDeep: '#144472',
  azure: '#227EC8',
  azureLight: '#52B4F0',
  violetDeep: '#421C78',
  violet: '#7C3AD6',
  violetLight: '#A662F2',
  goldDeep: '#7A4612',
  gold: '#DC9824',
  goldLight: '#F2B442',
};

export const SKIN_W = 52;
export const SKIN_H = 58;
export const SKIN_AX = 26;
export const SKIN_AY = 50;

let SCALE = 2;
const skinCache = new Map();

export function setSkinScale(s) {
  const v = Math.max(1, Math.min(3, s || 1));
  if (v !== SCALE) {
    SCALE = v;
    skinCache.clear();
  }
}

export function clearSkinCache() {
  skinCache.clear();
}

export function isNonDefaultSkin(heroId, skinId) {
  const norm = normalizeHeroSkinId(heroId, skinId);
  return !norm.endsWith('_default');
}

/* ------------------------------------------------------------------ */
/* 基础几何笔法工具                                                    */
/* ------------------------------------------------------------------ */

function strokeCfg(g, lw = 1.2, color = INK) {
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

function fillStroke(g, fillCol, lw = 1.2, strokeCol = INK) {
  g.fillStyle = fillCol;
  g.fill();
  strokeCfg(g, lw, strokeCol);
  g.stroke();
}

function line(g, x0, y0, x1, y1, lw = 1.2, color = INK) {
  strokeCfg(g, lw, color);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function vfill(g, pathFn, color = VERM) {
  withMisreg(g, () => {
    pathFn();
    g.fillStyle = color;
    g.fill();
  });
}

function bakeSkin(key, w, h, ax, ay, drawFn, opts = {}) {
  let s = skinCache.get(key);
  if (s) return s;
  const c = makeCanvas(w * SCALE, h * SCALE);
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  g.save();
  g.translate(ax, ay);
  const rng = makeRng(hashStr(key) + 19);
  const meta = drawFn(g, rng) || {};
  g.restore();
  if (opts.speckle !== false) {
    printSpeckle(g, w, h, makeRng(hashStr(key) + 5), opts.speckle ?? 0.003, 0.7);
  }
  if (opts.flash) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = vermA(0.82);
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  s = {
    canvas: c,
    w,
    h,
    ax,
    ay,
    handX: meta.handX ?? 7.5,
    handY: meta.handY ?? -12,
  };
  skinCache.set(key, s);
  return s;
}

function drawLegs(g, f, color = INK, spread = 2.4) {
  const s = [0, 1, 0, -1][f % 4];
  strokeCfg(g, 2.3, color);
  g.beginPath();
  g.moveTo(-spread, -8);
  g.lineTo(-spread - 0.4 + s * 1.8, -0.4 - (s > 0 ? 1 : 0));
  g.moveTo(spread, -8);
  g.lineTo(spread + 0.4 - s * 1.8, -0.4 - (s < 0 ? 1 : 0));
  g.stroke();
}

function drawFace(g, y = -22.4, r = 3.8, skinFill = PAPER, eyeCol = INK) {
  circ(g, 0, y, r);
  fillStroke(g, skinFill, 1.15, INK);
  g.fillStyle = eyeCol;
  circ(g, 1.5, y + 0.7, 0.65);
  g.fill();
  circ(g, -1.2, y + 0.7, 0.65);
  g.fill();
}

function drawClassicRobe(g, sashColor = VERM, outfit = null) {
  const robeFill = outfit === 'outfit_hemp' ? PAPER_SHADE : outfit === 'outfit_straw' ? PAPER : INK;
  poly(g, [[-4.6, -20], [4.6, -20], [6.6, -6.5], [0, -5.5], [-6.6, -6.5]]);
  fillStroke(g, robeFill, 1.1);
  if (outfit === 'outfit_straw') {
    for (const y of [-17, -13.5, -10]) {
      for (const x of [-4, -1.5, 1.5, 4]) line(g, x, y, x * 1.15, y + 2.4, 0.7, inkA(0.65));
    }
  } else if (outfit === 'outfit_indigo' || outfit === 'outfit_ink') {
    poly(g, [[-6.8, -6.8], [6.8, -6.8], [7.2, -3.8], [-7.2, -3.8]]);
    fillStroke(g, outfit === 'outfit_ink' ? INK : PAPER_SHADE, 0.9);
  }
  strokeCfg(g, 2.5, INK);
  g.beginPath();
  g.moveTo(3, -18);
  g.quadraticCurveTo(6.5, -16, 7.5, -12);
  g.stroke();
  vfill(g, () => poly(g, [[-6.1, -12.6], [6.1, -12.2], [6.3, -10.4], [-6.3, -10.6]]), sashColor);
  vfill(g, () => poly(g, [[-4.6, -11], [-3.3, -11], [-4.4, -6.6], [-5.8, -7]]), sashColor);
  strokeCfg(g, 1, robeFill === INK ? PAPER : INK);
  g.beginPath();
  g.moveTo(-2.4, -19.6);
  g.lineTo(0, -16.6);
  g.lineTo(2.4, -19.6);
  g.stroke();
}

/* ------------------------------------------------------------------ */
/* 1. 周更夫 (zhou) 三套皮肤                                            */
/* ------------------------------------------------------------------ */

function drawZhouDefault(g, f, outfit) {
  circ(g, -6.8, -16.5, 5);
  fillStroke(g, PAPER_SHADE, 1.2);
  circ(g, -6.8, -16.5, 2.2);
  strokeCfg(g, 0.9);
  g.stroke();
  drawLegs(g, f);
  drawClassicRobe(g, VERM, outfit);
  drawFace(g, -22.4, 3.7, PAPER);
  g.beginPath();
  g.moveTo(-12, -23.2);
  g.quadraticCurveTo(-5, -30, 0, -34);
  g.quadraticCurveTo(5, -30, 12, -23.2);
  g.quadraticCurveTo(0, -21.4, -12, -23.2);
  g.closePath();
  fillStroke(g, PAPER_SHADE, 1.3);
  strokeCfg(g, 0.7, inkA(0.6));
  g.beginPath();
  for (const x of [-7.5, -3.8, 0, 3.8, 7.5]) {
    g.moveTo(0, -33.2);
    g.lineTo(x, -22.6 + Math.abs(x) * -0.06);
  }
  g.stroke();
  circ(g, 0, -34, 1.1);
  g.fillStyle = INK;
  g.fill();
  return { handX: 7.5, handY: -12 };
}

function drawZhouJadeWatch(g, f) {
  // 背后斜插双面青冥靖夜三角令旗（大幅拓宽上半部双翼轮廓）
  line(g, -3, -16, -18, -44, 1.7, INK);
  poly(g, [[-18, -44], [-7, -38], [-13, -27]]);
  fillStroke(g, MINERAL.jade, 1.2, INK);
  poly(g, [[-16, -41], [-9, -37], [-13, -30]]);
  fillStroke(g, MINERAL.jadeLight, 0.8, MINERAL.jadeDeep);

  line(g, 3, -16, 17, -42, 1.7, INK);
  poly(g, [[17, -42], [7, -36], [12, -26]]);
  fillStroke(g, MINERAL.jade, 1.2, INK);

  drawLegs(g, f, MINERAL.jadeDeep, 3.2);

  // 下半部：向外大幅张开的层叠石绿阔摆蓑衣大氅（x ∈ [-18, +17]）
  poly(g, [[-9, -20], [9, -20], [17.5, -1.5], [10, 1.8], [0, -1], [-10, 1.8], [-18, -1.5]]);
  fillStroke(g, MINERAL.jadeDeep, 1.3, INK);
  poly(g, [[-8, -19], [8, -19], [14.5, -5.5], [0, -3.5], [-15, -5.5]]);
  fillStroke(g, MINERAL.jade, 1.1, INK);
  poly(g, [[-6.5, -19.5], [6.5, -19.5], [10.5, -11.5], [0, -9.5], [-10.5, -11.5]]);
  fillStroke(g, MINERAL.jadeLight, 1.0, INK);

  // 腰间青铜兽首镇魂牌与金带
  poly(g, [[-9.5, -12], [9.5, -12], [10, -9.4], [-10, -9.4]]);
  fillStroke(g, MINERAL.gold, 1.0, INK);
  circ(g, 0, -10.6, 2.6);
  fillStroke(g, MINERAL.jadeLight, 1.0, INK);

  // 前伸手臂
  line(g, 5, -17, 11.5, -13, 2.8, MINERAL.jadeDeep);

  drawFace(g, -23, 3.8, PAPER);

  // 靖夜司平展长翅乌纱高冠（宽展官帽翅 [-17..+17]）
  poly(g, [[-17.5, -28.5], [-5, -27.2], [-5, -29.8], [-17.5, -31.2]]);
  fillStroke(g, INK, 1.1, MINERAL.jadeLight);
  poly(g, [[17.5, -28.5], [5, -27.2], [5, -29.8], [17.5, -31.2]]);
  fillStroke(g, INK, 1.1, MINERAL.jadeLight);
  poly(g, [[-5, -25.2], [-4.4, -36.8], [4.4, -36.8], [5, -25.2]]);
  fillStroke(g, INK, 1.2, INK);
  circ(g, 0, -31.5, 2.2);
  fillStroke(g, MINERAL.jadeLight, 0.9, INK);
  return { handX: 11.5, handY: -13 };
}

function drawZhouImperialBell(g, f) {
  // 脑后高悬紫金大日轮神环 + 左肩悬空巨型鸣鸿洪钟
  circ(g, 0, -30, 12.5);
  strokeCfg(g, 2.8, MINERAL.gold);
  g.stroke();
  circ(g, 0, -30, 9.8);
  strokeCfg(g, 1.6, MINERAL.violet);
  g.stroke();

  // 左后斜扬不对称紫金战袍长披风（直甩向左侧 x=-22, y=+2.5，右侧紧收！）
  poly(g, [[-4, -19], [-22.5, -7], [-20.5, 2.8], [-11, 1.5], [-4, -5]]);
  fillStroke(g, MINERAL.violet, 1.3, INK);
  poly(g, [[-5, -17], [-18.5, -6], [-16.5, 0.5], [-6, -6]]);
  fillStroke(g, MINERAL.gold, 0.9, INK);

  // 左肩悬浮紫金镇城洪钟
  poly(g, [[-15.5, -25], [-8.5, -25], [-7, -15.5], [-17, -15.5]]);
  fillStroke(g, MINERAL.gold, 1.2, INK);
  line(g, -15.5, -20, -8.5, -20, 1.3, MINERAL.violetDeep);

  drawLegs(g, f, INK, 2.6);

  // 紧身紫金吞兽重甲身躯（右侧收窄至 +7.5，与蓑衣完全不同）
  poly(g, [[-5.2, -20.5], [5.8, -20.5], [7.6, -5.5], [-4.8, -5.5]]);
  fillStroke(g, MINERAL.violetDeep, 1.3, INK);
  poly(g, [[-3.8, -19], [4.4, -19], [5.2, -8], [-3.2, -8]]);
  fillStroke(g, MINERAL.gold, 1.0, INK);
  line(g, 4.5, -17.5, 9.8, -12.5, 2.6, MINERAL.goldDeep);

  drawFace(g, -23.2, 3.8, PAPER);

  // 冲天三叉凤翅紫金高兜鍪（直刺 y=-48！）
  poly(g, [[-4.8, -25], [0, -35], [4.8, -25]]);
  fillStroke(g, MINERAL.gold, 1.2, INK);
  poly(g, [[-2.2, -33], [0, -48], [2.2, -33]]);
  fillStroke(g, VERM, 1.1, INK);
  poly(g, [[-4, -31], [-9.5, -44], [-1.5, -34]]);
  fillStroke(g, MINERAL.violetLight, 1.0, INK);
  poly(g, [[4, -31], [9.5, -44], [1.5, -34]]);
  fillStroke(g, MINERAL.violetLight, 1.0, INK);
  return { handX: 9.8, handY: -12.5 };
}

/* ------------------------------------------------------------------ */
/* 2. 巧手阿绵 (mian) 三套皮肤                                          */
/* ------------------------------------------------------------------ */

function drawMianDefault(g, f, outfit) {
  strokeCfg(g, 1.2);
  g.beginPath();
  g.moveTo(-8, -26);
  g.lineTo(-3, -14);
  g.moveTo(-3.5, -26.5);
  g.lineTo(-6.5, -14);
  g.stroke();
  circ(g, -3.2, -12.8, 1.6);
  g.stroke();
  circ(g, -6.9, -12.8, 1.6);
  g.stroke();
  drawLegs(g, f);
  drawClassicRobe(g, VERM, outfit);
  vfill(g, () => poly(g, [[-3.6, -10.4], [3.6, -10.2], [4.4, -5.6], [-4.4, -5.8]]));
  drawFace(g, -22.6, 4.1, PAPER);
  g.beginPath();
  g.arc(0, -22.6, 4.1, Math.PI * 1.02, Math.PI * 1.98);
  g.quadraticCurveTo(1, -23.6, -4.1, -22.4);
  g.fillStyle = INK;
  g.fill();
  circ(g, -4.6, -27, 2.4);
  g.fill();
  circ(g, 4.6, -27, 2.4);
  g.fill();
  vfill(g, () => {
    g.beginPath();
    g.rect(-5.6, -25.4, 2.2, 1);
    g.rect(3.6, -25.4, 2.2, 1);
  });
  return { handX: 7.5, handY: -12 };
}

function drawMianAzureBride(g, f) {
  // 背后展开两扇巨大石青剪纸折扇翼（宽达 [-21, +21]）
  poly(g, [[0, -18], [-21, -34], [-22, -21], [-15, -14]]);
  fillStroke(g, MINERAL.azure, 1.2, INK);
  poly(g, [[0, -18], [21, -34], [22, -21], [15, -14]]);
  fillStroke(g, MINERAL.azure, 1.2, INK);
  for (const sgn of [-1, 1]) {
    line(g, 0, -18, sgn * 19, -28, 0.9, PAPER);
    line(g, 0, -18, sgn * 18, -22, 0.9, MINERAL.azureLight);
  }

  // 下半部：曳地石青百褶广袖霞帔大长裙（对称铺开至 [-18.5, +18.5, y=+2.5]）
  poly(g, [[-7, -19], [7, -19], [18.5, -4], [14.5, 2.5], [0, 3.2], [-14.5, 2.5], [-18.5, -4]]);
  fillStroke(g, MINERAL.azureDeep, 1.3, INK);
  poly(g, [[-5.5, -18.5], [5.5, -18.5], [13.5, -1], [0, 1.5], [-13.5, -1]]);
  fillStroke(g, MINERAL.azure, 1.1, INK);
  poly(g, [[-3.8, -14], [3.8, -14], [7.5, 1.2], [-7.5, 1.2]]);
  fillStroke(g, MINERAL.azureLight, 1.0, INK);

  // 石青云肩与广袖
  poly(g, [[-9.5, -19.5], [0, -15], [9.5, -19.5], [6, -21.5], [-6, -21.5]]);
  fillStroke(g, PAPER, 1.0, INK);
  line(g, 6, -17, 12.5, -12, 2.6, MINERAL.azure);

  drawFace(g, -23.2, 4.0, PAPER);

  // 华丽扇形点翠九凤博鬓花冠（宽冠 [-15..+15, y=-41]）
  poly(g, [[-14.5, -27], [-11, -39], [0, -42.5], [11, -39], [14.5, -27], [6, -25.5], [-6, -25.5]]);
  fillStroke(g, MINERAL.azure, 1.2, INK);
  poly(g, [[-9, -28], [-6, -36.5], [0, -39], [6, -36.5], [9, -28]]);
  fillStroke(g, MINERAL.azureLight, 0.9, INK);
  circ(g, 0, -33, 2.2);
  fillStroke(g, MINERAL.goldLight, 0.8, INK);
  // 两侧垂珠步摇
  line(g, -13.5, -27, -14.5, -19, 1.4, MINERAL.goldLight);
  line(g, 13.5, -27, 14.5, -19, 1.4, MINERAL.goldLight);
  return { handX: 12.5, handY: -12 };
}

function drawMianGoldPuppeteer(g, f) {
  // 背后高耸十字鎏金提线机关架（偏右高挑横梁 + 悬垂傀儡丝与右侧伴偶！）
  line(g, 2, -16, 4, -46, 2.2, MINERAL.goldDeep);
  poly(g, [[-9, -43], [19, -43], [17, -39.5], [-11, -39.5]]);
  fillStroke(g, MINERAL.gold, 1.2, INK);
  line(g, 15, -40, 17, -14, 1.1, MINERAL.goldLight);
  line(g, 10, -40, 12, -14, 1.1, MINERAL.goldLight);

  // 右侧悬空迷你金红提线纸偶 + 右向大灯笼裙摆（极强左右不对称：左窄 x=-5.5，右极宽 x=+21！）
  poly(g, [[-4.8, -19.5], [6.5, -19.5], [21.5, -6], [19, 2.5], [6, 2], [-5.2, -5.5]]);
  fillStroke(g, MINERAL.gold, 1.3, INK);
  poly(g, [[3, -15], [18.5, -5], [15.5, 1.2], [4, -1]]);
  fillStroke(g, VERM, 1.1, INK);
  circ(g, 15.5, -14.5, 3.2);
  fillStroke(g, PAPER, 1.0, INK);

  drawLegs(g, f, INK, 2.2);
  poly(g, [[-5, -20], [5.5, -20], [6.2, -8], [-5.2, -8]]);
  fillStroke(g, INK, 1.2, INK);
  poly(g, [[-5.4, -12], [5.8, -12], [6.2, -9.2], [-5.8, -9.2]]);
  fillStroke(g, MINERAL.goldLight, 1.0, INK);

  line(g, 4.5, -17, 10.5, -12.5, 2.4, MINERAL.gold);
  drawFace(g, -23, 3.9, PAPER);

  // 单尖斜挑高耸折角金丝傀儡师高帽（尖顶向左斜挑至 (-8, -48)！）
  poly(g, [[-5.2, -25.2], [-9.5, -48], [1.5, -36], [5.2, -25.2]]);
  fillStroke(g, MINERAL.gold, 1.2, INK);
  circ(g, -9.5, -48, 2.1);
  fillStroke(g, VERM, 0.9, INK);
  return { handX: 10.5, handY: -12.5 };
}

/* ------------------------------------------------------------------ */
/* 3. 玄真道童 (daotong) 三套皮肤                                       */
/* ------------------------------------------------------------------ */

function drawDaotongDefault(g, f, outfit) {
  vfill(g, () => poly(g, [[-9, -30], [-7.6, -30.6], [-1.5, -12.5], [-2.8, -12]]));
  line(g, -6.2, -18.6, -3.4, -19.8, 1.4);
  drawLegs(g, f);
  drawClassicRobe(g, VERM, outfit);
  strokeCfg(g, 1.2, PAPER);
  g.beginPath();
  g.moveTo(-3.4, -19.4);
  g.lineTo(2.2, -13);
  g.moveTo(3.4, -19.4);
  g.lineTo(-0.6, -15.2);
  g.stroke();
  drawFace(g, -22, 3.7, PAPER);
  g.beginPath();
  g.moveTo(-4.4, -23.4);
  g.quadraticCurveTo(-4.8, -29.6, 0, -30);
  g.quadraticCurveTo(4.8, -29.6, 4.4, -23.4);
  g.quadraticCurveTo(0, -24.8, -4.4, -23.4);
  g.fillStyle = INK;
  g.fill();
  line(g, -3, -30.6, 3.2, -30.2, 1.1);
  vfill(g, () => circ(g, 0, -31.2, 1.2));
  return { handX: 7.5, handY: -12 };
}

function drawDaotongVioletThunder(g, f) {
  // 背后呈扇形悬浮展开五柄紫电飞剑剑轮（放射状刺出 [-22..+22, y=-24..-45]）
  const angles = [-2.35, -1.92, -1.57, -1.22, -0.79];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const r0 = 9;
    const r1 = 27;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const nx = -uy;
    const ny = ux;
    const cx0 = 0;
    const cy0 = -20;
    poly(g, [
      [cx0 + ux * r0 + nx * 2.1, cy0 + uy * r0 + ny * 2.1],
      [cx0 + ux * (r1 - 4) + nx * 2.4, cy0 + uy * (r1 - 4) + ny * 2.4],
      [cx0 + ux * r1, cy0 + uy * r1],
      [cx0 + ux * (r1 - 4) - nx * 2.4, cy0 + uy * (r1 - 4) - ny * 2.4],
      [cx0 + ux * r0 - nx * 2.1, cy0 + uy * r0 - ny * 2.1],
    ]);
    fillStroke(g, i % 2 === 0 ? MINERAL.violet : MINERAL.violetLight, 1.0, INK);
  }

  drawLegs(g, f, MINERAL.violetDeep, 3.0);

  // 下半部：对称大张的紫金八卦鹤氅广袖道袍（宽至 [-18, +18]）
  poly(g, [[-8, -20], [8, -20], [18.5, -5], [15, 2.2], [0, -1.5], [-15, 2.2], [-18.5, -5]]);
  fillStroke(g, MINERAL.violetDeep, 1.3, INK);
  poly(g, [[-6, -19.5], [6, -19.5], [12.5, -2.5], [0, 0.8], [-12.5, -2.5]]);
  fillStroke(g, MINERAL.violet, 1.1, INK);
  poly(g, [[-2.8, -19], [2.8, -19], [4.5, -2], [-4.5, -2]]);
  fillStroke(g, PAPER, 0.9, INK);
  circ(g, 0, -11, 3.2);
  fillStroke(g, MINERAL.goldLight, 0.9, INK);

  line(g, 6, -17, 12, -12.5, 2.6, MINERAL.violet);
  drawFace(g, -22.8, 3.8, PAPER);

  // 五岳莲花紫金天师冠
  poly(g, [[-6.5, -24.8], [-8.5, -33], [-3.5, -31], [0, -40], [3.5, -31], [8.5, -33], [6.5, -24.8]]);
  fillStroke(g, MINERAL.violet, 1.2, INK);
  circ(g, 0, -31, 2.0);
  fillStroke(g, MINERAL.goldLight, 0.8, INK);
  return { handX: 12, handY: -12.5 };
}

function drawDaotongJadeImmortal(g, f) {
  // 左上方偏心石绿满月玉璧轮 + 右肩斜扛硕大碧玉药葫芦杖（强烈非对称上轮廓）
  circ(g, -9.5, -34.5, 11.5);
  fillStroke(g, MINERAL.jadeLight, 1.4, INK);
  circ(g, -9.5, -34.5, 6.2);
  fillStroke(g, PAPER, 1.0, MINERAL.jadeDeep);

  // 右肩斜伸出的仙藤大药葫芦
  line(g, -2, -15, 15, -44, 2.0, INK);
  circ(g, 13.5, -39, 4.6);
  fillStroke(g, MINERAL.jade, 1.1, INK);
  circ(g, 15.5, -45, 3.1);
  fillStroke(g, MINERAL.goldLight, 1.0, INK);

  // 下半部：向左后方长曳的石绿仙霞羽衣飘带（左侧远甩至 x=-23, y=+3.5，右侧收窄 +6.5！）
  poly(g, [[-4, -18], [-23, -8], [-21.5, 3.5], [-10, 2.5], [-3, -4]]);
  fillStroke(g, MINERAL.jade, 1.3, INK);
  poly(g, [[-4, -15], [-18.5, -5], [-16, 1.5], [-5, -4]]);
  fillStroke(g, MINERAL.jadeLight, 0.9, INK);

  drawLegs(g, f, MINERAL.jadeDeep, 2.2);
  poly(g, [[-5.2, -20], [5.2, -20], [6.8, -4.5], [-5.6, -4.5]]);
  fillStroke(g, PAPER, 1.2, INK);
  poly(g, [[-5.5, -13], [5.6, -13], [6.2, -9.5], [-6, -9.5]]);
  fillStroke(g, MINERAL.jade, 1.0, INK);

  line(g, 4.5, -17, 9.5, -12, 2.4, MINERAL.jade);
  drawFace(g, -22.6, 3.8, PAPER);

  // 散仙逍遥束发金环（无高冠，与天师冠形成高度反差）
  g.fillStyle = INK;
  circ(g, 0, -26.5, 3.6);
  g.fill();
  poly(g, [[-5, -25.2], [5, -25.2], [4.5, -23.6], [-4.5, -23.6]]);
  fillStroke(g, MINERAL.jadeLight, 0.9, INK);
  return { handX: 9.5, handY: -12 };
}

/* ------------------------------------------------------------------ */
/* 4. 沈观星 (yinyang) 三套皮肤                                         */
/* ------------------------------------------------------------------ */

function drawYinyangDefault(g, f, outfit) {
  circ(g, -6.5, -17, 5.4);
  fillStroke(g, PAPER_SHADE, 1.1);
  circ(g, -6.5, -17, 2.5);
  fillStroke(g, VERM, 0.8);
  drawLegs(g, f);
  drawClassicRobe(g, LANTERN, outfit);
  line(g, -5.8, -7.2, 5.8, -7.2, 1.1, PAPER);
  drawFace(g, -22.2, 3.7, PAPER);
  strokeCfg(g, 0.9, INK);
  g.beginPath();
  g.moveTo(-1.2, -19.2);
  g.lineTo(-1.8, -15.4);
  g.moveTo(0, -19);
  g.lineTo(0, -14.8);
  g.moveTo(1.2, -19.2);
  g.lineTo(1.8, -15.4);
  g.stroke();
  poly(g, [[-4.2, -24.2], [-3.8, -32.4], [3.8, -32.4], [4.2, -24.2]]);
  fillStroke(g, INK, 1.1);
  circ(g, 0, -28.4, 1.8);
  fillStroke(g, LANTERN, 0.8);
  return { handX: 7.5, handY: -12 };
}

function drawYinyangFrostAstrolabe(g, f) {
  // 背后悬浮巨型双环石青浑天星轨仪（宽扩至 [-20, +20]）
  circ(g, 0, -27, 18.5);
  strokeCfg(g, 3.0, MINERAL.azure);
  g.stroke();
  ell(g, 0, -27, 19.5, 8.5, 0.48);
  strokeCfg(g, 2.2, MINERAL.azureLight);
  g.stroke();
  for (const [sx, sy] of [[-18.5, -27], [18.5, -27], [-13, -40], [13, -40]]) {
    circ(g, sx, sy, 2.6);
    fillStroke(g, MINERAL.azureLight, 0.9, INK);
  }

  drawLegs(g, f, MINERAL.azureDeep, 3.0);

  // 下半部：笔直宽博的玄冰观星方袖祭礼大裳（梯形宽铺 [-18, +18]）
  poly(g, [[-9.5, -20], [9.5, -20], [18.5, -3], [15.5, 2.5], [-15.5, 2.5], [-18.5, -3]]);
  fillStroke(g, MINERAL.azureDeep, 1.3, INK);
  poly(g, [[-6.5, -19.5], [6.5, -19.5], [12, 2.0], [-12, 2.0]]);
  fillStroke(g, MINERAL.azure, 1.1, INK);
  poly(g, [[-3, -19], [3, -19], [4.8, 2.0], [-4.8, 2.0]]);
  fillStroke(g, PAPER, 1.0, INK);
  circ(g, 0, -10.5, 3.4);
  fillStroke(g, MINERAL.azureLight, 0.9, INK);

  line(g, 7, -17, 12.5, -12.5, 2.6, MINERAL.azure);
  drawFace(g, -22.8, 3.8, PAPER);
  line(g, 0, -19, 0, -14.5, 1.1, PAPER);

  // 平天冠宽冕板（[-14..+14, y=-36..-39]）+ 垂旒
  poly(g, [[-4.8, -24.8], [-4.5, -35.5], [4.5, -35.5], [4.8, -24.8]]);
  fillStroke(g, MINERAL.azureDeep, 1.1, INK);
  poly(g, [[-14.5, -35.5], [14.5, -35.5], [13, -38.5], [-13, -38.5]]);
  fillStroke(g, MINERAL.azureLight, 1.2, INK);
  for (const lx of [-12, -8, 8, 12]) {
    line(g, lx, -35.5, lx, -29.5, 1.1, PAPER);
  }
  return { handX: 12.5, handY: -12.5 };
}

function drawYinyangGoldOracle(g, f) {
  // 右后竖立高大太乙招星金幡（高耸至 (+14, -48)）+ 右侧垂落长幡布
  line(g, 6, -4, 13, -48, 2.0, MINERAL.goldDeep);
  poly(g, [[13, -47], [22.5, -43], [20.5, -16], [12, -20]]);
  fillStroke(g, MINERAL.gold, 1.2, INK);
  poly(g, [[14.5, -43], [19.5, -40], [18.5, -22], [13.5, -24]]);
  fillStroke(g, VERM, 0.9, INK);

  // 下半部：左侧大幅扬起的赤金神诏流苏法氅（左扩至 -22.5, y=+3，右侧紧收 +8）
  poly(g, [[-4.5, -19.5], [-22.5, -9], [-20, 3.2], [-8.5, 2.2], [-4, -5]]);
  fillStroke(g, MINERAL.gold, 1.3, INK);
  poly(g, [[-5, -16.5], [-17.5, -7], [-15, 0.8], [-6, -5]]);
  fillStroke(g, VERM, 1.0, INK);

  drawLegs(g, f, INK, 2.4);
  poly(g, [[-5.2, -20], [5.8, -20], [7.8, -4.5], [-5.2, -4.5]]);
  fillStroke(g, INK, 1.2, INK);
  poly(g, [[-3.5, -19], [3.8, -19], [5.0, -5], [-3.5, -5]]);
  fillStroke(g, MINERAL.goldLight, 1.0, INK);

  line(g, 5, -17, 10.5, -12, 2.5, MINERAL.gold);
  drawFace(g, -22.8, 3.8, PAPER);

  // 冲天火焰尖锥日冕神官高冠（中尖直达 (0, -48.5)！）
  poly(g, [[-5, -24.8], [-8.5, -34], [-2.8, -33], [0, -48.5], [2.8, -33], [8.5, -34], [5, -24.8]]);
  fillStroke(g, MINERAL.goldLight, 1.2, INK);
  circ(g, 0, -30.5, 2.4);
  fillStroke(g, VERM, 0.9, INK);
  return { handX: 10.5, handY: -12 };
}

/* ------------------------------------------------------------------ */
/* 5. 石敢当 (tiejiang) 三套皮肤                                        */
/* ------------------------------------------------------------------ */

function drawTiejiangDefault(g, f, outfit) {
  line(g, -9.2, -29, -2.5, -12, 1.8, INK);
  poly(g, [[-11.8, -28.5], [-6.2, -31.2], [-4.8, -27.8], [-10.4, -25.2]]);
  fillStroke(g, PAPER_SHADE, 1.1);
  drawLegs(g, f);
  drawClassicRobe(g, VERM_DARK, outfit);
  vfill(g, () => poly(g, [[-4.2, -16], [4.2, -16], [4.8, -5.8], [-4.8, -5.8]]), VERM_DARK);
  poly(g, [[-6.8, -20.2], [-2.4, -20.2], [-3, -15.8], [-7.2, -16.4]]);
  fillStroke(g, PAPER_SHADE, 1);
  drawFace(g, -22.4, 3.9, PAPER_SHADE);
  poly(g, [[-3.6, -20.2], [3.6, -20.2], [2.8, -16.2], [-2.8, -16.2]]);
  fillStroke(g, INK, 0.9);
  vfill(g, () => poly(g, [[-4.4, -25.2], [4.4, -25.2], [4.4, -23], [-4.4, -23]]));
  vfill(g, () => poly(g, [[-4.2, -24.4], [-8.5, -26.4], [-7.6, -23.2]]));
  return { handX: 7.5, handY: -12 };
}

function drawTiejiangJadeTaotie(g, f) {
  // 背后交叉双柄宽刃青铜巨斧（向左右上方大张至 [-21, -39] 与 [+21, -39]）
  for (const sgn of [-1, 1]) {
    line(g, -sgn * 3, -10, sgn * 17, -40, 2.2, INK);
    poly(g, [
      [sgn * 11, -38],
      [sgn * 22, -41],
      [sgn * 23, -27],
      [sgn * 13, -25],
    ]);
    fillStroke(g, MINERAL.jade, 1.3, INK);
    poly(g, [
      [sgn * 14, -36],
      [sgn * 20, -38],
      [sgn * 20.5, -29],
      [sgn * 15, -28],
    ]);
    fillStroke(g, MINERAL.jadeLight, 0.9, INK);
  }

  drawLegs(g, f, MINERAL.jadeDeep, 3.4);

  // 下半部：厚重宽阔的青铜饕餮吞肩重铠与外扩梯形铁叶战裙（对称张开 [-18.5, +18.5]）
  poly(g, [[-11, -20.5], [11, -20.5], [18.5, -3.5], [13.5, 2.2], [5, -1], [-5, -1], [-13.5, 2.2], [-18.5, -3.5]]);
  fillStroke(g, MINERAL.jadeDeep, 1.4, INK);
  poly(g, [[-8, -19.5], [8, -19.5], [12.5, -2], [-12.5, -2]]);
  fillStroke(g, MINERAL.jade, 1.1, INK);
  // 胸腹饕餮金铜兽面护心镜
  poly(g, [[-5.5, -16.5], [5.5, -16.5], [4.2, -8.5], [-4.2, -8.5]]);
  fillStroke(g, MINERAL.gold, 1.1, INK);
  // 左右巨型吞肩甲
  poly(g, [[-15.5, -22], [-6, -21], [-7, -14.5], [-16.5, -16]]);
  fillStroke(g, MINERAL.jadeLight, 1.2, INK);
  poly(g, [[15.5, -22], [6, -21], [7, -14.5], [16.5, -16]]);
  fillStroke(g, MINERAL.jadeLight, 1.2, INK);

  line(g, 8, -16.5, 13, -12, 2.8, MINERAL.jadeDeep);
  drawFace(g, -23, 4.0, PAPER_SHADE);

  // 双弯巨角青铜饕餮重盔（牛角向两侧高挑至 [-19, -43] 与 [+19, -43]）
  poly(g, [[-5.5, -24.5], [-5, -33], [5, -33], [5.5, -24.5]]);
  fillStroke(g, MINERAL.jade, 1.2, INK);
  poly(g, [[-4.8, -30], [-14, -33], [-19.5, -43], [-12, -38], [-4.5, -33]]);
  fillStroke(g, MINERAL.goldLight, 1.2, INK);
  poly(g, [[4.8, -30], [14, -33], [19.5, -43], [12, -38], [4.5, -33]]);
  fillStroke(g, MINERAL.goldLight, 1.2, INK);
  return { handX: 13, handY: -12 };
}

function drawTiejiangVioletAsura(g, f) {
  // 右后背负高耸喷涌紫火的镇狱锻魂铁炉（偏右高塔轮廓 (+11, -43)）
  poly(g, [[3, -38], [16, -38], [18, -17], [2, -17]]);
  fillStroke(g, MINERAL.violetDeep, 1.3, INK);
  poly(g, [[5, -38], [8, -47], [12, -42], [15, -48], [15, -38]]);
  fillStroke(g, MINERAL.violetLight, 1.1, INK);
  circ(g, 10, -27, 4.0);
  fillStroke(g, MINERAL.goldLight, 1.0, INK);

  // 下半部：向左下方狂甩而出的巨型修罗锁魂铁链环与破碎紫焰战裙（左甩 -23, y=+4，右收 +8！）
  poly(g, [[-4, -18], [-23, -10], [-21.5, 3.8], [-9, 2.5], [-3, -5]]);
  fillStroke(g, MINERAL.violet, 1.3, INK);
  circ(g, -18.5, -2, 4.8);
  strokeCfg(g, 2.4, MINERAL.goldLight);
  g.stroke();
  circ(g, -13, -5, 4.2);
  strokeCfg(g, 2.2, MINERAL.violetLight);
  g.stroke();

  drawLegs(g, f, INK, 2.6);
  poly(g, [[-5.8, -20.5], [6.2, -20.5], [7.8, -5], [-5.8, -5]]);
  fillStroke(g, INK, 1.2, INK);
  poly(g, [[-4.5, -18.5], [4.8, -18.5], [5.5, -8.5], [-4.5, -8.5]]);
  fillStroke(g, MINERAL.violet, 1.0, INK);

  line(g, 5.5, -17, 11, -12, 2.8, MINERAL.violetDeep);
  drawFace(g, -22.8, 4.0, PAPER_SHADE);

  // 冲天狂放紫焰怒发高冠（中左冲天尖焰直刺 (-3, -48.5)！）
  poly(g, [[-5.2, -24.5], [-9.5, -38], [-4.5, -35], [-2.5, -48.5], [2.5, -36], [6.5, -42], [5.2, -24.5]]);
  fillStroke(g, MINERAL.violetLight, 1.2, INK);
  return { handX: 11, handY: -12 };
}

/* ------------------------------------------------------------------ */
/* 6. 柳青衣 (nuoxi) 三套皮肤                                           */
/* ------------------------------------------------------------------ */

function drawNuoxiDefault(g, f, outfit) {
  circ(g, -6.2, -16.8, 4.4);
  fillStroke(g, VERM, 1.1);
  circ(g, -6.2, -16.8, 2.2);
  fillStroke(g, PAPER, 0.8);
  drawLegs(g, f);
  drawClassicRobe(g, VERM, outfit);
  poly(g, [[-6.4, -19.8], [0, -16.2], [6.4, -19.8], [4.4, -20.8], [-4.4, -20.8]]);
  fillStroke(g, LANTERN, 0.9);
  strokeCfg(g, 1.1, VERM);
  g.beginPath();
  g.moveTo(-1.5, -27.5);
  g.quadraticCurveTo(-6.5, -34.5, -11.5, -34);
  g.moveTo(1.5, -27.5);
  g.quadraticCurveTo(6.5, -34.5, 11.5, -34);
  g.stroke();
  drawFace(g, -22.2, 3.8, PAPER);
  poly(g, [[-3.8, -24.5], [-3.2, -29.2], [3.8, -28.6], [3.6, -24.2]]);
  fillStroke(g, VERM, 1);
  circ(g, 1.2, -26.5, 0.8);
  g.fillStyle = LANTERN;
  g.fill();
  return { handX: 7.5, handY: -12 };
}

function drawNuoxiAzurePhoenix(g, f) {
  // 下半部：大幅对称张开的石青孔雀翠羽曳地水袖舞裙（双水袖+雀尾裙铺展 [-19.5, +19.5]）
  poly(g, [[-8, -19.5], [8, -19.5], [19.5, -6], [16, 2.8], [0, 3.6], [-16, 2.8], [-19.5, -6]]);
  fillStroke(g, MINERAL.azureDeep, 1.3, INK);
  poly(g, [[-6, -19], [6, -19], [14, 0.5], [0, 2.2], [-14, 0.5]]);
  fillStroke(g, MINERAL.azure, 1.1, INK);
  for (const px of [-9, 0, 9]) {
    circ(g, px, -3.5, 2.4);
    fillStroke(g, MINERAL.jadeLight, 0.9, INK);
  }

  // 云肩与水袖手臂
  poly(g, [[-11, -20], [0, -14.5], [11, -20], [7, -22], [-7, -22]]);
  fillStroke(g, MINERAL.azureLight, 1.0, INK);
  line(g, 7, -17, 13, -12, 2.6, MINERAL.azure);

  // 全覆式石青鸾鸟巨翼神面冠（向左右平展巨型鸾羽冠翼 [-21.5, +21.5, y=-24..-37]，顶部无高旗）
  poly(g, [[0, -26], [-14, -36], [-22, -31], [-19, -23], [-5, -23]]);
  fillStroke(g, MINERAL.azure, 1.2, INK);
  poly(g, [[0, -26], [14, -36], [22, -31], [19, -23], [5, -23]]);
  fillStroke(g, MINERAL.azure, 1.2, INK);
  poly(g, [[-6.5, -20], [-6.5, -31], [0, -35.5], [6.5, -31], [6.5, -20], [0, -18]]);
  fillStroke(g, MINERAL.azureLight, 1.2, INK);
  circ(g, -2.5, -25.5, 1.4);
  fillStroke(g, MINERAL.goldLight, 0.8, INK);
  circ(g, 2.5, -25.5, 1.4);
  fillStroke(g, MINERAL.goldLight, 0.8, INK);
  return { handX: 13, handY: -12 };
}

function drawNuoxiGoldNuoGod(g, f) {
  // 背插四杆冲天大靠旗（向高空炸开 y=-48.5，与石青鸾冠横向平翼形成强烈上下轮廓反差！）
  const flags = [
    [-3, -18, -13, -47, -21, -41, -11, -33],
    [-1.5, -19, -4.5, -49, -11, -45, -4, -35],
    [1.5, -19, 4.5, -49, 11, -45, 4, -35],
    [3, -18, 13, -47, 21, -41, 11, -33],
  ];
  for (let i = 0; i < flags.length; i++) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = flags[i];
    line(g, x0, y0, x1, y1, 1.6, INK);
    poly(g, [[x1, y1], [x2, y2], [x3, y3]]);
    fillStroke(g, i % 2 === 0 ? MINERAL.gold : VERM, 1.1, INK);
  }

  // 下半部：左侧悬空巨型赤金雷纹神鼓与飞扬红金大绶带（偏左突出 x=-22.5，右侧收束 x=+7.5！）
  poly(g, [[-4, -17], [-22, -5], [-19.5, 3.5], [-8, 1.8], [-3, -5]]);
  fillStroke(g, VERM, 1.2, INK);
  circ(g, -14.5, -11, 7.2);
  fillStroke(g, MINERAL.gold, 1.3, INK);
  circ(g, -14.5, -11, 4.0);
  fillStroke(g, PAPER, 1.0, VERM);

  drawLegs(g, f, INK, 2.5);
  poly(g, [[-5.5, -20], [5.8, -20], [7.8, -4.5], [-5.5, -4.5]]);
  fillStroke(g, MINERAL.goldDeep, 1.2, INK);
  poly(g, [[-4.5, -18.5], [4.5, -18.5], [5.8, -6.5], [-4.5, -6.5]]);
  fillStroke(g, MINERAL.goldLight, 1.0, INK);

  line(g, 5, -17, 11, -12.5, 2.6, MINERAL.gold);

  // 四目獠牙赤金方相氏巨型神面
  poly(g, [[-6.5, -19.5], [-7.5, -31.5], [0, -34.5], [7.5, -31.5], [6.5, -19.5]]);
  fillStroke(g, MINERAL.gold, 1.3, INK);
  poly(g, [[-5, -29.5], [5, -29.5], [4.5, -22], [-4.5, -22]]);
  fillStroke(g, VERM, 1.0, INK);
  for (const [ex, ey] of [[-2.6, -27.5], [2.6, -27.5], [-2.2, -24.5], [2.2, -24.5]]) {
    circ(g, ex, ey, 1.1);
    g.fillStyle = MINERAL.goldLight;
    g.fill();
  }
  return { handX: 11, handY: -12.5 };
}

const SKIN_DRAWERS = {
  zhou_default: (g, f, outfit) => drawZhouDefault(g, f, outfit),
  zhou_jade_watch: (g, f) => drawZhouJadeWatch(g, f),
  zhou_imperial_bell: (g, f) => drawZhouImperialBell(g, f),

  mian_default: (g, f, outfit) => drawMianDefault(g, f, outfit),
  mian_azure_bride: (g, f) => drawMianAzureBride(g, f),
  mian_gold_puppeteer: (g, f) => drawMianGoldPuppeteer(g, f),

  daotong_default: (g, f, outfit) => drawDaotongDefault(g, f, outfit),
  daotong_violet_thunder: (g, f) => drawDaotongVioletThunder(g, f),
  daotong_jade_immortal: (g, f) => drawDaotongJadeImmortal(g, f),

  yinyang_default: (g, f, outfit) => drawYinyangDefault(g, f, outfit),
  yinyang_frost_astrolabe: (g, f) => drawYinyangFrostAstrolabe(g, f),
  yinyang_gold_oracle: (g, f) => drawYinyangGoldOracle(g, f),

  tiejiang_default: (g, f, outfit) => drawTiejiangDefault(g, f, outfit),
  tiejiang_jade_taotie: (g, f) => drawTiejiangJadeTaotie(g, f),
  tiejiang_violet_asura: (g, f) => drawTiejiangVioletAsura(g, f),

  nuoxi_default: (g, f, outfit) => drawNuoxiDefault(g, f, outfit),
  nuoxi_azure_phoenix: (g, f) => drawNuoxiAzurePhoenix(g, f),
  nuoxi_gold_nuo_god: (g, f) => drawNuoxiGoldNuoGod(g, f),
};

export function heroSkinSprite(heroId, skinId = null, frame = 0, flash = false, legacyOutfit = null) {
  const normId = normalizeHeroSkinId(heroId, skinId);
  const fn = SKIN_DRAWERS[normId] || SKIN_DRAWERS.zhou_default;
  const isDef = normId.endsWith('_default');
  const key = `hskin_${normId}|${isDef ? (legacyOutfit || '') : ''}|${frame % 4}|${flash ? 1 : 0}`;
  return bakeSkin(key, SKIN_W, SKIN_H, SKIN_AX, SKIN_AY, (g) => fn(g, frame % 4, legacyOutfit), {
    flash,
    speckle: 0.003,
  });
}

/* ------------------------------------------------------------------ */
/* 专属手提灯笼（按皮肤切换矿物异形宝灯，原装保持 6 色木版灯）          */
/* ------------------------------------------------------------------ */

function drawSkinLantern(g, normSkinId, legacyStyle) {
  line(g, 0, 0, 0, 2.8, 0.9, INK);
  if (normSkinId.endsWith('_default')) {
    const bodyFill = legacyStyle === 'lantern_cinnabar' ? VERM : legacyStyle === 'lantern_plain' ? PAPER : LANTERN;
    if (legacyStyle === 'lantern_lotus') {
      for (const dx of [-3.2, 0, 3.2]) {
        ell(g, dx, 7.2, 2.4, 4.4, dx * 0.08);
        fillStroke(g, LANTERN, 0.9);
      }
    } else if (legacyStyle === 'lantern_carp') {
      poly(g, [[-4.2, 6.5], [1.5, 3.4], [4.6, 7], [1.5, 10.6]]);
      fillStroke(g, LANTERN, 1);
    } else {
      ell(g, 0, 7, 4.4, 4.6);
      fillStroke(g, bodyFill, 1.0);
    }
    g.fillStyle = INK;
    g.fillRect(-2.6, 2.2, 5.2, 1.4);
    g.fillRect(-2.6, 10.6, 5.2, 1.3);
    vfill(g, () => poly(g, [[-0.6, 11.9], [0.6, 11.9], [0.9, 15.4], [-0.9, 15.4]]));
    return;
  }

  // 矿物重彩异形宝灯
  if (normSkinId.includes('jade')) {
    // 六棱青铜幽火方鼎灯
    poly(g, [[-4.8, 3.2], [4.8, 3.2], [6.2, 7.5], [4.2, 12.2], [-4.2, 12.2], [-6.2, 7.5]]);
    fillStroke(g, MINERAL.jadeLight, 1.1, INK);
    circ(g, 0, 7.6, 2.5);
    fillStroke(g, MINERAL.jade, 0.8, MINERAL.jadeDeep);
    poly(g, [[-1.4, 12.2], [1.4, 12.2], [2.2, 17.5], [-2.2, 17.5]]);
    fillStroke(g, MINERAL.jade, 0.8, INK);
  } else if (normSkinId.includes('azure') || normSkinId.includes('frost')) {
    // 玄冰菱晶星芒灯
    poly(g, [[0, 2.2], [6.4, 7.8], [0, 13.8], [-6.4, 7.8]]);
    fillStroke(g, MINERAL.azureLight, 1.1, INK);
    poly(g, [[0, 4.6], [3.4, 7.8], [0, 11.0], [-3.4, 7.8]]);
    fillStroke(g, PAPER, 0.8, MINERAL.azureDeep);
    line(g, 0, 13.8, 0, 18, 1.4, MINERAL.azure);
  } else if (normSkinId.includes('violet')) {
    // 紫电八角雷笼灯
    poly(g, [[-3.5, 2.6], [3.5, 2.6], [5.8, 6.2], [5.8, 10.2], [3.5, 13.2], [-3.5, 13.2], [-5.8, 10.2], [-5.8, 6.2]]);
    fillStroke(g, MINERAL.violetLight, 1.1, INK);
    circ(g, 0, 8, 2.4);
    fillStroke(g, MINERAL.goldLight, 0.8, INK);
    line(g, 0, 13.2, 0, 17.8, 1.5, MINERAL.violet);
  } else {
    // 赤金日冕走马宫灯
    circ(g, 0, 8, 5.8);
    fillStroke(g, MINERAL.goldLight, 1.2, INK);
    poly(g, [[-6.8, 3.2], [6.8, 3.2], [4.5, 1.6], [-4.5, 1.6]]);
    fillStroke(g, VERM, 0.9, INK);
    poly(g, [[-1.6, 13.6], [1.6, 13.6], [2.6, 18.2], [-2.6, 18.2]]);
    fillStroke(g, VERM, 0.8, INK);
  }
}

export function skinLanternSprite(heroId, skinId = null, legacyLantern = null) {
  const normId = normalizeHeroSkinId(heroId, skinId);
  const key = `slantern_${normId}|${normId.endsWith('_default') ? (legacyLantern || '0') : '0'}`;
  return bakeSkin(key, 20, 22, 10, 2, (g) => drawSkinLantern(g, normId, legacyLantern), { speckle: 0.002 });
}

/* ------------------------------------------------------------------ */
/* 脚底专属矿物重彩灵阵（12 套非默认皮肤各具几何法环，默认返回 null）    */
/* ------------------------------------------------------------------ */

export function skinFootAuraSprite(heroId, skinId = null) {
  const normId = normalizeHeroSkinId(heroId, skinId);
  if (normId.endsWith('_default')) return null;

  return bakeSkin(`saura_${normId}`, 76, 42, 38, 21, (g) => {
    g.save();
    g.scale(1, 0.52);
    if (normId.includes('jade')) {
      // 石绿四方步罡回纹阵
      strokeCfg(g, 2.6, MINERAL.jade);
      g.strokeRect(-26, -26, 52, 52);
      circ(g, 0, 0, 22);
      strokeCfg(g, 2.0, MINERAL.jadeLight);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        circ(g, Math.cos(a) * 26, Math.sin(a) * 26, 3.6);
        fillStroke(g, MINERAL.jadeLight, 1.0, MINERAL.jadeDeep);
      }
    } else if (normId.includes('azure') || normId.includes('frost')) {
      // 石青六棱寒星冰轮阵
      poly(g, Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU;
        return [Math.cos(a) * 30, Math.sin(a) * 30];
      }));
      strokeCfg(g, 2.6, MINERAL.azure);
      g.stroke();
      poly(g, Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU + Math.PI / 6;
        return [Math.cos(a) * 22, Math.sin(a) * 22];
      }));
      strokeCfg(g, 2.0, MINERAL.azureLight);
      g.stroke();
    } else if (normId.includes('violet')) {
      // 紫电八芒雷篆阵
      poly(g, Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * TAU;
        const r = i % 2 === 0 ? 32 : 20;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }));
      strokeCfg(g, 2.5, MINERAL.violet);
      g.stroke();
      circ(g, 0, 0, 15);
      strokeCfg(g, 1.8, MINERAL.violetLight);
      g.stroke();
    } else {
      // 鎏金日冕八角神诏阵
      circ(g, 0, 0, 30);
      strokeCfg(g, 2.8, MINERAL.gold);
      g.stroke();
      poly(g, Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * TAU;
        return [Math.cos(a) * 24, Math.sin(a) * 24];
      }));
      strokeCfg(g, 2.0, VERM);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        circ(g, Math.cos(a) * 30, Math.sin(a) * 30, 2.8);
        g.fillStyle = MINERAL.goldLight;
        g.fill();
      }
    }
    g.restore();
  }, { speckle: false });
}

/**
 * 组合绘制角色皮肤 + 脚底专属灵阵 + 摆动手提宝灯（供局内 renderer、更房演武台、鬼市商铺与 style-lab 统一复用）
 */
export function drawHeroWithSkin(ctx, {
  heroId = 'zhou',
  skinId = null,
  x = 0,
  y = 0,
  frame = 0,
  flip = 1,
  lean = 0,
  swing = 0,
  scale = 1,
  flash = false,
  alpha = 1,
  auraRot = 0,
  showAura = true,
  legacyOutfit = null,
  legacyLantern = null,
} = {}) {
  if (alpha <= 0) return { lx: x + 7 * flip * scale, ly: y - 5 * scale };
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;

  if (showAura) {
    const aura = skinFootAuraSprite(heroId, skinId);
    if (aura) {
      ctx.save();
      ctx.translate(x, y + 1 * scale);
      if (auraRot) ctx.rotate(auraRot * 0.12);
      ctx.scale(scale, scale);
      ctx.globalAlpha *= 0.88;
      ctx.drawImage(aura.canvas, -aura.ax, -aura.ay, aura.w, aura.h);
      ctx.restore();
    }
  }

  const spr = heroSkinSprite(heroId, skinId, frame, flash, legacyOutfit);
  ctx.save();
  ctx.translate(x, y);
  if (lean) ctx.rotate(lean);
  ctx.scale(flip * scale, scale);
  ctx.drawImage(spr.canvas, -spr.ax, -spr.ay, spr.w, spr.h);
  ctx.restore();

  const hx = x + spr.handX * flip * scale;
  const hy = y + spr.handY * scale;
  const lan = skinLanternSprite(heroId, skinId, legacyLantern);
  ctx.save();
  ctx.translate(hx, hy);
  if (swing) ctx.rotate(swing);
  ctx.scale(scale, scale);
  ctx.drawImage(lan.canvas, -lan.ax, -lan.ay, lan.w, lan.h);
  ctx.restore();

  ctx.restore();
  return {
    lx: hx - Math.sin(swing) * 7 * scale,
    ly: hy + Math.cos(swing) * 7 * scale,
  };
}
