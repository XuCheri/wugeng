// 场景道具：可破坏的纸灯笼柱（掉包子 / 铜钱 / 招魂幡）、古井（水鬼出生点）、牌坊（装饰）。
// 按区块用「种子 + 区块坐标」散列确定性生成：同一种子、同一位置永远是同样的道具。
// 只保留玩家周围 (2r+1)² 个区块的道具；打碎过的灯笼柱记在 run._brokenProps 里，不会重生。

import { PROPS, PICKUPS } from './balance.js';
import { Rng, mixSeed } from '../core/rng.js';
import { dropPickup } from './pickups.js';

const ID_BASE = 1e9; // 道具 id 与实体 id 分开：1e9 + 区块编码 × 8 + 序号
const CHUNK_OFFSET = 50000;

function propId(cx, cy, i) {
  return ID_BASE + ((cx + CHUNK_OFFSET) * 100000 + (cy + CHUNK_OFFSET)) * 8 + i;
}

/** 生成某个区块的道具（纯函数，不看是否已打碎） */
export function chunkProps(seedNum, cx, cy) {
  const rng = new Rng(mixSeed(seedNum, cx, cy, 0x5eed));
  const C = PROPS.chunk;
  const out = [];
  let i = 0;
  const place = (kind, r) => {
    for (let tries = 0; tries < 6; tries++) {
      const x = cx * C + rng.range(r + 20, C - r - 20);
      const y = cy * C + rng.range(r + 20, C - r - 20);
      if (x * x + y * y < PROPS.safeRadius * PROPS.safeRadius) continue;
      if (out.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 40) ** 2)) continue;
      out.push({ id: propId(cx, cy, i++), kind, x, y, r, hp: kind === 'lanternpost' ? PROPS.lanternpostHp : 0 });
      return;
    }
    i++;
  };
  for (let k = 0; k < PROPS.lanternpostMax; k++) if (rng.chance(PROPS.lanternpostChance)) place('lanternpost', PROPS.lanternpostR);
  if (rng.chance(PROPS.wellChance)) place('well', PROPS.wellR);
  if (rng.chance(PROPS.archChance)) place('arch', PROPS.archR);
  return out;
}

/** 玩家换区块时重建 run.props */
export function updateProps(run) {
  const C = PROPS.chunk;
  const p0 = run.player;
  const p =
    p0?.downed && Array.isArray(run.players) && run.players.length > 1
      ? run.players.find((pl) => pl && !pl.downed && pl.hp > 0) || p0
      : p0;
  const cx = Math.floor(p.x / C);
  const cy = Math.floor(p.y / C);
  const key = cx * 100003 + cy;
  if (key !== run._propChunk) {
    run._propChunk = key;
    const R = PROPS.activeRadius;
    const list = [];
    for (let x = cx - R; x <= cx + R; x++) {
      for (let y = cy - R; y <= cy + R; y++) {
        for (const pr of chunkProps(run._seedNum, x, y)) if (!run._brokenProps[pr.id]) list.push(pr);
      }
    }
    run.props = list;
  }
  // 存活玩家撞上灯笼柱也能撞碎
  if (!p0?.downed && p0?.hp > 0) {
    for (const pr of run.props) {
      if (pr.kind !== 'lanternpost' || pr.hp <= 0) continue;
      const rr = pr.r + p0.r;
      if ((pr.x - p0.x) ** 2 + (pr.y - p0.y) ** 2 <= rr * rr) breakProp(run, pr);
    }
  }
  if (run._propsDirty) {
    run.props = run.props.filter((pr) => pr.kind !== 'lanternpost' || pr.hp > 0);
    run._propsDirty = false;
  }
}

/** 范围伤害波及灯笼柱 */
export function hitPropsCircle(run, x, y, r) {
  for (const pr of run.props) {
    if (pr.kind !== 'lanternpost' || pr.hp <= 0) continue;
    const rr = r + pr.r;
    if ((pr.x - x) ** 2 + (pr.y - y) ** 2 <= rr * rr) breakProp(run, pr);
  }
}

function breakProp(run, pr) {
  pr.hp = 0;
  run._brokenProps[pr.id] = true;
  run._propsDirty = true;
  run.events.push({ type: 'propBreak', x: pr.x, y: pr.y, kind: pr.kind });
  const d = PROPS.drop;
  const r = run.rng.next();
  if (r < d.bun) dropPickup(run, 'bun', pr.x, pr.y, 0);
  else if (r < d.bun + d.coin) dropPickup(run, 'coin', pr.x, pr.y, PICKUPS.coinValue);
  else dropPickup(run, 'banner', pr.x, pr.y, 0);
}

/** 找一口离玩家距离在 [min,max] 的古井（水鬼出生点） */
export function findWell(run, min, max, anchor = null) {
  const p = anchor || run.player;
  let best = null;
  for (const pr of run.props) {
    if (pr.kind !== 'well') continue;
    const d2 = (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2;
    if (d2 >= min * min && d2 <= max * max) {
      best = pr;
      break;
    }
  }
  return best;
}
