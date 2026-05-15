---
title: Logging
description: Configure runtime-owned operational logs and redaction.
---

Logging is runtime-owned observation. Agents can emit behavior logs through `session.log`, but the host chooses sinks, levels, redaction, and file destinations.

## Core Sinks

```ts
import {
  ConsoleLogSink,
  MemoryLogSink,
  type HarnessLoggingConfig,
} from "@harness-kernel/core/runner/logging";

const logging: HarnessLoggingConfig = {
  sinks: [new ConsoleLogSink({ level: "info" })],
  redaction: {
    keys: ["apiKey", "authorization"],
  },
};
```

Attach logging to the session store:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  logging,
});
```

## JSONL File Logs

```ts
import { JsonlFileLogSink } from "@harness-kernel/logging-file";

const logging = {
  sinks: [new JsonlFileLogSink({ path: ".harness-kernel/logs/runtime.jsonl", level: "info" })],
};
```

`JsonlFileLogSink` is an optional runtime module. It is separate from run storage; use it for operational logs.

## Agent Logs

Tools, hooks, modes, and context providers can call:

```ts
session.log.info("Escalation recorded.", { ticketId: "T-123" });
session.log.warn("Missing customer account id.");
session.log.error(new Error("Tool failed."));
```

The host still owns where those records go.
