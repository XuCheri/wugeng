// 应用外壳：屏幕流转（标题 → 更房 → 局内 → 结算 → 更房）、存档、广告、音频串联。
// main.js 只做 startApp()。
import { createGame } from './game.js';
import * as Run from './sim/run.js';
import { loadSave, saveSave } from './meta/save.js';
import { getMetaBonuses } from './meta/shop.js';
import { recordRun, grantDoubleCoins } from './meta/unlocks.js';
import { adsEnabled, watchAd } from './ads/ads.js';
import { adResultMessage } from './ads/ad-policy.js';
import { createAudio } from './audio/synth.js';
import { h, toast, setClickSound } from './ui/dom.js';
import { preloadIcons } from './ui/icons.js';
import { renderTitle } from './ui/title.js';
import { renderHub } from './ui/hub.js';
import { renderResult } from './ui/result.js';
import { createRunUI } from './ui/run-ui.js';

export async function startApp() {
  const root = document.getElementById('ui');
  const canvas = document.getElementById('game-canvas');
  if (!root || !canvas) throw new Error('缺少 #ui 或 #game-canvas');

  const save = loadSave();
  const persist = () => saveSave(save);
  const audio = createAudio();
  setClickSound(() => audio.play('click'));

  let screen = null;          // 当前全屏界面元素
  let lastStart = null;       // 「再守一夜」沿用的英雄与夜色
  let finished = true;        // 本局是否已结算（防重复入账）

  const game = createGame({
    canvas,
    onStatusChange: (run) => runUI.handleStatus(run),
    onSummary: (summary) => finishRun(summary),
    onEvents: (events) => audio.onEvents(events),
    onAutoPause: () => runUI.showPause(),
  });

  function applySettings(s) {
    audio.setEnabled({ sfx: s.sfx, music: s.music });
    game.applySettings({
      shake: s.shake, dmgText: s.dmgText, lowQuality: s.lowQuality,
      cosmetics: { ...save.cosmetics.equipped },
    });
  }
  function onSettings(s) {
    save.settings = { ...save.settings, ...s };
    persist();
    applySettings(save.settings);
  }
  applySettings(save.settings);

  /** 看广告：暂停 + 静音；结束后恢复声音，非 completed 时提示。界面上的遮罩负责之后是否继续游戏。 */
  async function runAd(placement) {
    game.pause();
    audio.suspend('ad');
    const blocker = h('div', { class: 'ad-blocker', role: 'status' }, h('p', {}, '广告加载中……'));
    root.appendChild(blocker);
    let res = 'unavailable';
    try { res = await watchAd(placement); } catch { res = 'unavailable'; }
    blocker.remove();
    audio.resume('ad');
    const msg = adResultMessage(res);
    if (msg) toast(msg);
    return res;
  }

  const runUI = createRunUI(root, {
    game,
    sim: {
      chooseUpgrade: (r, i) => Run.chooseUpgrade(r, i),
      rerollChoices: (r) => Run.rerollChoices(r),
      grantAdRerolls: (r) => Run.grantAdRerolls(r),
      openChest: (r) => Run.openChest(r),
      revive: (r) => Run.revive(r),
      enterEndless: (r) => Run.enterEndless(r),
    },
    adsOn: () => adsEnabled(),
    runAd,
    getSettings: () => save.settings,
    onSettings,
    onFinish: () => endCurrentRun(),
    audio,
  });

  function setScreen(el) {
    screen?.remove();
    // 收起残留弹窗（局内覆盖层由 runUI 管）
    root.querySelectorAll('.veil').forEach((v) => v.remove());
    screen = el;
  }

  function showTitle() {
    const el = renderTitle(root, {
      onStart: () => {
        audio.unlock();
        audio.setMusicMode('menu');
        showHub();
      },
    });
    setScreen(el);
  }

  let hub = null;
  function showHub() {
    game.clear();
    audio.setMusicMode('menu');
    hub = renderHub(root, {
      save,
      adsOn: () => adsEnabled(),
      persist,
      runAd,
      now: () => new Date(),
      onStart: (opts) => startRun(opts),
      onSettings,
    });
    setScreen(hub.el);
  }

  function startRun({ heroId, nightLevel, charm }) {
    audio.unlock();
    if (charm) {
      const i = save.charms.findIndex((c) => c.relicId === charm.relicId);
      if (i >= 0) save.charms.splice(i, 1); else charm = null;
      persist();
    }
    lastStart = { heroId, nightLevel };
    setScreen(null);
    finished = false;
    game.start({ heroId, nightLevel, meta: getMetaBonuses(save), charm });
    runUI.mountHud();
    audio.setMusicMode('run');
    audio.setWatch(1);
    if (!save.stats.firstRunDone) runUI.showFirstRunHint();
  }

  function endCurrentRun() {
    if (finished) return;
    const summary = game.finish();          // 内部会触发 onSummary → finishRun
    if (summary && !finished) finishRun(summary);
  }

  function finishRun(summary) {
    if (finished || !summary) return;
    finished = true;
    const recorded = recordRun(save, summary, Date.now());
    persist();
    runUI.teardown();
    audio.setMusicMode('menu');
    const el = renderResult(root, {
      summary,
      recorded,
      adsOn: () => adsEnabled(),
      runAd,
      onDouble: (amount) => { const add = grantDoubleCoins(save, amount); persist(); return add; },
      onHub: () => showHub(),
      onAgain: () => { game.clear(); startRun({ ...lastStart, charm: null }); },
    });
    setScreen(el);
  }

  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  // 调试 / e2e 钩子（不影响正式流程）
  window.__wugeng = {
    get save() { return save; }, game, audio,
    showHub, startRun, persist,
    get screen() { return screen?.className || null; },
    get overlay() { return runUI.overlay; },
  };

  preloadIcons();   // 不阻塞启动；签面图标到时没加载好就用墨字小印
  showTitle();
}
