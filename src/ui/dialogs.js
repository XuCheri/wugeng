// 弹窗：适龄提示、隐私政策、确认框。
import { h, scroll, sealButton, veil } from './dom.js';
import { AGE_TIPS } from './copy.js';

export function ageBadge(onClick) {
  return h('button', {
    type: 'button', class: 'age-badge', 'aria-label': '适龄提示：12 岁以上', onClick,
  },
  h('span', { class: 'age-badge__num' }, '12+'),
  h('span', { class: 'age-badge__org' }, 'CADPA'));
}

export function showAgeDialog(root) {
  let v;
  const panel = scroll({
    title: '适龄提示',
    sub: '12+ · 适合 12 周岁及以上用户',
    cls: 'scroll--dialog',
    body: h('ol', { class: 'age-list' }, AGE_TIPS.map((t) => h('li', {}, t))),
    footer: [sealButton('知道了', () => v.close())],
  });
  v = veil(root, panel, { onBackdrop: () => v.close() });
  return v;
}

let privacyCache = null;
async function loadPrivacy() {
  if (privacyCache) return privacyCache.cloneNode(true);
  const res = await fetch('privacy.html', { cache: 'no-cache' });
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const main = doc.querySelector('main') || doc.body;
  main.querySelectorAll('script, style, link, .privacy-back').forEach((n) => n.remove());
  const box = document.createElement('div');
  box.className = 'privacy-body';
  box.append(...Array.from(main.childNodes).map((n) => document.importNode(n, true)));
  privacyCache = box;
  return box.cloneNode(true);
}

export function showPrivacyDialog(root) {
  let v;
  const holder = h('div', { class: 'privacy-holder' }, h('p', { class: 'muted' }, '翻找中……'));
  const panel = scroll({
    title: '隐私政策',
    cls: 'scroll--dialog scroll--tall',
    body: holder,
    footer: [sealButton('合上', () => v.close())],
  });
  v = veil(root, panel, { onBackdrop: () => v.close() });
  loadPrivacy().then((body) => {
    holder.replaceChildren(body);
  }).catch(() => {
    holder.replaceChildren(
      h('p', {}, '本游戏进度仅保存在本机及你的 TapTap 云存档中，不另行收集个人敏感信息。'),
      h('p', {}, h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '打开完整隐私政策')));
  });
  return v;
}

/** 确认框：resolve(true/false)。 */
export function confirmDialog(root, { title, text, ok = '是', cancel = '再想想' }) {
  return new Promise((resolve) => {
    let v;
    const done = (r) => { v.close(); resolve(r); };
    const panel = scroll({
      title,
      cls: 'scroll--dialog',
      body: text ? h('p', { class: 'dialog-text' }, text) : null,
      footer: [sealButton(ok, () => done(true)), sealButton(cancel, () => done(false), { kind: 'ghost' })],
    });
    v = veil(root, panel, { cls: 'veil--top' });
  });
}
