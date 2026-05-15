---
title: CLI Agent
description: Build a command-line host for an agent.
---

Objective: run a Harness Kernel agent from a Node CLI.

```ts
import "dotenv/config";

import { resolve } from "node:path";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileRunStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

const prompt = process.argv.slice(2).join(" ").trim() || "Summarize this project.";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1",
  workDir: resolve(process.cwd()),
  storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
  sandbox: new LocalSandbox(),
  toolApproval: "ask",
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
});

try {
  const result = await store.send("cli", prompt);
  console.log(result.answer);
} finally {
  await store.close();
}
```

The repo includes this pattern under `examples/cli-harness`.

Boundary note: the CLI owns process arguments, environment variables, provider registration, storage, sandbox, and logs.

API: [Session Store](../../runtime/session-store/).
