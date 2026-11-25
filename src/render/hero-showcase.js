// hero-showcase.js —— 更房演武台「精绘法相」：6 角色 × 3 套皮肤矢量重绘 + 16 种起手兵刃实战演武
// 设计要点：
//   1. 不再放大 52×58 局内小像素图，而是按舞台实际像素逐帧矢量绘制（衣袍层叠、冠冕、飘带物理、手提灯、描边轮廓光）；
//   2. 兵刃握在手中真实出招：蓄势 → 出手 → 飞行/扩散 → 命中纸祟（闪白、击退、墨溅），每 1.8 秒循环一次；
//   3. 切换角色/兵刃/皮肤/特效时由外部重置 attackT=0，立即打出一记招牌招式；
//   4. 默认皮肤只用木版 6 色（含透明度），矿物皮肤用 MINERAL 重彩；特效颜色取当前攻击特效主题 vfxPal。
import {
  INK, PAPER, PAPER_SHADE, VERM, VERM_DARK, LANTERN,
  inkA, paperA, vermA, lanternA,
} from './palette.js';
import { MINERAL as M } from './skins.js';
import { normalizeHeroSkinId } from '../meta/cosmetics.js';

const TAU = Math.PI * 2;
export const SHOWCASE_PERIOD = 1.8;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const prog = (p, a, b) => clamp01((p - a) / (b - a));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* 皮肤配色与背饰                                                       */
/* ------------------------------------------------------------------ */

const LOOKS = {
  zhou_default: { robe: VERM_DARK, inner: PAPER_SHADE, trim: LANTERN, sash: VERM, accent: LANTERN, accent2: PAPER, hat: PAPER_SHADE, lantern: VERM },
  zhou_jade_watch: { robe: M.jadeDeep, inner: PAPER, trim: M.goldLight, sash: M.jade, accent: M.jadeLight, accent2: PAPER, hat: M.jade, lantern: M.jadeLight, ornament: 'flag' },
  zhou_imperial_bell: { robe: M.goldDeep, inner: PAPER, trim: M.goldLight, sash: VERM, accent: M.gold, accent2: VERM, hat: M.gold, lantern: M.goldLight, ornament: 'sunbell' },
  mian_default: { robe: VERM, inner: PAPER, trim: LANTERN, sash: INK, accent: VERM_DARK, accent2: LANTERN, lantern: LANTERN },
  mian_azure_bride: { robe: M.azureDeep, inner: PAPER, trim: M.azureLight, sash: VERM, accent: M.azure, accent2: M.azureLight, lantern: M.azureLight, ornament: 'veil' },
  mian_gold_puppeteer: { robe: M.goldDeep, inner: PAPER_SHADE, trim: M.goldLight, sash: VERM, accent: M.gold, accent2: VERM, lantern: M.goldLight, ornament: 'puppet' },
  daotong_default: { robe: PAPER, inner: PAPER_SHADE, trim: VERM, sash: VERM_DARK, accent: LANTERN, accent2: VERM, lantern: LANTERN },
  daotong_violet_thunder: { robe: M.violetDeep, inner: PAPER, trim: M.violetLight, sash: M.goldLight, accent: M.violet, accent2: M.goldLight, lantern: M.violetLight, ornament: 'thunder' },
  daotong_jade_immortal: { robe: PAPER, inner: M.jadeLight, trim: M.jade, sash: M.jadeDeep, accent: M.jadeLight, accent2: M.gold, lantern: M.jadeLight, ornament: 'swords' },
  yinyang_default: { robe: INK, inner: PAPER_SHADE, trim: LANTERN, sash: VERM, accent: LANTERN, accent2: PAPER, lantern: PAPER, line: PAPER_SHADE },
  yinyang_frost_astrolabe: { robe: M.azureDeep, inner: PAPER, trim: M.azureLight, sash: PAPER, accent: M.azureLight, accent2: PAPER, lantern: M.azureLight, ornament: 'astrolabe' },
  yinyang_gold_oracle: { robe: M.goldDeep, inner: PAPER, trim: M.goldLight, sash: VERM, accent: M.gold, accent2: VERM, lantern: M.goldLight, ornament: 'sundisc' },
  tiejiang_default: { robe: INK, inner: PAPER_SHADE, trim: VERM, sash: VERM, accent: LANTERN, accent2: VERM_DARK, lantern: VERM, line: PAPER_SHADE, skin: PAPER_SHADE },
  tiejiang_jade_taotie: { robe: M.jadeDeep, inner: PAPER_SHADE, trim: M.goldLight, sash: M.jade, accent: M.jadeLight, accent2: M.gold, lantern: M.jadeLight, skin: PAPER_SHADE, ornament: 'taotie' },
  tiejiang_violet_asura: { robe: M.violetDeep, inner: PAPER_SHADE, trim: M.violetLight, sash: VERM, accent: M.violet, accent2: M.violetLight, lantern: M.violetLight, skin: PAPER_SHADE, ornament: 'asura' },
  nuoxi_default: { robe: VERM, inner: PAPER, trim: LANTERN, sash: INK, accent: LANTERN, accent2: VERM_DARK, lantern: LANTERN },
  nuoxi_azure_phoenix: { robe: M.azureDeep, inner: PAPER, trim: M.azureLight, sash: M.gold, accent: M.azure, accent2: M.goldLight, lantern: M.azureLight, ornament: 'phoenix' },
  nuoxi_gold_nuo_god: { robe: M.goldDeep, inner: PAPER, trim: M.goldLight, sash: VERM, accent: M.gold, accent2: VERM, lantern: M.goldLight, ornament: 'radiance' },
};

const BUILDS = {
  zhou: { sh: 14.5, hem: 21, headY: -75, headR: 10, armLen: 25 },
  mian: { sh: 12, hem: 22, headY: -74, headR: 10.2, armLen: 23 },
  daotong: { sh: 11.5, hem: 18.5, headY: -71, headR: 11, armLen: 21 },
  yinyang: { sh: 13, hem: 19.5, headY: -76, headR: 9.8, armLen: 25 },
  tiejiang: { sh: 18.5, hem: 20, headY: -76, headR: 10.2, armLen: 25 },
  nuoxi: { sh: 12.5, hem: 25, headY: -75, headR: 10, armLen: 24 },
};

/* ------------------------------------------------------------------ */
/* 基础笔法                                                             */
/* ------------------------------------------------------------------ */

function ink(g, lw, color = INK) {
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.lineCap = 'round';
}

function fillInk(g, fill, lw = 1.4, stroke = INK) {
  g.fillStyle = fill;
  g.fill();
  ink(g, lw, stroke);
  g.stroke();
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}

function ribbon(g, x0, y0, len, width, t, phase, color, dir = -1, lift = 0) {
  // 物理飘带：两侧贝塞尔包络，尾端随风摆动
  const sw = Math.sin(t * 3.1 + phase) * 6;
  const sw2 = Math.sin(t * 2.3 + phase + 1.2) * 4;
  const x1 = x0 + dir * len * 0.45 + sw2;
  const y1 = y0 + len * 0.42 - lift * 0.5;
  const x2 = x0 + dir * len + sw;
  const y2 = y0 + len * 0.9 - lift;
  g.beginPath();
  g.moveTo(x0 - width * 0.5, y0);
  g.quadraticCurveTo(x1 - width * 0.4, y1, x2, y2);
  g.quadraticCurveTo(x1 + width * 0.6, y1 + 1, x0 + width * 0.5, y0);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  ink(g, 0.9, inkA(0.75));
  g.stroke();
}

/* ------------------------------------------------------------------ */
/* 背饰（矿物皮肤专属轮廓）                                             */
/* ------------------------------------------------------------------ */

