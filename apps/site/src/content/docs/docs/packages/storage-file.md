---
title: "@harness-kernel/storage-file"
description: File-backed run storage for transcripts, events, snapshots, metrics, and cursors.
---

`@harness-kernel/storage-file` provides `FileRunStorage`.

```ts
import { FileRunStorage } from "@harness-kernel/storage-file";

const storage = new FileRunStorage({ outputDir: ".harness-kernel/runs" });
```

The runtime host attaches it to the session store:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage,
});
```

Each run directory can contain `events.jsonl`, `transcript.json`, `metrics.json`, cursor files, snapshots, and context snapshots.

This package is optional. Use `MemoryRunStorage` from core for tests and `NoopRunStorage` when the host does not want persistence.
