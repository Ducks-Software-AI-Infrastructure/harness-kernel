import type { AgentReadSession } from "./sessions.js";
import type { AgentMessage } from "./messages.js";
import type { HarnessEventClass } from "./events.js";
import type { HarnessRoleSelector } from "./roles.js";
import type { JsonObject } from "./json.js";
import { constructTypeOf } from "./naming.js";

export type HarnessContextProviderClass<
  TProvider extends HarnessContextProvider = HarnessContextProvider,
> = abstract new (...args: any[]) => TProvider;

export type HarnessContextProviderSelector<TOptions extends JsonObject = JsonObject> =
  | HarnessContextProvider<TOptions>
  | HarnessContextProviderClass<HarnessContextProvider<TOptions>>;

export interface ContextProviderBinding<TOptions extends JsonObject = JsonObject> {
  provider: HarnessContextProviderSelector<TOptions>;
  options?: TOptions;
}

export type ContextProviderReference<TOptions extends JsonObject = JsonObject> =
  | HarnessContextProviderSelector<TOptions>
  | ContextProviderBinding<TOptions>;

export interface ContextProviderSummary {
  type: string;
  label?: string;
  options?: JsonObject;
}

export interface ContextContribution {
  providerId?: string;
  providerLabel?: string;
  role: string;
  authorRole?: string;
  roleType?: string;
  content: unknown;
  metadata?: JsonObject;
}

export enum ContextScopes {
  Turn = "turn",
  Run = "run",
  Session = "session",
}

export enum ContextConsume {
  Once = "once",
  WhileActive = "while_active",
}

export interface ContextRegistrationOptions {
  scope?: ContextScopes;
  on?: HarnessEventClass;
  consume?: ContextConsume;
  id?: string;
  replace?: boolean;
  metadata?: JsonObject;
}

export interface ContextEntry {
  id: string;
  scope: ContextScopes;
  on: string;
  consume: ContextConsume;
  createdAt: string;
  activatedAt?: string;
  activatedByEventId?: string;
  activatedByEventType?: string;
  runId: string;
  turnId?: string;
  modeId: string;
  contribution: ContextContribution;
  metadata?: JsonObject;
}

export interface ContextEntryFilter {
  id?: string;
  scope?: ContextScopes;
  consume?: ContextConsume;
  providerId?: string;
  role?: string;
  on?: HarnessEventClass;
}

export type ContextProviderOutput =
  | string
  | ContextContributionInput
  | Array<string | ContextContributionInput>
  | null
  | undefined;

export interface ContextContributionInput {
  role?: HarnessRoleSelector;
  content: unknown;
  metadata?: JsonObject;
}

export interface ContextProviderRenderResult {
  providerId: string;
  providerLabel?: string;
  binding: ContextProviderSummary;
  contributions: ContextContribution[];
}

export interface ContextSnapshot {
  id: string;
  turnId?: string;
  modeId: string;
  createdAt: string;
  providers: ContextProviderRenderResult[];
  contributions: ContextContribution[];
  systemPrompt: string;
  messages: AgentMessage[];
}

export abstract class HarnessContextProvider<TOptions extends JsonObject = JsonObject> {
  protected declare readonly __harnessContextProviderBrand: true;

  label?: string;
  priority?: number;
  role?: HarnessRoleSelector;

  get type(): string {
    return constructTypeOf(this);
  }

  with(options: TOptions): ContextProviderBinding<TOptions> {
    return { provider: this, options };
  }

  abstract render(session: AgentReadSession, options?: TOptions): ContextProviderOutput | Promise<ContextProviderOutput>;
}

export type AgentContextProvider<TOptions extends JsonObject = JsonObject> = HarnessContextProvider<TOptions>;
