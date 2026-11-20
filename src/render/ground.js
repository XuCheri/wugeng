// ground.js —— 青石镇地面：石板街、窄巷、草丛、碎石，按区块程序生成并缓存
import { INK, PAPER_SHADE, inkA } from './palette.js';
import { makeCanvas, makeRng, hash2, brushStroke } from './ink.js';

export const CHUNK = 320;
const STREET_GAP_Y = 780; // 横街间距
const STREET_W = 124;
const ALLEY_GAP_X = 640; // 竖巷间距
const ALLEY_W = 84;

function streetCenterY(k, seed) {
  if (k === 0) return 0;
  return k * STREET_GAP_Y + ((hash2(k, 11, seed) % 160) - 80);
}
function alleyCenterX(k, seed) {
  return k * ALLEY_GAP_X + 260 + ((hash2(k, 23, seed) % 140) - 70);
}

/** 世界坐标 (x,y) 是否在横街内（供外部查询，可选） */
export function inStreet(x, y, seed) {
  const k = Math.round(y / STREET_GAP_Y);
  for (let j = k - 1; j <= k + 1; j++) {
    if (Math.abs(y - streetCenterY(j, seed)) < STREET_W / 2) return true;
  }
  return false;
}

function slabOutline(g, x, y, w, h, rng) {
  // 四条略出头的边，偶尔缺一笔：木刻印刷的石板
  const j = () => (rng() - 0.5) * 1.6;
  const skip = rng() < 0.35 ? Math.floor(rng() * 4) : -1;
  g.beginPath();
  const edges = [
    [x - 1 + j(), y + j(), x + w + 1 + j(), y + j()],
    [x + w + j(), y - 1 + j(), x + w + j(), y + h + 1 + j()],
    [x + w + 1 + j(), y + h + j(), x - 1 + j(), y + h + j()],
    [x + j(), y + h + 1 + j(), x + j(), y - 1 + j()],
  ];
  for (let i = 0; i < 4; i++) {
    if (i === skip) continue;
    const e = edges[i];
    const mx = (e[0] + e[2]) / 2 + j() * 0.8;
    const my = (e[1] + e[3]) / 2 + j() * 0.8;
    g.moveTo(e[0], e[1]);
    g.quadraticCurveTo(mx, my, e[2], e[3]);
  }
  g.stroke();
}

function drawStreetH(g, k, seed, cx0, cy0) {
  const yc = streetCenterY(k, seed);
  const top = yc - STREET_W / 2;
  const rows = 4;
  const rh = STREET_W / rows;
  const x0 = cx0 - 80;
  const x1 = cx0 + CHUNK + 80;
  for (let r = 0; r < rows; r++) {
    const L = 50 + (hash2(k, r, seed + 5) % 14);
    const off = (r % 2) * L * 0.5 + (hash2(k, r, seed + 9) % 20);
    const i0 = Math.floor((x0 - off) / L);
    const i1 = Math.ceil((x1 - off) / L);
    for (let i = i0; i <= i1; i++) {
      const h = hash2(i, k * 8 + r, seed + 101);
      const rng = makeRng(h);
      if (rng() < 0.16) continue; // 缺失的石板
      const sx = off + i * L + 2 + rng() * 2;
      const sw = L - 4 - rng() * 5;
      const sy = top + r * rh + 2 + rng() * 1.5;
      const sh = rh - 4 - rng() * 2;
      drawSlab(g, sx - cx0, sy - cy0, sw, sh, rng);
    }
  }
  // 街沿：断续的墨线
  g.strokeStyle = inkA(0.38);
  g.lineWidth = 1.4;
  for (const yy of [top - 4, top + STREET_W + 4]) {
    const rng = makeRng(hash2(Math.floor(cx0 / CHUNK), Math.round(yy), seed + 77));
    let x = -10;
    g.beginPath();
    while (x < CHUNK + 10) {
      const len = 20 + rng() * 50;
      if (rng() > 0.25) {
        g.moveTo(x, yy - cy0 + (rng() - 0.5) * 2);
        g.lineTo(x + len, yy - cy0 + (rng() - 0.5) * 2);
      }
      x += len + 6 + rng() * 14;
    }
    g.stroke();
  }
}

