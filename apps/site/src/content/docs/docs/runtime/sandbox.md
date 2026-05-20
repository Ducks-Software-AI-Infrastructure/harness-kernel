---
title: Sandbox
description: Provide host-owned command and file execution boundaries.
---

Sandboxing is runtime-owned infrastructure. Tools can ask for shell or file operations, but the host decides what execution environment they receive.

## Core Sandbox

```ts
import {
  NoopSandbox,
  type HarnessSandbox,
  type HarnessSandboxSession,
} from "@harness-kernel/core/runner/sandbox";
```

`NoopSandbox` returns failed command results and is safe for core-only tests where execution should not happen.

## Sandbox Choices

| Sandbox | Package | Isolation | Persistence |
| --- | --- | --- | --- |
| `NoopSandbox` | `@harness-kernel/core` | No command execution. | None. |
| `LocalSandbox` | `@harness-kernel/sandbox-local` | Runs `bash -lc` on the host inside a constrained `workDir`. | Host filesystem only. |
| `DockerSandbox` | `@harness-kernel/sandbox-docker` | Runs commands through Docker Sandboxes (`sbx`). | Workspace by default, or whole sandbox by `sessionId`. |

## Local Sandbox

`@harness-kernel/sandbox-local` provides local shell execution:

```ts
import { LocalSandbox } from "@harness-kernel/sandbox-local";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  sandbox: new LocalSandbox({
    workDir: ".",
    env: "minimal",
    defaultTimeoutMs: 30_000,
  }),
});
```

`LocalSandbox` resolves paths inside the configured work directory and executes commands with `bash -lc`.

## Docker Sandbox

`@harness-kernel/sandbox-docker` provides isolated execution through Docker Sandboxes:

```ts
import { DockerSandbox } from "@harness-kernel/sandbox-docker";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  sandbox: new DockerSandbox({
    workspace: { hostPath: process.cwd() },
    persistence: "workspace",
    namePrefix: "support-prod",
    defaultTimeoutMs: 30_000,
  }),
});
```

Each Harness `sessionId` maps to one deterministic `sbx` sandbox name, and tools in that Harness session share it. With the default `persistence: "workspace"`, `close()` removes the sandbox and keeps changes in the mounted host workspace. With `persistence: "sandbox"`, `close()` stops the sandbox so packages, caches, and files outside the workspace survive when the same session is reopened. `delete()` always removes the per-session sandbox. In production, set `namePrefix` by app, environment, and tenant.

Mount per-session files, such as uploaded PDFs, with dynamic `extraWorkspaces`:

```ts
import { DockerSandbox, dockerSandboxSessionSegment } from "@harness-kernel/sandbox-docker";

const sandbox = new DockerSandbox({
  workspace: { hostPath: process.cwd() },
  extraWorkspaces: ({ sessionId }) => [
    {
      hostPath: `.harness-kernel/sessions/${dockerSandboxSessionSegment(sessionId)}/files`,
      readOnly: true,
      envName: "HARNESS_FILES_DIR",
    },
  ],
});
```

Relative extra workspace paths are resolved from the main workspace, cannot escape with `..`, and are created by the host. Absolute paths are allowed as explicit trusted host configuration. Every command receives `HARNESS_FILES_DIR` pointing at the mounted directory.

See [Docker Sandbox](../../guides/docker-sandbox/) for host setup, daemon lifecycle, persistence, and operational checks.

## Lifecycle And Observation

Sandbox lifecycle is controlled by the session store:

- `store.close(sessionId)` unloads the active session and closes the sandbox with reason `"close"`.
- `store.delete(sessionId)` removes persisted session data and closes or destroys the sandbox with reason `"delete"`.

For `DockerSandbox`, that distinction matters. `persistence: "workspace"` removes the `sbx` sandbox on close. `persistence: "sandbox"` stops it on close and reuses it for the same `sessionId`. Delete always removes the `sbx` sandbox.

Sandbox open, close, exec start, exec completion, and exec failure are operational logs. They are not timeline events. Timeline events still describe agent-visible work such as tool start/end, approvals, model calls, turns, and runs.

The current built-in targets are `NoopSandbox`, `LocalSandbox`, and `DockerSandbox`. Future providers such as E2B, Daytona, or Modal will likely need persisted sandbox handles because they use opaque provider IDs rather than deterministic names.

## Relationship To Node Tools

`@harness-kernel/tools-node` exposes mode-owned tools such as `BashTool`, `ReadFileTool`, `WriteFileTool`, `EditFileTool`, `GlobTool`, and `GrepTool`. Those tools call `session.sandbox.exec()`.

The tools belong to modes. The sandbox belongs to the runtime host.
