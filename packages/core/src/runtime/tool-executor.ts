import { summarizeValue, type HarnessLogClass, type HarnessLogContext } from "../logging/index.js";
import { createToolErrorPayload, type ToolInvalidField } from "../logging/tool-errors.js";
import { normalizeSchema, type SchemaIssue } from "../schema/index.js";
import {
  ErrorEvent,
  ToolApprovalRequestedEvent,
  ToolApprovalResolvedEvent,
  ToolEndEvent,
  ToolStartEvent,
} from "./events.js";
import {
  ToolApprovalRequestedLog,
  ToolApprovalResolvedLog,
  ToolArgsEmptyLog,
  ToolCompletedLog,
  ToolFailedLog,
  ToolInvalidSchemaLog,
  ToolStartedLog,
} from "../logging/runtime-logs.js";
import type {
  AgentActionSession,
  AgentToolDefinition,
  AgentToolResult,
  HarnessEvent,
  HarnessEventClass,
  HarnessEventEmitOptions,
  HarnessEventSource,
  RunMetrics,
  ToolApprovalDecision,
  ToolApprovalMode,
  ToolApprovalRequest,
  ToolCallMetric,
} from "./types.js";
import { randomId } from "./id.js";

type SchemaParseResult =
  | { ok: true; data: unknown }
  | { ok: false; error: unknown; issues: SchemaIssue[]; invalidFields: ToolInvalidField[] };

function invalidFieldsFromIssues(issues: SchemaIssue[]): ToolInvalidField[] {
  return issues.map((entry) => ({
    path: entry.path,
    message: entry.message,
    code: entry.code,
    expected: entry.expected,
    received: entry.received,
  }));
}

function safeParseWithSchema(schema: unknown, payload: unknown): SchemaParseResult {
  const normalized = normalizeSchema(schema);
  const result = normalized.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  const issues = normalized.issuesFromError(result.error);
  return { ok: false, error: result.error, issues, invalidFields: invalidFieldsFromIssues(issues) };
}

function isEmptyToolArgs(args: unknown): boolean {
  return args == null
    || (typeof args === "object" && !Array.isArray(args) && Object.keys(args as Record<string, unknown>).length === 0);
}

function ensureToolMetric(metrics: RunMetrics, name: string): ToolCallMetric {
  const existing = metrics.tools[name];
  if (existing) return existing;
  const metric = { name, count: 0, errorCount: 0, totalDurationMs: 0 };
  metrics.tools[name] = metric;
  return metric;
}

export class ToolExecutor {
  private depth = 0;

  constructor(
    private readonly input: {
      getMetrics(): RunMetrics;
      getCurrentMode(): string;
      getToolApprovalMode(): ToolApprovalMode | undefined;
      approveTool?(request: ToolApprovalRequest): boolean | ToolApprovalDecision | Promise<boolean | ToolApprovalDecision>;
      ensureSandboxOpen(): Promise<void>;
      buildActionSession(
        tool: { id?: string; name: string },
        source: HarnessEventSource,
        correlationId?: string,
        causationId?: string,
      ): AgentActionSession;
      addToolCallMessage(
        tool: AgentToolDefinition,
        args: unknown,
        toolCallId: string,
        source: HarnessEventSource,
      ): Promise<unknown>;
      addToolResultMessage(tool: AgentToolDefinition, result: AgentToolResult, toolCallId: string): Promise<void>;
      emitInternal(eventClass: HarnessEventClass, payload: unknown, options?: HarnessEventEmitOptions): Promise<HarnessEvent>;
      log<TFields>(
        logClass: HarnessLogClass<TFields>,
        fields: TFields,
        source?: HarnessEventSource,
        correlationId?: string,
        causationId?: string,
        overrides?: Partial<HarnessLogContext>,
      ): void;
      throwIfTurnHandoffRequested(): void;
    },
  ) {}

