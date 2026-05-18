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
import { FileSessionStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileSessionStorage(),
  sandbox: new LocalSandbox({ workDir: process.cwd() }),
  resources: {
    tickets: ticketClient,
  },
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
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
| `storage` | Runtime | `HarnessSessionStorage`; defaults to in-memory session storage when omitted. |
| `sandbox` | Runtime | `HarnessSandbox`; defaults to noop sandbox when omitted. |
| `resources` | Runtime | Host dependencies exposed to agent sessions. |
| `logging` | Runtime | Operational log sinks and redaction configuration. |

## Store Methods

The store can create, list, delete, clear, send, stream, approve tools, deny tools, observe store events, and close all sessions.

```ts
const session = await store.getOrCreate("customer-42");
const page = await store.list({ limit: 20 });
const result = await store.send("customer-42", "Summarize the ticket.");
const approvals = store.getPendingApprovals("customer-42");
await store.close("customer-42");
await store.close();
```

`get(sessionId)` returns only an active in-memory session. Use `getOrCreate(sessionId)` to hydrate a persisted session. `close(sessionId)` unloads an active session, while `delete(sessionId)` removes persisted session data when the storage backend supports deletion.
