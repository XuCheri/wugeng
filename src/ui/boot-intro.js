// 开屏动画（F1）：分阶段水墨飞白加载进度（0→100%）+ 「剑清酱工作室」剑气破墨·朱印落款原创 Canvas 动画
// 严禁将 rAF 回调命名为 frame（保持游戏主循环确定性步进器零干扰）。
import { INK, PAPER, PAPER_SHADE, VERM, VERM_DARK, LANTERN, FONT_CN, paperA, vermA, lanternA, inkA } from '../render/palette.js';
import { brushStroke, makeRng, splatter } from '../render/ink.js';

const TAU = Math.PI * 2;
const LOADING_DUR = 0.34;
const LOGO_DUR = 0.56;
const FADEOUT_DUR = 0.04;
const WATCH_LABELS = ['一更', '二更', '三更', '四更', '五更'];

let activeIntro = null;

export function parseBootIntroQuery(search) {
  const raw = typeof search === 'string'
    ? search
    : (typeof window !== 'undefined' && window.location ? window.location.search : '');
  const q = new URLSearchParams(raw);
  const skip = q.get('skipIntro') === '1';
  const holdParam = q.get('introHold');
  const hold = holdParam === 'loading' || holdParam === 'logo' ? holdParam : null;
  return { skip, hold };
}

function recordIntroTrace(phase, progress) {
  if (typeof window === 'undefined') return;
  const tr = window.__e2eIntroTrace;
  if (tr && typeof tr === 'object') {
    if (Array.isArray(tr.phases) && phase && phase !== 'done' && tr.phases[tr.phases.length - 1] !== phase) {
      tr.phases.push(phase);
    }
    if (Array.isArray(tr.progressSamples) && Number.isFinite(progress)) {
      tr.progressSamples.push(progress);
    }
  }
}