  async execute(input: {
    tool: AgentToolDefinition;
    args: unknown;
    callId?: string;
    source?: HarnessEventSource;
    parentCorrelationId?: string;
    parentCausationId?: string;
  }): Promise<AgentToolResult> {
    if (this.depth > 8) throw new Error("Tool invocation depth exceeded.");

    const source = input.source ?? { kind: "runtime" };
    const id = input.callId ?? randomId();
    const toolSource: HarnessEventSource = { kind: "tool", id, name: input.tool.name };
    const start = performance.now();
    const metrics = this.input.getMetrics();
    const metric = ensureToolMetric(metrics, input.tool.name);
    metric.count++;
    metrics.toolCallCount++;
    await this.input.addToolCallMessage(input.tool, input.args, id, source);
    this.input.log(
      ToolStartedLog,
      { toolName: input.tool.name, args: summarizeValue(input.args), risk: input.tool.risk },
      toolSource,
      id,
      input.parentCausationId ?? input.parentCorrelationId,
    );
    if (isEmptyToolArgs(input.args)) {
      this.input.log(ToolArgsEmptyLog, { toolName: input.tool.name }, toolSource, id, input.parentCausationId ?? input.parentCorrelationId);
    }
    const startEvent = await this.input.emitInternal(ToolStartEvent, { id, name: input.tool.name, args: input.args }, {
      source,
      correlationId: id,
      causationId: input.parentCausationId ?? input.parentCorrelationId,
    });
    const toolEventOptions: HarnessEventEmitOptions = {
      source: toolSource,
      correlationId: id,
      causationId: startEvent.id,
    };
    const callerEventOptions: HarnessEventEmitOptions = {
      source,
      correlationId: id,
      causationId: startEvent.id,
    };

    const parsedArgs = safeParseWithSchema(input.tool.inputSchema, input.args);
    if (!parsedArgs.ok) {
      const result = this.structuredToolError({
        toolName: input.tool.name,
        code: "tool.args.invalid_schema",
        message: "Tool arguments did not match schema.",
        invalidFields: parsedArgs.invalidFields,
      });
      const durationMs = Math.round(performance.now() - start);
      metric.errorCount++;
      metric.totalDurationMs += durationMs;
      metrics.errors.push(result.content);
      this.input.log(
        ToolInvalidSchemaLog,
        { toolName: input.tool.name, issues: parsedArgs.issues },
        toolSource,
        id,
        startEvent.id,
        { durationMs },
      );
      await this.input.addToolResultMessage(input.tool, result, id);
      await this.input.emitInternal(ToolEndEvent, { id, name: input.tool.name, durationMs, result }, callerEventOptions);
      this.input.throwIfTurnHandoffRequested();
      return result;
    }

    const approved = await this.approveTool(
      { id, name: input.tool.name, args: parsedArgs.data, modeId: this.input.getCurrentMode(), risk: input.tool.risk, permissions: input.tool.permissions },
      input.tool,
      parsedArgs.data,
      callerEventOptions,
    );
    if (!approved) {
      const denied = this.structuredToolError({
        toolName: input.tool.name,
        code: "tool.approval.denied",
        message: `Tool '${input.tool.name}' was denied by runner policy.`,
        metadata: { denied: true },
      });
      metric.errorCount++;
      const durationMs = Math.round(performance.now() - start);
      metric.totalDurationMs += durationMs;
      this.input.log(ToolFailedLog, {
        toolName: input.tool.name,
        durationMs,
        result: summarizeValue(denied),
      }, toolSource, id, startEvent.id, { durationMs });
      await this.input.addToolResultMessage(input.tool, denied, id);
      await this.input.emitInternal(ToolEndEvent, { id, name: input.tool.name, durationMs, result: denied }, callerEventOptions);
      this.input.throwIfTurnHandoffRequested();
      return denied;
    }

    this.depth++;
    try {
      await this.input.ensureSandboxOpen();
      const executed = await input.tool.execute(parsedArgs.data, this.input.buildActionSession({ id, name: input.tool.name }, toolSource, id, startEvent.id));
      const result = this.ensureStructuredToolErrorResult(input.tool, executed);
      const durationMs = Math.round(performance.now() - start);
      metric.totalDurationMs += durationMs;
      if (result.isError) metric.errorCount++;
      if (result.isError) {
        this.input.log(ToolFailedLog, {
          toolName: input.tool.name,
          durationMs,
          result: summarizeValue(result),
        }, toolSource, id, startEvent.id, { durationMs });
      } else {
        this.input.log(ToolCompletedLog, {
          toolName: input.tool.name,
          durationMs,
          isError: false,
          result: summarizeValue(result),
        }, toolSource, id, startEvent.id, { durationMs });
      }
      await this.input.addToolResultMessage(input.tool, result, id);
      await this.input.emitInternal(ToolEndEvent, { id, name: input.tool.name, durationMs, result }, callerEventOptions);
      this.input.throwIfTurnHandoffRequested();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = this.structuredToolError({
        toolName: input.tool.name,
        code: "tool.failed",
        message: "Tool execution failed.",
        metadata: { error: true },
      });
      const durationMs = Math.round(performance.now() - start);
      metric.errorCount++;
      metric.totalDurationMs += durationMs;
      metrics.errors.push(message);
      this.input.log(ToolFailedLog, {
        toolName: input.tool.name,
        durationMs,
        error,
      }, toolSource, id, startEvent.id, { durationMs });
      await this.input.addToolResultMessage(input.tool, result, id);
      await this.input.emitInternal(ErrorEvent, { message, details: error }, toolEventOptions);
      await this.input.emitInternal(ToolEndEvent, { id, name: input.tool.name, durationMs, result }, callerEventOptions);
      this.input.throwIfTurnHandoffRequested();
      return result;
    } finally {
      this.depth--;
    }
  }

