// icons.js —— 武器 / 法器 / 英雄 的水墨图标（给 UI 的「签」使用）
// drawIcon(ctx, kind, id, x, y, size)：在 (x,y) 为中心、size×size 的方框内绘制。
// iconDataURL(kind, id, size)：返回 PNG dataURL（画布按 2× 像素绘制，UI 以 size CSS 像素显示）。
import { INK, VERM, PAPER, PAPER_SHADE, LANTERN, inkA } from './palette.js';
import { makeCanvas, makeRng, hashStr, withMisreg, brushStroke, printSpeckle, blobPath } from './ink.js';

const TAU = Math.PI * 2;

function st(g, lw, c = INK) {
  g.strokeStyle = c;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
}
function circ(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}
function poly(g, pts, close = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
}
function fs(g, fill, lw = 5) {
  g.fillStyle = fill;
  g.fill();
  st(g, lw);
  g.stroke();
}
function vfill(g, pathFn) {
  withMisreg(g, () => {
    pathFn();
    g.fillStyle = VERM;
    g.fill();
  });
}

// 以下绘制均在 100×100、原点居中（-50..50）的坐标系
const WEAPON_ICONS = {
  gong(g) {
    circ(g, -6, 4, 32);
    fs(g, PAPER_SHADE, 6);
    circ(g, -6, 4, 21);
    st(g, 3, inkA(0.7));
    g.stroke();
    circ(g, -6, 4, 8);
    fs(g, INK, 3);
    st(g, 4, VERM);
    g.beginPath();
    g.moveTo(-30, -26);
    g.lineTo(-6, -36);
    g.lineTo(18, -26);
    g.stroke();
    // 锣槌
    brushStroke(g, [[44, -40], [30, -12], [22, 6]], 7, { seed: 3, dry: 0.3 });
    circ(g, 20, 10, 8);
    fs(g, VERM, 4);
  },
  lantern(g) {
    st(g, 4);
    g.beginPath();
    g.moveTo(0, -46);
    g.lineTo(0, -32);
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, 28, 30, 0, 0, TAU);
    g.fillStyle = LANTERN;
    g.fill();
    st(g, 5);
    g.stroke();
    st(g, 3, inkA(0.6));
    g.beginPath();
    g.ellipse(0, 0, 12, 29, 0, 0, TAU);
    g.stroke();
    g.fillStyle = INK;
    g.fillRect(-16, -34, 32, 8);
    g.fillRect(-16, 26, 32, 8);
    vfill(g, () => poly(g, [[-4, 34], [4, 34], [6, 50], [-6, 50]]));
  },
  talisman(g) {
    g.save();
    g.rotate(-0.15);
    poly(g, [[-16, -44], [16, -44], [16, 44], [-16, 44]]);
    fs(g, PAPER, 5);
    withMisreg(g, () => {
      st(g, 3, VERM);
      g.beginPath();
      g.rect(-10, -38, 20, 76);
      g.stroke();
      st(g, 6, VERM);
      g.beginPath();
      g.moveTo(0, -28);
      g.lineTo(0, 30);
      g.moveTo(-8, -18);
      g.lineTo(8, -18);
      g.moveTo(-7, 18);
      g.quadraticCurveTo(0, 6, 7, 18);
      g.stroke();
      circ(g, 0, -3, 6);
      g.stroke();
    });
    g.restore();
  },
  brush(g) {
    brushStroke(g, [[-40, 34], [-10, 26], [20, 6], [36, -20]], 14, { seed: 7, dry: 0.6, taperOut: 0.5 });
    g.save();
    g.rotate(-0.8);
    g.fillStyle = INK;
    g.fillRect(-4, -52, 8, 50);
    vfill(g, () => {
      g.beginPath();
      g.rect(-5, -56, 10, 6);
    });
    poly(g, [[-6, -2], [6, -2], [0, 18]]);
    fs(g, PAPER_SHADE, 3);
    g.restore();
  },
  coinsword(g) {
    g.save();
    g.rotate(-Math.PI / 4);
    st(g, 4, VERM);
    g.beginPath();
    g.moveTo(-40, 0);
    g.lineTo(40, 0);
    g.stroke();
    for (let i = 0; i < 5; i++) {
      const x = -20 + i * 13;
      circ(g, x, 0, 7.5);
      fs(g, PAPER_SHADE, 3.5);
      g.fillStyle = INK;
      g.fillRect(x - 2.4, -2.4, 4.8, 4.8);
    }
    poly(g, [[44, -5], [56, 0], [44, 5]]);
    fs(g, INK, 2);
    st(g, 6);
    g.beginPath();
    g.moveTo(-34, -10);
    g.lineTo(-34, 10);
    g.moveTo(-34, 0);
    g.lineTo(-46, 0);
    g.stroke();
    g.restore();
  },
  paperman(g) {
    withMisreg(g, () => {
      g.fillStyle = VERM;
      circ(g, 0, -26, 12);
      g.fill();
      poly(g, [[-12, -14], [12, -14], [18, 18], [-18, 18]]);
      g.fill();
      poly(g, [[-11, -12], [-30, 4], [-25, 9], [-8, -4]]);
      g.fill();
      poly(g, [[11, -12], [30, 4], [25, 9], [8, -4]]);
      g.fill();
      g.beginPath();
      g.rect(-12, 16, 8, 26);
      g.rect(4, 16, 8, 26);
      g.fill();
    });
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.fillRect(-6, -30, 4, 4);
    g.fillRect(2, -30, 4, 4);
    poly(g, [[0, -8], [6, 0], [0, 8], [-6, 0]]);
    g.fill();
    g.restore();
  },
  firecracker(g) {
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate(-16 + i * 16, 6 - Math.abs(i - 1) * 6);
      g.rotate((i - 1) * 0.3);
      vfill(g, () => {
        g.beginPath();
        g.rect(-7, -22, 14, 40);
      });
      g.beginPath();
      g.rect(-7, -22, 14, 40);
      st(g, 4);
      g.stroke();
      g.fillStyle = INK;
      g.fillRect(-8, -24, 16, 6);
      g.restore();
    }
    st(g, 3);
    g.beginPath();
    g.moveTo(0, -24);
    g.quadraticCurveTo(10, -38, 4, -46);
    g.stroke();
    st(g, 3, INK);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.moveTo(4 + Math.cos(a) * 4, -46 + Math.sin(a) * 4);
      g.lineTo(4 + Math.cos(a) * 10, -46 + Math.sin(a) * 10);
    }
    g.stroke();
  },
  bell(g) {
    st(g, 5, VERM);
    g.beginPath();
    g.moveTo(0, -46);
    g.lineTo(0, -30);
    g.stroke();
    g.beginPath();
    g.moveTo(-22, 18);
    g.bezierCurveTo(-26, -36, 26, -36, 22, 18);
    g.lineTo(30, 26);
    g.lineTo(-30, 26);
    g.closePath();
    fs(g, PAPER_SHADE, 5);
    st(g, 3, inkA(0.6));
    g.beginPath();
    g.moveTo(-20, 6);
    g.lineTo(20, 6);
    g.stroke();
    circ(g, 0, 33, 7);
    g.fillStyle = INK;
    g.fill();
  },
};

