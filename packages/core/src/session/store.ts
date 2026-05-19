import { randomId } from "../runtime/id.js";
import { MemorySessionStorage } from "../runtime/storage.js";
import { createHarnessSession } from "./session.js";
import type {
  HarnessAppConfig,
  HarnessRunStream,
  HarnessSession,
  HarnessSessionStatus,
  HarnessSessionStore,
  HarnessSessionStoreEvent,
  HarnessSessionStoreListener,
  HarnessUserInput,
  SendOptions,
  SendResult,
  StreamOptions,
  ToolApprovalHandle,
} from "./types.js";
import type { HarnessSessionSummary, SessionListQuery, SessionListResult } from "../runtime/storage.js";

function mergeConfig(base: HarnessAppConfig, overrides?: Partial<HarnessAppConfig>): HarnessAppConfig {
  return {
    ...base,
    ...overrides,
    agent: overrides?.agent ?? base.agent,
    providers: overrides?.providers ?? base.providers,
    resources: overrides?.resources ?? base.resources,
    logging: overrides?.logging ?? base.logging,
    errorPolicy: overrides?.errorPolicy ?? base.errorPolicy,
    storage: overrides?.storage ?? base.storage,
  };
}

function statusToSummary(status: HarnessSessionStatus, latestRunId?: string): HarnessSessionSummary {
  return {
    sessionId: status.sessionId,
    agentKey: status.agentKey,
    createdAt: status.createdAt,
    lastActiveAt: status.lastActiveAt,
    mode: status.mode,
    latestRunId,
  };
}

function sortSummaries(items: HarnessSessionSummary[]): HarnessSessionSummary[] {
  return [...items].sort((a, b) => {
    const byLastActive = b.lastActiveAt.localeCompare(a.lastActiveAt);
    return byLastActive || a.sessionId.localeCompare(b.sessionId);
  });
}

function encodeCursor(summary: HarnessSessionSummary): string {
  return Buffer.from(JSON.stringify([summary.lastActiveAt, summary.sessionId]), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): [string, string] | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") return undefined;
    return [parsed[0], parsed[1]];
  } catch {
    return undefined;
  }
}

function paginateActive(items: HarnessSessionSummary[], query?: SessionListQuery): SessionListResult {
  const limit = Math.max(1, Math.min(query?.limit ?? 50, 100));
  const cursor = decodeCursor(query?.cursor);
  const filtered = sortSummaries(items)
    .filter((summary) => !query?.agentKey || summary.agentKey === query.agentKey)
    .filter((summary) => {
      if (!cursor) return true;
      const [lastActiveAt, sessionId] = cursor;
      return summary.lastActiveAt < lastActiveAt
        || (summary.lastActiveAt === lastActiveAt && summary.sessionId > sessionId);
    });
  const page = filtered.slice(0, limit);
  return {
    items: page,
    nextCursor: filtered.length > limit && page.length > 0 ? encodeCursor(page[page.length - 1]!) : undefined,
  };
}

export class HarnessSessionStoreImpl implements HarnessSessionStore {
  private readonly sessions = new Map<string, HarnessSession>();
  private readonly unsubscriptions = new Map<string, () => void>();
  private readonly latestRunIds = new Map<string, string>();
  private readonly listeners = new Set<HarnessSessionStoreListener>();
  private readonly storage;
  private closed = false;

  constructor(private readonly config: HarnessAppConfig) {
    this.storage = config.storage ?? new MemorySessionStorage();
  }

  async init(): Promise<void> {
    await this.storage.init?.();
  }

