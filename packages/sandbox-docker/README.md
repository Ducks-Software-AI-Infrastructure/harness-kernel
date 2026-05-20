# @harness-kernel/sandbox-docker

Docker Sandboxes (`sbx`) backend for Harness Kernel runtime hosts.

```sh
pnpm add @harness-kernel/sandbox-docker
```

This package maps each Harness `sessionId` to a deterministic Docker Sandbox name and executes tool commands through `sbx exec`. Tools in the same Harness session share that one `sbx` sandbox. Use it when host-local execution is too broad and you want command execution isolated by Docker Sandboxes while keeping Harness Kernel as the agent runtime.

## Host setup

Install Docker Sandboxes on the host, then start and authenticate the daemon:

```sh
sbx daemon start
sbx login
sbx policy set-default balanced
```

On Linux, Docker Sandboxes requires KVM. Confirm the host has virtualization enabled and the runtime user can access the `kvm` device/group.

See the [Docker sandbox guide](https://ducks-software-ai-infrastructure.github.io/harness-kernel/docs/guides/docker-sandbox/) for persistence, per-session files, logging, events, and cleanup.

## Minimal setup

```ts
import { DockerSandbox } from "@harness-kernel/sandbox-docker";

const sandbox = new DockerSandbox({
  workspace: { hostPath: process.cwd() },
  persistence: "workspace",
  namePrefix: "myapp-prod",
  defaultTimeoutMs: 30_000,
});
```

`persistence: "workspace"` is the default. Closing a session removes the sandbox while preserving files in the mounted host workspace. Use `persistence: "sandbox"` to stop the sandbox on close and reuse the same machine for the same `sessionId`.

Deleting a session always removes the deterministic per-session sandbox.

Use a `namePrefix` that identifies the app, environment, and tenant in production, for example `support-prod-acme`. Prefixes are validated before `sbx` is called.

## Session files

Mount per-session files with a dynamic `extraWorkspaces` function:

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

Every `exec()` receives `HARNESS_FILES_DIR` pointing to the mounted directory. Relative extra workspace paths are resolved from the main workspace, cannot escape with `..`, and are created by the host before `sbx create shell`. Absolute extra workspace paths are allowed as explicit trusted host configuration.

Sandbox lifecycle and `exec` activity are operational logs, not session timeline events.

See the [runtime sandbox docs](https://ducks-software-ai-infrastructure.github.io/harness-kernel/docs/runtime/sandbox/) for the host/runtime boundary notes.
