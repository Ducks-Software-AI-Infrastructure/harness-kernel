import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRunStorage } from "./index.js";

const root = mkdtempSync(join(tmpdir(), "harness-kernel-storage-"));
try {
  const storage = new FileRunStorage({ outputDir: join(root, "runs") });
  const store = storage.openRun({ runId: "run", sessionId: "session", agentKey: "agent" });
  store.init();
  store.saveTranscript([]);
  assert.deepEqual(store.loadTranscript(), []);
} finally {
  rmSync(root, { recursive: true, force: true });
}
