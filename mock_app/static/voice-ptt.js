/** 按住说话 / WAV 分片：统一产出 16kHz/16bit/mono PCM，128ms 一切 */
(function (root) {
  const SLICE_MS = 128;
  const TARGET_RATE = 16000;
  const CHANNELS = 1;
  const BIT_DEPTH = 16;
  const SAMPLES_PER_SLICE = Math.round((TARGET_RATE * SLICE_MS) / 1000);
  const BYTES_PER_SLICE = SAMPLES_PER_SLICE * (BIT_DEPTH / 8);

  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {MediaStreamAudioSourceNode | null} */
  let source = null;
  /** @type {AudioNode | null} */
  let node = null;
  /** @type {GainNode | null} */
  let mute = null;
  let workletUrl = "";
  /** @type {Float32Array} */
  let pending = new Float32Array(0);
  let sliceIndex = 0;
  let active = false;
  /** @type {((slice: { pcm: Uint8Array, index: number, flag: number, samples: number }) => void) | null} */
  let onSlice = null;

  function concatFloat32(a, b) {
    if (!a.length) return b;
    if (!b.length) return a;
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function downsample(input, fromRate, toRate) {
    if (!input.length) return input;
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const newLen = Math.max(1, Math.round(input.length / ratio));
    const out = new Float32Array(newLen);
    const last = input.length - 1;
    for (let i = 0; i < newLen; i++) {
      const src = i * ratio;
      const i0 = Math.min(last, Math.floor(src));
      const i1 = Math.min(last, i0 + 1);
      const frac = src - i0;
      out[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return out;
  }

  function floatTo16BitPcm(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function pcmBytes(int16) {
    return new Uint8Array(int16.buffer.slice(int16.byteOffset, int16.byteOffset + int16.byteLength));
  }

  function readAscii(u8, off, n) {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(u8[off + i]);
    return s;
  }

  function sliceFlag(index, isLast) {
    const isFirst = index === 0;
    if (isFirst && isLast) return 2;
    if (isFirst) return 0;
    if (isLast) return 2;
    return 1;
  }

  function parseWav(arrayBuffer) {
    const u8 = arrayBuffer instanceof Uint8Array
      ? arrayBuffer
      : new Uint8Array(arrayBuffer);
    const buf = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 12 || readAscii(u8, 0, 4) !== "RIFF" || readAscii(u8, 8, 4) !== "WAVE") {
      throw new Error("不是有效的 WAV 文件");
    }
    let off = 12;
    let fmt = null;
    let dataOff = 0;
    let dataSize = 0;
    while (off + 8 <= u8.length) {
      const id = readAscii(u8, off, 4);
      const size = buf.getUint32(off + 4, true);
      if (id === "fmt ") {
        fmt = {
          audioFormat: buf.getUint16(off + 8, true),
          channels: buf.getUint16(off + 10, true),
          sampleRate: buf.getUint32(off + 12, true),
          bitDepth: buf.getUint16(off + 22, true),
        };
      } else if (id === "data") {
        dataOff = off + 8;
        dataSize = size;
      }
      off += 8 + size + (size % 2);
    }
    if (!fmt) throw new Error("WAV 缺少 fmt 块");
    if (!dataSize) throw new Error("WAV 缺少 data 块");
    return {
      audioFormat: fmt.audioFormat,
      channels: fmt.channels,
      sampleRate: fmt.sampleRate,
      bitDepth: fmt.bitDepth,
      data: u8.subarray(dataOff, dataOff + dataSize),
    };
  }

  function wavSamplesToFloatMono(parsed) {
    const { audioFormat, channels, bitDepth, data } = parsed;
    if (!channels) throw new Error("WAV 声道数无效");
    const ch = channels;
    if (audioFormat === 1 && bitDepth === 16) {
      const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
      const frames = Math.floor(samples.length / ch);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < ch; c++) sum += samples[i * ch + c] / 32768;
        out[i] = sum / ch;
      }
      return out;
    }
    if (audioFormat === 1 && bitDepth === 8) {
      const frames = Math.floor(data.length / ch);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < ch; c++) sum += (data[i * ch + c] - 128) / 128;
        out[i] = sum / ch;
      }
      return out;
    }
    if (audioFormat === 3 && bitDepth === 32) {
      const samples = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
      const frames = Math.floor(samples.length / ch);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < ch; c++) sum += samples[i * ch + c];
        out[i] = sum / ch;
      }
      return out;
    }
    throw new Error(`不支持的 WAV：format=${audioFormat} bitDepth=${bitDepth}`);
  }

  function wavToPcm16k(parsed) {
    const mono = wavSamplesToFloatMono(parsed);
    const resampled = downsample(mono, parsed.sampleRate, TARGET_RATE);
    return pcmBytes(floatTo16BitPcm(resampled));
  }

  function slicePcm(pcm) {
    const bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
    if (!bytes.length) return [];
    const slices = [];
    for (let off = 0; off < bytes.length; off += BYTES_PER_SLICE) {
      const end = Math.min(off + BYTES_PER_SLICE, bytes.length);
      const chunk = bytes.subarray(off, end);
      const index = slices.length;
      const isLast = end >= bytes.length;
      slices.push({
        pcm: chunk.slice(),
        index,
        flag: sliceFlag(index, isLast),
        samples: Math.floor(chunk.length / 2),
      });
    }
    return slices;
  }

  function pushSlice(float32, isLast) {
    const pcm = pcmBytes(floatTo16BitPcm(float32));
    const index = sliceIndex;
    sliceIndex += 1;
    if (typeof onSlice === "function") {
      onSlice({ pcm, index, flag: sliceFlag(index, isLast), samples: float32.length });
    }
  }

  function emitReadySlices(flush) {
    while (pending.length >= SAMPLES_PER_SLICE) {
      const nextFlush = flush && pending.length === SAMPLES_PER_SLICE;
      const slice = pending.subarray(0, SAMPLES_PER_SLICE);
      pending = pending.slice(SAMPLES_PER_SLICE);
      pushSlice(slice, nextFlush);
    }
    if (flush && pending.length) {
      const rest = pending;
      pending = new Float32Array(0);
      pushSlice(rest, true);
    }
  }

  function ingest(float32, sampleRate) {
    if (!active || !float32 || !float32.length) return;
    const mono = downsample(float32, sampleRate, TARGET_RATE);
    pending = concatFloat32(pending, mono);
    emitReadySlices(false);
  }

  function setupScriptProcessor() {
    const bufferSize = 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    const rate = ctx.sampleRate;
    processor.onaudioprocess = (ev) => {
      ingest(ev.inputBuffer.getChannelData(0).slice(), rate);
    };
    node = processor;
    mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
  }

  async function setupWorklet() {
    const code =
      "class PcmCaptureProcessor extends AudioWorkletProcessor{" +
      "process(inputs){const ch=inputs[0]&&inputs[0][0];if(ch&&ch.length)this.port.postMessage(ch);return true;}}" +
      "registerProcessor('pcm-capture',PcmCaptureProcessor);";
    workletUrl = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(workletUrl);
    const worklet = new AudioWorkletNode(ctx, "pcm-capture");
    const rate = ctx.sampleRate;
    worklet.port.onmessage = (ev) => ingest(ev.data, rate);
    node = worklet;
    mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(worklet);
    worklet.connect(mute);
    mute.connect(ctx.destination);
  }

  function cleanup() {
    try { if (node) node.disconnect(); } catch (_) {}
    try { if (mute) mute.disconnect(); } catch (_) {}
    try { if (source) source.disconnect(); } catch (_) {}
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
    }
    if (ctx) {
      const closing = ctx;
      ctx = null;
      closing.close().catch(() => {});
    }
    if (workletUrl) {
      URL.revokeObjectURL(workletUrl);
      workletUrl = "";
    }
    node = mute = source = stream = null;
    onSlice = null;
    pending = new Float32Array(0);
  }

  async function start(handlers) {
    if (active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风采集");
    }
    onSlice = handlers && handlers.onSlice ? handlers.onSlice : null;
    pending = new Float32Array(0);
    sliceIndex = 0;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const AudioCtx = root.AudioContext || root.webkitAudioContext;
    ctx = new AudioCtx({ sampleRate: TARGET_RATE });
    if (ctx.state === "suspended") await ctx.resume();
    source = ctx.createMediaStreamSource(stream);
    active = true;
    try {
      if (!ctx.audioWorklet) throw new Error("no audioWorklet");
      await setupWorklet();
    } catch (_) {
      setupScriptProcessor();
    }
  }

  function stop() {
    if (!active) return { sliceCount: sliceIndex };
    active = false;
    emitReadySlices(true);
    const sliceCount = sliceIndex;
    cleanup();
    return { sliceCount };
  }

  function isActive() {
    return active;
  }

  const api = {
    SLICE_MS,
    SAMPLE_RATE: TARGET_RATE,
    CHANNELS,
    BIT_DEPTH,
    BYTES_PER_SLICE,
    start,
    stop,
    isActive,
    parseWav,
    wavToPcm16k,
    slicePcm,
  };

  root.MockVoicePtt = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
