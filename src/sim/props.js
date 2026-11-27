// 场景道具：可破坏的纸灯笼柱（掉包子 / 铜钱 / 招魂幡）、河灯水口漂浮河灯（打碎掉魂火）、古井（水鬼出生点）、牌坊（装饰）。
// 按区块用「种子 + 区块坐标」散列确定性生成：同一种子、同一位置永远是同样的道具。
// 只保留玩家周围 (2r+1)² 个区块的道具；打碎过的灯笼柱/河灯记在 run._brokenProps 里，不会重生。

import { PROPS, PICKUPS, HAZARDS } from './balance.js';
import { Rng, mixSeed } from '../core/rng.js';
import { dropPickup } from './pickups.js';
import { isRiverWater, riverChannelYAt, RIVER_GAP_Y, RIVER_HALF_W } from './maps.js';

const ID_BASE = 1e9; // 道具 id 与实体 id 分开：1e9 + 区块编码 × 16 + 序号
const CHUNK_OFFSET = 50000;
const HAZARD_KINDS = ['hazard_barrel', 'hazard_bell', 'hazard_seal'];

function propId(cx, cy, i) {
  return ID_BASE + ((cx + CHUNK_OFFSET) * 100000 + (cy + CHUNK_OFFSET)) * 16 + i;
}

export function isStreetHazard(pr) {
  return Boolean(pr && (pr.kind === 'hazard_barrel' || pr.kind === 'hazard_bell' || pr.kind === 'hazard_seal'));
}

function isBreakableProp(pr) {
  return Boolean(pr && (pr.kind === 'lanternpost' || pr.kind === 'riverlantern' || isStreetHazard(pr)));
}

/** 生成某个区块的道具（纯函数，不看是否已打碎；青石镇与旧版 0x5eed 随机数消耗 100% 一致） */
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

  // v7 街巷民俗机关：独立随机流 0x88b3，绝不影响 0x5eed / 0x71fe 序列，且避开出生点与开局神龛圈
  const hRng = new Rng(mixSeed(seedNum, cx, cy, 0x88b3));
  if (hRng.chance(HAZARDS.chance)) {
    const hKind = HAZARD_KINDS[hRng.int(0, HAZARD_KINDS.length - 1)];
    const hr = hKind === 'hazard_barrel' ? HAZARDS.barrelR : hKind === 'hazard_bell' ? HAZARDS.bellR : HAZARDS.sealR;
    const hHp = hKind === 'hazard_barrel' ? HAZARDS.barrelHp : hKind === 'hazard_seal' ? HAZARDS.sealHp : 1;
    for (let tries = 0; tries < 5; tries++) {
      const hx = cx * C + hRng.range(hr + 28, C - hr - 28);
      const hy = cy * C + hRng.range(hr + 28, C - hr - 28);
      if (hx * hx + hy * hy < HAZARDS.safeRadius * HAZARDS.safeRadius) continue;
      if (isHedeng && isRiverWater(hx, hy, seedNum)) continue;
      if (out.some((o) => (o.x - hx) ** 2 + (o.y - hy) ** 2 < (o.r + hr + 52) ** 2)) continue;
      out.push({ id: propId(cx, cy, 13), kind: hKind, x: hx, y: hy, r: hr, hp: hHp });
      break;
    }
  }
  return out;
}

