// 铜钱鬼市商铺（F8：百相衣冠 18 套皮肤 + 锋芒异彩 5 套攻击特效，实时演武预览与铜钱购买穿戴）
import { HERO_IDS, getHeroStarterWeapon } from '../meta/save.js';
import {
  ATTACK_VFX_LIST,
  HERO_SKINS,
  buyCosmetic,
  equipAttackVfx,
  equipHeroSkin,
  getAttackVfxDef,
  getEquippedAttackVfx,
  getEquippedHeroSkin,
  getSkinDef,
  isCosmeticOwned,
} from '../meta/cosmetics.js';
import { ACHIEVEMENTS_BY_ID } from '../meta/achievements.js';
import { isHeroSignatureWeapon } from '../sim/balance.js';
import { drawHeroWithSkin } from '../render/skins.js';
import { getVfxPalette, vfxRingSprite, vfxSlashSprite } from '../render/vfx-themes.js';
import { renderStagePreviewFrame } from '../render/menu-scene.js';
import { INK, LANTERN, PAPER, PAPER_SHADE, VERM } from '../render/palette.js';
import { clear, formatCoins, h, scroll, sealButton, toast, veil } from './dom.js';
import { heroInfo } from './copy.js';

const COIN_SVG = `<svg viewBox="0 0 16 16" class="coin-ico" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.9" y="5.9" width="4.2" height="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

const thumbCache = new Map();

function bakeSkinThumbURL(skin) {
  if (typeof document === 'undefined') return null;
  const key = `skin_thumb:${skin.id}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(2, 2);
  g.fillStyle = INK;
  g.fillRect(0, 0, 48, 48);
  g.strokeStyle = PAPER_SHADE;
  g.lineWidth = 1;
  g.strokeRect(1.5, 1.5, 45, 45);
  drawHeroWithSkin(g, {
    heroId: skin.heroId,
    skinId: skin.id,
    x: 24,
    y: 41,
    frame: 0,
    scale: 0.78,
    showAura: true,
  });
  const url = c.toDataURL('image/png');
  c.width = 0;
  c.height = 0;
  thumbCache.set(key, url);
  return url;
}

