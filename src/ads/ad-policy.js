// 广告入口可见性：纯函数（ARCHITECTURE §7、PLAN §5）。不碰 DOM，Node 下可测。

export const AD_GRACE_SEC = 60;       // 每局前 60 秒不显示任何广告入口
export const DEFAULT_AD_GRANT_MAX = 2;

/** 局内通用前提：广告开启、有对局、已过 60 秒。 */
export function inRunAdsAllowed(adsOn, run) {
  return !!adsOn && !!run && (run.time || 0) >= AD_GRACE_SEC;
}

/** 换签广告：免费和已得的广告刷新都用完了，且本局广告次数未到上限。 */
export function canShowRerollAd(adsOn, run) {
  if (!inRunAdsAllowed(adsOn, run)) return false;
  const r = run.rerolls || {};
  const left = (r.free || 0) + (r.ad || 0);
  const max = Number.isFinite(r.adGrantMax) ? r.adGrantMax : DEFAULT_AD_GRANT_MAX;
  return left <= 0 && (r.adGrants || 0) < max;
}

/** 复活广告：主线 1 次、无尽再 1 次。 */
export function canShowReviveAd(adsOn, run) {
  if (!inRunAdsAllowed(adsOn, run)) return false;
  const rv = run.revives || {};
  return run.mode === 'endless' ? !rv.endlessUsed : !rv.mainUsed;
}

/** 结算翻倍：每次结算 1 次，本局有铜钱，且本局打满 60 秒。 */
export function canShowResultDouble(adsOn, summary, alreadyDoubled) {
  return !!adsOn && !!summary && !alreadyDoubled
    && (summary.coins || 0) > 0 && (summary.timeSec || 0) >= AD_GRACE_SEC;
}

/** 更簿双倍：今天还能领时显示（领过即当天用完）。 */
export function canShowCheckinDouble(adsOn, checkinState) {
  return !!adsOn && !!checkinState?.canClaim;
}

/** 广告结果 → 提示文案（completed 返回 null，由调用方发奖励）。 */
export function adResultMessage(result) {
  if (result === 'completed') return null;
  if (result === 'skipped') return '看完才能领取奖励';
  return '广告暂时不可用';
}
