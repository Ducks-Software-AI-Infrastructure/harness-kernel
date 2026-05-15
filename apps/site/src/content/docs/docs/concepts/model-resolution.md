---
title: Model Resolution
description: How namespaced model refs are resolved from run, session, mode, and default runtime configuration.
---

Harness Kernel uses namespaced model references in the form `<provider>/<model>`, such as `openai/gpt-5.1`. The namespace selects a registered `HarnessModelProvider`; the model id is passed to that provider.

## Resolution Order

Model selection is resolved in this order:

1. Run override from `send(input, { model })` or `stream(input, { model })`.
2. Session override from `session.setModel(model)`.
3. Mode preference from `mode.model`.
4. Runtime fallback from required `defaultModel`.

The runtime host must provide `defaultModel` so every run has an explicit fallback.

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1-mini",
});

const session = await store.getOrCreate("project-1");
session.setModel("openai/gpt-5.1");

await session.send("Use the current session model.");
await session.send("Use a one-off model.", { model: "openai/gpt-5.1-mini" });
session.clearModelOverride();
```

## Provider Registry

`HarnessModelProviderRegistry` validates provider namespaces and resolves model refs.

```ts
import { HarnessModelProviderRegistry } from "@harness-kernel/core/runner/model-provider";
import { OpenAIProvider } from "@harness-kernel/provider-openai";

const registry = new HarnessModelProviderRegistry([new OpenAIProvider()]);
const resolved = registry.resolve("openai/gpt-5.1");
```

If a model provider returns `getModels()`, the registry checks the model id against that list. Providers that do not expose a model list accept any model id under their namespace.

## Mode Preferences

A mode can declare a preferred model, but it does not own the provider object or credentials:

```ts
class ResearchMode extends HarnessMode {
  model = "openai/gpt-5.1";
}
```

That value is still resolved through the runtime host provider registry.
