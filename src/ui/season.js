// 守夜令 30 档通行证与「血月守夜」开关木版画弹窗（v4 M3.3）
import { h, clear, scroll, sealButton, veil, toast, formatCoins } from './dom.js';
import { applyStagger } from './motion.js';
import { SEASON_TITLES } from '../meta/season-config.js';
import {
  claimAllSeasonTiers,
  claimSeasonTier,
  equipBloodmoonSkinIfOwned,
  equipSeasonTitle,
  getSeasonState,
  setSeasonRuleActive,
} from '../meta/season.js';
import { getEquippedHeroSkin, isCosmeticOwned } from '../meta/cosmetics.js';

/**
 * 打开「守夜令」弹窗。
 * opts: { save, now(), persist(syncCloud), onSeasonChange?(), onOpenBoard?(), onClose?() }
 */
export function openSeasonModal(root, opts = {}) {
  const {
    save,
    now = () => new Date(),
    persist = () => {},
    onSeasonChange = null,
    onOpenBoard = null,
  } = opts;

  let v = null;
  const headerCard = h('section', { class: 'season-head-card' });
  const ruleCard = h('section', { class: 'season-rule-card' });
  const titleBar = h('section', { class: 'season-title-bar' });
  const tierListBox = h('section', { class: 'season-tier-list', 'aria-label': '守夜令三十档赏格' });
  const claimAllWrap = h('div', { class: 'season-foot-actions' });

  function render(stagger = false) {
    const st = getSeasonState(save, now());
    const pct = Math.min(100, Math.round((st.tierProgressXp / st.xpPerTier) * 100));

    // 1. 顶部令火与三十档总览 + 第 30 档「老周·血月」预览提示
    clear(headerCard);
    const skinOwned = isCosmeticOwned(save, 'zhou_bloodmoon');
    const skinEq = getEquippedHeroSkin(save, 'zhou') === 'zhou_bloodmoon';
    headerCard.append(
      h('div', { class: 'season-head-card__top' },
        h('div', {},
          h('span', { class: 'season-badge' }, `守夜令 · ${st.season.name}`),
          h('p', { class: 'season-sub' }, `${st.season.subtitle} · 剩余 ${st.season.daysLeft} 日`)),
        h('div', { class: 'season-tier-num' },
          h('b', {}, `${st.currentTier}`),
          h('small', {}, `/${st.maxTier}档`))),
      h('div', { class: 'ach-bar season-xp-bar' },
        h('i', { class: 'ach-bar__fill', style: { width: `${pct}%` } })),
      h('div', { class: 'season-head-card__foot' },
        h('span', {}, `令火 ${formatCoins(st.xp)}（当前档 ${st.tierProgressXp}/${st.xpPerTier}）`),
        skinOwned
          ? h('button', {
            type: 'button',
            class: 'link-btn',
            dataset: { action: 'equip-bloodmoon-skin' },
            disabled: skinEq,
            onClick: () => {
              const r = equipBloodmoonSkinIfOwned(save);
              if (r.ok) {
                persist(false);
                onSeasonChange?.();
                toast('已为老周披上「老周·血月」');
                render(false);
              }
            },
          }, skinEq ? '已穿戴「老周·血月」' : '立即穿戴「老周·血月」›')
          : h('span', { class: 'season-final-hint' }, '三十档满赠限定衣冠「老周·血月」')),
    );

    // 2. 「血月守夜」可选规则开关（关闭时主线零影响）
    clear(ruleCard);
    const rule = st.season.rule || {};
    ruleCard.append(
      h('div', { class: 'season-rule-card__main' },
        h('p', { class: 'season-rule-card__title' }, `${rule.name || '血月守夜'}（自选开启）`),
        h('p', { class: 'season-rule-card__desc' }, `${rule.desc || ''} · 关闭时寻常守夜不受影响`)),
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': st.activeRule ? 'true' : 'false',
        dataset: { action: 'toggle-season-rule' },
        class: `btn ${st.activeRule ? 'btn--seal' : 'btn--ghost'} btn--small season-rule-toggle`,
        onClick: () => {
          const next = setSeasonRuleActive(save, !st.activeRule, now());
          persist(false);
          onSeasonChange?.();
          toast(next ? '已开启「血月守夜」：出更令火与积分加成生效' : '已切回寻常守夜');
          render(false);
        },
      }, st.activeRule ? '血月已开' : '开启血月'),
    );

    // 3. 已获名号佩戴栏
    clear(titleBar);
    if (st.ownedTitles.length > 0) {
      const chips = [
        h('button', {
          type: 'button',
          class: `starter-chip season-title-chip${!st.selectedTitle ? ' is-on' : ''}`,
          dataset: { titleId: '' },
          onClick: () => {
            equipSeasonTitle(save, '', now());
            persist(false);
            onSeasonChange?.();
            render(false);
          },
        }, h('span', { class: 'starter-chip__name' }, '无名号')),
        ...st.ownedTitles.map((tid) => h('button', {
          type: 'button',
          class: `starter-chip season-title-chip${st.selectedTitle === tid ? ' is-on' : ''}`,
          dataset: { titleId: tid },
          onClick: () => {
            equipSeasonTitle(save, tid, now());
            persist(false);
            onSeasonChange?.();
            toast(`已启用名号「${SEASON_TITLES[tid]?.name || tid}」`);
            render(false);
          },
        }, h('span', { class: 'starter-chip__name' }, SEASON_TITLES[tid]?.name || tid))),
      ];
      titleBar.hidden = false;
      titleBar.append(h('span', { class: 'season-title-bar__label' }, '当用名号：'), ...chips);
    } else {
      titleBar.hidden = true;
    }

    // 4. 30 档全部免费赏格列表
    clear(tierListBox);
    for (const row of st.tiers) {
      let rightNode = null;
      if (row.claimed) {
        rightNode = h('span', { class: 'stamp stamp--xs' }, '领');
      } else if (row.canClaim) {
        rightNode = sealButton('领取', () => {
          const res = claimSeasonTier(save, row.tier, now());
          if (!res.ok) return;
          persist(true);
          onSeasonChange?.();
          toast(`领得第 ${row.tier} 档：${row.name}`);
          render(false);
        }, {
          kind: 'small',
          dataset: { action: 'claim-season-tier', tier: String(row.tier) },
        });
      } else {
        rightNode = h('span', { class: 'season-tier__lock' }, `${row.tier * st.xpPerTier}火`);
      }

      tierListBox.appendChild(h('div', {
        class: `shop-row season-tier${row.milestone ? ' is-milestone' : ''}${row.canClaim ? ' is-ready' : ''}${row.claimed ? ' is-claimed' : ''}`,
        dataset: { seasonTier: String(row.tier) },
      },
      h('span', { class: `stamp stamp--sm${row.milestone ? '' : ' stamp--ink'}` }, String(row.tier)),
      h('div', { class: 'shop-row__main' },
        h('p', { class: 'shop-row__name' }, row.name),
        h('p', { class: 'shop-row__flavor' }, row.milestone ? '五档重赏 · 典藏好物' : '守夜令免费赏格')),
      rightNode));
    }

    clear(claimAllWrap);
    if (st.claimableCount > 1) {
      claimAllWrap.appendChild(sealButton(`一键领完 ${st.claimableCount} 档`, () => {
        const res = claimAllSeasonTiers(save, now());
        if (res.ok) {
          persist(true);
          onSeasonChange?.();
          toast(`已领完 ${res.claimedCount} 档守夜令赏格`);
          render(false);
        }
      }, { cls: 'btn--wide', dataset: { action: 'claim-all-season' } }));
    }
    if (typeof onOpenBoard === 'function') {
      claimAllWrap.appendChild(sealButton('查看守夜令榜', () => {
        closeModal();
        onOpenBoard();
      }, { kind: 'small', cls: 'btn--wide', dataset: { action: 'open-season-board' } }));
    }

    if (stagger) applyStagger(tierListBox, '.season-tier', 6);
  }

  function closeModal() {
    v?.close();
    opts.onClose?.();
  }

  render(true);
  v = veil(root, scroll({
    title: '守夜令 · 血月',
    sub: '三十档全部免费 · 积令火得「老周·血月」',
    cls: 'scroll--dialog scroll--tall season-modal',
    body: h('div', { class: 'season-body' }, headerCard, ruleCard, titleBar, tierListBox),
    footer: [
      claimAllWrap,
      sealButton('合卷回去', closeModal, { kind: 'ghost', cls: 'btn--wide', dataset: { action: 'close-season' } }),
    ],
  }), { onBackdrop: closeModal });

  return { close: closeModal, refresh: () => render(false) };
}
