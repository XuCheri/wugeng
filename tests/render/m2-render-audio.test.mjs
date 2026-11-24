// M2 全面单测：6色民俗木版色板、12神兵独立开光图标、12邪祟与奇遇精灵、22种弹体/预警/光环/HUD 渲染与 WebAudio 合成
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAPER,
  PAPER_SHADE,
  INK,
  VERM,
  VERM_DARK,
  LANTERN,
  RGB,
  FONT_CN,
  inkA,
  paperA,
  vermA,
  lanternA,
  vermDarkA,
  paperShadeA,
} from '../../src/render/palette.js';
import {
  WEAPON_ICONS,
  EVO_WEAPON_ICONS,
  RELIC_ICONS,
  HERO_ICONS,
  drawIcon,
  iconDataURL as baseIconDataURL,
} from '../../src/render/icons.js';
import {
  ENEMY_TYPES,
  SHRINE_TYPES,
  enemyDef,
  enemySprite,
  heroSprite,
  shrineSprite,
  projSprite,
  baguaArraySprite,
  inkWaveSprite,
  emberPoolSprite,
  clearSpriteCache,
  iconDataURL,
} from '../../src/render/sprites.js';
import { createGround, inStreet } from '../../src/render/ground.js';
import { createFx, EVOLVED_NAMES } from '../../src/render/fx.js';
import { createHud } from '../../src/render/hud.js';
import { createRenderer } from '../../src/render/renderer.js';
import { renderPluck, createAudio } from '../../src/audio/synth.js';

const CANONICAL_WEAPONS = [
  'gong',
  'lantern',
  'talisman',
  'brush',
  'coinsword',
  'paperman',
  'firecracker',
  'bell',
  'compass',
  'soulbanner',
  'bronze_mirror',
  'paperhorse',
  'taomujian',
  'suohun_chain',
  'zhinian_kite',
  'nuo_drum',
];

const CANONICAL_RELICS = [
  'clapper',
  'censer',
  'cinnabar',
  'inkstone',
  'bagua',
  'scissors',
  'tinder',
  'redstring',
  'strawshoes',
  'glutinous',
  'fivecoins',
  'soulwick',
  'leijimu',
  'yinpai',
  'huoyao_pouch',
  'wuse_mask',
];

const CANONICAL_ENEMIES = [
  'paperkid',
  'shade',
  'lanternghost',
  'weasel',
  'sedan',
  'drowned',
  'suona',
  'paperbride',
  'cinder',
  'horse',
  'umbrella',
  'youshen',
];

