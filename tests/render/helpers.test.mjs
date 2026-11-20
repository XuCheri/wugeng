// 渲染层纯函数测试：中文大数格式化、伤害数字合并、计时器格式
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCN, mergeHit, pruneTexts, visibleFor, MERGE_WINDOW, LIFE_NORMAL, LIFE_CRIT } from '../../src/render/damage-text.js';
import { formatClock, watchLabel } from '../../src/render/hud.js';

test('formatCN：小于一万原样输出', () => {
  assert.equal(formatCN(0), '0');
  assert.equal(formatCN(7), '7');
  assert.equal(formatCN(9999), '9999');
  assert.equal(formatCN(12.6), '13');
  assert.equal(formatCN(-5), '0');
  assert.equal(formatCN(NaN), '0');
});

test('formatCN：万 / 亿 / 万亿，一位小数向下取整', () => {
  assert.equal(formatCN(10000), '1万');
  assert.equal(formatCN(12000), '1.2万');
  assert.equal(formatCN(12999), '1.2万');
  assert.equal(formatCN(99999), '9.9万');
  assert.equal(formatCN(123456), '12.3万');
  assert.equal(formatCN(1234567), '123万');
  assert.equal(formatCN(1e8), '1亿');
  assert.equal(formatCN(3.4e8), '3.4亿');
  assert.equal(formatCN(3.49e8), '3.4亿');
  assert.equal(formatCN(56e8), '56亿');
  assert.equal(formatCN(1.5e12), '1.5万亿');
});

test('mergeHit：同一敌人 0.25 秒内合并', () => {
  const list = [];
  mergeHit(list, { enemyId: 1, x: 0, y: 0, amount: 10, crit: false }, 0);
  mergeHit(list, { enemyId: 1, x: 5, y: 6, amount: 7, crit: false }, 0.1);
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 17);
  assert.equal(list[0].hits, 2);
  assert.equal(list[0].x, 5);
  // 超出窗口（从首次出现起算）→ 新条目
  mergeHit(list, { enemyId: 1, x: 0, y: 0, amount: 3, crit: false }, MERGE_WINDOW + 0.01);
  assert.equal(list.length, 2);
});

test('mergeHit：不同敌人、暴击与非暴击分开；无 enemyId 不合并', () => {
  const list = [];
  mergeHit(list, { enemyId: 1, x: 0, y: 0, amount: 10, crit: false }, 0);
  mergeHit(list, { enemyId: 2, x: 0, y: 0, amount: 10, crit: false }, 0.05);
  mergeHit(list, { enemyId: 1, x: 0, y: 0, amount: 40, crit: true }, 0.06);
  mergeHit(list, { enemyId: 1, x: 0, y: 0, amount: 30, crit: true }, 0.08);
  mergeHit(list, { x: 0, y: 0, amount: 5, crit: false }, 0.09);
  mergeHit(list, { x: 0, y: 0, amount: 5, crit: false }, 0.1);
  assert.equal(list.length, 5);
  const crit = list.find((e) => e.crit);
  assert.equal(crit.amount, 70);
});

test('pruneTexts：按最后一次命中计算寿命', () => {
  const list = [];
  mergeHit(list, { enemyId: 1, x: 0, y: 0, amount: 1, crit: false }, 0);
  mergeHit(list, { enemyId: 2, x: 0, y: 0, amount: 1, crit: true }, 0);
  pruneTexts(list, LIFE_NORMAL + 0.01);
  assert.equal(list.length, 1);
  assert.equal(list[0].crit, true);
  pruneTexts(list, LIFE_CRIT + 0.01);
  assert.equal(list.length, 0);
});

test('visibleFor：设置三档', () => {
  const n = { crit: false };
  const c = { crit: true };
  assert.equal(visibleFor(n, 'all'), true);
  assert.equal(visibleFor(n, 'crit'), false);
  assert.equal(visibleFor(c, 'crit'), true);
  assert.equal(visibleFor(c, 'off'), false);
});

test('formatClock / watchLabel', () => {
  assert.equal(formatClock(312), '05:12');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(1520.9), '25:20');
  assert.equal(watchLabel({ mode: 'main', watch: 3 }), '三更');
  assert.equal(watchLabel({ mode: 'main', watch: 6 }), '天亮');
  assert.equal(watchLabel({ mode: 'endless', watch: 6 }), '无尽');
});
