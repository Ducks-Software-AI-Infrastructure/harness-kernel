import assert from "node:assert/strict";
import { RunFailedLog } from "./runtime-logs.js";
import { normalizeHarnessLog } from "./normalize.js";

const record = normalizeHarnessLog(
  RunFailedLog,
  {
    error: {
      code: "model.failed",
      category: "model",
      severity: "error",
      recoverable: false,
      message: "provider failed",
      details: { apiKey: "secret" },
    },
    internalError: new Error("provider failed"),
  },
  { sessionId: "session-a", source: { kind: "runtime" } },
  { keys: ["apiKey"], replacement: "[hidden]" },
);

assert.equal(record.error?.code, "model.failed");
assert.equal(record.error?.category, "model");
assert.equal(record.error?.severity, "error");
assert.equal(record.error?.recoverable, false);
assert.equal((record.fields?.error as { details?: { apiKey?: string } }).details?.apiKey, "[hidden]");
