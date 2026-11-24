// vfx-themes.js —— 5 套几何形态与国画矿物重彩截然不同的玩家攻击特效主题（F6）
// 安全铁律：
//   1. default（古墨朱砂）100% 走原版 6 色暖木版画分支，零冷色；
//   2. 仅作用于我方兵刃/法阵/刀光/拖尾/受击爆点，敌方弹幕（enemyBullet/cinderCore）与红圈预警严守 #C23B26 朱砂红！
import { INK, PAPER, VERM, LANTERN } from './palette.js';
import { makeCanvas, makeRng, hashStr } from './ink.js';
import { normalizeAttackVfxId } from '../meta/cosmetics.js';

const TAU = Math.PI * 2;

export const VFX_PALETTES = {
  default: {
    id: 'default',
    deep: INK,
    primary: VERM,
    bright: LANTERN,
    core: PAPER,
    glowRgba: (a) => `rgba(194,59,38,${a})`,
  },
  jade_ghostfire: {
    id: 'jade_ghostfire',
    deep: '#0D5E44',      // 深石绿墨底 (luma ~66)
    primary: '#189E72',   // 青冥石绿 (24,158,114 -> jade bucket, luma ~113)
    bright: '#2CC994',    // 幽火磷翠 (44,201,148 -> jade bucket, luma ~148)
    core: '#EFE6D2',
    glowRgba: (a) => `rgba(24,158,114,${a})`,
  },
  violet_thunder: {
    id: 'violet_thunder',
    deep: '#461E82',      // 天罡深紫 (luma ~53)
    primary: '#7E38D8',   // 紫电重彩 (126,56,216 -> violet bucket, luma ~95)
    bright: '#9C52F2',    // 雷弧亮紫 (156,82,242 -> violet bucket, luma ~122)
    core: '#F0BE62',
    glowRgba: (a) => `rgba(126,56,216,${a})`,
  },
  gilded_imperial: {
    id: 'gilded_imperial',
    deep: '#6E3812',      // 赤铜篆底 (luma ~68)
    primary: '#DC9824',   // 帝王鎏金 (220,152,36 -> gold bucket, luma ~159)
    bright: '#EEA832',    // 日冕赤金 (238,168,50 -> gold bucket, luma ~175)
    core: '#C23B26',
    glowRgba: (a) => `rgba(220,152,36,${a})`,
  },
  frost_moon: {
    id: 'frost_moon',
    deep: '#14487A',      // 寒渊深青 (luma ~62)
    primary: '#2486D2',   // 玄霜石青 (36,134,210 -> azure bucket, luma ~113)
    bright: '#3AA2EA',    // 寒月冰蓝 (58,162,234 -> azure bucket, luma ~139)
    core: '#EFE6D2',
    glowRgba: (a) => `rgba(36,134,210,${a})`,
  },
};

let SCALE = 2;
const vfxCache = new Map();

export function setVfxScale(s) {
  const v = Math.max(1, Math.min(3, s || 1));
  if (v !== SCALE) {
    SCALE = v;
    vfxCache.clear();
  }
}

export function clearVfxCache() {
  vfxCache.clear();
}

export function getVfxPalette(themeId) {
  const norm = normalizeAttackVfxId(themeId);
  return VFX_PALETTES[norm] || VFX_PALETTES.default;
}

function bakeVfx(key, w, h, ax, ay, drawFn) {
  let s = vfxCache.get(key);
  if (s) return s;
  const c = makeCanvas(w * SCALE, h * SCALE);
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  g.save();
  g.translate(ax, ay);
  drawFn(g, makeRng(hashStr(key) + 31));
  g.restore();
  s = { canvas: c, w, h, ax, ay };
  vfxCache.set(key, s);
  return s;
}

function strokeCfg(g, lw, color) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
}

function poly(g, pts, close = true) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) g.moveTo(pts[i][0], pts[i][1]);
    else g.lineTo(pts[i][0], pts[i][1]);
  }
  if (close) g.closePath();
}

