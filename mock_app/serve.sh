#!/usr/bin/env bash
# mock_app Trigger 链路验证 — Linux 一键启动（纯静态，浏览器直连云端）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATIC_DIR="${ROOT}/static"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8085}"
PID_FILE="${ROOT}/.mock_app_http.pid"
LOG_FILE="${ROOT}/.mock_app_http.log"

usage() {
  cat <<EOF
用法: $(basename "$0") [start|stop|restart|status|foreground]

  start        后台启动（默认）
  stop         停止
  restart      重启
  status       查看状态
  foreground   前台运行（Ctrl+C 结束）

环境变量:
  HOST   监听地址，默认 0.0.0.0
  PORT   端口，默认 8085

示例:
  ./serve.sh
  PORT=8086 ./serve.sh start
  ./serve.sh stop
EOF
}

need_static() {
  if [[ ! -f "${STATIC_DIR}/index.html" ]]; then
    echo "错误: 找不到 ${STATIC_DIR}/index.html" >&2
    exit 1
  fi
}

pick_python() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
  elif command -v python >/dev/null 2>&1; then
    echo "python"
  else
    echo "错误: 未找到 python3/python（仅需系统 Python 跑 http.server，无需 venv）" >&2
    exit 1
  fi
}

is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

do_stop() {
  if ! is_running; then
    echo "未在运行"
    rm -f "${PID_FILE}"
    return 0
  fi
  local pid
  pid="$(cat "${PID_FILE}")"
  kill "${pid}" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    sleep 0.3
  done
  if kill -0 "${pid}" 2>/dev/null; then
    kill -9 "${pid}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
  echo "已停止 (pid=${pid})"
}

do_start_bg() {
  need_static
  if is_running; then
    echo "已在运行 (pid=$(cat "${PID_FILE}"))  http://${HOST}:${PORT}/"
    echo "若要重启: ./serve.sh restart"
    exit 0
  fi
  local py
  py="$(pick_python)"
  nohup "${py}" "${ROOT}/server.py" --host "${HOST}" --port "${PORT}" \
    --startup-config "${ROOT}/startup.json" \
    >"${LOG_FILE}" 2>&1 &
  echo $! >"${PID_FILE}"
  sleep 0.4
  if ! is_running; then
    echo "启动失败，请查看日志: ${LOG_FILE}" >&2
    tail -n 30 "${LOG_FILE}" >&2 || true
    rm -f "${PID_FILE}"
    exit 1
  fi
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "已启动 mock_app"
  echo "  pid:  $(cat "${PID_FILE}")"
  echo "  本地: http://127.0.0.1:${PORT}/"
  echo "  trace: /oem/trace"
  if [[ -n "${ip}" ]]; then
    echo "  局域网: http://${ip}:${PORT}/"
  fi
  echo "  日志: ${LOG_FILE}"
  echo "  停止: ./serve.sh stop"
}

do_foreground() {
  need_static
  local py
  py="$(pick_python)"
  echo "前台启动: http://127.0.0.1:${PORT}/"
  echo "目录: ${STATIC_DIR}"
  echo "trace: /oem/trace"
  echo "Ctrl+C 结束"
  exec "${py}" "${ROOT}/server.py" --host "${HOST}" --port "${PORT}" \
    --startup-config "${ROOT}/startup.json"
}

do_status() {
  if is_running; then
    echo "运行中 pid=$(cat "${PID_FILE}") 监听 ${HOST}:${PORT}"
    echo "日志: ${LOG_FILE}"
  else
    echo "未运行"
    [[ -f "${LOG_FILE}" ]] && echo "最近日志: ${LOG_FILE}"
  fi
}

cmd="${1:-start}"
case "${cmd}" in
  start) do_start_bg ;;
  stop) do_stop ;;
  restart) do_stop; do_start_bg ;;
  status) do_status ;;
  foreground|fg|run) do_foreground ;;
  -h|--help|help) usage ;;
  *)
    echo "未知命令: ${cmd}" >&2
    usage
    exit 1
    ;;
esac
