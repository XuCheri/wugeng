import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as B from '../../src/sim/balance.js';
import { createRun, stepRun, openChest, chooseUpgrade } from '../../src/sim/run.js';
import { spawnEnemy } from '../../src/sim/enemies.js';
import { dropPickup } from '../../src/sim/pickups.js';
import { FUSIONS, FUSION_IDS, availableFusions } from '../../src/sim/fusions.js';
import { countSchoolItems } from '../../src/sim/synergies.js';
import {
  ASTROLABE_IDS,
  ASTROLABE_MAX_LEVEL,
  buyAstrolabeLevel,
  getAstrolabeLevel,
} from '../../src/meta/astrolabe.js';
import {
  CURIOS,
  CURIO_IDS,
  MAX_EQUIPPED_CURIOS,
  reconcileCurios,
  buyCurio,
  toggleEquipCurio,
} from '../../src/meta/curios.js';
import { defaultSave, migrateSave, mergeSaves } from '../../src/meta/save.js';
import { getMetaBonuses } from '../../src/meta/shop.js';
import {
  REGULAR_ENEMY_ASSET_IDS,
  SHRINE_ASSET_IDS,
  HAZARD_ASSET_IDS,
  computeEnemyGait,
} from '../../src/render/entity-images.js';
import {
  renderSuona,
  renderXiao,
  renderTanggu,
  renderBangzi,
  selectFolkScoreKey,
  PENTA_COMBO_SEMITONES,
} from '../../src/audio/folk-score.js';
import { createAudio } from '../../src/audio/synth.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('v7 Pillar 1: 踏罡步瞬闪（穿怪无敌、冷却、秘传·罡步镇煞落雷）与擦弹破煞（攒气+八卦镜反击）', () => {
  const run = createRun({
    seed: 7001,
    heroId: 'zhou',
    meta: { dashThunderSeal: 1 },
  });
  run.enemies.length = 0;

  // 在冲刺路径上放置一名强敌，验证踏罡步穿怪免伤且落下镇魂雷符
  const blocker = spawnEnemy(run, 'sedan', run.player.x + 26, run.player.y);
  blocker.hp = 800;
  blocker.maxHp = 800;
  const hpBefore = run.player.hp;

  stepRun(run, { moveX: 1, moveY: 0, dash: true }, B.DT);
  assert.ok(run.player.dashT > 0, '触发 dash 输入后应进入踏罡步冲刺态');
  assert.ok(run.player.dashCd > 0, '踏罡步触发后应进入冷却');
  assert.equal(run.events.some((e) => e.type === 'dash'), true, '应发出 dash 事件');

  let sealTriggered = false;
  for (let i = 0; i < 16; i++) {
    stepRun(run, { moveX: 1, moveY: 0, dash: false }, B.DT);
    if (run.events.some((e) => e.type === 'explosion')) sealTriggered = true;
  }
  assert.equal(run.player.hp, hpBefore, '踏罡步冲刺期间穿过敌人应完全免伤');
  assert.ok(blocker.hp < 800 || sealTriggered, '镇魂脉肆阶秘传「罡步镇煞」应在穿怪时落下雷符造成伤害');

  // 验证擦弹破煞（Graze）+ 八卦镜伍阶觉醒反击
  const runGraze = createRun({ seed: 7002, heroId: 'zhou' });
  runGraze.enemies.length = 0;
  runGraze.relics.push({ id: 'bagua', level: 5 });
  // 刷新满级法器觉醒标志
  runGraze.status = 'levelup';
  runGraze.choices = [{ kind: 'weapon', id: 'gong', nextLevel: 2 }];
  chooseUpgrade(runGraze, 0);
  assert.equal(Boolean(runGraze.mods?.capstones?.bagua), true);

  const sniper = spawnEnemy(runGraze, 'archer_ghost', runGraze.player.x + 90, runGraze.player.y);
  sniper.hp = 500;
  sniper.maxHp = 500;
  const ultBefore = runGraze.player.ult;
  const grazeOffsetY = runGraze.player.r + 5 + 8; // 位于受击半径之外、擦弹判定圈之内
  runGraze.projectiles.push({
    kind: 'enemyBullet',
    x: runGraze.player.x,
    y: runGraze.player.y + grazeOffsetY,
    vx: -120,
    vy: 0,
    r: 5,
    dmg: 20,
    life: 1.5,
  });

  stepRun(runGraze, { moveX: 0, moveY: 0 }, B.DT);
  assert.equal(runGraze.events.some((e) => e.type === 'graze'), true, '贴身掠过敌弹应触发 graze 事件');
  assert.ok(runGraze.player.ult >= ultBefore + B.GRAZE.ultGain, '擦弹破煞应立刻增加大招攒气');
  assert.equal(runGraze.player.hp, runGraze.player.maxHp, '擦弹不应扣除生命');

  // 步进以触发八卦镜乾坤返照反伤金波
  for (let i = 0; i < 6; i++) stepRun(runGraze, { moveX: 0, moveY: 0 }, B.DT);
  assert.ok(
    runGraze._baguaReflectCd > 0 && sniper.hp < 500,
    '八卦镜伍阶觉醒应在擦弹时震开反伤金波命中近处邪祟',
  );
});

