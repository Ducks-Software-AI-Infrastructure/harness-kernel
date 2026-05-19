import type { HarnessLogClass, HarnessLogContext } from "../logging/index.js";
import {
  ModelCallCompletedLog,
  ModelCallFailedLog,
  ModelCallStartedLog,
} from "../logging/runtime-logs.js";
import { getConstructLabel, getConstructType } from "./constructs.js";
import { ContextReadyEvent, MessageEndEvent, ModelAfterEvent, ModelBeforeEvent } from "./events.js";
import type {
  AgentMessage,
  AgentReadSession,
  AgentRunnerRunOptions,
  AgentToolResult,
  AgentToolDefinition,
  HarnessErrorPolicy,
  HarnessEvent,
  HarnessEventClass,
  HarnessEventEmitOptions,
  HarnessEventSource,
  HarnessMode,
  ContextSnapshot,
  RunMetrics,
} from "./types.js";
import { modelProviderId, type ModelProviderRunResult, type ResolvedModelProvider } from "../engine/types.js";
import { annotateHarnessError, normalizeHarnessError } from "./errors.js";

function retryDelayMs(attempt: number, backoffMs: number, maxBackoffMs: number): number {
  return Math.min(maxBackoffMs, backoffMs * 2 ** Math.max(0, attempt - 1));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error("Run aborted."));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Run aborted."));
    }, { once: true });
  });
}

export class ModelPipeline {
  constructor(
    private readonly input: {
      resolveModelProvider(model: string): ResolvedModelProvider;
      roles: import("./types.js").HarnessRoleDefinition[];
      getRunId(): string;
      getTurnId(): string | undefined;
      getModeId(): string;
      getModel(): string;
      getMetrics(): RunMetrics;
      setFinalAnswer(answer: string): void;
      buildReadSession(source: HarnessEventSource): AgentReadSession;
      buildContextSnapshot(trigger?: HarnessEventClass): Promise<ContextSnapshot>;
      assertModelProviderSupportsMessages(messages: AgentMessage[]): void;
      addAssistantMessage(content: string, metadata?: Record<string, unknown>): Promise<AgentMessage>;
      markMessageEventCursor(messageId: string): Promise<void>;
      executeTool(
        tool: AgentToolDefinition,
        args: unknown,
        callId: string | undefined,
        source: HarnessEventSource,
      ): Promise<AgentToolResult>;
      emitInternal(eventClass: HarnessEventClass, payload: unknown, options?: HarnessEventEmitOptions): Promise<HarnessEvent>;
      emit(eventClass: HarnessEventClass, payload: unknown, options?: HarnessEventEmitOptions): Promise<HarnessEvent>;
      withEmitDefaults(
        source: HarnessEventSource,
        correlationId?: string,
        causationId?: string,
        options?: HarnessEventEmitOptions,
      ): HarnessEventEmitOptions;
      log<TFields>(
        logClass: HarnessLogClass<TFields>,
        fields: TFields,
        source?: HarnessEventSource,
        correlationId?: string,
        causationId?: string,
        overrides?: Partial<HarnessLogContext>,
      ): void;
      throwIfTurnHandoffRequested(): void;
      isTurnHandoffSignal(error: unknown): boolean;
      errorPolicy?: HarnessErrorPolicy;
    },
  ) {}

