// 百物图鉴：查看已解锁 / 未解锁的兵刃、开光神兵、法器、百鬼夜主、打更人与守夜印记。
import * as B from '../sim/balance.js';
import { HERO_IDS, WEAPON_IDS, RELIC_IDS, ENEMY_IDS } from '../meta/save.js';
import { ensureCodex, getCodexCounts } from '../meta/codex.js';
import { heroUnlockProgress } from '../meta/unlocks.js';
import { h, clear, scroll, sealButton, veil, formatCoins } from './dom.js';
import {
  heroInfo, weaponName, relicName, pairOf, weaponPairRelic,
  WEAPON_INTRO, EVOLVE_INTRO, ENEMY_COPY, ACHIEVEMENT_NAMES, ACHIEVEMENT_DESC, relicTotalDesc,
} from './copy.js';
import { icon } from './icons.js';

const HERO_GLYPH = { zhou: '周', mian: '绵', daotong: '童' };
const TABS = [
  { id: 'weapons', label: '兵刃' },
  { id: 'evolutions', label: '开光' },
  { id: 'relics', label: '法器' },
  { id: 'enemies', label: '百鬼' },
  { id: 'heroes', label: '人物' },
];

function badge(text, isOn = false, isStamp = false) {
  if (isStamp) return h('i', { class: 'stamp stamp--sm codex-stamp' }, text);
  return h('span', { class: `codex-tag${isOn ? ' is-on' : ''}` }, text);
}

