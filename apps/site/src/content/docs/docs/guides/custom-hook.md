---
title: Custom Hook
description: React to built-in events as agent-owned behavior.
---

Objective: add behavior that records state after a model response.

```ts
import { ModelAfterEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";

class LastModelOutputHook extends HarnessHook.for(ModelAfterEvent) {
  async onActive(session, event) {
    session.state.update({
      lastModel: event.payload.model,
      lastAnswerLength: event.payload.content.length,
    });
  }
}
```

Register it:

```ts
export const agent = defineAgent({
  key: "hook-guide",
  label: "Hook Guide",
  initialMode: chatMode,
  modes: [chatMode],
  hooks: [new LastModelOutputHook()],
});
```

Boundary note: the hook changes agent behavior. A host analytics listener would use `session.onEvent(ModelAfterEvent, listener)` instead.

API: [Hooks](../../agent/hooks/) and [Events](../../agent/events/).
