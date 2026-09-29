#!/bin/sh
# 停止由 start.sh 拉起的 Trace 看板。

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PIDFILE="$DIR/trace_view.pid"
SERVER="$DIR/server.py"

is_alive() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

stop_pid() {
  pid=$1
  is_alive "$pid" || return 1
  kill "$pid" 2>/dev/null
  i=0
  while [ "$i" -lt 20 ]; do
    is_alive "$pid" || return 0
    i=$((i + 1))
    sleep 0.1 2>/dev/null || sleep 1
  done
  kill -9 "$pid" 2>/dev/null
  return 0
}

STOPPED=

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null)
  if stop_pid "$PID"; then
    echo "[trace_view] 已停止 pid=$PID"
    STOPPED=1
  else
    echo "[trace_view] pid=$PID 已不存在"
  fi
  rm -f "$PIDFILE"
fi

# pid 文件缺失或已过期时，按本目录 server.py 再扫一遍
if command -v pgrep >/dev/null 2>&1; then
  EXTRA=$(pgrep -f "$SERVER" 2>/dev/null || true)
else
  EXTRA=$(ps -eo pid,args 2>/dev/null | awk -v s="$SERVER" 'index($0, s) { print $1 }')
fi

for pid in $EXTRA; do
  if stop_pid "$pid"; then
    echo "[trace_view] 已停止 pid=$pid"
    STOPPED=1
  fi
done

if [ -z "$STOPPED" ]; then
  echo "[trace_view] 未在运行"
fi
