// menu-scene.js —— 标题页与更房动态守夜青石街巷灯火夜景 + 更房实时动态演武预览台（F7）
// 铁律：
//   1. #game-canvas 背景夜景严格遵守 6 色暖木版画色阶（R >= G >= B），通过 T2-F7-04 <0.5% 色板审计；
//   2. rAF 回调严禁命名为 frame（遵守 T5-WB-07 与 E2E 步进器隔离）；
//   3. 进入对局时立即 stop() 释放 #game-canvas，返回标题/更房时无缝恢复。
import {
  INK, PAPER, PAPER_SHADE, VERM, VERM_DARK, LANTERN,
  inkA, paperA, vermA, lanternA,
} from './palette.js';
import { drawHeroShowcase } from './hero-showcase.js';
import {
  getVfxPalette,
  vfxArraySprite,
  vfxRingSprite,
  vfxSlashSprite,
} from './vfx-themes.js';

const TAU = Math.PI * 2;

const LANTERN_ANCHORS = [
  { rx: 0.13, ry: 0.22, len: 34, r: 12, phase: 0.2, speed: 1.7 },
  { rx: 0.86, ry: 0.20, len: 40, r: 13, phase: 1.9, speed: 1.5 },
  { rx: 0.24, ry: 0.46, len: 28, r: 10, phase: 3.1, speed: 2.0 },
  { rx: 0.78, ry: 0.48, len: 30, r: 10.5, phase: 4.4, speed: 1.8 },
  { rx: 0.09, ry: 0.68, len: 24, r: 9.5, phase: 2.5, speed: 2.2 },
  { rx: 0.91, ry: 0.66, len: 26, r: 10, phase: 0.9, speed: 1.9 },
];

const EMBERS = Array.from({ length: 28 }, (_, i) => ({
  rx: ((i * 37 + 13) % 100) / 100,
  ry: ((i * 53 + 29) % 100) / 100,
  spd: 12 + (i % 5) * 5,
  drift: 8 + (i % 4) * 4,
  r: 1.4 + (i % 3) * 0.8,
  warm: i % 3 === 0 ? 'verm' : 'gold',
  phase: i * 0.77,
}));

let cachedLanternGlow = null;
function getLanternGlowCanvas() {
  if (cachedLanternGlow || typeof document === 'undefined') return cachedLanternGlow;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(48, 48, 3, 48, 48, 46);
  grad.addColorStop(0, lanternA(0.44));
  grad.addColorStop(0.45, vermA(0.20));
  grad.addColorStop(1, lanternA(0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(48, 48, 46, 0, TAU);
  g.fill();
  cachedLanternGlow = c;
  return c;
}

function drawHangingLantern(ctx, ax, ay, cordLen, radius, angle, pulse) {
  const bx = ax + Math.sin(angle) * cordLen;
  const by = ay + Math.cos(angle) * cordLen;

  // 预烘焙暖金灯晕（纯暖色 R >= G >= B，零每帧 createRadialGradient）
  const glowR = radius * (3.1 + pulse * 0.35);
  const glowSpr = getLanternGlowCanvas();
  if (glowSpr) {
    ctx.drawImage(glowSpr, bx - glowR, by - glowR, glowR * 2, glowR * 2);
  }

  // 悬绳
  ctx.strokeStyle = PAPER_SHADE;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by - radius * 0.95);
  ctx.stroke();

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(angle * 0.65);

  // 朱砂灯身与暖黄灯芯
  ctx.fillStyle = VERM;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.92, radius * 1.08, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = LANTERN;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.52, radius * 0.74, 0, 0, TAU);
  ctx.fill();

  // 上下乌木灯箍
  ctx.fillStyle = INK;
  ctx.fillRect(-radius * 0.55, -radius * 1.16, radius * 1.1, 2.8);
  ctx.fillRect(-radius * 0.52, radius * 0.94, radius * 1.04, 2.6);

  // 朱红流苏穗
  ctx.strokeStyle = VERM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, radius * 1.18);
  ctx.lineTo(Math.sin(angle * 1.5) * 3.5, radius * 1.95);
  ctx.stroke();
  ctx.restore();
}

