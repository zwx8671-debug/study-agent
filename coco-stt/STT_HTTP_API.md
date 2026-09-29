# Coco STT HTTP 接口文档

本文档仅覆盖 HTTP 接口，不包含 Socket.IO 流式识别事件。

## 基础信息

| 项目 | 说明 |
| --- | --- |
| 默认 Base URL | `http://localhost:4001` |
| 默认 HTTP 端口 | `PORT` 环境变量，未配置时为 `4001` |
| 数据格式 | JSON；`/stt/recognize` 使用二进制 WAV 音频流 |
| 通用响应格式 | `{ "code": number, "msg": string, "data"?: object }` |
| CORS | 由 `CORS_ORIGIN` 环境变量控制，默认 `*` |

### 通用成功响应

```json
{
  "code": 200,
  "msg": "ok",
  "data": {}
}
```

### 通用错误响应

```json
{
  "code": 400,
  "msg": "错误原因",
  "data": {
    "traceId": "trace-xxx"
  }
}
```

### 常见 HTTP 状态码

| 状态码 | 说明 |
| --- | --- |
| `200` | 请求成功 |
| `400` | 请求参数或请求体不合法 |
| `413` | 上传音频超过接口限制 |
| `500` | STT 服务调用失败或内部错误 |

## 接口列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/stt/status` | STT 服务状态 |
| `POST` | `/stt/recognize` | 上传完整 WAV 音频并同步返回识别文本 |
| `POST` | `/stt/file/recognize` | 同步识别录音文件（火山引擎极速版） |

## GET /health

健康检查接口。

### 请求

无请求参数。

### 响应 data

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 服务状态，固定为 `ok` |
| `service` | string | 服务名，固定为 `coco-stt` |
| `version` | string | 服务版本 |
| `timestamp` | string | 服务端当前 ISO 时间 |
| `config.enableUWS` | boolean | 是否启用 uWebSockets.js 模式 |
| `config.msgPacket` | string | Socket.IO 消息包配置 |
| `config.sttServiceType` | string | 当前 STT 服务类型 |

### 响应示例

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "status": "ok",
    "service": "coco-stt",
    "version": "1.0.0",
    "timestamp": "2026-07-27T08:00:00.000Z",
    "config": {
      "enableUWS": true,
      "msgPacket": "BYTE",
      "sttServiceType": "volcengine"
    }
  }
}
```

### 调用示例

```bash
curl http://localhost:4001/health
```

## GET /stt/status

查询当前 STT 服务状态。

### 请求

无请求参数。

### 响应 data

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sttServiceType` | string | 当前 STT 服务类型，来自 `STT_SERVICE_TYPE` |
| `available` | boolean | 服务是否可用 |

### 响应示例

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "sttServiceType": "volcengine",
    "available": true
  }
}
```

### 调用示例

```bash
curl http://localhost:4001/stt/status
```

## POST /stt/recognize

上传一个完整 WAV 文件，服务端同步完成识别后返回文本。

### 请求

| 项目 | 说明 |
| --- | --- |
| Content-Type | `application/octet-stream` |
| Body | WAV 文件原始二进制内容，必须包含完整 WAV 文件头 |
| 音频大小限制 | 最大 `20MB` |

### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `language` | string | 否 | `zh-CN` | 识别语言，例如 `zh-CN`、`en-US`、`ja-JP` |
| `traceId` | string | 否 | 服务端自动生成 UUID | 调用方自定义追踪 ID |

### 响应 data

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `text` | string | 识别文本；无法识别时可能为空字符串 |
| `traceId` | string | 请求追踪 ID |

### 响应示例

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "text": "你好，我是智能助手",
    "traceId": "trace-001"
  }
}
```

### 错误示例

请求体为空：

```json
{
  "code": 400,
  "msg": "请求体不能为空，需要提供 Content-Type: application/octet-stream 的 WAV 音频数据",
  "data": {
    "traceId": "trace-001"
  }
}
```

音频不是有效 WAV：

```json
{
  "code": 400,
  "msg": "仅支持 WAV 格式音频（请确保 Content-Type: application/octet-stream 发送的是有效的 WAV 文件）。",
  "data": {
    "traceId": "trace-001"
  }
}
```

### 调用示例

```bash
curl -X POST "http://localhost:4001/stt/recognize?language=zh-CN&traceId=trace-001" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@audio.wav"
```

