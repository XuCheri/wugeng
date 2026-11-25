// icons.js —— 武器 / 开光神兵 / 法器 / 英雄 的民俗木版水墨图标
// drawIcon(ctx, kind, id, x, y, size)：在 (x,y) 为中心、size×size 的方框内绘制。
// iconDataURL(kind, id, size)：返回 PNG dataURL（画布按 2× 像素绘制，UI 以 size CSS 像素显示）。
import { INK, VERM, VERM_DARK, PAPER, PAPER_SHADE, LANTERN, inkA, paperA, vermA } from './palette.js';
import { makeCanvas, makeRng, hashStr, withMisreg, brushStroke, arcPoints, printSpeckle, blobPath } from './ink.js';

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
function fs(g, fill, lw = 5, strokeColor = INK) {
  g.fillStyle = fill;
  g.fill();
  st(g, lw, strokeColor);
  g.stroke();
}
function vfill(g, pathFn, color = VERM) {
  withMisreg(g, () => {
    pathFn();
    g.fillStyle = color;
    g.fill();
  });
}
function octagon(g, r, rot = Math.PI / 8) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rot;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

// 以下绘制均在 100×100、原点居中（-50..50）的坐标系
export const WEAPON_ICONS = {
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
  compass(g) {
    // 罗盘：外方内圆风水盘 + 天池磁针
    poly(g, [[-38, -38], [38, -38], [38, 38], [-38, 38]]);
    fs(g, PAPER_SHADE, 5);
    circ(g, 0, 0, 31);
    fs(g, PAPER, 4);
    circ(g, 0, 0, 20);
    st(g, 2.5, inkA(0.65));
    g.stroke();
    // 八方刻度
    st(g, 3.2, INK);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.moveTo(Math.cos(a) * 21, Math.sin(a) * 21);
      g.lineTo(Math.cos(a) * 29, Math.sin(a) * 29);
    }
    g.stroke();
    // 天池 + 朱砂磁针
    circ(g, 0, 0, 9);
    fs(g, PAPER_SHADE, 3);
    vfill(g, () => poly(g, [[17, -17], [4, 2], [-2, -4]]));
    poly(g, [[-16, 16], [-3, -2], [2, 3]]);
    g.fillStyle = INK;
    g.fill();
    circ(g, 0, 0, 3);
    g.fillStyle = VERM;
    g.fill();
  },
  soulbanner(g) {
    // 招魂幡：斜挑竹竿 + 双尾长白幡 + 朱红边
    st(g, 6, INK);
    g.beginPath();
    g.moveTo(-28, 44);
    g.lineTo(-22, -44);
    g.moveTo(-34, -36);
    g.lineTo(30, -32);
    g.stroke();
    poly(g, [[-14, -34], [26, -31], [30, 34], [10, 18], [-10, 38]]);
    fs(g, PAPER, 4.5);
    vfill(g, () => {
      poly(g, [[-13, -33], [-6, -32], [-4, 30], [-10, 36]]);
      g.fill();
      poly(g, [[19, -31], [25, -31], [29, 32], [22, 26]]);
    });
    // 幡心符墨
    brushStroke(g, [[6, -22], [8, 12]], 5.5, { seed: 31, dry: 0.35, color: INK });
    st(g, 3.5, VERM);
    g.beginPath();
    g.moveTo(-1, -12);
    g.lineTo(15, -11);
    g.moveTo(0, 2);
    g.lineTo(16, 3);
    g.stroke();
  },
  bronze_mirror(g) {
    // 照妖铜镜：葵花八瓣镜缘 + 镜背圆钮红穗 + 暖光折线
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = i % 2 === 0 ? 37 : 33;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r - 4;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    fs(g, PAPER_SHADE, 5);
    circ(g, 0, -4, 24);
    fs(g, LANTERN, 3.5);
    // 镜面高光斜纹
    st(g, 4, PAPER);
    g.beginPath();
    g.moveTo(-14, -16);
    g.lineTo(6, 4);
    g.moveTo(-4, -18);
    g.lineTo(13, -1);
    g.stroke();
    // 镜钮与红绳穗
    circ(g, 0, -4, 6.5);
    fs(g, INK, 3);
    vfill(g, () => poly(g, [[-4, 2], [4, 2], [9, 44], [0, 38], [-9, 44]]));
  },
  paperhorse(g) {
    // 纸马镖：折纸奔马剪影 + 朱红鞍花 + 竹篾折痕
    poly(g, [[-38, 14], [-22, -8], [8, -8], [20, -34], [38, -22], [28, -4], [40, 12], [18, 16], [12, 36], [2, 36], [4, 14], [-18, 14], [-26, 36], [-36, 34]]);
    fs(g, PAPER, 4.8);
    // 朱红鞍鞯与腮花
    vfill(g, () => poly(g, [[-14, -7], [8, -7], [11, 12], [-17, 12]]));
    vfill(g, () => circ(g, 28, -22, 4));
    // 折痕墨线与马眼
    st(g, 2.5, inkA(0.65));
    g.beginPath();
    g.moveTo(-22, -7);
    g.lineTo(4, 13);
    g.moveTo(8, -7);
    g.lineTo(26, -5);
    g.stroke();
    circ(g, 25, -26, 2.6);
    g.fillStyle = INK;
    g.fill();
  },
  taomujian(g) {
    // 桃木飞剑：斜倚双刃桃木剑 + 朱砂血符中脊 + 琥珀如意护手 + 红缨剑穗
    g.save();
    g.rotate(-Math.PI / 4);
    poly(g, [[-24, -5.5], [26, -6.2], [46, 0], [26, 6.2], [-24, 5.5]]);
    fs(g, PAPER_SHADE, 4.6);
    st(g, 3.2, VERM);
    g.beginPath();
    g.moveTo(-18, 0);
    g.lineTo(35, 0);
    g.moveTo(4, -3.5);
    g.lineTo(10, 3.5);
    g.moveTo(16, -3.5);
    g.lineTo(22, 3.5);
    g.stroke();
    poly(g, [[-24, -15], [-16, 0], [-24, 15], [-30, 0]]);
    fs(g, LANTERN, 4);
    g.fillStyle = INK;
    g.fillRect(-40, -3.6, 12, 7.2);
    vfill(g, () => poly(g, [[-40, -2], [-48, -9], [-45, 0], [-48, 9], [-40, 2]]));
    g.restore();
  },
  suohun_chain(g) {
    // 无常锁魂链：五节咬合寒铁链环 + 勾魂弯月尖钩
    for (const [cx, cy, rot] of [[-34, 30, 0.7], [-20, 17, -0.5], [-6, 4, 0.7], [8, -9, -0.5], [20, -20, 0.7]]) {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.beginPath();
      g.ellipse(0, 0, 10, 5.5, 0, 0, TAU);
      fs(g, PAPER_SHADE, 4.5);
      g.restore();
    }
    g.beginPath();
    g.arc(24, -20, 18, -Math.PI * 0.92, Math.PI * 0.28);
    st(g, 7.5, INK);
    g.stroke();
    st(g, 3.5, VERM);
    g.stroke();
    poly(g, [[37, -8], [45, 4], [28, -2]]);
    fs(g, PAPER, 3.5);
  },
  zhinian_kite(g) {
    // 纸鸢火鸦：展翅燕尾纸鸢 + 竹篾十字骨架 + 腹燃阳炎金火
    poly(g, [[0, -42], [42, -8], [16, 8], [25, 40], [4, 22], [-4, 22], [-25, 40], [-16, 8], [-42, -8]]);
    fs(g, PAPER, 4.6);
    st(g, 3, inkA(0.75));
    g.beginPath();
    g.moveTo(0, -40);
    g.lineTo(0, 22);
    g.moveTo(-38, -8);
    g.quadraticCurveTo(0, -18, 38, -8);
    g.stroke();
    vfill(g, () => poly(g, [[0, -22], [13, 0], [0, 16], [-13, 0]]));
    circ(g, 0, -2, 5.5);
    fs(g, LANTERN, 2.5);
    g.fillStyle = INK;
    circ(g, -9, -15, 2.6);
    g.fill();
    circ(g, 9, -15, 2.6);
    g.fill();
  },
  nuo_drum(g) {
    // 傩神战鼓：朱红束腰大鼓 + 宣纸鼓面铆钉 + 斜击鼓槌震音
    poly(g, [[-28, -18], [28, -18], [34, 2], [28, 24], [-28, 24], [-34, 2]]);
    fs(g, VERM, 4.8);
    g.beginPath();
    g.ellipse(0, -18, 28, 10.5, 0, 0, TAU);
    fs(g, PAPER, 4.2);
    vfill(g, () => circ(g, 0, -18, 6.5));
    g.fillStyle = INK;
    for (const dx of [-20, -10, 0, 10, 20]) {
      circ(g, dx, -6, 2.1);
      g.fill();
    }
    st(g, 5, INK);
    g.beginPath();
    g.moveTo(38, -42);
    g.lineTo(8, -20);
    g.stroke();
    circ(g, 6, -19, 6);
    fs(g, LANTERN, 3.2);
    st(g, 3, LANTERN);
    g.beginPath();
    g.arc(-34, 2, 10, Math.PI * 0.7, Math.PI * 1.3);
    g.stroke();
    g.beginPath();
    g.arc(34, 2, 10, -Math.PI * 0.3, Math.PI * 0.3);
    g.stroke();
  },
  mourning_staff(g) {
    // 引魂丧杆：修竹斜杆 + 叠层宣纸白幡流苏 + 朱红顶结
    st(g, 5.2, INK);
    g.beginPath();
    g.moveTo(-26, 42);
    g.lineTo(14, -42);
    g.stroke();
    circ(g, 14, -42, 6);
    fs(g, VERM, 3);
    for (let i = 0; i < 3; i++) {
      const ox = 10 - i * 8;
      const oy = -32 + i * 16;
      poly(g, [[ox, oy], [ox + 26, oy + 6], [ox + 20, oy + 20], [ox - 2, oy + 14]]);
      fs(g, i === 1 ? PAPER_SHADE : PAPER, 3.2);
      vfill(g, () => poly(g, [[ox + 16, oy + 6], [ox + 22, oy + 9], [ox + 18, oy + 16]]));
    }
  },
  sky_lantern(g) {
    // 孔明灯：鼓腹宣纸天灯 + 灯芯暖焰 + 底部竹圈流苏
    poly(g, [[-22, -22], [0, -38], [22, -22], [16, 18], [-16, 18]]);
    fs(g, PAPER, 4.6);
    poly(g, [[-14, -14], [0, -26], [14, -14], [10, 12], [-10, 12]]);
    fs(g, LANTERN, 2.6, VERM);
    circ(g, 0, 2, 6.5);
    fs(g, VERM, 2.2);
    st(g, 3.6, INK);
    g.beginPath();
    g.moveTo(-18, 18);
    g.lineTo(18, 18);
    g.moveTo(0, 18);
    g.lineTo(0, 40);
    g.stroke();
    vfill(g, () => poly(g, [[-5, 34], [5, 34], [7, 44], [-7, 44]]));
  },
  carpenter_line(g) {
    // 墨斗线：雕花黑木墨斗盒 + 紧绷斜贯墨线 + 线坠定针
    poly(g, [[-38, 6], [-10, 2], [-4, 28], [-34, 34]]);
    fs(g, INK, 4.2);
    circ(g, -22, 16, 8);
    fs(g, PAPER_SHADE, 2.8);
    circ(g, -22, 16, 3.5);
    g.fillStyle = INK;
    g.fill();
    st(g, 3.8, INK);
    g.beginPath();
    g.moveTo(-12, 10);
    g.lineTo(34, -34);
    g.stroke();
    st(g, 2.2, VERM);
    g.beginPath();
    g.moveTo(-8, 14);
    g.lineTo(38, -30);
    g.stroke();
    poly(g, [[30, -40], [42, -38], [36, -24]]);
    fs(g, VERM, 3);
  },
  luopan_slip(g) {
    // 风水飞签：扇列三枚刻纹竹签 + 朱砂签头 + 罗盘底环
    circ(g, 0, 14, 24);
    fs(g, PAPER_SHADE, 3.6);
    for (const [a, col] of [[-0.38, PAPER], [0, LANTERN], [0.38, PAPER]]) {
      g.save();
      g.translate(0, 24);
      g.rotate(a);
      poly(g, [[-5, 0], [-4, -48], [0, -60], [4, -48], [5, 0]]);
      fs(g, col, 3.2);
      vfill(g, () => poly(g, [[-4, -44], [0, -58], [4, -44]]));
      g.restore();
    }
    circ(g, 0, 22, 7);
    fs(g, INK, 2.8);
  },
};

