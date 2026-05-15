---
title: File Storage
description: Persist run artifacts with FileRunStorage.
---

Objective: write transcripts, events, metrics, snapshots, and cursors to disk.

```ts
import { FileRunStorage } from "@harness-kernel/storage-file";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
});

const result = await store.send("file-storage", "Create a short status report.");
console.log(result.outputDir);
```

The output directory belongs to the host. It is safe to change per environment:

```ts
new FileRunStorage({
  outputDir: process.env.HARNESS_KERNEL_RUN_DIR ?? ".harness-kernel/runs",
});
```

Boundary note: storage is runtime infrastructure. Agent packages should not depend on `FileRunStorage`.

API: [Storage](../../runtime/storage/) and [Storage File](../../packages/storage-file/).
