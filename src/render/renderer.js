// renderer.js —— 渲染入口（ARCHITECTURE §4）
// createRenderer(canvas, { lowQuality }) → { resize, render, consumeEvents, hitstop, getUltButtonRect, setLowQuality }
// 渲染层只读 run，绝不修改。
import { INK, VERM, PAPER, PAPER_SHADE, LANTERN, RGB, FONT_CN, inkA, paperA, vermA, lanternA } from './palette.js';
import { getPaperTile, getWashTile, setMisregistration, softBlob, makeCanvas } from './ink.js';
import { drawStamp } from './glyphs.js';
import {
  setSpriteScale,
  clearSpriteCache,
  blit,
  heroSprite,
  handLanternSprite,
  heroHand,
  enemySprite,
  enemyDef,
  shadowSprite,
  eliteRingSprite,
  propSprite,
  shrineSprite,
  pickupSprite,
  projSprite,
  ringSprite,
  brushArcSprite,
  inkPoolSprite,
  emberPoolSprite,
  burstSprite,
  baguaArraySprite,
  inkWaveSprite,
  dotSprite,
  scrapSprite,
  isNonDefaultSkin,
  drawHeroWithSkin,
} from './sprites.js';
import { normalizeAttackVfxId } from '../meta/cosmetics.js';
import {
  getVfxPalette,
  vfxRingSprite,
  vfxSlashSprite,
  vfxArraySprite,
  vfxBurstSprite,
  vfxPoolSprite,
  drawThemedProjectileAccent,
} from './vfx-themes.js';
import { createGround } from './ground.js';
import { createFx } from './fx.js';
import { createDamageTexts } from './damage-text.js';
import { createHud } from './hud.js';

const TAU = Math.PI * 2;

// 弹体 kind → 所属武器（用于缺省开光外观推断）
const KIND_WEAPON = {
  gongPulse: 'gong',
  gongWave: 'gong',
  lantern: 'lantern',
  flameRing: 'lantern',
  lanternRing: 'lantern',
  talisman: 'talisman',
  talismanChain: 'talisman',
  talismanArray: 'talisman',
  brushArc: 'brush',
  inkWave: 'brush',
  inkPool: 'brush',
  coinsword: 'coinsword',
  paperman: 'paperman',
  firecracker: 'firecracker',
  explosion: 'firecracker',
  bellChain: 'bell',
  compassField: 'compass',
  soulSweep: 'soulbanner',
  mirrorBeam: 'bronze_mirror',
  paperHorse: 'paperhorse',
  flyingSword: 'taomujian',
  taomujian: 'taomujian',
  peachSword: 'taomujian',
  soulChain: 'suohun_chain',
  suohunChain: 'suohun_chain',
  fireCrow: 'zhinian_kite',
  zhinianKite: 'zhinian_kite',
  nuoDrum: 'nuo_drum',
  nuoBeat: 'nuo_drum',
  nuoDrumWave: 'nuo_drum',
  mourningSweep: 'mourning_staff',
  skyLantern: 'sky_lantern',
  inkLine: 'carpenter_line',
  luopanSlip: 'luopan_slip',
};

const GROUND_KINDS = new Set([
  'inkPool',
  'gongPulse',
  'gongWave',
  'ultPulse',
  'flameRing',
  'lanternRing',
  'talismanArray',
  'compassField',
  'cinderCore',
  'nuoBeat',
  'nuoDrumWave',
  'qimenArray',
  'moltenZone',
  'nuoDanceRing',
  'inkLine',
  'enemyWaveWall',
]);

// 精灵朝右绘制、需要随朝向翻转的敌人
const FLIP_TYPES = new Set([
  'weasel', 'drowned', 'suona', 'archer_ghost', 'shaman',
  'water_lurker', 'paper_raft', 'water_puller',
  'horse', 'umbrella', 'shade', 'youshen', 'hebo_wedding', 'sedan',
]);
const FLOAT_TYPES = new Set([
  'shade', 'lanternghost', 'paperbride', 'shaman', 'sedan', 'drowned',
  'paper_raft', 'umbrella', 'hebo_wedding',
]);
const LANTERN_R = 118; // 基础灯笼光圈半径（CSS px）
const SHRINE_GLYPH = { altar: '香', trial: '碑', peddler: '货' };
const SHRINE_TITLE = { altar: '土地香案', trial: '镇邪试炼碑', peddler: '鬼市货郎' };

