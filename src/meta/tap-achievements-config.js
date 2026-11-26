// TapTap 小游戏成就系统配置表（MiniApp ID: tapmcascfycedoqs01）
// 规则：成就 ID 仅限英文字母与数字（<= 40 字符），与本地 22 项守夜功绩 ID 一一对应；
// 全部采用标准直达解锁（stepped: false），由本地与云存档统一核算进度并在达成时解锁。

import { ACHIEVEMENTS } from './achievements.js';

export const TAP_ACHIEVEMENT_ID_RE = /^[A-Za-z0-9]{1,40}$/;

export function isValidTapAchievementId(id) {
  return typeof id === 'string' && TAP_ACHIEVEMENT_ID_RE.test(id);
}

export const TAP_ACHIEVEMENT_SPECS = ACHIEVEMENTS.map((a, index) => ({
  order: index + 1,
  id: a.id,
  tapId: a.id,
  name: a.name,
  desc: a.desc,
  category: a.category,
  target: a.target,
  stepped: false,
  hidden: false,
}));

export const TAP_ACHIEVEMENT_BY_ID = Object.fromEntries(
  TAP_ACHIEVEMENT_SPECS.map((spec) => [spec.id, spec]),
);

export const TAP_ACHIEVEMENT_ID_MAP = Object.fromEntries(
  TAP_ACHIEVEMENT_SPECS.map((spec) => [spec.id, spec.tapId]),
);

export function resolveTapAchievementId(achId) {
  if (typeof achId !== 'string' || !achId) return null;
  const mapped = Object.hasOwn(TAP_ACHIEVEMENT_ID_MAP, achId)
    ? TAP_ACHIEVEMENT_ID_MAP[achId]
    : achId;
  return isValidTapAchievementId(mapped) ? mapped : null;
}
