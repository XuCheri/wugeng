// 守夜令当期配置表（v4 M3.3）：
// - 四周一期，换期只需在 SEASONS 追加新条目，零代码逻辑改动；
// - 30 档全部免费，每 5 档含专属名号或提灯/夜袍礼，第 30 档授予当期限定皮肤。

export const SEASONS = [
  {
    id: 's1',
    name: '血月',
    subtitle: '赤月照街 · 百祟疾行',
    start: '2026-12-01',
    weeks: 4,
    rule: {
      id: 'blood_moon',
      name: '血月守夜',
      desc: '邪祟移速 +12%，魂火经验 +15%，守夜令积分系数 +15%',
      enemySpeedPct: 0.12,
      soulFirePct: 0.15,
      scoreMul: 1.15,
    },
    passTiers: 30,
    xpPerTier: 100,
    finalReward: { type: 'skin', id: 'zhou_bloodmoon', name: '老周·血月' },
  },
];

export const SEASONS_BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

export const SEASON_TITLES = {
  title_night_patrol: { id: 'title_night_patrol', name: '夜巡执更' },
  title_cinnabar_judge: { id: 'title_cinnabar_judge', name: '朱砂判官' },
  title_bloodmoon_marshal: { id: 'title_bloodmoon_marshal', name: '血月掌灯使' },
};

export const SEASON_TITLE_IDS = Object.keys(SEASON_TITLES);

/**
 * 生成指定守夜令的 1..30 档免费奖励表。
 */
export function buildSeasonPassTable(season = SEASONS[0]) {
  const total = Math.max(1, Number(season?.passTiers) || 30);
  const rows = [];
  for (let tier = 1; tier <= total; tier++) {
    if (tier === total && season?.finalReward) {
      rows.push({
        tier,
        milestone: true,
        type: season.finalReward.type,
        id: season.finalReward.id,
        name: season.finalReward.name || '当期限定衣冠',
        coins: 0,
        charms: 0,
      });
      continue;
    }
    if (tier === 5) {
      rows.push({ tier, milestone: true, type: 'title', id: 'title_night_patrol', name: '名号·夜巡执更', coins: 60, charms: 0 });
      continue;
    }
    if (tier === 10) {
      rows.push({ tier, milestone: true, type: 'cosmetic', prefer: 'lantern', name: '提灯宝匣', coins: 60, charms: 0 });
      continue;
    }
    if (tier === 15) {
      rows.push({ tier, milestone: true, type: 'title', id: 'title_cinnabar_judge', name: '名号·朱砂判官', coins: 80, charms: 0 });
      continue;
    }
    if (tier === 20) {
      rows.push({ tier, milestone: true, type: 'cosmetic', prefer: 'outfit', name: '夜行衣匣', coins: 80, charms: 0 });
      continue;
    }
    if (tier === 25) {
      rows.push({ tier, milestone: true, type: 'title', id: 'title_bloodmoon_marshal', name: '名号·血月掌灯使', coins: 120, charms: 0 });
      continue;
    }
    const charms = tier % 3 === 0 ? 1 : 0;
    const coins = 40 + Math.floor((tier - 1) / 5) * 15 + (charms ? 0 : 15);
    rows.push({
      tier,
      milestone: false,
      type: charms ? 'charm_coins' : 'coins',
      name: charms ? `铜钱 ${coins} · 护身符` : `铜钱 ${coins}`,
      coins,
      charms,
    });
  }
  return rows;
}