export function openCodex(root, save) {
  const codex = ensureCodex(save);
  const counts = getCodexCounts(save);
  let activeTab = 'weapons';

  const tabBar = h('div', { class: 'codex-tabs', role: 'tablist', 'aria-label': '图鉴分类' });
  const listBox = h('div', { class: 'codex-list' });

  function renderTabs() {
    clear(tabBar);
    for (const t of TABS) {
      const c = counts[t.id];
      const btn = h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === t.id ? 'true' : 'false',
        class: `codex-tab${activeTab === t.id ? ' is-on' : ''}`,
        onClick: () => {
          activeTab = t.id;
          renderTabs();
          renderList();
          listBox.scrollTop = 0;
        },
      },
      h('b', {}, t.label),
      h('small', {}, `${c.have}/${c.total}`));
      tabBar.appendChild(btn);
    }
  }

  function renderWeapons() {
    for (const id of WEAPON_IDS) {
      const unlocked = codex.weapons.includes(id);
      const pair = weaponPairRelic(id);
      const wName = weaponName(id, false);
      listBox.appendChild(h('div', { class: `codex-row${unlocked ? '' : ' is-locked'}` },
        h('div', { class: 'codex-row__ico' }, icon('weapon', id, 46, wName[0])),
        h('div', { class: 'codex-row__main' },
          h('p', { class: 'codex-row__head' },
            h('span', { class: 'codex-row__name' }, wName),
            badge(unlocked ? '已录' : '未录', unlocked)),
          h('p', { class: 'codex-row__desc' },
            unlocked
              ? `${WEAPON_INTRO[id] || ''}`
              : '尚未收录：守夜升级抽签习得，或解锁对应打更人'),
          pair ? h('p', { class: 'codex-row__meta' }, `开光配对：伍级 +「${relicName(pair)}」→ ${weaponName(id, true)}`) : null)));
    }
  }

  function renderEvolutions() {
    for (const id of WEAPON_IDS) {
      const unlocked = codex.evolutions.includes(id);
      const pair = weaponPairRelic(id);
      const evoName = weaponName(id, true);
      const evoMult = B.WEAPONS?.[id]?.evoMult ?? 1.6;
      listBox.appendChild(h('div', { class: `codex-row${unlocked ? '' : ' is-locked'}` },
        h('div', { class: 'codex-row__ico' }, icon('evo', id, 46, evoName[0])),
        h('div', { class: 'codex-row__main' },
          h('p', { class: 'codex-row__head' },
            h('span', { class: 'codex-row__name' }, evoName),
            unlocked ? badge('开', true, true) : badge('未开光', false)),
          h('p', { class: 'codex-row__desc' },
            unlocked
              ? `${EVOLVE_INTRO[id] || ''}（总伤倍率 ×${evoMult}）`
              : `配方：伍级「${weaponName(id, false)}」+「${relicName(pair)}」+ 夜主供盒`),
          unlocked
            ? h('p', { class: 'codex-row__meta' }, `由「${weaponName(id, false)}」配「${relicName(pair)}」开光而成`)
            : null)));
    }
  }

  function renderRelics() {
    for (const id of RELIC_IDS) {
      const unlocked = codex.relics.includes(id);
      const rName = relicName(id);
      const pair = pairOf(id);
      listBox.appendChild(h('div', { class: `codex-row${unlocked ? '' : ' is-locked'}` },
        h('div', { class: 'codex-row__ico' }, icon('relic', id, 46, rName[0])),
        h('div', { class: 'codex-row__main' },
          h('p', { class: 'codex-row__head' },
            h('span', { class: 'codex-row__name' }, rName),
            badge(unlocked ? '已录' : '未录', unlocked)),
          h('p', { class: 'codex-row__desc' },
            unlocked
              ? `一级：${relicTotalDesc(id, 1)} · 满级：${relicTotalDesc(id, 5)}`
              : '尚未收录：局内抽签或更簿签到护身符可得'),
          pair ? h('p', { class: 'codex-row__meta' }, `助「${weaponName(pair, false)}」开光为「${weaponName(pair, true)}」`) : null)));
    }
  }

  function renderEnemies() {
    for (const id of ENEMY_IDS) {
      const kills = codex.enemies[id] || 0;
      const seen = kills > 0;
      const info = ENEMY_COPY[id] || { name: id, watch: '', desc: '' };
      listBox.appendChild(h('div', { class: `codex-row${seen ? '' : ' is-locked'}` },
        h('div', { class: 'codex-row__ico' }, icon('enemy', id, 50, info.name[0])),
        h('div', { class: 'codex-row__main' },
          h('p', { class: 'codex-row__head' },
            h('span', { class: 'codex-row__name' }, seen ? info.name : '？？？'),
            info.boss ? badge('主', seen, seen) : null,
            badge(seen ? `已散 ${formatCoins(kills)}` : '未遇', seen)),
          h('p', { class: 'codex-row__desc' },
            seen ? info.desc : '夜深露重，尚未在街巷中将其打散。'),
          h('p', { class: 'codex-row__meta' }, info.watch))));
    }
  }

  function renderHeroes() {
    for (const id of HERO_IDS) {
      const unlocked = save.unlockedHeroes.includes(id);
      const info = heroInfo(id);
      const prog = !unlocked ? heroUnlockProgress(save, id) : null;
      listBox.appendChild(h('div', { class: `codex-row${unlocked ? '' : ' is-locked'}` },
        h('div', { class: 'codex-row__ico' }, icon('hero', id, 48, HERO_GLYPH[id])),
        h('div', { class: 'codex-row__main' },
          h('p', { class: 'codex-row__head' },
            h('span', { class: 'codex-row__name' }, info.name),
            badge(unlocked ? '已解锁' : '未解锁', unlocked)),
          h('p', { class: 'codex-row__desc' },
            unlocked
              ? `${info.flavor}`
              : `解锁条件：${info.unlock}${prog ? `（最好 ${prog.have}/${prog.need}）` : ''}`),
          h('p', { class: 'codex-row__meta' }, `起手「${weaponName(info.weapon)}」· ${info.trait}`))));
    }

    const achIds = Object.keys(ACHIEVEMENT_NAMES);
    const achHave = achIds.filter((k) => !!save.achievements?.[k]).length;
    listBox.appendChild(h('p', { class: 'codex-sec-title' }, `守夜印记（${achHave}/${achIds.length}）`));
    for (const id of achIds) {
      const done = !!save.achievements?.[id];
      listBox.appendChild(h('div', { class: `codex-row codex-row--ach${done ? '' : ' is-locked'}` },
        h('div', { class: 'codex-row__ico' },
          done ? h('i', { class: 'stamp stamp--sm' }, '印') : h('span', { class: 'codex-seal-empty' }, '空')),
        h('div', { class: 'codex-row__main' },
          h('p', { class: 'codex-row__head' },
            h('span', { class: 'codex-row__name' }, ACHIEVEMENT_NAMES[id]),
            badge(done ? '已达成' : '未达成', done)),
          h('p', { class: 'codex-row__desc' }, ACHIEVEMENT_DESC[id] || ''))));
    }
  }

  function renderList() {
    clear(listBox);
    if (activeTab === 'weapons') renderWeapons();
    else if (activeTab === 'evolutions') renderEvolutions();
    else if (activeTab === 'relics') renderRelics();
    else if (activeTab === 'enemies') renderEnemies();
    else renderHeroes();
  }

  renderTabs();
  renderList();

  const v = veil(root, scroll({
    title: '百物谱',
    sub: `已收录 ${counts.have} / ${counts.total} 项`,
    cls: 'scroll--dialog scroll--tall codex-scroll',
    body: h('div', { class: 'codex-wrap' }, tabBar, listBox),
    footer: [sealButton('合卷回去', () => v.close(), { kind: 'ghost' })],
  }), { onBackdrop: () => v.close() });
  return v;
}