function drawAlleyV(g, k, seed, cx0, cy0) {
  const xc = alleyCenterX(k, seed);
  const left = xc - ALLEY_W / 2;
  const cols = 2;
  const cw = ALLEY_W / cols;
  const y0 = cy0 - 80;
  const y1 = cy0 + CHUNK + 80;
  for (let c = 0; c < cols; c++) {
    const L = 46 + (hash2(k, c, seed + 15) % 12);
    const off = (c % 2) * L * 0.5;
    const i0 = Math.floor((y0 - off) / L);
    const i1 = Math.ceil((y1 - off) / L);
    for (let i = i0; i <= i1; i++) {
      const sy = off + i * L;
      // 与横街相交处让给横街
      if (inStreet(left + c * cw + cw / 2, sy + L / 2, seed)) continue;
      const rng = makeRng(hash2(i, k * 4 + c, seed + 203));
      if (rng() < 0.22) continue;
      drawSlab(g, left + c * cw + 2 + rng() * 1.5 - cx0, sy + 2 - cy0, cw - 4 - rng() * 2, L - 4 - rng() * 5, rng);
    }
  }
}

function drawSlab(g, x, y, w, h, rng) {
  if (rng() < 0.45) {
    g.fillStyle = 'rgba(224,210,180,0.55)';
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  g.strokeStyle = inkA(0.34 + rng() * 0.12);
  g.lineWidth = 1.15;
  slabOutline(g, x, y, w, h, rng);
  // 裂纹
  if (rng() < 0.18) {
    g.strokeStyle = inkA(0.3);
    g.lineWidth = 0.8;
    g.beginPath();
    let px = x + rng() * w;
    let py = y;
    g.moveTo(px, py);
    for (let i = 0; i < 3; i++) {
      px += (rng() - 0.5) * w * 0.4;
      py += h / 3;
      g.lineTo(px, py);
    }
    g.stroke();
  }
}

function drawTuft(g, x, y, s, rng) {
  // 草丛：3–5 笔出锋的短墨线
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.5 + (rng() - 0.5) * 0.3;
    const len = s * (0.6 + rng() * 0.6) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.6);
    const bx = x + (i - n / 2) * 1.4;
    brushStroke(
      g,
      [
        [bx, y],
        [bx + Math.cos(a) * len * 0.5 + (rng() - 0.5), y + Math.sin(a) * len * 0.5],
        [bx + Math.cos(a) * len, y + Math.sin(a) * len],
      ],
      1.8,
      { color: inkA(0.5), seed: Math.floor(rng() * 1000), dry: 0, taperIn: 0.05, taperOut: 0.85, startWidth: 1, jitter: 0.2 }
    );
  }
}

function drawPebble(g, x, y, r, rng) {
  g.strokeStyle = inkA(0.35);
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(x, y, r, r * (0.55 + rng() * 0.25), rng() * 3, 0, Math.PI * 2);
  g.stroke();
}