function drawWoodblockFrame(ctx, W, H) {
  const pad = Math.max(10, Math.min(18, Math.floor(Math.min(W, H) * 0.035)));
  ctx.save();
  ctx.strokeStyle = paperA(0.26);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.strokeStyle = lanternA(0.18);
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 4, pad + 4, W - (pad + 4) * 2, H - (pad + 4) * 2);

  // 四角回纹折线
  const cLen = 14;
  ctx.strokeStyle = VERM;
  ctx.lineWidth = 2;
  const corners = [
    [pad, pad, 1, 1],
    [W - pad, pad, -1, 1],
    [pad, H - pad, 1, -1],
    [W - pad, H - pad, -1, -1],
  ];
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of corners) {
    ctx.moveTo(cx, cy + dy * cLen);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * cLen, cy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLoadingScene(ctx, W, H, progress01, clock) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  drawWoodblockFrame(ctx, W, H);

  const cx = W * 0.5;
  const cy = H * 0.40;
  const p = Math.max(0.02, Math.min(1, progress01));

  // 灯笼暖晕随加载进度渐燃
  const glowR = Math.min(W, H) * (0.20 + 0.16 * p);
  const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowR);
  grd.addColorStop(0, lanternA(0.32 * p + 0.08));
  grd.addColorStop(0.55, vermA(0.14 * p + 0.04));
  grd.addColorStop(1, inkA(0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, TAU);
  ctx.fill();

  // 悬垂打更竹提灯
  const sway = Math.sin(clock * 4.2) * 0.06;
  ctx.save();
  ctx.translate(cx, cy - 52);
  ctx.rotate(sway);
  // 提竿与挂线
  ctx.strokeStyle = PAPER_SHADE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-26, -6);
  ctx.lineTo(18, 2);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.stroke();

  // 灯笼纸罩
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 44, 24, 28, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // 灯芯阳炎（随进度壮大）
  const flameH = 8 + 14 * p;
  ctx.fillStyle = VERM;
  ctx.beginPath();
  ctx.moveTo(0, 52 - flameH);
  ctx.quadraticCurveTo(9, 46, 5, 55);
  ctx.quadraticCurveTo(0, 59, -5, 55);
  ctx.quadraticCurveTo(-9, 46, 0, 52 - flameH);
  ctx.fill();
  ctx.fillStyle = LANTERN;
  ctx.beginPath();
  ctx.arc(0, 51, 4.5 + 2.5 * p, 0, TAU);
  ctx.fill();

  // 竹骨与上下灯箍
  ctx.strokeStyle = inkA(0.55);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, 44, 10, 27, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-13, 14, 26, 5);
  ctx.fillRect(-12, 69, 24, 5);
  // 朱砂灯穗
  ctx.fillStyle = VERM;
  ctx.fillRect(-2, 74, 4, 16);
  ctx.restore();

  // 飘升火星微粒
  for (let i = 0; i < 8; i++) {
    const ph = (clock * 0.9 + i * 0.17) % 1;
    const ex = cx + Math.sin(i * 2.3 + clock * 3) * (24 + i * 7);
    const ey = cy + 30 - ph * 95;
    ctx.fillStyle = i % 2 === 0 ? LANTERN : VERM;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.5 + (1 - ph) * 1.4, 0, TAU);
    ctx.fill();
  }

  // 标题与副题
  ctx.fillStyle = PAPER;
  ctx.font = `26px ${FONT_CN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('五更天 · 掌灯候更', cx, H * 0.56);

  const stageLabel = p < 0.45 ? '研墨铺纸 · 唤起百器图谱' : p < 0.85 ? '校定更筹 · 点亮街巷灯火' : '更鼓已备 · 静候剑鸣破晓';
  ctx.fillStyle = PAPER_SHADE;
  ctx.font = `13px ${FONT_CN}`;
  ctx.fillText(stageLabel, cx, H * 0.605);

  // 水墨飞白进度槽（宣纸底匣 + 朱砂毛笔横扫 + 金焰锋头）
  const barW = Math.min(W * 0.74, 300);
  const barH = 14;
  const bx = cx - barW / 2;
  const by = H * 0.66;

  ctx.fillStyle = PAPER;
  ctx.fillRect(bx - 4, by - 4, barW + 8, barH + 8);
  ctx.strokeStyle = PAPER_SHADE;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(bx - 6, by - 6, barW + 12, barH + 12);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(bx - 2, by - 2, barW + 4, barH + 4);

  const fillW = Math.max(8, barW * p);
  brushStroke(
    ctx,
    [
      [bx + 2, by + barH * 0.5],
      [bx + fillW * 0.5, by + barH * 0.46],
      [bx + fillW, by + barH * 0.52],
    ],
    barH * 0.92,
    { color: VERM, seed: 17, dry: 0.32, taperIn: 0.06, taperOut: 0.22, startWidth: 0.85 },
  );
  // 进度笔锋金芒点
  ctx.fillStyle = LANTERN;
  ctx.beginPath();
  ctx.arc(bx + fillW, by + barH * 0.5, 4.2, 0, TAU);
  ctx.fill();

  // 五更刻度点与百分比数字
  const activeWatches = Math.min(5, Math.max(1, Math.ceil(p * 5)));
  ctx.font = `12px ${FONT_CN}`;
  for (let i = 0; i < 5; i++) {
    const wx = bx + (barW * (i + 0.5)) / 5;
    const wy = by + barH + 22;
    const on = i < activeWatches;
    ctx.fillStyle = on ? LANTERN : paperA(0.38);
    ctx.fillText(WATCH_LABELS[i], wx, wy);
  }

  ctx.fillStyle = PAPER;
  ctx.font = `15px ${FONT_CN}`;
  ctx.fillText(`${Math.round(p * 100)}%`, cx, by + barH + 46);

  // 底部工作室预热暗印
  ctx.fillStyle = paperA(0.45);
  ctx.font = `12px ${FONT_CN}`;
  ctx.fillText('剑清酱工作室 · 出品', cx, H * 0.88);
}

function drawStudioLogoScene(ctx, W, H, u01, clock) {
  const u = Math.max(0, Math.min(1, u01));
  // 落印瞬间微震（u ∈ [0.46, 0.62]）
  let shakeX = 0;
  let shakeY = 0;
  if (u >= 0.46 && u <= 0.64) {
    const k = 1 - (u - 0.46) / 0.18;
    shakeX = Math.sin(u * 260) * 3.2 * k;
    shakeY = Math.cos(u * 210) * 2.4 * k;
  }

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(shakeX, shakeY);
  drawWoodblockFrame(ctx, W, H);

  const cx = W * 0.5;
  const cy = H * 0.46;
  const rng = makeRng(202605);

  // 1. 浓墨涟漪与金朱破墨晕染底衬
  const rippleK = Math.min(1, u / 0.55);
  const haloR = Math.min(W, H) * (0.18 + 0.24 * rippleK);
  const grd = ctx.createRadialGradient(cx, cy - 18, 6, cx, cy - 18, haloR);
  grd.addColorStop(0, lanternA(0.24 * rippleK));
  grd.addColorStop(0.52, vermA(0.16 * rippleK));
  grd.addColorStop(1, inkA(0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy - 18, haloR, 0, TAU);
  ctx.fill();

  // 水墨飞白圆环阵（破墨涟漪）
  const ringR = Math.min(W * 0.34, 128) * (0.72 + 0.28 * rippleK);
  brushStroke(
    ctx,
    [
      [cx - ringR, cy - 26],
      [cx - ringR * 0.4, cy - 26 - ringR * 0.85],
      [cx + ringR * 0.6, cy - 26 - ringR * 0.65],
      [cx + ringR, cy - 18],
    ],
    10,
    { color: PAPER_SHADE, seed: 41, dry: 0.55, alpha: 0.32 * rippleK },
  );
  splatter(ctx, cx - ringR * 0.55, cy - 48, 14 * rippleK, rng, { color: VERM, count: 10, mainScale: 0.45 });
  splatter(ctx, cx + ringR * 0.62, cy + 12, 12 * rippleK, rng, { color: LANTERN, count: 9, mainScale: 0.35 });

  // 2. 斜贯长空的破墨寒光剑气（左上→右下斜劈，随后凝为剑纹天罡弧）
  const slashK = Math.min(1, u / 0.26);
  const sx0 = cx - W * 0.38;
  const sy0 = cy - 118;
  const sx1 = sx0 + W * 0.76 * slashK;
  const sy1 = sy0 + 168 * slashK;
  brushStroke(
    ctx,
    [
      [sx0, sy0],
      [(sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5 - 10],
      [sx1, sy1],
    ],
    13,
    { color: PAPER, seed: 88, dry: 0.38, taperIn: 0.18, taperOut: 0.35, alpha: 0.88 },
  );
  brushStroke(
    ctx,
    [
      [sx0 + 12, sy0 + 8],
      [(sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5 - 4],
      [sx1 - 6, sy1 + 4],
    ],
    4.5,
    { color: LANTERN, seed: 93, dry: 0.2, taperIn: 0.2, taperOut: 0.3, alpha: 0.92 },
  );

  // 3. 原创「剑清酱」八角剑魄徽记（竖立古剑贯宣纸圆月 + 赤金八角法轮）
  if (u > 0.14) {
    const crestA = Math.min(1, (u - 0.14) / 0.24);
    const crestY = cy - 86;
    ctx.save();
    ctx.globalAlpha = crestA;
    ctx.translate(cx, crestY);

    // 外八角金框
    ctx.strokeStyle = LANTERN;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const rx = Math.cos(a) * 38;
      const ry = Math.sin(a) * 38;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.stroke();

    // 宣纸满月衬底
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 徽记中央立剑（浓墨剑身 + 宣纸脊线 + 鎏金剑格 + 朱砂剑穗）
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(6.5, -26);
    ctx.lineTo(4.5, 16);
    ctx.lineTo(-4.5, 16);
    ctx.lineTo(-6.5, -26);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -39);
    ctx.lineTo(0, 14);
    ctx.stroke();

    // 鎏金云纹剑格与剑首
    ctx.fillStyle = LANTERN;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-15, 14);
    ctx.lineTo(0, 9);
    ctx.lineTo(15, 14);
    ctx.lineTo(10, 19);
    ctx.lineTo(-10, 19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = VERM;
    ctx.fillRect(-2.6, 19, 5.2, 13);
    ctx.fillStyle = LANTERN;
    ctx.beginPath();
    ctx.arc(0, 34, 4.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 4. 宣纸横卷书法牌匾：「剑清酱工作室」
  if (u > 0.20) {
    const textA = Math.min(1, (u - 0.20) / 0.24);
    const plaqueW = Math.min(W * 0.84, 326);
    const plaqueH = 68;
    const px = cx - plaqueW / 2;
    const py = cy - 12;

    ctx.save();
    ctx.globalAlpha = textA;

    // 宣纸牌匾底 + 朱砂金线装裱
    ctx.fillStyle = PAPER;
    ctx.fillRect(px, py, plaqueW, plaqueH);
    ctx.fillStyle = PAPER_SHADE;
    ctx.fillRect(px, py + plaqueH - 7, plaqueW, 7);
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(px + 3, py + 3, plaqueW - 6, plaqueH - 6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(px + 7, py + 7, plaqueW - 14, plaqueH - 14);

    // 套色错位朱砂影 + 浓墨大字书法「剑清酱工作室」
    const titleFontPx = Math.min(32, Math.max(24, Math.floor(plaqueW / 9.2)));
    ctx.font = `${titleFontPx}px ${FONT_CN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = vermA(0.36);
    ctx.fillText('剑清酱工作室', cx + 1.5, py + plaqueH * 0.5 + 1.5);
    ctx.fillStyle = INK;
    ctx.fillText('剑清酱工作室', cx, py + plaqueH * 0.5);

    // 牌匾下方鎏金副题
    ctx.fillStyle = LANTERN;
    ctx.font = `13px ${FONT_CN}`;
    ctx.fillText('剑气破墨 · 秉烛守五更', cx, py + plaqueH + 24);
    ctx.fillStyle = paperA(0.68);
    ctx.font = `11px ${FONT_CN}`;
    ctx.fillText('JIANQINGJIANG STUDIO PRESENTS', cx, py + plaqueH + 44);
    ctx.restore();
  }

  // 5. 朱砂方印重重盖落（「剑清·出品」）+ 金石火星迸散
  if (u > 0.44) {
    const rawS = Math.min(1, (u - 0.44) / 0.16);
    const scale = rawS < 1 ? 1.55 - 0.55 * rawS : 1;
    const sealSize = 52;
    const sealX = Math.min(W - 48, cx + Math.min(W * 0.32, 122));
    const sealY = cy + 62;

    ctx.save();
    ctx.translate(sealX, sealY);
    ctx.rotate(-0.09);
    ctx.scale(scale, scale);

    ctx.fillStyle = VERM;
    ctx.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
    ctx.strokeStyle = VERM_DARK;
    ctx.lineWidth = 2;
    ctx.strokeRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-sealSize / 2 + 4, -sealSize / 2 + 4, sealSize - 8, sealSize - 8);

    ctx.fillStyle = PAPER;
    ctx.font = `16px ${FONT_CN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('剑清', 0, -9);
    ctx.fillText('出品', 0, 10);
    ctx.restore();

    // 印泥与金星飞沫
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      const dist = 34 + (i % 3) * 9 + Math.sin(clock * 4 + i) * 2;
      ctx.fillStyle = i % 2 === 0 ? LANTERN : VERM;
      ctx.beginPath();
      ctx.arc(sealX + Math.cos(a) * dist, sealY + Math.sin(a) * dist, i % 2 === 0 ? 2.4 : 2.0, 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * 挂载并播放开屏动画（支持冷启动、跳过、?skipIntro=1、?introHold=loading|logo 及 replayIntro 重播）。
 * 返回 Promise<void>，在 .boot-intro 完全卸载（或跳过）后 resolve。
 */
export function runBootIntro(opts = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve({ skipped: true });
  }
  if (activeIntro) return activeIntro.promise;

  const forceReplay = !!opts.replay;
  const { skip, hold } = forceReplay ? { skip: false, hold: opts.hold || null } : parseBootIntroQuery();

  if (skip) {
    return Promise.resolve({ skipped: true });
  }

  const resolveAudio = () => opts.audio || opts.getAudio?.() || window.__wugeng?.audio || null;
  const el = document.createElement('div');
  el.className = 'boot-intro';
  el.setAttribute('data-intro-phase', hold === 'logo' ? 'logo' : 'loading');
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', '剑清酱工作室 · 五更天开屏动画');

  const canvas = document.createElement('canvas');
  canvas.className = 'boot-intro__canvas';
  canvas.setAttribute('aria-label', '剑清酱工作室开屏画卷');

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn--ghost boot-intro__skip';
  skipBtn.setAttribute('data-action', 'skip-intro');
  skipBtn.textContent = '跳过';

  el.appendChild(canvas);
  el.appendChild(skipBtn);
  document.body.appendChild(el);

  const ctx = canvas.getContext('2d');
  let cssW = 390;
  let cssH = 844;
  let dpr = 1;
  let phase = hold === 'logo' ? 'logo' : 'loading';
  let progress = hold === 'logo' ? 100 : hold === 'loading' ? 72 : 6;
  let elapsed = 0;
  let lastTs = 0;
  let rafId = 0;
  let finished = false;
  let fadingOut = false;
  let sawLoadingFrame = false;
  let sawLogoFrame = false;
  let playedSlashSfx = false;
  let playedSealSfx = false;

  const syncIntroGlobal = (readyFlag) => {
    window.__wugengIntro = {
      phase,
      progress: Math.round(progress),
      ready: !!readyFlag,
    };
    recordIntroTrace(phase, progress);
  };

  function resizeAndRedraw() {
    cssW = Math.max(1, window.innerWidth || el.clientWidth || 390);
    cssH = Math.max(1, window.innerHeight || el.clientHeight || 844);
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    renderCurrentFrame();
  }

  function renderCurrentFrame() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (phase === 'loading') {
      drawLoadingScene(ctx, cssW, cssH, progress / 100, elapsed);
    } else {
      const logoU = hold === 'logo' ? 0.88 : Math.max(0, Math.min(1, (elapsed - LOADING_DUR) / LOGO_DUR));
      drawStudioLogoScene(ctx, cssW, cssH, logoU, elapsed);
    }
  }

  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  function cleanupAndResolve(immediate = true) {
    if (finished) return;
    finished = true;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resizeAndRedraw);
    window.removeEventListener('orientationchange', resizeAndRedraw);
    window.removeEventListener('keydown', onKeyDown, true);
    el.style.pointerEvents = 'none';
    phase = 'done';
    progress = 100;
    syncIntroGlobal(true);

    const finalizeRemove = () => {
      el.hidden = true;
      el.remove();
      if (activeIntro && activeIntro.el === el) activeIntro = null;
      resolvePromise({ skipped: immediate });
    };

    if (immediate) {
      finalizeRemove();
    } else {
      el.classList.add('is-fading');
      setTimeout(finalizeRemove, Math.round(FADEOUT_DUR * 1000));
    }
  }

  function onKeyDown(ev) {
    if (ev.key === 'Escape' || ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      ev.stopPropagation();
      cleanupAndResolve(true);
    }
  }

  skipBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    cleanupAndResolve(true);
  });
  window.addEventListener('resize', resizeAndRedraw);
  window.addEventListener('orientationchange', resizeAndRedraw);
  window.addEventListener('keydown', onKeyDown, true);

  activeIntro = { el, promise, skip: () => cleanupAndResolve(true) };

  // 初次同步尺寸与首帧绘制
  syncIntroGlobal(false);
  resizeAndRedraw();

  const fontsReady = (document.fonts && document.fonts.ready)
    ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))])
    : Promise.resolve();

  if (hold === 'loading' || hold === 'logo') {
    fontsReady.then(() => {
      if (finished) return;
      phase = hold;
      progress = hold === 'loading' ? 72 : 100;
      el.setAttribute('data-intro-phase', phase);
      renderCurrentFrame();
      syncIntroGlobal(true);
    });
    return promise;
  }

  const startTs = performance.now();

  function introTick(now) {
    if (finished) return;
    lastTs = now;
    elapsed = Math.max(1 / 60, (now - startTs) / 1000);

    if (!sawLoadingFrame || elapsed < LOADING_DUR) {
      phase = 'loading';
      const rawP = Math.min(1, elapsed / LOADING_DUR);
      progress = Math.max(12, Math.min(100, Math.round(rawP * 100)));
      if (el.getAttribute('data-intro-phase') !== 'loading') {
        el.setAttribute('data-intro-phase', 'loading');
      }
      sawLoadingFrame = true;
      renderCurrentFrame();
      syncIntroGlobal(false);
      rafId = requestAnimationFrame(introTick);
      return;
    }

    if (!sawLogoFrame || elapsed < LOADING_DUR + LOGO_DUR) {
      if (phase !== 'logo') {
        phase = 'logo';
        progress = 100;
        el.setAttribute('data-intro-phase', 'logo');
      }
      const logoU = !sawLogoFrame ? Math.max(0.52, Math.min(1, (elapsed - LOADING_DUR) / LOGO_DUR)) : Math.max(0.22, Math.min(1, (elapsed - LOADING_DUR) / LOGO_DUR));
      if (!playedSlashSfx && logoU >= 0.12) {
        playedSlashSfx = true;
        try { resolveAudio()?.play?.('fire_coinsword'); } catch {}
      }
      if (!playedSealSfx && logoU >= 0.46) {
        playedSealSfx = true;
        try { resolveAudio()?.play?.('woodblock'); } catch {}
      }
      sawLogoFrame = true;
      renderCurrentFrame();
      syncIntroGlobal(logoU >= 0.5);
      rafId = requestAnimationFrame(introTick);
      return;
    }

    if (!fadingOut) {
      fadingOut = true;
      cleanupAndResolve(false);
    }
  }

  rafId = requestAnimationFrame(introTick);
  return promise;
}
