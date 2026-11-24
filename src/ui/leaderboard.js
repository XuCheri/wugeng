// 五更守夜总榜木版画弹窗（F12：全服总榜 public / 好友榜 friends / 我的排名 / 原生榜单唤起 / 降级回退）
import { h, clear, scroll, sealButton, veil, toast, formatCoins, formatTime } from './dom.js';
import { heroInfo, nightLabel } from './copy.js';
import {
  LEADERBOARD_COLLECTIONS,
  PRIMARY_LEADERBOARD_ID,
  PRIMARY_LEADERBOARD_NAME,
  PRIMARY_LEADERBOARD_UNIT,
} from '../meta/leaderboard-config.js';

const RANK_SEALS = ['魁', '贰', '叁'];

/**
 * 打开「五更守夜总榜」弹窗。
 * opts: { save, leaderboard, initialCollection?: 'public' | 'friends', onClose?() }
 */
export function openLeaderboardModal(root, opts = {}) {
  const { save, leaderboard } = opts;
  let activeCol = opts.initialCollection === LEADERBOARD_COLLECTIONS.FRIENDS
    ? LEADERBOARD_COLLECTIONS.FRIENDS
    : LEADERBOARD_COLLECTIONS.PUBLIC;
  let reqSeq = 0;
  let v = null;

  const tabBar = h('div', { class: 'seg pause-tabs lb-tabs', role: 'tablist', 'aria-label': '榜单范围切换' });
  const meBox = h('div', { class: 'lb-me-card' });
  const noticeBox = h('p', { class: 'lb-notice', hidden: true });
  const listBox = h('div', { class: 'lb-list' });

  function renderTabs() {
    clear(tabBar);
    const tabs = [
      [LEADERBOARD_COLLECTIONS.PUBLIC, '全服总榜'],
      [LEADERBOARD_COLLECTIONS.FRIENDS, '好友榜'],
    ];
    for (const [colId, label] of tabs) {
      const on = activeCol === colId;
      tabBar.appendChild(h('button', {
        type: 'button',
        role: 'tab',
        dataset: { collection: colId },
        'aria-selected': on ? 'true' : 'false',
        class: `seg__opt${on ? ' is-on is-active' : ''}`,
        onClick: () => {
          if (activeCol === colId) return;
          activeCol = colId;
          renderTabs();
          loadCurrentTab();
        },
      }, label));
    }
  }

  function renderMyCard(res) {
    clear(meBox);
    const bestLocal = Math.max(0, Math.floor(Number(save?.leaderboard?.bestScore || 0)));
    const cur = res?.currentPlayer;
    const scoreVal = cur && Number.isFinite(cur.score) ? Math.max(bestLocal, cur.score) : bestLocal;
    const rankLabel = cur && Number.isFinite(cur.rank) && cur.rank > 0
      ? (cur.isLocal ? '本机荣誉首席' : `第 ${cur.rank} 名`)
      : (scoreVal > 0 ? '已记入本机最高' : '暂未登榜');

    meBox.append(
      h('div', { class: 'lb-me-card__left' },
        h('span', { class: 'lb-me-card__label' }, '我的最高守夜战绩'),
        h('span', { class: 'lb-me-card__rank' }, `${save?.daoName || '守夜打更人'} · ${rankLabel}`)),
      h('div', { class: 'lb-me-card__score' },
        h('b', {}, formatCoins(scoreVal)),
        h('small', {}, PRIMARY_LEADERBOARD_UNIT)),
    );
  }

  function renderRows(res) {
    if (res?.notice) {
      noticeBox.hidden = false;
      noticeBox.textContent = res.notice;
    } else {
      noticeBox.hidden = true;
      noticeBox.textContent = '';
    }

    clear(listBox);
    const entries = Array.isArray(res?.entries) ? res.entries.slice(0, 10) : [];
    if (entries.length === 0) {
      listBox.appendChild(h('p', { class: 'lb-empty muted' },
        activeCol === LEADERBOARD_COLLECTIONS.FRIENDS
          ? '暂无好友守夜记录，快邀道友同守五更登榜较量。'
          : '尚无登榜战绩，出门守过一局即刻记入五更守夜总榜。'));
      return;
    }

    entries.forEach((row, idx) => {
      const rank = Number.isFinite(row.rank) && row.rank > 0 ? row.rank : idx + 1;
      const topSeal = rank <= 3 ? RANK_SEALS[rank - 1] : String(rank);
      const stampCls = rank === 1 ? 'stamp stamp--sm lb-rank lb-rank--1'
        : rank <= 3 ? 'stamp stamp--sm lb-rank lb-rank--top'
          : 'stamp stamp--sm stamp--ink lb-rank';
      const heroTxt = row.heroId ? ` · ${heroInfo(row.heroId).short}` : '';
      const subParts = [`第 ${rank} 名`];
      if (row.nightLevel !== undefined && row.kills !== undefined) {
        subParts.push(nightLabel(row.nightLevel || 0));
        subParts.push(`斩祟 ${row.kills}`);
        if (row.timeSec > 0) subParts.push(formatTime(row.timeSec));
      } else if (activeCol === LEADERBOARD_COLLECTIONS.FRIENDS) {
        subParts.push('TapTap 好友');
      } else {
        subParts.push('五更守夜人');
      }

      listBox.appendChild(h('div', {
        class: `lb-row${row.isSelf ? ' is-self' : ''}`,
        dataset: { rank: String(rank) },
      },
      h('span', { class: stampCls }, topSeal),
      h('div', { class: 'lb-row__main' },
        h('p', { class: 'lb-row__name' }, `${row.name || '守夜道友'}${heroTxt}`),
        h('p', { class: 'lb-row__meta' }, subParts.join(' · '))),
      h('div', { class: 'lb-row__score' },
        h('b', {}, formatCoins(row.score || 0)),
        h('small', {}, PRIMARY_LEADERBOARD_UNIT))));
    });
  }

  async function loadCurrentTab() {
    const seq = ++reqSeq;
    if (!listBox.children.length) {
      clear(listBox).appendChild(h('p', { class: 'lb-empty muted' }, '正在展卷查阅天榜名录……'));
    }
    const res = leaderboard
      ? await leaderboard.fetchBoard({ collection: activeCol, maxSize: 20, save })
      : {
        ok: false,
        source: 'local',
        collection: activeCol,
        notice: '当前展示本机五更守夜荣誉榜。',
        entries: [],
        currentPlayer: { rank: null, score: save?.leaderboard?.bestScore || 0 },
      };
    if (seq !== reqSeq) return;
    renderMyCard(res);
    renderRows(res);
  }

  async function handleOpenNative() {
    if (!leaderboard) {
      toast('当前环境暂未连接 TapTap 原生榜单面板');
      return;
    }
    const res = await leaderboard.openNativeLeaderboard({ collection: activeCol });
    if (!res.ok) {
      toast('当前环境暂不支持唤起原生榜单，已为你展示榜文');
    } else if (!window.tap?.getLeaderboardManager) {
      toast(`已唤起 TapTap「${PRIMARY_LEADERBOARD_NAME}」面板`);
    }
  }

  function closeModal() {
    reqSeq++;
    v?.close();
    opts.onClose?.();
  }

  renderTabs();
  renderMyCard(null);
  loadCurrentTab();

  const nativeBtn = sealButton('唤起 TapTap 原生榜单', handleOpenNative, {
    kind: 'small',
    cls: 'btn--wide lb-native-btn',
    dataset: { action: 'open-native-leaderboard' },
  });
  const closeBtn = sealButton('合卷回去', closeModal, {
    kind: 'ghost',
    cls: 'btn--wide',
    dataset: { action: 'close-leaderboard' },
  });

  v = veil(root, scroll({
    title: PRIMARY_LEADERBOARD_NAME,
    sub: `总榜编号 ${PRIMARY_LEADERBOARD_ID} · 计分单位：${PRIMARY_LEADERBOARD_UNIT}`,
    cls: 'scroll--dialog scroll--tall leaderboard-modal',
    body: h('div', { class: 'lb-body' }, tabBar, meBox, noticeBox, listBox),
    footer: [nativeBtn, closeBtn],
  }), { cls: 'veil--top', onBackdrop: closeModal });

  return { close: closeModal };
}
