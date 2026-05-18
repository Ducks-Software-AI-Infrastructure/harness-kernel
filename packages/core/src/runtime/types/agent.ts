import type { HarnessModelProvider } from "../../engine/types.js";
import type { HarnessSandbox } from "../sandbox.js";
import type { HarnessRunStorage, HarnessSessionStorage } from "../storage.js";
import type { HarnessAgentManifest } from "./manifest.js";
import type { AgentMessage } from "./messages.js";
import type { RunMetrics } from "./metrics.js";
import type { HarnessEventClass, HarnessEventRecord } from "./events.js";
import type { HarnessHook } from "./hooks.js";
import type { JsonObject } from "./json.js";
import type { HarnessMode, HarnessModeSelector } from "./modes.js";
import type { HarnessRoleDefinition, HarnessRoleSelector } from "./roles.js";
import type { AgentRuntimeLogger } from "./sessions.js";
import type { AgentSharedStateDefinition } from "./shared-state.js";
import type { ToolApprovalDecision, ToolApprovalRequest } from "./tools.js";

export interface AgentDefinition {
  key?: string;
  label: string;
  initialMode: HarnessModeSelector;
  modes: HarnessMode[];
  sharedState?: AgentSharedStateDefinition;
  roles?: HarnessRoleDefinition[];
  hooks?: HarnessHook[];
  declaredEvents?: HarnessEventClass[];
}

export interface NormalizedAgentDefinition {
  key: string;
  label: string;
  initialMode: string;
  modes: Record<string, HarnessMode>;
  sharedState?: AgentSharedStateDefinition;
  roles?: HarnessRoleDefinition[];
  hooks?: HarnessHook[];
  declaredEvents?: HarnessEventClass[];
}

export interface ModelProviderInfo {
  id: string;
  label?: string;
  provider?: string;
  metadata?: JsonObject;
}

export interface ModelInfo {
  id: string;
  label?: string;
  provider?: string;
  metadata?: JsonObject;
}

export interface AgentRunnerRunOptions {
  signal?: AbortSignal;
  model?: string;
  userInputId?: string;
  userMetadata?: JsonObject;
  userRole?: HarnessRoleSelector;
}

export interface AgentSessionRunnerOptions {
  sessionId?: string;
  agent: AgentDefinition;
  providers: HarnessModelProvider[];
  defaultModel: string;
  sandbox?: HarnessSandbox;
  roles?: HarnessRoleDefinition[];
  workDir?: string;
  outputDir?: string;
  storage?: HarnessSessionStorage | HarnessRunStorage;
  initialRunId?: string;
  resources?: JsonObject;
  approveTool?(request: ToolApprovalRequest): boolean | ToolApprovalDecision | Promise<boolean | ToolApprovalDecision>;
  logger?: AgentRuntimeLogger;
}

export interface AgentRunResult {
  runId: string;
  agentKey: string;
  finalAnswer: string;
  transcript: AgentMessage[];
  events: HarnessEventRecord[];
  metrics: RunMetrics;
  outputDir?: string;
}

export type { HarnessAgentManifest };
