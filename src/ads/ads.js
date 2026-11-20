// 激励视频广告（TapTap H5）。沿用《末班货车》已验证的接口约定：
// - tap.createRewardedVideoAd({ adUnitId })；show() 失败时只 load() 重试一次
// - 只有 onClose 且 isEnded === true 才算看完（'completed'）
// - onError / 加载超时 → 'unavailable'；同一时间只允许一个请求
// - 结束后 offClose / offError / destroy 清理
// 调试：URL 带 ?mockAds=1（看完）/ mockAds=skip（中途关闭）/ mockAds=fail（失败）走页面内模拟广告。
import { ADS_CONFIG } from './ads-config.js';

export const LOAD_TIMEOUT_MS = 10_000;
export const CLOSE_TIMEOUT_MS = 5 * 60_000;
export const PLACEMENTS = ['reroll', 'revive', 'resultDouble', 'checkinDouble'];

/** 从 URL 查询串解析模拟模式：'complete' | 'skip' | 'fail' | null */
export function parseMockMode(search) {
  if (typeof search !== 'string' || !search) return null;
  let v;
  try { v = new URLSearchParams(search).get('mockAds'); } catch { return null; }
  if (v === null) return null;
  if (v === 'skip') return 'skip';
  if (v === 'fail') return 'fail';
  if (v === '0' || v === 'off') return null;
  return 'complete';
}

/** 页面内的假广告：3 秒倒计时后自动「看完」，可提前关闭（= 中途关闭）。 */
function defaultMockOverlay(mode, placement, doc) {
  return new Promise((resolve) => {
    if (!doc?.body) { resolve(mode === 'fail' ? 'unavailable' : mode === 'skip' ? 'skipped' : 'completed'); return; }
    if (mode === 'fail') { setTimeout(() => resolve('unavailable'), 400); return; }
    const box = doc.createElement('div');
    box.className = 'mock-ad';
    box.setAttribute('role', 'dialog');
    box.innerHTML = `
      <div class="mock-ad__frame">
        <div class="mock-ad__tag">广告 · 模拟</div>
        <div class="mock-ad__body">此处播放激励视频<br><small>${placement}</small></div>
        <div class="mock-ad__count"></div>
        <button type="button" class="mock-ad__close">关闭</button>
      </div>`;
    doc.body.appendChild(box);
    const countEl = box.querySelector('.mock-ad__count');
    let left = mode === 'skip' ? 1.5 : 3;
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearInterval(tick);
      box.remove();
      resolve(r);
    };
    const render = () => { countEl.textContent = `${Math.ceil(left)} 秒`; };
    render();
    const tick = setInterval(() => {
      left -= 0.25;
      if (left <= 0) finish(mode === 'skip' ? 'skipped' : 'completed');
      else render();
    }, 250);
    box.querySelector('.mock-ad__close').addEventListener('click', () => finish('skipped'));
  });
}

/**
 * 工厂：便于在 Node 测试里注入假的 window / 配置 / 超时。
 * @param {{ win?: any, config?: {rewardedAdUnitId:string}, search?: string,
 *           loadTimeoutMs?: number, closeTimeoutMs?: number, mockOverlay?: Function }} opts
 */
export function createAds(opts = {}) {
  const getWin = () => opts.win ?? globalThis.window;
  const config = opts.config ?? ADS_CONFIG;
  const loadTimeoutMs = opts.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  const closeTimeoutMs = opts.closeTimeoutMs ?? CLOSE_TIMEOUT_MS;
  const mockOverlay = opts.mockOverlay ?? defaultMockOverlay;
  let activeRequest = null;

  const mockMode = () => parseMockMode(opts.search ?? getWin()?.location?.search ?? '');
  const getAdUnitId = () => {
    const id = config?.rewardedAdUnitId;
    return typeof id === 'string' ? id.trim() : '';
  };
  const hasSdk = () => typeof getWin()?.tap?.createRewardedVideoAd === 'function';

  /** 入口是否显示：模拟模式，或（有广告位 ID 且宿主提供 SDK）。 */
  function adsEnabled() {
    if (mockMode()) return true;
    return Boolean(getAdUnitId()) && hasSdk();
  }

  function isBusy() { return activeRequest !== null; }

  function watchAd(placement = 'reroll') {
    if (activeRequest) return Promise.resolve('unavailable');
    const mode = mockMode();
    if (mode) {
      const request = {};
      activeRequest = request;
      return Promise.resolve()
        .then(() => mockOverlay(mode, placement, getWin()?.document))
        .catch(() => 'unavailable')
        .then((r) => { if (activeRequest === request) activeRequest = null; return r; });
    }
    if (!getAdUnitId() || !hasSdk()) return Promise.resolve('unavailable');

    return new Promise((resolve) => {
      const request = {};
      activeRequest = request;
      const win = getWin();
      let ad = null;
      let timer = null;
      let showing = false;

      function finish(result) {
        if (activeRequest !== request) return;
        // 解绑或销毁时，某些宿主会同步再触发一次事件，先清掉 activeRequest 防重入。
        activeRequest = null;
        clearTimeout(timer);
        try { ad?.offClose?.(onClose); } catch {}
        try { ad?.offError?.(onError); } catch {}
        try { ad?.destroy?.(); } catch {}
        resolve(result);
      }
      function onClose(event) {
        if (showing) finish(event?.isEnded === true ? 'completed' : 'skipped');
      }
      function onError() { finish('unavailable'); }
      function setDeadline(ms) {
        clearTimeout(timer);
        timer = setTimeout(onError, ms);
      }

      (async () => {
        try {
          ad = win.tap.createRewardedVideoAd({ adUnitId: getAdUnitId() });
          ad.onClose?.(onClose);
          ad.onError?.(onError);
          if (activeRequest !== request) return;
          setDeadline(loadTimeoutMs);
          showing = true;
          try {
            await ad.show();
          } catch {
            if (activeRequest !== request) return;
            // 素材未就绪：只加载并重试一次。
            showing = false;
            await ad.load();
            if (activeRequest !== request) return;
            showing = true;
            await ad.show();
          }
          if (activeRequest === request) setDeadline(closeTimeoutMs);
        } catch {
          finish('unavailable');
        }
      })();
    });
  }

  return { adsEnabled, watchAd, isBusy };
}

const defaultAds = createAds();
export const adsEnabled = () => defaultAds.adsEnabled();
export const watchAd = (placement) => defaultAds.watchAd(placement);
export const adBusy = () => defaultAds.isBusy();
