/** 对话 CSV 分析页：解析 tool_usage / tool_call 并渲染内部工具 */
(function () {
  const DEFAULT_CSV = "conversation_message.csv";
  const LONG_TEXT_CHARS = 480;

  const sessionListEl = document.getElementById("sessionList");
  const threadEl = document.getElementById("thread");
  const toolbarEl = document.getElementById("toolbar");
  const threadTitleEl = document.getElementById("threadTitle");
  const threadMetaEl = document.getElementById("threadMeta");
  const fileHintEl = document.getElementById("fileHint");
  const csvFile = document.getElementById("csvFile");
  const btnLoad = document.getElementById("btnLoad");
  const btnReloadDefault = document.getElementById("btnReloadDefault");
  const btnExportHtml = document.getElementById("btnExportHtml");
  const btnExportCsv = document.getElementById("btnExportCsv");
  const NOTES_KEY_PREFIX = "mock_app_conversation_notes_v1:";

  const state = {
    fileName: "",
    csvHeader: [],
    sessions: [],
    activeId: "",
    /** @type {Record<string, {mode: "render" | "raw", noteOpen?: boolean}>} */
    msgUi: {},
    /** @type {Record<string, string>} */
    notes: {},
  };

  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    return cells;
  }

  function parseCsv(text) {
    const rows = [];
    let row = "";
    let quoted = false;
    const normalized = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      const next = normalized[i + 1];
      if (ch === '"') {
        row += ch;
        if (quoted && next === '"') {
          row += next;
          i += 1;
        } else quoted = !quoted;
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i += 1;
        if (row.trim()) rows.push(parseCsvLine(row));
        row = "";
      } else row += ch;
    }
    if (row.trim()) rows.push(parseCsvLine(row));
    return rows;
  }

  function decodeTextWithEncoding(buffer, encoding, fatal = false) {
    return new TextDecoder(encoding, { fatal }).decode(buffer);
  }

  async function readCsvFileText(fileOrBuffer) {
    const buffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return decodeTextWithEncoding(buffer, "utf-8").replace(/^\uFEFF/, "");
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return decodeTextWithEncoding(buffer, "utf-16le").replace(/^\uFEFF/, "");
    }
    try {
      return decodeTextWithEncoding(buffer, "utf-8", true).replace(/^\uFEFF/, "");
    } catch (_) {
      try {
        return decodeTextWithEncoding(buffer, "gb18030").replace(/^\uFEFF/, "");
      } catch (e) {
        return decodeTextWithEncoding(buffer, "gbk").replace(/^\uFEFF/, "");
      }
    }
  }

  function parseJsonLoose(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string") return raw;
    let text = raw.trim();
    if (!text) return null;
    for (let i = 0; i < 3; i++) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "string") {
          text = parsed.trim();
          continue;
        }
        return parsed;
      } catch (_) {
        return null;
      }
    }
    return text;
  }

  function looksLikeJson(text) {
    const s = String(text || "").trim();
    return (s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"));
  }

  function pretty(value) {
    if (value == null) return "";
    if (typeof value === "string") {
      const parsed = looksLikeJson(value) ? parseJsonLoose(value) : null;
      if (parsed && typeof parsed === "object") return JSON.stringify(parsed, null, 2);
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return String(value);
    }
  }

  /** 解析 create_time：14/8/2026 15:46:24.281629+08 */
  function parseTime(s) {
    const m = String(s || "").match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:\s*([+-]\d{2}))?/
    );
    if (!m) {
      const t = Date.parse(s || "");
      return Number.isFinite(t) ? t : 0;
    }
    const ms = String(m[7] || "0").slice(0, 3).padEnd(3, "0");
    const tz = m[8] ? `${m[8]}:00` : "+08:00";
    const iso = `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:${m[6]}.${ms}${tz}`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }

  function formatTime(s) {
    const t = parseTime(s);
    if (!t) return s || "";
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function shortId(id, n = 8) {
    const s = String(id || "");
    return s.length <= n ? s : s.slice(0, n);
  }

  function oneLine(text, max = 48) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length <= max ? s : `${s.slice(0, max)}…`;
  }

  function csvRowsToRecords(table) {
    if (!table.length) return [];
    const header = table[0].map((h) => String(h || "").trim());
    return table.slice(1).map((cells) => {
      const rec = {};
      header.forEach((key, i) => {
        rec[key] = cells[i] == null ? "" : cells[i];
      });
      return rec;
    });
  }

  function notesStorageKey() {
    return NOTES_KEY_PREFIX + (state.fileName || "default");
  }

  function loadNotes() {
    try {
      const raw = localStorage.getItem(notesStorageKey());
      state.notes = raw ? JSON.parse(raw) : {};
      if (!state.notes || typeof state.notes !== "object") state.notes = {};
    } catch (_) {
      state.notes = {};
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(notesStorageKey(), JSON.stringify(state.notes));
    } catch (_) {}
  }

  function getNote(msgId) {
    return String(state.notes[msgId] || "");
  }

  function setNote(msgId, text) {
    const next = String(text ?? "");
    if (next.trim()) state.notes[msgId] = next;
    else delete state.notes[msgId];
    saveNotes();
  }

  /** 把 OpenAI function_call 解成内部 tool_usage / tool_call / clarification */
  function parseFunctionCalls(raw) {
    const parsed = parseJsonLoose(raw);
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return list
      .map((item, idx) => {
        if (item == null) return null;
        if (typeof item === "string") {
          const inner = parseJsonLoose(item);
          return inner ? parseFunctionCalls(JSON.stringify(inner))[0] : null;
        }
        const fn = item.function && typeof item.function === "object" ? item.function : item;
        const name = String(fn.name || item.name || "").trim();
        if (!name) return null;
        const args = parseJsonLoose(fn.arguments) || fn.arguments || {};
        const id = String(item.id || fn.id || `call_${idx}`);
        const outer = {
          id,
          name,
          args: args && typeof args === "object" ? args : {},
          rawArgs: typeof fn.arguments === "string" ? fn.arguments : pretty(fn.arguments || args),
        };
        if (name === "tool_usage") {
          outer.kind = "usage";
          outer.inners = Array.isArray(outer.args.requests) ? outer.args.requests : [];
        } else if (name === "tool_call") {
          outer.kind = "call";
          outer.inners = Array.isArray(outer.args.calls) ? outer.args.calls : [];
        } else if (name === "clarification") {
          outer.kind = "clarification";
          outer.inners = Array.isArray(outer.args.questions) ? outer.args.questions : [];
        } else {
          outer.kind = "other";
          outer.inners = [];
        }
        return outer;
      })
      .filter(Boolean);
  }

  function parseToolContent(content) {
    const parsed = parseJsonLoose(content);
    if (!parsed || typeof parsed !== "object") {
      return { kind: "text", text: String(content || "") };
    }
    if (Array.isArray(parsed.results)) {
      return {
        kind: "call-result",
        terminateConversation: !!parsed.terminateConversation,
        results: parsed.results,
      };
    }
    if (Array.isArray(parsed.tools)) {
      return { kind: "usage-result", tools: parsed.tools };
    }
    return { kind: "json", value: parsed };
  }

  function sortMessages(rows) {
    return rows.slice().sort((a, b) => {
      const ta = parseTime(a.create_time);
      const tb = parseTime(b.create_time);
      if (ta !== tb) return ta - tb;
      const ia = Number(a.index);
      const ib = Number(b.index);
      if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  function buildSessions(records) {
    const bySess = new Map();
    for (const rec of records) {
      const sid = rec.session_id || rec.dialog_id || "unknown";
      if (!bySess.has(sid)) bySess.set(sid, []);
      bySess.get(sid).push(rec);
    }
    const sessions = [];
    for (const [id, rows] of bySess) {
      const messages = sortMessages(rows).map((row) => {
        const calls = row.tool_calls ? parseFunctionCalls(row.tool_calls) : [];
        return { ...row, parsedCalls: calls };
      });
      const turnMap = new Map();
      for (const msg of messages) {
        const gid = msg.group_id || msg.id;
        if (!turnMap.has(gid)) turnMap.set(gid, []);
        turnMap.get(gid).push(msg);
      }
      const turns = [...turnMap.entries()].map(([groupId, items]) => {
        const user = items.find((m) => m.role === "user");
        return {
          groupId,
          user,
          messages: items,
          preview: oneLine((user && user.content) || items[0].content || groupId),
        };
      });
      const firstUser = messages.find((m) => m.role === "user");
      const toolCallCount = messages.reduce((n, m) => n + (m.parsedCalls ? m.parsedCalls.length : 0), 0);
      const innerCallCount = messages.reduce((n, m) => {
        return n + (m.parsedCalls || []).reduce((k, c) => k + (c.kind === "call" ? c.inners.length : 0), 0);
      }, 0);
      sessions.push({
        id,
        dialogId: (messages[0] && messages[0].dialog_id) || "",
        model: (messages.find((m) => m.model) || {}).model || "",
        startTime: messages[0] && messages[0].create_time,
        endTime: messages[messages.length - 1] && messages[messages.length - 1].create_time,
        messages,
        turns,
        title: oneLine((firstUser && firstUser.content) || `会话 ${shortId(id)}`, 60),
        stats: {
          messages: messages.length,
          turns: turns.length,
          users: messages.filter((m) => m.role === "user").length,
          tools: messages.filter((m) => m.role === "tool").length,
          toolCalls: toolCallCount,
          innerCalls: innerCallCount,
        },
      });
    }
    sessions.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
    return sessions;
  }

  function getMsgUi(id) {
    if (!state.msgUi[id]) state.msgUi[id] = { mode: "render", noteOpen: false };
    return state.msgUi[id];
  }

  function markdown(text) {
    const raw = String(text || "");
    if (!raw) return "<em>（空）</em>";
    if (window.marked) return marked.parse(raw);
    return `<div class="plain">${escapeHtml(raw)}</div>`;
  }

  function collapsibleText(text, opts = {}) {
    const raw = String(text || "");
    const title = opts.title || "文本";
    const forceOpen = opts.open;
    const isLong = raw.length > LONG_TEXT_CHARS || raw.split("\n").length > 12;
    const prettyText = opts.json || looksLikeJson(raw) ? pretty(raw) : raw;
    const body = opts.markdown && !opts.json
      ? `<div class="md-view">${markdown(raw)}</div>`
      : `<pre class="json">${escapeHtml(prettyText || "（空）")}</pre>`;
    if (!isLong) return body;
    const open = forceOpen === true;
    const preview = escapeHtml(oneLine(raw, 120));
    return `
      <details class="fold text-fold" data-fold="text" ${open ? "open" : ""}>
        <summary>
          <span>${escapeHtml(title)} · ${raw.length} 字</span>
          <span class="preview">${preview}</span>
        </summary>
        <div class="fold-body">${body}</div>
      </details>
    `;
  }

  function renderInnerUsage(req) {
    const major = req.major || "";
    const tools = Array.isArray(req.tools) ? req.tools : [];
    const toolBits = tools.length
      ? tools.map((t) => `<span class="inner-name">${escapeHtml(t)}</span>`).join("、")
      : "<span class=\"preview\">（整类查询）</span>";
    let extra = "";
    if (req.level1 || req.level2) {
      extra += `<div class="kv"><b>分类</b> ${escapeHtml([req.level1, req.level2].filter(Boolean).join(" / "))}</div>`;
    }
    if (req.question) extra += `<div class="kv"><b>question</b> ${escapeHtml(req.question)}</div>`;
    return `
      <div class="inner-tool">
        <div class="inner-head">
          <span class="badge ${escapeHtml(major || "info")}">${escapeHtml(major || "?")}</span>
          ${toolBits}
        </div>
        ${extra}
      </div>
    `;
  }

  function renderInnerCall(call) {
    const major = call.major || "";
    const name = call.tool || "";
    const argsText = pretty(call.args || {});
    return `
      <div class="inner-tool">
        <div class="inner-head">
          <span class="badge ${escapeHtml(major || "info")}">${escapeHtml(major || "?")}</span>
          <span class="inner-name">${escapeHtml(name || "(未指定工具)")}</span>
        </div>
        <div class="kv"><b>args</b></div>
        ${collapsibleText(argsText, { title: "参数", json: true, open: argsText.length < 160 })}
      </div>
    `;
  }

  function renderInnerClarification(q) {
    const opts = Array.isArray(q.options) ? q.options : [];
    return `
      <div class="inner-tool">
        <div class="inner-head">${escapeHtml(q.question || "")}</div>
        <div class="kv"><b>options</b> ${opts.map((o) => escapeHtml(o)).join(" / ") || "（无）"}</div>
      </div>
    `;
  }

  function renderUsageResultItem(t) {
    const major = (t.category && t.category.major) || "";
    const path = [t.category && t.category.level1, t.category && t.category.level2].filter(Boolean).join(" / ");
    return `
      <div class="inner-tool">
        <div class="inner-head">
          <span class="badge ${escapeHtml(major || "info")}">${escapeHtml(major || "?")}</span>
          <span class="inner-name">${escapeHtml(t.name || "")}</span>
        </div>
        ${path ? `<div class="kv"><b>分类</b> ${escapeHtml(path)}</div>` : ""}
        <div class="kv"><b>usage</b> ${escapeHtml(t.usage || "")}</div>
        <div class="kv"><b>paramHint</b> ${escapeHtml(t.paramHint || "")}</div>
      </div>
    `;
  }

  function renderCallResultItem(row) {
    const ok = row.ok !== false && !/^工具执行失败/.test(String(row.content || ""));
    return `
      <div class="inner-tool">
        <div class="inner-head">
          <span class="inner-name">${escapeHtml(row.tool || "(unknown)")}</span>
          <span class="badge ${ok ? "ok" : "fail"}">${ok ? "成功" : "失败"}</span>
        </div>
        ${collapsibleText(row.content || "", { title: "返回", json: looksLikeJson(row.content), open: false })}
      </div>
    `;
  }

  function renderOuterCall(call) {
    const kindLabel = {
      usage: "tool_usage · 查询工具说明",
      call: "tool_call · 执行内部工具",
      clarification: "clarification · 澄清",
      other: call.name,
    }[call.kind] || call.name;
    const kindClass = call.kind === "usage" ? "usage" : call.kind === "call" ? "call" : "assistant";
    const count = call.kind === "usage"
      ? call.inners.reduce((n, req) => {
          const tools = Array.isArray(req.tools) ? req.tools : [];
          return n + (tools.length || 1);
        }, 0)
      : call.inners.length;
    let innerHtml = "";
    if (call.kind === "usage") {
      innerHtml = call.inners.map((req) => renderInnerUsage(req)).join("");
    } else if (call.kind === "call") {
      innerHtml = call.inners.map((c) => renderInnerCall(c)).join("");
    } else if (call.kind === "clarification") {
      innerHtml = call.inners.map(renderInnerClarification).join("");
    } else {
      innerHtml = `<pre class="json">${escapeHtml(pretty(call.args))}</pre>`;
    }
    return `
      <details class="fold tool-fold" data-fold="tool" open>
        <summary>
          <span class="badge ${kindClass}">${escapeHtml(call.name)}</span>
          <span>${escapeHtml(kindLabel)}</span>
          <span class="badge assistant">${count} 项</span>
          <span class="badge">${escapeHtml(shortId(call.id, 12))}</span>
        </summary>
        <div class="fold-body">${innerHtml || '<div class="kv">无内部项</div>'}</div>
      </details>
    `;
  }

  function renderMessageMeta(msg) {
    const bits = [
      `<span class="badge ${escapeHtml(msg.role)}">${escapeHtml(msg.role)}</span>`,
      `<span>${escapeHtml(formatTime(msg.create_time))}</span>`,
    ];
    if (msg.model) bits.push(`<span>${escapeHtml(msg.model)}</span>`);
    if (msg.token_count) bits.push(`<span>${escapeHtml(msg.token_count)} tok</span>`);
    if (msg.request_id) bits.push(`<span title="${escapeHtml(msg.request_id)}">${escapeHtml(shortId(msg.request_id, 10))}</span>`);
    if (msg.tool_call_id) bits.push(`<span title="${escapeHtml(msg.tool_call_id)}">call ${escapeHtml(shortId(msg.tool_call_id, 12))}</span>`);
    if (getNote(msg.id).trim()) bits.push(`<span class="badge note">已批注</span>`);
    return `<div class="label">${bits.join("")}</div>`;
  }

  function renderHistorySummary(msg) {
    if (!msg.history_summary) return "";
    return collapsibleText(msg.history_summary, { title: "history_summary（会话摘要）", markdown: true, open: false });
  }

  function renderRawBody(msg) {
    const dump = {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      token_count: msg.token_count,
      provider: msg.provider,
      model: msg.model,
      dialog_id: msg.dialog_id,
      history_summary: msg.history_summary || undefined,
      session_id: msg.session_id,
      index: msg.index,
      group_id: msg.group_id,
      request_id: msg.request_id || undefined,
      create_time: msg.create_time,
      tool_calls: msg.tool_calls ? parseJsonLoose(msg.tool_calls) || msg.tool_calls : undefined,
      tool_call_id: msg.tool_call_id || undefined,
    };
    return collapsibleText(pretty(dump), { title: "原始记录", json: true, open: true });
  }

  function renderUserBody(msg) {
    return `<div class="body plain">${escapeHtml(msg.content || "")}</div>${renderHistorySummary(msg)}`;
  }

  function renderAssistantBody(msg) {
    const callsHtml = (msg.parsedCalls || []).map(renderOuterCall).join("");
    const content = String(msg.content || "").trim();
    const body = content
      ? collapsibleText(content, { title: "assistant 文本", markdown: true })
      : "";
    return `${body}${callsHtml}${renderHistorySummary(msg)}`;
  }

  function renderToolBody(msg) {
    const parsed = parseToolContent(msg.content);
    let inner = "";
    let count = 0;
    let title = "工具结果";
    if (parsed.kind === "call-result") {
      const rows = parsed.results || [];
      count = rows.length;
      title = "tool 返回";
      const term = parsed.terminateConversation ? `<span class="badge fail">terminateConversation</span>` : "";
      inner = `${term}${rows.map(renderCallResultItem).join("")}`;
    } else if (parsed.kind === "usage-result") {
      const tools = parsed.tools || [];
      count = tools.length;
      title = "tool_usage 说明";
      inner = tools.map(renderUsageResultItem).join("");
    } else if (parsed.kind === "json") {
      inner = collapsibleText(pretty(parsed.value), { title: "tool JSON", json: true, open: false });
    } else {
      inner = collapsibleText(msg.content || "", { title: "tool 原文", json: looksLikeJson(msg.content), open: false });
    }
    return `
      <details class="fold tool-fold" data-fold="tool" open>
        <summary>
          <span class="badge tool">tool</span>
          <span>${escapeHtml(title)}</span>
          ${count ? `<span class="badge assistant">${count} 项</span>` : ""}
        </summary>
        <div class="fold-body">${inner || '<div class="kv">（空）</div>'}</div>
      </details>
      ${renderHistorySummary(msg)}
    `;
  }

  function renderRenderedBody(msg) {
    if (msg.role === "user") return renderUserBody(msg);
    if (msg.role === "assistant") return renderAssistantBody(msg);
    if (msg.role === "tool") return renderToolBody(msg);
    return `<div class="body plain">${escapeHtml(msg.content || "")}</div>`;
  }

  function bindMsgActions(wrap, msg) {
    const ui = getMsgUi(msg.id);
    const toggle = wrap.querySelector(".btn-view-toggle");
    if (toggle) {
      toggle.onclick = (e) => {
        e.stopPropagation();
        ui.mode = ui.mode === "raw" ? "render" : "raw";
        refreshMessageEl(wrap, msg);
      };
    }
    const bubble = wrap.querySelector(".bubble");
    if (bubble) {
      bubble.addEventListener("click", (e) => {
        if (e.target.closest("button, a, textarea, input, summary")) return;
        const sel = window.getSelection && String(window.getSelection());
        if (sel && sel.trim()) return;
        ui.noteOpen = true;
        const panel = wrap.querySelector(".note-panel");
        const area = wrap.querySelector(".note-panel textarea");
        if (panel) panel.hidden = false;
        if (area) area.focus();
      });
    }
    const area = wrap.querySelector(".note-panel textarea");
    if (area) {
      area.addEventListener("input", () => {
        setNote(msg.id, area.value);
        wrap.classList.toggle("has-note", !!area.value.trim());
        const badgeHost = wrap.querySelector(".label");
        if (badgeHost) {
          const existed = badgeHost.querySelector(".badge.note");
          if (area.value.trim() && !existed) {
            const span = document.createElement("span");
            span.className = "badge note";
            span.textContent = "已批注";
            badgeHost.appendChild(span);
          } else if (!area.value.trim() && existed) {
            existed.remove();
          }
        }
        renderSessionList();
      });
      area.addEventListener("blur", () => {
        if (area.value.trim()) return;
        ui.noteOpen = false;
        const panel = wrap.querySelector(".note-panel");
        if (panel) panel.hidden = true;
      });
    }
  }

  function renderNotePanel(msg) {
    const ui = getMsgUi(msg.id);
    const note = getNote(msg.id);
    const open = ui.noteOpen || !!note.trim();
    return `
      <div class="note-panel" ${open ? "" : "hidden"}>
        <div class="note-label">批注</div>
        <textarea placeholder="点击消息后在此填写批注…">${escapeHtml(note)}</textarea>
      </div>
    `;
  }

  function renderMessageEl(msg) {
    const ui = getMsgUi(msg.id);
    const wrap = document.createElement("div");
    wrap.className = `msg ${msg.role}-msg`;
    wrap.dataset.msgId = msg.id;
    if (getNote(msg.id).trim()) wrap.classList.add("has-note");
    const bubbleClass = msg.role === "user"
      ? "bubble user"
      : msg.role === "tool"
        ? "bubble tool"
        : ui.mode === "raw"
          ? "bubble raw"
          : "bubble assistant";
    const toggleLabel = ui.mode === "raw" ? "渲染" : "原文";
    wrap.innerHTML = `
      <div class="${bubbleClass}">
        <button type="button" class="btn-view-toggle">${toggleLabel}</button>
        ${renderMessageMeta(msg)}
        ${ui.mode === "raw" ? renderRawBody(msg) : renderRenderedBody(msg)}
      </div>
      ${renderNotePanel(msg)}
    `;
    bindMsgActions(wrap, msg);
    return wrap;
  }

  function refreshMessageEl(wrap, msg) {
    const next = renderMessageEl(msg);
    wrap.replaceWith(next);
  }

  function renderTurn(turn) {
    const wrap = document.createElement("div");
    wrap.id = `turn-${turn.groupId}`;
    const anchor = document.createElement("div");
    anchor.className = "turn-anchor";
    anchor.textContent = `轮次 · ${turn.preview}`;
    wrap.appendChild(anchor);
    for (const msg of turn.messages) wrap.appendChild(renderMessageEl(msg));
    return wrap;
  }

  function getActiveSession() {
    return state.sessions.find((s) => s.id === state.activeId) || null;
  }

  function renderThread() {
    const session = getActiveSession();
    threadEl.innerHTML = "";
    if (!session) {
      toolbarEl.hidden = true;
      threadEl.innerHTML = `<div class="empty">请选择左侧会话</div>`;
      return;
    }
    toolbarEl.hidden = false;
    threadTitleEl.textContent = session.title;
    threadMetaEl.textContent =
      `session=${shortId(session.id, 12)} · dialog=${shortId(session.dialogId, 12)} · ` +
      `${session.stats.messages} 条 / ${session.stats.turns} 轮 / 外层工具 ${session.stats.toolCalls} / 内部调用 ${session.stats.innerCalls}` +
      (session.model ? ` · ${session.model}` : "") +
      ` · ${formatTime(session.startTime)} → ${formatTime(session.endTime)}`;
    for (const turn of session.turns) threadEl.appendChild(renderTurn(turn));
  }

  function messagesHaveNote(messages) {
    return (messages || []).some((m) => getNote(m.id).trim());
  }

  function renderSessionList() {
    sessionListEl.innerHTML = "";
    if (!state.sessions.length) {
      sessionListEl.innerHTML = `<div class="empty">尚未加载 CSV</div>`;
      return;
    }
    for (const session of state.sessions) {
      const btn = document.createElement("button");
      const sessNoted = messagesHaveNote(session.messages);
      btn.type = "button";
      btn.className = "sess" + (session.id === state.activeId ? " active" : "") + (sessNoted ? " has-note" : "");
      btn.innerHTML = `<div class="title">${escapeHtml(session.title)}</div>
        <div class="meta">${session.stats.turns} 轮 · ${session.stats.messages} 条 · 内部工具 ${session.stats.innerCalls}</div>`;
      btn.onclick = () => selectSession(session.id);
      sessionListEl.appendChild(btn);
      if (session.id === state.activeId && session.turns.length) {
        const nav = document.createElement("div");
        nav.className = "turn-nav";
        session.turns.forEach((turn, i) => {
          const tbtn = document.createElement("button");
          const noted = messagesHaveNote(turn.messages);
          tbtn.type = "button";
          tbtn.className = noted ? "has-note" : "";
          tbtn.textContent = `${i + 1}. ${turn.preview}`;
          tbtn.title = turn.preview;
          tbtn.onclick = () => {
            const el = document.getElementById(`turn-${turn.groupId}`);
            if (!el) return;
            const top = el.getBoundingClientRect().top - threadEl.getBoundingClientRect().top + threadEl.scrollTop;
            threadEl.scrollTo({ top, behavior: "smooth" });
          };
          nav.appendChild(tbtn);
        });
        sessionListEl.appendChild(nav);
      }
    }
  }

  function selectSession(id) {
    state.activeId = id;
    renderSessionList();
    renderThread();
  }

  function ingestCsvText(text, fileName) {
    const table = parseCsv(text);
    if (table.length < 2) throw new Error("CSV 为空或缺少数据行");
    const header = table[0].map((h) => String(h || "").trim());
    const records = csvRowsToRecords(table);
    if (!records.length) throw new Error("没有可用记录");
    state.csvHeader = header.filter((h) => h && h !== "annotation");
    state.sessions = buildSessions(records);
    state.fileName = fileName || "csv";
    state.activeId = "";
    state.msgUi = {};
    loadNotes();
    for (const rec of records) {
      const fromCsv = rec.annotation && String(rec.annotation).trim();
      if (fromCsv && rec.id) state.notes[rec.id] = String(rec.annotation);
    }
    saveNotes();
    const n = records.length;
    const s = state.sessions.length;
    fileHintEl.textContent = `已加载 ${state.fileName} · ${n} 条消息 · ${s} 个会话 · 点击消息可写批注`;
    if (state.sessions.length) selectSession(state.sessions[0].id);
    else {
      renderSessionList();
      renderThread();
    }
  }

  async function loadDefaultCsv() {
    sessionListEl.innerHTML = `<div class="empty">正在加载 ${DEFAULT_CSV}…</div>`;
    try {
      const resp = await fetch(DEFAULT_CSV, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      const text = await readCsvFileText(buf);
      ingestCsvText(text, DEFAULT_CSV);
    } catch (e) {
      sessionListEl.innerHTML = "";
      fileHintEl.textContent = `默认样本加载失败：${e}。请点击「加载 CSV」选择本地文件。`;
      threadEl.innerHTML = `<div class="empty">无法自动加载 ${DEFAULT_CSV}<br/>可从桌面选择 conversation_message.csv</div>`;
    }
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const text = await readCsvFileText(file);
      ingestCsvText(text, file.name);
    } catch (e) {
      fileHintEl.textContent = `CSV 解析失败：${e}`;
    } finally {
      csvFile.value = "";
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function allMessages() {
    return state.sessions.flatMap((s) => s.messages);
  }

  function exportCsv() {
    if (!state.sessions.length) {
      fileHintEl.textContent = "没有可导出的会话，请先加载 CSV";
      return;
    }
    const cols = (state.csvHeader.length ? state.csvHeader.slice() : [
      "id", "role", "content", "token_count", "provider", "model", "dialog_id",
      "history_summary", "session_id", "index", "group_id", "request_id",
      "create_time", "tool_calls", "tool_call_id",
    ]).filter((c) => c !== "annotation");
    cols.push("annotation");
    const rows = [cols.map(csvEscape).join(",")];
    for (const msg of allMessages()) {
      rows.push(cols.map((col) => csvEscape(col === "annotation" ? getNote(msg.id) : (msg[col] ?? ""))).join(","));
    }
    downloadText(
      `conversation-notes-${exportStamp()}.csv`,
      "\uFEFF" + rows.join("\r\n"),
      "text/csv;charset=utf-8"
    );
    fileHintEl.textContent = `已导出 CSV（含批注）· ${allMessages().length} 条`;
  }

  function exportHtmlCss() {
    return `
:root { --bg:#0f1419; --panel:#1a2332; --border:#2d3a4f; --text:#e7ecf3; --muted:#8b9bb4; --user:#2563eb; --assistant:#1e293b; --warn:#f59e0b; --prompt:#14b8a6; --info:#38bdf8; --routine:#4ade80; --trigger:#c4b5fd; --usage:#2dd4bf; --call:#fb923c; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; padding:24px; }
h1 { font-size:20px; margin:0 0 8px; }
.meta { color:var(--muted); font-size:12px; margin-bottom:24px; }
.session { margin-bottom:36px; }
.session h2 { font-size:16px; margin:0 0 6px; color:#5eead4; }
.turn-anchor { display:flex; align-items:center; gap:8px; margin:16px 0 8px; color:var(--muted); font-size:11px; }
.turn-anchor::after { content:""; flex:1; height:1px; background:var(--border); }
.msg { display:flex; flex-direction:row; align-items:stretch; gap:10px; max-width:none; margin:0 0 12px; }
.msg.user-msg { justify-content:flex-end; }
.bubble { position:relative; padding:10px 14px; border-radius:12px; line-height:1.55; font-size:14px; flex:1 1 auto; min-width:0; max-width:720px; }
.bubble.user { background:var(--user); }
.bubble.assistant, .bubble.tool { background:var(--assistant); border:1px solid var(--border); }
.bubble.tool { border-left:3px solid var(--call); }
.msg.has-note .bubble { box-shadow: inset 3px 0 0 var(--warn); }
.label { font-size:11px; color:var(--muted); margin-bottom:6px; display:flex; flex-wrap:wrap; gap:8px; }
.plain, .preview { white-space:pre-wrap; word-break:break-word; }
.md-view p { margin:0.4em 0; }
.md-view ul, .md-view ol { padding-left:1.3em; }
.md-view code { background:#0b1220; padding:1px 5px; border-radius:4px; font-size:0.9em; }
pre.json { margin:0; padding:10px; background:#0b1220; border-radius:8px; overflow-x:auto; font-size:12px; color:#a5f3fc; white-space:pre-wrap; word-break:break-word; font-family:Consolas,"Courier New",monospace; }
.badge { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:600; }
.badge.user { background:rgba(37,99,235,.25); color:#93c5fd; }
.badge.assistant { background:rgba(148,163,184,.2); color:#cbd5e1; }
.badge.tool { background:rgba(251,146,60,.2); color:#fdba74; }
.badge.info { background:rgba(56,189,248,.18); color:var(--info); }
.badge.routine { background:rgba(74,222,128,.18); color:var(--routine); }
.badge.trigger { background:rgba(196,181,253,.18); color:var(--trigger); }
.badge.usage { background:rgba(45,212,191,.18); color:var(--usage); }
.badge.call { background:rgba(251,146,60,.18); color:var(--call); }
.badge.ok { background:rgba(34,197,94,.18); color:#86efac; }
.badge.fail { background:rgba(239,68,68,.18); color:#fca5a5; }
.badge.note { background:rgba(245,158,11,.2); color:#fcd34d; }
details.fold { border:1px solid var(--border); border-radius:10px; background:#121a24; margin-top:8px; }
details.fold > summary { cursor:pointer; padding:8px 12px; font-size:12px; color:#cbd5e1; }
details.fold > .fold-body { padding:0 12px 12px; }
.inner-tool { border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-top:8px; background:#0b1220; }
.inner-name { font-family:Consolas,"Courier New",monospace; color:#5eead4; }
.kv { margin-top:6px; font-size:12px; color:var(--muted); }
.kv b { color:#cbd5e1; }
.note-panel { flex:0 0 280px; width:280px; border:1px dashed rgba(245,158,11,.55); background:rgba(245,158,11,.08); border-radius:10px; padding:8px 10px; }
.note-panel .note-label { font-size:11px; color:#fbbf24; margin-bottom:6px; }
.note-text { white-space:pre-wrap; word-break:break-word; font-size:13px; color:#fde68a; }
`.trim();
  }

  function exportHtml() {
    if (!state.sessions.length) {
      fileHintEl.textContent = "没有可导出的会话，请先加载 CSV";
      return;
    }
    const parts = [];
    parts.push(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>对话分析导出</title><style>${exportHtmlCss()}</style></head><body>`);
    parts.push(`<h1>对话分析导出</h1>`);
    parts.push(`<div class="meta">来源 ${escapeHtml(state.fileName || "-")} · 导出时间 ${escapeHtml(new Date().toLocaleString())} · ${state.sessions.length} 个会话 · 含批注</div>`);
    for (const session of state.sessions) {
      parts.push(`<section class="session">`);
      parts.push(`<h2>${escapeHtml(session.title)}</h2>`);
      parts.push(`<div class="meta">${escapeHtml(shortId(session.id, 12))} · ${session.stats.messages} 条 / ${session.stats.turns} 轮</div>`);
      for (const turn of session.turns) {
        parts.push(`<div class="turn-anchor">轮次 · ${escapeHtml(turn.preview)}</div>`);
        for (const msg of turn.messages) {
          const note = getNote(msg.id).trim();
          const roleClass = msg.role === "user" ? "user" : msg.role === "tool" ? "tool" : "assistant";
          parts.push(`<div class="msg ${msg.role}-msg${note ? " has-note" : ""}">`);
          parts.push(`<div class="bubble ${roleClass}">${renderMessageMeta(msg)}${renderRenderedBody(msg)}</div>`);
          if (note) {
            parts.push(`<div class="note-panel"><div class="note-label">批注</div><div class="note-text">${escapeHtml(note)}</div></div>`);
          }
          parts.push(`</div>`);
        }
      }
      parts.push(`</section>`);
    }
    parts.push(`</body></html>`);
    downloadText(
      `conversation-notes-${exportStamp()}.html`,
      parts.join("\n"),
      "text/html;charset=utf-8"
    );
    fileHintEl.textContent = `已导出 HTML（含批注）· ${state.sessions.length} 个会话`;
  }

  btnLoad.onclick = () => csvFile.click();
  csvFile.onchange = () => importFile(csvFile.files && csvFile.files[0]);
  btnReloadDefault.onclick = () => loadDefaultCsv();
  btnExportHtml.onclick = exportHtml;
  btnExportCsv.onclick = exportCsv;

  loadDefaultCsv();
})();
