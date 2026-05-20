import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DockerSandbox, dockerSandboxSessionSegment } from "./index.js";

interface SpawnResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  hold?: boolean;
  ignoreKillSignals?: string[];
}

interface SpawnCall {
  command: string;
  args: string[];
  stdin: string;
  killed: string[];
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly killed: string[] = [];
  private finished = false;
  readonly stdin = {
    write: (chunk: unknown) => {
      this.call.stdin += String(chunk);
    },
    end: () => undefined,
  };

  constructor(
    private readonly call: SpawnCall,
    private readonly response: SpawnResponse,
  ) {
    super();
    call.killed = this.killed;
    if (!response.hold) {
      queueMicrotask(() => this.finish(response.exitCode ?? 0, response.signal ?? null));
    }
  }

  kill(signal = "SIGTERM"): boolean {
    this.killed.push(signal);
    if (!this.response.ignoreKillSignals?.includes(signal)) {
      queueMicrotask(() => this.finish(null, signal));
    }
    return true;
  }

  private finish(exitCode: number | null, signal: string | null): void {
    if (this.finished) return;
    this.finished = true;
    if (this.response.stdout) this.stdout.emit("data", Buffer.from(this.response.stdout));
    if (this.response.stderr) this.stderr.emit("data", Buffer.from(this.response.stderr));
    this.emit("close", exitCode, signal);
  }
}

const originalSpawn = childProcess.spawn;
const calls: SpawnCall[] = [];
let responses: SpawnResponse[] = [];

childProcess.spawn = ((command: string, args: string[]) => {
  const call: SpawnCall = { command, args: [...args], stdin: "", killed: [] };
  calls.push(call);
  return new FakeChildProcess(call, responses.shift() ?? {}) as never;
}) as typeof childProcess.spawn;

function reset(nextResponses: SpawnResponse[]): void {
  calls.length = 0;
  responses = [...nextResponses];
}

function expectedName(sessionId: string, prefix = "harness"): string {
  return `${prefix}-${createHash("sha256").update(sessionId).digest("hex").slice(0, 16)}`;
}

const root = mkdtempSync(join(tmpdir(), "harness-kernel-docker-sandbox-"));