test('v7 Pillar 1B: 三大街巷民俗机关（爆竹火桶连锁、招魂铜铃全屏吸魂、定魂敕符桩定身易伤）与 0x88b3 独立随机流', () => {
  const run = createRun({ seed: 7003, heroId: 'zhou' });
  run.enemies.length = 0;
  run.props.length = 0;
  run.pickups.length = 0;

  // 1. 招魂铜铃：触碰后全图远端魂珠/铜钱进入磁吸态
  const farOrb = dropPickup(run, 'xp', run.player.x + 560, run.player.y - 420, 5);
  const farCoin = dropPickup(run, 'coin', run.player.x - 520, run.player.y + 380, 3);
  run.props.push({
    id: 901,
    kind: 'hazard_bell',
    x: run.player.x + 4,
    y: run.player.y,
    r: B.HAZARDS.bellR,
    hp: 1,
    solid: false,
    destructible: false,
  });
  stepRun(run, { moveX: 0, moveY: 0 }, B.DT);
  assert.equal(run.events.some((e) => e.type === 'hazardBell'), true, '触碰招魂铜铃应发出 hazardBell 事件');
  assert.equal(farOrb.mag, true, '招魂铜铃应将全图远端魂珠标记为磁吸回收');
  assert.equal(farCoin.mag, true, '招魂铜铃应将全图远端铜钱标记为磁吸回收');

  // 2. 爆竹火桶：打爆后范围炸伤周围邪祟且不伤玩家
  const mob = spawnEnemy(run, 'paperkid', run.player.x + 150, run.player.y);
  mob.hp = 120;
  mob.maxHp = 120;
  run.props.push({
    id: 902,
    kind: 'hazard_barrel',
    x: run.player.x + 140,
    y: run.player.y,
    r: B.HAZARDS.barrelR,
    hp: 1,
    solid: false,
    destructible: true,
  });
  run.projectiles.push({
    kind: 'talisman',
    weaponId: 'talisman',
    x: run.player.x + 140,
    y: run.player.y,
    vx: 0,
    vy: 0,
    speed: 0,
    angle: 0,
    r: 16,
    dmg: 30,
    pierce: 2,
    t: 0,
    life: 0.3,
    _hit: [],
  });
  let barrelEvent = false;
  for (let i = 0; i < 6; i++) {
    stepRun(run, { moveX: 0, moveY: 0 }, B.DT);
    if (run.events.some((e) => e.type === 'hazardBarrel')) barrelEvent = true;
  }
  assert.equal(barrelEvent, true, '击破爆竹火桶应发出 hazardBarrel 事件');
  assert.ok(mob.hp < 120 || mob.dead, '爆竹火桶爆炸应对范围内邪祟造成高额伤害');

  // 3. 定魂敕符桩：激活后周围邪祟进入定身（stunTimer > 0）与易伤（vulnTimer > 0）
  const elite = spawnEnemy(run, 'suona', run.player.x - 140, run.player.y);
  elite.hp = 600;
  elite.maxHp = 600;
  run.props.push({
    id: 903,
    kind: 'hazard_seal',
    x: run.player.x - 135,
    y: run.player.y,
    r: B.HAZARDS.sealR,
    hp: 1,
    solid: false,
    destructible: true,
  });
  run.projectiles.push({
    kind: 'talisman',
    weaponId: 'talisman',
    x: run.player.x - 135,
    y: run.player.y,
    vx: 0,
    vy: 0,
    speed: 0,
    angle: 0,
    r: 16,
    dmg: 30,
    pierce: 2,
    t: 0,
    life: 0.3,
    _hit: [],
  });
  for (let i = 0; i < 6; i++) stepRun(run, { moveX: 0, moveY: 0 }, B.DT);
  assert.ok(elite.stunT > 0, '定魂敕符桩应定身范围内邪祟');
  assert.ok(elite.vulnT > 0, '定魂敕符桩应对范围内邪祟施加破甲易伤');
});