// ───────── 轻量确定性 Mock OffscreenCanvas（记录全部绘图指令、颜色与签名） ─────────
function createMockCanvasClass(colorCollector = null) {
  let nextId = 1;
  return class MockOffscreenCanvas {
    constructor(w = 64, h = 64) {
      this.id = nextId++;
      this.width = w;
      this.height = h;
      this.ops = [];
      this._ctx = null;
    }
    getContext() {
      if (this._ctx) return this._ctx;
      const ops = this.ops;
      const recordColor = (val) => {
        if (colorCollector && typeof val === 'string') colorCollector.push(val);
      };
      let fillStyle = '#000';
      let strokeStyle = '#000';
      const ctx = {
        canvas: this,
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        font: '12px serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        imageSmoothingEnabled: true,
        get fillStyle() {
          return fillStyle;
        },
        set fillStyle(v) {
          fillStyle = v;
          recordColor(v);
          ops.push(`fs:${typeof v === 'string' ? v : 'obj'}`);
        },
        get strokeStyle() {
          return strokeStyle;
        },
        set strokeStyle(v) {
          strokeStyle = v;
          recordColor(v);
          ops.push(`ss:${typeof v === 'string' ? v : 'obj'}`);
        },
        save() { ops.push('save'); },
        restore() { ops.push('restore'); },
        scale(x, y) { ops.push(`sc:${x.toFixed(2)},${y.toFixed(2)}`); },
        translate(x, y) { ops.push(`tr:${x.toFixed(1)},${y.toFixed(1)}`); },
        rotate(a) { ops.push(`rot:${a.toFixed(2)}`); },
        setTransform(a, b, c, d, e, f) { ops.push(`stf:${a.toFixed(1)},${e.toFixed(1)},${f.toFixed(1)}`); },
        beginPath() { ops.push('bp'); },
        closePath() { ops.push('cp'); },
        moveTo(x, y) { ops.push(`M:${x.toFixed(1)},${y.toFixed(1)}`); },
        lineTo(x, y) { ops.push(`L:${x.toFixed(1)},${y.toFixed(1)}`); },
        quadraticCurveTo(cx, cy, x, y) { ops.push(`Q:${cx.toFixed(1)},${cy.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)}`); },
        bezierCurveTo(a, b, c, d, x, y) { ops.push(`C:${a.toFixed(1)},${b.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)}`); },
        arc(x, y, r, s, e) { ops.push(`A:${x.toFixed(1)},${y.toFixed(1)},${r.toFixed(1)},${(e - s).toFixed(2)}`); },
        ellipse(x, y, rx, ry) { ops.push(`E:${x.toFixed(1)},${y.toFixed(1)},${rx.toFixed(1)},${ry.toFixed(1)}`); },
        rect(x, y, w, h) { ops.push(`R:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}`); },
        fill() { ops.push(`fill:${typeof fillStyle === 'string' ? fillStyle : 'g'}`); },
        stroke() { ops.push(`stroke:${typeof strokeStyle === 'string' ? strokeStyle : 'g'}`); },
        fillRect(x, y, w, h) { ops.push(`fr:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}:${typeof fillStyle === 'string' ? fillStyle : 'g'}`); },
        strokeRect(x, y, w, h) { ops.push(`sr:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}:${typeof strokeStyle === 'string' ? strokeStyle : 'g'}`); },
        clearRect(x, y, w, h) { ops.push(`cr:${w},${h}`); },
        clip() { ops.push('clip'); },
        fillText(t, x, y) { ops.push(`ft:${t}@${x.toFixed(1)},${y.toFixed(1)}`); },
        strokeText(t, x, y) { ops.push(`st:${t}@${x.toFixed(1)},${y.toFixed(1)}`); },
        measureText(t) { return { width: String(t).length * 12 }; },
        drawImage(img, x = 0, y = 0, w = 0, h = 0) {
          const sig = img && img.ops ? img.ops.length + ':' + (img.ops[2] || '') + ':' + (img.ops[img.ops.length - 2] || '') : 'img';
          ops.push(`di:${sig}@${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`);
        },
        createPattern() { return { kind: 'pattern' }; },
        createRadialGradient() {
          return {
            stops: [],
            addColorStop(off, col) {
              recordColor(col);
              this.stops.push([off, col]);
            },
          };
        },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(img) { ops.push(`pid:${img.width}x${img.height}`); },
      };
      this._ctx = ctx;
      return ctx;
    }
    toDataURL() {
      // 基于真实绘制指令流生成唯一确定性 base64 PNG 摘要
      const raw = `${this.width}x${this.height}|` + this.ops.join(';');
      let h1 = 2166136261;
      let h2 = 0x9e3779b9;
      for (let i = 0; i < raw.length; i++) {
        const c = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
      }
      const payload = Buffer.from(`${h1.toString(16)}_${h2.toString(16)}_${this.ops.length}`).toString('base64');
      return `data:image/png;base64,${payload}`;
    }
  };
}

