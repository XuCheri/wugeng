// sheet.js —— 民俗木版画全图鉴总览（style-lab ?scene=sheet）：12凡器、12开光神兵、12法器、12邪祟夜主、3英雄、3奇遇神龛
import { INK, VERM, VERM_DARK, PAPER, PAPER_SHADE, LANTERN, FONT_CN, inkA, paperA, vermA, lanternA } from './palette.js';
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
  projSprite,
  ringSprite,
  brushArcSprite,
  baguaArraySprite,
  burstSprite,
  drawIcon,
  drawHeroWithSkin,
} from './sprites.js';
import {
  getVfxPalette,
  vfxRingSprite,
  vfxSlashSprite,
  vfxArraySprite,
  vfxBurstSprite,
  drawThemedProjectileAccent,
} from './vfx-themes.js';
import { HERO_IDS } from '../meta/save.js';
import { getHeroSkins, ATTACK_VFX_LIST } from '../meta/cosmetics.js';
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

const HERO_SHORT_NAMES = {
  zhou: '周更夫',
  mian: '巧手阿绵',
  daotong: '玄真道童',
  yinyang: '沈观星',
  tiejiang: '石敢当',
  nuoxi: '柳青衣',
};

/**
 * ?scene=skins —— 6 角色 × 3 套 = 18 套明显差异重彩木刻皮肤全景陈列室
 * 同步写入物理像素坐标表 window.__skinCells 供自动化像素/剪影检验。
 */
