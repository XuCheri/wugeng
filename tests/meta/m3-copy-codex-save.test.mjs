import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVE_KEY, WEAPON_IDS, RELIC_IDS, ENEMY_IDS, HERO_IDS,
  defaultSave, migrateSave, mergeSaves, isFreshSave, markAchievement, loadSave, saveSave, isPlainObj,
} from '../../src/meta/save.js';
import { createCloudSave } from '../../src/meta/cloud-save.js';
import { ensureCodex, getCodexCounts, syncCodexFromRun, recordCodexCharms, recordCodexSummary } from '../../src/meta/codex.js';
import { evaluateUnlocks, heroUnlockProgress, recordRun, grantDoubleCoins } from '../../src/meta/unlocks.js';
import { localDateString, getCheckinState, claimCheckin } from '../../src/meta/checkin.js';
import * as Shop from '../../src/meta/shop.js';
import {
  HERO_COPY, heroInfo, weaponName, relicName, pairOf, weaponPairRelic,
  WEAPON_INTRO, EVOLVE_INTRO, ENEMY_COPY, relicTotalDesc, describeChoice,
  SCHOOL_TAG_IDS, schoolName, blessingInfo, BLESSINGS,
} from '../../src/ui/copy.js';
import { icon } from '../../src/ui/icons.js';
import { createInput } from '../../src/input.js';
import { createRun, interactShrine, resolveShrine } from '../../src/sim/run.js';

function makeFakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    setPointerCapture() {},
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) {
        fn({ type, preventDefault() {}, ...payload });
      }
    },
  };
}

test('M3 图鉴容量：12 兵刃 + 12 开光 + 12 法器 + 12 百鬼 = 48 项百物核心（含 3 人物共 51 项）', () => {
  assert.equal(WEAPON_IDS.length, 12);
  assert.equal(RELIC_IDS.length, 12);
  assert.equal(ENEMY_IDS.length, 12);
  assert.equal(HERO_IDS.length, 3);

  const s = defaultSave();
  const c0 = getCodexCounts(s);
  assert.equal(c0.coreHave, 1);
  assert.equal(c0.coreTotal, 48);
  assert.equal(c0.have, 2);
  assert.equal(c0.total, 51);
  assert.equal(c0.weapons.total, 12);
  assert.equal(c0.evolutions.total, 12);
  assert.equal(c0.relics.total, 12);
  assert.equal(c0.enemies.total, 12);

  // 全量收集新旧条目后核对 48 / 48 与 51 / 51
  const full = migrateSave({
    version: 1,
    unlockedHeroes: [...HERO_IDS],
    codex: {
      weapons: [...WEAPON_IDS],
      evolutions: [...WEAPON_IDS],
      relics: [...RELIC_IDS],
      enemies: Object.fromEntries(ENEMY_IDS.map((k, idx) => [k, idx + 1])),
    },
  });
  const cf = getCodexCounts(full);
  assert.equal(cf.coreHave, 48);
  assert.equal(cf.coreTotal, 48);
  assert.equal(cf.have, 51);
  assert.equal(cf.total, 51);
});

test('M3 v1 旧档无损迁移与新四器/四宝/三新鬼持久化 + 香案燃血开光同步', () => {
  const v1Old = migrateSave({
    version: 1,
    coins: 450,
    unlockedHeroes: ['zhou', 'mian'],
    nightCleared: 2,
    nightUnlocked: 3,
    charms: ['clapper', 'soulwick', 'strawshoes'],
    codex: {
      weapons: ['gong', 'compass', 'soulbanner', 'bronze_mirror', 'paperhorse'],
      evolutions: ['soulbanner', 'bronze_mirror'],
      relics: ['glutinous', 'fivecoins'],
      enemies: { paperkid: 25, suona: 8, paperbride: 4, cinder: 12, youshen: 1 },
    },
  });
  assert.equal(v1Old.coins, 450);
  assert.ok(v1Old.codex.weapons.includes('soulbanner'));
  assert.ok(v1Old.codex.weapons.includes('paperman'), '已解锁阿绵回填起手纸人');
  assert.deepEqual(v1Old.codex.evolutions, ['soulbanner', 'bronze_mirror']);
  assert.ok(v1Old.codex.relics.includes('soulwick'), '护身符自动回填法器图鉴');
  assert.ok(v1Old.codex.relics.includes('glutinous'));
  assert.equal(v1Old.codex.enemies.suona, 8);
  assert.equal(v1Old.codex.enemies.paperbride, 4);
  assert.equal(v1Old.codex.enemies.cinder, 12);

  // 香案燃血祭器直接开光满级武器时，syncCodexFromRun 立即可收录开光神兵
  const run = createRun({ seed: 42, heroId: 'zhou' });
  run.player.maxHp = 200;
  run.player.hp = 200;
  run.weapons = [{ id: 'compass', level: 5, evolved: false, cd: 0 }];
  const altar = run.shrines.find((s) => s.kind === 'altar');
  if (altar) {
    run.player.x = altar.x;
    run.player.y = altar.y;
    assert.equal(interactShrine(run, altar.id), true);
    const res = resolveShrine(run, 0); // blood_rite
    assert.equal(res?.outcome, 'blood_rite');
    assert.equal(run.weapons[0].evolved, true);
    const save = defaultSave();
    assert.equal(syncCodexFromRun(save, run), true);
    assert.ok(save.codex.evolutions.includes('compass'));
  }
});

