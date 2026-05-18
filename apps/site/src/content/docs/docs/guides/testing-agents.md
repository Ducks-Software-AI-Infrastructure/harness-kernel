---
title: Testing Agents
description: Test agents with fake providers, memory storage, noop sandbox, and packed consumer smoke tests.
---

Objective: test behavior without network calls or local shell execution.

```ts
import assert from "node:assert/strict";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { MemorySessionStorage } from "@harness-kernel/core/runner/storage";
import { NoopSandbox } from "@harness-kernel/core/runner/sandbox";
import { agent } from "../src/agent.js";
import { EchoProvider } from "./support/echo-provider.js";

for (const mode of agent.modes) mode.toolApproval = "deny";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new EchoProvider()],
  defaultModel: "echo/basic",
  storage: new MemorySessionStorage(),
  sandbox: new NoopSandbox(),
});

try {
  const result = await store.send("test-session", "hello");
  assert.equal(result.agentKey, "my-agent");
  assert.match(result.answer, /hello/);
} finally {
  await store.close();
}
```

Use `session.waitForEvent()` to assert lifecycle behavior:

```ts
const session = await store.getOrCreate("events");
const run = session.stream("trigger a tool");
await session.waitForEvent(TurnEndEvent, { timeoutMs: 5000 });
await run.result;
```

For package-level validation, this repo also runs an external-consumer smoke test with `npm pack`. That catches missing package exports and subpath regressions:

```bash
pnpm build
pnpm test:consumer:packed
```

Boundary note: tests can replace all runtime infrastructure while keeping the same agent package.

API: [Sessions](../../runtime/sessions/) and [Model Providers](../../runtime/model-providers/).
