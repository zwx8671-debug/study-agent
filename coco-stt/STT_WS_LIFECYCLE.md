# 流式 STT WebSocket 生命周期

本文描述三条独立连接的关系：

1. 客户端 ↔ coco-stt：Socket.IO
2. coco-stt ↔ 火山引擎：厂商 WebSocket（二进制协议）
3. coco-stt ↔ Qwen：厂商 WebSocket（Realtime JSON）

厂商连接**不是**客户端连接的别名。它只在 `stt:start` 时新建，在会话收尾或异常时关闭。客户端不断开，不等于厂商连接一直开着，也不等于厂商连接一定还活着。

```
客户端                         coco-stt                         厂商
────────                       ────────                         ────
Socket.IO connect
                               此时还没有厂商 WebSocket
stt:start  ─────────────────►  Created → Starting
                               新建厂商 WS + 握手  ──────────►  OPEN / 就绪
                               Started
stt:started ◄────────────────
stt:audio  ─────────────────►  push() / 转发音频  ──────────►  识别中
stt:data   ◄────────────────  data 事件            ◄────────  中间/最终文本
stt:end    ─────────────────►  Closing → finalize  ──────────►  收尾
stt:ended  ◄────────────────  Closed
                               厂商 WS 已断开
Socket.IO 仍可复用，再 start 会再建一条新的厂商 WS
```

共用状态机在 `STTWsStreamService`，状态值为：

`Created → Starting → Started → Closing → Closed`

---

## 1. 厂商 WebSocket 生命周期

火山和 Qwen 共用同一套状态机，差别只在握手、发包、收尾协议。

### 1.1 共用状态机

| 阶段 | 状态 | 触发 | 厂商 WS |
| --- | --- | --- | --- |
| 构造实例 | `Created` | `STTFactory.create()` | 不存在 |
| 建连 + 握手 | `Starting` | `start()` | CONNECTING → OPEN，等就绪事件 |
| 可推音频 | `Started` | 握手成功 | OPEN，发送循环开始 |
| 收尾 | `Closing` | `close()` | 仍 OPEN，排空队列后发结束帧 |
| 结束 | `Closed` | 厂商回最后一包 / `session.finished` / 超时强制断开 | 已 `ws.close(1000)` |

`push()` 在 `Closing` 及之后直接丢弃。`start()` 在已经 `Starting` 之后是幂等的，不会再建第二条厂商连接。

建连超时、就绪超时、收尾超时默认都是 **5s**（火山 `VOICE_STT_TIMEOUT`，Qwen `QWEN_ASR_TIMEOUT`）。

厂商 WS 的 `close` 事件按当前状态处理：

- `Starting` 期间断开：握手失败
- `Started` 期间断开：视为上游异常，向客户端发 `stt:error`，并 `markClosed`
- `Closing` 期间断开：正常收尾完成

### 1.2 火山引擎

接口：`wss://.../api/v3/sauc/bigmodel_async`  
资源：`volc.bigasr.sauc.duration`  
协议：4 字节头 + 序列号 + gzip 负载

```
connect(headers: App-Key / Access-Key / Resource-Id / Request-Id)
  → open
  → Full Client Request（seq>0，JSON：uid / format / model / ITN / 标点 / result_type）
  → 收到任意成功响应 → Started
  → Audio Only Request（seq>0，gzip PCM）循环
  → 负包（空音频 + 负 seq）表示最后一包
  → 收到 is_last_package → Closed
```

要点：

- 就绪条件很宽：第一条 `code === 0` 的响应就会 `notifyReady()`，不单独等某个 event。
- 识别过程中会持续回包；`result.text` 通过 `stt:data` 转给客户端。`result_type=full` 回全量，`single` 回增量。
- **只有负包才会让火山结束本轮会话。** 客户端不停 `stt:end`，本服务就不会发负包，火山连接保持 OPEN，并继续等下一包音频。
- 火山自己有「等包超时」`45000081`：音频停太久且还没发负包，上游会报错并关连接。本服务把它当成 `Started` 期间的异常关闭。
- 官方建议单包 100–200ms。本服务不重组包，原样转发客户端 `stt:audio`。

### 1.3 Qwen（百炼 Realtime）

接口：`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime`  
协议：JSON 事件，音频为 base64 PCM

```
connect(headers: Authorization Bearer / OpenAI-Beta: realtime=v1)
  → open
  → 上游 session.created（可忽略）
  → 本服务 session.update（pcm / 16k / VAD 或 Manual）
  → 收到 session.updated → Started
  → input_audio_buffer.append 循环
  → [VAD] speech_started / speech_stopped / delta / completed 可多次发生
  → close() 时：
        VAD：若还有未完成句，先补一段静音，等最后一次 completed
        Manual：input_audio_buffer.commit
  → session.finish
  → session.finished → Closed
```

两种模式：