test('M3 存档鲁棒性：拒绝 null/boolean/空串/数组数值隐式强转、非法日期、NaN/Infinity 与原型链污染', () => {
  const hostile = JSON.parse(
    '{"version":1,"coins":true,"nightCleared":null,"nightUnlocked":false,"selectedNight":[],' +
    '"checkin":{"cycleDay":true,"lastClaimDate":"2026-02-31","cycles":null,"totalClaims":""},' +
    '"achievements":{"okTrue":true,"okTs":1700000123,"badZero":0,"badNeg":-9,"__proto__":999,"constructor":888},' +
    '"stats":{"runs":null,"bestHit":1e308,"totalPlaySec":-20}}'
  );
  hostile.achievements.badNaN = NaN;
  hostile.achievements.badInf = Infinity;

  const s = migrateSave(hostile);
  assert.equal(s.coins, 0, 'true 不得被转为 1 铜钱');
  assert.equal(s.nightCleared, -1, 'nightCleared: null 不得误判为已通寻常夜(0)');
  assert.equal(s.nightUnlocked, 0, '未通关时夜色一不得误解锁');
  assert.equal(s.checkin.cycleDay, 0);
  assert.equal(s.checkin.lastClaimDate, null, '2026-02-31 非法日历日必须清空');
  assert.deepEqual(s.achievements, { okTrue: 1, okTs: 1700000123 });
  assert.equal(Object.prototype.hasOwnProperty.call(s.achievements, 'constructor'), false);
  assert.ok(s.stats.bestHit <= 1e15 && Number.isFinite(s.stats.bestHit));
  assert.equal(s.stats.totalPlaySec, 0);

  assert.equal(markAchievement(s, '__proto__', 100), false);
  assert.equal(markAchievement(s, 'firstClear', NaN), true);
  assert.equal(s.achievements.firstClear, 1);

  // unlocks / codex 面对极端 Infinity / NaN summary 时保持有限合法值
  recordRun(s, {
    coins: Infinity,
    timeSec: NaN,
    kills: -50,
    maxHit: Infinity,
    cleared: false,
    killsByType: { suona: Infinity, cinder: -3, paperbride: 7.9 },
  }, 2000);
  assert.equal(s.coins, 0);
  assert.equal(s.stats.bestHit <= 1e15, true);
  assert.equal(s.codex.enemies.suona, undefined);
  assert.equal(s.codex.enemies.cinder, undefined);
  assert.equal(s.codex.enemies.paperbride, 7);
  assert.equal(grantDoubleCoins(s, Infinity), 0);
});

test('M3 mergeSaves：首局中途收录图鉴或持有护身符时，拉取云端不得丢失本机已录条目', () => {
  const localMidRun = defaultSave();
  assert.equal(isFreshSave(localMidRun), true);
  recordCodexCharms(localMidRun, ['soulwick']);
  localMidRun.codex.weapons.push('soulbanner');
  assert.equal(isFreshSave(localMidRun), false, '已有中途图鉴收录不应视为纯空白档');

  const remote = migrateSave({
    version: 1,
    updatedAt: 9000,
    coins: 680,
    stats: { runs: 4, clears: 1, totalPlaySec: 1800 },
    codex: { weapons: ['gong', 'compass'], evolutions: ['compass'], relics: ['clapper'], enemies: { horse: 2 } },
  });

  const merged = mergeSaves(localMidRun, remote);
  assert.equal(merged.coins, 680);
  assert.ok(merged.codex.weapons.includes('soulbanner'), '保留本机局内刚解锁的招魂幡');
  assert.ok(merged.codex.weapons.includes('compass'));
  assert.ok(merged.codex.relics.includes('soulwick'), '保留本机收录的引魂灯芯');
  assert.ok(merged.codex.evolutions.includes('compass'));
});

