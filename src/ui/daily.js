// 每日差事与周赏供盒木版画弹窗（v4 M3.1）
import { h, clear, scroll, sealButton, adButton, veil, toast, formatCoins } from './dom.js';
import { applyStagger } from './motion.js';
import { CHARM_LABEL } from './copy.js';
import {
  claimDailyTask,
  claimWeeklyChest,
  getDailyState,
  syncDailyReset,
} from '../meta/daily.js';

const COIN_SVG = `<svg viewBox="0 0 16 16" class="coin-ico" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.9" y="5.9" width="4.2" height="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

function formatChestToast(res) {
  const parts = [];
  if (res.coins > 0) parts.push(`铜钱 ${formatCoins(res.coins)}`);
  if (Array.isArray(res.charms) && res.charms.length > 0) {
    const counts = {};
    for (const c of res.charms) counts[c.relicId] = (counts[c.relicId] || 0) + 1;
    for (const [id, k] of Object.entries(counts)) {
      parts.push(`${CHARM_LABEL(id)}${k > 1 ? ` ×${k}` : ''}`);
    }
  }
  if (res.cosmetic) parts.push(res.cosmetic.name);
  if (res.seasonXp > 0) parts.push(`令火 +${res.seasonXp}`);
  return `开启供盒：${parts.join('、')}${res.doubled ? '（铜钱双倍）' : ''}`;
}

/**
 * 打开「每日差事」与「周赏供盒」弹窗。
 * opts: { save, now(), adsOn?(), runAd?(placement), persist(syncCloud), onRewardClaimed?(), onOpenChallenge?(), onClose?() }
 */
export function openDailyModal(root, opts = {}) {
  const {
    save,
    now = () => new Date(),
    adsOn = () => false,
    runAd = null,
    persist = () => {},
    onRewardClaimed = null,
    onOpenChallenge = null,
  } = opts;

  syncDailyReset(save, now());

  let v = null;
  const weeklyBox = h('section', { class: 'daily-weekly', 'aria-label': '周赏供盒' });
  const taskListBox = h('section', { class: 'daily-tasks', 'aria-label': '今日差事' });
  const topBannerBox = h('div', { class: 'daily-top-banner' });

  function render(stagger = false) {
    const st = getDailyState(save, now());

    clear(topBannerBox);
    if (typeof onOpenChallenge === 'function') {
      topBannerBox.appendChild(h('div', { class: 'daily-jump-bar' },
        h('span', { class: 'daily-jump-bar__txt' }, `今日更簿 · ${st.today}`),
        h('button', {
          type: 'button',
          class: 'link-btn daily-jump-bar__btn',
          dataset: { action: 'jump-daily-challenge' },
          onClick: () => {
            closeModal();
            onOpenChallenge();
          },
        }, '今日异事挑战 ›')));
    } else {
      topBannerBox.appendChild(h('p', { class: 'daily-date-line muted' }, `今日更簿 · ${st.today}`));
    }

    // 1. 周赏供盒进度条与四档供盒
    clear(weeklyBox);
    const pct = Math.min(100, Math.round((st.weeklyPoints / st.weeklyMax) * 100));
    const chestRow = h('div', { class: 'weekly-chest-grid' });
    for (const c of st.chests) {
      const giftTxt = c.cosmetic
        ? (c.cosmeticItem ? c.cosmeticItem.name : `${c.coins + 150}钱`)
        : `${c.coins}钱·符×${c.charms}`;
      const doClaimChest = (doubled = false) => {
        const res = claimWeeklyChest(save, c.points, now(), { doubled });
        if (!res.ok) {
          toast('供盒尚不可开启');
          return;
        }
        persist(true);
        onRewardClaimed?.(res);
        toast(formatChestToast(res), 2600);
        render(false);
      };

      let actNode = null;
      if (c.claimed) {
        actNode = h('span', { class: 'stamp stamp--xs weekly-chest__stamp' }, '领');
      } else if (c.canClaim) {
        actNode = h('button', {
          type: 'button',
          class: 'btn btn--seal btn--small weekly-chest__btn',
          dataset: { action: 'claim-weekly-chest', points: String(c.points) },
          onClick: () => doClaimChest(false),
        }, '开启');
      } else {
        actNode = h('span', { class: 'weekly-chest__need' }, `${c.points}分`);
      }

      chestRow.appendChild(h('div', {
        class: `weekly-chest${c.claimed ? ' is-claimed' : ''}${c.canClaim ? ' is-ready' : ''}`,
        dataset: { weeklyChest: String(c.points) },
      },
      h('span', { class: 'weekly-chest__title' }, c.name),
      h('span', { class: 'weekly-chest__gift' }, giftTxt),
      actNode));
    }

    weeklyBox.append(
      h('div', { class: 'daily-weekly__head' },
        h('span', { class: 'daily-weekly__title' }, '周赏供盒'),
        h('span', { class: 'daily-weekly__pts' }, `本周积分 ${st.weeklyPoints}/${st.weeklyMax} · 周一刷新`)),
      h('div', { class: 'ach-bar daily-weekly__bar' },
        h('i', { class: 'ach-bar__fill', style: { width: `${pct}%` } })),
      chestRow,
    );

    // 2. 今日三条差事
    clear(taskListBox);
    if (st.rollback) {
      taskListBox.appendChild(h('p', { class: 'lb-notice__text muted' }, '簿上记着上次日期比今天还晚，待日子走到了再来领赏。'));
    }
    for (const t of st.tasks) {
      const barPct = Math.min(100, Math.round((t.have / Math.max(1, t.need)) * 100));
      const doClaimTask = (doubled = false) => {
        const res = claimDailyTask(save, t.id, now(), { doubled });
        if (!res.ok) {
          toast('差事尚未达成');
          return;
        }
        persist(true);
        onRewardClaimed?.(res);
        toast(`领赏：铜钱 ${res.coins} · 周分 +${res.weeklyPointsAdded} · 令火 +${res.seasonXp}`);
        render(false);
      };

      const actBox = h('div', { class: 'daily-task__act' });
      if (t.claimed) {
        actBox.appendChild(h('span', { class: 'stamp stamp--sm' }, '押'));
      } else if (t.canClaim) {
        actBox.appendChild(sealButton('领赏', () => doClaimTask(false), {
          kind: 'small',
          dataset: { action: 'claim-daily-task', taskId: t.id },
        }));
        if (adsOn() && typeof runAd === 'function') {
          actBox.appendChild(adButton('双倍', async () => {
            const adRes = await runAd('dailyTaskDouble');
            if (adRes === 'completed') doClaimTask(true);
          }, { cls: 'btn--small daily-ad-btn' }));
        }
      } else {
        actBox.appendChild(h('span', { class: 'daily-task__prog-tag' }, `${t.have}/${t.need}`));
      }

      taskListBox.appendChild(h('div', {
        class: `shop-row daily-task${t.claimed ? ' is-claimed' : ''}${t.canClaim ? ' is-ready' : ''}`,
        dataset: { taskId: t.id },
      },
      h('div', { class: 'shop-row__main' },
        h('p', { class: 'shop-row__name' }, t.name),
        h('p', { class: 'shop-row__flavor' }, t.desc),
        h('div', { class: 'daily-task__rewards' },
          h('span', { class: 'daily-reward-chip' }, h('span', { html: COIN_SVG }), h('b', {}, String(t.coins))),
          h('span', { class: 'daily-reward-chip' }, `周分 +${t.weeklyPoints}`),
          h('span', { class: 'daily-reward-chip' }, `令火 +${t.seasonXp}`)),
        h('div', { class: 'ach-bar daily-task__bar' },
          h('i', { class: 'ach-bar__fill', style: { width: `${barPct}%` } }))),
      actBox));
    }

    if (stagger) applyStagger(taskListBox, '.daily-task', 6);
  }

  function closeModal() {
    v?.close();
    opts.onClose?.();
  }

  render(true);
  v = veil(root, scroll({
    title: '每日差事',
    sub: '日清三件巡街务 · 积攒周分启供盒',
    cls: 'scroll--dialog scroll--tall daily-modal',
    body: h('div', { class: 'daily-body' }, topBannerBox, weeklyBox, taskListBox),
    footer: [sealButton('合卷回去', closeModal, { kind: 'ghost', cls: 'btn--wide', dataset: { action: 'close-daily' } })],
  }), { onBackdrop: closeModal });

  return { close: closeModal, refresh: () => render(false) };
}
