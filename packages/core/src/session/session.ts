import { getConstructType } from "../runtime/constructs.js";
import { AgentSessionRunner } from "../runtime/runner.js";
import { randomId } from "../runtime/id.js";
import type {
  AgentDefinition,
  AgentSharedState,
  HarnessSnapshotInput,
  HarnessSnapshotSession,
  HarnessTranscriptSession,
  HarnessEvent,
  HarnessEventClass,
  HarnessEventQuery,
  HarnessEventRecord,
  HarnessModeSelector,
  ToolApprovalDecision,
  ToolApprovalRequest,
} from "../runtime/types.js";
import { ApprovalController } from "./approval-controller.js";
import { resolveAgent, resolveStorage } from "./engine.js";
import { SessionEventHub } from "./event-hub.js";
import { createHarnessLogger, type HarnessLogger } from "./logging.js";
import { SessionQueue } from "./queue.js";
import { SessionCreatedLog, SnapshotRestoreRejectedLog } from "../logging/runtime-logs.js";
import { createHarnessRunStream, type HarnessRunStreamController } from "./stream.js";
import { HarnessSessionPhase } from "./types.js";
import { SessionStatusTracker } from "./status.js";
import { normalizeHarnessError, sanitizeHarnessError } from "../runtime/errors.js";
import type {
  HarnessAppConfig,
  HarnessSessionEventListener,
  HarnessRunStream,
  HarnessSession,
  HarnessSessionListener,
  HarnessSessionStatus,
  HarnessStreamEvent,
  HarnessUserInput,
  SendOptions,
  SendResult,
  StreamOptions,
  WaitForEventOptions,
  ToolApprovalHandle,
} from "./types.js";
import type { HarnessSessionSummary } from "../runtime/storage.js";

const defaultApprovalTimeoutMs = 5 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeInput(input: string | HarnessUserInput): HarnessUserInput {
  return typeof input === "string" ? { content: input } : input;
}

export interface CreateHarnessSessionInternalOptions {
  sessionId?: string;
  restoredSession?: HarnessSessionSummary;
}

export class HarnessSessionImpl implements HarnessSession {
  readonly id: string;
  readonly transcript: HarnessTranscriptSession;
  readonly snapshots: HarnessSnapshotSession;

  private readonly runner: AgentSessionRunner;
  private readonly events: SessionEventHub;
  private readonly approvals: ApprovalController;
  private readonly queue = new SessionQueue();
  private readonly status = new SessionStatusTracker();
  private createdAt = nowIso();
  private readonly logger: HarnessLogger;
  private lastActiveAt = this.createdAt;
  private closed = false;
  private activeAbort?: AbortController;
  private lastResult?: SendResult;
  private unsubscribeRunner: () => void;

  constructor(
    private readonly config: HarnessAppConfig,
    input: {
      sessionId?: string;
      agent: AgentDefinition;
      restoredSession?: HarnessSessionSummary;
    },
  ) {
    this.id = input.sessionId ?? randomId();
    this.createdAt = input.restoredSession?.createdAt ?? this.createdAt;
    this.lastActiveAt = input.restoredSession?.lastActiveAt ?? this.createdAt;
    this.events = new SessionEventHub({
      sessionId: this.id,
      hydrateApprovalId: (toolCallId) => this.approvals.hydrateApprovalId(toolCallId),
    });
    this.logger = createHarnessLogger(config.logging);
    this.approvals = new ApprovalController({
      sessionId: this.id,
      getRunId: () => this.runner.runId,
      defaultTimeoutMs: defaultApprovalTimeoutMs,
      notifyRequested: (approval) => this.notify({ type: "tool.approval.requested", approval }),
    });
    const storage = resolveStorage(config.storage);
    this.runner = new AgentSessionRunner({
      sessionId: this.id,
      agent: input.agent,
      providers: config.providers,
      defaultModel: config.defaultModel,
      sandbox: config.sandbox,
      storage,
      initialRunId: input.restoredSession?.latestRunId,
      resources: config.resources,
      approveTool: (request) => this.requestToolApproval(request),
      logger: this.logger,
      errorPolicy: config.errorPolicy,
    });
    this.logger.emit(SessionCreatedLog, { sessionId: this.id }, { sessionId: this.id, source: { kind: "runtime" } });
    this.unsubscribeRunner = this.runner.subscribe((record) => {
      this.status.applyRunnerRecord(record);
      this.applyPendingSendTrigger(record);
      this.events.notifyRunnerRecord(record);
      this.notifyStatus();
    });
    this.transcript = {
      get: (options) => this.runner.getTranscript(options),
      getCursor: () => this.runner.getTranscriptCursor(),
      seek: (target) => this.runner.seekTranscript(target),
      latest: () => this.runner.latestTranscript(),
    };
    this.snapshots = {
      create: (input?: HarnessSnapshotInput) => this.runner.createSnapshot(input, { hiddenTranscript: false }),
      list: () => this.runner.listSnapshots(),
      get: (id: string) => this.runner.getSnapshot(id),
      restore: (id: string) => {
        this.assertSnapshotRestoreAllowed();
        return this.runner.restoreSnapshot(id, { hiddenTranscript: false });
      },
      delete: (id: string) => this.runner.deleteSnapshot(id, { hiddenTranscript: false }),
    };
  }