  private structuredToolError(input: {
    toolName: string;
    code: "tool.args.invalid_schema" | "tool.approval.denied" | "sandbox.exec.failed" | "tool.failed";
    message: string;
    invalidFields?: ToolInvalidField[];
    metadata?: Record<string, unknown>;
  }): AgentToolResult {
    return {
      content: input.message,
      data: createToolErrorPayload({
        code: input.code,
        message: input.message,
        toolName: input.toolName,
        invalidFields: input.invalidFields,
      }),
      isError: true,
      metadata: {
        errorCode: input.code,
        ...(input.invalidFields ? { invalidFields: input.invalidFields } : {}),
        ...(input.metadata ?? {}),
      },
    };
  }

  private ensureStructuredToolErrorResult(tool: AgentToolDefinition, result: AgentToolResult): AgentToolResult {
    if (!result.isError || result.data !== undefined) return result;
    return {
      ...result,
      data: createToolErrorPayload({
        code: "tool.failed",
        message: result.content || "Tool execution failed.",
        toolName: tool.name,
      }),
      metadata: {
        ...result.metadata,
        errorCode: result.metadata?.errorCode ?? "tool.failed",
      },
    };
  }

  private async approveTool(
    request: ToolApprovalRequest,
    tool: AgentToolDefinition,
    args: unknown,
    eventOptions: HarnessEventEmitOptions,
  ): Promise<boolean> {
    const policy = this.input.getToolApprovalMode() ?? "tool-default";
    if (policy === "auto") return this.recordApprovalResolution(request, "approved", eventOptions);
    if (policy === "deny") return this.recordApprovalResolution(request, "denied", eventOptions);

    const requiresApproval = await this.toolRequiresApproval(tool, args, request.id, eventOptions.causationId);
    if (policy === "tool-default" && !requiresApproval) return true;

    await this.input.emitInternal(
      ToolApprovalRequestedEvent,
      {
        id: request.id,
        name: request.name,
        args: request.args,
        modeId: request.modeId,
        risk: request.risk,
        permissions: request.permissions,
      },
      eventOptions,
    );
    this.input.log(
      ToolApprovalRequestedLog,
      { toolName: request.name, risk: request.risk, permissions: request.permissions },
      eventOptions.source,
      eventOptions.correlationId,
      eventOptions.causationId,
    );

    if (!this.input.approveTool) return this.recordApprovalResolution(request, "denied", eventOptions);
    const decision = await this.input.approveTool(request);
    return this.recordApprovalResolution(request, decision === true || decision === "approved" ? "approved" : "denied", eventOptions);
  }

  private async toolRequiresApproval(
    tool: AgentToolDefinition,
    args: unknown,
    toolCallId: string,
    causationId?: string,
  ): Promise<boolean> {
    if (typeof tool.requiresApproval === "function") {
      await this.input.ensureSandboxOpen();
      return tool.requiresApproval(
        args,
        this.input.buildActionSession(
          { id: toolCallId, name: tool.name },
          { kind: "tool", id: toolCallId, name: tool.name },
          toolCallId,
          causationId,
        ),
      );
    }
    return tool.requiresApproval === true;
  }

  private async recordApprovalResolution(
    request: ToolApprovalRequest,
    decision: ToolApprovalDecision,
    eventOptions: HarnessEventEmitOptions,
  ): Promise<boolean> {
    await this.input.emitInternal(
      ToolApprovalResolvedEvent,
      { id: request.id, name: request.name, args: request.args, decision, modeId: request.modeId },
      eventOptions,
    );
    this.input.log(
      ToolApprovalResolvedLog,
      { toolName: request.name, approved: decision === "approved" },
      eventOptions.source,
      eventOptions.correlationId,
      eventOptions.causationId,
    );
    return decision === "approved";
  }
}