const RELIC_ICONS = {
  clapper(g) {
    // 梆子：挖槽的木块 + 敲棒
    g.save();
    g.rotate(-0.2);
    poly(g, [[-36, -14], [30, -14], [36, 14], [-30, 14]]);
    fs(g, PAPER_SHADE, 5);
    g.beginPath();
    g.rect(-20, -3, 36, 6);
    fs(g, INK, 2);
    g.restore();
    brushStroke(g, [[-30, 40], [10, 30], [40, 22]], 8, { seed: 11, dry: 0.2 });
  },
  censer(g) {
    // 香炉 + 三炷香
    st(g, 4);
    for (const x of [-10, 0, 10]) {
      g.beginPath();
      g.moveTo(x, -6);
      g.lineTo(x * 1.2, -40);
      g.stroke();
      circ(g, x * 1.2, -42, 3);
      vfill(g, () => circ(g, x * 1.2, -42, 3));
    }
    g.beginPath();
    g.moveTo(-32, -6);
    g.lineTo(32, -6);
    g.quadraticCurveTo(30, 26, 0, 26);
    g.quadraticCurveTo(-30, 26, -32, -6);
    g.closePath();
    fs(g, INK, 4);
    st(g, 6);
    g.beginPath();
    g.moveTo(-20, 22);
    g.lineTo(-24, 40);
    g.moveTo(20, 22);
    g.lineTo(24, 40);
    g.moveTo(0, 26);
    g.lineTo(0, 40);
    g.stroke();
    vfill(g, () => poly(g, [[-30, -8], [30, -8], [29, -1], [-29, -1]]));
  },
  cinnabar(g) {
    // 朱砂：浅碟里一堆朱砂
    g.beginPath();
    g.ellipse(0, 14, 40, 16, 0, 0, TAU);
    fs(g, PAPER_SHADE, 5);
    vfill(g, () => {
      blobPath(g, 0, 6, 24, makeRng(3), 0.25, 10, 0.6);
    });
    vfill(g, () => {
      g.beginPath();
      g.moveTo(-14, 6);
      g.quadraticCurveTo(0, -24, 14, 6);
      g.closePath();
    });
    brushStroke(g, [[24, -40], [10, -12]], 7, { seed: 13, dry: 0.2 });
  },
  inkstone(g) {
    poly(g, [[-38, -24], [38, -24], [38, 30], [-38, 30]]);
    fs(g, PAPER_SHADE, 5);
    g.beginPath();
    g.ellipse(0, 4, 26, 16, 0, 0, TAU);
    fs(g, INK, 3);
    st(g, 3, 'rgba(239,230,210,0.7)');
    g.beginPath();
    g.ellipse(-6, 0, 10, 4, 0, Math.PI, TAU);
    g.stroke();
    g.save();
    g.rotate(0.5);
    g.fillStyle = INK;
    g.fillRect(14, -54, 12, 34);
    g.restore();
  },
  bagua(g) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const x = Math.cos(a) * 44;
      const y = Math.sin(a) * 44;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    fs(g, PAPER, 5);
    g.fillStyle = INK;
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * TAU);
      for (let k = 0; k < 3; k++) {
        const y = -36 + k * 6;
        if ((i + k) % 3 === 0) {
          g.fillRect(-9, y, 7, 3.6);
          g.fillRect(2, y, 7, 3.6);
        } else g.fillRect(-9, y, 18, 3.6);
      }
      g.restore();
    }
    circ(g, 0, 0, 15);
    fs(g, PAPER_SHADE, 4);
    vfill(g, () => circ(g, 0, 0, 8));
  },
  scissors(g) {
    st(g, 7);
    g.beginPath();
    g.moveTo(-6, 6);
    g.lineTo(34, -40);
    g.moveTo(6, 6);
    g.lineTo(-34, -40);
    g.stroke();
    withMisreg(g, () => {
      st(g, 7, VERM);
      circ(g, -16, 26, 12);
      g.stroke();
      circ(g, 16, 26, 12);
      g.stroke();
    });
    circ(g, 0, 0, 4);
    g.fillStyle = INK;
    g.fill();
  },
  tinder(g) {
    // 火折子：竹筒 + 朱红火星
    g.save();
    g.rotate(0.6);
    g.beginPath();
    g.rect(-10, -20, 20, 60);
    fs(g, PAPER_SHADE, 5);
    st(g, 3, inkA(0.7));
    g.beginPath();
    g.moveTo(-10, 0);
    g.lineTo(10, 0);
    g.moveTo(-10, 22);
    g.lineTo(10, 22);
    g.stroke();
    vfill(g, () => {
      g.beginPath();
      g.moveTo(0, -46);
      g.bezierCurveTo(8, -36, 10, -28, 6, -22);
      g.quadraticCurveTo(0, -18, -6, -22);
      g.bezierCurveTo(-10, -28, -8, -36, 0, -46);
    });
    g.restore();
  },
  redstring(g) {
    withMisreg(g, () => {
      st(g, 6, VERM);
      g.beginPath();
      g.moveTo(-40, -30);
      g.bezierCurveTo(-10, -50, 10, 10, -6, 4);
      g.bezierCurveTo(-24, -4, 14, -40, 26, -10);
      g.bezierCurveTo(34, 10, 20, 30, 34, 44);
      g.stroke();
    });
    circ(g, -14, 30, 13);
    fs(g, PAPER_SHADE, 4);
    g.fillStyle = INK;
    g.fillRect(-18, 26, 8, 8);
  },
};

