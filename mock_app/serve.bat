@echo off
cd /d "%~dp0"
set PORT=8085
if not "%MOCK_APP_PORT%"=="" set PORT=%MOCK_APP_PORT%
echo Open http://127.0.0.1:%PORT%/
echo latency JSON -^> /oem/trace
python server.py --host 127.0.0.1 --port %PORT% --startup-config startup.json
