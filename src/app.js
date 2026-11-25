// 应用外壳：屏幕流转（标题 → 更房 → 局内 → 结算 → 更房）、存档 v3、云存档、鬼市外观、守夜功绩、五更守夜总榜、好友与多人同守五更联机串联。
// main.js 只做 startApp()。
import { createGame } from './game.js';
import * as Run from './sim/run.js';
import { WEAPON_IDS, loadSave, saveSave } from './meta/save.js';
import { createCloudSave } from './meta/cloud-save.js';
import { syncCodexFromRun } from './meta/codex.js';
import { getMetaBonuses } from './meta/shop.js';
import { recordRun, grantDoubleCoins, findNextUnlockGoal } from './meta/unlocks.js';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  claimAchievement,
  getAchievementStates,
  reconcileAchievements,
} from './meta/achievements.js';
import {
  claimDailyTask,
  claimWeeklyChest,
  getDailyState,
  recordDailyRun,
} from './meta/daily.js';
import {
  getDailyChallengeSpec,
  getDailyChallengeState,
  recordDailyChallengeRun,
} from './meta/daily-challenge.js';
import {
  buildSeasonRunRules,
  claimAllSeasonTiers,
  claimSeasonTier,
  getSeasonState,
  recordSeasonRun,
  setSeasonRuleActive,
} from './meta/season.js';
import { getEquippedHeroSkin, getEquippedAttackVfx } from './meta/cosmetics.js';
import { PRIMARY_LEADERBOARD_ID } from './meta/leaderboard-config.js';
import { createLeaderboard } from './meta/leaderboard.js';
import { createFriends } from './meta/friends.js';
import { createCoopManager } from './net/coop-net.js';
import { adsEnabled, watchAd } from './ads/ads.js';
import { adResultMessage } from './ads/ad-policy.js';
import { createAudio } from './audio/synth.js';
import { createHaptics } from './platform/haptics.js';
import { createMenuScene } from './render/menu-scene.js';
import { h, toast, setClickSound } from './ui/dom.js';
import { playScreenTransition } from './ui/motion.js';
import { preloadIcons } from './ui/icons.js';
import { renderTitle } from './ui/title.js';
import { renderHub } from './ui/hub.js';
import { renderResult } from './ui/result.js';
import { createRunUI } from './ui/run-ui.js';
import { runBootIntro } from './ui/boot-intro.js';
import { openLeaderboardModal } from './ui/leaderboard.js';
import { openCoopLobbyModal } from './ui/coop-lobby.js';
import { createCoach } from './ui/coach.js';

