// 局内覆盖层：暂停按钮、奇遇交互印、三选一（常规签/守夜命签 + 留签/弃签）、供盒敕封开光、街角奇遇、暂停行囊（羁绊/命签）、复活、鸡鸣通关。
// 所有对 run 的改动都通过 sim 函数完成，然后由这里决定 resume 还是弹下一个界面。
import { h, clear, scroll, sealButton, adButton, veil, toast, cnNum } from './dom.js';
import {
  describeChoice, weaponName, relicName, pairOf, weaponPairRelic, relicTotalDesc,
  weaponTags, relicTags, schoolName, SCHOOL_TAG_IDS, blessingInfo,
  EVOLVE_INTRO, RECIPE_LABELS, RECIPE_SHORT, SHRINE_PROMPT_TEXT, SHRINE_FLAVOR,
  watchName, nightLabel,
} from './copy.js';
import { icon } from './icons.js';
import { settingsBody } from './settings.js';
import { confirmDialog } from './dialogs.js';
import { canShowRerollAd, canShowReviveAd } from '../ads/ad-policy.js';
import { MAX_WEAPONS, MAX_RELICS, MAX_WEAPON_LEVEL, PLAYER_BASE } from '../sim/balance.js';

const KIND_GLYPH = { coin: '钱', bun: '包', overflow: '溢' };
const SHRINE_GLYPH = { altar: '坛', trial: '碑', peddler: '货' };

function schoolPills(tags) {
  if (!tags || !tags.length) return null;
  return tags.map((t) => h('span', { class: `school-pill school-pill--${t}` }, schoolName(t)));
}

function computeCardHint(r, c, d) {
  if (!r || !c) return '';
  if (d.kind === 'blessing') return d.evolveHint || '不占兵刃法器栏位';
  if (d.evolvable) {
    const targetName = weaponName(d.evolveTargetId || c.id, true);
    return `可开光 · 供盒敕封「${targetName}」`;
  }
  const counts = r.synergies?.counts || {};
  if (c.kind === 'weapon') {
    const pair = weaponPairRelic(c.id);
    const hasPair = pair && (r.relics || []).some((x) => x.id === pair);
    const tags = d.tags || weaponTags(c.id);
    let bestTag = tags[0] || '';
    let bestCnt = bestTag ? (counts[bestTag] || 0) : 0;
    for (const t of tags) {
      if ((counts[t] || 0) > bestCnt) { bestTag = t; bestCnt = counts[t] || 0; }
    }
    if (hasPair) return `本命「${relicName(pair)}」已配 · 伍级开光`;
    if (bestCnt >= 2) return `流派共鸣 · ${schoolName(bestTag)} ${bestCnt}/3`;
    if (pair) return `配「${relicName(pair)}」或同门三器开光`;
    return '';
  }
  if (c.kind === 'relic') {
    const pair = pairOf(c.id);
    const hasPairW = pair && (r.weapons || []).some((w) => w.id === pair && !w.evolved);
    const tags = d.tags || relicTags(c.id);
    let bestTag = tags[0] || '';
    let bestCnt = bestTag ? (counts[bestTag] || 0) : 0;
    for (const t of tags) {
      if ((counts[t] || 0) > bestCnt) { bestTag = t; bestCnt = counts[t] || 0; }
    }
    if (hasPairW) return `本命配「${weaponName(pair)}」增伤 +18%`;
    if (c.level >= 5) return '满阶法器 · 助满级兵刃开光';
    if (bestCnt >= 1) return `流派共鸣 · ${schoolName(bestTag)} ${bestCnt}/3`;
  }
  return '';
}

/**
 * deps: { game, sim: { chooseUpgrade, rerollChoices, banishChoice, toggleLockChoice, grantAdRerolls,
 *                      openChest, interactShrine, resolveShrine, dismissShrine, revive, enterEndless,
 *                      getEvolutionRecipe, canEvolve },
 *         adsOn(), runAd(placement), getSettings(), onSettings(s), onFinish(), onCodexSync?(run), audio }
 */
