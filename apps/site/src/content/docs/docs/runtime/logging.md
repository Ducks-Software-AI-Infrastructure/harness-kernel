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
  redact: {
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

## Error Records

Runtime failure logs use the same canonical error shape as events and status, but logs keep the internal view after redaction. Public surfaces such as stream events and `lastError` are sanitized by `errorPolicy`; log sinks receive `HarnessLogRecord.error` with `code`, `category`, `severity`, `recoverable`, `name`, `message`, and `stack` when available.

Events are the session timeline. Logs are operational diagnostics. A model provider failure, for example, produces an `ErrorEvent`/`RunFailedEvent` for the timeline and `ModelCallFailedLog`/`RunFailedLog` for diagnostics.
