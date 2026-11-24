// 民俗奇遇地标（F9）：土地香案（altar）、镇邪试炼碑（trial）、鬼市货郎（peddler）。
// 采用独立派生随机流（mixSeed）确定性生成，绝不扰动 run.rng 主随机序列。

import { SHRINES, SHRINE_KINDS, SPAWN, DAMAGE, MAX_WEAPON_LEVEL, MAX_RELIC_LEVEL } from './balance.js';
import { Rng, mixSeed } from '../core/rng.js';
import { spawnEnemy } from './enemies.js';
import { dropPickup } from './pickups.js';
import { addOrUpgradeWeapon, evolveWeapon } from './weapons.js';
import { addOrUpgradeRelic } from './relics.js';
import { recomputeMods, healPlayer, spendCoins } from './player.js';
import { applyEvolutionCeremonyPulse } from './evolutions.js';

const SHRINE_ID_BASE = 2000000000;
const CHUNK_OFFSET = 50000;

export const SHRINE_TITLES = {
  altar: '土地香案',
  trial: '镇邪试炼碑',
  peddler: '鬼市货郎',
};

function ensureStarterShrines(run) {
  if (run._starterShrinesReady) return;
  run._starterShrinesReady = true;
  const rng = new Rng(mixSeed(run._seedNum, 0x51a9, 1));
  const kinds = ['altar', 'trial', 'peddler'];
  // Fisher-Yates 洗牌确定扇区顺序
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }
  const baseA = rng.range(0, Math.PI * 2);
  for (let k = 0; k < 3; k++) {
    const kind = kinds[k];
    const id = SHRINE_ID_BASE + 1 + k;
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 8; tries++) {
      const a = baseA + (k * Math.PI * 2) / 3 + rng.range(-0.32, 0.32);
      const d = rng.range(SHRINES.starterMinDist, SHRINES.starterMaxDist);
      const cx = Math.cos(a) * d;
      const cy = Math.sin(a) * d;
      const clash = run.props.some((pr) => (pr.x - cx) ** 2 + (pr.y - cy) ** 2 < (pr.r + SHRINES.radius + 32) ** 2);
      x = cx;
      y = cy;
      if (!clash) break;
    }
    run._shrineMap[id] = {
      id,
      kind,
      x: Math.round(x),
      y: Math.round(y),
      r: SHRINES.radius,
      used: false,
      active: false,
      timer: 0,
      maxTimer: kind === 'trial' ? SHRINES.trialDuration : 0,
      _waveT: 0,
    };
  }
}

function macroChunkShrine(run, mcx, mcy) {
  const id = SHRINE_ID_BASE + 10 + ((mcx + CHUNK_OFFSET) * 100000 + (mcy + CHUNK_OFFSET)) * 4;
  if (run._shrineMap[id] !== undefined) return run._shrineMap[id];

  const rng = new Rng(mixSeed(run._seedNum, mcx, mcy, 0x7368));
  if (!rng.chance(SHRINES.chunkChance)) {
    run._shrineMap[id] = null;
    return null;
  }
  const C = SHRINES.chunk;
  const kind = SHRINE_KINDS[rng.int(0, SHRINE_KINDS.length - 1)];
  const pad = SHRINES.radius + 60;
  const x = Math.round(mcx * C + rng.range(pad, C - pad));
  const y = Math.round(mcy * C + rng.range(pad, C - pad));
  if (x * x + y * y < 460 * 460) {
    run._shrineMap[id] = null;
    return null;
  }
  const s = {
    id,
    kind,
    x,
    y,
    r: SHRINES.radius,
    used: false,
    active: false,
    timer: 0,
    maxTimer: kind === 'trial' ? SHRINES.trialDuration : 0,
    _waveT: 0,
  };
  run._shrineMap[id] = s;
  return s;
}

function spawnTrialElites(run, centerX, centerY, count) {
  const roster = ['weasel', 'lanternghost', 'cinder', 'paperbride', 'drowned', 'suona'];
  for (let i = 0; i < count; i++) {
    if (run.enemies.length >= SPAWN.cap + 12) break;
    const a = (i / count) * Math.PI * 2 + run.rng.range(-0.35, 0.35);
    const d = run.rng.range(250, 330);
    const type = run.watch <= 1 ? 'lanternghost' : run.rng.pick(roster);
    spawnEnemy(run, type, centerX + Math.cos(a) * d, centerY + Math.sin(a) * d, { elite: true });
  }
}

