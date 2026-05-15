---
title: Core-only Agent
description: Build and test an agent with only @harness-kernel/core.
---

Objective: run a complete Harness Kernel session without optional runtime packages. This is useful for tests and for understanding the core contracts.

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import type {
  HarnessModelProvider,
  ModelProviderRunInput,
  ModelProviderRunResult,
} from "@harness-kernel/core/runner/model-provider";
import { MemoryRunStorage } from "@harness-kernel/core/runner/storage";
import { NoopSandbox } from "@harness-kernel/core/runner/sandbox";

class ChatMode extends HarnessMode {
  prompt = "Reply with a short answer.";
}

const chatMode = new ChatMode();

const agent = defineAgent({
  key: "core-only",
  label: "Core Only",
  initialMode: chatMode,
  modes: [chatMode],
});

class EchoProvider implements HarnessModelProvider {
  namespace = "echo";

  async run(input: ModelProviderRunInput): Promise<ModelProviderRunResult> {
    const last = input.messages.at(-1);
    return { content: `echo: ${String(last?.content ?? "")}` };
  }
}

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new EchoProvider()],
  defaultModel: "echo/basic",
  storage: new MemoryRunStorage(),
  sandbox: new NoopSandbox(),
});

const result = await store.send("demo", "hello");
console.log(result.answer);
await store.close();
```

Boundary note: the agent defines `ChatMode`; the runtime host provides the model provider, storage, sandbox, and required `defaultModel`.

API: [Model Providers](../../runtime/model-providers/) and [Storage](../../runtime/storage/).