  async getOrCreate(sessionId?: string, overrides?: Partial<HarnessAppConfig>): Promise<HarnessSession> {
    if (this.closed) throw new Error("Harness session store is closed.");
    const id = sessionId?.trim() || randomId();
    const existing = this.sessions.get(id);
    if (existing) return existing;

    const config = mergeConfig({ ...this.config, storage: this.storage }, overrides);
    const stored = await this.storage.getSession(id);
    const session = await createHarnessSession(config, { sessionId: id, restoredSession: stored });
    const status = session.getStatus();
    if (stored?.latestRunId) this.latestRunIds.set(id, stored.latestRunId);
    else this.latestRunIds.delete(id);

    if (!stored) {
      await this.storage.createSession({
        sessionId: id,
        agentKey: status.agentKey,
        createdAt: status.createdAt,
        lastActiveAt: status.lastActiveAt,
        mode: status.mode,
      });
    }

    this.sessions.set(id, session);
    this.unsubscriptions.set(id, session.on((event) => {
      if (event.type === "run.started") this.latestRunIds.set(id, event.runId);
      if (event.type === "run.completed") this.latestRunIds.set(id, event.result.runId);
      if (event.type === "run.failed" || event.type === "run.aborted") this.latestRunIds.set(id, event.runId);
      if (event.type === "session.status") {
        void this.storage.touchSession({
          sessionId: id,
          lastActiveAt: event.status.lastActiveAt,
          mode: event.status.mode,
        });
      }
      this.notify({ type: "session.event", sessionId: id, event });
    }));
    this.notify({ type: "session.created", sessionId: id, status });
    return session;
  }

  get(sessionId: string): HarnessSession | undefined {
    return this.sessions.get(sessionId);
  }

  async list(query?: SessionListQuery): Promise<SessionListResult> {
    if (query?.active) {
      return paginateActive([...this.sessions.values()].map((session) => statusToSummary(session.getStatus(), this.latestRunIds.get(session.id))), query);
    }

    const result = await this.storage.listSessions(query);
    const active = new Map([...this.sessions.values()].map((session) => [session.id, statusToSummary(session.getStatus(), this.latestRunIds.get(session.id))]));
    return {
      items: result.items.map((item) => active.get(item.sessionId) ?? item),
      nextCursor: result.nextCursor,
    };
  }

  close(sessionId: string): Promise<boolean>;
  close(): Promise<void>;
  async close(sessionId?: string): Promise<boolean | void> {
    if (sessionId === undefined) {
      if (this.closed) return;
      this.closed = true;
      await this.closeAll();
      this.listeners.clear();
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    this.latestRunIds.delete(sessionId);
    this.unsubscriptions.get(sessionId)?.();
    this.unsubscriptions.delete(sessionId);
    await session.close();
    return true;
  }

  async delete(sessionId: string): Promise<boolean> {
    await this.close(sessionId);
    this.latestRunIds.delete(sessionId);
    const deleted = await this.storage.deleteSession(sessionId);
    if (deleted) this.notify({ type: "session.deleted", sessionId });
    return deleted;
  }

  async clearActive(): Promise<void> {
    await this.closeAll();
    this.notify({ type: "session.cleared" });
  }

  async closeAll(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) await this.close(sessionId);
  }

  async send(sessionId: string | undefined, input: string | HarnessUserInput, options?: SendOptions): Promise<SendResult> {
    const session = await this.getOrCreate(sessionId);
    return session.send(input, options);
  }

  async stream(sessionId: string | undefined, input: string | HarnessUserInput, options?: StreamOptions): Promise<HarnessRunStream> {
    const session = await this.getOrCreate(sessionId);
    return session.stream(input, options);
  }

  getPendingApprovals(sessionId?: string): ToolApprovalHandle[] {
    if (sessionId) return this.sessions.get(sessionId)?.getPendingApprovals() ?? [];
    return [...this.sessions.values()].flatMap((session) => session.getPendingApprovals());
  }

  async approveTool(sessionId: string, approvalId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Harness session '${sessionId}' was not found.`);
    await session.approveTool(approvalId);
  }

  async denyTool(sessionId: string, approvalId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Harness session '${sessionId}' was not found.`);
    await session.denyTool(approvalId, reason);
  }

  getAgentManifest(sessionId: string) {
    return this.sessions.get(sessionId)?.getAgentManifest();
  }

  on(listener: HarnessSessionStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: HarnessSessionStoreEvent): void {
    for (const listener of this.listeners) void listener(event);
  }
}

export async function createHarnessSessionStore(config: HarnessAppConfig): Promise<HarnessSessionStore> {
  const store = new HarnessSessionStoreImpl(config);
  await store.init();
  return store;
}