test('M3 文案与签面描述完整性：12 兵刃 / 12 开光 / 12 法器 / 12 百鬼 / 18 命签 / 4 流派 / 3 英雄绝技', () => {
  for (const id of SCHOOL_TAG_IDS) {
    assert.ok(schoolName(id).length >= 2);
  }
  for (const id of HERO_IDS) {
    const info = heroInfo(id);
    assert.ok(HERO_COPY[id]);
    assert.ok(info.ultName && info.ultName.length >= 4, `英雄 ${id} 缺少绝技名`);
    assert.ok(info.ultDesc && info.ultDesc.length >= 6, `英雄 ${id} 缺少绝技说明`);
  }
  for (const id of WEAPON_IDS) {
    assert.ok(weaponName(id, false) !== id, `武器 ${id} 缺中文名`);
    assert.ok(weaponName(id, true) !== id, `武器 ${id} 缺开光名`);
    assert.ok((WEAPON_INTRO[id] || '').length >= 8, `武器 ${id} 缺简介`);
    assert.ok((EVOLVE_INTRO[id] || '').length >= 8, `武器 ${id} 缺开光描述`);
    const lv1 = describeChoice({ kind: 'weapon', id, level: 1, isNew: true, evolvable: false });
    const lv3 = describeChoice({ kind: 'weapon', id, level: 3, isNew: false, evolvable: false });
    assert.ok(lv1.desc.length > 0, `武器 ${id} Lv1 签面文案为空`);
    assert.ok(lv3.desc.length > 0, `武器 ${id} Lv3 升级差值文案为空`);
    assert.ok(lv1.tags.length >= 1, `武器 ${id} 缺流派标签`);
  }
  for (const id of RELIC_IDS) {
    assert.ok(relicName(id) !== id, `法器 ${id} 缺中文名`);
    const p = pairOf(id);
    assert.ok(WEAPON_IDS.includes(p), `法器 ${id} 配对兵刃无效`);
    assert.equal(weaponPairRelic(p), id);
    assert.ok(relicTotalDesc(id, 1).length > 0, `法器 ${id} Lv1 总加成文案为空`);
    assert.ok(relicTotalDesc(id, 5).length > 0, `法器 ${id} Lv5 总加成文案为空`);
    const rc = describeChoice({ kind: 'relic', id, level: 1, isNew: true, evolvable: true });
    assert.ok(rc.desc.length > 0);
    assert.ok(rc.evolveHint.includes('开光'));
  }
  for (const id of ENEMY_IDS) {
    assert.ok(ENEMY_COPY[id]?.name && ENEMY_COPY[id]?.desc, `百鬼 ${id} 缺图鉴文案`);
  }
  const blessingIds = Object.keys(BLESSINGS);
  assert.equal(blessingIds.length, 18);
  for (const id of blessingIds) {
    const info = blessingInfo(id);
    const bc = describeChoice({ kind: 'blessing', id });
    assert.equal(bc.name, info.name);
    assert.ok(bc.desc.length >= 8);
    assert.ok(bc.tier === 'auspicious' || bc.tier === 'cursed');
  }
});

test('M3 键盘交互键 E / F 单次采样与失焦清空（保留空格大招与方向键）', () => {
  const prevWin = globalThis.window;
  const fakeWin = makeFakeTarget();
  globalThis.window = fakeWin;
  try {
    const el = makeFakeTarget();
    const input = createInput(el);

    fakeWin.emit('keydown', { key: 'e', repeat: false });
    const s1 = input.sample();
    assert.equal(s1.interact, true, '按下 E 应产出单次 interact=true');
    assert.equal(input.sample().interact, false, '下一帧应自动复位 interact=false');

    fakeWin.emit('keydown', { key: 'F', repeat: true });
    assert.equal(input.sample().interact, false, '长按连发 repeat 不应重复触发交互');

    fakeWin.emit('keydown', { key: 'F', repeat: false });
    input.reset();
    assert.equal(input.sample().interact, false, 'reset/失焦应清空挂起的交互输入');

    fakeWin.emit('keydown', { key: ' ', repeat: false });
    assert.equal(input.sample().ultimate, true, '空格大招保持正常');

    input.destroy();
  } finally {
    globalThis.window = prevWin;
  }
});

