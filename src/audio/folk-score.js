// folk-score.js —— 《五更天》多轨民俗器乐合成与编曲谱表（零外部音频资产，纯 WebAudio 离线波表 + 实时分轨调度）
// 配器：古琴/琵琶拨弦（接 synth.js renderPluck）+ 洞箫（气声竹管）+ 唢呐（双簧鼻音三大共振峰 + 滑音吟音）+ 堂鼓 + 梆子
// 五态编曲：menu（更房夜寂） / watch_early（一至三更夜巡） / watch_late（四至五更阴风） / boss（唢呐破阵战歌） / dawn（五更破晓）

const TWO_PI = Math.PI * 2;
export const FOLK_ROOT_HZ = 146.83; // D3

// 十阶五声上行拾取音阶（宫商角徵羽跨越双八度：D E F# A B D' E' F#' A' B'）
export const PENTA_COMBO_SEMITONES = Object.freeze([0, 2, 4, 7, 9, 12, 14, 16, 19, 21]);

function clampSample(x) {
  if (!Number.isFinite(x)) return 0;
  return x > 0.96 ? 0.96 : x < -0.96 ? -0.96 : x;
}

/** 二阶带通滤波器系数（纯 JS 离线滤波，兼容任意精简 MockAudioContext） */
function applyBandpass(input, sampleRate, centerHz, q) {
  const n = input.length;
  const out = new Float32Array(n);
  const nyq = sampleRate * 0.46;
  const f0 = Math.max(40, Math.min(nyq, centerHz));
  const w0 = (TWO_PI * f0) / sampleRate;
  const sinW = Math.sin(w0);
  const cosW = Math.cos(w0);
  const alpha = sinW / (2 * Math.max(0.4, q));
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW;
  const a2 = 1 - alpha;
  const ib0 = b0 / a0;
  const ib1 = b1 / a0;
  const ib2 = b2 / a0;
  const ia1 = a1 / a0;
  const ia2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = input[i];
    const y0 = ib0 * x0 + ib1 * x1 + ib2 * x2 - ia1 * y1 - ia2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = Number.isFinite(y0) ? y0 : 0;
    out[i] = y1;
  }
  return out;
}

/**
 * 预渲染中国唢呐（Suona）单音采样：
 * - 起音 28ms 上滑音（民间吹打「滑音」咬字）+ 中后段 5.8Hz 吟音颤音
 * - 双簧哨片非对称谐波激励 + 三组铜碗喇叭口共振峰（980Hz 鼻腔厚韵 / 2180Hz 哨片穿透 / 3420Hz 金石铜亮）
 */
export function renderSuona(sampleRate, freq, seconds = 0.46) {
  const sr = Math.max(8000, Number(sampleRate) || 22050);
  const baseHz = Math.max(110, Math.min(sr * 0.35, Number(freq) || 587.33));
  const n = Math.max(64, Math.floor(sr * Math.max(0.08, seconds)));
  const raw = new Float32Array(n);

  let phase = 0;
  let lcg = (Math.round(baseHz * 131) ^ 0x5a3c91) >>> 0;
  const scoopSec = Math.min(0.03, seconds * 0.22);
  const relSec = Math.min(0.085, seconds * 0.28);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // 上滑音 + 延后吟音
    const scoop = t < scoopSec ? -1.25 * (1 - t / scoopSec) * (1 - t / scoopSec) : 0;
    const vibDepth = t > 0.085 ? Math.min(0.24, (t - 0.085) * 1.1) : 0;
    const vib = Math.sin(TWO_PI * 5.8 * t) * vibDepth;
    const instHz = Math.min(sr * 0.42, baseHz * Math.pow(2, (scoop + vib) / 12));

    phase += (TWO_PI * instHz) / sr;
    if (phase > TWO_PI) phase -= TWO_PI;

    // 哨片复合谐波（奇偶并重，模拟芦苇哨片非线性开合）
    const reed =
      Math.sin(phase) +
      0.72 * Math.sin(phase * 2 + 0.2) +
      0.58 * Math.sin(phase * 3) +
      0.42 * Math.sin(phase * 4 + 0.35) +
      0.28 * Math.sin(phase * 5) +
      0.18 * Math.sin(phase * 6);

    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    const chiff = ((lcg / 0xffffffff) * 2 - 1) * (t < 0.024 ? 0.22 * (1 - t / 0.024) : 0.025);

    const att = t < 0.008 ? t / 0.008 : 1;
    const rel = t > seconds - relSec ? Math.max(0, (seconds - t) / relSec) : 1;
    raw[i] = Math.tanh((reed + chiff) * 1.55) * att * rel;
  }

  // 三大铜碗哨管共振峰并联染色
  const f1 = applyBandpass(raw, sr, 980, 3.6);
  const f2 = applyBandpass(raw, sr, 2180, 4.8);
  const f3 = applyBandpass(raw, sr, Math.min(sr * 0.42, 3420), 5.4);

  const out = new Float32Array(n);
  let peak = 0.001;
  for (let i = 0; i < n; i++) {
    const v = raw[i] * 0.28 + f1[i] * 0.56 + f2[i] * 0.62 + f3[i] * 0.36;
    out[i] = v;
    const av = Math.abs(v);
    if (av > peak) peak = av;
  }
  const norm = 0.86 / peak;
  for (let i = 0; i < n; i++) out[i] = clampSample(out[i] * norm);
  return out;
}

