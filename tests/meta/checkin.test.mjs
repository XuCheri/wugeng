import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, RELIC_IDS } from '../../src/meta/save.js';
import { getCheckinState, claimCheckin, localDateString, CHECKIN_TABLE, DAY7_DOUBLE_BONUS, COSMETICS } from '../../src/meta/checkin.js';

const day = (d, h = 10) => new Date(2026, 10, d, h, 0, 0); // 2026-11-d 本地时间
const rng0 = () => 0;

test('本地日期字符串', () => {
  assert.equal(localDateString(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDateString(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('新存档：第 1 天可领', () => {
  const st = getCheckinState(defaultSave(), day(20));
  assert.equal(st.day, 1);
  assert.equal(st.canClaim, true);
  assert.equal(st.rewards.length, 7);
  assert.equal(st.rewards[0].current, true);
});

test('同一天只能领一次（跨午夜前不行，过午夜可以）', () => {
  const s = defaultSave();
  const r = claimCheckin(s, day(20, 9), false, rng0);
  assert.equal(r.ok, true);
  assert.equal(r.day, 1);
  assert.equal(r.coins, CHECKIN_TABLE[0].coins);
  assert.equal(s.coins, CHECKIN_TABLE[0].coins);
  assert.equal(getCheckinState(s, day(20, 23)).canClaim, false);
  assert.equal(claimCheckin(s, day(20, 23)).reason, 'claimed');
  const st = getCheckinState(s, new Date(2026, 10, 21, 0, 0, 1));
  assert.equal(st.canClaim, true);
  assert.equal(st.day, 2);
});

test('断签不重置：隔几天再来接着领下一格', () => {
  const s = defaultSave();
  claimCheckin(s, day(1), false, rng0);
  claimCheckin(s, day(2), false, rng0);
  const st = getCheckinState(s, day(9));
  assert.equal(st.day, 3);
  assert.equal(st.canClaim, true);
  const r = claimCheckin(s, day(9), false, rng0);
  assert.equal(r.day, 3);
});

test('7 天一轮：第 7 天给外观，然后回到第 1 天', () => {
  const s = defaultSave();
  let total = 0;
  for (let i = 1; i <= 6; i++) total += claimCheckin(s, day(i), false, rng0).coins;
  assert.equal(total, 30 + 40 + 50 + 60 + 70 + 80);
  assert.equal(s.charms.length, 3, '第 2/4/6 天各一枚护身符');
  assert.ok(s.charms.every((c) => typeof c.relicId === 'string'));
  const r7 = claimCheckin(s, day(7), false, rng0);
  assert.equal(r7.day, 7);
  assert.equal(r7.coins, 0);
  assert.ok(r7.cosmetic);
  assert.equal(r7.cosmetic.kind, 'lantern');
  assert.ok(s.cosmetics.owned.includes(r7.cosmetic.id));
  assert.equal(s.cosmetics.equipped.lantern, r7.cosmetic.id, '首件自动装备');
  assert.equal(s.checkin.cycleDay, 0);
  assert.equal(s.checkin.cycles, 1);
  assert.equal(getCheckinState(s, day(8)).day, 1);
  // 第二轮第 7 天给衣裳
  for (let i = 8; i <= 13; i++) claimCheckin(s, day(i), false, rng0);
  const r14 = claimCheckin(s, day(14), false, rng0);
  assert.equal(r14.cosmetic.kind, 'outfit');
});

test('双倍：铜钱和护身符 ×2', () => {
  const s = defaultSave();
  claimCheckin(s, day(1), false, rng0);
  const r = claimCheckin(s, day(2), true, rng0);
  assert.equal(r.doubled, true);
  assert.equal(r.coins, 80);
  assert.equal(r.charms.length, 2);
  assert.equal(s.coins, 30 + 80);
});

test('第 7 天双倍：外观照给 + 补一份第 6 天铜钱', () => {
  const s = defaultSave();
  for (let i = 1; i <= 6; i++) claimCheckin(s, day(i), false, rng0);
  const before = s.coins;
  const r = claimCheckin(s, day(7), true, rng0);
  assert.ok(r.cosmetic);
  assert.equal(r.coins, DAY7_DOUBLE_BONUS);
  assert.equal(DAY7_DOUBLE_BONUS, CHECKIN_TABLE[5].coins);
  assert.equal(s.coins - before, DAY7_DOUBLE_BONUS);
});

test('外观集齐后第 7 天改发铜钱', () => {
  const s = defaultSave();
  s.cosmetics.owned = COSMETICS.map((c) => c.id);
  s.checkin.cycleDay = 6;
  const r = claimCheckin(s, day(3), false, rng0);
  assert.equal(r.cosmetic, null);
  assert.ok(r.coins > 0);
});

test('防回拨：本地时间早于上次领取日不能领', () => {
  const s = defaultSave();
  claimCheckin(s, day(20), false, rng0);
  const st = getCheckinState(s, day(18));
  assert.equal(st.canClaim, false);
  assert.equal(st.rollback, true);
  const r = claimCheckin(s, day(18), true, rng0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rollback');
  assert.equal(s.coins, 30);
  assert.equal(s.checkin.lastClaimDate, '2026-11-20');
  // 时间改回来后照常
  assert.equal(getCheckinState(s, day(21)).canClaim, true);
});

test('跨年和跨月按日历日比较', () => {
  const s = defaultSave();
  claimCheckin(s, new Date(2026, 11, 31, 22), false, rng0);
  assert.equal(getCheckinState(s, new Date(2027, 0, 1, 1)).canClaim, true);
});

test('护身符随机取自法器列表', () => {
  const s = defaultSave();
  s.checkin.cycleDay = 1;
  const r = claimCheckin(s, day(1), false, () => 0.999);
  assert.equal(r.charms[0].relicId, RELIC_IDS[RELIC_IDS.length - 1]);
});
