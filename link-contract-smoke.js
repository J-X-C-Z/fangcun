const assert = require("node:assert/strict");
const { SCHEMA, VERSION, buildMockSnapshot, buildSnapshot } = require("./link-contract");

const mock = buildMockSnapshot();
assert.equal(mock.schema, SCHEMA);
assert.equal(mock.version, VERSION);
assert.equal(mock.dataState, "mock");
assert.equal(mock.sync.mode, "pull-only");
assert.equal(mock.sync.canWrite, false);
assert.ok(Array.isArray(mock.payload.tasks.items));
assert.ok(Array.isArray(mock.payload.schedule.items));

const empty = buildSnapshot({ dataState: "empty" });
assert.equal(empty.payload.tasks.pendingCount, 0);
assert.equal(empty.payload.schedule.items.length, 0);
assert.equal(empty.sync.cursor, null);
console.log("link-contract-smoke: ok");
