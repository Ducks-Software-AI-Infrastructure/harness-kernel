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
    resources: {},
  });
  const result = await session.exec({ command: "printf ok" });
  assert.equal(result.stdout, "ok");
  assert.equal(result.exitCode, 0);

  await assert.rejects(
    () => session.exec({ command: "printf nope", cwd: ".." }),
    /Path escapes sandbox workDir/,
  );

  const timedOut = await session.exec({ command: "sleep 1", timeoutMs: 10 });
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.exitCode, null);
} finally {
  rmSync(root, { recursive: true, force: true });
}
