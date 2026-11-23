// sheet.js —— 民俗木版画全图鉴总览（style-lab ?scene=sheet）：12凡器、12开光神兵、12法器、12邪祟夜主、3英雄、3奇遇神龛
import { INK, VERM, PAPER, PAPER_SHADE, LANTERN, FONT_CN, inkA, lanternA } from './palette.js';
import { getPaperTile, setMisregistration } from './ink.js';
import {
  setSpriteScale,
  blit,
  heroSprite,
  handLanternSprite,
  heroHand,
  enemySprite,
  shrineSprite,
  shadowSprite,
  drawIcon,
} from './sprites.js';
import { drawStamp } from './glyphs.js';

const WEAPONS_12 = [
  ['gong', '更锣', '五更鸣锣'],
  ['lantern', '引魂灯', '长明灯'],
  ['talisman', '镇妖符', '天师符阵'],
  ['brush', '判官笔', '泼墨山河'],
  ['coinsword', '铜钱剑', '七星剑阵'],
  ['paperman', '纸人术', '纸扎仪仗'],
  ['firecracker', '爆竹', '满堂红'],
  ['bell', '招魂铃', '千铃引魂'],
  ['compass', '罗盘', '天星定穴'],
  ['soulbanner', '招魂幡', '勾魂双幡'],
  ['bronze_mirror', '照妖镜', '赤阳神镜'],
  ['paperhorse', '纸马镖', '百鬼夜行'],
];

const RELICS_12 = [
  ['clapper', '竹梆'],
  ['censer', '香炉'],
  ['cinnabar', '朱砂'],
  ['inkstone', '端砚'],
  ['bagua', '八卦镜'],
  ['scissors', '剪纸刀'],
  ['tinder', '火折子'],
  ['redstring', '红绳'],
  ['strawshoes', '草鞋'],
  ['glutinous', '糯米'],
  ['fivecoins', '五帝钱'],
  ['soulwick', '灯芯'],
];

const REGULAR_ENEMIES_9 = [
  ['paperkid', '纸扎童子'],
  ['shade', '影祟'],
  ['lanternghost', '灯笼鬼'],
  ['weasel', '黄皮子'],
  ['drowned', '水鬼'],
  ['suona', '吹鼓鬼'],
  ['paperbride', '红衣新娘'],
  ['cinder', '阴火骷髅'],
  ['sedan', '纸轿子'],
];

