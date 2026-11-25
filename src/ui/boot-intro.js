// 开屏动画（F1）：分阶段水墨飞白加载进度（0→100%）+ 「剑清酱工作室」剑气破墨·朱印落款原创 Canvas 动画
// 关键修复：
//   1. 使用限幅帧间隔 dt（<= 40ms）推进时序，而非原始挂钟 now - startTs，避免手机端 TapTap 启动页/模块解析/字体加载耗时吞掉整个开屏动画；
//   2. 等待 WebView 首帧可见（!document.hidden && innerWidth > 0）后再计时，确保真机玩家完整看到加载与「剑清酱工作室」Logo；
//   3. 严禁将 rAF 回调命名为 frame（保持游戏主循环确定性步进器零干扰）。
import { INK, PAPER, PAPER_SHADE, VERM, VERM_DARK, LANTERN, FONT_CN, paperA, vermA, lanternA, inkA } from '../render/palette.js';
import { brushStroke, makeRng, splatter } from '../render/ink.js';

const TAU = Math.PI * 2;
const LOADING_DUR = 0.9;
const LOGO_DUR = 2.4;
const FADEOUT_DUR = 0.26;
const WATCH_LABELS = ['一更', '二更', '三更', '四更', '五更'];

let activeIntro = null;

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

function easeOutBack(t) {
  const x = Math.max(0, Math.min(1, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

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

function drawWoodblockFrame(ctx, W, H, alpha = 1) {
  const pad = Math.max(12, Math.min(20, Math.floor(Math.min(W, H) * 0.038)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = paperA(0.22);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.strokeStyle = lanternA(0.16);
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 5, pad + 5, W - (pad + 5) * 2, H - (pad + 5) * 2);

  // 四角朱砂回纹折角
  const cLen = 16;
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
  drawWoodblockFrame(ctx, W, H, 0.92);

  const cx = W * 0.5;
  const cy = H * 0.39;
  const p = Math.max(0.02, Math.min(1, progress01));
  const ignite = easeOutCubic(p);

  // 灯笼暖晕随加载进度渐燃
  const glowR = Math.min(W, H) * (0.20 + 0.22 * ignite);
  const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowR);
  grd.addColorStop(0, lanternA(0.36 * ignite + 0.08));
  grd.addColorStop(0.5, vermA(0.16 * ignite + 0.04));
  grd.addColorStop(1, inkA(0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, TAU);
  ctx.fill();

  // 淡墨光轮阵
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(clock * 0.45);
  ctx.strokeStyle = lanternA(0.18 + 0.18 * ignite);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, 56 + 10 * ignite, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 悬垂打更竹提灯
  const sway = Math.sin(clock * 3.8) * 0.07;
  ctx.save();
  ctx.translate(cx, cy - 54);
  ctx.rotate(sway);
  // 提竿与挂线
  ctx.strokeStyle = PAPER_SHADE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-28, -6);
  ctx.lineTo(20, 2);
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
  const flameH = 9 + 15 * ignite;
  ctx.fillStyle = VERM;
  ctx.beginPath();
  ctx.moveTo(0, 52 - flameH);
  ctx.quadraticCurveTo(9.5, 46, 5, 55);
  ctx.quadraticCurveTo(0, 59, -5, 55);
  ctx.quadraticCurveTo(-9.5, 46, 0, 52 - flameH);
  ctx.fill();
  ctx.fillStyle = LANTERN;
  ctx.beginPath();
  ctx.arc(0, 51, 4.5 + 2.8 * ignite, 0, TAU);
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
  ctx.fillRect(-2, 74, 4, 17);
  ctx.restore();

  // 飘升火星微粒
  for (let i = 0; i < 12; i++) {
    const ph = (clock * 0.85 + i * 0.13) % 1;
    const ex = cx + Math.sin(i * 2.1 + clock * 2.8) * (22 + i * 8);
    const ey = cy + 38 - ph * 115;
    ctx.fillStyle = i % 2 === 0 ? LANTERN : VERM;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.4 + (1 - ph) * 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 标题与副题
  ctx.fillStyle = PAPER;
  ctx.font = `26px ${FONT_CN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('五更天 · 掌灯候更', cx, H * 0.56);

  const stageLabel = p < 0.42
    ? '研墨铺纸 · 唤起百器图谱'
    : p < 0.82
      ? '校定更筹 · 点亮街巷灯火'
      : '更鼓已备 · 静候剑鸣破晓';
  ctx.fillStyle = PAPER_SHADE;
  ctx.font = `13px ${FONT_CN}`;
  ctx.fillText(stageLabel, cx, H * 0.605);

  // 水墨飞白进度槽（暗墨底槽 + 朱砂毛笔横扫 + 鎏金笔锋）
  const barW = Math.min(W * 0.72, 290);
  const barH = 10;
  const bx = cx - barW / 2;
  const by = H * 0.66;

  ctx.fillStyle = paperA(0.14);
  ctx.fillRect(bx - 3, by - 3, barW + 6, barH + 6);
  ctx.strokeStyle = paperA(0.45);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(bx - 3, by - 3, barW + 6, barH + 6);

  const fillW = Math.max(8, barW * p);
  brushStroke(
    ctx,
    [
      [bx + 2, by + barH * 0.5],
      [bx + fillW * 0.5, by + barH * 0.46],
      [bx + fillW, by + barH * 0.52],
    ],
    barH * 1.02,
    { color: VERM, seed: 17, dry: 0.28, taperIn: 0.05, taperOut: 0.2, startWidth: 0.88 },
  );
  // 进度笔锋金芒点
  ctx.fillStyle = LANTERN;
  ctx.beginPath();
  ctx.arc(bx + fillW, by + barH * 0.5, 4.4, 0, TAU);
  ctx.fill();

  // 五更刻度点与百分比数字
  const activeWatches = Math.min(5, Math.max(1, Math.ceil(p * 5)));
  ctx.font = `12px ${FONT_CN}`;
  for (let i = 0; i < 5; i++) {
    const wx = bx + (barW * (i + 0.5)) / 5;
    const wy = by + barH + 22;
    const on = i < activeWatches;
    ctx.fillStyle = on ? LANTERN : paperA(0.36);
    ctx.fillText(WATCH_LABELS[i], wx, wy);
  }

  ctx.fillStyle = PAPER;
  ctx.font = `15px ${FONT_CN}`;
  ctx.fillText(`${Math.round(p * 100)}%`, cx, by + barH + 46);

  // 底部工作室预热暗印
  ctx.fillStyle = paperA(0.5);
  ctx.font = `12px ${FONT_CN}`;
  ctx.fillText('剑清酱工作室 · 出品', cx, H * 0.88);
}

function drawStudioLogoScene(ctx, W, H, u01, clock) {
  const u = Math.max(0, Math.min(1, u01));
  // 落印瞬间微震（u ∈ [0.48, 0.65]）
  let shakeX = 0;
  let shakeY = 0;
  if (u >= 0.48 && u <= 0.65) {
    const k = 1 - (u - 0.48) / 0.17;
    shakeX = Math.sin(u * 300) * 3.6 * k;
    shakeY = Math.cos(u * 230) * 2.6 * k;
  }

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(shakeX, shakeY);
  drawWoodblockFrame(ctx, W, H, 0.86);

  const cx = W * 0.5;
  const cy = H * 0.46;
  const rng = makeRng(202605);

  // 1. 浓墨涟漪与金朱破墨晕染底衬
  const rippleK = easeOutCubic(u / 0.52);
  const haloR = Math.min(W, H) * (0.20 + 0.28 * rippleK);
  const grd = ctx.createRadialGradient(cx, cy - 26, 8, cx, cy - 26, haloR);
  grd.addColorStop(0, lanternA(0.28 * rippleK));
  grd.addColorStop(0.48, vermA(0.18 * rippleK));
  grd.addColorStop(1, inkA(0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy - 26, haloR, 0, TAU);
  ctx.fill();

  // 水墨飞白破墨圆环阵（14点平滑毛笔圆弧，呈现禅意墨圆）
  const ringR = Math.min(W * 0.35, 132) * (0.72 + 0.28 * rippleK);
  const ensoPts = [];
  const arcSpan = Math.PI * 1.48 * Math.max(0.2, rippleK);
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * 0.88 + (i / 14) * arcSpan;
    ensoPts.push([cx + Math.cos(a) * ringR, cy - 34 + Math.sin(a) * ringR * 0.86]);
  }
  brushStroke(
    ctx,
    ensoPts,
    9,
    { color: PAPER_SHADE, seed: 41, dry: 0.56, taperIn: 0.14, taperOut: 0.32, alpha: 0.34 * rippleK },
  );
  splatter(ctx, cx - ringR * 0.56, cy - 54, 15 * rippleK, rng, { color: VERM, count: 10, mainScale: 0.45 });
  splatter(ctx, cx + ringR * 0.64, cy + 16, 13 * rippleK, rng, { color: LANTERN, count: 9, mainScale: 0.35 });

  // 2. 斜贯长空的破墨寒光剑气（左上→右下斜劈，带余晖淡出）
  const slashK = easeOutCubic(u / 0.24);
  const slashFade = u > 0.35 ? Math.max(0.28, 1 - (u - 0.35) * 1.1) : 1;
  const sx0 = cx - W * 0.40;
  const sy0 = cy - 128;
  const sx1 = sx0 + W * 0.80 * slashK;
  const sy1 = sy0 + 184 * slashK;
  brushStroke(
    ctx,
    [
      [sx0, sy0],
      [(sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5 - 12],
      [sx1, sy1],
    ],
    14,
    { color: PAPER, seed: 88, dry: 0.36, taperIn: 0.16, taperOut: 0.34, alpha: 0.9 * slashFade },
  );
  brushStroke(
    ctx,
    [
      [sx0 + 14, sy0 + 9],
      [(sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5 - 5],
      [sx1 - 6, sy1 + 4],
    ],
    4.6,
    { color: LANTERN, seed: 93, dry: 0.2, taperIn: 0.18, taperOut: 0.28, alpha: 0.95 * slashFade },
  );

  // 3. 原创「剑清酱」八角剑魄徽记（弹性绽放入场）
  if (u > 0.12) {
    const rawC = Math.min(1, (u - 0.12) / 0.26);
    const crestA = easeOutCubic(rawC);
    const crestScale = 0.72 + 0.28 * easeOutBack(rawC);
    const crestY = cy - 86;
    ctx.save();
    ctx.globalAlpha = crestA;
    ctx.translate(cx, crestY);
    ctx.scale(crestScale, crestScale);

    // 外八角鎏金星轨（缓慢旋动）
    ctx.save();
    ctx.rotate(clock * 0.25);
    ctx.strokeStyle = LANTERN;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const rx = Math.cos(a) * 40;
      const ry = Math.sin(a) * 40;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 宣纸满月衬底
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, 0, 27, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 徽记中央立剑（浓墨剑身 + 宣纸脊线 + 鎏金剑格 + 朱砂剑穗）
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(6.8, -27);
    ctx.lineTo(4.6, 16);
    ctx.lineTo(-4.6, 16);
    ctx.lineTo(-6.8, -27);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, 14);
    ctx.stroke();

    // 鎏金云纹剑格与剑首
    ctx.fillStyle = LANTERN;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-16, 14);
    ctx.lineTo(0, 9);
    ctx.lineTo(16, 14);
    ctx.lineTo(10, 19);
    ctx.lineTo(-10, 19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = VERM;
    ctx.fillRect(-2.6, 19, 5.2, 14);
    ctx.fillStyle = LANTERN;
    ctx.beginPath();
    ctx.arc(0, 35, 4.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 4. 宣纸卷轴金线装裱 + 浓墨大字书法「剑清酱工作室」（从中心横向展卷，而非生硬弹框）
  if (u > 0.20) {
    const rawT = Math.min(1, (u - 0.20) / 0.24);
    const textE = easeOutCubic(rawT);
    const plaqueW = Math.min(W * 0.84, 326);
    const plaqueH = 68;
    const px = cx - plaqueW / 2;
    const py = cy - 6;

    ctx.save();
    ctx.globalAlpha = textE;

    // 展卷裁剪：从中央向两侧舒展
    const revealW = plaqueW * (0.2 + 0.8 * textE);
    ctx.beginPath();
    ctx.rect(cx - revealW / 2 - 4, py - 4, revealW + 8, plaqueH + 8);
    ctx.clip();

    // 宣纸横幅与双线装裱
    ctx.fillStyle = PAPER;
    ctx.fillRect(px, py, plaqueW, plaqueH);
    ctx.fillStyle = PAPER_SHADE;
    ctx.fillRect(px, py + plaqueH - 6, plaqueW, 6);
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 2.2;
    ctx.strokeRect(px + 3, py + 3, plaqueW - 6, plaqueH - 6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(px + 7, py + 7, plaqueW - 14, plaqueH - 14);

    // 套色错位朱砂影 + 浓墨大字书法「剑清酱工作室」
    const titleFontPx = Math.min(32, Math.max(24, Math.floor(plaqueW / 9.2)));
    ctx.font = `${titleFontPx}px ${FONT_CN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = vermA(0.38);
    ctx.fillText('剑清酱工作室', cx + 1.5, py + plaqueH * 0.5 + 1.5);
    ctx.fillStyle = INK;
    ctx.fillText('剑清酱工作室', cx, py + plaqueH * 0.5);
    ctx.restore();

    // 卷轴下方鎏金副题渐入
    const subA = easeOutCubic((u - 0.30) / 0.22);
    if (subA > 0) {
      ctx.save();
      ctx.globalAlpha = subA;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = LANTERN;
      ctx.font = `13.5px ${FONT_CN}`;
      ctx.fillText('剑气破墨 · 秉烛守五更', cx, py + plaqueH + 26);
      ctx.fillStyle = paperA(0.68);
      ctx.font = `11px ${FONT_CN}`;
      ctx.fillText('JIANQINGJIANG STUDIO PRESENTS', cx, py + plaqueH + 46);
      ctx.restore();
    }
  }

  // 5. 朱砂方印重重盖落（「剑清·出品」）+ 冲击波金环与火星迸散
  if (u > 0.45) {
    const rawS = Math.min(1, (u - 0.45) / 0.14);
    const scale = rawS < 1 ? 1.65 - 0.65 * easeOutCubic(rawS) : 1;
    const sealSize = 52;
    const sealX = Math.min(W - 48, cx + Math.min(W * 0.32, 122));
    const sealY = cy + 68;

    // 落印冲击波金环
    if (u > 0.50) {
      const waveT = Math.min(1, (u - 0.50) / 0.30);
      ctx.save();
      ctx.strokeStyle = lanternA((1 - waveT) * 0.72);
      ctx.lineWidth = 2.4 * (1 - waveT * 0.6);
      ctx.beginPath();
      ctx.arc(sealX, sealY, 24 + waveT * 42, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

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
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.25;
      const burst = easeOutCubic((u - 0.48) / 0.24);
      const dist = 28 + burst * (14 + (i % 3) * 10) + Math.sin(clock * 4 + i) * 2;
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
  let warmupTicks = 0;
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
    dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
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

  // 主动唤醒 WenKai 字体加载，就绪后立即重绘确保「剑清酱工作室」不以系统字体闪现
  try {
    document.fonts?.load?.('28px "WenKai"', '剑清酱工作室五更天掌灯候更');
  } catch {}
  const fontsReady = (document.fonts && document.fonts.ready)
    ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))])
    : Promise.resolve();

  // 初次同步尺寸与首帧绘制
  syncIntroGlobal(false);
  resizeAndRedraw();

  fontsReady.then(() => {
    if (!finished) {
      renderCurrentFrame();
    }
  });

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

  function introTick(now) {
    if (finished) return;

    // 若真机 WebView 尚在后台或尺寸未完成布局，先等待可见，不消耗动画时长
    if (document.hidden || (window.innerWidth || 0) <= 0) {
      lastTs = 0;
      rafId = requestAnimationFrame(introTick);
      return;
    }

    // 首帧热身：跳过启动期的巨额首帧抖动（TapTap 原生闪屏/模块解析耗时），从可见首帧平滑起步
    if (warmupTicks < 1) {
      warmupTicks++;
      lastTs = now;
      phase = 'loading';
      progress = 10;
      sawLoadingFrame = true;
      renderCurrentFrame();
      syncIntroGlobal(false);
      rafId = requestAnimationFrame(introTick);
      return;
    }

    const rawDt = lastTs > 0 ? (now - lastTs) / 1000 : 1 / 60;
    lastTs = now;
    // 限幅帧步长（<= 120ms）：既防手机端首帧卡顿直接跳过 Logo，又不拖慢低帧率环境播放节奏
    const dt = Math.min(0.12, Math.max(1 / 120, rawDt));
    elapsed += dt;

    if (!sawLoadingFrame || elapsed < LOADING_DUR) {
      phase = 'loading';
      const rawP = Math.min(1, elapsed / LOADING_DUR);
      progress = Math.max(10, Math.min(100, Math.round(easeOutCubic(rawP) * 100)));
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
      const logoU = Math.max(0.06, Math.min(1, (elapsed - LOADING_DUR) / LOGO_DUR));
      if (!playedSlashSfx && logoU >= 0.08) {
        playedSlashSfx = true;
        try { resolveAudio()?.play?.('fire_coinsword'); } catch {}
      }
      if (!playedSealSfx && logoU >= 0.45) {
        playedSealSfx = true;
        try { resolveAudio()?.play?.('woodblock'); } catch {}
      }
      sawLogoFrame = true;
      renderCurrentFrame();
      syncIntroGlobal(logoU >= 0.45);
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
