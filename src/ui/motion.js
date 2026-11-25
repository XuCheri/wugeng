// 动效编排引擎：提供手机独立游戏级别的页面过渡、弹窗离场残影（零竞态）、交错入场与触感反馈。
// 铁律：
//   1. 所有离场残影与转场帷幕严格 pointer-events: none 且剥离 .veil / role / data-action，不干扰 E2E 同步断言；
//   2. 不创建独立 rAF 轮询（全部基于 CSS keyframe + 轻量定时器清理）。

let transitionEl = null;
let transitionTimer = 0;

/**
 * 屏幕切换水墨灯影过渡帷幕（纯视觉、零阻塞，不延迟目标界面挂载）。
 * @param {HTMLElement} root
 * @param {'ink'|'dawn'|'battle'} [variant='ink']
 */
export function playScreenTransition(root, variant = 'ink') {
  if (typeof document === 'undefined' || !root) return;
  if (transitionEl) {
    transitionEl.remove();
    transitionEl = null;
  }
  clearTimeout(transitionTimer);

  const el = document.createElement('div');
  el.className = `screen-veil screen-veil--${variant}`;
  el.setAttribute('aria-hidden', 'true');
  root.appendChild(el);
  transitionEl = el;

  transitionTimer = setTimeout(() => {
    if (transitionEl === el) transitionEl = null;
    el.remove();
  }, 320);
}

/** 立即清理所有离场残影（打开新弹窗或切换屏幕时调用，保证零 DOM 顺序干扰）。 */
export function purgeExitGhosts(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  scope.querySelectorAll('.ui-exit-ghost').forEach((g) => g.remove());
}

/**
 * 为即将关闭的 .veil 创建纯视觉离场残影（约 240ms 合卷收拢 + 淡出），
 * 原 .veil 可立即从 DOM 同步卸载，兼顾丝滑离场动画与 0 竞态。
 * @param {HTMLElement} veilEl
 */
export function spawnVeilExitGhost(veilEl) {
  if (typeof document === 'undefined' || !veilEl || !veilEl.parentNode) return;
  // 检视抽屉与无动画模式不做残影，保证透视战场即时响应
  if (veilEl.classList.contains('veil--inspector')) return;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    return;
  }

  const host = veilEl.parentNode;
  purgeExitGhosts(host);
  const ghost = veilEl.cloneNode(true);
  // 彻底剥离语义与测试选择器，防止任何查询误把离场残影当成活跃弹窗
  ghost.className = 'ui-exit-ghost';
  ghost.removeAttribute('role');
  ghost.removeAttribute('aria-modal');
  ghost.removeAttribute('aria-label');
  ghost.setAttribute('aria-hidden', 'true');

  // 复制 canvas 位图，保证带画布的弹窗离场不白块
  const srcCanvases = veilEl.querySelectorAll('canvas');
  const dstCanvases = ghost.querySelectorAll('canvas');
  for (let i = 0; i < Math.min(srcCanvases.length, dstCanvases.length); i++) {
    const src = srcCanvases[i];
    const dst = dstCanvases[i];
    if (src.width > 0 && src.height > 0) {
      dst.width = src.width;
      dst.height = src.height;
      try {
        dst.getContext('2d')?.drawImage(src, 0, 0);
      } catch {}
    }
  }

  ghost.querySelectorAll('*').forEach((node) => {
    node.removeAttribute('id');
    node.removeAttribute('role');
    node.removeAttribute('aria-modal');
    if (node.dataset) {
      for (const k of Object.keys(node.dataset)) {
        delete node.dataset[k];
      }
    }
    if (node.classList) {
      node.classList.remove(
        'veil', 'cosmetic-shop-modal', 'achievements-modal', 'leaderboard-modal',
        'coop-modal', 'overlay--pause', 'overlay--chest', 'overlay--shrine',
        'overlay--levelup', 'overlay--dead', 'overlay--cleared',
      );
    }
  });

  // 标记内部面板执行收卷离场动画
  const panel = ghost.firstElementChild;
  if (panel) panel.classList.add('ui-exit-ghost__panel');

  host.appendChild(ghost);
  const cleanup = () => ghost.remove();
  ghost.addEventListener('animationend', (e) => {
    if (e.target === ghost) cleanup();
  }, { once: true });
  setTimeout(cleanup, 290);
}

/**
 * 为列表/卡牌容器注入交错入场序号（--stagger-i），配合 CSS .anim-stagger 实现发牌与卷轴落位感。
 * @param {HTMLElement} container
 * @param {string} [selector=':scope > *']
 * @param {number} [maxSteps=8]
 */
export function applyStagger(container, selector = ':scope > *', maxSteps = 8) {
  if (!container) return;
  const items = container.querySelectorAll(selector);
  let idx = 0;
  for (const item of items) {
    item.style.setProperty('--stagger-i', String(Math.min(idx, maxSteps)));
    item.classList.add('anim-stagger');
    idx++;
  }
}

/**
 * 触发一次性微动效（如铜钱跳动、签卡重抽、选中印章轻弹）。
 * @param {HTMLElement|null} el
 * @param {string} [cls='is-popping']
 * @param {number} [durationMs=280]
 */
export function pulseClass(el, cls = 'is-popping', durationMs = 280) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el._pulseTimer);
  el._pulseTimer = setTimeout(() => {
    el.classList.remove(cls);
  }, durationMs);
}
