---
title: "@harness-kernel/sandbox-docker"
description: Docker Sandboxes sbx backend for isolated command execution.
---

`@harness-kernel/sandbox-docker` provides `DockerSandbox`, a runtime-owned sandbox that executes commands through Docker Sandboxes (`sbx`).

Install and prepare `sbx` on the host before using this package:

```bash
pnpm add @harness-kernel/sandbox-docker
sbx daemon start
sbx login
sbx policy set-default balanced
```

Docker Sandboxes also requires host virtualization support. On Linux, confirm KVM is available and the host user can access it.

For full host setup and operational checks, see [Docker Sandbox](../../guides/docker-sandbox/).

```ts
import { DockerSandbox } from "@harness-kernel/sandbox-docker";

const sandbox = new DockerSandbox({
  workspace: { hostPath: process.cwd() },
  persistence: "workspace",
  namePrefix: "support-prod",
  defaultTimeoutMs: 30_000,
});
```

Attach it to the runtime:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  sandbox,
});
```

Each Harness `sessionId` maps to a deterministic `sbx` sandbox name, and tools in the same Harness session share that sandbox. `persistence: "workspace"` removes the sandbox on close while preserving files in the mounted workspace. `persistence: "sandbox"` stops the sandbox on close and reuses it when the same session is reopened.

Deleting a session always removes the per-session `sbx` sandbox, even when it was previously stopped and no active `HarnessSession` object is in memory.

Use `namePrefix` to scope sandbox names by app, environment, and tenant in production. Prefixes and mount `envName` values are validated before `sbx` is called.

Use `extraWorkspaces` for files owned by the host, including per-session uploads:

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

Every command receives `HARNESS_FILES_DIR` pointing to that mounted directory. Relative extra workspace paths are resolved inside the main workspace and cannot escape with `..`; absolute paths are allowed as explicit trusted host configuration.

Sandbox lifecycle and command execution are emitted as operational logs, not agent timeline events.