function drawChunk(cx, cy, seed, scale) {
  const c = makeCanvas(CHUNK * scale, CHUNK * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  // 横街
  const k0 = Math.floor((y0 - STREET_W) / STREET_GAP_Y) - 1;
  const k1 = Math.ceil((y0 + CHUNK + STREET_W) / STREET_GAP_Y) + 1;
  const streetRanges = [];
  for (let k = k0; k <= k1; k++) {
    const yc = streetCenterY(k, seed);
    if (yc + STREET_W / 2 + 10 < y0 || yc - STREET_W / 2 - 10 > y0 + CHUNK) continue;
    drawStreetH(g, k, seed, x0, y0);
    streetRanges.push([yc - STREET_W / 2 - 8, yc + STREET_W / 2 + 8]);
  }
  // 竖巷
  const a0 = Math.floor((x0 - 400) / ALLEY_GAP_X) - 1;
  const a1 = Math.ceil((x0 + CHUNK + 400) / ALLEY_GAP_X) + 1;
  const alleyRanges = [];
  for (let k = a0; k <= a1; k++) {
    const xc = alleyCenterX(k, seed);
    if (xc + ALLEY_W / 2 + 10 < x0 || xc - ALLEY_W / 2 - 10 > x0 + CHUNK) continue;
    drawAlleyV(g, k, seed, x0, y0);
    alleyRanges.push([xc - ALLEY_W / 2 - 6, xc + ALLEY_W / 2 + 6]);
  }
  const onRoad = (wx, wy) =>
    streetRanges.some(([a, b]) => wy > a && wy < b) || alleyRanges.some(([a, b]) => wx > a && wx < b);
  // 草丛 / 碎石 / 零散踏石（按 56px 网格哈希，跨区块一致）
  const G = 56;
  const gx0 = Math.floor((x0 - 20) / G);
  const gx1 = Math.floor((x0 + CHUNK + 20) / G);
  const gy0 = Math.floor((y0 - 20) / G);
  const gy1 = Math.floor((y0 + CHUNK + 30) / G);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const rng = makeRng(hash2(gx, gy, seed + 333));
      const wx = gx * G + rng() * G;
      const wy = gy * G + rng() * G;
      const roll = rng();
      const road = onRoad(wx, wy);
      const lx = wx - x0;
      const ly = wy - y0;
      if (road) {
        if (roll < 0.1) drawTuft(g, lx, ly, 5, rng); // 石缝里的小草
        continue;
      }
      if (roll < 0.26) {
        drawTuft(g, lx, ly, 7 + rng() * 4, rng);
        if (rng() < 0.4) drawTuft(g, lx + 6 + rng() * 4, ly + 2, 5, rng);
      } else if (roll < 0.36) {
        drawPebble(g, lx, ly, 1.6 + rng() * 2.2, rng);
        if (rng() < 0.5) drawPebble(g, lx + 4, ly + 2, 1.2 + rng(), rng);
      } else if (roll < 0.39) {
        // 零散踏石
        for (let i = 0; i < 3; i++) {
          drawSlab(g, lx + i * (16 + rng() * 6), ly + (rng() - 0.5) * 10, 12 + rng() * 6, 9 + rng() * 4, rng);
        }
      } else if (roll < 0.41) {
        // 墨晕洼地
        g.fillStyle = 'rgba(224,210,180,0.7)';
        g.beginPath();
        g.ellipse(lx, ly, 18 + rng() * 14, 7 + rng() * 5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

/** 地面区块缓存（LRU） */
export function createGround(seed = 1) {
  const chunks = new Map();
  let scale = 2;
  const MAX = 28;
  return {
    setScale(s) {
      if (s !== scale) {
        scale = s;
        chunks.clear();
      }
    },
    setSeed(s) {
      if (s !== seed) {
        seed = s;
        chunks.clear();
      }
    },
    /** 在世界坐标系下绘制可见区域 [vx, vy, vw, vh] */
    draw(ctx, vx, vy, vw, vh) {
      const cx0 = Math.floor(vx / CHUNK);
      const cy0 = Math.floor(vy / CHUNK);
      const cx1 = Math.floor((vx + vw) / CHUNK);
      const cy1 = Math.floor((vy + vh) / CHUNK);
      let built = 0;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cx + ',' + cy;
          let c = chunks.get(key);
          if (!c) {
            c = drawChunk(cx, cy, seed, scale);
            built++;
            chunks.set(key, c);
            if (chunks.size > MAX) chunks.delete(chunks.keys().next().value);
          } else {
            chunks.delete(key);
            chunks.set(key, c);
          }
          ctx.drawImage(c, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
        }
      }
    },
  };
}