function drawOrnament(g, kind, L, B, t) {
  if (!kind) return;
  const hy = B.headY;
  g.save();
  if (kind === 'flag') {
    ink(g, 2.2, INK);
    g.beginPath();
    g.moveTo(-4, -30);
    g.lineTo(-26, -118);
    g.stroke();
    const wv = Math.sin(t * 4) * 4;
    g.beginPath();
    g.moveTo(-26, -118);
    g.quadraticCurveTo(-8, -114 + wv, 8, -104 + wv);
    g.quadraticCurveTo(-8, -98 - wv * 0.5, -22, -92);
    g.closePath();
    fillInk(g, L.sash, 1.3);
    g.beginPath();
    g.moveTo(-22, -112);
    g.quadraticCurveTo(-10, -109 + wv, 0, -104 + wv);
    g.quadraticCurveTo(-10, -101, -20, -97);
    g.closePath();
    g.fillStyle = L.accent;
    g.fill();
    circle(g, -26, -119, 2.4);
    fillInk(g, L.trim, 1);
  } else if (kind === 'sunbell' || kind === 'sundisc' || kind === 'radiance') {
    g.translate(0, hy + (kind === 'radiance' ? -2 : 4));
    const rot = t * (kind === 'radiance' ? 0.5 : 0.25);
    const n = kind === 'radiance' ? 14 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rot;
      const r0 = 22;
      const r1 = kind === 'radiance' ? (i % 2 ? 34 : 44) : 36;
      g.beginPath();
      g.moveTo(Math.cos(a - 0.09) * r0, Math.sin(a - 0.09) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.lineTo(Math.cos(a + 0.09) * r0, Math.sin(a + 0.09) * r0);
      g.closePath();
      g.fillStyle = i % 2 ? L.accent : L.trim;
      g.fill();
    }
    circle(g, 0, 0, 23);
    g.fillStyle = kind === 'sundisc' ? L.accent : L.trim;
    g.globalAlpha = 0.9;
    g.fill();
    g.globalAlpha = 1;
    ink(g, 1.6, INK);
    g.stroke();
    circle(g, 0, 0, 17);
    ink(g, 1.2, L.accent2);
    g.stroke();
    if (kind === 'sunbell') {
      for (const sx of [-26, 26]) {
        g.beginPath();
        g.moveTo(sx - 4, 22);
        g.quadraticCurveTo(sx, 12, sx + 4, 22);
        g.lineTo(sx + 5, 27);
        g.lineTo(sx - 5, 27);
        g.closePath();
        fillInk(g, L.trim, 1.1);
      }
    }
  } else if (kind === 'veil') {
    const wv = Math.sin(t * 2.2) * 5;
    g.globalAlpha = 0.72;
    g.beginPath();
    g.moveTo(-6, hy - 10);
    g.bezierCurveTo(-30, hy + 10 + wv, -36, hy + 46, -24 + wv, hy + 78);
    g.lineTo(-10 + wv * 0.6, hy + 74);
    g.bezierCurveTo(-18, hy + 44, -12, hy + 14, 4, hy - 6);
    g.closePath();
    g.fillStyle = L.accent2;
    g.fill();
    g.globalAlpha = 1;
    ink(g, 0.9, L.accent);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      circle(g, -22 + wv * 0.4 + i * 3, hy + 30 + i * 12, 1.4);
      g.fillStyle = PAPER;
      g.fill();
    }
  } else if (kind === 'puppet') {
    const bx = -24;
    const by = -112 + Math.sin(t * 2) * 2;
    ink(g, 2.2, L.trim);
    g.beginPath();
    g.moveTo(bx - 12, by);
    g.lineTo(bx + 12, by);
    g.moveTo(bx, by - 8);
    g.lineTo(bx, by + 8);
    g.stroke();
    const px = bx + Math.sin(t * 2.6) * 3;
    const py = by + 34;
    ink(g, 0.6, paperA(0.7));
    g.beginPath();
    g.moveTo(bx - 12, by);
    g.lineTo(px - 5, py);
    g.moveTo(bx + 12, by);
    g.lineTo(px + 5, py);
    g.moveTo(bx, by + 8);
    g.lineTo(px, py - 8);
    g.stroke();
    circle(g, px, py - 6, 3.4);
    fillInk(g, PAPER, 0.9);
    g.beginPath();
    g.moveTo(px - 5, py - 2);
    g.lineTo(px + 5, py - 2);
    g.lineTo(px + 6, py + 10);
    g.lineTo(px - 6, py + 10);
    g.closePath();
    fillInk(g, VERM, 0.9);
  } else if (kind === 'thunder') {
    g.translate(0, hy);
    g.rotate(t * 0.6);
    circle(g, 0, 0, 30);
    ink(g, 2, L.accent);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(30, 0);
      g.lineTo(37, -3);
      g.lineTo(34, 2);
      g.lineTo(43, 0);
      ink(g, 1.8, i % 2 ? L.accent2 : L.trim);
      g.stroke();
      g.restore();
    }
  } else if (kind === 'swords') {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.55 + Math.sin(t * 1.6 + i) * 0.05;
      g.save();
      g.translate(-4, hy + 6);
      g.rotate(a);
      g.translate(34 + Math.sin(t * 2 + i) * 2, 0);
      g.beginPath();
      g.moveTo(-12, -2);
      g.lineTo(12, -1.6);
      g.lineTo(17, 0);
      g.lineTo(12, 1.6);
      g.lineTo(-12, 2);
      g.closePath();
      fillInk(g, L.inner, 0.9, L.sash);
      ink(g, 2.2, L.trim);
      g.beginPath();
      g.moveTo(-12, -4);
      g.lineTo(-12, 4);
      g.stroke();
      g.restore();
    }
  } else if (kind === 'astrolabe') {
    g.translate(0, hy + 2);
    for (let i = 0; i < 2; i++) {
      g.save();
      g.rotate(t * (i ? -0.5 : 0.4) + i * 1.1);
      g.beginPath();
      g.ellipse(0, 0, 36, 13, 0, 0, TAU);
      ink(g, 1.8, i ? L.accent : L.trim);
      g.stroke();
      circle(g, 36, 0, 2.6);
      g.fillStyle = PAPER;
      g.fill();
      g.restore();
    }
  } else if (kind === 'taotie') {
    // 石绿饕餮兽首肩甲光环
    g.translate(-B.sh + 1, -58);
    circle(g, 0, 0, 9);
    fillInk(g, L.accent, 1.3);
    ink(g, 1.4, L.trim);
    g.beginPath();
    g.moveTo(-5, -2);
    g.quadraticCurveTo(0, -7, 5, -2);
    g.moveTo(-4, 3);
    g.lineTo(4, 3);
    g.stroke();
  } else if (kind === 'asura') {
    g.globalAlpha = 0.55;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.32;
      const fl = 30 + Math.sin(t * 5 + i * 1.7) * 7;
      g.beginPath();
      g.moveTo(Math.cos(a - 0.12) * 18, -50 + Math.sin(a - 0.12) * 18);
      g.quadraticCurveTo(Math.cos(a) * (fl + 10), -50 + Math.sin(a) * (fl + 10), Math.cos(a + 0.05) * (18 + fl), -50 + Math.sin(a + 0.05) * (18 + fl));
      g.quadraticCurveTo(Math.cos(a + 0.2) * 22, -50 + Math.sin(a + 0.2) * 22, Math.cos(a + 0.12) * 18, -50 + Math.sin(a + 0.12) * 18);
      g.fillStyle = i % 2 ? L.accent2 : L.accent;
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (kind === 'phoenix') {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + 0.35 + i * 0.32 + Math.sin(t * 1.8 + i) * 0.04;
      const len = 54 + (i % 2) * 8;
      g.save();
      g.translate(-2, -40);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, -2);
      g.quadraticCurveTo(len * 0.5, -7, len, 0);
      g.quadraticCurveTo(len * 0.5, 7, 0, 2);
      g.closePath();
      fillInk(g, i % 2 ? L.accent : L.trim, 0.9);
      circle(g, len * 0.82, 0, 3.2);
      fillInk(g, L.accent2, 0.8);
      g.restore();
    }
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* 身体部件                                                             */
/* ------------------------------------------------------------------ */

function robePath(g, B, sway, hemY = -7) {
  const s = B.sh;
  const h = B.hem;
  g.beginPath();
  g.moveTo(-s, -60);
  g.quadraticCurveTo(-s - 3, -40, -h + sway * 0.6, hemY - 2);
  g.quadraticCurveTo(-h * 0.4 + sway, hemY + 3, sway * 0.3, hemY + 1);
  g.quadraticCurveTo(h * 0.4 + sway, hemY + 3, h + sway * 0.6, hemY - 2);
  g.quadraticCurveTo(s + 3, -40, s, -60);
  g.quadraticCurveTo(0, -64, -s, -60);
  g.closePath();
}

