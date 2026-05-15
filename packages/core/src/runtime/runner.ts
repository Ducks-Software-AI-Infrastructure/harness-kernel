import type { HarnessLogClass, HarnessLogContext, HarnessLogSource } from "../logging/index.js";
import {
  HarnessModelProviderRegistry,
  modelProviderId,
  type ResolvedModelProvider,
} from "../engine/types.js";
import {
  ContextBuildCompletedLog,
  ContextBuildStartedLog,
  ContextProviderFailedLog,
  ModelDeltaLog,
  RunCompletedLog,
  RunFailedLog,
  RunStartedLog,
  RunStorageOpenedLog,
  SandboxClosedLog,
  SandboxExecCompletedLog,
  SandboxExecFailedLog,
  SandboxExecStartedLog,
  SandboxOpenedLog,
  SnapshotCreatedLog,
  SnapshotDeletedLog,
  SnapshotRestoreRejectedLog,
  SnapshotRestoredLog,
  StorageWriteFailedLog,
  TranscriptCursorChangedLog,
  TurnCompletedLog,
  TurnStartedLog,
} from "../logging/runtime-logs.js";
import {
  MessageDeltaEvent,
  MessageEndEvent,
  MessageStartEvent,
  ModeChangedEvent,
  ModelBeforeEvent,
  RunEndEvent,
  RunStartEvent,
  SnapshotCreatedEvent,
  SnapshotDeletedEvent,
  SnapshotRestoredEvent,
  TranscriptCursorChangedEvent,
  TurnEndEvent,
  TurnStartEvent,
  runtimeEventClasses,
} from "./events.js";
import {
  assertNoAuthorId,
  contextProviderMatchesSelector,
  contextProviderSummary,
  eventType,
  getConstructLabel,
  getConstructType,
  hookEventClass,
  isContextProviderBinding,
  isContextProviderClass,
  isContextProviderInstance,
  isContextProviderReference,
  isHookInstance,
  isModeInstance,
  isRoleInstance,
  isToolInstance,
  modeMatchesSelector,
  modeSummary,
  toolMatchesSelector,
} from "./constructs.js";
import { ContextRegistry } from "./context-registry.js";
import { NoopSandbox } from "./sandbox.js";
import { SandboxManager } from "./sandbox-manager.js";
import { NoopRunStorage } from "./storage.js";
import { RunStorageCoordinator, type StoredRuntimeState } from "./storage-coordinator.js";
import { EventRecorder } from "./event-recorder.js";
import { TranscriptManager } from "./transcript-manager.js";
import { RoleResolver, type ResolvedRole } from "./role-resolver.js";
import { ToolExecutor } from "./tool-executor.js";
import { SnapshotManager } from "./snapshot-manager.js";
import { ModelPipeline } from "./model-pipeline.js";
import { randomId } from "./id.js";
import { normalizeSchema } from "../schema/index.js";
import type {
  AgentActionSession,
  AgentContextProvider,
  AgentMessageInput,
  AgentDefinition,
  AgentMessage,
  AgentMessageRole,
  AgentReadSession,
  AgentRunResult,
  AgentLogSession,
  AgentRunnerRunOptions,
  AgentSessionRunnerOptions,
  AgentSharedState,
  AgentToolDefinition,
  AgentToolResult,
  AgentToolSource,
  ContextContribution,
  ContextContributionInput,
  ContextEntry,
  ContextEntryFilter,
  ContextProviderBinding,
  ContextProviderOutput,
  ContextProviderReference,
  ContextProviderRenderResult,
  ContextProviderSummary,
  ContextRegistrationOptions,
  ContextSnapshot,
  HarnessEventClass,
  HarnessEventEmitOptions,
  HarnessEventQuery,
  HarnessEventRecord,
  HarnessEventSummary,
  HarnessEventSource,
  HarnessAgentManifest,
  HarnessMode,
  HarnessModeSelector,
  HarnessModeSummary,
  HarnessSnapshot,
  HarnessSnapshotInput,
  HarnessSnapshotSummary,
  HarnessHookSummary,
  HarnessRoleDefinition,
  HarnessRoleSelector,
  HarnessToolSelector,
  JsonObject,
  NormalizedAgentDefinition,
  RunMetrics,
  RunnerEventListener,
  ToolCatalogEntry,
  TranscriptCursor,
  TranscriptQuery,
  TranscriptSeekTarget,
} from "./types.js";
import {
  ContextScopes,
  HarnessEvent,
  RoleTargets,
  assistantRole,
  systemRole,
  toolRole,
  userRole,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface RunnerInput {
  id?: string;
  content: string;
  metadata?: JsonObject;
  role?: HarnessRoleSelector;
  external?: boolean;
}

class TurnHandoffSignal extends Error {
  constructor() {
    super("Turn handoff requested.");
    this.name = "TurnHandoffSignal";
  }
}

function defaultRoles(): HarnessRoleDefinition[] {
  return [systemRole, userRole, assistantRole, toolRole];
}

function emptyMetrics(): RunMetrics {
  return {
    startedAt: nowIso(),
    durationMs: 0,
    turnCount: 0,
    messageCount: 0,
    eventCount: 0,
    toolCallCount: 0,
    tools: {},
    errors: [],
  };
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content, null, 2);
}

function normalizeAgentMessageInput(input: string | AgentMessageInput): AgentMessageInput {
  return typeof input === "string" ? { content: input } : input;
}

const noopAgentLogSession: AgentLogSession = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  emit: () => undefined,
};

function keyFromLabel(label: string): string {
  const key = label
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  return key || "agent";
}

function ensureNoLegacyAgentShape(agent: AgentDefinition): void {
  const candidate = agent as {
    id?: unknown;
    events?: unknown;
    contextProviders?: unknown;
    modes?: unknown;
    initialMode?: unknown;
  };
  if ("id" in candidate) throw new Error("Agent definitions no longer declare id. Use optional key for packaging metadata.");
  if ("events" in candidate) throw new Error("Agent definitions no longer declare events. Emit and query event classes directly.");
  if ("contextProviders" in candidate) {
    throw new Error("Agent definitions no longer declare contextProviders. Attach providers to modes directly.");
  }
  if (!Array.isArray(candidate.modes)) {
    throw new Error("Agent modes must be an array of HarnessMode instances. Object-literal mode maps are not supported.");
  }
  if (typeof candidate.initialMode === "string") {
    throw new Error("Agent initialMode must be a HarnessMode class or instance, not a string id.");
  }
}

function validateMode(mode: unknown): asserts mode is HarnessMode {
  if (!isModeInstance(mode)) throw new Error("Agent modes must extend HarnessMode.");
  assertNoAuthorId(mode, "Mode");
  if ("context" in mode) {
    throw new Error(`Mode '${getConstructType(mode)}' uses context. Declare providers directly on the mode class.`);
  }
  if ("lifecycle" in mode) {
    throw new Error(`Mode '${getConstructType(mode)}' uses lifecycle. Put onEnter/onExit methods directly on the class.`);
  }
  if (mode.prompt === undefined && typeof mode.getPrompt !== "function") {
    throw new Error(`Mode '${getConstructType(mode)}' must define prompt or getPrompt(ctx).`);
  }
}