  async send(input: string | HarnessUserInput, options?: SendOptions): Promise<SendResult> {
    const stream = this.stream(input, options);
    for await (const _event of stream) {
      // Draining the stream preserves the same event path used by streaming callers.
    }
    return stream.result;
  }

  stream(input: string | HarnessUserInput, options: StreamOptions = {}): HarnessRunStream {
    const userInput = normalizeInput(input);
    const externalSignal = options.signal;
    const controller = new AbortController();

    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), { once: true });
    }

    this.status.enqueueSend();
    if (this.status.running) this.queue.addPendingSendTrigger(options.after);
    this.notifyStatus();

    const run = async (streamController: HarnessRunStreamController): Promise<SendResult> => {
      const execute = async (): Promise<SendResult> => {
        if (this.closed) throw new Error(`Harness session '${this.id}' is closed.`);
        const unsubscribe = this.on((event) => streamController.push(event));
        this.status.beginRun();
        this.activeAbort = controller;
        this.lastActiveAt = nowIso();
        this.notifyStatus();
        try {
          const result = await this.runner.run(userInput.content, {
            signal: controller.signal,
            model: options.model,
            userInputId: userInput.id,
            userMetadata: userInput.metadata,
            userRole: userInput.role,
          });
          const sendResult: SendResult = {
            sessionId: this.id,
            runId: result.runId,
            agentKey: result.agentKey,
            answer: result.finalAnswer,
            mode: this.runner.mode,
            outputDir: result.outputDir,
            metrics: result.metrics,
            transcript: result.transcript,
            events: result.events,
          };
          this.lastResult = sendResult;
          this.status.completeRun();
          this.notify({ type: "run.completed", result: sendResult });
          this.notifyStatus();
          await this.logger.flush();
          return sendResult;
        } catch (error) {
          const shaped = sanitizeHarnessError(normalizeHarnessError(error, {
            code: "run.failed",
            category: "run",
            severity: "fatal",
            recoverable: false,
            source: { kind: "runtime" },
          }, this.config.errorPolicy), this.config.errorPolicy);
          this.status.failRun(shaped);
          this.notify({ type: "error", error: shaped });
          this.notifyStatus();
          await this.logger.flush();
          if (this.config.errorPolicy?.closeSessionOnFatal) await this.closeAfterFatal();
          throw error;
        } finally {
          unsubscribe();
          this.status.finishRun();
          if (this.activeAbort === controller) this.activeAbort = undefined;
          this.lastActiveAt = nowIso();
          this.notifyStatus();
        }
      };

      return this.queue.enqueue(execute);
    };

    return createHarnessRunStream(run, async (reason?: string) => {
      controller.abort(reason);
      await this.cancelActiveRun(reason);
    });
  }

  getStatus(): HarnessSessionStatus {
    const runInfo = this.runner.getRunInfo();
    const status = this.status.snapshot();
    return {
      sessionId: this.id,
      agentKey: this.runner.agent.key,
      mode: this.runner.mode,
      model: this.runner.getModel(),
      provider: this.runner.getModelProviderInfo(),
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      running: status.running,
      phase: status.phase,
      queuedInputCount: status.queuedInputCount,
      currentTurnId: status.currentTurnId,
      activeTool: status.activeTool,
      lastEventAt: status.lastEventAt,
      lastError: status.lastError,
      pendingApprovalCount: this.approvals.count,
      runId: runInfo.runId,
      outputDir: this.lastResult?.outputDir ?? runInfo.outputDir,
      metrics: this.lastResult?.metrics ?? this.runner.getMetrics(),
    };
  }

  getMode(): string {
    return this.runner.mode;
  }

  getModel(): string {
    return this.runner.getModel();
  }

  setModel(model: string): void {
    this.runner.setModel(model);
    this.lastActiveAt = nowIso();
    this.notifyStatus();
  }

  clearModelOverride(): void {
    this.runner.clearModelOverride();
    this.lastActiveAt = nowIso();
    this.notifyStatus();
  }

  async switchMode(mode: HarnessModeSelector | string, input?: unknown): Promise<void> {
    await this.runner.switchMode(this.resolveModeSelector(mode), input);
    this.lastActiveAt = nowIso();
  }

  getState(): AgentSharedState {
    return this.runner.getState();
  }

  updateState(patch: unknown): void {
    this.runner.updateState(patch);
    this.lastActiveAt = nowIso();
  }

  replaceState(next: AgentSharedState): void {
    this.runner.replaceState(next);
    this.lastActiveAt = nowIso();
  }

  getEvents(filter?: HarnessEventQuery): HarnessEventRecord[] {
    return this.runner.getEvents(filter);
  }

  getContextSnapshot() {
    return this.runner.getContextSnapshot();
  }

  getAgentManifest() {
    return this.runner.getAgentManifest();
  }

  getPendingApprovals(): ToolApprovalHandle[] {
    return this.approvals.getPending();
  }

  async approveTool(approvalId: string): Promise<void> {
    this.approvals.resolve(approvalId, true);
  }

  async denyTool(approvalId: string, _reason?: string): Promise<void> {
    this.approvals.resolve(approvalId, false);
  }

  on(listener: HarnessSessionListener): () => void {
    return this.events.on(listener);
  }

  onEvent<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    listener: HarnessSessionEventListener<TEvent>,
  ): () => void {
    return this.events.onEvent(eventClass, listener);
  }

  waitForEvent<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    options: WaitForEventOptions = {},
  ): Promise<TEvent> {
    return this.events.waitForEvent(eventClass, options);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.status.close();
    await this.cancelActiveRun("Session closed.");
    this.unsubscribeRunner();
    await this.runner.close();
    this.notifyStatus();
    this.events.clear();
    await this.logger.close();
  }

  async hydrate(): Promise<void> {
    await this.runner.hydrate();
  }

  private notify(event: HarnessStreamEvent): void {
    this.events.notify(event);
  }

  private notifyStatus(): void {
    this.notify({ type: "session.status", status: this.getStatus() });
  }

  private assertSnapshotRestoreAllowed(): void {
    const reject = (reason: string): never => {
      this.logger.emit(
        SnapshotRestoreRejectedLog,
        { reason },
        { sessionId: this.id, runId: this.runner.runId, source: { kind: "runtime" } },
      );
      throw new Error(reason);
    };

    if (this.closed) reject(`Harness session '${this.id}' is closed.`);
    if (this.status.running || this.status.queuedInputCount > 0 || this.approvals.count > 0 || this.status.activeTool) {
      reject("Snapshots can only be restored while the session is idle and has no pending approvals.");
    }
    if (this.status.phase !== HarnessSessionPhase.Idle) {
      reject("Snapshots can only be restored while the session is idle and has no pending approvals.");
    }
  }

  private applyPendingSendTrigger(record: HarnessEventRecord): void {
    if (this.queue.applyPendingSendTrigger(record) === "handoff") {
      this.status.markClosingTurn();
      this.runner.requestTurnHandoff();
    }
  }

  private resolveModeSelector(mode: HarnessModeSelector | string): HarnessModeSelector {
    if (typeof mode !== "string") return mode;
    const resolved = Object.values(this.runner.agent.modes).find((candidate) => getConstructType(candidate) === mode);
    if (!resolved) throw new Error(`Unknown mode '${mode}'.`);
    return resolved;
  }

  private requestToolApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    return this.approvals.request(request);
  }

  private async cancelActiveRun(reason?: string): Promise<void> {
    this.activeAbort?.abort(reason);
    this.approvals.denyAll();
  }

  private async closeAfterFatal(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.status.close();
    this.approvals.denyAll();
    this.unsubscribeRunner();
    await this.runner.close();
    this.notifyStatus();
    this.events.clear();
    await this.logger.close();
  }
}

export async function createHarnessSession(
  config: HarnessAppConfig,
  options: CreateHarnessSessionInternalOptions = {},
): Promise<HarnessSession> {
  const agent = await resolveAgent(config.agent);
  const storage = resolveStorage(config.storage);
  const sessionConfig = { ...config, storage };
  const session = new HarnessSessionImpl(sessionConfig, {
    sessionId: options.sessionId,
    agent,
    restoredSession: options.restoredSession,
  });
  if (!options.restoredSession) {
    const status = session.getStatus();
    await storage.createSession({
      sessionId: status.sessionId,
      agentKey: status.agentKey,
      createdAt: status.createdAt,
      lastActiveAt: status.lastActiveAt,
      mode: status.mode,
    });
  }
  await session.hydrate();
  return session;
}
