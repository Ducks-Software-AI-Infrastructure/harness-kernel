---
title: Storage
description: Persist sessions, run history, transcripts, events, snapshots, cursors, and context snapshots.
---

Storage is runtime-owned infrastructure. It decides where session records and run history live. Agent packages should not assume a particular storage backend.

## Core Storage

`@harness-kernel/core/runner/storage` exports storage contracts and in-memory/noop implementations:

```ts
import {
  MemorySessionStorage,
  type HarnessSessionStorage,
  type HarnessSessionSummary,
  type SessionListResult,
  type SessionListQuery,
  type HarnessRunStore,
} from "@harness-kernel/core/runner/storage";
```

`MemorySessionStorage` is useful for tests and in-process hosts. It implements the same session-centric contract as durable backends, but data is lost when the process exits.

## File Storage

Use `FileSessionStorage` when the host wants sessions and run state on disk:

```ts
import { FileSessionStorage } from "@harness-kernel/storage-file";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileSessionStorage(),
});
```

Each session stores a catalog entry and each run stores events, transcript, snapshots, cursors, and context snapshots. Metrics are emitted through logging/telemetry and are not required for restore.

## Custom Storage

Implement `HarnessSessionStorage` to create, list, touch, and delete sessions, create/list runs, and open a `HarnessRunStore` for persisted run state.

Use custom storage when your host needs a database, blob store, tenant-aware pathing, or retention policy.
