import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalSandbox } from "./index.js";

const root = mkdtempSync(join(tmpdir(), "harness-kernel-sandbox-"));
try {
  const session = new LocalSandbox().open({
    sessionId: "session",
    runId: "run",
    agentKey: "agent",
    workDir: root,
    services: {},
  });
  const result = await session.exec({ command: "printf ok" });
  assert.equal(result.stdout, "ok");
  assert.equal(result.exitCode, 0);
} finally {
  rmSync(root, { recursive: true, force: true });
}
