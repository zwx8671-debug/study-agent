/** 把云端 chat:response 里的 latency 原样写到 /oem/trace/<traceId>.json */
(function (global) {
  const TRACE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

  function isLatencyMetricsPacket(data) {
    return !!(data && typeof data === "object" && data.latency && typeof data.latency === "object");
  }

  function validateTraceId(traceId) {
    return !!(traceId && typeof traceId === "string" && TRACE_ID_RE.test(traceId));
  }

  function resolveTraceId(inner, fallback) {
    const candidates = [inner && inner.id, inner && inner.traceId, fallback];
    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i] == null ? "" : String(candidates[i]).trim();
      if (validateTraceId(id)) return id;
    }
    return "";
  }

  async function postTrace(traceId, doc) {
    const res = await fetch(`/api/trace/${encodeURIComponent(traceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_) {
      payload = null;
    }
    if (!res.ok) {
      throw new Error((payload && payload.error) || text || `HTTP ${res.status}`);
    }
    return payload;
  }

  const service = {
    _writerStatus: { dir: "", ok: false, error: "" },
    _onStatus: null,

    isLatencyMetricsPacket: isLatencyMetricsPacket,

    getWriterStatus: function () {
      return this._writerStatus;
    },

    onStatus: function (fn) {
      this._onStatus = typeof fn === "function" ? fn : null;
    },

    probeWriter: async function () {
      try {
        const res = await fetch("/api/trace-dir", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data || !data.writable) {
          throw new Error((data && data.error) || `HTTP ${res.status}`);
        }
        this._writerStatus = { dir: data.dir || "/oem/trace", ok: true, error: "" };
      } catch (err) {
        this._writerStatus = {
          dir: "",
          ok: false,
          error: err && err.message ? err.message : String(err),
        };
      }
      if (this._onStatus) this._onStatus(this._writerStatus);
      return this._writerStatus;
    },

    saveCloudLatency: function (inner, fallbackTraceId) {
      if (!isLatencyMetricsPacket(inner)) return null;
      const traceId = resolveTraceId(inner, fallbackTraceId);
      if (!traceId) return null;
      const doc = Object.assign({ traceId: traceId }, inner.latency);
      postTrace(traceId, doc).then((payload) => {
        this._writerStatus = {
          dir: (payload && payload.dir) || "/oem/trace",
          ok: true,
          error: "",
        };
        if (this._onStatus) this._onStatus(this._writerStatus);
      }).catch((err) => {
        this._writerStatus = {
          dir: this._writerStatus.dir || "",
          ok: false,
          error: err && err.message ? err.message : String(err),
        };
        if (this._onStatus) this._onStatus(this._writerStatus);
      });
      return { traceId: traceId };
    },
  };

  global.MockTraceLatency = service;
})(window);
