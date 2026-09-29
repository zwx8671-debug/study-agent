# STT Socket.IO 测试指南

本指南将帮助您使用测试客户端对 STT 服务进行测试。

## 📋 功能特性

- ✅ 单文件音频测试
- ✅ 批量目录测试
- ✅ 实时识别结果显示
- ✅ 详细的测试报告
- ✅ 支持 PCM、WAV、MP3、OPUS 格式
- ✅ 自动统计识别结果

## 🚀 快速开始

### 1. 编译测试文件

```bash
# 从项目根目录执行
pnpm run build
```

或者直接使用 ts-node 运行：

```bash
npx ts-node test/socketio-client-test.ts
```

### 2. 测试单个音频文件（默认）

```bash
# 使用默认音频文件测试（帮我讲个笑话.pcm）
npx tsx test/socketio-client-test.ts

# 或指定音频文件
npx tsx test/socketio-client-test.ts --file "D:\Users\AA\Music\文本声音PCM\帮我讲个笑话.pcm"

# 简写形式（直接提供文件路径）
npx tsx test/socketio-client-test.ts "D:\Users\AA\Music\文本声音PCM\帮我讲个笑话.pcm"
```

### 3. 批量测试整个目录

```bash
# 测试指定目录下的所有音频文件
npx tsx test/socketio-client-test.ts --dir "D:\Users\AA\Music\文本声音PCM"

# 或
npx tsx test/socketio-client-test.ts -d "D:\Users\AA\Music\文本声音PCM"
```

### 4. 模拟音频流测试

```bash
# 使用模拟音频数据测试（静音PCM数据）
npx tsx test/socketio-client-test.ts --simulate
```

### 5. 指定服务器地址

```bash
# 连接到自定义服务器
npx tsx test/socketio-client-test.ts --server http://192.168.1.100:3000 --file "audio.pcm"

# 或
npx tsx test/socketio-client-test.ts -s http://localhost:8080 -f "audio.pcm"
```

## 📝 命令行参数

| 参数 | 简写 | 说明 | 示例 |
|------|------|------|------|
| `--server` | `-s` | 指定服务器地址 | `--server http://localhost:3000` |
| `--file` | `-f` | 测试单个音频文件 | `--file "audio.pcm"` |
| `--dir` | `-d` | 批量测试目录 | `--dir "音频文件夹"` |
| `--simulate` | - | 使用模拟音频流 | `--simulate` |

## 📊 测试输出示例

### 单文件测试输出

```
========================================
   Socket.IO STT 单文件测试
========================================

🔌 正在连接到服务器: http://localhost:3000
✅ 已连接到服务器，Socket ID: abc123

🎤 启动 STT 会话...
   - Session ID: 1738139161234-xzy9abc
   - Device SN: TEST-DEVICE-001
   - Trace ID: 1738139161234-def5ghi
✅ STT 会话已启动: { success: true }

🎵 开始发送音频文件: 帮我讲个笑话.pcm
   - 完整路径: D:\Users\AA\Music\文本声音PCM\帮我讲个笑话.pcm
   - 块大小: 3200 字节
   - 发送间隔: 100 毫秒
   - 音频格式: pcm
   - 文件大小: 102400 字节
   - 预计发送时长: 3.2 秒
   📤 已发送: 10 块 (31.3%)
   📤 已发送: 20 块 (62.5%)
   📤 已发送: 30 块 (93.8%)
✅ 音频发送完成
   - 共发送: 32 个块
   - 耗时: 3.20 秒
   - 平均速率: 31.25 KB/s

📝 [临时] 识别结果: "帮我"
📝 [临时] 识别结果: "帮我讲"
📝 [最终] 识别结果: "帮我讲个笑话"

🛑 结束 STT 会话...
✅ STT 会话已结束: { success: true }

📊 识别结果统计:
   - 总识别次数: 3
   - 最终结果数: 1

🎯 最终识别文本:
   1. 帮我讲个笑话

📝 完整文本: "帮我讲个笑话"

🔌 断开连接...

========================================
   ✅ 测试完成
========================================
```

### 批量测试输出

