import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRunStorage } from "./index.js";
import type {
  AgentMessage,
  ContextSnapshot,
  HarnessEventRecord,
  HarnessSnapshot,
  RunCursorState,
  RunMetrics,
} from "@harness-kernel/core";

const root = mkdtempSync(join(tmpdir(), "harness-kernel-storage-"));
try {
  const storage = new FileRunStorage({ outputDir: join(root, "runs") });
  const store = storage.openRun({ runId: "run", sessionId: "session", agentKey: "agent" });
  const now = new Date(0).toISOString();

  store.init();

  const message: AgentMessage = {
    id: "message",
    seq: 1,
    branchId: "branch",
    role: "user",
    content: "hello",
    createdAt: now,
  };
  store.saveTranscript([message]);
  assert.deepEqual(store.loadTranscript(), [message]);

  const event: HarnessEventRecord = {
    id: "event",
    seq: 1,
    branchId: "branch",
    type: "test:event",
    eventClassId: "TestEvent",
    at: now,
    source: { kind: "runtime" },
    payload: { ok: true },
    runId: "run",
    hidden: true,
  };
  store.recordEvent(event);
  assert.deepEqual(store.loadEvents(), [event]);

  const cursors: RunCursorState = {
    transcriptCursor: { id: "transcript-cursor", branchId: "branch", headMessageId: "message", seq: 1, updatedAt: now },
    eventCursor: { id: "event-cursor", branchId: "branch", headEventId: "event", seq: 1, updatedAt: now },
    branches: [{ id: "branch", createdAt: now }],
  };
  store.saveCursors(cursors);
  assert.deepEqual(store.loadCursors(), cursors);

  const contextSnapshot: ContextSnapshot = {
    id: "context",
    modeId: "mode",
    createdAt: now,
    providers: [],
    contributions: [],
    systemPrompt: "",
    messages: [],
  };
  store.saveContextSnapshot(contextSnapshot);
  assert.deepEqual(store.loadContextSnapshots(), [contextSnapshot]);

  const snapshot: HarnessSnapshot = {
    id: "snapshot",
    label: "Snapshot",
    createdAt: now,
    agentKey: "agent",
    runId: "run",
    modeId: "mode",
    model: "fake/model",
    transcriptCursor: cursors.transcriptCursor,
    eventCursor: cursors.eventCursor,
    state: { ok: true },
    contextEntries: [],
    contextSnapshot,
    branches: cursors.branches ?? [],
  };
  store.saveSnapshot(snapshot);
  assert.deepEqual(store.loadSnapshots(), [snapshot]);
  store.deleteSnapshot("snapshot");
  assert.deepEqual(store.loadSnapshots(), []);

  const metrics: RunMetrics = {
    startedAt: now,
    durationMs: 0,
    turnCount: 1,
    messageCount: 1,
    eventCount: 1,
    toolCallCount: 0,
    tools: {},
    errors: [],
  };
  store.saveMetrics(metrics);
  assert.equal(existsSync(join(store.runDir, "metrics.json")), true);
} finally {
  rmSync(root, { recursive: true, force: true });
}
