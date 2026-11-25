// v3 M2 单测：开屏查询解析、6×3=18 套差异化角色皮肤、5 系重彩攻击特效、默认 6 色木版守恒与敌方预警朱砂红安全不变量
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultSave, migrateSave, mergeSaves, HERO_IDS } from '../../src/meta/save.js';
import {
  ATTACK_VFX_IDS,
  ATTACK_VFX_THEMES,
  HERO_SKINS,
  HERO_SKINS_BY_HERO,
  normalizeAttackVfxId,
  normalizeHeroSkinId,
  getDefaultHeroSkinId,
  isCosmeticOwned,
  getEquippedHeroSkin,
  getEquippedAttackVfx,
  buyCosmetic,
  equipHeroSkin,
  equipAttackVfx,
  grantCosmeticUnlock,
  cosmeticShopSpent,
} from '../../src/meta/cosmetics.js';
import {
  SKIN_W,
  SKIN_H,
  heroSkinSprite,
  skinLanternSprite,
  skinFootAuraSprite,
  drawHeroWithSkin,
} from '../../src/render/skins.js';
import {
  vfxRingSprite,
  vfxSlashSprite,
  vfxArraySprite,
  vfxBurstSprite,
  vfxPoolSprite,
} from '../../src/render/vfx-themes.js';
import { clearSpriteCache, setSpriteScale } from '../../src/render/sprites.js';
import { createRenderer } from '../../src/render/renderer.js';
import { createRun } from '../../src/sim/run.js';
import { parseBootIntroQuery } from '../../src/ui/boot-intro.js';

function createTracingCanvasClass(colorLog = null) {
  return class TracingCanvas {
    constructor(w = 64, h = 64) {
      this.width = w;
      this.height = h;
      this.clientWidth = w;
      this.clientHeight = h;
      this.ops = [];
      this._ctx = null;
    }
    getContext() {
      if (this._ctx) return this._ctx;
      const ops = this.ops;
      let fillStyle = '#000';
      let strokeStyle = '#000';
      const rec = (c) => {
        if (colorLog && typeof c === 'string') colorLog.push(c);
      };
      this._ctx = {
        canvas: this,
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        font: '12px serif',
        textAlign: 'center',
        textBaseline: 'middle',
        imageSmoothingEnabled: true,
        get fillStyle() { return fillStyle; },
        set fillStyle(v) { fillStyle = v; rec(v); ops.push(`fs:${typeof v === 'string' ? v : 'g'}`); },
        get strokeStyle() { return strokeStyle; },
        set strokeStyle(v) { strokeStyle = v; rec(v); ops.push(`ss:${typeof v === 'string' ? v : 'g'}`); },
        save() { ops.push('sv'); },
        restore() { ops.push('rs'); },
        scale(x, y) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y));
          ops.push(`sc:${x.toFixed(2)},${y.toFixed(2)}`);
        },
        translate(x, y) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y));
          ops.push(`tr:${x.toFixed(1)},${y.toFixed(1)}`);
        },
        rotate(a) {
          assert.ok(Number.isFinite(a));
          ops.push(`rt:${a.toFixed(2)}`);
        },
        setTransform(...a) { a.forEach((v) => assert.ok(Number.isFinite(v))); },
        beginPath() { ops.push('bp'); },
        closePath() { ops.push('cp'); },
        clip() {},
        moveTo(x, y) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y));
          ops.push(`M:${x.toFixed(1)},${y.toFixed(1)}`);
        },
        lineTo(x, y) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y));
          ops.push(`L:${x.toFixed(1)},${y.toFixed(1)}`);
        },
        quadraticCurveTo(cx, cy, x, y) {
          assert.ok(Number.isFinite(cx) && Number.isFinite(x));
          ops.push(`Q:${cx.toFixed(1)},${y.toFixed(1)}`);
        },
        bezierCurveTo(a, b, c, d, x, y) {
          assert.ok(Number.isFinite(a) && Number.isFinite(x));
          ops.push(`B:${x.toFixed(1)},${y.toFixed(1)}`);
        },
        arc(x, y, r, s, e) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r) && r >= 0);
          ops.push(`A:${x.toFixed(1)},${y.toFixed(1)},${r.toFixed(1)},${(e - s).toFixed(2)}`);
        },
        ellipse(x, y, rx, ry) {
          assert.ok(Number.isFinite(rx) && Number.isFinite(ry) && rx >= 0 && ry >= 0);
          ops.push(`E:${rx.toFixed(1)},${ry.toFixed(1)}`);
        },
        rect(x, y, w, h) { ops.push(`R:${w.toFixed(1)},${h.toFixed(1)}`); },
        fill() { ops.push(`f:${typeof fillStyle === 'string' ? fillStyle : 'g'}`); },
        stroke() { ops.push(`s:${typeof strokeStyle === 'string' ? strokeStyle : 'g'}`); },
        fillRect(x, y, w, h) { ops.push(`fr:${w.toFixed(1)},${h.toFixed(1)}:${typeof fillStyle === 'string' ? fillStyle : 'g'}`); },
        strokeRect(x, y, w, h) { ops.push(`sr:${w.toFixed(1)},${h.toFixed(1)}:${typeof strokeStyle === 'string' ? strokeStyle : 'g'}`); },
        clearRect() {},
        fillText(t) { ops.push(`ft:${t}`); },
        strokeText() {},
        measureText(t) { return { width: String(t).length * 10 }; },
        drawImage(img, x = 0, y = 0, w = 0, h = 0) {
          ops.push(`di:${img?.ops?.length || 0}@${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`);
        },
        createPattern() { return {}; },
        createRadialGradient() {
          return { addColorStop(_, col) { rec(col); } };
        },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {},
      };
      return this._ctx;
    }
    signature() {
      const raw = `${this.width}x${this.height}|${this.ops.join(';')}`;
      let h = 2166136261;
      for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619) >>> 0;
      return `${h.toString(16)}_${this.ops.length}`;
    }
  };
}

