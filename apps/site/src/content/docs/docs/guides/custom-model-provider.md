---
title: Custom Model Provider
description: Implement HarnessModelProvider for a host-owned model backend.
---

Objective: connect any model backend by implementing `HarnessModelProvider`.

```ts
import type {
  HarnessModelProvider,
  ModelInfo,
  ModelProviderInfo,
  ModelProviderRunInput,
  ModelProviderRunResult,
} from "@harness-kernel/core/runner/model-provider";

export class LocalProvider implements HarnessModelProvider {
  namespace = "local";
  id = "local-dev";

  getInfo(): ModelProviderInfo {
    return { id: this.id, label: "Local Dev Provider", provider: this.namespace };
  }

  getModels(): ModelInfo[] {
    return [{ id: "small", label: "Small local model" }];
  }

  supportsRole(roleId: string): boolean {
    return ["system", "user", "assistant", "tool"].includes(roleId);
  }

  async run(input: ModelProviderRunInput): Promise<ModelProviderRunResult> {
    const prepared = await input.prepareContext();
    const last = prepared.messages.at(-1);
    return {
      content: `local(${input.model}): ${String(last?.content ?? "")}`,
      usage: { messageCount: prepared.messages.length },
    };
  }
}
```

Register it:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new LocalProvider()],
  defaultModel: "local/small",
});
```

Boundary note: a provider is runtime infrastructure. A mode can request `model = "local/small"`, but the host still registers the provider.

API: [Model Providers](../../runtime/model-providers/).