export function buildShrineOptions(run, s) {
  const p = run.player;
  if (s.kind === 'altar') {
    const hpCost = Math.max(1, Math.floor(p.maxHp * SHRINES.altarHpPct));
    const lv5W = run.weapons.find((w) => !w.evolved && w.level >= MAX_WEAPON_LEVEL);
    const upgW = run.weapons.filter((w) => !w.evolved && w.level < MAX_WEAPON_LEVEL).sort((a, b) => b.level - a.level)[0];
    const gainLv = upgW ? Math.min(SHRINES.altarUpgradeLevels, MAX_WEAPON_LEVEL - upgW.level) : 0;
    const bloodDesc = lv5W
      ? '献祭气血，当场为满级武器敕封开光并震退群祟'
      : upgW
        ? `献祭气血，连升 ${gainLv} 级武器并赐香火开光资格`
        : `献祭气血，获得 1 层溢出神力（伤害 ×${DAMAGE.overflowMult}）`;
    return {
      id: s.id,
      kind: 'altar',
      title: SHRINE_TITLES.altar,
      x: s.x,
      y: s.y,
      options: [
        {
          id: 'blood_rite',
          label: '燃血祭器',
          desc: bloodDesc,
          costText: `生命 −${hpCost}`,
          disabled: p.hp <= hpCost,
        },
        {
          id: 'fortune_slip',
          label: '求取命签',
          desc: '抽取一签守夜命签（不占器物栏位）',
          costText: '虔诚叩拜',
          disabled: false,
        },
        {
          id: 'incense_ward',
          label: '安神香火',
          desc: `回满全部生命，获得 ${SHRINES.altarWardInvuln} 秒无敌金身并净除敌弹`,
          costText: '香火庇佑',
          disabled: false,
        },
      ],
    };
  }

  if (s.kind === 'trial') {
    return {
      id: s.id,
      kind: 'trial',
      title: SHRINE_TITLES.trial,
      x: s.x,
      y: s.y,
      options: [
        {
          id: 'start_trial',
          label: '开启试炼',
          desc: `坚守 ${SHRINES.trialDuration} 秒词缀精英围攻，试炼完成必落开光供盒`,
          costText: '迎战群英',
          disabled: false,
        },
      ],
    };
  }

  const C = SHRINES.peddlerCosts;
  return {
    id: s.id,
    kind: 'peddler',
    title: SHRINE_TITLES.peddler,
    x: s.x,
    y: s.y,
    options: [
      {
        id: 'peddler_upgrade',
        label: '锻器精炼',
        desc: '随机将 1 件已拥有器物提升 1 级（全满则赐满阶增伤）',
        costText: `${C.upgrade} 铜钱`,
        disabled: run.stats.coins < C.upgrade,
      },
      {
        id: 'peddler_seals',
        label: '朱砂符印',
        desc: `免费换签 +${SHRINES.peddlerSealRerolls} 次，弃签印记 +${SHRINES.peddlerSealBanishes} 次`,
        costText: `${C.seals} 铜钱`,
        disabled: run.stats.coins < C.seals,
      },
      {
        id: 'peddler_elixir',
        label: '还阳汤药',
        desc: `立即回复 ${SHRINES.peddlerElixirHeal} 生命，并积攒 ${SHRINES.peddlerElixirUlt} 点大招气`,
        costText: `${C.elixir} 铜钱`,
        disabled: run.stats.coins < C.elixir,
      },
    ],
  };
}