function drawEavesSilhouette(ctx, w, h) {
  // 远景重檐楼阁剪影
  ctx.fillStyle = VERM_DARK;
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.74);
  ctx.lineTo(w * 0.16, h * 0.68);
  ctx.lineTo(w * 0.22, h * 0.63);
  ctx.lineTo(w * 0.36, h * 0.66);
  ctx.lineTo(w * 0.50, h * 0.58);
  ctx.lineTo(w * 0.64, h * 0.66);
  ctx.lineTo(w * 0.80, h * 0.62);
  ctx.lineTo(w * 0.92, h * 0.68);
  ctx.lineTo(w, h * 0.65);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // 左右飞檐挑角剪影
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.14);
  ctx.quadraticCurveTo(w * 0.14, h * 0.21, w * 0.26, h * 0.17);
  ctx.lineTo(w * 0.20, h * 0.24);
  ctx.lineTo(0, h * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, h * 0.13);
  ctx.quadraticCurveTo(w * 0.85, h * 0.20, w * 0.73, h * 0.16);
  ctx.lineTo(w * 0.79, h * 0.23);
  ctx.lineTo(w, h * 0.24);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, h * 0.41);
  ctx.quadraticCurveTo(w * 0.18, h * 0.46, w * 0.31, h * 0.43);
  ctx.lineTo(w * 0.25, h * 0.48);
  ctx.lineTo(0, h * 0.49);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, h * 0.42);
  ctx.quadraticCurveTo(w * 0.82, h * 0.47, w * 0.69, h * 0.44);
  ctx.lineTo(w * 0.75, h * 0.49);
  ctx.lineTo(w, h * 0.50);
  ctx.closePath();
  ctx.fill();

  // 底部青石街巷与牌坊地平线
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.84);
  ctx.lineTo(w * 0.28, h * 0.81);
  ctx.lineTo(w * 0.50, h * 0.83);
  ctx.lineTo(w * 0.74, h * 0.80);
  ctx.lineTo(w, h * 0.84);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 街屋暖纸窗棂
  const winBoxes = [
    [w * 0.06, h * 0.53, 16, 22],
    [w * 0.12, h * 0.53, 16, 22],
    [w * 0.83, h * 0.54, 16, 22],
    [w * 0.89, h * 0.54, 16, 22],
  ];
  for (const [wx, wy, ww, wh] of winBoxes) {
    ctx.fillStyle = lanternA(0.55);
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.beginPath();
    ctx.moveTo(wx + ww * 0.5, wy);
    ctx.lineTo(wx + ww * 0.5, wy + wh);
    ctx.moveTo(wx, wy + wh * 0.5);
    ctx.lineTo(wx + ww, wy + wh * 0.5);
    ctx.stroke();
  }
}

let cachedBackdrop = { w: 0, h: 0, canvas: null };
function getStaticStreetBackdrop(w, h) {
  if (typeof document === 'undefined') return null;
  if (cachedBackdrop.canvas && cachedBackdrop.w === w && cachedBackdrop.h === h) {
    return cachedBackdrop.canvas;
  }
  const k = 0.5;
  const bw = Math.max(1, Math.ceil(w * k));
  const bh = Math.max(1, Math.ceil(h * k));
  const c = cachedBackdrop.canvas || document.createElement('canvas');
  c.width = bw;
  c.height = bh;
  const g = c.getContext('2d');
  if (!g) return null;
  g.setTransform(bw / w, 0, 0, bh / h, 0, 0);

  g.fillStyle = INK;
  g.fillRect(0, 0, w, h);

  const mx = w * 0.74;
  const my = h * 0.14;
  const moonGlow = g.createRadialGradient(mx, my, 8, mx, my, 96);
  moonGlow.addColorStop(0, paperA(0.32));
  moonGlow.addColorStop(0.5, lanternA(0.12));
  moonGlow.addColorStop(1, paperA(0));
  g.fillStyle = moonGlow;
  g.beginPath();
  g.arc(mx, my, 96, 0, TAU);
  g.fill();

  g.fillStyle = PAPER_SHADE;
  g.globalAlpha = 0.82;
  g.beginPath();
  g.arc(mx, my, 24, 0, TAU);
  g.fill();
  g.globalAlpha = 1;

  const streetGlow = g.createRadialGradient(w * 0.5, h * 0.72, 16, w * 0.5, h * 0.72, w * 0.68);
  streetGlow.addColorStop(0, vermA(0.24));
  streetGlow.addColorStop(0.55, lanternA(0.10));
  streetGlow.addColorStop(1, inkA(0));
  g.fillStyle = streetGlow;
  g.fillRect(0, h * 0.25, w, h * 0.75);

  drawEavesSilhouette(g, w, h);
  cachedBackdrop = { w, h, canvas: c };
  return c;
}

