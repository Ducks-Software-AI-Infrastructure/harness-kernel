import { randomId } from "../runtime/id.js";
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

function mergeConfig(base: HarnessAppConfig, overrides?: Partial<HarnessAppConfig>): HarnessAppConfig {
  return {
    ...base,
    ...overrides,
    agent: overrides?.agent ?? base.agent,
    providers: overrides?.providers ?? base.providers,
    services: overrides?.services ?? base.services,
    logging: overrides?.logging ?? base.logging,
  };
}

export class HarnessSessionStoreImpl implements HarnessSessionStore {
  private readonly sessions = new Map<string, HarnessSession>();
  private readonly unsubscriptions = new Map<string, () => void>();
  private readonly listeners = new Set<HarnessSessionStoreListener>();
  private closed = false;

  constructor(private readonly config: HarnessAppConfig) {}

  async getOrCreate(sessionId?: string, overrides?: Partial<HarnessAppConfig>): Promise<HarnessSession> {
    this.cleanupExpired();
    if (this.closed) throw new Error("Harness session store is closed.");
    const id = sessionId?.trim() || randomId();
    const existing = this.sessions.get(id);
    if (existing) return existing;

    const session = await createHarnessSession(mergeConfig(this.config, overrides), { sessionId: id });
    this.sessions.set(id, session);
    this.unsubscriptions.set(id, session.on((event) => this.notify({ type: "session.event", sessionId: id, event })));
    this.notify({ type: "session.created", sessionId: id, status: session.getStatus() });
    return session;
  }

  get(sessionId: string): HarnessSession | undefined {
    this.cleanupExpired();
    return this.sessions.get(sessionId);
  }

  list(): HarnessSessionStatus[] {
    this.cleanupExpired();
    return [...this.sessions.values()].map((session) => session.getStatus());
  }

  async delete(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    this.unsubscriptions.get(sessionId)?.();
    this.unsubscriptions.delete(sessionId);
    await session.close();
    this.notify({ type: "session.deleted", sessionId });
    return true;
  }

  async clear(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) await this.delete(sessionId);
    this.notify({ type: "session.cleared" });
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

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.clear();
    this.listeners.clear();
  }

  private notify(event: HarnessSessionStoreEvent): void {
    for (const listener of this.listeners) void listener(event);
  }

  private cleanupExpired(): void {
    const ttl = this.config.sessionTtlMs;
    if (!ttl || ttl <= 0) return;
    const cutoff = Date.now() - ttl;
    for (const session of [...this.sessions.values()]) {
      if (Date.parse(session.getStatus().lastActiveAt) < cutoff) void this.delete(session.id);
    }
  }
}

export async function createHarnessSessionStore(config: HarnessAppConfig): Promise<HarnessSessionStore> {
  return new HarnessSessionStoreImpl(config);
}
