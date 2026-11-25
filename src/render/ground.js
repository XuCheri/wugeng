// ground.js —— 青石镇地面：石板街、窄巷、屋檐瓦影、街心石刻、竹叶纸钱，按区块程序生成并缓存
import { INK, VERM, LANTERN, PAPER_SHADE, inkA, vermA, lanternA, paperA, paperShadeA } from './palette.js';
import { makeCanvas, makeRng, hash2, brushStroke } from './ink.js';
import {
  RIVER_GAP_Y,
  RIVER_HALF_W,
  BRIDGE_GAP_X,
  BRIDGE_HALF_W,
  SPAWN_DRY_RADIUS,
  riverChannelYAt,
  bridgeCenterX,
  isInRiverChannel,
} from '../sim/maps.js';

export const CHUNK = 320;
const STREET_GAP_Y = 460; // 横街间距（更密集的民俗街巷路网）
const STREET_W = 124;
const ALLEY_GAP_X = 420; // 竖巷间距
const ALLEY_W = 84;

function streetCenterY(k, seed) {
  if (k === 0) return 0;
  return k * STREET_GAP_Y + ((hash2(k, 11, seed) % 110) - 55);
}
function alleyCenterX(k, seed) {
  return k * ALLEY_GAP_X + 210 + ((hash2(k, 23, seed) % 100) - 50);
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

function drawEaveEdgeH(g, k, side, yEdge, seed, cx0, cy0) {
  // 街旁民居挑檐瓦当阴影（低调版画淡墨，不喧宾夺主）
  const chunkIdx = Math.floor(cx0 / CHUNK);
  const rng = makeRng(hash2(chunkIdx, k * 7 + (side > 0 ? 1 : 0), seed + 509));
  if (rng() < 0.38) return;
  const spanW = 110 + rng() * 130;
  const startX = 12 + rng() * (CHUNK - spanW - 24);
  const ly = yEdge - cy0;
  const depth = (12 + rng() * 6) * side;
  g.fillStyle = paperShadeA(0.68);
  g.beginPath();
  g.moveTo(startX, ly);
  g.lineTo(startX + spanW, ly);
  g.lineTo(startX + spanW - 4, ly + depth);
  g.lineTo(startX + 4, ly + depth);
  g.closePath();
  g.fill();
  // 瓦垄与滴水瓦当弧
  g.strokeStyle = inkA(0.28);
  g.lineWidth = 1.05;
  g.beginPath();
  const tileW = 11;
  for (let x = startX + 4; x < startX + spanW - 8; x += tileW) {
    g.moveTo(x, ly);
    g.lineTo(x, ly + depth * 0.88);
    g.moveTo(x, ly + depth * 0.88);
    g.quadraticCurveTo(x + tileW * 0.5, ly + depth * 1.18, x + tileW, ly + depth * 0.88);
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
      if (rng() < 0.14) continue;
      const sx = off + i * L + 2 + rng() * 2;
      const sw = L - 4 - rng() * 5;
      const sy = top + r * rh + 2 + rng() * 1.5;
      const sh = rh - 4 - rng() * 2;
      drawSlab(g, sx - cx0, sy - cy0, sw, sh, rng);
    }
  }
  // 街沿青石路缘条 + 排水暗沟线
  g.strokeStyle = inkA(0.4);
  g.lineWidth = 1.4;
  for (const [yy, side] of [[top - 4, -1], [top + STREET_W + 4, 1]]) {
    const rng = makeRng(hash2(Math.floor(cx0 / CHUNK), Math.round(yy), seed + 77));
    let x = -10;
    g.beginPath();
    while (x < CHUNK + 10) {
      const len = 22 + rng() * 44;
      if (rng() > 0.2) {
        g.moveTo(x, yy - cy0 + (rng() - 0.5) * 1.8);
        g.lineTo(x + len, yy - cy0 + (rng() - 0.5) * 1.8);
      }
      x += len + 5 + rng() * 10;
    }
    g.stroke();
    drawEaveEdgeH(g, k, side, yy + side * 3, seed, cx0, cy0);
  }
}

