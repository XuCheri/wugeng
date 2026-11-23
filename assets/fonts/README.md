# 字体：霞鹜文楷子集

- 字体：**霞鹜文楷 LXGW WenKai Regular**（v1.530），作者 LXGW，SIL Open Font License 1.1，许可证全文见 [OFL.txt](OFL.txt)。
- 来源：<https://github.com/lxgw/LxgwWenKai/releases>（`LXGWWenKai-Regular.ttf`，约 25 MB，**不入库**）。
- 产物：`wenkai-subset.woff2`（只含游戏用到的字 + 约 600 个常用字缓冲，目标 < 400 KB，当前约 371 KB）。
- 在 `styles.css` 中以 `font-family: "WenKai"` 注册，`font-display: swap`，回落 `'Songti SC', 'STSong', serif`。
- 按 OFL 附加条款，子集化 / 转 WOFF2 仅用于网页内嵌，不作为可安装字体分发。

## 重新生成（改了文案之后、打包之前必须跑一遍）

在仓库根目录执行（需要 Python 3；`fonttools` + `brotli` 装在仓库的 `.venv` 里）：

```bash
# 0) 没有 .venv 时先建：
python3 -m venv .venv && .venv/bin/pip install fonttools brotli

# 1) 下载原字体到独立缓存目录（不要放进仓库）
WENKAI_TMP="${TMPDIR:-$HOME/.cache}/wenkai"
mkdir -p "$WENKAI_TMP"
curl -L -o "$WENKAI_TMP/LXGWWenKai-Regular.ttf" \
  https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf

# 2) 收集字符：src/**/*.js、根目录 *.html、根目录 *.css（styles.css）、docs/PLAN.md、
#    ARCHITECTURE.md、ASCII、中文标点与界面符号区段（°、±、①-⑳、八卦与制表/几何符号等）、common-hanzi.txt
python3 assets/fonts/collect_chars.py > "$WENKAI_TMP/chars.txt"

# 3) 子集化为 WOFF2（保留竖排 vert/vrt2 特性，签面竖排标点才正确），完成后清理临时目录
.venv/bin/pyftsubset "$WENKAI_TMP/LXGWWenKai-Regular.ttf" \
  --text-file="$WENKAI_TMP/chars.txt" \
  --layout-features='kern,liga,vert,vrt2,vkrn,vpal,palt,halt' \
  --flavor=woff2 --no-hinting --desubroutinize \
  --output-file=assets/fonts/wenkai-subset.woff2
rm -rf "$WENKAI_TMP"

ls -l assets/fonts/wenkai-subset.woff2
```

> 如果 Canvas 渲染层也用 WenKai 画字（`src/render/palette.js` 的 `FONT_CN`），它的字同样来自 `src/**/*.js`，会被自动收进来。
> 想多留字，就往 `common-hanzi.txt` 里追加；体积每 100 个汉字约 +20 KB。
