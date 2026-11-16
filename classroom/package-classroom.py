#!/usr/bin/env python3
"""Create a portable classroom ZIP without tests or development scripts."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys
import zipfile


PACKAGE_FOLDER = "zlice-classroom"
REQUIRED_FILES = (
    "index.html", "styles.css", "app.js", "game.js", "scene.js", "camera.js",
    "LESSON.md", "启动课堂.command", "serve.py", "THIRD_PARTY_NOTICES.md",
)
ASSET_FOLDERS = ("vendor", "models")
EXCLUDED_PARTS = {".git", "node_modules", "__pycache__", "tests", "scripts"}


def classroom_source(path: Path) -> Path:
    path = path.expanduser().resolve()
    if (path / "classroom" / "index.html").is_file():
        return path / "classroom"
    if (path / "index.html").is_file():
        return path
    raise ValueError("源码目录须包含 index.html 或 classroom/index.html。")


def package_files(source: Path) -> dict[str, Path]:
    files = {}
    for name in REQUIRED_FILES:
        path = source / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"缺少必要文件或文件是符号链接：{name}")
        files[name] = path
    license_path = source / "LICENSE"
    if not license_path.is_file():
        license_path = source.parent / "LICENSE"
    if not license_path.is_file() or license_path.is_symlink():
        raise ValueError("缺少原项目 LICENSE；不能创建分发包。")
    files["LICENSE"] = license_path
    if "CLASSROOM-STUB" in (source / "camera.js").read_text(encoding="utf-8"):
        raise ValueError("camera.js 仍是占位实现；不能创建课堂包。")
    for folder in ASSET_FOLDERS:
        asset_root = source / folder
        if not asset_root.is_dir() or asset_root.is_symlink():
            raise ValueError(f"缺少本地资源目录：{folder}")
        asset_count = 0
        for path in sorted(asset_root.rglob("*")):
            relative = path.relative_to(source)
            if path.is_symlink():
                raise ValueError(f"资源不应使用符号链接：{relative}")
            if any(part in EXCLUDED_PARTS or part.startswith(".") for part in relative.parts):
                continue
            if not path.is_file() or path.name.endswith((".test.js", ".map", ".pyc")):
                continue
            files[relative.as_posix()] = path
            asset_count += 1
        if not asset_count:
            raise ValueError(f"本地资源目录为空：{folder}")
    if not any(name.startswith("models/") and name.endswith(".task") for name in files):
        raise ValueError("缺少本地手部识别 .task 模型。")
    if not any(name.startswith("vendor/") and name.endswith(".wasm") for name in files):
        raise ValueError("缺少本地 WebAssembly 运行资源。")
    if not any(name.startswith("vendor/") and name.endswith((".js", ".mjs")) for name in files):
        raise ValueError("缺少本地识别库 JavaScript。")
    return files


def write_package(files: dict[str, Path], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".partial")
    if output.exists() or temporary.exists():
        raise ValueError("目标包或未完成文件已存在。请用 --output 指定新文件名。")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, path in sorted(files.items()):
                info = zipfile.ZipInfo.from_file(path, f"{PACKAGE_FOLDER}/{name}")
                info.compress_type = zipfile.ZIP_DEFLATED
                if name in {"启动课堂.command", "serve.py"}:
                    info.external_attr = 0o100755 << 16
                archive.writestr(info, path.read_bytes())
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="打包本地课堂资源；不包含测试或开发脚本。")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parent, help="仓库根目录或 classroom 目录")
    parser.add_argument("--output", type=Path, help="输出 ZIP；默认放在源码上一级 dist")
    args = parser.parse_args(argv)
    try:
        source = classroom_source(args.source)
        output = (args.output or source.parent / "dist" / "zlice-classroom.zip").expanduser().resolve()
        if output.suffix.lower() != ".zip":
            raise ValueError("输出文件须以 .zip 结尾。")
        files = package_files(source)
        write_package(files, output)
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        print(f"未创建课堂包：{error}", file=sys.stderr)
        return 1
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"课堂包：{output}\n文件数：{len(files)}\nSHA-256：{digest}")
    print("打包成功不等于课堂验收；请解压后启动，并断网复测摄像头与鼠标流程。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