export function createRunUI(root, deps) {
  const { game, sim } = deps;
  let hud = null;
  let hudMounted = false;
  let shrineBtn = null;
  let shrineSealEl = null;
  let shrineLabelEl = null;
  let shrineMounted = false;
  let lastShrineId = null;
  let current = null;      // { type, close, el, sync? }
  let hintEl = null;

  const run = () => game.run;

  function mountHud() {
    unmountHud();
    hud = h('button', {
      type: 'button', class: 'pause-btn', 'aria-label': '暂停',
      onClick: () => { deps.audio?.play('click'); showPause(); },
    }, h('span', {}, '歇'));
    shrineSealEl = h('i', { class: 'shrine-prompt__seal', 'aria-hidden': 'true' }, '坛');
    shrineLabelEl = h('span', { class: 'shrine-prompt__text' }, '参拜香案');
    shrineBtn = h('button', {
      type: 'button',
      class: 'shrine-prompt',
      dataset: { action: 'interact-shrine' },
      onClick: () => {
        const r = run();
        if (!r || r.status !== 'playing' || current) return;
        if (sim.interactShrine?.(r)) {
          deps.audio?.play('woodblock');
          handleStatus(r, true);
        }
      },
    }, shrineSealEl, shrineLabelEl);
    hudMounted = true;
    shrineMounted = false;
    lastShrineId = null;
    root.appendChild(hud);
    syncHud(run());
  }

  function unmountHud() {
    hudMounted = false;
    hud?.remove();
    hud = null;
    shrineBtn?.remove();
    shrineBtn = null;
    shrineSealEl = null;
    shrineLabelEl = null;
    shrineMounted = false;
    lastShrineId = null;
  }

  function syncHud(r = run()) {
    if (current?.type === 'shrine' && typeof current.sync === 'function') {
      current.sync(r);
    }
    if (!hudMounted || !shrineBtn) return;
    const s = (!current && r && r.status === 'playing' && r.nearbyShrine && !r.nearbyShrine.used && !r.nearbyShrine.active)
      ? r.nearbyShrine
      : null;
    if (s) {
      if (s.id !== lastShrineId) {
        lastShrineId = s.id;
        shrineBtn.dataset.shrineKind = s.kind;
        shrineBtn.dataset.shrineId = String(s.id);
        shrineSealEl.textContent = SHRINE_GLYPH[s.kind] || '奇';
        shrineLabelEl.textContent = SHRINE_PROMPT_TEXT[s.kind] || '街角奇遇';
      }
      if (!shrineMounted) {
        root.appendChild(shrineBtn);
        shrineMounted = true;
      }
    } else if (shrineMounted) {
      shrineBtn.remove();
      shrineMounted = false;
      lastShrineId = null;
    }
  }

  function open(type, content, cls = '', attrs = {}) {
    closeCurrent();
    game.pause();
    const v = veil(root, content, {
      cls: `veil--run overlay overlay--${type}${cls ? ' ' + cls : ''}`,
      attrs,
    });
    current = { type, close: v.close, el: v.el };
    if (hud) hud.hidden = true;
    syncHud(null);
    return v;
  }

  function closeCurrent() {
    current?.close();
    current = null;
    if (hud) hud.hidden = false;
    syncHud(run());
  }

  /** 操作完 run 之后：还在 playing 就继续；否则弹出对应界面。 */
  function proceed() {
    const r = run();
    if (!r) return;
    if (r.status === 'playing') {
      closeCurrent();
      game.resume();
      syncHud(r);
    } else {
      handleStatus(r, true);
    }
  }

  function handleStatus(r, force = false) {
    if (!r) return;
    if (!force && current && current.type === r.status) return;
    switch (r.status) {
      case 'levelup': showLevelUp(); break;
      case 'chest': showChest(); break;
      case 'shrine': showShrine(); break;
      case 'dead': showRevive(); break;
      case 'cleared': showCleared(); break;
      case 'playing':
        if (current && current.type !== 'pause') closeCurrent();
        syncHud(r);
        break;
      default: break;
    }
  }

  // ───────── 三选一（常规升级签 & 守夜命签）─────────
  function showLevelUp() {
    const initRun = run();
    const initMode = initRun?.choiceMode === 'blessing' ? 'blessing' : 'normal';
    const titleEl = h('h2', { class: 'levelup-title' }, initMode === 'blessing' ? '守夜命签' : '抽一支签');
    const sub = h('p', { class: 'levelup-sub' });
    const cards = h('div', { class: 'qian-row' });
    const actions = h('div', { class: 'levelup-actions' });
    const wrapEl = h('div', { class: 'levelup', dataset: { choiceMode: initMode } }, titleEl, sub, cards, actions);

    const v = open('levelup', wrapEl, '', { dataset: { choiceMode: initMode } });

    let picked = false;
    const pick = (i) => {
      if (picked) return;
      picked = true;
      sim.chooseUpgrade(run(), i);
      deps.onCodexSync?.(run());
      deps.audio?.play('woodblock');
      picked = false;
      if (run()?.status === 'levelup') { render(); return; }   // 连升或命签转升级：原地刷新签面与模式
      proceed();
    };

    function render() {
      const rr = run();
      if (!rr) return;
      const mode = rr.choiceMode === 'blessing' ? 'blessing' : 'normal';
      v.el.dataset.choiceMode = mode;
      wrapEl.dataset.choiceMode = mode;
      v.el.classList.toggle('is-blessing-mode', mode === 'blessing');

      if (mode === 'blessing') {
        titleEl.textContent = '守夜命签';
        sub.textContent = `${watchName(rr.watch)}交更 · 择一道命签（不占器物栏）`;
      } else {
        titleEl.textContent = '抽一支签';
        const banishCnt = rr.banishesLeft || 0;
        sub.textContent = `升到${cnNum(rr.player?.level ?? 1)}级 · 挑一支${banishCnt > 0 ? ` · 弃签余${banishCnt}` : ''}`;
      }

      clear(cards);
      (rr.choices || []).forEach((c, i) => {
        const d = describeChoice(c);
        const isBlessing = mode === 'blessing' || d.kind === 'blessing';
        const isCursed = d.tier === 'cursed';
        const isLocked = !isBlessing && !!c.locked;
        const glyph = KIND_GLYPH[d.kind] || (d.name || '？')[0];
        const hint = computeCardHint(rr, c, d);

        const cardCls = [
          'qian',
          d.isNew && !isBlessing ? 'is-new' : '',
          d.evolvable ? 'is-evo' : '',
          isLocked ? 'is-locked' : '',
          isBlessing ? 'qian--blessing' : '',
          isBlessing ? (isCursed ? 'qian--cursed' : 'qian--auspicious') : '',
        ].filter(Boolean).join(' ');

        const cardDataset = {
          choiceIndex: String(i),
          itemId: String(c.id),
          itemKind: String(c.kind),
          locked: isLocked ? 'true' : 'false',
        };
        if (d.tier) cardDataset.tier = d.tier;

        let actsEl = null;
        if (!isBlessing) {
          const canBanish = (rr.banishesLeft || 0) > 0 && (c.kind === 'weapon' || c.kind === 'relic');
          actsEl = h('div', { class: 'qian__acts' },
            h('button', {
              type: 'button',
              class: `qian-act${isLocked ? ' is-on' : ''}`,
              dataset: { action: 'lock', choiceIndex: String(i) },
              'aria-pressed': isLocked ? 'true' : 'false',
              'aria-label': `${isLocked ? '取消留签' : '留签'}：${d.name}`,
              onClick: (e) => {
                e.stopPropagation();
                if (sim.toggleLockChoice?.(run(), i)) {
                  deps.audio?.play('paper');
                  render();
                }
              },
            }, isLocked ? '已留' : '留签'),
            h('button', {
              type: 'button',
              class: 'qian-act qian-act--banish',
              disabled: !canBanish,
              dataset: { action: 'banish', choiceIndex: String(i) },
              'aria-label': `弃签：${d.name}`,
              onClick: (e) => {
                e.stopPropagation();
                if (!sim.banishChoice?.(run(), i)) {
                  toast('弃签次数已尽');
                  return;
                }
                deps.audio?.play('paper');
                render();
              },
            }, `弃签${(rr.banishesLeft || 0) > 0 ? `·${rr.banishesLeft}` : ''}`));
        }

        const lvBadge = isBlessing
          ? h('span', { class: `qian__lv${isCursed ? ' is-cursed' : ''}` }, isCursed ? '凶签' : '吉签')
          : d.level
            ? h('span', { class: 'qian__lv' }, d.isNew ? '初得' : `${cnNum(d.level)}级`)
            : d.levelText
              ? h('span', { class: 'qian__lv' }, d.levelText)
              : null;

        const rightStamp = isBlessing
          ? h('i', { class: `stamp qian__new${isCursed ? ' stamp--ink' : ''}` }, isCursed ? '凶' : '吉')
          : d.isNew
            ? h('i', { class: 'stamp qian__new' }, '新')
            : null;

        const leftTag = isLocked
          ? h('i', { class: 'qian__evo is-lock-tag' }, '已留')
          : d.evolvable
            ? h('i', { class: 'qian__evo' }, '可开光')
            : null;

        const cardIcon = isBlessing
          ? icon('blessing', d.id, 42, isCursed ? '凶' : '吉', { tone: isCursed ? 'cursed' : 'auspicious' })
          : icon(d.kind, d.id, 44, glyph);

        const card = h('div', {
          role: 'button',
          tabindex: '0',
          class: cardCls,
          dataset: cardDataset,
          'aria-label': `${d.name}${d.level ? ' ' + d.level + '级' : ''}：${d.desc}`,
          onClick: () => pick(i),
          onKeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick(i);
            }
          },
        },
        h('span', { class: 'qian__cap', 'aria-hidden': 'true' }),
        h('span', { class: 'qian__icon' }, cardIcon),
        h('span', { class: `qian__name${(d.name || '').length >= 5 ? ' is-long' : ''}` }, d.name),
        h('span', { class: 'qian__meta' }, lvBadge, schoolPills(d.tags)),
        h('span', { class: 'qian__desc' }, d.desc),
        hint ? h('span', { class: `qian__hint${d.evolvable ? ' is-ready' : ''}` }, hint) : null,
        actsEl,
        rightStamp,
        leftTag);

        cards.appendChild(card);
      });

      clear(actions);
      const left = (rr.rerolls?.free || 0) + (rr.rerolls?.ad || 0);
      actions.appendChild(sealButton(mode === 'blessing' ? '改命换签' : '换签', () => {
        if (!sim.rerollChoices(run())) { toast('签换完了'); return; }
        deps.audio?.play('paper');
        render();
      }, {
        kind: 'ghost',
        badge: left,
        disabled: left <= 0,
        label: `换签，剩 ${left} 次`,
        dataset: { action: 'reroll' },
      }));

      if (canShowRerollAd(deps.adsOn(), rr)) {
        actions.appendChild(adButton('看广告 · 再换三次', async () => {
          const res = await deps.runAd('reroll');
          if (res === 'completed') {
            if (sim.grantAdRerolls(run())) toast('又求得三回签');
            else toast('本局广告次数已用完');
            render();
          }
        }));
      }
    }

    render();
  }

  // ───────── 供盒（自选开光卷轴仪式 & 常规强化）─────────
  function buildEvoChoiceCard(c, selected, interactive, onSelect) {
    const recipeText = RECIPE_LABELS[c.recipe] || '神兵敕封';
    const tags = weaponTags(c.id);
    const evoTitle = `${c.name || weaponName(c.id)} → ${c.evoName || weaponName(c.id, true)}`;
    const desc = c.evoDesc || EVOLVE_INTRO[c.id] || '';
    const inner = [
      h('div', { class: 'chest-choice__ico' }, icon('evo', c.id, 46, (c.evoName || c.name || '开')[0])),
      h('div', { class: 'chest-choice__main' },
        h('p', { class: 'chest-choice__head' },
          h('b', {}, evoTitle),
          schoolPills(tags)),
        h('p', { class: 'chest-choice__recipe' }, recipeText),
        h('p', { class: 'chest-choice__desc' }, desc)),
      h('div', { class: 'chest-choice__mark' },
        selected
          ? h('i', { class: 'stamp stamp--sm' }, '敕')
          : h('span', { class: 'chest-choice__radio' }, '择')),
    ];

    if (!interactive) {
      return h('div', {
        class: 'chest-choice is-selected is-single',
        dataset: { evoWeapon: c.id, recipe: c.recipe || '' },
      }, ...inner);
    }
    return h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': selected ? 'true' : 'false',
      class: `chest-choice${selected ? ' is-selected' : ''}`,
      dataset: { evoWeapon: c.id, recipe: c.recipe || '' },
      onClick: onSelect,
    }, ...inner);
  }

  function showChest() {
    const r = run();
    const choices = Array.isArray(r?.chestChoices) ? r.chestChoices.map((x) => ({ ...x })) : [];

    // 分支 1：2 把及以上满阶兵刃满足开光条件 → 展示自选开光敕封卷轴，点确认时执行 openChest(run, selectedId)
    if (choices.length >= 2) {
      let selectedId = choices[0].id;
      const listBox = h('div', { class: 'chest-choices', role: 'radiogroup', 'aria-label': '选择开光神兵' });
      const renderChoices = () => {
        clear(listBox);
        for (const c of choices) {
          listBox.appendChild(buildEvoChoiceCard(c, selectedId === c.id, true, () => {
            selectedId = c.id;
            deps.audio?.play('paper');
            renderChoices();
          }));
        }
      };
      renderChoices();

      const ceremonyBanner = h('div', { class: 'chest-ceremony' },
        h('i', { class: 'stamp' }, '开光'),
        h('p', { class: 'chest-ceremony__note' }, '敕封礼成：大招攒气 +50 · 震散周身敌弹'));

      open('chest', scroll({
        title: '供盒敕封',
        sub: '多器齐备 · 择一兵刃开光',
        cls: 'scroll--dialog chest chest--ceremony',
        body: h('div', { class: 'chest-body' }, ceremonyBanner, listBox),
        footer: [
          sealButton('敕封开光', () => {
            const res = sim.openChest(run(), selectedId) || { evolved: null };
            deps.onCodexSync?.(run());
            if (res.evolved) deps.audio?.play('evolve');
            proceed();
          }, { cls: 'btn--wide', dataset: { action: 'confirm-chest' } }),
        ],
      }));
      return;
    }

    // 分支 2：恰好 1 把兵刃满足开光条件 → 打开供盒即完成敕封（兼容旧烟测），展示赤金开光卷轴
    if (choices.length === 1) {
      const snap = choices[0];
      const res = sim.openChest(r, snap.id) || { evolved: snap.id, recipe: snap.recipe, upgrades: [] };
      deps.onCodexSync?.(run());
      if (res.evolved) deps.audio?.play('evolve');

      const card = buildEvoChoiceCard({
        ...snap,
        id: res.evolved || snap.id,
        recipe: res.recipe || snap.recipe,
      }, true, false, null);

      const ceremonyBanner = h('div', { class: 'chest-ceremony' },
        h('i', { class: 'stamp stamp--big' }, '开光'),
        h('p', { class: 'chest-ceremony__note' }, '神兵出匣 · 大招攒气 +50 · 震散周身敌弹'));

      open('chest', scroll({
        title: '供盒敕封',
        sub: '夜主供奉 · 神兵开光',
        cls: 'scroll--dialog chest chest--ceremony',
        body: h('div', { class: 'chest-body' }, ceremonyBanner, card),
        footer: [
          sealButton('收下神兵', () => proceed(), { cls: 'btn--wide', dataset: { action: 'confirm-chest' } }),
        ],
      }));
      return;
    }

    // 分支 3：无开光兵刃 → 保持 run.status === 'chest' 直至玩家点击确认收下时结算强化/铜钱
    const unmaxedCount = (r?.weapons || []).filter((w) => w.level < MAX_WEAPON_LEVEL).length
      + (r?.relics || []).filter((rel) => rel.level < 5).length;
    const previewItems = [
      h('li', { class: 'chest-item' },
        unmaxedCount > 0
          ? '盒中藏有器物灵韵，收下即随机提升已拥有器物等级'
          : '行囊器物皆已满阶，收下将折算为沉甸甸的铜钱'),
    ];
    open('chest', scroll({
      title: '供盒',
      sub: '夜主与试炼留下的供奉',
      cls: 'scroll--dialog chest',
      body: h('div', { class: 'chest-body' },
        h('div', { class: 'chest-box', 'aria-hidden': 'true' }, h('i'), h('b')),
        h('ul', { class: 'chest-list' }, previewItems)),
      footer: [
        sealButton('收下', () => {
          const res = sim.openChest(run(), null) || { evolved: null, upgrades: [], coins: 0 };
          deps.onCodexSync?.(run());
          if (res.evolved) {
            deps.audio?.play('evolve');
          } else if ((res.upgrades || []).length) {
            const parts = res.upgrades.map((u) => {
              const name = u.kind === 'relic' ? relicName(u.id) : weaponName(u.id);
              return `${name}${u.level ? `升至${cnNum(u.level)}级` : '升一级'}`;
            });
            toast(`供盒所得：${parts.join('、')}`);
          } else if (res.coins) {
            toast(`器物已满，折得铜钱 +${res.coins}`);
          }
          proceed();
        }, { cls: 'btn--wide', dataset: { action: 'confirm-chest' } }),
      ],
    }));
  }

  // ───────── 街角奇遇（土地香案 / 镇邪试炼碑 / 鬼市货郎）─────────
  function showShrine() {
    const r = run();
    const s = r?.activeShrine;
    if (!r || !s) {
      proceed();
      return;
    }
    const shrineId = s.id;
    const shrineKind = s.kind;
    let lastHp = Math.max(0, Math.ceil(r.player?.hp ?? 0));
    let lastMaxHp = r.player?.maxHp ?? 100;
    let lastCoins = r.stats?.coins ?? 0;

    const intro = h('div', { class: 'shrine-intro' },
      icon('shrine', shrineKind, 42, SHRINE_GLYPH[shrineKind] || '奇', { tone: 'shrine' }),
      h('p', { class: 'shrine-intro__text' }, SHRINE_FLAVOR[shrineKind] || '街角微光摇曳，似有机缘。'));

    const optList = h('div', { class: 'shrine-options' });

    const renderOptions = (modal) => {
      clear(optList);
      (modal?.options || []).forEach((opt, idx) => {
        const uiDesc = opt.id === 'peddler_upgrade'
          ? '随机将 1 件已拥有器物提升 1 级（全满则强化总伤）'
          : opt.desc;
        optList.appendChild(h('button', {
          type: 'button',
          class: `shrine-opt${opt.disabled ? ' is-disabled' : ''}`,
          disabled: !!opt.disabled,
          dataset: { shrineOption: String(idx), optionId: opt.id || '' },
          onClick: () => {
            if (opt.disabled) return;
            const res = sim.resolveShrine?.(run(), idx);
            if (!res) {
              toast('条件未足，难以成礼');
              return;
            }
            deps.onCodexSync?.(run());
            deps.audio?.play(res.outcome === 'blood_rite' ? 'evolve' : 'woodblock');
            proceed();
          },
        },
        h('div', { class: 'shrine-opt__head' },
          h('b', { class: 'shrine-opt__label' }, opt.label),
          opt.costText ? h('span', { class: 'shrine-opt__cost' }, opt.costText) : null),
        h('p', { class: 'shrine-opt__desc' }, uiDesc)));
      });
    };

    renderOptions(s);

    const panel = scroll({
      title: s.title || '街角奇遇',
      sub: `气血 ${lastHp}/${lastMaxHp} · 局内铜钱 ${lastCoins}`,
      cls: `scroll--dialog shrine-scroll shrine-scroll--${shrineKind}`,
      body: h('div', { class: 'shrine-body' }, intro, optList),
      footer: [
        sealButton('暂且离开', () => {
          sim.dismissShrine?.(run());
          deps.audio?.play('paper');
          proceed();
        }, { kind: 'ghost', cls: 'btn--wide', dataset: { action: 'dismiss-shrine' } }),
      ],
    });
    const subEl = panel.querySelector('.scroll__sub');

    open('shrine', panel, '', { dataset: { shrineKind } });
    if (current) {
      current.sync = (curRun) => {
        if (!curRun || curRun.status !== 'shrine' || !curRun.activeShrine) return;
        const hp = Math.max(0, Math.ceil(curRun.player?.hp ?? 0));
        const maxHp = curRun.player?.maxHp ?? 100;
        const coins = curRun.stats?.coins ?? 0;
        if (hp === lastHp && maxHp === lastMaxHp && coins === lastCoins) return;
        lastHp = hp;
        lastMaxHp = maxHp;
        lastCoins = coins;
        sim.dismissShrine?.(curRun);
        sim.interactShrine?.(curRun, shrineId);
        if (subEl) subEl.textContent = `气血 ${hp}/${maxHp} · 局内铜钱 ${coins}`;
        renderOptions(curRun.activeShrine);
      };
    }
  }

  // ───────── 暂停（行囊加成 + 四门流派羁绊 + 守夜命签 + 设置）─────────
  function buildPauseLoadout(r) {
    const p = r.player || {};
    const mods = r.mods || {};
    const weapons = r.weapons || [];
    const relics = r.relics || [];

    const wGrid = h('div', { class: 'pause-slots' });
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const w = weapons[i];
      if (!w) {
        wGrid.appendChild(h('div', { class: 'pause-slot is-empty' }, h('span', {}, '空兵刃位')));
        continue;
      }
      const pair = weaponPairRelic(w.id);
      const recipe = !w.evolved ? sim.getEvolutionRecipe?.(r, w) : null;
      const wTitle = weaponName(w.id, !!w.evolved);
      const tags = weaponTags(w.id);
      let hint = '';
      if (w.evolved) hint = EVOLVE_INTRO[w.id] || '已开光';
      else if (recipe && w.level >= MAX_WEAPON_LEVEL) hint = `已齐备（${RECIPE_SHORT[recipe.recipe] || '可开光'}）· 拾供盒开光`;
      else if (recipe) hint = `条件已备（${RECIPE_SHORT[recipe.recipe] || '共鸣'}）· 伍级开光`;
      else if (pair) hint = `配「${relicName(pair)}」或三件同门开光`;

      wGrid.appendChild(h('div', { class: `pause-slot${w.evolved ? ' is-evo' : ''}` },
        h('div', { class: 'pause-slot__ico' }, icon(w.evolved ? 'evo' : 'weapon', w.id, 36, wTitle[0])),
        h('div', { class: 'pause-slot__info' },
          h('p', { class: 'pause-slot__head' },
            h('b', {}, wTitle),
            schoolPills(tags),
            w.evolved
              ? h('i', { class: 'stamp stamp--xs' }, '开')
              : h('span', { class: 'pause-slot__lv' }, `${cnNum(w.level)}级`)),
          hint ? h('p', { class: 'pause-slot__sub' }, hint) : null)));
    }

    const rGrid = h('div', { class: 'pause-slots' });
    for (let i = 0; i < MAX_RELICS; i++) {
      const rel = relics[i];
      if (!rel) {
        rGrid.appendChild(h('div', { class: 'pause-slot is-empty' }, h('span', {}, '空法器位')));
        continue;
      }
      const rTitle = relicName(rel.id);
      const tags = relicTags(rel.id);
      rGrid.appendChild(h('div', { class: 'pause-slot' },
        h('div', { class: 'pause-slot__ico' }, icon('relic', rel.id, 36, rTitle[0])),
        h('div', { class: 'pause-slot__info' },
          h('p', { class: 'pause-slot__head' },
            h('b', {}, rTitle),
            schoolPills(tags),
            h('span', { class: 'pause-slot__lv' }, `${cnNum(rel.level)}级`)),
          h('p', { class: 'pause-slot__sub' }, relicTotalDesc(rel.id, rel.level)))));
    }

    // 四门流派羁绊（常驻挂载 .pause-synergies）
    const synCounts = r.synergies?.counts || {};
    const synActive = r.synergies?.active || [];
    const synCountBar = h('div', { class: 'synergy-counts' },
      SCHOOL_TAG_IDS.map((tag) => {
        const cnt = synCounts[tag] || 0;
        return h('div', {
          class: `synergy-chip${cnt >= 2 ? ' is-on' : ''}`,
          dataset: { school: tag, count: String(cnt) },
        },
        h('b', {}, schoolName(tag)),
        h('span', {}, `${cnt}件`));
      }));
    const synList = synActive.length
      ? synActive.map((act) => h('div', {
        class: 'synergy-row',
        dataset: { school: act.tag, tier: String(act.tier) },
      },
      h('div', { class: 'synergy-row__head' },
        h('i', { class: 'stamp stamp--xs' }, `${cnNum(act.tier)}`),
        h('b', {}, act.name)),
      h('p', { class: 'synergy-row__desc' }, act.summary)))
      : [h('p', { class: 'pause-empty muted' }, '凑齐同门 2 / 4 / 6 件器物激活流派羁绊')];
    const synergiesBox = h('div', { class: 'pause-synergies' }, synCountBar, ...synList);

    // 守夜命签（常驻挂载 .pause-blessings）
    const blessingEntries = r.blessings || [];
    const blessingRows = blessingEntries.length
      ? blessingEntries.map((entry) => {
        const info = blessingInfo(entry.id);
        const isCursed = info.tier === 'cursed';
        return h('div', {
          class: `blessing-row${isCursed ? ' is-cursed' : ''}`,
          dataset: { blessingId: entry.id },
        },
        h('div', { class: 'blessing-row__head' },
          h('i', { class: `stamp stamp--xs${isCursed ? ' stamp--ink' : ''}` }, isCursed ? '凶' : '吉'),
          h('b', {}, info.name),
          entry.stacks > 1 ? h('span', { class: 'blessing-row__stacks' }, `×${entry.stacks}`) : null),
        h('p', { class: 'blessing-row__desc' }, info.desc));
      })
      : [h('p', { class: 'pause-empty muted' }, '尚未求得守夜命签 · 交更或参拜土地香案可得')];
    const blessingsBox = h('div', { class: 'pause-blessings' }, ...blessingRows);

    const overflowRow = (mods.overflowStacks || 0) > 0
      ? h('p', { class: 'pause-overflow' }, `溢签 ×${mods.overflowStacks} · 总伤额外 ×${(mods.overflowMult || 1).toFixed(2)}`)
      : null;

    const dmgPct = Math.round((mods.dmgPct || 0) * 100);
    const critPct = Math.round((mods.critChance ?? PLAYER_BASE.critChance) * 100);
    const cdrPct = Math.round((1 - (mods.cdMul ?? 1)) * 100);
    const areaPct = Math.round(((mods.areaMul ?? 1) - 1) * 100);
    const spdPct = Math.round(((p.speed || PLAYER_BASE.speed) / PLAYER_BASE.speed - 1) * 100);
    const curSpd = Math.round((p.speed || PLAYER_BASE.speed) * (r._auraSlow || 1));
    const pickPct = Math.round(((mods.pickupRange || PLAYER_BASE.pickupRange) / PLAYER_BASE.pickupRange - 1) * 100);
    const xpMul = (mods.xpMul ?? 1).toFixed(2);
    const statPairs = [
      ['气血', `${Math.max(0, Math.ceil(p.hp ?? 0))} / ${p.maxHp ?? 100}`],
      ['护甲', `${p.armor ?? 0}`],
      ['伤害加成', `+${dmgPct}%`],
      ['暴击率', `${critPct}%`],
      ['冷却缩减', `−${cdrPct}%`],
      ['范围加成', `+${areaPct}%`],
      ['移速', `${curSpd}${spdPct ? ` (${spdPct > 0 ? '+' : ''}${spdPct}%)` : ''}`],
      ['拾取范围', `+${pickPct}%`],
      ['经验倍率', `×${xpMul}`],
      ['局内铜钱', `${r.stats?.coins ?? 0}`],
    ];
    if ((mods.amount || 0) > 0) statPairs.push(['额外数量', `+${mods.amount}`]);
    if ((mods.summonDmgPct || 0) > 0) statPairs.push(['召唤增伤', `+${Math.round(mods.summonDmgPct * 100)}%`]);

    const statGrid = h('dl', { class: 'pause-stats' },
      statPairs.map(([k, v]) => h('div', { class: 'pause-stat' }, h('dt', {}, k), h('dd', {}, v))));

    const affixNote = r.nightLevel > 0 && r.night?.affixes?.length
      ? h('p', { class: 'pause-affix' }, `${nightLabel(r.nightLevel)}：${r.night.affixes.join(' · ')}`)
      : null;

    return h('div', { class: 'pause-loadout' },
      h('p', { class: 'pause-sec' }, `兵刃（${weapons.length}/${MAX_WEAPONS}）`),
      wGrid,
      h('p', { class: 'pause-sec' }, `法器（${relics.length}/${MAX_RELICS}）`),
      rGrid,
      h('p', { class: 'pause-sec' }, '四门流派羁绊'),
      synergiesBox,
      h('p', { class: 'pause-sec' }, `守夜命签（${blessingEntries.length}）`),
      blessingsBox,
      overflowRow,
      h('p', { class: 'pause-sec' }, '当前属性与加成'),
      statGrid,
      affixNote);
  }

  function showPause() {
    const r = run();
    if (!r || (current && current.type !== 'pause')) return;
    if (current?.type === 'pause') return;
    deps.onCodexSync?.(r);

    let tab = 'loadout';
    const tabBar = h('div', { class: 'seg pause-tabs', role: 'tablist' });
    const panel = h('div', { class: 'pause-panel' });

    const renderBody = () => {
      clear(tabBar);
      for (const [id, label] of [['loadout', '行囊加成'], ['settings', '设置']]) {
        tabBar.appendChild(h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': tab === id ? 'true' : 'false',
          class: `seg__opt${tab === id ? ' is-on' : ''}`,
          onClick: () => { tab = id; renderBody(); },
        }, label));
      }
      clear(panel);
      if (tab === 'loadout') {
        panel.appendChild(buildPauseLoadout(r));
      } else {
        const s = deps.getSettings();
        panel.appendChild(settingsBody({ ...s }, (next) => deps.onSettings(next)));
      }
    };
    renderBody();

    const modeLabel = r.mode === 'endless' ? '残夜无尽' : watchName(r.watch);
    open('pause', scroll({
      title: '歇一口气',
      sub: `${modeLabel} · ${cnNum(r.player?.level ?? 1)}级 · 已打散 ${r.stats?.kills ?? 0} 只`,
      cls: 'scroll--dialog scroll--tall pause-scroll',
      body: h('div', { class: 'pause-body' }, tabBar, panel),
      footer: [
        sealButton('接着守', () => { closeCurrent(); game.resume(); syncHud(run()); }),
        sealButton('放弃本局', async () => {
          const ok = await confirmDialog(root, { title: '收锣回家？', text: '这一夜的铜钱照算，只是守不到天亮了。', ok: '收锣', cancel: '再守会' });
          if (ok) { closeCurrent(); deps.onFinish(); }
        }, { kind: 'ghost' }),
      ],
    }));
  }

  // ───────── 复活 ─────────
  function showRevive() {
    const r = run();
    const foot = [];
    const canAd = canShowReviveAd(deps.adsOn(), r);
    if (canAd) {
      foot.push(adButton('看广告 · 满血再起', async () => {
        const res = await deps.runAd('revive');
        if (res !== 'completed') return;
        if (sim.revive(run())) {
          deps.audio?.play('evolve');
          proceed();
        } else {
          toast('这回起不来了');
        }
      }));
    }
    foot.push(sealButton('不了，结算', () => { closeCurrent(); deps.onFinish(); }, { kind: canAd ? 'ghost' : 'seal' }));
    open('dead', scroll({
      title: '灯灭了',
      sub: `撑到 ${watchName(r.watch)}`,
      cls: 'scroll--dialog',
      body: h('p', { class: 'dialog-text' }, canAd ? '魂火将熄。还能再撑一回：满血、一锣清场、三息不伤。' : '魂火熄了。歇一歇，明晚再来。'),
      footer: foot,
    }), 'veil--dead');
  }

  // ───────── 鸡鸣通关 ─────────
  function showCleared() {
    open('cleared', scroll({
      title: '鸡鸣天亮！',
      sub: '五更已过，邪祟退散',
      cls: 'scroll--dialog scroll--dawn',
      body: h('p', { class: 'dialog-text' }, '夜游神散了。收锣回家算账，还是借着残夜接着守？无尽里的鬼一分钟比一分钟硬。'),
      footer: [
        sealButton('收锣结算', () => { closeCurrent(); deps.onFinish(); }),
        sealButton('继续守夜（无尽）', () => {
          sim.enterEndless(run());
          proceed();
        }, { kind: 'ghost' }),
      ],
    }), 'veil--dawn');
  }

  // ───────── 首局提示 ─────────
  function showFirstRunHint() {
    hintEl?.remove();
    hintEl = h('div', { class: 'run-hint', 'aria-live': 'polite' },
      h('p', {}, '按住任意处拖动走位'),
      h('p', {}, '器物自会出手，吃魂火升级'),
      h('p', {}, '攒满气，点右下角敲更锣'));
    root.appendChild(hintEl);
    setTimeout(() => hintEl?.classList.add('is-out'), 5200);
    setTimeout(() => { hintEl?.remove(); hintEl = null; }, 6200);
  }

  function teardown() {
    closeCurrent();
    unmountHud();
    hintEl?.remove();
    hintEl = null;
  }

  return {
    mountHud, unmountHud, syncHud, handleStatus, showPause, showFirstRunHint, teardown, closeCurrent,
    get overlay() { return current?.type || null; },
  };
}
