import { HarnessLog } from "./types.js";
import type { SchemaIssue } from "../schema/index.js";

export class SessionCreatedLog extends HarnessLog<{ sessionId?: string }> {
  level = "info" as const;
  category = "session" as const;
  message(): string {
    return "session.created";
  }
}

export class RunStartedLog extends HarnessLog<{ modeId: string; model: string }> {
  level = "info" as const;
  category = "run" as const;
  message(fields: { modeId: string; model: string }): string {
    return `run.started mode=${fields.modeId} model=${fields.model}`;
  }
}

export class RunCompletedLog extends HarnessLog<{ durationMs: number; messageCount: number; eventCount: number }> {
  level = "info" as const;
  category = "run" as const;
  message(fields: { durationMs: number; messageCount: number; eventCount: number }): string {
    return `run.completed durationMs=${fields.durationMs} messages=${fields.messageCount} events=${fields.eventCount}`;
  }
}

export class RunFailedLog extends HarnessLog<{ error: unknown }> {
  level = "error" as const;
  category = "run" as const;
  message(): string {
    return "run.failed";
  }
}

export class TurnStartedLog extends HarnessLog<{ turnId: string }> {
  level = "info" as const;
  category = "turn" as const;
  message(fields: { turnId: string }): string {
    return `turn.started ${fields.turnId}`;
  }
}

export class TurnCompletedLog extends HarnessLog<{ turnId?: string; durationMs?: number }> {
  level = "info" as const;
  category = "turn" as const;
  message(): string {
    return "turn.completed";
  }
}

export class ContextBuildStartedLog extends HarnessLog<{ providerCount: number }> {
  level = "debug" as const;
  category = "context" as const;
  message(fields: { providerCount: number }): string {
    return `context.started providers=${fields.providerCount}`;
  }
}

export class ContextBuildCompletedLog extends HarnessLog<{ providerCount: number; contributionCount: number; durationMs: number }> {
  level = "info" as const;
  category = "context" as const;
  message(fields: { providerCount: number; contributionCount: number; durationMs: number }): string {
    return `context.ready providers=${fields.providerCount} contributions=${fields.contributionCount} durationMs=${fields.durationMs}`;
  }
}

export class ContextProviderFailedLog extends HarnessLog<{ providerType: string; error: unknown }> {
  level = "error" as const;
  category = "context" as const;
  message(fields: { providerType: string; error: unknown }): string {
    return `context.provider.failed ${fields.providerType}`;
  }
}

export class ModelCallStartedLog extends HarnessLog<{ model: string; messageCount: number }> {
  level = "info" as const;
  category = "model" as const;
  message(fields: { model: string; messageCount: number }): string {
    return `model.started model=${fields.model} messages=${fields.messageCount}`;
  }
}

export class ModelCallCompletedLog extends HarnessLog<{ model: string; durationMs: number; finishReason?: string }> {
  level = "info" as const;
  category = "model" as const;
  message(fields: { model: string; durationMs: number; finishReason?: string }): string {
    return `model.completed model=${fields.model} durationMs=${fields.durationMs}${fields.finishReason ? ` finish=${fields.finishReason}` : ""}`;
  }
}

export class ModelCallFailedLog extends HarnessLog<{ model: string; error: unknown }> {
  level = "error" as const;
  category = "model" as const;
  message(fields: { model: string; error: unknown }): string {
    return `model.failed model=${fields.model}`;
  }
}

export class ModelDeltaLog extends HarnessLog<{ length: number; text?: string }> {
  level = "info" as const;
  category = "model" as const;
  message(fields: { length: number; text?: string }): string {
    return `model.delta length=${fields.length}`;
  }
}

export class ToolStartedLog extends HarnessLog<{ toolName: string; args: unknown; risk?: string }> {
  level = "info" as const;
  category = "tool" as const;
  message(fields: { toolName: string; args: unknown; risk?: string }): string {
    return `tool.started ${fields.toolName}`;
  }
}

export class ToolArgsEmptyLog extends HarnessLog<{ toolName: string }> {
  level = "warn" as const;
  category = "tool" as const;
  message(fields: { toolName: string }): string {
    return `tool.args.empty ${fields.toolName}`;
  }
}

export class ToolInvalidSchemaLog extends HarnessLog<{ toolName: string; issues: SchemaIssue[] }> {
  level = "error" as const;
  category = "tool" as const;
  message(fields: { toolName: string; issues: SchemaIssue[] }): string {
    return `tool.args.invalid_schema ${fields.toolName}`;
  }
}

export class ToolCompletedLog extends HarnessLog<{ toolName: string; durationMs: number; isError: boolean; result: unknown }> {
  level = "info" as const;
  category = "tool" as const;
  message(fields: { toolName: string; durationMs: number; isError: boolean; result: unknown }): string {
    return `tool.completed ${fields.toolName} durationMs=${fields.durationMs} isError=${fields.isError}`;
  }
}

