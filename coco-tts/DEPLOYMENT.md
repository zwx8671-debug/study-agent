# coco-tts 部署交接文档

TTS（文本转语音）能力已从主工程 `coco-cloud-ts` 拆分为独立服务 `coco-tts`。
本文给运维使用，包含：主工程需要改哪些环境变量、coco-tts 支持的全部环境变量、部署步骤与验收方法。

## 1. 变更概览

拆分前：主工程进程内直连火山引擎/Azure 做语音合成。
拆分后：主工程通过 Socket.IO 调用 coco-tts，由 coco-tts 直连合成引擎。

```
设备 ──► coco-cloud-ts ──Socket.IO(msgpack)──► coco-tts ──WSS──► 火山引擎 / Azure
```

主工程业务代码无需改动，**只改环境变量即可切换**（`TTS_SERVICE_TYPE=socketio`），
出问题时把该变量改回 `volcengine` 就退回进程内直连，见第 7 节回滚。

### 端口规划

coco-tts 是双端口服务，两个端口都必须放通：

| 服务 | 端口 | 变量 | 用途 |
| --- | --- | --- | --- |
| coco-tts | 3003 | `PORT` | Fastify HTTP API，健康检查在这个端口 |
| coco-tts | 3002 | `SOCKETIO_PORT` | Socket.IO 流式通道，主工程连这个端口 |
| coco-cloud-ts | 3001 | `PORT` | 主工程 HTTP（原有） |
| coco-cloud-ts | 3000 | `SOCKETIO_PORT` | 主工程 Socket.IO（原有） |
| coco-stt | 4000 / 4002 | — | STT 服务（原有，供参考） |

3002 端口只处理 Socket.IO 请求，访问其他路径会返回 404，**健康检查不要打 3002**。

## 2. coco-cloud-ts 的环境变量变更

### 2.1 新增变量

| 变量 | 默认值 | 是否需显式配置 | 说明 |
| --- | --- | --- | --- |
| `TTS_SERVER_URL` | `http://localhost:3002` | 跨机部署必须配 | coco-tts 的 **Socket.IO** 地址，指向 3002 端口，不是 3003 |
| `TTS_REMOTE_ENGINE` | `volcengine` | 用 Azure / Qwen 时必须配 | coco-tts 实际使用的引擎，取值 `volcengine` / `azure` / `qwen` |
| `TTS_CONNECT_TIMEOUT` | `10000` | 否 | Socket.IO 建连超时（毫秒） |

`TTS_REMOTE_ENGINE` 必须与 coco-tts 的 `TTS_SERVICE_TYPE` 保持一致。主工程仍然在本地做音色、
情感、语速的归一化（火山和 Azure 的取值格式不同），如果这里填错，合成能成功但音色或语速会不对。

### 2.2 取值变更

| 变量 | 原取值 | 新增取值 |
| --- | --- | --- |
| `TTS_SERVICE_TYPE` | `volcengine` / `azure` / `mock` | `socketio` |

设为 `socketio` 时主工程不再直连合成引擎，转而调用 coco-tts。

### 2.3 沿用但作用范围变化的变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TTS_WS_TIMEOUT` | `10000` | 原本是 WebSocket 握手超时。现在同时作为主工程等待 coco-tts 回执的超时：`tts:connected` / `tts:started` / `tts:disconnected` 用 1 倍，`tts:end`（等音频发完）用 3 倍 |

### 2.4 ⚠️ 不要删除的变量

主工程启动时对下列变量做强校验，缺失会**直接启动失败**。即使 TTS 已经外移，
`VOICE_TTS_APP_ID` 和 `VOICE_TTS_ACCESS_TOKEN` 仍在校验清单里，请保留原值：

```
VOICE_API  VOICE_TTS_APP_ID  VOICE_TTS_ACCESS_TOKEN
VOICE_STT_APP_ID  VOICE_STT_ACCESS_TOKEN
REDIS_HOST  REDIS_PORT  COCOADMIN_API_URL  COCOADMIN_API_KEY
```

### 2.5 完整改动示例

在主工程 `.env` 中追加/修改：