function smooth01(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function isTelegraphing(e) {
  if (!e || e.dead) return false;
  if (e.telegraphProgress > 0 && e.telegraphLen > 0) return true;
  if (e.state === 'windup' || e.state === 'telegraph' || e.state === 'aim' || e.windupT > 0) return true;
  if (e.type === 'weasel' && e.state === 'pause') return true;
  return false;
}

function resolveTelegraphDir(e, ex, ey, px, py) {
  if (Number.isFinite(e.dx) && Number.isFinite(e.dy) && Math.hypot(e.dx, e.dy) > 0.1) {
    const l = Math.hypot(e.dx, e.dy);
    return { ux: e.dx / l, uy: e.dy / l };
  }
  if (Number.isFinite(e.telegraphX) && Number.isFinite(e.telegraphY)) {
    const wx = e.telegraphX - ex;
    const wy = e.telegraphY - ey;
    const wl = Math.hypot(wx, wy);
    if (wl > 3) return { ux: wx / wl, uy: wy / wl };
    const ul = Math.hypot(e.telegraphX, e.telegraphY);
    if (ul > 0.1 && ul <= 1.5) return { ux: e.telegraphX / ul, uy: e.telegraphY / ul };
  }
  if (Number.isFinite(e.angle) && e.angle !== 0) {
    return { ux: Math.cos(e.angle), uy: Math.sin(e.angle) };
  }
  const dx = px - ex;
  const dy = py - ey;
  const dl = Math.hypot(dx, dy);
  if (dl > 0.01) return { ux: dx / dl, uy: dy / dl };
  return { ux: 1, uy: 0 };
}

export function createRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let low = !!opts.lowQuality;
  let W = canvas.clientWidth || 390;
  let H = canvas.clientHeight || 844;
  let dpr = 1;
  let clock = 0;
  const cam = { x: 0, y: 0, init: false };
  const interp = new Map();
  let lastRunTime = -1;
  let frameNo = 0;
  let paperPattern = null;
  let washPattern = null;
  let darkCanvas = null;
  let darkCtx = null;
  const DARK_DOWN = 4;
  let groundSeed = null;
  let groundMapId = 'qingshi';
  const drawList = [];
  const pmLast = new Map();

  const ground = createGround(1);
  const fx = createFx({ lowQuality: low });
  const dmg = createDamageTexts();
  const hud = createHud();
  setMisregistration(!low);

  function setupDark() {
    darkCanvas = makeCanvas(Math.ceil(W / DARK_DOWN), Math.ceil(H / DARK_DOWN));
    darkCtx = darkCanvas.getContext('2d');
  }

  function resize(cssW, cssH, d = 1) {
    W = Math.max(1, cssW);
    H = Math.max(1, cssH);
    dpr = Math.max(1, Math.min(2, d || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    setSpriteScale(dpr);
    ground.setScale(low ? 1 : dpr);
    hud.setScale(dpr);
    fx.setViewport(W, H, dpr);
    paperPattern = null;
    washPattern = null;
    setupDark();
  }
  resize(W, H, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

  function setLowQuality(v) {
    if (!!v === low) return;
    low = !!v;
    setMisregistration(!low);
    clearSpriteCache();
    ground.setScale(low ? 1 : dpr);
    fx.setLowQuality(low);
  }

  /** 位置插值：记录上一逻辑步与当前逻辑步（若非步进帧坐标直接跳变则立即对齐） */
  function track(key, x, y, newStep) {
    let s = interp.get(key);
    if (!s) {
      s = { px: x, py: y, x, y, f: frameNo };
      interp.set(key, s);
    } else if (newStep) {
      s.px = s.x;
      s.py = s.y;
      s.x = x;
      s.y = y;
      if (Math.abs(s.x - s.px) + Math.abs(s.y - s.py) > 120) {
        s.px = x;
        s.py = y;
      }
    } else if (s.x !== x || s.y !== y) {
      s.px = x;
      s.py = y;
      s.x = x;
      s.y = y;
    }
    s.f = frameNo;
    return s;
  }

  function consumeEvents(events) {
    if (!events) return;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e || typeof e !== 'object') continue;
      if (e.type === 'hit') dmg.add(e, clock);
      fx.onEvent(e);
    }
  }

  /* -------------------------------------------------------------- */

  function drawPaper(vx, vy) {
    if (!paperPattern) {
      paperPattern = ctx.createPattern(getPaperTile(256), 'repeat');
    }
    ctx.fillStyle = paperPattern;
    ctx.fillRect(vx - 4, vy - 4, W + 8, H + 8);
  }

  function enemyFlip(e, px) {
    if (!FLIP_TYPES.has(e.type)) return 1;
    return px < e.x ? -1 : 1;
  }

  function drawEnemy(e, x, y, px, a, crowded, runRef = null) {
    const d = enemyDef(e.type);
    const s = (e.r || d.r) / d.r;
    const id = e.id || 0;
    const fps = e.boss ? 5 : 7;
    const frame = Math.floor(clock * fps + id * 0.37) % d.frames;
    const flip = enemyFlip(e, px);
    let sx = s * flip;
    let sy = s;
    let rot = 0;
    let oy = 0;
    if (FLOAT_TYPES.has(e.type)) oy = -2 - Math.sin(clock * 3 + id) * 1.6 * s;
    else if (e.type === 'paperkid') oy = -Math.abs(Math.sin(clock * 9 + id)) * 2.2;
    else rot = Math.sin(clock * 7 + id) * 0.05;
    if (e.type === 'paperkid' || e.type === 'lanternghost') rot = Math.sin(clock * 3.2 + id) * 0.07;

    if (e.state === 'windup' || (e.type === 'weasel' && e.state === 'pause')) {
      sx *= 1.15;
      sy *= 0.83;
    } else if (e.state === 'pounce' || e.state === 'charge' || e.state === 'dash' || e.state === 'lunge') {
      sx *= 1.13;
      sy *= 0.93;
      rot = 0.18 * flip;
    }
    // 受击挤压回弹（F11 打击感）
    if (e.hitT > 0) {
      const hk = Math.min(1, e.hitT / 0.12);
      sx *= 1 + hk * 0.14;
      sy *= 1 - hk * 0.11;
      rot += -0.08 * hk * flip;
    }

    const er = e.r || d.r;
    const feetY = y + er * 0.72;
    let alpha = e.mirrorClone ? a * 0.78 : a;
    if (e.submerged) {
      alpha *= 0.38;
      sy *= 0.65;
      oy += 5;
    }
    const sh = shadowSprite(er * 0.95);
    blit(ctx, sh, x, feetY, 1, 1, 0, alpha);

    if (e.submerged) {
      ctx.save();
      ctx.strokeStyle = inkA(0.55);
      ctx.lineWidth = 1.4;
      const rk = (clock * 1.4 + id * 0.2) % 1;
      ctx.beginPath();
      ctx.ellipse(x, feetY, er * (0.9 + rk * 0.9), er * (0.38 + rk * 0.36), 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (e.pullingTarget && Number.isFinite(e.pullTargetX) && Number.isFinite(e.pullTargetY)) {
      ctx.save();
      ctx.strokeStyle = VERM;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.quadraticCurveTo((x + e.pullTargetX) * 0.5, (y + e.pullTargetY) * 0.5 - 16, e.pullTargetX, e.pullTargetY - 10);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }

    if (e.bossWardOf && runRef?.boss && runRef.boss.id === e.bossWardOf) {
      const parentBoss = (runRef.enemies || []).find((b) => !b.dead && b.id === e.bossWardOf);
      if (parentBoss) {
        ctx.save();
        ctx.strokeStyle = VERM;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(parentBoss.x, parentBoss.y - 32);
        ctx.stroke();
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.restore();
      }
    }

    if (e.elite || e.boss || e.warder) {
      blit(ctx, eliteRingSprite(er * (e.warder ? 1.3 : 1.15)), x, feetY, 1, 1, 0, alpha);
      if (e.warder) {
        ctx.strokeStyle = lanternA(0.75 * alpha);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(x, feetY, er * 1.42, er * 0.62, 0, 0, TAU);
        ctx.stroke();
      }
    }

    // 无面伞女与河神夜婚：护盾结界地面法环（始终保持朱砂警示色）
    if (e.type === 'umbrella' || (e.type === 'hebo_wedding' && e.wardShieldActive)) {
      const shielded = e.type === 'umbrella' ? e.state === 'shield' : true;
      ctx.save();
      ctx.strokeStyle = shielded ? VERM : LANTERN;
      ctx.lineWidth = shielded ? 2.8 : 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y - 8, er * (shielded ? 1.55 : 1.25), er * (shielded ? 1.45 : 0.65), 0, 0, TAU);
      ctx.stroke();
      if (shielded) {
        ctx.fillStyle = vermA(0.18);
        ctx.fill();
      }
      ctx.restore();
    }

    if (!crowded) {
      if (e.type === 'drowned') {
        ctx.strokeStyle = inkA(0.22 * alpha);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          const k = (clock * 0.6 + i * 0.5 + id * 0.13) % 1;
          const R = er * (1.4 + k * 2.4);
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.ellipse(x, feetY, R, R * 0.42, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (e.type === 'suona') {
        // 吹鼓鬼增益光环
        const k = (clock * 0.8 + id * 0.2) % 1;
        ctx.strokeStyle = vermA((1 - k) * 0.32 * alpha);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(x, feetY, er * (1.5 + k * 2.8), er * (0.65 + k * 1.2), 0, 0, TAU);
        ctx.stroke();
      }
    }

    if (e.boss && (e.phase === 3 || e.state === 'enraged' || e.state === 'enrage')) {
      const img = softBlob(64, 'verm');
      const R = er * (2.4 + Math.sin(clock * 6) * 0.15);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(img, x - R, feetY - R * 1.6, R * 2, R * 2);
      ctx.globalAlpha = 1;
    }

    // 精英词缀辨识度（F10 5种词缀）
    if (e.affix && !low) {
      if (e.affix === 'mirror_twin') {
        const ghostSpr = enemySprite(e.type, frame, false, e.type === 'umbrella' ? e.state : '');
        blit(ctx, ghostSpr, x - flip * 7, feetY + oy - 2, sx, sy, rot, 0.32 * alpha);
      } else if (e.affix === 'swift_step') {
        ctx.strokeStyle = vermA(0.65);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - flip * (er + 4), y - 4);
        ctx.lineTo(x - flip * (er + 14), y - 4);
        ctx.moveTo(x - flip * (er + 2), y + 3);
        ctx.lineTo(x - flip * (er + 11), y + 3);
        ctx.stroke();
      }
    }

    const flash = e.hitT > 0 || (e.type === 'firecracker_boy' && e.state === 'fuse' && Math.sin(clock * 32 + id) > 0);
    if (e.type === 'firecracker_boy' && e.state === 'fuse') {
      const fR = e.fuseRadius || 74;
      const tot = e.fuseTotal > 0 ? e.fuseTotal : 1;
      const prog = Math.max(0, Math.min(1, 1 - (e.stateT || 0) / tot));
      ctx.save();
      ctx.strokeStyle = vermA(0.36 + 0.48 * prog);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, fR, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = vermA(0.08 + 0.14 * prog);
      ctx.fill();
      ctx.strokeStyle = LANTERN;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(8, fR * (1 - prog * 0.85)), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    const stateVariant = e.type === 'umbrella' ? (e.state === 'shield' ? 'shield' : 'open') : '';
    blit(ctx, enemySprite(e.type, frame, flash, stateVariant), x, feetY + oy, sx, sy, rot, alpha);

    // 纸甲护盾（含精英纸甲词缀与纸钱妖师赋予的纸甲）及阴火、藏宝前景标记
    if ((e.paperArmor || 0) > 0 && (e.affix === 'paper_armor' || !e.affix)) {
      const cnt = Math.min(4, Math.max(1, e.paperArmor || 1));
      for (let i = 0; i < cnt; i++) {
        const a0 = clock * 2.6 + (i / cnt) * TAU;
        const px0 = x + Math.cos(a0) * (er + 5);
        const py0 = y - 6 + Math.sin(a0) * (er * 0.55);
        ctx.fillStyle = PAPER;
        ctx.fillRect(px0 - 2.5, py0 - 4, 5, 8);
        ctx.strokeStyle = VERM;
        ctx.lineWidth = 0.9;
        ctx.strokeRect(px0 - 2.5, py0 - 4, 5, 8);
      }
    }
    if (e.affix) {
      if (e.affix === 'soul_fire') {
        for (let i = 0; i < 2; i++) {
          const a0 = clock * 3.4 + i * Math.PI;
          blit(ctx, pickupSprite('xp', 1), x + Math.cos(a0) * (er + 5), y - 8 + Math.sin(a0) * 5, 0.75, 0.75);
        }
      } else if (e.affix === 'treasure_bearer') {
        blit(ctx, pickupSprite('coin'), x, feetY - d.h * s - 4 + Math.sin(clock * 5) * 2, 0.95, 0.95);
      }
    }

    // 异常状态印记（眩晕「定」、减速墨环、阳炎火印、破甲裂印、流血红痕）
    if (!crowded) {
      const headY = feetY - d.h * s * 0.88;
      if (e.stunT > 0) {
        drawStamp(ctx, '定', x, headY - 6, 9, { seed: 2 });
      } else if (e.yangyanMarkT > 0 || e.burnT > 0) {
        blit(ctx, projSprite('flame'), x, headY - 2, 0.9, 0.9, Math.sin(clock * 14 + id) * 0.2);
      } else if (e.vulnT > 0) {
        ctx.strokeStyle = VERM;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 4, headY - 6);
        ctx.lineTo(x + 4, headY + 2);
        ctx.moveTo(x + 4, headY - 6);
        ctx.lineTo(x - 4, headY + 2);
        ctx.stroke();
      }
      if (e.slowT > 0) {
        ctx.strokeStyle = inkA(0.45);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(x, feetY, er * 1.15, er * 0.45, 0, 0, TAU);
        ctx.stroke();
      }
      if (e.bleedT > 0) {
        blit(ctx, dotSprite(2, 'verm'), x + Math.sin(clock * 8 + id) * 4, y - 6, 1, 1, 0, 0.85);
      }
    }

    // 追斩纸元宝奇遇目标：琥珀朱砂宝气环与头顶「宝」字方印
    if (e.eventIngot) {
      const pulse = 0.85 + 0.15 * Math.sin(clock * 8);
      ctx.save();
      ctx.strokeStyle = LANTERN;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(x, feetY, er * 1.45 * pulse, er * 0.68 * pulse, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      blit(ctx, pickupSprite('coin'), x - 11, feetY - d.h * s - 6 + Math.sin(clock * 6) * 2, 0.9, 0.9);
      blit(ctx, pickupSprite('coin'), x + 11, feetY - d.h * s - 6 - Math.sin(clock * 6) * 2, 0.9, 0.9);
      drawStamp(ctx, '宝', x, feetY - d.h * s - 10, 10, { color: VERM, seed: 8 });
    }

    // 小头目名牌（巡街轿头 / 冥婚喜娘）
    if (e.warder && e.warderName) {
      const ty = feetY - d.h * s - 10;
      ctx.font = `10px ${FONT_CN}`;
      const tw = ctx.measureText(e.warderName).width + 8;
      ctx.fillStyle = VERM;
      ctx.fillRect(x - tw / 2, ty - 7, tw, 14);
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x - tw / 2 + 1, ty - 6, tw - 2, 12);
      ctx.fillStyle = PAPER;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.warderName, x, ty);
    }
  }

  function drawShrine(s, pxI, pyI, nearbyId) {
    const used = !!s.used;
    const active = !!s.active;
    const near = !used && !active && (nearbyId === s.id || Math.hypot(s.x - pxI, s.y - pyI) <= 78);

    blit(ctx, shadowSprite(24), s.x, s.y + 3, 1, 1, 0, 0.85);

    // 地面法坛石圈 / 试炼倒计时环
    if (!used || active) {
      const pulse = 0.7 + 0.3 * Math.sin(clock * (active ? 7 : 3.2));
      ctx.save();
      ctx.strokeStyle = active ? VERM : near ? LANTERN : vermA(0.55 * pulse);
      ctx.lineWidth = active || near ? 2.4 : 1.5;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 32, 15, 0, 0, TAU);
      ctx.stroke();
      if (active && s.maxTimer > 0) {
        const frac = Math.max(0, Math.min(1, s.timer / s.maxTimer));
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 36, 17, 0, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.stroke();
      }
      ctx.restore();
    }

    blit(ctx, shrineSprite(s.kind, used, active), s.x, s.y);

    if (near || active) {
      const label = active ? `镇邪试炼 · ${Math.ceil(s.timer || 0)}` : SHRINE_TITLE[s.kind] || '奇遇';
      const ly = s.y - 68 + Math.sin(clock * 4) * 2;
      ctx.font = `11px ${FONT_CN}`;
      const lw = ctx.measureText(label).width + 12;
      ctx.fillStyle = PAPER;
      ctx.fillRect(s.x - lw / 2, ly - 8, lw, 16);
      ctx.strokeStyle = VERM;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(s.x - lw / 2, ly - 8, lw, 16);
      ctx.fillStyle = VERM;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, s.x, ly + 0.5);
    }
  }

  function drawPlayer(p, x, y, run, a, cosmetics, evoCount) {
    const heroId = p.heroId || run.heroId || 'zhou';
    const moving = !!p.moving;
    const frame = moving ? Math.floor(clock * 10) % 4 : 0;
    const flip = (p.facingX ?? 1) < 0 ? -1 : 1;
    const feetY = y + (p.r || 12) * 0.72;
    const bob = moving ? -Math.abs(Math.sin(clock * 10 * Math.PI * 0.5)) * 1.4 : Math.sin(clock * 2) * 0.4;
    let alpha = a;
    if (p.invulnT > 0) alpha *= 0.55 + 0.45 * (Math.sin(clock * 30) > 0 ? 1 : 0.3);
    if (run.status === 'dead') alpha *= 0.5;

    // 开光常驻脚底朱砂八卦法环（T1-F11-02）
    if (evoCount > 0) {
      const pulse = 0.94 + 0.06 * Math.sin(clock * 4.2);
      ctx.save();
      const grd = ctx.createRadialGradient(x, y + 2, 10, x, y + 2, 46);
      grd.addColorStop(0, lanternA(0.28 * alpha));
      grd.addColorStop(0.68, vermA(0.24 * alpha));
      grd.addColorStop(1, vermA(0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y + 2, 46, 0, TAU);
      ctx.fill();
      ctx.restore();

      const auraSpr = baguaArraySprite('awakened');
      const scaleK = (0.88 + Math.min(3, evoCount - 1) * 0.06) * pulse;
      blit(ctx, auraSpr, x, y + 2, scaleK, scaleK * 0.92, clock * 0.85, 0.92 * alpha);
      if (evoCount >= 2) {
        blit(ctx, ringSprite('vthin', 1), x, y + 2, 0.28 * pulse, 0.26 * pulse, -clock * 1.3, 0.75 * alpha);
      }
    }

    const rawSkin = p.skinId || cosmetics?.heroSkins?.[heroId] || null;
    const lean = moving ? 0.05 * flip : 0;
    const swing = Math.sin(clock * 3.1) * 0.12 + (moving ? -0.32 * flip : 0) + Math.sin(clock * 10) * (moving ? 0.06 : 0);

    if (isNonDefaultSkin(heroId, rawSkin)) {
      blit(ctx, shadowSprite(11), x, feetY, 1, 1, 0, alpha);
      const lanPos = drawHeroWithSkin(ctx, {
        heroId,
        skinId: rawSkin,
        x,
        y: feetY + bob,
        frame,
        flip,
        lean,
        swing,
        scale: 1,
        flash: p.hurtT > 0,
        alpha,
        auraRot: clock,
        showAura: true,
        legacyOutfit: cosmetics?.outfit || null,
        legacyLantern: cosmetics?.lantern || null,
      });
      const barrier = p.soulBarrier || 0;
      if (barrier > 0) {
        for (let i = 0; i < barrier; i++) {
          const ba = clock * 2.8 + (i / barrier) * TAU;
          blit(ctx, projSprite('talismanEvo'), x + Math.cos(ba) * 20, y - 6 + Math.sin(ba) * 11, 0.65, 0.65, ba + Math.PI / 2, 0.88 * alpha);
        }
      }
      return lanPos;
    }

    blit(ctx, shadowSprite(10), x, feetY, 1, 1, 0, alpha);
    const spr = heroSprite(heroId, frame, p.hurtT > 0, cosmetics?.outfit || null);
    blit(ctx, spr, x, feetY + bob, flip, 1, lean, alpha);

    // 无常勾魂幡：护体魂障环绕符纸
    const barrier = p.soulBarrier || 0;
    if (barrier > 0) {
      for (let i = 0; i < barrier; i++) {
        const ba = clock * 2.8 + (i / barrier) * TAU;
        blit(ctx, projSprite('talismanEvo'), x + Math.cos(ba) * 20, y - 6 + Math.sin(ba) * 11, 0.65, 0.65, ba + Math.PI / 2, 0.88 * alpha);
      }
    }

    // 手提灯笼：以手为轴摆动
    const hand = heroHand();
    const hx = x + hand.x * flip;
    const hy = feetY + bob + hand.y;
    blit(ctx, handLanternSprite(cosmetics?.lantern || null), hx, hy, 1, 1, swing, alpha);
    return { lx: hx - Math.sin(swing) * 7, ly: hy + Math.cos(swing) * 7 };
  }

  function drawPickup(k, x, y) {
    const id = k.id || 0;
    if (k.kind === 'xp') {
      const tier = k.tier || 1;
      const by = y - 2 - Math.sin(clock * 4 + id) * 1.6;
      blit(ctx, shadowSprite(3 + tier), x, y + 3, 1, 1, 0, 0.7);
      const fl = 1 + Math.sin(clock * 13 + id * 1.7) * 0.07;
      blit(ctx, pickupSprite('xp', tier), x, by, 2 - fl, fl, Math.sin(clock * 5 + id) * 0.06);
    } else if (k.kind === 'banner') {
      blit(ctx, shadowSprite(7), x, y + 2);
      blit(ctx, pickupSprite('banner'), x, y + 2, 1, 1, Math.sin(clock * 2.4 + id) * 0.06);
    } else if (k.kind === 'chest') {
      blit(ctx, shadowSprite(11), x, y + 3);
      const hop = Math.max(0, Math.sin(clock * 3 + id)) * 2;
      blit(ctx, pickupSprite('chest'), x, y + 3 - hop);
    } else if (k.kind === 'coin') {
      blit(ctx, shadowSprite(5), x, y + 5, 1, 1, 0, 0.7);
      const spin = Math.cos(clock * 4 + id);
      blit(ctx, pickupSprite('coin'), x, y - 1, Math.max(0.25, Math.abs(spin)), 1);
    } else {
      blit(ctx, shadowSprite(8), x, y + 3);
      blit(ctx, pickupSprite(k.kind), x, y + 2);
    }
  }

  function drawLightningPath(pts, off, seed, jitterAmp = 10) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x + off, pts[0].y + off);
    for (let i = 1; i < pts.length; i++) {
      const a0 = pts[i - 1];
      const b0 = pts[i];
      const nx = -(b0.y - a0.y);
      const ny = b0.x - a0.x;
      const l = Math.hypot(nx, ny) || 1;
      for (let s = 1; s <= 3; s++) {
        const tt = s / 4;
        const j = ((((seed * 131 + i * 17 + s * 7) % 23) / 23) - 0.5) * jitterAmp;
        ctx.lineTo(a0.x + (b0.x - a0.x) * tt + (nx / l) * j + off, a0.y + (b0.y - a0.y) * tt + (ny / l) * j + off);
      }
      ctx.lineTo(b0.x + off, b0.y + off);
    }
  }

  function drawThemedPlayerProjectile(p, themeId, k, id, evolved, playerPos) {
    const pal = getVfxPalette(themeId);
    switch (p.kind) {
      case 'gongPulse':
      case 'gongWave':
      case 'ultPulse':
      case 'nuoBeat':
      case 'nuoDrumWave': {
        const maxR = Math.max(10, p.maxRadius || p.radius || p.r || 80);
        const r = Math.max(8, p.radius > 0 ? p.radius : maxR * Math.max(0.2, k));
        const a = Math.max(0, Math.pow(1 - k, 0.95) * 0.95);
        blit(ctx, vfxRingSprite(themeId, id % 3), p.x, p.y, r / 100, (r / 100) * 0.94, id * 0.55, a);
        if (evolved || p.kind === 'ultPulse') {
          const innerRot = themeId === 'jade_ghostfire' ? id * 0.55 : -clock * 0.9;
          const innerVar = themeId === 'jade_ghostfire' ? id % 3 : (id + 1) % 3;
          blit(ctx, vfxRingSprite(themeId, innerVar), p.x, p.y, (r * 0.62) / 100, (r * 0.62 * 0.94) / 100, innerRot, a * 0.78);
        }
        return true;
      }
      case 'brushArc':
      case 'soulSweep': {
        const R = p.radius || (p.kind === 'soulSweep' ? 115 : 70);
        const spread = p.kind === 'soulSweep'
          ? Math.min(TAU * 0.94, p.spread ?? p.arc ?? 2.1)
          : (p.spread || Math.PI / 2);
        const spr = vfxSlashSprite(themeId, R, spread, evolved || p.kind === 'soulSweep');
        const sc = R / Math.max(30, Math.round(R / 8) * 8);
        const a = k < 0.18 ? 1 : 1 - Math.pow((k - 0.18) / 0.82, 1.9);
        blit(ctx, spr, p.x, p.y, sc * (0.95 + 0.05 * k), sc * (0.95 + 0.05 * k) * (p.reverse ? -1 : 1), p.angle || 0, a);
        return true;
      }
      case 'talismanArray':
      case 'compassField':
      case 'qimenArray': {
        const R = Math.max(12, p.radius || 88);
        const a = Math.min(1, (p.t + 0.03) / 0.14) * (k > 0.82 ? (1 - k) / 0.18 : 1);
        blit(ctx, vfxArraySprite(themeId, p.kind), p.x, p.y, R / 100, R / 100, clock * 0.95 + id * 0.3, a * 0.95);
        if (p.kind !== 'talismanArray') {
          blit(ctx, projSprite('compass'), p.x, p.y, evolved ? 1.1 : 0.92, evolved ? 1.1 : 0.92, -clock * 1.4, a);
        }
        return true;
      }
      case 'inkPool':
      case 'moltenZone': {
        const r = Math.max(6, p.radius || p.r || 42);
        const a = Math.min(1, (p.t + 0.04) / 0.15) * (k > 0.75 ? (1 - k) / 0.25 : 1);
        blit(ctx, vfxPoolSprite(themeId, id), p.x, p.y, r / 50, r / 50, (id % 4) * 0.7, a);
        return true;
      }
      case 'explosion': {
        const r = p.radius || p.r || 50;
        const e = 1 - (1 - k) * (1 - k);
        const fa = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
        blit(ctx, vfxBurstSprite(themeId, id), p.x, p.y, (r / 50) * (0.58 + 0.48 * e), (r / 50) * (0.58 + 0.48 * e) * 0.9, id, fa);
        blit(ctx, vfxRingSprite(themeId, id % 3), p.x, p.y, (r * (0.8 + 0.4 * e)) / 100, (r * (0.8 + 0.4 * e) * 0.9) / 100, 0, (1 - k) * 0.7);
        return true;
      }
      case 'talismanChain':
      case 'bellChain': {
        const pts = p.points || (p.x1 != null ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }] : []);
        if (pts.length < 2) return true;
        const a = 1 - k;
        const seed = Math.floor(clock * 28) + id;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = pal.deep;
        ctx.lineWidth = 4.6;
        drawLightningPath(pts, 0, seed, 14);
        ctx.stroke();
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 2.8;
        drawLightningPath(pts, 0, seed, 14);
        ctx.stroke();
        ctx.strokeStyle = pal.bright;
        ctx.lineWidth = 1.4;
        drawLightningPath(pts, low ? 0 : 0.7, seed + 3, 9);
        ctx.stroke();
        ctx.restore();
        if (p.kind === 'bellChain') {
          const bell = projSprite('bell');
          const step = pts.length > 10 ? Math.ceil(pts.length / 10) : 1;
          for (let i = 0; i < pts.length; i += step) {
            blit(ctx, bell, pts[i].x, pts[i].y - 4, 1, 1, Math.sin(clock * 20 + pts[i].x) * 0.3, a);
          }
        }
        return true;
      }
      case 'thunderBolt': {
        const R = p.radius || 56;
        const a = 1 - k;
        blit(ctx, vfxRingSprite(themeId, id % 3), p.x, p.y, R / 100, (R / 100) * 0.74, id, a * 0.92);
        const boltPts = [
          { x: p.x + ((id % 5) - 2) * 8, y: p.y - 230 },
          { x: p.x - 10, y: p.y - 140 },
          { x: p.x + 9, y: p.y - 68 },
          { x: p.x, y: p.y },
        ];
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pal.deep;
        ctx.lineWidth = 7 * (1 - k * 0.4);
        drawLightningPath(boltPts, 0, id + 11, 12);
        ctx.stroke();
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 4 * (1 - k * 0.3);
        drawLightningPath(boltPts, 0, id + 11, 8);
        ctx.stroke();
        ctx.strokeStyle = pal.bright;
        ctx.lineWidth = 1.8;
        drawLightningPath(boltPts, 0, id + 11, 4);
        ctx.stroke();
        ctx.restore();
        return true;
      }
      case 'mirrorBeam': {
        const len = p.length || p.radius || 220;
        const ang = p.angle || 0;
        const x0 = p.x;
        const y0 = p.y;
        const x1 = Number.isFinite(p.endX) ? p.endX : x0 + Math.cos(ang) * len;
        const y1 = Number.isFinite(p.endY) ? p.endY : y0 + Math.sin(ang) * len;
        const w = p.width || (evolved ? 30 : 18);
        const fade = Math.min(1, (p.t + 0.03) / 0.08) * (k > 0.86 ? (1 - k) / 0.14 : 1);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round';
        ctx.strokeStyle = pal.glowRgba(0.45);
        ctx.lineWidth = w * 1.25;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = w * 0.62;
        ctx.stroke();
        ctx.strokeStyle = pal.bright;
        ctx.lineWidth = Math.max(2, w * 0.25);
        ctx.stroke();
        ctx.restore();
        blit(ctx, projSprite('bronzeMirror'), x0 + Math.cos(ang) * 14, y0 + Math.sin(ang) * 14, evolved ? 1.15 : 1, evolved ? 1.15 : 1, ang, fade);
        return true;
      }
      case 'soulChain':
      case 'suohunChain': {
        const x0 = Number.isFinite(p.fromX) ? p.fromX : playerPos.x;
        const y0 = Number.isFinite(p.fromY) ? p.fromY : playerPos.y;
        const x1 = Number.isFinite(p.endX) ? p.endX : p.x;
        const y1 = Number.isFinite(p.endY) ? p.endY : p.y;
        const ang = p.angle ?? Math.atan2(y1 - y0, x1 - x0);
        const fade = Math.max(0, 1 - k * 0.75);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round';
        ctx.strokeStyle = pal.deep;
        ctx.lineWidth = evolved ? 6.2 : 4.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();
        blit(ctx, projSprite(evolved ? 'soulHookEvo' : 'soulHook'), x1, y1, evolved ? 1.15 : 1, evolved ? 1.15 : 1, ang, fade);
        return true;
      }
      case 'flameRing':
      case 'lanternRing':
      case 'nuoDanceRing': {
        const R = Math.max(16, p.radius || 68);
        const cx = p.x ?? playerPos.x;
        const cy = p.y ?? playerPos.y;
        ctx.save();
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.stroke();
        const cnt = p.kind === 'nuoDanceRing' ? 4 : Math.max(8, Math.round((TAU * R) / (low ? 28 : 18)));
        for (let i = 0; i < cnt; i++) {
          const a = clock * 1.4 + (i / cnt) * TAU;
          ctx.fillStyle = i % 2 === 0 ? pal.bright : pal.primary;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 4.2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        return true;
      }
      default:
        // 其余飞行我方弹体（符箓、飞剑、铜钱剑、纸鸢火鸦、纸马、泼墨气刃等）：叠加专属矿物尾迹灵光后继续绘制本体
        drawThemedProjectileAccent(ctx, themeId, p, evolved, clock, low);
        return false;
    }
  }

  function drawProjectile(p, evo, run, playerPos, settingsCosmetics = null) {
    const k = p.life > 0 ? Math.max(0, Math.min(1, p.t / p.life)) : 0;
    const id = p.id || 0;
    const evolved = p.evolved !== undefined ? !!p.evolved : evo.has(p.weaponId || KIND_WEAPON[p.kind]);

    // 安全铁律：敌方弹幕（enemyBullet）与烬鬼自爆核（cinderCore）严守 #C23B26 朱砂红，绝不套用玩家攻击特效！
    if (p.kind !== 'enemyBullet' && p.kind !== 'cinderCore') {
      const rawTheme = p.attackVfx
        || (p.ownerSlot != null && run.players?.[p.ownerSlot]?.attackVfx)
        || run.player?.attackVfx
        || settingsCosmetics?.attackVfx
        || 'default';
      const themeId = normalizeAttackVfxId(rawTheme);
      if (themeId !== 'default' && drawThemedPlayerProjectile(p, themeId, k, id, evolved, playerPos)) {
        return;
      }
    }

    switch (p.kind) {
      case 'gongPulse':
      case 'gongWave': {
        const maxR = p.maxRadius || p.r || 80;
        const r = p.radius > 0 ? p.radius : maxR * Math.max(0.18, k);
        const a = Math.pow(1 - k, 1.05) * 0.92;
        const isThird = (p.waveIdx || 1) >= 3;
        blit(ctx, ringSprite(evolved || isThird ? 'verm' : 'ink', id % 3), p.x, p.y, r / 100, (r / 100) * 0.92, id * 0.7, a);
        if (evolved) {
          blit(ctx, ringSprite('thin', (id + 1) % 3), p.x, p.y, (r * 0.8) / 100, (r * 0.8 * 0.92) / 100, -clock, a * 0.8);
          if (isThird) {
            ctx.strokeStyle = lanternA(a * 0.85);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 0.94, 0, TAU);
            ctx.stroke();
          }
        }
        break;
      }
      case 'ultPulse': {
        const maxR = p.maxRadius || p.r || 180;
        const r = p.radius > 0 ? p.radius : maxR * Math.max(0.2, k);
        const a = 1 - k * k;
        blit(ctx, ringSprite('ult', id % 3), p.x, p.y, r / 100, (r / 100) * 0.92, clock * 0.5, a);
        blit(ctx, ringSprite('verm', (id + 1) % 3), p.x, p.y, (r * 0.68) / 100, (r * 0.68 * 0.92) / 100, -clock * 0.8, a * 0.75);
        break;
      }
      case 'inkPool':
      case 'moltenZone': {
        const r = Math.max(4, p.radius || p.r || 42);
        const a = Math.min(1, (p.t + 0.04) / 0.15) * (k > 0.75 ? (1 - k) / 0.25 : 1);
        if (p.subKind === 'emberZone' || p.subKind === 'moltenZone' || p.kind === 'moltenZone') {
          blit(ctx, emberPoolSprite(id), p.x, p.y, r / 50, r / 50, (id % 4) * 0.8, a);
          if (p.subKind === 'moltenZone' && !low) {
            ctx.strokeStyle = lanternA(0.45 * a);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 0.62, 0, TAU);
            ctx.stroke();
          }
        } else {
          blit(ctx, inkPoolSprite(id), p.x, p.y, r / 50, r / 50, 0, a);
          if (p.subKind === 'inkRiver' && !low) {
            ctx.strokeStyle = paperA(0.32 * a);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 0.52, clock, clock + 2.2);
            ctx.stroke();
          }
        }
        break;
      }
      case 'talismanArray': {
        const R = p.radius || 95;
        const a = Math.min(1, (p.t + 0.03) / 0.14) * (k > 0.82 ? (1 - k) / 0.18 : 1);
        blit(ctx, baguaArraySprite('talisman'), p.x, p.y, R / 100, R / 100, clock * 0.9 + id * 0.3, a * 0.92);
        if (!low) {
          blit(ctx, ringSprite('vthin', id % 3), p.x, p.y, (R * 0.52) / 100, (R * 0.52) / 100, -clock * 1.6, a * 0.75);
        }
        break;
      }
      case 'compassField':
      case 'qimenArray': {
        const R = Math.max(8, p.radius || 85);
        const a = Math.min(1, (p.t + 0.03) / 0.15) * (k > 0.82 ? (1 - k) / 0.18 : 1);
        const dir = clock * (evolved ? 1.6 : 1.0);
        blit(ctx, baguaArraySprite(evolved ? 'compassEvo' : 'compass'), p.x, p.y, R / 100, R / 100, dir, a * 0.9);
        blit(ctx, projSprite('compass'), p.x, p.y, evolved ? 1.15 : 0.95, evolved ? 1.15 : 0.95, -dir * 1.5, a);
        break;
      }
      case 'cinderCore': {
        const R = p.radius || 68;
        const pulse = 1 + Math.sin(clock * 28 + id) * 0.18;
        ctx.save();
        ctx.strokeStyle = vermA(0.32 + 0.45 * k);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = vermA(0.08 + 0.14 * k);
        ctx.fill();
        // 向内收束的引爆倒计时红环
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(8, R * (1 - k * 0.86)), 0, TAU);
        ctx.stroke();
        ctx.restore();
        blit(ctx, projSprite('cinderCore'), p.x, p.y, pulse, pulse, clock * 6 + id);
        break;
      }
      case 'flameRing':
      case 'lanternRing': {
        const R = p.radius || 75;
        const cx = p.x ?? playerPos.x;
        const cy = p.y ?? playerPos.y;
        ctx.strokeStyle = vermA(0.38);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, R, 0, 0, TAU);
        ctx.stroke();
        const n = Math.max(10, Math.round((TAU * R) / (low ? 24 : 16)));
        const spr = projSprite('flame');
        const rotBase = clock * 0.9;
        for (let i = 0; i < n; i++) {
          const a = rotBase + (i / n) * TAU;
          const fl = 0.85 + 0.3 * Math.sin(clock * 12 + i * 1.9);
          blit(ctx, spr, cx + Math.cos(a) * R, cy + Math.sin(a) * R, fl * 0.9, fl, a + Math.PI / 2);
        }
        // 长明灯：逆向旋转内层双火莲环
        if (p.dualLotus || p.innerRadius > 0) {
          const ir = p.innerRadius || R * 0.56;
          ctx.strokeStyle = lanternA(0.5);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(cx, cy, ir, 0, TAU);
          ctx.stroke();
          const inCount = Math.max(6, Math.round(n * 0.55));
          for (let i = 0; i < inCount; i++) {
            const a = -rotBase * 1.35 + (i / inCount) * TAU;
            blit(ctx, spr, cx + Math.cos(a) * ir, cy + Math.sin(a) * ir, 0.72, 0.78, a - Math.PI / 2, 0.9);
          }
        }
        break;
      }
      case 'lantern': {
        const fl = 1 + Math.sin(clock * 14 + id) * 0.07;
        blit(ctx, shadowSprite(5), p.x, p.y + 12, 1, 1, 0, 0.6);
        blit(ctx, projSprite(evolved ? 'lanternEvo' : 'lantern'), p.x, p.y, fl, fl, Math.sin(clock * 4 + id) * 0.15);
        break;
      }
      case 'talisman': {
        const a = Math.atan2(p.vy || 0, p.vx || 1) + Math.PI / 2;
        const flutter = 0.75 + 0.25 * Math.cos(clock * 16 + id);
        if (!low) {
          ctx.fillStyle = evolved ? lanternA(0.65) : inkA(0.25);
          const bx = p.x + Math.sin(a) * 10;
          const by = p.y - Math.cos(a) * 10;
          ctx.beginPath();
          ctx.arc(bx, by, evolved ? 1.8 : 1.2, 0, TAU);
          ctx.fill();
        }
        blit(ctx, projSprite(evolved ? 'talismanEvo' : 'talisman'), p.x, p.y, flutter, 1, a);
        break;
      }
      case 'talismanChain': {
        // 天师符阵雷电链（朱砂金雷折线 + 符印星火，绝不绘制铜铃！）
        const pts = p.points || (p.x1 != null ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }] : []);
        if (pts.length < 2) break;
        const a = 1 - k;
        const seed = Math.floor(clock * 30) + id;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = VERM;
        ctx.lineWidth = 3.4;
        drawLightningPath(pts, 0, seed, 14);
        ctx.stroke();
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = 1.8;
        drawLightningPath(pts, low ? 0 : 0.8, seed + 3, 10);
        ctx.stroke();
        ctx.fillStyle = PAPER;
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          ctx.beginPath();
          ctx.arc(q.x, q.y, 3.2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'brushArc': {
        const R = p.radius || 70;
        const spread = p.spread || Math.PI / 2;
        const spr = brushArcSprite(R, spread, evolved);
        const sc = R / Math.max(30, Math.round(R / 8) * 8);
        const a = k < 0.15 ? 1 : 1 - Math.pow((k - 0.15) / 0.85, 2);
        ctx.save();
        if (k < 0.3) {
          const sweep = Math.max(0.05, k / 0.3);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.arc(p.x, p.y, R * 1.5, (p.angle || 0) - spread / 2 - 0.3, (p.angle || 0) - spread / 2 + (spread + 0.6) * sweep);
          ctx.closePath();
          ctx.clip();
        }
        blit(ctx, spr, p.x, p.y, sc * (0.94 + 0.06 * k), sc * (0.94 + 0.06 * k), p.angle || 0, a);
        ctx.restore();
        break;
      }
      case 'inkWave': {
        const R = p.radius || p.hitR || 26;
        const ang = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1);
        const a = k > 0.82 ? (1 - k) / 0.18 : 1;
        const sc = R / 26;
        if (!low) {
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          ctx.strokeStyle = vermA(0.45 * a);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - ux * 22, p.y - uy * 22);
          ctx.lineTo(p.x - ux * 4, p.y - uy * 4);
          ctx.stroke();
        }
        blit(ctx, inkWaveSprite(evolved), p.x, p.y, sc, sc, ang, a);
        break;
      }
      case 'coinsword': {
        const a = Number.isFinite(p.angle) ? p.angle : p.returning ? clock * 16 + id : Math.atan2(p.vy || 0, p.vx || 1);
        if (evolved && !low) {
          const vx = p.vx || Math.cos(a) * 120;
          const vy = p.vy || Math.sin(a) * 120;
          const l = Math.hypot(vx, vy) || 1;
          ctx.strokeStyle = vermA(0.55);
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (vx / l) * 22, p.y - (vy / l) * 22);
          ctx.stroke();
          ctx.fillStyle = LANTERN;
          ctx.beginPath();
          ctx.arc(p.x - (vx / l) * 10, p.y - (vy / l) * 10, 2, 0, TAU);
          ctx.fill();
        }
        blit(ctx, shadowSprite(6), p.x, p.y + 10, 1, 1, 0, 0.4);
        blit(ctx, projSprite(evolved ? 'coinswordEvo' : 'coinsword'), p.x, p.y, 1, 1, a);
        break;
      }
      case 'paperman': {
        const last = pmLast.get(id);
        let flip = last ? last.flip : 1;
        if (last && Math.abs(p.x - last.x) > 0.3) flip = p.x < last.x ? -1 : 1;
        pmLast.set(id, { x: p.x, flip, f: frameNo });
        const fr = Math.floor(clock * 10 + id) % 2;
        const role = p.role || 'seeker';
        const fade = p.persistent === false && k > 0.85 ? (1 - k) / 0.15 : 1;
        let sprName = (evolved ? 'papermanEvo' : 'paperman') + fr;
        if (role === 'guard') sprName = 'papermanGuard' + fr;
        else if (role === 'cavalry') sprName = 'papermanCavalry' + fr;
        else if (role === 'imp') sprName = 'papermanImp' + fr;

        if (role === 'cavalry' && p.mode === 'charge' && !low) {
          ctx.strokeStyle = vermA(0.6);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - flip * 18, p.y - 4);
          ctx.lineTo(p.x - flip * 4, p.y - 4);
          ctx.stroke();
        }
        blit(ctx, shadowSprite(role === 'cavalry' ? 9 : 6), p.x, p.y + 8, 1, 1, 0, 0.8 * fade);
        blit(ctx, projSprite(sprName), p.x, p.y + 8, flip, 1, Math.sin(clock * 12 + id) * 0.08, fade);
        break;
      }
      case 'firecracker': {
        const fx0 = p.fromX ?? p.x;
        const fy0 = p.fromY ?? p.y;
        const tx = p.toX ?? p.x;
        const ty = p.toY ?? p.y;
        const gx = fx0 + (tx - fx0) * k;
        const gy = fy0 + (ty - fy0) * k;
        const h = Math.sin(Math.PI * k) * 70;
        const tr = (p.radius || 55) / 100;
        blit(ctx, shadowSprite(4), gx, gy + 4, 1 - h / 160, 1 - h / 160, 0, 0.7);
        blit(ctx, ringSprite('vthin', id % 3), tx, ty, tr, tr * 0.5, 0, 0.35 + 0.45 * k);
        const rot = clock * 12 + id;
        blit(ctx, projSprite('firecracker'), gx, gy - h, evolved ? 1.2 : 1, evolved ? 1.2 : 1, rot);
        if (evolved) {
          blit(ctx, projSprite('firecracker'), gx - 5, gy - h + 3, 0.9, 0.9, rot + 1.2);
          blit(ctx, projSprite('firecracker'), gx + 5, gy - h + 3, 0.9, 0.9, rot - 1.2);
        }
        break;
      }
      case 'explosion': {
        const r = p.radius || p.r || 50;
        const e = 1 - (1 - k) * (1 - k);
        const fa = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
        blit(ctx, burstSprite(id), p.x, p.y, (r / 50) * (0.55 + 0.5 * e), (r / 50) * (0.55 + 0.5 * e) * 0.88, id, fa);
        blit(ctx, ringSprite(evolved ? 'verm' : 'thin', id % 3), p.x, p.y, (r * (0.82 + 0.42 * e)) / 100, (r * (0.82 + 0.42 * e) * 0.88) / 100, 0, (1 - k) * 0.65);
        if (evolved || p.subKind === 'firecrackerLotus' || p.subKind === 'solarFlare' || p.subKind === 'starCleave') {
          ctx.fillStyle = lanternA((1 - k) * 0.65);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.34 * (1 - k * 0.4), 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'bellChain': {
        const pts = p.points || [];
        if (pts.length < 2) break;
        const a = 1 - k;
        const seed = Math.floor(clock * 24) + id;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = evolved ? VERM : INK;
        ctx.lineWidth = p.subKind === 'soulEcho' ? 3 : 2.2;
        drawLightningPath(pts, 0, seed, 11);
        ctx.stroke();
        ctx.strokeStyle = p.subKind === 'soulEcho' ? LANTERN : evolved ? INK : VERM;
        ctx.lineWidth = 1.1;
        drawLightningPath(pts, low ? 0 : 1, seed + 5, 9);
        ctx.stroke();
        ctx.restore();
        const bell = projSprite('bell');
        const step = pts.length > 10 ? Math.ceil(pts.length / 10) : 1;
        for (let i = 0; i < pts.length; i += step) {
          const q = pts[i];
          blit(ctx, bell, q.x, q.y - 4, 1, 1, Math.sin(clock * 20 + q.x) * 0.3, a);
        }
        if (p.subKind === 'soulEcho') {
          const end = pts[pts.length - 1];
          blit(ctx, ringSprite('verm', id % 3), end.x, end.y, (0.25 + 0.35 * k), (0.25 + 0.35 * k), 0, a * 0.8);
        }
        break;
      }
      case 'soulSweep': {
        // 招魂幡 / 无常勾魂幡：浓墨朱砂扇弧横扫
        const R = p.radius || 115;
        const spread = Math.min(TAU * 0.94, p.spread ?? p.arc ?? 2.1);
        const ang = p.angle || 0;
        const a = k < 0.2 ? 1 : 1 - Math.pow((k - 0.2) / 0.8, 1.8);
        const spr = brushArcSprite(R, spread, true);
        const sc = R / Math.max(30, Math.round(R / 8) * 8);
        blit(ctx, spr, p.x, p.y, sc, sc * (p.reverse ? -1 : 1), ang, a * 0.92);
        ctx.save();
        ctx.strokeStyle = evolved ? LANTERN : VERM;
        ctx.lineWidth = evolved ? 3.2 : 2.2;
        ctx.globalAlpha = a * 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 0.95, ang - spread * 0.46, ang + spread * 0.46);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'mirrorBeam': {
        // 照妖铜镜 / 乾坤赤阳镜：横扫赤阳神光柱
        const len = p.length || p.radius || 220;
        const ang = p.angle || 0;
        const x0 = p.x;
        const y0 = p.y;
        const x1 = Number.isFinite(p.endX) ? p.endX : x0 + Math.cos(ang) * len;
        const y1 = Number.isFinite(p.endY) ? p.endY : y0 + Math.sin(ang) * len;
        const w = p.width || (evolved ? 30 : 18);
        const fade = Math.min(1, (p.t + 0.03) / 0.08) * (k > 0.86 ? (1 - k) / 0.14 : 1);
        const pulse = 0.9 + 0.1 * Math.sin(clock * 32 + id);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round';
        ctx.strokeStyle = vermA(evolved ? 0.46 : 0.3);
        ctx.lineWidth = w * 1.25 * pulse;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = w * 0.62 * pulse;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = Math.max(2, w * 0.24);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        // 光束末端耀斑
        ctx.fillStyle = LANTERN;
        ctx.beginPath();
        ctx.arc(x1, y1, w * 0.42 * pulse, 0, TAU);
        ctx.fill();
        ctx.restore();
        blit(ctx, projSprite('bronzeMirror'), x0 + Math.cos(ang) * 14, y0 + Math.sin(ang) * 14, evolved ? 1.15 : 1, evolved ? 1.15 : 1, ang, fade);
        break;
      }
      case 'paperHorse': {
        // 纸马镖 / 百鬼夜行铁骑
        const ang = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1);
        const flipY = Math.cos(ang) < 0 ? -1 : 1;
        const isEvo = evolved || !!p.trampleBullets || !!p.ult;
        const gallop = Math.sin(clock * 22 + id) * 1.8;
        if (!low) {
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          ctx.strokeStyle = isEvo ? lanternA(0.65) : vermA(0.45);
          ctx.lineWidth = isEvo ? 2.6 : 1.8;
          ctx.beginPath();
          ctx.moveTo(p.x - ux * 26, p.y - uy * 26);
          ctx.lineTo(p.x - ux * 6, p.y - uy * 6);
          ctx.stroke();
        }
        blit(ctx, shadowSprite(9), p.x, p.y + 10, 1, 1, 0, 0.55);
        blit(ctx, projSprite(isEvo ? 'paperHorseEvo' : 'paperHorse'), p.x, p.y + gallop, isEvo ? 1.15 : 1, (isEvo ? 1.15 : 1) * flipY, ang);
        break;
      }
      case 'thunderBolt': {
        // 九天玄雷敕 / 道法天雷：通天雷柱 + 地面焦印
        const R = p.radius || 56;
        const a = 1 - k;
        blit(ctx, ringSprite('verm', id % 3), p.x, p.y, R / 100, (R / 100) * 0.72, id, a * 0.9);
        const boltPts = [
          { x: p.x + ((id % 5) - 2) * 8, y: p.y - 230 },
          { x: p.x - 10, y: p.y - 140 },
          { x: p.x + 9, y: p.y - 68 },
          { x: p.x, y: p.y },
        ];
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = VERM;
        ctx.lineWidth = 6.5 * (1 - k * 0.4);
        drawLightningPath(boltPts, 0, id + 11, 12);
        ctx.stroke();
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = 3.4 * (1 - k * 0.3);
        drawLightningPath(boltPts, 0, id + 11, 8);
        ctx.stroke();
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 1.6;
        drawLightningPath(boltPts, 0, id + 11, 4);
        ctx.stroke();
        if (k < 0.35) {
          ctx.fillStyle = paperA((1 - k / 0.35) * 0.75);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, R * 0.55, R * 0.35, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'flyingSword':
      case 'taomujian':
      case 'peachSword': {
        const ang = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1);
        if (!low) {
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          ctx.strokeStyle = evolved ? lanternA(0.72) : vermA(0.5);
          ctx.lineWidth = evolved ? 2.6 : 1.8;
          ctx.beginPath();
          ctx.moveTo(p.x - ux * 24, p.y - uy * 24);
          ctx.lineTo(p.x - ux * 4, p.y - uy * 4);
          ctx.stroke();
        }
        blit(ctx, projSprite(evolved ? 'taomujianEvo' : 'taomujian'), p.x, p.y, evolved ? 1.12 : 1, evolved ? 1.12 : 1, ang);
        break;
      }
      case 'soulChain':
      case 'suohunChain': {
        const x0 = Number.isFinite(p.fromX) ? p.fromX : playerPos.x;
        const y0 = Number.isFinite(p.fromY) ? p.fromY : playerPos.y;
        const x1 = Number.isFinite(p.endX) ? p.endX : p.x;
        const y1 = Number.isFinite(p.endY) ? p.endY : p.y;
        const ang = p.angle ?? Math.atan2(y1 - y0, x1 - x0);
        const fade = Math.max(0, 1 - k * 0.75);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = evolved ? 5.5 : 4.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = evolved ? LANTERN : PAPER_SHADE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const segs = 7;
        for (let s = 0; s < segs; s += 2) {
          const t0 = s / segs;
          const t1 = Math.min(1, (s + 1) / segs);
          ctx.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
          ctx.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
        }
        ctx.stroke();
        ctx.restore();
        blit(ctx, projSprite(evolved ? 'soulHookEvo' : 'soulHook'), x1, y1, evolved ? 1.15 : 1, evolved ? 1.15 : 1, ang, fade);
        break;
      }
      case 'fireCrow':
      case 'zhinianKite': {
        const ang = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1);
        const fr = ((Math.floor(clock * 14) + id) & 1) ? '1' : '0';
        if (!low) {
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          blit(ctx, dotSprite(2, evolved ? 'lantern' : 'verm'), p.x - ux * 14, p.y - uy * 14, 0.9, 0.9, 0, 0.65);
        }
        blit(ctx, projSprite((evolved ? 'fireCrowEvo' : 'fireCrow') + fr), p.x, p.y, evolved ? 1.12 : 1, evolved ? 1.12 : 1, ang);
        break;
      }
      case 'nuoDrum': {
        const fade = k > 0.85 ? (1 - k) / 0.15 : 1;
        const bounce = Math.abs(Math.sin(clock * 16 + id)) * 2.2;
        blit(ctx, shadowSprite(9), p.x, p.y + 8, 1, 1, 0, 0.55 * fade);
        blit(ctx, projSprite(evolved ? 'nuoDrumEvo' : 'nuoDrum'), p.x, p.y - bounce, 1.05, 1.05, 0, fade);
        break;
      }
      case 'nuoBeat':
      case 'nuoDrumWave': {
        const maxR = Math.max(10, p.maxRadius || p.radius || 90);
        const r = Math.max(8, p.radius > 0 ? p.radius : maxR * Math.max(0.2, k));
        const a = Math.max(0, (1 - k) * 0.9);
        blit(ctx, ringSprite(evolved ? 'verm' : 'ink', id % 3), p.x, p.y, r / 100, (r / 100) * 0.9, clock, a);
        if (evolved) {
          blit(ctx, projSprite('nuoMaskTotem'), p.x, p.y - 6, 0.95, 0.95, 0, a * 0.8);
        }
        break;
      }
      case 'nuoDanceRing': {
        const R = Math.max(16, p.radius || 46);
        const fade = k > 0.88 ? (1 - k) / 0.12 : 1;
        ctx.strokeStyle = vermA(0.45 * fade);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6, R, 0, TAU);
        ctx.stroke();
        for (let m = 0; m < 3; m++) {
          const ma = clock * 3.4 + (m / 3) * TAU;
          blit(ctx, projSprite('nuoMaskTotem'), p.x + Math.cos(ma) * R, p.y - 6 + Math.sin(ma) * R * 0.65, 0.72, 0.72, 0, 0.88 * fade);
        }
        break;
      }
      case 'mourningSweep': {
        const R = p.radius || 100;
        const spread = Math.min(TAU * 0.96, p.spread ?? Math.PI);
        const ang = p.angle || 0;
        const a = Math.max(0, 1 - k * 0.85);
        const spr = brushArcSprite(R, spread, evolved);
        const sc = R / Math.max(30, Math.round(R / 8) * 8);
        blit(ctx, spr, p.x, p.y, sc, sc * (p.reverse ? -1 : 1), ang, a * 0.9);
        ctx.save();
        ctx.strokeStyle = evolved ? LANTERN : PAPER;
        ctx.lineWidth = evolved ? 2.8 : 2.2;
        ctx.globalAlpha = a * 0.88;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 0.94, ang - spread * 0.5, ang + spread * 0.5);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'skyLantern': {
        const fx0 = p.fromX ?? p.x;
        const fy0 = p.fromY ?? p.y;
        const tx = p.toX ?? p.x;
        const ty = p.toY ?? p.y;
        const gx = fx0 + (tx - fx0) * k;
        const gy = fy0 + (ty - fy0) * k;
        const lift = Math.sin(Math.PI * k) * 86;
        const tr = (p.radius || 62) / 100;
        blit(ctx, shadowSprite(6), gx, gy + 4, Math.max(0.35, 1 - lift / 150), Math.max(0.35, 1 - lift / 150), 0, 0.6);
        blit(ctx, ringSprite(evolved ? 'verm' : 'vthin', id % 3), tx, ty, tr, tr * 0.52, 0, 0.32 + 0.48 * k);
        blit(ctx, projSprite(evolved ? 'skyLanternEvo' : 'skyLantern'), gx, gy - lift, evolved ? 1.15 : 1, evolved ? 1.15 : 1, Math.sin(clock * 7 + id) * 0.1);
        break;
      }
      case 'inkLine': {
        const ax = Number.isFinite(p.ax) ? p.ax : p.x - 60;
        const ay = Number.isFinite(p.ay) ? p.ay : p.y;
        const bx = Number.isFinite(p.bx) ? p.bx : p.x + 60;
        const by = Number.isFinite(p.by) ? p.by : p.y;
        const fade = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = evolved ? 4.8 : 3.4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.strokeStyle = evolved ? VERM : PAPER_SHADE;
        ctx.lineWidth = evolved ? 2.0 : 1.3;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.fillStyle = VERM;
        ctx.beginPath();
        ctx.arc(ax, ay, 3.2, 0, TAU);
        ctx.arc(bx, by, 3.2, 0, TAU);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'luopanSlip': {
        const ang = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1);
        if (!low) {
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          ctx.strokeStyle = evolved ? lanternA(0.75) : vermA(0.48);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(p.x - ux * 20, p.y - uy * 20);
          ctx.lineTo(p.x - ux * 4, p.y - uy * 4);
          ctx.stroke();
        }
        blit(ctx, projSprite(evolved ? 'luopanSlipEvo' : 'luopanSlip'), p.x, p.y, evolved ? 1.12 : 1, evolved ? 1.12 : 1, ang);
        break;
      }
      case 'enemyBullet': {
        if (p.style === 'ink') {
          blit(ctx, projSprite('inkBullet'), p.x, p.y, 1, 1, clock * 3 + id);
        } else if (p.source === 'archer_ghost' || p.style === 'paperDart') {
          const ang = Math.atan2(p.vy || 0, p.vx || 1);
          blit(ctx, projSprite('paperDart'), p.x, p.y, 1.05, 1.05, ang);
        } else if (p.source === 'paperbride' || p.source === 'soul_fire' || p.style === 'soulFire') {
          const ang = Math.atan2(p.vy || 0, p.vx || 1);
          blit(ctx, projSprite('soulFireBullet'), p.x, p.y, 1.05, 1.05, ang);
        } else {
          blit(ctx, projSprite('paperMoney'), p.x, p.y, Math.max(0.3, Math.abs(Math.cos(clock * 9 + id))), 1, id);
        }
        break;
      }
      case 'enemyWaveWall': {
        const safeX = p.safeX ?? p.x;
        const safeHalfW = p.safeHalfW || 48;
        const halfH = p.halfH || 22;
        const spanW = p.spanW || 560;
        const telT = p.telegraphT || 0.95;
        const isWarn = p.t < telT;
        const left0 = safeX - spanW;
        const left1 = safeX - safeHalfW;
        const right0 = safeX + safeHalfW;
        const right1 = safeX + spanW;
        ctx.save();
        if (isWarn) {
          const prog = Math.max(0.1, Math.min(1, p.t / telT));
          ctx.fillStyle = vermA(0.16 + 0.18 * prog);
          ctx.fillRect(left0, p.y - halfH, left1 - left0, halfH * 2);
          ctx.fillRect(right0, p.y - halfH, right1 - right0, halfH * 2);
          ctx.strokeStyle = VERM;
          ctx.lineWidth = 2.4;
          ctx.strokeRect(left0, p.y - halfH, left1 - left0, halfH * 2);
          ctx.strokeRect(right0, p.y - halfH, right1 - right0, halfH * 2);
        } else {
          ctx.fillStyle = INK;
          ctx.fillRect(left0, p.y - halfH, left1 - left0, halfH * 2);
          ctx.fillRect(right0, p.y - halfH, right1 - right0, halfH * 2);
          ctx.strokeStyle = VERM;
          ctx.lineWidth = 3.2;
          ctx.strokeRect(left0, p.y - halfH, left1 - left0, halfH * 2);
          ctx.strokeRect(right0, p.y - halfH, right1 - right0, halfH * 2);
          ctx.strokeStyle = PAPER;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (const [a0, a1] of [[left0, left1], [right0, right1]]) {
            for (let wx = a0 + 18; wx < a1 - 18; wx += 36) {
              ctx.moveTo(wx, p.y);
              ctx.quadraticCurveTo(wx + 9, p.y - 8, wx + 18, p.y);
            }
          }
          ctx.stroke();
        }
        // 中央木板安全桥口提示框（暖金高亮）
        ctx.fillStyle = lanternA(0.20);
        ctx.fillRect(left1 + 2, p.y - halfH, safeHalfW * 2 - 4, halfH * 2);
        ctx.strokeStyle = LANTERN;
        ctx.lineWidth = 2.2;
        ctx.strokeRect(left1 + 2, p.y - halfH, safeHalfW * 2 - 4, halfH * 2);
        ctx.restore();
        break;
      }
      default: {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.r || 3), 0, TAU);
        ctx.fill();
      }
    }
  }

  /** 联机倒地朱砂八卦救援阵（R = 48）与环形读条进度圈 */
  function drawDownedBaguaCircle(pl, x, y) {
    if (!pl || !pl.downed) return;
    const R = 48;
    const revProg = Number.isFinite(pl.reviveProgress) ? Math.max(0, Math.min(1, pl.reviveProgress)) : 0;
    const pulse = 0.88 + 0.12 * Math.sin(clock * 6);

    ctx.save();
    ctx.fillStyle = vermA(0.14 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.restore();

    blit(ctx, baguaArraySprite('talisman'), x, y, R / 100, R / 100, clock * 0.85, 0.84);

    ctx.save();
    // 外圈与内圈纯朱砂法阵双环（确保 R=42..50 采样环富含高对比 #C23B26 像素）
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, R - 6, 0, TAU);
    for (let k = 0; k < 8; k++) {
      const ang = clock * 0.45 + (k / 8) * TAU;
      ctx.moveTo(x + Math.cos(ang) * (R - 6), y + Math.sin(ang) * (R - 6));
      ctx.lineTo(x + Math.cos(ang) * R, y + Math.sin(ang) * R);
    }
    ctx.stroke();

    if (revProg > 0.001) {
      const startA = -Math.PI / 2;
      const endA = startA + TAU * revProg;
      ctx.strokeStyle = LANTERN;
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.arc(x, y, R - 3, startA, endA);
      ctx.stroke();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, R - 3, startA, endA);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 联机守夜人头顶道号铭牌、血条与倒地求救朱印 */
  function drawAllyOverlay(ally, x, y, slotIdx) {
    if (!ally) return;
    const name = ally.name || (ally.isBot ? `道友${slotIdx + 1}` : `守夜人${slotIdx + 1}`);
    ctx.save();
    ctx.font = `9.5px ${FONT_CN}`;
    const tw = Math.min(86, Math.max(30, ctx.measureText(name).width + 8));
    const ny = y - 41;
    ctx.fillStyle = PAPER;
    ctx.fillRect(x - tw / 2, ny - 6.5, tw, 12);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - tw / 2, ny - 6.5, tw, 12);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, ny);

    const bw = 30;
    const bh = 4.6;
    const by = y - 29;
    const ratio = ally.maxHp > 0 && !ally.downed ? Math.max(0, Math.min(1, ally.hp / ally.maxHp)) : 0;
    ctx.fillStyle = INK;
    ctx.fillRect(x - bw / 2, by, bw, bh);
    if (ratio > 0) {
      ctx.fillStyle = VERM;
      ctx.fillRect(x - bw / 2 + 1, by + 0.8, Math.max(1, (bw - 2) * ratio), bh - 1.6);
    } else if (ally.downed && (ally.reviveProgress || 0) > 0) {
      ctx.fillStyle = LANTERN;
      ctx.fillRect(x - bw / 2 + 1, by + 0.8, Math.max(1, (bw - 2) * Math.min(1, ally.reviveProgress)), bh - 1.6);
    }
    ctx.restore();
    if (ally.downed) {
      drawStamp(ctx, '救', x, y - 55, 10, { color: VERM, seed: 7 + slotIdx });
    }
  }

  /** 夜色遮罩 + 动态灯笼/神龛/队友光圈挖空 */
  function drawDarkness(darkness, lsx, lsy, camx, camy, lightR, evoCount, shrines, ox, oy, allyScreenLights = null) {
    if (darkness <= 0.01) return;
    const dw = darkCanvas.width;
    const dh = darkCanvas.height;
    const g = darkCtx;
    const S = 1 / DARK_DOWN;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, dw, dh);
    const cx = dw / 2;
    const cy = dh / 2;
    const ink = RGB.ink;
    const i0 = Math.max(0.12, 0.6 - 0.5 * darkness);
    const midA = Math.min(0.95, 0.12 + 0.98 * darkness);
    const edgeA = Math.min(0.98, 0.3 + darkness * 0.85);
    g.save();
    g.translate(cx, cy);
    g.scale((dw / 2) * 1.4142, (dh / 2) * 1.4142);
    const grd = g.createRadialGradient(0, 0, i0, 0, 0, 1);
    grd.addColorStop(0, `rgba(${ink},${darkness * darkness * 0.3})`);
    grd.addColorStop(Math.max(0.05, (0.72 - i0) / (1 - i0)), `rgba(${ink},${midA})`);
    grd.addColorStop(1, `rgba(${ink},${edgeA})`);
    g.fillStyle = grd;
    g.fillRect(-1, -1, 2, 2);
    g.restore();

    if (!low) {
      if (!washPattern) washPattern = g.createPattern(getWashTile(), 'repeat');
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.25 + darkness * 0.45;
      g.translate(-((camx * S * 0.6 + clock * 1.2) % 128) - 128, -((camy * S * 0.6) % 128) - 128);
      g.fillStyle = washPattern;
      g.fillRect(0, 0, dw + 384, dh + 384);
      g.restore();
    }

    // 玩家灯笼光圈挖空（随 lightRadius 与开光神兵数明显扩张）
    const flick = 1 + Math.sin(clock * 7.3) * 0.02 + Math.sin(clock * 17.1) * 0.012;
    const R = lightR * flick * S;
    const lx = lsx * S;
    const ly = lsy * S;
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createRadialGradient(lx, ly, R * 0.28, lx, ly, R * 1.28);
    cut.addColorStop(0, 'rgba(0,0,0,1)');
    cut.addColorStop(evoCount > 0 ? 0.66 : 0.55, 'rgba(0,0,0,0.94)');
    cut.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cut;
    g.beginPath();
    g.arc(lx, ly, R * 1.3, 0, TAU);
    g.fill();

    // 视野内未使用的神龛香烛微光挖空 + 奇遇事件光源挖空
    if (shrines && shrines.length) {
      for (let i = 0; i < shrines.length; i++) {
        const s = shrines[i];
        if (s.used && !s.active) continue;
        const sx = (s.x + ox) * S;
        const sy = (s.y - 24 + oy) * S;
        if (sx < -20 || sx > dw + 20 || sy < -20 || sy > dh + 20) continue;
        const sr = 14;
        const sc = g.createRadialGradient(sx, sy, 2, sx, sy, sr);
        sc.addColorStop(0, 'rgba(0,0,0,0.85)');
        sc.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sc;
        g.beginPath();
        g.arc(sx, sy, sr, 0, TAU);
        g.fill();
      }
    }

    // 联机存活队友与异事火坛/货郎的提灯光圈挖空
    if (allyScreenLights && allyScreenLights.length) {
      const ar = Math.max(8, lightR * 0.72 * S);
      for (let i = 0; i < allyScreenLights.length; i++) {
        const alPt = allyScreenLights[i];
        const ax = alPt.x * S;
        const ay = alPt.y * S;
        const rUse = alPt.r ? alPt.r * S : ar;
        if (ax < -rUse || ax > dw + rUse || ay < -rUse || ay > dh + rUse) continue;
        const ac = g.createRadialGradient(ax, ay, rUse * 0.25, ax, ay, rUse);
        ac.addColorStop(0, 'rgba(0,0,0,0.92)');
        ac.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ac;
        g.beginPath();
        g.arc(ax, ay, rUse, 0, TAU);
        g.fill();
      }
    }

    g.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(darkCanvas, 0, 0, W, H);
  }

  /** 灯笼暖光（开光后暖光半径与亮度同步增强） */
  function drawLanternWarmth(lsx, lsy, darkness, lightR, evoCount) {
    const flick = 1 + Math.sin(clock * 7.3) * 0.03 + Math.sin(clock * 23.7) * 0.015;
    const R = lightR * (evoCount > 0 ? 1.14 : 1.05) * flick;
    const boost = evoCount > 0 ? 0.045 : 0;
    const a = 0.07 + darkness * 0.2 + boost;
    const grd = ctx.createRadialGradient(lsx, lsy, 2, lsx, lsy, R);
    grd.addColorStop(0, lanternA(Math.min(0.55, a * 1.65)));
    grd.addColorStop(0.42, lanternA(a));
    grd.addColorStop(1, lanternA(0));
    ctx.fillStyle = grd;
    ctx.fillRect(lsx - R, lsy - R, R * 2, R * 2);
  }

  /** 每更随机异事的世界地面与实体绘制 */
  function drawWatchEventGround(ev) {
    if (!ev) return;
    if (ev.kind === 'escort_peddler') {
      ctx.save();
      ctx.strokeStyle = vermA(0.35);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(ev.x, ev.y);
      ctx.lineTo(ev.goalX, ev.goalY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 终点街口法阵
      const pulse = 0.88 + 0.12 * Math.sin(clock * 5);
      ctx.strokeStyle = VERM;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(ev.goalX, ev.goalY, 28 * pulse, 14 * pulse, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = LANTERN;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(ev.goalX, ev.goalY, 20, 10, 0, 0, TAU);
      ctx.stroke();
      drawStamp(ctx, '礼', ev.goalX, ev.goalY - 18, 10, { color: VERM, seed: 4 });

      // 护送光环
      ctx.strokeStyle = ev.escorting ? lanternA(0.55) : inkA(0.28);
      ctx.lineWidth = ev.escorting ? 2 : 1.3;
      ctx.beginPath();
      ctx.arc(ev.x, ev.y, 145, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (ev.kind === 'light_bonfires' && Array.isArray(ev.nodes)) {
      for (let i = 0; i < ev.nodes.length; i++) {
        const n = ev.nodes[i];
        const lit = !!n.lit;
        ctx.save();
        if (lit) {
          blit(ctx, emberPoolSprite((i % 2) + 1), n.x, n.y, 0.42, 0.3, clock * 0.4 + i, 0.72);
        }
        ctx.strokeStyle = lit ? LANTERN : VERM;
        ctx.lineWidth = lit ? 2.4 : 1.8;
        ctx.beginPath();
        ctx.ellipse(n.x, n.y, 32, 16, 0, 0, TAU);
        ctx.stroke();
        // 石火坛底座
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(n.x, n.y, 14, 7.5, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (lit) {
          const fl = 1 + Math.sin(clock * 14 + i) * 0.14;
          blit(ctx, projSprite('flame'), n.x, n.y - 12, 1.35 * fl, 1.45 * fl, Math.sin(clock * 9 + i) * 0.12);
          drawStamp(ctx, '火', n.x, n.y - 30, 9, { color: VERM, seed: 6 + i });
        } else {
          drawStamp(ctx, '火', n.x, n.y - 22, 9, { color: INK, seed: 6 + i });
        }
        ctx.restore();
      }
    } else if (ev.kind === 'ghost_parade') {
      const ang = Math.atan2(ev.uy || 0, ev.ux || 1);
      const hw = ev.halfW || 34;
      const hl = ev.halfLen || 380;
      ctx.save();
      ctx.translate(ev.cx, ev.cy);
      ctx.rotate(ang);
      ctx.fillStyle = vermA(ev.phase === 'warn' ? 0.32 : 0.2);
      ctx.fillRect(-hl, -hw, hl * 2, hw * 2);
      ctx.strokeStyle = VERM;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-hl, -hw);
      ctx.lineTo(hl, -hw);
      ctx.moveTo(-hl, hw);
      ctx.lineTo(hl, hw);
      for (let d = -hl + 28; d < hl - 16; d += 48) {
        ctx.moveTo(d - 10, -12);
        ctx.lineTo(d + 6, 0);
        ctx.lineTo(d - 10, 12);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWatchEventActors(ev) {
    if (!ev) return;
    if (ev.kind === 'escort_peddler') {
      const bob = ev.escorting ? Math.abs(Math.sin(clock * 9)) * 2.2 : 0;
      blit(ctx, shadowSprite(20), ev.x, ev.y + 4, 1, 1, 0, 0.8);
      blit(ctx, shrineSprite('peddler', false, !!ev.escorting), ev.x, ev.y - bob, 0.92, 0.92);
      // 货郎气血条与「送」字朱印
      const bw = 36;
      const bh = 5;
      const by = ev.y - 62;
      const ratio = ev.maxHp > 0 ? Math.max(0, Math.min(1, ev.hp / ev.maxHp)) : 0;
      ctx.save();
      ctx.fillStyle = INK;
      ctx.fillRect(ev.x - bw / 2, by, bw, bh);
      if (ratio > 0) {
        ctx.fillStyle = ev.escorting ? LANTERN : VERM;
        ctx.fillRect(ev.x - bw / 2 + 1, by + 1, Math.max(1, (bw - 2) * ratio), bh - 2);
      }
      ctx.restore();
      drawStamp(ctx, '送', ev.x, by - 11, 9.5, { color: VERM, seed: 3 });
    } else if (ev.kind === 'ghost_parade' && Array.isArray(ev.soldiers) && ev.soldiers.length > 0) {
      const flip = (ev.ux || 1) < 0 ? -1 : 1;
      for (let i = 0; i < ev.soldiers.length; i++) {
        const sol = ev.soldiers[i];
        const type = i % 2 === 0 ? 'sedan' : 'shade';
        const d = enemyDef(type);
        const frame = Math.floor(clock * 8 + i) % d.frames;
        blit(ctx, shadowSprite(14), sol.x, sol.y + 8, 1, 1, 0, 0.65);
        blit(ctx, enemySprite(type, frame, false, ''), sol.x, sol.y + 8, flip * 1.05, 1.05, 0, 0.84);
        ctx.fillStyle = VERM;
        ctx.beginPath();
        ctx.arc(sol.x + flip * 4, sol.y - 12, 2.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawGhostParadeAboveDarkness(ev) {
    if (!ev || ev.kind !== 'ghost_parade') return;
    const ang = Math.atan2(ev.uy || 0, ev.ux || 1);
    const hw = ev.halfW || 34;
    const hl = ev.halfLen || 380;
    ctx.save();
    ctx.translate(ev.cx, ev.cy);
    ctx.rotate(ang);
    ctx.strokeStyle = VERM;
    ctx.lineWidth = ev.phase === 'warn' ? 2.8 : 2.0;
    ctx.beginPath();
    ctx.moveTo(-hl, -hw);
    ctx.lineTo(hl, -hw);
    ctx.moveTo(-hl, hw);
    ctx.lineTo(hl, hw);
    ctx.stroke();
    ctx.restore();
  }

  /** 穿透夜色的朱砂冲锋预警走廊与蓄力红眼（T1-F2-05，低画质同样必画！） */
  function drawTelegraphsAboveDarkness(ens, pxI, pyI, vx, vy, al) {
    for (let i = 0; i < ens.length; i++) {
      const e = ens[i];
      if (!isTelegraphing(e)) continue;
      const st = interp.get(e.id);
      const ex = st && al < 0.999 ? st.px + (st.x - st.px) * al : e.x;
      const ey = st && al < 0.999 ? st.py + (st.y - st.py) * al : e.y;
      const cull = e.boss ? 760 : 380;
      if (ex < vx - cull || ex > vx + W + cull || ey < vy - cull || ey > vy + H + cull) continue;

      const { ux, uy } = resolveTelegraphDir(e, ex, ey, pxI, pyI);
      const ang = Math.atan2(uy, ux);
      const len = e.telegraphLen > 0 ? e.telegraphLen : e.type === 'horse' ? 264 : e.type === 'youshen' ? 238 : 155;
      const distP = Math.hypot(pxI - ex, pyI - ey);
      const sightLen = e.boss ? Math.max(len, Math.min(520, distP + 40)) : len;
      const width = e.telegraphWidth > 0 ? e.telegraphWidth : e.type === 'horse' ? 60 : e.type === 'youshen' ? 72 : 26;
      const prog = e.telegraphProgress > 0 ? Math.max(0.22, Math.min(1, e.telegraphProgress)) : 0.72;
      const hw = width / 2;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);

      // 预警走廊底带 + 蓄力推进朱砂实心带
      ctx.fillStyle = vermA(0.36);
      ctx.fillRect(0, -hw, len, width);
      ctx.fillStyle = vermA(0.68);
      ctx.fillRect(0, -hw + 2, len * prog, Math.max(4, width - 4));

      // 若夜主在竖屏侧方远距（如 spawnDist=430）起手蓄力，延伸朱砂杀气贯通警戒轨直达视野中央
      if (sightLen > len + 8) {
        ctx.fillStyle = vermA(0.26);
        ctx.fillRect(len, -hw * 0.7, sightLen - len, width * 0.7);
        ctx.strokeStyle = VERM;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.lineTo(sightLen, 0);
        ctx.moveTo(len, -hw * 0.7);
        ctx.lineTo(sightLen, -hw * 0.7);
        ctx.moveTo(len, hw * 0.7);
        ctx.lineTo(sightLen, hw * 0.7);
        for (let d = len + 28; d < sightLen - 10; d += 38) {
          ctx.moveTo(d - 9, -12);
          ctx.lineTo(d + 5, 0);
          ctx.lineTo(d - 9, 12);
        }
        ctx.stroke();
      }

      // 两侧醒目纯朱红边界线与中心冲锋箭头阵列
      ctx.strokeStyle = VERM;
      ctx.lineWidth = e.boss ? 3.5 : 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -hw);
      ctx.lineTo(len, -hw);
      ctx.moveTo(0, hw);
      ctx.lineTo(len, hw);
      const step = e.boss ? 40 : 30;
      const chW = Math.min(hw * 0.68, 17);
      for (let d = 22; d < len - 14; d += step) {
        ctx.moveTo(d - 10, -chW);
        ctx.lineTo(d + 5, 0);
        ctx.lineTo(d - 10, chW);
      }
      ctx.stroke();

      // 走廊尽头实心朱砂锋镝箭头
      ctx.fillStyle = VERM;
      ctx.beginPath();
      ctx.moveTo(len + 14, 0);
      ctx.lineTo(len - 8, -hw * 0.85);
      ctx.lineTo(len - 3, 0);
      ctx.lineTo(len - 8, hw * 0.85);
      ctx.closePath();
      ctx.fill();

      // 蓄力起点锁定圈
      ctx.strokeStyle = LANTERN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, (e.r || 20) * (1.15 - 0.2 * prog), 0, TAU);
      ctx.stroke();
      ctx.restore();

      // 黑暗中刺目的蓄力凶眼（朱砂外芒 + 琥珀瞳芯）
      const def = enemyDef(e.type);
      const eyes = def.eyes || [[0, -(e.r || 20) * 1.4]];
      const s = (e.r || def.r) / def.r;
      const flip = enemyFlip(e, pxI);
      const feetY = ey + (e.r || def.r) * 0.72;
      for (let k = 0; k < eyes.length; k++) {
        const [oxEye, oyEye] = eyes[k];
        const wx = ex + oxEye * s * flip;
        const wy = feetY + oyEye * s;
        ctx.fillStyle = VERM;
        ctx.beginPath();
        ctx.arc(wx, wy, 3.8 * Math.max(1, s * 0.9), 0, TAU);
        ctx.fill();
        ctx.fillStyle = LANTERN;
        ctx.beginPath();
        ctx.arc(wx, wy, 1.7 * Math.max(1, s * 0.85), 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawEdgePointer(sx, sy, glyph, highlight, minX, maxX, minY, maxY, st, sb) {
    if (sx >= 20 && sx <= W - 20 && sy >= st + 76 && sy <= H - sb - 76) return;
    const cx = W / 2;
    const cy = H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    let tEdge = Infinity;
    if (ux > 0.001) tEdge = Math.min(tEdge, (maxX - cx) / ux);
    else if (ux < -0.001) tEdge = Math.min(tEdge, (minX - cx) / ux);
    if (uy > 0.001) tEdge = Math.min(tEdge, (maxY - cy) / uy);
    else if (uy < -0.001) tEdge = Math.min(tEdge, (minY - cy) / uy);
    if (!Number.isFinite(tEdge)) return;

    const ax = Math.max(minX, Math.min(maxX, cx + ux * tEdge));
    const ay = Math.max(minY, Math.min(maxY, cy + uy * tEdge));
    const ang = Math.atan2(uy, ux);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = VERM;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(1, -10);
    ctx.lineTo(4, 0);
    ctx.lineTo(1, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const bx = ax - ux * 11;
    const by = ay - uy * 11;
    ctx.save();
    ctx.fillStyle = VERM;
    ctx.fillRect(bx - 11, by - 11, 22, 22);
    ctx.strokeStyle = highlight ? LANTERN : PAPER;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(bx - 9.5, by - 9.5, 19, 19);
    ctx.font = `12px ${FONT_CN}`;
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph || '奇', bx, by + 0.5);
    ctx.restore();
  }

  /** 屏幕边缘奇遇方向朱砂路引标（T1-F9-05 + M2.2 异事方向标，夜色遮罩之上） */
  function drawShrinePointers(run, ox, oy, settings) {
    const shrines = run.shrines;
    const ev = run.watchEvent;
    const hasEventTarget = ev && Number.isFinite(ev.targetX) && Number.isFinite(ev.targetY);
    if ((!shrines || !shrines.length) && !hasEventTarget) return;
    const st = settings.safeTop || 0;
    const sb = settings.safeBottom || 0;
    const minX = 24;
    const maxX = W - 24;
    const minY = st + (run.boss ? 130 : 88);
    const maxY = H - sb - 110;

    if (shrines && shrines.length) {
      for (let i = 0; i < shrines.length; i++) {
        const s = shrines[i];
        if (s.used && !s.active) continue;
        drawEdgePointer(s.x + ox, s.y + oy, SHRINE_GLYPH[s.kind] || '奇', !!s.active, minX, maxX, minY, maxY, st, sb);
      }
    }
    if (hasEventTarget) {
      drawEdgePointer(ev.targetX + ox, ev.targetY + oy, ev.stamp || '异', true, minX, maxX, minY, maxY, st, sb);
    }
  }

  /** 五更氛围微粒（轻量化 <= 16 颗，零分配，低画质关闭，严格使用 6 色色板） */
  function drawWatchAtmosphere(watch) {
    if (low) return;
    const w = Math.max(1, Math.min(6, watch || 1));
    const count = 14;
    for (let i = 0; i < count; i++) {
      const h1 = ((i * 73 + 19) % 97) / 97;
      const h2 = ((i * 41 + 53) % 89) / 89;
      const speedX = w >= 4 ? -18 : -9;
      const speedY = w === 5 ? -22 : w === 6 ? -10 : 12;
      const sx = (((h1 * W + clock * speedX * (0.7 + (i % 3) * 0.25)) % W) + W) % W;
      const sy = (((h2 * H + clock * speedY * (0.65 + (i % 4) * 0.2) + Math.sin(clock * 1.5 + i) * 14) % H) + H) % H;
      if (w >= 5) {
        const col = w === 6 || i % 2 === 0 ? 'lantern' : 'verm';
        blit(ctx, dotSprite(2, col), sx, sy, 0.85, 0.85, 0, w === 6 ? 0.35 : 0.48);
      } else if (w >= 3 && i % 3 === 0) {
        blit(ctx, scrapSprite(i % 4, i % 2 === 0 ? 'verm' : 'paper'), sx, sy, 0.55, 0.55, clock * 1.6 + i, 0.36);
      } else {
        blit(ctx, dotSprite(1.5, 'paper'), sx, sy, 0.8, 0.8, 0, 0.28);
      }
    }
  }

  /* -------------------------------------------------------------- */

  let lastRunObj = null;

  function render(run, alpha = 1, realDt = 1 / 60, settings = {}) {
    if (!run || !run.player) return;
    if (run !== lastRunObj) {
      lastRunObj = run;
      fx.clear();
      interp.clear();
      pmLast.clear();
      cam.init = false;
      lastRunTime = -1;
    }
    frameNo++;
    const dt = Math.min(0.1, Math.max(0, realDt));
    clock += dt;
    fx.setAttackVfx(run.player.attackVfx || settings.cosmetics?.attackVfx || 'default');
    fx.update(dt);
    const activeMapId = run.mapId === 'hedeng' ? 'hedeng' : 'qingshi';
    if (groundMapId !== activeMapId) {
      groundMapId = activeMapId;
      ground.setMap(activeMapId);
    }
    if (groundSeed !== run.seed) {
      groundSeed = run.seed;
      ground.setSeed((run.seed >>> 0) || 1);
    }
    const newStep = run.time !== lastRunTime;
    lastRunTime = run.time;
    const al = !newStep || dt === 0 || alpha <= 0 ? 1 : Math.max(0, Math.min(1, alpha));

    const p = run.player;
    const ps = track('p', p.x, p.y, newStep);
    const pred0X = (run._localSlot ?? 0) === 0 ? (run._predOffset?.x || 0) : 0;
    const pred0Y = (run._localSlot ?? 0) === 0 ? (run._predOffset?.y || 0) : 0;
    const pxI = ps.px + (ps.x - ps.px) * al + pred0X;
    const pyI = ps.py + (ps.y - ps.py) * al + pred0Y;

    let camTargetX = pxI;
    let camTargetY = pyI;
    if (Array.isArray(run.players) && Number.isInteger(run._localSlot) && run._localSlot > 0 && run.players[run._localSlot]) {
      const me = run.players[run._localSlot];
      camTargetX = me.x + (run._predOffset?.x || 0);
      camTargetY = me.y + (run._predOffset?.y || 0);
    }

    // 镜头平滑跟随（暂停/零 dt 或大跳变时即时对齐主控玩家）
    if (!cam.init || Math.hypot(cam.x - camTargetX, cam.y - camTargetY) > 500 || (dt === 0 && Math.hypot(cam.x - camTargetX, cam.y - camTargetY) > 1)) {
      cam.x = camTargetX;
      cam.y = camTargetY;
      cam.init = true;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      cam.x += (camTargetX - cam.x) * k;
      cam.y += (camTargetY - cam.y) * k;
    }
    const shake = fx.shakeOffset(settings.shake !== false);
    const ox = W / 2 - cam.x + shake.x;
    const oy = H / 2 - cam.y + shake.y;
    const vx = cam.x - W / 2;
    const vy = cam.y - H / 2;

    // ---------- 世界层 ----------
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    ctx.imageSmoothingEnabled = true;
    drawPaper(vx, vy);
    ground.draw(ctx, vx - 8, vy - 8, W + 16, H + 16);
    if (run.watch >= 6 && run.darkness <= 0.01) {
      ctx.fillStyle = paperA(0.32);
      ctx.fillRect(vx - 8, vy - 8, W + 16, H + 16);
    }
    fx.drawDecals(ctx);
    if (run.watchEvent) drawWatchEventGround(run.watchEvent);

    const evo = new Set();
    for (const w of run.weapons || []) if (w.evolved) evo.add(w.id);
    const evoCount = evo.size;
    const ppos = { x: pxI, y: pyI };
    const M = 90;
    const inView = (x, y, m = M) => x > vx - m && x < vx + W + m && y > vy - m && y < vy + H + m * 1.6;

    // 地面层弹体 / 阵法
    const projs = run.projectiles || [];
    for (let i = 0; i < projs.length; i++) {
      const q = projs[i];
      if (!GROUND_KINDS.has(q.kind)) continue;
      const gm = q.kind === 'enemyWaveWall' ? 620 : Math.max(150, (q.radius || q.maxRadius || 60) + 40);
      if (inView(q.x ?? pxI, q.y ?? pyI, gm)) drawProjectile(q, evo, run, ppos, settings.cosmetics);
    }

    // 联机倒地八卦救援阵（地面层绘制）
    const party = Array.isArray(run.players) && run.players.length > 1 ? run.players : null;
    if (party) {
      if (p.downed && inView(pxI, pyI, 80)) drawDownedBaguaCircle(p, pxI, pyI);
      for (let idx = 1; idx < party.length; idx++) {
        const ally = party[idx];
        if (!ally) continue;
        const as = track('ally_' + (ally.slot ?? idx), ally.x, ally.y, newStep);
        const ax = as.px + (as.x - as.px) * al;
        const ay = as.py + (as.y - as.py) * al;
        if (ally.downed && inView(ax, ay, 80)) drawDownedBaguaCircle(ally, ax, ay);
      }
    }

    // 拾取物
    const pk = run.pickups || [];
    for (let i = 0; i < pk.length; i++) {
      const k = pk[i];
      if (inView(k.x, k.y, 30)) drawPickup(k, k.x, k.y);
    }

    // y 排序：场景物件 + 奇遇建筑 + 敌人 + 主控守夜人 + 协战道友
    drawList.length = 0;
    let allyScreenLights = null;
    const props = run.props || [];
    let riverLightCount = 0;
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.hp !== undefined && o.hp <= 0) continue;
      if (inView(o.x, o.y, 160)) {
        const bobY = o.kind === 'riverlantern' ? Math.sin(clock * 2.6 + (o.id % 19)) * 1.8 : 0;
        drawList.push({ t: 0, o, y: o.y + bobY, x: o.x });
        if (o.kind === 'riverlantern' && riverLightCount < 8) {
          if (!allyScreenLights) allyScreenLights = [];
          allyScreenLights.push({ x: o.x + ox, y: o.y - 6 + bobY + oy, r: 42 });
          riverLightCount++;
        }
      }
    }
    const shrines = run.shrines || [];
    for (let i = 0; i < shrines.length; i++) {
      const s = shrines[i];
      if (inView(s.x, s.y, 140)) drawList.push({ t: 3, o: s, y: s.y, x: s.x });
    }
    const ens = run.enemies || [];
    const crowded = low || ens.length > 160;
    for (let i = 0; i < ens.length; i++) {
      const e = ens[i];
      const s = track(e.id, e.x, e.y, newStep);
      const x = s.px + (s.x - s.px) * al;
      const y = s.py + (s.y - s.py) * al;
      if (inView(x, y, e.boss || e.warder ? 220 : M)) drawList.push({ t: 1, o: e, y, x });
    }
    drawList.push({ t: 2, o: p, y: pyI, x: pxI });
    if (party) {
      if (!allyScreenLights) allyScreenLights = [];
      for (let idx = 1; idx < party.length; idx++) {
        const ally = party[idx];
        if (!ally) continue;
        const as = interp.get('ally_' + (ally.slot ?? idx));
        const ax = as ? as.px + (as.x - as.px) * al : ally.x;
        const ay = as ? as.py + (as.y - as.py) * al : ally.y;
        if (inView(ax, ay, 110)) {
          drawList.push({ t: 4, o: ally, y: ay, x: ax, idx });
          if (!ally.downed) allyScreenLights.push({ x: ax + ox, y: ay - 10 + oy });
        }
      }
    }
    if (run.watchEvent) {
      const ev = run.watchEvent;
      if (ev.kind === 'escort_peddler') {
        if (!allyScreenLights) allyScreenLights = [];
        allyScreenLights.push({ x: ev.x + ox, y: ev.y - 16 + oy, r: 72 });
      } else if (ev.kind === 'light_bonfires' && Array.isArray(ev.nodes)) {
        for (let i = 0; i < ev.nodes.length; i++) {
          const n = ev.nodes[i];
          if (n.lit) {
            if (!allyScreenLights) allyScreenLights = [];
            allyScreenLights.push({ x: n.x + ox, y: n.y - 10 + oy, r: 64 });
          }
        }
      }
    }
    drawList.sort((a, b) => a.y - b.y);

    const nearbyShrineId = run.nearbyShrine ? run.nearbyShrine.id : null;
    let lantern = { lx: pxI + 7, ly: pyI };
    for (let i = 0; i < drawList.length; i++) {
      const d = drawList[i];
      if (d.t === 0) blit(ctx, propSprite(d.o.kind), d.x, d.y);
      else if (d.t === 3) drawShrine(d.o, pxI, pyI, nearbyShrineId);
      else if (d.t === 1) drawEnemy(d.o, d.x, d.y, pxI, 1, crowded, run);
      else if (d.t === 4) {
        const ally = d.o;
        const allyEvo = Array.isArray(ally.weapons) ? ally.weapons.filter((w) => w && w.evolved).length : 0;
        drawPlayer(ally, d.x, d.y, run, ally.downed ? 0.5 : 0.94, null, allyEvo);
        drawAllyOverlay(ally, d.x, d.y, d.idx);
      } else {
        lantern = drawPlayer(p, d.x, d.y, run, p.downed ? 0.5 : 1, settings.cosmetics, evoCount);
        if (party && p.downed) {
          drawStamp(ctx, '救', d.x, d.y - 46, 10, { color: VERM, seed: 3 });
        }
      }
    }
    if (run.watchEvent) drawWatchEventActors(run.watchEvent);

    // 空中弹体 / 光束 / 雷柱
    for (let i = 0; i < projs.length; i++) {
      const q = projs[i];
      if (GROUND_KINDS.has(q.kind)) continue;
      const am = Math.max(150, (q.radius || q.length || q.maxRadius || 0) + 56);
      if (inView(q.x ?? pxI, q.y ?? pyI, am)) drawProjectile(q, evo, run, ppos, settings.cosmetics);
    }
    fx.drawParticles(ctx);

    // ---------- 夜色与动态灯笼暖光 ----------
    const darkness = Math.max(0, Math.min(1, run.darkness || 0));
    const baseLightR = run.mods?.lightRadius || p.lightRadius || LANTERN_R;
    const evoLightBonus = evoCount > 0 ? 28 + (evoCount - 1) * 10 : 0;
    const lightR = baseLightR + evoLightBonus;
    const lsx = lantern.lx + ox;
    const lsy = lantern.ly + oy;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLanternWarmth(lsx, lsy, darkness, lightR, evoCount);
    drawDarkness(darkness, lsx, lsy, cam.x, cam.y, lightR, evoCount, shrines, ox, oy, allyScreenLights);

    // ---------- 夜色之上：黑暗中的眼 + 朱砂冲锋预警走廊 ----------
    if (darkness > 0.2 && !low) {
      ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
      ctx.fillStyle = PAPER;
      for (let i = 0; i < drawList.length; i++) {
        const d = drawList[i];
        if (d.t !== 1) continue;
        const e = d.o;
        const def = enemyDef(e.type);
        if (!def.eyes) continue;
        const dist = Math.hypot(d.x - lantern.lx, d.y - lantern.ly);
        const kk = smooth01(lightR * 0.9, lightR * 2.1, dist) * darkness;
        if (kk < 0.12) continue;
        const s = (e.r || def.r) / def.r;
        const flip = enemyFlip(e, pxI);
        const feetY = d.y + (e.r || def.r) * 0.72;
        ctx.globalAlpha = Math.min(0.85, kk);
        for (const [ex, ey] of def.eyes) {
          ctx.beginPath();
          ctx.ellipse(d.x + ex * s * flip, feetY + ey * s, 1.3 * s, 0.8 * s, 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    if (ens.length > 0 || (run.watchEvent && run.watchEvent.kind === 'ghost_parade')) {
      ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
      if (ens.length > 0) drawTelegraphsAboveDarkness(ens, pxI, pyI, vx, vy, al);
      if (run.watchEvent && run.watchEvent.kind === 'ghost_parade') drawGhostParadeAboveDarkness(run.watchEvent);
    }

    // 天亮的朱红日印
    if (run.watch >= 6 && darkness <= 0.01) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      withSun(ctx, W);
    }

    // ---------- 伤害数字（世界坐标，夜色之上） ----------
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    dmg.draw(ctx, clock, settings.dmgText || 'all');

    // ---------- 屏幕层（五更浮尘 + 屏边奇遇指针 + 全屏墨晕横幅 + HUD） ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWatchAtmosphere(run.watch);
    drawShrinePointers(run, ox, oy, settings);
    fx.drawScreen(ctx, W, H);
    hud.draw(ctx, run, W, H, clock, settings);

    // 清理插值表
    if (frameNo % 120 === 0) {
      for (const [k, s] of interp) if (frameNo - s.f > 60) interp.delete(k);
      for (const [k, s] of pmLast) if (frameNo - s.f > 60) pmLast.delete(k);
    }
  }

  function withSun(g, W2) {
    const img = softBlob(64, 'verm');
    g.globalAlpha = 0.16;
    g.drawImage(img, W2 - 210, 70, 260, 260);
    g.globalAlpha = 1;
  }

  return {
    resize,
    render,
    consumeEvents,
    get hitstop() {
      return fx.hitstop;
    },
    get timeScale() {
      return fx.timeScale;
    },
    getUltButtonRect() {
      return hud.getUltButtonRect();
    },
    setLowQuality,
    /** 调试用 */
    get stats() {
      return { ...fx.counts, w: W, h: H, dpr };
    },
    get _darkCanvas() {
      return darkCanvas;
    },
  };
}
