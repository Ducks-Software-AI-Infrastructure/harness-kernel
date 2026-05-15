---
title: Hooks
description: React to runtime events as agent-owned behavior.
---

Hooks are agent behavior. Session event listeners are runtime observation.

Use `HarnessHook.for(EventClass)` to bind a hook to an event class:

```ts
import { ToolEndEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";

class ToolSummaryHook extends HarnessHook.for(ToolEndEvent) {
  label = "Tool Summary";

  async onActive(session, event) {
    session.log.info("Tool completed.", {
      name: event.payload.name,
      durationMs: event.payload.durationMs,
    });
  }
}
```

Register hooks with the agent:

```ts
export const agent = defineAgent({
  key: "hooked-agent",
  label: "Hooked Agent",
  initialMode: chatMode,
  modes: [chatMode],
  hooks: [new ToolSummaryHook()],
});
```

## What Hooks Should Do

Hooks are useful for behavior-level reactions:

- update shared state after a custom event;
- add context for the next turn;
- enqueue a follow-up message;
- switch modes after a declared event;
- emit a behavior-level log record.

## What Runtime Observers Should Do

Use `session.on()` and `session.onEvent()` when the host wants to observe runs without changing behavior:

```ts
session.onEvent(ToolEndEvent, (event) => {
  analytics.track("tool_end", event.payload);
});
```

That listener belongs to the host application. It should not be required for the agent package to behave correctly.
