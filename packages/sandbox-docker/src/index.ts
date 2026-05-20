import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  HarnessSandbox,
  HarnessSandboxSession,
  type HarnessSandboxOpenInput,
  type SandboxCloseInput,
  type SandboxDestroyInput,
  type SandboxExecInput,
  type SandboxExecResult,
} from "@harness-kernel/core";

export type DockerSandboxPersistence = "workspace" | "sandbox";

export interface DockerSandboxWorkspaceMount {
  hostPath: string;
  readOnly?: boolean;
  envName?: string;
}

export interface DockerSandboxOptions {
  sbxPath?: string;
  workspace?: {
    hostPath?: string;
    readOnly?: boolean;
  };
  extraWorkspaces?:
    | DockerSandboxWorkspaceMount[]
    | ((input: HarnessSandboxOpenInput) => DockerSandboxWorkspaceMount[] | Promise<DockerSandboxWorkspaceMount[]>);
  persistence?: DockerSandboxPersistence;
  namePrefix?: string;
  template?: string;
  kits?: string[];
  branch?: string | "auto";
  cpus?: number;
  memory?: string;
  env?: Record<string, string>;
  defaultTimeoutMs?: number;
}

interface ResolvedWorkspaceMount {
  hostPath: string;
  readOnly: boolean;
  envName?: string;
}

type ProcessResult = SandboxExecResult;

const defaultExecTimeoutMs = 30_000;
const timeoutKillGraceMs = 1_000;
const maxNamePrefixLength = 46;
const namePrefixPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export function dockerSandboxSessionSegment(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 16);
}

function sandboxNameForSession(sessionId: string, namePrefix: string): string {
  return `${namePrefix}-${dockerSandboxSessionSegment(sessionId)}`;
}

function validateNamePrefix(namePrefix: string): void {
  if (namePrefix.length > maxNamePrefixLength || !namePrefixPattern.test(namePrefix)) {
    throw new Error(
      `Invalid Docker sandbox namePrefix '${namePrefix}'. Use a lowercase DNS-like segment with letters, digits, and hyphens, ${maxNamePrefixLength} characters or fewer.`,
    );
  }
}

function validateEnvName(envName: string | undefined): void {
  if (envName !== undefined && !envNamePattern.test(envName)) {
    throw new Error(`Invalid Docker sandbox envName '${envName}'. Use a valid environment variable name.`);
  }
}

function resolveInside(baseDir: string, inputPath: string): string {
  const fullPath = resolve(baseDir, inputPath);
  const rel = relative(baseDir, fullPath);
  if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith(`..${"\\"}`)) {
    throw new Error(`Path escapes sandbox workspace: ${inputPath}`);
  }
  return fullPath;
}

function formatMount(mount: ResolvedWorkspaceMount): string {
  return mount.readOnly ? `${mount.hostPath}:ro` : mount.hostPath;
}

function normalizeMount(mainWorkspace: string, input: DockerSandboxWorkspaceMount): ResolvedWorkspaceMount {
  validateEnvName(input.envName);
  const hostPath = isAbsolute(input.hostPath)
    ? resolve(input.hostPath)
    : resolveInside(mainWorkspace, input.hostPath);
  mkdirSync(hostPath, { recursive: true });
  return {
    hostPath,
    readOnly: input.readOnly ?? false,
    envName: input.envName,
  };
}

function envFromMounts(mounts: ResolvedWorkspaceMount[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const mount of mounts) {
    if (mount.envName) env[mount.envName] = mount.hostPath;
  }
  return env;
}

function envArgs(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
}

function isNotFoundError(error: unknown): boolean {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return text.includes("not found")
    || text.includes("no such")
    || text.includes("does not exist")
    || text.includes("not exist")
    || text.includes("unknown sandbox");
}

function isAlreadyExistsError(error: unknown): boolean {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return text.includes("already exists")
    || text.includes("exists already")
    || text.includes("already in use")
    || (text.includes("name") && text.includes("exists"));
}

function runProcess(command: string, args: string[], input: {
  stdin?: string;
  timeoutMs?: number;
} = {}): Promise<ProcessResult> {
  const startedAt = Date.now();
  return new Promise<ProcessResult>((resolveResult, reject) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    const child = childProcess.spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const settle = (value: ProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolveResult(value);
    };

    if (input.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!settled) child.kill("SIGKILL");
        }, timeoutKillGraceMs);
      }, input.timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
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

