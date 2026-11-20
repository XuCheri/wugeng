// sheet.js —— 精灵总览（style-lab ?scene=sheet）：所有角色 / 敌人 / Boss / 物件 / 拾取物 / 弹体 / 图标
import { INK, VERM, FONT_CN } from './palette.js';
import { getPaperTile, setMisregistration } from './ink.js';
import { setSpriteScale, blit, heroSprite, handLanternSprite, heroHand, enemySprite, propSprite, pickupSprite, projSprite, shadowSprite, drawIcon } from './sprites.js';
import { drawSeal, drawStamp } from './glyphs.js';

export function drawSheet(canvas, { low = false } = {}) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  setSpriteScale(dpr);
  setMisregistration(!low);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = g.createPattern(getPaperTile(), 'repeat');
  g.fillRect(0, 0, W, H);
  const label = (t, x, y) => {
    g.font = `10px ${FONT_CN}`;
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.fillText(t, x, y);
  };
  let y = 64;
  // 英雄
  const heroes = [['zhou', '老周'], ['mian', '阿绵'], ['daotong', '小道童']];
  heroes.forEach(([id, n], i) => {
    const x = 50 + i * 60;
    blit(g, shadowSprite(10), x, y, 1.6, 1.6);
    blit(g, heroSprite(id, 0), x, y, 1.6, 1.6);
    const h = heroHand();
    blit(g, handLanternSprite(), x + h.x * 1.6, y + h.y * 1.6, 1.6, 1.6);
    label(n, x, y + 14);
  });
  // 图标
  ['gong', 'lantern', 'talisman', 'brush'].forEach((id, i) => drawIcon(g, 'weapon', id, 232 + (i % 2) * 40, 22 + Math.floor(i / 2) * 40, 34));
  ['coinsword', 'paperman', 'firecracker', 'bell'].forEach((id, i) => drawIcon(g, 'weapon', id, 312 + (i % 2) * 40, 22 + Math.floor(i / 2) * 40, 34));
  y = 150;
  const enemies = [['paperkid', '纸扎童子'], ['shade', '影祟'], ['lanternghost', '灯笼鬼'], ['weasel', '黄皮子'], ['sedan', '纸轿子'], ['drowned', '水鬼']];
  enemies.forEach(([id, n], i) => {
    const x = 34 + i * 64;
    blit(g, shadowSprite(12), x, y, 1.3, 1.3);
    blit(g, enemySprite(id, 0), x, y, 1.3, 1.3);
    label(n, x, y + 14);
  });
  y = 330;
  const bosses = [['horse', '纸马将军'], ['umbrella', '无面伞女'], ['youshen', '夜游神']];
  bosses.forEach(([id, n], i) => {
    const x = 70 + i * 125;
    blit(g, shadowSprite(30), x, y);
    blit(g, enemySprite(id, 0), x, y);
    label(n, x, y + 16);
  });
  y = 456;
  [['lanternpost', 44, 1], ['well', 128, 1], ['arch', 278, 0.78]].forEach(([k, x, sc]) => blit(g, propSprite(k), x, y, sc, sc));
  y = 508;
  const pk = [['xp', 1], ['xp', 2], ['xp', 3], ['coin', 1], ['bun', 1], ['banner', 1], ['chest', 1]];
  pk.forEach(([k, t], i) => blit(g, pickupSprite(k, t), 30 + i * 50, y + 20, 1.5, 1.5));
  y = 580;
  const pj = ['talisman', 'talismanEvo', 'coinsword', 'lantern', 'flame', 'paperman0', 'papermanEvo1', 'firecracker', 'bell', 'paperMoney', 'inkBullet'];
  pj.forEach((k, i) => blit(g, projSprite(k), 24 + (i % 6) * 62, y + Math.floor(i / 6) * 50, 1.5, 1.5));
  y = 700;
  ['clapper', 'censer', 'cinnabar', 'inkstone', 'bagua', 'scissors', 'tinder', 'redstring'].forEach((id, i) => drawIcon(g, 'relic', id, 26 + i * 46, y, 38));
  y = 760;
  drawSeal(g, '0123456789', 20, y, 18, INK, 'left');
  drawStamp(g, '2410', 280, y, 15, { rot: -0.06 });
  drawStamp(g, '3.4亿', 340, y + 40, 14, { rot: 0.05 });
  drawSeal(g, '05:12', 20, y + 40, 16, INK, 'left', 'outlined');
  drawSeal(g, '1.2万', 120, y + 40, 14, INK, 'left', 'outlined');
  ['zhou', 'mian', 'daotong'].forEach((id, i) => drawIcon(g, 'hero', id, 200 + i * 0, y + 40, 1));
}
