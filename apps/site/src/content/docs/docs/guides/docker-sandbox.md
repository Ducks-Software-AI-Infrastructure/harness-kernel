---
title: Docker Sandbox
description: Run Node tools through Docker Sandboxes with per-session persistence.
---

Objective: use `DockerSandbox` when a host needs stronger isolation than local shell execution.

## Host Setup

Install Docker, enable virtualization, and install Docker Sandboxes (`sbx`) on the host. On Linux, KVM must be available to the user running the Harness process.

```bash
docker version
lsmod | grep '^kvm'
groups
```

Install the `sbx` package from Docker's package repository, then start and authenticate the daemon:

```bash
sbx daemon start
sbx login
sbx policy set-default balanced
sbx diagnose
```

For long-running hosts, run the daemon under your process manager instead of starting it manually in a terminal. The Harness runtime expects `sbx` to be installed, authenticated, and reachable before tool execution begins.

## Runtime Setup

Install the sandbox package with the Node tools that will use it:

```bash
pnpm add @harness-kernel/sandbox-docker @harness-kernel/tools-node
```

Attach `DockerSandbox` in the runtime host:

```ts
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { DockerSandbox } from "@harness-kernel/sandbox-docker";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { agent } from "./agent.js";

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

Modes still own the tools:

```ts
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createCoreTools } from "@harness-kernel/tools-node";

class OperatorMode extends HarnessMode {
  prompt = "Use the shell and files only when needed.";
  tools = createCoreTools();
  toolApproval = "ask" as const;
}
```

## Persistence

Each Harness `sessionId` maps to one deterministic `sbx` sandbox name, and all tools in that Harness session share the same sandbox. The package does not persist an extra sandbox handle in storage. In production, set `namePrefix` to an app, environment, and tenant scoped prefix such as `support-prod-acme`.

Use the default `workspace` persistence when project files are the only state that should survive:

```ts
new DockerSandbox({
  workspace: { hostPath: process.cwd() },
  persistence: "workspace",
  namePrefix: "support-prod",
});
```

Use `sandbox` persistence when installed packages, caches, Docker daemon state inside the sandbox, or files outside the workspace should survive `store.close(sessionId)`:

```ts
new DockerSandbox({
  workspace: { hostPath: process.cwd() },
  persistence: "sandbox",
  namePrefix: "support-prod",
});
```

Lifecycle behavior:

| Store call | `workspace` persistence | `sandbox` persistence |
| --- | --- | --- |
| `store.close(sessionId)` | Removes the `sbx` sandbox. | Stops the `sbx` sandbox. |
| `store.delete(sessionId)` | Removes the `sbx` sandbox. | Removes the `sbx` sandbox. |

`store.delete(sessionId)` also removes a stopped sandbox for an inactive persisted session when the sandbox provider implements `destroy({ sessionId })`.

## Per-Session Files

Mount host-owned files into the sandbox with `extraWorkspaces`. A dynamic function can route uploads, PDFs, datasets, or other attachments by `sessionId`:

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

Relative paths are resolved from the main workspace, cannot escape with `..`, and are created by the host before `sbx create shell`. Absolute paths are allowed as explicit trusted host configuration. Every command receives `HARNESS_FILES_DIR` pointing at the mounted directory.

## Observation

Sandbox activity is operational logging, not agent timeline events.

- `ToolStartEvent` and `ToolEndEvent` describe the tool call in the session timeline.
- Sandbox logs describe the underlying command execution: open, close, start, completion, timeout, and failure.

Use a log sink for host diagnostics:

```ts
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  sandbox,
  logging: {
    sinks: [new ConsoleLogSink({ level: "debug" })],
  },
});
```

## Operations

Useful checks while developing:

```bash
sbx version
sbx diagnose
sbx ls -q
```

Stop a leftover sandbox by name:

```bash
sbx stop <sandbox-name>
```

Remove a leftover sandbox:

```bash
sbx rm --force <sandbox-name>
```

Boundary note: the host owns `sbx`, daemon lifecycle, login, policy, quotas, and cleanup. Agent packages should only depend on tool and mode contracts.

API: [Sandbox](../../runtime/sandbox/), [Logging](../../runtime/logging/), [Events](../../agent/events/), and [Sandbox Docker](../../packages/sandbox-docker/).
