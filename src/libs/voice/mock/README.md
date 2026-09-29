# Mock 策略模式实现

本目录包含了 STT、LLM、TTS 的 Mock 策略实现，用于模拟真实的语音识别、语言模型和语音合成服务。

## 📁 文件结构

```
mock/
├── MockSTTService.ts    # STT Mock 实现
├── MockLLMService.ts    # LLM Mock 实现
├── MockTTSService.ts    # TTS Mock 实现
└── README.md            # 本文档
```

## 🎯 设计目标

### 1. MockSTTService（语音转文本）

- ✅ 模拟 STT 的内存消耗（累积音频数据到缓冲区）
- ✅ 模拟事件循环处理（使用 setTimeout 异步处理）
- ✅ 随机选择预设文本作为转译结果
- ✅ 完整的生命周期事件（starting, connecting, started, closing, closed 等）

### 2. MockLLMService（大语言模型）

- ✅ 不管输入什么，随机选择一段长文本
- ✅ 逐字输出（每个字 50-100ms 延迟）
- ✅ 流式输出（返回 Readable 流）
- ✅ 中文标点符号有不同的延迟

### 3. MockTTSService（文本转语音）

- ✅ 不管输入什么文本，都输出预设的音频数据
- ✅ 使用定时器逐个输出音频块
- ✅ 模拟真实的 TTS 会话管理
- ✅ 完整的生命周期事件

## 🚀 使用方法

### 方式一：环境变量配置

在 `.env.local` 文件中设置以下环境变量：

```bash
# 启用 Mock STT
STT_SERVICE_TYPE=mock

# 启用 Mock TTS
TTS_SERVICE_TYPE=mock

# 启用 Mock LLM
USE_MOCK_LLM=true
```

设置后，系统会自动使用 Mock 实现替代真实的服务。

### 方式二：直接使用工厂类

```typescript
import { STTFactory, STTServiceType } from './STTFactory'
import { TTSFactory, TTSServiceType } from './TTSFactory'

// 创建 Mock STT 实例
const stt = STTFactory.createSTT(STTServiceType.Mock, 'device-001')

// 创建 Mock TTS 实例
const tts = TTSFactory.createTTS(TTSServiceType.Mock, 'device-001')
```

### 方式三：直接实例化

```typescript
import { MockSTTService } from './mock/MockSTTService'
import { MockLLMService } from './mock/MockLLMService'
import { MockTTSService } from './mock/MockTTSService'

// 创建实例
const stt = new MockSTTService('device-001')
const tts = new MockTTSService('device-001')

// 使用 LLM
const llmStream = await MockLLMService.chat()
```

## 📝 代码示例

### STT 示例

```typescript
import { MockSTTService } from './mock/MockSTTService'
import { AudioFormatEnum } from '@interface/IAgent'

const stt = new MockSTTService('test-device')

// 监听识别结果
stt.on('data', (text) => {
    console.log('识别结果:', text)
})

// 启动
await stt.start(AudioFormatEnum.PCM)

// 推送音频数据
stt.push('base64-audio-data')

// 关闭（会输出识别结果）
await stt.close()

// 断开连接
stt.disconnect()
```

### LLM 示例

```typescript
import { MockLLMService } from './mock/MockLLMService'

const stream = await MockLLMService.chat()

stream.on('data', (chunk) => {
    console.log('收到字符:', chunk.toString())
})

stream.on('end', () => {
    console.log('流结束')
})
```

### TTS 示例

```typescript
import { MockTTSService } from './mock/MockTTSService'

const tts = new MockTTSService('test-device')

// 监听音频数据
tts.on('data', (buffer) => {
    console.log('收到音频:', buffer.length, 'bytes')
})

// 连接
await tts.connect()

// 启动会话
const sessionId = 'session-001'
await tts.start(sessionId, 'speaker', 'happy', 'zh-CN')

// 推送文本
await tts.push(sessionId, '你好，世界！')

// 关闭会话
await tts.close(sessionId)

// 断开连接
await tts.disconnect()
```

## 🧪 运行测试

项目包含了完整的测试文件 `test/mock-strategy-test.ts`：

```bash
# 使用 ts-node 运行测试
npx ts-node test/mock-strategy-test.ts

# 或者使用 tsx
npx tsx test/mock-strategy-test.ts
```

测试内容包括：

- ✅ 单独测试 MockSTT
- ✅ 单独测试 MockLLM
- ✅ 单独测试 MockTTS
- ✅ 集成测试（STT -> LLM -> TTS 完整流程）

## 🔍 特性说明

### MockSTTService 特性

1. **内存消耗模拟**
    - 使用数组累积音频数据：`audioBuffer: string[]`
    - 记录总大小：`totalAudioSize: number`

2. **事件循环模拟**
    - 使用 `setTimeout` 模拟异步处理
    - 随机延迟 50-150ms

3. **预设文本池**
    - 包含 10 条中文文本
    - 随机选择一条作为识别结果

### MockLLMService 特性

1. **逐字输出**
    - 每个字符单独推送到流
    - 普通字符：50-100ms 延迟
    - 标点符号：100-150ms 延迟

2. **预设长文本池**
    - 包含 8 段 200-500 字的中文文本
    - 涵盖科技、教育、环保等主题

### MockTTSService 特性

1. **预设音频数据**
    - 生成 10 个不同大小的 Buffer
    - 使用正弦波模式填充
    - 大小范围：1024-4096 字节

2. **会话管理**
    - 支持多会话并发
    - 文本队列处理
    - 定时器控制输出频率

3. **音频输出**
    - 每 150ms 处理一次队列
    - 每次输出 3-5 个音频块
    - 随机选择预设的 Buffer

## 💡 适用场景

1. **开发测试**
    - 不依赖外部 API
    - 快速验证业务逻辑
    - 模拟各种场景

2. **压力测试**
    - 测试系统并发能力
    - 验证内存管理
    - 检查事件循环性能

3. **演示和培训**
    - 无需真实 API 凭证
    - 可控的输出结果
    - 便于理解流程

## ⚠️ 注意事项

1. Mock 服务**不会**真正处理音频或文本内容
2. 输出结果是**预设**的，与输入无关
3. 仅用于**开发和测试**，不要在生产环境使用
4. Mock LLM 输出的文本较长，完整输出需要 20-40 秒

## 📚 扩展开发

如需添加更多预设文本或音频数据：

```typescript
// 在 MockSTTService.ts 中添加文本
private static readonly
TEXT_POOL = [
    '你好，我是智能助手',
    '新增的预设文本',
    // ... 更多文本
]

// 在 MockLLMService.ts 中添加长文本
private static readonly
LONG_TEXT_POOL = [
    `这是一段新的长文本...`,
    // ... 更多长文本
]

// 在 MockTTSService.ts 中调整音频参数
const size = 2048 + Math.floor(Math.random() * 2048) // 修改大小范围
```

## 🎨 策略模式优势

1. **易于切换**：通过环境变量快速切换真实/Mock 实现
2. **符合接口**：完全遵循 Base 类的接口定义
3. **独立维护**：Mock 代码与真实实现互不影响
4. **便于测试**：提供可控、稳定的测试环境

---

**作者**: AI Assistant  
**日期**: 2026-01-19  
**版本**: 1.0.0
