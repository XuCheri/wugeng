// renderer.js —— 渲染入口（ARCHITECTURE §4）
// createRenderer(canvas, { lowQuality }) → { resize, render, consumeEvents, hitstop, getUltButtonRect, setLowQuality }
// 渲染层只读 run，绝不修改。
import { INK, VERM, PAPER, LANTERN, RGB, inkA, paperA, vermA, lanternA } from './palette.js';
import { getPaperTile, getWashTile, setMisregistration, softBlob, makeCanvas } from './ink.js';
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
  pickupSprite,
  projSprite,
  ringSprite,
  brushArcSprite,
  inkPoolSprite,
  burstSprite,
} from './sprites.js';
import { createGround } from './ground.js';
import { createFx } from './fx.js';
import { createDamageTexts } from './damage-text.js';
import { createHud } from './hud.js';

const TAU = Math.PI * 2;

// 弹体 kind → 所属武器（用于判断开光外观）
const KIND_WEAPON = {
  gongPulse: 'gong',
  lantern: 'lantern',
  flameRing: 'lantern',
  talisman: 'talisman',
  brushArc: 'brush',
  inkPool: 'brush',
  coinsword: 'coinsword',
  paperman: 'paperman',
  firecracker: 'firecracker',
  explosion: 'firecracker',
  bellChain: 'bell',
};
const GROUND_KINDS = new Set(['inkPool', 'gongPulse', 'ultPulse', 'flameRing']);

// 精灵朝右绘制、需要随朝向翻转的敌人
const FLIP_TYPES = new Set(['weasel', 'drowned', 'horse', 'umbrella', 'shade', 'youshen', 'sedan']);
const FLOAT_TYPES = new Set(['shade', 'lanternghost', 'sedan', 'drowned', 'umbrella']);
const LANTERN_R = 118; // 灯笼光圈半径（CSS px）

