@echo off
setlocal EnableExtensions
cd /d "%~dp0"

taskkill /FI "WINDOWTITLE eq trace_view" /T /F >nul 2>&1
if errorlevel 1 (
  echo [trace_view] not running
  exit /b 0
)
echo [trace_view] stopped