function validateRoles(roles: HarnessRoleDefinition[] | undefined): HarnessRoleDefinition[] | undefined {
  if (!roles) return undefined;
  for (const role of roles) {
    if (!isRoleInstance(role)) throw new Error("Agent roles must extend HarnessRole.");
    assertNoAuthorId(role, "Role");
  }
  return roles;
}

function validateHooks(hooks: AgentDefinition["hooks"]): AgentDefinition["hooks"] {
  if (!hooks) return undefined;
  for (const hook of hooks) {
    if (!isHookInstance(hook)) throw new Error("Agent hooks must extend HarnessHook.");
    assertNoAuthorId(hook, "Hook");
    if (!hookEventClass(hook)) {
      throw new Error(`Hook '${getConstructType(hook)}' must extend HarnessHook.for(EventClass).`);
    }
  }
  return hooks;
}

function validateDeclaredEvents(events: AgentDefinition["declaredEvents"]): AgentDefinition["declaredEvents"] {
  if (!events) return undefined;
  for (const eventClass of events) eventType(eventClass);
  return events;
}

function resolveInitialModeType(
  selector: HarnessModeSelector,
  modes: Record<string, HarnessMode>,
): string {
  for (const mode of Object.values(modes)) {
    if (modeMatchesSelector(mode, selector)) return getConstructType(mode);
  }
  throw new Error(`Unknown initial mode '${getConstructType(selector)}'.`);
}

function normalizeAgent(definition: AgentDefinition): NormalizedAgentDefinition {
  ensureNoLegacyAgentShape(definition);
  const modes: Record<string, HarnessMode> = {};
  for (const mode of definition.modes) {
    validateMode(mode);
    const type = getConstructType(mode);
    if (modes[type]) throw new Error(`Duplicate mode type '${type}'.`);
    modes[type] = mode;
  }
  const initialMode = resolveInitialModeType(definition.initialMode, modes);
  const key = definition.key ?? keyFromLabel(definition.label);
  return {
    key,
    label: definition.label,
    initialMode,
    modes,
    sharedState: definition.sharedState,
    roles: validateRoles(definition.roles),
    hooks: validateHooks(definition.hooks),
    declaredEvents: validateDeclaredEvents(definition.declaredEvents),
  };
}

export class AgentSessionRunner {
  readonly agent: NormalizedAgentDefinition;
  readonly workDir: string;
  readonly outputDir: string;

  private readonly sessionIdValue: string;
  private readonly storageCoordinator: RunStorageCoordinator;
  private readonly sandboxManager: SandboxManager;
  private runIdValue = randomId();
  private readonly transcriptManager = new TranscriptManager();
  private readonly eventRecorder = new EventRecorder();
  private readonly contextRegistry = new ContextRegistry();
  private readonly snapshotManager: SnapshotManager;
  private readonly toolExecutor: ToolExecutor;
  private readonly modelPipeline: ModelPipeline;
  private readonly services: Record<string, unknown>;
  private readonly roles: HarnessRoleDefinition[];
  private readonly roleResolver: RoleResolver;
  private readonly providerRegistry: HarnessModelProviderRegistry;
  private readonly defaultModel: string;
  private modelOverride: string | undefined;
  private runModelOverride: string | undefined;
  private currentMode: string;
  private state: AgentSharedState;
  private metrics = emptyMetrics();
  private startedAtPerf = 0;
  private started = false;
  private pendingInputs: RunnerInput[] = [];
  private finalAnswer = "";
  private currentTurnId: string | undefined;
  private providerStack: string[] = [];
  private hookDepth = 0;
  private turnHandoffRequested = false;