function withMockCanvas(fn) {
  const prev = globalThis.OffscreenCanvas;
  const colors = [];
  const MockCanvas = createMockCanvasClass(colors);
  globalThis.OffscreenCanvas = MockCanvas;
  clearSpriteCache();
  try {
    return fn({ MockCanvas, colors });
  } finally {
    clearSpriteCache();
    if (prev === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = prev;
  }
}

function parseColorRGB(str) {
  if (str.startsWith('#') && str.length === 7) {
    return [
      parseInt(str.slice(1, 3), 16),
      parseInt(str.slice(3, 5), 16),
      parseInt(str.slice(5, 7), 16),
    ];
  }
  const m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

test('palette.js：严格遵守 6 色民俗木版暖色不变量与 CJK 字体回退栈', () => {
  assert.equal(PAPER, '#EFE6D2');
  assert.equal(PAPER_SHADE, '#E0D2B4');
  assert.equal(INK, '#1C1A17');
  assert.equal(VERM, '#C23B26');
  assert.equal(VERM_DARK, '#8E2A1B');
  assert.equal(LANTERN, '#F0BE62');

  for (const [name, [r, g, b]] of Object.entries(RGB)) {
    assert.ok(r + 18 >= g && r + 18 >= b, `${name} 违反暖色不变量: ${r},${g},${b}`);
    assert.ok(r >= g && g >= b, `${name} RGB 应满足暖色阶 R >= G >= B`);
  }

  for (const fn of [inkA, paperA, vermA, lanternA, vermDarkA, paperShadeA]) {
    const c = fn(0.5);
    const rgb = parseColorRGB(c);
    assert.ok(rgb && rgb[0] + 18 >= rgb[1] && rgb[0] + 18 >= rgb[2], `RGBA 助手不满足暖色约束: ${c}`);
  }

  assert.ok(FONT_CN.includes('WenKai'));
  assert.ok(FONT_CN.includes('Noto Serif CJK SC'));
  assert.ok(FONT_CN.includes('Droid Sans Fallback'));
  assert.ok(FONT_CN.includes('Songti SC'));
});

test('icons.js & sprites.js：12 武器 + 12 独立开光神兵 + 12 法器 + 12 邪祟图标全量唯一且零偷懒复用', () => {
  withMockCanvas(({ MockCanvas, colors }) => {
    assert.deepEqual(Object.keys(WEAPON_ICONS).sort(), [...CANONICAL_WEAPONS].sort());
    assert.deepEqual(Object.keys(EVO_WEAPON_ICONS).sort(), [...CANONICAL_WEAPONS].sort());
    assert.deepEqual(Object.keys(RELIC_ICONS).sort(), [...CANONICAL_RELICS].sort());
    assert.deepEqual([...ENEMY_TYPES].sort(), [...CANONICAL_ENEMIES].sort());
    assert.equal(Object.keys(EVOLVED_NAMES).length, 16);

    const weaponUrls = new Set();
    const evoUrls = new Set();
    for (const id of CANONICAL_WEAPONS) {
      const cBase = new MockCanvas(100, 100);
      drawIcon(cBase.getContext('2d'), 'weapon', id, 50, 50, 80);
      const cEvo = new MockCanvas(100, 100);
      drawIcon(cEvo.getContext('2d'), 'evo', id, 50, 50, 80);

      assert.ok(cBase.ops.length > 10, `基础武器图标 ${id} 绘制指令过少`);
      assert.ok(cEvo.ops.length > 12, `开光神兵图标 ${id} 绘制指令过少`);
      assert.notEqual(
        cBase.ops.join('|'),
        cEvo.ops.join('|'),
        `开光神兵图标 ${id} 必须拥有独立神兵版画构图，不能等同基础武器`
      );

      const uW = iconDataURL('weapon', id, 64);
      const uE = iconDataURL('evo', id, 64);
      const uEBase = baseIconDataURL('evo', id, 64);
      assert.ok(uW.startsWith('data:image/png;base64,'));
      assert.ok(uE.startsWith('data:image/png;base64,'));
      assert.equal(uE, uEBase);
      assert.notEqual(uW, uE, `${id} 的 weapon 与 evo dataURL 必须不同`);
      weaponUrls.add(uW);
      evoUrls.add(uE);
    }
    assert.equal(weaponUrls.size, 16, '16 种基础武器 dataURL 必须两两互异');
    assert.equal(evoUrls.size, 16, '16 种开光神兵 dataURL 必须两两互异');

    const relicUrls = new Set(CANONICAL_RELICS.map((id) => iconDataURL('relic', id, 64)));
    assert.equal(relicUrls.size, 16, '16 种法器 dataURL 必须两两互异');

    const heroUrls = new Set(['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi'].map((id) => iconDataURL('hero', id, 64)));
    assert.equal(heroUrls.size, 6);
    assert.equal(Object.keys(HERO_ICONS).length, 6);

    const enemyUrls = new Set(CANONICAL_ENEMIES.map((id) => iconDataURL('enemy', id, 64)));
    assert.equal(enemyUrls.size, 12, '12 种邪祟/夜主实机立绘 dataURL 必须两两互异');

    // 验证马面夜主带蓄力眼睛坐标，且无面伞女 shield vs open 烘焙出截然不同的精灵
    assert.ok(Array.isArray(enemyDef('horse').eyes) && enemyDef('horse').eyes.length >= 2);
    const umbShield = enemySprite('umbrella', 0, false, 'shield');
    const umbOpen = enemySprite('umbrella', 0, false, 'open');
    assert.notEqual(umbShield.canvas.toDataURL(), umbOpen.canvas.toDataURL(), '无面伞女护盾态与旋开态必须具备显著视觉区分');

    // 3 类奇遇神龛与新弹体烘焙验证
    assert.deepEqual(SHRINE_TYPES, ['altar', 'trial', 'peddler']);
    for (const k of SHRINE_TYPES) {
      const fresh = shrineSprite(k, false, false);
      const used = shrineSprite(k, true, false);
      assert.notEqual(fresh.canvas.toDataURL(), used.canvas.toDataURL(), `神龛 ${k} 未使用与已使用状态应有视觉区分`);
    }
    const trialActive = shrineSprite('trial', false, true);
    assert.notEqual(trialActive.canvas.toDataURL(), shrineSprite('trial', false, false).canvas.toDataURL());

    for (const pj of ['lanternEvo', 'papermanGuard0', 'papermanCavalry0', 'papermanImp0', 'paperHorse', 'paperHorseEvo', 'compass', 'bronzeMirror', 'cinderCore', 'soulFireBullet']) {
      assert.ok(projSprite(pj).canvas.ops.length > 5, `弹体精灵 ${pj} 应成功烘焙`);
    }
    for (const v of ['awakened', 'talisman', 'compass', 'compassEvo']) {
      assert.ok(baguaArraySprite(v).canvas.ops.length > 8);
    }
    assert.ok(inkWaveSprite(true).canvas.ops.length > 5);
    assert.ok(emberPoolSprite(0).canvas.ops.length > 5);

    // 校验所有绘制色值（排除 destination-out 的 #000 镂空掩模）均满足暖色不变量
    for (const col of colors) {
      if (col === '#000') continue;
      const rgb = parseColorRGB(col);
      if (rgb) {
        assert.ok(rgb[0] + 18 >= rgb[1] && rgb[0] + 18 >= rgb[2], `检测到非暖色画笔: ${col}`);
      }
    }
  });
});

test('renderer.js + hud.js + fx.js + ground.js：22 种弹体、夜色上朱砂预警、屏边奇遇指针、开光法环与紧凑 HUD 完整渲染', () => {
  withMockCanvas(({ MockCanvas }) => {
    // 地面生成与横街判定
    const gnd = createGround(42);
    const gCanvas = new MockCanvas(390, 844);
    gnd.draw(gCanvas.getContext('2d'), -195, -422, 390, 844);
    assert.ok(gCanvas.ops.length > 0);
    assert.equal(typeof inStreet(0, 0, 42), 'boolean');

    // FX 震屏开关与顿帧契约
    const fx = createFx({ seed: 7 });
    fx.onEvent({ type: 'evolve', weaponId: 'talisman', evoName: '天师符阵' });
    assert.ok(fx.hitstop > 0, '开光事件应触发顿帧');
    fx.update(0.016);
    assert.notDeepEqual(fx.shakeOffset(true), { x: 0, y: 0 }, '启用震屏时应返回非零偏移');
    assert.deepEqual(fx.shakeOffset(false), { x: 0, y: 0 }, '关闭震屏时必须严格返回 {0, 0}');

    // HUD 空装 vs 满装羁绊对比
    const hud = createHud();
    const hudEmpty = new MockCanvas(390, 844);
    const basePlayer = { x: 0, y: 0, r: 12, hp: 90, maxHp: 100, level: 5, xp: 20, xpNext: 50, ult: 40, ultMax: 100, hurtT: 0, soulBarrier: 0 };
    hud.draw(hudEmpty.getContext('2d'), { time: 125, watch: 2, mode: 'main', player: basePlayer, weapons: [], relics: [], synergies: { active: [] } }, 390, 844, 1.0, {});

    const hudFull = new MockCanvas(390, 844);
    hud.draw(
      hudFull.getContext('2d'),
      {
        time: 125,
        watch: 2,
        mode: 'main',
        player: { ...basePlayer, soulBarrier: 2 },
        weapons: [
          { id: 'talisman', level: 5, evolved: true },
          { id: 'compass', level: 3, evolved: false },
        ],
        relics: [{ id: 'bagua', level: 4 }, { id: 'fivecoins', level: 2 }],
        synergies: { active: [{ tag: 'daofa', tier: 4, name: '道法' }] },
        blessings: [{ id: 'b1', stacks: 1 }],
      },
      390,
      844,
      1.0,
      {}
    );
    assert.notEqual(hudFull.toDataURL(), hudEmpty.toDataURL(), '紧凑 HUD 栏必须随装备与流派羁绊实时重绘不同画面');
    const emptyImgs = hudEmpty.ops.filter((o) => o.startsWith('di:')).length;
    const fullImgs = hudFull.ops.filter((o) => o.startsWith('di:')).length;
    assert.ok(fullImgs >= emptyImgs + 7, `装备武器/法器/羁绊/命签/魂障后应新增对应版画瓦片绘制 (${fullImgs} vs ${emptyImgs})`);
    assert.ok(hud.getUltButtonRect().w > 40);

    // Renderer 完整验证：22 种 pr.kind + 夜色之上冲锋预警 + 屏边奇遇指针 + 开光脚底法环
    const screen = new MockCanvas(390, 844);
    screen.clientWidth = 390;
    screen.clientHeight = 844;
    const renderer = createRenderer(screen, { lowQuality: false });
    renderer.resize(390, 844, 2);

    const all22Projectiles = [
      { id: 1, kind: 'gongPulse', x: 0, y: 0, radius: 0, maxRadius: 120, waveIdx: 3, evolved: true, t: 0.02, life: 0.4 },
      { id: 2, kind: 'ultPulse', x: 0, y: 0, radius: 0, maxRadius: 200, t: 0.05, life: 0.5 },
      { id: 3, kind: 'lantern', x: 35, y: 10, persistent: true, evolved: true, t: 0.3, life: 1 },
      { id: 4, kind: 'flameRing', x: 0, y: 0, radius: 95, innerRadius: 54, dualLotus: true, persistent: true, evolved: true, t: 0.4, life: 1 },
      { id: 5, kind: 'talisman', x: 20, y: -20, vx: 200, vy: -120, evolved: true, t: 0.1, life: 1 },
      { id: 6, kind: 'talismanChain', x: 10, y: -10, points: [{ x: 0, y: 0 }, { x: 45, y: -40 }, { x: 80, y: -20 }], evolved: true, t: 0.05, life: 0.25 },
      { id: 7, kind: 'talismanArray', x: 40, y: -60, r: 10, radius: 95, evolved: true, t: 0.4, life: 1.8 },
      { id: 8, kind: 'brushArc', x: 0, y: 0, radius: 110, spread: 5.8, angle: 0.5, evolved: true, t: 0.1, life: 0.3 },
      { id: 9, kind: 'inkWave', x: 55, y: 15, r: 14, hitR: 26, radius: 26, angle: 0.2, vx: 300, vy: 60, evolved: true, t: 0.2, life: 0.7 },
      { id: 10, kind: 'inkPool', x: -30, y: 40, radius: 44, subKind: 'emberZone', evolved: true, t: 0.5, life: 2.2 },
      { id: 11, kind: 'coinsword', x: -45, y: -25, angle: 2.1, vx: -220, vy: -80, evolved: true, t: 0.3, life: 2 },
      { id: 12, kind: 'paperman', x: 30, y: 30, role: 'guard', mode: 'guard', persistent: true, evolved: true, t: 0.2, life: 1 },
      { id: 13, kind: 'paperman', x: 70, y: -20, role: 'cavalry', mode: 'charge', persistent: true, evolved: true, t: 0.5, life: 1 },
      { id: 14, kind: 'paperman', x: -50, y: 20, role: 'imp', mode: 'imp', persistent: false, evolved: true, t: 1.0, life: 4.0 },
      { id: 15, kind: 'firecracker', x: -20, y: -30, fromX: 0, fromY: 0, toX: -60, toY: -80, radius: 60, evolved: true, t: 0.2, life: 0.45 },
      { id: 16, kind: 'explosion', x: 60, y: 50, radius: 58, subKind: 'firecrackerLotus', evolved: true, t: 0.1, life: 0.3 },
      { id: 17, kind: 'bellChain', x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: -40, y: -50 }], subKind: 'soulEcho', evolved: true, t: 0.06, life: 0.22 },
      { id: 18, kind: 'compassField', x: -60, y: -50, r: 12, radius: 92, evolved: true, t: 0.5, life: 2.2 },
      { id: 19, kind: 'soulSweep', x: 0, y: 0, r: 10, radius: 135, spread: 3.6, reverse: true, angle: 1.2, evolved: true, t: 0.08, life: 0.28 },
      { id: 20, kind: 'mirrorBeam', x: 0, y: 0, endX: 160, endY: -90, length: 184, width: 28, angle: -0.5, evolved: true, t: 0.3, life: 1.1 },
      { id: 21, kind: 'paperHorse', x: 65, y: -15, r: 14, radius: 22, angle: -0.2, vx: 380, vy: -70, trampleBullets: true, evolved: true, t: 0.2, life: 1.2 },
      { id: 22, kind: 'thunderBolt', x: 25, y: -85, r: 10, radius: 58, evolved: true, t: 0.08, life: 0.3 },
      { id: 23, kind: 'cinderCore', x: -40, y: 65, r: 6, radius: 68, t: 0.45, life: 0.9 },
      { id: 24, kind: 'enemyBullet', x: 48, y: 38, vx: -80, vy: -60, r: 6, style: 'ink', source: 'paperbride', t: 0.2, life: 3 },
      { id: 25, kind: 'gongWave', x: 0, y: 0, radius: 60, maxRadius: 100, t: 0.1, life: 0.3 },
      { id: 26, kind: 'lanternRing', x: 0, y: 0, radius: 72, persistent: true, t: 0.2, life: 1 },
    ];

    const mockRun = {
      seed: 99,
      heroId: 'daotong',
      time: 210,
      watch: 4,
      mode: 'main',
      status: 'playing',
      darkness: 0.68,
      mods: { lightRadius: 148 },
      player: { ...basePlayer, heroId: 'daotong', moving: true, facingX: 1, facingY: 0, soulBarrier: 1 },
      weapons: [{ id: 'talisman', level: 5, evolved: true }],
      relics: [{ id: 'bagua', level: 3 }],
      synergies: { active: [{ tag: 'daofa', tier: 2, name: '道法' }] },
      shrines: [
        { id: 1, kind: 'altar', x: 40, y: -70, r: 24, used: false, active: false, timer: 0, maxTimer: 0 },
        { id: 2, kind: 'trial', x: 420, y: 0, r: 24, used: false, active: true, timer: 11, maxTimer: 18 },
      ],
      nearbyShrine: { id: 1 },
      enemies: [
        {
          id: 101,
          type: 'horse',
          x: 0,
          y: -210,
          r: 30,
          hp: 900,
          maxHp: 1200,
          boss: true,
          state: 'windup',
          dx: 0,
          dy: 1,
          telegraphProgress: 0.72,
          telegraphLen: 264,
          telegraphWidth: 60,
          telegraphX: 0,
          telegraphY: 54,
          hitT: 0.05,
        },
        {
          id: 102,
          type: 'sedan',
          x: -55,
          y: -30,
          r: 24,
          hp: 300,
          maxHp: 300,
          elite: true,
          affix: 'paper_armor',
          paperArmor: 3,
          warder: true,
          warderName: '巡街轿头',
          stunT: 0.5,
          slowT: 0.5,
          vulnT: 0.5,
          bleedT: 0.5,
        },
        { id: 103, type: 'suona', x: 65, y: 30, r: 16, hp: 50, maxHp: 50, elite: true, affix: 'soul_fire', yangyanMarkT: 1 },
        { id: 104, type: 'paperbride', x: -65, y: 40, r: 15, hp: 50, maxHp: 50, elite: true, affix: 'mirror_twin' },
        { id: 105, type: 'cinder', x: 50, y: -35, r: 14, hp: 40, maxHp: 40, elite: true, affix: 'treasure_bearer' },
      ],
      boss: { id: 101, type: 'horse', hp: 900, maxHp: 1200, phase: 1 },
      pickups: [{ id: 1, kind: 'xp', tier: 3, x: 15, y: 18 }, { id: 2, kind: 'chest', x: -24, y: 26 }],
      props: [{ id: 1, kind: 'lanternpost', x: -90, y: -60, hp: 20 }],
      projectiles: all22Projectiles,
      events: [
        { type: 'hit', x: 0, y: -200, amount: 480, crit: true, enemyId: 101 },
        { type: 'explosion', x: 60, y: 50, radius: 64, evolved: true },
        { type: 'wave', count: 10, pattern: 'alley' },
        { type: 'shrineActivate', kind: 'altar', x: 40, y: -70 },
      ],
    };

    renderer.consumeEvents(mockRun.events);
    screen.ops.length = 0;
    renderer.render(mockRun, 1, 1 / 60, { shake: true, dmgText: 'all' });

    // 验证夜色遮罩（_darkCanvas 绘制）之后绘制了穿透黑暗的朱砂冲锋预警与右侧奇遇路引字印
    const opsJoined = screen.ops.join('\n');
    assert.ok(opsJoined.includes('ft:巡街轿头'), '应绘制小头目名牌');
    assert.ok(opsJoined.includes('ft:土地香案'), '贴近未使用神龛时应绘制奇遇牌匾');
    assert.ok(opsJoined.includes('ft:碑'), '屏外试炼碑应在屏幕边缘绘制「碑」字路引朱印');
    assert.ok(opsJoined.includes(`ss:${VERM}`), '应绘制纯朱红冲锋预警线');
  });
});

