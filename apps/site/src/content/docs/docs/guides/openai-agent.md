---
title: OpenAI Agent
description: Host an agent with OpenAI, file storage, local sandbox, approval policy, and console logs.
---

Objective: compose a practical runtime using optional packages.

```ts
import "dotenv/config";

import { resolve } from "node:path";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileSessionStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

for (const mode of agent.modes) mode.toolApproval = "ask";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1-mini",
  storage: new FileSessionStorage(),
  sandbox: new LocalSandbox({ workDir: resolve(process.cwd()) }),
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
});

try {
  const result = await store.send("openai-example", "Summarize this project.");
  console.log(result.answer);
} finally {
  await store.close();
}
```

Set `OPENAI_API_KEY` in the host environment. `OpenAIProvider` owns the `openai` namespace; `defaultModel` selects a provider model through the namespaced ref.

Boundary note: the agent package does not own credentials or provider instances. The host does.

API: [Provider OpenAI](../../packages/provider-openai/) and [Session Store](../../runtime/session-store/).
