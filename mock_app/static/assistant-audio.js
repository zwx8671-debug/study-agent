/** Assistant 首包/首音频/完成计时 + PCM 拼接播放（与主链路 index.html 解耦） */
(function (global) {
  const DEFAULT_SAMPLE_RATE = 16000;
  const DEFAULT_CHANNELS = 1;
  const BASE64_KEYS = ["base64", "audioBase64", "pcmBase64", "b64"];
  const AUDIO_KEYS = BASE64_KEYS.concat([
    "audio", "pcm", "data", "chunk", "buffer", "bytes", "payload", "content", "bin", "frame",
  ]);

  /** @type {{ messagesEl: HTMLElement, scrollBottom: Function, ensureBubble: Function, getActiveTraceId: Function } | null} */
  let host = null;
  /** @type {Map<string, Turn>} */
  const turns = new Map();
  /** @type {HTMLAudioElement | null} */
  let playingAudio = null;
  /** @type {HTMLElement | null} */
  let playingBtn = null;

  /**
   * @typedef {{
   *   id: string,
   *   t0: number,
   *   textPacketMs: number[],
   *   firstAudioMs: number | null,
   *   completeMs: number | null,
   *   audioEndMs: number | null,
   *   chunks: Uint8Array[],
   *   byteLength: number,
   *   sampleRate: number,
   *   channels: number,
   *   wavUrl: string,
   *   wavBytes: number,
   *   metricsEl: HTMLElement | null,
   *   playerEl: HTMLButtonElement | null,
   *   sealed: boolean,
   *   opened: boolean,
   *   audioStarted: boolean,
   *   audioStreamId: string,
   * }} Turn
   */

  function attach(options) {
    host = options || null;
  }

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function fmtMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return "--";
    return `${Math.round(ms)}ms`;
  }

  function fmtDur(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "0.0s";
    return `${sec.toFixed(1)}s`;
  }

  function createTurn(id) {
    return {
      id,
      t0: now(),
      textPacketMs: [],
      firstAudioMs: null,
      completeMs: null,
      audioEndMs: null,
      chunks: [],
      byteLength: 0,
      sampleRate: DEFAULT_SAMPLE_RATE,
      channels: DEFAULT_CHANNELS,
      wavUrl: "",
      wavBytes: 0,
      metricsEl: null,
      playerEl: null,
      sealed: false,
      opened: false,
      audioStarted: false,
      audioStreamId: "",
    };
  }

  function detachTurnUi(turn) {
    if (!turn) return;
    if (playingBtn && turn.playerEl && playingBtn === turn.playerEl) stopPlaying();
    if (turn.metricsEl && turn.metricsEl.parentNode) {
      turn.metricsEl.parentNode.removeChild(turn.metricsEl);
    }
    turn.metricsEl = null;
    if (turn.playerEl && turn.playerEl.parentNode) {
      turn.playerEl.parentNode.removeChild(turn.playerEl);
    }
    turn.playerEl = null;
    if (turn.wavUrl) {
      try { URL.revokeObjectURL(turn.wavUrl); } catch (_) {}
      turn.wavUrl = "";
    }
  }

  function sealAll() {
    stopPlaying();
    turns.forEach((turn) => {
      turn.sealed = true;
    });
  }

  function getTurn(traceId, create) {
    const id = String(traceId || "").trim();
    if (!id) return null;
    let turn = turns.get(id);
    if (turn || !create) return turn || null;
    turn = createTurn(id);
    turns.set(id, turn);
    return turn;
  }

  function resolveTurn(traceId) {
    const id = String(traceId || (host && host.getActiveTraceId && host.getActiveTraceId()) || "").trim();
    if (!id) return null;
    return getTurn(id, true);
  }

  function mountUi(turn) {
    if (!host || !host.messagesEl) return;
    const bubble = typeof host.ensureBubble === "function" ? host.ensureBubble(turn.id) : null;
    if (bubble && !turn.metricsEl) {
      const metrics = document.createElement("div");
      metrics.className = "turn-metrics";
      bubble.appendChild(metrics);
      turn.metricsEl = metrics;
    }
    if (!turn.playerEl) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pcm-player";
      btn.hidden = true;
      btn.dataset.traceId = turn.id;
      btn.addEventListener("click", () => playTurn(turn));
      if (bubble && bubble.parentNode) {
        bubble.insertAdjacentElement("afterend", btn);
      } else {
        host.messagesEl.appendChild(btn);
      }
      turn.playerEl = btn;
    } else if (bubble && turn.playerEl.previousElementSibling !== bubble) {
      bubble.insertAdjacentElement("afterend", turn.playerEl);
    }
    renderMetrics(turn);
    if (typeof host.scrollBottom === "function") host.scrollBottom();
  }

  function renderMetrics(turn) {
    if (!turn.metricsEl) return;
    const packets = [0, 1, 2].map((i) => `${i + 1}包 ${fmtMs(turn.textPacketMs[i])}`).join(" · ");
    turn.metricsEl.textContent =
      `${packets} · 首音频 ${fmtMs(turn.firstAudioMs)} · 完成 ${fmtMs(turn.completeMs)}` +
      ` · 音频完 ${fmtMs(turn.audioEndMs)}`;
  }

  function renderPlayer(turn) {
    if (!turn.playerEl) return;
    const seconds = pcmSeconds(turn);
    turn.playerEl.hidden = turn.byteLength <= 0;
    turn.playerEl.textContent =
      `▶ PCM ${fmtDur(seconds)} · ${turn.chunks.length} 包 · ${turn.sampleRate}Hz/${turn.channels}ch`;
  }

  function pcmSeconds(turn) {
    const bytesPerSec = Math.max(1, turn.sampleRate * turn.channels * 2);
    return turn.byteLength / bytesPerSec;
  }

  function startTurn(traceId) {
    const id = String(traceId || "").trim();
    if (!id) return;
    turns.forEach((turn, key) => {
      if (key === id) return;
      turn.sealed = true;
    });
    const prev = turns.get(id);
    if (prev) detachTurnUi(prev);
    turns.set(id, createTurn(id));
  }

  function onAssistantPacket(traceId, info) {
    const active = host && typeof host.getActiveTraceId === "function" ? String(host.getActiveTraceId() || "") : "";
    const turn = (active && turns.get(active)) || resolveTurn(traceId);
    if (!turn || turn.sealed) return;
    if (traceId && String(traceId) !== turn.id) {
      turn.id = String(traceId);
      turns.set(turn.id, turn);
    }
    turn.opened = true;
    mountUi(turn);
    if (turn.textPacketMs.length < 3) {
      turn.textPacketMs.push(now() - turn.t0);
    }
    if (info && info.isEnd) onAssistantEnd(turn.id);
    else renderMetrics(turn);
  }

  function onAssistantEnd(traceId) {
    const id = String(traceId || "").trim();
    const turn = (id && turns.get(id)) || null;
    if (!turn || turn.sealed) return;
    mountUi(turn);
    if (turn.completeMs == null) turn.completeMs = now() - turn.t0;
    renderMetrics(turn);
    if (turn.byteLength > 0) rebuildWav(turn);
  }

  function handleAudio(traceId, args) {
    const parsed = parseAudioArgs(Array.isArray(args) ? args : [args]);
    // 音频包自带的 id 是 TTS 分片 id，和气泡用的 traceId 不同，只能按当前活跃轮次挂载
    const active = host && typeof host.getActiveTraceId === "function" ? String(host.getActiveTraceId() || "") : "";
    const turn = (active && turns.get(active)) || (traceId ? turns.get(String(traceId)) : null) || null;
    if (!turn || turn.sealed) return;
    if (!turn.audioStarted) {
      if (parsed.isStart) {
        turn.audioStarted = true;
      } else if (turn.opened && parsed.flag == null && parsed.pcm) {
        // 包里没有 flag 时，等本轮 assistant 文本到了再收
        turn.audioStarted = true;
      } else {
        return;
      }
    }
    if (parsed.traceId && !turn.audioStreamId) turn.audioStreamId = parsed.traceId;
    if (parsed.sampleRate) turn.sampleRate = parsed.sampleRate;
    if (parsed.channels) turn.channels = parsed.channels;
    mountUi(turn);

    if (parsed.pcm && parsed.pcm.byteLength) {
      if (turn.firstAudioMs == null) turn.firstAudioMs = now() - turn.t0;
      turn.chunks.push(parsed.pcm);
      turn.byteLength += parsed.pcm.byteLength;
      renderPlayer(turn);
    }

    if (parsed.isEnd && turn.audioEndMs == null) {
      turn.audioEndMs = now() - turn.t0;
      rebuildWav(turn);
    }
    renderMetrics(turn);
    if (host && typeof host.scrollBottom === "function") host.scrollBottom();
  }

  function parseAudioArgs(args) {
    const meta = {};
    const binaries = [];
    args.forEach((arg) => {
      if (arg && typeof arg === "object" && !ArrayBuffer.isView(arg) && !(arg instanceof ArrayBuffer) && "code" in arg && arg.data != null) {
        collectNode(arg.data, meta, binaries, 0, "data");
        copyMeta(arg, meta);
      } else {
        collectNode(arg, meta, binaries, 0, "");
      }
    });
    const pcmParts = [];
    let sampleRate = toPosInt(meta.sampleRate || meta.sample_rate || meta.rate || meta.sr || meta.samplingRate);
    let channels = toPosInt(meta.channels || meta.channel || meta.channelCount);
    binaries.forEach((bytes) => {
      const unwrapped = unwrapPossibleWav(bytes);
      if (unwrapped.sampleRate) sampleRate = sampleRate || unwrapped.sampleRate;
      if (unwrapped.channels) channels = channels || unwrapped.channels;
      if (unwrapped.pcm && unwrapped.pcm.byteLength) pcmParts.push(unwrapped.pcm);
    });
    const pcm = concatBytes(pcmParts);
    const flag = meta.flag == null || meta.flag === "" ? null : Number(meta.flag);
    const flagNum = Number.isFinite(flag) ? flag : null;
    const index = meta.index == null || meta.index === "" ? null : Number(meta.index);
    const indexNum = Number.isFinite(index) ? index : null;
    const isEnd =
      flagNum === 2 ||
      meta.end === true ||
      meta.last === true ||
      String(meta.status || "").toLowerCase() === "end";
    const isStart =
      flagNum === 0 ||
      indexNum === 0 ||
      meta.start === true ||
      String(meta.status || "").toLowerCase() === "start";
    return {
      pcm,
      sampleRate,
      channels,
      flag: flagNum,
      index: indexNum,
      isStart,
      isEnd,
      traceId: String(meta.traceId || meta.trace_id || meta.id || meta.dialogId || "").trim(),
    };
  }

  function collectNode(value, meta, binaries, depth, hintKey) {
    if (value == null || depth > 4 || typeof value === "function") return;
    const bytes = asBytes(value);
    if (bytes) {
      if (bytes.byteLength) binaries.push(bytes);
      return;
    }
    if (typeof value === "string") {
      const decoded = tryBase64(value, hintKey, meta);
      if (decoded) binaries.push(decoded);
      return;
    }
    if (typeof value !== "object") return;
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      value.arrayBuffer().then((buf) => {
        const id = meta.traceId || meta.trace_id || meta.id;
        handleAudio(id, [new Uint8Array(buf), meta]);
      }).catch(() => {});
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectNode(item, meta, binaries, depth + 1, hintKey));
      return;
    }
    copyMeta(value, meta);
    AUDIO_KEYS.forEach((key) => {
      if (key in value) collectNode(value[key], meta, binaries, depth + 1, key);
    });
  }

  function copyMeta(obj, meta) {
    [
      "traceId", "trace_id", "id", "dialogId",
      "sampleRate", "sample_rate", "rate", "sr", "samplingRate",
      "channels", "channel", "channelCount",
      "flag", "end", "last", "status", "format", "encoding", "index", "start",
    ].forEach((key) => {
      if (obj[key] != null && meta[key] == null) meta[key] = obj[key];
    });
  }

  function asBytes(value) {
    if (!value) return null;
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    return null;
  }

  function tryBase64(text, hintKey, meta) {
    const raw = String(text || "").trim();
    if (raw.length < 16) return null;
    const s = raw
      .replace(/^data:audio\/[^;]+;base64,/i, "")
      .replace(/\s/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const trusted = BASE64_KEYS.includes(hintKey) || String((meta && meta.format) || "").toLowerCase() === "pcm";
    if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return null;
    if (!trusted && s.length % 4 !== 0) return null;
    try {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.byteLength ? out : null;
    } catch (_) {
      return null;
    }
  }

  function unwrapPossibleWav(bytes) {
    if (!bytes || bytes.byteLength < 12) return { pcm: bytes };
    const isRiff =
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
    if (!isRiff) return { pcm: bytes };
    let sampleRate = 0;
    let channels = 0;
    let offset = 12;
    let pcm = bytes;
    while (offset + 8 <= bytes.byteLength) {
      const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
      const start = offset + 8;
      const end = Math.min(start + size, bytes.byteLength);
      if (id === "fmt " && size >= 16) {
        channels = bytes[start + 2] | (bytes[start + 3] << 8);
        sampleRate = bytes[start + 4] | (bytes[start + 5] << 8) | (bytes[start + 6] << 16) | (bytes[start + 7] << 24);
      } else if (id === "data") {
        pcm = bytes.subarray(start, end);
        break;
      }
      offset = start + size + (size % 2);
    }
    return { pcm, sampleRate, channels };
  }

  function concatBytes(parts) {
    const list = (parts || []).filter((p) => p && p.byteLength);
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const total = list.reduce((n, p) => n + p.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    list.forEach((p) => {
      out.set(p, offset);
      offset += p.byteLength;
    });
    return out;
  }

  function rebuildWav(turn) {
    const pcm = concatBytes(turn.chunks);
    if (!pcm || !pcm.byteLength) return;
    const wav = encodeWav(pcm, turn.sampleRate, turn.channels);
    if (turn.wavUrl) {
      try { URL.revokeObjectURL(turn.wavUrl); } catch (_) {}
    }
    turn.wavUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    turn.wavBytes = turn.byteLength;
    renderPlayer(turn);
  }

  function encodeWav(pcm, sampleRate, channels) {
    const ch = Math.max(1, channels || 1);
    const rate = Math.max(1, sampleRate || DEFAULT_SAMPLE_RATE);
    let data = pcm;
    if (data.byteLength % 2) {
      const padded = new Uint8Array(data.byteLength + 1);
      padded.set(data);
      data = padded;
    }
    const buffer = new ArrayBuffer(44 + data.byteLength);
    const view = new DataView(buffer);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + data.byteLength, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, ch, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * ch * 2, true);
    view.setUint16(32, ch * 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, data.byteLength, true);
    new Uint8Array(buffer).set(data, 44);
    return buffer;
  }

  function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }

  function toPosInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function stopPlaying() {
    if (playingAudio) {
      try { playingAudio.pause(); } catch (_) {}
      playingAudio = null;
    }
    if (playingBtn) {
      playingBtn.classList.remove("playing");
      playingBtn = null;
    }
  }

  function playTurn(turn) {
    if (!turn.wavUrl || turn.wavBytes !== turn.byteLength) rebuildWav(turn);
    if (!turn.wavUrl) return;
    if (playingBtn === turn.playerEl && playingAudio && !playingAudio.paused) {
      stopPlaying();
      renderPlayer(turn);
      return;
    }
    stopPlaying();
    const audio = new Audio(turn.wavUrl);
    playingAudio = audio;
    playingBtn = turn.playerEl;
    if (turn.playerEl) {
      turn.playerEl.classList.add("playing");
      turn.playerEl.textContent = "❚❚ 播放中…";
    }
    audio.onended = () => {
      if (playingAudio === audio) stopPlaying();
      renderPlayer(turn);
    };
    audio.onerror = () => {
      if (playingAudio === audio) stopPlaying();
      renderPlayer(turn);
    };
    audio.play().catch(() => {
      stopPlaying();
      renderPlayer(turn);
    });
  }

  global.MockAssistantAudio = {
    attach,
    startTurn,
    sealAll,
    stopPlaying,
    onAssistantPacket,
    onAssistantEnd,
    handleAudio,
  };
})(window);
