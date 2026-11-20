// 标题页：竖排大字《五更天》、朱印、开始守夜、适龄 12+、隐私。
import { h, sealButton } from './dom.js';
import { ageBadge, showAgeDialog, showPrivacyDialog } from './dialogs.js';

const ROOFTOPS = `<svg viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
<path d="M0 90V62l18-4 10-14 22 2 8-10 30 0 6 10 20 2 6-18 14-8 14 8 6 18 24-2 10 12 28-4 6-16 22-6 22 6 6 16 18 2 8-12 26 0 8 12 20 2 10-20 12-6 12 6 10 20 14 4V90z" fill="currentColor"/>
<path d="M168 38h28M290 34h24" stroke="currentColor" stroke-width="3"/></svg>`;

export function renderTitle(root, { onStart, version = '' }) {
  const el = h('div', { class: 'screen screen--title' },
    h('div', { class: 'title-art' },
      h('h1', { class: 'title-name', 'aria-label': '五更天' }, '五更天'),
      h('div', { class: 'title-side' },
        h('span', { class: 'title-seal', 'aria-hidden': 'true' }, '守夜'),
        h('p', { class: 'title-verse' }, '一更起，五更止，鸡鸣天亮'))),
    h('div', { class: 'title-roofs', html: ROOFTOPS }),
    h('div', { class: 'title-actions' },
      sealButton('开始守夜', onStart, { cls: 'btn--wide btn--big' })),
    h('footer', { class: 'title-foot' },
      ageBadge(() => showAgeDialog(root)),
      h('button', { type: 'button', class: 'link-btn', onClick: () => showPrivacyDialog(root) }, '隐私政策'),
      version ? h('span', { class: 'title-ver' }, version) : null));
  root.appendChild(el);
  return el;
}
