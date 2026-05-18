# @harness-kernel/logging-file

JSONL file log sink for Harness Kernel runtime hosts.

```sh
pnpm add @harness-kernel/logging-file
```

Use this package when the host wants operational logs written to local JSONL
files.

## Minimal usage

Logging is configured by the runtime host, not by the agent. Add the JSONL file
sink to the host's logging configuration and pass that configuration into the
session store:

```ts
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { JsonlFileLogSink } from "@harness-kernel/logging-file";

const logging = {
  sinks: [
    new JsonlFileLogSink({
      path: ".harness-kernel/logs/runtime.jsonl",
      level: "info",
    }),
  ],
};

const store = await createHarnessSessionStore({
  // ...agent, model providers, and other runtime host configuration
  logging,
});
```

Each log record is appended as one JSON object per line.

Docs: <https://ducks-software-ai-infrastructure.github.io/harness-kernel/docs/runtime/logging/>