test('M3 图标组件在无 Canvas 的 Node 环境下安全退回文字印章', () => {
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      return { tag, className: '', style: {}, dataset: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); }, addEventListener() {} };
    },
    createTextNode(t) { return { text: t }; },
  };
  try {
    const b = icon('blessing', 'cinnabar_ink', 42, '吉', { tone: 'auspicious' });
    assert.ok(b.className.includes('icon--seal'));
    const w = icon('weapon', 'soulbanner', 44, '幡');
    assert.ok(w.className.includes('icon'));
  } finally {
    globalThis.document = prevDoc;
  }
});

test('M3 写档防护（Defect 1）：非对象入参绝不覆盖已有存档，损坏 updatedAt 与脏字段落盘前强制净水', () => {
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };

  const valid = defaultSave();
  valid.coins = 888;
  valid.unlockedHeroes = ['zhou', 'mian'];
  assert.equal(saveSave(valid, storage, 3000), true);
  const snapBefore = storage.getItem(SAVE_KEY);

  for (const bad of [null, undefined, true, false, '', '   ', [], [123], NaN, Infinity, -Infinity, 42, Symbol('x')]) {
    assert.equal(saveSave(bad, storage, 4000), false);
    assert.equal(storage.getItem(SAVE_KEY), snapBefore, '非对象写档不得覆盖既有合法存档');
  }
  assert.equal(loadSave(storage).coins, 888);

  const dirty = { coins: true, updatedAt: 'corrupt_ts', stats: { bestHit: Infinity } };
  assert.equal(saveSave(dirty, storage, 5000), true);
  assert.equal(dirty.updatedAt, 5000);
  const rawStored = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(rawStored.updatedAt, 5000);
  assert.equal(rawStored.coins, 0);
  assert.equal(rawStored.stats.bestHit, 0);

  const hugeTs = { coins: 12, updatedAt: 1.7e308 };
  assert.equal(saveSave(hugeTs, storage, NaN), true);
  assert.equal(hugeTs.updatedAt, 9e15);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).updatedAt, 9e15);
});

test('M3 云存档防护（Defect 2）：uploadNow/scheduleSync 拒绝非对象入参且 rawUpload 夹紧 updatedAt', async () => {
  let clock = 10_000;
  const mockMap = new Map();
  const mockStore = {
    getItem: (k) => (mockMap.has(k) ? mockMap.get(k) : null),
    setItem: (k, v) => mockMap.set(k, String(v)),
  };
  const cloud = createCloudSave({
    search: '?mockCloud=1',
    mockStore,
    now: () => clock,
    cooldownMs: 62_000,
    coalesceMs: 10,
  });

  try {
    for (const bad of [undefined, null, true, false, 123, '', '   ', [123], Symbol('s'), () => {}]) {
      assert.equal(cloud.scheduleSync(bad), false);
      const res = await cloud.uploadNow(bad);
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'invalid');
    }

    const r1 = await cloud.uploadNow({ coins: 260, updatedAt: 'corrupt_ts' });
    assert.equal(r1.ok, true);
    const stored1 = JSON.parse(JSON.parse(mockMap.get('wugeng.mockCloudArchive')).data);
    assert.equal(stored1.updatedAt, 10_000);
    assert.equal(stored1.coins, 260);

    clock += 70_000;
    const r2 = await cloud.uploadNow({ coins: 300, updatedAt: 1.7e308 });
    assert.equal(r2.ok, true);
    const stored2 = JSON.parse(JSON.parse(mockMap.get('wugeng.mockCloudArchive')).data);
    assert.equal(stored2.updatedAt, 9e15);
  } finally {
    cloud.destroy();
  }
});