```ini
# 从进程内直连改为调用独立 TTS 服务
TTS_SERVICE_TYPE=socketio
TTS_SERVER_URL=http://127.0.0.1:3002
TTS_REMOTE_ENGINE=volcengine
TTS_CONNECT_TIMEOUT=10000
TTS_WS_TIMEOUT=10000
```

跨机部署时把 `127.0.0.1` 换成 coco-tts 的内网地址，例如 `http://10.0.1.20:3002`。

## 3. coco-tts 支持的全部环境变量

所有变量都有默认值，**服务不会因为缺少变量而启动失败**。这一点需要注意：如果漏配火山凭证，
进程能正常起来，但第一次合成请求才会报错。上线后请务必按第 6 节做一次真实合成验收。

### 3.1 服务与网络

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `local` | 决定加载哪个环境变量文件，生产填 `production` |
| `PORT` | `3003` | Fastify HTTP API 端口 |
| `SOCKETIO_PORT` | `3002` | Socket.IO（uWebSockets.js）端口 |
| `PATH_PREFIX` | 空 | ⚠️ **必须留空**，原因见 3.7 |
| `CORS_ORIGIN` | `*` | HTTP 与 Socket.IO 的 CORS 白名单 |

### 3.2 引擎选择

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TTS_SERVICE_TYPE` | `volcengine` | 取值 `volcengine` / `azure` / `qwen` / `mock`，大小写不敏感。`mock` 返回假音频，不消耗任何配额，用于联调与压测 |

### 3.3 火山引擎（`TTS_SERVICE_TYPE=volcengine` 时生效）

| 变量 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- |
| `VOICE_API` | `wss://openspeech.bytedance.com` | 否 | 接入点，实际请求路径为 `${VOICE_API}/api/v3/tts/bidirection` |
| `VOICE_TTS_APP_ID` | 空 | 是 | 火山 App ID |
| `VOICE_TTS_ACCESS_TOKEN` | 空 | 是 | 火山 Access Token |
| `VOICE_TTS_RESOURCE_ID` | `volc.service_type.10029` | 否 | 大模型语音合成资源 ID，改音色套餐时才需要调整 |

兼容旧变量名 `VOLC_APPID` / `VOLC_ACCESS_TOKEN`，新名字优先。

### 3.4 Qwen（`TTS_SERVICE_TYPE=qwen` 时生效）

| 变量 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- |
| `QWEN_API_KEY` | 空 | 是 | 阿里云百炼 API Key |
| `QWEN_WORKSPACE_ID` | 空 | 与 WS URL 二选一 | 中国区 Workspace ID，用于拼 WebSocket 地址 |
| `QWEN_TTS_WS_URL` | 由 Workspace ID 推导 | 与 Workspace ID 二选一 | 实时合成 WebSocket，如 `wss://{workspace}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference` |
| `QWEN_TTS_MODEL` | `qwen-audio-3.0-tts-flash` | 否 | 流式合成模型 |
| `QWEN_TTS_HTTP_MODEL` | `qwen3-tts-flash` | 否 | HTTP 一次性合成模型 |
| `QWEN_TTS_DEFAULT_SPEAKER` | `longanhuan_v3.6` | 否 | 流式默认音色 |
| `QWEN_TTS_SAMPLE_RATE` | `22050` | 否 | 采样率 |

### 3.5 Azure（`TTS_SERVICE_TYPE=azure` 时生效）

| 变量 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- |
| `SPEECH_KEY` | 空 | 是 | Azure 语音服务密钥 |
| `SPEECH_REGION` | `eastus` | 否 | 区域 |

兼容旧变量名 `AZURE_TTS_KEY` / `AZURE_TTS_REGION`，新名字优先。

