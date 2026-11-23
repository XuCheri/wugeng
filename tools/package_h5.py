"""打包 TapTap H5 上传用的 ZIP：只收录运行时文件，单一顶层目录 + index.html。需要 Python 3。"""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_FOLDER = "wugeng/"
MAX_ZIP_BYTES = 300_000_000
ENTRY_FILES = ("index.html", "privacy.html", "styles.css")
RUNTIME_DIRS = {
    # 目录: 允许的后缀
    "src": {".js"},
    "assets": {".woff2", ".png", ".webp", ".jpg", ".txt"},
}
# 不进包的开发期文件
EXCLUDE_PARTS = {
    "mock-run.js",
    "sheet.js",
    "common-hanzi.txt",
    "collect_chars.py",
    "README.md",
    "chars.txt",
}
STAMP = (2026, 1, 1, 0, 0, 0)


def runtime_files():
    files = [ROOT / name for name in ENTRY_FILES]
    for folder, suffixes in RUNTIME_DIRS.items():
        for path in sorted((ROOT / folder).rglob("*")):
            rel = path.relative_to(ROOT)
            if any(part.startswith(".") or part == "__pycache__" for part in rel.parts):
                continue
            if ".test." in path.name or ".spec." in path.name:
                continue
            if path.is_file() and path.suffix in suffixes and path.name not in EXCLUDE_PARTS:
                files.append(path)
    missing = [str(p.relative_to(ROOT)) for p in files if not p.exists()]
    if missing:
        raise FileNotFoundError("缺少运行时文件: " + ", ".join(missing))
    return files


def build():
    output = ROOT / "dist" / "wugeng-h5.zip"
    output.parent.mkdir(exist_ok=True)
    temporary = output.with_suffix(".tmp")
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as archive:
            folder = ZipInfo(PACKAGE_FOLDER, date_time=STAMP)
            folder.external_attr = (0o40755 << 16) | 0x10
            archive.writestr(folder, b"")
            for path in runtime_files():
                info = ZipInfo(PACKAGE_FOLDER + path.relative_to(ROOT).as_posix(), date_time=STAMP)
                info.compress_type = ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())
        with ZipFile(temporary) as archive:
            names = archive.namelist()
            if archive.testzip() is not None or PACKAGE_FOLDER + "index.html" not in names:
                raise ValueError("H5 压缩包校验失败")
            if not all(name.startswith(PACKAGE_FOLDER) for name in names):
                raise ValueError("所有文件必须位于 " + PACKAGE_FOLDER + " 目录下")
        if temporary.stat().st_size > MAX_ZIP_BYTES:
            raise ValueError("H5 压缩包超过 TapTap 300 MB 上限")
        temporary.replace(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    print(f"{output} ({output.stat().st_size:,} bytes, {len(names) - 1} files)")


if __name__ == "__main__":
    build()
