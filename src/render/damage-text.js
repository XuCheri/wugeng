// damage-text.js —— 伤害数字：同一敌人 0.25 秒内合并；普通 = 小号墨字，暴击 = 朱红印章「盖」上去
// formatCN / mergeHit / pruneTexts 为纯函数（Node 可测）。
import { INK } from './palette.js';
import { drawSeal, drawStamp } from './glyphs.js';

export const MERGE_WINDOW = 0.25;
export const LIFE_NORMAL = 0.72;
export const LIFE_CRIT = 1.0;
export const MAX_TEXTS = 90;

/**
 * 中文大数：<1万 原样；1.2万 / 3.4亿 / 5.6万亿；≥100 的部分不带小数。向下取一位小数，避免「10.0万」。
 */
export function formatCN(n) {
  if (!Number.isFinite(n)) return '0';
  const v = Math.max(0, Math.round(n));
  if (v < 10000) return String(v);
  const units = [
    [1e12, '万亿'],
    [1e8, '亿'],
    [1e4, '万'],
  ];
  for (const [u, s] of units) {
    if (v >= u) {
      const x = v / u;
      if (x >= 100) return Math.floor(x) + s;
      let str = (Math.floor(x * 10) / 10).toFixed(1);
      if (str.endsWith('.0')) str = str.slice(0, -2);
      return str + s;
    }
  }
  return String(v);
}

/**
 * 把一次命中并入列表：同一敌人、同为暴击/非暴击、在窗口内 → 累加；否则新建。
 * @returns 被更新或新建的条目
 */
export function mergeHit(list, hit, now, window = MERGE_WINDOW) {
  const crit = !!hit.crit;
  if (hit.enemyId != null) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.enemyId === hit.enemyId && e.crit === crit && now - e.born < window) {
        e.amount += hit.amount;
        e.x = hit.x;
        e.y = hit.y;
        e.last = now;
        e.hits++;
        return e;
      }
    }
  }
  const e = {
    enemyId: hit.enemyId ?? null,
    x: hit.x,
    y: hit.y,
    amount: hit.amount,
    crit,
    born: now,
    last: now,
    hits: 1,
    seed: ((hit.enemyId ?? 0) * 7919 + Math.floor(now * 1000)) % 997,
  };
  list.push(e);
  if (list.length > MAX_TEXTS) list.splice(0, list.length - MAX_TEXTS);
  return e;
}

/** 移除过期条目（原地） */
export function pruneTexts(list, now) {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const life = e.crit ? LIFE_CRIT : LIFE_NORMAL;
    if (now - e.last < life) list[w++] = e;
  }
  list.length = w;
  return list;
}

/** 按设置过滤：'all' | 'crit' | 'off' */
export function visibleFor(e, mode) {
  if (mode === 'off') return false;
  if (mode === 'crit') return e.crit;
  return true;
}

export function createDamageTexts() {
  const list = [];
  return {
    list,
    add(hit, now) {
      if (!(hit.amount > 0)) return;
      mergeHit(list, hit, now);
    },
    clear() {
      list.length = 0;
    },
    /** 在世界坐标系下绘制（应在夜色遮罩之后调用，保证可读） */
    draw(ctx, now, mode = 'all') {
      pruneTexts(list, now);
      if (mode === 'off') return;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!visibleFor(e, mode)) continue;
        const age = now - e.born;
        const since = now - e.last;
        const life = e.crit ? LIFE_CRIT : LIFE_NORMAL;
        const fade = since > life - 0.25 ? Math.max(0, (life - since) / 0.25) : 1;
        const rise = Math.min(1, age / 0.5);
        const ox = ((e.seed % 13) - 6) * 0.9;
        const y = e.y - 18 - (1 - (1 - rise) * (1 - rise)) * 16;
        const str = formatCN(e.amount);
        ctx.save();
        ctx.globalAlpha *= fade;
        if (e.crit) {
          // 印章盖下：先放大后压实，略带旋转
          const k = Math.min(1, since / 0.09);
          const scale = since < 0.09 ? 1.7 - 0.8 * k : 0.9 + Math.min(0.1, (since - 0.09) * 1.2);
          const size = Math.round(Math.min(17, 12 + Math.log10(e.amount + 1) * 0.9));
          drawStamp(ctx, str, e.x + ox, y - 4, size, { rot: ((e.seed % 9) - 4) * 0.035, scale, seed: e.seed });
        } else {
          const pop = since < 0.06 ? 1.25 : 1;
          const size = Math.min(14, 9 + Math.log10(e.amount + 1) * 1.2) * pop;
          drawSeal(ctx, str, e.x + ox, y, Math.round(size), INK, 'center', 'outlined', 0.95);
        }
        ctx.restore();
      }
    },
  };
}
