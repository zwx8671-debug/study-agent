const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseRecords,
  groupRecords,
  decodePcm,
} = require("./static/replay-core");
const record = (traceId, id, socketId = "one") => ({
  ts: "2026-09-28T00:00:00Z",
  socketId,
  event: "chat:response",
  dir: "OUT",
  payload: { code: 200, data: { traceId, id, text: '嵌套 { "文本" }' } },
});
test("NDJSON / arrays / pretty objects retain trace identity across message IDs", () => {
  const rows = [
    record("turn", "message1"),
    record("turn", "message2"),
    record("other", "message3"),
    record("turn", "message1", "two"),
  ];
  for (const text of [
    rows.map((r) => JSON.stringify(r)).join("\n"),
    JSON.stringify(rows),
    rows.map((r) => JSON.stringify(r, null, 2)).join("\n"),
  ]) {
    const groups = groupRecords(parseRecords(text));
    assert.equal(groups.length, 3);
    assert.equal(groups[0].length, 2);
  }
});
test("legacy response id and malformed data", () => {
  const row = record(undefined, "legacy");
  assert.equal(parseRecords(JSON.stringify(row))[0].traceId, "legacy");
  for (const text of [
    "",
    "{",
    "{}garbage",
    JSON.stringify({ ...row, payload: "truncated" }),
  ])
    assert.throws(() => parseRecords(text));
});
test("PCM is little endian and deinterleaved", () => {
  const pcm = decodePcm({
    base64: Buffer.from([0, 128, 255, 127, 0, 0, 0, 64]).toString("base64"),
    channels: 2,
    sampleRate: 24000,
  });
  assert.equal(pcm.frames, 2);
  assert.equal(pcm.samples[0][0], -1);
  assert.equal(pcm.samples[1][1], 0.5);
  assert.equal(decodePcm({ flag: 0 }), null);
  assert.throws(() => decodePcm({ base64: "AA==" }));
  assert.throws(() => decodePcm({ base64: "AAAA", format: "mp3" }));
});
