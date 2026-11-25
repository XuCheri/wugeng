// 守夜功绩卷轴弹窗（F9：20 项分类功绩、数值进度条、新兵刃/典藏皮肤/玄霜特效/铜钱一键领赏）
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  claimAchievement,
  claimAllAchievements,
  getAchievementProgress,
  getUnclaimedAchievementCount,
  reconcileAchievements,
} from '../meta/achievements.js';
import { applyStagger } from './motion.js';
import { getSkinDef } from '../meta/cosmetics.js';
import { drawHeroWithSkin } from '../render/skins.js';
import { INK, PAPER_SHADE } from '../render/palette.js';
import { clear, formatCoins, h, scroll, sealButton, toast, veil } from './dom.js';
import { icon } from './icons.js';

const COIN_SVG = `<svg viewBox="0 0 16 16" class="coin-ico" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.9" y="5.9" width="4.2" height="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

const achSkinThumbCache = new Map();

function skinRewardBadgeIcon(skinId) {
  if (typeof document === 'undefined') return h('i', { class: 'stamp stamp--sm' }, '衣');
  if (!achSkinThumbCache.has(skinId)) {
    const def = getSkinDef(skinId, 'zhou');
    const c = document.createElement('canvas');
    c.width = 84;
    c.height = 84;
    const g = c.getContext('2d');
    if (g) {
      g.scale(2, 2);
      g.fillStyle = INK;
      g.fillRect(0, 0, 42, 42);
      g.strokeStyle = PAPER_SHADE;
      g.lineWidth = 1;
      g.strokeRect(1, 1, 40, 40);
      drawHeroWithSkin(g, {
        heroId: def.heroId,
        skinId: def.id,
        x: 21,
        y: 36,
        frame: 0,
        scale: 0.68,
        showAura: true,
      });
      achSkinThumbCache.set(skinId, c.toDataURL('image/png'));
      c.width = 0;
      c.height = 0;
    }
  }
  const url = achSkinThumbCache.get(skinId);
  return url
    ? h('img', { class: 'icon', src: url, width: 42, height: 42, alt: '' })
    : h('i', { class: 'stamp stamp--sm' }, '衣');
}

function renderRewardIcon(ach) {
  const rw = ach.reward;
  if (rw.type === 'weapon' && rw.weaponId) {
    return icon('weapon', rw.weaponId, 42, '剑');
  }
  if (rw.type === 'skin' && rw.skinId) {
    return skinRewardBadgeIcon(rw.skinId);
  }
  if (rw.type === 'vfx') {
    return h('i', { class: 'stamp stamp--sm' }, '芒');
  }
  return icon('coin', 'coin', 38, '赏');
}

export function openAchievementsModal(root, { save, persist, onRewardClaimed } = {}) {
  reconcileAchievements(save);
  let activeCat = 'all';

  const summaryBar = h('div', { class: 'ach-head' });
  const catBar = h('div', { class: 'ach-tabs', role: 'tablist', 'aria-label': '守夜功绩分类' });
  const listBox = h('div', { class: 'ach-list' });
  const rowMap = new Map();

  function formatRewardToast(rw) {
    if (!rw) return '已领功绩赏格';
    return `功绩领赏：${rw.label}`;
  }

  function ensureRow(ach) {
    let entry = rowMap.get(ach.id);
    if (entry) return entry;

    const progText = h('span', { class: 'ach-row__nums' });
    const barFill = h('i', { class: 'ach-bar__fill', dataset: { progressFill: '1' } });
    const barTrack = h('div', {
      class: 'ach-bar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(ach.target),
    }, barFill);
    const actHolder = h('div', { class: 'ach-row__act' });

    const ds = { achievementId: ach.id, category: ach.category };
    if (ach.reward.type === 'weapon' && ach.reward.weaponId) {
      ds.rewardWeapon = ach.reward.weaponId;
    }
    if (ach.reward.type === 'skin' && ach.reward.skinId) {
      ds.rewardSkin = ach.reward.skinId;
    }

    const row = h('div', {
      class: 'achievement-row',
      dataset: ds,
    },
    h('div', { class: 'ach-row__ico' }, renderRewardIcon(ach)),
    h('div', { class: 'ach-row__main' },
      h('p', { class: 'ach-row__title' },
        h('b', { class: 'ach-row__name' }, ach.name),
        h('span', { class: `ach-reward ach-reward--${ach.reward.type}` }, ach.reward.label)),
      h('p', { class: 'ach-row__desc' }, ach.desc),
      h('div', { class: 'ach-row__prog' }, barTrack, progText)),
    actHolder);

    entry = { ach, row, progText, barTrack, barFill, actHolder };
    rowMap.set(ach.id, entry);
    return entry;
  }

  function syncRow(entry) {
    const { ach, row, progText, barTrack, barFill, actHolder } = entry;
    const st = getAchievementProgress(save, ach.id);
    const pct = Math.min(100, Math.max(0, st.ratio * 100));

    row.classList.toggle('is-unlocked', st.unlocked);
    row.classList.toggle('is-claimed', st.claimed);
    row.classList.toggle('is-claimable', st.claimable);

    barTrack.setAttribute('aria-valuenow', String(Math.min(st.current, st.target)));
    barFill.style.width = `${pct.toFixed(1)}%`;
    progText.textContent = `${st.current} / ${st.target}`;

    clear(actHolder);
    if (st.claimed) {
      actHolder.appendChild(h('i', { class: 'stamp stamp--sm' }, '已领'));
    } else if (st.claimable) {
      actHolder.appendChild(h('button', {
        type: 'button',
        class: 'btn btn--seal btn--small ach-claim-btn',
        dataset: { action: 'claim-achievement', achievementId: ach.id },
        onClick: () => {
          const res = claimAchievement(save, ach.id);
          if (!res.ok) return;
          persist?.(true);
          onRewardClaimed?.(res);
          toast(formatRewardToast(res.reward));
          refreshAll();
        },
      }, '领赏'));
    } else {
      actHolder.appendChild(h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--small ach-claim-btn',
        disabled: true,
      }, '未达成'));
    }
  }

  function renderSummaryAndTabs() {
    const unlockedCnt = ACHIEVEMENTS.filter((a) => getAchievementProgress(save, a.id).unlocked).length;
    const unclaimedCnt = getUnclaimedAchievementCount(save);

    clear(summaryBar);
    summaryBar.append(
      h('div', { class: 'ach-head__meta' },
        h('span', { class: 'ach-head__stat' }, `已达成 ${unlockedCnt} / ${ACHIEVEMENTS.length}`),
        h('span', { class: 'coin-tag coin-tag--sm' },
          h('span', { html: COIN_SVG }),
          h('b', {}, formatCoins(save.coins)))),
      h('button', {
        type: 'button',
        class: `btn ${unclaimedCnt > 0 ? 'btn--seal' : 'btn--ghost'} btn--small`,
        disabled: unclaimedCnt <= 0,
        dataset: { action: 'claim-all' },
        onClick: () => {
          const res = claimAllAchievements(save);
          if (!res.ok) return;
          persist?.(true);
          onRewardClaimed?.(res);
          const parts = [];
          if (res.weaponsUnlocked.length) parts.push(`新兵刃 ×${res.weaponsUnlocked.length}`);
          if (res.cosmeticsUnlocked.length) parts.push(`典藏外观 ×${res.cosmeticsUnlocked.length}`);
          if (res.coinsGained > 0) parts.push(`铜钱 +${res.coinsGained}`);
          toast(`一键领赏：${parts.join(' · ') || `${res.claimed.length} 项功绩`}`);
          refreshAll();
        },
      }, unclaimedCnt > 0 ? `一键领赏 (${unclaimedCnt})` : '暂无可领'),
    );

    clear(catBar);
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      catBar.appendChild(h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': activeCat === cat.id ? 'true' : 'false',
        class: `ach-tab${activeCat === cat.id ? ' is-on' : ''}`,
        dataset: { achTab: cat.id },
        onClick: () => {
          activeCat = cat.id;
          renderSummaryAndTabs();
          mountRows();
          listBox.scrollTop = 0;
        },
      }, cat.label));
    }
  }

  function mountRows() {
    clear(listBox);
    const items = activeCat === 'all'
      ? ACHIEVEMENTS
      : ACHIEVEMENTS.filter((a) => a.category === activeCat);
    for (const ach of items) {
      const entry = ensureRow(ach);
      syncRow(entry);
      listBox.appendChild(entry.row);
    }
    applyStagger(listBox, '.achievement-row', 8);
  }

  function refreshAll() {
    renderSummaryAndTabs();
    for (const entry of rowMap.values()) syncRow(entry);
  }

  for (const ach of ACHIEVEMENTS) ensureRow(ach);
  renderSummaryAndTabs();
  mountRows();

  let v = null;
  const panel = scroll({
    title: '守夜功绩',
    sub: '记守夜苦劳 · 赏道门秘器与重彩衣冠',
    cls: 'scroll--dialog scroll--tall achievements-modal',
    body: h('div', { class: 'ach-body' }, summaryBar, catBar, listBox),
    footer: [
      sealButton('合卷回去', () => v?.close(), {
        kind: 'ghost',
        dataset: { action: 'close-achievements' },
      }),
    ],
  });

  v = veil(root, panel, { onBackdrop: () => v?.close() });
  return { el: v.el, close: () => v?.close(), refresh: refreshAll };
}