function bakeVfxThumbURL(vfx) {
  if (typeof document === 'undefined') return null;
  const key = `vfx_thumb:${vfx.id}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(2, 2);
  g.fillStyle = INK;
  g.fillRect(0, 0, 48, 48);
  const pal = getVfxPalette(vfx.id);
  g.strokeStyle = pal.primary;
  g.lineWidth = 1.2;
  g.strokeRect(1.5, 1.5, 45, 45);
  if (vfx.id === 'default') {
    g.strokeStyle = VERM;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(24, 24, 14, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = LANTERN;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(24, 24, 9, -0.7, 1.6);
    g.stroke();
    g.fillStyle = PAPER;
    g.beginPath();
    g.arc(24, 24, 3, 0, Math.PI * 2);
    g.fill();
  } else {
    const ring = vfxRingSprite(vfx.id, 0);
    const slash = vfxSlashSprite(vfx.id, 36, 1.4, true);
    g.drawImage(ring.canvas, 4, 4, 40, 40);
    g.drawImage(slash.canvas, 6, 6, 36, 36);
  }
  const url = c.toDataURL('image/png');
  c.width = 0;
  c.height = 0;
  thumbCache.set(key, url);
  return url;
}

/**
 * 打开鬼市铜钱商铺（支持百相衣冠 18 套皮肤 + 锋芒异彩 5 套攻击特效 + 实时 Canvas 演武预览）
 */
export function openCosmeticShop(root, {
  save,
  persist,
  onCosmeticChange,
  onOpenStatShop,
  initialTab = 'skin',
  initialHero = 'all',
} = {}) {
  let tab = initialTab === 'vfx' ? 'vfx' : 'skin';
  let heroFilter = initialHero && HERO_IDS.includes(initialHero) ? initialHero : 'all';
  const curHero = HERO_IDS.includes(save.selectedHero) ? save.selectedHero : 'zhou';

  let previewKind = tab;
  let previewSkinId = getEquippedHeroSkin(save, initialHero && HERO_IDS.includes(initialHero) ? initialHero : curHero);
  let previewVfxId = getEquippedAttackVfx(save);

  const coinBox = h('div', { class: 'market-top__coins' });
  const topBar = h('div', { class: 'market-top' },
    coinBox,
    onOpenStatShop
      ? h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--small',
        dataset: { action: 'switch-stat-shop' },
        onClick: () => {
          closeModal();
          onOpenStatShop();
        },
      }, '属性加点')
      : null);

  // 唯一实时演武预览 <canvas>（确保 .cosmetic-shop-modal canvas 唯一指向此预览台）
  const previewCanvas = h('canvas', {
    class: 'market-preview__canvas',
    width: 600,
    height: 208,
    'aria-label': '鬼市外观实时演武预览',
  });
  const previewTitleEl = h('p', { class: 'market-preview__title' });
  const previewDescEl = h('p', { class: 'market-preview__desc' });
  const previewActBox = h('div', { class: 'market-preview__act' });
  const previewStage = h('div', { class: 'market-preview' },
    previewCanvas,
    h('div', { class: 'market-preview__bar' },
      h('div', { class: 'market-preview__info' }, previewTitleEl, previewDescEl),
      previewActBox));

  const tabBar = h('div', { class: 'seg market-tabs', role: 'tablist', 'aria-label': '鬼市分类' });
  const filterBar = h('div', { class: 'market-filters', role: 'radiogroup', 'aria-label': '按角色筛选衣冠' });
  const gridBox = h('div', { class: 'market-grid' });

  // 持久化卡片节点表，确保点击购买后原 targetCard 引用不断开（兼容连点购买+穿戴流水线）
  const skinCardMap = new Map();
  const vfxCardMap = new Map();

  let rafId = 0;
  let closed = false;
  let startMs = 0;

  function drawPreviewNow(ts) {
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    const cssW = Math.max(240, Math.floor(previewCanvas.clientWidth || 320));
    const cssH = Math.max(88, Math.floor(previewCanvas.clientHeight || 104));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (previewCanvas.width !== bw || previewCanvas.height !== bh) {
      previewCanvas.width = bw;
      previewCanvas.height = bh;
    }
    const now = ts ?? (typeof performance !== 'undefined' ? performance.now() : 16);
    if (!startMs) startMs = now;
    const tSec = (now - startMs) / 1000;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (previewKind === 'vfx') {
      renderStagePreviewFrame(ctx, cssW, cssH, tSec, {
        mode: 'vfx',
        attackVfx: previewVfxId,
      });
    } else {
      const sDef = getSkinDef(previewSkinId, curHero);
      const sw = getHeroStarterWeapon(save, sDef.heroId);
      renderStagePreviewFrame(ctx, cssW, cssH, tSec, {
        mode: 'hero',
        heroId: sDef.heroId,
        skinId: sDef.id,
        starterWeapon: sw,
        attackVfx: getEquippedAttackVfx(save),
        isSignature: isHeroSignatureWeapon(sDef.heroId, sw),
      });
    }
    ctx.restore();
  }

  function tickShopPreview(ts) {
    rafId = 0;
    if (closed || !previewCanvas.isConnected) return;
    if (!document.hidden) {
      drawPreviewNow(ts);
    }
    rafId = requestAnimationFrame(tickShopPreview);
  }

  function renderCoins() {
    clear(coinBox).appendChild(
      h('span', { class: 'coin-tag coin-tag--sm' },
        h('span', { html: COIN_SVG }),
        h('b', {}, formatCoins(save.coins))),
    );
  }

  function buildSkinActionNode(skin) {
    const owned = isCosmeticOwned(save, skin.id);
    const equippedId = getEquippedHeroSkin(save, skin.heroId);
    const isEq = equippedId === skin.id;
    const isDef = skin.unlock === 'default';

    if (owned) {
      if (isEq) {
        return h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--small market-btn',
          disabled: true,
        }, '已穿戴');
      }
      return h('button', {
        type: 'button',
        class: 'btn btn--seal btn--small market-btn',
        dataset: { action: 'equip-skin', skinId: skin.id },
        onClick: (e) => {
          e.stopPropagation();
          const res = equipHeroSkin(save, skin.heroId, skin.id);
          if (res.ok) {
            previewKind = 'skin';
            previewSkinId = skin.id;
            persist?.(false);
            onCosmeticChange?.();
            toast(`已为${heroInfo(skin.heroId).short}换上「${skin.name}」`);
            syncAllStates();
          }
        },
      }, isDef ? '穿戴原装' : '穿戴');
    }

    if (skin.unlock === 'achievement') {
      return h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--small market-btn',
        disabled: true,
      }, '功绩解锁');
    }

    const canAfford = (save.coins || 0) >= skin.price;
    return h('button', {
      type: 'button',
      class: `btn ${canAfford ? 'btn--seal' : 'btn--ghost'} btn--small market-btn`,
      disabled: !canAfford,
      dataset: { action: 'buy-skin', skinId: skin.id, price: String(skin.price) },
      onClick: (e) => {
        e.stopPropagation();
        const res = buyCosmetic(save, skin.id);
        if (!res.ok) {
          toast(res.reason === 'coins' ? `铜钱不足，还差 ${skin.price - (save.coins || 0)}` : '此衣冠需由守夜功绩解锁');
          return;
        }
        previewKind = 'skin';
        previewSkinId = skin.id;
        if (!res.alreadyOwned) {
          persist?.(true);
          toast(`购入「${skin.name}」`);
        }
        syncAllStates();
      },
    }, `购买 ${skin.price}`);
  }

  function buildVfxActionNode(vfx) {
    const owned = isCosmeticOwned(save, vfx.id);
    const equippedVfx = getEquippedAttackVfx(save);
    const isEq = equippedVfx === vfx.id;
    const isDef = vfx.id === 'default';

    if (owned) {
      if (isEq) {
        return h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--small market-btn',
          disabled: true,
        }, '已启用');
      }
      return h('button', {
        type: 'button',
        class: 'btn btn--seal btn--small market-btn',
        dataset: { action: 'equip-vfx', vfxId: vfx.id },
        onClick: (e) => {
          e.stopPropagation();
          const res = equipAttackVfx(save, vfx.id);
          if (res.ok) {
            previewKind = 'vfx';
            previewVfxId = vfx.id;
            persist?.(false);
            onCosmeticChange?.();
            toast(`已启用锋芒「${vfx.name}」`);
            syncAllStates();
          }
        },
      }, isDef ? '默认原装' : '装备特效');
    }

    const canAfford = (save.coins || 0) >= vfx.price;
    return h('button', {
      type: 'button',
      class: `btn ${canAfford ? 'btn--seal' : 'btn--ghost'} btn--small market-btn`,
      disabled: !canAfford,
      dataset: { action: 'buy-vfx', vfxId: vfx.id, price: String(vfx.price) },
      onClick: (e) => {
        e.stopPropagation();
        const res = buyCosmetic(save, vfx.id);
        if (!res.ok) {
          toast(`铜钱不足，还差 ${vfx.price - (save.coins || 0)}`);
          return;
        }
        previewKind = 'vfx';
        previewVfxId = vfx.id;
        if (!res.alreadyOwned) {
          persist?.(true);
          toast(`购入锋芒「${vfx.name}」`);
        }
        syncAllStates();
      },
    }, `购买 ${vfx.price}`);
  }

  function ensureSkinCard(skin) {
    let entry = skinCardMap.get(skin.id);
    if (entry) return entry;
    const thumbUrl = bakeSkinThumbURL(skin);
    const statusTag = h('span', { class: 'cosmetic-card__price' });
    const actHolder = h('div', { class: 'cosmetic-card__act' });
    const achName = skin.achievementId && ACHIEVEMENTS_BY_ID[skin.achievementId]
      ? ACHIEVEMENTS_BY_ID[skin.achievementId].name
      : '守夜功绩';
    const card = h('div', {
      class: 'cosmetic-card',
      dataset: {
        skinId: skin.id,
        cosmeticId: skin.id,
        cosmeticKind: 'skin',
        heroId: skin.heroId,
        unlock: skin.unlock,
        price: String(skin.price || 0),
      },
      onClick: () => {
        previewKind = 'skin';
        previewSkinId = skin.id;
        syncPreviewBar();
        syncCardSelection();
        drawPreviewNow();
      },
    },
    thumbUrl ? h('img', { class: 'cosmetic-card__thumb', src: thumbUrl, width: 48, height: 48, alt: '' }) : null,
    h('div', { class: 'cosmetic-card__body' },
      h('p', { class: 'cosmetic-card__head' },
        h('b', { class: 'cosmetic-card__name' }, skin.name),
        h('span', { class: 'cosmetic-card__hero' }, heroInfo(skin.heroId).short)),
      h('p', { class: 'cosmetic-card__sub' }, skin.subtitle),
      statusTag),
    actHolder);

    entry = { card, statusTag, actHolder, achName, skin };
    skinCardMap.set(skin.id, entry);
    return entry;
  }

  function ensureVfxCard(vfx) {
    let entry = vfxCardMap.get(vfx.id);
    if (entry) return entry;
    const thumbUrl = bakeVfxThumbURL(vfx);
    const statusTag = h('span', { class: 'cosmetic-card__price' });
    const actHolder = h('div', { class: 'cosmetic-card__act' });
    const card = h('div', {
      class: 'cosmetic-card cosmetic-card--vfx',
      dataset: {
        vfxId: vfx.id,
        cosmeticId: vfx.id,
        cosmeticKind: 'vfx',
        unlock: vfx.unlock,
        price: String(vfx.price || 0),
      },
      onClick: () => {
        previewKind = 'vfx';
        previewVfxId = vfx.id;
        syncPreviewBar();
        syncCardSelection();
        drawPreviewNow();
      },
    },
    thumbUrl ? h('img', { class: 'cosmetic-card__thumb', src: thumbUrl, width: 48, height: 48, alt: '' }) : null,
    h('div', { class: 'cosmetic-card__body' },
      h('p', { class: 'cosmetic-card__head' },
        h('b', { class: 'cosmetic-card__name' }, vfx.name),
        h('span', { class: 'cosmetic-card__hero' }, vfx.subtitle)),
      h('p', { class: 'cosmetic-card__sub' }, vfx.desc),
      statusTag),
    actHolder);

    entry = { card, statusTag, actHolder, vfx };
    vfxCardMap.set(vfx.id, entry);
    return entry;
  }

  function syncCardSelection() {
    for (const { card, skin } of skinCardMap.values()) {
      card.classList.toggle('is-preview', previewKind === 'skin' && previewSkinId === skin.id);
      card.classList.toggle('is-equipped', getEquippedHeroSkin(save, skin.heroId) === skin.id);
    }
    for (const { card, vfx } of vfxCardMap.values()) {
      card.classList.toggle('is-preview', previewKind === 'vfx' && previewVfxId === vfx.id);
      card.classList.toggle('is-equipped', getEquippedAttackVfx(save) === vfx.id);
    }
  }

  function syncPreviewBar() {
    clear(previewActBox);
    if (previewKind === 'vfx') {
      const vDef = getAttackVfxDef(previewVfxId);
      previewTitleEl.textContent = `锋芒 · ${vDef.name}`;
      previewDescEl.textContent = vDef.desc;
      previewActBox.appendChild(buildVfxActionNode(vDef));
    } else {
      const sDef = getSkinDef(previewSkinId, curHero);
      previewTitleEl.textContent = `${heroInfo(sDef.heroId).short} · ${sDef.name}`;
      previewDescEl.textContent = sDef.desc;
      previewActBox.appendChild(buildSkinActionNode(sDef));
    }
  }

  function syncCardsInPlace() {
    for (const entry of skinCardMap.values()) {
      const { skin, statusTag, actHolder } = entry;
      const owned = isCosmeticOwned(save, skin.id);
      if (skin.unlock === 'default') {
        statusTag.textContent = '原装衣冠 · 免费';
      } else if (skin.unlock === 'achievement') {
        statusTag.textContent = owned ? `功绩已解 · ${entry.achName}` : `守夜功绩「${entry.achName}」专属`;
      } else {
        statusTag.textContent = owned ? '已购入囊中' : `铜钱 ${skin.price}`;
      }
      clear(actHolder).appendChild(buildSkinActionNode(skin));
    }

    for (const entry of vfxCardMap.values()) {
      const { vfx, statusTag, actHolder } = entry;
      const owned = isCosmeticOwned(save, vfx.id);
      if (vfx.id === 'default') {
        statusTag.textContent = '原装锋芒 · 免费';
      } else if (vfx.achievementId) {
        statusTag.textContent = owned ? '已解锁' : `铜钱 ${vfx.price}（或功绩解锁）`;
      } else {
        statusTag.textContent = owned ? '已购入囊中' : `铜钱 ${vfx.price}`;
      }
      clear(actHolder).appendChild(buildVfxActionNode(vfx));
    }
    syncCardSelection();
  }

  function renderTabsAndFilters() {
    clear(tabBar);
    for (const [id, label] of [['skin', '百相衣冠'], ['vfx', '锋芒异彩']]) {
      tabBar.appendChild(h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': tab === id ? 'true' : 'false',
        class: `seg__opt${tab === id ? ' is-on' : ''}`,
        dataset: { marketTab: id },
        onClick: () => {
          tab = id;
          previewKind = id;
          renderTabsAndFilters();
          mountGridList();
          syncPreviewBar();
          drawPreviewNow();
        },
      }, label));
    }

    clear(filterBar);
    filterBar.hidden = tab !== 'skin';
    if (tab === 'skin') {
      const filters = [['all', '全部'], ...HERO_IDS.map((hid) => [hid, heroInfo(hid).short])];
      for (const [fid, flabel] of filters) {
        filterBar.appendChild(h('button', {
          type: 'button',
          class: `market-chip${heroFilter === fid ? ' is-on' : ''}`,
          dataset: { shopHero: fid },
          'aria-pressed': heroFilter === fid ? 'true' : 'false',
          onClick: () => {
            heroFilter = fid;
            if (fid !== 'all') {
              previewKind = 'skin';
              previewSkinId = getEquippedHeroSkin(save, fid);
            }
            renderTabsAndFilters();
            mountGridList();
            syncPreviewBar();
            drawPreviewNow();
          },
        }, flabel));
      }
    }
  }

  function mountGridList() {
    clear(gridBox);
    if (tab === 'skin') {
      const list = heroFilter === 'all'
        ? HERO_SKINS
        : HERO_SKINS.filter((s) => s.heroId === heroFilter);
      for (const skin of list) {
        gridBox.appendChild(ensureSkinCard(skin).card);
      }
    } else {
      for (const vfx of ATTACK_VFX_LIST) {
        gridBox.appendChild(ensureVfxCard(vfx).card);
      }
    }
    syncCardsInPlace();
  }

  function syncAllStates() {
    renderCoins();
    syncCardsInPlace();
    syncPreviewBar();
    drawPreviewNow();
  }

  let v = null;
  function closeModal() {
    if (closed) return;
    closed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    v?.close();
  }

  // 预创建全部卡片并挂载
  for (const s of HERO_SKINS) ensureSkinCard(s);
  for (const fx of ATTACK_VFX_LIST) ensureVfxCard(fx);
  renderCoins();
  renderTabsAndFilters();
  mountGridList();
  syncPreviewBar();

  const panel = scroll({
    title: '鬼市商铺',
    sub: '百相重彩衣冠 · 五系破煞锋芒',
    cls: 'scroll--dialog scroll--tall cosmetic-shop-modal',
    body: h('div', { class: 'market-body' }, topBar, previewStage, tabBar, filterBar, gridBox),
    footer: [
      sealButton('合卷回去', () => closeModal(), {
        kind: 'ghost',
        dataset: { action: 'close-market' },
      }),
    ],
  });

  v = veil(root, panel, { onBackdrop: () => closeModal() });
  drawPreviewNow();
  rafId = requestAnimationFrame(tickShopPreview);

  return { el: v.el, close: closeModal, refresh: syncAllStates };
}