/**
 * 12 件开光神兵专属木版神像画（EVO_WEAPON_ICONS）
 * 每一枚均为独立构图的神兵法相，绝不复用基础武器底图加外框！
 */
export const EVO_WEAPON_ICONS = {
  gong(g) {
    // 五更鸣锣：双柱牌楼锣架 + 赤金日曜巨锣 + 五道朱砂震波 + 双槌交击
    vfill(g, () => circ(g, 0, 4, 42), LANTERN);
    // 震波外弧
    st(g, 3.6, VERM);
    g.beginPath();
    g.arc(0, 4, 44, -0.75, 0.75);
    g.stroke();
    g.beginPath();
    g.arc(0, 4, 44, Math.PI - 0.75, Math.PI + 0.75);
    g.stroke();
    // 龙门木架
    g.fillStyle = INK;
    g.fillRect(-36, -38, 7, 78);
    g.fillRect(29, -38, 7, 78);
    poly(g, [[-44, -36], [44, -36], [38, -45], [-38, -45]]);
    g.fill();
    // 巨锣本体
    circ(g, 0, 4, 26);
    fs(g, LANTERN, 5);
    vfill(g, () => circ(g, 0, 4, 15));
    circ(g, 0, 4, 7);
    fs(g, PAPER, 3.5);
    // 交叉双槌
    st(g, 5, INK);
    g.beginPath();
    g.moveTo(-28, 38);
    g.lineTo(-8, 16);
    g.moveTo(28, 38);
    g.lineTo(8, 16);
    g.stroke();
    circ(g, -6, 14, 5.5);
    fs(g, VERM_DARK, 3);
    circ(g, 6, 14, 5.5);
    fs(g, VERM_DARK, 3);
  },
  lantern(g) {
    // 长明灯：八瓣朱砂金莲宝座 + 重檐宫灯塔顶 + 冲霄三昧真火（与普通椭圆提灯截然不同）
    // 底座莲瓣
    for (let i = -3; i <= 3; i++) {
      g.save();
      g.translate(i * 8, 26);
      g.rotate(i * 0.24);
      poly(g, [[0, -18], [8, -4], [0, 8], [-8, -4]]);
      fs(g, Math.abs(i) % 2 ? VERM : LANTERN, 3.2);
      g.restore();
    }
    poly(g, [[-26, 32], [26, 32], [20, 42], [-20, 42]]);
    fs(g, INK, 3.5);
    // 中央三层长明真火
    vfill(g, () => {
      g.beginPath();
      g.moveTo(0, -45);
      g.bezierCurveTo(24, -22, 30, 4, 18, 22);
      g.quadraticCurveTo(0, 30, -18, 22);
      g.bezierCurveTo(-30, 4, -24, -22, 0, -45);
    });
    g.beginPath();
    g.moveTo(0, -34);
    g.bezierCurveTo(15, -14, 18, 6, 10, 20);
    g.quadraticCurveTo(0, 25, -10, 20);
    g.bezierCurveTo(-18, 6, -15, -14, 0, -34);
    fs(g, LANTERN, 4);
    poly(g, [[0, -20], [6, 6], [0, 16], [-6, 6]]);
    g.fillStyle = PAPER;
    g.fill();
    // 两侧星火宝珠
    for (const [sx, sy] of [[-34, -14], [34, -14], [-28, 6], [28, 6]]) {
      circ(g, sx, sy, 4.5);
      fs(g, LANTERN, 2.5);
    }
  },
  talisman(g) {
    // 天师符阵：八角雷坛轮盘 + 五雷朱符放射环列 + 金雷电弧交织
    octagon(g, 43);
    fs(g, PAPER_SHADE, 4.5);
    octagon(g, 32);
    st(g, 3, VERM);
    g.stroke();
    // 五张放射天师赤符
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate((i / 5) * TAU - Math.PI / 2);
      poly(g, [[-7, -44], [7, -44], [6, -18], [-6, -18]]);
      fs(g, VERM, 3.2);
      st(g, 2, PAPER);
      g.beginPath();
      g.moveTo(0, -40);
      g.lineTo(0, -23);
      g.stroke();
      g.restore();
    }
    // 中心雷印与金电折线
    circ(g, 0, 0, 14);
    fs(g, INK, 3.5);
    st(g, 3.5, LANTERN);
    g.beginPath();
    g.moveTo(-22, -16);
    g.lineTo(-6, -2);
    g.lineTo(6, -8);
    g.lineTo(22, 16);
    g.moveTo(18, -20);
    g.lineTo(2, 0);
    g.lineTo(-18, 18);
    g.stroke();
    circ(g, 0, 0, 5);
    g.fillStyle = VERM;
    g.fill();
  },
  brush(g) {
    // 泼墨山河：双峰浓墨远山 + 朱砂旭日印 + 翻卷墨浪 + 横空巨椽飞白
    // 旭日朱印
    vfill(g, () => circ(g, -18, -22, 14));
    // 三重浓墨山峰
    poly(g, [[-44, 20], [-24, -18], [-6, 12], [12, -32], [38, 20]]);
    fs(g, INK, 4);
    poly(g, [[-14, 22], [4, -8], [24, 22]]);
    fs(g, PAPER_SHADE, 3.5);
    // 奔涌山河浪纹
    brushStroke(g, [[-44, 26], [-12, 18], [18, 30], [44, 20]], 11, { seed: 41, color: INK, dry: 0.45 });
    brushStroke(g, [[-38, 38], [0, 32], [40, 40]], 8, { seed: 43, color: VERM, dry: 0.35 });
    // 斜劈而下的神笔笔锋
    poly(g, [[22, -44], [44, -36], [18, -6], [10, -14]]);
    fs(g, LANTERN, 3.5);
  },
  coinsword(g) {
    // 七星剑阵：七柄飞剑呈拱形剑屏齐发 + 北斗七星金线连珠
    const angles = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
    angles.forEach((a, idx) => {
      g.save();
      g.translate(0, 26);
      g.rotate(a);
      const len = idx === 3 ? 68 : idx === 2 || idx === 4 ? 60 : 50;
      st(g, 3.5, idx === 3 ? VERM : INK);
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(0, -len);
      g.stroke();
      poly(g, [[-4.5, -len + 6], [0, -len - 7], [4.5, -len + 6]]);
      fs(g, idx % 2 === 0 ? LANTERN : VERM, 2.2);
      g.restore();
    });
    // 阵底太极剑台 + 北斗连星
    poly(g, [[-28, 28], [28, 28], [20, 40], [-20, 40]]);
    fs(g, INK, 3.5);
    const stars = [[-32, -8], [-18, -22], [-4, -18], [8, -28], [20, -20], [32, -30], [36, -12]];
    st(g, 2.6, LANTERN);
    poly(g, stars, false);
    g.stroke();
    for (const [sx, sy] of stars) {
      circ(g, sx, sy, 3.6);
      fs(g, PAPER, 2);
    }
  },
  paperman(g) {
    // 纸扎仪仗：三尊披甲冠冕纸将列阵 + 旌旗华盖长戟（与单个剪纸小人完全不同）
    // 仪仗华盖旗
    st(g, 4, INK);
    g.beginPath();
    g.moveTo(-34, 38);
    g.lineTo(-34, -40);
    g.moveTo(34, 38);
    g.lineTo(34, -40);
    g.stroke();
    poly(g, [[-34, -42], [-14, -36], [-34, -26]]);
    fs(g, VERM, 3);
    poly(g, [[34, -42], [14, -36], [34, -26]]);
    fs(g, LANTERN, 3);
    // 左右护卫纸兵
    for (const dx of [-20, 20]) {
      circ(g, dx, -6, 8);
      fs(g, PAPER_SHADE, 3);
      poly(g, [[dx - 10, 4], [dx + 10, 4], [dx + 13, 36], [dx - 13, 36]]);
      fs(g, INK, 3);
    }
    // 中央披甲主将
    poly(g, [[-12, -34], [12, -34], [9, -24], [-9, -24]]);
    fs(g, LANTERN, 3);
    circ(g, 0, -14, 10.5);
    fs(g, PAPER, 3.5);
    poly(g, [[-16, -2], [16, -2], [22, 40], [-22, 40]]);
    fs(g, VERM, 4);
    // 胸前护心宝镜
    circ(g, 0, 14, 6.5);
    fs(g, LANTERN, 3);
  },
  firecracker(g) {
    // 满堂红：十二瓣怒放朱金牡丹爆焰 + 环绕盘旋挂鞭串
    // 十二瓣爆裂火花轮
    for (let i = 0; i < 12; i++) {
      g.save();
      g.rotate((i / 12) * TAU);
      poly(g, [[0, -46], [8, -22], [0, -12], [-8, -22]]);
      fs(g, i % 2 === 0 ? VERM : LANTERN, 3);
      g.restore();
    }
    // 四角炸飞的小红炮段
    for (const [cx, cy, r] of [[-32, -30, -0.5], [32, -28, 0.6], [-30, 30, 0.5], [32, 30, -0.6]]) {
      g.save();
      g.translate(cx, cy);
      g.rotate(r);
      poly(g, [[-5, -10], [5, -10], [5, 10], [-5, 10]]);
      fs(g, VERM_DARK, 2.8);
      g.restore();
    }
    // 核心留白爆点与花蕊
    circ(g, 0, 0, 17);
    fs(g, PAPER, 4);
    vfill(g, () => circ(g, 0, 0, 8.5));
  },
  bell(g) {
    // 千铃引魂：重檐宝塔飞梁 + 主镇魂金钟 + 左右双子子母引魂铃 + 音波环
    // 飞檐横梁
    poly(g, [[-44, -22], [0, -40], [44, -22], [36, -16], [-36, -16]]);
    fs(g, INK, 4);
    // 左右子铃
    for (const dx of [-28, 28]) {
      poly(g, [[dx - 8, 12], [dx - 6, -12], [dx + 6, -12], [dx + 10, 12]]);
      fs(g, LANTERN, 3.2);
      circ(g, dx, 16, 3.5);
      g.fillStyle = VERM;
      g.fill();
    }
    // 中央赤金主法钟
    g.beginPath();
    g.moveTo(-16, 18);
    g.bezierCurveTo(-18, -18, 18, -18, 16, 18);
    g.lineTo(22, 24);
    g.lineTo(-22, 24);
    g.closePath();
    fs(g, VERM, 4.2);
    circ(g, 0, 4, 6);
    fs(g, LANTERN, 2.5);
    // 底部三道扩散魂波
    st(g, 3.2, VERM);
    g.beginPath();
    g.arc(0, 24, 14, 0.2, Math.PI - 0.2);
    g.stroke();
    st(g, 2.8, INK);
    g.beginPath();
    g.arc(0, 24, 23, 0.25, Math.PI - 0.25);
    g.stroke();
  },
  compass(g) {
    // 天星定穴盘：双斜交浑天星环 + 四方定穴金针 + 北斗星宿罗列
    circ(g, 0, 0, 40);
    fs(g, INK, 4.5);
    // 双椭圆斜交星轨环
    for (const tilt of [-0.55, 0.55]) {
      g.save();
      g.rotate(tilt);
      g.beginPath();
      g.ellipse(0, 0, 44, 18, 0, 0, TAU);
      st(g, 4, tilt < 0 ? LANTERN : VERM);
      g.stroke();
      g.restore();
    }
    // 四向天星长针
    for (let i = 0; i < 4; i++) {
      g.save();
      g.rotate((i / 4) * TAU);
      poly(g, [[0, -45], [6, -14], [-6, -14]]);
      fs(g, i % 2 === 0 ? VERM : PAPER, 2.8);
      g.restore();
    }
    circ(g, 0, 0, 12);
    fs(g, LANTERN, 3.5);
    circ(g, 0, 0, 4.5);
    g.fillStyle = INK;
    g.fill();
  },
  soulbanner(g) {
    // 无常勾魂幡：黑白双幡交叉 + 弯月铁勾魂锁 + 环绕幽魂暖焰
    // 交叉双幡杆
    st(g, 5.5, INK);
    g.beginPath();
    g.moveTo(-34, 42);
    g.lineTo(28, -42);
    g.moveTo(34, 42);
    g.lineTo(-28, -42);
    g.stroke();
    // 左墨幡、右朱幡
    poly(g, [[-38, -28], [-12, -36], [-8, 16], [-32, 24]]);
    fs(g, INK, 3.5);
    poly(g, [[38, -28], [12, -36], [8, 16], [32, 24]]);
    fs(g, VERM, 3.5);
    // 中央勾魂弯镰与魂火宝珠
    g.beginPath();
    g.arc(0, 2, 20, -Math.PI * 0.85, Math.PI * 0.35);
    st(g, 6.5, PAPER);
    g.stroke();
    st(g, 3.5, INK);
    g.stroke();
    circ(g, 0, 4, 10);
    fs(g, LANTERN, 3.5);
    vfill(g, () => circ(g, 0, 4, 4.5));
  },
  bronze_mirror(g) {
    // 乾坤赤阳镜：八芒烈日火轮 + 八卦赤金镜心 + 三道破邪赤阳神光柱
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * TAU);
      poly(g, [[0, -46], [9, -28], [-9, -28]]);
      fs(g, i % 2 === 0 ? VERM : LANTERN, 3);
      g.restore();
    }
    octagon(g, 29, 0);
    fs(g, VERM_DARK, 4.5);
    circ(g, 0, 0, 19);
    fs(g, LANTERN, 3.5);
    // 破邪金光束斜射而出
    poly(g, [[-6, -4], [6, -6], [42, 34], [24, 44]]);
    fs(g, PAPER, 3);
    circ(g, 0, 0, 8);
    fs(g, VERM, 3);
  },
  paperhorse(g) {
    // 百鬼夜行图：展开的古画长卷轴 + 破卷跃出的朱甲烈焰铁骑
    // 横展画卷与墨玉轴头
    poly(g, [[-40, -18], [40, -18], [40, 28], [-40, 28]]);
    fs(g, PAPER_SHADE, 4);
    g.fillStyle = INK;
    g.fillRect(-46, -24, 7, 58);
    g.fillRect(39, -24, 7, 58);
    // 卷中赤潮墨浪
    brushStroke(g, [[-34, 18], [0, 8], [34, 20]], 9, { seed: 73, color: INK, dry: 0.4 });
    // 破卷腾跃而出的朱甲神骏
    poly(g, [[-26, 12], [-10, -16], [10, -18], [20, -42], [36, -30], [24, -10], [34, 8], [10, 12], [-4, 34], [-14, 30]]);
    fs(g, VERM, 4.2);
    // 背插双靠旗
    poly(g, [[-6, -16], [-24, -40], [-10, -34]]);
    fs(g, LANTERN, 2.8);
    circ(g, 24, -31, 3);
    g.fillStyle = PAPER;
    g.fill();
  },
  taomujian(g) {
    // 天罡雷木剑阵：五剑冲霄扇列 + 八角雷坛印座 + 金朱天雷电弧
    const angles = [-0.56, -0.28, 0, 0.28, 0.56];
    angles.forEach((a, idx) => {
      g.save();
      g.translate(0, 18);
      g.rotate(a);
      const top = idx === 2 ? -62 : idx === 1 || idx === 3 ? -54 : -46;
      poly(g, [[-4.5, -14], [0, top], [4.5, -14]]);
      fs(g, idx === 2 ? LANTERN : PAPER, 3);
      st(g, 2.2, VERM);
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(0, top + 8);
      g.stroke();
      g.restore();
    });
    octagon(g, 22);
    fs(g, VERM_DARK, 4.2);
    st(g, 3.4, LANTERN);
    g.beginPath();
    g.moveTo(-36, -6);
    g.lineTo(-14, 2);
    g.lineTo(0, -10);
    g.lineTo(14, 4);
    g.lineTo(36, -6);
    g.stroke();
    circ(g, 0, 4, 7.5);
    fs(g, PAPER, 3);
  },
  suohun_chain(g) {
    // 黑白无常夺魄索：十字裂空铁索 + 阎罗敕令黑牌 + 四隅勾魂弯镰
    st(g, 6, INK);
    g.beginPath();
    g.moveTo(-40, -40);
    g.lineTo(40, 40);
    g.moveTo(40, -40);
    g.lineTo(-40, 40);
    g.stroke();
    st(g, 2.6, PAPER_SHADE);
    g.beginPath();
    g.moveTo(-36, -36);
    g.lineTo(36, 36);
    g.moveTo(36, -36);
    g.lineTo(-36, 36);
    g.stroke();
    for (const [hx, hy, rot] of [[-34, -34, -2.3], [34, -34, -0.8], [34, 34, 0.8], [-34, 34, 2.3]]) {
      g.save();
      g.translate(hx, hy);
      g.rotate(rot);
      poly(g, [[0, -10], [10, 4], [-6, 4]]);
      fs(g, VERM, 2.8);
      g.restore();
    }
    poly(g, [[-15, -24], [0, -32], [15, -24], [15, 26], [-15, 26]]);
    fs(g, INK, 4);
    st(g, 2.5, VERM);
    g.strokeRect(-10, -18, 20, 38);
    circ(g, 0, 0, 6);
    fs(g, LANTERN, 2.5);
  },
  zhinian_kite(g) {
    // 金乌焚天火鸦阵：赤金日曜火轮 + 三足金乌环飞追日
    circ(g, 0, 0, 35);
    fs(g, LANTERN, 4.5);
    vfill(g, () => circ(g, 0, 0, 23));
    for (let i = 0; i < 3; i++) {
      g.save();
      g.rotate((i / 3) * TAU - Math.PI / 6);
      poly(g, [[0, -46], [16, -28], [4, -24], [0, -16], [-4, -24], [-16, -28]]);
      fs(g, INK, 3.2);
      circ(g, 0, -31, 3);
      g.fillStyle = LANTERN;
      g.fill();
      g.restore();
    }
    circ(g, 0, 0, 9.5);
    fs(g, PAPER, 3.2);
  },
  nuo_drum(g) {
    // 太古百相傩坛：双角神傩冠冕 + 同心雷纹巨鼓 + 双槌交击三叠震波
    poly(g, [[-26, -18], [-38, -42], [-16, -30], [0, -44], [16, -30], [38, -42], [26, -18]]);
    fs(g, INK, 4);
    circ(g, 0, 8, 26);
    fs(g, VERM, 4.8);
    circ(g, 0, 8, 16);
    fs(g, LANTERN, 3.5);
    circ(g, 0, 8, 6.5);
    fs(g, PAPER, 2.8);
    st(g, 4.5, INK);
    g.beginPath();
    g.moveTo(-28, 42);
    g.lineTo(-8, 22);
    g.moveTo(28, 42);
    g.lineTo(8, 22);
    g.stroke();
    st(g, 3.2, VERM);
    g.beginPath();
    g.arc(0, 8, 36, -0.65, 0.65);
    g.stroke();
    g.beginPath();
    g.arc(0, 8, 36, Math.PI - 0.65, Math.PI + 0.65);
    g.stroke();
  },
  mourning_staff(g) {
    // 幽冥镇魂杆：周天旋风白幡双环 + 镇魂金轮杖顶 + 朱砂镇字核
    circ(g, 0, 0, 38);
    fs(g, PAPER, 4);
    vfill(g, () => circ(g, 0, 0, 26));
    for (let i = 0; i < 4; i++) {
      g.save();
      g.rotate((i / 4) * TAU + 0.4);
      poly(g, [[0, -44], [18, -32], [8, -22], [-6, -28]]);
      fs(g, i % 2 === 0 ? PAPER_SHADE : LANTERN, 2.8);
      g.restore();
    }
    st(g, 5.2, INK);
    g.beginPath();
    g.moveTo(0, -34);
    g.lineTo(0, 36);
    g.stroke();
    circ(g, 0, 0, 10);
    fs(g, LANTERN, 3.2);
  },
  sky_lantern(g) {
    // 九天赤焰灯：三重赤金飞天宝灯 + 流火羽翼星雨
    poly(g, [[-26, -18], [0, -42], [26, -18], [20, 18], [-20, 18]]);
    fs(g, VERM, 4.4);
    poly(g, [[-16, -12], [0, -28], [16, -12], [12, 12], [-12, 12]]);
    fs(g, LANTERN, 3);
    circ(g, 0, 0, 6);
    fs(g, PAPER, 2.4);
    for (const [sx, sy] of [[-32, 24], [0, 36], [32, 24]]) {
      poly(g, [[sx, sy - 8], [sx + 6, sy + 2], [sx, sy + 10], [sx - 6, sy + 2]]);
      fs(g, sx === 0 ? VERM : LANTERN, 2.4);
    }
  },
  carpenter_line(g) {
    // 乾坤断魂线：三才正逆交叠墨朱星芒阵 + 中心玄墨乾坤轮
    poly(g, [[0, -42], [36, 22], [-36, 22]]);
    fs(g, PAPER_SHADE, 3.8);
    st(g, 3.8, VERM);
    poly(g, [[0, 42], [36, -22], [-36, -22]]);
    g.stroke();
    circ(g, 0, 0, 16);
    fs(g, INK, 3.6);
    circ(g, 0, 0, 6.5);
    fs(g, LANTERN, 2.4);
  },
  luopan_slip(g) {
    // 天罡定穴签：八方金朱飞签环射罗盘心穴
    octagon(g, 34);
    fs(g, PAPER, 3.8);
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i / 6) * TAU);
      poly(g, [[-3.5, -14], [0, -44], [3.5, -14]]);
      fs(g, i % 2 === 0 ? VERM : LANTERN, 2.4);
      g.restore();
    }
    circ(g, 0, 0, 12);
    fs(g, INK, 3);
    circ(g, 0, 0, 4.5);
    fs(g, LANTERN, 2);
  },
};