function drawIntersectionMedallion(g, ix, iy) {
  // 十字街心石刻莲花地雕
  g.save();
  g.translate(ix, iy);
  g.fillStyle = paperShadeA(0.5);
  g.beginPath();
  g.arc(0, 0, 22, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = inkA(0.32);
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, 22, 0, Math.PI * 2);
  g.arc(0, 0, 13, 0, Math.PI * 2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
    g.lineTo(Math.cos(a) * 21, Math.sin(a) * 21);
  }
  g.stroke();
  g.restore();
}

function drawAlleyV(g, k, seed, cx0, cy0, streetCenters) {
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
      if (inStreet(left + c * cw + cw / 2, sy + L / 2, seed)) continue;
      const rng = makeRng(hash2(i, k * 4 + c, seed + 203));
      if (rng() < 0.2) continue;
      drawSlab(g, left + c * cw + 2 + rng() * 1.5 - cx0, sy + 2 - cy0, cw - 4 - rng() * 2, L - 4 - rng() * 5, rng);
    }
  }
  // 巷口交汇处石刻圆盘
  for (const yc of streetCenters) {
    const ix = xc - cx0;
    const iy = yc - cy0;
    if (ix >= -28 && ix <= CHUNK + 28 && iy >= -28 && iy <= CHUNK + 28) {
      drawIntersectionMedallion(g, ix, iy);
    }
  }
}

function drawSlab(g, x, y, w, h, rng) {
  if (rng() < 0.45) {
    g.fillStyle = paperShadeA(0.55);
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

function drawFallenPaperMoney(g, x, y, rng) {
  // 街角散落的陈旧冥纸铜钱（淡宣纸阴影 + 极淡朱印边，烘托民俗守夜氛围）
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const px = x + (rng() - 0.5) * 10;
    const py = y + (rng() - 0.5) * 7;
    g.fillStyle = PAPER_SHADE;
    g.beginPath();
    g.ellipse(px, py, 3.8, 2.6, rng() * 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = rng() < 0.45 ? vermA(0.3) : inkA(0.28);
    g.lineWidth = 0.8;
    g.stroke();
  }
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
  const streetCenters = [];
  for (let k = k0; k <= k1; k++) {
    const yc = streetCenterY(k, seed);
    streetCenters.push(yc);
    if (yc + STREET_W / 2 + 24 < y0 || yc - STREET_W / 2 - 24 > y0 + CHUNK) continue;
    drawStreetH(g, k, seed, x0, y0);
    streetRanges.push([yc - STREET_W / 2 - 12, yc + STREET_W / 2 + 12]);
  }
  // 竖巷
  const a0 = Math.floor((x0 - 300) / ALLEY_GAP_X) - 1;
  const a1 = Math.ceil((x0 + CHUNK + 300) / ALLEY_GAP_X) + 1;
  const alleyRanges = [];
  for (let k = a0; k <= a1; k++) {
    const xc = alleyCenterX(k, seed);
    if (xc + ALLEY_W / 2 + 28 < x0 || xc - ALLEY_W / 2 - 28 > x0 + CHUNK) continue;
    drawAlleyV(g, k, seed, x0, y0, streetCenters);
    alleyRanges.push([xc - ALLEY_W / 2 - 8, xc + ALLEY_W / 2 + 8]);
  }
  const onRoad = (wx, wy) =>
    streetRanges.some(([a, b]) => wy > a && wy < b) || alleyRanges.some(([a, b]) => wx > a && wx < b);
  // 草丛 / 碎石 / 踏石 / 散落纸钱（按 56px 网格哈希，跨区块无缝一致）
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
        if (roll < 0.08) drawTuft(g, lx, ly, 4.5, rng);
        else if (roll > 0.96) drawFallenPaperMoney(g, lx, ly, rng);
        continue;
      }
      if (roll < 0.25) {
        drawTuft(g, lx, ly, 7 + rng() * 4, rng);
        if (rng() < 0.4) drawTuft(g, lx + 6 + rng() * 4, ly + 2, 5, rng);
      } else if (roll < 0.35) {
        drawPebble(g, lx, ly, 1.6 + rng() * 2.2, rng);
        if (rng() < 0.5) drawPebble(g, lx + 4, ly + 2, 1.2 + rng(), rng);
      } else if (roll < 0.39) {
        for (let i = 0; i < 3; i++) {
          drawSlab(g, lx + i * (16 + rng() * 6), ly + (rng() - 0.5) * 10, 12 + rng() * 6, 9 + rng() * 4, rng);
        }
      } else if (roll < 0.42) {
        g.fillStyle = paperShadeA(0.7);
        g.beginPath();
        g.ellipse(lx, ly, 18 + rng() * 14, 7 + rng() * 5, 0, 0, Math.PI * 2);
        g.fill();
      } else if (roll < 0.45) {
        drawFallenPaperMoney(g, lx, ly, rng);
      }
    }
  }
  return c;
}