/**
 * 预渲染中国洞箫（Xiao）单音采样：
 * 温润竹管基频 + 偶次泛音 + 吹口竹风气声（Chiff），营造守夜幽巷与破晓清气
 */
export function renderXiao(sampleRate, freq, seconds = 0.78) {
  const sr = Math.max(8000, Number(sampleRate) || 22050);
  const baseHz = Math.max(90, Math.min(sr * 0.35, Number(freq) || 293.66));
  const n = Math.max(64, Math.floor(sr * Math.max(0.12, seconds)));
  const out = new Float32Array(n);
  const breath = new Float32Array(n);

  let lcg = (Math.round(baseHz * 97) ^ 0x3f72b1) >>> 0;
  for (let i = 0; i < n; i++) {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    breath[i] = (lcg / 0xffffffff) * 2 - 1;
  }
  const airBand = applyBandpass(breath, sr, Math.min(sr * 0.42, baseHz * 2.02), 6.5);

  let phase = 0;
  const attSec = Math.min(0.055, seconds * 0.25);
  const relSec = Math.min(0.16, seconds * 0.32);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vib = t > 0.14 ? Math.sin(TWO_PI * 4.5 * t) * 0.14 : 0;
    const instHz = baseHz * Math.pow(2, vib / 12);
    phase += (TWO_PI * instHz) / sr;
    if (phase > TWO_PI) phase -= TWO_PI;

    const tone =
      0.68 * Math.sin(phase) +
      0.22 * Math.sin(phase * 2 + 0.4) +
      0.08 * Math.sin(phase * 3);
    const airEnv = t < 0.08 ? 0.24 * (1 - t / 0.08) + 0.06 : 0.06;
    const att = t < attSec ? Math.sin((t / attSec) * (Math.PI * 0.5)) : 1;
    const rel = t > seconds - relSec ? Math.max(0, (seconds - t) / relSec) : 1;
    out[i] = clampSample((tone + airBand[i] * airEnv) * att * rel * 0.85);
  }
  return out;
}

/**
 * 预渲染中国堂鼓（Tanggu）单次鼓击：
 * 厚牛皮低频下潜 + 鼓腔泛音 + 重拍鼓帮木击声
 */
export function renderTanggu(sampleRate, accent = false) {
  const sr = Math.max(8000, Number(sampleRate) || 22050);
  const seconds = accent ? 0.34 : 0.22;
  const n = Math.max(64, Math.floor(sr * seconds));
  const out = new Float32Array(n);
  let p1 = 0, p2 = 0;
  let lcg = accent ? 0x91ab34f1 : 0x4412cd77;
  const startHz = accent ? 114 : 92;
  const endHz = accent ? 46 : 50;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const k = Math.exp(-t * (accent ? 13 : 17));
    const hz = endHz + (startHz - endHz) * Math.exp(-t * 26);
    p1 += (TWO_PI * hz) / sr;
    p2 += (TWO_PI * hz * 1.58) / sr;
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    const slap = ((lcg / 0xffffffff) * 2 - 1) * Math.exp(-t * 85) * (accent ? 0.36 : 0.18);
    const rim = accent ? Math.sin(TWO_PI * 740 * t) * Math.exp(-t * 68) * 0.18 : 0;
    const att = t < 0.003 ? t / 0.003 : 1;
    const body = (Math.sin(p1) * 0.82 + Math.sin(p2) * 0.24) * k;
    out[i] = clampSample(Math.tanh((body + slap + rim) * (accent ? 1.35 : 1.05)) * att);
  }
  return out;
}

/**
 * 预渲染打更枣木梆子（Bangzi）敲击
 */
