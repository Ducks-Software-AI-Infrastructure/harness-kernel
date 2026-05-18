export interface HarnessSandboxOpenInput {
  sessionId: string;
  runId: string;
  agentKey: string;
  workDir: string;
  outputDir?: string;
  resources: Record<string, unknown>;
}

export interface SandboxExecInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal?: string;
  durationMs: number;
  timedOut?: boolean;
}

export abstract class HarnessSandbox {
  abstract readonly id: string;
  label?: string;

  abstract open(input: HarnessSandboxOpenInput): Promise<HarnessSandboxSession> | HarnessSandboxSession;
}

export abstract class HarnessSandboxSession {
  abstract readonly id: string;
  abstract readonly workDir: string;

  abstract exec(input: SandboxExecInput): Promise<SandboxExecResult>;

  close?(): Promise<void>;
}

export class NoopSandbox extends HarnessSandbox {
  readonly id = "noop";
  label = "Noop";

  open(input: HarnessSandboxOpenInput): HarnessSandboxSession {
    return new NoopSandboxSession(input.workDir);
  }
}

export class NoopSandboxSession extends HarnessSandboxSession {
  readonly id = "noop";

  constructor(readonly workDir: string) {
    super();
  }

  async exec(input: SandboxExecInput): Promise<SandboxExecResult> {
    return {
      stdout: "",
      stderr: `No sandbox is configured; cannot execute: ${input.command}`,
      exitCode: 1,
      durationMs: 0,
    };
  }
}