function drawChunkHedeng(cx, cy, seed, scale) {
  // 河灯水口专属冷调靛蓝版画河岸（颜色仅局部于 hedeng 渲染，绝不改动 palette.RGB 与青石镇暖调）
  const SHORE_WASH = 'rgba(28, 44, 64, 0.84)';
  const SHORE_SLAB = 'rgba(38, 56, 78, 0.58)';
  const WATER_DEEP = '#132336';
  const WATER_MID = '#1B3450';
  const WATER_WAVE = 'rgba(132, 176, 214, 0.28)';
  const PLANK_FILL = '#6B4C32';
  const PLANK_LIGHT = 'rgba(224, 210, 180, 0.28)';

  const c = makeCanvas(CHUNK * scale, CHUNK * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;

  // 1. 靛蓝夜岸底色罩染
  g.fillStyle = SHORE_WASH;
  g.fillRect(0, 0, CHUNK, CHUNK);

  // 2. 河岸青灰石板与芦草碎石（避开河槽）
  const G = 56;
  const gx0 = Math.floor((x0 - 20) / G);
  const gx1 = Math.floor((x0 + CHUNK + 20) / G);
  const gy0 = Math.floor((y0 - 20) / G);
  const gy1 = Math.floor((y0 + CHUNK + 30) / G);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const rng = makeRng(hash2(gx, gy, seed + 613));
      const wx = gx * G + rng() * G;
      const wy = gy * G + rng() * G;
      if (isInRiverChannel(wx, wy, seed)) continue;
      const lx = wx - x0;
      const ly = wy - y0;
      const roll = rng();
      if (roll < 0.34) {
        g.fillStyle = SHORE_SLAB;
        const sw = 18 + rng() * 14;
        const sh = 11 + rng() * 8;
        g.fillRect(lx, ly, sw, sh);
        g.strokeStyle = inkA(0.42);
        g.lineWidth = 1.05;
        slabOutline(g, lx, ly, sw, sh, rng);
      } else if (roll < 0.56) {
        drawTuft(g, lx, ly, 8 + rng() * 5, rng);
      } else if (roll < 0.66) {
        drawPebble(g, lx, ly, 1.8 + rng() * 2.2, rng);
      }
    }
  }

  // 3. 蜿蜒夜河水道（深靛河床 + 中流暗涌 + 木刻水纹与暖黄灯影）
  const k0 = Math.floor((y0 - 175 - RIVER_HALF_W - 36) / RIVER_GAP_Y) - 1;
  const k1 = Math.ceil((y0 + CHUNK - 175 + RIVER_HALF_W + 36) / RIVER_GAP_Y) + 1;
  const stepX = 16;

  for (let k = k0; k <= k1; k++) {
    const sampleMid = riverChannelYAt(x0 + CHUNK * 0.5, k, seed);
    if (sampleMid + RIVER_HALF_W + 42 < y0 || sampleMid - RIVER_HALF_W - 42 > y0 + CHUNK) continue;

    const topPts = [];
    const botPts = [];
    const midTopPts = [];
    const midBotPts = [];
    for (let lx = -16; lx <= CHUNK + 16; lx += stepX) {
      const wx = x0 + lx;
      const cyR = riverChannelYAt(wx, k, seed);
      topPts.push([lx, cyR - RIVER_HALF_W - y0]);
      botPts.push([lx, cyR + RIVER_HALF_W - y0]);
      midTopPts.push([lx, cyR - RIVER_HALF_W * 0.52 - y0]);
      midBotPts.push([lx, cyR + RIVER_HALF_W * 0.52 - y0]);
    }

    g.fillStyle = WATER_DEEP;
    g.beginPath();
    g.moveTo(topPts[0][0], topPts[0][1]);
    for (let i = 1; i < topPts.length; i++) g.lineTo(topPts[i][0], topPts[i][1]);
    for (let i = botPts.length - 1; i >= 0; i--) g.lineTo(botPts[i][0], botPts[i][1]);
    g.closePath();
    g.fill();

    g.fillStyle = WATER_MID;
    g.beginPath();
    g.moveTo(midTopPts[0][0], midTopPts[0][1]);
    for (let i = 1; i < midTopPts.length; i++) g.lineTo(midTopPts[i][0], midTopPts[i][1]);
    for (let i = midBotPts.length - 1; i >= 0; i--) g.lineTo(midBotPts[i][0], midBotPts[i][1]);
    g.closePath();
    g.fill();

    // 水面波纹与暖灯倒影碎金
    const wRng = makeRng(hash2(cx, cy * 13 + k, seed + 907));
    for (let w = 0; w < 18; w++) {
      const lx = -6 + wRng() * (CHUNK + 12);
      const wx = x0 + lx;
      const cyR = riverChannelYAt(wx, k, seed);
      const wy = cyR + (wRng() - 0.5) * (RIVER_HALF_W * 1.55);
      if (wx * wx + wy * wy < SPAWN_DRY_RADIUS * SPAWN_DRY_RADIUS) continue;
      const ly = wy - y0;
      const len = 14 + wRng() * 26;
      g.strokeStyle = wRng() < 0.22 ? lanternA(0.24) : WATER_WAVE;
      g.lineWidth = 1.15;
      g.beginPath();
      g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + len * 0.5, ly + (wRng() - 0.5) * 3.5, lx + len, ly);
      g.stroke();
    }

    // 两岸墨色驳岸石线
    g.strokeStyle = INK;
    g.lineWidth = 2.1;
    for (const edge of [topPts, botPts]) {
      g.beginPath();
      g.moveTo(edge[0][0], edge[0][1]);
      for (let i = 1; i < edge.length; i++) g.lineTo(edge[i][0], edge[i][1]);
      g.stroke();
    }
    g.strokeStyle = paperA(0.16);
    g.lineWidth = 1;
    for (const edge of [topPts, botPts]) {
      g.beginPath();
      g.moveTo(edge[0][0], edge[0][1] + (edge === topPts ? 2.5 : -2.5));
      for (let i = 1; i < edge.length; i++) g.lineTo(edge[i][0], edge[i][1] + (edge === topPts ? 2.5 : -2.5));
      g.stroke();
    }

    // 4. 横跨夜河的木板桥（不减速的安全走廊，醒目暖木纹理 + 四角引路灯桩）
    const b0 = Math.floor((x0 - BRIDGE_HALF_W - 48) / BRIDGE_GAP_X) - 1;
    const b1 = Math.ceil((x0 + CHUNK + BRIDGE_HALF_W + 48) / BRIDGE_GAP_X) + 1;
    for (let b = b0; b <= b1; b++) {
      const bxWorld = bridgeCenterX(b, k, seed);
      const bx = bxWorld - x0;
      if (bx + BRIDGE_HALF_W + 16 < 0 || bx - BRIDGE_HALF_W - 16 > CHUNK) continue;
      const cyBridge = riverChannelYAt(bxWorld, k, seed) - y0;
      const bTop = cyBridge - RIVER_HALF_W - 10;
      const bBot = cyBridge + RIVER_HALF_W + 10;
      const bH = bBot - bTop;
      const bLeft = bx - BRIDGE_HALF_W;
      const bW = BRIDGE_HALF_W * 2;

      // 桥底浓墨阴影
      g.fillStyle = inkA(0.55);
      g.fillRect(bLeft - 3, bTop + 2, bW + 6, bH);

      // 桥面木板底色
      g.fillStyle = PLANK_FILL;
      g.fillRect(bLeft, bTop, bW, bH);

      // 横向木板拼缝与浅木高光
      const plankStep = 9;
      g.strokeStyle = INK;
      g.lineWidth = 1.25;
      for (let py = bTop + plankStep; py < bBot - 2; py += plankStep) {
        g.beginPath();
        g.moveTo(bLeft + 1, py);
        g.lineTo(bLeft + bW - 1, py);
        g.stroke();
      }
      g.fillStyle = PLANK_LIGHT;
      g.fillRect(bLeft + 4, bTop + 2, 5, bH - 4);
      g.fillRect(bLeft + bW - 9, bTop + 2, 5, bH - 4);

      // 两侧木栏纵梁与四角暖灯柱头
      g.strokeStyle = INK;
      g.lineWidth = 2.4;
      g.strokeRect(bLeft, bTop, bW, bH);
      for (const px of [bLeft + 2, bLeft + bW - 2]) {
        for (const py of [bTop + 3, bBot - 3]) {
          g.fillStyle = VERM;
          g.beginPath();
          g.arc(px, py, 3.6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = LANTERN;
          g.beginPath();
          g.arc(px, py, 1.8, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  // 5. 出生点干爽石砌码头圆台（若本区块覆盖原点附近）
  if (x0 <= SPAWN_DRY_RADIUS + 20 && x0 + CHUNK >= -SPAWN_DRY_RADIUS - 20 &&
      y0 <= SPAWN_DRY_RADIUS + 20 && y0 + CHUNK >= -SPAWN_DRY_RADIUS - 20) {
    const ox = -x0;
    const oy = -y0;
    g.fillStyle = 'rgba(42, 58, 78, 0.92)';
    g.beginPath();
    g.arc(ox, oy, SPAWN_DRY_RADIUS, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(ox, oy, SPAWN_DRY_RADIUS, 0, Math.PI * 2);
    g.stroke();
    drawIntersectionMedallion(g, ox, oy);
  }

  return c;
}

/** 地面区块缓存（LRU） */
export function createGround(seed = 1) {
  const chunks = new Map();
  let scale = 2;
  let mapId = 'qingshi';
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
    setMap(nextMapId) {
      const clean = nextMapId === 'hedeng' ? 'hedeng' : 'qingshi';
      if (clean !== mapId) {
        mapId = clean;
        chunks.clear();
      }
    },
    /** 在世界坐标系下绘制可见区域 [vx, vy, vw, vh] */
    draw(ctx, vx, vy, vw, vh) {
      const cx0 = Math.floor(vx / CHUNK);
      const cy0 = Math.floor(vy / CHUNK);
      const cx1 = Math.floor((vx + vw) / CHUNK);
      const cy1 = Math.floor((vy + vh) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = mapId + ':' + cx + ',' + cy;
          let c = chunks.get(key);
          if (!c) {
            c = mapId === 'hedeng' ? drawChunkHedeng(cx, cy, seed, scale) : drawChunk(cx, cy, seed, scale);
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
