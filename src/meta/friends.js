// TapTap 好友系统、组队分享与房号拉起服务（F13）
// - 对接 tap.openFriendList、tap.shareAppMessage / tap.showShareboard
// - 启动即注册 tap.onShareMessage / tap.onShareAppMessage 被动分享钩子（自动附带当前活跃联机房号）
// - 解析 URL ?room= / ?invite=、tap.getLaunchOptionsSync()?.query（含 sceneParam）与 tap.onShow 前台拉起参数
// - 严格清洗 4–8 位字母数字房号，彻底阻断超长脏参数与 XSS 注入；完整支持 ?mockFriends=1 / ?mockTap=1

const ROOM_CODE_EXACT_RE = /^[A-Za-z0-9]{4,8}$/;

const INITIAL_MOCK_FRIENDS = [
  { id: 'tap_friend_qingyi', name: '青衫客·阿鲤', heroId: 'nuoxi', status: '在线 · 空闲可邀请' },
  { id: 'tap_friend_guanxing', name: '北辰散人', heroId: 'yinyang', status: '在线 · 可邀请组队' },
  { id: 'tap_friend_tiejiang', name: '铁炉老石', heroId: 'tiejiang', status: '在线 · 守夜中' },
  { id: 'tap_friend_daotong', name: '松风小道', heroId: 'daotong', status: '在线 · 空闲' },
];

/**
 * 严格清洗联机房号：仅接受 4–8 位纯 ASCII 字母或数字，统一转大写；任何含 HTML/脚本符号、1 位过短或 24 位超长字符串一律拒绝返回 null。
 */
export function sanitizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!ROOM_CODE_EXACT_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

/**
 * 从形如 "room=JK67MN" / "?invite=EF45GH" 或纯房号字符串中安全提取房号。
 */
export function extractRoomCodeFromParamString(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const str = raw.trim();
  if (str.includes('=') || str.includes('&') || str.startsWith('?')) {
    try {
      const sp = new URLSearchParams(str.startsWith('?') ? str.slice(1) : str);
      const fromRoom = sp.get('room');
      if (fromRoom !== null) return sanitizeRoomCode(fromRoom);
      const fromInvite = sp.get('invite');
      if (fromInvite !== null) return sanitizeRoomCode(fromInvite);
      const nestedScene = sp.get('sceneParam');
      if (nestedScene && nestedScene !== str) return extractRoomCodeFromParamString(nestedScene);
      return null;
    } catch {
      return null;
    }
  }
  return sanitizeRoomCode(str);
}

export function extractRoomCodeFromQueryObject(queryObj) {
  if (!queryObj || typeof queryObj !== 'object') return null;
  if (typeof queryObj.room === 'string') return sanitizeRoomCode(queryObj.room);
  if (typeof queryObj.invite === 'string') return sanitizeRoomCode(queryObj.invite);
  if (typeof queryObj.roomCode === 'string') return sanitizeRoomCode(queryObj.roomCode);
  if (typeof queryObj.sceneParam === 'string') {
    return extractRoomCodeFromParamString(queryObj.sceneParam);
  }
  return null;
}

function readUrlSearchParams(win) {
  try {
    return new URLSearchParams(win?.location?.search || '');
  } catch {
    return new URLSearchParams();
  }
}

export function extractLaunchRoomCode(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null;
  const sp = readUrlSearchParams(win);
  if (sp.has('room')) {
    return sanitizeRoomCode(sp.get('room'));
  }
  if (sp.has('invite')) {
    return sanitizeRoomCode(sp.get('invite'));
  }
  if (sp.has('sceneParam')) {
    const fromScene = extractRoomCodeFromParamString(sp.get('sceneParam'));
    if (fromScene) return fromScene;
  }
  try {
    if (typeof win.tap?.getLaunchOptionsSync === 'function') {
      const launchOpts = win.tap.getLaunchOptionsSync();
      const fromQuery = extractRoomCodeFromQueryObject(launchOpts?.query);
      if (fromQuery) return fromQuery;
      if (typeof launchOpts?.sceneParam === 'string') {
        const fromTop = extractRoomCodeFromParamString(launchOpts.sceneParam);
        if (fromTop) return fromTop;
      }
    }
  } catch {
    // ignore host launch option read failure
  }
  return null;
}