test('M3 结算与解锁防护（Defect 3）：拒绝布尔/数组隐式转型，非对象与残缺存档零异常', () => {
  const s1 = defaultSave();
  const rBoolCoin = recordRun(s1, { coins: true });
  assert.equal(rBoolCoin.coins, 0);
  assert.equal(s1.coins, 0);

  const rArrCoin = recordRun(s1, { coins: [123], kills: [900] });
  assert.equal(rArrCoin.coins, 0);
  assert.equal(s1.coins, 0);
  assert.equal(s1.unlockedHeroes.includes('mian'), false, '[900] 不得解锁阿绵');

  const sNight = defaultSave();
  recordRun(sNight, { cleared: true, nightLevel: true });
  assert.equal(sNight.nightCleared, 0, 'nightLevel: true 不得误判为夜色一');
  assert.equal(sNight.nightUnlocked, 1);

  assert.equal(grantDoubleCoins(s1, true), 0);
  assert.equal(grantDoubleCoins(s1, [123]), 0);
  assert.equal(grantDoubleCoins(s1, '   '), 0);
  assert.equal(s1.coins, 0);

  for (const badSave of [null, undefined, true, false, 123, 'str', []]) {
    assert.deepEqual(recordRun(badSave, { coins: 50, kills: 900, cleared: true }), {
      coins: 0,
      unlocks: [],
      achievements: [],
    });
    assert.equal(grantDoubleCoins(badSave, 50), 0);
    assert.deepEqual(evaluateUnlocks(badSave, { kills: 900, cleared: true }), []);
    assert.deepEqual(heroUnlockProgress(badSave, 'mian'), { have: 0, need: 800 });
  }

  const emptySave = {};
  const rEmpty = recordRun(emptySave, { coins: 35, kills: 12 });
  assert.equal(rEmpty.coins, 35);
  assert.equal(emptySave.coins, 35);
  assert.equal(emptySave.stats.runs, 1);
  assert.equal(grantDoubleCoins(emptySave, 35), 35);
  assert.equal(emptySave.coins, 70);
  assert.equal(emptySave.stats.totalCoins, 70);

  const corruptSave = { coins: 'bad', stats: null, unlockedHeroes: 'bad', achievements: null };
  const rCorrupt = recordRun(corruptSave, { coins: 20, kills: 5 });
  assert.equal(rCorrupt.coins, 20);
  assert.equal(corruptSave.coins, 20);
  assert.equal(Number.isFinite(corruptSave.coins), true);
  assert.equal(grantDoubleCoins(corruptSave, 20), 20);
  assert.equal(corruptSave.coins, 40);
});

test('M3 更簿签到防护（Defect 4）：拦截非法日历日/越界时间戳、非对象与残缺存档及越界 rng', () => {
  const badDates = [
    '2026-02-31',
    '2026-02-29',
    '9999-99-99',
    '',
    '   ',
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    true,
    [],
    {},
    new Date('invalid'),
  ];
  for (const badNow of badDates) {
    assert.equal(localDateString(badNow), null);
    const s = defaultSave();
    const res = claimCheckin(s, badNow, false);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid_date');
    assert.equal(s.checkin.lastClaimDate, null);
  }

  for (const badSave of [null, undefined, true, false, 123, 'x', []]) {
    const st = getCheckinState(badSave, '2026-11-24');
    assert.equal(st.canClaim, false);
    const res = claimCheckin(badSave, '2026-11-24');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid_save');
  }

  const emptyObj = {};
  const rEmpty = claimCheckin(emptyObj, '2026-11-24', false, () => 0);
  assert.equal(rEmpty.ok, true);
  assert.equal(emptyObj.coins, 30);
  assert.equal(emptyObj.checkin.lastClaimDate, '2026-11-24');

  const partialCorrupt = { coins: 'bad', checkin: { cycleDay: 1, lastClaimDate: '2026-02-31' } };
  assert.equal(getCheckinState(partialCorrupt, '2026-11-24').canClaim, true);
  const rPartial = claimCheckin(partialCorrupt, '2026-11-24', true, () => -0.5);
  assert.equal(rPartial.ok, true);
  assert.equal(rPartial.charms.length, 2);
  assert.ok(rPartial.charms.every((c) => RELIC_IDS.includes(c.relicId)));

  const sRng = defaultSave();
  sRng.checkin.cycleDay = 1;
  const rNaN = claimCheckin(sRng, '2026-11-25', true, () => NaN);
  assert.equal(rNaN.ok, true);
  assert.equal(rNaN.charms.length, 2);
  assert.ok(rNaN.charms.every((c) => RELIC_IDS.includes(c.relicId)));
});

