/** 离线日志解析，与 Socket.IO 和页面状态无关。 */
(function (root) {
  function parseRecords(text) {
    text = text.replace(/^\uFEFF/, "").trim();
    if (!text) throw new Error("文件为空");
    let records;
    try {
      const parsed = JSON.parse(text);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      // 同时兼容 NDJSON 和被格式化为多行的连续 JSON 对象。
      records = [];
      let depth = 0,
        start = -1,
        quoted = false,
        escaped = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (c === "\\") escaped = true;
          else if (c === '"') quoted = false;
          continue;
        }
        if (c === '"') {
          quoted = true;
          continue;
        }
        if (c === "{") {
          if (depth++ === 0) start = i;
        } else if (c === "}") {
          if (--depth < 0) throw new Error("JSON 括号不匹配");
          if (!depth) records.push(JSON.parse(text.slice(start, i + 1)));
        } else if (!depth && !/\s/.test(c))
          throw new Error("请提供 JSON 数组或 NDJSON 对象日志");
      }
      if (depth || quoted || !records.length)
        throw new Error("JSON 不完整，无法回放");
    }
    const allowed = new Set([
      "chat",
      "done",
      "chat:response",
      "chat:audio:response",
    ]);
    return records
      .filter((r) => r && allowed.has(r.event))
      .map((r, index) => {
        const payload = r.payload ?? r.args?.[0];
        if (!payload || typeof payload !== "object")
          throw new Error(
            `第 ${index + 1} 条业务记录缺少完整 payload（可能已截断）`,
          );
        const dir = r.dir || (r.event.includes(":response") ? "OUT" : "IN");
        const data = dir === "OUT" ? payload.data : payload;
        const traceId =
          r.traceId || data?.traceId || (dir === "OUT" ? data?.id : "");
        const time = Date.parse(r.ts);
        if (!traceId || !Number.isFinite(time))
          throw new Error(`第 ${index + 1} 条业务记录缺少 traceId 或有效时间`);
        return {
          ...r,
          payload,
          dir,
          traceId,
          time,
          socketId: r.socketId || "默认连接",
        };
      })
      .sort((a, b) => a.time - b.time);
  }
  function groupRecords(records) {
    const groups = new Map();
    for (const record of records) {
      const key = JSON.stringify([record.traceId, record.socketId]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    return [...groups.values()];
  }
  function decodePcm(audio) {
    if (!audio?.base64) return null;
    const format = (audio.format || "pcm").toLowerCase();
    if (format !== "pcm")
      throw new Error(`不支持音频格式 ${format}，当前支持 PCM`);
    const bits = Number(audio.bitDepth || 16),
      channels = Number(audio.channels || 1),
      rate = Number(audio.sampleRate || 16000);
    if (
      bits !== 16 ||
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 8 ||
      !Number.isFinite(rate) ||
      rate < 3000 ||
      rate > 192000
    )
      throw new Error("音频参数无效或非 16 位 PCM");
    const binary = atob(audio.base64),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    if (bytes.length % (2 * channels)) throw new Error("PCM 数据不完整");
    const frames = bytes.length / (2 * channels),
      view = new DataView(bytes.buffer);
    const samples = Array.from({ length: channels }, (_, channel) => {
      const values = new Float32Array(frames);
      for (let i = 0; i < frames; i++)
        values[i] = view.getInt16((i * channels + channel) * 2, true) / 32768;
      return values;
    });
    return { samples, frames, rate, channels };
  }
  const api = { parseRecords, groupRecords, decodePcm };
  if (typeof module !== "undefined") module.exports = api;
  else root.ChatReplay = api;
})(globalThis);