export function renderBangzi(sampleRate, high = false) {
  const sr = Math.max(8000, Number(sampleRate) || 22050);
  const seconds = 0.09;
  const n = Math.max(32, Math.floor(sr * seconds));
  const out = new Float32Array(n);
  const f0 = high ? 1160 : 840;
  let lcg = high ? 0x17ac8901 : 0x73bc1109;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    const click = ((lcg / 0xffffffff) * 2 - 1) * Math.exp(-t * 140) * 0.25;
    const wood =
      (Math.sin(TWO_PI * f0 * t) * 0.72 + Math.sin(TWO_PI * f0 * 2.38 * t) * 0.34) *
      Math.exp(-t * 52);
    const att = t < 0.0015 ? t / 0.0015 : 1;
    out[i] = clampSample((wood + click) * att * 0.88);
  }
  return out;
}

// ───────── 五态多轨民俗编曲谱表（32 步循环 = 2 小节 4/4）─────────
// 半音偏移基于 D3 (146.83Hz)：
// -12=D2, -5=A2, -2=C3, 0=D3, 2=E3, 3=F3(清角幽寒), 4=F#3, 7=A3, 9=B3, 10=C4,
// 12=D4, 14=E4, 15=F4, 16=F#4, 19=A4, 21=B4, 22=C5, 24=D5, 26=E5, 27=F5, 28=F#5, 31=A5

