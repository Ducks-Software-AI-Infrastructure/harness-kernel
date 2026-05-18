# @harness-kernel/storage-file

File-backed session storage for Harness Kernel transcripts, events, snapshots,
context snapshots, and cursors.

```sh
pnpm add @harness-kernel/storage-file
```

Use `FileSessionStorage` when a runtime host wants local filesystem persistence
for sessions. `FileRunStorage` remains available for legacy run-centric hosts.

## Minimal usage

```ts
import { FileSessionStorage } from "@harness-kernel/storage-file";

const storage = new FileSessionStorage({
  rootDir: "/var/lib/my-harness-host",
});

await storage.init?.();
await storage.createSession({
  sessionId: "session-001",
  agentKey: "agent",
  mode: "ChatMode",
});
```

The runtime host owns the storage directory: create it, secure it, back it up,
and mount it wherever session artifacts should live.

For more details, see the [file storage guide](../../apps/site/src/content/docs/docs/guides/file-storage.md).
