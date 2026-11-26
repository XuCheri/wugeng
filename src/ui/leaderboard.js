// 五更天榜弹窗（F12 全服总榜/好友榜 + v4 M3 每日异事榜与守夜令榜）
import { h, clear, scroll, sealButton, veil, toast, formatCoins, formatTime } from './dom.js';
import { applyStagger } from './motion.js';
import { heroInfo, nightLabel } from './copy.js';
import {
  DAILY_LEADERBOARD_NAME,
  LEADERBOARD_COLLECTIONS,
  PRIMARY_LEADERBOARD_NAME,
  PRIMARY_LEADERBOARD_UNIT,
  SEASON_LEADERBOARD_NAME,
} from '../meta/leaderboard-config.js';

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
  }, '重试');
  const noticeBox = h('div', { class: 'lb-notice', hidden: true }, noticeText, refreshBtn);
  // 仅在加载中给出轻提示；成功后整行隐藏，失败交由 noticeBox 简短提示「加载失败」
  const statusLine = h('p', { class: 'lb-status is-pending', hidden: true }, '加载中…');
  const listBox = h('div', { class: 'lb-list' });

  let panelEl = null;

  // 玩家视角的榜单标题与一句话说明（不展示榜单编号、计分单位等后台信息）
  function boardHeaderMeta(boardId) {
    if (boardId === 'daily') {
      return { title: DAILY_LEADERBOARD_NAME, sub: '今日异事最高分 · 每日换新' };
    }
    if (boardId === 'season') {
      return { title: SEASON_LEADERBOARD_NAME, sub: '本期守夜令积分排行' };
    }
    return { title: PRIMARY_LEADERBOARD_NAME, sub: '单局守夜最高分排行' };
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
      [LEADERBOARD_COLLECTIONS.PUBLIC, '全服'],
      [LEADERBOARD_COLLECTIONS.FRIENDS, '好友'],
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
    // 只有拿到真实名次才显示「第 N 名」，否则统一为「未上榜」，不出现「本机」等技术字眼
    const rankLabel = cur && !cur.isLocal && Number.isFinite(cur.rank) && cur.rank > 0
      ? `第 ${cur.rank} 名`
      : '未上榜';

    meBox.append(
      h('div', { class: 'lb-me-card__left' },
        h('span', { class: 'lb-me-card__label' }, save?.daoName || '守夜打更人'),
        h('span', { class: 'lb-me-card__rank' }, rankLabel)),
      h('div', { class: 'lb-me-card__score' },
        h('b', {}, formatCoins(scoreVal)),
        h('small', {}, PRIMARY_LEADERBOARD_UNIT)),
    );
  }

  function renderStatus(res, pending = false) {
    // 加载中仅淡化列表，不再出现「已连通 / 正在连通」等提示
    listBox.classList.toggle('is-loading', pending);
    statusLine.hidden = !(pending && !listBox.querySelector('.lb-row'));
  }

  function friendlyNotice(res) {
    if (!res || res.ok) return '';
    if (res.source === 'permission_fallback' && activeCol === LEADERBOARD_COLLECTIONS.FRIENDS) {
      return '好友榜需授权后查看';
    }
    return '加载失败，请稍后重试';
  }

  function renderRows(res) {
    // 成功时不提示任何连通信息；失败只给一句「加载失败」+ 重试
    const notice = friendlyNotice(res);
    noticeBox.hidden = !notice;
    noticeText.textContent = notice;
    refreshBtn.hidden = !notice;
    refreshBtn.textContent = res?.source === 'permission_fallback' ? '去授权' : '重试';

    clear(listBox);
    // 加载失败时不展示本机替代数据，避免误以为是全服名次
    if (notice) return;
    const entries = Array.isArray(res?.entries) ? res.entries.slice(0, 10) : [];
    if (entries.length === 0) {
      const emptyTxt = activeBoard === 'daily'
        ? '今日还没有人上榜，快去挑战今日异事'
        : activeBoard === 'season'
          ? '本期还没有人上榜，守一局就能上榜'
          : activeCol === LEADERBOARD_COLLECTIONS.FRIENDS
            ? '还没有好友上榜，快邀请好友一起守夜'
            : '还没有人上榜，守一局就能上榜';
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
      // 名次已由左侧印章表达，副行只保留对玩家有意义的战绩细节；没有就不显示
      const subParts = [];
      if (row.nightLevel !== undefined && row.nightLevel !== null && !row.date) subParts.push(nightLabel(row.nightLevel || 0));
      if (row.kills !== undefined) subParts.push(`斩祟 ${row.kills}`);
      if (row.timeSec > 0) subParts.push(formatTime(row.timeSec));

      listBox.appendChild(h('div', {
        class: `lb-row${row.isSelf ? ' is-self' : ''}`,
        dataset: { rank: String(rank) },
      },
      h('span', { class: stampCls }, topSeal),
      h('div', { class: 'lb-row__main' },
        h('p', { class: 'lb-row__name' }, `${row.name || '守夜道友'}${heroTxt}`),
        subParts.length ? h('p', { class: 'lb-row__meta' }, subParts.join(' · ')) : null),
      h('div', { class: 'lb-row__score' },
        h('b', {}, formatCoins(row.score || 0)))));
    });
    applyStagger(listBox, '.lb-row', 8);
  }

  async function loadCurrentTab({ manual = false } = {}) {
    const seq = ++reqSeq;
    if (!manual) {
      // 切换榜单/范围时先清空旧数据，只显示「加载中…」
      clear(listBox);
      noticeBox.hidden = true;
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
        entries: [],
        currentPlayer: { rank: null, score: localBestForActiveBoard() },
      };
    if (seq !== reqSeq) return;
    refreshBtn.disabled = false;
    renderStatus(res, false);
    renderMyCard(res);
    renderRows(res);
    if (manual && res?.ok) toast('已刷新');
  }

  async function handleOpenNative() {
    if (!leaderboard) {
      toast('暂时无法打开，请稍后重试');
      return;
    }
    const res = await leaderboard.openNativeLeaderboard({
      boardType: activeBoard,
      collection: activeCol,
    });
    if (!res.ok) toast('暂时无法打开，请稍后重试');
  }

  function closeModal() {
    reqSeq++;
    v?.close();
    opts.onClose?.();
  }

  const initHeader = boardHeaderMeta(activeBoard);
  // 次级入口：文字链样式，不与「合卷回去」抢主焦点
  const nativeBtn = h('button', {
    type: 'button',
    class: 'link-btn lb-native-btn',
    dataset: { action: 'open-native-leaderboard' },
    onClick: handleOpenNative,
  }, '在 TapTap 查看完整榜单 ›');
  const closeBtn = sealButton('合卷回去', closeModal, {
    kind: 'ghost',
    cls: 'btn--wide',
    dataset: { action: 'close-leaderboard' },
  });

  panelEl = scroll({
    title: initHeader.title,
    sub: initHeader.sub,
    cls: 'scroll--dialog scroll--tall leaderboard-modal',
    body: h('div', { class: 'lb-body' }, boardBar, tabBar, noticeBox, meBox, statusLine, listBox, nativeBtn),
    footer: [closeBtn],
  });

  renderBoardTabs();
  renderTabs();
  renderMyCard(null);
  loadCurrentTab();

  v = veil(root, panelEl, { cls: 'veil--top', onBackdrop: closeModal });

  return { close: closeModal };
}
