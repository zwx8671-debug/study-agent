/**
 * Trace schema v3 客观指标计算模型。
 *
 * 云端指标口径以 cocolamp-cloud-ts MetricsLogger.collectChatDurations 为准。
 * 网关 / mock_app 只落时间戳，本文件负责全部派生计算。
 * 纯计算，不触碰 DOM。缺字段即「无数据」，不做估算。
 */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 埋点字段字典
   * ------------------------------------------------------------------ */

  var FIELDS = {
    edge: {
      awakeMs: "网关收到 ZMQ audio:awake。非语音会话（文本 / 触发器）没有。",
      audioInputStartMs: "网关收到本 trace 的第一个 ZMQ audio:input 分片。",
      audioInputEndMs: "网关收到 flag=END 的 audio:input。录音被打断时可能没有。",
      chatEmitFirstMs: "网关第一次 emit('chat') 到云端。",
      chatEmitLastMs: "网关最后一次 emit('chat')，通常是 end=true 那包。",
      chatResponseFirstRecvMs: "网关收到第一个 chat:response（assistant）。",
      chatResponseLastRecvMs: "网关收到的最后一个 chat:response。",
      firstAudioShellPushMs: "网关下发第一个 name=speak 的 shell:push。由文本包驱动，通常早于音频分片到达。",
      firstCommandShellPushMs: "网关下发第一个业务指令 token（排除 speak 与 root）。",
      firstCommandShellResponseMs: "网关收到该指令的 ZMQ shell:response 回执。",
      audioOutputFirstMs: "网关收到 chat:audio:response 首个分片、转发 audio:output 之前。",
      audioOutputLastMs: "最后一个音频分片到达。流式播放期间会一直往后走。",
      shellDoneMs: "网关收到 ZMQ shell:done。被打断、超时或 shell 异常时没有。",
    },
    cloud: {
      userFirstPacketTime: "云端收到用户音频首包。",
      userLastPacketTime: "云端收到用户音频尾包，多数云端阶段以此为基准。",
      sttStartTime: "ASR 开始。",
      sttCompleteTime: "ASR 完成。",
      quickVectorStartTime: "快速向量召回开始。未走快速应答时没有。",
      quickVectorEndTime: "快速向量召回结束。",
      dataPrepStartTime: "上下文数据准备开始。",
      dataPrepCompleteTime: "上下文数据准备完成。",
      connectionLLMStartTime: "LLM 连接建立开始。",
      connectionLLMCompleteTime: "LLM 连接建立完成。",
      connectionTTSStartTime: "TTS 连接建立开始。",
      connectionTTSCompleteTime: "TTS 连接建立完成。",
      llmFirstPacketTime: "LLM 首 token。",
      llmLastPacketTime: "LLM 末 token。",
      funcTokenFirstPacketTime: "首个 FuncToken 产出。",
      ttsFirstPacketTime: "TTS 首个音频包产出。不是云端 Socket.IO emit 时刻。",
      ttsLastPacketTime: "TTS 末个音频包产出。",
      chatResponseFirstSentTime: "云端发出首个 chat:response 的时刻（从包内 timestamp 抄录）。",
      chatResponseLastSentTime: "云端发出末个 chat:response 的时刻。",
    },
  };

  var LAYER_LABEL = { edge: "网关", network: "网络", cloud: "云端" };

  var NON_TIMESTAMP = {
    cloud: {
      toolDurationMs: "工具调用总耗时（ms），非绝对时刻。",
    },
  };

  var MIN_EPOCH_MS = 1e12;

  var TOP_LEVEL_KEEP = {
    traceId: 1,
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    clock: 1,
    timestamps: 1,
    transportMs: 1,
    stageMs: 1,
    diagnostics: 1,
    chatResponseFirstPackets: 1,
    toolCalls: 1,
  };

  function isTimestampField(layer, key, value) {
    if (NON_TIMESTAMP[layer] && NON_TIMESTAMP[layer][key]) return false;
    return value >= MIN_EPOCH_MS;
  }

  function normalizeTrace(trace) {
    if (!trace || typeof trace !== "object") return trace;
    var ts = trace.timestamps && typeof trace.timestamps === "object" ? trace.timestamps : {};
    var edge = ts.edge && typeof ts.edge === "object" ? ts.edge : {};
    var cloud = ts.cloud && typeof ts.cloud === "object" ? ts.cloud : {};

    Object.keys(FIELDS.edge).forEach(function (key) {
      if (edge[key] == null && num(trace[key]) != null) edge[key] = trace[key];
    });
    Object.keys(FIELDS.cloud).forEach(function (key) {
      if (cloud[key] == null && num(trace[key]) != null) cloud[key] = trace[key];
    });
    Object.keys(trace).forEach(function (key) {
      if (TOP_LEVEL_KEEP[key] || key in FIELDS.edge || key in FIELDS.cloud) return;
      var v = num(trace[key]);
      if (v == null || v < MIN_EPOCH_MS) return;
      if (/Time$/.test(key) && cloud[key] == null) cloud[key] = v;
    });

    ts.edge = edge;
    ts.cloud = cloud;
    trace.timestamps = ts;
    return trace;
  }

  /* ------------------------------------------------------------------ *
   * 端到端串行瀑布
   * ------------------------------------------------------------------ */

  var SEGMENTS = [
    {
      id: "awake",
      name: "唤醒 → 开始收音",
      layer: "edge",
      from: "edge.awakeMs",
      to: "edge.audioInputStartMs",
      note: "网关挂起的 audio:awake 落到本 trace 之后，到第一个 audio:input。",
    },
    {
      id: "speak",
      name: "用户说话",
      layer: "edge",
      from: "edge.audioInputStartMs",
      to: "edge.audioInputEndMs",
      note: "第一个 audio:input 分片到 flag=END。",
    },
    {
      id: "edgePack",
      name: "网关转发上行",
      layer: "edge",
      from: "edge.audioInputEndMs",
      to: "edge.chatEmitLastMs",
      note: "录音收口到末个 emit('chat')，网关自身开销。",
    },
    {
      id: "netUp",
      name: "上行网络（端 → 云）",
      layer: "network",
      from: "edge.chatEmitLastMs",
      to: "cloud.userLastPacketTime",
      cross: true,
      note: "跨端相减，受 NTP 偏差影响。负值会保留。",
    },
    {
      id: "stt",
      name: "STT 收尾",
      layer: "cloud",
      from: "cloud.userLastPacketTime",
      to: "cloud.sttCompleteTime",
      note: "用户尾包到 ASR 完成。",
    },
    {
      id: "dataPrep",
      name: "数据准备",
      layer: "cloud",
      from: "cloud.dataPrepStartTime",
      to: "cloud.dataPrepCompleteTime",
      note: "上下文数据准备起止。",
    },
    {
      id: "connLlm",
      name: "LLM 连接建立",
      layer: "cloud",
      from: "cloud.connectionLLMStartTime",
      to: "cloud.connectionLLMCompleteTime",
      note: "LLM 连接建立起止。",
    },
    {
      id: "connTts",
      name: "TTS 连接建立",
      layer: "cloud",
      from: "cloud.connectionTTSStartTime",
      to: "cloud.connectionTTSCompleteTime",
      note: "TTS 连接建立起止。",
    },
    {
      id: "ttft",
      name: "LLM TTFT",
      layer: "cloud",
      from: ["cloud.connectionLLMCompleteTime", "cloud.dataPrepCompleteTime"],
      to: "cloud.llmFirstPacketTime",
      note: "与云端 llmTtft 一致：llmFirstPacketTime − (connectionLLMCompleteTime ?? dataPrepCompleteTime)。",
    },
    {
      id: "tts",
      name: "TTS 合成首包",
      layer: "cloud",
      from: "cloud.llmFirstPacketTime",
      fromNotBefore: "cloud.connectionTTSCompleteTime",
      to: "cloud.ttsFirstPacketTime",
      note: "LLM 首 token 到 TTS 首音频包；若建连尚未完成，起点钳到 connectionTTSCompleteTime。云端会等 ttsReady 后再 start/push。",
    },
    {
      id: "netDownAudio",
      name: "下行音频（云 → 端）",
      layer: "network",
      from: "cloud.ttsFirstPacketTime",
      to: "edge.audioOutputFirstMs",
      cross: true,
      note: "起点是 TTS 产包时刻，不是云端 Socket.IO emit，因此含云端内部流转。",
    },
  ];

  /* ------------------------------------------------------------------ *
   * stageMs 定义。云端项与 MetricsLogger.collectChatDurations 一一对应。
   * ------------------------------------------------------------------ */

  var EDGE_STAGES = [
    {
      id: "awakeToAudioInputStart",
      name: "唤醒 → 开始收音",
      minus: ["edge.audioInputStartMs", "edge.awakeMs"],
      note: "唤醒到开始收音的延迟。",
    },
    {
      id: "audioInputSpan",
      name: "用户说话时长",
      minus: ["edge.audioInputEndMs", "edge.audioInputStartMs"],
      note: "用户实际说话时长。",
    },
    {
      id: "audioInputEndToChatEmitEnd",
      name: "录音结束 → 上行发完",
      minus: ["edge.chatEmitLastMs", "edge.audioInputEndMs"],
      note: "网关转发上行的自身开销。",
    },
    {
      id: "uplinkEndToFirstChatResponse",
      name: "输入结束 → Shell空包",
      focus: false,
      uplinkEnd: true,
      to: "edge.chatResponseFirstRecvMs",
      note: "Shell开始空包",
    },
    {
      id: "uplinkEndToFirstAudioShellPush",
      name: "输入结束 → 首个语音指令",
      focus: true,
      uplinkEnd: true,
      to: "edge.firstAudioShellPushMs",
      note: "端到端首个 speak token 下发时延。衡量音箱拿到播放指令，通常早于首音。",
    },
    {
      id: "uplinkEndToFirstCommandShellPush",
      name: "输入结束 → 首个动作指令",
      uplinkEnd: true,
      to: "edge.firstCommandShellPushMs",
      note: "端到端首个业务指令下发时延。本轮只回语音时没有。",
    },
    {
      id: "uplinkEndToFirstAudioOutput",
      name: "首音时延",
      focus: true,
      uplinkEnd: true,
      to: "edge.audioOutputFirstMs",
      note: "最贴近用户主观感受：用户说完到网关转发首个 audio:output。",
    },
    {
      id: "firstCommandPushToResponse",
      name: "首个指令执行",
      minus: ["edge.firstCommandShellResponseMs", "edge.firstCommandShellPushMs"],
      note: "shell 执行首个业务指令的耗时。",
    },
    {
      id: "audioOutputSpan",
      name: "下行音频持续",
      minus: ["edge.audioOutputLastMs", "edge.audioOutputFirstMs"],
      note: "下行音频流持续时长。",
    },
    {
      id: "uplinkEndToShellDone",
      name: "输入结束 → 会话收口",
      focus: true,
      uplinkEnd: true,
      to: "edge.shellDoneMs",
      note: "整轮对话收口耗时。",
    },
    {
      id: "awakeToShellDone",
      name: "唤醒 → 会话收口",
      minus: ["edge.shellDoneMs", "edge.awakeMs"],
      note: "含唤醒的完整会话时长。",
    },
  ];

  var CLOUD_STAGES = [
    {
      id: "sttCompleteDelay",
      name: "语音转文字延迟",
      focus: true,
      minus: ["cloud.sttCompleteTime", "cloud.userLastPacketTime"],
      note: "云端：sttCompleteTime − userLastPacketTime。",
    },
    {
      id: "dataPrepDuration",
      name: "数据准备耗时",
      focus: true,
      minus: ["cloud.dataPrepCompleteTime", "cloud.dataPrepStartTime"],
      note: "云端：dataPrepCompleteTime − dataPrepStartTime。",
    },
    {
      id: "connectionTTSDuration",
      name: "TTS 建连耗时",
      focus: true,
      minus: ["cloud.connectionTTSCompleteTime", "cloud.connectionTTSStartTime"],
      note: "云端：connectionTTSCompleteTime − connectionTTSStartTime。",
    },
    {
      id: "connectionLLMDuration",
      name: "LLM 建连耗时",
      focus: true,
      minus: ["cloud.connectionLLMCompleteTime", "cloud.connectionLLMStartTime"],
      note: "云端：connectionLLMCompleteTime − connectionLLMStartTime。connectionDuration 与此项相同，不再单列。",
    },
    {
      id: "quickResponseDelay",
      name: "快速响应延迟",
      minus: ["cloud.quickVectorEndTime", "cloud.userLastPacketTime"],
      note: "云端：quickVectorEndTime − userLastPacketTime。未走快速应答时没有。",
    },
    {
      id: "llmDelay",
      name: "LLM 首包延迟",
      focus: true,
      minus: ["cloud.llmFirstPacketTime", "cloud.userLastPacketTime"],
      note: "云端 llmDelay：llmFirstPacketTime − userLastPacketTime。",
    },
    {
      id: "llmTtft",
      name: "模型 TTFT",
      focus: true,
      minus: ["cloud.llmFirstPacketTime", ["cloud.connectionLLMCompleteTime", "cloud.dataPrepCompleteTime"]],
      note: "云端 llmTtft：llmFirstPacketTime − (connectionLLMCompleteTime ?? dataPrepCompleteTime)。",
    },
    {
      id: "funcTokenDelay",
      name: "FuncToken 首包延迟",
      minus: ["cloud.funcTokenFirstPacketTime", "cloud.userLastPacketTime"],
      note: "云端 funcTokenDelay：funcTokenFirstPacketTime − userLastPacketTime。",
    },
    {
      id: "firstAudioDelay",
      name: "首个音频包延迟",
      focus: true,
      minus: ["cloud.ttsFirstPacketTime", "cloud.userLastPacketTime"],
      note: "云端 firstAudioDelay：ttsFirstPacketTime − userLastPacketTime。",
    },
    {
      id: "sttDuration",
      name: "STT 耗时",
      minus: ["cloud.sttCompleteTime", "cloud.sttStartTime"],
      note: "云端 sttDuration：sttCompleteTime − sttStartTime。",
    },
    {
      id: "quickDuration",
      name: "快速响应耗时",
      minus: ["cloud.quickVectorEndTime", "cloud.quickVectorStartTime"],
      note: "云端 quickDuration：quickVectorEndTime − quickVectorStartTime。",
    },
    {
      id: "llmDuration",
      name: "LLM 响应耗时",
      minus: ["cloud.llmLastPacketTime", "cloud.llmFirstPacketTime"],
      note: "云端 llmDuration：llmLastPacketTime − llmFirstPacketTime。",
    },
    {
      id: "ttsDuration",
      name: "TTS 响应耗时",
      minus: ["cloud.ttsLastPacketTime", "cloud.ttsFirstPacketTime"],
      note: "云端 ttsDuration：ttsLastPacketTime − ttsFirstPacketTime。",
    },
    {
      id: "totalDuration",
      name: "总耗时",
      minus: [
        ["cloud.ttsLastPacketTime", "cloud.llmLastPacketTime", "cloud.funcTokenFirstPacketTime"],
        "cloud.userFirstPacketTime",
      ],
      note: "云端 totalDuration：(ttsLastPacketTime ?? llmLastPacketTime ?? funcTokenFirstPacketTime) − userFirstPacketTime。",
    },
    {
      id: "chatResponseFirstSentDelay",
      name: "首个指令包发出延迟",
      minus: ["cloud.chatResponseFirstSentTime", "cloud.userLastPacketTime"],
      note: "网关从下行包 timestamp 抄录，不在云端 collectChatDurations 内。",
    },
  ];

  var CLOUD_REPORTED_ALIASES = {
    llmDelay: ["llmFirstPacketDelay"],
    funcTokenDelay: ["funcTokenFirstPacketDelay"],
    firstAudioDelay: ["ttsFirstPacketDelay"],
  };

  var TRANSPORT_DEFS = [
    {
      key: "uplink",
      label: "上行（端 → 云）",
      firstSend: "edge.chatEmitFirstMs",
      firstRecv: "cloud.userFirstPacketTime",
      lastSend: "edge.chatEmitLastMs",
      lastRecv: "cloud.userLastPacketTime",
      note: "cloud.userFirstPacketTime − edge.chatEmitFirstMs。",
    },
    {
      key: "downlinkCommand",
      label: "下行指令（云 → 端）",
      firstSend: "cloud.chatResponseFirstSentTime",
      firstRecv: "edge.chatResponseFirstRecvMs",
      lastSend: "cloud.chatResponseLastSentTime",
      lastRecv: "edge.chatResponseLastRecvMs",
      note: "edge.chatResponseFirstRecvMs − cloud.chatResponseFirstSentTime。",
    },
    {
      key: "downlinkAudio",
      label: "下行音频（云 → 端）",
      firstSend: "cloud.ttsFirstPacketTime",
      firstRecv: "edge.audioOutputFirstMs",
      lastSend: "cloud.ttsLastPacketTime",
      lastRecv: "edge.audioOutputLastMs",
      note: "edge.audioOutputFirstMs − cloud.ttsFirstPacketTime。减数是 TTS 产包时刻，含云端内部流转。",
    },
  ];

  /* ------------------------------------------------------------------ *
   * 工具函数
   * ------------------------------------------------------------------ */

  function num(v) {
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  function get(obj, path) {
    var parts = String(path).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return null;
      cur = cur[parts[i]];
    }
    return num(cur);
  }

  function asPaths(spec) {
    if (spec == null) return [];
    return Array.isArray(spec) ? spec : [spec];
  }

  function resolvePoint(ts, spec) {
    var paths = asPaths(spec);
    var missing = [];
    for (var i = 0; i < paths.length; i++) {
      var v = get(ts, paths[i]);
      if (v != null) return { value: v, path: paths[i], missing: [] };
      missing.push(paths[i]);
    }
    return { value: null, path: paths[0] || "", missing: missing };
  }

  function short(path) {
    var i = String(path).indexOf(".");
    return i < 0 ? path : path.slice(i + 1);
  }

  function uplinkEnd(ts) {
    var end = get(ts, "edge.audioInputEndMs");
    if (end != null) return { value: end, path: "edge.audioInputEndMs" };
    var emit = get(ts, "edge.chatEmitLastMs");
    if (emit != null) return { value: emit, path: "edge.chatEmitLastMs" };
    return { value: null, path: "edge.audioInputEndMs" };
  }

  function span(end, start) {
    if (end == null || start == null) return null;
    var v = end - start;
    return v < 0 ? 0 : v;
  }

  function diff(end, start) {
    if (end == null || start == null) return null;
    return end - start;
  }

  function avg(a, b) {
    if (a == null || b == null) return null;
    // 与 Python 3 int(round((a + b) / 2)) 一致：.5 时偶数舍入
    var x = (a + b) / 2;
    var f = Math.floor(x);
    var frac = x - f;
    if (frac > 0.5) return f + 1;
    if (frac < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  /* ------------------------------------------------------------------ *
   * 瀑布
   * ------------------------------------------------------------------ */

  function buildWaterfall(ts) {
    var found = [];
    var skipped = [];

    SEGMENTS.forEach(function (def) {
      var a = resolvePoint(ts, def.from);
      var b = resolvePoint(ts, def.to);
      if (a.value == null || b.value == null) {
        skipped.push({ def: def, missing: a.missing.concat(b.missing) });
        return;
      }
      var primaryFrom = asPaths(def.from)[0];
      var note = def.note;
      if (a.path !== primaryFrom) {
        note = (note ? note + " " : "") + "本轮起点回退到 " + short(a.path) + "。";
      }
      if (def.fromNotBefore) {
        var floor = resolvePoint(ts, def.fromNotBefore);
        if (floor.value != null && floor.value > a.value) {
          note =
            (note ? note + " " : "") +
            "本轮起点钳到 " +
            short(floor.path) +
            "（晚于 " +
            short(a.path) +
            "）。";
          a = floor;
        }
      }
      found.push({
        kind: "seg",
        id: def.id,
        name: def.name,
        layer: def.layer,
        note: note,
        cross: !!def.cross,
        from: a.path,
        to: b.path,
        start: a.value,
        end: b.value,
        dur: b.value - a.value,
      });
    });

    if (!found.length) {
      return { rows: [], skipped: skipped, base: null, end: null, total: 0, byLayer: [], negatives: [] };
    }

    found.sort(function (x, y) {
      return x.start - y.start || x.end - y.end;
    });

    var negatives = found.filter(function (s) {
      return s.dur < 0;
    });

    var base = found[0].start;
    var cursor = base;
    var rows = [];

    found.forEach(function (seg) {
      if (seg.start > cursor) {
        rows.push({
          kind: "gap",
          name: "未归类间隙",
          layer: null,
          start: cursor,
          end: seg.start,
          dur: seg.start - cursor,
          note: "相邻两个已知阶段之间没有埋点覆盖的时间。",
        });
      }
      if (seg.start < cursor) seg.overlap = true;
      rows.push(seg);
      if (seg.end > cursor) cursor = seg.end;
    });

    var total = cursor - base;

    var sums = {};
    rows.forEach(function (r) {
      if (r.overlap || r.dur <= 0) return;
      var key = r.kind === "gap" ? "gap" : r.layer;
      sums[key] = (sums[key] || 0) + r.dur;
    });

    var byLayer = ["edge", "network", "cloud", "gap"]
      .filter(function (k) {
        return sums[k];
      })
      .map(function (k) {
        return {
          layer: k,
          label: k === "gap" ? "未归类" : LAYER_LABEL[k],
          ms: sums[k],
          pct: total ? (sums[k] / total) * 100 : 0,
        };
      });

    return {
      rows: rows,
      skipped: skipped,
      negatives: negatives,
      base: base,
      end: cursor,
      total: total,
      byLayer: byLayer,
    };
  }

  /* ------------------------------------------------------------------ *
   * stageMs
   * ------------------------------------------------------------------ */

  function evalStage(def, ts, opts) {
    opts = opts || {};
    var take = opts.clamp === false ? diff : span;
    var out = {
      id: def.id,
      name: def.name,
      focus: !!def.focus,
      note: def.note,
      value: null,
      missing: [],
      expr: "",
      range: null,
    };

    if (def.direct) {
      out.expr = short(def.direct);
      var direct = get(ts, def.direct);
      if (direct == null) out.missing = [def.direct];
      out.value = direct;
      return out;
    }

    if (def.uplinkEnd) {
      var origin = uplinkEnd(ts);
      var to = get(ts, def.to);
      out.expr = short(def.to) + " − " + short(origin.path);
      if (origin.value == null) out.missing.push(origin.path);
      if (to == null) out.missing.push(def.to);
      if (origin.value != null && to != null) {
        out.value = take(to, origin.value);
        out.range = [origin.value, to];
      }
      return out;
    }

    var a = resolvePoint(ts, def.minus[0]);
    var b = resolvePoint(ts, def.minus[1]);
    out.expr = short(a.path || asPaths(def.minus[0])[0]) + " − " + short(b.path || asPaths(def.minus[1])[0]);
    if (a.value == null) out.missing = out.missing.concat(a.missing);
    if (b.value == null) out.missing = out.missing.concat(b.missing);
    if (a.value != null && b.value != null) {
      out.value = take(a.value, b.value);
      out.range = [b.value, a.value];
    }
    return out;
  }

  function reportedValue(reported, id) {
    var v = num(reported[id]);
    if (v != null) return v;
    var aliases = CLOUD_REPORTED_ALIASES[id] || [];
    for (var i = 0; i < aliases.length; i++) {
      v = num(reported[aliases[i]]);
      if (v != null) return v;
    }
    return null;
  }

  function attachReported(list, reported) {
    reported = reported || {};
    list.forEach(function (m) {
      m.reported = reportedValue(reported, m.id);
      if (m.value == null && m.reported != null) m.value = m.reported;
    });
    return list;
  }

  function buildEdgeStages(trace) {
    var ts = trace.timestamps || {};
    var reported = (trace.stageMs && trace.stageMs.edge) || {};
    return attachReported(
      EDGE_STAGES.map(function (def) {
        return evalStage(def, ts);
      }),
      reported
    );
  }

  function buildCloudStages(trace) {
    var ts = trace.timestamps || {};
    var reported = (trace.stageMs && trace.stageMs.cloud) || {};
    return attachReported(
      CLOUD_STAGES.map(function (def) {
        return evalStage(def, ts, { clamp: false });
      }),
      reported
    );
  }

  /* ------------------------------------------------------------------ *
   * 网络时延
   * ------------------------------------------------------------------ */

  function buildTransport(trace) {
    var ts = trace.timestamps || {};
    var reported = trace.transportMs || {};
    var skew = trace.clock && num(trace.clock.expectedSkewMs);
    if (skew == null) skew = 10;

    return TRANSPORT_DEFS.map(function (def) {
      var firstSend = get(ts, def.firstSend);
      var firstRecv = get(ts, def.firstRecv);
      var lastSend = get(ts, def.lastSend);
      var lastRecv = get(ts, def.lastRecv);
      var derivedFirst = diff(firstRecv, firstSend);
      var derivedLast = diff(lastRecv, lastSend);
      var derivedAvg = avg(derivedFirst, derivedLast);
      var g = reported[def.key] || {};

      var first = num(g.first);
      var last = num(g.last);
      var mean = num(g.avg);
      if (first == null) first = derivedFirst;
      if (last == null) last = derivedLast;
      if (mean == null) mean = derivedAvg;

      var row = {
        key: def.key,
        label: def.label,
        note: def.note,
        first: first,
        last: last,
        avg: mean,
        firstCheck: derivedFirst,
        lastCheck: derivedLast,
        avgCheck: derivedAvg,
        firstSendMs: num(g.firstSendMs) != null ? num(g.firstSendMs) : firstSend,
        firstRecvMs: num(g.firstRecvMs) != null ? num(g.firstRecvMs) : firstRecv,
        lastSendMs: num(g.lastSendMs) != null ? num(g.lastSendMs) : lastSend,
        lastRecvMs: num(g.lastRecvMs) != null ? num(g.lastRecvMs) : lastRecv,
        missing: [],
        skew: false,
      };

      if (firstSend == null && num(g.firstSendMs) == null) row.missing.push(def.firstSend);
      if (firstRecv == null && num(g.firstRecvMs) == null) row.missing.push(def.firstRecv);

      if ((first != null && first < -skew) || (last != null && last < -skew)) {
        row.skew = true;
      }
      if (first != null && last != null && first > last * 10 + 100) {
        row.spread = true;
      }
      return row;
    }).filter(function (r) {
      return r.first != null || r.last != null || r.avg != null || r.missing.length;
    });
  }

  function buildPacketLatency(trace) {
    var list = trace.chatResponseFirstPackets || [];
    return list.map(function (p) {
      var sent = p && p.packet ? num(p.packet.timestamp) : null;
      var recv = num(p.recvMs);
      return {
        index: p.index,
        sent: sent,
        recv: recv,
        latency: sent != null && recv != null ? recv - sent : null,
        userEndDelayMs: num(p.userEndDelayMs),
        flag: p.packet ? p.packet.flag : undefined,
        idx: p.packet ? p.packet.idx : undefined,
        name: p.packet ? p.packet.name : undefined,
        text: p.packet ? p.packet.text : undefined,
        pattern: p.packet ? p.packet.pattern : undefined,
        audioId: p.packet ? p.packet.audioId : undefined,
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * 工具调用
   * ------------------------------------------------------------------ */

  function buildToolCalls(trace, base) {
    var raw = (trace && trace.toolCalls) || [];

    var items = raw.map(function (t, i) {
      t = t || {};
      var start = num(t.startTime);
      var dur = num(t.durationMs);
      var missing = [];
      if (start == null) missing.push("startTime");
      if (dur == null) missing.push("durationMs");
      return {
        seq: i + 1,
        name: typeof t.name === "string" && t.name ? t.name : "(未命名)",
        start: start,
        dur: dur,
        end: start != null && dur != null ? start + dur : null,
        offset: start != null && base != null ? start - base : null,
        success: typeof t.success === "boolean" ? t.success : null,
        error: t.error || null,
        missing: missing,
      };
    });

    var timed = items.filter(function (x) {
      return x.start != null && x.end != null;
    });
    timed.sort(function (a, b) {
      return a.start - b.start || a.end - b.end;
    });

    timed.forEach(function (x, i) {
      x.parallel = timed.slice(0, i).some(function (p) {
        return p.end > x.start;
      });
    });

    var summary = {
      count: items.length,
      timed: timed.length,
      totalMs: null,
      spanMs: null,
      spanStart: null,
      spanEnd: null,
      okCount: 0,
      failCount: 0,
      unknownCount: 0,
      parallelCount: 0,
      longest: null,
    };

    items.forEach(function (x) {
      if (x.success === true) summary.okCount++;
      else if (x.success === false) summary.failCount++;
      else summary.unknownCount++;
      if (x.dur != null) {
        summary.totalMs = (summary.totalMs || 0) + x.dur;
        if (!summary.longest || x.dur > summary.longest.dur) summary.longest = x;
      }
    });

    if (timed.length) {
      var min = timed[0].start;
      var max = timed[0].end;
      timed.forEach(function (x) {
        if (x.start < min) min = x.start;
        if (x.end > max) max = x.end;
        if (x.parallel) summary.parallelCount++;
      });
      summary.spanStart = min;
      summary.spanEnd = max;
      summary.spanMs = max - min;
      summary.offsetStart = base == null ? null : min - base;
      summary.offsetEnd = base == null ? null : max - base;
    }

    var failures = items.filter(function (x) {
      return x.success === false;
    });

    var byNameMap = {};
    items.forEach(function (x) {
      var e = byNameMap[x.name] || (byNameMap[x.name] = { name: x.name, count: 0, totalMs: 0, ok: 0, fail: 0, maxMs: null });
      e.count++;
      if (x.dur != null) {
        e.totalMs += x.dur;
        if (e.maxMs == null || x.dur > e.maxMs) e.maxMs = x.dur;
      }
      if (x.success === true) e.ok++;
      else if (x.success === false) e.fail++;
    });
    var byName = Object.keys(byNameMap)
      .map(function (k) {
        return byNameMap[k];
      })
      .sort(function (a, b) {
        return b.totalMs - a.totalMs;
      });

    return { items: items, ordered: timed, summary: summary, failures: failures, byName: byName, raw: raw };
  }

  /* ------------------------------------------------------------------ *
   * 一致性校验
   * ------------------------------------------------------------------ */

  function buildChecks(trace, edgeStages, cloudStages, transport, waterfall) {
    var checks = [];

    function cmp(label, derived, reported, source) {
      if (derived == null || reported == null) return;
      checks.push({
        label: label,
        derived: derived,
        reported: reported,
        diff: derived - reported,
        source: source,
      });
    }

    edgeStages.forEach(function (m) {
      if (m.reported != null && m.value != null) {
        cmp(m.name, m.value, m.reported, "stageMs.edge." + m.id);
      }
    });
    cloudStages.forEach(function (m) {
      if (m.reported != null && m.value != null) {
        cmp(m.name, m.value, m.reported, "stageMs.cloud." + m.id);
      }
    });
    transport.forEach(function (r) {
      var g = (trace.transportMs && trace.transportMs[r.key]) || {};
      cmp(r.label + " · 首包", r.firstCheck, num(g.first), "transportMs." + r.key + ".first");
      cmp(r.label + " · 尾包", r.lastCheck, num(g.last), "transportMs." + r.key + ".last");
      cmp(r.label + " · 均值", r.avgCheck, num(g.avg), "transportMs." + r.key + ".avg");
    });

    if (waterfall.total) {
      var sum = 0;
      waterfall.rows.forEach(function (r) {
        if (!r.overlap && r.dur > 0) sum += r.dur;
      });
      checks.push({
        label: "瀑布分段之和 vs 时间轴跨度",
        derived: sum,
        reported: waterfall.total,
        diff: sum - waterfall.total,
        source: "分段闭合性自检",
      });
    }

    return checks;
  }

  /* ------------------------------------------------------------------ *
   * 事件序列 & 字段覆盖
   * ------------------------------------------------------------------ */

  function buildTimeline(trace, base) {
    var ts = trace.timestamps || {};
    var out = [];
    ["edge", "cloud"].forEach(function (layer) {
      var group = ts[layer] || {};
      Object.keys(group).forEach(function (key) {
        var v = num(group[key]);
        if (v == null || !isTimestampField(layer, key, v)) return;
        out.push({
          layer: layer,
          key: key,
          abs: v,
          offset: base == null ? null : v - base,
          desc: (FIELDS[layer] && FIELDS[layer][key]) || "",
        });
      });
    });
    out.sort(function (a, b) {
      return a.abs - b.abs;
    });
    return out;
  }

  function buildCoverage(trace) {
    var ts = trace.timestamps || {};
    var present = [];
    var missing = [];
    ["edge", "cloud"].forEach(function (layer) {
      var dict = FIELDS[layer] || {};
      var group = ts[layer] || {};
      Object.keys(dict).forEach(function (key) {
        var item = { layer: layer, key: key, desc: dict[key] };
        if (num(group[key]) != null) present.push(item);
        else missing.push(item);
      });
    });

    var extra = [];
    ["edge", "cloud"].forEach(function (layer) {
      var dict = FIELDS[layer] || {};
      var group = ts[layer] || {};
      Object.keys(group).forEach(function (key) {
        if (key in dict) return;
        var v = num(group[key]);
        var known = NON_TIMESTAMP[layer] && NON_TIMESTAMP[layer][key];
        var isTs = v != null && isTimestampField(layer, key, v);
        extra.push({
          layer: layer,
          key: key,
          value: group[key],
          kind: isTs ? "timestamp" : "duration",
          desc: known || (isTs ? "字段字典中未定义的时间戳。" : "数值不是 epoch 毫秒，未纳入事件序列。"),
        });
      });
    });

    var leftover = ts.device;
    if (leftover && typeof leftover === "object" && Object.keys(leftover).length) {
      extra.push({
        layer: "device",
        key: "(整段)",
        value: leftover,
        kind: "legacy",
        desc: "schema v3 已删除 timestamps.device。网关不再接收音频 / shell 子进程上报。",
      });
    }

    return { present: present, missing: missing, extra: extra };
  }

  function buildDiagnostics(ts, transport, skew) {
    var diagnostics = [];
    var edge = (ts && ts.edge) || {};
    var cloud = (ts && ts.cloud) || {};
    var hasEdge = Object.keys(edge).length > 0;
    var hasCloud = Object.keys(cloud).length > 0;

    (transport || []).forEach(function (r) {
      ["first", "last"].forEach(function (sample) {
        var val = r[sample];
        if (typeof val === "number" && val < -skew) {
          diagnostics.push(
            r.key + "." + sample + "=" + val + "ms 超出 NTP 预期偏差（±" + skew + "ms），端云时钟或埋点异常"
          );
        }
      });
    });

    if (hasEdge) {
      if (num(edge.awakeMs) == null) {
        diagnostics.push("无 awakeMs：非语音会话，或未收到 ZMQ audio:awake");
      }
      if (num(edge.audioInputStartMs) == null) {
        diagnostics.push("无 audioInputStartMs/audioInputEndMs：非语音会话，无 ZMQ audio:input");
      } else if (num(edge.audioInputEndMs) == null) {
        diagnostics.push("有 audio:input 首包但无 END 包：录音未正常收口");
      }
      if (num(edge.audioOutputFirstMs) == null) {
        diagnostics.push("无 audioOutputFirstMs：TTS 关闭、纯指令响应，或云端未下发音频");
      }
      if (num(edge.firstCommandShellPushMs) == null) {
        diagnostics.push("无 firstCommandShellPushMs：本轮云端只回了语音，没有业务指令");
      }
      if (num(edge.shellDoneMs) == null) {
        diagnostics.push("无 shellDoneMs：会话未正常收口（被打断、超时或 shell 异常）");
      }
      if (!hasCloud) {
        diagnostics.push("cloud 段为空：云端未下发 latency（returnLatency 未开启或包丢失）");
      }
    }

    return diagnostics;
  }

  function buildBlocked(metrics) {
    return metrics
      .filter(function (m) {
        return m.value == null && m.missing.length;
      })
      .map(function (m) {
        return { name: m.name, missing: m.missing };
      });
  }

  function findMetric(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 多条 trace 汇总
   * ------------------------------------------------------------------ */

  function quantile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var h = (sorted.length - 1) * p;
    var lo = Math.floor(h);
    var hi = Math.ceil(h);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
  }

  function histogram(sorted, bins) {
    bins = bins || 10;
    var out = [];
    var i;
    for (i = 0; i < bins; i++) out.push({ n: 0, from: null, to: null });
    if (!sorted.length) return out;
    var min = sorted[0];
    var max = sorted[sorted.length - 1];
    if (min === max) {
      out[0].n = sorted.length;
      out[0].from = min;
      out[0].to = max;
      return out;
    }
    var w = (max - min) / bins;
    for (i = 0; i < bins; i++) {
      out[i].from = min + w * i;
      out[i].to = min + w * (i + 1);
    }
    sorted.forEach(function (v) {
      var idx = Math.min(bins - 1, Math.floor((v - min) / w));
      out[idx].n++;
    });
    return out;
  }

  function statsOf(values) {
    var xs = [];
    (values || []).forEach(function (v) {
      if (typeof v === "number" && isFinite(v)) xs.push(v);
    });
    xs.sort(function (a, b) {
      return a - b;
    });
    var n = xs.length;
    var sum = 0;
    xs.forEach(function (v) {
      sum += v;
    });
    return {
      n: n,
      min: n ? xs[0] : null,
      max: n ? xs[n - 1] : null,
      mean: n ? sum / n : null,
      p50: quantile(xs, 0.5),
      p90: quantile(xs, 0.9),
      p99: quantile(xs, 0.99),
      values: xs,
      hist: histogram(xs, 10),
    };
  }

  function collect(okItems, getter) {
    var values = [];
    var missing = 0;
    okItems.forEach(function (it) {
      var v = getter(it.analysis);
      if (typeof v === "number" && isFinite(v)) values.push(v);
      else missing++;
    });
    var st = statsOf(values);
    st.missing = missing;
    return st;
  }

  function metricValue(list, id) {
    var m = findMetric(list || [], id);
    return m ? m.value : null;
  }

  function wfSegDur(a, id) {
    var rows = (a.waterfall && a.waterfall.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i].dur;
    }
    return null;
  }

  function layerMs(a, layer) {
    if (!a.waterfall || !a.waterfall.total) return null;
    var groups = a.waterfall.byLayer || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].layer === layer) return groups[i].ms;
    }
    return 0;
  }

  function layerPct(a, layer) {
    if (!a.waterfall || !a.waterfall.total) return null;
    var groups = a.waterfall.byLayer || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].layer === layer) return groups[i].pct;
    }
    return 0;
  }

  function transportField(a, key, field) {
    var list = a.transport || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i][field];
    }
    return null;
  }

  function seriesFrom(okItems, id, name, group, getter, extra) {
    extra = extra || {};
    var st = collect(okItems, getter);
    st.id = id;
    st.name = name;
    st.group = group;
    st.focus = !!extra.focus;
    st.note = extra.note || "";
    st.layer = extra.layer || null;
    return st;
  }

  function summarize(items) {
    items = items || [];
    var ok = [];
    var failed = [];
    items.forEach(function (it) {
      if (it && it.analysis) ok.push(it);
      else failed.push(it || { error: "空条目" });
    });

    var t0 = null;
    var t1 = null;
    items.forEach(function (it) {
      var a = it && it.analysis;
      var ts = (a && (a.updatedAt || a.createdAt)) || (it && it.mtime) || null;
      if (ts == null) return;
      if (t0 == null || ts < t0) t0 = ts;
      if (t1 == null || ts > t1) t1 = ts;
    });

    function edgeGet(id) {
      return function (a) {
        return metricValue(a.edgeStages, id);
      };
    }
    function cloudGet(id) {
      return function (a) {
        return metricValue(a.cloudStages, id);
      };
    }

    var kpi = [
      seriesFrom(ok, "firstAudio", "首音时延", "kpi", edgeGet("uplinkEndToFirstAudioOutput"), {
        focus: true,
        note: "用户说完到网关转发首个 audio:output。",
      }),
      seriesFrom(ok, "firstAudioShell", "输入结束 → 首个语音指令", "kpi", edgeGet("uplinkEndToFirstAudioShellPush"), {
        focus: true,
        note: "端到端首个 speak token 下发时延。",
      }),
      seriesFrom(ok, "firstCommand", "输入结束 → 首个动作指令", "kpi", edgeGet("uplinkEndToFirstCommandShellPush"), {
        note: "本轮只回语音时该指标常为缺失。",
      }),
      seriesFrom(ok, "sessionClose", "输入结束 → 会话收口", "kpi", edgeGet("uplinkEndToShellDone"), {
        focus: true,
        note: "整轮对话收口耗时。",
      }),
      seriesFrom(
        ok,
        "waterfall",
        "瀑布时间轴跨度",
        "kpi",
        function (a) {
          return a.waterfall && a.waterfall.total ? a.waterfall.total : null;
        },
        { note: "从最早纳入瀑布的阶段起点到最晚阶段终点。" }
      ),
      seriesFrom(ok, "cloudMs", "云端合计", "kpi", function (a) {
        return layerMs(a, "cloud");
      }),
      seriesFrom(ok, "netMs", "网络合计", "kpi", function (a) {
        return layerMs(a, "network");
      }),
    ];

    var edge = EDGE_STAGES.map(function (def) {
      return seriesFrom(ok, def.id, def.name, "edge", edgeGet(def.id), {
        focus: def.focus,
        note: def.note,
        layer: "edge",
      });
    });
    var cloud = CLOUD_STAGES.map(function (def) {
      return seriesFrom(ok, def.id, def.name, "cloud", cloudGet(def.id), {
        focus: def.focus,
        note: def.note,
        layer: "cloud",
      });
    });

    var transport = [];
    TRANSPORT_DEFS.forEach(function (def) {
      ["first", "last", "avg"].forEach(function (field) {
        var label = field === "first" ? "首包" : field === "last" ? "尾包" : "均值";
        transport.push(
          seriesFrom(ok, def.key + "." + field, def.label + " · " + label, "transport", function (a) {
            return transportField(a, def.key, field);
          }, { note: def.note })
        );
      });
    });

    var segments = SEGMENTS.map(function (def) {
      return seriesFrom(ok, def.id, def.name, "segment", function (a) {
        return wfSegDur(a, def.id);
      }, { note: def.note, layer: def.layer, focus: false });
    });

    var layers = ["edge", "network", "cloud", "gap"].map(function (layer) {
      var ms = seriesFrom(ok, "layer." + layer, LAYER_LABEL[layer] || "未归类", "layer", function (a) {
        return layerMs(a, layer);
      }, { layer: layer });
      var pcts = collect(ok, function (a) {
        return layerPct(a, layer);
      });
      ms.pct = pcts;
      return ms;
    });

    var toolDurs = [];
    var toolCalls = 0;
    var toolFails = 0;
    var tracesWithTools = 0;
    var byNameMap = {};
    ok.forEach(function (it) {
      var t = it.analysis.tools;
      if (!t || !t.summary || !t.summary.count) return;
      tracesWithTools++;
      toolCalls += t.summary.count;
      toolFails += t.summary.failCount || 0;
      (t.items || []).forEach(function (x) {
        if (typeof x.dur === "number" && isFinite(x.dur)) toolDurs.push(x.dur);
        var e = byNameMap[x.name] || (byNameMap[x.name] = { name: x.name, count: 0, totalMs: 0, fail: 0, maxMs: null });
        e.count++;
        if (typeof x.dur === "number" && isFinite(x.dur)) {
          e.totalMs += x.dur;
          if (e.maxMs == null || x.dur > e.maxMs) e.maxMs = x.dur;
        }
        if (x.success === false) e.fail++;
      });
    });
    var byName = Object.keys(byNameMap)
      .map(function (k) {
        var e = byNameMap[k];
        e.meanMs = e.count ? e.totalMs / e.count : null;
        return e;
      })
      .sort(function (a, b) {
        return b.totalMs - a.totalMs;
      });

    var traces = ok.map(function (it) {
      var a = it.analysis;
      return {
        name: it.name,
        size: it.size,
        mtime: it.mtime,
        traceId: a.traceId,
        firstAudio: metricValue(a.edgeStages, "uplinkEndToFirstAudioOutput"),
        firstAudioShell: metricValue(a.edgeStages, "uplinkEndToFirstAudioShellPush"),
        firstCommand: metricValue(a.edgeStages, "uplinkEndToFirstCommandShellPush"),
        sessionClose: metricValue(a.edgeStages, "uplinkEndToShellDone"),
        waterfall: a.waterfall && a.waterfall.total ? a.waterfall.total : null,
        cloudMs: layerMs(a, "cloud"),
        netMs: layerMs(a, "network"),
        tools: a.tools && a.tools.summary ? a.tools.summary.count : 0,
        toolFails: a.tools && a.tools.summary ? a.tools.summary.failCount : 0,
        updatedAt: a.updatedAt || a.createdAt || it.mtime || null,
      };
    });

    return {
      total: items.length,
      ok: ok.length,
      failed: failed,
      range: { from: t0, to: t1 },
      kpi: kpi,
      edge: edge,
      cloud: cloud,
      transport: transport,
      segments: segments,
      layers: layers,
      tools: {
        tracesWithTools: tracesWithTools,
        callCount: toolCalls,
        failCount: toolFails,
        duration: statsOf(toolDurs),
        byName: byName,
      },
      traces: traces,
    };
  }

  /* ------------------------------------------------------------------ *
   * 入口
   * ------------------------------------------------------------------ */

  function analyze(trace) {
    if (!trace || typeof trace !== "object") throw new Error("trace 必须是一个对象");
    trace = normalizeTrace(trace);
    var ts = trace.timestamps || {};
    var waterfall = buildWaterfall(ts);
    var edgeStages = buildEdgeStages(trace);
    var cloudStages = buildCloudStages(trace);
    var metrics = edgeStages.concat(cloudStages);
    var transport = buildTransport(trace);
    var packets = buildPacketLatency(trace);
    var checks = buildChecks(trace, edgeStages, cloudStages, transport, waterfall);
    var timeline = buildTimeline(trace, waterfall.base);
    var coverage = buildCoverage(trace);
    var blocked = buildBlocked(metrics);
    var tools = buildToolCalls(trace, waterfall.base);
    var skew = trace.clock && num(trace.clock.expectedSkewMs);
    if (skew == null) skew = 10;
    var clock = trace.clock && typeof trace.clock === "object" ? trace.clock : { mode: "ntp", expectedSkewMs: skew };
    if (clock.expectedSkewMs == null) clock.expectedSkewMs = skew;
    var diagnostics = buildDiagnostics(ts, transport, skew);

    return {
      trace: trace,
      traceId: trace.traceId || "(无 traceId)",
      schemaVersion: trace.schemaVersion,
      clock: clock,
      diagnostics: diagnostics,
      tools: tools,
      createdAt: num(trace.createdAt),
      updatedAt: num(trace.updatedAt),
      waterfall: waterfall,
      edgeStages: edgeStages,
      cloudStages: cloudStages,
      metrics: metrics,
      transport: transport,
      packets: packets,
      checks: checks,
      timeline: timeline,
      coverage: coverage,
      blocked: blocked,
      spans: edgeStages,
      firstAudio: findMetric(edgeStages, "uplinkEndToFirstAudioOutput"),
      firstResponse: findMetric(edgeStages, "uplinkEndToFirstChatResponse"),
      sessionSpan: findMetric(edgeStages, "awakeToShellDone") || findMetric(edgeStages, "uplinkEndToShellDone"),
    };
  }

  global.TraceModel = {
    analyze: analyze,
    normalize: normalizeTrace,
    summarize: summarize,
    FIELDS: FIELDS,
    SEGMENTS: SEGMENTS,
    EDGE_STAGES: EDGE_STAGES,
    CLOUD_STAGES: CLOUD_STAGES,
    METRICS: CLOUD_STAGES,
    LAYER_LABEL: LAYER_LABEL,
  };
})(typeof window !== "undefined" ? window : this);