  constructor(private readonly options: AgentSessionRunnerOptions) {
    this.agent = normalizeAgent(options.agent);
    this.sessionIdValue = options.sessionId ?? randomId();
    this.workDir = options.workDir ?? ".";
    this.outputDir = options.outputDir ?? ".harness-kernel/runs";
    const storage = options.storage ?? new NoopRunStorage();
    const sandbox = options.sandbox ?? new NoopSandbox();
    this.providerRegistry = new HarnessModelProviderRegistry(options.providers);
    this.currentMode = options.initialMode ? this.resolveModeType(options.initialMode) : this.agent.initialMode;
    this.services = options.services ?? {};
    this.roles = validateRoles(options.roles) ?? this.agent.roles ?? defaultRoles();
    const initialProvider = this.resolveModelProvider(options.defaultModel).provider;
    this.roleResolver = new RoleResolver(this.roles, {
      modelProviderId: modelProviderId(initialProvider),
      supportsRole: (roleId) => this.resolveModelProvider(this.getActiveModel()).provider.supportsRole?.(roleId) ?? true,
    });
    this.defaultModel = options.defaultModel;
    this.storageCoordinator = new RunStorageCoordinator({
      storage,
      runId: this.runIdValue,
      sessionId: this.sessionIdValue,
      agentKey: this.agent.key,
      outputDir: this.outputDir,
      logOpened: (fields) => this.log(RunStorageOpenedLog, fields),
      logFailed: (fields) => this.log(StorageWriteFailedLog, fields),
    });
    this.snapshotManager = new SnapshotManager({
      now: () => nowIso(),
      ensureStoreInitialized: () => this.ensureStoreInitialized(),
      readState: () => ({
        agentKey: this.agent.key,
        runId: this.started ? this.runId : undefined,
        turnId: this.currentTurnId,
        modeId: this.currentMode,
        model: this.getActiveModel(),
        transcriptCursor: cloneJSON(this.transcriptManager.activeTranscriptCursor),
        eventCursor: cloneJSON(this.transcriptManager.activeEventCursor),
        state: cloneJSON(this.state),
        contextEntries: cloneJSON(this.contextRegistry.allEntries),
        contextSnapshot: this.contextRegistry.current ? cloneJSON(this.contextRegistry.current) : undefined,
        branches: cloneJSON(this.transcriptManager.allBranches),
      }),
      restoreState: (snapshot) => {
        this.currentMode = snapshot.modeId;
        this.modelOverride = snapshot.model;
        this.state = cloneJSON(snapshot.state);
        this.contextRegistry.restore({
          entries: snapshot.contextEntries,
          snapshot: snapshot.contextSnapshot,
        });
        this.transcriptManager.restoreCursors({
          transcriptCursor: snapshot.transcriptCursor,
          eventCursor: snapshot.eventCursor,
          branches: snapshot.branches,
        });
      },
      persistCursors: () => this.persistCursors(),
      saveSnapshot: (snapshot) => this.storageCoordinator.saveSnapshot(snapshot),
      deleteSnapshot: (id) => this.storageCoordinator.deleteSnapshot(id),
      emitCreated: async (summary, eventOptions) => {
        await this.emitInternal(SnapshotCreatedEvent, { snapshot: summary }, {
          ...eventOptions,
          hiddenTranscript: false,
        });
      },
      emitRestored: async (summary, eventOptions) => {
        await this.emitInternal(SnapshotRestoredEvent, { snapshot: summary }, {
          ...eventOptions,
          hiddenTranscript: false,
        });
      },
      emitDeleted: async (summary, eventOptions) => {
        await this.emitInternal(SnapshotDeletedEvent, { snapshot: summary }, {
          ...eventOptions,
          hiddenTranscript: false,
        });
      },
      logCreated: (summary, eventOptions) => this.log(
        SnapshotCreatedLog,
        { snapshotId: summary.id, label: summary.label },
        eventOptions?.source,
        eventOptions?.correlationId,
        eventOptions?.causationId,
      ),
      logRestored: (summary, eventOptions) => this.log(
        SnapshotRestoredLog,
        { snapshotId: summary.id, label: summary.label },
        eventOptions?.source,
        eventOptions?.correlationId,
        eventOptions?.causationId,
      ),
      logDeleted: (summary, eventOptions) => this.log(
        SnapshotDeletedLog,
        { snapshotId: summary.id, label: summary.label },
        eventOptions?.source,
        eventOptions?.correlationId,
        eventOptions?.causationId,
      ),
      logRestoreRejected: (snapshotId, reason, eventOptions) => this.log(
        SnapshotRestoreRejectedLog,
        { snapshotId, reason },
        eventOptions?.source,
        eventOptions?.correlationId,
        eventOptions?.causationId,
      ),
    });
    this.sandboxManager = new SandboxManager({
      sandbox,
      sessionId: this.sessionIdValue,
      agentKey: this.agent.key,
      workDir: this.workDir,
      services: this.services,
      getRunId: () => this.runId,
      getOutputDir: () => this.storeRunDir(),
      logOpened: (fields) => this.log(SandboxOpenedLog, fields),
      logClosed: (fields) => this.log(SandboxClosedLog, fields),
      logExecStarted: (fields) => this.log(SandboxExecStartedLog, fields),
      logExecCompleted: (fields) => this.log(SandboxExecCompletedLog, fields),
      logExecFailed: (fields) => this.log(SandboxExecFailedLog, fields),
    });
    this.toolExecutor = new ToolExecutor({
      getMetrics: () => this.metrics,
      getCurrentMode: () => this.currentMode,
      getToolApprovalMode: () => this.options.toolApproval ?? this.getModeDefinition(this.currentMode).toolApproval,
      approveTool: this.options.approveTool,
      ensureSandboxOpen: () => this.ensureSandboxOpen(),
      buildActionSession: (tool, source, correlationId, causationId) =>
        this.buildActionSession(tool, source, correlationId, causationId),
      addToolCallMessage: (tool, args, toolCallId, source) =>
        this.addToolCallMessage(tool, args, toolCallId, source),
      addToolResultMessage: (tool, result, toolCallId) =>
        this.addToolResultMessage(tool, result, toolCallId),
      emitInternal: (eventClass, payload, options) => this.emitInternal(eventClass, payload, options),
      log: (logClass, fields, source, correlationId, causationId, overrides) =>
        this.log(logClass, fields, source, correlationId, causationId, overrides),
      throwIfTurnHandoffRequested: () => this.throwIfTurnHandoffRequested(),
    });
    this.modelPipeline = new ModelPipeline({
      resolveModelProvider: (model) => this.resolveModelProvider(model),
      roles: this.roles,
      getRunId: () => this.runId,
      getTurnId: () => this.currentTurnId,
      getModeId: () => this.currentMode,
      getModel: () => this.getActiveModel(),
      getMetrics: () => this.metrics,
      setFinalAnswer: (answer) => {
        this.finalAnswer = answer;
      },
      buildReadSession: (source) => this.buildReadSession(source),
      buildContextSnapshot: (trigger) => this.buildContextSnapshot(trigger),
      assertModelProviderSupportsMessages: (messages) => this.assertModelProviderSupportsMessages(messages),
      addAssistantMessage: (content, metadata) => this.addMessage("assistant", content, metadata),
      markMessageEventCursor: (messageId) => this.markMessageEventCursor(messageId),
      executeTool: (tool, args, callId, source) => this.executeTool(tool, args, callId, source),
      emitInternal: (eventClass, payload, eventOptions) => this.emitInternal(eventClass, payload, eventOptions),
      emit: (eventClass, payload, eventOptions) => this.emit(eventClass, payload, eventOptions),
      withEmitDefaults: (source, correlationId, causationId, eventOptions) =>
        this.withEmitDefaults(source, correlationId, causationId, eventOptions),
      log: (logClass, fields, source, correlationId, causationId, overrides) =>
        this.log(logClass, fields, source, correlationId, causationId, overrides),
      throwIfTurnHandoffRequested: () => this.throwIfTurnHandoffRequested(),
      isTurnHandoffSignal: (error) => error instanceof TurnHandoffSignal,
    });
    this.state = this.createInitialState(this.agent);
    for (const eventClass of runtimeEventClasses) eventType(eventClass);
  }

  private logSource(source?: HarnessEventSource): HarnessLogSource {
    if (!source) return { kind: "runtime" };
    return {
      kind: source.kind,
      type: source.id,
      name: source.name,
      label: source.name,
    };
  }

  private logContext(
    source?: HarnessEventSource,
    correlationId?: string,
    causationId?: string,
    overrides: Partial<HarnessLogContext> = {},
  ): HarnessLogContext {
    return {
      sessionId: this.sessionIdValue,
      runId: this.runId,
      turnId: this.currentTurnId,
      modeId: this.currentMode,
      branchId: this.transcriptManager.activeTranscriptCursor.branchId,
      source: this.logSource(source),
      correlationId,
      causationId,
      ...overrides,
    };
  }

  private log<TFields>(
    logClass: HarnessLogClass<TFields>,
    fields: TFields,
    source?: HarnessEventSource,
    correlationId?: string,
    causationId?: string,
    overrides?: Partial<HarnessLogContext>,
  ): void {
    this.options.logger?.emit(logClass, fields, this.logContext(source, correlationId, causationId, overrides));
  }

  private logModelDelta(payload: unknown, options?: HarnessEventEmitOptions): void {
    const policy = this.options.logger?.modelDeltas ?? "none";
    if (policy === "none") return;
    const text = payload && typeof payload === "object" && "text" in payload
      ? String((payload as { text?: unknown }).text ?? "")
      : "";
    this.log(
      ModelDeltaLog,
      {
        length: text.length,
        ...(policy === "full" ? { text } : {}),
      },
      options?.source ?? this.modelProviderSource(),
      options?.correlationId,
      options?.causationId,
    );
  }

  get mode(): string {
    return this.currentMode;
  }

  get runId(): string {
    return this.runIdValue;
  }

  subscribe(listener: RunnerEventListener): () => void {
    return this.eventRecorder.subscribe(listener);
  }

  requestTurnHandoff(): void {
    this.turnHandoffRequested = true;
  }

  private storeRunDir(): string | undefined {
    return this.storageCoordinator.runDir;
  }

  private async ensureStoreInitialized(): Promise<void> {
    await this.storageCoordinator.ensureInitialized();
    const stored = await this.storageCoordinator.loadRuntimeState();
    if (stored) this.applyStoredRuntimeState(stored);
  }

  private async ensureSandboxOpen(): Promise<void> {
    await this.sandboxManager.ensureOpen();
  }

  private async closeSandbox(): Promise<void> {
    await this.sandboxManager.close();
  }

  private async closeStore(): Promise<void> {
    await this.storageCoordinator.close();
  }

