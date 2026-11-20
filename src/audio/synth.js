// Web Audio 实时合成（PLAN §2.6）：不放任何音频文件。
// 音效：更锣、梆子、纸张沙沙、墨点命中、拾取、升级、Boss 鼓、晨钟；
// 背景乐：五声音阶类古琴拨弦（Karplus-Strong 预渲染），按更次变密。
// API：createAudio() → { unlock, play, onEvents, setWatch, setEnabled, suspend, resume, setMusicMode }

const PENTA = [0, 2, 4, 7, 9];          // 宫商角徵羽
const ROOT_HZ = 146.83;                 // D3
const MAX_VOICES = 20;

// 每种音效的最短触发间隔（秒）与音量
const SFX = {
  gong:      { gap: 0.25, vol: 0.9 },
  gongSmall: { gap: 0.18, vol: 0.32 },
  woodblock: { gap: 0.05, vol: 0.55 },
  paper:     { gap: 0.07, vol: 0.28 },
  hit:       { gap: 0.035, vol: 0.32 },
  crit:      { gap: 0.06, vol: 0.42 },
  pickup:    { gap: 0.045, vol: 0.18 },
  coin:      { gap: 0.06, vol: 0.3 },
  levelup:   { gap: 0.3, vol: 0.5 },
  boss:      { gap: 1.0, vol: 0.85 },
  dawn:      { gap: 2.0, vol: 0.85 },
  hurt:      { gap: 0.15, vol: 0.5 },
  evolve:    { gap: 0.5, vol: 0.7 },
  click:     { gap: 0.04, vol: 0.4 },
  watch:     { gap: 1.0, vol: 0.6 },
};

/** 把 Karplus-Strong 拨弦渲染进 Float32Array（纯函数，便于预计算缓存）。 */
export function renderPluck(sampleRate, freq, seconds = 2.2, brightness = 0.5, rand = Math.random) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const buf = new Float32Array(period);
  // 激励：带一点低通的噪声，模拟指肉拨弦（比纯白噪更温润）
  let prev = 0;
  for (let i = 0; i < period; i++) {
    const w = rand() * 2 - 1;
    prev = prev + (w - prev) * (0.35 + brightness * 0.5);
    buf[i] = prev;
  }
  const decay = 0.996 - (freq > 400 ? 0.004 : 0);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % period];
    const v = (a + b) * 0.5 * decay;
    buf[idx] = v;
    out[i] = a;
    idx = (idx + 1) % period;
  }
  // 起音 3ms 渐入，防爆音
  const fade = Math.min(n, Math.floor(sampleRate * 0.003));
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  return out;
}