export async function startApp(bootOpts = {}) {
  const root = document.getElementById('ui');
  const canvas = document.getElementById('game-canvas');
  if (!root || !canvas) throw new Error('缺少 #ui 或 #game-canvas');

  const save = loadSave();
  reconcileAchievements(save);
  const cloud = createCloudSave();
  const persist = (syncCloud = false) => {
    saveSave(save);
    if (syncCloud) cloud.scheduleSync(save);
  };
  const audio = createAudio();
  const haptics = createHaptics();
  const coach = createCoach(root, { save, persist });
  setClickSound(() => audio.play('click'));

  let screen = null;          // 当前全屏界面元素
  let lastStart = null;       // 「再守一夜」沿用的英雄与夜色
  let finished = true;        // 本局是否已结算（防重复入账）
  let hub = null;
  let runUI = null;
  let menuScene = null;
  let activeCoopModal = null;
  let achBannerEl = null;
  let achBannerTimer = 0;

  const leaderboard = createLeaderboard({
    getSave: () => save,
    persistSave: (s) => saveSave(s),
  });

  const coop = createCoopManager({
    getSave: () => save,
    onStartCoopRun: ({ seed, nightLevel, party, mySlot, lockstep }) => {
      activeCoopModal?.close?.();
      activeCoopModal = null;
      const p0 = party?.[0] || {};
      startRun({
        heroId: p0.heroId || save.selectedHero || 'zhou',
        startWeapon: p0.startWeapon || null,
        nightLevel: nightLevel ?? save.selectedNight ?? 0,
        seed,
        coop: { party, mySlot: mySlot ?? 0, lockstep: Boolean(lockstep) },
      });
    },
    onWaitPeerChange: (waiting, text) => runUI?.setCoopWaitBanner?.(waiting, text),
    onCoopLevelSync: () => runUI?.syncCoopLevelUp?.(),
    onAiTakeover: () => toast('同行道友信号中断，已转交智能道友接管'),
  });

  function openLeaderboard(initialCollectionOrOpts = 'public') {
    const isObjArg = initialCollectionOrOpts && typeof initialCollectionOrOpts === 'object';
    return openLeaderboardModal(root, {
      save,
      leaderboard,
      initialBoard: isObjArg ? initialCollectionOrOpts.initialBoard : 'primary',
      initialCollection: isObjArg ? (initialCollectionOrOpts.initialCollection || 'public') : initialCollectionOrOpts,
    });
  }

  function openCoop(opts = {}) {
    if (activeCoopModal && document.querySelector('.coop-modal')) {
      if (opts.autoJoinCode) {
        coop.joinRoom(opts.autoJoinCode);
      }
      activeCoopModal.refresh?.();
      return activeCoopModal;
    }
    activeCoopModal = openCoopLobbyModal(root, {
      save,
      coop,
      friends,
      autoJoinCode: opts.autoJoinCode || null,
      openFriendsFirst: Boolean(opts.openFriendsFirst),
      onClose: () => {
        activeCoopModal = null;
      },
    });
    return activeCoopModal;
  }

  const friends = createFriends({
    getActiveRoomCode: () => coop.roomCode || null,
    onRoomInviteJoin: (roomCode) => {
      // 局内战斗进行中收到空事件不打断；收到明确有效房号时进入更房并加入对应房间
      if (game.run && game.run.status === 'playing' && !coop.isInRun()) {
        return;
      }
      if (!document.querySelector('.screen--hub')) {
        showHub();
      }
      openCoop({ autoJoinCode: roomCode });
    },
  });

  function showAchBanner(achId) {
    const def = ACHIEVEMENTS_BY_ID[achId];
    if (!def) return;
    achBannerEl?.remove();
    achBannerEl = h('div', { class: 'ach-banner', role: 'status', 'aria-live': 'polite' },
      h('i', { class: 'stamp stamp--xs' }, '功'),
      h('span', {}, `守夜功绩达成 · ${def.name}`));
    root.appendChild(achBannerEl);
    clearTimeout(achBannerTimer);
    achBannerTimer = setTimeout(() => {
      achBannerEl?.remove();
      achBannerEl = null;
    }, 2400);
  }

  function checkMidRunAchievements(run) {
    if (!run || !run.stats) return;
    if (!save.achievements?.kills800 && run.stats.kills >= 800) {
      save.achievements.kills800 = Date.now();
      persist(false);
      showAchBanner('kills800');
    }
    if (!save.achievements?.hit10k && run.stats.maxHit >= 10_000) {
      save.achievements.hit10k = Date.now();
      persist(false);
      showAchBanner('hit10k');
    }
  }

  const game = createGame({
    canvas,
    onStatusChange: (run) => {
      runUI?.handleStatus(run);
      coach.onStatus(run);
    },
    onSummary: (summary) => finishRun(summary),
    onEvents: (events, run) => {
      audio.onEvents(events);
      haptics.onEvents(events);
      coach.onEvents(events, run);
      if (Array.isArray(events)) {
        for (let i = 0; i < events.length; i++) {
          if (events[i]?.type === 'bossSpawn') runUI?.showBossCard?.(events[i].bossType);
        }
      }
      if (run && events && events.length) checkMidRunAchievements(run);
    },
    onAutoPause: () => runUI?.showPause(),
    onHudSync: (run) => runUI?.syncHud(run),
    transformInput: (sampled, run) => coop.buildStepInputs(sampled, run),
    onStepCommitted: (run) => coop.onStepCommitted(run),
    onAfterStep: (run) => coop.broadcastRunSnapshot(run),
    shouldSkipAutoPause: (run) => coop.isActive() || (Array.isArray(run?.players) && run.players.length > 1),
    onStart: (run) => {
      menuScene?.stop();
      coach.reset();
      finished = false;
      if (screen) setScreen(null);
      runUI?.closeCurrent();
      runUI?.mountHud();
      runUI?.syncHud(run);
      if (syncCodexFromRun(save, run)) persist(false);
    },
    onClear: () => {
      coach.reset();
      runUI?.teardown();
    },
  });

  menuScene = createMenuScene(canvas, { isBlocked: () => Boolean(game.run) });

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
    haptics.setEnabled(s.haptics !== false);
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
      reconcileAchievements(save);
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

  async function handleQuickCloud() {
    saveSave(save);
    if (!cloud.isAvailable()) {
      toast('本机存档已妥善保存（TapTap 内打开可跨端云同步）');
      return { ok: false, reason: 'unavailable' };
    }
    const pulled = await handleCloudPull(false);
    if (pulled?.ok && pulled.hasRemote) {
      cloud.scheduleSync(save);
      return pulled;
    }
    if (pulled?.ok && !pulled.hasRemote) {
      return handleCloudUpload();
    }
    return pulled;
  }

  /** 看广告：暂停 + 静音；结束后恢复声音，非 completed 时提示。 */
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
      chooseCoopUpgrade: (r, slot, i) => Run.chooseCoopUpgrade(r, slot, i),
      pickRecommendedChoiceIndex: (heroId, choices) => Run.pickRecommendedChoiceIndex(heroId, choices),
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
    onCoopChooseUpgrade: (slot, idx) => coop.submitLevelChoice(slot, idx),
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

  function setScreen(el, transition = 'ink') {
    const hadPrev = Boolean(screen);
    if (hub && screen === hub.el && el !== hub.el) {
      hub.teardown?.();
    }
    screen?.remove();
    activeCoopModal = null;
    root.querySelectorAll('.veil, .ui-exit-ghost').forEach((v) => v.remove());
    screen = el;
    if (hadPrev && transition) {
      playScreenTransition(root, transition);
    }
  }

  function showTitle() {
    game.clear();
    runUI.teardown();
    const el = renderTitle(root, {
      onStart: () => {
        audio.unlock();
        audio.setMusicMode('menu');
        showHub();
      },
      onReplayIntro: () => replayIntro(),
    });
    setScreen(el, 'ink');
    menuScene.start();
  }

  function startDailyChallenge(nowOverride = null) {
    const spec = getDailyChallengeSpec(nowOverride || new Date());
    return startRun({
      heroId: spec.heroId,
      startWeapon: spec.startWeapon,
      unlockedWeapons: [...WEAPON_IDS],
      nightLevel: spec.nightLevel,
      seed: spec.seed,
      runRules: spec.runRules,
      charm: null,
    });
  }

  function showHub() {
    game.clear();
    runUI.teardown();
    applySettings(save.settings);
    audio.setMusicMode('menu');
    hub?.teardown?.();
    hub = renderHub(root, {
      save,
      adsOn: () => adsEnabled(),
      persist,
      runAd,
      now: () => new Date(),
      onStart: (opts) => startRun(opts),
      onStartDailyChallenge: (spec) => startDailyChallenge(spec?.date || null),
      onSettings,
      onCosmeticChange: () => {
        applySettings(save.settings);
        coop.syncLocalProfile();
      },
      onProfileChange: () => coop.syncLocalProfile(),
      cloudState: () => cloud.getState(),
      onCloudUpload: () => handleCloudUpload(),
      onCloudPull: () => handleCloudPull(false),
      onQuickCloud: () => handleQuickCloud(),
      onCloudFlush: () => cloud.flushDirty(),
      onOpenLeaderboard: (opts) => openLeaderboard(opts || 'public'),
      onOpenCoop: () => openCoop(),
    });
    setScreen(hub.el, 'ink');
    menuScene.start();
  }

  function startRun({
    heroId = 'zhou',
    startWeapon = null,
    unlockedWeapons = null,
    nightLevel = 0,
    mapId = null,
    charm = null,
    seed,
    coop: coopParty = null,
    runRules = null,
  } = {}) {
    audio.unlock();
    menuScene.stop();
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
    const effectiveRules = runRules || (!coopParty ? buildSeasonRunRules(save, new Date()) : null);
    const chosenMap = effectiveRules?.mode === 'daily'
      ? 'qingshi'
      : (mapId === 'hedeng' || mapId === 'qingshi')
        ? mapId
        : (Array.isArray(save.mapsUnlocked) && save.mapsUnlocked.includes(save.selectedMap) ? save.selectedMap : 'qingshi');
    lastStart = {
      heroId,
      startWeapon: chosenStart,
      unlockedWeapons: chosenPool,
      nightLevel,
      mapId: chosenMap,
      seed: effectiveRules?.mode === 'daily' ? seed : undefined,
      runRules: effectiveRules?.mode === 'daily' ? effectiveRules : null,
    };
    setScreen(null, 'battle');
    finished = false;
    applySettings(save.settings);
    const p0Skin = coopParty?.party?.[0]?.skinId || getEquippedHeroSkin(save, heroId);
    const p0Vfx = coopParty?.party?.[0]?.attackVfx || getEquippedAttackVfx(save);
    const r = game.start({
      heroId,
      startWeapon: chosenStart,
      unlockedWeapons: chosenPool,
      nightLevel,
      mapId: chosenMap,
      meta: getMetaBonuses(save),
      charm,
      seed,
      coop: coopParty,
      skinId: p0Skin,
      attackVfx: p0Vfx,
      runRules: effectiveRules,
    });
    if (syncCodexFromRun(save, r)) persist(false);
    runUI.mountHud();
    runUI.syncHud(r);
    audio.setMusicMode('run');
    audio.setWatch(1);
    if (!save.stats.firstRunDone) runUI.showFirstRunHint();
    return r;
  }

  function endCurrentRun() {
    if (finished) return;
    const summary = game.finish();
    if (summary && !finished) finishRun(summary);
  }

  function finishRun(summary) {
    if (finished || !summary) return;
    finished = true;
    coop.onRunFinished();
    const nowTs = Date.now();
    const recorded = recordRun(save, summary, nowTs);
    recordDailyRun(save, summary, nowTs);
    const seasonRes = recordSeasonRun(save, summary, nowTs);
    if (summary.seasonRuleActive && seasonRes.seasonScore > 0) {
      leaderboard.submitSeasonScore(seasonRes.seasonScore, save);
    }
    let dcResult = null;
    if (summary.isDailyChallenge) {
      dcResult = recordDailyChallengeRun(save, summary, summary.dailyDate || nowTs);
      if (dcResult.ok) {
        recorded.coinsEarned += dcResult.coins;
        leaderboard.submitDailyScore(dcResult.dailyScore, save);
        if (dcResult.rewarded) {
          toast(`今日异事首胜入账：铜钱 +${dcResult.coins} · 周分 +${dcResult.weeklyPointsAdded}`, 2600);
        }
      }
    }
    persist(true);
    leaderboard.submitScore(summary.score, save);
    coach.reset();
    runUI.teardown();
    audio.setMusicMode('menu');
    const el = renderResult(root, {
      summary,
      recorded,
      nextGoal: findNextUnlockGoal(save),
      getNextGoal: () => findNextUnlockGoal(save),
      adsOn: () => adsEnabled(),
      runAd,
      onDouble: (amount) => { const add = grantDoubleCoins(save, amount); persist(true); return add; },
      onLeaderboard: () => openLeaderboard(
        summary.isDailyChallenge ? { initialBoard: 'daily' }
          : summary.seasonRuleActive ? { initialBoard: 'season' }
            : 'public',
      ),
      onHub: () => showHub(),
      onAgain: () => { game.clear(); startRun({ ...(lastStart || {}), charm: null }); },
    });
    setScreen(el, summary.cleared ? 'dawn' : 'ink');
    menuScene.start();
  }

  function replayIntro(opts = {}) {
    return runBootIntro({ ...opts, replay: true, audio });
  }

  window.addEventListener('pagehide', () => { saveSave(save); cloud.flushDirty(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveSave(save); cloud.flushDirty(); }
  });

  // 调试 / 黑盒 E2E 统一契约钩子
  window.__wugeng = {
    get save() { return save; },
    game,
    audio,
    haptics,
    coach,
    cloud,
    leaderboard,
    friends,
    coop,
    PRIMARY_LEADERBOARD_ID,
    achievements: {
      ACHIEVEMENTS,
      list: ACHIEVEMENTS,
      getAll: () => ACHIEVEMENTS,
      getStates: (cat = 'all') => getAchievementStates(save, cat),
      claim: (id) => {
        const res = claimAchievement(save, id);
        if (res.ok) {
          applySettings(save.settings);
          persist(true);
          hub?.refresh?.();
        }
        return res;
      },
    },
    daily: {
      getState: (nowVal = new Date()) => getDailyState(save, nowVal),
      claimTask: (taskId, nowVal = new Date(), opts = {}) => {
        const res = claimDailyTask(save, taskId, nowVal, opts);
        if (res.ok) {
          persist(true);
          hub?.refresh?.();
        }
        return res;
      },
      claimWeeklyChest: (pts, nowVal = new Date(), opts = {}) => {
        const res = claimWeeklyChest(save, pts, nowVal, opts);
        if (res.ok) {
          applySettings(save.settings);
          persist(true);
          hub?.refresh?.();
        }
        return res;
      },
    },
    dailyChallenge: {
      getSpec: (nowVal = new Date()) => getDailyChallengeSpec(nowVal),
      getState: (nowVal = new Date()) => getDailyChallengeState(save, nowVal),
      start: (nowVal = new Date()) => startDailyChallenge(nowVal),
    },
    season: {
      getState: (nowVal = new Date()) => getSeasonState(save, nowVal),
      setRuleActive: (active, nowVal = new Date()) => {
        const next = setSeasonRuleActive(save, active, nowVal);
        persist(false);
        hub?.refresh?.();
        return next;
      },
      claimTier: (tier, nowVal = new Date()) => {
        const res = claimSeasonTier(save, tier, nowVal);
        if (res.ok) {
          applySettings(save.settings);
          persist(true);
          hub?.refresh?.();
        }
        return res;
      },
      claimAll: (nowVal = new Date()) => {
        const res = claimAllSeasonTiers(save, nowVal);
        if (res.ok) {
          applySettings(save.settings);
          persist(true);
          hub?.refresh?.();
        }
        return res;
      },
    },
    showHub,
    startRun,
    startDailyChallenge,
    persist,
    replayIntro,
    openLeaderboard,
    openCoop,
    get hub() { return hub; },
    get screen() { return screen?.className || null; },
    get overlay() { return runUI.overlay; },
    get inspectorOpen() { return runUI.inspectorOpen; },
  };

  preloadIcons();
  bootOpts?.onIntroMounted?.();
  if (!bootOpts?.skipBootIntro) {
    await runBootIntro({ audio });
  }
  const launchRoomCode = friends.extractLaunchRoomCode();
  if (launchRoomCode) {
    showHub();
    openCoop({ autoJoinCode: launchRoomCode });
  } else {
    showTitle();
  }
  if (cloud.isAvailable()) handleCloudPull(true);
  if ((save.leaderboard?.pendingScore || 0) > 0 && leaderboard.isAvailable()) {
    leaderboard.flushPendingScore(save);
  }
}