  private applyStoredRuntimeState(stored: StoredRuntimeState): void {
    this.contextRegistry.loadSnapshots(stored.contextSnapshots);

    for (const snapshot of stored.snapshots) {
      this.snapshotManager.load(snapshot);
      this.transcriptManager.addBranches(snapshot.branches);
    }

    this.transcriptManager.loadTranscript(stored.transcript);
    this.metrics.messageCount = this.transcriptManager.count;

    this.eventRecorder.load(stored.events);
    this.metrics.eventCount = this.eventRecorder.count;

    if (stored.cursors) {
      this.transcriptManager.loadCursors({
        ...stored.cursors,
        eventExists: (eventId) => this.eventRecorder.has(eventId),
      });
    }
  }

  private async persistCursors(): Promise<void> {
    await this.ensureStoreInitialized();
    await this.storageCoordinator.saveCursors({
      transcriptCursor: cloneJSON(this.transcriptManager.activeTranscriptCursor),
      eventCursor: cloneJSON(this.transcriptManager.activeEventCursor),
      branches: cloneJSON(this.transcriptManager.allBranches),
    });
  }

  private async beginNewRun(): Promise<void> {
    if (this.started) {
      await this.closeSandbox();
      this.runIdValue = randomId();
      await this.storageCoordinator.beginRun(this.runIdValue);
      this.started = false;
    }
    this.startedAtPerf = 0;
    this.metrics = emptyMetrics();
    this.finalAnswer = "";
    this.turnHandoffRequested = false;
  }

  async run(message: string, options: AgentRunnerRunOptions = {}): Promise<AgentRunResult> {
    if (options.signal?.aborted) throw new Error("Run aborted.");
    await this.beginNewRun();
    this.runModelOverride = undefined;
    this.runModelOverride = this.normalizeModelOverride(options.model);
    let runStarted = false;
    try {
      await this.start();
      runStarted = true;
      this.pendingInputs.push({
        id: options.userInputId,
        content: message,
        metadata: options.userMetadata,
        role: options.userRole,
        external: true,
      });

      const maxRunnerTurns = this.options.maxTurns ?? 5;
      while (this.pendingInputs.length > 0 && this.metrics.turnCount < maxRunnerTurns) {
        if (options.signal?.aborted) throw new Error("Run aborted.");
        const input = this.pendingInputs.shift()!;
        await this.runTurn(input, options);
      }

      const completedAt = nowIso();
      this.metrics.completedAt = completedAt;
      this.metrics.durationMs = Math.round(performance.now() - this.startedAtPerf);
      this.metrics.finalMode = this.currentMode;
      await this.storageCoordinator.saveTranscript(this.transcriptManager.allMessages);
      await this.emitInternal(RunEndEvent, {
        metrics: cloneJSON({ ...this.metrics, eventCount: this.eventRecorder.count + 1 }),
        finalAnswer: this.finalAnswer,
      });
      this.contextRegistry.expireScope(ContextScopes.Run);
      this.metrics.durationMs = Math.round(performance.now() - this.startedAtPerf);
      await this.storageCoordinator.saveMetrics(this.metrics);
      this.log(RunCompletedLog, {
        durationMs: this.metrics.durationMs,
        messageCount: this.metrics.messageCount,
        eventCount: this.metrics.eventCount,
      });

      return {
        runId: this.runId,
        agentKey: this.agent.key,
        finalAnswer: this.finalAnswer,
        transcript: cloneJSON(this.filterTranscript()),
        events: this.queryEvents().map((event) => cloneJSON(event.record)),
        metrics: cloneJSON(this.metrics),
        outputDir: this.storeRunDir(),
      };
    } catch (error) {
      this.log(RunFailedLog, { error });
      throw error;
    } finally {
      if (runStarted) await this.closeSandbox();
      this.runModelOverride = undefined;
    }
  }

  async prompt(message: string, options: AgentRunnerRunOptions = {}): Promise<AgentRunResult> {
    return this.run(message, options);
  }

  async close(): Promise<void> {
    await this.closeSandbox();
    await this.closeStore();
  }

  getTranscript(options?: TranscriptQuery): AgentMessage[] {
    return cloneJSON(this.filterTranscript(options));
  }

  getMetrics(): RunMetrics {
    return cloneJSON({
      ...this.metrics,
      durationMs: this.startedAtPerf > 0 ? Math.round(performance.now() - this.startedAtPerf) : 0,
      finalMode: this.currentMode,
    });
  }

  getRunInfo() {
    return {
      runId: this.runId,
      agentKey: this.agent.key,
      workDir: this.workDir,
      outputDir: this.storeRunDir(),
      started: this.started,
      startedAt: this.metrics.startedAt,
    };
  }

  getModel(): string {
    return this.getActiveModel();
  }

  setModel(model: string): void {
    this.modelOverride = this.normalizeModelOverride(model);
  }

  clearModelOverride(): void {
    this.modelOverride = undefined;
  }

  getModelProviderInfo() {
    const resolved = this.resolveModelProvider(this.getActiveModel());
    return resolved.provider.getInfo?.() ?? {
      id: modelProviderId(resolved.provider),
      provider: resolved.namespace,
    };
  }

  getAvailableModels() {
    return this.providerRegistry.list().flatMap((provider) => {
      const models = provider.getModels?.() ?? [];
      return models.map((model) => ({
        ...model,
        id: model.id.includes("/") ? model.id : `${provider.namespace}/${model.id}`,
        provider: model.provider ?? provider.namespace,
      }));
    });
  }

  getAgentManifest(): HarnessAgentManifest {
    return {
      key: this.agent.key,
      label: this.agent.label,
      initialMode: this.agent.initialMode,
      currentMode: this.currentMode,
      modes: Object.values(this.agent.modes).map((mode) => modeSummary(mode)),
      roles: this.roles.map((role) => this.roleResolver.summary(role)),
      hooks: (this.agent.hooks ?? []).map((hook) => this.hookSummary(hook)),
      contextProviders: this.getContextProviders().map((provider) => contextProviderSummary(provider)),
      tools: this.getAllTools().map((tool) => this.toToolCatalogEntry(tool)),
      events: this.eventSummaries(),
    };
  }

  getEvents(filter?: HarnessEventQuery): HarnessEventRecord[] {
    return this.queryEvents(filter).map((event) => cloneJSON(event.record));
  }

  getTranscriptCursor(): TranscriptCursor {
    return cloneJSON(this.transcriptManager.activeTranscriptCursor);
  }

  async seekTranscript(target: TranscriptSeekTarget): Promise<TranscriptCursor> {
    return this.applyTranscriptSeek(target);
  }

  async latestTranscript(): Promise<TranscriptCursor> {
    return this.applyTranscriptSeek("latest");
  }

  getState(): AgentSharedState {
    return cloneJSON(this.state);
  }

