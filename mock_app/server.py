#!/usr/bin/env python3
"""mock_app 静态页 + 把 latency trace 写到 /oem/trace。

仅依赖标准库。托管 static/，POST 的 JSON 落到 /oem/trace/<traceId>.json。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")
TRACE_DIR = "/oem/trace"
SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_TRACE_FILES = 50


def start_optional_trace_view(config_path: str) -> None:
    """Best-effort companion startup; never let optional config stop mock_app."""
    try:
        if not os.path.isabs(config_path):
            config_path = os.path.join(HERE, config_path)
        try:
            with open(config_path, encoding="utf-8-sig") as fh:
                config = json.load(fh)
        except FileNotFoundError:
            return
        if not isinstance(config, dict):
            raise ValueError("startup config must be an object")
        trace_view = config.get("trace_view")
        if trace_view is None:
            return
        if not isinstance(trace_view, dict):
            raise ValueError("trace_view must be an object")
        enabled = trace_view.get("enabled", False)
        if not isinstance(enabled, bool):
            raise ValueError("trace_view.enabled must be true or false")
        if not enabled:
            return
        path = trace_view.get("path")
        if not isinstance(path, str) or not path.strip():
            raise ValueError("trace_view.path must be a non-empty directory path")
        if not os.path.isabs(path):
            path = os.path.join(os.path.dirname(config_path), path)
        path = os.path.abspath(path)
        script = os.path.join(path, "server.py")
        if not os.path.isfile(script):
            raise ValueError(f"trace_view server.py not found: {script}")
        host = trace_view.get("host", "127.0.0.1")
        port = trace_view.get("port", 8912)
        if not isinstance(host, str) or not host.strip():
            raise ValueError("trace_view.host must be a non-empty string")
        if type(port) is not int or not 1 <= port <= 65535:
            raise ValueError("trace_view.port must be an integer between 1 and 65535")
        log_dir = os.path.join(HERE, "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "trace_view.log")
        with open(log_path, "ab") as log:
            subprocess.Popen(
                [sys.executable, "-u", script, "--host", host, "--port", str(port),
                 "--trace-dir", os.path.abspath(Handler.trace_dir)],
                cwd=path,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                start_new_session=os.name != "nt",
            )
        print(f"[mock_app] trace_view launch requested: http://{host}:{port}/ (log: {log_path})")
    except Exception as exc:
        print(f"[mock_app] trace_view skipped: {exc}", file=sys.stderr)


class Handler(SimpleHTTPRequestHandler):
    trace_dir = TRACE_DIR

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/api/trace-dir":
            self.send_json({"dir": self.trace_dir, "writable": True})
            return
        if path == "/api/traces":
            self.handle_list()
            return
        if path.startswith("/api/trace/"):
            self.handle_one(self.path[len("/api/trace/") :].split("?", 1)[0])
            return
        super().do_GET()

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/trace/"):
            self.handle_write(path[len("/api/trace/") :])
            return
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def handle_list(self):
        try:
            os.makedirs(self.trace_dir, exist_ok=True)
            entries = []
            for name in os.listdir(self.trace_dir):
                path = os.path.join(self.trace_dir, name)
                if not os.path.isfile(path) or not name.endswith(".json"):
                    continue
                st = os.stat(path)
                entries.append({"name": name, "size": st.st_size, "mtime": int(st.st_mtime * 1000)})
        except OSError as exc:
            self.send_json({"error": str(exc), "dir": self.trace_dir, "traces": []})
            return
        entries.sort(key=lambda e: e["mtime"], reverse=True)
        self.send_json({"dir": self.trace_dir, "traces": entries})

    def handle_one(self, raw_name: str):
        name = self._safe_filename(raw_name)
        if name is None:
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

    def handle_write(self, raw_name: str):
        name = self._safe_filename(raw_name)
        if name is None:
            self.send_json({"error": "非法文件名"}, HTTPStatus.BAD_REQUEST)
            return
        length = self.headers.get("Content-Length")
        try:
            size = int(length or "0")
        except ValueError:
            self.send_json({"error": "无效 Content-Length"}, HTTPStatus.BAD_REQUEST)
            return
        if size <= 0 or size > MAX_BODY_BYTES:
            self.send_json({"error": "请求体过大或为空"}, HTTPStatus.BAD_REQUEST)
            return
        raw = self.rfile.read(size)
        try:
            doc = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.send_json({"error": f"JSON 无效: {exc}"}, HTTPStatus.BAD_REQUEST)
            return
        if not isinstance(doc, dict):
            self.send_json({"error": "JSON 必须是对象"}, HTTPStatus.BAD_REQUEST)
            return
        try:
            os.makedirs(self.trace_dir, exist_ok=True)
            path = os.path.join(self.trace_dir, name)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, indent=2)
                fh.write("\n")
            os.replace(tmp, path)
            self._prune_dir()
        except OSError as exc:
            self.send_json({"error": f"写入失败: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self.send_json({"ok": True, "dir": self.trace_dir, "name": name})

    def _safe_filename(self, raw_name: str) -> str | None:
        name = unquote(raw_name.split("?", 1)[0]).strip()
        if name.endswith(".json"):
            name = name[: -len(".json")]
        if not SAFE_NAME.match(name):
            return None
        return f"{name}.json"

    def _prune_dir(self) -> None:
        try:
            files = [
                os.path.join(self.trace_dir, name)
                for name in os.listdir(self.trace_dir)
                if name.endswith(".json")
            ]
            files = [p for p in files if os.path.isfile(p)]
            files.sort(key=lambda p: os.path.getmtime(p))
        except OSError:
            return
        extra = len(files) - MAX_TRACE_FILES
        for stale in files[: max(0, extra)]:
            try:
                os.unlink(stale)
            except OSError:
                pass

    def send_json(self, payload, status: HTTPStatus = HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[mock_app] " + fmt % args)


def main():
    parser = argparse.ArgumentParser(description="mock_app 静态托管 + trace 落盘")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8085)
    parser.add_argument("--startup-config", help="optional companion startup JSON config")
    args = parser.parse_args()

    Handler.trace_dir = TRACE_DIR
    os.makedirs(Handler.trace_dir, exist_ok=True)

    server = ThreadingHTTPServer((args.host, args.port), partial(Handler))
    if args.startup_config:
        start_optional_trace_view(args.startup_config)
    shown = "127.0.0.1" if args.host in ("0.0.0.0", "") else args.host
    print(f"[mock_app] 页面   http://{shown}:{args.port}/")
    print(f"[mock_app] trace  {Handler.trace_dir}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[mock_app] 已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
