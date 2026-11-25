// 每更随机异事（M2.2）：二更至四更中段按独立种子 RNG 触发 1 场奇遇事件（联机锁步各端严格一致）。
// 1. escort_peddler（护送货郎）：40 秒内护送提灯货郎抵达街口终点，礼成掉落供盒。
// 2. light_bonfires（点亮社火）：25 秒内踏亮 3 处社火坛，礼成净除群祟并洒下大量魂火。
// 3. chase_ingot（追斩纸元宝）：20 秒内打散疾走纸元宝，礼成获双倍铜钱并立即升阶。
// 4. ghost_parade（阴兵借道）：12 秒内避开横穿长街的无敌阴兵列，未受冲撞礼成回血赐包。

import { WATCH_DURATION, enemyDmgScale, designMinutes } from './balance.js';
import { spawnEnemy, currentHpScale } from './enemies.js';
import { killEnemy } from './combat.js';
import { earnCoins, healPlayer, hurtPlayer } from './player.js';
import { gainXp } from './xp.js';
import { dropPickup, dropXp } from './pickups.js';
import { coopPartySize, nearestLivingPlayer, hurtTargetPlayer } from './coop.js';

export const WATCH_EVENT_KINDS = [
  'escort_peddler',
  'light_bonfires',
  'chase_ingot',
  'ghost_parade',
];

export const WATCH_EVENT_META = {
  escort_peddler: {
    id: 'escort_peddler',
    name: '护送货郎',
    stamp: '送',
    hint: '贴近护送至街口',
    rewardHint: '礼成落供盒',
    duration: 40,
  },
  light_bonfires: {
    id: 'light_bonfires',
    name: '点亮社火',
    stamp: '火',
    hint: '踏亮三处社火坛',
    rewardHint: '礼成净场赐魂火',
    duration: 25,
  },
  chase_ingot: {
    id: 'chase_ingot',
    name: '追斩纸元宝',
    stamp: '宝',
    hint: '打散疾走纸元宝',
    rewardHint: '礼成赐双倍铜钱与升阶',
    duration: 20,
  },
  ghost_parade: {
    id: 'ghost_parade',
    name: '阴兵借道',
    stamp: '避',
    hint: '避开横街阴兵列',
    rewardHint: '礼成回血赐包',
    duration: 12,
  },
};

const TRIGGER_OFFSETS = {
  2: 24, // 二更第 24s（总 108s）
  3: 32, // 三更第 32s（总 200s，避开 168s 纸马夜主开场）
  4: 24, // 四更第 24s（总 276s）
};

function anchorPlayer(run) {
  return run.player?.downed && coopPartySize(run) > 1
    ? nearestLivingPlayer(run, run.player.x, run.player.y)
    : run.player;
}

function livingPlayers(run) {
  if (coopPartySize(run) > 1 && Array.isArray(run.players)) {
    return run.players.filter((pl) => pl && !pl.downed && pl.hp > 0);
  }
  return run.player && run.player.hp > 0 ? [run.player] : [];
}

/** 显式开启指定异事（供测试或每更调度调用） */
export function startWatchEvent(run, kindArg) {
  if (!run || !run.player) return null;
  const rng = run.eventRng || run.rng;
  const kind = WATCH_EVENT_META[kindArg] ? kindArg : rng.pick(WATCH_EVENT_KINDS);
  const meta = WATCH_EVENT_META[kind];
  const p = anchorPlayer(run);
  const baseA = rng.range(0, Math.PI * 2);

  const ev = {
    kind,
    name: meta.name,
    stamp: meta.stamp,
    hint: meta.hint,
    duration: meta.duration,
    timer: meta.duration,
    elapsed: 0,
    progress: 0,
    targetX: null,
    targetY: null,
  };

  if (kind === 'escort_peddler') {
    const sx = p.x + Math.cos(baseA) * 95;
    const sy = p.y + Math.sin(baseA) * 95;
    const ga = baseA + rng.range(-0.45, 0.45);
    const dist = 340;
    ev.x = sx;
    ev.y = sy;
    ev.startX = sx;
    ev.startY = sy;
    ev.goalX = sx + Math.cos(ga) * dist;
    ev.goalY = sy + Math.sin(ga) * dist;
    ev.totalDist = dist;
    ev.hp = 260;
    ev.maxHp = 260;
    ev.hurtCd = 0;
    ev.escorting = false;
    ev.targetX = sx;
    ev.targetY = sy;
  } else if (kind === 'light_bonfires') {
    const nodes = [];
    for (let i = 0; i < 3; i++) {
      const a = baseA + (i * Math.PI * 2) / 3 + rng.range(-0.18, 0.18);
      const d = rng.range(165, 205);
      nodes.push({
        x: p.x + Math.cos(a) * d,
        y: p.y + Math.sin(a) * d,
        lit: false,
      });
    }
    ev.nodes = nodes;
    ev.litCount = 0;
    ev.targetX = nodes[0].x;
    ev.targetY = nodes[0].y;
  } else if (kind === 'chase_ingot') {
    const ix = p.x + Math.cos(baseA) * 155;
    const iy = p.y + Math.sin(baseA) * 155;
    const hp = Math.max(85, Math.round(52 * currentHpScale(run)));
    const ingot = spawnEnemy(run, 'paperkid', ix, iy, {
      fixedHp: hp,
      rMul: 1.45,
      mirrorClone: true,
      summoned: true,
    });
    ingot.eventIngot = true;
    ingot.xp = 0;
    ingot.dmg = 4;
    ev.targetEnemyId = ingot.id;
    ev.x = ix;
    ev.y = iy;
    ev.hp = hp;
    ev.maxHp = hp;
    ev.targetX = ix;
    ev.targetY = iy;
  } else if (kind === 'ghost_parade') {
    const ux = Math.cos(baseA);
    const uy = Math.sin(baseA);
    ev.cx = p.x;
    ev.cy = p.y;
    ev.ux = ux;
    ev.uy = uy;
    ev.halfW = 34;
    ev.halfLen = 380;
    ev.warnTime = 1.4;
    ev.phase = 'warn';
    ev.hitCount = 0;
    ev.hitCd = 0;
    ev.soldiers = [];
  }

  run.watchEvent = ev;
  run.events.push({ type: 'watchEventStart', kind, name: meta.name });
  return ev;
}