function drawBody(g, heroId, L, B, t, lean) {
  const sway = Math.sin(t * 2.2) * 2.4 - lean * 10;
  const outline = L.line || INK;

  // 靴
  for (const bx of [-6, 6]) {
    g.beginPath();
    g.ellipse(bx + 1.5, -2.5, 5.5, 3, 0, 0, TAU);
    fillInk(g, INK, 1.2, outline);
  }

  // 轮廓光（灯笼暖光描边，暗场中托出人形）
  robePath(g, B, sway);
  ink(g, 5, lanternA(0.28));
  g.stroke();

  // 内衬下摆
  g.beginPath();
  g.moveTo(-B.hem * 0.78 + sway * 0.5, -14);
  g.lineTo(B.hem * 0.78 + sway * 0.5, -14);
  g.lineTo(B.hem * 0.86 + sway * 0.6, -6);
  g.quadraticCurveTo(sway * 0.3, -2, -B.hem * 0.86 + sway * 0.6, -6);
  g.closePath();
  fillInk(g, L.inner, 1.1, outline);

  // 主袍
  robePath(g, B, sway, heroId === 'mian' ? -16 : heroId === 'tiejiang' ? -12 : -9);
  fillInk(g, L.robe, 1.6, outline);

  // 衣褶（墨线与亮面）
  ink(g, 1, heroId === 'yinyang' || heroId === 'tiejiang' ? paperA(0.18) : inkA(0.35));
  g.beginPath();
  for (const k of [-0.55, -0.15, 0.3, 0.65]) {
    g.moveTo(k * B.sh * 0.7, -42);
    g.quadraticCurveTo(k * B.hem * 0.9 + sway * 0.4, -26, k * B.hem + sway * 0.6, -12);
  }
  g.stroke();
  ink(g, 2, lanternA(0.45));
  g.beginPath();
  g.moveTo(-B.sh + 1.5, -56);
  g.quadraticCurveTo(-B.sh - 1, -38, -B.hem + 3 + sway * 0.6, -12);
  g.stroke();

  // 下摆滚边
  ink(g, 2.2, L.trim);
  g.beginPath();
  const hemY = heroId === 'mian' ? -16 : heroId === 'tiejiang' ? -12 : -9;
  g.moveTo(-B.hem + 1 + sway * 0.6, hemY - 1);
  g.quadraticCurveTo(sway * 0.3, hemY + 3, B.hem - 1 + sway * 0.6, hemY - 1);
  g.stroke();

  // 角色专属衣饰
  if (heroId === 'mian') {
    // 剪纸百褶裙与镂空回纹
    g.beginPath();
    g.moveTo(-B.hem * 0.92 + sway * 0.5, -17);
    g.lineTo(B.hem * 0.92 + sway * 0.5, -17);
    g.lineTo(B.hem + 2 + sway * 0.7, -5);
    g.quadraticCurveTo(sway * 0.3, -1, -B.hem - 2 + sway * 0.7, -5);
    g.closePath();
    fillInk(g, L.inner, 1.2, outline);
    g.fillStyle = L.robe;
    for (let i = -3; i <= 3; i++) {
      const x = i * 5.2 + sway * 0.6;
      g.beginPath();
      g.moveTo(x - 2.2, -6);
      g.lineTo(x, -10);
      g.lineTo(x + 2.2, -6);
      g.closePath();
      g.fill();
    }
  } else if (heroId === 'tiejiang') {
    // 皮围裙 + 铆钉
    g.beginPath();
    g.moveTo(-9, -46);
    g.lineTo(9, -46);
    g.lineTo(11, -10);
    g.quadraticCurveTo(0, -7, -11, -10);
    g.closePath();
    fillInk(g, L.inner, 1.4, INK);
    ink(g, 1, inkA(0.4));
    g.beginPath();
    g.moveTo(-6, -38);
    g.lineTo(-7, -14);
    g.moveTo(6, -38);
    g.lineTo(7, -14);
    g.stroke();
    for (const [rx, ry] of [[-7, -42], [7, -42], [-8, -14], [8, -14]]) {
      circle(g, rx, ry, 1.3);
      g.fillStyle = L.accent;
      g.fill();
    }
  } else if (heroId === 'yinyang') {
    // 袍面星宿连线
    ink(g, 0.8, lanternA(0.7));
    const stars = [[-8, -36], [-3, -30], [3, -33], [7, -25], [2, -19], [-6, -16]];
    g.beginPath();
    stars.forEach(([x, y], i) => (i ? g.lineTo(x + sway * 0.3, y) : g.moveTo(x + sway * 0.3, y)));
    g.stroke();
    g.fillStyle = L.accent;
    for (const [x, y] of stars) {
      circle(g, x + sway * 0.3, y, 1.3);
      g.fill();
    }
  } else if (heroId === 'daotong') {
    // 胸前太极
    circle(g, 0, -40, 4.6);
    fillInk(g, PAPER, 1, INK);
    g.beginPath();
    g.arc(0, -40, 4.6, -Math.PI / 2, Math.PI / 2);
    g.arc(0, -37.7, 2.3, Math.PI / 2, -Math.PI / 2, true);
    g.arc(0, -42.3, 2.3, Math.PI / 2, -Math.PI / 2);
    g.fillStyle = INK;
    g.fill();
  } else if (heroId === 'nuoxi') {
    // 层叠舞裙第二层
    ink(g, 1.4, L.trim);
    g.beginPath();
    g.moveTo(-B.hem * 0.7 + sway * 0.5, -22);
    g.quadraticCurveTo(sway * 0.4, -17, B.hem * 0.7 + sway * 0.5, -22);
    g.stroke();
  }

  // 腰封与飘带
  g.beginPath();
  g.moveTo(-B.sh - 1.5, -47);
  g.lineTo(B.sh + 1.5, -47);
  g.lineTo(B.sh + 2, -41.5);
  g.lineTo(-B.sh - 2, -41.5);
  g.closePath();
  fillInk(g, L.sash, 1.2, outline);
  ribbon(g, -B.sh * 0.5, -42, 24, 3.4, t, 0.3, L.sash, -1);
  ribbon(g, -B.sh * 0.5 + 2, -42, 19, 3, t, 1.4, L.trim, -0.6);
  circle(g, -B.sh * 0.5, -44.2, 2.6);
  fillInk(g, L.trim, 1, outline);

  // 交领
  ink(g, 3, L.trim);
  g.beginPath();
  g.moveTo(-4.5, -62);
  g.lineTo(4, -48);
  g.moveTo(4.5, -62);
  g.lineTo(-0.5, -54);
  g.stroke();
  ink(g, 1, outline);
  g.beginPath();
  g.moveTo(-6, -62);
  g.lineTo(3, -47);
  g.stroke();
}

function drawSleeveArm(g, L, B, heroId, sx, sy, angle, front) {
  // 宽袖手臂：angle = 0 表示自然下垂
  const len = B.armLen;
  const bare = heroId === 'tiejiang';
  const water = heroId === 'nuoxi';
  g.save();
  g.translate(sx, sy);
  g.rotate(angle);
  if (bare) {
    g.beginPath();
    g.moveTo(-4.5, 0);
    g.quadraticCurveTo(-6, len * 0.5, -3.5, len);
    g.lineTo(3.5, len);
    g.quadraticCurveTo(6.5, len * 0.45, 4.5, 0);
    g.closePath();
    fillInk(g, L.skin || PAPER_SHADE, 1.4, INK);
    // 护腕
    g.beginPath();
    g.rect(-4, len - 6, 8, 4);
    fillInk(g, L.sash, 1, INK);
  } else {
    g.beginPath();
    g.moveTo(-4.5, 0);
    g.quadraticCurveTo(-7.5, len * 0.55, -8.5, len + (water ? 10 : 4));
    g.quadraticCurveTo(-2, len + (water ? 14 : 7), 6, len + 1);
    g.quadraticCurveTo(6, len * 0.5, 4.5, 0);
    g.closePath();
    fillInk(g, L.robe, 1.4, L.line || INK);
    ink(g, 2, L.trim);
    g.beginPath();
    g.moveTo(-8, len + (water ? 9 : 3.5));
    g.quadraticCurveTo(-2, len + (water ? 13 : 6.5), 5.6, len + 0.5);
    g.stroke();
    if (water) {
      g.beginPath();
      g.moveTo(-7, len + 9);
      g.quadraticCurveTo(-12, len + 22, -4, len + 30);
      g.quadraticCurveTo(0, len + 20, 4, len + 3);
      g.closePath();
      g.fillStyle = paperA(0.85);
      g.fill();
    }
    if (front) {
      ink(g, 1.6, lanternA(0.4));
      g.beginPath();
      g.moveTo(4, 2);
      g.quadraticCurveTo(5.5, len * 0.5, 5.4, len - 2);
      g.stroke();
    }
  }
  // 手
  circle(g, 0, len + 2, 3.2);
  fillInk(g, L.skin || PAPER, 1.1, INK);
  g.restore();
  return {
    hx: sx + Math.sin(-angle) * (len + 2),
    hy: sy + Math.cos(angle) * (len + 2),
  };
}

function drawHandLantern(g, L, hx, hy, t) {
  const sw = Math.sin(t * 2.4) * 0.22;
  g.save();
  g.translate(hx, hy);
  g.rotate(sw);
  ink(g, 1, INK);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, 6);
  g.stroke();
  // 灯晕
  g.globalAlpha = 0.35 + Math.sin(t * 5) * 0.05;
  circle(g, 0, 14, 15);
  g.fillStyle = lanternA(0.35);
  g.fill();
  g.globalAlpha = 1;
  g.beginPath();
  g.ellipse(0, 14, 7, 8.5, 0, 0, TAU);
  fillInk(g, L.lantern, 1.3, INK);
  g.beginPath();
  g.ellipse(0, 14, 3.6, 5.5, 0, 0, TAU);
  g.fillStyle = PAPER;
  g.globalAlpha = 0.75;
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = INK;
  g.fillRect(-4.5, 5, 9, 2.4);
  g.fillRect(-4.5, 21.6, 9, 2.4);
  ink(g, 1.6, VERM);
  g.beginPath();
  g.moveTo(0, 24);
  g.lineTo(Math.sin(t * 3) * 2, 31);
  g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* 头部与冠冕                                                           */
/* ------------------------------------------------------------------ */

function drawFaceFeatures(g, L, r, blink) {
  const eyeY = 1;
  // 眉
  ink(g, 1.4, INK);
  g.beginPath();
  g.moveTo(-2.5, eyeY - 4.2);
  g.quadraticCurveTo(-0.2, eyeY - 5.4, 1.6, eyeY - 4.4);
  g.moveTo(4.2, eyeY - 4.4);
  g.quadraticCurveTo(6.2, eyeY - 5.2, 7.6, eyeY - 4);
  g.stroke();
  // 眼
  if (blink) {
    ink(g, 1.3, INK);
    g.beginPath();
    g.moveTo(-1.8, eyeY);
    g.lineTo(1.4, eyeY);
    g.moveTo(4.4, eyeY);
    g.lineTo(7.2, eyeY);
    g.stroke();
  } else {
    for (const ex of [-0.2, 5.8]) {
      g.beginPath();
      g.ellipse(ex, eyeY, 1.6, 2.1, 0, 0, TAU);
      g.fillStyle = INK;
      g.fill();
      circle(g, ex + 0.6, eyeY - 0.8, 0.6);
      g.fillStyle = PAPER;
      g.fill();
    }
  }
  // 腮红与口
  g.fillStyle = vermA(0.32);
  circle(g, -2.4, eyeY + 4, 1.8);
  g.fill();
  circle(g, 7.6, eyeY + 3.6, 1.5);
  g.fill();
  ink(g, 1, VERM_DARK);
  g.beginPath();
  g.moveTo(2.2, eyeY + 5.6);
  g.quadraticCurveTo(3.4, eyeY + 6.4, 4.6, eyeY + 5.4);
  g.stroke();
}

