/** 本地回放控制器，不导入在线聊天处理器，避免自动 done / latency 写入等副作用。 */
(() => {
  const $ = (id) => document.getElementById(id);
  const file = $("file"),
    turn = $("turn"),
    play = $("play"),
    stop = $("stop"),
    status = $("status"),
    messages = $("messages");
  let groups = [],
    context = null,
    timer = null,
    generation = 0,
    sources = [],
    audioEnd = 0;
  function halt(label) {
    generation++;
    clearTimeout(timer);
    timer = null;
    sources.forEach((source) => {
      try {
        source.stop();
      } catch (_) {}
    });
    sources = [];
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
    play.disabled = !groups.length;
    stop.disabled = true;
    turn.disabled = !groups.length;
    file.disabled = false;
    $("inputAudio").disabled = false;
    if (label) status.textContent = label;
  }
  file.addEventListener("change", async () => {
    halt();
    groups = [];
    turn.replaceChildren();
    messages.replaceChildren();
    play.disabled = turn.disabled = true;
    $("progress").value = 0;
    const selected = file.files[0];
    if (!selected) return;
    const token = generation;
    try {
      const parsedGroups = ChatReplay.groupRecords(
        ChatReplay.parseRecords(await selected.text()),
      );
      if (token !== generation) return;
      groups = parsedGroups;
      if (!groups.length) throw new Error("文件中没有可回放的 chat 记录");
      groups.forEach((records, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = `${records[0].traceId} · ${records[0].socketId}`;
        turn.appendChild(option);
      });
      play.disabled = turn.disabled = false;
      status.textContent = `${selected.name} · ${groups.length} 组轮次 / 连接。选择连接可避免广播包重复播放。`;
    } catch (error) {
      if (token !== generation) return;
      groups = [];
      status.textContent = `加载失败：${error.message}`;
    }
  });
  stop.addEventListener("click", () => halt("已停止，可重新播放。"));
  play.addEventListener("click", async () => {
    halt();
    const token = generation,
      records = groups[Number(turn.value)];
    if (!records) return;
    messages.replaceChildren();
    $("progress").value = 0;
    play.disabled =
      turn.disabled =
      file.disabled =
      $("inputAudio").disabled =
        true;
    stop.disabled = false;
    const bubbles = new Map();
    let cursor = 0;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error("浏览器不支持 Web Audio");
      context = new AudioCtx();
      await context.resume();
      if (token !== generation) return;
      audioEnd = context.currentTime;
      const started = performance.now(),
        first = records[0].time;
      function bubble(role, id, text) {
        const key = JSON.stringify([role, id]);
        let body = bubbles.get(key);
        if (!body) {
          const row = document.createElement("article");
          row.className = `message ${role === "user" ? "user" : ""}`;
          const meta = document.createElement("small");
          meta.textContent = `${role} · ${id}`;
          body = document.createElement("div");
          body.className = "text";
          row.append(meta, body);
          messages.appendChild(row);
          bubbles.set(key, body);
        }
        body.textContent += text;
      }
      function audio(chunk) {
        const pcm = ChatReplay.decodePcm(chunk);
        if (!pcm?.frames) return;
        const buffer = context.createBuffer(pcm.channels, pcm.frames, pcm.rate);
        pcm.samples.forEach((samples, channel) =>
          buffer.copyToChannel(samples, channel),
        );
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        sources.push(source);
        source.onended = () => {
          source.disconnect();
          sources = sources.filter((item) => item !== source);
        };
        const when = Math.max(context.currentTime, audioEnd);
        source.start(when);
        audioEnd = when + buffer.duration;
      }
      const echoedUser = records.some(
        (r) => r.event === "chat:response" && r.payload.data?.role === "user",
      );
      function render(record) {
        const data =
          record.dir === "OUT" ? record.payload.data : record.payload;
        if (
          record.event === "chat" &&
          record.dir === "IN" &&
          !echoedUser &&
          data.text
        )
          bubble("user", record.traceId, data.text);
        if (record.event === "chat:response" && record.dir === "OUT") {
          if (record.payload.code != null && record.payload.code !== 200) {
            const error = document.createElement("p");
            error.textContent = `响应错误：${record.payload.msg || record.payload.code}`;
            messages.appendChild(error);
          } else if (data)
            bubble(
              data.role || "assistant",
              data.id || record.traceId,
              data.text || "",
            );
        }
        if (record.event === "done") {
          const note = document.createElement("div");
          note.className = "done";
          note.textContent = `done · ${data.reason || ""} · idx=${data.idx ?? "—"}`;
          messages.appendChild(note);
        }
        if (
          (record.event === "chat:audio:response" && record.dir === "OUT") ||
          (record.event === "chat" &&
            record.dir === "IN" &&
            $("inputAudio").checked)
        ) {
          const chunks = data?.audio;
          (Array.isArray(chunks) ? chunks : [chunks]).forEach(audio);
        }
      }
      function tick() {
        if (token !== generation) return;
        try {
          const elapsed = performance.now() - started;
          while (
            cursor < records.length &&
            records[cursor].time - first <= elapsed
          )
            render(records[cursor++]);
          $("progress").value = cursor / records.length;
          status.textContent = `回放 ${cursor}/${records.length} 包 · ${(elapsed / 1000).toFixed(1)} 秒`;
          if (cursor === records.length && !sources.length) {
            halt("回放完成，可再次播放。");
            return;
          }
          timer = setTimeout(tick, 20);
        } catch (error) {
          halt(`回放失败：${error.message}`);
        }
      }
      tick();
    } catch (error) {
      if (token === generation) halt(`回放失败：${error.message}`);
    }
  });
  window.addEventListener("pagehide", () => halt());
})();
