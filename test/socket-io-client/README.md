# Socket.IO 客户端并发负载测试工具

这是一个重构后的模块化 Socket.IO 客户端负载测试工具，支持从 JSON 配置读取对话内容，并优先发送音频文件。

## 📁 项目结构

```
test/socket-io-client/
├── socket-load-test.ts          # 主测试文件
├── modules/                      # 功能模块目录
│   ├── AudioLoader.ts           # 音频加载器模块
│   ├── ChatDataProvider.ts      # 对话数据提供者模块
│   └── StatsCollector.ts        # 统计数据收集器模块
└── README.md                     # 本文档
```

## 🎯 功能特性

### 1. **模块化设计**
- ✅ **AudioLoader**: 负责音频文件的读取、验证和 base64 编码
- ✅ **ChatDataProvider**: 负责从 `chat-list.json` 读取和管理对话数据
- ✅ **StatsCollector**: 专门负责统计数据收集和输出
- ✅ **SocketClient**: 纯粹的 Socket.IO 客户端封装
- ✅ **LoadTestClient**: 测试客户端，组织上述模块完成测试流程

### 2. **音频优先策略**
- 根据 `chat-list.json` 中的文本，自动匹配音频文件
- 如果存在对应的 `.mp3` 文件，优先发送音频
- 如果没有音频文件，自动降级为发送纯文本
- 音频发送时，同时包含 `text` 和 `audio` 字段

### 3. **配置化测试数据**
- 从 `chat-list.json` 读取对话列表
- 支持顺序或随机选择对话内容
- 可配置每轮使用的对话数量

### 4. **详细的统计信息**
- 实时显示连接状态、事件发送数
- 区分音频发送和文本发送的统计
- 音频使用率计算
- 每个客户端的详细统计

## 🚀 使用方法

### 基本用法

```bash
# 使用默认配置运行
npm run test:socket-load

# 或者使用 yarn
yarn test:socket-load
```

### 环境变量配置

可以通过环境变量自定义测试参数：

```bash
# Windows (cmd)
set SERVER_URL=ws://192.168.10.234:8002/coco-cloud-ts
set CLIENT_COUNT=5
set CHAT_ROUNDS=10
set AUDIO_DIR=D:/Users/AA/Music/文本声音
set USE_AUDIO=true
npm run test:socket-load

# Windows (PowerShell)
$env:SERVER_URL="ws://192.168.10.234:8002/coco-cloud-ts"
$env:CLIENT_COUNT="5"
$env:CHAT_ROUNDS="10"
$env:AUDIO_DIR="D:/Users/AA/Music/文本声音"
$env:USE_AUDIO="true"
npm run test:socket-load

# Linux/Mac
export SERVER_URL=ws://192.168.10.234:8002/coco-cloud-ts
export CLIENT_COUNT=5
export CHAT_ROUNDS=10
export AUDIO_DIR=/path/to/audio
export USE_AUDIO=true
npm run test:socket-load
```

## ⚙️ 配置参数

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `SERVER_URL` | `ws://192.168.10.234:8002/coco-cloud-ts` | Socket.IO 服务器地址 |
| `CLIENT_COUNT` | `10` | 并发客户端数量 |
| `EMIT_INTERVAL` | `1000` | CHAT 事件发送间隔（毫秒） |
| `RTT_INTERVAL` | `3000` | RTT 心跳间隔（毫秒） |
| `CHAT_ROUNDS` | `3` | 每个客户端的对话轮次 |
| `DEVICE_SN_PREFIX` | `YC` | 模拟设备 SN 前缀 |
| `AUDIO_DIR` | `D:/Users/AA/Music/文本声音` | 音频文件目录 |
| `CHAT_LIST_PATH` | `{AUDIO_DIR}/chat-list.json` | 对话列表文件路径 |
| `USE_AUDIO` | `true` | 是否优先使用音频（设为 `false` 禁用） |
| `CHAT_MODE` | `sequential` | 对话选择模式：`sequential`（顺序）或 `random`（随机） |

## 📝 chat-list.json 格式

在音频目录中创建 `chat-list.json` 文件，格式如下：

```json
{
  "chatList": [
    { "id": 1, "text": "你好，请介绍一下你自己" },
    { "id": 2, "text": "今天天气怎么样？" },
    { "id": 3, "text": "帮我讲个笑话" }
  ]
}
```

