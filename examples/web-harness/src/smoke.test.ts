import assert from "node:assert/strict";
import type { HarnessSessionStore } from "@harness-kernel/core/runner";
import { createWebHarnessServer } from "./server.js";
import { agent } from "./agent.js";

const server = createWebHarnessServer(Promise.resolve({} as HarnessSessionStore));
try {
  assert.equal(agent.key, "web-harness");
  assert.equal(typeof server.listen, "function");
} finally {
  server.close();
}
