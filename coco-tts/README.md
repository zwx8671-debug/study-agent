# Coco TTS Service

独立的 TTS（文本转语音）微服务，从 coco-cloud-ts 主工程的 `src/libs/voice` 拆分而来，
架构与 [coco-stt](../coco-stt) 保持一致。

## 功能特性

- ✅ 支持多种 TTS 服务提供商（火山引擎、Qwen、Azure、Mock）
- ✅ **流式文本输入**：一个会话内可多次 `tts:push` 增量推送文本，音频边合成边下发
- ✅ 双端口架构：Fastify 提供 HTTP API，uWebSockets.js + Socket.IO 提供流式通道
- ✅ msgpack 二进制序列化，音频传输免 base64 膨胀（省约 33%）
- ✅ 一条连接可串行复用多个会话，避免反复握手
- ✅ 基于 AsyncLocalStorage 的链路追踪（traceId / sessionId / deviceSN 自动进日志）
- ✅ 工厂模式，易于扩展新的 TTS 提供商
- ✅ TypeScript 类型安全

## 技术栈

- **运行时**: Node.js 20+
- **框架**: Fastify（HTTP）+ Socket.IO on uWebSockets.js（流式）
- **序列化**: socket.io-msgpack-parser
- **日志**: Pino（AsyncLocalStorage 上下文注入）
- **TTS 提供商**:
    - 火山引擎（Volcengine）大模型流式语音合成
    - Qwen（阿里云百炼）实时 / 非流式语音合成
    - Azure 认知服务语音合成
    - Mock TTS（无需任何密钥，用于本地开发与压测）

## 项目结构

```
coco-tts/
├── src/
│   ├── app.ts                          # 应用入口（双端口 + 优雅关闭）
│   ├── config/
│   │   └── env.ts                       # 环境配置
│   ├── interfaces/
│   │   └── ITTSSocket.ts                # Socket.IO 通信协议定义
│   ├── plugins/
│   │   └── uwebsockets-socketio.ts      # uWebSockets.js 承载 Socket.IO
│   ├── socketio/
│   │   └── TTSSocket.ts                 # Socket.IO 事件处理（TTSSocketHandler）
│   ├── http/
│   │   ├── TTSHttpRoute.ts              # HTTP 合成接口
│   │   └── TTSHttpRoute.types.ts        # HTTP 请求/响应类型
│   ├── tts/
│   │   ├── TTSBaseService.ts            # TTS 基类
│   │   ├── TTSFactory.ts                # TTS 工厂
│   │   ├── TTSHttpService.ts            # HTTP 侧的会话封装
│   │   ├── volcengine/                  # 火山引擎实现
│   │   ├── qwen/                        # Qwen（阿里云百炼）实现
│   │   ├── azure/                       # Azure 实现
│   │   └── mock/                        # Mock 实现
│   ├── types/
│   │   └── CommonResult.ts              # 统一 HTTP 响应体
│   └── utils/
│       ├── Logger.ts                    # 日志工具
│       ├── TraceContext.ts              # 链路追踪上下文
│       └── pcmToWav.ts                  # PCM/WAV 工具
├── test/
│   ├── socketio-client-test.ts          # Socket.IO 流式联调脚本
│   └── http-api-test.ts                 # HTTP 接口联调脚本
├── assets/                              # 音色配置
├── ecosystem.config.cjs                 # PM2 配置
├── Dockerfile
├── .env.local / .env.development / .env
└── TTS_HTTP_API.md                      # HTTP 接口文档
```

## 快速开始

### 1. 安装依赖

```bash
cd coco-tts
pnpm install
```

### 2. 配置环境变量

按 `NODE_ENV` 依次加载 `.env.{NODE_ENV}` 与 `.env`（先到先得，不覆盖已存在的变量），
因此建议把密钥放在被 gitignore 的 `.env` 中，把端口、实现类型等放在 `.env.{NODE_ENV}` 中。