function drawNuoMask(g, L, r) {
  g.beginPath();
  g.moveTo(-r * 0.9, -r * 0.5);
  g.quadraticCurveTo(-r * 1.05, r * 0.7, 0, r * 1.15);
  g.quadraticCurveTo(r * 1.05, r * 0.7, r * 0.9, -r * 0.5);
  g.quadraticCurveTo(0, -r * 1.2, -r * 0.9, -r * 0.5);
  g.closePath();
  fillInk(g, L.accent, 1.5, INK);
  // 怒眉
  g.beginPath();
  g.moveTo(-r * 0.75, -r * 0.35);
  g.lineTo(-r * 0.1, -r * 0.05);
  g.lineTo(-r * 0.7, -r * 0.05);
  g.closePath();
  g.moveTo(r * 0.75, -r * 0.35);
  g.lineTo(r * 0.1, -r * 0.05);
  g.lineTo(r * 0.7, -r * 0.05);
  g.closePath();
  g.fillStyle = VERM;
  g.fill();
  // 圆睁双目
  for (const ex of [-r * 0.42, r * 0.42]) {
    circle(g, ex, r * 0.12, r * 0.24);
    fillInk(g, PAPER, 1, INK);
    circle(g, ex + 0.6, r * 0.12, r * 0.11);
    g.fillStyle = INK;
    g.fill();
  }
  // 额心火纹
  g.beginPath();
  g.moveTo(0, -r * 0.75);
  g.quadraticCurveTo(r * 0.18, -r * 0.45, 0, -r * 0.2);
  g.quadraticCurveTo(-r * 0.18, -r * 0.45, 0, -r * 0.75);
  g.fillStyle = L.accent2 === VERM_DARK ? VERM : L.accent2;
  g.fill();
  // 獠牙口
  g.beginPath();
  g.moveTo(-r * 0.4, r * 0.62);
  g.quadraticCurveTo(0, r * 0.85, r * 0.4, r * 0.62);
  ink(g, 1.6, INK);
  g.stroke();
  g.fillStyle = PAPER;
  for (const fx of [-r * 0.25, r * 0.25]) {
    g.beginPath();
    g.moveTo(fx - 1.2, r * 0.68);
    g.lineTo(fx, r * 0.95);
    g.lineTo(fx + 1.2, r * 0.68);
    g.closePath();
    g.fill();
  }
}

