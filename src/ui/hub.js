// 更房大厅（独立游戏视觉层次重构：顶部极简状态条 + 居中沉浸动态演武舞台 + 右侧纵排功能浮栏 + 底部单屏备战台 + 暗漆四项底栏）。
// 切换角色/兵刃/夜色时原地局部刷新并触发舞台破墨金芒涟漪，零整页重建闪烁。
import { h, clear, scroll, sealButton, adButton, veil, toast, cnNum, formatCoins, formatTime } from './dom.js';
import { applyStagger, pulseClass } from './motion.js';
import { heroInfo, weaponName, nightLabel, nightDesc, SHOP_COPY, CHARM_LABEL, relicName } from './copy.js';
import { icon } from './icons.js';
import { settingsBody } from './settings.js';
import { showAgeDialog, showPrivacyDialog } from './dialogs.js';
import {
  DEFAULT_UNLOCKED_WEAPONS,
  HERO_IDS,
  WEAPON_IDS,
  getHeroStarterWeapon,
  setHeroStarterWeapon,
} from '../meta/save.js';
import { isHeroSignatureWeapon } from '../sim/balance.js';
import { getShopItems, getLevel, nextCost, buyLevel, describeLevel } from '../meta/shop.js';
import { heroUnlockProgress } from '../meta/unlocks.js';
import { getCheckinState, claimCheckin } from '../meta/checkin.js';
import { getCodexCounts } from '../meta/codex.js';
import { getEquippedAttackVfx, getEquippedHeroSkin, getSkinDef, getAttackVfxDef } from '../meta/cosmetics.js';
import { getUnclaimedAchievementCount, reconcileAchievements } from '../meta/achievements.js';
import { canShowCheckinDouble } from '../ads/ad-policy.js';
import { createHeroStage } from '../render/menu-scene.js';
import { openCodex } from './codex.js';
import { openCosmeticShop } from './cosmetic-shop.js';
import { openAchievementsModal } from './achievements.js';
import { getHubFeatureLock } from './coach.js';

