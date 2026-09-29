@echo off
setlocal EnableExtensions
cd /d "%~dp0"

tasklist /FI "WINDOWTITLE eq trace_view" 2>nul | find /I "cmd.exe" >nul
if not errorlevel 1 (
  echo [trace_view] already running
  echo [trace_view] http://127.0.0.1:8912/
  exit /b 0
)

set "PY="
python -c "import sys" >nul 2>&1 && set "PY=python"
if not defined PY python3 -c "import sys" >nul 2>&1 && set "PY=python3"
if not defined PY (
  echo [trace_view] python not found
  exit /b 1
)

start "trace_view" /MIN %PY% "%~dp0server.py" %*
echo [trace_view] started
echo [trace_view] http://127.0.0.1:8912/
