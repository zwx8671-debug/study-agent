@echo off
REM 批量音频测试脚本
REM 使用方法: test-batch.bat [音频目录路径]

echo ========================================
echo    STT 批量测试脚本
echo ========================================
echo.

if "%~1"=="" (
    echo 使用默认音频目录: D:\Users\AA\Music\文本声音PCM
    npx tsx test/socketio-client-test.ts --dir "D:\Users\AA\Music\文本声音PCM"
) else (
    echo 测试音频目录: %~1
    npx tsx test/socketio-client-test.ts --dir "%~1"
)

pause
