import type { AgentActionSession } from "./sessions.js";
import type { JsonObject } from "./json.js";
import { constructTypeOf } from "./naming.js";

export type ToolApprovalMode = "auto" | "ask" | "deny" | "tool-default";
export type ToolApprovalDecision = "approved" | "denied";
export type ToolRisk = "safe" | "read" | "write" | "execute" | "network" | "destructive";

export interface ToolPermission {
  kind: "filesystem" | "shell" | "network" | "custom";
  access?: "read" | "write" | "execute";
  path?: string;
  description?: string;
}

export type ToolRef =
  | { kind: "file"; path: string; role?: "created" | "modified" | "read" | "evidence" }
  | { kind: "url"; url: string; role?: string }
  | { kind: "command"; command: string; exitCode?: number; role?: string }
  | { kind: "tool_call"; toolName: string; callId?: string; role?: string }
  | { kind: "session"; sessionId: string; role?: string }
  | { kind: "external"; label: string; uri?: string; role?: string };

export interface ToolCatalogEntry {
  name: string;
  description: string;
  risk?: ToolRisk;
  permissions?: ToolPermission[];
  requiresApproval?: boolean;
}

export type ToolApprovalResolver = (
  args: unknown,
  session: AgentActionSession,
) => boolean | Promise<boolean>;

export interface AgentToolResult<TData = unknown> {
  content: string;
  data?: TData;
  refs?: ToolRef[];
  metadata?: JsonObject;
  isError?: boolean;
}

export abstract class HarnessTool<TInput = unknown, TData = unknown> {
  protected declare readonly __harnessToolBrand: true;

  label?: string;
  abstract name: string;
  abstract description: string;
  schema?: unknown;
  risk?: ToolRisk;
  permissions?: ToolPermission[];
  requiresApproval?: boolean | ToolApprovalResolver;

  get type(): string {
    return constructTypeOf(this);
  }

  get inputSchema(): unknown {
    return this.schema;
  }

  abstract execute(args: TInput, session: AgentActionSession): AgentToolResult<TData> | Promise<AgentToolResult<TData>>;
}

export type HarnessToolClass<TTool extends HarnessTool = HarnessTool> = abstract new (...args: any[]) => TTool;
export type HarnessToolSelector<TTool extends HarnessTool = HarnessTool> = TTool | HarnessToolClass<TTool>;
export type AgentToolDefinition<TInput = unknown, TData = unknown> = HarnessTool<TInput, TData>;
export type AgentToolSource = HarnessTool;

export interface ToolApprovalRequest {
  id: string;
  name: string;
  args: unknown;
  modeId: string;
  risk?: ToolRisk;
  permissions?: ToolPermission[];
}
