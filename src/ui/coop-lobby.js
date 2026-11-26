// 同守五更 2–4 人联机大厅与三入口组队弹窗（F13 + F14 + v4 M4.4）：
// 三大清晰入口：
// 1. 建房邀友：[data-action="coop-create"] 创建房间 + [data-action="coop-invite-friend"] TapTap 分享拉起
// 2. 输入房号：6 位字母数字房号输入 [data-room-input="1"] + [data-action="coop-join"]
// 3. 快速匹配：[data-action="coop-quick"] 云端匹配 wugeng_v4 房间，20 秒未满自动补齐智能道友
// 彻底移除旧版手工复制粘贴 SDP 的无效 P2P 面板；无联机环境优雅提示「当前环境暂不支持联机」。

import { h, clear, scroll, sealButton, veil, toast } from './dom.js';
import { heroInfo, weaponName } from './copy.js';
import { getAttackVfxDef, getSkinDef } from '../meta/cosmetics.js';
import { INK, PAPER_SHADE } from '../render/palette.js';
import { drawHeroWithSkin } from '../render/skins.js';
import { MAX_COOP_PLAYERS } from '../sim/coop.js';

/**
 * 打开「同守五更」联机大厅弹窗。
 * opts: { save, coop, friends, autoJoinCode?, openFriendsFirst?, onClose?() }
 */
