import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, RELICS, WEAPON_IDS, RELIC_IDS } from '../../src/sim/balance.js';
import { createRun, stepRun, DT } from '../../src/sim/run.js';
import { addOrUpgradeWeapon, evolveWeapon } from '../../src/sim/weapons.js';
import { addOrUpgradeRelic, relicEffect } from '../../src/sim/relics.js';
import { recomputeMods } from '../../src/sim/player.js';
import { spawnEnemy } from '../../src/sim/enemies.js';
import { createAudio } from '../../src/audio/synth.js';

function cleanRun(seed = 2026) {
  const run = createRun({ seed, heroId: 'zhou', unlockedWeapons: WEAPON_IDS });
  run.weapons.length = 0;
  run.relics.length = 0;
  run.enemies.length = 0;
  run.projectiles.length = 0;
  run.pickups.length = 0;
  run._bossSpawned = { horse: true, umbrella: true, youshen: true };
  run._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
  run._watchEventsDone = { 2: true, 3: true, 4: true };
  run.time = 25;
  return run;
}

test('M2.3 兵刃与法器扩充（20 对本命双射，四门均匀新增）：配对、属性与音效完整', () => {
  assert.ok(WEAPON_IDS.length >= 20);
  assert.equal(RELIC_IDS.length, WEAPON_IDS.length);

  const pairs = [
    ['mourning_staff', 'altar_mirror', 'zhenhun'],
    ['sky_lantern', 'lamp_oil', 'yangyan'],
    ['carpenter_line', 'folk_rice', 'zhizha'],
    ['luopan_slip', 'cinnabar_pen', 'daofa'],
  ];

  const audio = createAudio();
  for (const [wid, rid, tag] of pairs) {
    assert.equal(WEAPONS[wid].pair, rid);
    assert.equal(RELICS[rid].pair, wid);
    assert.ok(WEAPONS[wid].tags.includes(tag));
    assert.ok(RELICS[rid].tags.includes(tag));
    const eff5 = relicEffect(rid, 5);
    assert.ok(Object.values(eff5).some((v) => v > 0), `${rid} 5级应提供正属性加成`);
    assert.doesNotThrow(() => audio.onEvents([{ type: 'fire', weaponId: wid, evolved: false }]));
    assert.doesNotThrow(() => audio.onEvents([{ type: 'fire', weaponId: wid, evolved: true }]));
  }
});

test('M2.3 引魂丧杆 → 幽冥镇魂杆：近身横扫减速击退；开光周天清弹、破甲定身且三扫震波', () => {
  const run = cleanRun(501);
  for (let l = 0; l < 5; l++) addOrUpgradeWeapon(run, 'mourning_staff');
  addOrUpgradeRelic(run, 'altar_mirror');
  recomputeMods(run);

  const foe = spawnEnemy(run, 'lanternghost', 60, 0, { fixedHp: 900 });
  run.weapons[0].cd = 0.01;
  stepRun(run, {}, DT);
  assert.ok(foe.hp < 900 && foe.slowT > 0, '引魂丧杆应命中并减速近身敌人');

  assert.equal(evolveWeapon(run, 'mourning_staff'), true);
  run.projectiles.push({
    id: run._nextId++,
    kind: 'enemyBullet',
    x: 40,
    y: 0,
    vx: -50,
    vy: 0,
    r: 6,
    dmg: 10,
    t: 0,
    life: 2,
  });
  for (let s = 0; s < 3; s++) {
    run.weapons[0].cd = 0.01;
    stepRun(run, {}, DT);
  }
  assert.equal(run.projectiles.some((p) => p.kind === 'enemyBullet'), false, '幽冥镇魂杆应震碎范围敌弹');
  assert.ok(foe.stunT > 0 && foe.vulnT > 0, '幽冥镇魂杆应附加定身与易伤');
  assert.ok(run.projectiles.some((p) => p.kind === 'gongPulse' && p.weaponId === 'mourning_staff'), '第三扫应震开镇魂余波');
});

test('M2.3 孔明灯 → 九天赤焰灯：升空索敌轰落爆炸；开光附阳炎火印与流火余烬池', () => {
  const run = cleanRun(502);
  for (let l = 0; l < 5; l++) addOrUpgradeWeapon(run, 'sky_lantern');
  addOrUpgradeRelic(run, 'lamp_oil');
  recomputeMods(run);
  assert.equal(evolveWeapon(run, 'sky_lantern'), true);

  const foe = spawnEnemy(run, 'sedan', 120, 0, { fixedHp: 1200 });
  foe.speed = 0;
  run.weapons[0].cd = 0.01;
  for (let i = 0; i < Math.ceil(0.8 / DT); i++) stepRun(run, {}, DT);

  assert.ok(foe.hp < 1200, '九天赤焰灯落地应造成范围爆炸伤害');
  assert.ok(foe.yangyanMarkT > 0, '九天赤焰灯应烙上阳炎火印');
  assert.ok(run.projectiles.some((p) => p.kind === 'inkPool' && p.weaponId === 'sky_lantern'), '应留下流火余烬池');
});

test('M2.3 墨斗线 → 乾坤断魂线 & 风水飞签 → 天罡定穴签：贯穿流血墨网与三中定穴破脉', () => {
  const lineRun = cleanRun(503);
  for (let l = 0; l < 5; l++) addOrUpgradeWeapon(lineRun, 'carpenter_line');
  addOrUpgradeRelic(lineRun, 'folk_rice');
  recomputeMods(lineRun);
  assert.equal(evolveWeapon(lineRun, 'carpenter_line'), true);

  const e1 = spawnEnemy(lineRun, 'sedan', 90, -20, { fixedHp: 1500 });
  const e2 = spawnEnemy(lineRun, 'sedan', 90, 40, { fixedHp: 1500 });
  e1.speed = 0;
  e2.speed = 0;
  lineRun.weapons[0].cd = 0.01;
  for (let i = 0; i < Math.ceil(1.5 / DT); i++) stepRun(lineRun, {}, DT);
  assert.ok(e1.hp < 1500 && e1.bleedT > 0, '乾坤断魂线应斩裂目标并附加流血');

  const slipRun = cleanRun(504);
  for (let l = 0; l < 5; l++) addOrUpgradeWeapon(slipRun, 'luopan_slip');
  addOrUpgradeRelic(slipRun, 'cinnabar_pen');
  recomputeMods(slipRun);
  assert.equal(evolveWeapon(slipRun, 'luopan_slip'), true);

  const boss = spawnEnemy(slipRun, 'sedan', 140, 0, { fixedHp: 3000, elite: true });
  boss.speed = 0;
  slipRun.weapons[0].cd = 0.01;
  let sawAcupointBurst = false;
  for (let i = 0; i < Math.ceil(1.0 / DT); i++) {
    stepRun(slipRun, {}, DT);
    if (slipRun.events.some((ev) => ev.type === 'explosion' && ev.weaponId === 'luopan_slip')) {
      sawAcupointBurst = true;
    }
  }
  assert.ok(boss.hp < 3000, '天罡定穴签应疾速索敌连穿');
  assert.ok(sawAcupointBurst, '三中同一目标应引爆定穴破脉范围震晕');
});
