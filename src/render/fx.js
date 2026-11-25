// fx.js —— 打击感：墨点飞溅、留白刀花与暴击星芒、纸屑 / 墨烟、混合方向震屏、顿帧、开光与奇遇墨晕、更次横幅
import { INK, VERM, PAPER, LANTERN, RGB, FONT_CN, vermA, paperA } from './palette.js';
import { makeRng, makeCanvas, brushStroke } from './ink.js';
import { dotSprite, scrapSprite, inkPoolSprite, puffSprite, blit } from './sprites.js';
import { normalizeAttackVfxId } from '../meta/cosmetics.js';
import { getVfxPalette } from './vfx-themes.js';

const TAU = Math.PI * 2;
const PAPER_TYPES = new Set(['paperkid', 'sedan', 'lanternghost', 'paperbride', 'suona', 'horse', 'umbrella']);
const CN_NUM = ['', '一', '二', '三', '四', '五'];
export const BOSS_NAMES = { horse: '纸马将军', umbrella: '无面伞女', youshen: '夜游神' };
export const BOSS_EPITHETS = {
  horse: '铁蹄踏纸，三冲夺命',
  umbrella: '撑伞隐月，纸钱满街',
  youshen: '执戟巡夜，五更决断',
};
export const EVOLVED_NAMES = {
  gong: '五更鸣锣',
  lantern: '长明灯',
  talisman: '天师符阵',
  brush: '泼墨山河',
  coinsword: '七星剑阵',
  paperman: '纸扎仪仗',
  firecracker: '满堂红',
  bell: '千铃引魂',
  compass: '天星定穴盘',
  soulbanner: '无常勾魂幡',
  bronze_mirror: '乾坤赤阳镜',
  paperhorse: '百鬼夜行图',
  taomujian: '天罡雷木剑阵',
  suohun_chain: '黑白无常夺魄索',
  zhinian_kite: '金乌焚天火鸦阵',
  nuo_drum: '太古百相傩坛',
  mourning_staff: '幽冥镇魂杆',
  sky_lantern: '九天赤焰灯',
  carpenter_line: '乾坤断魂线',
  luopan_slip: '天罡定穴签',
};

const SHAKE_CAP = 5.5; // 混合震屏峰值 CSS px（兼顾打击感与防眩晕）
const HITSTOP_MIN_GAP = 0.26;

