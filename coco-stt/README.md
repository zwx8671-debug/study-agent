# Coco STT Service

基于 TypeScript 的独立 STT（语音转文本）服务，支持多种 STT 提供商。

## 功能特性

- ✅ 支持多种 STT 服务提供商（火山引擎、Azure、Mock）
- ✅ 基于 Socket.IO 的实时流式识别
- ✅ 工厂模式，易于扩展新的 STT 提供商
- ✅ 完善的日志系统
- ✅ TypeScript 类型安全
- ✅ 支持多环境配置

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Fastify + Socket.IO
- **语言**: TypeScript
- **STT 提供商**:
  - 火山引擎（Volcengine）流式语音识别
  - Azure 认知服务语音识别
  - Mock STT（用于测试）

## 项目结构

```
coco-stt/
├── src/
│   ├── app.ts                      # 应用入口
│   ├── config/
│   │   └── env.ts                  # 环境配置
│   ├── interfaces/
│   │   └── ISTT.ts                 # STT 接口定义
│   ├── libs/
│   │   └── voice/
│   │       ├── STTBaseService.ts   # STT 基类
│   │       ├── STTFactory.ts       # STT 工厂
│   │       ├── azure/              # Azure STT 实现
│   │       ├── volcengine/         # 火山引擎 STT 实现
│   │       └── mock/               # Mock STT 实现
│   ├── socketio/
│   │   └── STTSocket.ts            # Socket.IO 事件处理
│   ├── utils/
│   │   └── Logger.ts               # 日志工具
│   └── types/
│       └── env.d.ts                # 类型声明
├── package.json
├── tsconfig.json
├── .env                            # 环境变量（本地）
├── .env.development                # 开发环境
├── .env.prod                       # 生产环境
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
cd coco-stt
yarn install
```

### 2. 配置环境变量

复制 `.env.development` 为 `.env` 并修改配置：

```bash
# 服务器配置
NODE_ENV=local
PORT=3001
LOG_LEVEL=info

# STT 服务选择（volcengine | azure | mock）
STT_SERVICE_TYPE=volcengine

# 火山引擎配置
VOICE_API=wss://your-api-endpoint
VOICE_STT_APP_ID=your-app-id
VOICE_STT_ACCESS_TOKEN=your-access-token
VOICE_STT_RESOURCE_ID=volc.bigmodel.auc

# Azure 配置
AZURE_SPEECH_KEY=your-speech-key
AZURE_SPEECH_REGION=eastasia

# CORS
CORS_ORIGIN=*
```

### 3. 运行服务

开发模式：
```bash
yarn dev
```

生产模式：
```bash
yarn build
yarn start
```

## API 文档

完整 HTTP 接口文档见 [HTTP_API.md](./HTTP_API.md)。

### Socket.IO 事件

#### 客户端发送事件

**1. stt:start** - 开始 STT 会话
```typescript
{
  deviceSN: string
  sessionId: string
  traceId?: string
}
```

**2. stt:audio** - 发送音频数据
```typescript
{
  sessionId: string
  audio: Array<{
    format: 'pcm' | 'wav' | 'mp3' | 'opus'
    base64: string
  }>
  traceId?: string
}
```

**3. stt:end** - 结束 STT 会话
```typescript
{
  deviceSN: string
  sessionId: string
  end: true
  traceId?: string
}
```

#### 服务器发送事件

**1. stt:started** - 会话已启动
```typescript
{
  success: boolean
  sessionId: string
  traceId?: string
}
```

**2. stt:data** - 识别结果（流式）
```typescript
{
  sessionId: string
  text: string
  isFinal: boolean
  traceId?: string
}
```

**3. stt:ended** - 会话已结束
```typescript
{
  success: boolean
  sessionId: string
  traceId?: string
}
```

**4. stt:error** - 错误事件
```typescript
{
  success: false
  sessionId: string
  error: string
  traceId?: string
}
```

### HTTP 端点

**GET /health** - 健康检查
```json
{
  "status": "ok",
  "service": "coco-stt",
  "version": "1.0.0",
  "timestamp": "2026-01-28T08:00:00.000Z"
}
```

**GET /stt/status** - STT 服务状态
```json
{
  "sttServiceType": "volcengine",
  "available": true
}
```

## 使用示例

### Socket.IO 客户端示例

```typescript
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

// 连接成功
socket.on('connect', () => {
  console.log('Connected to STT service')
  
  // 开始 STT 会话
  socket.emit('stt:start', {
    deviceSN: 'device-001',
    sessionId: 'session-123',
    traceId: 'trace-456'
  })
})

// 监听会话启动
socket.on('stt:started', (data) => {
  console.log('STT session started:', data)
  
  // 发送音频数据
  socket.emit('stt:audio', {
    sessionId: 'session-123',
    audio: [{
      format: 'pcm',
      base64: audioBase64String
    }],
    traceId: 'trace-456'
  })
})

// 监听识别结果
socket.on('stt:data', (data) => {
  console.log('STT result:', data.text)
})

// 监听错误
socket.on('stt:error', (error) => {
  console.error('STT error:', error)
})

// 结束会话
function endSession() {
  socket.emit('stt:end', {
    deviceSN: 'device-001',
    sessionId: 'session-123',
    end: true,
    traceId: 'trace-456'
  })
}
```

## 开发指南

### 添加新的 STT 提供商

1. 在 `src/libs/voice/` 下创建新目录（如 `newprovider/`）
2. 实现 `STTBaseService` 抽象类
3. 在 `STTFactory.ts` 中注册新提供商
4. 在 `env.ts` 中添加配置
5. 更新 `.env` 文件

### 代码规范

- 使用 TypeScript strict 模式
- 遵循 ESLint 规则
- 使用 Prettier 格式化代码
- 使用路径别名（@interface, @libs, @utils 等）

### 测试

使用 Mock STT 服务进行测试：

```bash
# 设置环境变量
STT_SERVICE_TYPE=mock

# 启动服务
yarn dev
```

## 部署

### Docker 部署

```bash
# 构建镜像
docker build -t coco-stt:latest .

# 运行容器
docker run -d \
  --name coco-stt \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e STT_SERVICE_TYPE=volcengine \
  coco-stt:latest
```

### 环境变量检查

启动时会自动检查必需的环境变量，确保服务配置正确。

## 许可证

Private

## 维护者

- Coco AI Team
