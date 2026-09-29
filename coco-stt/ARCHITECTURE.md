# Coco STT 技术架构文档

## 概述

Coco STT 是一个独立的语音转文本（Speech-to-Text）服务，从主项目 coco-cloud-ts 中分离而来。该服务专注于提供实时流式语音识别功能，支持多种 STT 提供商。

## 技术选型

### 核心技术栈

| 技术 | 版本 | 用途 |
|-----|------|-----|
| Node.js | 18+ | 运行时环境 |
| TypeScript | 5.x | 类型安全的开发语言 |
| Fastify | 5.x | 高性能 Web 框架 |
| Socket.IO | 4.x | 实时双向通信 |
| Pino | 9.x | 高性能日志系统 |

### STT 提供商

1. **火山引擎（Volcengine）** - 默认提供商
   - 流式语音识别大模型
   - WebSocket 连接
   - 支持实时流式识别

2. **Azure 认知服务**
   - Microsoft Speech SDK
   - 高精度识别
   - 多语言支持

3. **Mock STT**
   - 用于开发和测试
   - 模拟真实 STT 行为

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Client Applications                   │
│         (机器人设备、Web 应用、移动应用等)                  │
└────────────────────┬────────────────────────────────────┘
                     │ Socket.IO
                     ↓
┌─────────────────────────────────────────────────────────┐
│                  Coco STT Service                        │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │           Socket.IO Handler                     │    │
│  │   - Connection Management                       │    │
│  │   - Event Routing                               │    │
│  │   - Session Management                          │    │
│  └─────────────┬──────────────────────────────────┘    │
│                │                                         │
│  ┌─────────────▼──────────────────────────────────┐    │
│  │           STT Factory                           │    │
│  │   - Service Selection                           │    │
│  │   - Instance Creation                           │    │
│  └─────────────┬──────────────────────────────────┘    │
│                │                                         │
│  ┌─────────────▼──────────────────────────────────┐    │
│  │        STT Base Service (Abstract)              │    │
│  └─────────────┬──────────────────────────────────┘    │
│                │                                         │
│     ┌──────────┴──────────┬──────────────┐             │
│     ↓                     ↓               ↓             │
│  ┌──────┐           ┌──────┐        ┌──────┐          │
│  │Volc  │           │Azure │        │Mock  │          │
│  │STT   │           │STT   │        │STT   │          │
│  └──┬───┘           └──┬───┘        └──────┘          │
│     │                  │                                │
└─────┼──────────────────┼────────────────────────────────┘
      │                  │
      ↓                  ↓
┌───────────┐      ┌──────────────┐
│Volcengine │      │Azure Speech  │
│   API     │      │   Service    │
└───────────┘      └──────────────┘
```

### 设计模式

#### 1. 工厂模式（Factory Pattern）

**STTFactory** 负责根据配置创建不同的 STT 服务实例：

```typescript
STTFactory.create(sessionId) 
  → STTVolcengineStreamService
  → STTAzureStreamService  
  → MockSTTService
```

**优势：**
- 解耦服务创建逻辑
- 易于添加新的 STT 提供商
- 统一的服务接口

#### 2. 策略模式（Strategy Pattern）

所有 STT 服务都实现 `STTBaseService` 抽象类：

```typescript
abstract class STTBaseService {
  abstract start(): Promise<STTBaseService>
  abstract push(audioData: Buffer): void
  abstract close(): Promise<STTBaseService>
  abstract disconnect(): void
}
```

**优势：**
- 算法可互换
- 易于扩展
- 隔离实现细节

#### 3. 观察者模式（Observer Pattern）

STT 服务使用 EventEmitter 发送事件：

```typescript
sttService.on('data', (text) => { /* 处理识别结果 */ })
sttService.on('error', (error) => { /* 处理错误 */ })
sttService.on('closed', () => { /* 会话结束 */ })
```

**优势：**
- 解耦事件发送和处理
- 支持多个监听器
- 异步处理

## 核心模块

### 1. Socket.IO 处理层

**文件**: `src/socketio/STTSocket.ts`

**职责**:
- 管理 WebSocket 连接
- 处理客户端事件（start, audio, end）
- 维护活跃会话映射
- 错误处理和会话清理

**关键实现**:
```typescript
class STTSocketHandler {
  private activeSessions: Map<string, STTBaseService>
  
  handleSTTStart()  // 创建并启动 STT 会话
  handleSTTAudio()  // 推送音频数据
  handleSTTEnd()    // 结束 STT 会话
  handleDisconnect() // 清理断开连接的会话
}
```

### 2. STT 工厂

**文件**: `src/libs/voice/STTFactory.ts`

**职责**:
- 根据配置选择 STT 提供商
- 创建 STT 服务实例

### 3. STT 基类

**文件**: `src/libs/voice/STTBaseService.ts`

**职责**:
- 定义 STT 服务接口
- 管理服务状态（Created, Starting, Started, Closing, Closed）
- 提供事件系统

### 4. STT 实现

#### 火山引擎实现
**文件**: `src/libs/voice/volcengine/STTVolcengineStreamService.ts`

**特点**:
- 使用 WebSocket 连接
- 自定义二进制协议
- GZIP 压缩
- 流式识别

#### Azure 实现
**文件**: `src/libs/voice/azure/STTAzureStreamService.ts`

**特点**:
- 使用 Microsoft Speech SDK
- Push 音频流模式
- 连续识别

#### Mock 实现
**文件**: `src/libs/voice/mock/MockSTTService.ts`

**特点**:
- 随机返回预设文本
- 模拟异步处理
- 用于测试和演示

## 数据流

### STT 会话生命周期

```
1. 客户端连接 Socket.IO
   ↓
