// 结算页：铜钱、打散数、守了多久、最狠一击（万/亿）、新解锁、「广告 · 铜钱翻倍」一次。
import { h, clear, scroll, sealButton, adButton, formatBig, formatTime, formatCoins } from './dom.js';
import { heroInfo, nightLabel, watchName, ACHIEVEMENT_NAMES } from './copy.js';
import { canShowResultDouble } from '../ads/ad-policy.js';

/**
 * opts: { summary, recorded: { coins, unlocks, achievements }, adsOn(), runAd(placement),
 *         onDouble(amount) → 实际加的铜钱, onHub(), onAgain() }
 */
export function renderResult(root, opts) {
  const { summary: s, recorded } = opts;
  let doubled = false;
  const cleared = !!s.cleared;
  const endless = s.mode === 'endless';

  const title = cleared && !endless ? '鸡鸣天亮' : endless ? '残夜守尽' : '灯灭了';
  const sub = `${heroInfo(s.heroId).short} · ${nightLabel(s.nightLevel || 0)} · ${endless ? '守进无尽' : cleared ? '守满五更' : `撑到${watchName(s.reachedWatch || 1)}`}`;

  const coinVal = h('b', { class: 'result-coins__val' }, formatCoins(recorded.coins));
  const coinBox = h('div', { class: 'result-coins' }, h('span', {}, '铜钱'), coinVal);
  const rows = h('dl', { class: 'result-rows' },
    row('守了', formatTime(s.timeSec)),
    row('打散', `${formatBig(s.kills)} 只`),
    row('最狠一击', formatBig(s.maxHit)),
    row('等级', String(s.level ?? '—')));

  const unlockBox = h('div', { class: 'result-unlocks' });
  const unlocks = [
    ...(recorded.unlocks || []).map((u) => (u.kind === 'hero'
      ? `新打更人：${heroInfo(u.id).name}` : `${nightLabel(u.id)} 可选了`)),
    ...(recorded.achievements || []).map((a) => ACHIEVEMENT_NAMES[a]).filter(Boolean),
  ];
  for (const t of unlocks) unlockBox.appendChild(h('p', { class: 'result-unlock' }, h('i', { class: 'stamp stamp--sm' }, '得'), t));

  const actions = h('div', { class: 'result-actions' });
  const renderActions = () => {
    clear(actions);
    if (canShowResultDouble(opts.adsOn(), s, doubled)) {
      actions.appendChild(adButton('看广告 · 铜钱翻倍', async () => {
        const res = await opts.runAd('resultDouble');
        if (res !== 'completed' || doubled) return;
        doubled = true;
        const add = opts.onDouble(recorded.coins);
        coinVal.textContent = formatCoins(recorded.coins + add);
        coinBox.classList.add('is-doubled');
        renderActions();
      }, { cls: 'btn--wide' }));
    }
    actions.append(
      sealButton('回更房', opts.onHub, { cls: 'btn--wide' }),
      sealButton('再守一夜', opts.onAgain, { kind: 'ghost', cls: 'btn--wide' }));
  };
  renderActions();

  const el = h('div', { class: `screen screen--result${cleared ? ' is-dawn' : ''}` },
    scroll({
      title, sub,
      cls: 'scroll--result',
      body: [coinBox, rows, unlocks.length ? unlockBox : null],
      footer: [actions],
    }));
  root.appendChild(el);
  return el;
}

function row(k, v) {
  return h('div', { class: 'result-row' }, h('dt', {}, k), h('dd', {}, v));
}
