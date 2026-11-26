// 五更天榜弹窗（F12 全服总榜/好友榜 + v4 M3 每日异事榜与守夜令榜）
import { h, clear, scroll, sealButton, veil, toast, formatCoins, formatTime } from './dom.js';
import { applyStagger } from './motion.js';
import { heroInfo, nightLabel } from './copy.js';
import {
  DAILY_LEADERBOARD_ID,
  DAILY_LEADERBOARD_NAME,
  LEADERBOARD_COLLECTIONS,
  PRIMARY_LEADERBOARD_ID,
  PRIMARY_LEADERBOARD_NAME,
  PRIMARY_LEADERBOARD_UNIT,
  SEASON_LEADERBOARD_ID,
  SEASON_LEADERBOARD_NAME,
} from '../meta/leaderboard-config.js';
import { buildLocalHonorEntries } from '../meta/leaderboard.js';
import { buildLocalDailyEntries } from '../meta/daily-challenge.js';

const RANK_SEALS = ['魁', '贰', '叁'];

/**
 * 打开排行榜弹窗。
 * opts: { save, leaderboard, initialBoard?: 'primary'|'daily'|'season', initialCollection?: 'public'|'friends', onClose?() }
 */
export function openLeaderboardModal(root, opts = {}) {
  const { save, leaderboard } = opts;
  let activeBoard = opts.initialBoard === 'daily' || opts.initialBoard === 'season'
    ? opts.initialBoard
    : 'primary';
  let activeCol = opts.initialCollection === LEADERBOARD_COLLECTIONS.FRIENDS
    ? LEADERBOARD_COLLECTIONS.FRIENDS
    : LEADERBOARD_COLLECTIONS.PUBLIC;
  let reqSeq = 0;
  let v = null;

  const boardBar = h('div', { class: 'seg pause-tabs lb-board-tabs', role: 'tablist', 'aria-label': '榜单类别切换' });
  const tabBar = h('div', { class: 'seg pause-tabs lb-tabs', role: 'tablist', 'aria-label': '榜单范围切换' });
  const meBox = h('div', { class: 'lb-me-card' });
  const noticeText = h('span', { class: 'lb-notice__text' });
  const refreshBtn = h('button', {
    type: 'button',
    class: 'lb-refresh',
    dataset: { action: 'refresh-leaderboard' },
    hidden: true,
    onClick: () => loadCurrentTab({ manual: true }),
  }, '重新展卷');
  const noticeBox = h('div', { class: 'lb-notice', hidden: true }, noticeText, refreshBtn);
  const statusLine = h('p', { class: 'lb-status' }, '正在连通 TapTap 天榜');
  const listBox = h('div', { class: 'lb-list' });

  let panelEl = null;

  function boardHeaderMeta(boardId) {
    if (boardId === 'daily') {
      return {
        title: DAILY_LEADERBOARD_NAME,
        sub: DAILY_LEADERBOARD_ID
          ? `榜单编号 ${DAILY_LEADERBOARD_ID} · 计分单位：${PRIMARY_LEADERBOARD_UNIT}`
          : `计分单位：${PRIMARY_LEADERBOARD_UNIT}`,
      };
    }
    if (boardId === 'season') {
      return {
        title: SEASON_LEADERBOARD_NAME,
        sub: SEASON_LEADERBOARD_ID
          ? `榜单编号 ${SEASON_LEADERBOARD_ID} · 计分单位：${PRIMARY_LEADERBOARD_UNIT}`
          : `计分单位：${PRIMARY_LEADERBOARD_UNIT}`,
      };
    }
    return {
      title: PRIMARY_LEADERBOARD_NAME,
      sub: `总榜编号 ${PRIMARY_LEADERBOARD_ID} · 计分单位：${PRIMARY_LEADERBOARD_UNIT}`,
    };
  }

  function syncModalHeader() {
    if (!panelEl) return;
    const meta = boardHeaderMeta(activeBoard);
    const titleEl = panelEl.querySelector('.scroll__title');
    const subEl = panelEl.querySelector('.scroll__sub');
    if (titleEl) titleEl.textContent = meta.title;
    if (subEl) subEl.textContent = meta.sub;
  }

  function renderBoardTabs() {
    clear(boardBar);
    const boards = [
      ['primary', '守夜总榜'],
      ['daily', '每日异事榜'],
      ['season', '守夜令榜'],
    ];
    for (const [bId, label] of boards) {
      const on = activeBoard === bId;
      boardBar.appendChild(h('button', {
        type: 'button',
        role: 'tab',
        dataset: { board: bId },
        'aria-selected': on ? 'true' : 'false',
        class: `seg__opt${on ? ' is-on is-active' : ''}`,
        onClick: () => {
          if (activeBoard === bId) return;
          activeBoard = bId;
          syncModalHeader();
          renderBoardTabs();
          renderTabs();
          loadCurrentTab();
        },
      }, label));
    }
  }

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
    tabBar.hidden = false;
  }

  function localBestForActiveBoard() {
    if (activeBoard === 'daily') {
      return Math.max(0, Math.floor(Number(save?.dailyChallenge?.todayBestScore || save?.dailyChallenge?.bestScore || 0)));
    }
    if (activeBoard === 'season') {
      return Math.max(0, Math.floor(Number(save?.season?.bestSeasonScore || save?.season?.xp || 0)));
    }
    return Math.max(0, Math.floor(Number(save?.leaderboard?.bestScore || 0)));
  }

  function renderMyCard(res) {
    clear(meBox);
    const bestLocal = localBestForActiveBoard();
    const cur = res?.currentPlayer;
    const scoreVal = cur && Number.isFinite(cur.score) ? Math.max(bestLocal, cur.score) : bestLocal;
    const rankLabel = cur && Number.isFinite(cur.rank) && cur.rank > 0
      ? (cur.isLocal ? '本机荣誉首席' : `第 ${cur.rank} 名`)
      : (scoreVal > 0 ? '已记入本机最高' : '暂未登榜');
    const titleLabel = activeBoard === 'daily'
      ? '我的今日异事最高分'
      : activeBoard === 'season'
        ? '我的当期守夜令战绩'
        : '我的最高守夜战绩';

    meBox.append(
      h('div', { class: 'lb-me-card__left' },
        h('span', { class: 'lb-me-card__label' }, titleLabel),
        h('span', { class: 'lb-me-card__rank' }, `${save?.daoName || '守夜打更人'} · ${rankLabel}`)),
      h('div', { class: 'lb-me-card__score' },
        h('b', {}, formatCoins(scoreVal)),
        h('small', {}, PRIMARY_LEADERBOARD_UNIT)),
    );
  }

  function renderStatus(res, pending = false) {
    statusLine.classList.toggle('is-pending', pending);
    statusLine.classList.toggle('is-live', !pending && Boolean(res?.ok));
    const bName = activeBoard === 'daily' ? DAILY_LEADERBOARD_NAME : activeBoard === 'season' ? SEASON_LEADERBOARD_NAME : 'TapTap 天榜';
    if (pending) {
      statusLine.textContent = `正在连通${bName}……`;
    } else if (res?.ok) {
      if (activeBoard === 'primary') {
        statusLine.textContent = activeCol === LEADERBOARD_COLLECTIONS.FRIENDS ? '已连通 TapTap 好友榜' : '已连通 TapTap 全服天榜';
      } else {
        statusLine.textContent = activeCol === LEADERBOARD_COLLECTIONS.FRIENDS
          ? `已连通 TapTap ${bName}·好友榜`
          : `已连通 TapTap ${bName}`;
      }
    } else if (res?.source === 'local') {
      statusLine.textContent = activeBoard === 'daily' ? '本机异事榜' : activeBoard === 'season' ? '本机守夜令榜' : '本机荣誉榜';
    } else {
      statusLine.textContent = '本机荣誉榜 · 天榜稍后同步';
    }
  }

  function renderRows(res) {
    if (res?.notice) {
      noticeBox.hidden = false;
      noticeText.textContent = res.notice;
      refreshBtn.hidden = !(res.source === 'error_fallback' || res.retryable);
    } else {
      noticeBox.hidden = true;
      noticeText.textContent = '';
      refreshBtn.hidden = true;
    }

    clear(listBox);
    const entries = Array.isArray(res?.entries) ? res.entries.slice(0, 10) : [];
    if (entries.length === 0) {
      const emptyTxt = activeBoard === 'daily'
        ? '今日尚无异事战绩，点更房顶部「今日异事」出更即可登榜。'
        : activeBoard === 'season'
          ? '当期尚无守夜令战绩，开启血月守夜或积攒令火即可登榜。'
          : activeCol === LEADERBOARD_COLLECTIONS.FRIENDS
            ? '暂无好友守夜记录，快邀道友同守五更登榜较量。'
            : '尚无登榜战绩，出门守过一局即刻记入五更守夜总榜。';
      listBox.appendChild(h('p', { class: 'lb-empty muted' }, emptyTxt));
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
      if (row.date) {
        subParts.push(row.date);
        if (row.kills !== undefined) subParts.push(`斩祟 ${row.kills}`);
        if (row.timeSec > 0) subParts.push(formatTime(row.timeSec));
      } else if (row.nightLevel !== undefined && row.kills !== undefined) {
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
    applyStagger(listBox, '.lb-row', 8);
  }

  async function loadCurrentTab({ manual = false } = {}) {
    const seq = ++reqSeq;
    if (!listBox.children.length || manual) {
      const localEntries = activeBoard === 'daily'
        ? buildLocalDailyEntries(save)
        : activeBoard === 'season'
          ? (leaderboard?.buildLocalSeasonEntries?.(save) || [])
          : buildLocalHonorEntries(save);
      renderRows({ entries: localEntries, notice: '' });
    }
    renderStatus(null, true);
    if (manual) refreshBtn.disabled = true;
    const res = leaderboard
      ? await leaderboard.fetchBoard({
        boardType: activeBoard,
        collection: activeCol,
        maxSize: 20,
        save,
      })
      : {
        ok: false,
        source: 'local',
        boardType: activeBoard,
        collection: activeCol,
        notice: '当前展示本机五更守夜荣誉榜。',
        entries: [],
        currentPlayer: { rank: null, score: localBestForActiveBoard() },
      };
    if (seq !== reqSeq) return;
    refreshBtn.disabled = false;
    renderStatus(res, false);
    renderMyCard(res);
    renderRows(res);
    if (manual && res?.ok) toast('天榜已刷新');
  }

  async function handleOpenNative() {
    if (!leaderboard) {
      toast('当前环境暂未连接 TapTap 原生榜单面板');
      return;
    }
    const res = await leaderboard.openNativeLeaderboard({
      boardType: activeBoard,
      collection: activeCol,
    });
    if (!res.ok) {
      toast('当前环境暂不支持唤起原生榜单，已为你展示榜文');
    } else if (!window.tap?.getLeaderboardManager) {
      const bName = activeBoard === 'daily' ? DAILY_LEADERBOARD_NAME : activeBoard === 'season' ? SEASON_LEADERBOARD_NAME : PRIMARY_LEADERBOARD_NAME;
      toast(`已唤起 TapTap「${bName}」面板`);
    }
  }

  function closeModal() {
    reqSeq++;
    v?.close();
    opts.onClose?.();
  }

  const initHeader = boardHeaderMeta(activeBoard);
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

  panelEl = scroll({
    title: initHeader.title,
    sub: initHeader.sub,
    cls: 'scroll--dialog scroll--tall leaderboard-modal',
    body: h('div', { class: 'lb-body' }, boardBar, tabBar, statusLine, meBox, noticeBox, listBox),
    footer: [nativeBtn, closeBtn],
  });

  renderBoardTabs();
  renderTabs();
  renderMyCard(null);
  loadCurrentTab();

  v = veil(root, panelEl, { cls: 'veil--top', onBackdrop: closeModal });

  return { close: closeModal };
}
