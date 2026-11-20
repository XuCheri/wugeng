// DOM 小工具：不引框架，几行 h() 拼界面。
// 所有面板 = 宣纸装裱（上下天地杆）；所有主按钮 = 朱红印章（按下沉 2px）。

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

let clickSound = null;
/** UI 点击音（由 app 注入，避免 ui 直接依赖 audio）。 */
export function setClickSound(fn) { clickSound = fn; }

function guardTap(onClick) {
  let busy = false;
  return async (e) => {
    if (busy) return;
    e?.preventDefault?.();
    busy = true;
    try { clickSound?.(); await onClick?.(e); } finally { busy = false; }
  };
}

/** 朱红印章按钮。opts: { kind: 'seal'|'ghost'|'small', disabled, badge, cls, label } */
export function sealButton(text, onClick, opts = {}) {
  const kind = opts.kind || 'seal';
  const btn = h('button', {
    type: 'button',
    class: `btn btn--${kind}${opts.cls ? ' ' + opts.cls : ''}`,
    disabled: opts.disabled,
    'aria-label': opts.label,
  }, h('span', { class: 'btn__text' }, text));
  if (opts.badge !== undefined && opts.badge !== null) {
    btn.appendChild(h('span', { class: 'btn__badge' }, String(opts.badge)));
  }
  btn.addEventListener('click', guardTap(onClick));
  return btn;
}

const FILM_ICON = `<svg class="ad-film" viewBox="0 0 20 14" aria-hidden="true">
<path d="M2.2 1.6c5-.5 10.6-.4 15.6.1.4 3.6.4 7.1 0 10.7-5 .5-10.6.5-15.6-.1-.4-3.6-.4-7.1 0-10.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M2.4 4.3h1.6M2.4 7h1.6M2.4 9.7h1.6M16 4.3h1.6M16 7h1.6M16 9.7h1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
<path d="M8.3 4.4l4 2.6-4 2.6z" fill="currentColor"/></svg>`;

/** 广告按钮：左上角明确标「广告」+ 胶片小图标，文案直接写奖励。 */
export function adButton(text, onClick, opts = {}) {
  const btn = sealButton(text, onClick, { ...opts, cls: `btn--ad${opts.cls ? ' ' + opts.cls : ''}` });
  btn.prepend(h('span', { class: 'ad-tag', html: `${FILM_ICON}<span>广告</span>` }));
  return btn;
}

/** 宣纸装裱面板。 */
export function scroll({ title, sub, body = [], footer = [], cls = '' } = {}) {
  return h('section', { class: `scroll ${cls}` },
    h('i', { class: 'scroll__rod scroll__rod--top', 'aria-hidden': 'true' }),
    title ? h('header', { class: 'scroll__head' },
      h('h2', { class: 'scroll__title' }, title),
      sub ? h('p', { class: 'scroll__sub' }, sub) : null,
      h('div', { class: 'ink-rule', 'aria-hidden': 'true' })) : null,
    h('div', { class: 'scroll__body' }, body),
    footer && (Array.isArray(footer) ? footer.length : true) ? h('footer', { class: 'scroll__foot' }, footer) : null,
    h('i', { class: 'scroll__rod scroll__rod--bottom', 'aria-hidden': 'true' }));
}

/** 遮罩层（淡墨）。返回 { el, close }。 */
export function veil(root, content, { cls = '', onBackdrop } = {}) {
  const el = h('div', { class: `veil ${cls}`, role: 'dialog', 'aria-modal': 'true' }, content);
  if (onBackdrop) {
    el.addEventListener('click', (e) => { if (e.target === el) onBackdrop(); });
  }
  root.appendChild(el);
  return { el, close: () => el.remove() };
}

let toastTimer = 0;
export function toast(msg, ms = 1800) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    (document.getElementById('ui') || document.body).appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

/** 分段选择（设置项用）。options: [{ value, label }] */
export function segmented(label, options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const render = (v) => {
    clear(wrap);
    for (const o of options) {
      wrap.appendChild(h('button', {
        type: 'button', class: `seg__opt${o.value === v ? ' is-on' : ''}`, role: 'radio',
        'aria-checked': o.value === v ? 'true' : 'false',
        onClick: () => { clickSound?.(); render(o.value); onChange(o.value); },
      }, o.label));
    }
  };
  render(value);
  return h('div', { class: 'setting' }, h('span', { class: 'setting__label' }, label), wrap);
}

// ───────── 数字与时间 ─────────
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 0..99 → 汉字数字 */
export function cnNum(n) {
  n = Math.floor(n);
  if (n <= 10) return CN_DIGITS[Math.max(0, n)];
  if (n < 20) return '十' + CN_DIGITS[n - 10];
  if (n < 100) return CN_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
  return String(n);
}

function trimFixed(x, d) {
  return x.toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** 超过 1 万显示「1.2万」「3.4亿」。 */
export function formatBig(n) {
  n = Math.floor(Number(n) || 0);
  const neg = n < 0;
  const a = Math.abs(n);
  let s;
  if (a < 1e4) s = String(a);
  else if (a < 1e8) s = trimFixed(a / 1e4, a < 1e5 ? 1 : 0) + '万';
  else if (a < 1e12) s = trimFixed(a / 1e8, a < 1e9 ? 1 : 0) + '亿';
  else s = trimFixed(a / 1e12, 1) + '万亿';
  return neg ? '-' + s : s;
}

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatCoins(n) {
  return Math.floor(n || 0).toLocaleString('en-US');
}
