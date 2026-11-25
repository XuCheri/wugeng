// 局内模拟状态 32 位确定性校验哈希（v4 M4.1）：
// 用于互联网锁步联机每 20 回合（约 2 秒）双端比对，第一时间发现状态漂移并触发房主纠偏。
// 严守 T5-WB-07：纯逻辑、零宿主/非确定性依赖。

function mixInt(h, v) {
  let x = (h ^ (v | 0)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function mixStr(h, str) {
  if (typeof str !== 'string') return mixInt(h, 0);
  let cur = mixInt(h, str.length);
  for (let i = 0; i < str.length; i++) {
    cur = mixInt(cur, str.charCodeAt(i));
  }
  return cur;
}

/**
 * 计算 run 当前权威模拟态的 32 位无符号整数指纹。
 * 覆盖：帧对齐时间、更次、主随机流状态、全体守夜人量化坐标/血量/等级/兵刃法器数、存活邪祟量化坐标/血量及总击杀铜钱。
 */
export function computeRunHash(run) {
  if (!run || typeof run !== 'object') return 0;
  let h = 0x811c9dc5;

  h = mixInt(h, Math.round((run.time || 0) * 60));
  h = mixInt(h, run.watch | 0);
  h = mixInt(h, run.mode === 'endless' ? 1 : 0);
  h = mixInt(h, run.rng ? (run.rng.getState() >>> 0) : 0);
  h = mixInt(h, (run.stats?.kills || 0) | 0);
  h = mixInt(h, (run.stats?.coins || 0) | 0);

  const players = Array.isArray(run.players) && run.players.length > 0
    ? run.players
    : (run.player ? [run.player] : []);

  h = mixInt(h, players.length);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p) continue;
    h = mixInt(h, p.slot ?? i);
    h = mixInt(h, Math.round((p.x || 0) * 16));
    h = mixInt(h, Math.round((p.y || 0) * 16));
    h = mixInt(h, Math.round((p.hp || 0) * 4));
    h = mixInt(h, Math.round((p.maxHp || 0) * 4));
    h = mixInt(h, p.level | 0);
    h = mixInt(h, (p.downed ? 1 : 0) | (p.isBot ? 2 : 0));
    h = mixInt(h, Array.isArray(p.weapons) ? p.weapons.length : 0);
    h = mixInt(h, Array.isArray(p.relics) ? p.relics.length : 0);
  }

  const enemies = Array.isArray(run.enemies) ? run.enemies : [];
  let aliveCount = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e.dead) continue;
    aliveCount++;
    h = mixStr(h, e.type || '');
    h = mixInt(h, Math.round((e.x || 0) * 8));
    h = mixInt(h, Math.round((e.y || 0) * 8));
    h = mixInt(h, Math.round((e.hp || 0) * 2));
  }
  h = mixInt(h, aliveCount);

  return h >>> 0;
}