export function drawSheet(canvas, { low = false } = {}) {
  const W = window.innerWidth || 390;
  const H = window.innerHeight || 844;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  setSpriteScale(dpr);
  setMisregistration(!low);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = g.createPattern(getPaperTile(), 'repeat');
  g.fillRect(0, 0, W, H);

  const ox = Math.max(0, Math.floor((W - 390) / 2));
  const label = (t, x, y, color = INK, sz = 9) => {
    g.font = `${sz}px ${FONT_CN}`;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, ox + x, y);
  };
  const sectionLine = (title, y) => {
    g.strokeStyle = inkA(0.28);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ox + 14, y);
    g.lineTo(ox + 376, y);
    g.stroke();
    g.fillStyle = PAPER;
    g.fillRect(ox + 14, y - 8, 92, 16);
    g.strokeStyle = VERM;
    g.lineWidth = 1.2;
    g.strokeRect(ox + 14, y - 8, 92, 16);
    label(title, 60, y + 0.5, VERM, 10);
  };

  // ---------- 顶栏：卷首朱印 + 3 守夜人 + 3 奇遇神龛 ----------
  drawStamp(g, '百物谱', ox + 42, 22, 13, { rot: -0.03 });
  label('五更天 · 民俗木版神兵百鬼全览', 214, 22, INK, 12);

  const heroes = [['zhou', '老周'], ['mian', '阿绵'], ['daotong', '小道童']];
  heroes.forEach(([id, n], i) => {
    const x = ox + 36 + i * 52;
    const y = 86;
    blit(g, shadowSprite(9), x, y, 1.2, 1.2);
    blit(g, heroSprite(id, 0), x, y, 1.2, 1.2);
    const h = heroHand();
    blit(g, handLanternSprite(), x + h.x * 1.2, y + h.y * 1.2, 1.2, 1.2);
    label(n, 36 + i * 52, y + 11);
  });

  const shrines = [['altar', '土地香案'], ['trial', '镇邪试炼碑'], ['peddler', '鬼市货郎']];
  shrines.forEach(([k, n], i) => {
    const x = ox + 212 + i * 66;
    const y = 86;
    blit(g, shadowSprite(16), x, y + 2, 0.8, 0.8);
    blit(g, shrineSprite(k, false, k === 'trial'), x, y, 0.72, 0.72);
    label(n, 212 + i * 66, y + 11, VERM, 8.5);
  });

  // ---------- 一、凡器十二兵 ----------
  sectionLine('凡器十二兵', 114);
  WEAPONS_12.forEach(([id, baseName], i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const cx = ox + 39 + col * 62;
    const cy = 144 + row * 48;
    g.fillStyle = PAPER;
    g.fillRect(cx - 17, cy - 17, 34, 34);
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.strokeRect(cx - 17, cy - 17, 34, 34);
    drawIcon(g, 'weapon', id, cx, cy, 29);
    label(baseName, 39 + col * 62, cy + 23, INK, 8.5);
  });

  // ---------- 二、开光十二神兵（独立法相） ----------
  sectionLine('开光十二神兵', 234);
  WEAPONS_12.forEach(([id, , evoName], i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const cx = ox + 39 + col * 62;
    const cy = 266 + row * 50;
    g.fillStyle = PAPER;
    g.fillRect(cx - 18, cy - 18, 36, 36);
    g.fillStyle = lanternA(0.28);
    g.fillRect(cx - 16, cy - 16, 32, 32);
    g.strokeStyle = VERM;
    g.lineWidth = 1.8;
    g.strokeRect(cx - 18, cy - 18, 36, 36);
    g.strokeStyle = LANTERN;
    g.lineWidth = 0.9;
    g.strokeRect(cx - 15.5, cy - 15.5, 31, 31);
    drawIcon(g, 'evo', id, cx, cy, 31);
    label(evoName, 39 + col * 62, cy + 24, VERM, 8.5);
  });

  // ---------- 三、守夜十二法器 ----------
  sectionLine('守夜十二法器', 360);
  RELICS_12.forEach(([id, rName], i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const cx = ox + 39 + col * 62;
    const cy = 390 + row * 46;
    g.fillStyle = PAPER_SHADE;
    g.fillRect(cx - 16, cy - 16, 32, 32);
    g.strokeStyle = INK;
    g.lineWidth = 1.1;
    g.strokeRect(cx - 16, cy - 16, 32, 32);
    drawIcon(g, 'relic', id, cx, cy, 27);
    label(rName, 39 + col * 62, cy + 22, INK, 8.5);
  });

  // ---------- 四、九类夜祟 ----------
  sectionLine('九类夜祟精怪', 476);
  REGULAR_ENEMIES_9.forEach(([id, eName], i) => {
    const row = i < 5 ? 0 : 1;
    const col = i < 5 ? i : i - 5;
    const stepX = row === 0 ? 72 : 86;
    const startX = row === 0 ? 50 : 66;
    const cx = ox + startX + col * stepX;
    const cy = 536 + row * 66;
    const sc = id === 'sedan' ? 0.88 : 1.12;
    blit(g, shadowSprite(11), cx, cy, sc, sc);
    blit(g, enemySprite(id, 0), cx, cy, sc, sc);
    label(eName, startX + col * stepX, cy + 11, INK, 8.5);
  });

  // ---------- 五、三大夜主（含伞女护盾/旋伞双态） ----------
  sectionLine('三大夜主法相', 640);
  const bosses = [
    ['horse', '', '纸马将军', 58, 0.84],
    ['umbrella', 'shield', '伞女·护盾', 148, 0.82],
    ['umbrella', 'open', '伞女·旋开', 238, 0.82],
    ['youshen', '', '夜游神', 332, 0.78],
  ];
  bosses.forEach(([id, stVariant, bName, lx, sc]) => {
    const cx = ox + lx;
    const cy = 796;
    blit(g, shadowSprite(24), cx, cy, sc, sc);
    blit(g, enemySprite(id, 0, false, stVariant), cx, cy, sc, sc);
    label(bName, lx, cy + 14, VERM, 9);
  });
}
