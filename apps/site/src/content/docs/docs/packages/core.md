---
title: "@harness-kernel/core"
description: Zero-dependency runtime contracts, sessions, schema, events, logging contracts, model provider routing, memory storage, and noop sandbox.
---

`@harness-kernel/core` is the stable center of Harness Kernel. It has zero external runtime dependencies and exposes both agent-space and runtime-host contracts.

Use it for:

- `defineAgent`, `HarnessMode`, `HarnessTool`, `HarnessHook`, `HarnessRole`, `HarnessContextProvider`, and `HarnessEvent`;
- `createHarnessSessionStore` and `createHarnessSession`;
- model provider contracts and registry helpers;
- storage and sandbox contracts plus `MemorySessionStorage`, legacy run storage helpers, and `NoopSandbox`;
- logging contracts plus `ConsoleLogSink` and `MemoryLogSink`;
- official schema primitives from `@harness-kernel/core/schema`.

Preferred imports:

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { s } from "@harness-kernel/core/schema";
```

See [Package Boundaries](../../concepts/package-boundaries/) and [API Reference](../../api/reference/).
