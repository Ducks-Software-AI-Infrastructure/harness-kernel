import assert from "node:assert/strict";
import {
  normalizeHarnessError,
  sanitizeHarnessError,
} from "./errors.js";

const generic = normalizeHarnessError(new Error("boom"));
assert.equal(generic.code, "runtime.failed");
assert.equal(generic.category, "runtime");
assert.equal(generic.severity, "fatal");
assert.equal(generic.recoverable, false);

const aborted = normalizeHarnessError(new Error("Run aborted."), {
  code: "run.failed",
  category: "run",
  severity: "fatal",
  recoverable: false,
});
assert.equal(aborted.code, "run.aborted");
assert.equal(aborted.severity, "warn");

const timeout = normalizeHarnessError(Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" }), {
  category: "model",
});
assert.equal(timeout.code, "model.timeout");

const rateLimited = normalizeHarnessError(Object.assign(new Error("too many requests"), { status: 429 }), {
  category: "model",
});
assert.equal(rateLimited.code, "model.rate_limited");

const classified = normalizeHarnessError(new Error("custom"), {}, {
  classify() {
    return { code: "tool.failed", message: "tool broke" };
  },
});
assert.equal(classified.code, "tool.failed");
assert.equal(classified.category, "tool");
assert.equal(classified.recoverable, true);
assert.equal(classified.message, "tool broke");

const sanitized = sanitizeHarnessError({
  code: "runtime.failed",
  category: "runtime",
  severity: "fatal",
  recoverable: false,
  message: "internal detail",
  publicMessage: "public detail",
  stack: "stack",
  cause: { token: "secret" },
  details: { token: "secret" },
});
assert.equal(sanitized.message, "public detail");
assert.equal(sanitized.stack, undefined);
assert.equal(sanitized.cause, undefined);
assert.equal(sanitized.details, undefined);

const withStack = sanitizeHarnessError({
  code: "runtime.failed",
  category: "runtime",
  severity: "fatal",
  recoverable: false,
  message: "internal detail",
  stack: "stack",
}, { includeStackInStatus: true });
assert.equal(withStack.stack, "stack");
