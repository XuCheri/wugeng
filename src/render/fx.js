// fx.js —— 打击感：墨点飞溅、纸屑 / 墨烟、地面墨渍、震屏（有上限、可关）、顿帧、升级墨晕、更次横幅
import { INK, VERM, PAPER, FONT_CN, inkA, vermA, paperA } from './palette.js';
import { makeRng, makeCanvas, brushStroke, softBlob } from './ink.js';
import { dotSprite, scrapSprite, inkPoolSprite, puffSprite, blit } from './sprites.js';

const TAU = Math.PI * 2;
const PAPER_TYPES = new Set(['paperkid', 'sedan', 'lanternghost', 'horse', 'umbrella']);
const CN_NUM = ['', '一', '二', '三', '四', '五'];
export const BOSS_NAMES = { horse: '纸马将军', umbrella: '无面伞女', youshen: '夜游神' };
export const EVOLVED_NAMES = {
  gong: '五更鸣锣',
  lantern: '长明灯',
  talisman: '天师符阵',
  brush: '泼墨山河',
  coinsword: '七星剑阵',
  paperman: '纸扎仪仗',
  firecracker: '满堂红',
  bell: '千铃引魂',
};

const SHAKE_CAP = 7; // px
const HITSTOP_MIN_GAP = 0.3;