## POST /stt/file/recognize

同步识别录音文件，一次请求即返回结果。固定走火山引擎录音文件识别极速版，不受 `STT_SERVICE_TYPE` 切换影响。

上游文档：https://docs.volcengine.com/docs/6561/2608628?lang=zh

### 请求

| 项目 | 说明 |
| --- | --- |
| Content-Type | `application/json` |
| Body 限制 | 受 Fastify `bodyLimit` 限制，当前为 `50MB` |
| 上游限制 | 音频时长不超过 2 小时，大小不超过 100MB，格式支持 WAV / MP3 / OGG / OPUS |

### Body 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | string | 与 `audioData` 二选一 | - | 音频文件 URL |
| `audioData` | string | 与 `url` 二选一 | - | 音频 base64 数据，不包含 Data URL 前缀 |
| `audioFormat` | string | 否 | `wav` | 音频格式 |
| `language` | string | 否 | `zh-CN` | 识别语言 |
| `traceId` | string | 否 | 服务端自动生成 UUID | 调用方自定义追踪 ID |

### 响应 data

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `taskId` | string | 请求 ID，即火山引擎请求头 `X-Api-Request-Id` |
| `text` | string | 识别全文 |
| `utterances` | array | 逐句识别结果 |
| `traceId` | string | 请求追踪 ID |

### utterances 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `text` | string | 句子文本 |
| `start_time` | number | 开始时间，单位由上游 STT 服务定义 |
| `end_time` | number | 结束时间，单位由上游 STT 服务定义 |
| `definite` | boolean | 是否为确定结果 |
| `words` | array | 可选，词级时间戳信息 |

`words` 子项：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `text` | string | 词文本 |
| `start_time` | number | 开始时间 |
| `end_time` | number | 结束时间 |

### 响应示例

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "taskId": "7f7a2b1b-2c20-4d28-b2c4-9a67a5f5c111",
    "text": "你好，我是智能助手",
    "utterances": [
      {
        "text": "你好，我是智能助手",
        "start_time": 0,
        "end_time": 1800,
        "definite": true
      }
    ],
    "traceId": "trace-004"
  }
}
```

### 调用示例

使用音频 URL：

```bash
curl -X POST "http://localhost:4001/stt/file/recognize" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/audio.wav",
    "audioFormat": "wav",
    "language": "zh-CN",
    "traceId": "trace-004"
  }'
```

使用 base64 音频：

```bash
curl -X POST "http://localhost:4001/stt/file/recognize" \
  -H "Content-Type: application/json" \
  -d '{
    "audioData": "UklGRiQAAABXQVZFZm10IBAAAAABAAEA...",
    "audioFormat": "wav",
    "language": "zh-CN"
  }'
```

## 配置说明

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4001` | HTTP API 服务端口 |
| `STT_SERVICE_TYPE` | `volcengine` | HTTP 一次性识别服务类型，支持 `volcengine`、`azure`、`mock` |
| `CORS_ORIGIN` | `*` | CORS 允许来源 |
| `VOICE_API` | `wss://openspeech.bytedance.com` | 火山引擎 API 地址；HTTP 文件识别会自动转换为 `https://` |
| `VOICE_STT_API_KEY` | 空 | 火山引擎 v3 文件识别 API Key |
| `VOICE_STT_ACCESS_TOKEN` | 空 | 访问令牌；未配置 `VOICE_STT_API_KEY` 时作为文件识别 API Key 回退 |
| `VOICE_STT_FILE_RESOURCE_ID` | `volc.bigasr.auc_turbo` | 火山引擎极速版资源 ID |
| `VOICE_STT_USER_UID` | `coco-stt` | 火山引擎文件识别 `user.uid` |
| `AZURE_SPEECH_KEY` | 空 | Azure Speech Key |
| `AZURE_SPEECH_REGION` | `eastasia` | Azure Speech 区域 |

## 注意事项

1. `/stt/recognize` 只接受有效 WAV 文件二进制，服务端会校验 `RIFF` 与 `WAVE` 文件头。
2. `/stt/file/recognize` 固定使用火山引擎极速版同步识别，不受 `STT_SERVICE_TYPE` 切换影响。
3. 使用 `audioData` 传 base64 时不要附加 `data:audio/wav;base64,` 前缀。