```
========================================
   Socket.IO STT 批量测试
========================================

📁 扫描目录: D:\Users\AA\Music\文本声音PCM

📋 找到 5 个音频文件:

   1. 帮我讲个笑话.pcm (100.00 KB)
   2. 今天天气怎么样.pcm (120.50 KB)
   3. 播放音乐.pcm (80.25 KB)
   4. 关闭灯光.pcm (65.75 KB)
   5. 设置闹钟.pcm (95.00 KB)

============================================================
   测试 1/5: 帮我讲个笑话.pcm
============================================================
...（识别过程）...

============================================================
   测试 2/5: 今天天气怎么样.pcm
============================================================
...（识别过程）...


================================================================================
   📊 批量测试总结
================================================================================

✅ 成功: 5/5
❌ 失败: 0/5

📝 详细结果:

✅ 1. 帮我讲个笑话.pcm
   识别: "帮我讲个笑话"

✅ 2. 今天天气怎么样.pcm
   识别: "今天天气怎么样"

✅ 3. 播放音乐.pcm
   识别: "播放音乐"

✅ 4. 关闭灯光.pcm
   识别: "关闭灯光"

✅ 5. 设置闹钟.pcm
   识别: "设置闹钟"

================================================================================
```

## 🔧 配置说明

### 音频参数配置

测试客户端默认使用以下参数：

- **块大小**: 3200 字节（适合 16kHz, 16bit, 单声道 PCM）
- **发送间隔**: 100 毫秒
- **支持格式**: PCM, WAV, MP3, OPUS

### 修改测试参数

如果需要调整音频发送参数，可以在代码中修改：

```typescript
// 在 testSingleFile 或 testDirectory 函数中修改
await client.sendAudioFromFile(audioFile, 
    3200,  // chunkSize: 块大小（字节）
    100    // interval: 发送间隔（毫秒）
)
```

## 🎯 测试场景

### 场景 1: 验证单个音频识别

```bash
npx tsx test/socketio-client-test.ts "D:\Users\AA\Music\文本声音PCM\帮我讲个笑话.pcm"
```

**用途**: 快速验证某个特定音频文件的识别效果

### 场景 2: 批量性能测试

```bash
npx tsx test/socketio-client-test.ts --dir "D:\Users\AA\Music\文本声音PCM"
```

**用途**: 测试多个音频文件，评估识别准确率和稳定性

### 场景 3: 压力测试

修改代码中的等待时间，减少测试间隔：

```typescript
// 在 testDirectory 函数中修改
if (i < files.length - 1) {
    console.log('\n⏱️  等待 0.5 秒后继续下一个测试...')
    await new Promise((resolve) => setTimeout(resolve, 500)) // 改为 500ms
}
```

### 场景 4: 远程服务器测试

```bash
npx tsx test/socketio-client-test.ts --server http://192.168.1.100:3000 --dir "音频目录"
```

**用途**: 测试部署在其他机器上的 STT 服务

## 🐛 故障排查

### 问题 1: 连接超时

**症状**: `❌ 连接错误: 连接超时`

**解决方案**:
1. 确认 STT 服务已启动
2. 检查服务器地址是否正确
3. 检查防火墙设置
4. 尝试使用 `http://127.0.0.1:3000` 代替 `localhost`

### 问题 2: 音频文件不存在

**症状**: `音频文件不存在: xxx`

**解决方案**:
1. 检查文件路径是否正确
2. 确保使用绝对路径
3. Windows 路径使用双反斜杠或单斜杠

### 问题 3: 无识别结果

**症状**: 音频发送完成但没有识别结果

**解决方案**:
1. 检查音频格式是否正确（建议使用 16kHz, 16bit, 单声道 PCM）
2. 增加等待识别结果的时间
3. 查看服务器端日志

### 问题 4: 识别不准确

**解决方案**:
1. 检查音频质量
2. 调整音频发送参数（块大小和间隔）
3. 确认 STT 服务配置正确

## 📚 代码集成示例

如果想在自己的代码中使用测试客户端：

```typescript
import { STTSocketClient } from './test/socketio-client-test'

async function myTest() {
    const client = new STTSocketClient('http://localhost:3000')
    
    try {
        await client.connect()
        await client.startSTT()
        
        // 发送音频
        await client.sendAudioFromFile('audio.pcm')
        
        // 等待识别
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 获取结果
        const results = client.getRecognitionResults()
        console.log('识别结果:', results)
        
        await client.endSTT()
        client.disconnect()
    } catch (error) {
        console.error('测试失败:', error)
        client.disconnect()
    }
}
```

## 📞 技术支持

如果遇到问题，请检查：
1. 服务器日志 (`logs/` 目录)
2. 网络连接状态
3. 音频文件格式和质量
4. STT 服务配置

## 📝 更新日志

- 2026-01-29: 
  - ✅ 添加识别结果存储和统计功能
  - ✅ 优化音频发送进度显示
  - ✅ 添加批量测试功能
  - ✅ 增强错误处理和报告
  - ✅ 添加默认音频路径配置
