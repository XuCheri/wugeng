#!/usr/bin/env python3
"""收集《五更天》用到的全部字符，输出给 pyftsubset 的 --text-file。

只用标准库。用法（在仓库根目录）：
    python3 assets/fonts/collect_chars.py > "${TMPDIR:-$HOME/.cache}/wenkai/chars.txt"
扫描范围：src/**/*.js、根目录 *.html、根目录 *.css，
再加上 ASCII、常用中文与界面符号标点和 assets/fonts/common-hanzi.txt（约 600 个常用字缓冲，
给以后改文案留余地）。
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent

PUNCT = (
    "，。、；：？！…—～·‹›「」『』（）《》〈〉【】“”‘’﹁﹂﹃﹄︽︾︵︶"
    "＋－×÷＝％→←↑↓−·•○●□■△▲◇◆★☆°±①②③④⑤⑥⑦⑧⑨⑩☰☱☲☳☴☵☶☷"
    "０１２３４５６７８９"
    "\u3000"
)


def is_wanted(ch: str) -> bool:
    cp = ord(ch)
    return cp >= 0xA0 and not ch.isspace() and not (0xD800 <= cp <= 0xDFFF)


def main() -> None:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update(PUNCT)
    files = sorted((ROOT / "src").rglob("*.js"))
    files += sorted(ROOT.glob("*.html"))
    files += sorted(ROOT.glob("*.css"))
    files += [HERE / "common-hanzi.txt"]
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
