// 结算页：守夜积分、五更守夜总榜入口、多人同守全队贡献榜与魁首 MVP 朱印、铜钱、开光神兵、新解锁与功绩、「广告 · 铜钱翻倍」。
import { h, clear, scroll, sealButton, adButton, formatBig, formatTime, formatCoins } from './dom.js';
import { applyStagger } from './motion.js';
import { heroInfo, weaponName, nightLabel, watchName, ACHIEVEMENT_NAMES } from './copy.js';
import { canShowResultDouble } from '../ads/ad-policy.js';

/**
 * opts: { summary, recorded: { coins, unlocks, achievements }, adsOn(), runAd(placement),
 *         onDouble(amount) → 实际加的铜钱, onHub(), onAgain(), onLeaderboard?() }
 */
export function renderResult(root, opts) {
  const { summary: s, recorded } = opts;
  let doubled = false;
  const cleared = !!s.cleared;
  const endless = s.mode === 'endless';
  const isCoop = (s.coopSize || 0) >= 2 || (Array.isArray(s.squad) && s.squad.length >= 2);

  const title = cleared && !endless ? '鸡鸣天亮' : endless ? '残夜守尽' : '灯灭了';
  const modeTag = isCoop ? `同守 ${s.coopSize || s.squad.length} 人` : heroInfo(s.heroId).short;
  const sub = `${modeTag} · ${nightLabel(s.nightLevel || 0)} · ${endless ? '守进无尽' : cleared ? '守满五更' : `撑到${watchName(s.reachedWatch || 1)}`}`;

  const scoreBox = Number.isFinite(s.score)
    ? h('div', { class: 'result-score' },
      h('span', {}, '守夜总分'),
      h('b', {}, formatCoins(s.score)),
      h('small', { class: 'result-score__unit' }, '分'),
      s.signatureStart ? h('em', { class: 'result-score__sig' }, '本命专精') : null)
    : null;

  const coinVal = h('b', { class: 'result-coins__val' }, formatCoins(recorded.coins));
  const coinBox = h('div', { class: 'result-coins' }, h('span', {}, '铜钱'), coinVal);
  const rows = h('dl', { class: 'result-rows' },
    row('守了', formatTime(s.timeSec)),
    row('打散', `${formatBig(s.kills)} 只`),
    row('最狠一击', formatBig(s.maxHit)),
    row(isCoop ? '扶起同袍' : '等级', isCoop ? `${s.revivesDone || 0} 回` : String(s.level ?? '—')));
  applyStagger(rows, '.result-row', 4);

  // 联机小队贡献榜与魁首 MVP 印章（F14）
  let squadBox = null;
  if (isCoop && Array.isArray(s.squad) && s.squad.length >= 2) {
    squadBox = h('div', { class: 'result-squad', 'aria-label': '同守小队贡献榜' },
      h('p', { class: 'result-squad__title' }, '同守五更 · 诸位道友功劳簿'),
      ...s.squad.map((m) => h('div', {
        class: `result-squad__row${m.mvp ? ' is-mvp' : ''}`,
        dataset: { slot: String(m.slot ?? 0) },
      },
      h('div', { class: 'result-squad__who' },
        h('b', {}, m.name || heroInfo(m.heroId).short),
        h('span', { class: 'result-squad__hero' }, heroInfo(m.heroId).short),
        m.mvp ? h('span', { class: 'mvp-seal' }, '守夜魁首') : null),
      h('div', { class: 'result-squad__stats' },
        h('span', {}, `伤 ${formatBig(m.damageDealt || 0)}`),
        h('span', {}, `斩 ${m.kills || 0}`),
        h('span', {}, `救 ${m.revivesDone || 0}`)))));
    applyStagger(squadBox, '.result-squad__row', 4);
  }

  const evolvedWeapons = (s.weapons || []).filter((w) => w && w.evolved).map((w) => weaponName(w.id, true));
  const evoLine = evolvedWeapons.length
    ? h('p', { class: 'result-build' }, `开光神兵：${evolvedWeapons.join(' · ')}`)
    : null;

  const unlockBox = h('div', { class: 'result-unlocks' });
  const unlocks = [
    ...(recorded.unlocks || []).map((u) => (u.kind === 'hero'
      ? `新打更人：${heroInfo(u.id).name}` : `${nightLabel(u.id)} 可选了`)),
    ...(recorded.achievements || []).slice(0, 4).map((a) => `达成功绩「${ACHIEVEMENT_NAMES[a] || a}」`).filter(Boolean),
  ];
  for (const t of unlocks) unlockBox.appendChild(h('p', { class: 'result-unlock' }, h('i', { class: 'stamp stamp--sm' }, '得'), t));
  if (unlocks.length) applyStagger(unlockBox, '.result-unlock', 6);

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
    if (opts.onLeaderboard) {
      actions.appendChild(sealButton('五更守夜总榜', () => opts.onLeaderboard(), {
        kind: 'ghost',
        cls: 'btn--wide result-lb-btn',
        dataset: { action: 'result-leaderboard' },
      }));
    }
    actions.append(
      sealButton('再守一夜', opts.onAgain, { kind: 'ghost', cls: 'btn--wide' }),
      sealButton('回更房', opts.onHub, { cls: 'btn--wide' }));
  };
  renderActions();

  const el = h('div', { class: `screen screen--result${cleared ? ' is-dawn' : ''}` },
    scroll({
      title, sub,
      cls: 'scroll--result',
      body: [scoreBox, coinBox, rows, squadBox, evoLine, unlocks.length ? unlockBox : null],
      footer: [actions],
    }));
  root.appendChild(el);
  return el;
}

function row(k, v) {
  return h('div', { class: 'result-row' }, h('dt', {}, k), h('dd', {}, v));
}
