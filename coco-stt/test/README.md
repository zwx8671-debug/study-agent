# STT Socket.IO 测试工具

这个目录包含用于测试 STT (Speech-to-Text) Socket.IO 服务的测试客户端和脚本。

## 📁 文件说明

- **socketio-client-test.ts** - 主测试客户端代码
- **test-volcengine-connection.js** - 火山引擎 WebSocket 连接诊断工具
- **TEST_GUIDE.md** - 详细的测试指南和使用说明
- **test-single.bat** - Windows 单文件测试快捷脚本
- **test-batch.bat** - Windows 批量测试快捷脚本
- **test-connection.bat** - 火山引擎连接诊断脚本

## 🚀 快速开始

### Windows 用户（推荐）

#### 1. 测试单个音频文件

双击运行 `test-single.bat`，默认会测试：
```
D:\Users\AA\Music\文本声音PCM\帮我讲个笑话.pcm
```

或者将音频文件拖到 `test-single.bat` 上即可测试该文件。

#### 2. 批量测试整个目录

双击运行 `test-batch.bat`，默认会测试目录：
```
D:\Users\AA\Music\文本声音PCM
```

或者将文件夹拖到 `test-batch.bat` 上即可测试该目录。

### 命令行用户

```bash
# 测试单个文件（使用默认文件）
npx tsx test/socketio-client-test.ts

# 测试指定文件
npx tsx test/socketio-client-test.ts "D:\Users\AA\Music\文本声音PCM\帮我讲个笑话.pcm"

# 批量测试目录
npx tsx test/socketio-client-test.ts --dir "D:\Users\AA\Music\文本声音PCM"

# 模拟音频流测试
npx tsx test/socketio-client-test.ts --simulate
```

## 📖 详细文档

请查看 [TEST_GUIDE.md](./TEST_GUIDE.md) 获取完整的使用说明，包括：

- 所有命令行参数说明
- 测试输出示例
- 故障排查指南
- 高级配置选项
- 代码集成示例

## 💡 测试前准备

1. **确保 STT 服务已启动**
   ```bash
   pnpm run dev
   ```

2. **准备音频文件**
   - 支持格式：PCM、WAV、MP3、OPUS
   - 推荐格式：16kHz, 16bit, 单声道 PCM
   - 默认音频目录：`D:\Users\AA\Music\文本声音PCM`

3. **检查依赖**
   ```bash
   pnpm install
   ```

## 🎯 常用测试场景

### 场景 1：快速验证服务是否正常

```bash
# 使用模拟音频流
npx tsx test/socketio-client-test.ts --simulate
```

### 场景 2：测试真实音频识别

```bash
# 使用默认音频文件
npx tsx test/socketio-client-test.ts
```

### 场景 3：批量评估识别准确率

```bash
# 测试整个目录
npx tsx test/socketio-client-test.ts --dir "D:\Users\AA\Music\文本声音PCM"
```

### 场景 4：测试远程服务器

```bash
# 指定服务器地址
npx tsx test/socketio-client-test.ts --server http://192.168.1.100:3000 --file "audio.pcm"
```

## 📊 测试输出说明

测试过程中会显示：

- ✅ 连接状态
- 🎤 会话信息（Session ID、Device SN、Trace ID）
- 🎵 音频发送进度
- 📝 实时识别结果（临时/最终）
- 📊 识别结果统计
- 🎯 完整识别文本

批量测试会额外显示：
- 📋 测试文件列表
- 📈 测试进度
- 📊 成功/失败统计
- 📝 详细测试报告

## 🔧 配置说明

### 默认配置

```typescript
// 服务器地址
serverUrl: 'http://localhost:3000'

// 默认音频文件
audioPath: 'D:\\Users\\AA\\Music\\文本声音PCM\\帮我讲个笑话.pcm'

// 音频发送参数
chunkSize: 3200      // 每块 3200 字节
interval: 100        // 每 100 毫秒发送一块
```

### 修改默认配置

如需修改默认路径，请编辑 `socketio-client-test.ts` 文件：

```typescript
// 在 main() 函数中找到这一行
if (!audioPath && mode !== 'simulate') {
    audioPath = 'D:\\Users\\AA\\Music\\文本声音PCM\\帮我讲个笑话.pcm'
    // 修改为您的默认路径
}
```

## 🐛 常见问题

### Q1: 提示 "连接超时" 或 "连接错误"

**A:** 请确认：
- STT 服务是否已启动（运行 `pnpm run dev`）
- 服务器地址是否正确（默认 `http://localhost:3000`）
- 防火墙是否允许连接

### Q2: 提示 "音频文件不存在"

**A:** 请确认：
- 文件路径是否正确
- 使用绝对路径
- Windows 路径注意使用双反斜杠 `\\` 或单斜杠 `/`

### Q3: 音频发送完成但没有识别结果

**A:** 可能原因：
- 音频格式不符合要求（检查采样率、位深度、声道数）
- 需要等待更长时间（修改代码中的等待时间）
- 查看服务器端日志了解详情

### Q4: 识别结果不准确

**A:** 请检查：
- 音频质量是否良好
- 音频格式是否正确
- STT 服务配置（检查 .env 文件中的 API 配置）

## 📞 技术支持

如遇到其他问题：

1. 查看 [TEST_GUIDE.md](./TEST_GUIDE.md) 中的故障排查章节
2. 检查服务器日志：`logs/` 目录
3. 确认音频文件格式和质量
4. 验证 STT 服务配置

## 📝 更新记录

- **2026-01-29**
  - ✨ 新增完整的测试客户端
  - ✨ 添加单文件和批量测试功能
  - ✨ 创建 Windows 快捷脚本
  - ✨ 添加详细的测试指南
  - ✨ 优化识别结果显示和统计

## 🤝 贡献

欢迎提出改进建议和问题反馈！
