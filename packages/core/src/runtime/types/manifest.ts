import type { ContextProviderSummary } from "./context.js";
import type { HarnessEventSummary } from "./events-summary.js";
import type { HarnessHookSummary } from "./hooks.js";
import type { HarnessModeSummary } from "./modes.js";
import type { HarnessRoleSummary } from "./roles.js";
import type { ToolCatalogEntry } from "./tools.js";

export interface HarnessAgentManifest {
  key: string;
  label: string;
  initialMode: string;
  currentMode?: string;
  modes: HarnessModeSummary[];
  roles: HarnessRoleSummary[];
  hooks: HarnessHookSummary[];
  contextProviders: ContextProviderSummary[];
  tools: ToolCatalogEntry[];
  events: HarnessEventSummary[];
}
