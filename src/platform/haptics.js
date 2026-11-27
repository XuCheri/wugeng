// 手机震动反馈封装：优先走 TapTap 宿主 tap.vibrateShort / tap.vibrateLong，退回 navigator.vibrate，均不可用时静默跳过。
// sim 层零耦合，通过 run.events 在 app 层统一分发。

const HURT_THROTTLE_MS = 250;
const GLOBAL_MIN_GAP_MS = 45;

const PATTERNS = {
  hurt: { tap: 'short', type: 'light', ms: 16 },
  dash: { tap: 'short', type: 'light', ms: 10 },
  graze: { tap: 'short', type: 'light', ms: 12 },
  ult: { tap: 'short', type: 'heavy', ms: 38 },
  evolve: { tap: 'short', type: 'medium', ms: 28 },
  fusion: { tap: 'short', type: 'heavy', ms: [26, 28, 42] },
  bossSpawn: { tap: 'long', type: 'heavy', ms: [32, 42, 46] },
  bossDefeat: { tap: 'short', type: 'heavy', ms: [40, 35, 55] },
  warder: { tap: 'short', type: 'medium', ms: 22 },
  down: { tap: 'short', type: 'medium', ms: 30 },
  revive: { tap: 'short', type: 'medium', ms: [22, 30, 32] },
};

const PRIORITY = ['bossSpawn', 'bossDefeat', 'fusion', 'ult', 'evolve', 'revive', 'down', 'warder', 'hurt', 'graze', 'dash'];

export function createHaptics({
  win = typeof window !== 'undefined' ? window : null,
  nav = typeof navigator !== 'undefined' ? navigator : null,
  now = () => Date.now(),
} = {}) {
  let enabled = true;
  let lastHurtAt = -Infinity;
  let lastAnyAt = -Infinity;

  function triggerRaw(spec) {
    const tap = win?.tap;
    if (tap) {
      try {
        if (spec.tap === 'long' && typeof tap.vibrateLong === 'function') {
          tap.vibrateLong({});
          return true;
        }
        if (typeof tap.vibrateShort === 'function') {
          tap.vibrateShort({ type: spec.type || 'medium' });
          return true;
        }
        if (typeof tap.vibrateLong === 'function') {
          tap.vibrateLong({});
          return true;
        }
      } catch {
        // ignore host bridge error
      }
    }
    try {
      if (nav && typeof nav.vibrate === 'function') {
        nav.vibrate(spec.ms);
        return true;
      }
    } catch {
      // ignore web vibrate error
    }
    return false;
  }

  function pulse(kind) {
    if (!enabled) return false;
    const spec = Object.hasOwn(PATTERNS, kind) ? PATTERNS[kind] : null;
    if (!spec) return false;
    const t = Number(now()) || 0;
    if (kind === 'hurt') {
      if (t - lastHurtAt < HURT_THROTTLE_MS) return false;
      lastHurtAt = t;
    } else if (t - lastAnyAt < GLOBAL_MIN_GAP_MS) {
      return false;
    }
    lastAnyAt = t;
    return triggerRaw(spec);
  }

  function onEvents(events) {
    if (!enabled || !Array.isArray(events) || !events.length) return false;
    let bestIdx = Infinity;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e || typeof e !== 'object') continue;
      let k = null;
      switch (e.type) {
        case 'bossSpawn': k = 'bossSpawn'; break;
        case 'bossKill':
        case 'bossDefeated': k = 'bossDefeat'; break;
        case 'fusion': k = 'fusion'; break;
        case 'ult': k = 'ult'; break;
        case 'evolve': k = 'evolve'; break;
        case 'revive':
        case 'allyRevive':
        case 'coopRevive': k = 'revive'; break;
        case 'allyDown':
        case 'allyDowned': k = 'down'; break;
        case 'warderSpawn': k = 'warder'; break;
        case 'playerHurt': k = 'hurt'; break;
        case 'graze': k = 'graze'; break;
        case 'dash': k = 'dash'; break;
        default: break;
      }
      if (k) {
        const idx = PRIORITY.indexOf(k);
        if (idx >= 0 && idx < bestIdx) bestIdx = idx;
      }
    }
    if (bestIdx < PRIORITY.length) {
      return pulse(PRIORITY[bestIdx]);
    }
    return false;
  }

  return {
    setEnabled(v) { enabled = v !== false; },
    isEnabled() { return enabled; },
    pulse,
    onEvents,
  };
}
