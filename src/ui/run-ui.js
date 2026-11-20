// 局内覆盖层：暂停按钮、三选一（签）、供盒、暂停菜单、复活、鸡鸣通关选择、首局提示。
// 所有对 run 的改动都通过 sim 函数完成，然后由这里决定 resume 还是弹下一个界面。
import { h, clear, scroll, sealButton, adButton, veil, toast, cnNum } from './dom.js';
import { describeChoice, weaponName, relicName, EVOLVE_INTRO, watchName } from './copy.js';
import { icon } from './icons.js';
import { settingsBody } from './settings.js';
import { confirmDialog } from './dialogs.js';
import { canShowRerollAd, canShowReviveAd } from '../ads/ad-policy.js';

const KIND_GLYPH = { coin: '钱', bun: '包', overflow: '溢' };

/**
 * deps: { game, sim: { chooseUpgrade, rerollChoices, grantAdRerolls, openChest, revive, enterEndless },
 *         adsOn(), runAd(placement), getSettings(), onSettings(s), onFinish(), audio }
 */
export function createRunUI(root, deps) {
  const { game, sim } = deps;
  let hud = null;
  let current = null;      // { type, close }
  let hintEl = null;

  const run = () => game.run;

  function mountHud() {
    unmountHud();
    hud = h('button', {
      type: 'button', class: 'pause-btn', 'aria-label': '暂停',
      onClick: () => { deps.audio?.play('click'); showPause(); },
    }, h('span', {}, '歇'));
    root.appendChild(hud);
  }
  function unmountHud() { hud?.remove(); hud = null; }

  function open(type, content, cls = '') {
    closeCurrent();
    game.pause();
    const v = veil(root, content, { cls: `veil--run ${cls}` });
    current = { type, close: v.close, el: v.el };
    if (hud) hud.hidden = true;
    return v;
  }
  function closeCurrent() {
    current?.close();
    current = null;
    if (hud) hud.hidden = false;
  }

  /** 操作完 run 之后：还在 playing 就继续；否则弹出对应界面。 */
  function proceed() {
    const r = run();
    if (!r) return;
    if (r.status === 'playing') {
      closeCurrent();
      game.resume();
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
      case 'dead': showRevive(); break;
      case 'cleared': showCleared(); break;
      case 'playing':
        if (current && current.type !== 'pause') { closeCurrent(); }
        break;
      default: break;
    }
  }

  // ───────── 三选一 ─────────
  function showLevelUp() {
    const r = run();
    const cards = h('div', { class: 'qian-row' });
    const actions = h('div', { class: 'levelup-actions' });
    const sub = h('p', { class: 'levelup-sub' });
    const render = () => {
      const rr = run();
      sub.textContent = `升到${cnNum(rr.player?.level ?? 1)}级 · 挑一支`;
      clear(cards);
      (rr.choices || []).forEach((c, i) => {
        const d = describeChoice(c);
        const glyph = KIND_GLYPH[d.kind] || (d.name || '？')[0];
        const card = h('button', {
          type: 'button', class: `qian${d.isNew ? ' is-new' : ''}${d.evolvable ? ' is-evo' : ''}`,
          style: { animationDelay: `${i * 70}ms` },
          'aria-label': `${d.name}${d.level ? ' ' + d.level + '级' : ''}：${d.desc}`,
          onClick: () => pick(i),
        },
        h('span', { class: 'qian__cap', 'aria-hidden': 'true' }),
        h('span', { class: 'qian__icon' }, icon(d.kind, d.id, 56, glyph)),
        h('span', { class: 'qian__name' }, d.name),
        d.level ? h('span', { class: 'qian__lv' }, d.isNew ? '初得' : `${cnNum(d.level)}级`) : null,
        h('span', { class: 'qian__desc' }, d.desc),
        d.isNew ? h('i', { class: 'stamp qian__new' }, '新') : null,
        d.evolvable ? h('i', { class: 'qian__evo' }, '可开光') : null);
        cards.appendChild(card);
      });
      clear(actions);
      const left = (rr.rerolls?.free || 0) + (rr.rerolls?.ad || 0);
      actions.appendChild(sealButton('换签', () => {
        if (!sim.rerollChoices(run())) { toast('签换完了'); return; }
        deps.audio?.play('paper');
        render();
      }, { kind: 'ghost', badge: left, disabled: left <= 0, label: `换签，剩 ${left} 次` }));
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
    };
    let picked = false;
    const pick = (i) => {
      if (picked) return;
      picked = true;
      sim.chooseUpgrade(run(), i);
      deps.audio?.play('woodblock');
      picked = false;
      if (run().status === 'levelup') { render(); return; }   // 连升：直接换一批签
      proceed();
    };
    render();
    open('levelup', h('div', { class: 'levelup' },
      h('h2', { class: 'levelup-title' }, '抽一支签'), sub, cards, actions));
    void r;
  }

  // ───────── 供盒 ─────────
  function showChest() {
    const res = sim.openChest(run()) || { evolved: null, upgrades: [] };
    const items = [];
    if (res.evolved) {
      items.push(h('div', { class: 'chest-evo' },
        h('i', { class: 'stamp stamp--big' }, '开光'),
        h('p', { class: 'chest-evo__name' }, `${weaponName(res.evolved)} → ${weaponName(res.evolved, true)}`),
        h('p', { class: 'chest-evo__desc' }, EVOLVE_INTRO[res.evolved] || '')));
      deps.audio?.play('evolve');
    }
    for (const u of res.upgrades || []) {
      const it = typeof u === 'string' ? { kind: 'weapon', id: u } : u || {};
      let text;
      if (it.kind === 'coin' || it.coins) text = `铜钱 +${it.value ?? it.coins ?? ''}`;
      else if (it.kind === 'relic') text = `${relicName(it.id)}${it.level ? ` 升至${cnNum(it.level)}级` : ' 升一级'}`;
      else if (it.kind === 'overflow') text = '溢签：伤害再涨一截';
      else text = `${weaponName(it.id)}${it.level ? ` 升至${cnNum(it.level)}级` : ' 升一级'}`;
      items.push(h('li', { class: 'chest-item' }, text));
    }
    if (!res.evolved && !(res.upgrades || []).length) {
      items.push(h('li', { class: 'chest-item' }, res.coins ? `器物都满了，折成铜钱 +${res.coins}` : '盒里空空，只剩一缕香灰'));
    }
    const list = res.evolved ? items : [h('ul', { class: 'chest-list' }, items)];
    open('chest', scroll({
      title: '供盒',
      sub: '夜主留下的供奉',
      cls: 'scroll--dialog chest',
      body: h('div', { class: 'chest-body' }, h('div', { class: 'chest-box', 'aria-hidden': 'true' }, h('i'), h('b')), list),
      footer: [sealButton('收下', () => proceed())],
    }));
  }

  // ───────── 暂停 ─────────
  function showPause() {
    const r = run();
    if (!r || (current && current.type !== 'pause')) return;
    if (current?.type === 'pause') return;
    const s = deps.getSettings();
    open('pause', scroll({
      title: '歇一口气',
      sub: `${watchName(r.watch)} · 已打散 ${r.stats?.kills ?? 0} 只`,
      cls: 'scroll--dialog',
      body: settingsBody({ ...s }, (next) => deps.onSettings(next)),
      footer: [
        sealButton('接着守', () => { closeCurrent(); game.resume(); }),
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
    mountHud, unmountHud, handleStatus, showPause, showFirstRunHint, teardown, closeCurrent,
    get overlay() { return current?.type || null; },
  };
}
