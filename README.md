# 五更天

纸墨版画风的竖屏类幸存者肉鸽 H5 小游戏（TapTap）。你是青石镇的打更人，提一盏灯笼，从一更守到五更，等鸡鸣天亮。

- 设计与数值：[docs/PLAN.md](docs/PLAN.md)
- 模块契约：[ARCHITECTURE.md](ARCHITECTURE.md)

## 本地运行

零构建，原生 ES Modules，需要通过 HTTP 访问（`file://` 不支持 ESM）：

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/            正式游戏
# 打开 http://localhost:8080/?mockAds=1  模拟广告流程
# 打开 http://localhost:8080/style-lab.html  美术样张
```

## 测试

```bash
npm test                          # node --test 单元测试
node tools/simulate.mjs --runs 300 --meta 0   # 平衡模拟器
npm run e2e                       # Playwright 冒烟（需要 chromium）
```

## 打包上传 TapTap

```bash
python3 tools/package_h5.py       # 输出 dist/wugeng-h5.zip
```

广告位 ID 在 `src/ads/ads-config.js`，留空时游戏内不显示任何广告入口（ICP 核准前使用）。

## 授权

代码版权归作者所有。字体「霞鹜文楷」使用 SIL Open Font License 1.1，见 `assets/fonts/OFL.txt`。