test('M3 图鉴防护（Defect 5）：ensureCodex/getCodexCounts/recordCodex* 非对象入参不崩且拒绝布尔/数组击杀数', () => {
  for (const badSave of [null, undefined, true, false, 123, 'str', []]) {
    const c = ensureCodex(badSave);
    assert.deepEqual(c, { weapons: ['gong'], evolutions: [], relics: [], enemies: {} });
    assert.equal(syncCodexFromRun(badSave, { weapons: [{ id: 'compass', evolved: true }], relics: [{ id: 'soulwick' }] }), false);
    assert.equal(recordCodexCharms(badSave, ['soulwick']), false);
    recordCodexSummary(badSave, { killsByType: { suona: 5 } });
    const counts = getCodexCounts(badSave);
    assert.equal(counts.coreTotal, 48);
    assert.equal(counts.total, 51);
  }

  const s = defaultSave();
  recordCodexSummary(s, {
    killsByType: {
      suona: true,
      paperbride: [12],
      cinder: '   ',
      shade: false,
      paperkid: 6,
    },
  });
  assert.equal(s.codex.enemies.suona, undefined);
  assert.equal(s.codex.enemies.paperbride, undefined);
  assert.equal(s.codex.enemies.cinder, undefined);
  assert.equal(s.codex.enemies.shade, undefined);
  assert.equal(s.codex.enemies.paperkid, 6);
});

function deepFreeze(val) {
  if (val === null || typeof val !== 'object') return val;
  for (const k of Reflect.ownKeys(val)) {
    deepFreeze(val[k]);
  }
  return Object.freeze(val);
}

test('M3 Iter3 Defect 1：isPlainObj 拦截 Date/RegExp/Map/Set/Error/TypedArray/包装原始值，绝不覆盖本地或云端存档', async () => {
  assert.equal(isPlainObj({}), true);
  assert.equal(isPlainObj(Object.create(null)), true);

  const nonPlainBuiltins = [
    new Date(),
    /abc/,
    new Map(),
    new Set(),
    new Number(10),
    new String('hi'),
    new Boolean(true),
    new Error('err'),
    new Uint8Array(4),
  ];

  const localMap = new Map();
  const storage = {
    getItem: (k) => (localMap.has(k) ? localMap.get(k) : null),
    setItem: (k, v) => localMap.set(k, String(v)),
  };
  const validLocal = defaultSave();
  validLocal.coins = 999;
  assert.equal(saveSave(validLocal, storage, 1000), true);
  const localSnap = storage.getItem(SAVE_KEY);

  let clock = 20_000;
  const mockCloudMap = new Map();
  const mockStore = {
    getItem: (k) => (mockCloudMap.has(k) ? mockCloudMap.get(k) : null),
    setItem: (k, v) => mockCloudMap.set(k, String(v)),
  };
  const cloud = createCloudSave({
    search: '?mockCloud=1',
    mockStore,
    now: () => clock,
    cooldownMs: 62_000,
    coalesceMs: 10,
  });

  try {
    const seedUp = await cloud.uploadNow(validLocal);
    assert.equal(seedUp.ok, true);
    const cloudSnap = mockCloudMap.get('wugeng.mockCloudArchive');
    clock += 70_000;

    for (const bad of nonPlainBuiltins) {
      assert.equal(isPlainObj(bad), false);
      assert.equal(saveSave(bad, storage, 5000), false);
      assert.equal(storage.getItem(SAVE_KEY), localSnap, 'saveSave 不得用内建非纯对象覆盖本地存档');
      assert.equal(cloud.scheduleSync(bad), false);
      const up = await cloud.uploadNow(bad);
      assert.equal(up.ok, false);
      assert.equal(up.reason, 'invalid');
      assert.equal(mockCloudMap.get('wugeng.mockCloudArchive'), cloudSnap, 'uploadNow 不得用内建非纯对象覆盖云端存档');
    }
    assert.equal(loadSave(storage).coins, 999);
  } finally {
    cloud.destroy();
  }
});

