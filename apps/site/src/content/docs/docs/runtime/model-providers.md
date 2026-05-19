---
title: Model Providers
description: Register runtime-owned model providers and resolve namespaced model refs.
---

Model providers are runtime infrastructure. They execute model turns for namespaced model refs such as `openai/gpt-5.1`.

```ts
import type {
  HarnessModelProvider,
  ModelProviderRunInput,
  ModelProviderRunResult,
} from "@harness-kernel/core/runner/model-provider";

class EchoProvider implements HarnessModelProvider {
  namespace = "echo";

  async run(input: ModelProviderRunInput): Promise<ModelProviderRunResult> {
    const last = input.messages.at(-1);
    return { content: `echo: ${last?.content ?? ""}` };
  }
}
```

Register providers in the session store:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new EchoProvider()],
  defaultModel: "echo/basic",
});
```

## Provider Contract

| Member | Notes |
| --- | --- |
| `namespace` | Required namespace used before `/` in model refs. |
| `id` | Optional provider instance id. |
| `configSchema` | Optional schema for provider configuration. |
| `run(input)` | Executes the turn and returns model content, usage, finish reason, and raw data. |
| `getInfo()` | Optional provider metadata for session status. |
| `getModels()` | Optional model list for validation. |
| `supportsRole(roleId)` | Optional role support check. |

`ModelProviderRunInput` includes system prompt, messages, roles, tools, max turns, model ref, provider namespace, model id, abort signal, and callbacks for events, tool execution, and context refresh.

## Provider Failures

Provider errors are normalized by the runtime as `model.failed`, `model.timeout`, `model.rate_limited`, or `run.aborted` when the abort signal ends the call. The host can configure conservative model-provider retry without putting retry policy in the agent:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new EchoProvider()],
  defaultModel: "echo/basic",
  errorPolicy: {
    retry: { model: { attempts: 2, backoffMs: 500, maxBackoffMs: 5000 } },
  },
});
```

Retry is only applied to model provider calls and is skipped after provider-emitted events or tool execution.

## Resolution

The runtime resolves models in this order: run override, session override, mode `model`, then required `defaultModel`.

Use `parseModelRef()` and `HarnessModelProviderRegistry` when building or testing provider behavior:

```ts
import {
  HarnessModelProviderRegistry,
  parseModelRef,
} from "@harness-kernel/core/runner/model-provider";

parseModelRef("echo/basic");
new HarnessModelProviderRegistry([new EchoProvider()]).resolve("echo/basic");
```
