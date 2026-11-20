// 入口：只负责启动应用，并把启动期错误显示出来，避免真机白屏无从排查。
// 不使用顶层 await，兼容较旧的 Android WebView。
import { startApp } from './app.js';

const boot = document.getElementById('boot');

Promise.resolve()
  .then(() => startApp())
  .then(() => boot?.remove())
  .catch((err) => {
    console.error(err);
    if (boot) boot.textContent = '灯灭了，请重新进入（' + (err?.message || err) + '）';
  });