## 🔊 音频文件命名规则

音频文件需要与 `chat-list.json` 中的 `text` 字段匹配：

```
D:/Users/AA/Music/文本声音/
├── chat-list.json
├── 你好，请介绍一下你自己.mp3
├── 今天天气怎么样？.mp3
└── 帮我讲个笑话.mp3
```

**注意**：
- 音频文件名必须与对话文本**完全一致**
- 支持的音频格式：`.mp3`, `.wav`, `.pcm`
- 如果音频文件不存在，会自动降级为文本发送

## 📊 统计输出示例

### 运行中的统计（每 10 秒）

```
----------------------------------------
运行时间: 15.2s
连接中: 10
已断开: 0
总 CHAT: 25 (音频: 18, 文本: 7)
总 DONE: 20
总 RTT: 45
总错误: 0
----------------------------------------
```

### 最终统计

```
========================================
最终统计:
========================================
总运行时间: 42.35s
总客户端数: 10
成功连接: 10
总 CHAT 事件: 30 (0.71 次/秒)
  - 音频发送: 22 (73.3%)
  - 文本发送: 8
总 DONE 事件: 30 (0.71 次/秒)
总 RTT 事件: 130 (3.07 次/秒)
总错误数: 0
错误率: 0.00%

每客户端统计:
  客户端 1 (YC001):
    运行时间: 42.15s
    CHAT: 3 (音频: 2, 文本: 1), DONE: 3, RTT: 13
    错误: 0
  ...
========================================
```

## 🏗️ 模块职责说明

### AudioLoader
- 检查音频文件是否存在
- 读取音频文件并转换为 base64
- 缓存音频数据（小于 10MB）
- 支持多种音频格式

### ChatDataProvider
- 加载 chat-list.json 文件
- 提供顺序或随机获取对话的方法
- 支持按索引或 ID 查询对话

### StatsCollector
- 初始化和管理客户端统计
- 记录各种事件（CHAT、DONE、RTT、错误等）
- 区分音频和文本发送统计
- 定期输出和最终统计报告

### SocketClient
- Socket.IO 连接管理
- 事件监听和发送
- 连接状态检查

### LoadTestClient
- 组织各个模块完成测试流程
- 管理测试轮次和定时器
- 发送 CHAT、DONE、RTT 事件
- 实现音频优先逻辑

## 🎨 使用示例

### 示例 1: 基本负载测试（10 个客户端，3 轮对话）

```bash
npm run test:socket-load
```

### 示例 2: 大规模测试（100 个客户端，10 轮对话）

```bash
set CLIENT_COUNT=100
set CHAT_ROUNDS=10
npm run test:socket-load
```

### 示例 3: 仅文本测试（禁用音频）

```bash
set USE_AUDIO=false
npm run test:socket-load
```

### 示例 4: 随机对话模式

```bash
set CHAT_MODE=random
npm run test:socket-load
```

## 🔧 开发和调试

### 添加新的对话

1. 编辑 `chat-list.json`，添加新的对话项
2. 如果有对应音频，将音频文件放到同一目录
3. 重新运行测试

### 修改音频加载逻辑

编辑 `modules/AudioLoader.ts`，修改 `loadAudio` 方法

### 修改统计输出格式

编辑 `modules/StatsCollector.ts`，修改 `printStats` 或 `printFinalStats` 方法

## 📦 依赖

- `socket.io-client`: Socket.IO 客户端库
- `fs`: Node.js 文件系统模块
- `path`: Node.js 路径模块

## 🐛 故障排除

### 问题 1: 音频文件加载失败

**解决方案**：
- 检查音频文件路径是否正确
- 确认文件名与 `chat-list.json` 中的文本完全匹配
- 检查文件格式是否支持（.mp3, .wav, .pcm）

### 问题 2: 连接服务器失败

**解决方案**：
- 检查 `SERVER_URL` 是否正确
- 确认服务器正在运行
- 检查网络连接

### 问题 3: chat-list.json 读取失败

**解决方案**：
- 检查 JSON 格式是否正确
- 确认文件路径是否正确
- 检查文件编码是否为 UTF-8

## 📄 许可证

本项目遵循项目根目录的许可证。
