# MOCK APP&DEVICE

浏览器直连云端 Socket.IO + HTTP。本仓库**无 FastAPI / 无 venv / 无 pip 依赖**，用系统自带 Python 跑 `server.py`（标准库）托管静态页，并把 latency JSON 写到 `/oem/trace`。

## 功能

1. 设备鉴权直连云端（`device-sign=cocowa`，每个标签页独立 `socketId`）
2. 基础聊天 / 自动或手动 `done`
3. 澄清卡片（确认提交 / 取消澄清）
4. `trigger:sync` 渲染与 ACK
5. 完整提示词 / Trigger 提示词查看
6. 按 `socketId` 编辑静态提示词（`/prompt/local-cache`）
7. 按 key 分类编辑并同步设备提示词（`device:prompt:sync`）
8. 按 name 分类编辑并同步设备状态机（`device:state:sync`）
9. 连接配置可选 `msgPacket`（默认 `BYTE` / msgpack）
10. testapp token 鉴权 HTTP 地址与提示词等接口分开配置
11. 收到云端 `chat:response` 的 latency 后原样写入 `/oem/trace/<traceId>.json`
12. 连接配置可改 Trace 请求服务路径（设备 IP，默认 `127.0.0.1:8912`）

## 快速开始

### Windows

```bat
serve.bat
```

启动脚本读取项目目录下的可选配置 `startup.json`：

```json
{
  "trace_view": {
    "enabled": true,
    "path": "D:/project/py/trace_view",
    "host": "127.0.0.1",
    "port": 8912
  }
}
```

`path` 是包含 `server.py` 的 trace_view 项目目录，也支持相对于配置文件的路径（如 `../trace_view`）。JSON 中 Windows 路径请用 `/` 或 `\\`。`enabled` 默认为 `false`，启用后使用当前 Python 在后台启动 trace_view，并传入 mock_app 实际写入的 trace 目录。`host`、`port` 默认分别为 `127.0.0.1`、`8912`。

配置文件或 `trace_view` 配置缺失、禁用时直接跳过；JSON、路径或参数错误会打印提示，但不影响 mock_app 启动。trace_view 独立运行，启动失败（包括端口已被占用）也不影响 mock_app，其输出保存在 `logs/trace_view.log`。关闭 mock_app 不会关闭 trace_view；重复启动时，已经运行的 trace_view 保持运行，新进程的端口占用错误写入日志。若修改端口，页面「连接配置」中的 Trace 请求服务路径也需要同步修改。

或：

```bash
python server.py --port 8085
```

打开：http://127.0.0.1:8085/  
连接配置在页面「连接配置」里改，保存在浏览器 localStorage。  
仅用 `python -m http.server` 也能打开页面，但 **写不了** `/oem/trace`。

### Linux

机器需已安装 **Python 3**（**不需要** `python3-venv`，不需要 pip）：

```bash
cd /path/to/mock_app
chmod +x serve.sh
# 若报错 bash\r: sed -i 's/\r$//' serve.sh
./serve.sh start          # 后台，默认 0.0.0.0:8085
./serve.sh status
./serve.sh stop
```

```bash
PORT=8086 ./serve.sh start
./serve.sh foreground
./serve.sh restart
```

`start`、`restart` 和 `foreground` 都会读取同一份 `startup.json`，按配置后台启动 trace_view。Linux 上请将 `trace_view.path` 改为实际目录（例如 `/oem/trace_view`）；如果两个项目在同一父目录下，可以在 Windows 和 Linux 上统一使用 `../trace_view`。配置缺失、错误或 trace_view 启动失败都不会阻断 mock_app。`stop` 只停止 mock_app，trace_view 继续独立运行。

同事访问：`http://<服务器IP>:8085/`

## 注意

- 同一 SN 同一时间只应有一个设备 client 在线。
- 本机只托管静态页，**不**连接云端 Socket，避免抢走 `trigger:sync`。
- 云端 HTTP / Socket 需允许浏览器跨域访问。

## 目录

```
mock_app/
  serve.sh / serve.bat   # 启动 server.py
  server.bat             # Windows 启动别名
  startup.json           # Windows / Linux 可选 trace_view 启动配置
  server.py              # 静态托管 + POST /api/trace/<id> → /oem/trace
  static/
    index.html           # 纯前端页面
    trace-latency.js     # 云端 latency 落盘
    sample-device-prompts.json
    sample-device-states.json
```

`/oem/trace/<traceId>.json` 只保存云端下发的 latency，不自采指标。页面上的 traceId（以及写入成功提示）会打开「连接配置」里的 **Trace 请求服务路径**（一般为设备 IP，默认 `http://127.0.0.1:8912`，也可选 `http://192.168.11.23:8912`）：`http://<设备IP>:8912/#<traceId>.json`。

```bash
python ../trace_view/server.py --trace-dir /oem/trace
```

## 对话日志回放

顶部点击「日志回放」，在独立页面选择本地 `.ndjson` / `.jsonl` / `.json` 文件，
例如云端 `cache/llm-requests/chat-traces/<traceId>.ndjson`。
点击「开始回放」后，按记录时间显示文本分片并连续播放 assistant 音频；
可勾选「播放用户录音」，也可停止后重新播放。无需连接云端，文件不会上传，不发送 chat 或 done。

支持 NDJSON、JSON 数组和连续多行 JSON 对象。多轮或多连接日志可通过下拉框选择，
避免把广播到不同连接的相同音频重复播放。保留 traceId 轮次归组，文本按 messageId 区分。
音频当前支持 base64 编码的 16 位小端 PCM，按日志中的 sampleRate / channels 播放（缺省 16000Hz / 单声道）。
缺少音频载荷或已经截断的日志无法恢复声音；不支持的音频格式会显示错误。

解析测试：`node --test test_replay.cjs`。
