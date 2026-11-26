// 每日差事与周赏供盒木版画弹窗（v4 M3.1）
import { h, clear, scroll, sealButton, adButton, veil, toast, formatCoins } from './dom.js';
import { applyStagger } from './motion.js';
import { CHARM_LABEL, heroInfo, weaponName } from './copy.js';
import { icon } from './icons.js';
import {
  claimDailyTask,
  claimWeeklyChest,
  getDailyState,
  syncDailyReset,
} from '../meta/daily.js';
import { getDailyChallengeState } from '../meta/daily-challenge.js';

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

    // 0. 顶部：今日异事入口（整条可点，不再显示日期等无用信息）
    clear(topBannerBox);
    topBannerBox.hidden = typeof onOpenChallenge !== 'function';
    if (typeof onOpenChallenge === 'function') {
      const dc = getDailyChallengeState(save, now());
      topBannerBox.appendChild(h('button', {
        type: 'button',
        class: `daily-jump-bar${dc.canEarnFirstReward ? ' has-reward' : ''}`,
        dataset: { action: 'jump-daily-challenge' },
        onClick: () => {
          closeModal();
          onOpenChallenge();
        },
      },
      h('i', { class: 'stamp stamp--xs' }, '异'),
      h('span', { class: 'daily-jump-bar__txt' },
        h('b', {}, '今日异事'),
        h('small', {}, dc.canEarnFirstReward ? `首胜奖励 ${dc.firstReward.coins} 铜钱` : '再战一局冲击排行')),
      h('span', { class: 'daily-jump-bar__btn' }, '去挑战 ›')));
    }

    // 1. 周赏供盒：积分进度条（含四档刻度）+ 四档供盒
    clear(weeklyBox);
    const pct = Math.min(100, Math.round((st.weeklyPoints / st.weeklyMax) * 100));
    const chestRow = h('div', { class: 'weekly-chest-grid' });
    const ticks = h('div', { class: 'weekly-bar__ticks', 'aria-hidden': 'true' });
    for (const c of st.chests) {
      const giftTxt = c.cosmetic
        ? [c.cosmeticItem ? c.cosmeticItem.name : `${c.coins + 150} 铜钱`]
        : [`${c.coins} 铜钱`, h('br'), `护身符×${c.charms}`];
      const doClaimChest = (doubled = false) => {
        const res = claimWeeklyChest(save, c.points, now(), { doubled });
        if (!res.ok) {
          toast('积分还不够，再完成几个差事');
          return;
        }
        persist(true);
        onRewardClaimed?.(res);
        toast(formatChestToast(res), 2600);
        render(false);
      };

      let actNode = null;
      if (c.claimed) {
        actNode = h('span', { class: 'weekly-chest__done' }, '已领取');
      } else if (c.canClaim) {
        actNode = h('button', {
          type: 'button',
          class: 'btn btn--seal btn--small weekly-chest__btn',
          dataset: { action: 'claim-weekly-chest', points: String(c.points) },
          onClick: () => doClaimChest(false),
        }, '开启');
      } else {
        actNode = h('span', { class: 'weekly-chest__need' }, `${c.points} 分`);
      }

      chestRow.appendChild(h('div', {
        class: `weekly-chest${c.claimed ? ' is-claimed' : ''}${c.canClaim ? ' is-ready' : ''}`,
        dataset: { weeklyChest: String(c.points) },
      },
      h('span', { class: 'weekly-chest__title' }, c.name),
      h('span', { class: 'weekly-chest__gift' }, ...giftTxt),
      actNode));

      const tickPct = Math.min(100, (c.points / st.weeklyMax) * 100);
      ticks.appendChild(h('i', {
        class: `weekly-bar__tick${st.weeklyPoints >= c.points ? ' is-reached' : ''}`,
        style: { left: `${tickPct}%` },
      }));
    }

    weeklyBox.append(
      h('div', { class: 'daily-weekly__head' },
        h('span', { class: 'daily-weekly__title' }, '周赏供盒'),
        h('span', { class: 'daily-weekly__reset muted' }, '每周一重置')),
      h('div', { class: 'weekly-bar' },
        h('div', {
          class: 'weekly-bar__track',
          role: 'progressbar',
          'aria-label': '本周积分',
          'aria-valuemin': '0',
          'aria-valuemax': String(st.weeklyMax),
          'aria-valuenow': String(Math.min(st.weeklyPoints, st.weeklyMax)),
        },
        h('i', { class: 'weekly-bar__fill', style: { width: `${pct}%` } }),
        ticks),
        h('span', { class: 'weekly-bar__num' },
          h('b', {}, String(Math.min(st.weeklyPoints, st.weeklyMax))),
          `/${st.weeklyMax}`)),
      chestRow,
    );

    // 2. 今日三条差事：进度条只反映真实进度；已完成显示「已完成」，可领显示「领取」
    clear(taskListBox);
    taskListBox.appendChild(h('div', { class: 'daily-tasks__head' },
      h('span', { class: 'daily-weekly__title' }, '今日差事'),
      h('span', { class: 'daily-weekly__reset muted' }, `完成 ${st.tasks.filter((t) => t.done).length}/${st.tasks.length}`)));
    if (st.rollback) {
      taskListBox.appendChild(h('p', { class: 'lb-notice__text muted' }, '手机日期有变动，日期恢复后即可领取。'));
    }
    for (const t of st.tasks) {
      const barPct = Math.min(100, Math.round((t.have / Math.max(1, t.need)) * 100));
      const doClaimTask = (doubled = false) => {
        const res = claimDailyTask(save, t.id, now(), { doubled });
        if (!res.ok) {
          toast('差事还没完成');
          return;
        }
        persist(true);
        onRewardClaimed?.(res);
        toast(`领取成功：铜钱 +${res.coins} · 周分 +${res.weeklyPointsAdded} · 令火 +${res.seasonXp}`);
        render(false);
      };

      const actBox = h('div', { class: 'daily-task__act' });
      if (t.claimed) {
        actBox.appendChild(h('span', { class: 'daily-task__done' }, '已完成'));
      } else if (t.canClaim) {
        actBox.appendChild(sealButton('领取', () => doClaimTask(false), {
          kind: 'small',
          dataset: { action: 'claim-daily-task', taskId: t.id },
        }));
        if (adsOn() && typeof runAd === 'function') {
          actBox.appendChild(adButton('双倍', async () => {
            const adRes = await runAd('dailyTaskDouble');
            if (adRes === 'completed') doClaimTask(true);
          }, { cls: 'btn--small daily-ad-btn' }));
        }
      }

      const progRow = t.claimed
        ? null
        : h('div', { class: 'daily-task__prog' },
          h('div', { class: 'ach-bar daily-task__bar' },
            h('i', { class: 'ach-bar__fill', style: { width: `${barPct}%` } })),
          h('span', { class: 'daily-task__prog-tag' }, `${t.have}/${t.need}`));

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
        progRow),
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
    sub: '完成差事攒周分，开启周赏供盒',
    cls: 'scroll--dialog scroll--tall daily-modal',
    body: h('div', { class: 'daily-body' }, topBannerBox, weeklyBox, taskListBox),
    footer: [sealButton('合卷回去', closeModal, { kind: 'ghost', cls: 'btn--wide', dataset: { action: 'close-daily' } })],
  }), { onBackdrop: closeModal });

  return { close: closeModal, refresh: () => render(false) };
}