test('v7 Pillar 2: 6 式「阴阳合契」二合一腾槽宗师超武与 22 件法器伍阶满级觉醒特效', () => {
  assert.equal(FUSION_IDS.length, 6, '应包含全部 6 式双神兵合契超武');
  for (const fid of FUSION_IDS) {
    const f = FUSIONS[fid];
    assert.ok(B.WEAPONS[f.primaryId] && B.WEAPONS[f.secondaryId], `合契 ${fid} 前置兵刃有效`);
  }

  // 验证 6 槽满载时开启供盒完成二合一合契 → 兵刃槽 6 变 5，且保留副兵刃流派羁绊
  const run = createRun({ seed: 7010, heroId: 'zhou' });
  run.weapons = [
    { id: 'talisman', level: 5, evolved: true, cd: 0.1 },
    { id: 'coinsword', level: 5, evolved: true, cd: 0.1 },
    { id: 'gong', level: 3, evolved: false, cd: 0.5 },
    { id: 'lantern', level: 2, evolved: false, cd: 0.5 },
    { id: 'brush', level: 2, evolved: false, cd: 0.5 },
    { id: 'paperman', level: 2, evolved: false, cd: 0.5 },
  ];
  const beforeCounts = countSchoolItems(run);
  const avail = availableFusions(run);
  assert.equal(avail.some((f) => f.id === 'grand_celestial_formation'), true);

  run.status = 'chest';
  run.chestChoices = [{
    id: 'grand_celestial_formation',
    kind: 'fusion',
    recipe: 'fusion',
    fusionName: FUSIONS.grand_celestial_formation.name,
  }];
  const chestRes = openChest(run, 'grand_celestial_formation');
  assert.equal(chestRes.fused, 'grand_celestial_formation');
  assert.equal(run.weapons.length, 5, '二合一合契后必须腾出 1 个兵刃槽位（6 -> 5）');
  const fusedW = run.weapons.find((w) => w.id === 'talisman');
  assert.equal(fusedW.fusionId, 'grand_celestial_formation');
  const afterCounts = countSchoolItems(run);
  for (const tag of Object.keys(beforeCounts)) {
    assert.equal(afterCounts[tag], beforeCounts[tag], `合契吞并副兵刃后不得损失 ${tag} 流派羁绊点数`);
  }

  // 验证全部 22 件法器均拥有伍阶觉醒定义，并实测百家米伍阶觉醒（拾取包子永久 +4 生命上限）
  assert.equal(B.RELIC_IDS.length, 22);
  for (const rid of B.RELIC_IDS) {
    const cap = B.RELIC_CAPSTONES[rid];
    assert.ok(cap && cap.name && cap.desc, `法器 ${rid} 必须具备伍阶觉醒特效`);
  }

  const runCap = createRun({ seed: 7011, heroId: 'zhou' });
  runCap.relics = [{ id: 'folk_rice', level: 4 }];
  runCap.status = 'levelup';
  runCap.choices = [{ kind: 'relic', id: 'folk_rice', nextLevel: 5 }];
  chooseUpgrade(runCap, 0);
  const maxHpAtLv5 = runCap.player.maxHp;
  dropPickup(runCap, 'bun', runCap.player.x, runCap.player.y, 20);
  stepRun(runCap, { moveX: 0, moveY: 0 }, B.DT);
  assert.equal(runCap.player.maxHp, maxHpAtLv5 + 4, '百家米伍阶觉醒后拾取包子应额外永久提升 +4 生命上限');
});

