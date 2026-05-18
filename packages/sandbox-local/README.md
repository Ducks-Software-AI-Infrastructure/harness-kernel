# @harness-kernel/sandbox-local

Local shell sandbox implementation for Harness Kernel runtime hosts.

```sh
pnpm add @harness-kernel/sandbox-local
```

Use this package only in hosts that intentionally allow local command execution. The local sandbox runs shell commands on the host machine, so enable it deliberately, prefer a constrained `workDir`, and keep tool approvals in place for untrusted agent actions.

## Minimal setup

```ts
import { LocalSandbox } from "@harness-kernel/sandbox-local";

const sandbox = new LocalSandbox({
  workDir: ".",
  env: "minimal",
  defaultTimeoutMs: 30_000,
});
```

Pass the sandbox from the runtime host into your Harness session configuration so mode-owned tools can call `session.sandbox.exec()`.

See the [local sandbox guide](../../apps/site/src/content/docs/docs/guides/local-sandbox.md) and [runtime sandbox docs](../../apps/site/src/content/docs/docs/runtime/sandbox.md) for the full host/runtime boundary notes.