export function drawSkinsShowcase(canvas, { low = false } = {}) {
  const W = Math.max(320, window.innerWidth || 390);
  const H = Math.max(640, window.innerHeight || 844);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  setSpriteScale(dpr);
  setMisregistration(!low);

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);

  const spanW = Math.min(W - 8, 420);
  const ox = Math.floor((W - spanW) / 2);

  // 顶部朱金卷首匾额
  const topH = 42;
  g.fillStyle = INK;
  g.fillRect(0, 0, W, topH);
  g.strokeStyle = LANTERN;
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(ox + 4, topH - 2);
  g.lineTo(ox + spanW - 4, topH - 2);
  g.stroke();

  drawStamp(g, '衣冠', ox + 22, 19, 10.5, { rot: -0.04 });
  g.font = `15px ${FONT_CN}`;
  g.fillStyle = PAPER;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('守夜百相衣冠录 · 六脉十八装', ox + spanW * 0.5 + 14, 15);
  g.font = `9.5px ${FONT_CN}`;
  g.fillStyle = LANTERN;
  g.fillText('原装木刻 · 鬼市重彩 · 功绩典藏（冠冕/披风/背饰/提灯/灵阵）', ox + spanW * 0.5 + 16, 31);

  const rows = HERO_IDS.length; // 6
  const cols = 3;
  const usableH = H - topH - 6;
  const rowH = Math.floor(usableH / rows);
  const colW = Math.floor(spanW / cols);

  const skinCells = [];

  for (let r = 0; r < rows; r++) {
    const heroId = HERO_IDS[r];
    const skins = getHeroSkins(heroId);
    for (let c = 0; c < cols; c++) {
      const skin = skins[c];
      const cellX = ox + c * colW;
      const cellY = topH + 2 + r * rowH;
      const cardX = cellX + 2.5;
      const cardY = cellY + 2;
      const cardW = colW - 5;
      const cardH = rowH - 4;

      // 卡片底框
      g.fillStyle = PAPER_SHADE;
      g.fillRect(cardX, cardY, cardW, cardH);
      g.strokeStyle = c === 0 ? PAPER_SHADE : c === 1 ? LANTERN : VERM;
      g.lineWidth = c === 0 ? 1.1 : 1.6;
      g.strokeRect(cardX, cardY, cardW, cardH);

      // 卡片顶栏（角色名 + 获取途径）
      const headH = 15;
      g.fillStyle = c === 0 ? INK : c === 1 ? '#1E3A34' : VERM_DARK;
      g.fillRect(cardX + 1, cardY + 1, cardW - 2, headH);
      g.font = `9.5px ${FONT_CN}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = PAPER;
      g.fillText(HERO_SHORT_NAMES[heroId] || heroId, cardX + 5, cardY + 1 + headH * 0.52);

      g.textAlign = 'right';
      const tagTxt = skin.unlock === 'default' ? '原装' : skin.unlock === 'achievement' ? '功绩' : `${skin.price}钱`;
      g.fillStyle = skin.unlock === 'default' ? PAPER_SHADE : LANTERN;
      g.fillText(tagTxt, cardX + cardW - 5, cardY + 1 + headH * 0.52);

      // 纯净宣纸舞台区（内部零杂线、零噪点，确保外轮廓剪影检测 100% 精确）
      const footBarH = 18;
      const stageX = cardX + 2;
      const stageY = cardY + headH + 2;
      const stageW = cardW - 4;
      const stageH = cardH - headH - footBarH - 4;

      g.fillStyle = PAPER;
      g.fillRect(stageX, stageY, stageW, stageH);

      const sprScale = Math.min(1.18, Math.max(0.95, stageH / 76));
      const heroAnchorX = stageX + stageW * 0.47;
      const heroAnchorY = stageY + stageH * 0.76;

      drawHeroWithSkin(g, {
        heroId,
        skinId: skin.id,
        x: heroAnchorX,
        y: heroAnchorY,
        frame: 0,
        flip: 1,
        lean: 0,
        swing: 0.06,
        scale: sprScale,
        flash: false,
        alpha: 1,
        auraRot: 0.4,
        showAura: true,
      });

      // 底部皮肤名牌匾
      const footY = stageY + stageH + 1;
      g.fillStyle = INK;
      g.fillRect(cardX + 1, footY, cardW - 2, footBarH);
      g.font = `10.5px ${FONT_CN}`;
      g.fillStyle = c === 0 ? PAPER : LANTERN;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(skin.name, cardX + cardW * 0.5, footY + footBarH * 0.52);

      const insetX = stageX + 3;
      const insetY = stageY + 2;
      const insetW = Math.max(16, stageW - 6);
      const insetH = Math.max(16, stageH - 4);
      skinCells.push({
        heroId,
        skinId: skin.id,
        name: skin.name,
        tier: skin.tier,
        x: Math.round(cardX * dpr),
        y: Math.round(cardY * dpr),
        width: Math.round(cardW * dpr),
        height: Math.round(cardH * dpr),
        spriteRect: {
          x: Math.round(insetX * dpr),
          y: Math.round(insetY * dpr),
          width: Math.round(insetW * dpr),
          height: Math.round(insetH * dpr),
        },
      });
    }
  }

  if (typeof window !== 'undefined') {
    window.__skinCells = skinCells;
  }
  return skinCells;
}

/**
 * ?scene=vfx —— 5 套明显差异重彩攻击特效实战演武对比图
 * 同步写入 window.__vfxPanels 与 window.__vfxCells。
 */
export function drawVfxShowcase(canvas, { low = false } = {}) {
  const W = Math.max(320, window.innerWidth || 390);
  const H = Math.max(640, window.innerHeight || 844);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  setSpriteScale(dpr);
  setMisregistration(!low);

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);

  const spanW = Math.min(W - 12, 500);
  const ox = Math.floor((W - spanW) / 2);
  const topH = 44;

  drawStamp(g, '锋芒', ox + 26, 22, 12, { rot: -0.04 });
  g.font = `15px ${FONT_CN}`;
  g.fillStyle = PAPER;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('五更天 · 五系重彩攻击特效演武录', ox + spanW * 0.5 + 10, 16);
  g.font = `10px ${FONT_CN}`;
  g.fillStyle = LANTERN;
  g.fillText('我方刀光·震波·法阵·飞剑五系异构 ｜ 敌方弹幕预警恒守朱砂红', ox + spanW * 0.5 + 6, 32);

  const demoPairings = [
    { heroId: 'zhou', skinId: 'zhou_default', enemyA: 'paperkid', enemyB: 'lanternghost' },
    { heroId: 'tiejiang', skinId: 'tiejiang_jade_taotie', enemyA: 'lanternghost', enemyB: 'suona' },
    { heroId: 'daotong', skinId: 'daotong_violet_thunder', enemyA: 'paperbride', enemyB: 'weasel' },
    { heroId: 'nuoxi', skinId: 'nuoxi_gold_nuo_god', enemyA: 'sedan', enemyB: 'drowned' },
    { heroId: 'yinyang', skinId: 'yinyang_frost_astrolabe', enemyA: 'cinder', enemyB: 'shade' },
  ];

  const usableH = H - topH - 8;
  const rowH = Math.floor(usableH / 5);
  const panels = [];

  for (let i = 0; i < ATTACK_VFX_LIST.length; i++) {
    const theme = ATTACK_VFX_LIST[i];
    const vfxId = theme.id;
    const pal = getVfxPalette(vfxId);
    const pair = demoPairings[i];

    const lx = ox + 2;
    const ly = topH + 2 + i * rowH;
    const lw = spanW - 4;
    const lh = rowH - 5;

    // 演武巷道石板底衬（宣纸暖灰街面，让五系几何与矿物重彩清晰跳脱）
    g.fillStyle = PAPER;
    g.fillRect(lx, ly, lw, lh);
    g.fillStyle = paperA(0.55);
    g.fillRect(lx, ly + lh * 0.68, lw, lh * 0.32);
    g.strokeStyle = vfxId === 'default' ? VERM : pal.primary;
    g.lineWidth = 2;
    g.strokeRect(lx, ly, lw, lh);

    // 左侧竖匾标题栏
    const tagW = 68;
    g.fillStyle = INK;
    g.fillRect(lx + 1, ly + 1, tagW, lh - 2);
    g.fillStyle = vfxId === 'default' ? VERM : pal.bright;
    g.font = `13px ${FONT_CN}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(theme.name, lx + tagW * 0.5, ly + lh * 0.34);
    g.fillStyle = PAPER_SHADE;
    g.font = `9.5px ${FONT_CN}`;
    g.fillText(theme.subtitle, lx + tagW * 0.5, ly + lh * 0.58);
    g.fillStyle = LANTERN;
    g.font = `9px ${FONT_CN}`;
    g.fillText(theme.price > 0 ? `鬼市 ${theme.price}钱` : '默认免费', lx + tagW * 0.5, ly + lh * 0.80);

    // 战场演武区
    const stageLeft = lx + tagW + 8;
    const stageW = lw - tagW - 12;
    const cy = ly + lh * 0.56;
    const heroX = stageLeft + stageW * 0.16;
    const midX = stageLeft + stageW * 0.50;
    const enemyX = stageLeft + stageW * 0.82;

    // 1) 地面符阵
    if (vfxId === 'default') {
      blit(g, baguaArraySprite('talisman'), midX + 18, cy + 4, 0.36, 0.34, 0.3, 0.9);
    } else {
      blit(g, vfxArraySprite(vfxId, 'talismanArray'), midX + 18, cy + 4, 0.36, 0.34, 0.3, 0.92);
    }

    // 2) 震波环（围绕守夜人与演武中场）
    if (vfxId === 'default') {
      blit(g, ringSprite('verm', i % 3), heroX + 26, cy - 2, 0.44, 0.40, 0.2, 0.92);
    } else {
      blit(g, vfxRingSprite(vfxId, i % 3), heroX + 26, cy - 2, 0.42, 0.39, 0.2, 0.95);
    }

    // 3) 守夜人出招姿态
    blit(g, shadowSprite(10), heroX, cy + 16, 1, 1, 0, 0.8);
    drawHeroWithSkin(g, {
      heroId: pair.heroId,
      skinId: pair.skinId,
      x: heroX,
      y: cy + 16,
      frame: 1,
      flip: 1,
      lean: 0.06,
      swing: -0.2,
      scale: 0.95,
      showAura: true,
    });

    // 4) 扇形重彩刀光
    if (vfxId === 'default') {
      blit(g, brushArcSprite(48, 1.5, true), heroX + 24, cy - 4, 0.92, 0.92, -0.05, 0.95);
    } else {
      blit(g, vfxSlashSprite(vfxId, 48, 1.5, true), heroX + 24, cy - 4, 0.92, 0.92, -0.05, 0.96);
    }

    // 5) 飞剑与符箓拖尾 + 命中重彩爆点
    const swordP = { id: 10 + i, x: midX + 8, y: cy - 16, angle: 0.06 };
    const talP = { id: 20 + i, x: midX - 6, y: cy + 12, angle: -0.08 };
    if (vfxId !== 'default') {
      drawThemedProjectileAccent(g, vfxId, swordP, true, 1.2 + i, false);
      drawThemedProjectileAccent(g, vfxId, talP, true, 2.4 + i, false);
    } else {
      g.strokeStyle = vermA(0.65);
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(swordP.x - 24, swordP.y - 2);
      g.lineTo(swordP.x, swordP.y);
      g.stroke();
    }
    blit(g, projSprite('taomujianEvo'), swordP.x, swordP.y, 1.0, 1.0, swordP.angle);
    blit(g, projSprite('talismanEvo'), talP.x, talP.y, 0.95, 0.95, Math.PI / 2);

    // 右侧靶标百鬼 + 命中爆裂火花
    blit(g, shadowSprite(10), enemyX, cy + 16, 0.9, 0.9);
    blit(g, enemySprite(pair.enemyA, 0, false), enemyX, cy + 16, pair.enemyA === 'sedan' ? 0.72 : 0.92, pair.enemyA === 'sedan' ? 0.72 : 0.92);
    if (vfxId === 'default') {
      blit(g, burstSprite(i), enemyX - 18, cy - 6, 0.46, 0.44, 0.4, 0.92);
    } else {
      blit(g, vfxBurstSprite(vfxId, i), enemyX - 18, cy - 6, 0.46, 0.44, 0.4, 0.94);
    }

    // 右上角敌方纸钱弹（恒定朱砂红 #C23B26 安全不变量对照）
    blit(g, projSprite('paperMoney'), enemyX + 18, cy - 26, 0.95, 0.95, 0.3);

    panels.push({
      vfxId,
      name: theme.name,
      x: Math.round((lx + tagW + 4) * dpr),
      y: Math.round((ly + 3) * dpr),
      width: Math.round((lw - tagW - 8) * dpr),
      height: Math.round((lh - 6) * dpr),
    });
  }

  if (typeof window !== 'undefined') {
    window.__vfxPanels = panels;
    window.__vfxCells = panels;
  }
  return panels;
}
