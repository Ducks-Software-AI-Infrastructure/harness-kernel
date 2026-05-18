import assert from "node:assert/strict";
import { PostgresSessionStorage, migrations, postgresSessionStorageMigration } from "./index.js";

assert.equal(typeof PostgresSessionStorage, "function");
assert.equal(migrations[0]?.id, "0001_session_storage");
assert.equal(postgresSessionStorageMigration.includes("create table if not exists harness_sessions"), true);

const url = process.env.HARNESS_KERNEL_POSTGRES_URL;
if (url) {
  const pg = await import("pg").catch((error) => {
    throw new Error(`HARNESS_KERNEL_POSTGRES_URL is set, but the optional 'pg' package is unavailable: ${error}`);
  }) as { Pool: new (options: { connectionString: string }) => { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; end(): Promise<void> } };
  const pool = new pg.Pool({ connectionString: url });
  const storage = new PostgresSessionStorage({ client: pool });
  try {
    await storage.init();
    await storage.createSession({
      sessionId: "postgres-storage-test",
      agentKey: "agent",
      mode: "mode",
      createdAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-01T00:00:00.000Z",
    });
    await storage.createRun({
      sessionId: "postgres-storage-test",
      runId: "postgres-storage-test-run",
      agentKey: "agent",
      mode: "mode",
      createdAt: "2024-01-01T00:00:01.000Z",
    });
    assert.equal((await storage.getLatestRun("postgres-storage-test"))?.runId, "postgres-storage-test-run");
    assert.equal(await storage.deleteSession("postgres-storage-test"), true);
  } finally {
    await pool.end();
  }
}