function smooth01(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
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

  /** 位置插值：记录上一逻辑步与当前逻辑步 */
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
    }
    s.f = frameNo;
    return s;
  }

  function consumeEvents(events) {
    if (!events) return;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
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

  function drawEnemy(e, x, y, px, a) {
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
    if (e.state === 'windup') {
      sx *= 1.14;
      sy *= 0.84;
    } else if (e.state === 'pounce' || e.state === 'charge' || e.state === 'dash') {
      sx *= 1.12;
      sy *= 0.94;
      rot = 0.18 * flip;
    }
    const feetY = y + (e.r || d.r) * 0.72;
    const sh = shadowSprite((e.r || d.r) * 0.95);
    blit(ctx, sh, x, feetY, 1, 1, 0, a);
    if (e.elite || e.boss) blit(ctx, eliteRingSprite((e.r || d.r) * 1.15), x, feetY, 1, 1, 0, a);
    if (e.type === 'drowned') {
      // 减速光环：墨色涟漪
      ctx.strokeStyle = inkA(0.22 * a);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 2; i++) {
        const k = (clock * 0.6 + i * 0.5 + id * 0.13) % 1;
        const R = (e.r || 13) * (1.4 + k * 2.4);
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(x, feetY, R, R * 0.42, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (e.boss && (e.phase === 3 || e.state === 'enraged')) {
      const img = softBlob(64, 'verm');
      const R = (e.r || 44) * (2.4 + Math.sin(clock * 6) * 0.15);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(img, x - R, feetY - R * 1.6, R * 2, R * 2);
      ctx.globalAlpha = 1;
    }
    const flash = e.hitT > 0;
    blit(ctx, enemySprite(e.type, frame, flash), x, feetY + oy, sx, sy, rot, a);
  }

  function drawPlayer(p, x, y, run, a, cosmetics) {
    const heroId = p.heroId || run.heroId || 'zhou';
    const moving = !!p.moving;
    const frame = moving ? Math.floor(clock * 10) % 4 : 0;
    const flip = (p.facingX ?? 1) < 0 ? -1 : 1;
    const feetY = y + (p.r || 12) * 0.72;
    const bob = moving ? -Math.abs(Math.sin(clock * 10 * Math.PI * 0.5)) * 1.4 : Math.sin(clock * 2) * 0.4;
    let alpha = a;
    if (p.invulnT > 0) alpha *= 0.55 + 0.45 * (Math.sin(clock * 30) > 0 ? 1 : 0.3);
    if (run.status === 'dead') alpha *= 0.5;
    blit(ctx, shadowSprite(10), x, feetY, 1, 1, 0, alpha);
    const spr = heroSprite(heroId, frame, p.hurtT > 0, cosmetics?.outfit || null);
    const lean = moving ? 0.05 * flip : 0;
    blit(ctx, spr, x, feetY + bob, flip, 1, lean, alpha);
    // 手提灯笼：以手为轴摆动
    const hand = heroHand();
    const hx = x + hand.x * flip;
    const hy = feetY + bob + hand.y;
    const swing = Math.sin(clock * 3.1) * 0.12 + (moving ? -0.32 * flip : 0) + Math.sin(clock * 10) * (moving ? 0.06 : 0);
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

  function drawProjectile(p, evo, run, playerPos) {
    const k = p.life > 0 ? Math.max(0, Math.min(1, p.t / p.life)) : 0;
    const id = p.id || 0;
    const evolved = p.evolved || evo.has(KIND_WEAPON[p.kind]);
    switch (p.kind) {
      case 'gongPulse': {
        const r = p.radius || 60;
        const a = Math.pow(1 - k, 1.1) * 0.9;
        blit(ctx, ringSprite(evolved ? 'verm' : 'ink', id % 3), p.x, p.y, r / 100, (r / 100) * 0.92, id * 0.7, a);
        if (evolved) blit(ctx, ringSprite('thin', (id + 1) % 3), p.x, p.y, (r * 0.82) / 100, (r * 0.82 * 0.92) / 100, 0, a * 0.8);
        break;
      }
      case 'ultPulse': {
        const r = p.radius || 100;
        blit(ctx, ringSprite('ult', id % 3), p.x, p.y, r / 100, (r / 100) * 0.92, 0, 1 - k * k);
        break;
      }
      case 'inkPool': {
        const r = p.radius || 40;
        const a = Math.min(1, p.t / 0.15) * (k > 0.75 ? (1 - k) / 0.25 : 1);
        blit(ctx, inkPoolSprite(id), p.x, p.y, r / 50, r / 50, 0, a);
        break;
      }
      case 'flameRing': {
        const R = p.radius || 70;
        const cx = p.x ?? playerPos.x;
        const cy = p.y ?? playerPos.y;
        ctx.strokeStyle = vermA(0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, R, 0, 0, TAU);
        ctx.stroke();
        const n = Math.max(10, Math.round((TAU * R) / (low ? 22 : 15)));
        const spr = projSprite('flame');
        const rotBase = clock * 0.8;
        for (let i = 0; i < n; i++) {
          const a = rotBase + (i / n) * TAU;
          const fl = 0.85 + 0.3 * Math.sin(clock * 12 + i * 1.9);
          blit(ctx, spr, cx + Math.cos(a) * R, cy + Math.sin(a) * R, fl * 0.9, fl, a + Math.PI / 2);
        }
        break;
      }
      case 'lantern': {
        const fl = 1 + Math.sin(clock * 14 + id) * 0.06;
        blit(ctx, shadowSprite(5), p.x, p.y + 12, 1, 1, 0, 0.6);
        blit(ctx, projSprite('lantern'), p.x, p.y, fl, fl, Math.sin(clock * 4 + id) * 0.15);
        break;
      }
      case 'talisman': {
        const a = Math.atan2(p.vy || 0, p.vx || 1) + Math.PI / 2;
        const flutter = 0.75 + 0.25 * Math.cos(clock * 16 + id);
        if (!low) {
          ctx.fillStyle = evolved ? vermA(0.35) : inkA(0.25);
          const bx = p.x - Math.sin(a) * -10;
          const by = p.y + Math.cos(a) * 10;
          ctx.beginPath();
          ctx.arc(bx, by, 1.2, 0, TAU);
          ctx.arc(bx - Math.sin(a) * -6, by + Math.cos(a) * 6, 0.8, 0, TAU);
          ctx.fill();
        }
        blit(ctx, projSprite(evolved ? 'talismanEvo' : 'talisman'), p.x, p.y, flutter, 1, a);
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
          // 扫出：扇形裁剪
          const sweep = Math.max(0.05, k / 0.3);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.arc(p.x, p.y, R * 1.5, p.angle - spread / 2 - 0.3, p.angle - spread / 2 + (spread + 0.6) * sweep);
          ctx.closePath();
          ctx.clip();
        }
        blit(ctx, spr, p.x, p.y, sc * (0.94 + 0.06 * k), sc * (0.94 + 0.06 * k), p.angle || 0, a);
        ctx.restore();
        break;
      }
      case 'coinsword': {
        const a = p.returning ? clock * 16 + id : Math.atan2(p.vy || 0, p.vx || 1);
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
        blit(ctx, shadowSprite(6), p.x, p.y + 8, 1, 1, 0, 0.8);
        blit(ctx, projSprite((evolved ? 'papermanEvo' : 'paperman') + fr), p.x, p.y + 8, flip, 1, Math.sin(clock * 12 + id) * 0.08);
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
        blit(ctx, shadowSprite(4), gx, gy + 4, 1 - h / 160, 1 - h / 160, 0, 0.7);
        // 目标点：朱红笔圈
        blit(ctx, ringSprite('vthin', id % 3), tx, ty, 0.2, 0.09, 0, 0.35 + 0.4 * k);
        blit(ctx, projSprite('firecracker'), gx, gy - h, 1, 1, clock * 12 + id);
        break;
      }
      case 'explosion': {
        const r = p.radius || 50;
        const e = 1 - (1 - k) * (1 - k);
        const fa = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
        blit(ctx, burstSprite(id), p.x, p.y, (r / 50) * (0.55 + 0.5 * e), (r / 50) * (0.55 + 0.5 * e) * 0.85, id, fa);
        blit(ctx, ringSprite('thin', id % 3), p.x, p.y, (r * (0.8 + 0.4 * e)) / 100, (r * (0.8 + 0.4 * e) * 0.85) / 100, 0, (1 - k) * 0.5);
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
        const path = (off) => {
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
              const j = ((((seed * 131 + i * 17 + s * 7) % 23) / 23) - 0.5) * 12;
              ctx.lineTo(a0.x + (b0.x - a0.x) * tt + (nx / l) * j + off, a0.y + (b0.y - a0.y) * tt + (ny / l) * j + off);
            }
            ctx.lineTo(b0.x + off, b0.y + off);
          }
        };
        ctx.strokeStyle = evolved ? VERM : INK;
        ctx.lineWidth = 2.2;
        path(0);
        ctx.stroke();
        ctx.strokeStyle = evolved ? INK : VERM;
        ctx.lineWidth = 1;
        path(low ? 0 : 1);
        ctx.stroke();
        ctx.restore();
        const bell = projSprite('bell');
        for (const q of pts) blit(ctx, bell, q.x, q.y - 4, 1, 1, Math.sin(clock * 20 + q.x) * 0.3, a);
        break;
      }
      case 'enemyBullet': {
        if (p.style === 'ink') blit(ctx, projSprite('inkBullet'), p.x, p.y, 1, 1, clock * 3 + id);
        else blit(ctx, projSprite('paperMoney'), p.x, p.y, Math.max(0.3, Math.abs(Math.cos(clock * 9 + id))), 1, id);
        break;
      }
      default: {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r || 3, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** 夜色：墨晕遮罩 + 灯笼光圈挖空；darkness ∈ [0,1] */
  function drawDarkness(darkness, lsx, lsy, camx, camy) {
    if (darkness <= 0.01) return;
    const dw = darkCanvas.width;
    const dh = darkCanvas.height;
    const g = darkCtx;
    const S = 1 / DARK_DOWN;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, dw, dh);
    // 墨从四周往里洇：夜越深，干净的中心越小、四周越浓
    const cx = dw / 2;
    const cy = dh / 2;
    const ink = RGB.ink;
    const i0 = Math.max(0.12, 0.6 - 0.5 * darkness);
    const midA = Math.min(0.95, 0.12 + 0.98 * darkness);
    const edgeA = Math.min(0.98, 0.3 + darkness * 0.85);
    g.save();
    // 竖屏：单位圆映射为过四角的椭圆（边中点约 0.707）
    g.translate(cx, cy);
    g.scale((dw / 2) * 1.4142, (dh / 2) * 1.4142);
    const grd = g.createRadialGradient(0, 0, i0, 0, 0, 1);
    grd.addColorStop(0, `rgba(${ink},${darkness * darkness * 0.3})`);
    grd.addColorStop(Math.max(0.05, (0.72 - i0) / (1 - i0)), `rgba(${ink},${midA})`);
    grd.addColorStop(1, `rgba(${ink},${edgeA})`);
    g.fillStyle = grd;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
    // 不均匀的墨云：只叠在已有墨色上（source-atop），随世界缓慢漂移
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
    // 灯笼光圈：挖空
    const flick = 1 + Math.sin(clock * 7.3) * 0.02 + Math.sin(clock * 17.1) * 0.012;
    const R = LANTERN_R * flick * S;
    const lx = lsx * S;
    const ly = lsy * S;
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createRadialGradient(lx, ly, R * 0.25, lx, ly, R * 1.25);
    cut.addColorStop(0, 'rgba(0,0,0,1)');
    cut.addColorStop(0.55, 'rgba(0,0,0,0.92)');
    cut.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cut;
    g.beginPath();
    g.arc(lx, ly, R * 1.3, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(darkCanvas, 0, 0, W, H);
  }

  /** 灯笼暖光：唯一的暖色光 */
  function drawLanternWarmth(lsx, lsy, darkness) {
    const flick = 1 + Math.sin(clock * 7.3) * 0.03 + Math.sin(clock * 23.7) * 0.015;
    const R = LANTERN_R * 1.05 * flick;
    const a = 0.07 + darkness * 0.2;
    const grd = ctx.createRadialGradient(lsx, lsy, 2, lsx, lsy, R);
    grd.addColorStop(0, lanternA(a * 1.6));
    grd.addColorStop(0.35, lanternA(a));
    grd.addColorStop(1, lanternA(0));
    ctx.fillStyle = grd;
    ctx.fillRect(lsx - R, lsy - R, R * 2, R * 2);
  }

  /* -------------------------------------------------------------- */

  function render(run, alpha = 1, realDt = 1 / 60, settings = {}) {
    if (!run || !run.player) return;
    frameNo++;
    const dt = Math.min(0.1, Math.max(0, realDt));
    clock += dt;
    fx.update(dt);
    if (groundSeed !== run.seed) {
      groundSeed = run.seed;
      ground.setSeed((run.seed >>> 0) || 1);
    }
    const newStep = run.time !== lastRunTime;
    lastRunTime = run.time;
    const al = Math.max(0, Math.min(1, alpha));

    const p = run.player;
    const ps = track('p', p.x, p.y, newStep);
    const pxI = ps.px + (ps.x - ps.px) * al;
    const pyI = ps.py + (ps.y - ps.py) * al;

    // 镜头平滑跟随
    if (!cam.init || Math.hypot(cam.x - pxI, cam.y - pyI) > 500) {
      cam.x = pxI;
      cam.y = pyI;
      cam.init = true;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      cam.x += (pxI - cam.x) * k;
      cam.y += (pyI - cam.y) * k;
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
      // 天亮：宣纸「亮」起来，地面墨色退淡
      ctx.fillStyle = paperA(0.32);
      ctx.fillRect(vx - 8, vy - 8, W + 16, H + 16);
    }
    fx.drawDecals(ctx);

    const evo = new Set();
    for (const w of run.weapons || []) if (w.evolved) evo.add(w.id);
    const ppos = { x: pxI, y: pyI };
    const M = 90;
    const inView = (x, y, m = M) => x > vx - m && x < vx + W + m && y > vy - m && y < vy + H + m * 1.6;

    // 地面层弹体
    const projs = run.projectiles || [];
    for (let i = 0; i < projs.length; i++) {
      const q = projs[i];
      if (GROUND_KINDS.has(q.kind)) drawProjectile(q, evo, run, ppos);
    }

    // 拾取物
    const pk = run.pickups || [];
    for (let i = 0; i < pk.length; i++) {
      const k = pk[i];
      if (inView(k.x, k.y, 30)) drawPickup(k, k.x, k.y);
    }

    // y 排序：物件 + 敌人 + 玩家
    drawList.length = 0;
    const props = run.props || [];
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.hp !== undefined && o.hp <= 0) continue;
      if (inView(o.x, o.y, 160)) drawList.push({ t: 0, o, y: o.y, x: o.x });
    }
    const ens = run.enemies || [];
    for (let i = 0; i < ens.length; i++) {
      const e = ens[i];
      const s = track(e.id, e.x, e.y, newStep);
      const x = s.px + (s.x - s.px) * al;
      const y = s.py + (s.y - s.py) * al;
      if (inView(x, y, e.boss ? 200 : M)) drawList.push({ t: 1, o: e, y, x });
    }
    drawList.push({ t: 2, o: p, y: pyI, x: pxI });
    drawList.sort((a, b) => a.y - b.y);
    let lantern = { lx: pxI + 7, ly: pyI };
    for (let i = 0; i < drawList.length; i++) {
      const d = drawList[i];
      if (d.t === 0) blit(ctx, propSprite(d.o.kind), d.x, d.y);
      else if (d.t === 1) drawEnemy(d.o, d.x, d.y, pxI, 1);
      else lantern = drawPlayer(p, d.x, d.y, run, 1, settings.cosmetics);
    }

    // 空中弹体
    for (let i = 0; i < projs.length; i++) {
      const q = projs[i];
      if (!GROUND_KINDS.has(q.kind) && inView(q.x ?? pxI, q.y ?? pyI, 120)) drawProjectile(q, evo, run, ppos);
    }
    fx.drawParticles(ctx);

    // ---------- 夜色 ----------
    const darkness = Math.max(0, Math.min(1, run.darkness || 0));
    const lsx = lantern.lx + ox;
    const lsy = lantern.ly + oy;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLanternWarmth(lsx, lsy, darkness);
    drawDarkness(darkness, lsx, lsy, cam.x, cam.y);

    // 黑暗中的眼：墨色敌人在夜色深处露出宣纸色的眼
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
        const kk = smooth01(LANTERN_R * 0.9, LANTERN_R * 2.2, dist) * darkness;
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

    // 天亮的朱红日印
    if (run.watch >= 6 && darkness <= 0.01) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      withSun(ctx, W, H);
    }

    // ---------- 伤害数字（世界坐标，夜色之上） ----------
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    dmg.draw(ctx, clock, settings.dmgText || 'all');

    // ---------- 屏幕层 ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