/* ------------------------------------------------------------------ */
/* 1. 震波法环（基准半径 R=100，4 套非默认主题几何完全重塑）            */
/* ------------------------------------------------------------------ */

export function vfxRingSprite(themeId, seed = 0) {
  const norm = normalizeAttackVfxId(themeId);
  const pal = getVfxPalette(norm);
  const R = 100;
  const pad = 42;
  const dim = (R + pad) * 2;
  const center = R + pad;

  return bakeVfx(`vfx_ring|${norm}|${seed % 3}`, dim, dim, center, center, (g) => {
    if (norm === 'jade_ghostfire') {
      // 青冥幽火：三叶旋风鬼火风车（三道狭长青碧磷火弯刃直刺 1.16R + 三处无遮挡直通 0.18R 的深幽豁口）
      for (let i = 0; i < 3; i++) {
        const baseA = (i / 3) * TAU + seed * 0.42;
        const midA = baseA + 0.22;
        const tipA = baseA + 0.42;
        poly(g, [
          [Math.cos(baseA - 0.10) * R * 0.18, Math.sin(baseA - 0.10) * R * 0.18],
          [Math.cos(baseA + 0.04) * R * 0.62, Math.sin(baseA + 0.04) * R * 0.62],
          [Math.cos(midA - 0.04) * R * 0.96, Math.sin(midA - 0.04) * R * 0.96],
          [Math.cos(tipA) * R * 1.16, Math.sin(tipA) * R * 1.16],
          [Math.cos(midA + 0.18) * R * 0.80, Math.sin(midA + 0.18) * R * 0.80],
          [Math.cos(baseA + 0.28) * R * 0.40, Math.sin(baseA + 0.28) * R * 0.40],
          [Math.cos(baseA + 0.14) * R * 0.18, Math.sin(baseA + 0.14) * R * 0.18],
        ]);
        g.fillStyle = pal.primary;
        g.fill();
        strokeCfg(g, 3.5, pal.deep);
        g.stroke();

        // 刃脊亮色磷火流芯
        g.beginPath();
        g.moveTo(Math.cos(baseA + 0.03) * R * 0.24, Math.sin(baseA + 0.03) * R * 0.24);
        g.quadraticCurveTo(
          Math.cos(midA + 0.04) * R * 0.78,
          Math.sin(midA + 0.04) * R * 0.78,
          Math.cos(tipA) * R * 1.10,
          Math.sin(tipA) * R * 1.10,
        );
        strokeCfg(g, 5, pal.bright);
        g.stroke();
      }
      // 中心三角幽冥火眼
      poly(g, Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * TAU + seed * 0.42;
        return [Math.cos(a) * R * 0.20, Math.sin(a) * R * 0.20];
      }));
      g.fillStyle = pal.bright;
      g.fill();
      strokeCfg(g, 3.5, pal.deep);
      g.stroke();
      return;
    }

    if (norm === 'violet_thunder') {
      // 紫电天罡：八芒锯齿雷戟星阵（深谷 0.48R ↔ 尖刺 1.30R 剧烈折线 + 贯心十字雷弧）
      const pts = [];
      const spikes = 8;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU + seed * 0.25;
        const rr = i % 2 === 0 ? R * 1.28 : R * 0.48;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      poly(g, pts, true);
      strokeCfg(g, 12, pal.deep);
      g.stroke();
      strokeCfg(g, 7, pal.primary);
      g.stroke();
      strokeCfg(g, 3, pal.bright);
      g.stroke();

      // 贯通中心的四道锯齿闪电叉
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI + 0.2;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const nx = -uy;
        const ny = ux;
        poly(g, [
          [-ux * R * 0.78, -uy * R * 0.78],
          [-ux * R * 0.28 + nx * 14, -uy * R * 0.28 + ny * 14],
          [ux * R * 0.28 - nx * 14, uy * R * 0.28 - ny * 14],
          [ux * R * 0.78, uy * R * 0.78],
        ], false);
        strokeCfg(g, 6.5, pal.deep);
        g.stroke();
        strokeCfg(g, 3.8, pal.bright);
        g.stroke();
      }
      return;
    }

    if (norm === 'gilded_imperial') {
      // 鎏金神诏：天圆地方旋转双神诏方印（0.68R 方框）+ 四方帝王长日冕金矛（直刺 1.32R）
      for (const rot of [0, Math.PI / 4]) {
        g.save();
        g.rotate(rot);
        const s = R * 0.58;
        g.beginPath();
        g.rect(-s, -s, s * 2, s * 2);
        strokeCfg(g, 10, pal.deep);
        g.stroke();
        strokeCfg(g, 6, pal.primary);
        g.stroke();
        g.restore();
      }

      // 四向十字日冕金矛锋芒
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const long = i % 2 === 0 ? R * 1.32 : R * 1.05;
        const w = i % 2 === 0 ? 13 : 8;
        g.save();
        g.rotate(a);
        poly(g, [
          [R * 0.22, -w * 0.5],
          [long * 0.78, -w],
          [long, 0],
          [long * 0.78, w],
          [R * 0.22, w * 0.5],
        ]);
        g.fillStyle = i % 2 === 0 ? pal.primary : pal.bright;
        g.fill();
        strokeCfg(g, 3, pal.deep);
        g.stroke();
        g.restore();
      }
      return;
    }

    // frost_moon（玄霜寒月）：六出雪花冰晶树枝棱阵（中心直通 1.30R 六根冰棱主干 + 双层 V 形冰刺）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.save();
      g.rotate(a);
      // 主冰棱晶柱
      poly(g, [
        [R * 0.14, -5],
        [R * 1.05, -6],
        [R * 1.32, 0],
        [R * 1.05, 6],
        [R * 0.14, 5],
      ]);
      g.fillStyle = pal.primary;
      g.fill();
      strokeCfg(g, 3, pal.deep);
      g.stroke();

      // 双层雪花分叉侧刺
      for (const [br, blen] of [[R * 0.54, 28], [R * 0.86, 24]]) {
        for (const sgn of [-1, 1]) {
          g.beginPath();
          g.moveTo(br, 0);
          g.lineTo(br + blen * 0.7, sgn * blen);
          strokeCfg(g, 7.5, pal.deep);
          g.stroke();
          strokeCfg(g, 4.5, pal.bright);
          g.stroke();
        }
      }
      g.restore();
    }
    // 内六角冰晶核
    poly(g, Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * TAU + Math.PI / 6;
      return [Math.cos(a) * R * 0.44, Math.sin(a) * R * 0.44];
    }));
    strokeCfg(g, 7, pal.deep);
    g.stroke();
    strokeCfg(g, 4, pal.bright);
    g.stroke();
  });
}

