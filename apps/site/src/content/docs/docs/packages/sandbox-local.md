---
title: "@harness-kernel/sandbox-local"
description: Local shell sandbox implementation for host-owned execution.
---

`@harness-kernel/sandbox-local` provides `LocalSandbox`, a runtime-owned sandbox that executes commands with `bash -lc` inside a configured work directory.

```ts
import { LocalSandbox } from "@harness-kernel/sandbox-local";

const sandbox = new LocalSandbox({
  workDir: ".",
  env: "minimal",
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

Node tools such as `BashTool` and file tools call `session.sandbox.exec()`. The tools belong to modes; the sandbox belongs to the host.