function finishWatchEvent(run, ev, ok) {
  run.watchEvent = null;
  if (ok) {
    run.stats.eventsCompleted = (run.stats.eventsCompleted || 0) + 1;
  }
  const meta = WATCH_EVENT_META[ev.kind] || {};
  run.watchEventResult = {
    kind: ev.kind,
    ok: !!ok,
    text: ok ? `异事礼成 · ${meta.rewardHint || meta.name}` : `异事未成 · ${meta.name}`,
    timer: 2.4,
  };
  run.events.push({ type: 'watchEventEnd', kind: ev.kind, ok: !!ok });
}

export function updateWatchEvents(run, dt) {
  if (!run || !run.player) return;
  if (run.watchEventResult) {
    run.watchEventResult.timer -= dt;
    if (run.watchEventResult.timer <= 0) run.watchEventResult = null;
  }

  // 主线二更到四更中段触发（避开夜主在场与大跨度跳秒）
  if (!run.watchEvent && run.mode === 'main' && (run.watch === 2 || run.watch === 3 || run.watch === 4)) {
    if (!run._watchEventsDone) run._watchEventsDone = {};
    if (!run._watchEventsDone[run.watch] && !run.boss) {
      const watchStart = (run.watch - 1) * WATCH_DURATION;
      const trigAt = watchStart + (TRIGGER_OFFSETS[run.watch] || 24);
      if (run.time >= trigAt) {
        run._watchEventsDone[run.watch] = true;
        if (run.time <= watchStart + WATCH_DURATION - 8) {
          const rng = run.eventRng || run.rng;
          const used = run._watchEventUsedKinds || [];
          const pool = WATCH_EVENT_KINDS.filter((k) => !used.includes(k));
          const picked = rng.pick(pool.length ? pool : WATCH_EVENT_KINDS);
          if (!run._watchEventUsedKinds) run._watchEventUsedKinds = [];
          run._watchEventUsedKinds.push(picked);
          startWatchEvent(run, picked);
        }
      }
    }
  }

  const ev = run.watchEvent;
  if (!ev) return;

  ev.elapsed += dt;
  ev.timer -= dt;
  const pls = livingPlayers(run);

  if (ev.kind === 'escort_peddler') {
    if (ev.hurtCd > 0) ev.hurtCd -= dt;
    const nearPlayer = pls.some((pl) => Math.hypot(pl.x - ev.x, pl.y - ev.y) <= 145);
    ev.escorting = nearPlayer;
    const spd = nearPlayer ? 36 : 7;
    const dx = ev.goalX - ev.x;
    const dy = ev.goalY - ev.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 22) {
      dropPickup(run, 'chest', ev.goalX, ev.goalY, 0);
      finishWatchEvent(run, ev, true);
      return;
    }
    const step = Math.min(dist, spd * dt);
    ev.x += (dx / (dist || 1)) * step;
    ev.y += (dy / (dist || 1)) * step;
    ev.progress = Math.max(0, Math.min(1, 1 - dist / (ev.totalDist || 340)));
    ev.targetX = ev.x;
    ev.targetY = ev.y;

    // 靠近货郎的邪祟会啃噬货担气血
    if (ev.hurtCd <= 0) {
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.dead || e.eventIngot) continue;
        if (Math.hypot(e.x - ev.x, e.y - ev.y) <= e.r + 24) {
          ev.hp = Math.max(0, ev.hp - 12);
          ev.hurtCd = 0.85;
          break;
        }
      }
    }
    if (ev.hp <= 0 || ev.timer <= 0) {
      finishWatchEvent(run, ev, false);
    }
  } else if (ev.kind === 'light_bonfires') {
    let lit = 0;
    let nearestUnlit = null;
    let bestD = Infinity;
    const p0 = anchorPlayer(run);
    for (let i = 0; i < ev.nodes.length; i++) {
      const n = ev.nodes[i];
      if (!n.lit) {
        const touched = pls.some((pl) => Math.hypot(pl.x - n.x, pl.y - n.y) <= pl.r + 34);
        if (touched) {
          n.lit = true;
          run.events.push({ type: 'pickup', kind: 'xp', value: 3 });
        }
      }
      if (n.lit) {
        lit++;
      } else {
        const d = Math.hypot(n.x - p0.x, n.y - p0.y);
        if (d < bestD) {
          bestD = d;
          nearestUnlit = n;
        }
      }
    }
    ev.litCount = lit;
    ev.progress = lit / ev.nodes.length;
    ev.targetX = nearestUnlit ? nearestUnlit.x : null;
    ev.targetY = nearestUnlit ? nearestUnlit.y : null;

    if (lit >= ev.nodes.length) {
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (!e.dead && !e.boss && Math.hypot(e.x - p0.x, e.y - p0.y) <= 520) {
          killEnemy(run, e, { direct: true });
        }
      }
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        dropXp(run, p0.x + Math.cos(a) * 42, p0.y + Math.sin(a) * 42, 5, 1);
      }
      finishWatchEvent(run, ev, true);
      return;
    }
    if (ev.timer <= 0) {
      finishWatchEvent(run, ev, false);
    }
  } else if (ev.kind === 'chase_ingot') {
    const ingot = run.enemies.find((e) => e.id === ev.targetEnemyId);
    if (!ingot || ingot.dead || ingot.hp <= 0) {
      const bonusCoins = Math.max(20, Math.round(36 * (run.mods?.coinDropMul || 1)));
      earnCoins(run, bonusCoins, true);
      const px = ingot ? ingot.x : anchorPlayer(run).x;
      const py = ingot ? ingot.y : anchorPlayer(run).y;
      dropPickup(run, 'coin', px, py, Math.max(8, Math.round(bonusCoins * 0.5)));
      const needXp = Math.max(1, (run.player.xpNext || 10) - (run.player.xp || 0));
      gainXp(run, needXp);
      finishWatchEvent(run, ev, true);
      return;
    }
    ev.x = ingot.x;
    ev.y = ingot.y;
    ev.hp = ingot.hp;
    ev.maxHp = ingot.maxHp;
    ev.progress = ingot.maxHp > 0 ? Math.max(0, Math.min(1, 1 - ingot.hp / ingot.maxHp)) : 0;
    ev.targetX = ingot.x;
    ev.targetY = ingot.y;

    if (ev.timer <= 0) {
      ingot.dead = true;
      ingot.hp = 0;
      finishWatchEvent(run, ev, false);
    }
  } else if (ev.kind === 'ghost_parade') {
    if (ev.hitCd > 0) ev.hitCd -= dt;
    if (ev.elapsed < ev.warnTime) {
      ev.phase = 'warn';
      ev.soldiers.length = 0;
      ev.progress = 0;
    } else {
      ev.phase = 'march';
      const marchDur = Math.max(1, ev.duration - ev.warnTime);
      const marchFrac = Math.max(0, Math.min(1, (ev.elapsed - ev.warnTime) / marchDur));
      ev.progress = marchFrac;
      const count = 6;
      const spacing = 58;
      const headS = -ev.halfLen + marchFrac * (ev.halfLen * 2 + (count - 1) * spacing);
      const perpX = -ev.uy;
      const perpY = ev.ux;
      ev.soldiers.length = 0;
      for (let i = 0; i < count; i++) {
        const s = headS - i * spacing;
        if (s < -ev.halfLen - 40 || s > ev.halfLen + 40) continue;
        const laneOff = (i % 2 === 0 ? -1 : 1) * 13;
        ev.soldiers.push({
          x: ev.cx + ev.ux * s + perpX * laneOff,
          y: ev.cy + ev.uy * s + perpY * laneOff,
        });
      }
      if (ev.hitCd <= 0 && ev.soldiers.length > 0) {
        const m = designMinutes(run.time);
        const rawDmg = Math.max(8, Math.round(14 * run.night.contactDmgMul * enemyDmgScale(m)));
        const isCoop = coopPartySize(run) > 1;
        for (let pIdx = 0; pIdx < pls.length; pIdx++) {
          const pl = pls[pIdx];
          const hit = ev.soldiers.some((sol) => Math.hypot(pl.x - sol.x, pl.y - sol.y) <= pl.r + 18);
          if (hit) {
            ev.hitCount++;
            ev.hitCd = 0.9;
            if (isCoop) hurtTargetPlayer(run, pl, rawDmg);
            else hurtPlayer(run, rawDmg);
            break;
          }
        }
      }
    }
    if (ev.timer <= 0) {
      const ok = ev.hitCount === 0 && pls.length > 0;
      if (ok) {
        const healed = healPlayer(run, 45);
        if (healed > 0) run.events.push({ type: 'heal', amount: healed, source: 'ghost_parade', x: run.player.x, y: run.player.y });
        const p0 = anchorPlayer(run);
        dropPickup(run, 'bun', p0.x + 24, p0.y, 0);
      }
      finishWatchEvent(run, ev, ok);
    }
  }
}
