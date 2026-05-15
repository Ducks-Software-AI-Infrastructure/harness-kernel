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

## Relationship To Node Tools

`@harness-kernel/tools-node` exposes mode-owned tools such as `BashTool`, `ReadFileTool`, `WriteFileTool`, `EditFileTool`, `GlobTool`, and `GrepTool`. Those tools call `session.sandbox.exec()`.

The tools belong to modes. The sandbox belongs to the runtime host.