```bash
# 服务器配置
PORT=3003              # Fastify HTTP API 端口
SOCKETIO_PORT=3002     # Socket.IO（uWebSockets.js）端口
LOG_LEVEL=info
PATH_PREFIX=

# TTS 实现选择（volcengine | azure | qwen | mock）
TTS_SERVICE_TYPE=volcengine

# 火山引擎配置
VOICE_API=wss://openspeech.bytedance.com
VOICE_TTS_APP_ID=your-app-id
VOICE_TTS_ACCESS_TOKEN=your-access-token
VOICE_TTS_RESOURCE_ID=volc.service_type.10029

# Qwen（阿里云百炼）配置
QWEN_API_KEY=your-api-key
QWEN_WORKSPACE_ID=llm-xxxx
QWEN_TTS_WS_URL=wss://llm-xxxx.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference
QWEN_TTS_MODEL=qwen-audio-3.0-tts-flash

# Azure 配置
SPEECH_KEY=your-speech-key
SPEECH_REGION=eastus

# WebSocket 握手/关闭等待超时（毫秒）
TTS_WS_TIMEOUT=10000

# 调试：把合成音频落盘为 WAV
SAVE_PCM=false
SAVE_PCM_DIR=./logs/pcm

# CORS
CORS_ORIGIN=*
```

### 3. 运行服务

```bash
# 本地 mock 模式（读取 .env.local，无需任何云端密钥）
pnpm local

# 开发模式（读取 .env + .env.development）
pnpm dev

# 生产模式
pnpm build
pnpm start:prod
```

启动后会打印两个端口，例如：

```
📦 HTTP API (Fastify):        0.0.0.0:3003
🔌 Socket.IO (uWebSockets.js): 0.0.0.0:3002
```

## Socket.IO 流式接口

客户端必须使用 `socket.io-msgpack-parser`，否则无法解析音频二进制。

一次连接的完整生命周期：

```
tts:connect     → tts:connected
tts:start       → tts:started          （一次连接可串行开启多个会话）
tts:push × N    → tts:data × M         （文本增量推送，音频分块流式返回）
tts:close       → tts:data ... tts:end （剩余音频发完后才回 tts:end）
tts:disconnect  → tts:disconnected
```

### 客户端 → 服务端

| 事件             | 载荷                                                                              | 说明                             |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| `tts:connect`    | `{ deviceSN, resourceId?, traceId? }`                                             | 建立上游 TTS 连接                |
| `tts:start`      | `{ sessionId, speaker?, emotion?, language?, loudness_rate?, speech_rate?, traceId? }` | 开启会话                     |
| `tts:push`       | `{ sessionId, text, traceId? }`                                                   | 增量推送文本，可多次调用         |
| `tts:close`      | `{ sessionId, traceId? }`                                                         | 关闭会话                         |
| `tts:disconnect` | `{ traceId? }`                                                                    | 优雅断开上游连接                 |
| `tts:interrupt`  | `{ traceId? }`                                                                    | 强制中断，不等待剩余音频         |

### 服务端 → 客户端

| 事件               | 载荷                                                                        | 说明                             |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------- |
| `tts:connected`    | `{ success, deviceSN, resourceId, format, sampleRate, error?, traceId? }`    | 连接结果，含音频格式与采样率     |
| `tts:started`      | `{ success, sessionId, speaker?, error?, traceId? }`                         | 会话启动结果                     |
| `tts:data`         | `{ sessionId, index, flag, buffer, format, sampleRate, traceId? }`          | 音频块，`flag` 为 `start`/`chunk` |
| `tts:end`          | `{ success, sessionId, index, error?, traceId? }`                            | 会话结束，`index` 为累计音频块数 |
| `tts:disconnected` | `{ deviceSN, resourceId, code, reason, traceId? }`                          | 上游连接已断开                   |
| `tts:error`        | `{ success: false, error, details?, sessionId?, traceId? }`                  | 错误                             |

### 客户端示例

```typescript
import { io } from 'socket.io-client'
import msgpackParser from 'socket.io-msgpack-parser'

const socket = io('http://localhost:3002', {
    transports: ['websocket'],
    parser: msgpackParser
})

const sessionId = crypto.randomUUID()
const chunks: Buffer[] = []

socket.on('connect', () => socket.emit('tts:connect', { deviceSN: 'device-001' }))

socket.on('tts:connected', res => {
    if (!res.success) throw new Error(res.error)
    socket.emit('tts:start', { sessionId, speaker: 'zh_female_wanwanxiaohe_moon_bigtts' })
})

socket.on('tts:started', async res => {
    if (!res.success) throw new Error(res.error)

    // 模拟 LLM 流式吐字，边出字边合成
    for (const text of ['你好，', '我是', '可可台灯。']) {
        socket.emit('tts:push', { sessionId, text })
    }
    socket.emit('tts:close', { sessionId })
})

socket.on('tts:data', res => chunks.push(res.buffer))

socket.on('tts:end', () => {
    console.log(`合成完成，共 ${chunks.length} 块`)
    socket.emit('tts:disconnect')
})
```