try {
  const workspace = join(root, "workspace");
  const sessionId = "session-a";
  const sessionSegment = dockerSandboxSessionSegment(sessionId);
  const sandboxName = expectedName(sessionId, "hk");
  reset([{ stdout: "" }, { stdout: "created\n" }, { stdout: "out", stderr: "err", exitCode: 7 }]);

  const sandbox = new DockerSandbox({
    sbxPath: "fake-sbx",
    namePrefix: "hk",
    workspace: { hostPath: workspace },
    extraWorkspaces: ({ sessionId: dynamicSessionId }) => [
      {
        hostPath: `.harness-kernel/sessions/${dockerSandboxSessionSegment(dynamicSessionId)}/files`,
        readOnly: true,
        envName: "HARNESS_FILES_DIR",
      },
    ],
    template: "ubuntu",
    kits: ["docker", "node"],
    branch: "auto",
    cpus: 2,
    memory: "4g",
    env: { BASE: "from-options", OVERRIDE: "base" },
    defaultTimeoutMs: 1234,
  });

  const session = await sandbox.open({
    sessionId,
    runId: "run",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  const filesDir = join(workspace, ".harness-kernel", "sessions", sessionSegment, "files");

  assert.equal(session.id, sandboxName);
  assert.equal(session.workDir, workspace);
  assert.equal(existsSync(filesDir), true);
  assert.deepEqual(calls[0]?.args, ["ls", "-q"]);
  assert.deepEqual(calls[1]?.args, [
    "create",
    "shell",
    "--name",
    sandboxName,
    "--cpus",
    "2",
    "--memory",
    "4g",
    "--template",
    "ubuntu",
    "--kit",
    "docker",
    "--kit",
    "node",
    "--branch",
    "auto",
    workspace,
    `${filesDir}:ro`,
  ]);

  const execResult = await session.exec({
    command: "printf test",
    cwd: "nested",
    stdin: "input",
    env: { OVERRIDE: "exec", EXTRA: "yes" },
  });
  assert.equal(execResult.stdout, "out");
  assert.equal(execResult.stderr, "err");
  assert.equal(execResult.exitCode, 7);
  assert.equal(calls[2]?.stdin, "input");
  assert.deepEqual(calls[2]?.args, [
    "exec",
    "-i",
    "-w",
    join(workspace, "nested"),
    "-e",
    "BASE=from-options",
    "-e",
    "OVERRIDE=exec",
    "-e",
    `HARNESS_FILES_DIR=${filesDir}`,
    "-e",
    "EXTRA=yes",
    sandboxName,
    "bash",
    "-lc",
    "printf test",
  ]);

  await assert.rejects(
    () => session.exec({ command: "printf nope", cwd: resolve(root, "outside") }),
    /Path escapes sandbox workspace/,
  );

  reset([]);
  await assert.rejects(
    () => new DockerSandbox({
      sbxPath: "fake-sbx",
      workspace: { hostPath: workspace },
      extraWorkspaces: [{ hostPath: "../outside" }],
    }).open({
      sessionId: "escape",
      runId: "run",
      agentKey: "agent",
      workDir: root,
      resources: {},
    }),
    /Path escapes sandbox workspace/,
  );
  assert.equal(calls.length, 0);

  const absoluteExtra = join(root, "absolute-extra");
  reset([{ stdout: "" }, { stdout: "created\n" }]);
  await new DockerSandbox({
    sbxPath: "fake-sbx",
    workspace: { hostPath: workspace },
    extraWorkspaces: [{ hostPath: absoluteExtra, envName: "ABS_DIR" }],
  }).open({
    sessionId: "absolute-extra",
    runId: "run",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  assert.equal(existsSync(absoluteExtra), true);
  assert.deepEqual(calls[1]?.args.at(-1), absoluteExtra);

  reset([]);
  await assert.rejects(
    () => new DockerSandbox({
      sbxPath: "fake-sbx",
      workspace: { hostPath: workspace },
      extraWorkspaces: [{ hostPath: "files", envName: "1BAD" }],
    }).open({
      sessionId: "invalid-env",
      runId: "run",
      agentKey: "agent",
      workDir: root,
      resources: {},
    }),
    /Invalid Docker sandbox envName/,
  );
  assert.equal(calls.length, 0);

  assert.throws(
    () => new DockerSandbox({ sbxPath: "fake-sbx", namePrefix: "Bad_Prefix" }),
    /Invalid Docker sandbox namePrefix/,
  );
  assert.equal(calls.length, 0);

  reset([{ stdout: "" }, { stderr: "sandbox already exists", exitCode: 1 }]);
  const raced = await new DockerSandbox({ sbxPath: "fake-sbx" }).open({
    sessionId: "race",
    runId: "run",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  assert.equal(raced.id, expectedName("race"));
  assert.deepEqual(calls.map((call) => call.args[0]), ["ls", "create"]);

  reset([{ stdout: `${sandboxName}\n` }]);
  const reused = await sandbox.open({
    sessionId,
    runId: "run-2",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  assert.equal(reused.id, sandboxName);
  assert.equal(calls.length, 1);

  reset([{ exitCode: 0 }]);
  await session.close({ reason: "close" });
  assert.deepEqual(calls[0]?.args, ["rm", "--force", sandboxName]);

  reset([{ stdout: "" }, {}, {}]);
  const persistentSession = await new DockerSandbox({
    sbxPath: "fake-sbx",
    persistence: "sandbox",
  }).open({
    sessionId: "persist",
    runId: "run",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  await persistentSession.close({ reason: "close" });
  assert.deepEqual(calls[2]?.args, ["stop", expectedName("persist")]);

  reset([{ exitCode: 0 }]);
  await persistentSession.close({ reason: "delete" });
  assert.deepEqual(calls[0]?.args, ["rm", "--force", expectedName("persist")]);

  reset([{ exitCode: 0 }]);
  await sandbox.destroy({ sessionId });
  assert.deepEqual(calls[0]?.args, ["rm", "--force", sandboxName]);

  reset([{ stdout: `${sandboxName}\n` }, { hold: true }]);
  const timeoutSession = await sandbox.open({
    sessionId,
    runId: "run-3",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  const timeoutResult = await timeoutSession.exec({ command: "sleep 10", timeoutMs: 1 });
  assert.equal(timeoutResult.timedOut, true);
  assert.equal(timeoutResult.exitCode, null);
  assert.equal(timeoutResult.signal, "SIGTERM");
  assert.deepEqual(calls[1]?.killed, ["SIGTERM"]);

  reset([{ stdout: `${sandboxName}\n` }, { hold: true, ignoreKillSignals: ["SIGTERM"] }]);
  const sigkillSession = await sandbox.open({
    sessionId,
    runId: "run-4",
    agentKey: "agent",
    workDir: root,
    resources: {},
  });
  const sigkillResult = await sigkillSession.exec({ command: "sleep 10", timeoutMs: 1 });
  assert.equal(sigkillResult.timedOut, true);
  assert.equal(sigkillResult.exitCode, null);
  assert.equal(sigkillResult.signal, "SIGKILL");
  assert.deepEqual(calls[1]?.killed, ["SIGTERM", "SIGKILL"]);
} finally {
  childProcess.spawn = originalSpawn;
  rmSync(root, { recursive: true, force: true });
}
