---
title: Storage
description: Persist run transcripts, events, snapshots, metrics, cursors, and context snapshots.
---

Storage is runtime-owned infrastructure. It decides where run records live and how long they are retained. Agent packages should not assume a particular storage backend.

## Core Storage

`@harness-kernel/core/runner/storage` exports storage contracts and in-memory/noop implementations:

```ts
import {
  MemoryRunStorage,
  NoopRunStorage,
  type HarnessRunStorage,
  type HarnessRunStore,
} from "@harness-kernel/core/runner/storage";
```

`NoopRunStorage` is useful when the host does not want persistence. `MemoryRunStorage` is useful for tests and in-process hosts.

## File Storage

Use `FileRunStorage` when the host wants run artifacts on disk:

```ts
import { FileRunStorage } from "@harness-kernel/storage-file";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
});
```

Each run can write events, transcript, metrics, snapshots, cursors, and context snapshots.

## Custom Storage

Implement `HarnessRunStorage` to open a `HarnessRunStore` for each run. A run store implements `init`, `recordEvent`, `loadEvents`, `saveTranscript`, `loadTranscript`, `saveMetrics`, snapshot methods, cursor methods, context snapshot methods, and optional `close`.

Use custom storage when your host needs a database, blob store, tenant-aware pathing, or retention policy.
