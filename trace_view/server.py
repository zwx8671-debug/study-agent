#!/usr/bin/env python3
"""Trace 看板的本地静态服务。

同时提供页面静态资源与三个只读接口：

    GET /api/traces        列出 trace 目录下的文件
    GET /api/trace/<name>  返回单个 trace 的 JSON 内容
    GET /api/bundle        一次返回目录中全部 trace 的 JSON，供汇总页使用

仅依赖标准库。默认服务 /oem/trace，可用 --trace-dir 覆盖。
"""

from __future__ import annotations

import argparse
import json
import os
import re
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TRACE_DIR = "/oem/trace"

# trace 文件名为 UUID 或普通文件名，限制字符集以杜绝路径穿越
SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


class Handler(SimpleHTTPRequestHandler):
    trace_dir = DEFAULT_TRACE_DIR

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    # -- 接口 ---------------------------------------------------------

    def do_GET(self):  # noqa: N802  (stdlib 命名约定)
        path = self.path.split("?", 1)[0]
        if path == "/api/bundle":
            self.handle_bundle()
            return
        if path == "/api/traces":
            self.handle_list()
            return
        if path.startswith("/api/trace/"):
            self.handle_one(self.path[len("/api/trace/") :].split("?", 1)[0])
            return
        super().do_GET()

    def handle_list(self):
        try:
            entries = []
            for name in os.listdir(self.trace_dir):
                path = os.path.join(self.trace_dir, name)
                if not os.path.isfile(path):
                    continue
                st = os.stat(path)
                entries.append({"name": name, "size": st.st_size, "mtime": int(st.st_mtime * 1000)})
        except OSError as exc:
            self.send_json({"error": str(exc), "dir": self.trace_dir, "traces": []}, HTTPStatus.OK)
            return

        entries.sort(key=lambda e: e["mtime"], reverse=True)
        self.send_json({"dir": self.trace_dir, "traces": entries})

    def handle_one(self, raw_name: str):
        from urllib.parse import unquote

        name = unquote(raw_name)
        if not SAFE_NAME.match(name):
            self.send_json({"error": "非法文件名"}, HTTPStatus.BAD_REQUEST)
            return

        path = os.path.join(self.trace_dir, name)
        if not os.path.isfile(path):
            self.send_json({"error": "文件不存在"}, HTTPStatus.NOT_FOUND)
            return

        try:
            with open(path, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            self.send_json({"error": f"读取失败: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_json(payload)

    def handle_bundle(self):
        try:
            files = []
            for name in os.listdir(self.trace_dir):
                path = os.path.join(self.trace_dir, name)
                if not os.path.isfile(path):
                    continue
                files.append((name, path, os.stat(path)))
        except OSError as exc:
            self.send_json({"error": str(exc), "dir": self.trace_dir, "traces": []}, HTTPStatus.OK)
            return

        files.sort(key=lambda e: e[2].st_mtime, reverse=True)
        traces = []
        for name, path, st in files:
            item = {"name": name, "size": st.st_size, "mtime": int(st.st_mtime * 1000)}
            if not SAFE_NAME.match(name):
                item["error"] = "非法文件名"
                traces.append(item)
                continue
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    item["data"] = json.load(fh)
            except (OSError, json.JSONDecodeError) as exc:
                item["error"] = "读取失败: %s" % exc
            traces.append(item)

        self.send_json({"dir": self.trace_dir, "traces": traces})

    # -- 工具 ---------------------------------------------------------

    def send_json(self, payload, status: HTTPStatus = HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # 页面资源本身也不缓存，改完源码刷新即可生效
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[trace_view] " + fmt % args)


def main():
    parser = argparse.ArgumentParser(description="Trace 时延看板本地服务")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8912)
    parser.add_argument("--trace-dir", default=DEFAULT_TRACE_DIR, help="trace 文件所在目录")
    args = parser.parse_args()

    Handler.trace_dir = os.path.abspath(args.trace_dir)

    server = ThreadingHTTPServer((args.host, args.port), partial(Handler))
    shown = "127.0.0.1" if args.host in ("0.0.0.0", "") else args.host
    print(f"[trace_view] 页面   http://{shown}:{args.port}/")
    print(f"[trace_view] trace  {Handler.trace_dir}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[trace_view] 已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
