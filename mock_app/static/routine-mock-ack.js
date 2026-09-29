(function () {
  const TYPE_REACT_EXECUTION = "react_execution";
  const photoUrl = "https://dummyimage.com/1280x720/1f2937/e5e7eb.png&text=mock+photo";

  const ROUTINE_ACK_PRESETS = {
    move: {
      ok: [
        { ok: true, routine: "move", result: { status: "completed", message: "已完成移动" } },
        { ok: true, routine: "move", result: { status: "completed", position: "updated" } },
      ],
      error: [
        { ok: false, routine: "move", error: "电机遇到阻力，移动失败" },
        { ok: false, routine: "move", error: "方向参数无法执行" },
      ],
    },
    reset: {
      ok: [{ ok: true, routine: "reset", result: { status: "completed", message: "已复位" } }],
      error: [{ ok: false, routine: "reset", error: "复位传感器暂不可用" }],
    },
    mode: {
      ok: [{ ok: true, routine: "mode", result: { status: "completed", mode: "updated" } }],
      error: [{ ok: false, routine: "mode", error: "当前模式不支持切换" }],
    },
    get_mode: {
      ok: [{ ok: true, routine: "get_mode", result: { mode: "auto_follow", label: "自动跟拍" } }],
      error: [{ ok: false, routine: "get_mode", error: "读取当前模式失败" }],
    },
    headcount: {
      ok: [
        { ok: true, routine: "headcount", result: { count: 1, people: [{ direction: "front", confidence: 0.92 }] } },
        { ok: true, routine: "headcount", result: { count: 0, people: [] } },
      ],
      error: [{ ok: false, routine: "headcount", error: "画面过暗，无法可靠识别人形" }],
    },
    photo: {
      ok: [
        { ok: true, routine: "photo", result: { status: "completed", url: photoUrl, description: "已拍照并返回图片" } },
        { ok: true, routine: "photo", result: { status: "completed", url: [photoUrl], description: "已拍照" } },
      ],
      error: [{ ok: false, routine: "photo", error: "摄像头暂时不可用，拍照失败" }],
    },
    start_video: {
      ok: [{ ok: true, routine: "start_video", result: { status: "recording", media_type: "video" } }],
      error: [{ ok: false, routine: "start_video", error: "存储空间不足，无法开始录制" }],
    },
    start_slowmo: {
      ok: [{ ok: true, routine: "start_slowmo", result: { status: "recording", media_type: "slowmo" } }],
      error: [{ ok: false, routine: "start_slowmo", error: "当前帧率不支持慢动作录制" }],
    },
    start_timelapse: {
      ok: [{ ok: true, routine: "start_timelapse", result: { status: "recording", media_type: "timelapse" } }],
      error: [{ ok: false, routine: "start_timelapse", error: "延时摄影启动失败" }],
    },
    stop_shoot: {
      ok: [{ ok: true, routine: "stop_shoot", result: { status: "stopped", saved: true } }],
      error: [{ ok: false, routine: "stop_shoot", error: "当前没有可停止的拍摄任务" }],
    },
    get_shoot_status: {
      ok: [{ ok: true, routine: "get_shoot_status", result: { status: "idle", recording: false } }],
      error: [{ ok: false, routine: "get_shoot_status", error: "读取拍摄状态失败" }],
    },
    manage_resource: {
      ok: [{ ok: true, routine: "manage_resource", result: { status: "completed", message: "资源操作完成" } }],
      error: [{ ok: false, routine: "manage_resource", error: "资源信息不完整，操作失败" }],
    },
    default: {
      ok: [{ ok: true, result: { status: "completed" } }],
      error: [{ ok: false, error: "模拟设备执行失败" }],
    },
  };

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function resolveRelay(data) {
    return data && typeof data === "object" && "code" in data ? data.data : data;
  }

  function buildRoutineAck(relay, successRate) {
    const routine = relay && relay.data && relay.data.routine ? String(relay.data.routine) : "default";
    const presets = ROUTINE_ACK_PRESETS[routine] || ROUTINE_ACK_PRESETS.default;
    const rate = typeof successRate === "number" ? successRate : 0.5;
    const success = Math.random() < rate;
    const payload = clone(pick(success ? presets.ok : presets.error));
    if (!payload.routine && routine !== "default") payload.routine = routine;
    payload.mock = true;
    payload.params = relay && relay.data ? relay.data.params || {} : {};
    payload.traceId = relay && relay.traceId ? relay.traceId : "";
    return { data: payload };
  }

  function renderRoutineCard(relay, ackPayload, helpers) {
    const documentRef = helpers && helpers.document ? helpers.document : document;
    const messagesEl = helpers && helpers.messagesEl;
    if (!messagesEl) return;
    const addSystem = helpers && helpers.addSystem;
    const routine = relay && relay.data && relay.data.routine ? relay.data.routine : "unknown";
    const params = relay && relay.data ? relay.data.params || {} : {};
    const data = ackPayload && ackPayload.data ? ackPayload.data : ackPayload;
    if (typeof addSystem === "function") {
      addSystem(`收到 routine 调用：${routine}，已返回随机 ${data && data.ok === false ? "失败" : "成功"} ACK`);
    }
    const card = documentRef.createElement("div");
    card.className = "card trigger";
    const title = documentRef.createElement("h3");
    title.innerHTML = `<span class="badge trigger">Routine</span><span>${routine}</span>`;
    const pre = documentRef.createElement("pre");
    pre.className = "xml";
    pre.textContent = JSON.stringify({ params, ack: data }, null, 2);
    card.appendChild(title);
    card.appendChild(pre);
    messagesEl.appendChild(card);
    if (typeof helpers.scrollBottom === "function") helpers.scrollBottom();
  }

  function handleRoutineRelay(data, ack, helpers) {
    const relay = resolveRelay(data);
    if (!relay || relay.type !== TYPE_REACT_EXECUTION) return false;
    const successRate = helpers && typeof helpers.successRate === "number" ? helpers.successRate : 0.5;
    const ackPayload = buildRoutineAck(relay, successRate);
    if (typeof ack === "function") ack(ackPayload);
    renderRoutineCard(relay, ackPayload, helpers || {});
    return true;
  }

  window.MockRoutineAck = {
    TYPE_REACT_EXECUTION,
    ROUTINE_ACK_PRESETS,
    handleRoutineRelay,
    buildRoutineAck,
  };
})();