function drawHead(g, heroId, L, B, t) {
  const r = B.headR;
  const blink = (t % 3.6) > 3.45;
  const hairCol = INK;
  g.save();
  g.translate(1, B.headY + Math.sin(t * 2.2 + 0.4) * 0.6);

  // 发后层 / 发髻（脸后）
  if (heroId === 'mian') {
    for (const bx of [-9.5, 9.5]) {
      ribbon(g, bx, -r * 0.6, 20, 2.6, t, bx, L.accent2 === LANTERN ? VERM : L.accent2, bx < 0 ? -1 : 0.4);
    }
  }
  if (heroId === 'nuoxi') {
    // 雉翎双羽
    for (let i = 0; i < 2; i++) {
      const wv = Math.sin(t * 1.9 + i) * 3;
      g.beginPath();
      g.moveTo(-2 + i * 4, -r * 0.9);
      g.bezierCurveTo(-10 + i * 6, -r * 3.2, -34 + wv, -r * 4.2, -48 + wv, -r * 2.6 + i * 6);
      ink(g, 3.2, L.trim);
      g.stroke();
      ink(g, 1, INK);
      g.stroke();
      ink(g, 0.8, L.accent2 === VERM_DARK ? VERM : L.accent2);
      g.beginPath();
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        const px = lerp(-2 + i * 4, -48 + wv, u);
        const py = -r * 0.9 - Math.sin(u * Math.PI) * r * 2.6 + u * (r * 0.9 - r * 2.6 + r * 0.9);
        g.moveTo(px, py);
        g.lineTo(px - 3, py + 4);
      }
      g.stroke();
    }
  }
  g.beginPath();
  g.ellipse(-1.5, -1, r * 1.04, r * 1.06, 0, 0, TAU);
  fillInk(g, hairCol, 1.2, heroId === 'yinyang' || heroId === 'tiejiang' ? PAPER_SHADE : INK);

  // 脸
  if (heroId === 'nuoxi') {
    drawNuoMask(g, L, r);
  } else {
    g.beginPath();
    g.ellipse(1.5, 0.8, r * 0.86, r * 0.92, 0, 0, TAU);
    fillInk(g, L.skin || PAPER, 1.3, INK);
    // 刘海
    g.beginPath();
    g.moveTo(-r * 0.75, -r * 0.2);
    g.quadraticCurveTo(-r * 0.4, -r * 1.05, r * 0.6, -r * 0.92);
    g.quadraticCurveTo(r * 0.95, -r * 0.6, r * 0.9, -r * 0.15);
    g.quadraticCurveTo(r * 0.45, -r * 0.62, r * 0.05, -r * 0.35);
    g.quadraticCurveTo(-r * 0.3, -r * 0.62, -r * 0.75, -r * 0.2);
    g.closePath();
    g.fillStyle = hairCol;
    g.fill();
    drawFaceFeatures(g, L, r, blink);
  }

  // 冠冕
  if (heroId === 'zhou') {
    // 银须
    g.beginPath();
    g.moveTo(-1, r * 0.75);
    g.quadraticCurveTo(2, r * 1.9, 4, r * 1.6);
    g.quadraticCurveTo(6.5, r * 1.6, 7, r * 0.7);
    g.closePath();
    fillInk(g, PAPER_SHADE, 1, INK);
    // 竹编斗笠
    g.beginPath();
    g.moveTo(-r * 2.6, -r * 0.35);
    g.quadraticCurveTo(-r * 1.0, -r * 1.2, 0, -r * 2.1);
    g.quadraticCurveTo(r * 1.0, -r * 1.2, r * 2.7, -r * 0.3);
    g.quadraticCurveTo(0, -r * 0.05, -r * 2.6, -r * 0.35);
    g.closePath();
    fillInk(g, L.hat, 1.6, INK);
    ink(g, 0.8, inkA(0.55));
    g.beginPath();
    for (const k of [-0.75, -0.42, -0.12, 0.18, 0.48, 0.78]) {
      g.moveTo(0, -r * 2.05);
      g.lineTo(k * r * 2.6, -r * 0.3 + Math.abs(k) * -r * 0.05);
    }
    g.stroke();
    ink(g, 1.4, lanternA(0.6));
    g.beginPath();
    g.moveTo(-r * 2.4, -r * 0.42);
    g.quadraticCurveTo(-r * 1.0, -r * 1.15, -r * 0.1, -r * 1.95);
    g.stroke();
    circle(g, 0, -r * 2.1, 1.6);
    g.fillStyle = L.trim;
    g.fill();
    ink(g, 1.3, VERM);
    g.beginPath();
    g.moveTo(-r * 0.8, -r * 0.3);
    g.quadraticCurveTo(-r * 0.6, r * 0.7, 1, r * 0.95);
    g.moveTo(r * 0.95, -r * 0.25);
    g.quadraticCurveTo(r * 0.9, r * 0.7, 2, r * 0.95);
    g.stroke();
  } else if (heroId === 'mian') {
    for (const bx of [-9.5, 9.5]) {
      circle(g, bx, -r * 0.75, 5.4);
      fillInk(g, hairCol, 1.2, INK);
      ink(g, 1.6, L.accent2 === LANTERN ? VERM : L.accent2);
      g.beginPath();
      g.arc(bx, -r * 0.75, 5.6, Math.PI * 0.7, Math.PI * 1.1);
      g.stroke();
      ink(g, 1.4, L.accent);
      g.beginPath();
      g.moveTo(bx - 6, -r * 0.75 - 4);
      g.lineTo(bx + 5, -r * 0.75 + 2);
      g.stroke();
      circle(g, bx + 5, -r * 0.75 + 2, 1.5);
      g.fillStyle = L.trim;
      g.fill();
    }
  } else if (heroId === 'daotong') {
    circle(g, 0, -r * 1.15, 5);
    fillInk(g, hairCol, 1.2, INK);
    // 莲花冠
    for (let i = -2; i <= 2; i++) {
      g.save();
      g.translate(0, -r * 1.1);
      g.rotate(i * 0.42);
      g.beginPath();
      g.moveTo(-2.4, 0);
      g.quadraticCurveTo(0, -9, 2.4, 0);
      g.closePath();
      fillInk(g, i % 2 ? L.accent : L.trim, 0.9, INK);
      g.restore();
    }
    ink(g, 1.6, L.accent);
    g.beginPath();
    g.moveTo(-9, -r * 1.2);
    g.lineTo(9, -r * 1.05);
    g.stroke();
    ribbon(g, -6, -r * 1.1, 22, 2.4, t, 2.2, L.trim, -1, 4);
  } else if (heroId === 'yinyang') {
    // 观星方冠 + 展翅
    const hc = L.robe === INK ? VERM_DARK : L.robe;
    g.beginPath();
    g.moveTo(-8, -r * 0.55);
    g.lineTo(-7, -r * 2.25);
    g.lineTo(7, -r * 2.25);
    g.lineTo(8, -r * 0.55);
    g.closePath();
    fillInk(g, hc, 1.4, INK);
    ink(g, 1.6, L.trim);
    g.beginPath();
    g.moveTo(-8, -r * 0.8);
    g.lineTo(8, -r * 0.8);
    g.stroke();
    const wv = Math.sin(t * 2) * 1.2;
    for (const side of [-1, 1]) {
      ink(g, 1.8, INK);
      g.beginPath();
      g.moveTo(side * 7, -r * 1.4);
      g.lineTo(side * 26, -r * 1.55 + wv * side);
      g.stroke();
      g.beginPath();
      g.ellipse(side * 27, -r * 1.55 + wv * side, 4, 2.4, 0, 0, TAU);
      fillInk(g, L.accent, 1, INK);
    }
    // 冠顶星
    g.fillStyle = L.accent;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 ? 1.6 : 3.6;
      g.lineTo(Math.cos(a) * rr, -r * 1.55 + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  } else if (heroId === 'tiejiang') {
    // 短发鬃 + 头巾
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = -r * 0.9 + i * r * 0.36;
      g.moveTo(x, -r * 0.7);
      g.lineTo(x + 1.5, -r * 1.25 - (i % 2) * 2);
      g.lineTo(x + 3.4, -r * 0.75);
    }
    g.fillStyle = hairCol;
    g.fill();
    g.beginPath();
    g.moveTo(-r * 0.95, -r * 0.55);
    g.quadraticCurveTo(0, -r * 0.95, r * 0.98, -r * 0.5);
    g.lineTo(r * 0.98, -r * 0.2);
    g.quadraticCurveTo(0, -r * 0.62, -r * 0.95, -r * 0.25);
    g.closePath();
    fillInk(g, L.sash, 1.2, INK);
    ribbon(g, -r * 0.95, -r * 0.4, 16, 2.4, t, 0.8, L.sash, -1, 6);
    ribbon(g, -r * 0.95, -r * 0.35, 12, 2.2, t, 2.4, L.sash, -1, 2);
    // 胡茬
    g.fillStyle = inkA(0.35);
    for (let i = 0; i < 7; i++) {
      circle(g, -1 + i * 1.3, r * 0.62 + (i % 2) * 0.8, 0.45);
      g.fill();
    }
  } else if (heroId === 'nuoxi') {
    ink(g, 2, L.trim);
    g.beginPath();
    g.arc(0, 0, r * 1.02, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* 兵刃（握持形态）                                                     */
/* ------------------------------------------------------------------ */

const WEAPON_STYLE = {
  gong: 'wave', nuo_drum: 'wave', bell: 'wave',
  lantern: 'shoot', talisman: 'shoot', coinsword: 'blade', paperman: 'shoot', firecracker: 'throw',
  brush: 'blade', taomujian: 'blade', soulbanner: 'blade', suohun_chain: 'whip',
  compass: 'beam', bronze_mirror: 'beam', paperhorse: 'shoot', zhinian_kite: 'shoot',
};

const HIT_P = {
  gong: 0.56, nuo_drum: 0.56, bell: 0.54,
  brush: 0.5, taomujian: 0.56, coinsword: 0.56, soulbanner: 0.58,
  compass: 0.38, bronze_mirror: 0.36, suohun_chain: 0.46, firecracker: 0.62,
};

export function getShowcaseHitPhase(weaponId) {
  return HIT_P[weaponId] ?? 0.58;
}

function drawHeldWeapon(g, weaponId, vp, t, armAngle) {
  // 原点为握点；+y 沿手臂方向（向外）
  g.save();
  switch (weaponId) {
    case 'brush': {
      g.rotate(-0.5);
      g.beginPath();
      g.rect(-1.8, -4, 3.6, 34);
      fillInk(g, VERM_DARK, 1, INK);
      g.beginPath();
      g.moveTo(-3.2, 30);
      g.quadraticCurveTo(-4, 40, 0, 47);
      g.quadraticCurveTo(4, 40, 3.2, 30);
      g.closePath();
      fillInk(g, INK, 1, INK);
      g.fillStyle = PAPER_SHADE;
      g.fillRect(-2.6, 28.5, 5.2, 2.4);
      break;
    }
    case 'taomujian':
    case 'coinsword': {
      g.rotate(-0.5);
      g.beginPath();
      g.rect(-1.6, -6, 3.2, 8);
      fillInk(g, VERM_DARK, 1, INK);
      g.beginPath();
      g.rect(-6, 1.5, 12, 2.6);
      fillInk(g, LANTERN, 1, INK);
      if (weaponId === 'taomujian') {
        g.beginPath();
        g.moveTo(-2.6, 4);
        g.lineTo(-2.4, 40);
        g.lineTo(0, 46);
        g.lineTo(2.4, 40);
        g.lineTo(2.6, 4);
        g.closePath();
        fillInk(g, '#B4643A', 1.1, INK);
        ink(g, 1, VERM);
        g.beginPath();
        g.moveTo(0, 10);
        g.lineTo(0, 36);
        g.stroke();
      } else {
        for (let i = 0; i < 7; i++) {
          circle(g, 0, 8 + i * 5.4, 3);
          fillInk(g, LANTERN, 0.9, INK);
          g.fillStyle = INK;
          g.fillRect(-0.9, 7.1 + i * 5.4, 1.8, 1.8);
        }
        ink(g, 1.2, VERM);
        g.beginPath();
        g.moveTo(0, 4);
        g.lineTo(0, 46);
        g.stroke();
      }
      break;
    }
    case 'soulbanner': {
      g.rotate(-0.3);
      ink(g, 2.4, INK);
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(0, 50);
      g.stroke();
      const wv = Math.sin(t * 5) * 3;
      g.beginPath();
      g.moveTo(0, 50);
      g.lineTo(0, 26);
      g.quadraticCurveTo(-10 + wv, 30, -16 + wv, 26);
      g.lineTo(-14 + wv, 50);
      g.closePath();
      fillInk(g, PAPER, 1.1, INK);
      ink(g, 1.2, vp.primary);
      g.beginPath();
      g.moveTo(-5, 31);
      g.lineTo(-9 + wv * 0.5, 45);
      g.stroke();
      break;
    }
    case 'suohun_chain': {
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(Math.sin(t * 4 + i) * 1.5, 4 + i * 4.2, 1.8, 2.6, 0, 0, TAU);
        ink(g, 1.4, PAPER_SHADE);
        g.stroke();
      }
      break;
    }
    default:
      break;
  }
  g.restore();

  // 世界朝向的持物（不随手臂旋转）
  g.save();
  g.rotate(-armAngle);
  switch (weaponId) {
    case 'gong':
    case 'nuo_drum': {
      const drum = weaponId === 'nuo_drum';
      ink(g, 1, INK);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(6, 4);
      g.stroke();
      if (drum) {
        g.beginPath();
        g.ellipse(13, 9, 9, 10, 0, 0, TAU);
        fillInk(g, VERM, 1.4, INK);
        g.beginPath();
        g.ellipse(14.5, 9, 6.5, 8, 0, 0, TAU);
        fillInk(g, PAPER_SHADE, 1, INK);
        g.fillStyle = INK;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          circle(g, 14.5 + Math.cos(a) * 5, 9 + Math.sin(a) * 6.2, 0.7);
          g.fill();
        }
      } else {
        circle(g, 13, 9, 10);
        fillInk(g, LANTERN, 1.5, INK);
        circle(g, 13, 9, 6.6);
        ink(g, 1.1, VERM_DARK);
        g.stroke();
        circle(g, 13, 9, 2.6);
        g.fillStyle = VERM_DARK;
        g.fill();
        ink(g, 1.2, paperA(0.7));
        g.beginPath();
        g.arc(13, 9, 8, -2.4, -1.4);
        g.stroke();
      }
      break;
    }
    case 'bell': {
      ink(g, 2, VERM_DARK);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -6);
      g.stroke();
      g.beginPath();
      g.moveTo(-6, 9);
      g.quadraticCurveTo(-6, -2, 0, -2);
      g.quadraticCurveTo(6, -2, 6, 9);
      g.lineTo(7.5, 11);
      g.lineTo(-7.5, 11);
      g.closePath();
      fillInk(g, LANTERN, 1.3, INK);
      circle(g, 0, 12.5, 1.8);
      g.fillStyle = VERM;
      g.fill();
      break;
    }
    case 'lantern': {
      ink(g, 2, VERM_DARK);
      g.beginPath();
      g.moveTo(-4, 4);
      g.lineTo(14, -20);
      g.stroke();
      ink(g, 0.8, INK);
      g.beginPath();
      g.moveTo(14, -20);
      g.lineTo(14, -14);
      g.stroke();
      g.globalAlpha = 0.4;
      circle(g, 14, -7, 12);
      g.fillStyle = lanternA(0.5);
      g.fill();
      g.globalAlpha = 1;
      g.beginPath();
      g.ellipse(14, -7, 5.5, 7, 0, 0, TAU);
      fillInk(g, VERM, 1.2, INK);
      g.beginPath();
      g.ellipse(14, -7, 2.6, 4.4, 0, 0, TAU);
      g.fillStyle = LANTERN;
      g.fill();
      break;
    }
    case 'talisman': {
      for (let i = 0; i < 3; i++) {
        g.save();
        g.translate(2, -2);
        g.rotate(-0.5 + i * 0.32);
        g.beginPath();
        g.rect(-2.6, -18, 5.2, 16);
        fillInk(g, LANTERN, 0.9, INK);
        ink(g, 0.9, VERM);
        g.beginPath();
        g.moveTo(0, -16);
        g.lineTo(0, -5);
        g.moveTo(-1.5, -12);
        g.lineTo(1.5, -10);
        g.stroke();
        g.restore();
      }
      break;
    }
    case 'paperman':
    case 'paperhorse': {
      g.translate(6, -10);
      if (weaponId === 'paperhorse') drawPaperHorse(g, 0.55, PAPER);
      else drawPaperMan(g, 0.9, PAPER);
      break;
    }
    case 'firecracker': {
      ink(g, 0.8, INK);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, 4);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        g.save();
        g.translate((i % 2 ? 3 : -3), 6 + i * 4.2);
        g.rotate(i % 2 ? 0.5 : -0.5);
        g.beginPath();
        g.rect(-1.8, -3.5, 3.6, 7);
        fillInk(g, VERM, 0.8, INK);
        g.restore();
      }
      break;
    }
    case 'compass': {
      g.translate(9, -3);
      g.rotate(t * 0.8);
      circle(g, 0, 0, 9);
      fillInk(g, LANTERN, 1.4, INK);
      circle(g, 0, 0, 5.6);
      ink(g, 0.9, VERM_DARK);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * 6.4, Math.sin(a) * 6.4);
        g.lineTo(Math.cos(a) * 8.4, Math.sin(a) * 8.4);
        g.stroke();
      }
      ink(g, 1.4, VERM);
      g.beginPath();
      g.moveTo(-4, 0);
      g.lineTo(4, 0);
      g.stroke();
      break;
    }
    case 'bronze_mirror': {
      ink(g, 2.4, VERM_DARK);
      g.beginPath();
      g.moveTo(0, 2);
      g.lineTo(5, -6);
      g.stroke();
      circle(g, 9, -13, 9);
      fillInk(g, LANTERN, 1.6, INK);
      circle(g, 9, -13, 6.4);
      g.fillStyle = PAPER;
      g.globalAlpha = 0.8 + Math.sin(t * 6) * 0.15;
      g.fill();
      g.globalAlpha = 1;
      ink(g, 1.2, lanternA(0.9));
      g.beginPath();
      g.arc(9, -13, 4, -2.6, -1.4);
      g.stroke();
      break;
    }
    case 'zhinian_kite': {
      ink(g, 0.6, paperA(0.7));
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(10, -16, 18, -30);
      g.stroke();
      g.save();
      g.translate(18, -34);
      g.rotate(Math.sin(t * 3) * 0.2);
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(6, 0);
      g.lineTo(0, 9);
      g.lineTo(-6, 0);
      g.closePath();
      fillInk(g, VERM, 1, INK);
      g.restore();
      break;
    }
    default:
      break;
  }
  g.restore();
}