test('v7 Pillar 3 & 4: 23 张木刻资产完整性、5 套差异化步态骨架、唢呐/洞箫离线声学波表与五态配乐切换', () => {
  assert.equal(REGULAR_ENEMY_ASSET_IDS.size, 16);
  for (const eid of REGULAR_ENEMY_ASSET_IDS) {
    const p = path.join(REPO_ROOT, `assets/enemies/enemy_${eid}.webp`);
    assert.ok(fs.existsSync(p) && fs.statSync(p).size > 500, `缺少百鬼木刻贴图 enemy_${eid}.webp`);
    const gait = computeEnemyGait(eid, 1.25, 3, 1);
    assert.ok(Number.isFinite(gait.oy) && Number.isFinite(gait.rot) && gait.gx > 0 && gait.gy > 0);
  }
  for (const sid of SHRINE_ASSET_IDS) {
    const p = path.join(REPO_ROOT, `assets/shrines/shrine_${sid}.webp`);
    assert.ok(fs.existsSync(p) && fs.statSync(p).size > 500, `缺少神龛贴图 shrine_${sid}.webp`);
  }
  for (const hid of HAZARD_ASSET_IDS) {
    const p = path.join(REPO_ROOT, `assets/props/${hid}.webp`);
    assert.ok(fs.existsSync(p) && fs.statSync(p).size > 500, `缺少街巷机关贴图 ${hid}.webp`);
  }
  const titleBg = path.join(REPO_ROOT, 'assets/ui/title-bg.webp');
  assert.ok(fs.existsSync(titleBg) && fs.statSync(titleBg).size > 5000, '缺少竖屏标题主视觉 title-bg.webp');

  // 离线民俗乐器波表能量与有限性校验
  for (const [label, samples] of [
    ['suona', renderSuona(22050, 587.33, 0.35)],
    ['xiao', renderXiao(22050, 293.66, 0.45)],
    ['tanggu', renderTanggu(22050, true)],
    ['bangzi', renderBangzi(22050, true)],
  ]) {
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Number.isFinite(samples[i]) && Math.abs(samples[i]) <= 1, `${label} 采样越界`);
      energy += samples[i] * samples[i];
    }
    assert.ok(energy > 0.05, `${label} 采样必须具备真实声学能量`);
  }

  assert.equal(PENTA_COMBO_SEMITONES.length, 10);
  assert.equal(selectFolkScoreKey({ musicMode: 'menu' }), 'menu');
  assert.equal(selectFolkScoreKey({ musicMode: 'run', watch: 2 }), 'watch_early');
  assert.equal(selectFolkScoreKey({ musicMode: 'run', watch: 4 }), 'watch_late');
  assert.equal(selectFolkScoreKey({ musicMode: 'run', watch: 3, bossActive: true }), 'boss');
  assert.equal(selectFolkScoreKey({ musicMode: 'run', watch: 5, endless: true }), 'boss');
  assert.equal(selectFolkScoreKey({ musicMode: 'run', watch: 6 }), 'dawn');

  // 验证 synth.js 新音效与连拾五声上行在 MockAudioContext 下正常发声
  const prevAC = globalThis.AudioContext;
  let mockNow = 0;
  let nodes = 0;
  class SimpleMockAC {
    constructor() { this.sampleRate = 22050; this.state = 'running'; this.destination = {}; }
    get currentTime() { return mockNow; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 1 }, connect() {} }; }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, connect() {} }; }
    createBiquadFilter() { return { type: 'lowpass', Q: { value: 1 }, frequency: { value: 1000, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { nodes++; return { type: 'sine', frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBuffer(_c, len, sr) { const a = new Float32Array(len); return { sampleRate: sr, length: len, getChannelData: () => a, copyToChannel: (s) => a.set(s) }; }
    createBufferSource() { nodes++; return { buffer: null, loop: false, playbackRate: { value: 1, setTargetAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  }
  globalThis.AudioContext = SimpleMockAC;
  try {
    const audio = createAudio();
    audio.unlock();
    for (const sfx of ['dash', 'graze', 'fusion', 'hazardBell', 'hazardBarrel', 'hazardSeal']) {
      mockNow += 2;
      const b = nodes;
      assert.equal(audio.play(sfx), true, `新音效 ${sfx} 应成功触发`);
      assert.ok(nodes > b, `新音效 ${sfx} 应创建真实音频节点`);
    }
    mockNow += 2;
    assert.equal(audio.play('pickup', { comboStep: 7 }), true);
  } finally {
    if (prevAC === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = prevAC;
  }
});

test('v7 Pillar 5: 守夜司三脉星盘、8 件永久镇物法宝（里程碑解锁/铸造/双槽佩挂/云端合并）与守夜镇魂玉免死', () => {
  assert.equal(ASTROLABE_IDS.length, 3);
  assert.equal(CURIO_IDS.length, 8);

  const save = defaultSave();
  save.coins = 10_000;
  for (const bid of ASTROLABE_IDS) {
    for (let lv = 1; lv <= ASTROLABE_MAX_LEVEL; lv++) {
      const r = buyAstrolabeLevel(save, bid);
      assert.equal(r.ok, true);
      assert.equal(getAstrolabeLevel(save, bid), lv);
    }
    assert.equal(buyAstrolabeLevel(save, bid).reason, 'max');
  }

  // 里程碑自动解锁 + 铜钱铸造 + 双槽佩挂上限
  save.stats.runs = 1;
  save.stats.totalBossKills = 1;
  const unlocked = reconcileCurios(save);
  assert.ok(unlocked.includes('curio_clapper') && unlocked.includes('curio_horse_bell'));
  assert.equal(save.curios.equipped.length, 2, '自动解锁前两件镇物时应自动填入 2 个佩挂空槽');

  const forgeJade = buyCurio(save, 'curio_guardian_jade');
  assert.equal(forgeJade.ok, true);
  // 卸下一件再佩挂守夜镇魂玉
  toggleEquipCurio(save, 'curio_clapper');
  const eqJade = toggleEquipCurio(save, 'curio_guardian_jade');
  assert.equal(eqJade.ok, true && eqJade.equipped === true);
  assert.equal(save.curios.equipped.length, MAX_EQUIPPED_CURIOS);

  const bonuses = getMetaBonuses(save);
  assert.equal(bonuses.dashThunderSeal, 1);
  assert.equal(bonuses.firstChestBonusRelic, 1);
  assert.equal(bonuses.eliteSlayerStack, 1);
  assert.equal(bonuses.cheatDeathJade, 1);

  // 验证守夜镇魂玉入局触发致命伤免死，且结算后永久保留不消耗
  const run = createRun({ seed: 7020, heroId: 'zhou', meta: bonuses });
  assert.equal(run.mods.cheatDeathJade, 1);
  run.enemies.length = 0;
  const boss = spawnEnemy(run, 'sedan', run.player.x, run.player.y);
  boss.dmg = 999;
  stepRun(run, { moveX: 0, moveY: 0 }, B.DT);
  assert.equal(run.status, 'playing', '守夜镇魂玉应拦截首次致命伤免死');
  assert.equal(run._guardianJadeUsed, true);
  assert.equal(save.curios.owned.includes('curio_guardian_jade'), true, '永久镇物在局后绝不消耗');

  // 云存档合并应保留星盘最高阶与镇物并集
  const remote = migrateSave({ coins: 200, curios: { owned: ['curio_hebo_pearl'], forged: ['curio_hebo_pearl'], equipped: ['curio_hebo_pearl'] } });
  const merged = mergeSaves(save, remote);
  assert.equal(merged.astrolabe.zhenhun, 4);
  assert.equal(merged.curios.owned.includes('curio_guardian_jade'), true);
  assert.equal(merged.curios.owned.includes('curio_hebo_pearl'), true);
});
