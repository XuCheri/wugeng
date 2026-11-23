// hud.js —— Canvas HUD：笔触经验条 + 等级印、印章计时器、局内紧凑神兵法器与流派羁绊栏、朱印血量、更锣大招、Boss 血条横幅
import { INK, VERM, VERM_DARK, PAPER, PAPER_SHADE, LANTERN, FONT_CN, inkA, vermA, lanternA } from './palette.js';
import { makeCanvas, makeRng, brushStroke, roughRectPath, arcPoints, withMisreg, printSpeckle, softBlob } from './ink.js';
import { drawSeal, drawStamp, measureSeal } from './glyphs.js';
import { drawIcon } from './icons.js';
import { BOSS_NAMES } from './fx.js';

const TAU = Math.PI * 2;
const WATCH_CN = ['', '一更', '二更', '三更', '四更', '五更', '天亮'];
const SCHOOL_SHORT = { zhenhun: '镇', daofa: '道', zhizha: '纸', yangyan: '阳' };
const TIER_CN = { 2: '二', 4: '四', 6: '六' };

export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

export function watchLabel(run) {
  if (run.mode === 'endless') return '无尽';
  return WATCH_CN[run.watch] || '一更';
}

export function createHud() {
  let scale = 2;
  const cache = new Map();
  let ultRect = { x: 0, y: 0, w: 0, h: 0 };
  let lastXpFrac = 0;
  let xpFlash = 0;
  let lastLevel = -1;

  function cached(key, w, h, fn) {
    let c = cache.get(key);
    if (c) return c;
    c = makeCanvas(w * scale, h * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    fn(g);
    cache.set(key, c);
    if (cache.size > 320) cache.delete(cache.keys().next().value);
    return c;
  }

  /** 顶部撕边宣纸条 */
  function topStrip(W, h) {
    return cached(`strip|${W}|${h}`, W, h + 8, (g) => {
      const rng = makeRng(77);
      g.fillStyle = PAPER;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(W, 0);
      g.lineTo(W, h);
      for (let x = W; x >= 0; x -= 6) g.lineTo(x, h + (rng() - 0.3) * 4.5);
      g.closePath();
      g.fill();
      g.strokeStyle = inkA(0.28);
      g.lineWidth = 1;
      g.beginPath();
      const r2 = makeRng(77);
      g.moveTo(W, h);
      for (let x = W; x >= 0; x -= 6) g.lineTo(x, h + (r2() - 0.3) * 4.5);
      g.stroke();
      printSpeckle(g, W, h, rng, 0.002, 0.5);
    });
  }

  function xpStroke(len, frac) {
    const q = Math.round(frac * 120);
    return cached(`xp|${len}|${q}`, len + 20, 26, (g) => {
      brushStroke(g, [[6, 13], [len * 0.5, 12.4], [len + 6, 13.2]], 3.2, { color: inkA(0.28), seed: 3, dry: 0.5, taperIn: 0.05, taperOut: 0.1, startWidth: 0.9 });
      if (q > 0) {
        const L = (len * q) / 120;
        brushStroke(g, [[6, 13], [6 + L * 0.5, 12.2], [6 + L, 13]], 12, {
          color: INK,
          seed: 11,
          dry: 0.45,
          taperIn: Math.min(0.2, 12 / Math.max(12, L)),
          taperOut: Math.min(0.5, 40 / Math.max(40, L)),
          startWidth: 0.75,
          endWidth: 0.25,
          jitter: 0.6,
        });
      }
    });
  }

  function timerFrame(w, h) {
    return cached(`timer|${w}|${h}`, w + 6, h + 6, (g) => {
      const rng = makeRng(w + 5);
      g.fillStyle = PAPER;
      roughRectPath(g, 3, 3, w, h, rng, 0.8);
      g.fill();
      withMisreg(g, () => {
        g.strokeStyle = VERM;
        g.lineWidth = 2.4;
        roughRectPath(g, 3, 3, w, h, rng, 0.9);
        g.stroke();
        g.lineWidth = 0.9;
        roughRectPath(g, 6.5, 6.5, w - 7, h - 7, rng, 0.6);
        g.stroke();
      });
      printSpeckle(g, w + 6, h + 6, rng, 0.006, 0.7);
    });
  }

  function bossBanner(w) {
    return cached(`bossbn|${w}`, w + 10, 40, (g) => {
      const rng = makeRng(w);
      g.fillStyle = PAPER;
      g.beginPath();
      g.moveTo(5, 8);
      for (let x = 5; x <= w + 5; x += 7) g.lineTo(x, 6 + rng() * 2.5);
      g.lineTo(w + 5, 34);
      for (let x = w + 5; x >= 5; x -= 7) g.lineTo(x, 34 + rng() * 2.5);
      g.closePath();
      g.fill();
      g.strokeStyle = inkA(0.5);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = INK;
      g.fillRect(2, 5, 4, 31);
      g.fillRect(w + 4, 5, 4, 31);
    });
  }

  function hpFrame(s) {
    return cached(`hpf|${s}`, s + 8, s + 8, (g) => {
      const rng = makeRng(s * 3);
      withMisreg(g, () => {
        g.strokeStyle = VERM;
        g.lineWidth = 3;
        roughRectPath(g, 4, 4, s, s, rng, 1.2);
        g.stroke();
      });
    });
  }

  function gongFace(r) {
    return cached(`gong|${r}`, r * 2 + 16, r * 2 + 24, (g) => {
      const cx = r + 8;
      const cy = r + 16;
      withMisreg(g, () => {
        g.strokeStyle = VERM;
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx - r * 0.72, cy + r * 0.66);
        g.lineTo(cx - r * 0.86, cy + r * 0.66 + 10);
        g.moveTo(cx - r * 0.66, cy + r * 0.72);
        g.lineTo(cx - r * 0.74, cy + r * 0.72 + 9);
        g.stroke();
      });
      g.fillStyle = PAPER_SHADE;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.fill();
      brushStroke(g, arcPoints(cx, cy, r - 1, -1.8, -1.8 + TAU * 1.02, 0.06), 5.5, { seed: 9, dry: 0.35, taperIn: 0.05, taperOut: 0.2, startWidth: 0.9 });
      g.strokeStyle = inkA(0.55);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, r * 0.66, 0, TAU);
      g.stroke();
      printSpeckle(g, r * 2 + 16, r * 2 + 24, makeRng(r), 0.004, 0.6);
    });
  }

  /** 局内紧凑装备格缓存（位于顶栏计时印两侧 y=38..75，零遮挡中央世界视野） */
  function weaponSlotTile(w) {
    const lv = Math.max(1, Math.min(5, w.level || 1));
    const evo = !!w.evolved;
    return cached(`hudw|${w.id}|${lv}|${evo ? 1 : 0}`, 20, 20, (g) => {
      g.fillStyle = PAPER;
      g.fillRect(1, 1, 18, 18);
      if (evo) {
        g.fillStyle = lanternA(0.34);
        g.fillRect(2, 2, 16, 16);
        g.strokeStyle = VERM;
        g.lineWidth = 1.6;
        g.strokeRect(1.4, 1.4, 17.2, 17.2);
        g.fillStyle = VERM;
        g.beginPath();
        g.moveTo(13, 1);
        g.lineTo(19, 1);
        g.lineTo(19, 7);
        g.closePath();
        g.fill();
      } else {
        g.strokeStyle = INK;
        g.lineWidth = 1.15;
        g.strokeRect(1.4, 1.4, 17.2, 17.2);
      }
      drawIcon(g, evo ? 'evo' : 'weapon', w.id, 10, 8.8, 13.8);
      const dotCol = evo ? VERM : INK;
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i < lv ? dotCol : inkA(0.2);
        g.fillRect(3 + i * 2.9, 16.3, 2.1, 1.8);
      }
    });
  }

  function relicSlotTile(r) {
    const lv = Math.max(1, Math.min(5, r.level || 1));
    return cached(`hudr|${r.id}|${lv}`, 18, 18, (g) => {
      g.fillStyle = PAPER_SHADE;
      g.fillRect(1, 1, 16, 16);
      g.strokeStyle = INK;
      g.lineWidth = 1.05;
      g.strokeRect(1.4, 1.4, 15.2, 15.2);
      drawIcon(g, 'relic', r.id, 9, 8, 12.2);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i < lv ? VERM : inkA(0.2);
        g.fillRect(2.8 + i * 2.6, 14.6, 1.8, 1.6);
      }
    });
  }

  function synergyBadgeTile(tag, tier) {
    const sName = SCHOOL_SHORT[tag] || '印';
    const tName = TIER_CN[tier] || String(tier);
    const label = `${sName}${tName}`;
    return cached(`hudsyn|${tag}|${tier}`, 30, 16, (g) => {
      if (tier >= 4) {
        g.fillStyle = VERM;
        g.fillRect(1, 1, 28, 14);
        g.strokeStyle = tier >= 6 ? LANTERN : PAPER;
        g.lineWidth = tier >= 6 ? 1.3 : 0.8;
        g.strokeRect(2.2, 2.2, 25.6, 11.6);
        g.fillStyle = PAPER;
      } else {
        g.fillStyle = PAPER;
        g.fillRect(1, 1, 28, 14);
        g.strokeStyle = VERM;
        g.lineWidth = 1.3;
        g.strokeRect(1.5, 1.5, 27, 13);
        g.fillStyle = VERM;
      }
      g.font = `10px ${FONT_CN}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 15, 8.5);
    });
  }

  function drawLoadoutAndSynergies(ctx, run, W, st, timerLeft, timerRight) {
    const stripX = 8;
    const row1Y = st + 38;
    const row2Y = st + 58;
    const weapons = run.weapons || [];
    const relics = run.relics || [];

    // 计时器左侧第一行：4 武器槽 (18×18, 2px 间距 -> x=8..86)
    for (let i = 0; i < 4; i++) {
      const wx = stripX + i * 20;
      const w = weapons[i];
      if (w && w.id) {
        ctx.drawImage(weaponSlotTile(w), wx - 1, row1Y - 1, 20, 20);
      } else {
        ctx.strokeStyle = inkA(0.16);
        ctx.lineWidth = 1;
        ctx.strokeRect(wx + 0.5, row1Y + 0.5, 17, 17);
      }
    }

    // 计时器左侧第二行：4 法器槽 (16×16, 2px 间距 -> x=8..78)
    for (let i = 0; i < 4; i++) {
      const rx = stripX + i * 18;
      const r = relics[i];
      if (r && r.id) {
        ctx.drawImage(relicSlotTile(r), rx - 1, row2Y - 1, 18, 18);
      } else {
        ctx.strokeStyle = inkA(0.14);
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, row2Y + 0.5, 15, 15);
      }
    }

    // 流派羁绊印章 + 命签/魂障简标（优先排在计时器与暂停钮之间的顶栏空隙，不侵入下方世界画面）
    const activeSyns = run.synergies?.active || [];
    const blessingCount = run.blessings?.length || 0;
    const barrier = run.player?.soulBarrier || 0;
    if (!activeSyns.length && !blessingCount && !barrier) return;

    const badges = [];
    for (let i = 0; i < activeSyns.length; i++) {
      badges.push(synergyBadgeTile(activeSyns[i].tag, activeSyns[i].tier));
    }
    if (blessingCount > 0) {
      badges.push(
        cached(`hudbl|${blessingCount}`, 30, 16, (g) => {
          g.fillStyle = INK;
          g.fillRect(1, 1, 28, 14);
          g.strokeStyle = LANTERN;
          g.lineWidth = 1;
          g.strokeRect(2, 2, 26, 12);
          g.font = `9.5px ${FONT_CN}`;
          g.fillStyle = LANTERN;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(`签${blessingCount}`, 15, 8.5);
        })
      );
    }
    if (barrier > 0) {
      badges.push(
        cached(`hudsb|${barrier}`, 30, 16, (g) => {
          g.fillStyle = PAPER;
          g.fillRect(1, 1, 28, 14);
          g.strokeStyle = INK;
          g.lineWidth = 1.1;
          g.strokeRect(1.5, 1.5, 27, 13);
          g.font = `9.5px ${FONT_CN}`;
          g.fillStyle = INK;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(`障${barrier}`, 15, 8.5);
        })
      );
    }

    // 槽位：计时印右侧与暂停键之间的两行，以及左侧空余角位
    const rxStart = timerRight + (run.mode === 'endless' ? 24 : 5);
    const maxRight = W - 56;
    const slots = [];
    if (rxStart + 28 <= maxRight) {
      slots.push([rxStart, row1Y], [rxStart, row2Y]);
      if (rxStart + 59 <= maxRight) {
        slots.push([rxStart + 31, row1Y], [rxStart + 31, row2Y]);
      }
    }
    if (stripX + 82 + 28 <= timerLeft) {
      slots.push([stripX + 80, row1Y], [stripX + 74, row2Y]);
    }
    for (let i = 0; i < badges.length && i < slots.length; i++) {
      const [bx, by] = slots[i];
      ctx.drawImage(badges[i], bx - 1, by - 1, 30, 16);
    }
  }

  return {
    setScale(s) {
      if (s !== scale) {
        scale = s;
        cache.clear();
      }
    },
    getUltButtonRect() {
      return { ...ultRect };
    },

    draw(ctx, run, W, H, t, settings = {}) {
      const st = settings.safeTop || 0;
      const sb = settings.safeBottom || 0;
      const p = run.player;

      /* ---------- 顶部：经验条 + 等级印 ---------- */
      const stripH = 34 + st;
      ctx.drawImage(topStrip(W, stripH), 0, 0, W, stripH + 8);
      const frac = p.xpNext > 0 ? Math.max(0, Math.min(1, p.xp / p.xpNext)) : 0;
      if (p.level !== lastLevel) {
        if (lastLevel >= 0) xpFlash = 0.5;
        lastLevel = p.level;
      }
      lastXpFrac += (frac - lastXpFrac) * Math.min(1, 0.25);
      if (frac < lastXpFrac - 0.3) lastXpFrac = frac;
      xpFlash = Math.max(0, xpFlash - 1 / 60);
      const lvStr = String(p.level);
      const lvSize = 13;
      const barX = 54;
      const barLen = Math.round(W - barX - 18);
      ctx.drawImage(xpStroke(barLen, lastXpFrac), barX - 6, st + 4, barLen + 20, 26);
      drawStamp(ctx, lvStr, 28, st + 17, lvSize, { seed: 3, rot: -0.04 });
      ctx.font = `10px ${FONT_CN}`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('级', 28 + measureSeal(lvStr, lvSize) / 2 + 13, st + 23);

      /* ---------- 印章计时器 ---------- */
      const label = watchLabel(run);
      const clock = formatClock(run.time);
      const cnSize = 16;
      const dSize = 14;
      ctx.font = `${cnSize}px ${FONT_CN}`;
      const labelW = ctx.measureText(label).width;
      const clockW = measureSeal(clock, dSize);
      const innerW = labelW + 16 + clockW;
      const tw = Math.round(innerW + 26);
      const th = 30;
      const tx = Math.round(W / 2 - tw / 2);
      const ty = st + 42;
      ctx.drawImage(timerFrame(tw, th), tx - 3, ty - 3, tw + 6, th + 6);
      const lx = W / 2 - innerW / 2;
      ctx.fillStyle = VERM;
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, ty + th / 2 + 1);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(lx + labelW + 8, ty + th / 2, 1.6, 0, TAU);
      ctx.fill();
      drawSeal(ctx, clock, lx + labelW + 16, ty + th / 2, dSize, INK, 'left');
      if (run.mode === 'endless') {
        drawStamp(ctx, String(Math.max(1, Math.floor((run.time - 600) / 60) + 1)), tx + tw + 14, ty + th / 2, 10, { seed: 5, rot: 0.08 });
      }

      /* ---------- 顶栏两侧紧凑装备与流派羁绊栏（T1-F11-03） ---------- */
      drawLoadoutAndSynergies(ctx, run, W, st, tx - 3, tx + tw + 3);

      /* ---------- Boss 血条横幅 ---------- */
      if (run.boss) {
        const bw = Math.round(W - 36);
        const bx = 18;
        const by = ty + th + 10;
        ctx.drawImage(bossBanner(bw), bx - 5, by, bw + 10, 40);
        const name = run.boss.name || BOSS_NAMES[run.boss.type] || BOSS_NAMES[run.boss.id] || '夜主';
        ctx.font = `15px ${FONT_CN}`;
        const nameW = ctx.measureText(name).width;
        const hpx = bx + nameW + 22;
        const hpLen = Math.max(40, bw - nameW - 34);
        const bf = run.boss.maxHp > 0 ? Math.max(0, Math.min(1, run.boss.hp / run.boss.maxHp)) : 0;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = VERM;
        ctx.fillRect(hpx, by + 17, hpLen, 6);
        ctx.restore();
        const q = Math.round(bf * 80);
        const img = cached(`bosshp|${hpLen}|${q}`, hpLen + 12, 24, (g) => {
          if (q <= 0) return;
          const L = (hpLen * q) / 80;
          brushStroke(g, [[4, 12], [4 + L * 0.5, 11.2], [4 + L, 12.4]], 13, { color: VERM, seed: 21, dry: 0.45, taperIn: 0.1, taperOut: Math.min(0.4, 30 / Math.max(30, L)), startWidth: 0.85, endWidth: 0.3 });
        });
        withMisreg(ctx, () => ctx.drawImage(img, hpx - 4, by + 8, hpLen + 12, 24));
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.fillText(name, bx + 10, by + 21);
        const phase = run.boss.phase || 1;
        if (run.boss.type === 'youshen') {
          for (let i = 1; i <= 3; i++) {
            ctx.fillStyle = i <= phase ? INK : inkA(0.25);
            ctx.fillRect(bx + bw - 10 - (3 - i) * 7, by + 30, 4, 4);
          }
        }
      }

      /* ---------- 左下：朱印血量 ---------- */
      const hs = 58;
      let hx = 18;
      const hy = H - sb - 18 - hs;
      const hpFrac = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
      if (p.hurtT > 0) hx += Math.sin(t * 90) * 2.5 * Math.min(1, p.hurtT * 4);
      const low = hpFrac < 0.3;
      const fillCol = p.hurtT > 0 ? VERM_DARK : VERM;
      ctx.fillStyle = PAPER;
      ctx.fillRect(hx + 2, hy + 2, hs - 4, hs - 4);
      const fillH = Math.round((hs - 6) * hpFrac);
      withMisreg(ctx, () => {
        ctx.fillStyle = fillCol;
        ctx.fillRect(hx + 3, hy + 3 + (hs - 6 - fillH), hs - 6, fillH);
      });
      ctx.drawImage(hpFrame(hs), hx - 4, hy - 4, hs + 8, hs + 8);
      const hpStr = String(Math.max(0, Math.ceil(p.hp)));
      const hpSize = hpStr.length >= 4 ? 13 : 17;
      const cy = hy + hs / 2 + 3;
      const cutY = hy + 3 + (hs - 6 - fillH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(hx, hy, hs, cutY - hy);
      ctx.clip();
      drawSeal(ctx, hpStr, hx + hs / 2, cy, hpSize, VERM, 'center');
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(hx, cutY, hs, hy + hs - cutY);
      ctx.clip();
      drawSeal(ctx, hpStr, hx + hs / 2, cy, hpSize, PAPER, 'center');
      ctx.restore();
      ctx.font = `11px ${FONT_CN}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hpFrac > 0.82 ? PAPER : VERM;
      ctx.fillText('命', hx + hs / 2, hy + 11);
      if (low) {
        const a = 0.35 + 0.35 * Math.sin(t * 8);
        ctx.strokeStyle = vermA(a);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hx - 7, hy - 7, hs + 14, hs + 14);
      }

      /* ---------- 右下：更锣大招 ---------- */
      const r = 34;
      const gx = W - 22 - r;
      const gy = H - sb - 22 - r;
      ultRect = { x: gx - r - 10, y: gy - r - 18, w: r * 2 + 20, h: r * 2 + 28 };
      const uf = p.ultMax > 0 ? Math.max(0, Math.min(1, p.ult / p.ultMax)) : 0;
      const full = uf >= 1;
      ctx.save();
      ctx.translate(gx, gy - r * 0.2);
      if (full) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        const img = softBlob(128, 'ink');
        const R = r * (1.75 + pulse * 0.25);
        ctx.globalAlpha = 0.32 + pulse * 0.18;
        ctx.drawImage(img, -R, -R + r * 0.2, R * 2, R * 2);
        ctx.globalAlpha = 1;
        ctx.rotate(Math.sin(t * 9) * 0.07);
      }
      ctx.translate(0, r * 0.2);
      const face = gongFace(r);
      ctx.drawImage(face, -r - 8, -r - 16, r * 2 + 16, r * 2 + 24);
      if (uf > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r - 3.5, 0, TAU);
        ctx.clip();
        const fh = (r * 2 - 7) * uf;
        const wave = Math.sin(t * 3) * 1.5;
        ctx.fillStyle = full ? INK : inkA(0.82);
        ctx.beginPath();
        ctx.moveTo(-r, r);
        ctx.lineTo(-r, r - fh - wave);
        ctx.quadraticCurveTo(0, r - fh + wave * 2, r, r - fh - wave);
        ctx.lineTo(r, r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = full ? VERM : PAPER_SHADE;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.26, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = `${full ? 19 : 15}px ${FONT_CN}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = full ? PAPER : INK;
      ctx.fillText('敲', 0, 1);
      ctx.restore();
      if (full) {
        brushStroke(ctx, [[gx + r + 4, gy - r - 8], [gx + r * 0.6, gy - r * 0.4]], 4, { seed: 31, dry: 0.2, taperIn: 0.05, taperOut: 0.1 });
        ctx.fillStyle = VERM;
        ctx.beginPath();
        ctx.arc(gx + r * 0.55, gy - r * 0.35, 4.5, 0, TAU);
        ctx.fill();
      }
    },
  };
}
