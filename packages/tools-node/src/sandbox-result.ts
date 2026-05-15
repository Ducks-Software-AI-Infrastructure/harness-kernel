import { createToolErrorPayload } from "@harness-kernel/core";
import type { SandboxExecResult } from "@harness-kernel/core";
import type { AgentToolResult } from "@harness-kernel/core";

const maxFeedbackChars = 12_000;

function truncate(value: string): string {
  if (value.length <= maxFeedbackChars) return value;
  return `${value.slice(0, maxFeedbackChars)}\n[truncated]`;
}

export function sandboxExecFailed(
  toolName: string,
  result?: Partial<SandboxExecResult>,
): AgentToolResult {
  const stdout = result?.stdout ? truncate(result.stdout.trim()) : "";
  const stderr = result?.stderr ? truncate(result.stderr.trim()) : "";
  const content = [
    "Sandbox command failed.",
    stdout ? `STDOUT:\n${stdout}` : "",
    stderr ? `STDERR:\n${stderr}` : "",
    `exitCode=${result?.exitCode ?? "null"}${result?.signal ? ` signal=${result.signal}` : ""}${result?.timedOut ? " timedOut=true" : ""}`,
  ].filter(Boolean).join("\n\n");

  return {
    content,
    data: createToolErrorPayload({
      code: "sandbox.exec.failed",
      message: "Sandbox command failed.",
      toolName,
      metadata: {
        exitCode: result?.exitCode ?? null,
        signal: result?.signal,
        timedOut: Boolean(result?.timedOut),
        durationMs: result?.durationMs,
      },
    }),
    isError: true,
    metadata: {
      errorCode: "sandbox.exec.failed",
      exitCode: result?.exitCode ?? null,
      signal: result?.signal,
      timedOut: Boolean(result?.timedOut),
      durationMs: result?.durationMs,
    },
  };
}

export function sandboxExecThrown(toolName: string, error: unknown): AgentToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...sandboxExecFailed(toolName, {
      stdout: "",
      stderr: message ? `Sandbox exec error: ${message}` : "",
      exitCode: null,
      durationMs: 0,
    }),
    metadata: {
      errorCode: "sandbox.exec.failed",
      thrown: true,
    },
  };
}

export function sandboxResultFailed(result: SandboxExecResult): boolean {
  return result.exitCode !== 0 || Boolean(result.timedOut);
}
