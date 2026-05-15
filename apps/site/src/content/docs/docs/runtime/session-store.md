---
title: Session Store
description: Configure runtime-owned hosting with createHarnessSessionStore.
---

`createHarnessSessionStore` is the main runtime host entrypoint. It creates a `HarnessSessionStore` that owns sessions for one agent definition and a runtime configuration.

```ts
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileRunStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  workDir: process.cwd(),
  storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
  sandbox: new LocalSandbox(),
  toolApproval: "ask",
  maxTurns: 8,
  services: {
    tickets: ticketClient,
  },
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
  sessionTtlMs: 30 * 60 * 1000,
  toolApprovalTimeoutMs: 5 * 60 * 1000,
});
```

## Required Configuration

| Field | Required | Notes |
| --- | --- | --- |
| `agent` | yes | `{ definition: agent }`, where `agent` is from `defineAgent`. |
| `providers` | yes | Runtime-owned `HarnessModelProvider[]`. At least one provider is required. |
| `defaultModel` | yes | Namespaced fallback model ref such as `openai/gpt-5.1`. |

## Optional Configuration

| Field | Owner | Notes |
| --- | --- | --- |
| `workDir` | Runtime | Base directory for sandbox sessions and file-oriented tools. |
| `storage` | Runtime | `HarnessRunStorage`; defaults to noop storage when omitted. |
| `sandbox` | Runtime | `HarnessSandbox`; defaults to noop sandbox when omitted. |
| `initialMode` | Runtime override | Host-selected initial mode for new sessions. |
| `toolApproval` | Runtime | `auto`, `ask`, `deny`, or `tool-default`. |
| `maxTurns` | Runtime | Default turn limit when mode does not set `maxTurns`. |
| `services` | Runtime | Host dependencies exposed to agent sessions. |
| `logging` | Runtime | Operational log sinks and redaction configuration. |
| `sessionTtlMs` | Runtime | Cleanup age for inactive sessions. |
| `toolApprovalTimeoutMs` | Runtime | Expiration for pending tool approval handles. |

## Store Methods

The store can create, list, delete, clear, send, stream, approve tools, deny tools, observe store events, and close all sessions.

```ts
const session = await store.getOrCreate("customer-42");
const result = await store.send("customer-42", "Summarize the ticket.");
const approvals = store.getPendingApprovals("customer-42");
await store.close();
```

The store does not define tools or hooks. It hosts an agent package and owns infrastructure.
