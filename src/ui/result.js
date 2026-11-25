// 结算页：守夜积分、本局亮点（头功兵刃占比与最长连斩）、随身行囊一览、距下一目标进度条、多人同守功劳簿、主按钮「再守一夜」。
import { h, clear, scroll, sealButton, adButton, formatBig, formatTime, formatCoins } from './dom.js';
import { applyStagger } from './motion.js';
import { icon } from './icons.js';
import { heroInfo, weaponName, relicName, nightLabel, watchName, ACHIEVEMENT_NAMES } from './copy.js';
import { canShowResultDouble } from '../ads/ad-policy.js';

/**
 * opts: { summary, recorded: { coins, unlocks, achievements }, nextGoal?, getNextGoal?(),
 *         adsOn(), runAd(placement), onDouble(amount) → 实际加的铜钱,
 *         onHub(), onAgain(), onLeaderboard?() }
 */
export function renderResult(root, opts) {
  const { summary: s, recorded } = opts;
  let doubled = false;
  const cleared = !!s.cleared;
  const endless = s.mode === 'endless';
  const isCoop = (s.coopSize || 0) >= 2 || (Array.isArray(s.squad) && s.squad.length >= 2);
  const weapons = Array.isArray(s.weapons) ? s.weapons.filter(Boolean) : [];
  const relics = Array.isArray(s.relics) ? s.relics.filter(Boolean) : [];

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

  // 本局亮点：头功兵刃（伤害占比条）+ 最长连斩
  const topW = s.topWeapon && s.topWeapon.id
    ? s.topWeapon
    : weapons[0]?.id
      ? { id: weapons[0].id, damage: 0, share: 0 }
      : null;
  const maxCombo = Number.isFinite(s.maxCombo) && s.maxCombo > 0 ? Math.floor(s.maxCombo) : 0;
  let highlightBox = null;
  if (topW) {
    const ownedTop = weapons.find((w) => w.id === topW.id);
    const isEvo = !!ownedTop?.evolved;
    const wName = weaponName(topW.id, isEvo);
    const share = Math.max(0, Math.min(100, Math.round(topW.share || 0)));
    highlightBox = h('div', { class: 'result-highlight', 'aria-label': '本局亮点' },
      h('div', { class: `result-highlight__icon${isEvo ? ' is-evolved' : ''}` },
        icon(isEvo ? 'evo' : 'weapon', topW.id, 34, wName[0] || '器')),
      h('div', { class: 'result-highlight__info' },
        h('div', { class: 'result-highlight__head' },
          h('span', { class: 'result-highlight__tag' }, '头功兵刃'),
          h('b', { class: 'result-highlight__name' }, wName),
          maxCombo >= 2
            ? h('span', { class: 'result-highlight__combo' }, `最长连斩 ${formatBig(maxCombo)}`)
            : null),
        h('div', { class: 'result-bar', 'aria-hidden': 'true' },
          h('i', { class: 'result-bar__fill', style: { width: `${share}%` } })),
        h('p', { class: 'result-highlight__meta' },
          `总伤 ${formatBig(topW.damage || 0)} · 占比 ${share}%`)));
  }

  // 随身行囊：最终构筑一览（6 兵刃 + 6 法器图标）
  const evolvedWeapons = weapons.filter((w) => w.evolved);
  let loadoutBox = null;
  if (weapons.length || relics.length) {
    const items = [
      ...weapons.slice(0, 6).map((w) => {
        const name = weaponName(w.id, !!w.evolved);
        return h('div', {
          class: `result-loadout__item${w.evolved ? ' is-evolved' : ''}`,
          title: `${name} · ${w.evolved ? '已开光' : `${w.level || 1}阶`}`,
          'aria-label': `${name} ${w.evolved ? '已开光' : `${w.level || 1}阶`}`,
        },
        icon(w.evolved ? 'evo' : 'weapon', w.id, 28, name[0] || '器'),
        h('em', { class: 'result-loadout__lv' }, w.evolved ? '满' : String(w.level || 1)));
      }),
      ...relics.slice(0, 6).map((r) => {
        const name = relicName(r.id);
        return h('div', {
          class: 'result-loadout__item is-relic',
          title: `${name} · ${r.level || 1}阶`,
          'aria-label': `${name} ${r.level || 1}阶`,
        },
        icon('relic', r.id, 28, name[0] || '器'),
        h('em', { class: 'result-loadout__lv' }, String(r.level || 1)));
      }),
    ];
    loadoutBox = h('div', { class: 'result-loadout', 'aria-label': '随身行囊' },
      h('div', { class: 'result-loadout__head' },
        h('span', {}, '随身行囊'),
        h('em', {}, evolvedWeapons.length
          ? `开光 ${evolvedWeapons.length} 件`
          : `${weapons.length} 兵刃 · ${relics.length} 法器`)),
      h('div', { class: 'result-loadout__grid' }, items));
  }

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

  const unlockBox = h('div', { class: 'result-unlocks' });
  const unlocks = [
    ...(recorded.unlocks || []).map((u) => (u.kind === 'hero'
      ? `新打更人：${heroInfo(u.id).name}` : `${nightLabel(u.id)} 可选了`)),
    ...(recorded.achievements || []).slice(0, 4).map((a) => `达成功绩「${ACHIEVEMENT_NAMES[a] || a}」`).filter(Boolean),
  ];
  for (const t of unlocks) unlockBox.appendChild(h('p', { class: 'result-unlock' }, h('i', { class: 'stamp stamp--sm' }, '得'), t));
  if (unlocks.length) applyStagger(unlockBox, '.result-unlock', 6);

  // 距下一目标进度条
  const nextGoalHost = h('div', { class: 'result-next-goal-host' });
  const renderNextGoal = () => {
    clear(nextGoalHost);
    const goal = typeof opts.getNextGoal === 'function' ? opts.getNextGoal() : opts.nextGoal;
    if (!goal) {
      nextGoalHost.hidden = true;
      return;
    }
    nextGoalHost.hidden = false;
    const rem = Math.max(1, (goal.need || 0) - (goal.have || 0));
    const pct = Math.max(0, Math.min(100, Math.round(goal.pct || 0)));
    nextGoalHost.appendChild(h('div', {
      class: 'result-next-goal',
      dataset: { goalKind: goal.kind || '', goalId: goal.id || '' },
      'aria-label': '距下一目标',
    },
    h('div', { class: 'result-next-goal__head' },
      h('span', { class: 'result-next-goal__label' }, '距下一目标'),
      h('span', { class: 'result-next-goal__rem' }, `还差 ${formatBig(rem)}${goal.unit || ''}`)),
    h('div', { class: 'result-next-goal__row' },
      h('b', { class: 'result-next-goal__title' }, goal.title),
      h('span', { class: 'result-next-goal__num' }, `${formatBig(goal.have)} / ${formatBig(goal.need)}`)),
    h('div', { class: 'result-bar', 'aria-hidden': 'true' },
      h('i', { class: 'result-bar__fill', style: { width: `${pct}%` } })),
    goal.hint ? h('p', { class: 'result-next-goal__hint' }, goal.hint) : null));
  };
  renderNextGoal();

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
        renderNextGoal();
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
    // 主按钮「再守一夜」（朱印一键重开）在前，次按钮「回更房」（墨框）置末保持既有 E2E 顺序契约
    actions.appendChild(h('div', { class: 'result-actions__main' },
      sealButton('再守一夜', opts.onAgain, {
        kind: 'seal',
        cls: 'result-again-btn',
        dataset: { action: 'result-again' },
      }),
      sealButton('回更房', opts.onHub, {
        kind: 'ghost',
        cls: 'result-hub-btn',
        dataset: { action: 'result-hub' },
      })));
  };
  renderActions();

  const el = h('div', { class: `screen screen--result${cleared ? ' is-dawn' : ''}` },
    scroll({
      title, sub,
      cls: 'scroll--result',
      body: [scoreBox, coinBox, rows, highlightBox, loadoutBox, squadBox, unlocks.length ? unlockBox : null, nextGoalHost],
      footer: [actions],
    }));
  root.appendChild(el);
  return el;
}

function row(k, v) {
  return h('div', { class: 'result-row' }, h('dt', {}, k), h('dd', {}, v));
}