/** 逐帧同步视野内奇遇地标、推进试炼碑倒计时并刷新 nearbyShrine */
export function updateShrines(run, dt, input = null) {
  if (!run._shrineMap) run._shrineMap = {};
  ensureStarterShrines(run);

  const C = SHRINES.chunk;
  const p = run.player;
  const mcx = Math.floor(p.x / C);
  const mcy = Math.floor(p.y / C);
  const key = mcx * 100003 + mcy;

  if (key !== run._shrineChunk || !run.shrines.length) {
    run._shrineChunk = key;
    const seen = new Set();
    const list = [];
    for (let k = 1; k <= 3; k++) {
      const st = run._shrineMap[SHRINE_ID_BASE + k];
      if (st) {
        seen.add(st.id);
        list.push(st);
      }
    }
    const R = SHRINES.activeRadius;
    for (let x = mcx - R; x <= mcx + R; x++) {
      for (let y = mcy - R; y <= mcy + R; y++) {
        const s = macroChunkShrine(run, x, y);
        if (s && !seen.has(s.id)) {
          seen.add(s.id);
          list.push(s);
        }
      }
    }
    for (const s of Object.values(run._shrineMap)) {
      if (s && s.active && !seen.has(s.id)) {
        seen.add(s.id);
        list.push(s);
      }
    }
    run.shrines = list;
  }

  // 推进已激活的镇邪试炼碑
  if (dt > 0) {
    for (let i = 0; i < run.shrines.length; i++) {
      const s = run.shrines[i];
      if (!s.active) continue;
      s.timer = Math.max(0, s.timer - dt);
      s._waveT -= dt;
      if (s._waveT <= 0 && s.timer > 0.5) {
        s._waveT += SHRINES.trialWaveEvery;
        spawnTrialElites(run, p.x, p.y, 2);
      }
      if (s.timer <= 0) {
        s.active = false;
        const distStele = Math.hypot(s.x - p.x, s.y - p.y);
        const cx = distStele <= 220 ? s.x : p.x + p.facingX * 42;
        const cy = distStele <= 220 ? s.y : p.y + p.facingY * 42;
        dropPickup(run, 'chest', cx, cy, 0);
        dropPickup(run, 'coin', cx + 14, cy, 10);
        run.events.push({ type: 'shrineActivate', kind: 'trial', outcome: 'complete', x: cx, y: cy });
      }
    }
  }

  if (p.downed || p.hp <= 0) {
    run.nearbyShrine = null;
    return;
  }

  // 计算最近可交互地标（仅对未使用且未激活的地标生效）
  const maxD2 = SHRINES.interactRadius * SHRINES.interactRadius;
  let closest = null;
  let bestD2 = maxD2;
  for (let i = 0; i < run.shrines.length; i++) {
    const s = run.shrines[i];
    if (s.used || s.active) continue;
    const d2 = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d2 <= bestD2) {
      bestD2 = d2;
      closest = s;
    }
  }
  run.nearbyShrine = closest;

  if (input && input.interact && closest && run.status === 'playing') {
    interactShrineImpl(run, closest.id);
  }
}

function toOptionIndex(index) {
  if (typeof index === 'number') return Number.isInteger(index) ? index : -1;
  if (typeof index === 'string' && index.trim() !== '') {
    const n = Number(index);
    return Number.isInteger(n) ? n : -1;
  }
  return -1;
}

export function interactShrineImpl(run, shrineId = null) {
  if (!run || !run.player || run.player.downed || run.player.hp <= 0) {
    if (run) run.nearbyShrine = null;
    return false;
  }
  const refreshingOpen = shrineId != null && run.status === 'shrine';
  if (run.status !== 'playing' && !refreshingOpen) return false;
  let s = null;
  if (shrineId != null) {
    const sid = typeof shrineId === 'string' && shrineId.trim() !== '' ? Number(shrineId) : shrineId;
    if (typeof sid !== 'number' || !Number.isInteger(sid)) return false;
    if (refreshingOpen && run.activeShrine && run.activeShrine.id !== sid) return false;
    s = run.shrines.find((x) => x.id === sid && !x.used && !x.active) || run._shrineMap?.[sid] || null;
    if (s && (s.used || s.active)) s = null;
  } else if (run.nearbyShrine && !run.nearbyShrine.used && !run.nearbyShrine.active) {
    s = run.nearbyShrine;
  }
  if (!s) {
    if (refreshingOpen) {
      run.activeShrine = null;
      run.status = 'playing';
    }
    return false;
  }
  run.activeShrine = buildShrineOptions(run, s);
  run.status = 'shrine';
  return true;
}

export function dismissShrineImpl(run) {
  if (!run || run.status !== 'shrine') return;
  run.activeShrine = null;
  run.status = 'playing';
}

