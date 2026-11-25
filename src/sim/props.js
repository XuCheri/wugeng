// 场景道具：可破坏的纸灯笼柱（掉包子 / 铜钱 / 招魂幡）、河灯水口漂浮河灯（打碎掉魂火）、古井（水鬼出生点）、牌坊（装饰）。
// 按区块用「种子 + 区块坐标」散列确定性生成：同一种子、同一位置永远是同样的道具。
// 只保留玩家周围 (2r+1)² 个区块的道具；打碎过的灯笼柱/河灯记在 run._brokenProps 里，不会重生。

import { PROPS, PICKUPS } from './balance.js';
import { Rng, mixSeed } from '../core/rng.js';
import { dropPickup } from './pickups.js';
import { isRiverWater, riverChannelYAt, RIVER_GAP_Y, RIVER_HALF_W } from './maps.js';

const ID_BASE = 1e9; // 道具 id 与实体 id 分开：1e9 + 区块编码 × 16 + 序号
const CHUNK_OFFSET = 50000;

function propId(cx, cy, i) {
  return ID_BASE + ((cx + CHUNK_OFFSET) * 100000 + (cy + CHUNK_OFFSET)) * 16 + i;
}

function isBreakableProp(pr) {
  return pr && (pr.kind === 'lanternpost' || pr.kind === 'riverlantern');
}

/** 生成某个区块的道具（纯函数，不看是否已打碎；青石镇与旧版随机数消耗 100% 一致） */
export function chunkProps(seedNum, cx, cy, mapId = 'qingshi') {
  const rng = new Rng(mixSeed(seedNum, cx, cy, 0x5eed));
  const C = PROPS.chunk;
  const out = [];
  let i = 0;
  const isHedeng = mapId === 'hedeng';
  const place = (kind, r) => {
    for (let tries = 0; tries < 6; tries++) {
      const x = cx * C + rng.range(r + 20, C - r - 20);
      const y = cy * C + rng.range(r + 20, C - r - 20);
      if (x * x + y * y < PROPS.safeRadius * PROPS.safeRadius) continue;
      if (isHedeng && isRiverWater(x, y, seedNum)) continue;
      if (out.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 40) ** 2)) continue;
      out.push({ id: propId(cx, cy, i++), kind, x, y, r, hp: kind === 'lanternpost' ? PROPS.lanternpostHp : 0 });
      return;
    }
    i++;
  };
  for (let k = 0; k < PROPS.lanternpostMax; k++) if (rng.chance(PROPS.lanternpostChance)) place('lanternpost', PROPS.lanternpostR);
  if (rng.chance(PROPS.wellChance)) place('well', PROPS.wellR);
  if (rng.chance(PROPS.archChance)) place('arch', PROPS.archR);

  if (isHedeng) {
    const rRng = new Rng(mixSeed(seedNum, cx, cy, 0x71fe));
    const y0 = cy * C;
    const y1 = y0 + C;
    const k0 = Math.floor((y0 - 175 - RIVER_HALF_W) / RIVER_GAP_Y) - 1;
    const k1 = Math.ceil((y1 - 175 + RIVER_HALF_W) / RIVER_GAP_Y) + 1;
    let placedLanterns = 0;
    for (let k = k0; k <= k1 && placedLanterns < PROPS.riverlanternMax; k++) {
      for (let slot = 0; slot < 3 && placedLanterns < PROPS.riverlanternMax; slot++) {
        if (!rRng.chance(0.78)) continue;
        const x = cx * C + 36 + ((slot + 0.2 + rRng.next() * 0.6) / 3) * (C - 72);
        const cyRiver = riverChannelYAt(x, k, seedNum);
        const y = cyRiver + rRng.range(-RIVER_HALF_W * 0.62, RIVER_HALF_W * 0.62);
        if (y < y0 + 16 || y > y1 - 16) continue;
        if (!isRiverWater(x, y, seedNum)) continue;
        const r = PROPS.riverlanternR;
        if (out.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 28) ** 2)) continue;
        out.push({
          id: propId(cx, cy, 8 + placedLanterns),
          kind: 'riverlantern',
          x,
          y,
          r,
          hp: PROPS.riverlanternHp,
        });
        placedLanterns++;
      }
    }
  }
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
  const mapTag = run.mapId === 'hedeng' ? 1 : 0;
  const key = (cx * 100003 + cy) * 2 + mapTag;
  if (key !== run._propChunk) {
    run._propChunk = key;
    const R = PROPS.activeRadius;
    const list = [];
    for (let x = cx - R; x <= cx + R; x++) {
      for (let y = cy - R; y <= cy + R; y++) {
        for (const pr of chunkProps(run._seedNum, x, y, run.mapId)) {
          if (!run._brokenProps[pr.id]) list.push(pr);
        }
      }
    }
    run.props = list;
  }
  // 存活玩家（含联机队友）撞上灯笼柱或漂浮河灯也能撞碎
  const party = Array.isArray(run.players) && run.players.length > 0 ? run.players : (p0 ? [p0] : []);
  for (let idx = 0; idx < party.length; idx++) {
    const pl = party[idx];
    if (!pl || pl.downed || !(pl.hp > 0)) continue;
    for (const pr of run.props) {
      if (!isBreakableProp(pr) || pr.hp <= 0) continue;
      const rr = pr.r + pl.r;
      if ((pr.x - pl.x) ** 2 + (pr.y - pl.y) ** 2 <= rr * rr) breakProp(run, pr);
    }
  }
  if (run._propsDirty) {
    run.props = run.props.filter((pr) => !isBreakableProp(pr) || pr.hp > 0);
    run._propsDirty = false;
  }
}

/** 范围伤害波及灯笼柱与漂浮河灯 */
export function hitPropsCircle(run, x, y, r) {
  for (const pr of run.props) {
    if (!isBreakableProp(pr) || pr.hp <= 0) continue;
    const rr = r + pr.r;
    if ((pr.x - x) ** 2 + (pr.y - y) ** 2 <= rr * rr) breakProp(run, pr);
  }
}

function breakProp(run, pr) {
  pr.hp = 0;
  run._brokenProps[pr.id] = true;
  run._propsDirty = true;
  run.events.push({ type: 'propBreak', x: pr.x, y: pr.y, kind: pr.kind });
  if (pr.kind === 'riverlantern') {
    dropPickup(run, 'xp', pr.x - 5, pr.y, PROPS.riverlanternXp);
    dropPickup(run, 'xp', pr.x + 5, pr.y + 2, PROPS.riverlanternXp);
    return;
  }
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
