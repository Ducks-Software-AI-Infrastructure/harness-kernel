---
title: "@harness-kernel/logging-file"
description: JSONL operational log sink for Harness Kernel.
---

`@harness-kernel/logging-file` provides `JsonlFileLogSink`, an optional runtime log sink that writes one JSON log record per line.

```ts
import { JsonlFileLogSink } from "@harness-kernel/logging-file";

const logging = {
  sinks: [
    new JsonlFileLogSink({
      path: ".harness-kernel/logs/runtime.jsonl",
      level: "info",
    }),
  ],
};
```

Attach logging to the runtime session store:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  logging,
});
```

Use file logging for host observability. It is separate from run storage.
