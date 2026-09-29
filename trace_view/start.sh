#!/bin/sh
# 后台启动 Trace 看板。额外参数原样传给 server.py，例如：
#   ./start.sh --port 9000 --trace-dir /path/to/traces

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PIDFILE="$DIR/trace_view.pid"
LOGFILE="$DIR/trace_view.log"
SERVER="$DIR/server.py"

is_alive() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null)
  if is_alive "$OLD"; then
    echo "[trace_view] 已在运行 pid=$OLD"
    echo "[trace_view] 页面   http://127.0.0.1:8912/"
    exit 0
  fi
  rm -f "$PIDFILE"
fi

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "[trace_view] 未找到 python3 / python" >&2
  exit 1
fi

cd "$DIR" || exit 1
nohup "$PY" "$SERVER" "$@" >>"$LOGFILE" 2>&1 &
PID=$!

if ! is_alive "$PID"; then
  echo "[trace_view] 启动失败，见 $LOGFILE" >&2
  exit 1
fi

echo "$PID" >"$PIDFILE"
echo "[trace_view] 已启动 pid=$PID"
echo "[trace_view] 页面   http://127.0.0.1:8912/"
echo "[trace_view] 日志   $LOGFILE"
