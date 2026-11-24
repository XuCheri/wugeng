#!/usr/bin/env python3
"""收集《五更天》运行时与展台用到的全部字符，输出给 pyftsubset 的 --text-file。

只用标准库。用法（在仓库根目录）：
    python3 assets/fonts/collect_chars.py > "${TMPDIR:-$HOME/.cache}/wenkai/chars.txt"
扫描范围：src/**/*.js（剥离纯代码注释以将子集严格控制在 <400KB）、根目录 *.html、根目录 *.css，
再加上 ASCII、常用中文与界面符号标点、v3 核心词汇和 assets/fonts/common-hanzi.txt 常用字缓冲。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent

PUNCT = (
    "，。、；：？！…—～·‹›「」『』（）《》〈〉【】“”‘’﹁﹂﹃﹄︽︾︵︶"
    "＋－×÷＝％→←↑↓−·•○●□■△▲◇◆★☆°±①②③④⑤⑥⑦⑧⑨⑩☰☱☲☳☴☵☶☷"
    "０１２３４５６７８９｜"
    "\u3000"
)

V3_CORE_COPY = (
    "剑清酱工作室五更守夜总榜同守五更鬼市商铺守夜功绩查看行囊透视战场本命专精全服总榜好友榜"
    "沈观星石敢当柳青衣桃木飞剑无常锁魂链纸鸢火鸦傩神战鼓雷击枣木勾魂阴牌硫磺火药囊五色傩面"
    "古墨朱砂青冥幽火紫电天罡鎏金神诏玄霜寒月魁首戳"
)

STR_RE = re.compile(r"""(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)""", re.S)


def is_wanted(ch: str) -> bool:
    cp = ord(ch)
    return cp >= 0xA0 and not ch.isspace() and not (0xD800 <= cp <= 0xDFFF)


def extract_js_chars(text: str) -> set[str]:
    clean = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    clean = re.sub(r"(?m)^\s*//.*$", "", clean)
    found: set[str] = set()
    for m in STR_RE.finditer(clean):
        for ch in m.group(0)[1:-1]:
            if is_wanted(ch):
                found.add(ch)
    return found


def main() -> None:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update(PUNCT)
    chars.update(ch for ch in V3_CORE_COPY if is_wanted(ch))

    for f in sorted((ROOT / "src").rglob("*.js")):
        try:
            chars.update(extract_js_chars(f.read_text(encoding="utf-8")))
        except UnicodeDecodeError:
            continue

    for f in sorted(ROOT.glob("*.html")) + sorted(ROOT.glob("*.css")):
        try:
            text = re.sub(r"/\*.*?\*/", "", f.read_text(encoding="utf-8"), flags=re.S)
            text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
        except UnicodeDecodeError:
            continue
        chars.update(ch for ch in text if is_wanted(ch))

    hanzi_file = HERE / "common-hanzi.txt"
    if hanzi_file.exists():
        buf_text = hanzi_file.read_text(encoding="utf-8")
        # 保留前 360 个高频缓冲字，兼顾未来文案余量与 < 400KB 严苛体积红线
        buf_chars = [ch for ch in buf_text if is_wanted(ch)][:360]
        chars.update(buf_chars)

    out = "".join(sorted(chars))
    sys.stdout.write(out)
    sys.stderr.write(f"{len(chars)} chars collected\n")


if __name__ == "__main__":
    main()
