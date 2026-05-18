import {
  HarnessRunStore,
  HarnessSessionStorage,
  type AgentMessage,
  type ContextSnapshot,
  type CreateStoredRunInput,
  type CreateStoredSessionInput,
  type HarnessEventRecord,
  type HarnessSessionSummary,
  type HarnessSnapshot,
  type OpenRunStoreInput,
  type RunCursorState,
  type RunMetrics,
  type SessionListQuery,
  type SessionListResult,
  type StoredRunSummary,
  type TouchStoredSessionInput,
} from "@harness-kernel/core";

export interface PostgresQueryResult<TRow = Record<string, unknown>> {
  rows: TRow[];
}

export interface PostgresClient {
  query<TRow = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<PostgresQueryResult<TRow>>;
}

export interface PostgresSessionStorageOptions {
  client: PostgresClient;
  schema?: string;
}

const defaultSchema = "public";

export const postgresSessionStorageMigration = `
create table if not exists harness_sessions (
  session_id text primary key,
  agent_key text not null,
  created_at timestamptz not null,
  last_active_at timestamptz not null,
  mode text not null,
  latest_run_id text,
  metadata jsonb
);

create table if not exists harness_runs (
  run_id text primary key,
  session_id text not null references harness_sessions(session_id) on delete cascade,
  agent_key text not null,
  created_at timestamptz not null,
  mode text not null,
  output_dir text,
  metadata jsonb
);

create index if not exists harness_sessions_list_idx
  on harness_sessions (last_active_at desc, session_id asc);

create index if not exists harness_runs_session_created_idx
  on harness_runs (session_id, created_at asc);

create table if not exists harness_transcript_messages (
  run_id text not null references harness_runs(run_id) on delete cascade,
  session_id text not null,
  seq integer not null,
  message jsonb not null,
  primary key (run_id, seq)
);

create table if not exists harness_runtime_events (
  run_id text not null references harness_runs(run_id) on delete cascade,
  session_id text not null,
  seq integer not null,
  event_id text not null,
  event_type text not null,
  event jsonb not null,
  primary key (run_id, event_id),
  unique (run_id, seq)
);

create table if not exists harness_transcript_cursors (
  run_id text primary key references harness_runs(run_id) on delete cascade,
  session_id text not null,
  cursor_state jsonb not null
);

create table if not exists harness_snapshots (
  run_id text not null references harness_runs(run_id) on delete cascade,
  session_id text not null,
  snapshot_id text not null,
  created_at timestamptz not null,
  snapshot jsonb not null,
  primary key (run_id, snapshot_id)
);

create table if not exists harness_context_snapshots (
  run_id text not null references harness_runs(run_id) on delete cascade,
  session_id text not null,
  snapshot_id text not null,
  created_at timestamptz not null,
  snapshot jsonb not null,
  primary key (run_id, snapshot_id)
);
`;