export const RELIC_ICONS = {
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
    st(g, 3, paperA(0.7));
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
    octagon(g, 44);
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
  strawshoes(g) {
    // 草鞋：成双编织麻草履 + 朱红系鼻绳结
    for (const [dx, rot] of [[-15, -0.18], [15, 0.18]]) {
      g.save();
      g.translate(dx, 2);
      g.rotate(rot);
      g.beginPath();
      g.ellipse(0, 0, 14, 34, 0, 0, TAU);
      fs(g, PAPER_SHADE, 4.5);
      // 草编横纹与绊带
      st(g, 2.2, inkA(0.6));
      g.beginPath();
      for (let y = -22; y <= 22; y += 9) {
        g.moveTo(-10, y);
        g.lineTo(10, y);
      }
      g.stroke();
      st(g, 3.6, INK);
      g.beginPath();
      g.moveTo(-11, 4);
      g.quadraticCurveTo(0, -16, 11, 4);
      g.stroke();
      vfill(g, () => circ(g, 0, -18, 4.5));
      g.restore();
    }
  },
  glutinous(g) {
    // 糯米：满盛雪白糯米的黑陶升斗 + 朱红菱形镇邪斗贴
    // 糯米尖堆
    g.beginPath();
    g.moveTo(-34, -4);
    g.quadraticCurveTo(0, -44, 34, -4);
    g.closePath();
    fs(g, PAPER, 4.5);
    // 米粒肌理点
    g.fillStyle = inkA(0.55);
    for (const [rx, ry] of [[-12, -14], [0, -22], [11, -12], [-4, -10], [6, -18]]) {
      g.beginPath();
      g.ellipse(rx, ry, 3, 1.5, 0.3, 0, TAU);
      g.fill();
    }
    // 陶碗/木斗
    poly(g, [[-36, -4], [36, -4], [26, 36], [-26, 36]]);
    fs(g, INK, 4.5);
    // 斗前朱砂菱形封签
    vfill(g, () => poly(g, [[0, 2], [13, 16], [0, 30], [-13, 16]]));
    poly(g, [[0, 7], [7, 16], [0, 25], [-7, 16]]);
    st(g, 2.2, PAPER);
    g.stroke();
  },
  fivecoins(g) {
    // 五帝钱：梅花五枚方孔古铜钱 + 朱红盘长同心结
    withMisreg(g, () => {
      st(g, 5, VERM);
      circ(g, 0, 0, 24);
      g.stroke();
      g.beginPath();
      g.moveTo(0, 24);
      g.lineTo(-6, 45);
      g.moveTo(0, 24);
      g.lineTo(6, 45);
      g.stroke();
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      const cx = Math.cos(a) * 24;
      const cy = Math.sin(a) * 24;
      circ(g, cx, cy, 13);
      fs(g, PAPER_SHADE, 3.8);
      g.beginPath();
      g.rect(cx - 4, cy - 4, 8, 8);
      fs(g, INK, 2);
    }
    poly(g, [[0, -8], [8, 0], [0, 8], [-8, 0]]);
    fs(g, VERM, 2.8);
  },
  soulwick(g) {
    // 引魂灯芯：黑漆浅盏 + 探出盘捻 + 琥珀朱砂双芯魂火
    // 魂火外焰与内芯
    vfill(g, () => {
      g.beginPath();
      g.moveTo(4, -44);
      g.bezierCurveTo(22, -26, 20, -4, 8, 6);
      g.quadraticCurveTo(-8, 6, -10, -8);
      g.bezierCurveTo(-12, -24, -4, -34, 4, -44);
    });
    g.beginPath();
    g.moveTo(3, -32);
    g.bezierCurveTo(13, -18, 12, -4, 4, 4);
    g.quadraticCurveTo(-4, 4, -4, -8);
    g.bezierCurveTo(-5, -18, 0, -24, 3, -32);
    fs(g, LANTERN, 3.5);
    // 灯芯草捻
    st(g, 5, PAPER_SHADE);
    g.beginPath();
    g.moveTo(-16, 18);
    g.quadraticCurveTo(-2, 14, 4, 2);
    g.stroke();
    // 浅油盏与托座
    g.beginPath();
    g.moveTo(-38, 14);
    g.lineTo(36, 14);
    g.quadraticCurveTo(28, 32, 0, 32);
    g.quadraticCurveTo(-28, 32, -38, 14);
    g.closePath();
    fs(g, INK, 4.5);
    poly(g, [[-16, 32], [16, 32], [22, 42], [-22, 42]]);
    fs(g, PAPER_SHADE, 3.5);
  },
  leijimu(g) {
    // 雷击枣木：焦黑虬结枣木桩 + 贯心金朱天雷裂纹 + 侧生新枝
    poly(g, [[-20, -38], [16, -42], [26, 38], [-26, 40], [-28, -4]]);
    fs(g, INK, 4.5);
    poly(g, [[18, -10], [38, -24], [34, -12], [20, 0]]);
    fs(g, PAPER_SHADE, 3.4);
    poly(g, [[-2, -40], [10, -14], [-4, 2], [9, 38], [-7, 10], [3, -12]]);
    fs(g, LANTERN, 2.8, VERM);
  },
  yinpai(g) {
    // 勾魂阴牌：圭首黑木腰牌 + 宣纸内匾 + 朱砂双框敕纹 + 提环流苏
    circ(g, 0, -40, 6.5);
    fs(g, LANTERN, 3.2);
    poly(g, [[-22, -28], [0, -36], [22, -28], [25, 32], [-25, 32]]);
    fs(g, INK, 4.5);
    poly(g, [[-15, -20], [15, -20], [17, 24], [-17, 24]]);
    fs(g, PAPER_SHADE, 3);
    st(g, 3.6, VERM);
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(0, 18);
    g.moveTo(-9, -4);
    g.lineTo(9, -4);
    g.moveTo(-8, 10);
    g.lineTo(8, 10);
    g.stroke();
    vfill(g, () => poly(g, [[-4, 32], [4, 32], [7, 46], [-7, 46]]));
  },
  huoyao_pouch(g) {
    // 硫磺火药囊：束口粗布鼓囊 + 朱砂火字菱印 + 引线爆星
    g.beginPath();
    g.moveTo(-14, -14);
    g.bezierCurveTo(-38, -2, -38, 36, 0, 38);
    g.bezierCurveTo(38, 36, 38, -2, 14, -14);
    g.closePath();
    fs(g, PAPER_SHADE, 4.8);
    poly(g, [[-18, -24], [18, -24], [12, -12], [-12, -12]]);
    fs(g, VERM, 3.6);
    vfill(g, () => poly(g, [[0, 0], [14, 14], [0, 28], [-14, 14]]));
    circ(g, 0, 14, 4.5);
    fs(g, LANTERN, 2.2);
    st(g, 3.6, INK);
    g.beginPath();
    g.moveTo(2, -24);
    g.quadraticCurveTo(8, -38, 20, -40);
    g.stroke();
    for (const [sx, sy] of [[24, -42], [18, -46], [26, -34]]) {
      circ(g, sx, sy, 3.2);
      fs(g, LANTERN, 2, VERM);
    }
  },
  wuse_mask(g) {
    // 五色傩面：弯角獠牙威猛神面 + 额间金焰神目 + 朱墨面纹
    poly(g, [[-24, -20], [-40, -42], [-14, -26]]);
    fs(g, INK, 3.8);
    poly(g, [[24, -20], [40, -42], [14, -26]]);
    fs(g, INK, 3.8);
    poly(g, [[-28, -22], [28, -22], [30, 12], [14, 36], [-14, 36], [-30, 12]]);
    fs(g, PAPER, 4.6);
    vfill(g, () => poly(g, [[-26, -4], [-10, -2], [-12, 8], [-26, 6]]));
    vfill(g, () => poly(g, [[26, -4], [10, -2], [12, 8], [26, 6]]));
    poly(g, [[0, -20], [7, -8], [0, 0], [-7, -8]]);
    fs(g, LANTERN, 2.8, VERM);
    g.fillStyle = INK;
    circ(g, -12, -8, 3.5);
    g.fill();
    circ(g, 12, -8, 3.5);
    g.fill();
    poly(g, [[-18, 22], [-12, 10], [-7, 22], [7, 22], [12, 10], [18, 22]]);
    fs(g, PAPER_SHADE, 3.2);
  },
  altar_mirror(g) {
    // 镇坛铜镜：云纹木托底座 + 双圈金铜圆镜 + 镜心朱印
    poly(g, [[-30, 26], [30, 26], [38, 40], [-38, 40]]);
    fs(g, INK, 3.8);
    circ(g, 0, -4, 30);
    fs(g, LANTERN, 4.4);
    circ(g, 0, -4, 20);
    fs(g, PAPER, 3.2);
    poly(g, [[0, -16], [10, -4], [0, 8], [-10, -4]]);
    fs(g, VERM, 2.4);
  },
  lamp_oil(g) {
    // 长明灯油：双耳黑陶油壶 + 壶口滴落金油火珠 + 朱红封贴
    poly(g, [[-12, -32], [12, -32], [8, -16], [28, 6], [24, 36], [-24, 36], [-28, 6], [-8, -16]]);
    fs(g, INK, 4.4);
    poly(g, [[0, -4], [14, 10], [0, 24], [-14, 10]]);
    fs(g, VERM, 2.8);
    circ(g, 26, -24, 7.5);
    fs(g, LANTERN, 2.6);
  },
  folk_rice(g) {
    // 百家米：束口百纳拼布米袋 + 满溢雪白米堆 + 朱印福贴
    poly(g, [[-26, -6], [26, -6], [32, 34], [-32, 34]]);
    fs(g, PAPER_SHADE, 4.4);
    g.beginPath();
    g.moveTo(-22, -6);
    g.quadraticCurveTo(0, -34, 22, -6);
    g.closePath();
    fs(g, PAPER, 3.6);
    vfill(g, () => poly(g, [[-11, 6], [11, 6], [11, 26], [-11, 26]]));
    st(g, 2.2, INK);
    g.beginPath();
    g.moveTo(-28, 14);
    g.lineTo(-14, 14);
    g.moveTo(14, 14);
    g.lineTo(28, 14);
    g.stroke();
  },
  cinnabar_pen(g) {
    // 朱砂笔：斜握紫毫长管符笔 + 饱蘸赤朱笔锋 + 飞溅朱点
    g.save();
    g.rotate(0.55);
    poly(g, [[-5, -42], [5, -42], [6, 12], [-6, 12]]);
    fs(g, INK, 3.6);
    poly(g, [[-7, 12], [7, 12], [0, 38]]);
    fs(g, VERM, 3.2);
    circ(g, 0, -44, 5);
    fs(g, LANTERN, 2.4);
    g.restore();
    for (const [dx, dy, r] of [[-24, 28, 4.5], [-10, 38, 3.2], [18, 30, 3.8]]) {
      circ(g, dx, dy, r);
      fs(g, VERM, 1.8);
    }
  },
};

export const HERO_ICONS = {
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
  yinyang(g) {
    // 阴阳先生·沈观星：方正阴阳道冠 + 太极金徽 + 三缕清髯
    circ(g, 0, 8, 19);
    fs(g, PAPER, 4);
    poly(g, [[-18, -12], [-16, -40], [16, -40], [18, -12]]);
    fs(g, INK, 4);
    circ(g, 0, -26, 7.5);
    fs(g, LANTERN, 2.8);
    vfill(g, () => circ(g, 0, -26, 3.2));
    g.fillStyle = INK;
    circ(g, -7, 8, 2.4);
    g.fill();
    circ(g, 7, 8, 2.4);
    g.fill();
    st(g, 3.2, INK);
    g.beginPath();
    g.moveTo(-6, 22);
    g.lineTo(-9, 40);
    g.moveTo(0, 23);
    g.lineTo(0, 44);
    g.moveTo(6, 22);
    g.lineTo(9, 40);
    g.stroke();
  },
  tiejiang(g) {
    // 镇魂铁匠·石敢当：方颌浓眉虬髯 + 朱红束额英雄巾
    poly(g, [[-21, -10], [21, -10], [19, 20], [0, 28], [-19, 20]]);
    fs(g, PAPER_SHADE, 4.2);
    vfill(g, () => poly(g, [[-24, -18], [24, -18], [24, -8], [-24, -8]]));
    vfill(g, () => poly(g, [[22, -14], [38, -22], [34, -6]]));
    st(g, 4.2, INK);
    g.beginPath();
    g.moveTo(-13, 0);
    g.lineTo(-4, 2);
    g.moveTo(13, 0);
    g.lineTo(4, 2);
    g.stroke();
    g.fillStyle = INK;
    circ(g, -8, 7, 2.6);
    g.fill();
    circ(g, 8, 7, 2.6);
    g.fill();
    poly(g, [[-18, 15], [18, 15], [13, 40], [0, 44], [-13, 40]]);
    fs(g, INK, 3.5);
  },
  nuoxi(g) {
    // 傩戏传人·柳青衣：双翎雉尾 + 斜戴朱金半傩面 + 秀目云鬓
    st(g, 4.2, VERM);
    g.beginPath();
    g.moveTo(-6, -24);
    g.quadraticCurveTo(-24, -44, -42, -44);
    g.moveTo(6, -24);
    g.quadraticCurveTo(24, -44, 42, -44);
    g.stroke();
    circ(g, 0, 10, 19);
    fs(g, PAPER, 4);
    poly(g, [[-20, 6], [-22, -14], [22, -14], [20, 6], [14, -4], [-14, -4]]);
    fs(g, INK, 3.2);
    g.save();
    g.translate(4, -20);
    g.rotate(0.18);
    poly(g, [[-16, -10], [16, -10], [14, 10], [-14, 10]]);
    fs(g, VERM, 3.5);
    circ(g, -5, 0, 3);
    fs(g, LANTERN, 2);
    circ(g, 6, 0, 3);
    fs(g, LANTERN, 2);
    g.restore();
    g.fillStyle = INK;
    circ(g, -7, 13, 2.5);
    g.fill();
    circ(g, 7, 13, 2.5);
    g.fill();
  },
};

export const MISC_ICONS = {
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
  blessing(g) {
    // 守夜命签：朱红竹签
    poly(g, [[-14, -44], [0, -50], [14, -44], [14, 44], [-14, 44]]);
    fs(g, VERM, 4.5);
    st(g, 3, LANTERN);
    g.strokeRect(-8, -34, 16, 68);
    circ(g, 0, -22, 4);
    g.fillStyle = PAPER;
    g.fill();
  },
};

/**
 * 在 (x,y) 为中心、size×size 的区域绘制图标。
 * kind: 'weapon' | 'evo' | 'relic' | 'hero' | 'overflow' | 'coin' | 'bun' | 'blessing'
 */
export function drawIcon(ctx, kind, id, x, y, size) {
  let fn = null;
  if (kind === 'weapon') fn = WEAPON_ICONS[id];
  else if (kind === 'evo') fn = EVO_WEAPON_ICONS[id] || WEAPON_ICONS[id];
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
  if (kind === 'evo') {
    withMisreg(g, () => {
      g.strokeStyle = vermA(0.85);
      g.lineWidth = 2;
      g.strokeRect(2.5, 2.5, size - 5, size - 5);
    });
    drawIcon(g, 'evo', id, size / 2, size / 2, size * 0.84);
  } else {
    drawIcon(g, kind, id, size / 2, size / 2, size * 0.86);
  }
  printSpeckle(g, size, size, makeRng(hashStr(key)), 0.01, 0.6);
  const url = c.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}