  async run(input: {
    mode: HarnessMode;
    userMessage: AgentMessage;
    tools: AgentToolDefinition[];
    options: AgentRunnerRunOptions;
  }): Promise<void> {
    const prepared = await this.prepareContext(input.mode, input.userMessage);
    const systemPrompt = prepared.systemPrompt;
    const messages = prepared.messages;
    const model = this.input.getModel();
    const resolved = this.input.resolveModelProvider(model);
    const source = this.modelProviderSource(resolved);

    const modelStart = performance.now();
    const retry = this.input.errorPolicy?.retry?.model;
    const maxAttempts = Math.max(1, retry?.attempts ?? 1);
    const backoffMs = Math.max(0, retry?.backoffMs ?? 250);
    const maxBackoffMs = Math.max(backoffMs, retry?.maxBackoffMs ?? 5_000);
    let result: ModelProviderRunResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let toolExecuted = false;
      let providerEventEmitted = false;
      this.input.log(ModelCallStartedLog, { model, messageCount: messages.length }, source);
      try {
        result = await resolved.provider.run({
          runId: this.input.getRunId(),
          turnId: this.input.getTurnId(),
          modeId: this.input.getModeId(),
          modelRef: resolved.modelRef,
          provider: resolved.namespace,
          model: resolved.modelId,
          systemPrompt,
          messages,
          roles: this.input.roles,
          tools: input.tools,
          maxTurns: input.mode.maxTurns ?? 20,
          signal: input.options.signal,
          prepareContext: () => this.prepareContext(input.mode, input.userMessage),
          emit: async (eventClass, payload, options) => {
            providerEventEmitted = true;
            const event = await this.input.emit(
              eventClass as HarnessEventClass,
              payload,
              this.input.withEmitDefaults(source, undefined, undefined, options),
            ) as any;
            this.input.throwIfTurnHandoffRequested();
            return event;
          },
          executeTool: async (tool, args, callId) => {
            toolExecuted = true;
            return this.input.executeTool(tool, args, callId, source);
          },
        });
        break;
      } catch (error) {
        if (this.input.isTurnHandoffSignal(error)) return;
        const normalized = normalizeHarnessError(error, {
          category: "model",
          severity: "error",
          recoverable: false,
          source,
        }, this.input.errorPolicy);
        annotateHarnessError(error, normalized);
        this.input.log(ModelCallFailedLog, { model, error: normalized, internalError: error, attempt }, source);

        const canRetry = attempt < maxAttempts
          && normalized.category === "model"
          && !toolExecuted
          && !providerEventEmitted
          && input.options.signal?.aborted !== true;
        if (!canRetry) throw error;
        await delay(retryDelayMs(attempt, backoffMs, maxBackoffMs), input.options.signal);
      }
    }

    if (!result) throw new Error("Model provider did not return a result.");

    const assistantMessage = await this.input.addAssistantMessage(result.content, {
      usage: result.usage,
      finishReason: result.finishReason,
    });
    this.input.setFinalAnswer(result.content);
    this.input.getMetrics().usage = result.usage;
    await this.input.emitInternal(MessageEndEvent, { message: assistantMessage });
    await this.input.markMessageEventCursor(assistantMessage.id);
    this.input.log(ModelCallCompletedLog, {
      model,
      durationMs: Math.round(performance.now() - modelStart),
      finishReason: result.finishReason,
    }, source);
    await this.input.emitInternal(ModelAfterEvent, {
      model,
      content: result.content,
      usage: result.usage,
      finishReason: result.finishReason,
    });
    this.input.throwIfTurnHandoffRequested();
  }

  private modelProviderSource(resolved: ResolvedModelProvider): HarnessEventSource {
    const id = modelProviderId(resolved.provider);
    return { kind: "model_provider", id, name: id };
  }

  private async resolveModePrompt(mode: HarnessMode): Promise<string> {
    const source: HarnessEventSource = { kind: "mode", id: getConstructType(mode), name: getConstructLabel(mode) };
    if (typeof mode.getPrompt === "function") return mode.getPrompt(this.input.buildReadSession(source));
    if (typeof mode.prompt === "function") return mode.prompt(this.input.buildReadSession(source));
    return mode.prompt ?? "";
  }

  private async prepareContext(mode: HarnessMode, userMessage: AgentMessage): Promise<{
    systemPrompt: string;
    messages: AgentMessage[];
    snapshot: ContextSnapshot;
  }> {
    const contextSnapshot = await this.input.buildContextSnapshot(ModelBeforeEvent);
    const prompt = await this.resolveModePrompt(mode);
    const systemPrompt = [contextSnapshot.systemPrompt, prompt].filter(Boolean).join("\n\n---\n\n");
    const messages = [...contextSnapshot.messages, userMessage];
    this.input.assertModelProviderSupportsMessages(messages);

    await this.input.emitInternal(ContextReadyEvent, {
      snapshotId: contextSnapshot.id,
      providerCount: contextSnapshot.providers.length,
      contributionCount: contextSnapshot.contributions.length,
    });
    await this.input.emitInternal(ModelBeforeEvent, { model: this.input.getModel(), messageCount: messages.length });
    this.input.throwIfTurnHandoffRequested();

    return {
      systemPrompt,
      messages,
      snapshot: contextSnapshot,
    };
  }
}
