import type { JsonObject } from "./json.js";

export type AgentSharedState = JsonObject;

export interface AgentSharedStateDefinition {
  initial?: AgentSharedState | (() => AgentSharedState);
}
