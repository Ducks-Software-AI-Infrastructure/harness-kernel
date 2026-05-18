import type { HarnessLogClass, HarnessLogContext } from "../../logging/index.js";
import type { HarnessSandboxSession } from "../sandbox.js";
import type {
  ContextContributionInput,
  ContextEntry,
  ContextEntryFilter,
  ContextProviderReference,
  ContextRegistrationOptions,
  ContextSnapshot,
} from "./context.js";
import type { HarnessEvent, HarnessEventClass, HarnessEventEmitOptions, HarnessEventQuery, HarnessEventRecord } from "./events.js";
import type { AgentMessage, TranscriptQuery, TranscriptSeekTarget, TranscriptCursor } from "./messages.js";
import type { HarnessModeSelector, HarnessModeSummary } from "./modes.js";
import type { HarnessSnapshotCreator } from "./snapshots.js";
import type { AgentSharedState } from "./shared-state.js";
import type { AgentToolResult, HarnessToolSelector } from "./tools.js";

export interface AgentStateReader<TState extends AgentSharedState = AgentSharedState> {
  get(): TState;
}

export interface AgentStateSession<TState extends AgentSharedState = AgentSharedState>
  extends AgentStateReader<TState> {
  update(patch: Partial<TState>): void;
  set(next: TState): void;
}

export interface AgentHistorySession {
  get(options?: TranscriptQuery): AgentMessage[];
}

export interface AgentEventReader {
  query<TPayload = unknown>(filter?: HarnessEventQuery<TPayload>): HarnessEventRecord<TPayload>[];
}

export interface AgentEventSession extends AgentEventReader {
  emit<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    payload: TPayload,
    options?: HarnessEventEmitOptions,
  ): Promise<TEvent>;
}

export interface AgentModeReader {
  current(): HarnessModeSummary;
}

export interface AgentModeSession extends AgentModeReader {
  switch(mode: HarnessModeSelector, input?: unknown): Promise<void>;
}

export interface AgentToolSession {
  invoke(tool: HarnessToolSelector, args: unknown): Promise<AgentToolResult>;
}

export interface AgentMessageInput {
  content: string;
  metadata?: import("./json.js").JsonObject;
  role?: import("./roles.js").HarnessRoleSelector;
  id?: string;
}

export interface AgentMessageEnqueueOptions {
  metadata?: import("./json.js").JsonObject;
}

export interface AgentMessageSession {
  enqueue(input: string | AgentMessageInput, options?: AgentMessageEnqueueOptions): Promise<void>;
}

export interface HarnessTranscriptSession {
  get(options?: TranscriptQuery): AgentMessage[];
  getCursor(): TranscriptCursor;
  seek(target: TranscriptSeekTarget): Promise<TranscriptCursor>;
  latest(): Promise<TranscriptCursor>;
}

export interface AgentLogSession {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(errorOrMessage: unknown, fields?: Record<string, unknown>): void;
  emit<TFields>(logClass: HarnessLogClass<TFields>, fields: TFields): void;
}

export interface AgentRuntimeLogger {
  readonly modelDeltas: "none" | "summary" | "full";
  emit<TFields>(logClass: HarnessLogClass<TFields>, fields: TFields, context?: HarnessLogContext): void;
  agent(context: HarnessLogContext): AgentLogSession;
}

export interface AgentContextReader {
  get(filter?: ContextEntryFilter): ContextEntry[];
  snapshot(): ContextSnapshot | undefined;
}

export interface AgentContextSession extends AgentContextReader {
  add(input: ContextContributionInput, options?: ContextRegistrationOptions): Promise<ContextEntry>;
  render(binding: ContextProviderReference, options?: ContextRegistrationOptions): Promise<ContextEntry[]>;
  remove(id: string): Promise<boolean>;
  clear(filter?: ContextEntryFilter): Promise<number>;
}

export interface AgentReadSession<
  TState extends AgentSharedState = AgentSharedState,
  TResources extends Record<string, unknown> = Record<string, unknown>,
> {
  runId: string;
  turnId?: string;
  agentKey: string;
  workDir: string;
  outputDir?: string;
  resources: TResources;
  state: AgentStateReader<TState>;
  history: AgentHistorySession;
  events: AgentEventReader;
  mode: AgentModeReader;
  context: AgentContextReader;
  log: AgentLogSession;
}

export interface AgentActionSession<
  TState extends AgentSharedState = AgentSharedState,
  TResources extends Record<string, unknown> = Record<string, unknown>,
> extends AgentReadSession<TState, TResources> {
  sandbox: HarnessSandboxSession;
  state: AgentStateSession<TState>;
  events: AgentEventSession;
  mode: AgentModeSession;
  tools: AgentToolSession;
  context: AgentContextSession;
  messages: AgentMessageSession;
  snapshots: HarnessSnapshotCreator;
  toolCall?: {
    id?: string;
    name: string;
  };
}

export interface RunInfo {
  runId: string;
  agentKey: string;
  workDir: string;
  outputDir?: string;
  started: boolean;
  startedAt?: string;
}

export interface TurnInfo {
  turnId?: string;
  turnCount: number;
  modeId: string;
}