## HTTP 接口

完整文档见 [TTS_HTTP_API.md](./TTS_HTTP_API.md)。

| 方法 | 路径                    | 说明                                     |
| ---- | ----------------------- | ---------------------------------------- |
| GET  | `/` 或 `/test`          | 浏览器测试台：切换提供商、试听音色、流式播放 |
| GET  | `/health`               | 健康检查                                 |
| GET  | `/tts/status`           | 当前 TTS 实现、音频格式、默认音色        |
| GET  | `/tts/voices`           | 各提供商音色目录（供测试台使用）         |
| POST | `/tts/synthesize`       | 一次性合成，返回 base64 音频（支持 wav） |
| POST | `/tts/synthesize/stream`| 流式合成，chunked 边合成边下发字节流     |

合成请求体可带 `provider`（`volcengine` / `azure` / `qwen` / `mock`）按请求切换实现，不传则用环境变量 `TTS_SERVICE_TYPE`。

启动服务后打开 http://127.0.0.1:3003/ 即可试听。测试台流式走 Socket.IO（页面用 CDN 的 msgpack 客户端），一次性走 HTTP。

## 与主工程集成

主工程 coco-cloud-ts 通过 `TTS_SERVICE_TYPE=socketio` 切换到本服务，业务代码零改动：

```bash
# coco-cloud-ts 的 .env
TTS_SERVICE_TYPE=socketio
TTS_SERVER_URL=http://127.0.0.1:3002
# 需与本服务的 TTS_SERVICE_TYPE 一致，用于音色/情感/语速归一化
TTS_REMOTE_ENGINE=volcengine
```

主工程侧对应实现：

- `src/interfaces/ITTS.ts` — 协议定义（与本仓库 `ITTSSocket.ts` 一一对应，改协议需两侧同步）
- `src/services/TTSClientService.ts` — Socket.IO 客户端封装
- `src/libs/voice/socketio/TTSSocketIOService.ts` — 适配为 `TTSBaseService`，对调用方透明

## 测试

先启动服务（mock 模式即可跑通全链路），再运行联调脚本：

```bash
# 终端 1：mock 模式启动
pnpm local

# 终端 2：Socket.IO 流式联调（含流式文本输入、连接复用、首包延迟统计）
pnpm test:socketio

# 终端 2：HTTP 接口联调
pnpm test:http
```

脚本会把合成音频保存到 `test/output/*.wav`，可直接播放校验。
切换到真实引擎只需改 `TTS_SERVICE_TYPE`，脚本无需修改：

```powershell
$env:NODE_ENV='development'; pnpm local   # .env.development + .env（火山凭证）
```

主工程侧的适配器联调：

```bash
cd ../cocolamp-cloud-ts
yarn test:tts:adapter
```

## 开发指南

### 添加新的 TTS 提供商

1. 在 `src/tts/` 下创建新目录（如 `newprovider/`）
2. 继承 `TTSBaseService`，实现 `connect` / `start` / `push` / `close` / `disconnect` / `interrupt`
3. 覆写 `getAudioFormat()` / `getSampleRate()` 返回实际音频参数
4. 在 `TTSFactory` 中注册，并在 `env.ts` 中补充配置
5. 更新 `.env` 与本文档

### 代码规范

- 使用 TypeScript strict 模式
- 使用路径别名（`@config`、`@interface`、`@tts`、`@socketio`、`@plugins`、`@utils`）
- 提交前执行 `pnpm typecheck` 与 `pnpm format`

## 部署

运维交接文档见 [DEPLOYMENT.md](./DEPLOYMENT.md)，包含主工程环境变量变更、本服务全量环境变量、
上线顺序、验收方法与回滚步骤。

### PM2

```bash
pnpm build
pnpm pm2:start
pnpm pm2:logs
```

### Docker

```bash
# 构建镜像
pnpm docker:build

# 运行容器（HTTP 3003 / Socket.IO 3002）
docker run -d \
  --name coco-tts \
  -p 3003:3003 -p 3002:3002 \
  -e NODE_ENV=production \
  -e TTS_SERVICE_TYPE=volcengine \
  --env-file .env \
  coco-tts:latest
```

## 许可证

Private

## 维护者

- Coco AI Team
