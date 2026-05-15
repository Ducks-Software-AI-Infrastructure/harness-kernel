---
title: Define an Agent
description: Package Harness Kernel behavior with defineAgent.
---

`defineAgent` packages behavior for a runtime host. The result is an `AgentDefinition`; it does not create a session, register model providers, configure storage, or start execution.

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";

class ChatMode extends HarnessMode {
  label = "Chat";
  prompt = "Answer concisely and ask one clarifying question when needed.";
}

const chatMode = new ChatMode();

export const agent = defineAgent({
  key: "support-agent",
  label: "Support Agent",
  initialMode: chatMode,
  modes: [chatMode],
});
```

## Fields

| Field | Owner | Notes |
| --- | --- | --- |
| `key` | Agent | Stable identity used in manifests, storage records, and status. |
| `label` | Agent | Human-readable label. |
| `initialMode` | Agent | Mode selector used when a session starts unless the host overrides `initialMode`. |
| `modes` | Agent | All modes available for `session.switchMode()` and agent behavior. |
| `roles` | Agent | Custom role definitions and built-in role overrides. |
| `hooks` | Agent | Agent-owned reactions to events. |
| `declaredEvents` | Agent | Custom event classes the package declares. |
| `sharedState` | Agent | Initial state for sessions using this agent. |

## Shared State

```ts
export const agent = defineAgent({
  key: "stateful-agent",
  label: "Stateful Agent",
  initialMode: chatMode,
  modes: [chatMode],
  sharedState: {
    initial: () => ({ escalations: [], productArea: "general" }),
  },
});
```

Shared state is part of behavior because tools, hooks, context providers, and modes can read it. External databases and service clients still belong to the runtime host and should be passed through `services`.

## Runtime Boundary

The runtime host imports the agent and gives it infrastructure:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
});
```

See [Session Store](../../runtime/session-store/) for host-owned configuration.
