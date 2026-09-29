# Trace 时延看板

把 `/oem/trace/` 下的链路追踪 JSON（schema v3）渲染成时延看板。所有数值都由
trace 实时派生，**只呈现客观指标，不包含判断性结论或优化建议**。

云端指标口径以 `cocolamp-cloud-ts` 的 `MetricsLogger.collectChatDurations` 为准。
网关与 mock_app 只落时间戳，派生计算全部在本看板完成。
`timestamps.device`、旧 edge 字段、`moduleDurationsMs` / `outcomesMs` 已删除。

## 启动

```bash
cd /oem/trace_view
python3 server.py
```

然后打开 http://127.0.0.1:8912/

常用参数：

```bash
python3 server.py --port 9000 --trace-dir /path/to/traces
```

只依赖 Python 标准库，无需安装任何东西。页面本身也是零依赖的原生 JS，
不联网、不引入任何前端框架。

不启服务也可以用：直接用浏览器打开 `index.html`，把 trace JSON
拖进页面，或点顶栏的「打开文件」。这种方式下无法列出目录，其余功能一致。

## 看板内容

点顶栏 **汇总** 会拉取目录中全部 trace，按同一口径做分位数统计（P50 / P90 / 最小 / 最大 / 均值），
并给出典型瀑布、责任方拆分和可下钻的明细表。未接本地服务时，该按钮改为选择多个本地 JSON。

| 区块 | 说明 |
| --- | --- |
| 概览 | 首音时延、首个指令包、瀑布跨度、云端/网络占比、工具调用、本轮未发生字段数 |
| 端到端时延瀑布 | 从唤醒到首个 `audio:output`，按串行阶段拆解 |
| 责任方归属 | 跨度按网关 / 网络 / 云端归类 |
| 阶段耗时 | 由时间戳派生：网关阶段 + 云端 `collectChatDurations` |
| 网络时延 | `transportMs` 三个方向，以及 `chatResponseFirstPackets` 前 3 包 |
| 工具调用 | 基于 `toolCalls` 的时间线、明细、按名聚合与失败列表 |
| 一致性校验 | 若旧文件仍带 `stageMs` / `transportMs`，与页面重算值比对 |
| 完整事件序列 | `timestamps.edge` / `timestamps.cloud` 全部节点按时间排序 |
| 埋点字段覆盖 | schema v3 字段字典中本轮未发生的项；键缺失是正常情况 |
| 汇总（顶栏按钮） | 全部 trace 的 P50/P90/分布、典型瀑布、责任方拆分、工具合计、可点击明细 |

## 设计约定

**瀑布恒闭合。** 各阶段由一组时间戳对定义（见 `trace-model.js` 的 `SEGMENTS`）。
起止点任一缺失时该阶段被跳过；跳过后留下的空档会以「未归类间隙」补上，
因此各段之和永远等于时间轴跨度。相邻阶段若在时间上重叠会标注「重叠」并
不重复计入合计。

**缺失即无数据。** 任何指标只要缺一个端点就显示「无数据」并列出缺失字段名，
不做估算、不填默认值。schema v3 中键缺失代表该事件本轮没有发生，
看板会按时间戳生成 `diagnostics` 解释原因。

**跨端相减会标注。** `transportMs` 故意保留负数；负得超过
`clock.expectedSkewMs`（默认 10ms）时，页面与 diagnostics 都会标出。

**工具耗时只看 `toolCalls`。** 云端已删除 `toolDurationMs`，不再单独展示工具调用时延指标。

**工具调用按 `ToolCallMetric` 解读。** 每项含 `name` / `startTime` /
`durationMs` / `success` / `error`。页面会按 `startTime` 排序，标出与更早调用
存在时间重叠的并行调用，并同时给出 `durationMs` 之和与时间轴实际跨度——
存在并行时两者不相等。

## 文件

```
index.html        页面骨架
styles.css        样式（深/浅色，无外部字体）
trace-model.js    指标计算，纯函数，不碰 DOM
app.js            渲染
server.py         本地静态服务 + 目录浏览接口
```

`trace-model.js` 可以直接在 Node 里复用，便于写脚本批量分析：

```js
const M = require("./trace-model.js").TraceModel;
const a = M.analyze(JSON.parse(fs.readFileSync(file, "utf8")));
console.log(a.firstAudio, a.edgeStages, a.cloudStages);

const s = M.summarize([{ name: file, analysis: a }]);
console.log(s.kpi, s.edge);
```

## 接口

```
GET /api/traces        列出 trace 目录：[{ name, size, mtime }]
GET /api/trace/<name>  返回该 trace 的 JSON
GET /api/bundle        一次返回全部 trace（汇总页用；旧服务没有此接口时页面会逐条拉取）
```

文件名限制为 `[A-Za-z0-9._-]+`，拒绝路径穿越。服务只读，不提供写接口。

## 新增埋点字段时

改 `trace-model.js` 顶部的 `FIELDS`（字段字典，决定覆盖率统计与事件序列的
说明文字）。若新字段构成一个新的串行阶段，再往 `SEGMENTS` 里加一项；
若是一个新的时长指标，往 `EDGE_STAGES` / `CLOUD_STAGES` 里加一项。
渲染层无需改动。
