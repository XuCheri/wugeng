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
    const fallback = h('div', { class: 'privacy-body' },
      h('h2', {}, '一、开发者与数据保护承诺'),
      h('p', {}, '《五更天》由剑清酱工作室（开发者「剑清酱」）研发，不自建账号体系，不收集手机号、通讯录或精确位置等个人敏感信息。'),
      h('h2', {}, '二、云存档、排行榜、好友与多人联机'),
      h('p', {}, '1. 云存档：游戏进度保存在本机 localStorage，并在 TapTap 环境内同步至你的 TapTap 云存档（v3）。'),
      h('p', {}, '2. 排行榜：结算积分可上报至 TapTap「五更守夜总榜」（c5mzumajes9houq0ra）、「每日异事榜」（ofuwiinc9n5khd1ehh）与「守夜令榜」（hxw70v121367vj083y），用于展示全服总榜与好友榜名次。'),
      h('p', {}, '3. 好友与分享：主动点击好友列表或组队邀请时调用 TapTap 好友与分享能力传递 6 位守夜房号。'),
      h('p', {}, '4. 多人联机：「同守五更」仅使用当前会话临时标识与点对点/同源通道同步房间角色外观及局内操作，结束后即刻释放。'),
      h('p', {}, h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '打开完整隐私政策')));
    holder.replaceChildren(fallback);
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