export function createAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx = null;
  let master, sfxBus, musicBus, comp;
  let noiseBuf = null;
  let enabled = { sfx: true, music: true };
  let watch = 0;
  let musicMode = 'off';     // 'menu' | 'run' | 'off'
  let activeVoices = 0;
  const lastPlay = new Map();
  const suspendReasons = new Set();
  const pluckCache = new Map();
  let schedTimer = null;
  let nextNoteT = 0;
  let step = 0;
  let melodyIdx = 5;

  function ensureCtx() {
    if (ctx || !AC) return ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return null; } }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.8;
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.22;
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    // 1 秒白噪声缓冲，所有噪声类音色共用
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // ───────── 基本构件 ─────────
  function voiceStart(dur) {
    activeVoices++;
    setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1); }, (dur + 0.05) * 1000);
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, freq, t, dur, peak, out, { a = 0.004, bend = 0 } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur);
    env(g, t, a, peak, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, out, { type = 'bandpass', freq = 1000, q = 1, a = 0.003, sweepTo = 0 } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
  }

  // ───────── 音色 ─────────
  const voices = {
    gong(t, v, out, f0 = 98) {
      // 低频正弦分音（略带下滑）+ 撞击噪声 + 长衰减
      const partials = [[1, 1], [1.48, 0.55], [2.0, 0.4], [2.76, 0.28], [3.42, 0.18], [4.1, 0.1]];
      for (const [r, a] of partials) osc('sine', f0 * r, t, 2.8 / Math.sqrt(r), v * a * 0.5, out, { a: 0.008, bend: 0.985 });
      noise(t, 0.18, v * 0.35, out, { freq: 420, q: 1.2, sweepTo: 180 });
      return 3;
    },
    gongSmall(t, v, out) { return voices.gong(t, v, out, 196); },
    woodblock(t, v, out, f = 880) {
      osc('square', f, t, 0.06, v * 0.25, out, { a: 0.001, bend: 0.9 });
      noise(t, 0.04, v * 0.5, out, { freq: f * 1.1, q: 9 });
      osc('sine', f * 0.5, t, 0.08, v * 0.3, out, { a: 0.001 });
      return 0.12;
    },
    paper(t, v, out) {
      noise(t, 0.09, v * 0.6, out, { type: 'highpass', freq: 2400, q: 0.7 });
      noise(t + 0.04, 0.12, v * 0.4, out, { freq: 3800, q: 2, sweepTo: 2200 });
      return 0.2;
    },
    hit(t, v, out, crit = false) {
      noise(t, crit ? 0.07 : 0.045, v * 0.8, out, { type: 'lowpass', freq: crit ? 2600 : 1400, q: 0.8 });
      osc('sine', crit ? 180 : 140, t, crit ? 0.12 : 0.07, v * 0.6, out, { a: 0.001, bend: 0.45 });
      return 0.15;
    },
    crit(t, v, out) { return voices.hit(t, v, out, true); },
    pickup(t, v, out) {
      const f = 1500 + Math.random() * 400;
      osc('sine', f, t, 0.045, v, out, { a: 0.001, bend: 1.25 });
      return 0.06;
    },
    coin(t, v, out) {
      osc('triangle', 2200, t, 0.08, v * 0.6, out, { a: 0.001 });
      osc('sine', 3300, t + 0.03, 0.12, v * 0.4, out, { a: 0.001 });
      return 0.18;
    },
    levelup(t, v, out) {
      // 五声音阶上行三音钟片
      const notes = [0, 4, 7, 12];
      notes.forEach((s, i) => bell(t + i * 0.07, ROOT_HZ * 4 * Math.pow(2, s / 12), v * 0.45, out, 1.1));
      return 1.5;
    },
    boss(t, v, out) {
      // 三声大鼓：咚—咚咚
      [0, 0.38, 0.56].forEach((dt, i) => {
        osc('sine', 72, t + dt, 0.5, v * (i === 0 ? 0.9 : 0.7), out, { a: 0.002, bend: 0.55 });
        noise(t + dt, 0.12, v * 0.35, out, { type: 'lowpass', freq: 380, q: 0.7 });
      });
      return 1.2;
    },
    dawn(t, v, out) {
      // 晨钟（非谐分音）+ 明亮的锣
      bell(t, 220, v * 0.7, out, 4.5);
      voices.gong(t + 0.6, v * 0.6, out, 147);
      bell(t + 1.4, 330, v * 0.45, out, 3.5);
      return 5;
    },
    hurt(t, v, out) {
      osc('triangle', 110, t, 0.18, v * 0.6, out, { a: 0.002, bend: 0.6 });
      noise(t, 0.08, v * 0.3, out, { type: 'lowpass', freq: 600 });
      return 0.25;
    },
    evolve(t, v, out) {
      voices.levelup(t, v * 0.8, out);
      voices.gong(t + 0.25, v * 0.7, out, 131);
      return 3;
    },
    click(t, v, out) { return voices.woodblock(t, v * 0.7, out, 1100); },
    watch(t, v, out, n = 1) {
      // 打更：梆子敲 n 下，再一声锣
      const k = Math.max(1, Math.min(5, n));
      for (let i = 0; i < k; i++) voices.woodblock(t + i * 0.32, v, out, 760);
      voices.gong(t + k * 0.32 + 0.1, v * 0.7, out, 110);
      return k * 0.32 + 3;
    },
  };

  function bell(t, f0, v, out, dur) {
    const parts = [[1, 1], [2.4, 0.5], [3.0, 0.35], [4.5, 0.2], [5.9, 0.12]];
    for (const [r, a] of parts) osc('sine', f0 * r, t, dur / Math.sqrt(r), v * a * 0.4, out, { a: 0.002 });
  }

  function canPlay() {
    return ctx && ctx.state === 'running' && suspendReasons.size === 0;
  }

  function play(name, opts = {}) {
    if (!enabled.sfx || !canPlay()) return false;
    const spec = SFX[name];
    const fn = voices[name];
    if (!spec || !fn) return false;
    const now = ctx.currentTime;
    const last = lastPlay.get(name) ?? -Infinity;
    if (now - last < spec.gap) return false;
    if (activeVoices >= MAX_VOICES && name !== 'boss' && name !== 'dawn' && name !== 'gong') return false;
    lastPlay.set(name, now);
    const v = spec.vol * (opts.volume ?? 1);
    const dur = fn(now + 0.005, v, sfxBus, opts.arg) || 0.3;
    voiceStart(dur);
    return true;
  }

  // ───────── 局内事件 → 音效 ─────────
  function onEvents(events) {
    if (!events || !events.length || !enabled.sfx || !canPlay()) return;
    let hits = 0, crits = 0, kills = 0, xp = 0;
    for (const e of events) {
      switch (e.type) {
        case 'hit': if (e.crit) crits++; else hits++; break;
        case 'kill': kills++; if (e.elite || e.boss) play('woodblock'); break;
        case 'pickup':
          if (e.kind === 'coin') play('coin');
          else if (e.kind === 'xp') xp++;
          else play('levelup', { volume: 0.5 });
          break;
        case 'fire': if (e.weaponId === 'gong') play('gongSmall'); break;
        case 'ult': play('gong', { volume: 1 }); break;
        case 'levelup': play('levelup'); break;
        case 'watchChange': setWatch(e.watch); if (e.watch >= 2 && e.watch <= 5) play('watch', { arg: e.watch }); break;
        case 'bossSpawn': play('boss'); break;
        case 'bossDefeated': play('gong'); break;
        case 'evolve': play('evolve'); break;
        case 'propBreak': play('paper', { volume: 1.3 }); break;
        case 'dawn': setWatch(6); play('dawn'); break;
        case 'revive': play('evolve'); break;
        case 'playerHurt': play('hurt'); break;
        default: break;
      }
    }
    if (crits) play('crit');
    else if (hits) play('hit', { volume: Math.min(1, 0.6 + hits * 0.1) });
    if (kills) play('paper', { volume: Math.min(1.2, 0.7 + kills * 0.1) });
    if (xp) play('pickup');
  }

  // ───────── 背景乐：五声音阶拨弦 ─────────
  function pluckBuffer(semi) {
    const key = semi;
    let b = pluckCache.get(key);
    if (b) return b;
    const f = ROOT_HZ * Math.pow(2, semi / 12);
    const data = renderPluck(ctx.sampleRate, f, semi < 0 ? 3 : 2.2, semi > 12 ? 0.7 : 0.45);
    b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
    pluckCache.set(key, b);
    return b;
  }
  function scaleSemi(i) {
    const oct = Math.floor(i / 5);
    return PENTA[((i % 5) + 5) % 5] + 12 * oct;
  }
  function pluck(t, semi, vol) {
    const s = ctx.createBufferSource();
    s.buffer = pluckBuffer(semi);
    s.playbackRate.value = 1 + (Math.random() - 0.5) * 0.004;
    const g = ctx.createGain();
    g.gain.value = vol;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t);
    // 吟猱：偶尔轻微滑音
    if (Math.random() < 0.18) s.playbackRate.setTargetAtTime(1.012, t + 0.25, 0.3);
  }

  function musicParams() {
    if (musicMode === 'menu') return { beat: 0.62, density: 0.32, drone: false, bright: false };
    const w = Math.max(1, Math.min(6, watch || 1));
    if (w === 6) return { beat: 0.3, density: 0.75, drone: false, bright: true };
    return {
      beat: [0, 0.6, 0.52, 0.45, 0.38, 0.32][w],
      density: [0, 0.3, 0.42, 0.55, 0.66, 0.78][w],
      drone: w >= 3,
      bright: false,
    };
  }

  function schedule() {
    if (!ctx || musicMode === 'off' || !enabled.music || !canPlay()) return;
    const ahead = 0.4;
    if (nextNoteT < ctx.currentTime) nextNoteT = ctx.currentTime + 0.05;
    while (nextNoteT < ctx.currentTime + ahead) {
      const p = musicParams();
      const t = nextNoteT;
      const bar = step % 8;
      if (bar === 0) pluck(t, p.bright ? 7 - 12 : -12, 0.55);       // 低音根音
      if (p.drone && bar === 4) pluck(t, -5, 0.35);
      if (Math.random() < p.density) {
        // 旋律：音阶上随机游走，偏向回到中音区
        const pull = melodyIdx > 9 ? -1 : melodyIdx < 3 ? 1 : 0;
        melodyIdx += pull || [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
        melodyIdx = Math.max(0, Math.min(12, melodyIdx));
        const semi = scaleSemi(melodyIdx) + (p.bright ? 12 : 0);
        pluck(t + (Math.random() - 0.5) * 0.015, semi, 0.42);
        if (Math.random() < 0.12) pluck(t + 0.02, semi + 12, 0.22);   // 泛音
      }
      nextNoteT += p.beat * (step % 2 === 0 ? 1.06 : 0.94);           // 轻微摇摆
      step++;
    }
  }

  function startScheduler() {
    if (schedTimer) return;
    schedTimer = setInterval(schedule, 100);
  }

  // ───────── 生命周期 ─────────
  function unlock() {
    if (!ensureCtx()) return false;
    if (ctx.state === 'suspended' && suspendReasons.size === 0) ctx.resume().catch(() => {});
    // iOS：播一个静音缓冲彻底解锁
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch {}
    startScheduler();
    return true;
  }

  function applyGains() {
    if (!ctx) return;
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(enabled.sfx ? 1 : 0, t, 0.03);
    musicBus.gain.setTargetAtTime(enabled.music ? 0.22 : 0, t, 0.2);
  }

  function setEnabled(next = {}) {
    enabled = { ...enabled, ...next };
    applyGains();
  }

  function setWatch(n) { watch = Math.max(0, Math.min(6, n | 0)); }
  function setMusicMode(mode) {
    musicMode = mode;
    if (mode === 'run' && !watch) watch = 1;
    if (mode === 'menu') watch = 0;
  }

  function suspend(reason = 'user') {
    suspendReasons.add(reason);
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }
  function resume(reason = 'user') {
    suspendReasons.delete(reason);
    if (reason === 'all') suspendReasons.clear();
    if (ctx && suspendReasons.size === 0 && ctx.state !== 'running') ctx.resume().catch(() => {});
    nextNoteT = 0;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) suspend('hidden'); else resume('hidden');
    });
    // 首次用户手势解锁（之后 UI 也会显式调用 unlock）
    const first = () => {
      unlock();
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
  }

  return {
    unlock, play, onEvents, setWatch, setEnabled, suspend, resume, setMusicMode,
    get state() { return ctx ? ctx.state : 'none'; },
  };
}