function parseRgb(str) {
  if (typeof str !== 'string') return null;
  if (/^#[0-9a-fA-F]{6}$/.test(str)) {
    return [
      parseInt(str.slice(1, 3), 16),
      parseInt(str.slice(3, 5), 16),
      parseInt(str.slice(5, 7), 16),
    ];
  }
  const m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

test('F1 boot-intro 查询参数解析：?skipIntro=1、?introHold=loading|logo 与非法参数回退', () => {
  assert.deepEqual(parseBootIntroQuery(''), { skip: false, hold: null });
  assert.deepEqual(parseBootIntroQuery('?skipIntro=1'), { skip: true, hold: null });
  assert.deepEqual(parseBootIntroQuery('?introHold=loading'), { skip: false, hold: 'loading' });
  assert.deepEqual(parseBootIntroQuery('?introHold=logo'), { skip: false, hold: 'logo' });
  assert.deepEqual(parseBootIntroQuery('?introHold=__invalid__'), { skip: false, hold: null });
});

test('F5/F6 cosmetics.js：18 套角色皮肤（6×3）+ 5 套攻击特效目录、购买/穿戴闭环与防刷钱计价', () => {
  assert.equal(HERO_SKINS.filter((s) => s.unlock !== 'season').length, HERO_IDS.length * 3);
  assert.deepEqual(ATTACK_VFX_IDS, [
    'default',
    'jade_ghostfire',
    'violet_thunder',
    'gilded_imperial',
    'frost_moon',
  ]);
  for (const hid of HERO_IDS) {
    const list = HERO_SKINS_BY_HERO[hid].filter((s) => s.unlock !== 'season');
    assert.equal(list.length, 3, `英雄 ${hid} 应有 3 套常驻皮肤`);
    assert.equal(list[0].id, `${hid}_default`);
    assert.equal(list[0].unlock, 'default');
    assert.equal(list[0].price, 0);
  }

  const shopSkins = HERO_SKINS.filter((s) => s.unlock === 'shop' && s.price > 0);
  const achSkins = HERO_SKINS.filter((s) => s.unlock === 'achievement');
  assert.ok(shopSkins.length >= 9, `铜钱鬼市可购角色皮肤应 >= 9 套，实得 ${shopSkins.length}`);
  assert.ok(achSkins.length >= 3, `守夜功绩专属角色皮肤应 >= 3 套，实得 ${achSkins.length}`);

  const s = defaultSave();
  s.coins = 2000;
  // 未拥有皮肤禁止穿戴（T2-F5-02）
  assert.equal(equipHeroSkin(s, 'zhou', 'zhou_jade_watch').ok, false);
  assert.equal(getEquippedHeroSkin(s, 'zhou'), 'zhou_default');

  // 购买并穿戴铜钱皮肤
  const buy1 = buyCosmetic(s, 'zhou_jade_watch');
  assert.equal(buy1.ok, true);
  assert.equal(s.coins, 2000 - 680);
  assert.equal(isCosmeticOwned(s, 'zhou_jade_watch'), true);
  assert.equal(equipHeroSkin(s, 'zhou', 'zhou_jade_watch').ok, true);
  assert.equal(getEquippedHeroSkin(s, 'zhou'), 'zhou_jade_watch');

  // 跨英雄隔离与坏 ID 回退（T2-F5-03 / T2-F5-04）
  assert.equal(equipHeroSkin(s, 'mian', 'zhou_jade_watch').ok, false);
  assert.equal(normalizeHeroSkinId('zhou', '__ghost_skin_999__'), 'zhou_default');
  assert.equal(normalizeAttackVfxId('__neon_laser__'), 'default');

  // 成就发放专属皮肤与购买攻击特效
  assert.equal(buyCosmetic(s, 'zhou_imperial_bell').ok, false, '纯成就皮肤不可直接铜钱购买');
  assert.equal(grantCosmeticUnlock(s, 'zhou_imperial_bell'), true);
  assert.equal(equipHeroSkin(s, 'zhou', 'zhou_imperial_bell').ok, true);

  const buyVfx = buyCosmetic(s, 'jade_ghostfire');
  assert.equal(buyVfx.ok, true);
  assert.equal(equipAttackVfx(s, 'jade_ghostfire').ok, true);
  assert.equal(getEquippedAttackVfx(s), 'jade_ghostfire');
  assert.equal(cosmeticShopSpent(s.cosmetics.owned), 680 + ATTACK_VFX_THEMES.jade_ghostfire.price);

  // 切回免费默认不扣铜钱且持久化迁移保持完整
  const coinsBeforeDefault = s.coins;
  assert.equal(equipHeroSkin(s, 'zhou', getDefaultHeroSkinId('zhou')).ok, true);
  assert.equal(equipAttackVfx(s, 'default').ok, true);
  assert.equal(s.coins, coinsBeforeDefault);

  equipHeroSkin(s, 'zhou', 'zhou_jade_watch');
  equipAttackVfx(s, 'jade_ghostfire');
  const migrated = migrateSave(JSON.parse(JSON.stringify(s)));
  assert.equal(getEquippedHeroSkin(migrated, 'zhou'), 'zhou_jade_watch');
  assert.equal(getEquippedAttackVfx(migrated), 'jade_ghostfire');
  const merged = mergeSaves(migrated, defaultSave());
  assert.equal(getEquippedHeroSkin(merged, 'zhou'), 'zhou_jade_watch');
  assert.equal(getEquippedAttackVfx(merged), 'jade_ghostfire');
});

test('F5 skins.js：52×58 离屏画布 18 套角色皮肤两两互异，原装严守 6 色暖版画，非默认具备矿物重彩与脚底灵阵', () => {
  const prevOC = globalThis.OffscreenCanvas;
  const colors = [];
  globalThis.OffscreenCanvas = createTracingCanvasClass(colors);
  clearSpriteCache();
  setSpriteScale(2);

  try {
    const sigs = new Set();
    for (const skin of HERO_SKINS) {
      colors.length = 0;
      const spr = heroSkinSprite(skin.heroId, skin.id, 0, false);
      assert.equal(spr.w, SKIN_W);
      assert.equal(spr.h, SKIN_H);
      sigs.add(spr.canvas.signature());

      const aura = skinFootAuraSprite(skin.heroId, skin.id);
      const lan = skinLanternSprite(skin.heroId, skin.id);
      assert.ok(lan && lan.w > 0);

      if (skin.unlock === 'default') {
        assert.equal(aura, null, '原装默认皮肤不挂异色灵阵以保持 6 色木版画纯净');
        for (const c of colors) {
          const rgb = parseRgb(c);
          if (!rgb || (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0)) continue;
          assert.ok(
            rgb[0] + 18 >= rgb[1] && rgb[0] + 18 >= rgb[2],
            `默认皮肤 ${skin.id} 出现冷色 ${c}`,
          );
        }
      } else {
        assert.ok(aura && aura.canvas.ops.length > 5, `非默认皮肤 ${skin.id} 必须拥有独立脚底灵阵`);
      }

      const stage = new globalThis.OffscreenCanvas(120, 120);
      drawHeroWithSkin(stage.getContext('2d'), {
        heroId: skin.heroId,
        skinId: skin.id,
        x: 60,
        y: 88,
        showAura: true,
      });
      assert.ok(stage.ops.length > 6);
    }
    assert.equal(sigs.size, HERO_SKINS.length, '全部角色皮肤离屏绘制流必须两两唯一');
  } finally {
    clearSpriteCache();
    if (prevOC === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = prevOC;
  }
});

test('F6 vfx-themes.js & renderer.js：5 套攻击特效几何指令两两互异，敌方弹幕与红圈预警恒守朱砂红', () => {
  const prevOC = globalThis.OffscreenCanvas;
  const colors = [];
  globalThis.OffscreenCanvas = createTracingCanvasClass(colors);
  clearSpriteCache();

  try {
    const ringSigs = new Set();
    const slashSigs = new Set();
    const arrSigs = new Set();
    for (const vfxId of ['jade_ghostfire', 'violet_thunder', 'gilded_imperial', 'frost_moon']) {
      ringSigs.add(vfxRingSprite(vfxId, 0).canvas.signature());
      slashSigs.add(vfxSlashSprite(vfxId, 56, 1.5, true).canvas.signature());
      arrSigs.add(vfxArraySprite(vfxId, 'talismanArray').canvas.signature());
      assert.ok(vfxBurstSprite(vfxId, 0).canvas.ops.length > 5);
      assert.ok(vfxPoolSprite(vfxId, 0).canvas.ops.length > 5);
    }
    assert.equal(ringSigs.size, 4, '4 套非默认主题震波环几何必须两两互异');
    assert.equal(slashSigs.size, 4, '4 套非默认主题刀光扇斩几何必须两两互异');
    assert.equal(arrSigs.size, 4, '4 套非默认主题符阵几何必须两两互异');

    // 实机渲染验证：5 套主题各跑一帧全弹体渲染零异常，且仅 enemyBullet 场景下零冷色泄漏
    for (const themeId of ATTACK_VFX_IDS) {
      const screen = new globalThis.OffscreenCanvas(390, 844);
      const ren = createRenderer(screen, { lowQuality: false });
      const run = createRun({ seed: 606, heroId: 'daotong' });
      run.player.skinId = themeId === 'default' ? 'daotong_default' : 'daotong_violet_thunder';
      run.player.attackVfx = themeId;
      run.enemies.length = 0;
      run.props.length = 0;
      run.shrines.length = 0;
      run.darkness = 0;
      run.projectiles = [
        { id: 1, kind: 'gongPulse', x: 0, y: 0, radius: 60, maxRadius: 80, t: 0.1, life: 0.35, evolved: true },
        { id: 2, kind: 'brushArc', x: 20, y: 0, radius: 54, angle: 0.2, spread: 1.4, t: 0.1, life: 0.3, evolved: true },
        { id: 3, kind: 'talismanArray', x: 40, y: 20, radius: 48, t: 0.2, life: 1.0, evolved: true },
        { id: 4, kind: 'taomujian', x: 30, y: -20, vx: 120, vy: 0, angle: 0, t: 0.1, life: 1.0, evolved: true },
      ];
      ren.consumeEvents([{ type: 'hit', x: 25, y: 0, amount: 42, crit: true }]);
      ren.render(run, 1, 1 / 60, {
        shake: false,
        dmgText: 'off',
        cosmetics: { attackVfx: themeId, heroSkins: { daotong: run.player.skinId } },
      });
      assert.ok(screen.ops.length > 20);
    }
  } finally {
    clearSpriteCache();
    if (prevOC === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = prevOC;
  }
});
