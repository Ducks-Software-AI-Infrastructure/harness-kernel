import { summarizeValue } from "../logging/index.js";
import type { HarnessSandbox, SandboxCloseInput, SandboxExecInput, SandboxExecResult } from "./sandbox.js";
import { HarnessSandboxSession } from "./sandbox.js";

export class SandboxManager {
  private session: HarnessSandboxSession | undefined;

  constructor(
    private readonly input: {
      sandbox: HarnessSandbox;
      sessionId: string;
      agentKey: string;
      workDir: string;
      resources: Record<string, unknown>;
      getRunId(): string;
      getOutputDir(): string | undefined;
      logOpened(fields: { sandboxId: string; workDir: string }): void;
      logClosed(fields: { sandboxId: string }): void;
      logExecStarted(fields: {
        sandboxId: string;
        command: unknown;
        cwd?: string;
        timeoutMs?: number;
      }): void;
      logExecCompleted(fields: {
        sandboxId: string;
        exitCode: number | null;
        signal?: string;
        timedOut?: boolean;
        durationMs: number;
      }): void;
      logExecFailed(fields: { sandboxId: string; error: unknown; durationMs: number }): void;
    },
  ) {}

  get current(): HarnessSandboxSession | undefined {
    return this.session;
  }

  async ensureOpen(): Promise<HarnessSandboxSession> {
    if (this.session) return this.session;
    const opened = await this.input.sandbox.open({
      sessionId: this.input.sessionId,
      runId: this.input.getRunId(),
      agentKey: this.input.agentKey,
      workDir: this.input.workDir,
      outputDir: this.input.getOutputDir(),
      resources: this.input.resources,
    });
    this.session = this.wrap(opened);
    this.input.logOpened({ sandboxId: opened.id, workDir: opened.workDir });
    return this.session;
  }

  async close(input: SandboxCloseInput = { reason: "close" }): Promise<void> {
    const sandbox = this.session;
    this.session = undefined;
    if (!sandbox) return;
    await sandbox.close?.(input);
    this.input.logClosed({ sandboxId: sandbox.id });
  }

  private wrap(base: HarnessSandboxSession): HarnessSandboxSession {
    const input = this.input;
    return new class LoggedHarnessSandboxSession extends HarnessSandboxSession {
      readonly id = base.id;
      readonly workDir = base.workDir;

      async exec(commandInput: SandboxExecInput): Promise<SandboxExecResult> {
        const started = performance.now();
        input.logExecStarted({
          sandboxId: base.id,
          command: summarizeValue(commandInput.command),
          cwd: commandInput.cwd,
          timeoutMs: commandInput.timeoutMs,
        });
        try {
          const result = await base.exec(commandInput);
          input.logExecCompleted({
            sandboxId: base.id,
            exitCode: result.exitCode,
            signal: result.signal,
            timedOut: result.timedOut,
            durationMs: result.durationMs,
          });
          return result;
        } catch (error) {
          input.logExecFailed({
            sandboxId: base.id,
            error,
            durationMs: Math.round(performance.now() - started),
          });
          throw error;
        }
      }

      async close(input?: SandboxCloseInput): Promise<void> {
        await base.close?.(input);
      }
    }();
  }
}
