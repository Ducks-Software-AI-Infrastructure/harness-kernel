import type {
  AgentMessage,
  AgentToolDefinition,
  AgentToolResult,
  ContextSnapshot,
  ModelProviderInfo,
  HarnessEvent,
  HarnessEventClass,
  HarnessEventEmitOptions,
  HarnessRoleDefinition,
  ModelInfo,
} from "../runtime/types.js";

export interface ModelProviderRunInput {
  runId: string;
  turnId?: string;
  modeId: string;
  modelRef: string;
  provider: string;
  model: string;
  systemPrompt: string;
  messages: AgentMessage[];
  roles: HarnessRoleDefinition[];
  tools: AgentToolDefinition[];
  maxTurns: number;
  signal?: AbortSignal;
  emit<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    payload: TPayload,
    options?: HarnessEventEmitOptions,
  ): Promise<TEvent>;
  executeTool(tool: AgentToolDefinition, args: unknown, callId?: string): Promise<AgentToolResult>;
  prepareContext(): Promise<ModelProviderPreparedContext>;
}

export interface ModelProviderPreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  snapshot: ContextSnapshot;
}

export interface ModelProviderRunResult {
  content: string;
  usage?: unknown;
  finishReason?: string;
  raw?: unknown;
}

export interface HarnessModelProvider {
  readonly namespace: string;
  readonly id?: string;
  readonly configSchema?: unknown;
  run(input: ModelProviderRunInput): Promise<ModelProviderRunResult>;
  getInfo?(): ModelProviderInfo;
  getModels?(): ModelInfo[];
  supportsRole?(roleId: string): boolean;
}

export interface ResolvedModelProvider {
  provider: HarnessModelProvider;
  namespace: string;
  modelId: string;
  modelRef: string;
}

export function modelProviderId(provider: HarnessModelProvider): string {
  return provider.id ?? provider.namespace;
}

export function parseModelRef(modelRef: string): { namespace: string; modelId: string } {
  const trimmed = modelRef.trim();
  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new Error(`Model '${modelRef}' must use '<provider>/<model>' format.`);
  }
  return {
    namespace: trimmed.slice(0, separator),
    modelId: trimmed.slice(separator + 1),
  };
}

export class HarnessModelProviderRegistry {
  private readonly providers = new Map<string, HarnessModelProvider>();

  constructor(providers: HarnessModelProvider[]) {
    if (providers.length === 0) throw new Error("At least one model provider is required.");
    for (const provider of providers) this.register(provider);
  }

  register(provider: HarnessModelProvider): void {
    const namespace = provider.namespace.trim();
    if (!namespace) throw new Error("Model provider namespace must not be empty.");
    if (namespace.includes("/")) throw new Error(`Model provider namespace '${namespace}' must not contain '/'.`);
    if (this.providers.has(namespace)) throw new Error(`Duplicate model provider namespace '${namespace}'.`);
    this.providers.set(namespace, provider);
  }

  resolve(modelRef: string): ResolvedModelProvider {
    const parsed = parseModelRef(modelRef);
    const provider = this.providers.get(parsed.namespace);
    if (!provider) throw new Error(`Unknown model provider '${parsed.namespace}'.`);
    const models = provider.getModels?.();
    if (models && models.length > 0 && !models.some((model) => model.id === parsed.modelId || model.id === modelRef)) {
      throw new Error(`Unknown model '${parsed.modelId}' for provider '${parsed.namespace}'.`);
    }
    return {
      provider,
      namespace: parsed.namespace,
      modelId: parsed.modelId,
      modelRef,
    };
  }

  list(): HarnessModelProvider[] {
    return [...this.providers.values()];
  }
}