/** 触发街巷民俗机关（不消耗 run.rng，确定性结算） */
export function triggerStreetHazard(run, pr) {
  if (!pr || pr.hp <= 0) return;
  pr.hp = 0;
  run._brokenProps[pr.id] = true;
  run._propsDirty = true;
  const powMul = 1 + (run.mods?.hazardPowerPct || 0);

  if (pr.kind === 'hazard_bell') {
    for (let i = 0; i < run.pickups.length; i++) {
      const pk = run.pickups[i];
      if (pk.kind === 'xp' || pk.kind === 'coin') {
        pk.mag = true;
        pk.ms = Math.max(pk.ms || 0, PICKUPS.magnetStartSpeed * 2.2);
      }
    }
    run.projectiles.push({
      id: run._nextId++,
      kind: 'gongPulse',
      weaponId: 'bell',
      ownerSlot: run.player?.slot || 0,
      fixedPos: true,
      x: pr.x,
      y: pr.y,
      r: 150,
      radius: 0,
      maxRadius: 150,
      angle: 0,
      t: 0,
      life: 0.34,
      evolved: true,
    });
    run.events.push({ type: 'hazardBell', x: pr.x, y: pr.y });
    return;
  }

  if (pr.kind === 'hazard_barrel') {
    const blastR = Math.round(HAZARDS.barrelBlastR * powMul);
    const dmg = Math.round((HAZARDS.barrelDmgBase + HAZARDS.barrelDmgPerWatch * (run.watch || 1)) * powMul);
    if (Array.isArray(run._scheduled)) {
      run._scheduled.push({
        delay: 0,
        type: 'hazardBarrelBlast',
        x: pr.x,
        y: pr.y,
        radius: blastR,
        dmg,
        ownerSlot: run.player?.slot || 0,
      });
    }
    run.events.push({ type: 'hazardBarrel', x: pr.x, y: pr.y, radius: blastR });
    return;
  }

  if (pr.kind === 'hazard_seal') {
    const waveR = Math.round(HAZARDS.sealWaveR * powMul);
    if (Array.isArray(run._scheduled)) {
      run._scheduled.push({
        delay: 0,
        type: 'hazardSealWave',
        x: pr.x,
        y: pr.y,
        radius: waveR,
        stun: HAZARDS.sealStun,
        vulnDur: HAZARDS.sealVulnDur,
        vulnPct: HAZARDS.sealVulnPct,
        ownerSlot: run.player?.slot || 0,
      });
    }
    run.events.push({ type: 'hazardSeal', x: pr.x, y: pr.y, radius: waveR });
  }
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
  // 存活玩家（含联机队友）：触碰招魂铜铃立即摇响；踏罡步穿行可引爆火桶/激活敕符桩；撞上灯笼柱也能撞碎
  const party = Array.isArray(run.players) && run.players.length > 0 ? run.players : (p0 ? [p0] : []);
  for (let idx = 0; idx < party.length; idx++) {
    const pl = party[idx];
    if (!pl || pl.downed || !(pl.hp > 0)) continue;
    for (const pr of run.props) {
      if (!isBreakableProp(pr) || pr.hp <= 0) continue;
      if (pr.kind === 'hazard_bell') {
        const bellR = HAZARDS.bellTouchR + pl.r;
        if ((pr.x - pl.x) ** 2 + (pr.y - pl.y) ** 2 <= bellR * bellR) triggerStreetHazard(run, pr);
      } else if (isStreetHazard(pr)) {
        if (pl.dashT > 0) {
          const dashHitR = pr.r + pl.r + 10;
          if ((pr.x - pl.x) ** 2 + (pr.y - pl.y) ** 2 <= dashHitR * dashHitR) triggerStreetHazard(run, pr);
        }
      } else {
        const rr = pr.r + pl.r;
        if ((pr.x - pl.x) ** 2 + (pr.y - pl.y) ** 2 <= rr * rr) breakProp(run, pr);
      }
    }
  }
  if (run._propsDirty) {
    run.props = run.props.filter((pr) => !isBreakableProp(pr) || pr.hp > 0);
    run._propsDirty = false;
  }
}

/** 范围伤害波及灯笼柱、漂浮河灯与街巷爆竹火桶/定魂敕符桩 */
export function hitPropsCircle(run, x, y, r) {
  for (const pr of run.props) {
    if (!isBreakableProp(pr) || pr.hp <= 0) continue;
    const rr = r + pr.r;
    if ((pr.x - x) ** 2 + (pr.y - y) ** 2 <= rr * rr) {
      if (pr.kind === 'hazard_bell') continue; // 招魂铃仅由玩家亲手触碰摇响，避免远处误触浪费吸魂时机
      if (isStreetHazard(pr)) triggerStreetHazard(run, pr);
      else breakProp(run, pr);
    }
  }
}

/** 单体飞射物（符箓/铜钱剑等）点爆街巷火桶与敕符桩（不消耗普通灯柱随机流） */
export function hitStreetHazardsCircle(run, x, y, r) {
  for (const pr of run.props) {
    if (!isStreetHazard(pr) || pr.kind === 'hazard_bell' || pr.hp <= 0) continue;
    const rr = r + pr.r;
    if ((pr.x - x) ** 2 + (pr.y - y) ** 2 <= rr * rr) {
      triggerStreetHazard(run, pr);
    }
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
