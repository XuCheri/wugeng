// 浮动摇杆输入：单指在屏幕任意位置按下即为摇杆中心，拖动方向即移动方向。
// 大招按钮区域由渲染层提供（getUltButtonRect），点击该区域触发「敲更锣」。
// 桌面调试：WASD / 方向键移动，空格放大招，E / F 交互街角奇遇。

const DEAD_ZONE = 6;          // 像素：小于此位移视为未移动
const FULL_SPEED_RADIUS = 14; // 像素：轻推即满速，手指滑远或回拉转向都不会掉移速
const VISUAL_RADIUS = 42;     // 像素：屏幕摇杆圆环的视觉半径
const FLICK_DIST = 30;        // 像素：甩指瞬闪最小位移
const FLICK_MAX_MS = 185;     // 毫秒：按下→快速甩指抬起的最大时长
const WHIP_DIST = 38;         // 像素：按住行步途中猛甩瞬闪的窗口位移
const WHIP_WINDOW_MS = 95;    // 毫秒：行步途中猛甩检测时间窗

function eventTimeMs(e) {
  if (e && typeof e.timeStamp === 'number' && Number.isFinite(e.timeStamp) && e.timeStamp >= 0) {
    return e.timeStamp;
  }
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function createInput(target, { getUltRect = () => null } = {}) {
  const state = {
    moveX: 0, moveY: 0, ultimate: false,
    // 供渲染层画摇杆用：ox/oy 在整次按住期间固定在落指处，不追着手指跑
    stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, kx: 0, ky: 0 },
  };
  let stickPointer = null;
  let downAtMs = 0;
  let lastDashGestureMs = -1000;
  let trail = [];
  let ultQueued = false;
  let interactQueued = false;
  let dashQueued = false;
  let dashVecX = 0;
  let dashVecY = 0;
  const keys = new Set();

  const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function queueDashVector(dx, dy, nowMs) {
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return;
    dashQueued = true;
    dashVecX = dx / len;
    dashVecY = dy / len;
    lastDashGestureMs = nowMs;
  }

  function updateStick(x, y) {
    const s = state.stick;
    s.x = x; s.y = y;
    const dx = x - s.ox, dy = y - s.oy;
    const len = Math.hypot(dx, dy);
    if (len < DEAD_ZONE) {
      state.moveX = 0; state.moveY = 0;
      s.kx = 0; s.ky = 0;
      return;
    }
    const nx = dx / len, ny = dy / len;
    const m = Math.min(1, (len - DEAD_ZONE) / (FULL_SPEED_RADIUS - DEAD_ZONE));
    state.moveX = nx * m;
    state.moveY = ny * m;
    const vis = Math.min(len, VISUAL_RADIUS);
    s.kx = nx * vis;
    s.ky = ny * vis;
  }

  function onDown(e) {
    if (inRect(getUltRect(), e.clientX, e.clientY)) {
      ultQueued = true;
      e.preventDefault?.();
      return;
    }
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    downAtMs = eventTimeMs(e);
    trail = [{ x: e.clientX, y: e.clientY, t: downAtMs }];
    target.setPointerCapture?.(e.pointerId);
    Object.assign(state.stick, { active: true, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, kx: 0, ky: 0 });
    state.moveX = 0; state.moveY = 0;
    e.preventDefault?.();
  }
  function onMove(e) {
    if (e.pointerId !== stickPointer) return;
    const nowMs = eventTimeMs(e);
    updateStick(e.clientX, e.clientY);
    trail.push({ x: e.clientX, y: e.clientY, t: nowMs });
    while (trail.length > 8 && nowMs - trail[0].t > WHIP_WINDOW_MS) trail.shift();
    // 行步中拇指突然大幅猛甩（无需抬指也能瞬闪）：需已按住 >= 120ms 且窗口位移 >= WHIP_DIST
    if (nowMs - downAtMs >= 120 && nowMs - lastDashGestureMs >= 300 && trail.length >= 2) {
      const anchor = trail[0];
      const dtMs = nowMs - anchor.t;
      const wdx = e.clientX - anchor.x;
      const wdy = e.clientY - anchor.y;
      const wLen = Math.hypot(wdx, wdy);
      const fromOrigin = Math.hypot(e.clientX - state.stick.ox, e.clientY - state.stick.oy);
      if (dtMs >= 8 && dtMs <= WHIP_WINDOW_MS && wLen >= WHIP_DIST && fromOrigin >= VISUAL_RADIUS + 6) {
        queueDashVector(wdx, wdy, nowMs);
        trail = [{ x: e.clientX, y: e.clientY, t: nowMs }];
      }
    }
    e.preventDefault?.();
  }
  function onUp(e) {
    if (e.pointerId !== stickPointer) return;
    const nowMs = eventTimeMs(e);
    const upX = typeof e.clientX === 'number' ? e.clientX : state.stick.x;
    const upY = typeof e.clientY === 'number' ? e.clientY : state.stick.y;
    const dtMs = nowMs - downAtMs;
    const fdx = upX - state.stick.ox;
    const fdy = upY - state.stick.oy;
    if (dtMs >= 8 && dtMs <= FLICK_MAX_MS && Math.hypot(fdx, fdy) >= FLICK_DIST && nowMs - lastDashGestureMs >= 220) {
      queueDashVector(fdx, fdy, nowMs);
    }
    stickPointer = null;
    trail.length = 0;
    state.stick.active = false;
    state.moveX = 0; state.moveY = 0;
  }
  function onKey(e) {
    const k = (e.key || '').toLowerCase();
    if (e.type === 'keydown') {
      if (k === ' ') ultQueued = true;
      if (!e.repeat && (k === 'e' || k === 'f')) interactQueued = true;
      if (!e.repeat && k === 'shift') dashQueued = true;
      keys.add(k);
    } else keys.delete(k);
  }
  function onBlur() {
    keys.clear();
    stickPointer = null;
    trail.length = 0;
    ultQueued = false;
    interactQueued = false;
    dashQueued = false;
    dashVecX = 0;
    dashVecY = 0;
    state.stick.active = false;
    state.moveX = 0; state.moveY = 0;
  }

  target.addEventListener('pointerdown', onDown, { passive: false });
  target.addEventListener('pointermove', onMove, { passive: false });
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);

  return {
    state,
    /** 每个逻辑步读取一次；大招点击、奇遇交互与甩指瞬闪是一次性的。 */
    sample() {
      let mx = state.moveX, my = state.moveY;
      if (stickPointer === null && keys.size) {
        mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
        const l = Math.hypot(mx, my);
        if (l > 1) { mx /= l; my /= l; }
      }
      const ultimate = ultQueued;
      const interact = interactQueued;
      const dash = dashQueued;
      if (dash && mx === 0 && my === 0 && (dashVecX !== 0 || dashVecY !== 0)) {
        mx = dashVecX;
        my = dashVecY;
      }
      ultQueued = false;
      interactQueued = false;
      dashQueued = false;
      dashVecX = 0;
      dashVecY = 0;
      return { moveX: mx, moveY: my, ultimate, interact, dash };
    },
    reset: onBlur,
    destroy() {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    },
  };
}