const HERO_ICONS = {
  zhou(g) {
    circ(g, 0, 8, 18);
    fs(g, PAPER, 4);
    g.fillStyle = INK;
    circ(g, -7, 10, 2.6);
    g.fill();
    circ(g, 7, 10, 2.6);
    g.fill();
    g.beginPath();
    g.moveTo(-46, 4);
    g.quadraticCurveTo(-20, -24, 0, -40);
    g.quadraticCurveTo(20, -24, 46, 4);
    g.quadraticCurveTo(0, 12, -46, 4);
    g.closePath();
    fs(g, PAPER_SHADE, 5);
    st(g, 2.4, inkA(0.6));
    g.beginPath();
    for (const x of [-28, -14, 0, 14, 28]) {
      g.moveTo(0, -38);
      g.lineTo(x, 4);
    }
    g.stroke();
    vfill(g, () => {
      g.beginPath();
      g.rect(-20, 30, 40, 8);
    });
  },
  mian(g) {
    circ(g, -22, -24, 11);
    g.fillStyle = INK;
    g.fill();
    circ(g, 22, -24, 11);
    g.fill();
    circ(g, 0, 4, 22);
    fs(g, PAPER, 4);
    g.beginPath();
    g.arc(0, 4, 22, Math.PI * 1.02, Math.PI * 1.98);
    g.quadraticCurveTo(4, -2, -22, 4);
    g.fillStyle = INK;
    g.fill();
    g.fillStyle = INK;
    circ(g, -8, 10, 2.6);
    g.fill();
    circ(g, 8, 10, 2.6);
    g.fill();
    vfill(g, () => {
      g.beginPath();
      g.arc(-13, 17, 4, 0, TAU);
      g.arc(13, 17, 4, 0, TAU);
    });
  },
  daotong(g) {
    circ(g, 0, 8, 20);
    fs(g, PAPER, 4);
    g.beginPath();
    g.moveTo(-22, 0);
    g.quadraticCurveTo(-24, -34, 0, -36);
    g.quadraticCurveTo(24, -34, 22, 0);
    g.quadraticCurveTo(0, -8, -22, 0);
    g.fillStyle = INK;
    g.fill();
    vfill(g, () => circ(g, 0, -40, 6));
    g.fillStyle = INK;
    circ(g, -7, 12, 2.6);
    g.fill();
    circ(g, 7, 12, 2.6);
    g.fill();
  },
};

