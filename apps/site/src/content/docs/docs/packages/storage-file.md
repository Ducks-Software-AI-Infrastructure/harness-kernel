---
title: "@harness-kernel/storage-file"
description: File-backed session storage for transcripts, events, snapshots, and cursors.
---

`@harness-kernel/storage-file` provides `FileSessionStorage` for persistent session-centric storage. `FileRunStorage` remains available for legacy run-centric hosts.

```ts
import { FileSessionStorage } from "@harness-kernel/storage-file";

const storage = new FileSessionStorage();
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

Each session run directory can contain `events.jsonl`, `transcript.json`, cursor files, snapshots, and context snapshots. The legacy `FileRunStorage` can also write `metrics.json`.

The default layout is `.harness-kernel/sessions/index.json` plus `.harness-kernel/sessions/<sessionId>/runs/<runId>/...`.

This package is optional. Use `MemorySessionStorage` from core for tests.