async function runControl(command: string, args: string[]): Promise<ProcessResult> {
  const result = await runProcess(command, args);
  if (result.exitCode !== 0) {
    const detail = result.stderr || result.stdout || `exit code ${String(result.exitCode)}`;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

export class DockerSandboxSession extends HarnessSandboxSession {
  readonly id: string;
  readonly workDir: string;

  constructor(private readonly input: {
    id: string;
    sbxPath: string;
    workDir: string;
    env: Record<string, string>;
    persistence: DockerSandboxPersistence;
    defaultTimeoutMs?: number;
  }) {
    super();
    this.id = input.id;
    this.workDir = input.workDir;
  }

  async exec(input: SandboxExecInput): Promise<SandboxExecResult> {
    const cwd = input.cwd ? resolveInside(this.workDir, input.cwd) : this.workDir;
    mkdirSync(cwd, { recursive: true });
    const env = {
      ...this.input.env,
      ...(input.env ?? {}),
    };
    return runProcess(this.input.sbxPath, [
      "exec",
      "-i",
      "-w",
      cwd,
      ...envArgs(env),
      this.id,
      "bash",
      "-lc",
      input.command,
    ], {
      stdin: input.stdin,
      timeoutMs: input.timeoutMs ?? this.input.defaultTimeoutMs ?? defaultExecTimeoutMs,
    });
  }

  async close(input: SandboxCloseInput = { reason: "close" }): Promise<void> {
    if (input.reason === "delete" || this.input.persistence === "workspace") {
      await runControl(this.input.sbxPath, ["rm", "--force", this.id]);
      return;
    }
    await runControl(this.input.sbxPath, ["stop", this.id]);
  }
}

export class DockerSandbox extends HarnessSandbox {
  readonly id = "docker";
  label = "Docker";

  private readonly sbxPath: string;
  private readonly namePrefix: string;
  private readonly persistence: DockerSandboxPersistence;

  constructor(private readonly options: DockerSandboxOptions = {}) {
    super();
    this.sbxPath = options.sbxPath ?? "sbx";
    this.namePrefix = options.namePrefix?.trim() || "harness";
    validateNamePrefix(this.namePrefix);
    this.persistence = options.persistence ?? "workspace";
  }

  open(input: HarnessSandboxOpenInput): Promise<DockerSandboxSession> {
    return this.openDockerSandbox(input);
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    try {
      await runControl(this.sbxPath, ["rm", "--force", this.sandboxName(input.sessionId)]);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  sandboxName(sessionId: string): string {
    return sandboxNameForSession(sessionId, this.namePrefix);
  }

  private async openDockerSandbox(input: HarnessSandboxOpenInput): Promise<DockerSandboxSession> {
    const name = this.sandboxName(input.sessionId);
    const workDir = resolve(this.options.workspace?.hostPath ?? input.workDir);
    mkdirSync(workDir, { recursive: true });
    const mainWorkspace: ResolvedWorkspaceMount = {
      hostPath: workDir,
      readOnly: this.options.workspace?.readOnly ?? false,
    };
    const extraWorkspaces = await this.resolveExtraWorkspaces(input, workDir);
    const mountEnv = envFromMounts(extraWorkspaces);

    if (!await this.sandboxExists(name)) {
      try {
        await runControl(this.sbxPath, this.createArgs(name, mainWorkspace, extraWorkspaces));
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
      }
    }

    return new DockerSandboxSession({
      id: name,
      sbxPath: this.sbxPath,
      workDir,
      env: {
        ...(this.options.env ?? {}),
        ...mountEnv,
      },
      persistence: this.persistence,
      defaultTimeoutMs: this.options.defaultTimeoutMs,
    });
  }

  private async resolveExtraWorkspaces(
    input: HarnessSandboxOpenInput,
    mainWorkspace: string,
  ): Promise<ResolvedWorkspaceMount[]> {
    const configured = typeof this.options.extraWorkspaces === "function"
      ? await this.options.extraWorkspaces(input)
      : this.options.extraWorkspaces ?? [];
    return configured.map((workspace) => normalizeMount(mainWorkspace, workspace));
  }

  private async sandboxExists(name: string): Promise<boolean> {
    const result = await runControl(this.sbxPath, ["ls", "-q"]);
    return result.stdout.split(/\r?\n/u).some((line) => line.trim() === name);
  }

  private createArgs(
    name: string,
    mainWorkspace: ResolvedWorkspaceMount,
    extraWorkspaces: ResolvedWorkspaceMount[],
  ): string[] {
    const args = ["create", "shell", "--name", name];
    if (this.options.cpus !== undefined) args.push("--cpus", String(this.options.cpus));
    if (this.options.memory) args.push("--memory", this.options.memory);
    if (this.options.template) args.push("--template", this.options.template);
    for (const kit of this.options.kits ?? []) args.push("--kit", kit);
    if (this.options.branch) args.push("--branch", this.options.branch);
    args.push(formatMount(mainWorkspace));
    args.push(...extraWorkspaces.map((workspace) => formatMount(workspace)));
    return args;
  }
}

export function createDockerSandbox(options: DockerSandboxOptions = {}): DockerSandbox {
  return new DockerSandbox(options);
}
