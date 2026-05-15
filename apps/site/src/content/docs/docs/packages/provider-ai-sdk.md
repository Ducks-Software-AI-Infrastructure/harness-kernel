---
title: "@harness-kernel/provider-ai-sdk"
description: Generic Vercel AI SDK model provider bridge.
---

`@harness-kernel/provider-ai-sdk` provides `AiSdkModelProvider` and `createAiSdkModelProvider`. It lets a runtime host bridge a Vercel AI SDK `LanguageModel` into the `HarnessModelProvider` contract.

```ts
import { createAiSdkModelProvider } from "@harness-kernel/provider-ai-sdk";

const provider = createAiSdkModelProvider({
  namespace: "custom",
  label: "Custom AI SDK Provider",
  resolveModel(model, input) {
    return resolveLanguageModel(model, input);
  },
});
```

The provider handles model messages, AI SDK tool wiring, streaming text deltas, context refresh between tool steps, and `MessageDeltaEvent` emission.

Use this package when your host already uses the AI SDK and wants to keep model provider ownership explicit.
