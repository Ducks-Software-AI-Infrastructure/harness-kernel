# @harness-kernel/storage-file

File-backed run storage for Harness Kernel transcripts, events, snapshots,
metrics, and cursors.

```sh
pnpm add @harness-kernel/storage-file
```

Use this package when a runtime host wants local filesystem persistence.

## Minimal usage

```ts
import { FileRunStorage } from "@harness-kernel/storage-file";

const storage = new FileRunStorage({
  outputDir: "/var/lib/my-harness-host/runs",
});

const run = storage.openRun({
  runId: "run-001",
  sessionId: "session-001",
  agentKey: "agent",
});

run.init();
```

The runtime host owns the `outputDir`: create it, secure it, back it up, and
mount it wherever run artifacts should live.

For more details, see the [file storage guide](../../apps/site/src/content/docs/docs/guides/file-storage.md).