export function createFriends({
  win = typeof window !== 'undefined' ? window : null,
  getActiveRoomCode = () => null,
  onRoomInviteJoin = null,
} = {}) {
  const mockFriends = INITIAL_MOCK_FRIENDS.map((f) => ({ ...f, invited: false, invitedRoom: null }));
  const inviteReceipts = [];

  function isMockEnabled() {
    const sp = readUrlSearchParams(win);
    return sp.get('mockFriends') === '1' || sp.get('mockTap') === '1';
  }

  function hasNativeFriendApi() {
    return Boolean(win?.tap && typeof win.tap.openFriendList === 'function');
  }

  function buildSharePayload(explicitRoomCode = null) {
    const code = sanitizeRoomCode(explicitRoomCode || getActiveRoomCode?.() || '');
    const queryStr = code ? `room=${code}` : '';
    const title = code ? `同守五更 · 守夜房号 ${code}` : '五更天 · 结伴同守五更';
    const desc = code
      ? `长夜邪祟四起，速来《五更天》输入房号 ${code} 与我并肩守到天亮！`
      : '来《五更天》二至四人结伴巡街，倒地画阵互救，共守鸡鸣天亮！';
    return {
      title,
      description: desc,
      desc,
      query: queryStr,
      sceneParam: queryStr,
    };
  }

  // 启动即挂载被动系统分享与 TapTap 前台切入拉起监听
  if (win?.tap) {
    try {
      if (typeof win.tap.onShareMessage === 'function') {
        win.tap.onShareMessage(() => buildSharePayload());
      }
    } catch {
      // ignore host share hook error
    }
    try {
      if (typeof win.tap.onShareAppMessage === 'function') {
        win.tap.onShareAppMessage(() => buildSharePayload());
      }
    } catch {
      // ignore host shareApp hook error
    }
    try {
      if (typeof win.tap.onShow === 'function') {
        win.tap.onShow((ev) => {
          const fromQuery = extractRoomCodeFromQueryObject(ev?.query);
          const fromScene = !fromQuery && typeof ev?.sceneParam === 'string'
            ? extractRoomCodeFromParamString(ev.sceneParam)
            : null;
          const roomCode = fromQuery || fromScene;
          if (roomCode && typeof onRoomInviteJoin === 'function') {
            onRoomInviteJoin(roomCode);
          }
        });
      }
    } catch {
      // ignore host onShow registration error
    }
  }

  function getFriends() {
    if (!isMockEnabled()) return [];
    return mockFriends.map((f) => ({ ...f }));
  }

  function openFriendList() {
    if (hasNativeFriendApi()) {
      try {
        win.tap.openFriendList({
          success: () => {},
          fail: () => {},
        });
        return { ok: true, mode: 'tap', friends: getFriends() };
      } catch {
        return { ok: false, mode: 'tap_error', message: 'TapTap 好友面板暂不可用，可使用房号口令邀请道友', friends: getFriends() };
      }
    }
    if (isMockEnabled()) {
      return { ok: true, mode: 'mock', friends: getFriends() };
    }
    return {
      ok: false,
      mode: 'offline',
      message: '在 TapTap 客户端内可打开好友列表，当前可直接分享 6 位守夜房号',
      friends: [],
    };
  }

  async function copyOfflineInviteText(code) {
    const clean = sanitizeRoomCode(code) || '';
    const baseHref = (() => {
      try {
        const loc = win?.location;
        if (!loc) return clean ? `?room=${clean}` : '';
        return `${loc.origin}${loc.pathname}${clean ? `?room=${clean}` : ''}`;
      } catch {
        return clean ? `?room=${clean}` : '';
      }
    })();
    const shareText = clean
      ? `《五更天》同守五更组队邀请 · 房号口令：${clean} · 点击加入：${baseHref}`
      : `《五更天》同守五更组队邀请：${baseHref}`;

    let copied = false;
    try {
      if (win?.navigator?.clipboard && typeof win.navigator.clipboard.writeText === 'function') {
        await win.navigator.clipboard.writeText(shareText);
        copied = true;
      }
    } catch {
      copied = false;
    }

    return {
      ok: true,
      copied,
      mode: copied ? 'clipboard' : 'manual',
      roomCode: clean,
      query: clean ? `room=${clean}` : '',
      shareUrl: baseHref,
      shareText,
      message: copied
        ? `已复制组队房号口令 ${clean}，快粘贴分享给同行道友`
        : `房号口令 ${clean}（?room=${clean}）已就绪，请复制房号邀请道友加入`,
    };
  }

  async function inviteFriendToRoom({ roomCode = null, friendId = null } = {}) {
    const cleanCode = sanitizeRoomCode(roomCode || getActiveRoomCode?.() || '') || '';
    const payload = buildSharePayload(cleanCode);

    if (win?.tap && typeof win.tap.shareAppMessage === 'function') {
      return new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        try {
          win.tap.shareAppMessage({
            ...payload,
            success: () => finish({
              ok: true,
              mode: 'shareAppMessage',
              roomCode: cleanCode,
              query: payload.query,
              message: `已唤起 TapTap 组队分享（房号 ${cleanCode}）`,
            }),
            fail: () => finish({
              ok: false,
              mode: 'shareAppMessage',
              roomCode: cleanCode,
              query: payload.query,
              message: `组队分享已取消，可直接告知好友房号 ${cleanCode}`,
            }),
          });
          setTimeout(() => finish({
            ok: true,
            mode: 'shareAppMessage',
            roomCode: cleanCode,
            query: payload.query,
            message: `已发送 TapTap 组队邀请（房号 ${cleanCode}）`,
          }), 60);
        } catch {
          finish({
            ok: false,
            mode: 'shareAppMessage_error',
            roomCode: cleanCode,
            query: payload.query,
            message: `分享面板暂忙，请告知好友房号 ${cleanCode}`,
          });
        }
      });
    }

    if (win?.tap && typeof win.tap.showShareboard === 'function') {
      return new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        try {
          win.tap.showShareboard({
            ...payload,
            success: () => finish({
              ok: true,
              mode: 'showShareboard',
              roomCode: cleanCode,
              query: payload.query,
              message: `已打开 TapTap 分享面板（房号 ${cleanCode}）`,
            }),
            fail: () => finish({
              ok: false,
              mode: 'showShareboard',
              roomCode: cleanCode,
              query: payload.query,
              message: `已收起分享面板，可告知好友守夜房号 ${cleanCode}`,
            }),
          });
          setTimeout(() => finish({
            ok: true,
            mode: 'showShareboard',
            roomCode: cleanCode,
            query: payload.query,
            message: `已唤起 TapTap 分享面板（房号 ${cleanCode}）`,
          }), 60);
        } catch {
          finish({
            ok: false,
            mode: 'showShareboard_error',
            roomCode: cleanCode,
            query: payload.query,
            message: `分享面板暂忙，请告知好友房号 ${cleanCode}`,
          });
        }
      });
    }

    if (isMockEnabled()) {
      let targetName = 'TapTap 在线好友';
      for (const f of mockFriends) {
        if (!friendId || f.id === friendId) {
          f.invited = true;
          f.invitedRoom = cleanCode;
          if (friendId && f.id === friendId) targetName = f.name;
        }
      }
      const receipt = {
        friendId: friendId || 'all',
        roomCode: cleanCode,
        query: payload.query,
        at: Date.now(),
      };
      inviteReceipts.push(receipt);
      return {
        ok: true,
        mode: 'mock',
        roomCode: cleanCode,
        query: payload.query,
        message: `已向 ${targetName} 发送同守五更组队邀请（房号 ${cleanCode}）`,
      };
    }

    return copyOfflineInviteText(cleanCode);
  }

  return {
    sanitizeRoomCode,
    extractLaunchRoomCode: () => extractLaunchRoomCode(win),
    isMockEnabled,
    hasNativeFriendApi,
    getFriends,
    getInviteReceipts: () => [...inviteReceipts],
    openFriendList,
    inviteFriendToRoom,
    buildSharePayload,
  };
}