/**
 * 打开「每日异事」挑战弹窗（全服同日同种子、固定守夜人与起手兵刃、1–2 条异事词条、首局赏银与异事榜入口）。
 * opts: { save, now(), onStartChallenge(spec), onOpenBoard?(), onClose?() }
 */
export function openDailyChallengeModal(root, opts = {}) {
  const {
    save,
    now = () => new Date(),
    onStartChallenge = () => {},
    onOpenBoard = null,
  } = opts;

  let v = null;
  const st = getDailyChallengeState(save, now());
  const hero = heroInfo(st.heroId);
  const wName = weaponName(st.startWeapon, false);
  const mulPct = Math.round((st.runRules?.scoreMul || 1) * 100);

  const heroCard = h('div', { class: 'dc-loadout' },
    h('div', { class: 'dc-loadout__cell' },
      icon('hero', st.heroId, 38, hero.short[0]),
      h('div', { class: 'dc-loadout__meta' },
        h('span', { class: 'dc-loadout__label' }, '当夜执更人'),
        h('b', { class: 'dc-loadout__name' }, hero.name))),
    h('div', { class: 'dc-loadout__cell' },
      icon('weapon', st.startWeapon, 34, wName[0]),
      h('div', { class: 'dc-loadout__meta' },
        h('span', { class: 'dc-loadout__label' }, '指定起手器'),
        h('b', { class: 'dc-loadout__name' }, wName))));

  const rulesBox = h('div', { class: 'dc-rules' },
    h('p', { class: 'dc-rules__head' }, `今日异事规则 · 异事分系数 ${mulPct}%`),
    ...st.rules.map((r) => h('div', { class: 'dc-rule-row', dataset: { ruleId: r.id } },
      h('span', { class: 'stamp stamp--xs' }, '异'),
      h('div', { class: 'dc-rule-row__body' },
        h('b', {}, r.name),
        h('p', {}, r.desc)))));

  const rewardCard = h('div', { class: `dc-reward${st.rewardedToday ? ' is-claimed' : ''}` },
    h('div', { class: 'dc-reward__left' },
      h('span', { class: 'dc-reward__title' }, st.rewardedToday ? '今日首局重赏已入账' : '今日首局出更重赏'),
      h('p', { class: 'dc-reward__desc' }, st.rewardedToday
        ? `今日最高异事分：${formatCoins(st.todayBestScore)} 分（可反复试手刷新排名）`
        : `铜钱 ${st.firstReward.coins} · 周分 +${st.firstReward.weeklyPoints} · 令火 +${st.firstReward.seasonXp}`)),
    st.rewardedToday ? h('span', { class: 'stamp stamp--sm' }, '押') : null);

  function closeModal() {
    v?.close();
    opts.onClose?.();
  }

  const startBtn = sealButton(st.rewardedToday ? '再次试手冲榜' : '出更今日异事', () => {
    closeModal();
    onStartChallenge(st);
  }, {
    cls: 'btn--wide',
    dataset: { action: 'start-daily-challenge' },
  });

  const footerBtns = [startBtn];
  if (typeof onOpenBoard === 'function') {
    footerBtns.push(sealButton('查看每日异事榜', () => {
      closeModal();
      onOpenBoard();
    }, {
      kind: 'small',
      cls: 'btn--wide',
      dataset: { action: 'open-daily-board' },
    }));
  }
  footerBtns.push(sealButton('合卷回去', closeModal, {
    kind: 'ghost',
    cls: 'btn--wide',
    dataset: { action: 'close-daily-challenge' },
  }));

  v = veil(root, scroll({
    title: '今日异事',
    sub: `${st.date} · 全服同种共战一局`,
    cls: 'scroll--dialog scroll--tall daily-challenge-modal',
    body: h('div', { class: 'dc-body' }, heroCard, rulesBox, rewardCard),
    footer: footerBtns,
  }), { onBackdrop: closeModal });

  return { close: closeModal };
}


