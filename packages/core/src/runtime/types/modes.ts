import type { AgentActionSession, AgentReadSession } from "./sessions.js";
import type { AgentToolSource, ToolApprovalMode } from "./tools.js";
import type { ContextProviderReference } from "./context.js";
import { constructTypeOf } from "./naming.js";

export interface HarnessModeSummary {
  type: string;
  label: string;
}

export abstract class HarnessMode {
  protected declare readonly __harnessModeBrand: true;

  label?: string;
  model?: string;
  prompt?: string | ((session: AgentReadSession) => string | Promise<string>);
  providers?: "all" | ContextProviderReference[];
  excludeProviders?: string[];
  tools?: AgentToolSource[];
  maxTurns?: number;
  toolApproval?: ToolApprovalMode;

  get type(): string {
    return constructTypeOf(this);
  }

  getPrompt?(session: AgentReadSession): string | Promise<string>;
  onEnter?(session: AgentActionSession, input?: unknown): void | Promise<void>;
  onExit?(session: AgentActionSession, nextMode: HarnessModeSummary): void | Promise<void>;
}

export type HarnessModeClass<TMode extends HarnessMode = HarnessMode> = abstract new (...args: any[]) => TMode;
export type HarnessModeSelector<TMode extends HarnessMode = HarnessMode> = TMode | HarnessModeClass<TMode>;
export type AgentModeDefinition = HarnessMode;