export function createFx(opts = {}) {
  let low = !!opts.lowQuality;
  const rng = makeRng(opts.seed || 12345);
  const parts = [];
  const decals = [];
  const screen = [];
  let maxParts = low ? 220 : 650;
  let maxDecals = low ? 20 : 56;
  let trauma = 0;
  let hitstop = 0;
  let sinceHitstop = 1;
  let time = 0;
  let vw = 390;
  let vh = 844;
  let scale = 2;

  function part(p) {
    if (parts.length >= maxParts) parts.shift();
    parts.push(p);
  }

  function drops(x, y, n, speed, color = 'ink', dir = null, spread = TAU) {
    for (let i = 0; i < n; i++) {
      const a = dir == null ? rng() * TAU : dir + (rng() - 0.5) * spread;
      const v = speed * (0.35 + rng() * 0.85);
      part({
        k: 0,
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: 0,
        life: 0.25 + rng() * 0.3,
        size: 0.8 + rng() * 2.2,
        color,
        stain: rng() < 0.25,
      });
    }
  }
  function scraps(x, y, n, color = 'paper') {
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const v = 40 + rng() * 110;
      part({
        k: 1,
        x,
        y: y - 8,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        t: 0,
        life: 0.6 + rng() * 0.6,
        rot: rng() * TAU,
        vr: (rng() - 0.5) * 14,
        idx: Math.floor(rng() * 4),
        color: rng() < 0.3 ? 'verm' : color,
        size: 0.7 + rng() * 0.6,
      });
    }
  }
  function smoke(x, y, n, size = 14) {
    for (let i = 0; i < n; i++) {
      part({
        k: 2,
        x: x + (rng() - 0.5) * size,
        y: y - 6 + (rng() - 0.5) * size * 0.6,
        vx: (rng() - 0.5) * 20,
        vy: -12 - rng() * 18,
        t: 0,
        life: 0.5 + rng() * 0.4,
        size: size * (0.6 + rng() * 0.6),
        idx: Math.floor(rng() * 3),
        rot: rng() * TAU,
      });
    }
  }
  function decal(x, y, r, alpha = 0.2) {
    if (decals.length >= maxDecals) decals.shift();
    decals.push({ x, y, r, t: 0, life: 7, alpha, seed: Math.floor(rng() * 4), rot: rng() * TAU });
  }

  function makeBanner(text, sub, color) {
    const w = Math.min(vw * 0.92, 360);
    const h = 74;
    const c = makeCanvas(w * scale, h * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    brushStroke(g, [[w * 0.04, h * 0.5], [w * 0.5, h * 0.47], [w * 0.96, h * 0.52]], 46, {
      color,
      seed: text.length * 31 + 7,
      dry: 0.55,
      taperIn: 0.12,
      taperOut: 0.3,
      startWidth: 0.7,
      jitter: 0.8,
    });
    g.fillStyle = PAPER;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `30px ${FONT_CN}`;
    g.fillText(text, w / 2, h * 0.47);
    if (sub) {
      g.font = `12px ${FONT_CN}`;
      g.fillStyle = color === VERM ? INK : VERM;
      g.fillText(sub, w / 2, h * 0.9);
    }
    return { canvas: c, w, h };
  }

  function banner(text, sub, color = INK, dur = 2.2) {
    screen.push({ k: 'banner', t: 0, life: dur, text, sub, color, img: null });
  }

  return {
    setLowQuality(v) {
      low = !!v;
      maxParts = low ? 220 : 650;
      maxDecals = low ? 20 : 56;
    },
    setViewport(w, h, s) {
      vw = w;
      vh = h;
      scale = s;
    },
    get hitstop() {
      return hitstop;
    },
    addShake(a) {
      trauma = Math.min(1, trauma + a);
    },
    addHitstop(s) {
      if (sinceHitstop < HITSTOP_MIN_GAP && s < 0.06) return;
      hitstop = Math.max(hitstop, Math.min(0.06, s));
      sinceHitstop = 0;
    },

    /** 处理一条 sim 事件 */
    onEvent(e) {
      switch (e.type) {
        case 'hit': {
          const n = low ? 2 : e.crit ? 7 : 3;
          drops(e.x, e.y - 8, n, e.crit ? 170 : 110, e.crit && rng() < 0.5 ? 'verm' : 'ink');
          if (e.crit) {
            this.addHitstop(0.03);
            this.addShake(0.12);
          }
          break;
        }
        case 'kill': {
          const isPaper = PAPER_TYPES.has(e.enemyType);
          const big = e.boss ? 3 : e.elite ? 1.8 : 1;
          if (isPaper) {
            scraps(e.x, e.y, Math.round((low ? 3 : 7) * big));
            drops(e.x, e.y - 8, Math.round((low ? 2 : 4) * big), 120);
          } else {
            smoke(e.x, e.y, Math.round((low ? 2 : 4) * big), 12 * big);
            drops(e.x, e.y - 8, Math.round((low ? 3 : 7) * big), 150);
          }
          if (!low || e.elite || e.boss) decal(e.x, e.y + 4, 9 * big, isPaper ? 0.12 : 0.2);
          if (e.boss) {
            this.addHitstop(0.06);
            this.addShake(0.8);
          } else if (e.elite) {
            this.addHitstop(0.045);
            this.addShake(0.35);
          }
          break;
        }
        case 'propBreak':
          scraps(e.x, e.y - 20, low ? 4 : 10, 'paper');
          drops(e.x, e.y - 20, 6, 120, 'verm');
          this.addShake(0.15);
          break;
        case 'playerHurt':
          this.addShake(0.22);
          screen.push({ k: 'hurt', t: 0, life: 0.35 });
          break;
        case 'ult':
          this.addShake(0.75);
          screen.push({ k: 'bloom', t: 0, life: 0.7, color: 'ink', strength: 0.4 });
          break;
        case 'levelup':
          screen.push({ k: 'bloom', t: 0, life: 0.75, color: 'ink', strength: 0.5 });
          break;
        case 'watchChange':
          if (e.watch >= 1 && e.watch <= 5) banner(CN_NUM[e.watch] + '更', e.watch === 5 ? '天将破晓' : '夜色渐浓', INK);
          break;
        case 'bossSpawn':
          this.addShake(0.4);
          banner(BOSS_NAMES[e.bossType] || '夜主', '夜主现身', VERM, 2.4);
          break;
        case 'bossDefeated':
          banner('破', BOSS_NAMES[e.bossType] || '', INK, 1.6);
          break;
        case 'evolve':
          screen.push({ k: 'bloom', t: 0, life: 0.9, color: 'verm', strength: 0.35 });
          banner('开光', EVOLVED_NAMES[e.weaponId] || '', VERM, 2);
          break;
        case 'dawn':
          screen.push({ k: 'dawn', t: 0, life: 2.6 });
          banner('鸡鸣 · 天亮', '守夜功成', VERM, 3);
          break;
        case 'revive':
          screen.push({ k: 'bloom', t: 0, life: 0.9, color: 'ink', strength: 0.6 });
          break;
        default:
          break;
      }
    },

    update(dt) {
      time += dt;
      sinceHitstop += dt;
      hitstop = Math.max(0, hitstop - dt);
      trauma = Math.max(0, trauma - dt * 2.2);
      let w = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) {
          if (p.k === 0 && p.stain && !low) decal(p.x, p.y, p.size * 0.9, 0.22);
          continue;
        }
        if (p.k === 0) {
          const d = Math.exp(-dt * 7);
          p.vx *= d;
          p.vy *= d;
        } else if (p.k === 1) {
          p.vx *= Math.exp(-dt * 3);
          p.vy = p.vy * Math.exp(-dt * 3) + 60 * dt;
          p.rot += p.vr * dt;
        } else {
          p.vx *= Math.exp(-dt * 2);
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        parts[w++] = p;
      }
      parts.length = w;
      let d = 0;
      for (let i = 0; i < decals.length; i++) {
        const q = decals[i];
        q.t += dt;
        if (q.t < q.life) decals[d++] = q;
      }
      decals.length = d;
      let s = 0;
      for (let i = 0; i < screen.length; i++) {
        const q = screen[i];
        q.t += dt;
        if (q.t < q.life) screen[s++] = q;
      }
      screen.length = s;
    },

    /** 震屏偏移（CSS px） */
    shakeOffset(enabled = true) {
      if (!enabled || trauma <= 0) return { x: 0, y: 0 };
      const m = SHAKE_CAP * trauma * trauma;
      return {
        x: Math.sin(time * 71.3) * m + Math.sin(time * 37.1) * m * 0.4,
        y: Math.cos(time * 63.7) * m * 0.8,
      };
    },

    /** 地面墨渍（世界坐标） */
    drawDecals(ctx) {
      for (const q of decals) {
        const a = q.alpha * (q.t > q.life - 2 ? (q.life - q.t) / 2 : 1);
        const spr = inkPoolSprite(q.seed);
        const s = q.r / 50;
        blit(ctx, spr, q.x, q.y, s, s * 0.6, 0, a);
      }
    },

    /** 粒子（世界坐标） */
    drawParticles(ctx) {
      for (const p of parts) {
        const k = p.t / p.life;
        if (p.k === 0) {
          const spr = dotSprite(p.size, p.color);
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 60) {
            const a = Math.atan2(p.vy, p.vx);
            blit(ctx, spr, p.x, p.y, 1 + sp / 160, 0.8, a, 1 - k * k);
          } else blit(ctx, spr, p.x, p.y, 1, 1, 0, 1 - k * k);
        } else if (p.k === 1) {
          const spr = scrapSprite(p.idx, p.color);
          blit(ctx, spr, p.x, p.y, p.size, p.size * Math.abs(Math.cos(p.rot * 0.7)) + 0.2, p.rot, k > 0.7 ? (1 - k) / 0.3 : 1);
        } else {
          // 墨烟：硬边墨团，上飘、变淡、略缩
          const spr = puffSprite(p.idx || 0);
          const sz = (p.size / 20) * (1 + k * 0.5) * (1 - k * 0.35);
          blit(ctx, spr, p.x, p.y, sz, sz, p.rot || 0, 0.75 * (1 - k) * (1 - k));
        }
      }
    },

    /** 屏幕空间特效（CSS px） */
    drawScreen(ctx, W, H) {
      for (const q of screen) {
        const k = q.t / q.life;
        if (q.k === 'bloom') {
          // 墨从屏幕中心晕开
          const R = Math.hypot(W, H) * (0.15 + 0.75 * (1 - (1 - k) * (1 - k)));
          const a = q.strength * (1 - k);
          const grd = ctx.createRadialGradient(W / 2, H / 2, R * 0.55, W / 2, H / 2, R);
          const col = q.color === 'verm' ? [194, 59, 38] : [28, 26, 23];
          grd.addColorStop(0, `rgba(${col},0)`);
          grd.addColorStop(0.75, `rgba(${col},${a})`);
          grd.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, W, H);
        } else if (q.k === 'hurt') {
          const a = 0.32 * (1 - k);
          const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
          grd.addColorStop(0, vermA(0));
          grd.addColorStop(1, vermA(a));
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, W, H);
        } else if (q.k === 'dawn') {
          ctx.fillStyle = paperA(0.85 * (1 - k) * (1 - k));
          ctx.fillRect(0, 0, W, H);
        } else if (q.k === 'banner') {
          if (!q.img) q.img = makeBanner(q.text, q.sub, q.color);
          const fin = Math.min(1, q.t / 0.25);
          const fout = q.t > q.life - 0.5 ? (q.life - q.t) / 0.5 : 1;
          const a = Math.min(fin, fout);
          const sx = 0.85 + 0.15 * (1 - (1 - fin) * (1 - fin));
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(W / 2, H * 0.3);
          ctx.scale(sx, 1);
          ctx.drawImage(q.img.canvas, -q.img.w / 2, -q.img.h / 2, q.img.w, q.img.h);
          ctx.restore();
        }
      }
    },

    get counts() {
      return { particles: parts.length, decals: decals.length };
    },
  };
}
