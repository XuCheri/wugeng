// 应用外壳：屏幕流转（标题 → 更房 → 局内 → 结算 → 更房）、存档、广告、音频串联。
// main.js 只做 startApp()。
import { createGame } from './game.js';
import * as Run from './sim/run.js';
import { loadSave, saveSave } from './meta/save.js';
import { createCloudSave } from './meta/cloud-save.js';
import { syncCodexFromRun } from './meta/codex.js';
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
import { runBootIntro } from './ui/boot-intro.js';
import { getEquippedHeroSkin, getEquippedAttackVfx } from './meta/cosmetics.js';

export async function startApp(bootOpts = {}) {
  const root = document.getElementById('ui');
  const canvas = document.getElementById('game-canvas');
  if (!root || !canvas) throw new Error('缺少 #ui 或 #game-canvas');

  const save = loadSave();
  const cloud = createCloudSave();
  const persist = (syncCloud = false) => {
    saveSave(save);
    if (syncCloud) cloud.scheduleSync(save);
  };
  const audio = createAudio();
  setClickSound(() => audio.play('click'));

  let screen = null;          // 当前全屏界面元素
  let lastStart = null;       // 「再守一夜」沿用的英雄与夜色
  let finished = true;        // 本局是否已结算（防重复入账）
  let hub = null;
  let runUI = null;

  const game = createGame({
    canvas,
    onStatusChange: (run) => runUI?.handleStatus(run),
    onSummary: (summary) => finishRun(summary),
    onEvents: (events) => audio.onEvents(events),
    onAutoPause: () => runUI?.showPause(),
    onHudSync: (run) => runUI?.syncHud(run),
    onStart: (run) => {
      finished = false;
      if (screen) setScreen(null);
      runUI?.closeCurrent();
      runUI?.mountHud();
      runUI?.syncHud(run);
      if (syncCodexFromRun(save, run)) persist(false);
    },
    onClear: () => {
      runUI?.teardown();
    },
  });

  function buildCosmeticsSnapshot() {
    const eq = save.cosmetics?.equipped || {};
    return {
      ...eq,
      attackVfx: getEquippedAttackVfx(save),
      heroSkins: eq.heroSkins ? { ...eq.heroSkins } : {},
    };
  }

  function applySettings(s) {
    audio.setEnabled({ sfx: s.sfx, music: s.music });
    game.applySettings({
      shake: s.shake, dmgText: s.dmgText, lowQuality: s.lowQuality,
      cosmetics: buildCosmeticsSnapshot(),
    });
  }
  function onSettings(s) {
    save.settings = { ...save.settings, ...s };
    persist(false);
    applySettings(save.settings);
  }
  applySettings(save.settings);

  async function handleCloudUpload() {
    saveSave(save);
    const r = await cloud.uploadNow(save);
    if (r.ok) toast('已上传至 TapTap 云存档');
    else if (r.reason === 'cooldown') toast(`云端每分钟限传一次，约 ${r.waitSec} 秒后自动上传`);
    else if (r.reason === 'unavailable') toast('当前环境未连接 TapTap 云存档');
    else toast('云端暂忙，本机存档已妥善保存');
    return r;
  }

  async function handleCloudPull(silent = false) {
    const r = await cloud.pullFromCloud(save);
    if (!r.ok) {
      if (!silent) {
        toast(r.reason === 'unavailable' ? '当前环境未连接 TapTap 云存档' : '拉取云端失败，请稍后再试');
      }
      return r;
    }
    if (r.hasRemote && r.merged) {
      Object.assign(save, r.merged);
      saveSave(save);
      applySettings(save.settings);
      if (hub && screen === hub.el) hub.refresh();
      if (r.updated) toast('已同步 TapTap 云端存档');
      else if (!silent) toast('本机与云端已是最新进度');
    } else if (!silent) {
      toast('云端暂无存档，已为你排队备份本机进度');
    }
    return r;
  }

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

  runUI = createRunUI(root, {
    game,
    sim: {
      chooseUpgrade: (r, i) => Run.chooseUpgrade(r, i),
      rerollChoices: (r) => Run.rerollChoices(r),
      banishChoice: (r, i) => Run.banishChoice(r, i),
      toggleLockChoice: (r, i) => Run.toggleLockChoice(r, i),
      grantAdRerolls: (r) => Run.grantAdRerolls(r),
      openChest: (r, preferredWeaponId = null) => Run.openChest(r, preferredWeaponId),
      interactShrine: (r, shrineId = null) => Run.interactShrine(r, shrineId),
      resolveShrine: (r, idx) => Run.resolveShrine(r, idx),
      dismissShrine: (r) => Run.dismissShrine(r),
      revive: (r) => Run.revive(r),
      enterEndless: (r) => Run.enterEndless(r),
      getEvolutionRecipe: (r, w) => Run.getEvolutionRecipe(r, w),
      canEvolve: (r, w) => Run.canEvolve(r, w),
    },
    adsOn: () => adsEnabled(),
    runAd,
    getSettings: () => save.settings,
    onSettings,
    onCodexSync: (r) => {
      if (syncCodexFromRun(save, r)) persist(false);
    },
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
    runUI.teardown();
    const el = renderTitle(root, {
      onStart: () => {
        audio.unlock();
        audio.setMusicMode('menu');
        showHub();
      },
    });
    setScreen(el);
  }

  function showHub() {
    game.clear();
    runUI.teardown();
    applySettings(save.settings);
    audio.setMusicMode('menu');
    hub = renderHub(root, {
      save,
      adsOn: () => adsEnabled(),
      persist,
      runAd,
      now: () => new Date(),
      onStart: (opts) => startRun(opts),
      onSettings,
      cloudState: () => cloud.getState(),
      onCloudUpload: () => handleCloudUpload(),
      onCloudPull: () => handleCloudPull(false),
    });
    setScreen(hub.el);
  }

  function startRun({
    heroId = 'zhou',
    startWeapon = null,
    unlockedWeapons = null,
    nightLevel = 0,
    charm = null,
    seed,
    coop = null,
  } = {}) {
    audio.unlock();
    if (charm) {
      const i = save.charms.findIndex((c) => c.relicId === charm.relicId);
      if (i >= 0) save.charms.splice(i, 1); else charm = null;
      persist(false);
    }
    const chosenStart = startWeapon
      ?? save.starterWeaponByHero?.[heroId]
      ?? save.selectedStarterWeapon
      ?? null;
    const chosenPool = unlockedWeapons
      ?? (Array.isArray(save.unlockedWeapons) ? save.unlockedWeapons : null);
    lastStart = { heroId, startWeapon: chosenStart, nightLevel };
    setScreen(null);
    finished = false;
    applySettings(save.settings);
    const r = game.start({
      heroId,
      startWeapon: chosenStart,
      unlockedWeapons: chosenPool,
      nightLevel,
      meta: getMetaBonuses(save),
      charm,
      seed,
      coop,
      skinId: getEquippedHeroSkin(save, heroId),
      attackVfx: getEquippedAttackVfx(save),
    });
    if (syncCodexFromRun(save, r)) persist(false);
    runUI.mountHud();
    runUI.syncHud(r);
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
    persist(true);
    runUI.teardown();
    audio.setMusicMode('menu');
    const el = renderResult(root, {
      summary,
      recorded,
      adsOn: () => adsEnabled(),
      runAd,
      onDouble: (amount) => { const add = grantDoubleCoins(save, amount); persist(true); return add; },
      onHub: () => showHub(),
      onAgain: () => { game.clear(); startRun({ ...(lastStart || {}), charm: null }); },
    });
    setScreen(el);
  }

  function replayIntro(opts = {}) {
    return runBootIntro({ ...opts, replay: true, audio });
  }

  window.addEventListener('pagehide', () => { saveSave(save); cloud.flushDirty(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveSave(save); cloud.flushDirty(); }
  });

  // 调试 / e2e 钩子（不影响正式流程）
  window.__wugeng = {
    get save() { return save; }, game, audio, cloud,
    showHub, startRun, persist, replayIntro,
    get hub() { return hub; },
    get screen() { return screen?.className || null; },
    get overlay() { return runUI.overlay; },
  };

  preloadIcons();   // 兼容旧调用；静态导入已同步可用
  bootOpts?.onIntroMounted?.();
  if (!bootOpts?.skipBootIntro) {
    await runBootIntro({ audio });
  }
  showTitle();
  if (cloud.isAvailable()) handleCloudPull(true);
}
