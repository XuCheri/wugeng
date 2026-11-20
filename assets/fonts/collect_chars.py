#!/usr/bin/env python3
"""收集《五更天》用到的全部字符，输出给 pyftsubset 的 --text-file。

只用标准库。用法（在仓库根目录）：
    python3 assets/fonts/collect_chars.py > /tmp/wenkai/chars.txt
扫描范围：src/**/*.js、根目录 *.html、docs/PLAN.md、ARCHITECTURE.md，
再加上 ASCII、常用中文标点和 assets/fonts/common-hanzi.txt（约 600 个常用字缓冲，
给以后改文案留余地）。
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent

PUNCT = (
    "，。、；：？！…—～·「」『』（）《》〈〉【】“”‘’﹁﹂﹃﹄︽︾︵︶"
    "＋－×÷＝％→←↑↓−·•○●□■△▲◇◆★☆①②③④⑤"
    "０１２３４５６７８９"
    "\u3000"
)


def is_wanted(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x4E00 <= cp <= 0x9FFF  # CJK 统一表意
        or 0x3400 <= cp <= 0x4DBF  # 扩展 A
        or 0x3000 <= cp <= 0x303F  # CJK 标点
        or 0xFF00 <= cp <= 0xFFEF  # 全角
        or 0x2000 <= cp <= 0x206F  # 通用标点
        or 0x2190 <= cp <= 0x21FF  # 箭头
        or 0x2200 <= cp <= 0x22FF  # 数学符号（−）
        or 0xFE10 <= cp <= 0xFE4F  # 竖排标点
    )


def main() -> None:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update(PUNCT)
    files = list((ROOT / "src").rglob("*.js"))
    files += list(ROOT.glob("*.html"))
    files += [ROOT / "docs" / "PLAN.md", ROOT / "ARCHITECTURE.md", HERE / "common-hanzi.txt"]
    for f in files:
        if not f.exists():
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        chars.update(ch for ch in text if is_wanted(ch))
    out = "".join(sorted(chars))
    sys.stdout.write(out)
    sys.stderr.write(f"{len(chars)} chars from {len(files)} files\n")


if __name__ == "__main__":
    main()