export function openCoopLobbyModal(root, opts = {}) {
  const { coop, friends } = opts;
  let v = null;
  let closed = false;
  let joinInputVal = opts.autoJoinCode ? String(opts.autoJoinCode).toUpperCase() : '';
  let friendsExpanded = Boolean(opts.openFriendsFirst || friends?.isMockEnabled?.());

  const codeBannerBox = h('div', { class: 'coop-code-box' });
  const statusNoticeEl = h('p', { class: 'coop-status' });
  const partyGrid = h('div', { class: 'coop-party-grid', 'aria-label': '守夜队伍席位' });
  const controlBox = h('div', { class: 'coop-controls' });
  const friendsBox = h('div', { class: 'friends-panel coop-friends-panel' });
  const footBox = h('div', { class: 'coop-foot-actions' });

  const roomInput = h('input', {
    type: 'text',
    maxLength: 8,
    value: joinInputVal,
    placeholder: '输入 6 位守夜房号',
    'aria-label': '输入 6 位守夜房号',
    dataset: { roomInput: '1' },
    class: 'coop-input',
    onInput: (ev) => {
      joinInputVal = String(ev.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      ev.target.value = joinInputVal;
    },
  });

  function renderMemberThumb(member) {
    const cvs = h('canvas', { class: 'coop-member__thumb', width: 96, height: 96 });
    const g = cvs.getContext?.('2d');
    if (g) {
      g.scale(2, 2);
      g.fillStyle = INK;
      g.fillRect(0, 0, 48, 48);
      g.strokeStyle = PAPER_SHADE;
      g.lineWidth = 1;
      g.strokeRect(1.5, 1.5, 45, 45);
      drawHeroWithSkin(g, {
        heroId: member.heroId,
        skinId: member.skinId || `${member.heroId}_default`,
        x: 24,
        y: 41,
        frame: 0,
        scale: 0.78,
        showAura: true,
      });
    }
    return cvs;
  }

  async function handleInviteShare(explicitCode = '') {
    let code = explicitCode || coop.roomCode || '';
    if (!code) {
      const created = coop.createRoom();
      code = created?.roomCode || coop.roomCode || '';
    }
    const res = await friends.inviteFriendToRoom({ roomCode: code });
    if (res?.message) {
      statusNoticeEl.textContent = res.message;
      toast(res.message);
    }
    render();
  }

  function render() {
    if (closed) return;
    const st = coop.getState();
    const activeCode = st.confirmedRoomCode || st.pendingRoomCode || '';

    // 1. 顶部房号横匾或三大组队入口（建房邀友 / 快速匹配 / 好友列表）
    clear(codeBannerBox);
    if (activeCode) {
      codeBannerBox.append(
        h('div', { class: 'coop-code-badge' },
          h('span', { class: 'coop-code-badge__label' }, st.confirmedRoomCode ? '当前守夜房号' : '寻访房号'),
          h('b', {
            class: 'coop-code-badge__val',
            dataset: { roomCode: activeCode },
          }, activeCode)),
        h('div', { class: 'coop-code-actions' },
          sealButton('邀请好友', () => handleInviteShare(activeCode), {
            kind: 'small',
            dataset: { action: 'coop-invite-friend' },
          }),
          sealButton('离开房间', () => {
            coop.leave();
            render();
          }, { kind: 'ghost', cls: 'btn--small', dataset: { action: 'coop-leave' } })),
      );
    } else {
      codeBannerBox.append(
        h('div', { class: 'coop-entry-grid' },
          h('div', { class: 'coop-entry-card' },
            h('span', { class: 'coop-entry-card__title' }, '建房邀友'),
            h('span', { class: 'coop-entry-card__sub' }, '创建房间，邀请好友同守'),
            h('div', { class: 'coop-entry-card__acts' },
              sealButton('创建房间', () => {
                coop.createRoom();
                render();
              }, { kind: 'small', dataset: { action: 'coop-create' } }),
              sealButton('邀请好友', () => handleInviteShare(), {
                kind: 'ghost',
                cls: 'btn--small',
                dataset: { action: 'coop-invite-friend' },
              }))),
          h('div', { class: 'coop-entry-card' },
            h('span', { class: 'coop-entry-card__title' }, '快速匹配'),
            h('span', { class: 'coop-entry-card__sub' }, '自动匹配路人队友'),
            h('div', { class: 'coop-entry-card__acts' },
              sealButton('快速匹配', async () => {
                await coop.quickMatch();
                render();
              }, { kind: 'small', dataset: { action: 'coop-quick' } }),
              sealButton('好友列表', () => {
                friendsExpanded = true;
                const res = friends.openFriendList();
                if (res?.message) {
                  statusNoticeEl.textContent = res.message;
                  toast(res.message);
                }
                renderFriendsSection();
              }, { kind: 'ghost', cls: 'btn--small', dataset: { action: 'open-friends' } })))),
      );
    }

    // 2. 状态提示语（含无联机宿主环境优雅提示）
    const defaultNotice = st.onlineSupported === false
      ? '当前环境暂不支持联机，可添加人机队友同守'
      : st.tapMode
        ? '二至四人同守 · 队友倒地可入阵扶起'
        : '二至四人同守 · 队友倒地可入阵扶起';
    const statusMsg = st.lastError || st.statusText || defaultNotice;
    statusNoticeEl.textContent = statusMsg;
    statusNoticeEl.className = `coop-status${st.lastError ? ' is-error' : ''}`;

    // 3. 输入 6 位房号进房 + 智能道友补位工具栏
    clear(controlBox);
    const joinRow = h('div', { class: 'coop-join-row' },
      roomInput,
      sealButton('加入房间', async () => {
        const target = (roomInput.value || joinInputVal || '').trim();
        const res = await coop.joinRoom(target);
        if (!res.ok && res.message) {
          toast(res.message);
        }
        render();
      }, { kind: 'small', dataset: { action: 'coop-join' } }));
    controlBox.appendChild(joinRow);

    const subTools = h('div', { class: 'coop-subtools' });
    if (st.role !== 'guest') {
      subTools.appendChild(sealButton('添加人机', () => {
        const r = coop.addBot();
        if (!r.ok && r.message) toast(r.message);
        render();
      }, {
        kind: 'ghost',
        cls: 'btn--small',
        disabled: st.party.length >= MAX_COOP_PLAYERS,
        dataset: { action: 'coop-add-bot' },
      }));
    }
    if (activeCode) {
      subTools.appendChild(sealButton('好友列表', () => {
        friendsExpanded = true;
        const res = friends.openFriendList();
        if (res?.message) {
          statusNoticeEl.textContent = res.message;
          toast(res.message);
        }
        renderFriendsSection();
      }, { kind: 'ghost', cls: 'btn--small', dataset: { action: 'open-friends' } }));
    }
    if (subTools.childNodes.length > 0) {
      controlBox.appendChild(subTools);
    }

    // 4. 2–4 人席位卡片（含角色皮肤缩略演武、起手兵刃与特效标签）
    clear(partyGrid);
    for (let slot = 0; slot < MAX_COOP_PLAYERS; slot++) {
      const m = st.party[slot];
      if (m) {
        const hInfo = heroInfo(m.heroId);
        const skinDef = getSkinDef(m.skinId, m.heroId);
        const vfxDef = getAttackVfxDef(m.attackVfx);
        const badgeTxt = m.isHost ? '房主' : m.isBot ? '人机' : (m.ready ? '已就绪' : '候更');
        partyGrid.appendChild(h('div', {
          class: `coop-member is-occupied${m.ready ? ' is-ready' : ''}`,
          dataset: { slot: String(slot), heroId: m.heroId },
        },
        renderMemberThumb(m),
        h('div', { class: 'coop-member__info' },
          h('p', { class: 'coop-member__name' },
            h('b', {}, m.name),
            h('span', { class: 'coop-member__role' }, badgeTxt)),
          h('p', { class: 'coop-member__meta' }, `${hInfo.short} · ${skinDef.name}`),
          h('p', { class: 'coop-member__sub' }, `兵刃「${weaponName(m.startWeapon)}」· ${vfxDef.name}`))));
      } else {
        partyGrid.appendChild(h('div', {
          class: 'coop-member is-empty',
          dataset: { slot: String(slot) },
        },
        h('span', { class: 'coop-member__empty' }, `席位 ${slot + 1} · 虚位以待`)));
      }
    }

    renderFriendsSection();

    // 5. 底部主战按钮（房主开局 / 客机准备）
    clear(footBox);
    if (st.role === 'guest' && st.status === 'lobby') {
      const me = st.party[st.mySlot];
      const isReady = Boolean(me?.ready);
      footBox.appendChild(sealButton(isReady ? '已准备就绪（候房主起更）' : '准备就绪', () => {
        coop.toggleReady();
        render();
      }, {
        cls: `btn--wide${isReady ? ' is-ready is-on' : ''}`,
        'aria-pressed': isReady ? 'true' : 'false',
        dataset: { action: 'coop-ready' },
      }));
    } else {
      footBox.appendChild(sealButton(
        st.party.length >= 2 ? `同守起更（${st.party.length} 人出战）` : '同守起更（自动配道友）',
        () => {
          coop.startMatch();
        },
        {
          cls: 'btn--wide',
          disabled: st.role === 'guest',
          dataset: { action: 'coop-start' },
        },
      ));
    }
    footBox.appendChild(sealButton('合卷回去', () => closeModal(), {
      kind: 'ghost',
      cls: 'btn--wide',
      dataset: { action: 'close-coop' },
    }));
  }

  function renderFriendsSection() {
    clear(friendsBox);
    const list = friends?.getFriends?.() || [];
    if (!friendsExpanded && list.length === 0) {
      friendsBox.hidden = true;
      return;
    }
    friendsBox.hidden = false;
    friendsBox.appendChild(h('p', { class: 'coop-sec-title' }, '好友'));
    if (list.length === 0) {
      friendsBox.appendChild(h('p', { class: 'coop-friends-empty muted' },
        friends?.hasNativeFriendApi?.()
          ? '暂无在线好友，可点击「邀请好友」发送邀请。'
          : '暂无在线好友，可点击「邀请好友」发送邀请。'));
      return;
    }
    const ul = h('div', { class: 'coop-friends-list' });
    for (const f of list) {
      const code = coop.roomCode || '';
      ul.appendChild(h('div', {
        class: 'friend-row coop-friend',
        dataset: { friendId: f.id },
      },
      h('div', { class: 'coop-friend__main' },
        h('p', { class: 'coop-friend__name' }, `${f.name} · ${heroInfo(f.heroId).short}`),
        h('p', { class: 'coop-friend__status' }, f.invited ? `已发送房号 ${f.invitedRoom || code} 邀请` : f.status)),
      sealButton(f.invited ? '已邀' : '邀入房', async () => {
        if (!coop.roomCode) coop.createRoom();
        const res = await friends.inviteFriendToRoom({
          roomCode: coop.roomCode,
          friendId: f.id,
        });
        if (res?.message) {
          statusNoticeEl.textContent = res.message;
          toast(res.message);
        }
        render();
      }, { kind: 'small', cls: 'coop-friend__btn' })));
    }
    friendsBox.appendChild(ul);
  }

  const unsub = coop.subscribe((snap) => {
    if (snap.status === 'in_run') {
      closeModal(true);
      return;
    }
    render();
  });

  function closeModal(keepSession = false) {
    if (closed) return;
    closed = true;
    unsub();
    if (!keepSession && coop.getState().status === 'not_found') {
      coop.leave({ silent: true });
    }
    v?.close();
    opts.onClose?.();
  }

  if (opts.autoJoinCode) {
    coop.joinRoom(opts.autoJoinCode);
  }

  render();

  const body = h('div', { class: 'coop-body' },
    codeBannerBox,
    statusNoticeEl,
    controlBox,
    partyGrid,
    friendsBox);

  const panel = scroll({
    title: '同守五更',
    sub: '邀好友或匹配路人，一起守夜',
    cls: 'scroll--dialog scroll--tall coop-scroll',
    body,
    footer: [footBox],
  });

  v = veil(root, panel, {
    cls: 'coop-modal coop-lobby',
    onBackdrop: () => closeModal(),
  });

  return {
    el: v.el,
    close: () => closeModal(true),
    refresh: () => render(),
  };
}