| 模式 | 配置 | 断句谁负责 | 收尾 |
| --- | --- | --- | --- |
| Server VAD（默认） | `turn_detection.type=server_vad` | 上游按静音自动切句 | 不能立刻 `session.finish`，否则未完成句会被丢掉；本服务会先补静音再 finish |
| Manual | `turn_detection=null` | 客户端 / 本服务 | `commit` 后再 `session.finish` |

要点：

- Qwen **一条 WS 会话里可以识别多句话**。VAD 切句只结束当前 utterance，不关 WebSocket。
- 真正结束会话的是 `session.finish` → `session.finished`。客户端不停 `stt:end`，本服务不会发 finish，Qwen 连接保持 OPEN。
- 若直接掐断 WS 而不发 `session.finish`，上游会丢弃 in_progress 的识别结果。

---

## 2. 客户端连接 coco-stt 的生命周期

客户端走 Socket.IO（uWebSockets + msgpack），事件只有四个：

| 方向 | 事件 | 含义 |
| --- | --- | --- |
| C → S | `stt:start` | 创建会话，连接厂商 |
| S → C | `stt:started` | 厂商已就绪，可以推音频 |
| C → S | `stt:audio` | 推 PCM（或 `{ type:'Buffer', data:number[] }`） |
| S → C | `stt:data` | 中间 / 累计识别文本 |
| C → S | `stt:end` | 正常收尾 |
| S → C | `stt:ended` | 会话结束，带最终文本 |
| S → C | `stt:error` | 启动失败、识别失败、上游断开等 |

### 2.1 连接级 vs 会话级

```
Socket.IO 连接
  ├─ 未 start：没有 SessionInfo，没有厂商 WS，也没有 30s 空闲计时器
  ├─ 一次 start：一个 SessionInfo，一条厂商 WS
  ├─ end 成功：SessionInfo 删除，厂商 WS 关闭，Socket.IO 仍在
  └─ 同一条 Socket.IO 可以再 start，会新建另一条厂商 WS
```

约束：

- **一条 Socket.IO 同时只能有一个 STT 会话。** 上个会话没结束再 `stt:start`，会收到「一次链接只能请求一个会话」，原会话不受影响，可继续 `stt:audio` / `stt:end`。
- 会话按 `socket.id` 索引，不按 `sessionId`。`sessionId` 主要用于日志和回包。
- `stt:end` 后同一条连接可以立刻再 `stt:start`。
- 未 start 就 `stt:audio`：`stt:error`（没有活跃会话）。
- 未 start 就 `stt:end`：忽略，连接仍可用。
- `stt:end` 之后再来的 `stt:audio` / `stt:end`：忽略，不崩。

### 2.2 客户端正常路径

```
1. io.connect()
2. emit stt:start { sessionId, format, provider?, options? }
3. 等 stt:started
4. 循环 emit stt:audio
5. 收 stt:data（可多次）
6. emit stt:end
7. 等 stt:ended（带最终 text）
8. 需要的话再 start，或断开 Socket.IO
```

`start()` 失败时：会话立刻从 `activeSessions` 删除，厂商 WS `disconnect()`，客户端只收到 `stt:error`，**Socket.IO 不断**。之后可以再 start。

### 2.3 空闲 30 秒

`stt:start` 成功后启动空闲计时器；每次 `stt:audio` 重置。超时 **30s** 后服务端 `socket.disconnect(true)`。

这不是关厂商连接，而是先踢客户端。踢掉后走 `disconnect` 清理：`close()` 厂商 → 删会话。

没有活跃会话时（还没 start，或已经 end），**没有**这条 30s 计时器。此时客户端可以一直挂着 Socket.IO。

### 2.4 客户端主动断开

`handleDisconnect`：清计时器 → `sttService.close()`（走厂商正常收尾）→ 删会话。`close()` 失败则强制 `disconnect()` 厂商 WS。

---

## 3. 客户端没断开时，火山 / Qwen 处于什么状态

结论先说：**厂商连接只跟「当前是否有未结束的 STT 会话」绑定，不跟 Socket.IO 是否还活着绑定。**

| 客户端 Socket.IO | 本服务会话 | 火山 WS | Qwen WS |
| --- | --- | --- | --- |
| 已连接，从未 `stt:start` | 无 | 不存在 | 不存在 |
| 已连接，`start` 成功，持续推音频 | `Started` | OPEN，识别中 | OPEN，识别中；VAD 可多次 completed |
| 已连接，`start` 后停音频，未 `end`，未满 30s | `Started` | OPEN，干等下一包；太久可能 `45000081` 被上游关掉 | OPEN；VAD 可能已切完上一句，会话本身还在 |
| 已连接，`start` 后空闲满 30s | 服务端踢掉客户端 | 随 disconnect 走 `close()`，随后 Closed | 同上 |
| 已连接，已 `stt:end` | 已删除 | Closed，不会复用 | Closed，不会复用 |
| 已连接，end 后再 start | 新会话 | **新的** WS | **新的** WS |
| 已连接，厂商中途自己断开 | 会话还在 map 里 | Closed | Closed |
| 已连接，start 失败 | 无 | 已拆掉 | 已拆掉 |

