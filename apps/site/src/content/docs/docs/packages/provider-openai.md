---
title: "@harness-kernel/provider-openai"
description: OpenAI model provider package for Harness Kernel.
---

`@harness-kernel/provider-openai` provides `OpenAIProvider`, a runtime-owned model provider under the `openai` namespace.

```ts
import { OpenAIProvider } from "@harness-kernel/provider-openai";

const provider = new OpenAIProvider({
  apiKeyEnv: "OPENAI_API_KEY",
  models: [{ id: "gpt-5.1", label: "GPT-5.1" }],
});
```

Use it in runtime composition:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
});
```

Options include `id`, `apiKey`, `apiKeyEnv`, `baseURL`, `headers`, and `models`. The provider reads `OPENAI_API_KEY` by default when no explicit key option is provided.

The package is optional runtime infrastructure; agents should not require it unless they are documenting a host setup.
