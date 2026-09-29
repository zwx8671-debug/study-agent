# coco-tts HTTP API

Fastify HTTP 接口文档。默认端口 `3003`（`PORT`），Socket.IO 流式通道在 `3002`（`SOCKETIO_PORT`）。
若配置了 `PATH_PREFIX`，所有路径需加上该前缀。

需要边合成边播放的低延迟场景请优先使用 Socket.IO 通道，HTTP 侧提供
`/tts/synthesize/stream` 作为等价能力（chunked 下发），`/tts/synthesize` 适合一次性拿全量音频。

## 统一响应结构

除 `/tts/synthesize/stream` 成功时直接返回音频字节流外，所有接口都返回：

```json
{
    "code": 200,
    "msg": "ok",
    "data": {}
}
```

`code` 为 200 表示成功，其余为失败（400 参数错误、500 合成失败），`msg` 为错误原因。

---

## GET /health

健康检查，同时返回当前音频参数，便于探活与配置核对。

**响应**

```json
{
    "code": 200,
    "msg": "ok",
    "data": {
        "status": "ok",
        "service": "coco-tts",
        "version": "1.0.0",
        "timestamp": "2026-07-28T08:00:00.000Z",
        "config": {
            "enableUWS": true,
            "msgPacket": "BYTE",
            "ttsServiceType": "volcengine",
            "format": "pcm",
            "sampleRate": 16000
        }
    }
}
```

**示例**

```bash
curl http://127.0.0.1:3003/health
```

---

## GET / 与 GET /test

浏览器测试台。可切换提供商、搜索/试听音色，输入文本后走流式或一次性合成并播放。

页面静态文件：`assets/test-ui/index.html`。

---

## GET /tts/voices

各提供商的音色目录，测试台用来渲染列表。不建立上游连接。

**响应 data**

| 字段        | 类型     | 说明                                      |
| ----------- | -------- | ----------------------------------------- |
| `current`   | string   | 环境变量当前实现                          |
| `providers` | object[] | `volcengine` / `azure` / `qwen` / `mock` |

每个 provider：`id`、`name`、`format`、`sampleRate`、`defaultSpeaker`、`configured`、`voices[]`。
`voices[]` 含 `name`、`speaker`、`language`、`emotions`，Qwen 另有 `group`（`realtime` / `http`）。

```bash
curl http://127.0.0.1:3003/tts/voices
```

---

## GET /tts/status

查询当前 TTS 实现与音频参数。不会建立上游连接，可安全高频调用。

**响应 data**

| 字段             | 类型    | 说明                                    |
| ---------------- | ------- | --------------------------------------- |
| `ttsServiceType` | string  | 当前实现：`volcengine` / `azure` / `qwen` / `mock` |
| `format`         | string  | 音频格式，如 `pcm`                      |
| `sampleRate`     | number  | 采样率，如 `16000`                      |
| `defaultSpeaker` | string  | 当前实现的默认音色                      |
| `available`      | boolean | 服务是否可用                            |

**示例**

```bash
curl http://127.0.0.1:3003/tts/status
```

---

## POST /tts/synthesize

一次性合成，等全部音频合成完成后返回 base64。

**查询参数**

| 参数     | 取值         | 说明                                                    |
| -------- | ------------ | ------------------------------------------------------- |
| `format` | `pcm`（默认）/ `wav` | `wav` 会在返回前补上 WAV 头，可直接落盘播放 |

**请求体** `application/json`

| 字段            | 类型                 | 必填 | 说明                                                             |
| --------------- | -------------------- | ---- | ---------------------------------------------------------------- |
| `text`          | string \| string[]   | 是   | 待合成文本；**传数组时按顺序增量推送给上游，等价于流式文本输入** |
| `speaker`       | string               | 否   | 音色，缺省用当前实现的默认音色                                   |
| `emotion`       | string               | 否   | 情感                                                             |
| `language`      | string               | 否   | 语言                                                             |
| `loudness_rate` | string               | 否   | 音量倍率                                                         |
| `speech_rate`   | string               | 否   | 语速倍率                                                         |
| `sessionId`     | string               | 否   | 会话ID，缺省自动生成                                             |
| `deviceSN`      | string               | 否   | 设备序列号，作为上游 uid                                         |
| `traceId`       | string               | 否   | 链路追踪ID，缺省自动生成，会回显在响应与日志中                   |
| `provider`      | string               | 否   | `volcengine` / `azure` / `qwen` / `mock`，缺省用环境变量当前实现 |

文本长度上限 5000 字符（数组按拼接后总长度计算）。

**响应 data**

| 字段         | 类型   | 说明                          |
| ------------ | ------ | ----------------------------- |
| `audio`      | string | base64 编码的音频             |
| `format`     | string | `pcm` 或 `wav`                |
| `sampleRate` | number | 采样率                        |
| `size`       | number | 音频字节数                    |
| `chunks`     | number | 上游返回的音频块数量          |
| `duration`   | number | 服务端合成耗时（毫秒）        |
| `sessionId`  | string | 会话ID                        |
| `traceId`    | string | 链路追踪ID                    |

**示例**

```bash
# 一次性传整段文本
curl -X POST "http://127.0.0.1:3003/tts/synthesize?format=wav" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，我是可可台灯。","deviceSN":"device-001"}'

# 数组形式，等价于流式增量推送
curl -X POST "http://127.0.0.1:3003/tts/synthesize" \
  -H "Content-Type: application/json" \
  -d '{"text":["你好，","我是","可可台灯。"]}'
```

**错误**

```json
{ "code": 400, "msg": "参数 text 不能为空", "data": { "traceId": "..." } }
{ "code": 500, "msg": "语音合成失败，请稍后重试", "data": { "traceId": "..." } }
```

---

## POST /tts/synthesize/stream

流式合成，边合成边以 chunked 下发音频字节流，首包延迟与 Socket.IO 通道等价。

**请求体**：同 `/tts/synthesize`（不支持 `format` 查询参数，固定返回原始 PCM）。

**成功响应**：`200`，body 为音频字节流，无 JSON 包装。

| 响应头                | 说明                    |
| --------------------- | ----------------------- |
| `Content-Type`        | `application/octet-stream` |
| `Transfer-Encoding`   | `chunked`               |
| `X-TTS-Format`        | 音频格式，如 `pcm`      |
| `X-TTS-Sample-Rate`   | 采样率，如 `16000`      |
| `X-TTS-Session-Id`    | 会话ID                  |
| `X-TTS-Trace-Id`      | 链路追踪ID              |

**失败响应**：响应头尚未写出时返回统一 JSON 错误体；已开始下发音频后只能中断连接，
调用方需按 `Content-Length` 缺失 + 连接异常终止来判定失败。

**示例**

```bash
curl -N -X POST "http://127.0.0.1:3003/tts/synthesize/stream" \
  -H "Content-Type: application/json" \
  -d '{"text":["你好，","我是","可可台灯。"]}' \
  --output out.pcm
```

得到的 `out.pcm` 是裸 PCM（16bit 单声道，采样率见响应头），播放示例：

```bash
ffplay -f s16le -ar 16000 -ac 1 out.pcm
```

---

## 联调脚本

`test/http-api-test.ts` 覆盖了上述全部接口，并统计一次性合成耗时与流式首字节耗时：

```bash
pnpm test:http
```

音频结果保存在 `test/output/` 下，可直接播放校验。