export const FOLK_SCORES = Object.freeze({
  // 1. 更房夜寂：古琴沉吟 + 洞箫幽咽 + 远巷一慢二快打更梆子
  menu: {
    stepSec: 0.34,
    swing: 0.03,
    pluck: [
      0, null, 7, null, 12, null, 14, null,
      9, null, 7, null, 2, null, null, null,
      -5, null, 2, null, 7, null, 9, null,
      7, null, 4, null, 0, null, null, null,
    ],
    bass: [
      -12, null, null, null, null, null, null, null,
      -5, null, null, null, null, null, null, null,
      -10, null, null, null, null, null, null, null,
      -12, null, null, null, null, null, null, null,
    ],
    xiao: [
      null, null, 19, null, null, null, null, null,
      null, null, 16, null, 14, null, null, null,
      null, null, 21, null, null, null, 19, null,
      null, null, 14, null, 12, null, null, null,
    ],
    suona: null,
    drum: [
      1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
    bangzi: [
      1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 2, 0, 2, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0, 0,
    ],
  },

  // 2. 一至三更·古巷夜巡：紧凑琵琶暗步 + 梆子巡更点 + 洞箫微寒悬疑（含清角 F 音）
  watch_early: {
    stepSec: 0.23,
    swing: 0.04,
    pluck: [
      0, null, 7, 12, null, 10, 7, null,
      0, null, 7, 14, 15, null, 12, 7,
      -2, null, 5, 10, null, 12, 7, null,
      -5, null, 2, 7, 10, null, 7, 2,
    ],
    bass: [
      -12, null, null, null, -12, null, null, null,
      -5, null, null, null, -5, null, null, null,
      -10, null, null, null, -10, null, null, null,
      -5, null, null, null, -7, null, null, null,
    ],
    xiao: [
      19, null, null, null, null, null, 22, null,
      21, null, null, null, 19, null, null, null,
      15, null, null, null, 14, null, null, null,
      12, null, null, null, null, null, null, null,
    ],
    suona: null,
    drum: [
      1, 0, 0, 0, 0, 0, 1, 0,
      0, 0, 1, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 1, 0,
      0, 0, 1, 0, 0, 0, 1, 0,
    ],
    bangzi: [
      0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 2, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 2, 0, 1, 0, 2, 0,
    ],
  },

  // 3. 四至五更·百鬼压城：疾促堂鼓催更 + 琵琶扫轮 + 洞箫与高音引子呼应
  watch_late: {
    stepSec: 0.175,
    swing: 0.02,
    pluck: [
      0, 7, 12, 7, 15, 12, 7, 12,
      0, 7, 14, 15, 19, 15, 14, 12,
      -2, 5, 10, 14, 17, 14, 10, 7,
      -5, 2, 7, 10, 15, 14, 12, 7,
    ],
    bass: [
      -12, null, -12, null, -12, null, -5, null,
      -12, null, -12, null, -10, null, -5, null,
      -2, null, -2, null, -2, null, -5, null,
      -5, null, -5, null, -7, null, -5, null,
    ],
    xiao: [
      24, null, null, 22, 19, null, null, null,
      null, null, 22, null, 24, null, 26, null,
      22, null, null, 19, 15, null, null, null,
      null, null, 19, null, 14, null, null, null,
    ],
    suona: [
      null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 26, 24,
      null, null, null, null, null, null, null, null,
      null, null, null, null, 24, null, 19, null,
    ],
    drum: [
      2, 0, 1, 0, 1, 0, 2, 0,
      1, 0, 1, 0, 2, 0, 1, 1,
      2, 0, 1, 0, 1, 0, 2, 0,
      1, 1, 2, 0, 2, 0, 1, 2,
    ],
    bangzi: [
      0, 0, 1, 0, 2, 0, 0, 1,
      0, 0, 1, 0, 2, 0, 2, 0,
      0, 0, 1, 0, 2, 0, 0, 1,
      2, 0, 1, 2, 0, 2, 1, 0,
    ],
  },

  // 4. 夜主降临 / 无尽血战：唢呐破阵战歌（高燃唢呐主旋律 + 雷霆堂鼓战阵 + 急促梆子 + 琵琶狂扫）
  boss: {
    stepSec: 0.148,
    swing: 0.015,
    pluck: [
      0, 12, 7, 12, 0, 12, 15, 12,
      0, 12, 7, 12, 14, 12, 7, 2,
      -2, 10, 5, 10, -2, 10, 14, 10,
      -5, 7, 2, 7, 9, 12, 14, 16,
    ],
    bass: [
      -12, null, -12, -12, -12, null, -5, null,
      -12, null, -12, null, -10, null, -5, -7,
      -2, null, -2, -2, -2, null, -5, null,
      -5, null, -5, -5, -7, null, -5, -12,
    ],
    xiao: null,
    // 高亢唢呐主旋律：两小节完整民间吹打战歌（含八度腾跃与收尾花舌连音）
    suona: [
      19, null, 21, 24, 26, null, 24, 21,
      19, 21, 19, 16, 14, null, 12, 14,
      19, null, 24, 26, 28, null, 31, 28,
      26, 24, 21, 24, 26, 27, 26, 24,
    ],
    drum: [
      2, 0, 1, 2, 1, 0, 2, 0,
      2, 0, 1, 1, 2, 0, 1, 2,
      2, 0, 1, 2, 1, 0, 2, 1,
      2, 1, 2, 0, 2, 2, 1, 2,
    ],
    bangzi: [
      2, 0, 0, 1, 2, 0, 1, 0,
      2, 0, 0, 1, 2, 1, 2, 0,
      2, 0, 0, 1, 2, 0, 1, 0,
      2, 1, 2, 1, 0, 2, 2, 1,
    ],
  },

  // 5. 五更破晓 / 凯旋：清朗宫调五声（明快洞箫 + 琵琶拂晓 + 庆典堂鼓）
  dawn: {
    stepSec: 0.175,
    swing: 0.03,
    pluck: [
      0, null, 7, 12, 16, null, 19, 16,
      12, null, 14, 16, 19, null, 24, null,
      9, null, 14, 19, 21, null, 19, 16,
      14, null, 12, 9, 7, null, 12, null,
    ],
    bass: [
      -12, null, null, null, -5, null, null, null,
      -12, null, null, null, -5, null, null, null,
      -3, null, null, null, -5, null, null, null,
      -12, null, null, null, -12, null, null, null,
    ],
    xiao: [
      24, null, null, null, 26, null, 28, null,
      31, null, null, null, 28, null, 24, null,
      21, null, null, null, 24, null, 26, null,
      24, null, null, null, null, null, null, null,
    ],
    suona: null,
    drum: [
      2, 0, 0, 0, 1, 0, 0, 0,
      2, 0, 0, 1, 1, 0, 0, 0,
      2, 0, 0, 0, 1, 0, 0, 0,
      2, 0, 1, 0, 2, 0, 0, 0,
    ],
    bangzi: [
      1, 0, 0, 0, 0, 0, 2, 0,
      0, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 2, 0,
      0, 0, 0, 0, 2, 0, 1, 0,
    ],
  },
});

/** 根据当前菜单/更次/夜主/无尽状态选择多轨曲目键 */
export function selectFolkScoreKey({ musicMode = 'off', watch = 0, bossActive = false, endless = false } = {}) {
  if (musicMode === 'menu') return 'menu';
  if (musicMode !== 'run') return 'menu';
  if (bossActive || endless) return 'boss';
  const w = Math.max(1, Math.min(6, watch || 1));
  if (w === 6) return 'dawn';
  if (w >= 4) return 'watch_late';
  return 'watch_early';
}
