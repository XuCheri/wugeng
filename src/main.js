// 入口：开屏动画与主应用并行加载；确保 .screen--title 挂载时 window.__wugeng 已完整就绪。
// 不使用顶层 await，兼容较旧的 Android WebView。
import { runBootIntro } from './ui/boot-intro.js';

const boot = document.getElementById('boot');
boot?.remove();

const introPromise = runBootIntro({ getAudio: () => window.__wugeng?.audio || null });
const appModulePromise = import('./app.js');

Promise.all([introPromise, appModulePromise])
  .then(([, { startApp }]) => startApp({ skipBootIntro: true }))
  .catch((err) => {
    console.error(err);
    if (boot) boot.textContent = '灯灭了，请重新进入（' + (err?.message || err) + '）';
  });