const MISC_ICONS = {
  overflow(g) {
    // 溢出签：朱印上一道向上的笔锋
    vfill(g, () => {
      g.beginPath();
      g.rect(-34, -34, 68, 68);
    });
    brushStroke(g, [[-18, 22], [0, -2], [18, -26]], 10, { seed: 17, dry: 0.4, color: PAPER });
    brushStroke(g, [[2, -24], [18, -26], [16, -10]], 7, { seed: 19, dry: 0.3, color: PAPER });
  },
  coin(g) {
    circ(g, 0, 0, 36);
    fs(g, PAPER_SHADE, 6);
    circ(g, 0, 0, 27);
    st(g, 2.4, inkA(0.6));
    g.stroke();
    g.beginPath();
    g.rect(-10, -10, 20, 20);
    fs(g, PAPER, 5);
  },
  bun(g) {
    g.beginPath();
    g.moveTo(-40, 14);
    g.bezierCurveTo(-44, -34, 44, -34, 40, 14);
    g.quadraticCurveTo(0, 26, -40, 14);
    g.closePath();
    fs(g, PAPER, 5);
    st(g, 3, inkA(0.7));
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.15 + i * 0.17);
      g.moveTo(Math.cos(a) * 6, -16);
      g.quadraticCurveTo(Math.cos(a) * 16, -8, Math.cos(a) * 30, -2);
    }
    g.stroke();
    vfill(g, () => circ(g, 0, -18, 6));
  },
};

/**
 * 在 (x,y) 为中心、size×size 的区域绘制图标。
 * kind: 'weapon' | 'relic' | 'hero' | 'overflow' | 'coin' | 'bun'
 */
export function drawIcon(ctx, kind, id, x, y, size) {
  let fn = null;
  if (kind === 'weapon') fn = WEAPON_ICONS[id];
  else if (kind === 'relic') fn = RELIC_ICONS[id];
  else if (kind === 'hero') fn = HERO_ICONS[id];
  else fn = MISC_ICONS[kind] || MISC_ICONS[id];
  if (!fn) fn = MISC_ICONS.coin;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  fn(ctx);
  ctx.restore();
}

const urlCache = new Map();
/** 返回图标 PNG dataURL（2× 像素，含纸墨斑驳质感），按 kind|id|size 缓存 */
export function iconDataURL(kind, id, size = 64) {
  const key = kind + '|' + id + '|' + size;
  if (urlCache.has(key)) return urlCache.get(key);
  const s = 2;
  const c = makeCanvas(size * s, size * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  drawIcon(g, kind, id, size / 2, size / 2, size * 0.86);
  printSpeckle(g, size, size, makeRng(hashStr(key)), 0.01, 0.6);
  const url = c.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}