### 3.6 运行调优、日志与调试

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TTS_WS_TIMEOUT` | `10000` | 上游 WebSocket 握手与关闭等待超时（毫秒） |
| `LOG_LEVEL` | 生产 `info`，其余 `debug` | `debug` / `info` / `warn` / `error` |
| `LOG_TARGET` | `stdout` | `stdout` 适合容器；`file` 写入 `logs/coco-tts.log`，按天切分、单文件 10MB、保留 30 个 |
| `SAVE_PCM` | `false` | 排障用，把合成音频落盘为 WAV。会占磁盘，**生产保持 false** |
| `SAVE_PCM_DIR` | `./logs/pcm` | 落盘目录，仅 `SAVE_PCM=true` 时有效 |

主工程也有同名的 `TTS_WS_TIMEOUT` 和 `SAVE_PCM`，两边互不影响，各自独立配置。

### 3.7 ⚠️ PATH_PREFIX 必须留空

`PATH_PREFIX` 会改变 Socket.IO 的挂载路径（变成 `${PATH_PREFIX}/socket.io`），而主工程的
客户端使用默认路径 `/socket.io`，一旦填值主工程就连不上。这与现有 coco-stt 的约定一致。
如需通过 ingress 暴露，请在网关层做路径重写，不要用这个变量。

### 3.8 写死在代码里的参数（不可通过 env 调整）

运维排查时可能需要，列在这里：

- 音频格式固定为 PCM，16000Hz，16bit，单声道
- 火山默认音色 `zh_female_wanwanxiaohe_moon_bigtts`；Qwen 默认音色 `longanhuan_v3.6`（MP3 / 22050Hz）；Azure 默认音色 `zh-CN-XiaoxiaoMultilingualNeural`
- HTTP 请求体上限 10MB；Socket.IO 单包上限 10MB
- Socket.IO 心跳：`pingInterval` 2000ms，`pingTimeout` 5000ms
- HTTP 合成接口单次文本上限 5000 字符

### 3.9 生产环境变量文件示例

```ini
NODE_ENV=production
LOG_LEVEL=info
LOG_TARGET=stdout

PORT=3003
SOCKETIO_PORT=3002
PATH_PREFIX=

TTS_SERVICE_TYPE=volcengine

VOICE_API=wss://openspeech.bytedance.com
VOICE_TTS_APP_ID=<火山 App ID>
VOICE_TTS_ACCESS_TOKEN=<火山 Access Token>
VOICE_TTS_RESOURCE_ID=volc.service_type.10029

TTS_WS_TIMEOUT=10000
SAVE_PCM=false
CORS_ORIGIN=*
```

## 4. 环境变量文件加载规则

两个工程规则一致，容易踩坑，请留意：

按 `.env.{NODE_ENV}` → `.env` 的顺序加载，**先加载的优先，后面的不会覆盖前面的**。
也就是说 `.env.production` 里的值会盖掉 `.env` 里的同名值。已存在的系统环境变量（如
Docker `-e`、PM2 `env`）优先级最高，不会被文件覆盖。

`NODE_ENV` 默认值两边不同：coco-tts 是 `local`，coco-cloud-ts 是 `development`。
生产环境请显式设置 `NODE_ENV=production`。

建议做法：密钥只写在 `.env`（已在 `.gitignore` 中），端口和引擎类型写在 `.env.{NODE_ENV}`。

## 5. 部署步骤

### 5.1 PM2（推荐，与主工程一致）

```bash
cd ./coco-tts
pnpm install
pnpm build              # 产物在 dist/，同时会复制 assets/ 音色配置

# 准备 .env（内容见 3.8）
vi .env

pnpm pm2:start          # 使用 ecosystem.config.cjs
pnpm pm2:logs           # 查看日志
pm2 save                # 保存进程列表，确保重启后自恢复
```

PM2 配置要点：`fork` 模式单实例、崩溃自动重启、重启延迟 3 秒、不限重启次数，
日志写到 `logs/pm2-out.log` 与 `logs/pm2-error.log`。

`pnpm build` 会把 `assets/`（音色配置）复制到 `dist/assets`。当前版本的服务代码并不读取这些文件，
音色与情感的归一化仍在主工程侧完成，因此手工部署产物时漏掉 `assets/` 也不会影响运行。

### 5.2 Docker

```bash
docker build -t coco-tts:latest .

docker run -d --name coco-tts \
  -p 3003:3003 -p 3002:3002 \
  --env-file .env \
  -e NODE_ENV=production \
  -e LOG_TARGET=stdout \
  --restart unless-stopped \
  coco-tts:latest