2. 发送 stt:start 事件
   ↓
3. 服务器创建 STT 服务实例
   ↓
4. STT 服务连接到提供商
   ↓
5. 返回 stt:started 事件
   ↓
6. 客户端发送音频数据 (stt:audio)
   ↓
7. 服务器推送音频到 STT 服务
   ↓
8. STT 服务识别并返回文本
   ↓
9. 服务器发送 stt:data 事件到客户端
   ↓
10. 客户端发送 stt:end 事件
   ↓
11. 服务器关闭 STT 服务
   ↓
12. 返回 stt:ended 事件
```

### 音频数据处理

```
原始音频
  ↓
Base64 编码 (客户端)
  ↓
Socket.IO 传输
  ↓
Base64 解码 (服务器)
  ↓
Buffer 对象
  ↓
推送到 STT 服务
  ↓
[Volcengine: GZIP 压缩 → WebSocket]
[Azure: Push Stream → Speech SDK]
[Mock: 累积到缓冲区]
  ↓
识别结果
  ↓
文本返回
```

## 配置管理

### 环境变量

```bash
# 服务配置
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# STT 提供商选择
STT_SERVICE_TYPE=volcengine

# 火山引擎配置
VOICE_API=wss://...
VOICE_STT_APP_ID=...
VOICE_STT_ACCESS_TOKEN=...
VOICE_STT_RESOURCE_ID=...

# Azure 配置
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastasia
```

### 配置加载优先级

1. `.env.{NODE_ENV}` (如 .env.production)
2. `.env`
3. 系统环境变量

## 错误处理

### 错误类型

1. **连接错误**: WebSocket 连接失败
2. **超时错误**: STT 启动或关闭超时
3. **识别错误**: STT 服务返回错误
4. **会话错误**: 会话不存在或状态异常

### 错误处理策略

```typescript
try {
  await sttService.start()
} catch (error) {
  // 1. 记录错误日志
  log.errorMsg('STT start failed', { error })
  
  // 2. 发送错误事件到客户端
  socket.emit('stt:error', {
    success: false,
    sessionId,
    error: error.message
  })
  
  // 3. 清理资源
  sttService.disconnect()
  activeSessions.delete(sessionId)
}
```

## 日志系统

### 日志级别

- **trace**: 详细调试信息
- **debug**: 调试信息
- **info**: 常规信息（默认）
- **warn**: 警告信息
- **error**: 错误信息
- **fatal**: 致命错误

### 日志格式

```json
{
  "level": "info",
  "time": "2026-01-28 16:30:00.123",
  "msg": "STT session started",
  "deviceSN": "device-001",
  "sessionId": "session-123",
  "traceId": "trace-456",
  "module": "STTSocket"
}
```

## 性能优化

### 1. 连接复用
- Socket.IO 长连接
- 多个 STT 会话共享同一连接

### 2. 内存管理
- 会话结束后及时清理
- 使用 Buffer 而非字符串处理音频

### 3. 异步处理
- 所有 I/O 操作使用 async/await
- 避免阻塞事件循环

### 4. 日志优化
- 生产环境使用 JSON 格式
- 避免频繁的日志输出

## 扩展性

### 添加新的 STT 提供商

1. 创建新目录: `src/libs/voice/newprovider/`
2. 实现 STTBaseService:
```typescript
export class STTNewProviderService extends STTBaseService {
  async start() { /* 实现 */ }
  push(audioData: Buffer) { /* 实现 */ }
  async close() { /* 实现 */ }
  disconnect() { /* 实现 */ }
}
```
3. 更新 STTFactory
4. 添加配置
5. 更新文档

### 横向扩展

- 使用负载均衡器（如 Nginx）
- 多实例部署
- Session 粘性（Sticky Session）或分布式会话管理

## 安全考虑

1. **认证**: 可集成 JWT 或 API Key 认证
2. **授权**: 基于设备 SN 的访问控制
3. **传输加密**: 使用 WSS (WebSocket Secure)
4. **输入验证**: 验证音频格式和大小
5. **速率限制**: 防止滥用

## 监控指标

- 活跃连接数
- STT 会话数
- 平均识别延迟
- 错误率
- CPU 和内存使用率

## 未来规划

1. 支持更多 STT 提供商（Google、IBM、讯飞等）
2. 添加音频预处理（降噪、增强）
3. 支持批量识别
4. 添加缓存层
5. 实现 gRPC 接口
6. 支持多语言识别
7. 添加识别结果后处理（标点、纠错）

## 参考资料

- [Fastify 文档](https://fastify.dev/)
- [Socket.IO 文档](https://socket.io/)
- [火山引擎语音识别 API](https://www.volcengine.com/docs/6561/80813)
- [Azure 语音服务](https://learn.microsoft.com/azure/cognitive-services/speech-service/)
