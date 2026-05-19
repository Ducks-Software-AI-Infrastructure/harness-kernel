import assert from "node:assert/strict";
import { PostgresSessionStorage, migrations, postgresSessionStorageMigration } from "./index.js";
import type {
  AgentMessage,
  ContextSnapshot,
  HarnessEventRecord,
  HarnessSnapshot,
  RunCursorState,
  RunMetrics,
} from "@harness-kernel/core";

assert.equal(typeof PostgresSessionStorage, "function");
assert.equal(migrations[0]?.id, "0001_session_storage");
assert.equal(postgresSessionStorageMigration.includes("create table if not exists harness_sessions"), true);
assert.equal(postgresSessionStorageMigration.includes("metrics jsonb"), true);

const url = process.env.HARNESS_KERNEL_POSTGRES_URL;
if (url) {
  const pg = await import("pg").catch((error) => {
    throw new Error(`HARNESS_KERNEL_POSTGRES_URL is set, but the optional 'pg' package is unavailable: ${error}`);
  }) as { Pool: new (options: { connectionString: string }) => { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; end(): Promise<void> } };
  const pool = new pg.Pool({ connectionString: url });
  const storage = new PostgresSessionStorage({ client: pool });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agentKey = `postgres-storage-test-${suffix}`;
  const sessionA = `${agentKey}-a`;
  const sessionB = `${agentKey}-b`;
  const sessionC = `${agentKey}-c`;
  const runOne = `${sessionA}-run-1`;
  const runTwo = `${sessionA}-run-2`;
  const now = "2024-01-01T00:00:00.000Z";
  const message: AgentMessage = {
    id: "message-1",
    seq: 1,
    branchId: "main",
    role: "user",
    content: "hello postgres",
    createdAt: now,
  };
  const event: HarnessEventRecord = {
    id: "event-1",
    seq: 1,
    branchId: "main",
    type: "test:event",
    eventClassId: "TestEvent",
    at: now,
    source: { kind: "runtime" },
    payload: { ok: true },
    runId: runOne,
  };
  const cursors: RunCursorState = {
    transcriptCursor: { id: "transcript-cursor", branchId: "main", headMessageId: "message-1", seq: 1, updatedAt: now },
    eventCursor: { id: "event-cursor", branchId: "main", headEventId: "event-1", seq: 1, updatedAt: now },
    branches: [{ id: "main", createdAt: now }],
  };
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
  const contextSnapshot: ContextSnapshot = {
    id: "context-1",
    modeId: "mode",
    createdAt: now,
    providers: [],
    contributions: [],
    systemPrompt: "system",
    messages: [],
  };
  const snapshot: HarnessSnapshot = {
    id: "snapshot-1",
    label: "Snapshot",
    createdAt: now,
    agentKey,
    runId: runOne,
    modeId: "mode",
    model: "fake/model",
    transcriptCursor: cursors.transcriptCursor,
    eventCursor: cursors.eventCursor,
    state: { ok: true },
    contextEntries: [],
    contextSnapshot,
    branches: cursors.branches ?? [],
  };

  try {
    await storage.init();
    await Promise.all([sessionA, sessionB, sessionC].map((sessionId) => storage.deleteSession(sessionId)));
    await storage.createSession({
      sessionId: sessionA,
      agentKey,
      mode: "mode",
      createdAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-01T00:00:00.000Z",
    });
    await storage.createSession({
      sessionId: sessionB,
      agentKey,
      mode: "mode",
      createdAt: "2024-01-02T00:00:00.000Z",
      lastActiveAt: "2024-01-03T00:00:00.000Z",
    });
    await storage.createSession({
      sessionId: sessionC,
      agentKey,
      mode: "mode",
      createdAt: "2024-01-03T00:00:00.000Z",
      lastActiveAt: "2024-01-02T00:00:00.000Z",
    });
    const pageOne = await storage.listSessions({ agentKey, limit: 1 });
    assert.deepEqual(pageOne.items.map((item) => item.sessionId), [sessionB]);
    assert.deepEqual(
      (await storage.listSessions({ agentKey, limit: 1, cursor: pageOne.nextCursor })).items.map((item) => item.sessionId),
      [sessionC],
    );

    await storage.touchSession({ sessionId: sessionA, metadata: { test: true } });
    await storage.createRun({
      sessionId: sessionA,
      runId: runOne,
      agentKey,
      mode: "mode",
      createdAt: "2024-01-01T00:00:01.000Z",
    });
    const firstRunStore = storage.openRun({ sessionId: sessionA, runId: runOne, agentKey });
    await firstRunStore.init();
    await firstRunStore.saveTranscript([message]);
    await firstRunStore.recordEvent(event);
    await firstRunStore.saveCursors(cursors);
    await firstRunStore.saveSnapshot(snapshot);
    await firstRunStore.saveContextSnapshot(contextSnapshot);
    await firstRunStore.saveMetrics(metrics);
    const metricsResult = await pool.query("select metrics from harness_runs where run_id = $1", [runOne]);
    const savedMetrics = metricsResult.rows[0]?.metrics as RunMetrics | undefined;
    assert.equal(savedMetrics?.turnCount, 1);

    await storage.createRun({
      sessionId: sessionA,
      runId: runTwo,
      agentKey,
      mode: "mode",
      createdAt: "2024-01-01T00:00:02.000Z",
    });
    assert.equal((await storage.getLatestRun(sessionA))?.runId, runTwo);
    assert.deepEqual((await storage.listRuns(sessionA)).map((run) => run.runId), [runOne, runTwo]);

    const restoredRunStore = storage.openRun({ sessionId: sessionA, runId: runTwo, agentKey });
    await restoredRunStore.init();
    assert.deepEqual(await restoredRunStore.loadTranscript(), [message]);
    assert.deepEqual(await restoredRunStore.loadEvents(), [event]);
    assert.deepEqual(await restoredRunStore.loadCursors(), cursors);
    assert.deepEqual(await restoredRunStore.loadSnapshots(), [snapshot]);
    assert.deepEqual(await restoredRunStore.loadContextSnapshots(), [contextSnapshot]);

    assert.equal(await storage.deleteSession(sessionA), true);
    assert.equal(await storage.getSession(sessionA), undefined);
    assert.deepEqual(await storage.listRuns(sessionA), []);
  } finally {
    await Promise.all([sessionA, sessionB, sessionC].map((sessionId) => storage.deleteSession(sessionId)));
    await pool.end();
  }
}
