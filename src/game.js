// 游戏外壳：把 Sim（纯逻辑）、Render（画面）、Input（触控）串成主循环。
// 逻辑固定 60Hz 推进，渲染跟随显示器刷新率；顿帧期间暂停逻辑推进。
// UI 层通过 onStatusChange 得知升级、供盒、奇遇、死亡、通关等状态，自行弹出界面后调用 resume()。

import { createRun, stepRun, endRun } from './sim/run.js';
import { DT } from './sim/balance.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input.js';

const MAX_STEPS_PER_FRAME = 5;   // 低端机宁可慢动作，也不要越追越卡
const MAX_FRAME_GAP = 0.25;      // 秒：切后台回来时丢弃过长的时间差

function readSafeAreas() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const top = parseFloat(cs.paddingTop) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  return { top, bottom };
}

export function createGame({
  canvas,
  onStatusChange = () => {},
  onSummary = () => {},
  onEvents = () => {},
  onAutoPause = () => {},
  onHudSync = () => {},
  onStart = () => {},
  onClear = () => {},
} = {}) {
  const settings = { shake: true, dmgText: 'all', lowQuality: false, safeTop: 0, safeBottom: 0 };
  let renderer = createRenderer(canvas, { lowQuality: settings.lowQuality });
  const input = createInput(canvas, { getUltRect: () => renderer.getUltButtonRect?.() ?? null });
  const ctx = canvas.getContext('2d');

  let run = null;
  let paused = true;
  let lastStatus = null;
  let acc = 0;
  let lastTs = 0;
  let rafId = 0;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const safe = readSafeAreas();
    settings.safeTop = safe.top;
    settings.safeBottom = safe.bottom;
    renderer.resize(w, h, dpr);
  }

  function notifyStatus() {
    if (!run || run.status === lastStatus) return;
    lastStatus = run.status;
    input.reset();
    onStatusChange(run);
  }

  function drawStick() {
    const s = input.state.stick;
    if (!s.active || paused || !run || run.status !== 'playing') return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const kx = s.ox + (s.kx ?? input.state.moveX * 42);
    const ky = s.oy + (s.ky ?? input.state.moveY * 42);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 外圈：宣纸浅衬 + 墨圈，一更到五更夜色都看得清且不抢戏
    ctx.strokeStyle = 'rgba(239, 230, 210, 0.38)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(28, 26, 23, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 42, 0, Math.PI * 2);
    ctx.stroke();
    // 落指中心小点
    ctx.fillStyle = 'rgba(239, 230, 210, 0.55)';
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 3, 0, Math.PI * 2);
    ctx.fill();
    // 推杆珠：宣纸底 + 朱砂边
    ctx.fillStyle = 'rgba(239, 230, 210, 0.72)';
    ctx.strokeStyle = 'rgba(194, 59, 38, 0.78)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    const realDt = Math.min(MAX_FRAME_GAP, lastTs ? (ts - lastTs) / 1000 : 0);
    lastTs = ts;
    if (!run) return;

    if (!paused && run.status === 'playing') {
      const hit = renderer.hitstop || 0;
      if (hit <= 0) acc += realDt;
      let steps = 0;
      while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
        stepRun(run, input.sample(), DT);
        if (run.events.length) {
          renderer.consumeEvents(run.events);
          onEvents(run.events, run);
        }
        acc -= DT;
        steps++;
        if (run.status !== 'playing') { acc = 0; break; }
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    }
    if (!paused) notifyStatus();
    onHudSync(run);
    renderer.render(run, acc / DT, paused ? 0 : realDt, settings);
    drawStick();
  }

  function onVisibility() {
    if (document.hidden && run && !paused && run.status === 'playing') {
      paused = true;
      onAutoPause(run);
    }
    lastTs = 0;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  rafId = requestAnimationFrame(frame);

  const game = {
    get run() { return run; },
    settings,
    start({ heroId = 'zhou', nightLevel = 0, meta = {}, charm = null, seed } = {}) {
      const s = seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
      run = createRun({ seed: s, heroId, nightLevel, meta, charm });
      lastStatus = run.status;
      acc = 0; lastTs = 0;
      paused = false;
      input.reset();
      onStart(run);
      return run;
    },
    pause() { paused = true; input.reset(); },
    resume() {
      paused = false;
      lastTs = 0;
      acc = 0;
      if (run) lastStatus = run.status;
    },
    isPaused() { return paused; },
    /** 结算并通知 UI；UI 也可以直接调用 sim 的 endRun。 */
    finish() {
      if (!run) return null;
      const summary = endRun(run);
      paused = true;
      onSummary(summary);
      return summary;
    },
    /** 回到菜单时清空画面里的对局。 */
    clear() {
      run = null;
      paused = true;
      lastStatus = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onClear();
    },
    applySettings(next = {}) {
      const lowChanged = next.lowQuality !== undefined && next.lowQuality !== settings.lowQuality;
      Object.assign(settings, next);
      if (lowChanged) {
        renderer = createRenderer(canvas, { lowQuality: settings.lowQuality });
        resize();
      }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      input.destroy();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.removeEventListener('visibilitychange', onVisibility);
    },
  };
  return game;
}
