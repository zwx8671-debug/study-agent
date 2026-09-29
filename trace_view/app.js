/**
 * Trace 看板渲染层。
 *
 * 只呈现由 trace JSON 直接派生的客观数值、计算式与字段覆盖情况，
 * 不包含任何判断性结论或优化建议。
 */
(function () {
  "use strict";

  var M = window.TraceModel;
  var current = null;
  var currentSummary = null;
  var viewMode = "trace";
  var summarySort = "firstAudio";
  var hasServerList = false;
  var SUMMARY_HASH = "summary";

  /* ------------------------------------------------------------------ *
   * DOM helper
   * ------------------------------------------------------------------ */

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }

  function add(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) {
        add(el, c);
      });
      return;
    }
    el.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /* ------------------------------------------------------------------ *
   * 格式化
   * ------------------------------------------------------------------ */

  function ms(v, digits) {
    if (v == null) return "—";
    var n = digits ? v.toFixed(digits) : String(Math.round(v));
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " ms";
  }

  function pct(v) {
    return v == null ? "—" : v.toFixed(1) + "%";
  }

  function signed(v) {
    if (v == null) return "—";
    return (v > 0 ? "+" : "") + Math.round(v);
  }

  function clock(t) {
    if (t == null) return "—";
    var d = new Date(t);
    function p(n, w) {
      return String(n).padStart(w || 2, "0");
    }
    return (
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "." + p(d.getMilliseconds(), 3)
    );
  }

  function datetime(t) {
    if (t == null) return "—";
    var d = new Date(t);
    function p(n, w) {
      return String(n).padStart(w || 2, "0");
    }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + clock(t);
  }

  /* ------------------------------------------------------------------ *
   * 通用表格
   * ------------------------------------------------------------------ */

  function table(headers, rows, opts) {
    opts = opts || {};
    var align = opts.align || [];
    var thead = h(
      "thead",
      null,
      h(
        "tr",
        null,
        headers.map(function (t, i) {
          return h("th", { class: align[i] === "r" ? "num" : null }, t);
        })
      )
    );
    var tbody = h(
      "tbody",
      null,
      rows.map(function (cells) {
        var meta = cells.__meta || {};
        var cls = [];
        if (opts.striped) cls.push("striped");
        if (meta.onClick) cls.push("clickable");
        if (meta.rowClass) cls.push(meta.rowClass);
        return h(
          "tr",
          { class: cls.join(" ") || null, onClick: meta.onClick || null, title: meta.title || null },
          cells.map(function (c, i) {
            var cls = [];
            if (align[i] === "r") cls.push("num");
            if (meta.cellClass && meta.cellClass[i]) cls.push(meta.cellClass[i]);
            return h("td", { class: cls.join(" ") || null }, c);
          })
        );
      })
    );
    return h("table", null, thead, tbody);
  }

  function marker(kind, text) {
    return h("span", null, h("span", { class: "marker " + kind }), text);
  }

  function sectionHead(title, sub) {
    return h("div", { class: "sec-head" }, h("h2", null, title), sub ? h("p", { class: "small dim" }, sub) : null);
  }

  function subHead(title, sub) {
    return h("div", { class: "sec-head" }, h("h3", null, title), sub ? h("p", { class: "small dim" }, sub) : null);
  }

  function noData(label) {
    return h("td", { class: "nodata" }, label || "无数据");
  }

  /* ------------------------------------------------------------------ *
   * 概览
   * ------------------------------------------------------------------ */

  function stat(value, label, accent) {
    return h(
      "div",
      { class: "stat" + (accent ? " accent" : "") },
      h("div", { class: "v" }, value),
      h("div", { class: "l" }, label)
    );
  }

  function renderOverview(a) {
    var wf = a.waterfall;
    var biggest = null;
    wf.rows.forEach(function (r) {
      if (r.kind === "seg" && !r.overlap && (!biggest || r.dur > biggest.dur)) biggest = r;
    });

    var cloudPart = wf.byLayer.filter(function (g) {
      return g.layer === "cloud";
    })[0];
    var netPart = wf.byLayer.filter(function (g) {
      return g.layer === "network";
    })[0];

    var ts = a.tools.summary;
    var stats = [];
    var firstAudio = a.firstAudio && a.firstAudio.value != null
      ? a.firstAudio
      : (a.cloudStages || []).filter(function (m) { return m.id === "firstAudioDelay" && m.value != null; })[0];
    if (firstAudio) {
      stats.push(
        stat(
          firstAudio.value == null ? "—" : ms(firstAudio.value),
          a.firstAudio && a.firstAudio.value != null ? "首音时延" : "首个音频包延迟（云端）",
          firstAudio.value != null
        )
      );
    }
    if (wf.total) stats.push(stat(ms(wf.total), "瀑布时间轴跨度"));
    if (biggest) stats.push(stat(ms(biggest.dur), "最长阶段 · " + biggest.name));
    if (cloudPart) stats.push(stat(ms(cloudPart.ms), "云端合计（" + pct(cloudPart.pct) + "）"));
    if (netPart) stats.push(stat(ms(netPart.ms), "网络合计（" + pct(netPart.pct) + "）"));
    stats.push(
      stat(
        ts.count ? String(ts.count) + " 次 / " + ms(ts.totalMs) : "0 次",
        ts.failCount ? "工具调用（失败 " + ts.failCount + "）" : "工具调用"
      )
    );
    stats.push(stat(String(a.coverage.missing.length), "本轮未发生的字段"));

    var meta = [];
    if (a.clock) {
      meta.push(
        "时钟 " + (a.clock.mode || "未知") +
          (a.clock.expectedSkewMs != null ? "，预期偏差 " + a.clock.expectedSkewMs + "ms" : "")
      );
    }
    if (a.schemaVersion != null) meta.push("schema v" + a.schemaVersion);
    if (a.createdAt != null) meta.push("createdAt " + clock(a.createdAt));
    if (a.updatedAt != null) meta.push("updatedAt " + clock(a.updatedAt));

    return h(
      "section",
      null,
      h(
        "div",
        { class: "stack", style: { gap: "6px" } },
        h("h1", null, "链路时延指标 · " + a.traceId),
        meta.length ? h("p", { class: "sub small" }, meta.join(" · ")) : null
      ),
      h("div", { class: "stats", style: { marginTop: "18px" } }, stats)
    );
  }

  /* ------------------------------------------------------------------ *
   * 瀑布
   * ------------------------------------------------------------------ */

  function renderWaterfall(a) {
    var wf = a.waterfall;
    if (!wf.rows.length) {
      return h(
        "section",
        null,
        sectionHead("端到端时延瀑布"),
        h("div", { class: "callout" }, "缺少可用于构建瀑布的时间戳，无法绘制。")
      );
    }

    var biggest = null;
    wf.rows.forEach(function (r) {
      if (r.kind === "seg" && !r.overlap && (!biggest || r.dur > biggest.dur)) biggest = r;
    });

    var bars = wf.rows.map(function (r) {
      var isTop = biggest && r === biggest;
      var left = ((r.start - wf.base) / wf.total) * 100;
      var width = (r.dur / wf.total) * 100;
      var barCls = r.kind === "gap" ? "gap" : isTop ? "top" : r.layer;
      var title =
        r.name +
        "：" +
        ms(r.dur) +
        "\n" +
        clock(r.start) +
        " → " +
        clock(r.end) +
        (r.note ? "\n" + r.note : "") +
        (r.overlap ? "\n与前一阶段在时间上重叠。" : "") +
        (r.cross ? "\n跨机器计算，受 NTP 偏差影响。" : "");

      return h(
        "div",
        { class: "wf-row" + (isTop ? " top" : ""), title: title },
        h("div", { class: "wf-name" }, r.name + (r.overlap ? "（重叠）" : "")),
        h(
          "div",
          { class: "wf-track" },
          h("div", {
            class: "wf-bar " + barCls,
            style: { left: left + "%", width: Math.max(width, 0) + "%" },
          })
        ),
        h("div", { class: "wf-ms" }, ms(r.dur)),
        h("div", { class: "wf-pct" }, pct((r.dur / wf.total) * 100))
      );
    });

    // 时间轴刻度：取一个好看的步长，末尾额外标出总跨度
    var step = niceStep(wf.total);
    var ticks = [];
    for (var t = 0; t < wf.total; t += step) ticks.push(t);
    ticks.push(wf.total);

    var axis = h(
      "div",
      { class: "wf-row" },
      h("div", { class: "wf-name" }),
      h(
        "div",
        { class: "wf-axis" },
        ticks.map(function (v) {
          var p = (v / wf.total) * 100;
          var transform = v === 0 ? "none" : p >= 99.5 ? "translateX(-100%)" : "translateX(-50%)";
          return h("div", { class: "wf-tick", style: { left: p + "%", transform: transform } }, String(Math.round(v)));
        })
      ),
      h("div", { class: "wf-ms" }),
      h("div", { class: "wf-pct" })
    );

    var legendItems = [
      { k: "edge", t: "网关" },
      { k: "network", t: "网络" },
      { k: "cloud", t: "云端" },
      { k: "top", t: "最长阶段" },
    ];
    if (
      wf.rows.some(function (r) {
        return r.kind === "gap";
      })
    ) {
      legendItems.push({ k: "gap", t: "未归类间隙" });
    }

    var startName = wf.rows[0].name;
    var endRow = wf.rows[wf.rows.length - 1];

    var body = [
      subHead(
        "端到端时延瀑布",
        "横轴为耗时（ms），纵轴为按时间排序的串行阶段。起点为「" +
          startName +
          "」的开始，终点为「" +
          endRow.name +
          "」的结束，跨度 " +
          ms(wf.total) +
          "。相邻阶段之间若存在无埋点覆盖的时间，以「未归类间隙」补齐，因此各段之和恒等于跨度。"
      ),
      h("div", { class: "stack", style: { gap: "3px" } }, bars),
      axis,
      h(
        "div",
        { class: "legend" },
        legendItems.map(function (it) {
          return h("div", { class: "item" }, h("div", { class: "dot " + it.k }), it.t);
        }),
        h("div", { class: "item faint" }, "来源：单条 trace，非统计聚合")
      ),
    ];

    // 阶段明细表
    body.push(
      h("div", { style: { marginTop: "18px" } }),
      table(
        ["阶段", "归属", "耗时", "占比", "起点 → 终点", "口径"],
        wf.rows.map(function (r) {
          var cells = [
            r.name,
            r.kind === "gap" ? "—" : M.LAYER_LABEL[r.layer] + (r.cross ? " · 跨机器" : ""),
            ms(r.dur),
            pct((r.dur / wf.total) * 100),
            r.kind === "gap"
              ? "—"
              : h("span", { class: "mono small" }, shortPath(r.from) + " → " + shortPath(r.to)),
            r.note || "",
          ];
          cells.__meta = { cellClass: [r === biggest ? "strong" : null, null, r === biggest ? "strong" : null] };
          return cells;
        }),
        { align: [null, null, "r", "r", null, null], striped: true }
      )
    );

    if (wf.skipped.length) {
      body.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("因字段缺失而未纳入瀑布的阶段", "以下阶段的起点或终点未上报，已跳过，其时间落入相邻的未归类间隙。"),
        table(
          ["阶段", "缺失字段"],
          wf.skipped.map(function (s) {
            return [s.def.name, h("span", { class: "mono small" }, s.missing.join("、"))];
          }),
          { striped: true }
        )
      );
    }

    if (wf.negatives.length) {
      body.push(
        h("div", { style: { marginTop: "16px" } }),
        h(
          "div",
          { class: "callout" },
          h("div", { class: "t" }, "存在负值阶段"),
          "以下阶段的终点早于起点，说明两端时钟未对齐或埋点顺序异常：" +
            wf.negatives
              .map(function (s) {
                return s.name + "（" + ms(s.dur) + "）";
              })
              .join("、")
        )
      );
    }

    return h("section", null, body);
  }

  function niceStep(total) {
    var target = total / 8;
    var pow = Math.pow(10, Math.floor(Math.log10(target)));
    var candidates = [1, 2, 2.5, 5, 10].map(function (m) {
      return m * pow;
    });
    for (var i = 0; i < candidates.length; i++) if (candidates[i] >= target) return candidates[i];
    return candidates[candidates.length - 1];
  }

  function shortPath(p) {
    return String(p).split(".").pop();
  }

  /* ------------------------------------------------------------------ *
   * 层级归属
   * ------------------------------------------------------------------ */

  function renderSplit(a) {
    var wf = a.waterfall;
    if (!wf.byLayer.length) return null;

    return h(
      "section",
      null,
      subHead("时间轴跨度按责任方归属", "只统计瀑布中非重叠阶段，合计 " + ms(wf.total) + "。"),
      h(
        "div",
        { class: "split" },
        wf.byLayer.map(function (g) {
          var cls = g.layer === "gap" ? "gap" : g.layer;
          return h("div", {
            class: "wf-bar-fill",
            title: g.label + " " + ms(g.ms) + "（" + pct(g.pct) + "）",
            style: {
              width: g.pct + "%",
              background:
                cls === "cloud"
                  ? "var(--accent)"
                  : cls === "network"
                  ? "var(--cyan)"
                  : cls === "edge"
                  ? "var(--gray)"
                  : "var(--fill-2)",
            },
          });
        })
      ),
      h(
        "div",
        { class: "legend" },
        wf.byLayer.map(function (g) {
          return h(
            "div",
            { class: "item" },
            h("div", { class: "dot " + (g.layer === "gap" ? "gap" : g.layer) }),
            h("span", { style: { color: "var(--text-1)" } }, g.label + " " + ms(g.ms)),
            h("span", { class: "faint" }, pct(g.pct))
          );
        })
      )
    );
  }

  /* ------------------------------------------------------------------ *
   * 云端指标
   * ------------------------------------------------------------------ */

  function metricRows(list) {
    return list.map(function (m) {
      var value = m.value == null ? h("span", { class: "nodata" }, "无数据") : ms(m.value);
      var range =
        m.range && m.value != null
          ? h("span", { class: "mono small" }, clock(m.range[0]) + " → " + clock(m.range[1]))
          : m.missing.length
          ? h("span", { class: "small faint" }, "缺 " + m.missing.join("、"))
          : "";
      var cells = [
        m.focus ? marker(m.value == null ? "none" : "info", m.name) : m.name,
        h("span", { class: "mono small" }, m.expr),
        value,
        range,
        m.note || "",
      ];
      cells.__meta = { cellClass: [m.focus ? "strong" : null, null, m.value != null ? "strong" : "nodata"] };
      return cells;
    });
  }

  function renderMetrics(a) {
    var els = [
      sectionHead(
        "阶段耗时",
        "云端指标与 MetricsLogger.collectChatDurations 一致（不钳负值）。网关阶段仍按同一时钟相减并钳到 0。缺任一端点即为无数据。"
      ),
      subHead("stageMs.edge · 网关", "同一时钟相减。纯文本会话没有 audioInputEndMs 时，uplinkEnd* 以 chatEmitLastMs 为起点。"),
      table(
        ["指标", "计算式", "数值", "时间区间 / 缺失项", "口径"],
        metricRows(a.edgeStages || []),
        { align: [null, null, "r", null, null], striped: true }
      ),
      h("div", { style: { marginTop: "16px" } }),
      subHead("stageMs.cloud · 云端", "按云端 collectChatDurations 从 timestamps.cloud 相减。mock_app 与 chat-socketio 只要时间戳相同，这里数字就相同。"),
    ];

    var cloudFocus = (a.cloudStages || []).filter(function (m) {
      return m.focus;
    });
    var cloudRest = (a.cloudStages || []).filter(function (m) {
      return !m.focus;
    });
    els.push(
      table(["指标", "计算式", "数值", "时间区间 / 缺失项", "口径"], metricRows(cloudFocus.length ? cloudFocus : a.cloudStages || []), {
        align: [null, null, "r", null, null],
        striped: true,
      })
    );
    if (cloudRest.length && cloudFocus.length) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("补充云端指标", "同一份埋点派生的其余时长，用于对照。"),
        table(["指标", "计算式", "数值", "时间区间 / 缺失项", "口径"], metricRows(cloudRest), {
          align: [null, null, "r", null, null],
          striped: true,
        })
      );
    }

    if (a.blocked.length) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("因字段缺失无法计算的指标", "下列指标所依赖的时间戳本轮没有发生，diagnostics 会解释原因。"),
        table(
          ["指标", "缺失字段"],
          a.blocked.map(function (b) {
            return [b.name, h("span", { class: "mono small" }, b.missing.join("、"))];
          }),
          { striped: true }
        )
      );
    }

    return h("section", null, els);
  }

  /* ------------------------------------------------------------------ *
   * 网络时延
   * ------------------------------------------------------------------ */

  function renderTransport(a) {
    if (!a.transport.length && !a.packets.length) return null;

    var els = [
      sectionHead(
        "网络时延",
        "跨端相减，故意保留负数；负得超过 clock.expectedSkewMs" +
          (a.clock && a.clock.expectedSkewMs != null ? "（" + a.clock.expectedSkewMs + "ms）" : "") +
          " 说明端云 NTP 未对齐或埋点异常。"
      ),
    ];

    if (a.transport.length) {
      els.push(
        table(
          ["方向", "首包", "尾包", "均值", "首包区间", "尾包区间", "口径"],
          a.transport.map(function (r) {
            var firstCell =
              r.first == null
                ? h("span", { class: "nodata" }, "—")
                : r.firstCheck != null && r.firstCheck !== r.first
                ? ms(r.first) + "（复核 " + ms(r.firstCheck) + "）"
                : ms(r.first);
            return [
              r.skew || r.spread ? marker("warn", r.label) : r.label,
              firstCell,
              ms(r.last),
              ms(r.avg),
              r.firstSendMs != null
                ? h("span", { class: "mono small" }, clock(r.firstSendMs) + " → " + clock(r.firstRecvMs))
                : "—",
              r.lastSendMs != null
                ? h("span", { class: "mono small" }, clock(r.lastSendMs) + " → " + clock(r.lastRecvMs))
                : "—",
              r.note +
                (r.skew ? " 存在超出预期偏差的负值。" : "") +
                (r.spread
                  ? " 本条 trace 中 first 显著大于 last，说明 first 的起止点之间还包含了非网络的业务时间。"
                  : ""),
            ];
          }),
          { align: [null, "r", "r", "r", null, null, null], striped: true }
        )
      );
    }

    if (a.packets.length) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead(
          "chatResponseFirstPackets · 前 3 条原始包",
          "用来核对云端首包到底回了什么（root 占位、speak，还是业务指令）。userEndDelayMs 相对 audioInputEndMs。"
        ),
        table(
          ["#", "flag / idx", "内容", "云端生成", "边缘接收", "单程时延", "距用户尾包"],
          a.packets.map(function (p) {
            var content = p.text
              ? (p.name ? p.name + " · " : "") + "text: " + p.text
              : p.name
              ? "name: " + p.name
              : "（占位包，无内容）";
            return [
              String(p.index),
              h("span", { class: "mono small" }, String(p.flag) + " / " + String(p.idx)),
              content,
              h("span", { class: "mono small" }, clock(p.sent)),
              h("span", { class: "mono small" }, clock(p.recv)),
              ms(p.latency),
              ms(p.userEndDelayMs),
            ];
          }),
          { align: ["r", null, null, null, null, "r", "r"], striped: true }
        )
      );
    }

    return h("section", null, els);
  }

  /* ------------------------------------------------------------------ *
   * 一致性校验
   * ------------------------------------------------------------------ */

  function renderChecks(a) {
    if (!a.checks.length) return null;
    var bad = a.checks.filter(function (c) {
      return c.diff !== 0;
    }).length;

    return h(
      "section",
      null,
      sectionHead(
        "一致性校验",
        "把本页由原始时间戳重算的结果与 trace 自带的 stageMs / transportMs 逐项比对。" +
          (bad ? bad + " 项存在差异。" : "全部一致。")
      ),
      table(
        ["项目", "本页重算", "trace 上报", "差值", "上报字段"],
        a.checks.map(function (c) {
          return [
            marker(c.diff === 0 ? "ok" : "warn", c.label),
            ms(c.derived),
            ms(c.reported),
            signed(c.diff),
            h("span", { class: "mono small" }, c.source),
          ];
        }),
        { align: [null, "r", "r", "r", null], striped: true }
      )
    );
  }

  function renderSchemaWarn(a) {
    if (a.schemaVersion == null || a.schemaVersion === 3) return null;
    return h(
      "div",
      { class: "callout", style: { marginTop: "16px" } },
      h("div", { class: "t" }, "schemaVersion = " + a.schemaVersion),
      "当前看板按 schema v3 解读。网关会忽略并重建不等于 3 的旧文件；本页仍尽量用已有 timestamps 计算，但字段可能对不上。"
    );
  }

  /* ------------------------------------------------------------------ *
   * 事件序列
   * ------------------------------------------------------------------ */

  function renderTimeline(a) {
    if (!a.timeline.length) return null;
    var base = a.waterfall.base;

    return h(
      "section",
      null,
      sectionHead(
        "完整事件序列",
        "timestamps 下全部已上报节点，按绝对时间排序。偏移量相对瀑布起点 " +
          (base != null ? base + "（" + clock(base) + "）" : "未定义") +
          "，负值为该起点之前发生的事件。"
      ),
      table(
        ["偏移", "层", "字段", "时刻", "绝对值", "发生时机"],
        a.timeline.map(function (e) {
          return [
            e.offset == null ? "—" : signed(e.offset),
            M.LAYER_LABEL[e.layer] || e.layer,
            h("span", { class: "mono small" }, e.key),
            h("span", { class: "mono small" }, clock(e.abs)),
            h("span", { class: "mono small faint" }, String(e.abs)),
            e.desc,
          ];
        }),
        { align: ["r", null, null, null, "r", null], striped: true }
      )
    );
  }

  /* ------------------------------------------------------------------ *
   * 字段覆盖
   * ------------------------------------------------------------------ */

  function renderCoverage(a) {
    var c = a.coverage;
    var total = c.present.length + c.missing.length;

    var els = [
      sectionHead(
        "埋点字段覆盖",
        "schema v3 字段字典共 " +
          total +
          " 项（edge + cloud），本条 trace 上报 " +
          c.present.length +
          " 项。未上报不代表故障，该事件本轮可能本来就没有发生。"
      ),
    ];

    if (c.missing.length) {
      els.push(
        table(
          ["层", "未上报字段", "该字段的定义"],
          c.missing.map(function (f) {
            return [
              M.LAYER_LABEL[f.layer] || f.layer,
              h("span", { class: "mono small" }, f.key),
              f.desc,
            ];
          }),
          { striped: true }
        )
      );
    }

    if (c.extra.length) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("字典外字段", "trace 中存在但字段字典未收录的时间戳。"),
        table(
          ["层", "字段"],
          c.extra.map(function (f) {
            return [f.layer, h("span", { class: "mono small" }, f.key)];
          }),
          { striped: true }
        )
      );
    }

    return h("section", null, els);
  }

  /* ------------------------------------------------------------------ *
   * 工具调用
   * ------------------------------------------------------------------ */

  function renderTools(a) {
    var t = a.tools;
    var s = t.summary;

    if (!s.count) {
      return h(
        "section",
        null,
        sectionHead("工具调用", "来源 toolCalls，云端 latency.toolCalls 原样保留。"),
        h("div", { class: "callout" }, "本轮 toolCalls 为空数组，没有记录任何 Function Calling。")
      );
    }

    var els = [
      sectionHead(
        "工具调用",
        "来源 toolCalls（云端 latency.toolCalls 原样保留），每项含 name、startTime、durationMs、success 与可选 error。"
      ),
      h(
        "div",
        { class: "stats", style: { marginBottom: "16px" } },
        [
          stat(String(s.count), "调用次数"),
          stat(ms(s.totalMs), "durationMs 之和"),
          s.spanMs != null ? stat(ms(s.spanMs), "时间轴跨度") : null,
          stat(
            String(s.okCount) + " / " + String(s.failCount) + (s.unknownCount ? " / " + s.unknownCount : ""),
            "成功 / 失败" + (s.unknownCount ? " / 未知" : "")
          ),
          s.longest ? stat(ms(s.longest.dur), "最长 · " + s.longest.name, true) : null,
        ].filter(Boolean)
      ),
    ];

    if (s.parallelCount) {
      els.push(
        h(
          "div",
          { class: "callout", style: { marginBottom: "16px" } },
          h("div", { class: "t" }, "存在并行调用"),
          String(s.parallelCount) +
            " 次调用的执行区间与更早的调用重叠，因此 durationMs 之和（" +
            ms(s.totalMs) +
            "）大于时间轴上的实际跨度（" +
            ms(s.spanMs) +
            "）。"
        )
      );
    }

    // 甘特图：与整条链路共用一根时间轴，便于定位工具调用发生在哪个阶段
    if (t.ordered.length && a.waterfall.base != null) {
      var t0 = Math.min(a.waterfall.base, s.spanStart);
      var t1 = Math.max(a.waterfall.end, s.spanEnd);
      var range = t1 - t0 || 1;

      var chainLeft = ((a.waterfall.base - t0) / range) * 100;
      var chainWidth = ((a.waterfall.end - a.waterfall.base) / range) * 100;

      var gantt = [
        h(
          "div",
          { class: "wf-row" },
          h("div", { class: "wf-name" }, "整条链路"),
          h(
            "div",
            { class: "wf-track" },
            h("div", {
              class: "wf-bar",
              title: "瀑布时间轴 " + ms(a.waterfall.end - a.waterfall.base),
              style: {
                left: chainLeft + "%",
                width: chainWidth + "%",
                background: "var(--fill-2)",
              },
            })
          ),
          h("div", { class: "wf-ms" }, ms(a.waterfall.end - a.waterfall.base)),
          h("div", { class: "wf-pct" })
        ),
      ];

      t.ordered.forEach(function (x) {
        var left = ((x.start - t0) / range) * 100;
        var width = (x.dur / range) * 100;
        gantt.push(
          h(
            "div",
            { class: "wf-row" + (x === s.longest ? " top" : ""), title: x.name + "\n" + clock(x.start) + " → " + clock(x.end) },
            h("div", { class: "wf-name" }, x.name + (x.parallel ? "（并行）" : "")),
            h(
              "div",
              { class: "wf-track" },
              h("div", {
                class: "wf-bar " + (x.success === false ? "" : x === s.longest ? "top" : "cloud"),
                style: {
                  left: left + "%",
                  width: Math.max(width, 0) + "%",
                  background: x.success === false ? "var(--red)" : null,
                },
              })
            ),
            h("div", { class: "wf-ms" }, ms(x.dur)),
            h("div", { class: "wf-pct" }, signed(x.offset))
          )
        );
      });

      els.push(
        subHead(
          "工具调用时间线",
          "与端到端瀑布共用同一根时间轴，横轴为耗时（ms）。最右列是相对瀑布起点的偏移。"
        ),
        h("div", { class: "stack", style: { gap: "3px" } }, gantt),
        h(
          "div",
          { class: "legend" },
          h("div", { class: "item" }, h("div", { class: "dot cloud" }), "工具调用"),
          h("div", { class: "item" }, h("div", { class: "dot top" }), "最长调用"),
          s.failCount
            ? h(
                "div",
                { class: "item" },
                h("div", { class: "dot", style: { background: "var(--red)" } }),
                "失败"
              )
            : null,
          h("div", { class: "item" }, h("div", { class: "dot gap" }), "整条链路跨度")
        ),
        h("div", { style: { marginTop: "18px" } })
      );
    }

    els.push(
      table(
        ["#", "工具名", "开始时刻", "相对起点", "耗时", "结果", "错误"],
        t.items.map(function (x) {
          var resultCell =
            x.success === true
              ? marker("ok", "成功")
              : x.success === false
              ? marker("bad", "失败")
              : marker("none", "未记录");
          var cells = [
            String(x.seq),
            x.name + (x.parallel ? "（并行）" : ""),
            x.start != null ? h("span", { class: "mono small" }, clock(x.start)) : "—",
            x.offset != null ? signed(x.offset) : "—",
            x.dur != null ? ms(x.dur) : h("span", { class: "nodata" }, "—"),
            resultCell,
            x.error ? h("span", { class: "mono small" }, x.error) : x.missing.length ? "缺 " + x.missing.join("、") : "",
          ];
          cells.__meta = { cellClass: [null, x === s.longest ? "strong" : null, null, null, x === s.longest ? "strong" : null] };
          return cells;
        }),
        { align: ["r", null, null, "r", "r", null, null], striped: true }
      )
    );

    if (t.byName.length && t.byName.length < t.items.length) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("按工具名聚合", "同一个工具在本轮中被多次调用时的合计耗时。"),
        table(
          ["工具名", "次数", "合计耗时", "单次最长", "成功 / 失败"],
          t.byName.map(function (g) {
            return [
              g.name,
              String(g.count),
              ms(g.totalMs),
              ms(g.maxMs),
              String(g.ok) + " / " + String(g.fail),
            ];
          }),
          { align: [null, "r", "r", "r", "r"], striped: true }
        )
      );
    }

    if (t.failures.length) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("失败的调用", String(t.failures.length) + " 次 success=false。"),
        table(
          ["工具名", "开始时刻", "耗时", "error"],
          t.failures.map(function (x) {
            return [
              x.name,
              x.start != null ? h("span", { class: "mono small" }, clock(x.start)) : "—",
              ms(x.dur),
              x.error ? h("span", { class: "mono small" }, x.error) : h("span", { class: "nodata" }, "未提供"),
            ];
          }),
          { align: [null, null, "r", null], striped: true }
        )
      );
    }

    return h("section", null, els);
  }

  /* ------------------------------------------------------------------ *
   * 其他：diagnostics / 原始 JSON
   * ------------------------------------------------------------------ */

  function renderMisc(a) {
    var els = [];

    if (a.diagnostics.length) {
      els.push(
        subHead("diagnostics", "由看板根据时间戳生成：解释指标为什么没有，以及跨端数字为什么不可信。"),
        h(
          "div",
          { class: "stack", style: { gap: "6px" } },
          a.diagnostics.map(function (d) {
            return h("div", { class: "callout" }, d);
          })
        ),
        h("div", { style: { marginTop: "16px" } })
      );
    }

    els.push(
      h(
        "details",
        null,
        h("summary", null, "原始 JSON"),
        h("div", { class: "body" }, h("pre", { class: "raw" }, JSON.stringify(a.trace, null, 2)))
      )
    );

    return h("section", null, els);
  }

  /* ------------------------------------------------------------------ *
   * 多条汇总
   * ------------------------------------------------------------------ */

  function spark(hist) {
    if (!hist || !hist.length) return "";
    var max = 0;
    hist.forEach(function (b) {
      if (b.n > max) max = b.n;
    });
    return h(
      "div",
      { class: "spark", title: "分布直方图（从最小到最大）" },
      hist.map(function (b) {
        var hgt = max && b.n ? Math.max(2, Math.round((b.n / max) * 22)) : 1;
        var tip =
          b.from != null
            ? Math.round(b.from) + "–" + Math.round(b.to) + " ms · " + b.n + " 条"
            : String(b.n);
        return h("i", { style: { height: hgt + "px" }, title: tip });
      })
    );
  }

  function findSeries(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function statRows(list) {
    return list.map(function (s) {
      var name = s.focus ? marker(s.n ? "info" : "none", s.name) : s.name;
      var cells = [
        name,
        String(s.n),
        s.missing ? String(s.missing) : "0",
        ms(s.min),
        ms(s.p50),
        ms(s.p90),
        ms(s.max),
        ms(s.mean),
        spark(s.hist),
      ];
      cells.__meta = { cellClass: [s.focus ? "strong" : null, null, s.missing ? "nodata" : null, null, "strong"] };
      return cells;
    });
  }

  function renderSummaryOverview(s) {
    var firstAudio = findSeries(s.kpi, "firstAudio");
    var firstShell = findSeries(s.kpi, "firstAudioShell");
    var wf = findSeries(s.kpi, "waterfall");
    var cloud = findSeries(s.kpi, "cloudMs");
    var close = findSeries(s.kpi, "sessionClose");

    var rangeText = "";
    if (s.range.from != null && s.range.to != null) {
      rangeText = datetime(s.range.from) + "  →  " + datetime(s.range.to);
    }

    var stats = [
      stat(String(s.ok), "有效样本" + (s.failed.length ? "（失败 " + s.failed.length + "）" : "")),
      firstAudio ? stat(ms(firstAudio.p50), "首音时延 P50", firstAudio.p50 != null) : null,
      firstAudio ? stat(ms(firstAudio.p90), "首音时延 P90") : null,
      firstShell ? stat(ms(firstShell.p50), "首个语音指令 P50") : null,
      wf ? stat(ms(wf.p50), "瀑布跨度 P50") : null,
      cloud ? stat(ms(cloud.p50), "云端合计 P50") : null,
      close ? stat(ms(close.p50), "会话收口 P50") : null,
    ].filter(Boolean);

    return h(
      "section",
      null,
      h(
        "div",
        { class: "stack", style: { gap: "6px" } },
        h("h1", null, "链路时延汇总 · " + s.ok + " 条"),
        h(
          "p",
          { class: "sub small" },
          [
            "每条指标独立统计，缺端点的样本计入「缺失」、不进入分位数。",
            "分位数为线性插值。",
            rangeText ? "时间范围 " + rangeText : null,
          ]
            .filter(Boolean)
            .join(" · ")
        )
      ),
      h("div", { class: "stats", style: { marginTop: "18px" } }, stats)
    );
  }

  function renderTypicalWaterfall(s) {
    var segs = (s.segments || []).filter(function (x) {
      return x.n > 0;
    });
    if (!segs.length) return null;

    var scale = 0;
    segs.forEach(function (x) {
      if (x.p90 != null && x.p90 > scale) scale = x.p90;
      if (x.p50 != null && x.p50 > scale) scale = x.p50;
    });
    if (!scale) scale = 1;

    var bars = segs.map(function (x) {
      var p50w = ((x.p50 || 0) / scale) * 100;
      var p90w = ((x.p90 || 0) / scale) * 100;
      var layer = x.layer || "gap";
      return h(
        "div",
        {
          class: "wf-row",
          title: x.name + "\nP50 " + ms(x.p50) + " · P90 " + ms(x.p90) + " · n=" + x.n + (x.note ? "\n" + x.note : ""),
        },
        h("div", { class: "wf-name" }, x.name),
        h(
          "div",
          { class: "wf-track" },
          h("div", { class: "wf-bar band", style: { left: "0%", width: Math.max(p90w, 0) + "%" } }),
          h("div", { class: "wf-bar " + layer, style: { left: "0%", width: Math.max(p50w, 0) + "%" } })
        ),
        h("div", { class: "wf-ms" }, ms(x.p50)),
        h("div", { class: "wf-pct" }, "n=" + x.n)
      );
    });

    return h(
      "section",
      null,
      sectionHead(
        "典型瀑布 · 各阶段中位耗时",
        "每条横条的实心部分是该阶段 P50，浅色底是 P90。各阶段独立抽样，中位数之和不等于瀑布跨度中位数。"
      ),
      h("div", { class: "stack", style: { gap: "3px" } }, bars),
      h(
        "div",
        { class: "legend" },
        h("div", { class: "item" }, h("div", { class: "dot edge" }), "网关 P50"),
        h("div", { class: "item" }, h("div", { class: "dot network" }), "网络 P50"),
        h("div", { class: "item" }, h("div", { class: "dot cloud" }), "云端 P50"),
        h("div", { class: "item" }, h("div", { class: "dot gap" }), "P90")
      )
    );
  }

  function renderSummarySplit(s) {
    var layers = (s.layers || []).filter(function (g) {
      return g.p50 != null && g.p50 > 0;
    });
    if (!layers.length) return null;
    var total = 0;
    layers.forEach(function (g) {
      total += g.p50;
    });
    if (!total) return null;

    return h(
      "section",
      null,
      subHead("责任方中位拆分", "对各条 trace 的网关 / 网络 / 云端耗时分别取中位数后再归一化。合计 " + ms(total) + "。"),
      h(
        "div",
        { class: "split" },
        layers.map(function (g) {
          var cls = g.layer === "gap" ? "gap" : g.layer;
          return h("div", {
            class: "wf-bar-fill",
            title: g.name + " P50 " + ms(g.p50),
            style: {
              width: (g.p50 / total) * 100 + "%",
              background:
                cls === "cloud"
                  ? "var(--accent)"
                  : cls === "network"
                  ? "var(--cyan)"
                  : cls === "edge"
                  ? "var(--gray)"
                  : "var(--fill-2)",
            },
          });
        })
      ),
      h(
        "div",
        { class: "legend" },
        layers.map(function (g) {
          return h(
            "div",
            { class: "item" },
            h("div", { class: "dot " + (g.layer === "gap" ? "gap" : g.layer) }),
            h("span", { style: { color: "var(--text-1)" } }, g.name + " " + ms(g.p50)),
            h("span", { class: "faint" }, pct((g.p50 / total) * 100))
          );
        })
      )
    );
  }

  function renderSummaryTables(s) {
    var els = [
      sectionHead("阶段耗时分布", "与单条看板同一套计算式。n 为该指标有数据的条数。"),
      subHead("核心体验", "用户可感知的端到端时延。"),
      table(
        ["指标", "n", "缺失", "最小", "P50", "P90", "最大", "均值", "分布"],
        statRows(s.kpi),
        { align: [null, "r", "r", "r", "r", "r", "r", "r", null], striped: true }
      ),
      h("div", { style: { marginTop: "16px" } }),
      subHead("stageMs.edge · 网关", "同一时钟相减。"),
      table(
        ["指标", "n", "缺失", "最小", "P50", "P90", "最大", "均值", "分布"],
        statRows(s.edge),
        { align: [null, "r", "r", "r", "r", "r", "r", "r", null], striped: true }
      ),
      h("div", { style: { marginTop: "16px" } }),
      subHead("stageMs.cloud · 云端", "大多以 userLastPacketTime 为基准。"),
      table(
        ["指标", "n", "缺失", "最小", "P50", "P90", "最大", "均值", "分布"],
        statRows(s.cloud),
        { align: [null, "r", "r", "r", "r", "r", "r", "r", null], striped: true }
      ),
    ];

    if (s.transport.some(function (x) { return x.n > 0 || x.missing; })) {
      els.push(
        h("div", { style: { marginTop: "16px" } }),
        subHead("网络时延", "跨端相减，负数会进入统计。"),
        table(
          ["指标", "n", "缺失", "最小", "P50", "P90", "最大", "均值", "分布"],
          statRows(s.transport),
          { align: [null, "r", "r", "r", "r", "r", "r", "r", null], striped: true }
        )
      );
    }

    return h("section", null, els);
  }

  function renderSummaryTools(s) {
    var t = s.tools;
    if (!t.callCount) {
      return h(
        "section",
        null,
        sectionHead("工具调用", "跨全部有效 trace 合计。"),
        h("div", { class: "callout" }, "这些 trace 都没有记录 Function Calling。")
      );
    }

    var els = [
      sectionHead("工具调用", "跨全部有效 trace 合计。"),
      h(
        "div",
        { class: "stats", style: { marginBottom: "16px" } },
        [
          stat(String(t.callCount), "调用次数 · " + t.tracesWithTools + " 条含工具"),
          stat(String(t.failCount), "失败次数"),
          t.duration.n ? stat(ms(t.duration.p50), "单次耗时 P50") : null,
          t.duration.n ? stat(ms(t.duration.p90), "单次耗时 P90") : null,
        ].filter(Boolean)
      ),
    ];

    if (t.byName.length) {
      els.push(
        table(
          ["工具名", "次数", "失败", "合计耗时", "单次最长", "单次均值"],
          t.byName.map(function (g) {
            return [g.name, String(g.count), String(g.fail), ms(g.totalMs), ms(g.maxMs), ms(g.meanMs)];
          }),
          { align: [null, "r", "r", "r", "r", "r"], striped: true }
        )
      );
    }

    return h("section", null, els);
  }

  function renderSummaryFailures(s) {
    if (!s.failed.length) return null;
    return h(
      "section",
      null,
      sectionHead("未能纳入统计的文件", String(s.failed.length) + " 个文件解析失败或不是合法 trace。"),
      table(
        ["文件", "原因"],
        s.failed.map(function (it) {
          return [it.name || "（无名）", it.error || "未知错误"];
        }),
        { striped: true }
      )
    );
  }

  function renderSummaryTraces(s) {
    var sorts = [
      { id: "firstAudio", label: "首音时延" },
      { id: "waterfall", label: "瀑布跨度" },
      { id: "sessionClose", label: "会话收口" },
      { id: "updatedAt", label: "时间" },
    ];
    var rows = s.traces.slice();
    rows.sort(function (a, b) {
      var av = a[summarySort];
      var bv = b[summarySort];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });

    return h(
      "section",
      null,
      sectionHead("各条明细", "点击一行打开该条看板。默认按当前排序键从高到低，无数据的排在后面。"),
      h(
        "div",
        { class: "pills" },
        h("span", { class: "small dim" }, "排序"),
        sorts.map(function (opt) {
          return h(
            "button",
            {
              class: "pill" + (summarySort === opt.id ? " active" : ""),
              onClick: function () {
                summarySort = opt.id;
                renderSummary(s);
              },
            },
            opt.label
          );
        })
      ),
      table(
        ["文件", "traceId", "首音", "首个语音指令", "瀑布跨度", "云端", "网络", "工具", "时间"],
        rows.map(function (r) {
          var cells = [
            h("span", { class: "mono small" }, r.name),
            h("span", { class: "mono small" }, r.traceId),
            r.firstAudio == null ? h("span", { class: "nodata" }, "—") : ms(r.firstAudio),
            r.firstAudioShell == null ? h("span", { class: "nodata" }, "—") : ms(r.firstAudioShell),
            r.waterfall == null ? h("span", { class: "nodata" }, "—") : ms(r.waterfall),
            r.cloudMs == null ? h("span", { class: "nodata" }, "—") : ms(r.cloudMs),
            r.netMs == null ? h("span", { class: "nodata" }, "—") : ms(r.netMs),
            r.tools ? String(r.tools) + (r.toolFails ? " / 失败 " + r.toolFails : "") : "0",
            r.updatedAt != null ? h("span", { class: "mono small" }, datetime(r.updatedAt)) : "—",
          ];
          cells.__meta = {
            onClick: function () {
              openTrace(r.name);
            },
            title: "打开 " + r.name,
          };
          return cells;
        }),
        { align: [null, null, "r", "r", "r", "r", "r", "r", null], striped: true }
      )
    );
  }

  function renderSummary(s) {
    var root = document.getElementById("view");
    clear(root);
    current = null;
    currentSummary = s;
    viewMode = "summary";
    setSummaryActive(true);

    if (!s.ok && !s.failed.length) {
      add(root, h("div", { class: "drop" }, "没有可汇总的 trace。"));
      document.title = "时延汇总";
      return;
    }

    add(root, renderSummaryOverview(s));
    if (s.failed.length && s.ok) {
      add(
        root,
        h(
          "div",
          { class: "callout", style: { marginTop: "16px" } },
          h("div", { class: "t" }, s.failed.length + " 个文件未纳入"),
          "已对 " + s.ok + " 条有效 trace 做统计，失败文件列在页底。"
        )
      );
    }
    add(root, h("hr", { class: "div" }));
    add(root, renderTypicalWaterfall(s));
    add(root, renderSummarySplit(s));
    add(root, h("hr", { class: "div" }));
    add(root, renderSummaryTables(s));
    add(root, h("hr", { class: "div" }));
    add(root, renderSummaryTools(s));
    add(root, h("hr", { class: "div" }));
    add(root, renderSummaryTraces(s));
    add(root, renderSummaryFailures(s));

    document.title = "时延汇总 · " + s.ok + " 条";
  }

  var summaryRaw = {};

  function analyzeItems(rawItems) {
    summaryRaw = {};
    return rawItems.map(function (item) {
      var out = {
        name: item.name,
        size: item.size,
        mtime: item.mtime,
        error: item.error || null,
        analysis: null,
      };
      if (out.error) return out;
      if (!item.data) {
        out.error = "无数据";
        return out;
      }
      try {
        out.analysis = M.analyze(item.data);
        summaryRaw[item.name] = item.data;
      } catch (e) {
        out.error = e.message;
      }
      return out;
    });
  }

  function showSummaryLoading(text) {
    var root = document.getElementById("view");
    clear(root);
    add(root, h("div", { class: "drop" }, text || "正在汇总…"));
  }

  function loadSummaryFromServer() {
    showSummaryLoading("正在读取全部 trace…");
    return fetch("api/bundle")
      .then(function (r) {
        if (r.status === 404) throw new Error("no-bundle");
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        renderSummary(M.summarize(analyzeItems(data.traces || [])));
      })
      .catch(function (e) {
        if (e && e.message === "no-bundle") return loadSummaryByList();
        showEmpty(h("div", { class: "err" }, "汇总失败：" + (e.message || e)));
      });
  }

  function loadSummaryByList() {
    return fetch("api/traces")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = data.traces || [];
        if (!list.length) {
          renderSummary(M.summarize([]));
          return;
        }
        var done = 0;
        showSummaryLoading("正在加载 0 / " + list.length);
        return Promise.all(
          list.map(function (t) {
            return fetch("api/trace/" + encodeURIComponent(t.name))
              .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
              })
              .then(function (json) {
                done++;
                showSummaryLoading("正在加载 " + done + " / " + list.length);
                return { name: t.name, size: t.size, mtime: t.mtime, data: json };
              })
              .catch(function (err) {
                done++;
                showSummaryLoading("正在加载 " + done + " / " + list.length);
                return { name: t.name, size: t.size, mtime: t.mtime, error: err.message };
              });
          })
        ).then(function (items) {
          renderSummary(M.summarize(analyzeItems(items)));
        });
      });
  }

  function loadSummaryFromFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    showSummaryLoading("正在读取 " + files.length + " 个文件…");
    Promise.all(
      files.map(function (file) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            try {
              resolve({
                name: file.name,
                size: file.size,
                mtime: file.lastModified,
                data: JSON.parse(String(reader.result)),
              });
            } catch (e) {
              resolve({ name: file.name, size: file.size, mtime: file.lastModified, error: e.message });
            }
          };
          reader.onerror = function () {
            resolve({ name: file.name, error: "读取失败" });
          };
          reader.readAsText(file);
        });
      })
    ).then(function (items) {
      if (location.hash.slice(1) !== SUMMARY_HASH) location.hash = SUMMARY_HASH;
      renderSummary(M.summarize(analyzeItems(items)));
    });
  }

  function openSummary() {
    if (location.hash.slice(1) !== SUMMARY_HASH) {
      location.hash = SUMMARY_HASH;
      return;
    }
    if (hasServerList) loadSummaryFromServer();
    else document.getElementById("summaryFileInput").click();
  }

  function openTrace(name) {
    var sel = document.getElementById("traceSelect");
    var exists = Array.prototype.some.call(sel.options, function (opt) {
      return opt.value === name;
    });
    if (exists && hasServerList) {
      sel.value = name;
      if (location.hash.slice(1) !== name) {
        location.hash = name;
        return;
      }
      loadTrace(name);
      return;
    }
    if (summaryRaw[name]) {
      setSummaryActive(false);
      render(summaryRaw[name]);
      return;
    }
    showEmpty(h("div", { class: "err" }, "找不到 " + name));
  }

  function setSummaryActive(on) {
    var btn = document.getElementById("summaryBtn");
    if (!btn) return;
    if (on) btn.classList.add("active");
    else btn.classList.remove("active");
  }

  function setSummaryReady(on, title) {
    var btn = document.getElementById("summaryBtn");
    if (!btn) return;
    btn.disabled = !on;
    if (title) btn.title = title;
  }

  /* ------------------------------------------------------------------ *
   * 渲染入口
   * ------------------------------------------------------------------ */

  function render(trace) {
    var root = document.getElementById("view");
    clear(root);
    var a;
    try {
      a = M.analyze(trace);
    } catch (e) {
      add(root, h("div", { class: "err" }, "解析失败：" + e.message));
      return;
    }
    current = a;
    currentSummary = null;
    viewMode = "trace";
    setSummaryActive(false);

    add(root, renderOverview(a));
    add(root, renderSchemaWarn(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderWaterfall(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderSplit(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderTransport(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderTools(a));
    add(root, renderTimeline(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderMetrics(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderChecks(a));
    add(root, renderCoverage(a));
    add(root, h("hr", { class: "div" }));
    add(root, renderMisc(a));

    document.title = "Trace " + a.traceId;
  }

  function showEmpty(msgNode) {
    var root = document.getElementById("view");
    clear(root);
    add(root, msgNode);
  }

  /* ------------------------------------------------------------------ *
   * 数据源
   * ------------------------------------------------------------------ */

  function loadTrace(name) {
    return fetch("api/trace/" + encodeURIComponent(name))
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        render(json);
        location.hash = name;
      })
      .catch(function (e) {
        showEmpty(h("div", { class: "err" }, "加载 " + name + " 失败：" + e.message));
      });
  }

  function fillTraceSelect(preferred) {
    var sel = document.getElementById("traceSelect");
    return fetch("api/traces")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = data.traces || [];
        document.getElementById("srcDir").textContent = data.dir || "";
        if (!list.length) {
          hasServerList = false;
          setSummaryReady(true, "目录为空，点击后选择本地 JSON 文件汇总");
          showEmpty(h("div", { class: "drop" }, "服务端目录中没有 trace 文件。可以把 JSON 文件拖到本页面查看。"));
          return null;
        }
        hasServerList = true;
        setSummaryReady(true, "汇总目录中全部 trace 的链路时延");
        sel.disabled = false;
        clear(sel);
        list.forEach(function (t) {
          add(
            sel,
            h(
              "option",
              { value: t.name },
              t.name + (t.size ? "  (" + (t.size / 1024).toFixed(1) + " KB)" : "")
            )
          );
        });
        var want = preferred || location.hash.slice(1);
        var initial = list.some(function (t) {
          return t.name === want;
        })
          ? want
          : list[0].name;
        sel.value = initial;
        return initial;
      });
  }

  function initSource() {
    var sel = document.getElementById("traceSelect");

    fillTraceSelect()
      .then(function (initial) {
        if (location.hash.slice(1) === SUMMARY_HASH) {
          loadSummaryFromServer();
          return;
        }
        if (initial) loadTrace(initial);
      })
      .catch(function () {
        hasServerList = false;
        setSummaryReady(true, "未连接本地服务，点击后选择本地 JSON 文件汇总");
        sel.disabled = true;
        showEmpty(
          h(
            "div",
            { class: "drop", id: "dropzone" },
            h("div", null, "把 trace JSON 文件拖到这里，或点击顶栏的「打开文件」。"),
            h(
              "div",
              { class: "small faint", style: { marginTop: "8px" } },
              "当前未连接到本地服务，无法列出 /oem/trace 目录。运行 python3 server.py 可启用目录浏览。"
            )
          )
        );
      });

    sel.addEventListener("change", function () {
      loadTrace(sel.value);
    });

    window.addEventListener("hashchange", function () {
      var name = location.hash.slice(1);
      if (name === SUMMARY_HASH) {
        if (hasServerList) loadSummaryFromServer();
        else if (currentSummary) renderSummary(currentSummary);
        return;
      }
      if (!name) return;
      var exists = Array.prototype.some.call(sel.options, function (opt) {
        return opt.value === name;
      });
      if (exists) {
        if (sel.value !== name) {
          sel.value = name;
          loadTrace(name);
        }
        return;
      }
      fillTraceSelect(name).then(function (initial) {
        if (initial) loadTrace(initial);
      });
    });
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        render(JSON.parse(String(reader.result)));
      } catch (e) {
        showEmpty(h("div", { class: "err" }, "JSON 解析失败：" + e.message));
      }
    };
    reader.readAsText(file);
  }

  function initFileInput() {
    var input = document.getElementById("fileInput");
    document.getElementById("openBtn").addEventListener("click", function () {
      input.click();
    });
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) readFile(input.files[0]);
    });

    var depth = 0;
    window.addEventListener("dragenter", function (e) {
      e.preventDefault();
      depth++;
      document.body.classList.add("dragging");
    });
    window.addEventListener("dragover", function (e) {
      e.preventDefault();
    });
    window.addEventListener("dragleave", function () {
      depth = Math.max(0, depth - 1);
      if (!depth) document.body.classList.remove("dragging");
    });
    window.addEventListener("drop", function (e) {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("dragging");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        readFile(e.dataTransfer.files[0]);
      }
    });
  }

  function initTheme() {
    var btn = document.getElementById("themeBtn");
    var saved = null;
    try {
      saved = localStorage.getItem("traceViewTheme");
    } catch (e) {
      /* localStorage 不可用时退回默认主题 */
    }
    var theme = saved || "dark";
    apply(theme);

    btn.addEventListener("click", function () {
      theme = theme === "dark" ? "light" : "dark";
      apply(theme);
      try {
        localStorage.setItem("traceViewTheme", theme);
      } catch (e) {
        /* 忽略写入失败 */
      }
    });

    function apply(t) {
      document.documentElement.setAttribute("data-theme", t);
      btn.textContent = t === "dark" ? "浅色" : "深色";
    }
  }

  function initCopy() {
    document.getElementById("copyBtn").addEventListener("click", function () {
      var text = null;
      if (viewMode === "summary" && currentSummary) text = summaryAllText(currentSummary);
      else if (current) text = summaryText(current);
      if (!text) return;
      navigator.clipboard.writeText(text).then(
        function () {
          flash("已复制");
        },
        function () {
          flash("复制失败");
        }
      );
    });
  }

  function flash(msg) {
    var btn = document.getElementById("copyBtn");
    var old = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () {
      btn.textContent = old;
    }, 1200);
  }

  /** 把当前看板的核心数值导出为纯文本，便于贴到工单或聊天里。 */
  function summaryText(a) {
    var lines = [];
    lines.push("trace " + a.traceId + (a.schemaVersion != null ? "  schema v" + a.schemaVersion : ""));
    if (a.firstAudio) {
      lines.push("首音时延 " + (a.firstAudio.value == null ? "无数据" : Math.round(a.firstAudio.value) + " ms"));
    }
    if (a.firstResponse && a.firstResponse.value != null) {
      lines.push("首个指令包 " + Math.round(a.firstResponse.value) + " ms");
    }
    if (a.waterfall.total) lines.push("瀑布跨度 " + Math.round(a.waterfall.total) + " ms");
    a.waterfall.byLayer.forEach(function (g) {
      lines.push("  " + g.label + " " + Math.round(g.ms) + " ms (" + g.pct.toFixed(1) + "%)");
    });
    lines.push("stageMs.edge：");
    (a.edgeStages || []).forEach(function (m) {
      lines.push("  " + m.name + " " + (m.value == null ? "无数据" : Math.round(m.value) + " ms"));
    });
    lines.push("stageMs.cloud：");
    (a.cloudStages || []).forEach(function (m) {
      if (!m.focus && m.value == null) return;
      lines.push("  " + m.name + " " + (m.value == null ? "无数据" : Math.round(m.value) + " ms"));
    });
    if (a.diagnostics.length) {
      lines.push("diagnostics：");
      a.diagnostics.forEach(function (d) {
        lines.push("  " + d);
      });
    }
    return lines.join("\n");
  }

  function summaryAllText(s) {
    var lines = [];
    lines.push("链路时延汇总  " + s.ok + " 条有效 / " + s.total + " 个文件");
    if (s.range.from != null) {
      lines.push("时间范围  " + datetime(s.range.from) + " → " + datetime(s.range.to));
    }
    function dump(title, list) {
      lines.push(title);
      list.forEach(function (m) {
        if (!m.n && !m.missing) return;
        lines.push(
          "  " +
            m.name +
            "  n=" +
            m.n +
            " 缺失=" +
            m.missing +
            "  min=" +
            (m.min == null ? "—" : Math.round(m.min)) +
            "  p50=" +
            (m.p50 == null ? "—" : Math.round(m.p50)) +
            "  p90=" +
            (m.p90 == null ? "—" : Math.round(m.p90)) +
            "  max=" +
            (m.max == null ? "—" : Math.round(m.max)) +
            "  mean=" +
            (m.mean == null ? "—" : Math.round(m.mean))
        );
      });
    }
    dump("核心体验：", s.kpi);
    dump("stageMs.edge：", s.edge);
    dump("stageMs.cloud：", s.cloud);
    dump("网络时延：", s.transport);
    if (s.tools.callCount) {
      lines.push(
        "工具调用  " +
          s.tools.callCount +
          " 次 / 失败 " +
          s.tools.failCount +
          (s.tools.duration.p50 != null ? " / 单次 P50 " + Math.round(s.tools.duration.p50) + " ms" : "")
      );
    }
    if (s.failed.length) {
      lines.push("未纳入：");
      s.failed.forEach(function (it) {
        lines.push("  " + (it.name || "?") + "  " + (it.error || ""));
      });
    }
    return lines.join("\n");
  }

  function initSummary() {
    var btn = document.getElementById("summaryBtn");
    var input = document.getElementById("summaryFileInput");
    btn.addEventListener("click", function () {
      if (hasServerList) openSummary();
      else input.click();
    });
    input.addEventListener("change", function () {
      if (input.files && input.files.length) loadSummaryFromFiles(input.files);
      input.value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initFileInput();
    initCopy();
    initSummary();
    initSource();
  });
})();