```

镜像内已固化 `NODE_ENV=production` 与 `LOG_TARGET=stdout`，日志走标准输出交给 Docker 收集。

### 5.3 上线顺序

1. 先部署并验收 coco-tts（第 6 节），此时主工程仍走原有直连，不影响线上
2. 确认 coco-tts 正常后，再改主工程环境变量并重启主工程
3. 观察主工程日志，出现下面这行说明切换生效：

```
TTS Server URL: http://127.0.0.1:3002 (engine: volcengine)
```

### 5.4 负载均衡与网关

- 健康检查：`GET http://<host>:3003/health`，返回 `code=200` 即健康
- 3002 端口是长连接 WebSocket，网关需允许 Upgrade 且空闲超时大于 60 秒
- 目前主工程与 coco-tts 是一对一直连，`TTS_SERVER_URL` 只支持单个地址。需要多实例时请在
  3002 前挂四层负载均衡（TCP），不要用七层轮询，会打断长连接

## 6. 上线验收

### 6.1 探活与配置核对

```bash
curl http://127.0.0.1:3003/health
curl http://127.0.0.1:3003/tts/status
```

`/tts/status` 返回的 `ttsServiceType` 应与预期引擎一致，`format` 为 `pcm`，`sampleRate` 为 `16000`。

### 6.2 真实合成验收（重要）

因为缺凭证不会导致启动失败，必须真实跑一次合成：

```bash
curl -X POST "http://127.0.0.1:3003/tts/synthesize?format=wav" \
  -H "Content-Type: application/json" \
  -d '{"text":"部署验收测试","deviceSN":"ops-check"}' \
  -o /tmp/tts-check.json
```

返回 `code=200` 且 `data.size` 大于 0 即成功。凭证错误会返回 `code=500` 并在 `msg` 中带上游错误信息。

### 6.3 流式链路验收

在部署了源码的机器上可以直接跑联调脚本，会统计首包延迟并输出可播放的 WAV：

```bash
pnpm test:socketio   # Socket.IO 流式通道
pnpm test:http       # HTTP 接口
```

音频输出在 `test/output/`。

## 7. 排障

| 现象 | 原因与处理 |
| --- | --- |
| 主工程日志 `TTS connect timeout` / `TTS connect failed` | coco-tts 未启动、3002 端口未放通，或 `TTS_SERVER_URL` 写成了 3003 |
| 主工程日志 `TTS connect failed` 且 coco-tts 日志有 `Failed to connect TTS` | coco-tts 到上游引擎不通或凭证错误，检查出网策略与火山凭证 |
| 访问 3002 返回 404 并提示 `only handles Socket.IO connections` | 正常行为，健康检查应改用 3003 的 `/health` |
| 连接建立后立刻断开、反复重连 | 网关对 WebSocket 有空闲超时或未允许 Upgrade；也可能 `PATH_PREFIX` 被填了值 |
| 能出声但语速或音色不对 | 主工程 `TTS_REMOTE_ENGINE` 与 coco-tts 的 `TTS_SERVICE_TYPE` 不一致 |
| 主工程日志 `TTS close timeout after 30000ms` | 等待音频全部下发超时，长文本合成偏慢或上游抖动，适当调大主工程与 coco-tts 的 `TTS_WS_TIMEOUT`（该超时为其 3 倍） |
| 磁盘快速增长 | 检查是否误开 `SAVE_PCM=true`，或 `LOG_TARGET=file` 且日志量过大 |

日志中的 `traceId` / `sessionId` / `deviceSN` 在两个服务间是贯通的，跨服务排查时用 `traceId` 串联。

## 8. 回滚

改回主工程一个变量并重启即可，coco-tts 无需下线：

```ini
TTS_SERVICE_TYPE=volcengine
```

主工程会恢复进程内直连合成引擎，`TTS_SERVER_URL` 等变量留着不生效，不影响运行。
主工程的火山凭证一直保留（见 2.4），因此回滚不需要额外补配置。

## 9. 相关文档

- [README.md](./README.md) — 服务说明、Socket.IO 协议、开发指南
- [TTS_HTTP_API.md](./TTS_HTTP_API.md) — HTTP 接口详细文档
