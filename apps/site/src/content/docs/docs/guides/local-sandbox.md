---
title: Local Sandbox
description: Combine LocalSandbox with Node tools for local command and file operations.
---

Objective: let mode-owned Node tools execute through a host-owned local sandbox.

```ts
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { createCoreTools } from "@harness-kernel/tools-node";

class CliMode extends HarnessMode {
  prompt = "Use local tools only when they are needed.";
  tools = createCoreTools();
  toolApproval = "ask" as const;
}

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

`createCoreTools()` includes filesystem tools and `BashTool`. Those tools call `session.sandbox.exec()`.

Boundary note: tools live in modes; the sandbox lives in the runtime host.

API: [Sandbox](../../runtime/sandbox/) and [Tools Node](../../packages/tools-node/).