const HERO_GLYPH = { zhou: '周', mian: '绵', daotong: '童', yinyang: '星', tiejiang: '石', nuoxi: '傩' };
const ACH_WEAPON_SET = new Set(['taomujian', 'zhinian_kite']);
const COIN_SVG = `<svg viewBox="0 0 16 16" class="coin-ico" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.9" y="5.9" width="4.2" height="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

function coinTag(n, sm = false) {
  return h('span', { class: `coin-tag${sm ? ' coin-tag--sm' : ''}` }, h('span', { html: COIN_SVG }), h('b', {}, formatCoins(n)));
}

/**
 * ctx: { save, adsOn(), persist(syncCloud?), runAd(placement) → Promise<result>, now() → Date,
 *        onStart({ heroId, startWeapon, unlockedWeapons, nightLevel, charm }), onSettings(settings),
 *        onCosmeticChange?(), cloudState?(), onCloudUpload?(), onCloudPull?(), onQuickCloud?(),
 *        onOpenLeaderboard?(), onOpenCoop?() }
 */
export function renderHub(root, ctx) {
  const { save } = ctx;
  reconcileAchievements(save);
  let charmPick = null;
  let stageCtl = null;

  // ── 1. 顶部极简状态栏 ──
  const daoEl = h('span', { class: 'hub-dao' }, save.daoName || '守夜打更人');
  const subLineEl = h('p', { class: 'hub-sub' }, statLine(save));
  const cloudBtn = h('button', {
    type: 'button',
    class: 'hub-cloud-btn',
    dataset: { action: 'quick-cloud' },
    onClick: async () => {
      if (ctx.onQuickCloud) {
        await ctx.onQuickCloud();
      } else if (ctx.onCloudPull) {
        await ctx.onCloudPull();
      }
      refresh();
    },
  });
  const coinBox = h('div', { class: 'hub-coins' });

  // ── 2. 居中沉浸动态演武舞台 + 浮层人物铭牌 + 右侧功能纵栏 ──
  const stageCanvas = h('canvas', {
    class: 'hero-stage__canvas',
    width: 680,
    height: 360,
    'aria-label': '当前角色衣冠与本命兵刃演武台',
    onClick: () => guardFeature('market', () => openMarket(getActiveHero())),
  });
  const heroSpotlightEl = h('div', { class: 'hero-spotlight' });
  const ribbonBox = h('div', { class: 'hub-ribbon', role: 'toolbar', 'aria-label': '更房要务' });
  const stageSection = h('section', { class: 'hub-stage-panel', 'aria-label': '守夜演武台' },
    h('div', { class: 'hero-stage' },
      stageCanvas,
      heroSpotlightEl,
      ribbonBox));

  // ── 3. 底部备战台（6人一排头像条 + 横滑兵刃架 + 夜色/护身符行 + 唯一主按钮）──
  const heroRowEl = h('div', { class: 'hero-row', role: 'radiogroup', 'aria-label': '选打更人' });
  const starterHeadSubEl = h('span', { class: 'starter-sec__sub' });
  const starterGridEl = h('div', { class: 'starter-grid', role: 'radiogroup', 'aria-label': '自选起手兵刃' });
  const runBarEl = h('div', { class: 'hub-run-bar' });
  const footWrap = h('div', { class: 'hub-foot' },
    sealButton('出门打更', () => {
      const n = Math.min(save.selectedNight, save.nightUnlocked);
      const charm = charmPick ? { relicId: charmPick } : null;
      const chosenStarter = getHeroStarterWeapon(save, getActiveHero());
      ctx.onStart({
        heroId: getActiveHero(),
        startWeapon: chosenStarter,
        unlockedWeapons: getRunWeaponPool(),
        nightLevel: n,
        charm,
      });
    }, { cls: 'btn--wide btn--big hub-cta' }));

  const startBox = h('section', { class: 'hub-start', 'aria-label': '起更备战' },
    h('div', { class: 'hub-deck' },
      heroRowEl,
      h('div', { class: 'starter-sec' },
        h('div', { class: 'starter-sec__head' },
          h('span', { class: 'starter-sec__title' }, '起手兵刃'),
          starterHeadSubEl),
        starterGridEl),
      runBarEl,
      footWrap));

  // ── 4. 底部暗漆四项导航栏（退居次级，衬托「出门打更」唯一主焦点）──
  const navBox = h('nav', { class: 'hub-nav', 'aria-label': '更房常设' });

  const el = h('div', { class: 'screen screen--hub' },
    h('header', { class: 'hub-head' },
      h('div', { class: 'hub-brand' },
        h('div', { class: 'hub-title-row' },
          h('h1', { class: 'hub-title' }, '更房'),
          daoEl),
        subLineEl),
      h('div', { class: 'hub-head__right' }, cloudBtn, coinBox)),
    stageSection,
    startBox,
    navBox);
  root.appendChild(el);

  function getActiveHero() {
    const activeHero = HERO_IDS.includes(save.selectedHero) && save.unlockedHeroes.includes(save.selectedHero)
      ? save.selectedHero
      : 'zhou';
    save.selectedHero = activeHero;
    return activeHero;
  }

  function guardFeature(feature, action) {
    const lk = getHubFeatureLock(save, feature);
    if (lk.locked) {
      toast(lk.toast);
      return;
    }
    action();
  }

  function statLine(s) {
    if (!s.stats?.runs) return '头一回守夜 · 先出门打一更试试手';
    const best = s.leaderboard?.bestScore ? ` · 最高 ${formatCoins(s.leaderboard.bestScore)}` : '';
    return `守 ${s.stats.runs} 夜 · 天亮 ${s.stats.clears} 回${best}`;
  }

  function cloudLabelText() {
    const st = ctx.cloudState?.() || { available: false };
    if (!st.available) return '本机';
    if (st.syncing) return '同步中';
    if (st.lastError) return '重试';
    if (st.dirty) return '待传';
    if (st.lastSyncAt > 0 || st.lastUploadAt > 0) return '已同步';
    return '云同步';
  }

  function destroyStage() {
    if (stageCtl) {
      stageCtl.destroy();
      stageCtl = null;
    }
  }

  function ensureStage() {
    if (stageCtl) {
      stageCtl.refreshNow();
      return;
    }
    stageCtl = createHeroStage(stageCanvas, () => {
      const hid = getActiveHero();
      const sw = getHeroStarterWeapon(save, hid);
      return {
        mode: 'hero',
        heroId: hid,
        skinId: getEquippedHeroSkin(save, hid),
        starterWeapon: sw,
        attackVfx: getEquippedAttackVfx(save),
        isSignature: isHeroSignatureWeapon(hid, sw),
        legacyOutfit: save.cosmetics?.equipped?.outfit || null,
        legacyLantern: save.cosmetics?.equipped?.lantern || null,
      };
    });
  }

  function refreshHeaderAndRibbon() {
    clear(coinBox).appendChild(coinTag(save.coins, true));
    daoEl.textContent = save.daoName || '守夜打更人';
    subLineEl.textContent = statLine(save);
    cloudBtn.textContent = cloudLabelText();

    clear(ribbonBox);
    const unclaimedAch = getUnclaimedAchievementCount(save);
    const lkMarket = getHubFeatureLock(save, 'market');
    const lkAch = getHubFeatureLock(save, 'achievements');
    const lkLb = getHubFeatureLock(save, 'leaderboard');
    const lkCoop = getHubFeatureLock(save, 'coop');
    ribbonBox.append(
      ribbonItem('鬼市', lkMarket.locked ? lkMarket.label : '衣冠', 'open-market', () => guardFeature('market', () => openMarket(getActiveHero())), 0, lkMarket.locked),
      ribbonItem('功绩', lkAch.locked ? lkAch.label : (unclaimedAch > 0 ? `领${unclaimedAch}` : '秘器'), 'open-achievements', () => guardFeature('achievements', () => openAchievements()), lkAch.locked ? 0 : unclaimedAch, lkAch.locked),
      ribbonItem('天榜', lkLb.locked ? lkLb.label : '排行', 'open-leaderboard', () => guardFeature('leaderboard', () => {
        if (ctx.onOpenLeaderboard) ctx.onOpenLeaderboard();
        else openLocalLeaderboardFallback();
      }), 0, lkLb.locked),
      ribbonItem('同守', lkCoop.locked ? lkCoop.label : '联机', 'open-coop', () => guardFeature('coop', () => {
        if (ctx.onOpenCoop) ctx.onOpenCoop();
        else openCoopFallback();
      }), 0, lkCoop.locked),
    );
  }

  function ribbonItem(title, sub, action, onClick, badgeCount = 0, locked = false) {
    const dot = badgeCount > 0
      ? h('span', { class: 'badge-dot', dataset: { badge: String(badgeCount) } }, String(badgeCount))
      : h('span', { class: 'badge-dot', hidden: true }, '0');
    return h('button', {
      type: 'button',
      class: `hub-ribbon__btn${badgeCount > 0 ? ' has-badge' : ''}${locked ? ' is-coach-locked' : ''}`,
      dataset: locked ? { action, locked: '1' } : { action },
      onClick,
    },
    h('b', {}, title),
    h('small', {}, sub),
    dot);
  }

  function getUnlockedWeaponList() {
    const raw = Array.isArray(save.unlockedWeapons) && save.unlockedWeapons.length
      ? save.unlockedWeapons.filter((w) => WEAPON_IDS.includes(w))
      : [...DEFAULT_UNLOCKED_WEAPONS];
    return raw.length ? raw : [...DEFAULT_UNLOCKED_WEAPONS];
  }

  function getRunWeaponPool() {
    const unlocked = getUnlockedWeaponList();
    const lockedHeroSigs = new Set(
      HERO_IDS.filter((h) => !save.unlockedHeroes.includes(h))
        .map((h) => heroInfo(h).weapon)
        .filter(Boolean),
    );
    const out = new Set(unlocked);
    for (const wid of WEAPON_IDS) {
      if (ACH_WEAPON_SET.has(wid) && !unlocked.includes(wid)) continue;
      if (lockedHeroSigs.has(wid) && !unlocked.includes(wid)) continue;
      out.add(wid);
    }
    return WEAPON_IDS.filter((wid) => out.has(wid));
  }

  // ───────── 原地刷新备战区与舞台铭牌（零画布重建，丝滑切换动画）─────────
  function renderStart(animateSwitch = false) {
    const activeHero = getActiveHero();
    const unlockedWeapons = getUnlockedWeaponList();
    const activeStarter = getHeroStarterWeapon(save, activeHero);
    save.selectedStarterWeapon = activeStarter;
    const isSig = isHeroSignatureWeapon(activeHero, activeStarter);
    const hero = heroInfo(activeHero);
    const skinDef = getSkinDef(getEquippedHeroSkin(save, activeHero), activeHero);
    const vfxDef = getAttackVfxDef(getEquippedAttackVfx(save));

    // 1. 舞台浮层人物铭牌 + 换装标签 + 本命专精徽章
    const sigBadge = isSig
      ? h('div', { class: 'signature-badge' },
        h('i', { class: 'stamp stamp--xs' }, '本'),
        h('span', {}, '本命专精 · 伤+25% 速+10% 域+15%'))
      : h('div', { class: 'signature-badge is-hidden', hidden: true });

    clear(heroSpotlightEl).append(
      h('div', { class: 'hero-spotlight__top' },
        h('span', { class: 'hero-spotlight__name' }, hero.name),
        h('button', {
          type: 'button',
          class: 'hero-stage__wardrobe',
          onClick: () => guardFeature('market', () => openMarket(activeHero)),
        }, `${skinDef.name} · 换装`)),
      sigBadge,
      h('p', { class: 'hero-spotlight__trait' },
        `绝技「${hero.ultName}」· ${hero.trait}`),
      h('p', { class: 'hero-spotlight__vfx' },
        `${hero.flavor} · ${vfxDef.name}`));

    if (animateSwitch) {
      pulseClass(heroSpotlightEl, 'is-popping', 240);
    }

    // 2. 六守夜人单行精巧头像条
    clear(heroRowEl);
    for (const id of HERO_IDS) {
      const info = heroInfo(id);
      const unlocked = save.unlockedHeroes.includes(id);
      const sel = activeHero === id;
      const tile = h('button', {
        type: 'button',
        role: 'radio',
        dataset: { heroId: id },
        'aria-checked': sel ? 'true' : 'false',
        class: `hero-tile${sel ? ' is-on' : ''}${unlocked ? '' : ' is-locked'}`,
        onClick: () => {
          if (!unlocked) {
            const p = heroUnlockProgress(save, id);
            const prog = p ? `（进度 ${p.have}/${p.need}）` : '';
            toast(`未解锁：${info.unlock}${prog}`);
            return;
          }
          if (save.selectedHero === id) return;
          save.selectedHero = id;
          save.selectedStarterWeapon = getHeroStarterWeapon(save, id);
          ctx.persist(false);
          ctx.onProfileChange?.();
          renderStart(true);
          stageCtl?.triggerBurst();
        },
      },
      icon('hero', id, 34, HERO_GLYPH[id]),
      h('span', { class: 'hero-tile__name' }, info.short),
      sel ? h('i', { class: 'stamp stamp--xs hero-tile__stamp' }, '选') : null,
      unlocked ? null : h('i', { class: 'hero-tile__lock' }, '锁'));
      heroRowEl.appendChild(tile);
    }

    // 3. 横向滑动起手兵刃架（本命兵刃与当前已选兵刃置前，切换角色立即可见且永不半截裁切）
    starterHeadSubEl.textContent = isSig
      ? `已携「${weaponName(activeStarter)}」· 本命加成`
      : `已携「${weaponName(activeStarter)}」· 择「${weaponName(hero.weapon)}」享本命`;

    const rawWeaponIds = [
      ...unlockedWeapons,
      ...[...ACH_WEAPON_SET].filter((w) => !unlockedWeapons.includes(w)),
    ];
    const priorityIds = [hero.weapon, activeStarter].filter((w, i, a) => w && rawWeaponIds.includes(w) && a.indexOf(w) === i);
    const displayWeaponIds = [
      ...priorityIds,
      ...rawWeaponIds.filter((w) => !priorityIds.includes(w)),
    ];
    clear(starterGridEl);
    let activeChipEl = null;
    for (const wid of displayWeaponIds) {
      const wUnlocked = unlockedWeapons.includes(wid);
      const picked = wUnlocked && activeStarter === wid;
      const wSig = isHeroSignatureWeapon(activeHero, wid);
      const wName = weaponName(wid, false);
      const chip = h('button', {
        type: 'button',
        role: 'radio',
        disabled: !wUnlocked,
        dataset: { starterWeapon: wid },
        'aria-checked': picked ? 'true' : 'false',
        class: `starter-chip${picked ? ' is-on' : ''}${wSig ? ' is-sig' : ''}${wUnlocked ? '' : ' is-locked'}`,
        onClick: () => {
          if (!wUnlocked) {
            toast('完成守夜功绩即可解锁此秘器');
            return;
          }
          if (setHeroStarterWeapon(save, activeHero, wid)) {
            ctx.persist(false);
            ctx.onProfileChange?.();
            renderStart(true);
            stageCtl?.triggerBurst();
          }
        },
      },
      icon('weapon', wid, 26, wName[0]),
      h('span', { class: 'starter-chip__name' }, wName),
      wSig && wUnlocked ? h('em', { class: 'starter-chip__tag' }, '本命') : null,
      !wUnlocked ? h('em', { class: 'starter-chip__tag is-lock' }, '功绩') : null);
      if (picked) activeChipEl = chip;
      starterGridEl.appendChild(chip);
    }
    if (animateSwitch && activeChipEl) {
      try {
        activeChipEl.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      } catch {}
    }

    // 4. 夜色难度与护身符同排紧凑配置（永远在首屏可见）
    const n = Math.min(save.selectedNight, save.nightUnlocked);
    const nightEl = h('div', { class: 'night' },
      h('button', {
        type: 'button', class: 'night__arrow', 'aria-label': '夜色降一级', disabled: n <= 0,
        onClick: () => { save.selectedNight = Math.max(0, n - 1); ctx.persist(false); renderStart(false); },
      }, '‹'),
      h('div', { class: 'night__mid' },
        h('p', { class: 'night__name' }, nightLabel(n)),
        h('p', { class: 'night__desc' }, nightDesc(n))),
      h('button', {
        type: 'button', class: 'night__arrow', 'aria-label': '夜色升一级', disabled: n >= save.nightUnlocked,
        onClick: () => { save.selectedNight = Math.min(save.nightUnlocked, n + 1); ctx.persist(false); renderStart(false); },
      }, '›'));

    const counts = {};
    for (const c of save.charms) counts[c.relicId] = (counts[c.relicId] || 0) + 1;
    const charmIds = Object.keys(counts);
    if (charmPick && !counts[charmPick]) charmPick = null;
    let charmBtn = null;
    if (charmIds.length) {
      const opts = [null, ...charmIds];
      const idx = opts.indexOf(charmPick);
      charmBtn = h('button', {
        type: 'button',
        class: `charm-pick${charmPick ? ' is-on' : ''}`,
        onClick: () => { charmPick = opts[(idx + 1) % opts.length]; renderStart(false); },
      },
      h('span', { class: 'charm-pick__label' }, '护身符'),
      h('span', { class: 'charm-pick__val' }, charmPick ? `${relicName(charmPick)}×${counts[charmPick]}` : '不带'));
    }

    clear(runBarEl).append(nightEl, charmBtn);
    ensureStage();
  }

  // ───────── 底部固定四项入口（暗漆沉稳风，100% 兼容旧冒烟与 E2E）─────────
  function renderNav() {
    clear(navBox);
    const st = getCheckinState(save, ctx.now());
    const cc = getCodexCounts(save);
    const lkShop = getHubFeatureLock(save, 'shop');
    const lkCodex = getHubFeatureLock(save, 'codex');
    navBox.append(
      navSeal('加点', lkShop.locked ? lkShop.label : '长本事', () => guardFeature('shop', () => openShop()), false, undefined, lkShop.locked),
      navSeal('图鉴', lkCodex.locked ? lkCodex.label : `${cc.have}/${cc.total}`, () => guardFeature('codex', () => openCodex(root, save)), false, '百物谱图鉴', lkCodex.locked),
      navSeal('更簿', st.canClaim ? '可画押' : '签到', () => openCheckin(), st.canClaim),
      navSeal('设置', '杂项', () => openSettings()));
  }
  function navSeal(text, sub, onClick, dot = false, label = undefined, locked = false) {
    return sealButton(h('span', { class: 'nav-seal' }, h('b', {}, text), h('small', {}, sub)), onClick, {
      kind: 'square',
      cls: `hub-dock-btn${dot ? ' has-dot' : ''}${locked ? ' is-coach-locked' : ''}`,
      label,
      dataset: locked ? { locked: '1' } : undefined,
    });
  }

  function refresh() {
    reconcileAchievements(save);
    refreshHeaderAndRibbon();
    renderStart(false);
    renderNav();
  }

  // ───────── 鬼市商铺 ─────────
  function openMarket(initialHero = 'all') {
    return openCosmeticShop(root, {
      save,
      persist: (syncCloud) => {
        ctx.persist(syncCloud);
        refreshHeaderAndRibbon();
      },
      onCosmeticChange: () => {
        ctx.onCosmeticChange?.();
        refresh();
        stageCtl?.triggerBurst();
      },
      onOpenStatShop: () => openShop(),
      initialHero,
    });
  }

  // ───────── 守夜功绩 ─────────
  function openAchievements() {
    return openAchievementsModal(root, {
      save,
      persist: (syncCloud) => {
        ctx.persist(syncCloud);
        refresh();
      },
      onRewardClaimed: () => {
        ctx.onCosmeticChange?.();
        refresh();
      },
    });
  }

  // ───────── 五更守夜总榜本地荣誉榜（兜底）─────────
  function openLocalLeaderboardFallback() {
    let v;
    let col = 'public';
    const tabBar = h('div', { class: 'seg pause-tabs', role: 'tablist' });
    const bodyBox = h('div', { class: 'lb-local-list' });
    const renderLb = () => {
      clear(tabBar);
      for (const [id, label] of [['public', '全服总榜'], ['friends', '好友榜']]) {
        tabBar.appendChild(h('button', {
          type: 'button',
          role: 'tab',
          dataset: { collection: id },
          'aria-selected': col === id ? 'true' : 'false',
          class: `seg__opt${col === id ? ' is-on' : ''}`,
          onClick: () => { col = id; renderLb(); },
        }, label));
      }
      clear(bodyBox);
      const hist = Array.isArray(save.leaderboard?.history) ? save.leaderboard.history : [];
      bodyBox.appendChild(h('p', { class: 'muted', style: { textAlign: 'center', marginBottom: '8px' } },
        col === 'friends' ? '当前为本机荣誉榜记录（连接 TapTap 后可查看好友排行）' : '本机五更守夜荣誉榜'));
      if (!hist.length) {
        bodyBox.appendChild(h('p', { class: 'dialog-text muted' }, '尚无守夜战绩，出门守过一局即刻登榜。'));
      } else {
        hist.slice(0, 10).forEach((row, idx) => {
          bodyBox.appendChild(h('div', { class: 'shop-row' },
            h('span', { class: 'stamp stamp--sm' }, String(idx + 1)),
            h('div', { class: 'shop-row__main' },
              h('p', { class: 'shop-row__name' }, `${row.daoName || save.daoName} · ${heroInfo(row.heroId).short}`),
              h('p', { class: 'shop-row__flavor' }, `${nightLabel(row.nightLevel || 0)} · 斩祟 ${row.kills} · ${formatTime(row.timeSec)}`)),
            h('b', {}, `${formatCoins(row.score)}分`)));
        });
        applyStagger(bodyBox, '.shop-row', 8);
      }
    };
    renderLb();
    v = veil(root, scroll({
      title: '五更守夜总榜',
      sub: `本机最高 ${formatCoins(save.leaderboard?.bestScore || 0)} 分`,
      cls: 'scroll--dialog scroll--tall leaderboard-modal',
      body: h('div', { class: 'pause-body' }, tabBar, bodyBox),
      footer: [sealButton('合卷回去', () => v.close(), { kind: 'ghost', dataset: { action: 'close-leaderboard' } })],
    }), { onBackdrop: () => v.close() });
  }

  // ───────── 同守五更联机面板占位（兜底）─────────
  function openCoopFallback() {
    let v;
    v = veil(root, scroll({
      title: '同守五更',
      sub: '二至四人结伴巡街 · 倒地画阵互救',
      cls: 'scroll--dialog coop-modal',
      body: h('p', { class: 'dialog-text' }, '同守五更联机更房筹备就绪，可邀道友共御长夜。'),
      footer: [sealButton('合卷回去', () => v.close(), { kind: 'ghost', dataset: { action: 'close-coop' } })],
    }), { onBackdrop: () => v.close() });
  }

  // ───────── 加点（更房 8 项 + 鬼市商铺互通入口）─────────
  function openShop() {
    let v;
    const list = h('div', { class: 'shop-list' });
    const head = h('div', { class: 'shop-coins shop-coins--bar' });
    const render = (stagger = false) => {
      clear(head).append(
        coinTag(save.coins, true),
        h('button', {
          type: 'button',
          class: 'link-btn shop-market-link',
          dataset: { action: 'open-market' },
          onClick: () => {
            v?.close({ instant: true });
            ctx.onCloudFlush?.();
            openMarket(getActiveHero());
          },
        }, '前往鬼市衣冠 ›'),
      );
      clear(list);
      for (const it of getShopItems()) {
        const lv = getLevel(save, it.id);
        const cost = nextCost(save, it.id);
        const copy = SHOP_COPY[it.id] || {};
        const pips = h('span', { class: 'pips', 'aria-label': `${lv}/${it.maxLevel} 级` },
          Array.from({ length: it.maxLevel }, (_, i) => h('i', { class: i < lv ? 'is-on' : '' })));
        const cur = lv > 0 ? describeLevel(it.id, lv) : '';
        const nxt = lv < it.maxLevel ? describeLevel(it.id, lv + 1) : '';
        const effect = !cur ? (it.desc || '')
          : nxt && nxt !== cur ? `现 ${cur} → 下级 ${nxt.replace(/^\S+\s*/, '')}` : `现 ${cur}`;
        const row = h('div', { class: 'shop-row' },
          h('div', { class: 'shop-row__main' },
            h('p', { class: 'shop-row__name' }, it.name || copy.name || it.id, pips),
            h('p', { class: 'shop-row__flavor' }, copy.flavor || ''),
            h('p', { class: 'shop-row__eff' }, effect)),
          cost === null
            ? h('span', { class: 'stamp stamp--sm' }, '满')
            : sealButton(h('span', { class: 'buy' }, h('b', {}, '升'), h('small', {}, String(cost))), () => {
              const r = buyLevel(save, it.id);
              if (!r.ok) { toast(r.reason === 'coins' ? `铜钱不够，还差 ${cost - save.coins}` : '已经满了'); return; }
              ctx.persist(true);
              toast(`${it.name || copy.name}升到${cnNum(r.level)}级`);
              render(false);
              refresh();
            }, { kind: 'small', disabled: save.coins < cost, label: `${it.name} 升级，${cost} 铜钱` }));
        list.appendChild(row);
      }
      if (stagger) applyStagger(list, '.shop-row', 8);
    };
    const closeShop = () => {
      v?.close();
      ctx.onCloudFlush?.();
    };
    render(true);
    v = veil(root, scroll({
      title: '加点',
      sub: '花铜钱，长本事，一辈子都在',
      cls: 'scroll--dialog scroll--tall',
      body: [head, list],
      footer: [sealButton('回去', closeShop, { kind: 'ghost', dataset: { action: 'close-modal' } })],
    }), { onBackdrop: closeShop });
  }

  // ───────── 更簿 ─────────
  function openCheckin() {
    let v;
    const body = h('div', { class: 'checkin' });
    const foot = h('div', { class: 'checkin-foot' });
    const render = (stagger = false) => {
      const st = getCheckinState(save, ctx.now());
      clear(body);
      const grid = h('div', { class: 'checkin-grid' });
      for (const r of st.rewards) {
        const lines = [];
        if (r.coins) lines.push(`铜钱 ${r.coins}`);
        if (r.charms) lines.push('护身符');
        if (r.cosmetic) lines.push(r.cosmeticItem ? r.cosmeticItem.name : '铜钱 150');
        const cell = h('div', {
          class: `checkin-cell${r.claimed ? ' is-claimed' : ''}${r.current ? ' is-current' : ''}${r.cosmetic ? ' is-big' : ''}`,
        },
        h('span', { class: 'checkin-cell__day' }, `第${cnNum(r.day)}日`),
        h('span', { class: 'checkin-cell__gift' }, lines.map((t) => h('span', {}, t))),
        r.claimed ? h('i', { class: 'stamp stamp--sm checkin-cell__stamp' }, '押') : null);
        grid.appendChild(cell);
      }
      if (stagger) applyStagger(grid, '.checkin-cell', 7);
      body.append(grid, h('p', { class: 'checkin-note' },
        st.rollback ? `簿上记着 ${save.checkin.lastClaimDate}，比今天还晚。等日子走到了再来。`
          : st.claimedToday ? '今日已画押，明日再来。'
            : '断了不要紧，下回接着往下记。'));

      clear(foot);
      if (st.canClaim) {
        const claim = (doubled) => {
          const r = claimCheckin(save, ctx.now(), doubled);
          if (!r.ok) { toast('今日领不了'); return; }
          ctx.persist(true);
          toast(rewardText(r), 2600);
          render(false);
          refresh();
        };
        foot.appendChild(sealButton('画押领取', () => claim(false)));
        if (canShowCheckinDouble(ctx.adsOn(), st)) {
          foot.appendChild(adButton('看广告 · 双倍领取', async () => {
            const res = await ctx.runAd('checkinDouble');
            if (res === 'completed') claim(true);
          }));
        }
      }
      foot.appendChild(sealButton('回去', () => { v.close(); ctx.onCloudFlush?.(); }, { kind: 'ghost', dataset: { action: 'close-modal' } }));
    };
    render(true);
    v = veil(root, scroll({
      title: '更簿',
      sub: '七日一轮，第七日有好东西',
      cls: 'scroll--dialog',
      body,
      footer: [foot],
    }), { onBackdrop: () => { v.close(); ctx.onCloudFlush?.(); } });
  }

  function rewardText(r) {
    const parts = [];
    if (r.coins) parts.push(`铜钱 ${r.coins}`);
    const counts = {};
    for (const c of r.charms) counts[c.relicId] = (counts[c.relicId] || 0) + 1;
    for (const [id, k] of Object.entries(counts)) parts.push(`${CHARM_LABEL(id)}${k > 1 ? ' ×' + k : ''}`);
    if (r.cosmetic) parts.push(r.cosmetic.name);
    return `领到 ${parts.join('、')}${r.doubled ? '（双倍）' : ''}`;
  }

  // ───────── 设置（含 TapTap 云存档 v3）─────────
  function openSettings() {
    let v;
    const cloudBox = h('div', { class: 'cloud-box' });

    const renderCloud = () => {
      clear(cloudBox);
      const st = ctx.cloudState?.() || { available: false };
      let desc = '本机已自动保存 · 在 TapTap 客户端打开可跨设备云同步';
      if (st.available) {
        if (st.syncing) desc = '正在与 TapTap 云端同步……';
        else if (st.dirty && st.cooldownSec > 0) desc = `本机已存 · 约 ${st.cooldownSec} 秒后自动同步至云端`;
        else if (st.lastError) desc = '云端暂忙，本机存档完好，可稍后再试';
        else if (st.lastSyncAt > 0 || st.lastUploadAt > 0) desc = '已连接 TapTap 云存档 · v3 进度已同步';
        else desc = '已连接 TapTap 云存档 · 换设备也能接着守';
      }
      cloudBox.appendChild(h('p', { class: 'cloud-box__title' }, '云存档'));
      cloudBox.appendChild(h('p', { class: 'cloud-box__desc' }, desc));
      if (st.available) {
        cloudBox.appendChild(h('div', { class: 'cloud-box__btns' },
          sealButton('上传云端', async () => {
            await ctx.onCloudUpload?.();
            renderCloud();
            refreshHeaderAndRibbon();
          }, { kind: 'small', disabled: st.syncing }),
          sealButton('拉取云端', async () => {
            await ctx.onCloudPull?.();
            renderCloud();
            refresh();
          }, { kind: 'ghost', cls: 'btn--small', disabled: st.syncing })));
      }
    };
    renderCloud();
    if (ctx.onCloudFlush) {
      Promise.resolve(ctx.onCloudFlush()).then(() => {
        if (cloudBox.isConnected) renderCloud();
        refreshHeaderAndRibbon();
      });
    }

    v = veil(root, scroll({
      title: '设置',
      cls: 'scroll--dialog',
      body: [
        settingsBody({ ...save.settings }, (s) => { ctx.onSettings(s); }),
        h('div', { class: 'ink-rule ink-rule--thin', 'aria-hidden': 'true' }),
        cloudBox,
        h('div', { class: 'settings-links' },
          h('button', { type: 'button', class: 'link-btn', onClick: () => showPrivacyDialog(root) }, '隐私政策'),
          h('button', { type: 'button', class: 'link-btn', onClick: () => showAgeDialog(root) }, '适龄提示 12+')),
      ],
      footer: [sealButton('好了', () => v.close(), { dataset: { action: 'close-modal' } })],
    }), { onBackdrop: () => v.close() });
  }

  refresh();
  return {
    el,
    refresh,
    teardown: destroyStage,
    openCheckin,
    openShop,
    openMarket,
    openAchievements,
    openCodex: () => openCodex(root, save),
  };
}