test('M3 Iter3 Defect 2：冻结对象（Object.freeze / deepFreeze / 冻结子容器）全链路零 TypeError 且零半截扣改', () => {
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };

  // saveSave on frozen defaultSave() and frozen {}
  const frozenDef = Object.freeze(defaultSave());
  assert.equal(saveSave(frozenDef, storage, 9000), true);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).updatedAt, 9000);

  const frozenEmpty = Object.freeze({});
  assert.equal(saveSave(frozenEmpty, storage, 9500), true);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).updatedAt, 9500);

  // markAchievement on frozen objects & frozen achievements sub-object
  assert.equal(markAchievement(Object.freeze({}), 'firstClear', 100), false);
  assert.equal(markAchievement(deepFreeze(defaultSave()), 'firstClear', 100), false);
  const sFrozenAch = defaultSave();
  Object.freeze(sFrozenAch.achievements);
  assert.equal(markAchievement(sFrozenAch, 'firstClear', 100), false);

  // codex on frozen saves & frozen codex sub-objects
  assert.deepEqual(ensureCodex(Object.freeze({})), { weapons: ['gong'], evolutions: [], relics: [], enemies: {} });
  assert.equal(getCodexCounts(Object.freeze({})).coreTotal, 48);
  assert.equal(getCodexCounts(Object.freeze({ codex: Object.freeze({}) })).coreTotal, 48);

  const deepFrozen = deepFreeze(defaultSave());
  assert.equal(syncCodexFromRun(deepFrozen, { weapons: [{ id: 'compass', evolved: true }], relics: [{ id: 'soulwick' }] }), false);
  assert.equal(recordCodexCharms(deepFrozen, ['soulwick']), false);
  assert.equal(recordCodexSummary(deepFrozen, { weapons: [{ id: 'compass', evolved: true }], killsByType: { suona: 5 } }), false);

  // unlocks on deepFreeze(defaultSave()) & partially frozen sub-containers
  assert.deepEqual(evaluateUnlocks(deepFrozen, { kills: 900, cleared: true, nightLevel: 0 }), []);
  assert.deepEqual(recordRun(deepFrozen, { coins: 100, kills: 900, cleared: true }), {
    coins: 0,
    unlocks: [],
    achievements: [],
  });
  assert.equal(grantDoubleCoins(deepFrozen, 100), 0);

  const sFrozenStats = defaultSave();
  Object.freeze(sFrozenStats.stats);
  assert.deepEqual(recordRun(sFrozenStats, { coins: 100, kills: 900, cleared: true }), {
    coins: 0,
    unlocks: [],
    achievements: [],
  });
  assert.equal(sFrozenStats.coins, 0, 'stats 冻结时不得先半截加铜钱');
  assert.equal(grantDoubleCoins(sFrozenStats, 100), 0);
  assert.equal(sFrozenStats.coins, 0);

  // checkin on deepFreeze(defaultSave()) & frozen save.checkin / charms / cosmetics
  const rDeepCk = claimCheckin(deepFrozen, '2026-11-24');
  assert.equal(rDeepCk.ok, false);
  assert.equal(rDeepCk.reason, 'invalid_save');

  const sFrozenCk = defaultSave();
  Object.freeze(sFrozenCk.checkin);
  const rFrozenCk = claimCheckin(sFrozenCk, '2026-11-24');
  assert.equal(rFrozenCk.ok, false);
  assert.equal(rFrozenCk.reason, 'invalid_save');
  assert.equal(sFrozenCk.coins, 0, 'save.checkin 冻结时绝不可先把 30 铜钱加进 save.coins');

  const sFrozenCharms = defaultSave();
  sFrozenCharms.checkin.cycleDay = 1;
  Object.freeze(sFrozenCharms.charms);
  const rFrozenCh = claimCheckin(sFrozenCharms, '2026-11-24');
  assert.equal(rFrozenCh.ok, false);
  assert.equal(rFrozenCh.reason, 'invalid_save');
  assert.equal(sFrozenCharms.coins, 0);
});