export class ToolFailedLog extends HarnessLog<{ toolName: string; durationMs?: number; error?: unknown; result?: unknown }> {
  level = "error" as const;
  category = "tool" as const;
  message(fields: { toolName: string; durationMs?: number; error?: unknown; result?: unknown }): string {
    return `tool.failed ${fields.toolName}`;
  }
}

export class ToolApprovalRequestedLog extends HarnessLog<{ toolName: string; risk?: string; permissions?: unknown }> {
  level = "warn" as const;
  category = "approval" as const;
  message(fields: { toolName: string; risk?: string; permissions?: unknown }): string {
    return `tool.approval.requested ${fields.toolName}`;
  }
}

export class ToolApprovalResolvedLog extends HarnessLog<{ toolName: string; approved: boolean }> {
  level = "info" as const;
  category = "approval" as const;
  levelFor(fields: { toolName: string; approved: boolean }): "info" | "warn" {
    return fields.approved ? "info" : "warn";
  }
  message(fields: { toolName: string; approved: boolean }): string {
    return fields.approved ? `tool.approval.approved ${fields.toolName}` : `tool.approval.denied ${fields.toolName}`;
  }
}

export class ToolApprovalDeniedLog extends HarnessLog<{ toolName: string }> {
  level = "warn" as const;
  category = "approval" as const;
  message(fields: { toolName: string }): string {
    return `tool.approval.denied ${fields.toolName}`;
  }
}

export class SandboxOpenedLog extends HarnessLog<{ sandboxId: string; workDir: string }> {
  level = "info" as const;
  category = "tool" as const;
  message(fields: { sandboxId: string; workDir: string }): string {
    return `sandbox.opened ${fields.sandboxId}`;
  }
}

export class SandboxExecStartedLog extends HarnessLog<{ sandboxId: string; command: unknown; cwd?: string; timeoutMs?: number }> {
  level = "debug" as const;
  category = "tool" as const;
  message(fields: { sandboxId: string; command: unknown; cwd?: string; timeoutMs?: number }): string {
    return `sandbox.exec.started ${fields.sandboxId}`;
  }
}

export class SandboxExecCompletedLog extends HarnessLog<{
  sandboxId: string;
  exitCode: number | null;
  signal?: string;
  timedOut?: boolean;
  durationMs: number;
}> {
  level = "debug" as const;
  category = "tool" as const;
  message(fields: { sandboxId: string; exitCode: number | null; signal?: string; timedOut?: boolean; durationMs: number }): string {
    return `sandbox.exec.completed ${fields.sandboxId} exitCode=${fields.exitCode ?? "null"} durationMs=${fields.durationMs}`;
  }
}

export class SandboxExecFailedLog extends HarnessLog<{ sandboxId: string; error?: unknown; durationMs?: number }> {
  level = "error" as const;
  category = "tool" as const;
  message(fields: { sandboxId: string; error?: unknown; durationMs?: number }): string {
    return `sandbox.exec.failed ${fields.sandboxId}`;
  }
}

export class SandboxClosedLog extends HarnessLog<{ sandboxId: string }> {
  level = "info" as const;
  category = "tool" as const;
  message(fields: { sandboxId: string }): string {
    return `sandbox.closed ${fields.sandboxId}`;
  }
}

export class RunStorageOpenedLog extends HarnessLog<{ storageId: string; runId: string; runDir?: string }> {
  level = "debug" as const;
  category = "storage" as const;
  message(fields: { storageId: string; runId: string; runDir?: string }): string {
    return `storage.opened ${fields.storageId} run=${fields.runId}`;
  }
}

export class SnapshotCreatedLog extends HarnessLog<{ snapshotId?: string; label?: string }> {
  level = "info" as const;
  category = "snapshot" as const;
  message(): string {
    return "snapshot.created";
  }
}

export class SnapshotRestoredLog extends HarnessLog<{ snapshotId?: string; label?: string }> {
  level = "info" as const;
  category = "snapshot" as const;
  message(): string {
    return "snapshot.restored";
  }
}

export class SnapshotRestoreRejectedLog extends HarnessLog<{ snapshotId?: string; reason: string }> {
  level = "warn" as const;
  category = "snapshot" as const;
  message(): string {
    return "snapshot.restore_rejected";
  }
}

export class SnapshotDeletedLog extends HarnessLog<{ snapshotId?: string; label?: string }> {
  level = "info" as const;
  category = "snapshot" as const;
  message(): string {
    return "snapshot.deleted";
  }
}

export class TranscriptCursorChangedLog extends HarnessLog<{ cursorId: string }> {
  level = "debug" as const;
  category = "transcript" as const;
  message(): string {
    return "transcript.cursor_changed";
  }
}

export class StorageWriteFailedLog extends HarnessLog<{ operation: string; error: unknown }> {
  level = "error" as const;
  category = "storage" as const;
  message(fields: { operation: string; error: unknown }): string {
    return `storage.write_failed ${fields.operation}`;
  }
}
