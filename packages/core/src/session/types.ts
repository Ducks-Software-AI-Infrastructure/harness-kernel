import type { HarnessModelProvider } from "../engine/types.js";
import type { HarnessLoggingConfig } from "../logging/index.js";
import type {
  AgentDefinition,
  AgentMessage,
  AgentSharedState,
  AgentToolResult,
  ContextSnapshot,
  ModelProviderInfo,
  HarnessAgentManifest,
  HarnessEvent,
  HarnessEventClass,
  HarnessEventQuery,
  HarnessEventRecord,
  HarnessErrorPolicy,
  HarnessErrorShape,
  HarnessSnapshotSession,
  HarnessTranscriptSession,
  HarnessModeSelector,
  HarnessRoleSelector,
  RunMetrics,
  ToolPermission,
  ToolRisk,
} from "../runtime/types.js";
import type { HarnessSandbox, SandboxCloseInput } from "../runtime/sandbox.js";
import type { HarnessSessionStorage, HarnessSessionSummary, SessionListQuery, SessionListResult } from "../runtime/storage.js";

export type HarnessAgentInput = { definition: AgentDefinition };

export type HarnessStorageConfig = HarnessSessionStorage;

export interface HarnessAppConfig {
  agent: HarnessAgentInput;
  providers: HarnessModelProvider[];
  defaultModel: string;
  storage?: HarnessStorageConfig;
  sandbox?: HarnessSandbox;
  resources?: Record<string, unknown>;
  logging?: HarnessLoggingConfig;
  errorPolicy?: HarnessErrorPolicy;
}

export interface HarnessUserInput {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
  role?: HarnessRoleSelector;
}

export interface SendOptions {
  signal?: AbortSignal;
  model?: string;
  after?: HarnessEventClass;
}

export interface StreamOptions extends SendOptions {}

export interface WaitForEventOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SendResult {
  sessionId: string;
  runId: string;
  answer: string;
  agentKey: string;
  mode: string;
  outputDir?: string;
  metrics: RunMetrics;
  transcript: AgentMessage[];
  events: HarnessEventRecord[];
}

export interface ToolApprovalHandle {
  id: string;
  sessionId: string;
  runId: string;
  toolCallId: string;
  name: string;
  args: unknown;
  modeId: string;
  risk?: ToolRisk;
  permissions?: ToolPermission[];
  createdAt: string;
  expiresAt?: string;
  approve(): Promise<void>;
  deny(reason?: string): Promise<void>;
}

export type HarnessStreamEvent =
  | { type: "run.started"; sessionId: string; runId: string; mode: string }
  | { type: "session.status"; status: HarnessSessionStatus }
  | { type: "user.message"; message: AgentMessage }
  | { type: "assistant.delta"; text: string; event: HarnessEventRecord }
  | { type: "assistant.message"; message: AgentMessage }
  | { type: "tool.started"; toolCallId: string; name: string; args: unknown }
  | { type: "tool.approval.requested"; approval: ToolApprovalHandle }
  | { type: "tool.approval.resolved"; approvalId: string; approved: boolean }
  | { type: "tool.ended"; toolCallId: string; name: string; result: AgentToolResult }
  | { type: "mode.changed"; previousMode: string; mode: string }
  | { type: "event"; event: HarnessEventRecord }
  | { type: "run.completed"; result: SendResult }
  | { type: "run.failed"; runId: string; error: HarnessErrorShape; metrics: RunMetrics }
  | { type: "run.aborted"; runId: string; error: HarnessErrorShape; metrics: RunMetrics }
  | { type: "error"; error: HarnessErrorShape };

export interface HarnessRunStream extends AsyncIterable<HarnessStreamEvent> {
  readonly id: string;
  readonly result: Promise<SendResult>;
  cancel(reason?: string): Promise<void>;
}

export type HarnessSessionListener = (event: HarnessStreamEvent) => void | Promise<void>;
export type HarnessSessionEventListener<TEvent extends HarnessEvent = HarnessEvent> = (event: TEvent) => void | Promise<void>;