test('M3 Iter3 Defect 3：更房 Shop 防护 null/undefined/缺 shop/冻结 shop/BigInt/Symbol 且拒绝布尔与数组转型', () => {
  assert.deepEqual(Shop.buyLevel(null, 'tizhi'), { ok: false, reason: 'invalid', cost: null, level: 0 });
  assert.deepEqual(Shop.buyLevel(undefined, 'tizhi'), { ok: false, reason: 'invalid', cost: null, level: 0 });

  // 缺失 save.shop 时自动初始化并正常购买
  const coinsNoShop = { coins: 500 };
  const rNoShop = Shop.buyLevel(coinsNoShop, 'tizhi');
  assert.deepEqual(rNoShop, { ok: true, cost: 60, level: 1 });
  assert.equal(coinsNoShop.coins, 440);
  assert.equal(coinsNoShop.shop.tizhi, 1);

  // save.shop 冻结时绝不先扣钱再抛错
  const frozenShop = { coins: 500, shop: Object.freeze({ tizhi: 0 }) };
  const rFrozenShop = Shop.buyLevel(frozenShop, 'tizhi');
  assert.deepEqual(rFrozenShop, { ok: false, reason: 'invalid', cost: null, level: 0 });
  assert.equal(frozenShop.coins, 500);

  // BigInt coins 与 BigInt level 零异常
  const bigintCoins = { coins: 100n, shop: {} };
  assert.deepEqual(Shop.buyLevel(bigintCoins, 'tizhi'), { ok: false, reason: 'coins', cost: 60, level: 0 });
  assert.equal(bigintCoins.coins, 100n);

  const bigintLevel = { coins: 500, shop: { tizhi: 2n } };
  assert.equal(Shop.getLevel(bigintLevel, 'tizhi'), 0);
  assert.equal(Shop.nextCost(bigintLevel, 'tizhi'), 60);
  assert.equal(Shop.getMetaBonuses(bigintLevel).maxHpPct, 0);
  assert.equal(Shop.shopProgress(bigintLevel), 0);
  assert.deepEqual(Shop.buyLevel(bigintLevel, 'tizhi'), { ok: true, cost: 60, level: 1 });
  assert.equal(bigintLevel.coins, 440);
  assert.equal(bigintLevel.shop.tizhi, 1);

  // Symbol level 零异常
  const symLevel = { coins: 500, shop: { tizhi: Symbol('lv') } };
  assert.equal(Shop.getLevel(symLevel, 'tizhi'), 0);
  assert.equal(Shop.nextCost(symLevel, 'tizhi'), 60);
  assert.equal(Shop.getMetaBonuses(symLevel).maxHpPct, 0);
  assert.equal(Shop.shopProgress(symLevel), 0);
  assert.deepEqual(Shop.buyLevel(symLevel, 'tizhi'), { ok: true, cost: 60, level: 1 });
  assert.equal(symLevel.coins, 440);
  assert.equal(symLevel.shop.tizhi, 1);

  // 拒绝布尔值与数组隐式转数字
  assert.equal(Shop.getLevel({ shop: { tizhi: true } }, 'tizhi'), 0);
  assert.equal(Shop.getLevel({ shop: { tizhi: [3] } }, 'tizhi'), 0);
  const arrCoins = { coins: [500], shop: { tizhi: 0 } };
  assert.deepEqual(Shop.buyLevel(arrCoins, 'tizhi'), { ok: false, reason: 'coins', cost: 60, level: 0 });
  assert.equal(arrCoins.shop.tizhi, 0);
});

test('M3 Iter3 Defect 4：cloud.pullFromCloud 有远端存档分支对非有限/负数/超大 nowFn() 强制夹紧 lastSyncAt', async () => {
  let clock = 5000;
  const mockMap = new Map();
  const mockStore = {
    getItem: (k) => (mockMap.has(k) ? mockMap.get(k) : null),
    setItem: (k, v) => mockMap.set(k, String(v)),
  };
  const cloud = createCloudSave({
    search: '?mockCloud=1',
    mockStore,
    now: () => clock,
    cooldownMs: 62_000,
    coalesceMs: 10,
  });

  try {
    const seed = defaultSave();
    seed.coins = 360;
    const up = await cloud.uploadNow(seed);
    assert.equal(up.ok, true);

    for (const [badClock, expectedTs] of [[Infinity, 0], [NaN, 0], [-100, 0], [1.7e308, 9e15]]) {
      clock = badClock;
      const pulled = await cloud.pullFromCloud(defaultSave());
      assert.equal(pulled.ok, true);
      assert.equal(pulled.hasRemote, true);
      const st = cloud.getState();
      assert.equal(st.lastSyncAt, expectedTs);
      assert.equal(JSON.parse(JSON.stringify(st)).lastSyncAt, expectedTs);
    }
  } finally {
    cloud.destroy();
  }
});