/* ------------------------------------------------------------------ */
/* 2. 刀光扇斩（brushArc / soulSweep，朝右 angle=0 烘焙）              */
/* ------------------------------------------------------------------ */

export function vfxSlashSprite(themeId, radius, spread, evolved = false) {
  const norm = normalizeAttackVfxId(themeId);
  const pal = getVfxPalette(norm);
  const R = Math.max(30, Math.round(radius / 8) * 8);
  const S = Math.max(0.5, Math.round(spread * 10) / 10);
  const pad = 28;
  const dim = (R + pad) * 2;
  const center = R + pad;

  return bakeVfx(`vfx_slash|${norm}|${R}|${S}|${evolved ? 1 : 0}`, dim, dim, center, center, (g) => {
    const a0 = -S * 0.5;
    const a1 = S * 0.5;

    if (norm === 'jade_ghostfire') {
      // 青冥幽火：三道交错蛇形磷火弧 + 外飘五团幽魂鬼火珠
      for (let layer = 0; layer < 2; layer++) {
        const rr = R * (layer === 0 ? 0.72 : 1.06);
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const a = a0 + (a1 - a0) * t;
          const wave = Math.sin(t * Math.PI * 5 + layer * 2) * (R * 0.14);
          const x = Math.cos(a) * (rr + wave);
          const y = Math.sin(a) * (rr + wave);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        strokeCfg(g, layer === 0 ? 11 : 8, pal.deep);
        g.stroke();
        strokeCfg(g, layer === 0 ? 6.5 : 4.5, layer === 0 ? pal.primary : pal.bright);
        g.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const a = a0 + ((a1 - a0) * i) / 4;
        const ox = Math.cos(a) * R * 1.18;
        const oy = Math.sin(a) * R * 1.18;
        g.beginPath();
        g.arc(ox, oy, R * 0.11, 0, TAU);
        g.fillStyle = pal.primary;
        g.fill();
        strokeCfg(g, 2.2, pal.deep);
        g.stroke();
      }
      return;
    }

    if (norm === 'violet_thunder') {
      // 紫电天罡：锐利折角雷弧斩 + 向外劈射的五道闪电尖齿
      const steps = 10;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = a0 + (a1 - a0) * t;
        const rr = R * (i % 2 === 0 ? 1.16 : 0.62);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      poly(g, pts, false);
      strokeCfg(g, 11, pal.deep);
      g.stroke();
      strokeCfg(g, 6.5, pal.primary);
      g.stroke();
      strokeCfg(g, 2.8, pal.bright);
      g.stroke();

      for (let i = 1; i < steps; i += 2) {
        const t = i / steps;
        const a = a0 + (a1 - a0) * t;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32);
        g.lineTo(Math.cos(a) * R * 1.24, Math.sin(a) * R * 1.24);
        strokeCfg(g, 5.5, pal.deep);
        g.stroke();
        strokeCfg(g, 3, pal.bright);
        g.stroke();
      }
      return;
    }

    if (norm === 'gilded_imperial') {
      // 鎏金神诏：五道放射帝王金戈神芒扇面 + 内弧敕令金框
      for (let i = 0; i < 5; i++) {
        const a = a0 + ((a1 - a0) * i) / 4;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const nx = -uy;
        const ny = ux;
        poly(g, [
          [ux * R * 0.25, uy * R * 0.25],
          [ux * R * 0.92 + nx * 7, uy * R * 0.92 + ny * 7],
          [ux * R * 1.22, uy * R * 1.22],
          [ux * R * 0.92 - nx * 7, uy * R * 0.92 - ny * 7],
        ]);
        g.fillStyle = i % 2 === 0 ? pal.primary : pal.bright;
        g.fill();
        strokeCfg(g, 2.6, pal.deep);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, R * 0.64, a0, a1);
      strokeCfg(g, 8, pal.deep);
      g.stroke();
      strokeCfg(g, 4.5, pal.primary);
      g.stroke();
      return;
    }

    // frost_moon（玄霜寒月）：内弯新月寒刃 + 外悬五枚大棱角冰晶菱钻
    g.beginPath();
    g.arc(0, 0, R * 0.58, a0 - 0.1, a1 + 0.1);
    strokeCfg(g, 9, pal.deep);
    g.stroke();
    strokeCfg(g, 5, pal.primary);
    g.stroke();

    for (let i = 0; i < 5; i++) {
      const a = a0 + ((a1 - a0) * i) / 4;
      const cx = Math.cos(a) * R * 1.05;
      const cy = Math.sin(a) * R * 1.05;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      poly(g, [
        [-14, 0],
        [0, -7.5],
        [18, 0],
        [0, 7.5],
      ]);
      g.fillStyle = i % 2 === 0 ? pal.primary : pal.bright;
      g.fill();
      strokeCfg(g, 2.5, pal.deep);
      g.stroke();
      g.restore();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. 地面符阵 / 星盘（talismanArray / compassField / qimenArray）      */
/* ------------------------------------------------------------------ */

export function vfxArraySprite(themeId, variant = 'talisman') {
  const norm = normalizeAttackVfxId(themeId);
  const pal = getVfxPalette(norm);
  const R = 100;
  const pad = 24;
  const dim = (R + pad) * 2;
  const c = R + pad;

  return bakeVfx(`vfx_arr|${norm}|${variant}`, dim, dim, c, c, (g) => {
    if (norm === 'jade_ghostfire') {
      // 幽冥六瓣鬼火莲华涡阵
      for (let i = 0; i < 6; i++) {
        g.save();
        g.rotate((i / 6) * TAU);
        poly(g, [[0, -R * 0.25], [22, -R * 0.68], [0, -R * 1.04], [-22, -R * 0.68]]);
        strokeCfg(g, 5.5, pal.deep);
        g.stroke();
        strokeCfg(g, 3.2, pal.primary);
        g.stroke();
        g.beginPath();
        g.arc(0, -R * 0.88, 6, 0, TAU);
        g.fillStyle = pal.bright;
        g.fill();
        g.restore();
      }
      return;
    }
    if (norm === 'violet_thunder') {
      // 天罡八角雷篆电网阵
      poly(g, Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * TAU;
        return [Math.cos(a) * R, Math.sin(a) * R];
      }));
      strokeCfg(g, 7, pal.deep);
      g.stroke();
      strokeCfg(g, 4, pal.primary);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const b = ((i + 3) / 8) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96);
        g.lineTo(Math.cos(b) * R * 0.96, Math.sin(b) * R * 0.96);
        strokeCfg(g, 2.6, pal.bright);
        g.stroke();
      }
      return;
    }
    if (norm === 'gilded_imperial') {
      // 鎏金神诏双叠方玺日晷阵
      g.beginPath();
      g.arc(0, 0, R * 0.96, 0, TAU);
      strokeCfg(g, 7, pal.deep);
      g.stroke();
      strokeCfg(g, 4.2, pal.primary);
      g.stroke();
      for (const rot of [0, Math.PI / 4]) {
        g.save();
        g.rotate(rot);
        g.strokeRect(-R * 0.64, -R * 0.64, R * 1.28, R * 1.28);
        g.restore();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72);
        g.lineTo(Math.cos(a) * R * 1.06, Math.sin(a) * R * 1.06);
        strokeCfg(g, 3.5, pal.bright);
        g.stroke();
      }
      return;
    }
    // frost_moon：六芒冰晶雪花大阵
    for (let t = 0; t < 2; t++) {
      poly(g, Array.from({ length: 3 }, (_, k) => {
        const a = (k / 3) * TAU + (t * Math.PI) / 3;
        return [Math.cos(a) * R, Math.sin(a) * R];
      }));
      strokeCfg(g, 6.5, pal.deep);
      g.stroke();
      strokeCfg(g, 3.8, pal.primary);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * R * 1.06, Math.sin(a) * R * 1.06);
      strokeCfg(g, 3.2, pal.bright);
      g.stroke();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 4. 爆裂星芒（explosion）与地面领域池（inkPool / moltenZone）         */
/* ------------------------------------------------------------------ */

export function vfxBurstSprite(themeId, seed = 0) {
  const norm = normalizeAttackVfxId(themeId);
  const pal = getVfxPalette(norm);
  const R = 50;
  return bakeVfx(`vfx_burst|${norm}|${seed % 3}`, R * 3, R * 3, R * 1.5, R * 1.5, (g, rng) => {
    const spikes = norm === 'frost_moon' ? 6 : norm === 'gilded_imperial' ? 8 : 12;
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? R * (0.95 + rng() * 0.25) : R * 0.34;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    poly(g, pts);
    g.fillStyle = pal.primary;
    g.fill();
    strokeCfg(g, 2.8, pal.deep);
    g.stroke();

    g.beginPath();
    g.arc(0, 0, R * 0.28, 0, TAU);
    g.fillStyle = pal.bright;
    g.fill();
  });
}

export function vfxPoolSprite(themeId, seed = 0) {
  const norm = normalizeAttackVfxId(themeId);
  const pal = getVfxPalette(norm);
  const R = 50;
  return bakeVfx(`vfx_pool|${norm}|${seed % 3}`, R * 3, R * 3, R * 1.5, R * 1.5, (g, rng) => {
    g.fillStyle = pal.glowRgba(0.36);
    g.beginPath();
    g.arc(0, 0, R * 0.86, 0, TAU);
    g.fill();
    strokeCfg(g, 2.4, pal.primary);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rng() * 0.3;
      const d = R * (0.25 + rng() * 0.48);
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 2.2 + rng() * 2, 0, TAU);
      g.fillStyle = i % 2 === 0 ? pal.bright : pal.primary;
      g.fill();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 5. 飞行弹体专属主题尾迹与灵光（包裹任意我方飞行兵刃弹体）            */
/* ------------------------------------------------------------------ */

export function drawThemedProjectileAccent(ctx, themeId, p, evolved, clock, low) {
  const norm = normalizeAttackVfxId(themeId);
  if (norm === 'default') return;
  const pal = getVfxPalette(norm);
  const ang = Number.isFinite(p.angle) ? p.angle : Math.atan2(p.vy || 0, p.vx || 1);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  const tailLen = evolved ? 32 : 22;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (norm === 'jade_ghostfire') {
    // 蛇形青碧磷火拖尾 + 环绕双鬼火珠
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(
      p.x - ux * tailLen * 0.5 + nx * Math.sin(clock * 20 + (p.id || 0)) * 8,
      p.y - uy * tailLen * 0.5 + ny * Math.sin(clock * 20 + (p.id || 0)) * 8,
      p.x - ux * tailLen,
      p.y - uy * tailLen,
    );
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 3.6;
    ctx.stroke();
    if (!low) {
      ctx.fillStyle = pal.bright;
      ctx.beginPath();
      ctx.arc(p.x + nx * 6, p.y + ny * 6, 3.2, 0, TAU);
      ctx.arc(p.x - ux * 12 - nx * 5, p.y - uy * 12 - ny * 5, 2.8, 0, TAU);
      ctx.fill();
    }
  } else if (norm === 'violet_thunder') {
    // 锯齿紫电拖尾 + 电弧环
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - ux * tailLen * 0.45 + nx * 7, p.y - uy * tailLen * 0.45 + ny * 7);
    ctx.lineTo(p.x - ux * tailLen * 0.78 - nx * 6, p.y - uy * tailLen * 0.78 - ny * 6);
    ctx.lineTo(p.x - ux * tailLen, p.y - uy * tailLen);
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 5.5;
    ctx.stroke();
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    if (!low) {
      ctx.strokeStyle = pal.bright;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 7, p.y - 7, 14, 14);
    }
  } else if (norm === 'gilded_imperial') {
    // 帝王赤金十字星辉冠冕 + 双翼金芒尾羽
    ctx.beginPath();
    ctx.moveTo(p.x - ux * tailLen, p.y - uy * tailLen);
    ctx.lineTo(p.x + nx * 6, p.y + ny * 6);
    ctx.lineTo(p.x + ux * 10, p.y + uy * 10);
    ctx.lineTo(p.x - nx * 6, p.y - ny * 6);
    ctx.closePath();
    ctx.fillStyle = pal.primary;
    ctx.fill();
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    if (!low) {
      ctx.strokeStyle = pal.bright;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y);
      ctx.lineTo(p.x + 10, p.y);
      ctx.moveTo(p.x, p.y - 10);
      ctx.lineTo(p.x, p.y + 10);
      ctx.stroke();
    }
  } else if (norm === 'frost_moon') {
    // 玄霜冰晶棱锥拖尾 + 碎冰菱片
    ctx.beginPath();
    ctx.moveTo(p.x + ux * 9, p.y + uy * 9);
    ctx.lineTo(p.x + nx * 6.5, p.y + ny * 6.5);
    ctx.lineTo(p.x - ux * tailLen, p.y - uy * tailLen);
    ctx.lineTo(p.x - nx * 6.5, p.y - ny * 6.5);
    ctx.closePath();
    ctx.fillStyle = pal.primary;
    ctx.fill();
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    if (!low) {
      ctx.fillStyle = pal.bright;
      ctx.fillRect(p.x - ux * 14 - 2.5, p.y - uy * 14 - 2.5, 5, 5);
    }
  }
  ctx.restore();
}