function drawPaperMan(g, s, fill) {
  g.save();
  g.scale(s, s);
  circle(g, 0, -9, 3.6);
  fillInk(g, fill, 1, INK);
  g.beginPath();
  g.moveTo(-6, -5);
  g.lineTo(6, -5);
  g.lineTo(4, 3);
  g.lineTo(5, 10);
  g.lineTo(1.4, 10);
  g.lineTo(0, 4);
  g.lineTo(-1.4, 10);
  g.lineTo(-5, 10);
  g.lineTo(-4, 3);
  g.closePath();
  fillInk(g, fill, 1, INK);
  g.fillStyle = VERM;
  circle(g, -1.3, -8.4, 0.9);
  g.fill();
  circle(g, 1.6, -8.4, 0.9);
  g.fill();
  g.restore();
}

function drawPaperHorse(g, s, fill) {
  g.save();
  g.scale(s, s);
  g.beginPath();
  g.moveTo(-14, -6);
  g.lineTo(8, -6);
  g.lineTo(14, -16);
  g.lineTo(20, -14);
  g.lineTo(16, -4);
  g.lineTo(12, 2);
  g.lineTo(12, 12);
  g.lineTo(8, 12);
  g.lineTo(7, 3);
  g.lineTo(-8, 3);
  g.lineTo(-9, 12);
  g.lineTo(-13, 12);
  g.lineTo(-13, 2);
  g.lineTo(-18, -2);
  g.closePath();
  fillInk(g, fill, 1.4, INK);
  ink(g, 2, VERM);
  g.beginPath();
  g.moveTo(-10, -2);
  g.lineTo(6, -2);
  g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* 演武靶：纸祟                                                         */
/* ------------------------------------------------------------------ */

export function drawPaperGhostTarget(g, x, y, s, t, hitAge, vp) {
  const hit = hitAge >= 0 && hitAge < 0.32;
  const k = hit ? hitAge / 0.32 : 1;
  const recoil = hit ? Math.sin(k * Math.PI) * 10 : 0;
  const shake = hit ? Math.sin(hitAge * 120) * 2.2 * (1 - k) : 0;
  const bob = Math.sin(t * 2.6) * 3;
  g.save();
  g.translate(x + recoil * s + shake * s, y + bob * s);
  g.scale(s, s);
  g.rotate(hit ? Math.sin(k * Math.PI) * 0.22 : Math.sin(t * 1.3) * 0.05);

  // 地影
  g.globalAlpha = 0.35;
  g.beginPath();
  g.ellipse(0, 30 - bob, 14, 3.5, 0, 0, TAU);
  g.fillStyle = INK;
  g.fill();
  g.globalAlpha = 1;

  // 身躯（纸扎小祟）
  g.beginPath();
  g.moveTo(0, -26);
  g.bezierCurveTo(14, -26, 17, -6, 15, 10);
  for (let i = 0; i < 4; i++) {
    const x0 = 15 - i * 7.5;
    g.quadraticCurveTo(x0 - 3.75, 18 + Math.sin(t * 6 + i) * 2.5, x0 - 7.5, 10);
  }
  g.bezierCurveTo(-17, -6, -14, -26, 0, -26);
  g.closePath();
  g.fillStyle = hit && k < 0.35 ? PAPER : paperA(0.92);
  g.fill();
  ink(g, 1.6, INK);
  g.stroke();
  // 额符
  g.beginPath();
  g.rect(-3.5, -24, 7, 12);
  g.fillStyle = LANTERN;
  g.fill();
  ink(g, 0.8, VERM);
  g.beginPath();
  g.moveTo(0, -22);
  g.lineTo(0, -14);
  g.moveTo(-2, -19);
  g.lineTo(2, -17);
  g.stroke();
  // 眼口
  g.fillStyle = INK;
  if (hit && k < 0.6) {
    ink(g, 1.6, INK);
    g.beginPath();
    g.moveTo(-8, -7);
    g.lineTo(-3, -3);
    g.moveTo(-8, -3);
    g.lineTo(-3, -7);
    g.moveTo(3, -7);
    g.lineTo(8, -3);
    g.moveTo(3, -3);
    g.lineTo(8, -7);
    g.stroke();
  } else {
    g.beginPath();
    g.ellipse(-5.5, -5, 2.4, 3.2, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(5.5, -5, 2.4, 3.2, 0, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.ellipse(0, 3, 3, hit ? 3.4 : 1.8, 0, 0, TAU);
  g.fill();
  g.fillStyle = vermA(0.5);
  circle(g, -9, 1, 2.2);
  g.fill();
  circle(g, 9, 1, 2.2);
  g.fill();

  // 命中闪白
  if (hit && k < 0.25) {
    g.globalAlpha = 1 - k / 0.25;
    g.fillStyle = vp.core;
    g.beginPath();
    g.ellipse(0, -4, 20, 26, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }
  g.restore();

  // 墨溅与破字冲击星
  if (hit) {
    const e = easeOut(k);
    g.save();
    g.translate(x, y - 4 * s);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + i * 0.37;
      const d = (10 + e * 30 + (i % 3) * 6) * s;
      g.globalAlpha = 1 - k;
      g.fillStyle = i % 3 === 0 ? vp.bright : i % 3 === 1 ? vp.primary : INK;
      circle(g, Math.cos(a) * d, Math.sin(a) * d * 0.8, (2.6 - k * 1.6) * s);
      g.fill();
    }
    g.globalAlpha = (1 - k) * 0.9;
    ink(g, 3 * s * (1 - k * 0.6), vp.bright);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const r0 = (6 + e * 10) * s;
      const r1 = (14 + e * 26) * s;
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  }
}

/* ------------------------------------------------------------------ */
/* 招式特效（世界坐标）                                                 */
/* ------------------------------------------------------------------ */

function trailDots(g, pts, color, size) {
  pts.forEach(([px, py], i) => {
    g.globalAlpha = (i + 1) / pts.length * 0.7;
    g.fillStyle = color;
    circle(g, px, py, size * (i + 1) / pts.length);
    g.fill();
  });
  g.globalAlpha = 1;
}

function bezierPt(x0, y0, cx, cy, x1, y1, u) {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1];
}

function drawAttackFx(g, weaponId, A) {
  const { p, hx, hy, tx, ty, s, vp, t } = A;
  const hitP = getShowcaseHitPhase(weaponId);
  const rel = 0.26;
  const travel = prog(p, rel, hitP);
  const active = p >= rel && p < hitP;

  switch (weaponId) {
    case 'gong':
    case 'nuo_drum':
    case 'bell': {
      const n = weaponId === 'bell' ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const st = rel + i * 0.06;
        const u = prog(p, st, st + (hitP - rel));
        if (u <= 0 || u >= 1) continue;
        const ox = hx + 10 * s;
        const oy = hy + 6 * s;
        const maxR = Math.hypot(tx - ox, ty - oy);
        const r = maxR * easeOut(u);
        g.globalAlpha = (1 - u) * 0.95;
        if (weaponId === 'bell') {
          ink(g, (3.4 - u * 2) * s, i % 2 ? vp.primary : vp.bright);
          g.beginPath();
          g.arc(ox, oy, r, -0.55, 0.55);
          g.stroke();
          ink(g, 1.2 * s, vp.core);
          g.beginPath();
          g.arc(ox, oy, r - 3 * s, -0.4, 0.4);
          g.stroke();
        } else {
          ink(g, (weaponId === 'nuo_drum' ? 5 : 3.6) * s * (1 - u * 0.6), i % 2 ? vp.primary : vp.bright);
          g.beginPath();
          g.ellipse(ox, oy, r, r * 0.62, 0, 0, TAU);
          g.stroke();
          if (weaponId === 'nuo_drum') {
            ink(g, 1.4 * s, vp.core);
            g.beginPath();
            g.ellipse(ox, oy, r * 0.88, r * 0.55, 0, 0, TAU);
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
      if (p >= rel && p < rel + 0.08) {
        const f = prog(p, rel, rel + 0.08);
        g.globalAlpha = 1 - f;
        g.fillStyle = vp.core;
        circle(g, hx + 13 * s, hy + 9 * s, (10 + f * 14) * s);
        g.fill();
        g.globalAlpha = 1;
      }
      break;
    }
    case 'lantern':
    case 'zhinian_kite': {
      if (!active) break;
      const kite = weaponId === 'zhinian_kite';
      const cx = (hx + tx) / 2;
      const cy = Math.min(hy, ty) - (kite ? 70 : 40) * s;
      const u = easeInOut(travel);
      const pts = [];
      for (let k = 6; k >= 0; k--) pts.push(bezierPt(hx, hy - 10 * s, cx, cy, tx, ty, Math.max(0, u - k * 0.035)));
      trailDots(g, pts, vp.primary, 5 * s);
      const [px, py] = pts[pts.length - 1];
      if (kite) {
        const [qx, qy] = bezierPt(hx, hy, cx, cy, tx, ty, Math.max(0, u - 0.02));
        const ang = Math.atan2(py - qy, px - qx);
        g.save();
        g.translate(px, py);
        g.rotate(ang);
        g.scale(s, s);
        // 纸鸢火鸦
        g.beginPath();
        g.moveTo(12, 0);
        g.lineTo(-4, -10 - Math.sin(t * 20) * 3);
        g.lineTo(-2, 0);
        g.lineTo(-4, 10 + Math.sin(t * 20) * 3);
        g.closePath();
        fillInk(g, VERM, 1.2, INK);
        circle(g, 6, 0, 3);
        g.fillStyle = vp.bright;
        g.fill();
        g.restore();
      } else {
        g.fillStyle = vp.glowRgba(0.35);
        circle(g, px, py, 13 * s);
        g.fill();
        g.fillStyle = vp.bright;
        circle(g, px, py, 7 * s);
        g.fill();
        g.fillStyle = vp.core;
        circle(g, px, py, 3.4 * s);
        g.fill();
      }
      break;
    }
    case 'talisman':
    case 'paperman':
    case 'coinsword':
    case 'paperhorse': {
      if (weaponId === 'coinsword' && p > 0.2 && p < 0.36) {
        const f = prog(p, 0.2, 0.36);
        g.globalAlpha = 1 - f;
        ink(g, 5 * s, vp.bright);
        g.beginPath();
        g.arc(hx - 8 * s, hy - 10 * s, 34 * s, -1.9 + f * 1.2, 0.2 + f * 1.2);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (weaponId === 'paperhorse') {
        if (!active) break;
        const u = easeInOut(travel);
        const px = lerp(hx, tx - 6 * s, u);
        const py = lerp(ty + 18 * s, ty + 12 * s, u) - Math.abs(Math.sin(u * Math.PI * 4)) * 6 * s;
        for (let k = 1; k <= 5; k++) {
          g.globalAlpha = 0.5 - k * 0.08;
          g.fillStyle = vp.primary;
          circle(g, px - k * 9 * s, ty + 26 * s, (4 - k * 0.5) * s);
          g.fill();
        }
        g.globalAlpha = 1;
        g.save();
        g.translate(px, py);
        drawPaperHorse(g, 1.1 * s, PAPER);
        g.restore();
        break;
      }
      const n = weaponId === 'coinsword' ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const d = i * 0.035;
        const u = easeInOut(prog(p, rel + d, hitP + d * 0.4));
        if (u <= 0 || u >= 1) continue;
        const spread = (i - (n - 1) / 2) * (weaponId === 'coinsword' ? 22 : 36) * s;
        const cx = (hx + tx) / 2;
        const cy = (hy + ty) / 2 + spread - (weaponId === 'paperman' ? Math.sin(t * 12 + i) * 8 * s : 0);
        const pts = [];
        for (let k = 4; k >= 0; k--) pts.push(bezierPt(hx, hy, cx, cy, tx, ty, Math.max(0, u - k * 0.04)));
        trailDots(g, pts, vp.primary, 3.4 * s);
        const [px, py] = pts[pts.length - 1];
        g.save();
        g.translate(px, py);
        if (weaponId === 'talisman') {
          g.rotate(u * TAU * 1.5);
          g.scale(s, s);
          g.beginPath();
          g.rect(-3, -8, 6, 16);
          fillInk(g, LANTERN, 0.9, INK);
          ink(g, 1, vp.primary);
          g.beginPath();
          g.moveTo(0, -6);
          g.lineTo(0, 6);
          g.stroke();
        } else if (weaponId === 'coinsword') {
          g.rotate(u * TAU * 2);
          g.scale(s, s);
          circle(g, 0, 0, 4.6);
          fillInk(g, vp.bright, 1, INK);
          g.fillStyle = INK;
          g.fillRect(-1.3, -1.3, 2.6, 2.6);
        } else {
          drawPaperMan(g, 0.95 * s, PAPER);
        }
        g.restore();
      }
      break;
    }
    case 'firecracker': {
      if (active) {
        const u = travel;
        const px = lerp(hx, tx, u);
        const py = lerp(hy, ty, u) - Math.sin(u * Math.PI) * 60 * s;
        g.save();
        g.translate(px, py);
        g.rotate(u * TAU * 2);
        g.beginPath();
        g.rect(-3 * s, -6 * s, 6 * s, 12 * s);
        fillInk(g, VERM, 1, INK);
        g.restore();
        g.fillStyle = vp.bright;
        circle(g, px + Math.sin(t * 40) * 2 * s, py - 7 * s, 2.2 * s);
        g.fill();
      }
      const e = prog(p, hitP, hitP + 0.24);
      if (e > 0 && e < 1) {
        for (let b = 0; b < 4; b++) {
          const be = prog(e, b * 0.16, b * 0.16 + 0.5);
          if (be <= 0 || be >= 1) continue;
          const bx = tx + [-12, 14, -4, 10][b] * s;
          const by = ty + [-14, -6, 10, 14][b] * s;
          g.globalAlpha = 1 - be;
          ink(g, 2.4 * s, b % 2 ? vp.primary : vp.bright);
          g.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + b;
            g.moveTo(bx + Math.cos(a) * 4 * s, by + Math.sin(a) * 4 * s);
            g.lineTo(bx + Math.cos(a) * (6 + be * 16) * s, by + Math.sin(a) * (6 + be * 16) * s);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      break;
    }
    case 'brush':
    case 'taomujian':
    case 'soulbanner': {
      // 近身斩击弧
      if (p > 0.18 && p < 0.38) {
        const f = prog(p, 0.18, 0.38);
        g.globalAlpha = 1 - f * 0.8;
        g.fillStyle = weaponId === 'brush' ? INK : vp.bright;
        g.beginPath();
        const a0 = -2.2 + f * 0.4;
        const a1 = 0.5 + f * 0.6;
        g.arc(hx - 4 * s, hy - 14 * s, 44 * s, a0, a1);
        g.arc(hx + 2 * s, hy - 12 * s, 32 * s, a1, a0, true);
        g.closePath();
        g.fill();
        if (weaponId === 'brush') {
          ink(g, 1.6 * s, vp.primary);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      if (active) {
        const u = easeOut(travel);
        const px = lerp(hx + 20 * s, tx, u);
        const py = lerp(hy - 8 * s, ty, u);
        g.save();
        g.translate(px, py);
        if (weaponId === 'taomujian') {
          g.rotate(Math.atan2(ty - hy, tx - hx));
          g.scale(s, s);
          for (let k = 1; k <= 4; k++) {
            g.globalAlpha = 0.5 - k * 0.1;
            g.fillStyle = vp.primary;
            g.fillRect(-12 - k * 9, -1.6, 10, 3.2);
          }
          g.globalAlpha = 1;
          g.beginPath();
          g.moveTo(-14, -2.4);
          g.lineTo(10, -2);
          g.lineTo(16, 0);
          g.lineTo(10, 2);
          g.lineTo(-14, 2.4);
          g.closePath();
          fillInk(g, '#B4643A', 1, INK);
          ink(g, 1.4, vp.bright);
          g.stroke();
        } else if (weaponId === 'soulbanner') {
          g.scale(s, s);
          for (let i = 0; i < 4; i++) {
            const ox = -i * 9;
            const oy = Math.sin(t * 10 + i) * 8;
            g.globalAlpha = 0.85 - i * 0.15;
            g.beginPath();
            g.moveTo(ox + 6, oy);
            g.quadraticCurveTo(ox, oy - 7, ox - 6, oy);
            g.quadraticCurveTo(ox - 14, oy + 3, ox - 18, oy - 2);
            g.quadraticCurveTo(ox - 10, oy + 8, ox + 6, oy);
            g.fillStyle = i % 2 ? vp.primary : vp.core;
            g.fill();
          }
          g.globalAlpha = 1;
        } else {
          // 墨痕剑气新月
          g.scale(s, s);
          g.globalAlpha = 1 - u * 0.3;
          g.beginPath();
          g.arc(0, 0, 22, -1.2, 1.2);
          g.arc(-7, 0, 18, 1.1, -1.1, true);
          g.closePath();
          g.fillStyle = INK;
          g.fill();
          ink(g, 2, vp.primary);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.restore();
      }
      break;
    }
    case 'suohun_chain': {
      const out = prog(p, 0.22, hitP);
      const back = prog(p, hitP + 0.06, hitP + 0.26);
      const reach = out * (1 - back);
      if (reach <= 0.01) break;
      const n = 14;
      const cx = (hx + tx) / 2;
      const cy = Math.min(hy, ty) - 40 * s * (1 - out * 0.6);
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * reach;
        const [px, py] = bezierPt(hx, hy, cx, cy, tx, ty, u);
        g.beginPath();
        g.ellipse(px, py, 2.4 * s, 3.4 * s, i * 0.9, 0, TAU);
        ink(g, 1.6 * s, i % 2 ? vp.primary : PAPER_SHADE);
        g.stroke();
      }
      const [ex, ey] = bezierPt(hx, hy, cx, cy, tx, ty, reach);
      g.save();
      g.translate(ex, ey);
      g.scale(s, s);
      g.beginPath();
      g.moveTo(8, 0);
      g.lineTo(-2, -5);
      g.lineTo(0, 0);
      g.lineTo(-2, 5);
      g.closePath();
      fillInk(g, vp.bright, 1, INK);
      g.restore();
      break;
    }
    case 'compass':
    case 'bronze_mirror': {
      const charge = prog(p, 0.12, 0.26);
      const beamU = prog(p, 0.26, hitP + 0.14);
      const ox = hx + 9 * s;
      const oy = hy - (weaponId === 'bronze_mirror' ? 13 : 3) * s;
      if (charge > 0 && beamU <= 0) {
        g.globalAlpha = charge;
        ink(g, 2 * s, vp.bright);
        g.beginPath();
        g.arc(ox, oy, (22 - charge * 10) * s, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (beamU > 0 && beamU < 1) {
        const grow = clamp01(beamU * 3);
        const fade = 1 - prog(beamU, 0.6, 1);
        const ex = lerp(ox, tx, grow);
        const ey = lerp(oy, ty, grow);
        const wdt = (weaponId === 'bronze_mirror' ? 12 : 7) * s * fade;
        g.globalAlpha = 0.45 * fade;
        ink(g, wdt * 2.2, vp.primary);
        g.beginPath();
        g.moveTo(ox, oy);
        g.lineTo(ex, ey);
        g.stroke();
        g.globalAlpha = 0.95 * fade;
        ink(g, wdt, vp.bright);
        g.stroke();
        ink(g, wdt * 0.35, vp.core);
        g.stroke();
        g.globalAlpha = 1;
        if (weaponId === 'compass') {
          g.save();
          g.translate(ox, oy);
          g.rotate(t * 4);
          g.globalAlpha = fade;
          ink(g, 1.6 * s, vp.bright);
          g.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            g.lineTo(Math.cos(a) * 18 * s, Math.sin(a) * 18 * s);
          }
          g.closePath();
          g.stroke();
          g.globalAlpha = 1;
          g.restore();
        }
      }
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* 手臂动作曲线                                                         */
/* ------------------------------------------------------------------ */

function armPose(style, p) {
  // 返回前臂角度（0 下垂，负值向前抬，正值向后）与身体前倾
  const rest = -0.35;
  const wind = style === 'blade' || style === 'whip' ? 2.3 : style === 'throw' ? 2.0 : 1.2;
  const strike = style === 'blade' || style === 'whip' ? -1.2 : style === 'beam' ? -1.45 : -1.25;
  let a;
  if (p < 0.2) a = lerp(rest, wind, easeInOut(p / 0.2));
  else if (p < 0.3) a = lerp(wind, strike, easeOut((p - 0.2) / 0.1));
  else if (p < 0.55) a = strike + Math.sin((p - 0.3) * 30) * 0.03;
  else a = lerp(strike, rest, easeInOut(prog(p, 0.55, 0.9)));
  const lean = p < 0.2 ? -0.05 * (p / 0.2) : p < 0.36 ? lerp(-0.05, 0.08, prog(p, 0.2, 0.3)) : lerp(0.08, 0, prog(p, 0.36, 0.8));
  return { a, lean };
}

/* ------------------------------------------------------------------ */
/* 对外：绘制精绘法相 + 实战演武                                        */
/* ------------------------------------------------------------------ */

/**
 * @param ctx 画布上下文
 * @param o { heroId, skinId, x, y (脚底), scale, t (秒), attackT (自上次切换起秒), weaponId, vfxPal, targetX, targetY, showTarget }
 */
export function drawHeroShowcase(ctx, o = {}) {
  const heroId = BUILDS[o.heroId] ? o.heroId : 'zhou';
  const normSkin = normalizeHeroSkinId(heroId, o.skinId);
  const L = LOOKS[normSkin] || LOOKS[`${heroId}_default`];
  const B = BUILDS[heroId];
  const s = o.scale || 1;
  const t = o.t || 0;
  const weaponId = o.weaponId || 'gong';
  const vp = o.vfxPal;
  const style = WEAPON_STYLE[weaponId] || 'shoot';
  const p = ((o.attackT || 0) % SHOWCASE_PERIOD) / SHOWCASE_PERIOD;
  const pose = armPose(style, p);
  const breathe = Math.sin(t * 2.2) * 0.8;

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(s, s);

  // 足下投影
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(0, 0, B.hem + 6, 5, 0, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.rotate(pose.lean);
  ctx.translate(0, breathe * 0.3);

  drawOrnament(ctx, L.ornament, L, B, t);

  // 后臂（提灯）
  const back = drawSleeveArm(ctx, L, B, heroId, -B.sh + 2, -58 + breathe * 0.4, 0.38 + Math.sin(t * 2.2) * 0.04, false);

  drawBody(ctx, heroId, L, B, t, pose.lean);
  drawHandLantern(ctx, L, back.hx, back.hy, t);
  drawHead(ctx, heroId, L, B, t);

  // 前臂（兵刃）
  const sx = B.sh - 2;
  const sy = -58 + breathe * 0.4;
  const front = drawSleeveArm(ctx, L, B, heroId, sx, sy, pose.a, true);
  ctx.save();
  ctx.translate(front.hx, front.hy);
  ctx.rotate(pose.a);
  drawHeldWeapon(ctx, weaponId, vp, t, pose.a);
  ctx.restore();
  ctx.restore();

  // 世界坐标的手部位置（用于发射特效）
  const cosL = Math.cos(pose.lean);
  const sinL = Math.sin(pose.lean);
  const lx = front.hx;
  const ly = front.hy + breathe * 0.3;
  const hx = o.x + (lx * cosL - ly * sinL) * s;
  const hy = o.y + (lx * sinL + ly * cosL) * s;

  if (o.showTarget !== false && Number.isFinite(o.targetX)) {
    const hitP = getShowcaseHitPhase(weaponId);
    const hitAge = (p - hitP) * SHOWCASE_PERIOD;
    drawPaperGhostTarget(ctx, o.targetX, o.targetY, s * (o.targetScale || 0.85), t, hitAge, vp);
    drawAttackFx(ctx, weaponId, {
      p, hx, hy, tx: o.targetX, ty: o.targetY - 4 * s, s, vp, t,
    });
  }
  return { hx, hy, phase: p };
}