test('synth.js：Karplus-Strong 拨弦、15 基础音效、12 武器开火（含开光增强）、爆炸/尸潮/神龛事件、20 复音上限与多原因挂起引用计数', () => {
  const pluck = renderPluck(22050, 220, 0.4, 0.5);
  assert.ok(pluck instanceof Float32Array && pluck.length === Math.floor(22050 * 0.4));
  assert.ok(Math.abs(pluck[0]) === 0);
  let energy = 0;
  for (let i = 0; i < pluck.length; i++) energy += pluck[i] * pluck[i];
  assert.ok(energy > 0.1, 'Karplus-Strong 拨弦应具有真实非零音频能量');

  const prevAC = globalThis.AudioContext;
  const stats = { osc: 0, bufSrc: 0, filter: 0, gain: 0, suspends: 0, resumes: 0 };
  let mockNow = 0;

  class MockAudioContext {
    constructor() {
      this.sampleRate = 22050;
      this.state = 'suspended';
      this.destination = { kind: 'dest' };
    }
    get currentTime() {
      return mockNow;
    }
    resume() {
      stats.resumes++;
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      stats.suspends++;
      this.state = 'suspended';
      return Promise.resolve();
    }
    createDynamicsCompressor() {
      return { threshold: { value: 0 }, ratio: { value: 0 }, connect() {} };
    }
    createGain() {
      stats.gain++;
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
          setTargetAtTime() {},
        },
        connect() {},
      };
    }
    createBiquadFilter() {
      stats.filter++;
      return {
        type: 'lowpass',
        Q: { value: 1 },
        frequency: { value: 1000, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
    createOscillator() {
      stats.osc++;
      return {
        type: 'sine',
        frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createBuffer(ch, len, sr) {
      const arr = new Float32Array(len);
      return {
        sampleRate: sr,
        length: len,
        getChannelData: () => arr,
        copyToChannel: (src) => arr.set(src),
      };
    }
    createBufferSource() {
      stats.bufSrc++;
      return {
        buffer: null,
        loop: false,
        playbackRate: { value: 1, setTargetAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
  }

  globalThis.AudioContext = MockAudioContext;
  try {
    const audio = createAudio();
    assert.equal(audio.state, 'none');
    assert.equal(audio.unlock(), true);
    assert.equal(audio.state, 'running');

    // 1. 验证全部 15 个传统音效键正常发声且触发真实节点
    const legacy15 = [
      'gong', 'gongSmall', 'woodblock', 'paper', 'hit',
      'crit', 'pickup', 'coin', 'levelup', 'boss',
      'dawn', 'hurt', 'evolve', 'click', 'watch',
    ];
    for (const name of legacy15) {
      const before = stats.osc + stats.bufSrc;
      assert.equal(audio.play(name, { arg: 2 }), true, `基础音效 ${name} 应返回 true`);
      assert.ok(stats.osc + stats.bufSrc > before, `基础音效 ${name} 必须调度真实振荡器或噪声源`);
    }
    // 推进模拟时钟以释放全部 15 个声部
    mockNow += 10;

    // 2. 验证全部 12 把武器开火事件（普通 + 开光增强）零冷却冲突且均调度真实节点
    for (const wid of CANONICAL_WEAPONS) {
      const b0 = stats.osc + stats.bufSrc;
      audio.onEvents([{ type: 'fire', weaponId: wid, evolved: false }]);
      const baseNodes = (stats.osc + stats.bufSrc) - b0;
      assert.ok(baseNodes >= 1, `武器 ${wid} 普通开火事件必须合成真实音效节点`);

      mockNow += 0.25;
      const b1 = stats.osc + stats.bufSrc;
      audio.onEvents([{ type: 'fire', weaponId: wid, evolved: true }]);
      const evoNodes = (stats.osc + stats.bufSrc) - b1;
      assert.ok(evoNodes > baseNodes, `武器 ${wid} 开光开火应叠加更丰富的泛音节点 (${evoNodes} > ${baseNodes})`);
    }

    // 3. 验证爆炸、尸潮、神龛激活、羁绊升级、命签抽取等扩展事件
    mockNow += 2;
    for (const evt of [
      { type: 'explosion', evolved: true, radius: 70 },
      { type: 'wave', count: 12, pattern: 'flank' },
      { type: 'shrineActivate', kind: 'altar' },
      { type: 'synergyUp', tag: 'daofa', tier: 4 },
      { type: 'blessingPick', id: 'b1', tier: 'cursed' },
      { type: 'warderSpawn', name: '巡街轿头' },
      { type: 'shieldBlock' },
      { type: 'heal', amount: 15 },
      { type: 'banish' },
    ]) {
      const b = stats.osc + stats.bufSrc;
      audio.onEvents([evt]);
      assert.ok(stats.osc + stats.bufSrc > b, `事件 ${evt.type} 必须触发 WebAudio 合成节点`);
    }

    // 4. 验证 MAX_VOICES = 20 复音上限节流 + boss/dawn/gong 最高优先级穿透
    mockNow += 20;
    const twentyKeys = [
      ...CANONICAL_WEAPONS.map((w) => 'fire_' + w), // 16
      'explosion', 'wave', 'shrineActivate', 'synergyUp', // +4 = 20
    ];
    for (const k of twentyKeys) {
      assert.equal(audio.play(k), true, `声部填充 ${k} 应成功`);
    }
    // 第 21 个普通音效必须被节流拦截，而 boss / dawn / gong 穿透上限
    assert.equal(audio.play('click'), false, '达到 20 声部上限时普通音效必须被节流');
    assert.equal(audio.play('boss'), true, 'boss 音效必须穿透 20 声部上限');
    assert.equal(audio.play('dawn'), true, 'dawn 音效必须穿透 20 声部上限');
    assert.equal(audio.play('gong'), true, 'gong 音效必须穿透 20 声部上限');

    // 5. 多原因 suspend('ad') + suspend('hidden') 引用计数验证
    mockNow += 10;
    audio.suspend('ad');
    audio.suspend('hidden');
    assert.equal(audio.state, 'suspended');
    assert.equal(audio.play('click'), false);
    audio.resume('ad');
    assert.equal(audio.state, 'suspended', '仍有 hidden 挂起原因时不得提前恢复播放');
    assert.equal(audio.play('click'), false);
    audio.resume('hidden');
    assert.equal(audio.state, 'running', '全部挂起原因解除后应恢复播放');
    assert.equal(audio.play('click'), true);
  } finally {
    if (prevAC === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = prevAC;
  }
});