export function createFx(opts = {}) {
  let low = !!opts.lowQuality;
  let activeVfx = normalizeAttackVfxId(opts.attackVfx || 'default');
  const rng = makeRng(opts.seed || 12345);
  const parts = [];
  const decals = [];
  const screen = [];
  let maxParts = low ? 220 : 650;
  let maxDecals = low ? 20 : 56;
  let trauma = 0;
  let kickX = 0;
  let kickY = 0;
  let hitstop = 0;
  let sinceHitstop = 1;
  let slowMoT = 0;
  let slowMoScale = 1;
  let time = 0;
  let vw = 390;
  let vh = 844;
  let scale = 2;

  function part(p) {
    if (parts.length >= maxParts) parts.shift();
    parts.push(p);
  }

  function drops(x, y, n, speed, color = 'ink', dir = null, spread = TAU, vfxTheme = 'default') {
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
        life: 0.22 + rng() * 0.28,
        size: 0.9 + rng() * 2.3,
        color,
        vfxTheme,
        stain: vfxTheme === 'default' && color === 'ink' && rng() < 0.25,
      });
    }
  }
  function slashSpark(x, y, crit = false, vfxTheme = 'default') {
    // 宣纸留白斩击花火 + 暴击朱砂十字星芒（非默认主题切换专属几何芒花）
    const a0 = rng() * Math.PI;
    part({
      k: 3,
      x,
      y: y - 8,
      vx: 0,
      vy: 0,
      t: 0,
      life: crit ? 0.16 : 0.11,
      rot: a0,
      size: crit ? 15 : 9,
      crit,
      vfxTheme,
    });
  }
  function scraps(x, y, n, color = 'paper') {
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const v = 40 + rng() * 115;
      part({
        k: 1,
        x,
        y: y - 8,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 42,
        t: 0,
        life: 0.58 + rng() * 0.58,
        rot: rng() * TAU,
        vr: (rng() - 0.5) * 14,
        idx: Math.floor(rng() * 4),
        color: rng() < 0.35 ? 'verm' : color,
        size: 0.72 + rng() * 0.62,
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

  function hasActiveBanner() {
    for (let i = 0; i < screen.length; i++) {
      if (screen[i].k === 'banner') return true;
    }
    return false;
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
    setAttackVfx(vfxId) {
      activeVfx = normalizeAttackVfxId(vfxId);
    },
    setViewport(w, h, s) {
      vw = w;
      vh = h;
      scale = s;
    },
    get hitstop() {
      return hitstop;
    },
    get timeScale() {
      return slowMoT > 0 ? slowMoScale : 1;
    },
    setSlowMo(dur, scaleVal = 0.35) {
      if (!(dur > 0) || !Number.isFinite(dur)) return;
      const clampedScale = Math.max(0.15, Math.min(1, Number.isFinite(scaleVal) ? scaleVal : 0.35));
      if (slowMoT <= 0 || clampedScale < slowMoScale) slowMoScale = clampedScale;
      slowMoT = Math.max(slowMoT, Math.min(2.0, dur));
    },
    addShake(a, dx = 0, dy = 0) {
      trauma = Math.min(1, trauma + a);
      if (dx || dy) {
        const l = Math.hypot(dx, dy) || 1;
        const amp = Math.min(3.2, a * 4.5);
        kickX = Math.max(-3.5, Math.min(3.5, kickX + (dx / l) * amp));
        kickY = Math.max(-3.5, Math.min(3.5, kickY + (dy / l) * amp));
      } else {
        const ang = rng() * TAU;
        const amp = Math.min(2.2, a * 2.6);
        kickX = Math.max(-3.5, Math.min(3.5, kickX + Math.cos(ang) * amp));
        kickY = Math.max(-3.5, Math.min(3.5, kickY + Math.sin(ang) * amp));
      }
    },
    addHitstop(s) {
      if (sinceHitstop < HITSTOP_MIN_GAP && s < 0.05) return;
      hitstop = Math.max(hitstop, Math.min(0.06, s));
      sinceHitstop = 0;
    },

    /** 处理一条 sim 事件（注意：hit 为对象池复用，严禁保留 e 引用！） */
    onEvent(e) {
      if (!e || typeof e !== 'object') return;
      const evTheme = e.attackVfx ? normalizeAttackVfxId(e.attackVfx) : activeVfx;
      switch (e.type) {
        case 'hit': {
          const hx = Number.isFinite(e.x) ? e.x : 0;
          const hy = Number.isFinite(e.y) ? e.y : 0;
          const crit = !!e.crit;
          const n = low ? 2 : crit ? 8 : 3;
          drops(hx, hy - 8, n, crit ? 185 : 115, crit ? (rng() < 0.65 ? 'verm' : 'paper') : 'ink', null, TAU, evTheme);
          if (!low || crit) slashSpark(hx, hy, crit, evTheme);
          if (crit) {
            this.addHitstop(0.03);
            this.addShake(0.16);
          }
          break;
        }
        case 'kill': {
          const kx = Number.isFinite(e.x) ? e.x : 0;
          const ky = Number.isFinite(e.y) ? e.y : 0;
          const isPaper = PAPER_TYPES.has(e.enemyType);
          const big = e.boss ? 3 : e.elite ? 1.8 : 1;
          if (isPaper) {
            scraps(kx, ky, Math.round((low ? 3 : 7) * big), e.enemyType === 'paperbride' ? 'verm' : 'paper');
            drops(kx, ky - 8, Math.round((low ? 2 : 4) * big), 125);
          } else {
            smoke(kx, ky, Math.round((low ? 2 : 4) * big), 12 * big);
            drops(kx, ky - 8, Math.round((low ? 3 : 7) * big), 150, e.enemyType === 'cinder' ? 'verm' : 'ink');
          }
          if (!low || e.elite || e.boss) decal(kx, ky + 4, 9 * big, isPaper ? 0.12 : 0.2);
          if (e.boss) {
            this.addHitstop(0.06);
            this.addShake(0.8);
          } else if (e.elite) {
            this.addHitstop(0.045);
            this.addShake(0.35);
          }
          break;
        }
        case 'explosion': {
          const ex = Number.isFinite(e.x) ? e.x : 0;
          const ey = Number.isFinite(e.y) ? e.y : 0;
          const rawRad = Number.isFinite(e.radius) && e.radius > 0 ? e.radius : 60;
          const rad = Math.max(24, Math.min(180, rawRad));
          const scaleK = Math.min(1.5, rad / 65);
          const expTheme = e.enemyOwned ? 'default' : evTheme;
          if (!low) {
            scraps(ex, ey, Math.round((e.evolved ? 7 : 4) * scaleK), 'verm');
            drops(ex, ey - 4, Math.round((e.evolved ? 8 : 5) * scaleK), 175, rng() < 0.5 ? 'lantern' : 'verm', null, TAU, expTheme);
          } else {
            drops(ex, ey - 4, 3, 140, 'verm', null, TAU, expTheme);
          }
          this.addShake((e.evolved ? 0.34 : 0.22) * scaleK);
          break;
        }
        case 'propBreak': {
          const px = Number.isFinite(e.x) ? e.x : 0;
          const py = Number.isFinite(e.y) ? e.y : 0;
          scraps(px, py - 20, low ? 4 : 10, 'paper');
          drops(px, py - 20, 6, 120, 'verm');
          this.addShake(0.16);
          break;
        }
        case 'playerHurt':
          this.addShake(0.32);
          screen.push({ k: 'hurt', t: 0, life: 0.36 });
          break;
        case 'shieldBlock':
          if (Number.isFinite(e.x) && Number.isFinite(e.y)) {
            drops(e.x, e.y - 10, low ? 3 : 6, 130, 'lantern');
          }
          this.addShake(0.14);
          break;
        case 'ult': {
          this.addShake(0.75);
          const bloomCol =
            e.heroId === 'mian' || e.heroId === 'tiejiang' || e.heroId === 'nuoxi'
              ? 'verm'
              : e.heroId === 'daotong' || e.heroId === 'yinyang'
                ? 'lantern'
                : 'ink';
          screen.push({ k: 'bloom', t: 0, life: 0.72, color: bloomCol, strength: 0.42 });
          break;
        }
        case 'levelup':
          screen.push({ k: 'bloom', t: 0, life: 0.75, color: 'ink', strength: 0.48 });
          break;
        case 'synergyUp':
          screen.push({ k: 'bloom', t: 0, life: 0.6, color: 'verm', strength: 0.24 });
          break;
        case 'shrineActivate':
          if (Number.isFinite(e.x) && Number.isFinite(e.y) && !low) {
            drops(e.x, e.y - 18, 8, 95, 'lantern');
            scraps(e.x, e.y - 12, 4, 'verm');
          }
          this.addShake(0.18);
          screen.push({ k: 'bloom', t: 0, life: 0.65, color: 'lantern', strength: 0.26 });
          break;
        case 'wave':
          screen.push({ k: 'wave', t: 0, life: 0.95 });
          if (!hasActiveBanner() && (e.count || 0) >= 8) {
            banner('阴风起', '群祟压境', INK, 1.45);
          }
          break;
        case 'warderSpawn':
          this.addShake(0.3);
          banner(e.name || '巡夜头目', '夜巡拦路', VERM, 1.85);
          break;
        case 'watch':
        case 'watchChange':
          if (Number.isFinite(e.watch) && e.watch >= 1 && e.watch <= 5) {
            const wIdx = Math.floor(e.watch);
            if (CN_NUM[wIdx]) banner(CN_NUM[wIdx] + '更', wIdx === 5 ? '天将破晓' : '夜色渐浓', INK);
          }
          break;
        case 'bossSpawn':
          this.setSlowMo(1.2, 0.35);
          this.addShake(0.45);
          screen.push({ k: 'bossVeil', t: 0, life: 1.25 });
          screen.push({ k: 'bloom', t: 0, life: 0.85, color: 'verm', strength: 0.34 });
          break;
        case 'bossKill':
        case 'bossDefeated':
          this.setSlowMo(0.8, 0.28);
          this.addHitstop(0.06);
          this.addShake(0.75);
          screen.push({ k: 'bloom', t: 0, life: 0.95, color: 'ink', strength: 0.52 });
          banner('破', BOSS_NAMES[e.bossType] || '', VERM, 1.8);
          break;
        case 'evolve':
          this.addHitstop(0.05);
          this.addShake(0.48);
          screen.push({ k: 'bloom', t: 0, life: 0.95, color: 'verm', strength: 0.42 });
          banner('开光', e.evoName || EVOLVED_NAMES[e.weaponId] || '', VERM, 2.1);
          break;
        case 'dawn':
          screen.push({ k: 'dawn', t: 0, life: 2.6 });
          banner('鸡鸣 · 天亮', '守夜功成', VERM, 3);
          break;
        case 'allyDowned':
          if (Number.isFinite(e.x) && Number.isFinite(e.y)) {
            drops(e.x, e.y - 8, low ? 4 : 8, 120, 'verm');
          }
          this.addShake(0.28);
          screen.push({ k: 'bloom', t: 0, life: 0.45, color: 'verm', strength: 0.24 });
          break;
        case 'coopRevive':
          if (Number.isFinite(e.x) && Number.isFinite(e.y)) {
            drops(e.x, e.y - 10, low ? 6 : 14, 175, 'lantern');
            scraps(e.x, e.y - 8, low ? 3 : 7, 'paper');
          }
          this.addShake(0.32);
          screen.push({ k: 'bloom', t: 0, life: 0.72, color: 'lantern', strength: 0.42 });
          break;
        case 'revive':
          this.addShake(0.4);
          screen.push({ k: 'bloom', t: 0, life: 0.9, color: 'lantern', strength: 0.55 });
          break;
        default:
          break;
      }
    },

    update(dt) {
      time += dt;
      sinceHitstop += dt;
      hitstop = Math.max(0, hitstop - dt);
      if (slowMoT > 0) {
        slowMoT = Math.max(0, slowMoT - dt);
        if (slowMoT === 0) slowMoScale = 1;
      }
      trauma = Math.max(0, trauma - dt * 2.1);
      const kd = Math.exp(-dt * 18);
      kickX *= kd;
      kickY *= kd;
      if (Math.abs(kickX) < 0.02) kickX = 0;
      if (Math.abs(kickY) < 0.02) kickY = 0;

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
        } else if (p.k === 2) {
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

    /** 混合方向震屏偏移（CSS px；settings.shake === false 时严格为 0） */
    shakeOffset(enabled = true) {
      if (!enabled || (trauma <= 0 && kickX === 0 && kickY === 0)) return { x: 0, y: 0 };
      const m = SHAKE_CAP * trauma * trauma;
      const ox = kickX + Math.sin(time * 71.3) * m + Math.sin(time * 37.1) * m * 0.35;
      const oy = kickY + Math.cos(time * 63.7) * m * 0.8;
      return {
        x: Math.max(-SHAKE_CAP, Math.min(SHAKE_CAP, ox)),
        y: Math.max(-SHAKE_CAP, Math.min(SHAKE_CAP, oy)),
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
          if (p.vfxTheme && p.vfxTheme !== 'default') {
            const pal = getVfxPalette(p.vfxTheme);
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - k * k);
            ctx.fillStyle = p.color === 'ink' ? pal.primary : pal.bright;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1.2, p.size * 1.15), 0, TAU);
            ctx.fill();
            ctx.restore();
          } else {
            const spr = dotSprite(p.size, p.color);
            const sp = Math.hypot(p.vx, p.vy);
            if (sp > 60) {
              const a = Math.atan2(p.vy, p.vx);
              blit(ctx, spr, p.x, p.y, 1 + sp / 160, 0.8, a, 1 - k * k);
            } else blit(ctx, spr, p.x, p.y, 1, 1, 0, 1 - k * k);
          }
        } else if (p.k === 1) {
          const spr = scrapSprite(p.idx, p.color);
          blit(ctx, spr, p.x, p.y, p.size, p.size * Math.abs(Math.cos(p.rot * 0.7)) + 0.2, p.rot, k > 0.7 ? (1 - k) / 0.3 : 1);
        } else if (p.k === 3) {
          // 留白斩击花火 / 暴击星芒（或五系专属矿物重彩命中芒花）
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = 1 - k;
          const len = p.size * (0.65 + 0.55 * k);
          if (p.vfxTheme && p.vfxTheme !== 'default') {
            const pal = getVfxPalette(p.vfxTheme);
            ctx.strokeStyle = pal.deep;
            ctx.lineWidth = p.crit ? 4.2 : 3.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-len, 0);
            ctx.lineTo(len, 0);
            ctx.moveTo(0, -len * 0.85);
            ctx.lineTo(0, len * 0.85);
            ctx.stroke();
            ctx.strokeStyle = p.crit ? pal.bright : pal.primary;
            ctx.lineWidth = p.crit ? 2.4 : 1.8;
            ctx.stroke();
          } else {
            ctx.strokeStyle = p.crit ? VERM : PAPER;
            ctx.lineWidth = p.crit ? 2.4 : 1.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-len, 0);
            ctx.lineTo(len, 0);
            if (p.crit) {
              ctx.moveTo(0, -len * 0.78);
              ctx.lineTo(0, len * 0.78);
            }
            ctx.stroke();
            if (p.crit) {
              ctx.fillStyle = LANTERN;
              ctx.beginPath();
              ctx.arc(0, 0, 2.4 * (1 - k), 0, TAU);
              ctx.fill();
            }
          }
          ctx.restore();
        } else {
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
          const R = Math.hypot(W, H) * (0.15 + 0.75 * (1 - (1 - k) * (1 - k)));
          const a = q.strength * (1 - k);
          const grd = ctx.createRadialGradient(W / 2, H / 2, R * 0.55, W / 2, H / 2, R);
          const col = q.color === 'verm' ? RGB.verm : q.color === 'lantern' ? RGB.lantern : RGB.ink;
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
        } else if (q.k === 'wave') {
          // 尸潮来袭：四周阴风淡朱墨晕脉动
          const a = 0.18 * Math.sin(k * Math.PI);
          const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) * 0.58);
          grd.addColorStop(0, vermA(0));
          grd.addColorStop(1, vermA(a));
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, W, H);
        } else if (q.k === 'bossVeil') {
          const fin = Math.min(1, q.t / 0.18);
          const fout = q.t > q.life - 0.35 ? (q.life - q.t) / 0.35 : 1;
          const a = 0.42 * Math.max(0, Math.min(fin, fout));
          ctx.fillStyle = `rgba(${RGB.ink},${a})`;
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

    clear() {
      parts.length = 0;
      decals.length = 0;
      screen.length = 0;
      trauma = 0;
      hitstop = 0;
      slowMoT = 0;
      slowMoScale = 1;
    },

    get counts() {
      return { particles: parts.length, decals: decals.length };
    },
  };
}