export function resolveShrineImpl(run, optionIndex) {
  if (!run || !run.player || run.player.downed || run.player.hp <= 0 || run.status !== 'shrine' || !run.activeShrine) return null;
  const idx = toOptionIndex(optionIndex);
  const modal = run.activeShrine;
  if (idx < 0 || !modal.options || idx >= modal.options.length) return null;
  const opt = modal.options[idx];
  if (!opt || opt.disabled) return null;

  const s = run.shrines.find((x) => x.id === modal.id) || run._shrineMap?.[modal.id];
  if (!s || s.used) {
    run.activeShrine = null;
    run.status = 'playing';
    return null;
  }

  const p = run.player;
  if (s.kind === 'altar') {
    if (opt.id === 'blood_rite') {
      const hpCost = Math.max(1, Math.floor(p.maxHp * SHRINES.altarHpPct));
      if (p.hp <= hpCost) return null;
      p.hp = Math.max(1, p.hp - hpCost);
      const lv5W = run.weapons.find((w) => !w.evolved && w.level >= MAX_WEAPON_LEVEL);
      if (lv5W) {
        lv5W.altarReady = true;
        evolveWeapon(run, lv5W.id, 'altar');
        recomputeMods(run);
        applyEvolutionCeremonyPulse(run);
      } else {
        const upgW = run.weapons.filter((w) => !w.evolved && w.level < MAX_WEAPON_LEVEL).sort((a, b) => b.level - a.level)[0];
        if (upgW) {
          for (let k = 0; k < SHRINES.altarUpgradeLevels; k++) addOrUpgradeWeapon(run, upgW.id);
          upgW.altarReady = true;
          recomputeMods(run);
        } else {
          run.mods.overflowMult *= DAMAGE.overflowMult;
          run.mods.overflowStacks++;
          recomputeMods(run);
        }
      }
    } else if (opt.id === 'fortune_slip') {
      run._pendingBlessings = (run._pendingBlessings || 0) + 1;
    } else if (opt.id === 'incense_ward') {
      const healed = healPlayer(run, p.maxHp);
      if (healed > 0) run.events.push({ type: 'heal', amount: healed, source: 'altar', x: p.x, y: p.y });
      p.invulnT = Math.max(p.invulnT, SHRINES.altarWardInvuln);
      for (let i = 0; i < run.projectiles.length; i++) {
        const pr = run.projectiles[i];
        if (pr.kind === 'enemyBullet' && (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= (SHRINES.altarClearRadius + (pr.r || 0)) ** 2) {
          pr.dead = true;
        }
      }
      run.projectiles = run.projectiles.filter((pr) => !(pr.kind === 'enemyBullet' && pr.dead));
    }
  } else if (s.kind === 'trial') {
    s.active = true;
    s.timer = SHRINES.trialDuration;
    s.maxTimer = SHRINES.trialDuration;
    s._waveT = SHRINES.trialWaveEvery;
    spawnTrialElites(run, s.x, s.y, 3);
  } else if (s.kind === 'peddler') {
    const C = SHRINES.peddlerCosts;
    if (opt.id === 'peddler_upgrade') {
      if (!spendCoins(run, C.upgrade)) return null;
      const upg = [];
      for (const w of run.weapons) if (w.level < MAX_WEAPON_LEVEL) upg.push({ kind: 'weapon', id: w.id });
      for (const r of run.relics) if (r.level < MAX_RELIC_LEVEL) upg.push({ kind: 'relic', id: r.id });
      if (upg.length) {
        const picked = run.rng.pick(upg);
        if (picked.kind === 'weapon') addOrUpgradeWeapon(run, picked.id);
        else addOrUpgradeRelic(run, picked.id);
      } else {
        run.mods.overflowMult *= DAMAGE.overflowMult;
        run.mods.overflowStacks++;
      }
      recomputeMods(run);
    } else if (opt.id === 'peddler_seals') {
      if (!spendCoins(run, C.seals)) return null;
      run.rerolls.free += SHRINES.peddlerSealRerolls;
      run.banishesLeft = (run.banishesLeft || 0) + SHRINES.peddlerSealBanishes;
    } else if (opt.id === 'peddler_elixir') {
      if (!spendCoins(run, C.elixir)) return null;
      const healed = healPlayer(run, SHRINES.peddlerElixirHeal);
      if (healed > 0) run.events.push({ type: 'heal', amount: healed, source: 'peddler', x: p.x, y: p.y });
      p.ult = Math.min(p.ultMax, p.ult + SHRINES.peddlerElixirUlt);
    }
  }

  s.used = true;
  run.activeShrine = null;
  run.nearbyShrine = null;
  run.events.push({ type: 'shrineActivate', kind: s.kind, outcome: opt.id, x: s.x, y: s.y });
  return { kind: s.kind, outcome: opt.id };
}
