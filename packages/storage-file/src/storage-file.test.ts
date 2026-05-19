import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRunStorage, FileSessionStorage } from "./index.js";
import {
  createHarnessSessionStore,
  defineAgent,
  HarnessMode,
  type AgentMessage,
  type ContextSnapshot,
  type HarnessEventRecord,
  type HarnessModelProvider,
  type HarnessSnapshot,
  type RunCursorState,
  type RunMetrics,
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

  const sessionStorage = new FileSessionStorage({ rootDir: join(root, "kernel") });
  sessionStorage.init();
  sessionStorage.createSession({
    sessionId: "session-a",
    agentKey: "agent",
    mode: "mode",
    createdAt: "2024-01-01T00:00:00.000Z",
    lastActiveAt: "2024-01-01T00:00:00.000Z",
  });
  sessionStorage.createSession({
    sessionId: "session-b",
    agentKey: "agent",
    mode: "mode",
    createdAt: "2024-01-02T00:00:00.000Z",
    lastActiveAt: "2024-01-03T00:00:00.000Z",
  });
  sessionStorage.createSession({
    sessionId: "session-c",
    agentKey: "agent",
    mode: "mode",
    createdAt: "2024-01-03T00:00:00.000Z",
    lastActiveAt: "2024-01-02T00:00:00.000Z",
  });

  assert.deepEqual(sessionStorage.listSessions({ limit: 2 }).items.map((item) => item.sessionId), ["session-b", "session-c"]);
  const firstPage = sessionStorage.listSessions({ limit: 2 });
  assert.deepEqual(sessionStorage.listSessions({ limit: 2, cursor: firstPage.nextCursor }).items.map((item) => item.sessionId), ["session-a"]);

  sessionStorage.createRun({
    sessionId: "session-a",
    runId: "run-a-1",
    agentKey: "agent",
    mode: "mode",
    createdAt: "2024-01-04T00:00:00.000Z",
  });
  const sessionRun = sessionStorage.openRun({ sessionId: "session-a", runId: "run-a-1", agentKey: "agent" });
  sessionRun.init();
  sessionRun.saveTranscript([message]);
  sessionRun.recordEvent(event);
  sessionRun.saveCursors(cursors);
  sessionRun.saveSnapshot(snapshot);
  sessionRun.saveContextSnapshot(contextSnapshot);
  sessionRun.saveMetrics(metrics);
  assert.equal(existsSync(join(sessionRun.runDir!, "metrics.json")), true);

  sessionStorage.createRun({
    sessionId: "session-a",
    runId: "run-a-2",
    agentKey: "agent",
    mode: "mode",
    createdAt: "2024-01-05T00:00:00.000Z",
  });
  const restoredRun = sessionStorage.openRun({ sessionId: "session-a", runId: "run-a-2", agentKey: "agent" });
  restoredRun.init();
  assert.deepEqual(restoredRun.loadTranscript(), [message]);
  assert.deepEqual(restoredRun.loadEvents(), [event]);
  assert.deepEqual(restoredRun.loadCursors(), cursors);
  assert.deepEqual(restoredRun.loadSnapshots(), [snapshot]);
  assert.deepEqual(restoredRun.loadContextSnapshots(), [contextSnapshot]);
  assert.equal(sessionStorage.deleteSession("session-a"), true);
  assert.equal(sessionStorage.getSession("session-a"), undefined);

  class FileChatMode extends HarnessMode {
    prompt = "Reply with the latest user message.";
    maxTurns = 2;
  }

  const fileMode = new FileChatMode();
  const fileAgent = defineAgent({
    key: "file-session-agent",
    label: "File Session Agent",
    initialMode: fileMode,
    modes: [fileMode],
  });
  const fileProvider: HarnessModelProvider = {
    namespace: "fake",
    async run(input) {
      const latest = input.messages.at(-1);
      return { content: `file:${String(latest?.content ?? "")}` };
    },
  };
  const createFileStore = () => createHarnessSessionStore({
    agent: { definition: fileAgent },
    providers: [fileProvider],
    defaultModel: "fake/model",
    storage: new FileSessionStorage({ rootDir: join(root, "session-kernel-reopen") }),
  });

  const firstStore = await createFileStore();
  const firstRuns = new Map<string, string>();
  for (const sessionId of ["persist-a", "persist-b", "persist-c"]) {
    const result = await firstStore.send(sessionId, `hello ${sessionId}`);
    firstRuns.set(sessionId, result.runId);
    assert.equal(existsSync(join(root, "session-kernel-reopen", "sessions", sessionId, "runs", result.runId, "metrics.json")), true);
  }
  await firstStore.close();

  const failureStorage = new FileSessionStorage({ rootDir: join(root, "session-kernel-failure") });
  const failingStore = await createHarnessSessionStore({
    agent: { definition: fileAgent },
    providers: [{
      namespace: "fake",
      async run() {
        throw new Error("provider failed");
      },
    }],
    defaultModel: "fake/model",
    storage: failureStorage,
  });
  await assert.rejects(failingStore.send("persist-failure", "fail"), /provider failed/);
  await failingStore.close();
  const failedRun = failureStorage.getLatestRun("persist-failure");
  assert.ok(failedRun);
  const failedMetricsPath = join(root, "session-kernel-failure", "sessions", "persist-failure", "runs", failedRun.runId, "metrics.json");
  assert.equal(existsSync(failedMetricsPath), true);
  const failedMetrics = JSON.parse(readFileSync(failedMetricsPath, "utf8")) as RunMetrics;
  assert.equal(failedMetrics.errors.at(-1)?.code, "model.failed");

  const secondStore = await createFileStore();
  const pageOne = await secondStore.list({ limit: 2 });
  const pageTwo = await secondStore.list({ limit: 2, cursor: pageOne.nextCursor });
  const listed = [...pageOne.items, ...pageTwo.items];
  assert.deepEqual(new Set(listed.map((item) => item.sessionId)), new Set(["persist-a", "persist-b", "persist-c"]));
  assert.equal(secondStore.get("persist-a"), undefined);

  const reopened = await secondStore.getOrCreate("persist-a");
  assert.equal(reopened.transcript.get().some((item) => item.role === "user" && item.content === "hello persist-a"), true);
  assert.equal(reopened.getEvents().some((item) => item.type === "run:end"), true);
  assert.equal(reopened.snapshots.list().length > 0, true);
  assert.ok(reopened.getContextSnapshot());

  const nextRun = await reopened.send("again");
  assert.notEqual(nextRun.runId, firstRuns.get("persist-a"));
  assert.equal(nextRun.answer, "file:again");

  assert.equal(await secondStore.close("persist-a"), true);
  assert.equal(secondStore.get("persist-a"), undefined);
  assert.notEqual((await secondStore.list()).items.find((item) => item.sessionId === "persist-a"), undefined);
  assert.equal(await secondStore.delete("persist-a"), true);
  assert.equal((await secondStore.list()).items.some((item) => item.sessionId === "persist-a"), false);
  await secondStore.close();
} finally {
  rmSync(root, { recursive: true, force: true });
}