export enum HarnessSessionPhase {
  Idle = "idle",
  Queued = "queued",
  Starting = "starting",
  BuildingContext = "building_context",
  WaitingModel = "waiting_model",
  RunningTool = "running_tool",
  WaitingApproval = "waiting_approval",
  ClosingTurn = "closing_turn",
  Completed = "completed",
  Error = "error",
  Closed = "closed",
}

export interface HarnessSessionStatus {
  sessionId: string;
  agentKey: string;
  mode: string;
  model: string;
  provider: ModelProviderInfo | undefined;
  createdAt: string;
  lastActiveAt: string;
  running: boolean;
  phase: HarnessSessionPhase;
  queuedInputCount: number;
  currentTurnId?: string;
  activeTool?: { id: string; name: string };
  lastEventAt?: string;
  lastError?: HarnessErrorShape;
  pendingApprovalCount: number;
  runId?: string;
  outputDir?: string;
  metrics?: RunMetrics;
}

export interface HarnessSession {
  readonly id: string;

  send(input: string | HarnessUserInput, options?: SendOptions): Promise<SendResult>;
  stream(input: string | HarnessUserInput, options?: StreamOptions): HarnessRunStream;

  getStatus(): HarnessSessionStatus;
  getModel(): string;
  setModel(model: string): void;
  clearModelOverride(): void;
  getMode(): string;
  switchMode(mode: HarnessModeSelector | string, input?: unknown): Promise<void>;

  getState(): AgentSharedState;
  updateState(patch: unknown): void;
  replaceState(next: AgentSharedState): void;

  transcript: HarnessTranscriptSession;
  snapshots: HarnessSnapshotSession;
  getEvents(filter?: HarnessEventQuery): HarnessEventRecord[];
  getContextSnapshot(): ContextSnapshot | undefined;
  getAgentManifest(): HarnessAgentManifest;

  getPendingApprovals(): ToolApprovalHandle[];
  approveTool(approvalId: string): Promise<void>;
  denyTool(approvalId: string, reason?: string): Promise<void>;

  on(listener: HarnessSessionListener): () => void;
  onEvent<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    listener: HarnessSessionEventListener<TEvent>,
  ): () => void;
  waitForEvent<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    options?: WaitForEventOptions,
  ): Promise<TEvent>;
  close(input?: SandboxCloseInput): Promise<void>;
}

export type HarnessSessionStoreEvent =
  | { type: "session.created"; sessionId: string; status: HarnessSessionStatus }
  | { type: "session.deleted"; sessionId: string }
  | { type: "session.cleared" }
  | { type: "session.event"; sessionId: string; event: HarnessStreamEvent };

export type HarnessSessionStoreListener = (event: HarnessSessionStoreEvent) => void | Promise<void>;

export interface HarnessSessionStore {
  getOrCreate(sessionId?: string, overrides?: Partial<HarnessAppConfig>): Promise<HarnessSession>;
  get(sessionId: string): HarnessSession | undefined;
  list(query?: SessionListQuery): Promise<SessionListResult>;
  close(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<boolean>;
  clearActive(): Promise<void>;
  closeAll(): Promise<void>;

  send(sessionId: string | undefined, input: string | HarnessUserInput, options?: SendOptions): Promise<SendResult>;
  stream(sessionId: string | undefined, input: string | HarnessUserInput, options?: StreamOptions): Promise<HarnessRunStream>;

  getPendingApprovals(sessionId?: string): ToolApprovalHandle[];
  approveTool(sessionId: string, approvalId: string): Promise<void>;
  denyTool(sessionId: string, approvalId: string, reason?: string): Promise<void>;
  getAgentManifest(sessionId: string): HarnessAgentManifest | undefined;

  on(listener: HarnessSessionStoreListener): () => void;
  close(): Promise<void>;
}

export type {
  HarnessErrorPolicy,
  HarnessErrorShape,
  HarnessSessionSummary,
  SessionListQuery,
  SessionListResult,
};
