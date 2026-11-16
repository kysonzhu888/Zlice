#!/usr/bin/env python3
"""Serve the portable classroom files on this computer only."""

from __future__ import annotations

import argparse
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys


DEFAULT_PORT = 8767
LOOPBACK_HOST = "127.0.0.1"


class ClassroomHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None


def valid_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("端口必须是整数。") from error
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("端口必须在 1024–65535 之间。")
    return port


def create_server(directory: Path, port: int) -> ThreadingHTTPServer:
    handler = partial(ClassroomHandler, directory=str(directory.resolve()))
    return ThreadingHTTPServer((LOOPBACK_HOST, port), handler)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="在本机启动切水果课堂，不自动打开浏览器。")
    parser.add_argument("--port", type=valid_port, default=DEFAULT_PORT, help="本机端口，默认 8767")
    args = parser.parse_args(argv)
    directory = Path(__file__).resolve().parent
    if not (directory / "index.html").is_file():
        print("找不到 index.html。请完整解压课堂包后再启动。", file=sys.stderr)
        return 1
    try:
        server = create_server(directory, args.port)
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            print(f"端口 {args.port} 已被占用；没有停止或替换现有服务。", file=sys.stderr)
            print("可在终端运行：python3 serve.py --port 8768", file=sys.stderr)
        else:
            print(f"本地服务无法启动：{error.strerror or error}", file=sys.stderr)
        return 1
    print(f"\n切水果课堂已启动：http://{LOOPBACK_HOST}:{args.port}/", flush=True)
    print("请把上面的地址粘贴到当前浏览器。保持此窗口打开；按 Control+C 停止。", flush=True)
    print("服务仅供本机访问。摄像头需要在浏览器页面中由你开启。\n", flush=True)
    try:
        with server:
            server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print("\n课堂服务已停止。", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