export const migrations = [
  {
    id: "0001_session_storage",
    sql: postgresSessionStorageMigration,
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function table(schema: string, name: string): string {
  return `"${schema.replaceAll("\"", "\"\"")}"."${name}"`;
}

function encodeSessionCursor(summary: HarnessSessionSummary): string {
  return Buffer.from(JSON.stringify([summary.lastActiveAt, summary.sessionId]), "utf8").toString("base64url");
}

function decodeSessionCursor(cursor: string | undefined): [string, string] | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") return undefined;
    return [parsed[0], parsed[1]];
  } catch {
    return undefined;
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function jsonValue<T>(value: unknown): T {
  return typeof value === "string" ? JSON.parse(value) as T : value as T;
}

function rowToSession(row: Record<string, unknown>): HarnessSessionSummary {
  return {
    sessionId: String(row.session_id),
    agentKey: String(row.agent_key),
    createdAt: toIso(row.created_at),
    lastActiveAt: toIso(row.last_active_at),
    mode: String(row.mode),
    latestRunId: row.latest_run_id ? String(row.latest_run_id) : undefined,
    metadata: row.metadata == null ? undefined : jsonValue<Record<string, unknown>>(row.metadata),
  };
}

function rowToRun(row: Record<string, unknown>): StoredRunSummary {
  return {
    runId: String(row.run_id),
    sessionId: String(row.session_id),
    agentKey: String(row.agent_key),
    createdAt: toIso(row.created_at),
    mode: String(row.mode),
    outputDir: row.output_dir ? String(row.output_dir) : undefined,
    metadata: row.metadata == null ? undefined : jsonValue<Record<string, unknown>>(row.metadata),
  };
}

export class PostgresSessionStorage extends HarnessSessionStorage {
  readonly id = "postgres-session";
  label = "Postgres Session";
  private readonly client: PostgresClient;
  private readonly schema: string;

  constructor(options: PostgresSessionStorageOptions) {
    super();
    this.client = options.client;
    this.schema = options.schema ?? defaultSchema;
  }

  async init(): Promise<void> {
    if (this.schema === defaultSchema) {
      await this.client.query(postgresSessionStorageMigration);
      return;
    }
    await this.client.query(`create schema if not exists "${this.schema.replaceAll("\"", "\"\"")}"`);
    await this.client.query(this.qualifiedMigration());
  }

  async createSession(input: CreateStoredSessionInput): Promise<HarnessSessionSummary> {
    const createdAt = input.createdAt ?? nowIso();
    const lastActiveAt = input.lastActiveAt ?? createdAt;
    const result = await this.client.query(
      `insert into ${this.sessions} (session_id, agent_key, created_at, last_active_at, mode, latest_run_id, metadata)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       on conflict (session_id) do update set
         agent_key = excluded.agent_key,
         last_active_at = greatest(${this.sessions}.last_active_at, excluded.last_active_at),
         mode = excluded.mode,
         latest_run_id = coalesce(excluded.latest_run_id, ${this.sessions}.latest_run_id),
         metadata = coalesce(excluded.metadata, ${this.sessions}.metadata)
       returning *`,
      [
        input.sessionId,
        input.agentKey,
        createdAt,
        lastActiveAt,
        input.mode,
        input.latestRunId,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      ],
    );
    return rowToSession(result.rows[0]!);
  }

  async getSession(sessionId: string): Promise<HarnessSessionSummary | undefined> {
    const result = await this.client.query(`select * from ${this.sessions} where session_id = $1`, [sessionId]);
    return result.rows[0] ? rowToSession(result.rows[0]) : undefined;
  }

  async listSessions(query?: SessionListQuery): Promise<SessionListResult> {
    const limit = Math.max(1, Math.min(query?.limit ?? 50, 100));
    const cursor = decodeSessionCursor(query?.cursor);
    const result = await this.client.query(
      `select * from ${this.sessions}
       where ($1::text is null or agent_key = $1)
         and (
           $2::timestamptz is null
           or last_active_at < $2::timestamptz
           or (last_active_at = $2::timestamptz and session_id > $3)
         )
       order by last_active_at desc, session_id asc
       limit $4`,
      [query?.agentKey ?? null, cursor?.[0] ?? null, cursor?.[1] ?? "", limit + 1],
    );
    const rows = result.rows.slice(0, limit).map(rowToSession);
    return {
      items: rows,
      nextCursor: result.rows.length > limit && rows.length > 0 ? encodeSessionCursor(rows[rows.length - 1]!) : undefined,
    };
  }

  async touchSession(input: TouchStoredSessionInput): Promise<void> {
    await this.client.query(
      `update ${this.sessions}
       set last_active_at = coalesce($2::timestamptz, last_active_at),
           mode = coalesce($3, mode),
           latest_run_id = coalesce($4, latest_run_id),
           metadata = coalesce($5::jsonb, metadata)
       where session_id = $1`,
      [
        input.sessionId,
        input.lastActiveAt ?? nowIso(),
        input.mode ?? null,
        input.latestRunId ?? null,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      ],
    );
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.client.query<{ deleted: string }>(
      `delete from ${this.sessions} where session_id = $1 returning session_id as deleted`,
      [sessionId],
    );
    return result.rows.length > 0;
  }

  async createRun(input: CreateStoredRunInput): Promise<StoredRunSummary> {
    const session = await this.getSession(input.sessionId);
    if (!session) throw new Error(`Harness session '${input.sessionId}' was not found.`);
    const createdAt = input.createdAt ?? nowIso();
    const result = await this.client.query(
      `insert into ${this.runs} (run_id, session_id, agent_key, created_at, mode, output_dir, metadata)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       on conflict (run_id) do update set mode = excluded.mode
       returning *`,
      [
        input.runId,
        input.sessionId,
        input.agentKey,
        createdAt,
        input.mode,
        input.outputDir,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      ],
    );
    if (session.latestRunId && session.latestRunId !== input.runId) {
      await this.copyRunState(session.latestRunId, input.runId, input.sessionId);
    }
    await this.touchSession({
      sessionId: input.sessionId,
      lastActiveAt: createdAt,
      latestRunId: input.runId,
      mode: input.mode,
    });
    return rowToRun(result.rows[0]!);
  }

  async getLatestRun(sessionId: string): Promise<StoredRunSummary | undefined> {
    const session = await this.getSession(sessionId);
    if (!session?.latestRunId) return undefined;
    const result = await this.client.query(`select * from ${this.runs} where run_id = $1`, [session.latestRunId]);
    return result.rows[0] ? rowToRun(result.rows[0]) : undefined;
  }

  async listRuns(sessionId: string): Promise<StoredRunSummary[]> {
    const result = await this.client.query(
      `select * from ${this.runs} where session_id = $1 order by created_at asc, run_id asc`,
      [sessionId],
    );
    return result.rows.map(rowToRun);
  }

  openRun(input: OpenRunStoreInput): HarnessRunStore {
    return new PostgresRunStore(this.client, this.schema, input);
  }

  private async copyRunState(fromRunId: string, toRunId: string, sessionId: string): Promise<void> {
    await this.client.query(
      `insert into ${this.transcript} (run_id, session_id, seq, message)
       select $2, $3, seq, message from ${this.transcript} where run_id = $1
       on conflict do nothing`,
      [fromRunId, toRunId, sessionId],
    );
    await this.client.query(
      `insert into ${this.events} (run_id, session_id, seq, event_id, event_type, event)
       select $2, $3, seq, event_id, event_type, event from ${this.events} where run_id = $1
       on conflict do nothing`,
      [fromRunId, toRunId, sessionId],
    );
    await this.client.query(
      `insert into ${this.cursors} (run_id, session_id, cursor_state)
       select $2, $3, cursor_state from ${this.cursors} where run_id = $1
       on conflict do nothing`,
      [fromRunId, toRunId, sessionId],
    );
    await this.client.query(
      `insert into ${this.snapshots} (run_id, session_id, snapshot_id, created_at, snapshot)
       select $2, $3, snapshot_id, created_at, snapshot from ${this.snapshots} where run_id = $1
       on conflict do nothing`,
      [fromRunId, toRunId, sessionId],
    );
    await this.client.query(
      `insert into ${this.contextSnapshots} (run_id, session_id, snapshot_id, created_at, snapshot)
       select $2, $3, snapshot_id, created_at, snapshot from ${this.contextSnapshots} where run_id = $1
       on conflict do nothing`,
      [fromRunId, toRunId, sessionId],
    );
  }

  private get sessions(): string { return table(this.schema, "harness_sessions"); }
  private get runs(): string { return table(this.schema, "harness_runs"); }
  private get transcript(): string { return table(this.schema, "harness_transcript_messages"); }
  private get events(): string { return table(this.schema, "harness_runtime_events"); }
  private get cursors(): string { return table(this.schema, "harness_transcript_cursors"); }
  private get snapshots(): string { return table(this.schema, "harness_snapshots"); }
  private get contextSnapshots(): string { return table(this.schema, "harness_context_snapshots"); }

  private qualifiedMigration(): string {
    return `
create table if not exists ${this.sessions} (
  session_id text primary key,
  agent_key text not null,
  created_at timestamptz not null,
  last_active_at timestamptz not null,
  mode text not null,
  latest_run_id text,
  metadata jsonb
);

create table if not exists ${this.runs} (
  run_id text primary key,
  session_id text not null references ${this.sessions}(session_id) on delete cascade,
  agent_key text not null,
  created_at timestamptz not null,
  mode text not null,
  output_dir text,
  metadata jsonb
);

create index if not exists harness_sessions_list_idx
  on ${this.sessions} (last_active_at desc, session_id asc);

create index if not exists harness_runs_session_created_idx
  on ${this.runs} (session_id, created_at asc);

create table if not exists ${this.transcript} (
  run_id text not null references ${this.runs}(run_id) on delete cascade,
  session_id text not null,
  seq integer not null,
  message jsonb not null,
  primary key (run_id, seq)
);

create table if not exists ${this.events} (
  run_id text not null references ${this.runs}(run_id) on delete cascade,
  session_id text not null,
  seq integer not null,
  event_id text not null,
  event_type text not null,
  event jsonb not null,
  primary key (run_id, event_id),
  unique (run_id, seq)
);

create table if not exists ${this.cursors} (
  run_id text primary key references ${this.runs}(run_id) on delete cascade,
  session_id text not null,
  cursor_state jsonb not null
);

create table if not exists ${this.snapshots} (
  run_id text not null references ${this.runs}(run_id) on delete cascade,
  session_id text not null,
  snapshot_id text not null,
  created_at timestamptz not null,
  snapshot jsonb not null,
  primary key (run_id, snapshot_id)
);

create table if not exists ${this.contextSnapshots} (
  run_id text not null references ${this.runs}(run_id) on delete cascade,
  session_id text not null,
  snapshot_id text not null,
  created_at timestamptz not null,
  snapshot jsonb not null,
  primary key (run_id, snapshot_id)
);
`;
  }
}

class PostgresRunStore extends HarnessRunStore {
  readonly outputDir: string | undefined;
  readonly runDir = undefined;
  readonly runId: string;
  private readonly sessionId: string;

  constructor(
    private readonly client: PostgresClient,
    private readonly schema: string,
    input: OpenRunStoreInput,
  ) {
    super();
    this.runId = input.runId;
    this.sessionId = input.sessionId;
    this.outputDir = input.outputDir;
  }

  init(): void {}

  async recordEvent(event: HarnessEventRecord): Promise<void> {
    await this.client.query(
      `insert into ${this.events} (run_id, session_id, seq, event_id, event_type, event)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (run_id, event_id) do nothing`,
      [this.runId, this.sessionId, event.seq, event.id, event.type, JSON.stringify(event)],
    );
  }

  async loadEvents(): Promise<HarnessEventRecord[]> {
    const result = await this.client.query(`select event from ${this.events} where run_id = $1 order by seq asc`, [this.runId]);
    return result.rows.map((row) => jsonValue<HarnessEventRecord>(row.event));
  }

  async saveTranscript(messages: AgentMessage[]): Promise<void> {
    await this.client.query(`delete from ${this.transcript} where run_id = $1`, [this.runId]);
    for (const message of messages) {
      await this.client.query(
        `insert into ${this.transcript} (run_id, session_id, seq, message) values ($1, $2, $3, $4::jsonb)`,
        [this.runId, this.sessionId, message.seq, JSON.stringify(message)],
      );
    }
  }

  async loadTranscript(): Promise<AgentMessage[]> {
    const result = await this.client.query(`select message from ${this.transcript} where run_id = $1 order by seq asc`, [this.runId]);
    return result.rows.map((row) => jsonValue<AgentMessage>(row.message));
  }

  saveMetrics(_metrics: RunMetrics): void {}

  async saveSnapshot(snapshot: HarnessSnapshot): Promise<void> {
    await this.client.query(
      `insert into ${this.snapshots} (run_id, session_id, snapshot_id, created_at, snapshot)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (run_id, snapshot_id) do update set snapshot = excluded.snapshot, created_at = excluded.created_at`,
      [this.runId, this.sessionId, snapshot.id, snapshot.createdAt, JSON.stringify(snapshot)],
    );
  }

  async loadSnapshots(): Promise<HarnessSnapshot[]> {
    const result = await this.client.query(`select snapshot from ${this.snapshots} where run_id = $1 order by created_at asc`, [this.runId]);
    return result.rows.map((row) => jsonValue<HarnessSnapshot>(row.snapshot));
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.client.query(`delete from ${this.snapshots} where run_id = $1 and snapshot_id = $2`, [this.runId, id]);
  }

  async saveCursors(cursors: RunCursorState): Promise<void> {
    await this.client.query(
      `insert into ${this.cursors} (run_id, session_id, cursor_state)
       values ($1, $2, $3::jsonb)
       on conflict (run_id) do update set cursor_state = excluded.cursor_state`,
      [this.runId, this.sessionId, JSON.stringify(cursors)],
    );
  }

  async loadCursors(): Promise<RunCursorState | undefined> {
    const result = await this.client.query(`select cursor_state from ${this.cursors} where run_id = $1`, [this.runId]);
    return result.rows[0] ? jsonValue<RunCursorState>(result.rows[0].cursor_state) : undefined;
  }

  async saveContextSnapshot(snapshot: ContextSnapshot): Promise<void> {
    await this.client.query(
      `insert into ${this.contextSnapshots} (run_id, session_id, snapshot_id, created_at, snapshot)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (run_id, snapshot_id) do update set snapshot = excluded.snapshot, created_at = excluded.created_at`,
      [this.runId, this.sessionId, snapshot.id, snapshot.createdAt, JSON.stringify(snapshot)],
    );
  }

  async loadContextSnapshots(): Promise<ContextSnapshot[]> {
    const result = await this.client.query(`select snapshot from ${this.contextSnapshots} where run_id = $1 order by created_at asc`, [this.runId]);
    return result.rows.map((row) => jsonValue<ContextSnapshot>(row.snapshot));
  }

  private get transcript(): string { return table(this.schema, "harness_transcript_messages"); }
  private get events(): string { return table(this.schema, "harness_runtime_events"); }
  private get cursors(): string { return table(this.schema, "harness_transcript_cursors"); }
  private get snapshots(): string { return table(this.schema, "harness_snapshots"); }
  private get contextSnapshots(): string { return table(this.schema, "harness_context_snapshots"); }
}