### 3.1 最常见的误解

「客户端链接没断开，所以火山 / Qwen 也一直连着。」

只在这一种情况下成立：

- Socket.IO 还在，**并且**
- 已经 `stt:start` 成功，**并且**
- 还没有 `stt:end`，**并且**
- 厂商自己还没因等包超时 / 内部错误断开

除此之外：

- 只连上 Socket.IO、还没 start：厂商侧 **0 条连接**
- 已经 end：厂商侧 **已经断开**，即使客户端还挂着
- 再 start：厂商侧是 **另一条新连接**，旧的不会复用

本服务没有厂商连接池，也没有把一条厂商 WS 借给多个客户端会话。

### 3.2 客户端挂着、会话还在时，厂商在干什么

两边都是「会话级长连接」，不是「识别一句就断」。

火山：

- 保持 OPEN，等下一包 `Audio Only Request`
- 没有负包，就不会回 `is_last_package`，本服务也不会把状态打成 `Closed`
- 客户端停推音频后，火山不会自动结束会话；它要么继续等，要么等包超时后主动断开
- 等包超时发生时，客户端仍连着，会收到 `stt:error`，厂商连接变为 Closed

Qwen：

- 保持 OPEN，继续收 `input_audio_buffer.append`
- VAD 开启时，静音会切句并推 `completed`，**WebSocket 不停**
- 本服务默认认为上游总会发 `stt:end`，因此不会在中间私自发 `session.finish`
- 所以：客户端不断开、也不 end 时，Qwen 会话会一直挂着，直到客户端 end、被 30s 空闲踢掉，或上游自己报错断开

### 3.3 厂商先断、客户端还在

`Started` 期间厂商 WS 关掉（等包超时、服务端踢、网络断开）：

1. 本服务 `fail()` + `markClosed()`
2. 客户端收到 `stt:error`
3. **Socket.IO 不断**
4. `activeSessions` **还留着**这条已死会话

此时再 `stt:start` 会被拒（一次链接一个会话）。正确做法是发一次 `stt:end` 清掉死会话，或断开重连。`close()` 发现已经 `Closed` 会立刻返回，然后删除会话。

### 3.4 资源与计费含义

- Socket.IO 空闲挂着：不占厂商连接，不触发厂商计时，本服务也不踢。
- `start` 之后空闲挂着：占一条厂商连接；火山可能等包超时；Qwen 会话保持到 finish 或上游超时；满 30s 会被本服务踢客户端并收尾厂商。
- `end` 之后继续挂着 Socket.IO：厂商连接已释放，可以安全复用这条客户端连接做下一轮识别。

---

## 4. 时序对照

### 4.1 正常一轮（客户端不断开，再开第二轮）

```
Client                coco-stt                 火山 / Qwen
  |                      |                          |
  |------ connect ------>|                          |
  |                      |   （无厂商连接）          |
  |------ stt:start ---->|------ WS connect ------->|
  |                      |------ 握手 / update ---->|
  |                      |<----- 就绪 --------------|
  |<----- stt:started ---|                          |
  |------ stt:audio ---->|------ 音频 ------------->|
  |<----- stt:data ------|<----- 文本 --------------|
  |------ stt:end ------>|------ 负包 / finish ---->|
  |                      |<----- last / finished ---|
  |<----- stt:ended -----|      WS 已关             |
  |                      |   （客户端仍连接）        |
  |------ stt:start ---->|------ 新的 WS ----------->|
```

### 4.2 客户端不断开，也不 end

```
Client                coco-stt                 火山 / Qwen
  |------ stt:start ---->|------ WS connect ------->|
  |<----- stt:started ---|                          |
  |------ stt:audio ---->|------ 音频 ------------->|
  |                      |                          |
  |   停止推音频          |   厂商 WS 仍 OPEN        |
  |   Socket.IO 仍在      |   火山：等包 / 可能超时  |
  |                      |   Qwen：VAD 可切句，会话不关
  |                      |                          |
  |   满 30s 无 audio     |                          |
  |<---- disconnect -----|                          |
  |                      |------ close / finish --->|
  |                      |      WS Closed           |
```

### 4.3 只连客户端、从不 start

```
Client                coco-stt                 火山 / Qwen
  |------ connect ------>|                          |
  |                      |   无 SessionInfo         |  无连接
  |   可一直挂着          |   无 30s 空闲踢人        |
```

---

## 5. 实现位置

| 层级 | 文件 |
| --- | --- |
| 客户端会话 / 30s 空闲 / 一连接一会话 | `src/socketio/STTSocket.ts` |
| 共用 WS 状态机 | `src/stt/STTWsStreamService.ts` |
| 状态枚举 | `src/stt/STTBaseService.ts` |
| 火山协议 | `src/stt/volcengine/STTVolcengineStreamService.ts` |
| Qwen 协议 | `src/stt/qwen/STTQwenStreamService.ts` |
| 边界行为（二次 start、空闲踢人、end 后再 start） | `test/stt-boundary-test.ts` |
