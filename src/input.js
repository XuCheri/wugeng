// 浮动摇杆输入：单指在屏幕任意位置按下即为摇杆中心，拖动方向即移动方向。
// 大招按钮区域由渲染层提供（getUltButtonRect），点击该区域触发「敲更锣」。
// 桌面调试：WASD / 方向键移动，空格放大招。

const DEAD_ZONE = 6;          // 像素：小于此位移视为未移动
const FULL_SPEED_RADIUS = 14; // 像素：轻推即满速，手指滑远或回拉转向都不会掉移速
const VISUAL_RADIUS = 42;     // 像素：屏幕摇杆圆环的视觉半径

export function createInput(target, { getUltRect = () => null } = {}) {
  const state = {
    moveX: 0, moveY: 0, ultimate: false,
    // 供渲染层画摇杆用：ox/oy 在整次按住期间固定在落指处，不追着手指跑
    stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, kx: 0, ky: 0 },
  };
  let stickPointer = null;
  let ultQueued = false;
  const keys = new Set();

  const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

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
      e.preventDefault();
      return;
    }
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    target.setPointerCapture?.(e.pointerId);
    Object.assign(state.stick, { active: true, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, kx: 0, ky: 0 });
    state.moveX = 0; state.moveY = 0;
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId !== stickPointer) return;
    updateStick(e.clientX, e.clientY);
    e.preventDefault();
  }
  function onUp(e) {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    state.stick.active = false;
    state.moveX = 0; state.moveY = 0;
  }
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (k === ' ') ultQueued = true;
      keys.add(k);
    } else keys.delete(k);
  }
  function onBlur() {
    keys.clear();
    stickPointer = null;
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
    /** 每个逻辑步读取一次；大招点击是一次性的。 */
    sample() {
      let mx = state.moveX, my = state.moveY;
      if (stickPointer === null && keys.size) {
        mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
        const l = Math.hypot(mx, my);
        if (l > 1) { mx /= l; my /= l; }
      }
      const ultimate = ultQueued;
      ultQueued = false;
      return { moveX: mx, moveY: my, ultimate };
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
