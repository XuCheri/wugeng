// 更房：打更人歇脚的地方。起更（选英雄 / 夜色 / 护身符）、加点、更簿、设置。
import { h, clear, scroll, sealButton, adButton, veil, toast, cnNum, formatCoins } from './dom.js';
import { heroInfo, weaponName, nightLabel, nightDesc, SHOP_COPY, CHARM_LABEL, relicName } from './copy.js';
import { icon } from './icons.js';
import { settingsBody } from './settings.js';
import { showAgeDialog, showPrivacyDialog } from './dialogs.js';
import { HERO_IDS } from '../meta/save.js';
import { getShopItems, getLevel, nextCost, buyLevel, describeLevel } from '../meta/shop.js';
import { heroUnlockProgress } from '../meta/unlocks.js';
import { getCheckinState, claimCheckin } from '../meta/checkin.js';
import { getCodexCounts } from '../meta/codex.js';
import { canShowCheckinDouble } from '../ads/ad-policy.js';
import { openCodex } from './codex.js';

const HERO_GLYPH = { zhou: '周', mian: '绵', daotong: '童' };
const COIN_SVG = `<svg viewBox="0 0 16 16" class="coin-ico" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.9" y="5.9" width="4.2" height="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

function coinTag(n) {
  return h('span', { class: 'coin-tag' }, h('span', { html: COIN_SVG }), h('b', {}, formatCoins(n)));
}

/**
 * ctx: { save, adsOn(), persist(syncCloud?), runAd(placement) → Promise<result>, now() → Date,
 *        onStart({ heroId, nightLevel, charm }), onSettings(settings),
 *        cloudState?(), onCloudUpload?(), onCloudPull?() }
 */
export function renderHub(root, ctx) {
  const { save } = ctx;
  let charmPick = null;   // relicId 或 null

  const coinBox = h('div', { class: 'hub-coins' });
  const startBox = h('div', { class: 'hub-start' });
  const navBox = h('nav', { class: 'hub-nav' });
  const el = h('div', { class: 'screen screen--hub' },
    h('header', { class: 'hub-head' },
      h('div', {},
        h('h1', { class: 'hub-title' }, '更房'),
        h('p', { class: 'hub-sub' }, statLine(save))),
      coinBox),
    startBox,
    navBox);
  root.appendChild(el);

  function statLine(s) {
    if (!s.stats.runs) return '头一回守夜，莫慌';
    return `已守 ${s.stats.runs} 夜 · 见过 ${s.stats.clears} 回天亮`;
  }

  function refresh() {
    clear(coinBox).appendChild(coinTag(save.coins));
    el.querySelector('.hub-sub').textContent = statLine(save);
    renderStart();
    renderNav();
  }

  // ───────── 起更 ─────────
  function renderStart() {
    clear(startBox);
    const heroes = h('div', { class: 'hero-row', role: 'radiogroup', 'aria-label': '选打更人' });
    for (const id of HERO_IDS) {
      const info = heroInfo(id);
      const unlocked = save.unlockedHeroes.includes(id);
      const sel = save.selectedHero === id;
      const tile = h('button', {
        type: 'button', role: 'radio', 'aria-checked': sel ? 'true' : 'false',
        class: `hero-tile${sel ? ' is-on' : ''}${unlocked ? '' : ' is-locked'}`,
        onClick: () => {
          if (!unlocked) { toast(`未解锁：${info.unlock}`); return; }
          save.selectedHero = id; ctx.persist(); renderStart();
        },
      },
      icon('hero', id, 52, HERO_GLYPH[id]),
      h('span', { class: 'hero-tile__name' }, info.short),
      sel ? h('i', { class: 'stamp stamp--sm hero-tile__stamp' }, '选') : null,
      unlocked ? null : h('i', { class: 'hero-tile__lock' }, '未解'));
      heroes.appendChild(tile);
    }

    const hero = heroInfo(save.selectedHero);
    const heroCard = h('div', { class: 'hero-card' },
      h('p', { class: 'hero-card__name' }, hero.name),
      h('p', { class: 'hero-card__flavor' }, hero.flavor),
      h('p', { class: 'hero-card__meta' }, `起手 ${weaponName(hero.weapon)} · ${hero.trait}`));

    // 未解锁英雄的条件
    const locks = HERO_IDS.filter((id) => !save.unlockedHeroes.includes(id)).map((id) => {
      const info = heroInfo(id);
      const p = heroUnlockProgress(save, id);
      return h('li', {}, h('b', {}, info.short), `：${info.unlock}`, p ? h('span', { class: 'muted' }, `（最好 ${p.have}/${p.need}）`) : null);
    });

    // 夜色
    const n = Math.min(save.selectedNight, save.nightUnlocked);
    const night = h('div', { class: 'night' },
      h('button', {
        type: 'button', class: 'night__arrow', 'aria-label': '夜色降一级', disabled: n <= 0,
        onClick: () => { save.selectedNight = Math.max(0, n - 1); ctx.persist(); renderStart(); },
      }, '‹'),
      h('div', { class: 'night__mid' },
        h('p', { class: 'night__name' }, nightLabel(n)),
        h('p', { class: 'night__desc' }, nightDesc(n))),
      h('button', {
        type: 'button', class: 'night__arrow', 'aria-label': '夜色升一级', disabled: n >= save.nightUnlocked,
        onClick: () => { save.selectedNight = Math.min(save.nightUnlocked, n + 1); ctx.persist(); renderStart(); },
      }, '›'));

    // 护身符
    const counts = {};
    for (const c of save.charms) counts[c.relicId] = (counts[c.relicId] || 0) + 1;
    const charmIds = Object.keys(counts);
    if (charmPick && !counts[charmPick]) charmPick = null;
    let charmRow = null;
    if (charmIds.length) {
      const opts = [null, ...charmIds];
      const idx = opts.indexOf(charmPick);
      charmRow = h('button', {
        type: 'button', class: 'charm-pick',
        onClick: () => { charmPick = opts[(idx + 1) % opts.length]; renderStart(); },
      },
      h('span', { class: 'charm-pick__label' }, '护身符'),
      h('span', { class: 'charm-pick__val' }, charmPick ? `${relicName(charmPick)} ×${counts[charmPick]}` : '不带'),
      h('span', { class: 'charm-pick__hint' }, charmPick ? '开局即得此法器一级，用后即耗' : '点此换'));
    }

    startBox.appendChild(scroll({
      title: '起更',
      sub: '挑个人，挑个夜',
      body: [heroes, heroCard, locks.length ? h('ul', { class: 'lock-list' }, locks) : null,
        h('div', { class: 'ink-rule ink-rule--thin', 'aria-hidden': 'true' }), night, charmRow],
      footer: [sealButton('出门打更', () => {
        const charm = charmPick ? { relicId: charmPick } : null;
        ctx.onStart({ heroId: save.selectedHero, nightLevel: n, charm });
      }, { cls: 'btn--wide btn--big' })],
    }));
  }

  // ───────── 底部入口 ─────────
  function renderNav() {
    clear(navBox);
    const st = getCheckinState(save, ctx.now());
    const cc = getCodexCounts(save);
    navBox.append(
      navSeal('加点', '长本事', () => openShop()),
      navSeal('图鉴', `${cc.have}/${cc.total}`, () => openCodex(root, save)),
      navSeal('更簿', st.canClaim ? '可画押' : '签到', () => openCheckin(), st.canClaim),
      navSeal('设置', '杂项', () => openSettings()));
  }
  function navSeal(text, sub, onClick, dot = false) {
    return sealButton(h('span', { class: 'nav-seal' }, h('b', {}, text), h('small', {}, sub)), onClick, {
      kind: 'square', cls: dot ? 'has-dot' : '',
    });
  }

  // ───────── 加点（更房 8 项）─────────
  function openShop() {
    let v;
    const list = h('div', { class: 'shop-list' });
    const head = h('div', { class: 'shop-coins' });
    const render = () => {
      clear(head).appendChild(coinTag(save.coins));
      clear(list);
      for (const it of getShopItems()) {
        const lv = getLevel(save, it.id);
        const cost = nextCost(save, it.id);
        const copy = SHOP_COPY[it.id] || {};
        const pips = h('span', { class: 'pips', 'aria-label': `${lv}/${it.maxLevel} 级` },
          Array.from({ length: it.maxLevel }, (_, i) => h('i', { class: i < lv ? 'is-on' : '' })));
        const cur = lv > 0 ? describeLevel(it.id, lv) : '';
        const nxt = lv < it.maxLevel ? describeLevel(it.id, lv + 1) : '';
        const effect = !cur ? (it.desc || '')
          : nxt && nxt !== cur ? `现 ${cur} → 下级 ${nxt.replace(/^\S+\s*/, '')}` : `现 ${cur}`;
        const row = h('div', { class: 'shop-row' },
          h('div', { class: 'shop-row__main' },
            h('p', { class: 'shop-row__name' }, it.name || copy.name || it.id, pips),
            h('p', { class: 'shop-row__flavor' }, copy.flavor || ''),
            h('p', { class: 'shop-row__eff' }, effect)),
          cost === null
            ? h('span', { class: 'stamp stamp--sm' }, '满')
            : sealButton(h('span', { class: 'buy' }, h('b', {}, '升'), h('small', {}, String(cost))), () => {
              const r = buyLevel(save, it.id);
              if (!r.ok) { toast(r.reason === 'coins' ? `铜钱不够，还差 ${cost - save.coins}` : '已经满了'); return; }
              ctx.persist(true);
              toast(`${it.name || copy.name}升到${cnNum(r.level)}级`);
              render();
              refresh();
            }, { kind: 'small', disabled: save.coins < cost, label: `${it.name} 升级，${cost} 铜钱` }));
        list.appendChild(row);
      }
    };
    render();
    v = veil(root, scroll({
      title: '加点',
      sub: '花铜钱，长本事，一辈子都在',
      cls: 'scroll--dialog scroll--tall',
      body: [head, list],
      footer: [sealButton('回去', () => v.close(), { kind: 'ghost' })],
    }), { onBackdrop: () => v.close() });
  }

  // ───────── 更簿 ─────────
  function openCheckin() {
    let v;
    const body = h('div', { class: 'checkin' });
    const foot = h('div', { class: 'checkin-foot' });
    const render = () => {
      const st = getCheckinState(save, ctx.now());
      clear(body);
      const grid = h('div', { class: 'checkin-grid' });
      for (const r of st.rewards) {
        const lines = [];
        if (r.coins) lines.push(`铜钱 ${r.coins}`);
        if (r.charms) lines.push('护身符');
        if (r.cosmetic) lines.push(r.cosmeticItem ? r.cosmeticItem.name : `铜钱 150`);
        const cell = h('div', {
          class: `checkin-cell${r.claimed ? ' is-claimed' : ''}${r.current ? ' is-current' : ''}${r.cosmetic ? ' is-big' : ''}`,
        },
        h('span', { class: 'checkin-cell__day' }, `第${cnNum(r.day)}日`),
        h('span', { class: 'checkin-cell__gift' }, lines.map((t) => h('span', {}, t))),
        r.claimed ? h('i', { class: 'stamp stamp--sm checkin-cell__stamp' }, '押') : null);
        grid.appendChild(cell);
      }
      body.append(grid, h('p', { class: 'checkin-note' },
        st.rollback ? `簿上记着 ${save.checkin.lastClaimDate}，比今天还晚。等日子走到了再来。`
          : st.claimedToday ? '今日已画押，明日再来。'
            : '断了不要紧，下回接着往下记。'));

      clear(foot);
      if (st.canClaim) {
        const claim = (doubled) => {
          const r = claimCheckin(save, ctx.now(), doubled);
          if (!r.ok) { toast('今日领不了'); return; }
          ctx.persist(true);
          toast(rewardText(r), 2600);
          render();
          refresh();
        };
        foot.appendChild(sealButton('画押领取', () => claim(false)));
        if (canShowCheckinDouble(ctx.adsOn(), st)) {
          foot.appendChild(adButton('看广告 · 双倍领取', async () => {
            const res = await ctx.runAd('checkinDouble');
            if (res === 'completed') claim(true);
          }));
        }
      }
      foot.appendChild(sealButton('回去', () => v.close(), { kind: 'ghost' }));
    };
    render();
    v = veil(root, scroll({
      title: '更簿',
      sub: '七日一轮，第七日有好东西',
      cls: 'scroll--dialog',
      body,
      footer: [foot],
    }), { onBackdrop: () => v.close() });
  }

  function rewardText(r) {
    const parts = [];
    if (r.coins) parts.push(`铜钱 ${r.coins}`);
    const counts = {};
    for (const c of r.charms) counts[c.relicId] = (counts[c.relicId] || 0) + 1;
    for (const [id, k] of Object.entries(counts)) parts.push(`${CHARM_LABEL(id)}${k > 1 ? ' ×' + k : ''}`);
    if (r.cosmetic) parts.push(r.cosmetic.name);
    return `领到 ${parts.join('、')}${r.doubled ? '（双倍）' : ''}`;
  }

  // ───────── 设置（含 TapTap 云存档）─────────
  function openSettings() {
    let v;
    const cloudBox = h('div', { class: 'cloud-box' });

    const renderCloud = () => {
      clear(cloudBox);
      const st = ctx.cloudState?.() || { available: false };
      let desc = '本机已自动保存 · 在 TapTap 客户端打开可跨设备云同步';
      if (st.available) {
        if (st.syncing) desc = '正在与 TapTap 云端同步……';
        else if (st.dirty && st.cooldownSec > 0) desc = `本机已存 · 约 ${st.cooldownSec} 秒后自动同步至云端`;
        else if (st.lastError) desc = '云端暂忙，本机存档完好，可稍后再试';
        else if (st.lastSyncAt > 0) desc = '已连接 TapTap 云存档 · 进度已同步';
        else desc = '已连接 TapTap 云存档 · 换设备也能接着守';
      }
      cloudBox.appendChild(h('p', { class: 'cloud-box__title' }, '云存档'));
      cloudBox.appendChild(h('p', { class: 'cloud-box__desc' }, desc));
      if (st.available) {
        cloudBox.appendChild(h('div', { class: 'cloud-box__btns' },
          sealButton('上传云端', async () => {
            await ctx.onCloudUpload?.();
            renderCloud();
          }, { kind: 'small', disabled: st.syncing }),
          sealButton('拉取云端', async () => {
            await ctx.onCloudPull?.();
            renderCloud();
            refresh();
          }, { kind: 'ghost', cls: 'btn--small', disabled: st.syncing })));
      }
    };
    renderCloud();

    v = veil(root, scroll({
      title: '设置',
      cls: 'scroll--dialog',
      body: [
        settingsBody({ ...save.settings }, (s) => { ctx.onSettings(s); }),
        h('div', { class: 'ink-rule ink-rule--thin', 'aria-hidden': 'true' }),
        cloudBox,
        h('div', { class: 'settings-links' },
          h('button', { type: 'button', class: 'link-btn', onClick: () => showPrivacyDialog(root) }, '隐私政策'),
          h('button', { type: 'button', class: 'link-btn', onClick: () => showAgeDialog(root) }, '适龄提示 12+')),
      ],
      footer: [sealButton('好了', () => v.close())],
    }), { onBackdrop: () => v.close() });
  }

  refresh();
  return { el, refresh, openCheckin, openShop, openCodex: () => openCodex(root, save) };
}
