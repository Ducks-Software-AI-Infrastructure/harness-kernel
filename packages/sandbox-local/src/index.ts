import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  HarnessSandbox,
  HarnessSandboxSession,
  type HarnessSandboxOpenInput,
  type SandboxExecInput,
  type SandboxExecResult,
} from "@harness-kernel/core";

export interface LocalSandboxOptions {
  workDir?: string;
  env?: "inherit" | "minimal" | Record<string, string>;
  defaultTimeoutMs?: number;
}

function resolveInside(baseDir: string, inputPath: string): string {
  const fullPath = resolve(baseDir, inputPath);
  const rel = relative(baseDir, fullPath);
  if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith(`..${"\\"}`)) {
    throw new Error(`Path escapes sandbox workDir: ${inputPath}`);
  }
  return fullPath;
}

function resolveLocalEnv(
  baseEnv: LocalSandboxOptions["env"],
  inputEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
  const inherited = baseEnv === undefined || baseEnv === "inherit"
    ? process.env
    : baseEnv === "minimal"
      ? { PATH: process.env.PATH ?? "" }
      : baseEnv;
  return {
    ...inherited,
    ...(inputEnv ?? {}),
  };
}

export class LocalSandboxSession extends HarnessSandboxSession {
  readonly id: string;
  readonly workDir: string;
  private readonly env?: LocalSandboxOptions["env"];
  private readonly defaultTimeoutMs?: number;

  constructor(input: {
    id?: string;
    workDir: string;
    env?: LocalSandboxOptions["env"];
    defaultTimeoutMs?: number;
  }) {
    super();
    this.id = input.id ?? randomUUID();
    this.workDir = input.workDir;
    this.env = input.env;
    this.defaultTimeoutMs = input.defaultTimeoutMs;
  }

  async exec(input: SandboxExecInput): Promise<SandboxExecResult> {
    const startedAt = Date.now();
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs ?? 30_000;
    const cwd = input.cwd ? resolveInside(this.workDir, input.cwd) : this.workDir;
    mkdirSync(cwd, { recursive: true });

    return new Promise<SandboxExecResult>((resolveResult, reject) => {
      let settled = false;
      let timedOut = false;
      let stdout = "";
      let stderr = "";

      const child = spawn("bash", ["-lc", input.command], {
        cwd,
        env: resolveLocalEnv(this.env, input.env),
        stdio: ["pipe", "pipe", "pipe"],
      });

      const settle = (value: SandboxExecResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveResult(value);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode, signal) => {
        settle({
          stdout,
          stderr,
          exitCode,
          signal: signal ?? undefined,
          timedOut,
          durationMs: Date.now() - startedAt,
        });
      });

      if (input.stdin !== undefined) child.stdin.write(input.stdin);
      child.stdin.end();
    });
  }
}

export class LocalSandbox extends HarnessSandbox {
  readonly id = "local";
  label = "Local";

  constructor(private readonly options: LocalSandboxOptions = {}) {
    super();
  }

  open(input: HarnessSandboxOpenInput): HarnessSandboxSession {
    const workDir = this.options.workDir
      ? resolve(input.workDir, this.options.workDir)
      : resolve(input.workDir);
    return new LocalSandboxSession({
      workDir,
      env: this.options.env,
      defaultTimeoutMs: this.options.defaultTimeoutMs,
    });
  }
}
