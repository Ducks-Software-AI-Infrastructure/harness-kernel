---
title: File Storage
description: Persist sessions and run state with FileSessionStorage.
---

Objective: write sessions, transcripts, events, snapshots, and cursors to disk.

```ts
import { FileSessionStorage } from "@harness-kernel/storage-file";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileSessionStorage(),
});

const result = await store.send("file-storage", "Create a short status report.");
console.log(result.outputDir);
```

The output directory belongs to the host. It is safe to change per environment:

```ts
new FileSessionStorage({
  rootDir: process.env.HARNESS_KERNEL_DIR ?? ".harness-kernel",
});
```

Boundary note: storage is runtime infrastructure. Agent packages should not depend on `FileSessionStorage`.

API: [Storage](../../runtime/storage/) and [Storage File](../../packages/storage-file/).