export function createMenuScene(canvas, { isBlocked = () => false } = {}) {
  const ctx = canvas.getContext('2d');
  let active = false;
  let rafId = 0;
  let startMs = 0;

  function syncSize() {
    const w = Math.max(1, window.innerWidth || 390);
    const h = Math.max(1, window.innerHeight || 844);
    const dpr = 1;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  function drawScene(tSec) {
    if (!ctx) return;
    const { w, h, dpr } = syncSize();
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. 预烘焙青石街巷飞檐花窗古月底图
    const bg = getStaticStreetBackdrop(w, h);
    if (bg) {
      ctx.drawImage(bg, 0, 0, w, h);
    } else {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. 随夜风轻晃的六盏朱砂守夜灯笼
    for (const lan of LANTERN_ANCHORS) {
      const sway = Math.sin(tSec * lan.speed + lan.phase) * 0.16;
      const pulse = 0.5 + 0.5 * Math.sin(tSec * (lan.speed * 1.4) + lan.phase);
      drawHangingLantern(ctx, w * lan.rx, h * lan.ry, lan.len, lan.r, sway, pulse);
    }

    // 3. 飘升的暖金/朱砂守夜魂火微尘
    for (const e of EMBERS) {
      const yProg = (e.ry - (tSec * e.spd) / Math.max(320, h)) % 1;
      const ny = (yProg < 0 ? yProg + 1 : yProg) * h;
      const nx = e.rx * w + Math.sin(tSec * 1.6 + e.phase) * e.drift;
      const alpha = 0.42 + 0.45 * Math.sin(tSec * 2.8 + e.phase);
      ctx.fillStyle = e.warm === 'verm' ? VERM : LANTERN;
      ctx.globalAlpha = Math.max(0.18, Math.min(0.92, alpha));
      ctx.beginPath();
      ctx.arc(nx, ny, e.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function tickMenuScene(ts) {
    rafId = 0;
    if (!active) return;
    if (isBlocked()) {
      stop();
      return;
    }
    if (document.hidden) return;
    if (!startMs) startMs = ts || 16;
    const tSec = ((ts || 16) - startMs) / 1000;
    drawScene(tSec);
    rafId = requestAnimationFrame(tickMenuScene);
  }

  function onVis() {
    if (!active || isBlocked()) return;
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    } else if (!rafId) {
      rafId = requestAnimationFrame(tickMenuScene);
    }
  }

  function onResize() {
    if (active && !isBlocked() && !document.hidden) {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      drawScene(startMs ? (now - startMs) / 1000 : 0);
    }
  }

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', onResize);

  function start() {
    if (isBlocked()) return;
    active = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : 16;
    if (!startMs) startMs = now;
    drawScene((now - startMs) / 1000);
    if (!document.hidden) {
      rafId = requestAnimationFrame(tickMenuScene);
    }
  }

  function stop() {
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function destroy() {
    stop();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
  }

  return { start, stop, destroy, drawScene };
}

/**
 * 绘制单帧角色/皮肤/兵刃/攻击特效演武台（供更房 .hero-stage__canvas 与鬼市商铺实时预览台共用）
 */
export function renderStagePreviewFrame(ctx, w, h, tSec, state = {}) {
  const {
    mode = 'hero', // 'hero' | 'vfx'
    heroId = 'zhou',
    skinId = null,
    starterWeapon = 'gong',
    attackVfx = 'default',
    isSignature = true,
    legacyOutfit = null,
    legacyLantern = null,
    burstProgress = 1, // 0..1 切换角色/兵刃时的破墨金芒涟漪
    attackT = tSec, // 自上次切换起的秒数：0 时立刻打出一记招牌招式
  } = state;

  const isTall = h >= 145;
  // 演武台暗夜木刻底衬 + 月晕景深
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  const cx = mode === 'vfx' ? w * 0.5 : w * (isTall ? 0.33 : 0.34);
  const cy = h * (isTall ? 0.5 : 0.56);
  const vfxPal = getVfxPalette(attackVfx);

  // 角色专属演武场氛围色与背后法相阵纹（六名守夜人各有独特舞台气场）
  const heroThemes = {
    zhou: { halo0: lanternA(0.30), halo1: vermA(0.18), sigil: 'gong', accent: LANTERN },
    mian: { halo0: paperA(0.28), halo1: vermA(0.22), sigil: 'paper', accent: PAPER },
    daotong: { halo0: lanternA(0.26), halo1: paperA(0.18), sigil: 'bagua', accent: LANTERN },
    yinyang: { halo0: paperA(0.24), halo1: lanternA(0.22), sigil: 'stars', accent: PAPER_SHADE },
    tiejiang: { halo0: vermA(0.32), halo1: lanternA(0.20), sigil: 'forge', accent: VERM },
    nuoxi: { halo0: vermA(0.34), halo1: paperA(0.16), sigil: 'drum', accent: VERM },
    weier: { halo0: paperA(0.28), halo1: lanternA(0.20), sigil: 'waves', accent: PAPER },
    qiansuanzi: { halo0: lanternA(0.32), halo1: vermA(0.18), sigil: 'abacus', accent: LANTERN },
  };
  const hTheme = heroThemes[heroId] || heroThemes.zhou;

  // 月晕与暖火氛围背光
  const backR = Math.min(w, h) * (isTall ? 0.78 : 0.62);
  const backGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, backR);
  backGrad.addColorStop(0, isSignature ? hTheme.halo0 : paperA(0.16));
  backGrad.addColorStop(0.48, hTheme.halo1);
  backGrad.addColorStop(1, inkA(0));
  ctx.fillStyle = backGrad;
  ctx.fillRect(0, 0, w, h);

  if (isTall) {
    // 远景古月与街巷飞檐剪影（填补上方天空层次，营造古镇子夜演武场氛围）
    const moonX = w * 0.22;
    const moonY = h * 0.18;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 54);
    moonGlow.addColorStop(0, paperA(0.26));
    moonGlow.addColorStop(0.55, lanternA(0.08));
    moonGlow.addColorStop(1, inkA(0));
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 54, 0, TAU);
    ctx.fill();

    ctx.fillStyle = paperA(0.32);
    ctx.beginPath();
    ctx.arc(moonX, moonY, 16, 0, TAU);
    ctx.fill();

    // 远景重檐屋脊剪影
    ctx.fillStyle = vermA(0.09);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.52);
    ctx.lineTo(w * 0.14, h * 0.42);
    ctx.lineTo(w * 0.28, h * 0.46);
    ctx.lineTo(w * 0.44, h * 0.36);
    ctx.lineTo(w * 0.62, h * 0.45);
    ctx.lineTo(w * 0.78, h * 0.40);
    ctx.lineTo(w, h * 0.48);
    ctx.lineTo(w, h * 0.60);
    ctx.lineTo(0, h * 0.60);
    ctx.closePath();
    ctx.fill();

    // 左上挑角飞檐
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.32, 0);
    ctx.quadraticCurveTo(w * 0.22, h * 0.08, w * 0.10, h * 0.10);
    ctx.lineTo(0, h * 0.12);
    ctx.closePath();
    ctx.fill();

    // 青石院坪地平线与淡金砖缝透视线
    const horizonY = h * 0.56;
    ctx.fillStyle = vermA(0.08);
    ctx.fillRect(0, horizonY, w, h - horizonY);
    ctx.strokeStyle = lanternA(0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    // 角色专属背后法相阵纹（大幅增强切人仪式感与辨识度）
    ctx.save();
    ctx.translate(cx, h * 0.40);
    ctx.strokeStyle = hTheme.accent;
    ctx.fillStyle = hTheme.accent;
    if (hTheme.sigil === 'gong') {
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 2.2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, 42 + k * 24 + Math.sin(tSec * 2 + k) * 3, 0, TAU);
        ctx.stroke();
      }
    } else if (hTheme.sigil === 'paper') {
      ctx.globalAlpha = 0.26;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + tSec * 0.4;
        ctx.save();
        ctx.translate(Math.cos(a) * 62, Math.sin(a) * 38);
        ctx.rotate(a + 0.5);
        ctx.fillRect(-7, -14, 14, 28);
        ctx.restore();
      }
    } else if (hTheme.sigil === 'bagua') {
      ctx.globalAlpha = 0.26;
      ctx.rotate(tSec * 0.22);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rx = Math.cos(a) * 74;
        const ry = Math.sin(a) * 74;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, TAU);
      ctx.stroke();
    } else if (hTheme.sigil === 'stars') {
      ctx.globalAlpha = 0.30;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const sx = -68 + i * 22;
        const sy = Math.sin(i * 1.15) * 36 - 8;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const sx = -68 + i * 22;
        const sy = Math.sin(i * 1.15) * 36 - 8;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.8, 0, TAU);
        ctx.fill();
      }
    } else if (hTheme.sigil === 'forge') {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2.6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + tSec * 0.25;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 44, Math.sin(a) * 44);
        ctx.lineTo(Math.cos(a) * 78, Math.sin(a) * 78);
        ctx.stroke();
      }
    } else if (hTheme.sigil === 'drum') {
      ctx.globalAlpha = 0.30;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 72, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = vermA(0.16);
      ctx.beginPath();
      ctx.arc(0, 0, 56, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - tSec * 0.3;
        ctx.fillStyle = LANTERN;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 64, Math.sin(a) * 64, 4.2, 0, TAU);
        ctx.fill();
      }
    } else if (hTheme.sigil === 'waves') {
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = 2.2;
      for (let row = -1; row <= 1; row++) {
        ctx.beginPath();
        for (let k = -3; k <= 3; k++) {
          const wx = k * 24 + Math.sin(tSec * 2 + row) * 6;
          const wy = row * 22;
          ctx.arc(wx, wy, 12, Math.PI, TAU);
        }
        ctx.stroke();
      }
    } else if (hTheme.sigil === 'abacus') {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2;
      ctx.strokeRect(-62, -38, 124, 76);
      for (let r = -2; r <= 2; r++) {
        const rx = r * 22;
        ctx.beginPath();
        ctx.moveTo(rx, -38);
        ctx.lineTo(rx, 38);
        ctx.stroke();
        const by = Math.sin(tSec * 2.4 + r) * 14;
        ctx.fillStyle = LANTERN;
        ctx.beginPath();
        ctx.arc(rx, by, 5.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // 柔和飘升暖金星火
    for (let i = 0; i < 12; i++) {
      const ph = (tSec * 0.32 + i * 0.15) % 1;
      const ex = cx + Math.sin(i * 2.1 + tSec * 1.4) * (w * 0.36);
      const ey = h * 0.78 - ph * (h * 0.70);
      ctx.fillStyle = i % 3 === 0 ? VERM : LANTERN;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.6;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.3 + (i % 2) * 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 左右暖火灯柱框景（高舞台下左侧悬灯映衬）
  const pillarInset = isTall ? 16 : 18;
  for (const side of [-1, 1]) {
    if (isTall && side > 0) continue; // 右侧留给功能纵栏
    const px = side < 0 ? pillarInset : w - pillarInset;
    ctx.strokeStyle = paperA(0.24);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, 8);
    ctx.lineTo(px, isTall ? h * 0.56 : h - 8);
    ctx.stroke();

    const ly = (isTall ? h * 0.16 : 24) + Math.sin(tSec * 2.2 + (side > 0 ? 1.4 : 0)) * 2.5;
    const glowSpr = getLanternGlowCanvas();
    if (glowSpr) {
      ctx.drawImage(glowSpr, px - 28, ly - 28, 56, 56);
    }
    ctx.fillStyle = VERM;
    ctx.beginPath();
    ctx.arc(px, ly, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = LANTERN;
    ctx.beginPath();
    ctx.arc(px, ly, 3, 0, TAU);
    ctx.fill();
  }

  if (mode === 'vfx') {
    // 锋芒异彩特写展台：大比例展示主题法阵 + 震波环 + 刀光扇斩
    ctx.save();
    ctx.translate(w * 0.5, h * 0.52);
    if (attackVfx === 'default') {
      ctx.strokeStyle = VERM;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34 + Math.sin(tSec * 3) * 3, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = LANTERN;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 22, -0.8 + tSec * 1.8, 1.4 + tSec * 1.8);
      ctx.stroke();
      ctx.fillStyle = PAPER;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + tSec * 1.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 38, Math.sin(a) * 26, 3.2, 0, TAU);
        ctx.fill();
      }
    } else {
      const arrSpr = vfxArraySprite(attackVfx, 'talisman');
      const ringSpr = vfxRingSprite(attackVfx, 0);
      const slashSpr = vfxSlashSprite(attackVfx, 48, 1.5, true);

      ctx.save();
      ctx.scale(1, 0.58);
      ctx.rotate(tSec * 0.8);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(arrSpr.canvas, -46, -46, 92, 92);
      ctx.restore();

      ctx.save();
      const sRing = 0.36 + 0.03 * Math.sin(tSec * 3.2);
      ctx.rotate(-tSec * 0.6);
      ctx.drawImage(ringSpr.canvas, -ringSpr.w * 0.5 * sRing, -ringSpr.h * 0.5 * sRing, ringSpr.w * sRing, ringSpr.h * sRing);
      ctx.restore();

      ctx.save();
      ctx.rotate(Math.sin(tSec * 2.1) * 0.35 - 0.3);
      ctx.drawImage(slashSpr.canvas, -slashSpr.w * 0.32, -slashSpr.h * 0.32, slashSpr.w * 0.64, slashSpr.h * 0.64);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // 青石八卦演武石台基座（高舞台居中偏上，稳稳压住视觉中心）
  const daisY = h * (isTall ? 0.66 : 0.84);
  const daisRx = isTall ? 72 : 52;
  const daisRy = isTall ? 17 : 13;
  ctx.save();
  ctx.translate(cx, daisY);
  ctx.fillStyle = isSignature ? vermA(0.24) : lanternA(0.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, daisRx, daisRy, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = isSignature ? LANTERN : PAPER_SHADE;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, daisRx * 0.9, daisRy * 0.86, 0, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = vfxPal.primary;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, daisRx * 0.66, daisRy * 0.64, 0, 0, TAU);
  ctx.stroke();

  // 切换角色/兵刃时的破墨金环扩散波
  if (burstProgress < 1) {
    const bp = Math.max(0, Math.min(1, burstProgress));
    const waveR = daisRx * (0.45 + bp * 0.95);
    ctx.strokeStyle = lanternA((1 - bp) * 0.85);
    ctx.lineWidth = 3 * (1 - bp * 0.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, waveR, waveR * 0.28, 0, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = vermA((1 - bp) * 0.65);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -32, 22 + bp * 58, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // 背景攻击特效主题微缩气旋环
  if (attackVfx && attackVfx !== 'default') {
    const ringSpr = vfxRingSprite(attackVfx, 0);
    ctx.save();
    ctx.translate(cx, daisY - (isTall ? 46 : 26));
    ctx.rotate(tSec * 0.75);
    ctx.globalAlpha = 0.64;
    const rs = isTall ? 0.40 : 0.25;
    ctx.drawImage(ringSpr.canvas, -ringSpr.w * 0.5 * rs, -ringSpr.h * 0.5 * rs, ringSpr.w * rs, ringSpr.h * rs);
    ctx.restore();
  }

  // 精绘法相（矢量逐帧绘制）+ 手持起手兵刃实战演武，右侧纸祟靶子受击反馈
  const popScale = burstProgress < 1
    ? 1 + Math.sin(burstProgress * Math.PI) * 0.06
    : 1;
  const heroScale = (isTall ? Math.max(1.35, Math.min(2.1, h * 0.0042)) : Math.max(0.9, h * 0.0062)) * popScale;
  drawHeroShowcase(ctx, {
    heroId,
    skinId,
    x: cx,
    y: daisY,
    scale: heroScale,
    t: tSec,
    attackT,
    weaponId: starterWeapon,
    vfxPal,
    targetX: w * (isTall ? 0.635 : 0.76),
    targetY: daisY - (isTall ? 34 : 22) * heroScale * 0.85,
    targetScale: isTall ? 0.95 : 0.8,
  });

  // 起手兵刃铭牌（本命兵刃加朱印）
  if (isTall && starterWeapon) {
    ctx.save();
    ctx.font = '12px "WenKai", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isSignature ? lanternA(0.85) : paperA(0.55);
    ctx.fillText(isSignature ? '本命 · 演武' : '演武', cx, daisY + daisRy + 16);
    ctx.restore();
  }
}

export function createHeroStage(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let rafId = 0;
  let active = true;
  let startMs = 0;
  let burstStartMs = -9999;
  let attackStartMs = typeof performance !== 'undefined' ? performance.now() - 200 : 0;
  const BURST_MS = 420;

  function syncCanvasDims() {
    const cssW = Math.max(220, Math.floor(canvas.clientWidth || 340));
    const cssH = Math.max(96, Math.floor(canvas.clientHeight || 180));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    return { cssW, cssH, dpr };
  }

  function renderAt(tSec, nowMs) {
    if (!ctx) return;
    const { cssW, cssH, dpr } = syncCanvasDims();
    const burstProgress = Math.max(0, Math.min(1, (nowMs - burstStartMs) / BURST_MS));
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderStagePreviewFrame(ctx, cssW, cssH, tSec, {
      ...(getState?.() || {}),
      burstProgress,
      attackT: Math.max(0, (nowMs - attackStartMs) / 1000),
    });
    ctx.restore();
  }

  function tickHeroStage(ts) {
    rafId = 0;
    if (!active || !canvas.isConnected) return;
    if (document.hidden) return;
    const now = ts || 16;
    if (!startMs) startMs = now;
    renderAt((now - startMs) / 1000, now);
    rafId = requestAnimationFrame(tickHeroStage);
  }

  function onVis() {
    if (!active) return;
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    } else if (!rafId && canvas.isConnected) {
      rafId = requestAnimationFrame(tickHeroStage);
    }
  }

  document.addEventListener('visibilitychange', onVis);

  function refreshNow() {
    const now = typeof performance !== 'undefined' ? performance.now() : 16;
    if (!startMs) startMs = now;
    renderAt((now - startMs) / 1000, now);
    if (active && !rafId && !document.hidden) {
      rafId = requestAnimationFrame(tickHeroStage);
    }
  }

  function triggerBurst() {
    burstStartMs = typeof performance !== 'undefined' ? performance.now() : 16;
    attackStartMs = burstStartMs; // 切换即刻起手出招
    refreshNow();
  }

  function destroy() {
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    document.removeEventListener('visibilitychange', onVis);
  }

  refreshNow();
  return { refreshNow, triggerBurst, destroy };
}
