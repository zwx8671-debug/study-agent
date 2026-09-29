@echo off
REM 单个音频文件测试脚本
REM 使用方法: test-single.bat [音频文件路径]

echo ========================================
echo    STT 单文件测试脚本
echo ========================================
echo.

if "%~1"=="" (
    echo 使用默认音频文件: 帮我讲个笑话.pcm
    npx tsx test/socketio-client-test.ts
) else (
    echo 测试音频文件: %~1
    npx tsx test/socketio-client-test.ts --file "%~1"
)

pause