  updateState(patch: unknown): void {
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      Object.assign(this.state, patch);
    } else {
      this.state.value = patch;
    }
  }

  replaceState(next: AgentSharedState): void {
    this.state = cloneJSON(next);
  }

  async createSnapshot(
    input?: HarnessSnapshotInput,
    eventOptions?: HarnessEventEmitOptions,
  ): Promise<HarnessSnapshot> {
    return this.snapshotManager.create(input, eventOptions);
  }

  listSnapshots(): HarnessSnapshotSummary[] {
    return this.snapshotManager.list();
  }

  getSnapshot(id: string): HarnessSnapshot | undefined {
    return this.snapshotManager.get(id);
  }

  async restoreSnapshot(id: string, eventOptions?: HarnessEventEmitOptions): Promise<HarnessSnapshot> {
    return this.snapshotManager.restore(id, eventOptions);
  }

  async deleteSnapshot(id: string, eventOptions?: HarnessEventEmitOptions): Promise<boolean> {
    return this.snapshotManager.deletePersisted(id, eventOptions);
  }

  getContextSnapshot(): ContextSnapshot | undefined {
    return this.contextRegistry.current ? cloneJSON(this.contextRegistry.current) : undefined;
  }

  getContextEntries(filter?: ContextEntryFilter): ContextEntry[] {
    return cloneJSON(this.contextRegistry.filter(filter));
  }

  async switchMode(mode: HarnessModeSelector, input?: unknown): Promise<void> {
    const modeId = this.resolveModeType(mode);
    const previousModeId = this.currentMode;
    const previous = this.getModeDefinition(previousModeId);
    if (previousModeId !== modeId) {
      await this.ensureSandboxOpen();
      await previous.onExit?.(
        this.buildActionSession(
          undefined,
          { kind: "mode", id: previousModeId, name: getConstructLabel(previous) },
        ),
        modeSummary(this.getModeDefinition(modeId)),
      );
      this.currentMode = modeId;
      const next = this.getModeDefinition(modeId);
      await next.onEnter?.(
        this.buildActionSession(
          undefined,
          { kind: "mode", id: modeId, name: getConstructLabel(next) },
        ),
        input,
      );
      await this.emitInternal(ModeChangedEvent, {
        previousMode: previousModeId,
        mode: modeId,
        input,
      });
    }
    if (input !== undefined) {
      this.pendingInputs.push({
        content: typeof input === "string" ? input : JSON.stringify(input, null, 2),
        external: false,
      });
    }
  }

  private async start(): Promise<void> {
    if (this.started) return;
    await this.ensureStoreInitialized();
    await this.ensureSandboxOpen();
    this.started = true;
    this.startedAtPerf = performance.now();
    this.log(RunStartedLog, { modeId: this.currentMode, model: this.getActiveModel() });
    await this.emitInternal(RunStartEvent, {
      agentKey: this.agent.key,
      modeId: this.currentMode,
      workDir: this.workDir,
      outputDir: this.storeRunDir(),
    });
  }

  private async runTurn(input: RunnerInput, options: AgentRunnerRunOptions): Promise<void> {
    if (input.external !== false) {
      await this.createSnapshot({
        label: "Before user message",
        metadata: {
          kind: "before_user_message",
          automatic: true,
          userInputId: input.id,
        },
      }, { hiddenTranscript: false });
      this.transcriptManager.ensureBranchForAppend();
    }
    this.metrics.turnCount++;
    this.currentTurnId = randomId();
    const turnStart = performance.now();
    this.log(TurnStartedLog, { turnId: this.currentTurnId });
    await this.emitInternal(TurnStartEvent, { turnId: this.currentTurnId, input: input.content });

    const inputRole = this.resolveRole(input.role ?? userRole);
    await this.emitInternal(MessageStartEvent, { role: inputRole.role });
    const userMessage = await this.addMessage(inputRole.role, input.content, input.metadata, inputRole, input.id);
    await this.emitInternal(MessageEndEvent, { message: userMessage });
    await this.markMessageEventCursor(userMessage.id);

    const mode = this.getModeDefinition(this.currentMode);
    const tools = await this.resolveTools();
    await this.emitInternal(MessageStartEvent, { role: "assistant" });

    try {
      await this.modelPipeline.run({
        mode,
        userMessage,
        tools,
        options,
      });
    } catch (error) {
      if (error instanceof TurnHandoffSignal) return;
      throw error;
    } finally {
      this.log(TurnCompletedLog, {
        turnId: this.currentTurnId,
        durationMs: Math.round(performance.now() - turnStart),
      });
      await this.emitInternal(TurnEndEvent, { turnId: this.currentTurnId, finalAnswer: this.finalAnswer });
      this.contextRegistry.expireScope(ContextScopes.Turn, this.currentTurnId);
      this.currentTurnId = undefined;
    }
  }

  private async addMessage(
    role: AgentMessageRole,
    content: unknown,
    metadata?: Record<string, unknown>,
    roleInfo?: ResolvedRole,
    id?: string,
  ): Promise<AgentMessage> {
    const message = this.transcriptManager.appendMessage({
      id,
      role,
      content,
      modeId: this.currentMode,
      turnId: this.currentTurnId,
      metadata,
      roleInfo,
    });
    this.metrics.messageCount = this.transcriptManager.count;
    await this.storageCoordinator.saveTranscript(this.transcriptManager.allMessages);
    await this.persistCursors();
    return message;
  }

  private async addHiddenEventMessage(record: HarnessEventRecord): Promise<void> {
    this.transcriptManager.appendMessage({
      branchId: record.branchId,
      role: "event",
      content: record,
      createdAt: record.at,
      modeId: record.modeId,
      turnId: record.turnId,
      hidden: true,
      metadata: { eventId: record.id, eventType: record.type },
    });
    this.metrics.messageCount = this.transcriptManager.count;
    await this.storageCoordinator.saveTranscript(this.transcriptManager.allMessages);
    await this.persistCursors();
  }

  private async addToolCallMessage(tool: AgentToolDefinition, args: unknown, toolCallId: string, source: HarnessEventSource): Promise<AgentMessage> {
    return this.addMessage("assistant", [{
      type: "tool-call",
      toolCallId,
      toolName: tool.name,
      input: args,
    }], {
      toolCallId,
      toolName: tool.name,
      source,
    });
  }

  private async addToolResultMessage(tool: AgentToolDefinition, result: AgentToolResult, toolCallId: string): Promise<void> {
    await this.addMessage("tool", [{
      type: "tool-result",
      toolCallId,
      toolName: tool.name,
      output: result.data ?? result.content,
    }], {
      toolCallId,
      toolName: tool.name,
      isError: result.isError,
      ...result.metadata,
    });
  }

  private async markMessageEventCursor(messageId: string): Promise<void> {
    if (!this.transcriptManager.markMessageEventCursor(messageId)) return;
    await this.storageCoordinator.saveTranscript(this.transcriptManager.allMessages);
  }

  private createInitialState(agent: NormalizedAgentDefinition): AgentSharedState {
    const initial = agent.sharedState?.initial;
    if (typeof initial === "function") return cloneJSON(initial());
    if (initial && typeof initial === "object") return cloneJSON(initial);
    return {};
  }

  private getModeDefinition(modeId: string) {
    const mode = this.agent.modes[modeId];
    if (!mode) throw new Error(`Unknown mode '${modeId}' for agent '${this.agent.key}'.`);
    return mode;
  }

  private resolveModeType(selector: HarnessModeSelector): string {
    for (const mode of Object.values(this.agent.modes)) {
      if (modeMatchesSelector(mode, selector)) return getConstructType(mode);
    }
    throw new Error(`Unknown mode '${getConstructType(selector)}' for agent '${this.agent.key}'.`);
  }

  private buildReadSession(
    source: HarnessEventSource = { kind: "runtime" },
    correlationId?: string,
    causationId?: string,
  ): AgentReadSession {
    const log = this.options.logger?.agent(this.logContext(source, correlationId, causationId)) ?? noopAgentLogSession;
    return {
      runId: this.runId,
      turnId: this.currentTurnId,
      agentKey: this.agent.key,
      workDir: this.workDir,
      outputDir: this.storeRunDir(),
      services: this.services,
      state: {
        get: () => cloneJSON(this.state),
      },
      history: {
        get: (options?: TranscriptQuery) => this.getTranscript({ includeHidden: false, ...options }),
      },
      events: {
        query: <TPayload = unknown>(filter?: HarnessEventQuery<TPayload>) =>
          this.queryEvents(filter).map((event) => cloneJSON(event.record)),
      },
      mode: {
        current: () => modeSummary(this.getModeDefinition(this.currentMode)),
      },
      context: {
        get: (filter?: ContextEntryFilter) => this.getContextEntries(filter),
        snapshot: () => this.getContextSnapshot(),
      },
      log,
    };
  }

  private buildActionSession(
    tool?: { id?: string; name: string },
    source: HarnessEventSource = tool ? { kind: "tool", id: tool.id, name: tool.name } : { kind: "runtime" },
    correlationId?: string,
    causationId?: string,
  ): AgentActionSession {
    const readSession = this.buildReadSession(source, correlationId, causationId);
    const sandbox = this.sandboxManager.current;
    if (!sandbox) throw new Error("Sandbox session has not been opened.");
    const applyEmitDefaults = (options?: HarnessEventEmitOptions) =>
      this.withEmitDefaults(source, correlationId, causationId, options);
    return {
      ...readSession,
      sandbox,
      state: {
        get: () => cloneJSON(this.state),
        update: (patch) => this.updateState(patch),
        set: (next) => this.replaceState(next),
      },
      events: {
        ...readSession.events,
        emit: (eventClass, payload, options) =>
          this.emit(eventClass as HarnessEventClass, payload, applyEmitDefaults(options)) as Promise<any>,
      },
      mode: {
        ...readSession.mode,
        switch: async (mode: HarnessModeSelector, input?: unknown) => this.switchMode(mode, input),
      },
      tools: {
        invoke: (tool: HarnessToolSelector, args: unknown) =>
          this.invokeTool(tool, args, source, correlationId, causationId),
      },
      context: {
        ...readSession.context,
        add: (input: ContextContributionInput, options?: ContextRegistrationOptions) =>
          Promise.resolve(this.addDynamicContext(input, options)),
        render: (binding: ContextProviderReference, options?: ContextRegistrationOptions) =>
          this.renderDynamicContext(binding, options),
        remove: (id: string) => Promise.resolve(this.removeDynamicContext(id)),
        clear: (filter?: ContextEntryFilter) => Promise.resolve(this.clearDynamicContext(filter)),
      },
      messages: {
        enqueue: async (input, options) => {
          const message = normalizeAgentMessageInput(input);
          this.pendingInputs.push({
            id: message.id,
            content: message.content,
            metadata: { ...message.metadata, ...options?.metadata },
            role: message.role,
            external: false,
          });
        },
      },
      snapshots: {
        create: (input?: HarnessSnapshotInput) => this.createSnapshot(input, applyEmitDefaults({ hiddenTranscript: false })),
      },
      toolCall: tool,
    };
  }

  private withEmitDefaults(
    source: HarnessEventSource,
    correlationId: string | undefined,
    causationId: string | undefined,
    options?: HarnessEventEmitOptions,
  ): HarnessEventEmitOptions {
    return {
      ...options,
      source: options?.source ?? source,
      correlationId: options?.correlationId ?? correlationId,
      causationId: options?.causationId ?? causationId,
    };
  }

  private throwIfTurnHandoffRequested(): void {
    if (!this.turnHandoffRequested) return;
    this.turnHandoffRequested = false;
    throw new TurnHandoffSignal();
  }

  private normalizeModelOverride(model: string | undefined): string | undefined {
    if (model === undefined) return undefined;
    const next = model.trim();
    if (!next) throw new Error("Model must not be empty.");
    this.resolveModelProvider(next);
    return next;
  }

  private getActiveModel(): string {
    return this.runModelOverride ?? this.modelOverride ?? this.getModeDefinition(this.currentMode).model ?? this.defaultModel;
  }

  private resolveModelProvider(model: string): ResolvedModelProvider {
    return this.providerRegistry.resolve(model);
  }

  private modelProviderSource(): HarnessEventSource {
    const resolved = this.resolveModelProvider(this.getActiveModel());
    const id = modelProviderId(resolved.provider);
    return { kind: "model_provider", id, name: id };
  }

  private filterTranscript(options?: TranscriptQuery): AgentMessage[] {
    return this.transcriptManager.filter(options, this.currentTurnId);
  }

  private getActiveContextProviderBindings(): ContextProviderReference[] {
    const mode = this.getModeDefinition(this.currentMode);
    if (!mode.providers) return [];
    if (mode.providers === "all") {
      return this.getContextProviders()
        .filter((provider) => !mode.excludeProviders?.includes(getConstructType(provider)))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }
    return mode.providers
      .filter((binding) => !mode.excludeProviders?.includes(this.bindingToSummary(binding).type));
  }

  private getContextProviders(): AgentContextProvider[] {
    const providers = new Map<string, AgentContextProvider>();
    for (const mode of Object.values(this.agent.modes)) {
      if (!mode.providers || mode.providers === "all") continue;
      for (const binding of mode.providers) {
        const provider = this.providerFromReference(binding, false).provider;
        providers.set(getConstructType(provider), provider);
      }
    }
    return [...providers.values()];
  }

  private providerFromReference(
    reference: ContextProviderReference,
    allowClassSelector: boolean,
  ): { provider: AgentContextProvider; options?: JsonObject } {
    if (!isContextProviderReference(reference)) {
      throw new Error("Invalid context provider reference. Use a provider instance or provider.with(options).");
    }

    const selector = isContextProviderBinding(reference) ? reference.provider : reference;
    const options = isContextProviderBinding(reference) ? reference.options : undefined;

    if (isContextProviderInstance(selector)) {
      assertNoAuthorId(selector, "Context provider");
      return { provider: selector, options };
    }

    if (isContextProviderClass(selector)) {
      if (!allowClassSelector) {
        throw new Error(
          `Context provider '${getConstructType(selector)}' is a class selector. Register an instance in mode.providers.`,
        );
      }
      const provider = this.getContextProviders().find((candidate) => contextProviderMatchesSelector(candidate, selector));
      if (!provider) throw new Error(`Unknown context provider '${getConstructType(selector)}'.`);
      return { provider, options };
    }

    throw new Error("Invalid context provider reference. Provider ids and strings are not supported.");
  }

  private bindingToSummary(binding: ContextProviderReference): ContextProviderSummary {
    const { provider, options } = this.providerFromReference(binding, true);
    return contextProviderSummary(provider, options);
  }

  private dynamicContextEntriesFor(eventClass: HarnessEventClass): ContextEntry[] {
    return this.contextRegistry.entriesFor(eventClass, this.runId, this.currentTurnId);
  }

  private activateDynamicContextFor(eventClass: HarnessEventClass, record: HarnessEventRecord): void {
    this.contextRegistry.activateFor(eventClass, record, this.runId, this.currentTurnId);
  }

  private consumeDynamicContext(entries: ContextEntry[]): void {
    this.contextRegistry.consume(entries);
  }

  private addDynamicContext(
    input: ContextContributionInput,
    options: ContextRegistrationOptions = {},
    provider?: ContextProviderSummary,
  ): ContextEntry {
    const contribution = this.normalizeContextContribution(
      input,
      {
        providerId: provider?.type,
        providerLabel: provider?.label,
      },
    );
    return this.addDynamicContextContribution(contribution, options);
  }

  private addDynamicContextContribution(
    contribution: ContextContribution,
    options: ContextRegistrationOptions = {},
  ): ContextEntry {
    return this.contextRegistry.addContribution({
      contribution,
      options,
      runId: this.runId,
      turnId: this.currentTurnId,
      modeId: this.currentMode,
    });
  }

  private async renderDynamicContext(
    binding: ContextProviderReference,
    options?: ContextRegistrationOptions,
  ): Promise<ContextEntry[]> {
    const rendered = await this.loadContextProvider(binding);
    return rendered.contributions.map((contribution, index) =>
      this.addDynamicContextContribution(
        contribution,
        {
          ...options,
          id: options?.id && rendered.contributions.length === 1 ? options.id : options?.id ? `${options.id}:${index}` : undefined,
        },
      ));
  }

  private removeDynamicContext(id: string): boolean {
    return this.contextRegistry.remove(id);
  }

  private clearDynamicContext(filter?: ContextEntryFilter): number {
    return this.contextRegistry.clear(filter);
  }

  private async buildContextSnapshot(trigger: HarnessEventClass = ModelBeforeEvent): Promise<ContextSnapshot> {
    const started = performance.now();
    const activeBindings = this.getActiveContextProviderBindings();
    this.log(ContextBuildStartedLog, { providerCount: activeBindings.length }, { kind: "runtime" });
    const providers: ContextProviderRenderResult[] = [];
    for (const binding of activeBindings) {
      providers.push(await this.loadContextProvider(binding));
    }

    const dynamicEntries = this.dynamicContextEntriesFor(trigger);
    const contributions = [
      ...providers.flatMap((provider) => provider.contributions),
      ...dynamicEntries.map((entry) => entry.contribution),
    ];
    const systemContributions = contributions.filter((contribution) => this.resolveRole(contribution.role).target === RoleTargets.System);
    const messageContributions = contributions.filter((contribution) => this.resolveRole(contribution.role).target === RoleTargets.Messages);
    const systemPrompt = this.renderSystemContributions(systemContributions);
    const messages = messageContributions.map((contribution) => this.contributionToMessage(contribution));

    const snapshot: ContextSnapshot = {
      id: randomId(),
      turnId: this.currentTurnId,
      modeId: this.currentMode,
      createdAt: nowIso(),
      providers,
      contributions,
      systemPrompt,
      messages,
    };
    this.contextRegistry.recordSnapshot(snapshot);
    await this.storageCoordinator.saveContextSnapshot(snapshot);
    this.consumeDynamicContext(dynamicEntries);
    this.log(ContextBuildCompletedLog, {
      providerCount: providers.length,
      contributionCount: contributions.length,
      durationMs: Math.round(performance.now() - started),
    }, { kind: "runtime" });
    return snapshot;
  }

  private async loadContextProvider(binding: ContextProviderReference): Promise<ContextProviderRenderResult> {
    const { provider, options } = this.providerFromReference(binding, true);
    const summary = contextProviderSummary(provider, options);
    if (this.providerStack.includes(summary.type)) {
      throw new Error(`Context provider cycle detected: ${[...this.providerStack, summary.type].join(" -> ")}`);
    }

    this.providerStack.push(summary.type);
    try {
      const output = await provider.render(
        this.buildReadSession(
          { kind: "context_provider", id: summary.type, name: summary.label },
          this.currentTurnId,
        ),
        options,
      );
      return {
        providerId: summary.type,
        providerLabel: summary.label,
        binding: summary,
        contributions: this.normalizeContextOutput(provider, output),
      };
    } catch (error) {
      this.log(
        ContextProviderFailedLog,
        { providerType: summary.type, error },
        { kind: "context_provider", id: summary.type, name: summary.label },
        this.currentTurnId,
      );
      throw error;
    } finally {
      this.providerStack.pop();
    }
  }

  private normalizeContextContribution(
    input: string | ContextContributionInput,
    context: {
      providerId?: string;
      providerLabel?: string;
      defaultRole?: HarnessRoleSelector;
    } = {},
  ): ContextContribution {
    if (typeof input === "string") {
      const role = this.resolveRole(context.defaultRole ?? systemRole);
      return {
        providerId: context.providerId,
        providerLabel: context.providerLabel,
        role: role.authorRole,
        authorRole: role.authorRole,
        roleType: role.roleType,
        content: input,
      };
    }

    const role = this.resolveRole(input.role ?? context.defaultRole ?? systemRole);
    return {
      providerId: context.providerId,
      providerLabel: context.providerLabel,
      role: role.authorRole,
      authorRole: role.authorRole,
      roleType: role.roleType,
      content: input.content,
      metadata: input.metadata,
    };
  }

  private normalizeContextOutput(provider: AgentContextProvider, output: ContextProviderOutput): ContextContribution[] {
    const summary = contextProviderSummary(provider);
    if (output == null) return [];
    const entries = Array.isArray(output) ? output : [output];
    return entries
      .map((entry): ContextContribution | undefined => {
        if (typeof entry === "string" && !entry.trim()) return undefined;
        if (
          typeof entry !== "string"
          && (entry.content == null || (typeof entry.content === "string" && !entry.content.trim()))
        ) {
          return undefined;
        }
        return this.normalizeContextContribution(entry, {
          providerId: summary.type,
          providerLabel: summary.label,
          defaultRole: provider.role,
        });
      })
      .filter(Boolean) as ContextContribution[];
  }

  private resolveRole(selector: HarnessRoleSelector | string): ResolvedRole {
    return this.roleResolver.resolve(selector);
  }

  private assertModelProviderSupportsMessages(messages: AgentMessage[]): void {
    this.roleResolver.assertModelProviderSupportsMessages(messages);
  }

  private renderSystemContributions(contributions: ContextContribution[]): string {
    if (!contributions.length) return "";
    const rendered = contributions.map((contribution) => {
      const label = contribution.providerLabel ?? contribution.providerId ?? contribution.role;
      return `## ${label}\n\n${stringifyContent(contribution.content)}`;
    });
    return `# Runtime Context\n\n${rendered.join("\n\n")}`;
  }

  private contributionToMessage(contribution: ContextContribution): AgentMessage {
    const role = this.resolveRole(contribution.role);
    return {
      id: randomId(),
      seq: 0,
      branchId: this.transcriptManager.activeTranscriptCursor.branchId,
      role: role.role,
      authorRole: contribution.authorRole ?? role.authorRole,
      roleType: contribution.roleType ?? role.roleType,
      content: contribution.content,
      createdAt: nowIso(),
      modeId: this.currentMode,
      turnId: this.currentTurnId,
      eventCursor: cloneJSON(this.transcriptManager.activeEventCursor),
      metadata: {
        contextProviderId: contribution.providerId,
        contextRole: contribution.authorRole ?? contribution.role,
        contextRoleType: contribution.roleType,
        ...contribution.metadata,
      },
    };
  }

  private async resolveTools(): Promise<AgentToolDefinition[]> {
    const mode = this.getModeDefinition(this.currentMode);
    const tools: AgentToolDefinition[] = [];
    for (const source of mode.tools ?? []) {
      if (!isToolInstance(source)) throw new Error("Mode tools must extend HarnessTool. Tool factories and object literals are not supported.");
      assertNoAuthorId(source, "Tool");
      tools.push(source);
    }
    const names = new Set<string>();
    for (const tool of tools) {
      if (names.has(tool.name)) throw new Error(`Duplicate toolName '${tool.name}' in mode '${this.currentMode}'.`);
      names.add(tool.name);
    }
    return tools;
  }

  private getAllTools(): AgentToolDefinition[] {
    const tools = new Map<string, AgentToolDefinition>();
    for (const mode of Object.values(this.agent.modes)) {
      for (const source of mode.tools ?? []) {
        if (!isToolInstance(source)) continue;
        tools.set(source.name, source);
      }
    }
    return [...tools.values()];
  }

  private toToolCatalogEntry(tool: AgentToolDefinition): ToolCatalogEntry {
    return {
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
      permissions: tool.permissions,
      requiresApproval: typeof tool.requiresApproval === "boolean" ? tool.requiresApproval : undefined,
    };
  }

  private hookSummary(hook: NonNullable<NormalizedAgentDefinition["hooks"]>[number]): HarnessHookSummary {
    const eventClass = hookEventClass(hook)!;
    const type = eventType(eventClass);
    return {
      type: getConstructType(hook),
      label: getConstructLabel(hook),
      eventType: type,
      eventClassId: type,
    };
  }

  private eventSummaries(): HarnessEventSummary[] {
    const summaries = new Map<string, HarnessEventSummary>();
    const add = (eventClass: HarnessEventClass, builtIn = false) => {
      const type = eventType(eventClass);
      summaries.set(type, {
        type,
        label: getConstructLabel(eventClass),
        className: getConstructType(eventClass),
        builtIn,
      });
    };

    for (const eventClass of runtimeEventClasses) add(eventClass, true);
    for (const hook of this.agent.hooks ?? []) add(hookEventClass(hook)!);
    for (const eventClass of this.agent.declaredEvents ?? []) add(eventClass);
    return [...summaries.values()];
  }

  private async invokeTool(
    selector: HarnessToolSelector,
    args: unknown,
    source: HarnessEventSource = { kind: "runtime" },
    parentCorrelationId?: string,
    parentCausationId?: string,
  ): Promise<AgentToolResult> {
    const tool = (await this.resolveTools()).find((candidate) => toolMatchesSelector(candidate, selector));
    if (!tool) {
      const label = getConstructType(selector);
      throw new Error(`Unknown tool '${label}' in mode '${this.currentMode}'.`);
    }
    return this.executeTool(tool, args, undefined, source, parentCorrelationId, parentCausationId);
  }

  private async executeTool(
    tool: AgentToolDefinition,
    args: unknown,
    callId?: string,
    source: HarnessEventSource = { kind: "runtime" },
    parentCorrelationId?: string,
    parentCausationId?: string,
  ): Promise<AgentToolResult> {
    return this.toolExecutor.execute({
      tool,
      args,
      callId,
      source,
      parentCorrelationId,
      parentCausationId,
    });
  }

  private async applyTranscriptSeek(target: TranscriptSeekTarget): Promise<TranscriptCursor> {
    const previousCursor = cloneJSON(this.transcriptManager.activeTranscriptCursor);
    const resolved = this.transcriptManager.resolveSeekTarget(target);
    this.transcriptManager.applyResolvedSeek(resolved);
    await this.emitInternal(TranscriptCursorChangedEvent, {
      previousCursor,
      cursor: this.transcriptManager.activeTranscriptCursor,
    }, { hiddenTranscript: false });
    this.log(TranscriptCursorChangedLog, { cursorId: this.transcriptManager.activeTranscriptCursor.id });
    this.transcriptManager.applyResolvedSeek(resolved);
    await this.persistCursors();
    return cloneJSON(this.transcriptManager.activeTranscriptCursor);
  }

  private async emitInternal(
    eventClass: HarnessEventClass,
    payload: unknown,
    options?: HarnessEventEmitOptions,
  ): Promise<HarnessEvent> {
    return this.recordHarnessEvent(eventClass, payload, {
      source: { kind: "runtime" },
      ...options,
    });
  }

  private async emit(
    eventClass: HarnessEventClass,
    payload: unknown,
    options?: HarnessEventEmitOptions,
  ): Promise<HarnessEvent> {
    return this.recordHarnessEvent(eventClass, payload, options);
  }

  private async recordHarnessEvent(
    eventClass: HarnessEventClass,
    payload: unknown,
    options?: HarnessEventEmitOptions,
  ): Promise<HarnessEvent> {
    const type = eventType(eventClass);
    const parsedPayload = normalizeSchema(eventClass.schema).parse(payload);
    if (type === MessageDeltaEvent.type) this.logModelDelta(parsedPayload, options);
    this.transcriptManager.ensureBranchForEventAppend(
      this.eventRecorder.latestForBranch(this.transcriptManager.activeEventCursor.branchId),
    );
    const branchId = this.transcriptManager.activeTranscriptCursor.branchId;
    const event = this.eventRecorder.record({
      eventClass,
      branchId,
      type,
      source: options?.source ?? { kind: "custom" },
      payload: parsedPayload,
      runId: this.runId,
      turnId: this.currentTurnId,
      modeId: this.currentMode,
      correlationId: options?.correlationId,
      causationId: options?.causationId,
      metadata: options?.metadata,
    });
    const record = event.record;
    this.transcriptManager.advanceEventCursor(record);
    this.metrics.eventCount = this.eventRecorder.count;
    await this.ensureStoreInitialized();
    await this.storageCoordinator.recordEvent(record);
    await this.persistCursors();
    this.activateDynamicContextFor(eventClass, record);
    if (options?.hiddenTranscript !== false) await this.addHiddenEventMessage(record);
    await this.eventRecorder.notify(record);
    if (!options?.skipHooks) await this.dispatchHooks(event);
    return event;
  }

  private queryEvents<TPayload = unknown>(filter?: HarnessEventQuery<TPayload>): HarnessEvent<TPayload>[] {
    return this.eventRecorder.query(filter, this.transcriptManager.activeEventSegments());
  }

  private async dispatchHooks(event: HarnessEvent): Promise<void> {
    if (this.hookDepth > 25) throw new Error("Hook dispatch depth exceeded.");
    const hooks = (this.agent.hooks ?? []).filter((hook) => {
      const eventClass = hookEventClass(hook);
      return eventClass ? eventType(eventClass) === event.type : false;
    });
    if (!hooks.length) return;

    await this.ensureSandboxOpen();
    this.hookDepth++;
    try {
      for (const hook of hooks) {
        await hook.onActive(
          this.buildActionSession(
            undefined,
            { kind: "hook", id: getConstructType(hook), name: getConstructLabel(hook) },
            event.record.correlationId,
            event.id,
          ),
          event,
        );
      }
    } finally {
      this.hookDepth--;
    }
  }
}
