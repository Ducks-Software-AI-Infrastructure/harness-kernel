import { HarnessTool, s, type InferInput } from "@harness-kernel/core";
import type { AgentActionSession, AgentToolResult } from "@harness-kernel/core";
import { sandboxExecFailed, sandboxExecThrown, sandboxResultFailed } from "./sandbox-result.js";

const bashSchema = s.object({
  command: s.string().min(1),
  timeoutMs: s.number().int().positive().max(120_000).default(30_000),
});
type BashInput = InferInput<typeof bashSchema>;

export class BashTool extends HarnessTool<BashInput> {
  name = "bash";
  description = "Run a shell command with cwd set to the harness workDir.";
  schema = bashSchema;
  risk = "execute" as const;
  requiresApproval = true;
  permissions = [{ kind: "shell" as const, access: "execute" as const, path: "." }];

  async execute(args: BashInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = bashSchema.parse(args);
    try {
      const result = await session.sandbox.exec({
        command: input.command,
        timeoutMs: input.timeoutMs,
      });
      if (sandboxResultFailed(result)) {
        return {
          ...sandboxExecFailed(this.name, result),
          refs: [{ kind: "command", command: input.command, exitCode: result.exitCode ?? undefined, role: result.timedOut ? "timeout" : "execution" }],
        };
      }
      const text = [
        result.stdout.trim() ? `STDOUT:\n${result.stdout.trim()}` : "",
        result.stderr.trim() ? `STDERR:\n${result.stderr.trim()}` : "",
        `exitCode=${result.exitCode ?? "null"}${result.signal ? ` signal=${result.signal}` : ""}`,
      ].filter(Boolean).join("\n\n");
      return {
        content: text,
        refs: [{ kind: "command", command: input.command, exitCode: result.exitCode ?? undefined, role: "execution" }],
        metadata: {
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: Boolean(result.timedOut),
          durationMs: result.durationMs,
        },
      };
    } catch (error) {
      return sandboxExecThrown(this.name, error);
    }
  }
}

export function createBashTool(): BashTool {
  return new BashTool();
}
