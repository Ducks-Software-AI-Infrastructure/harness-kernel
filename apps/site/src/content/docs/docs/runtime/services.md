---
title: Resources
description: Inject host dependencies into agent behavior without global state.
---

`resources` lets the runtime host pass application dependencies into agent behavior. Use resources for host-owned infrastructure such as database clients, user records, ticketing clients, feature flags, or request-scoped APIs.

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  resources: {
    tickets: ticketClient,
    currentUser: { id: "user-1", plan: "team" },
  },
});
```

Agent behavior reads resources through the session:

```ts
import type { AgentActionSession } from "@harness-kernel/core/agent/session";

interface Resources {
  tickets: {
    create(input: { title: string }): Promise<{ id: string }>;
  };
}

async function createTicket(session: AgentActionSession<Record<string, unknown>, Resources>) {
  return session.resources.tickets.create({ title: "Follow up" });
}
```

## Resources vs Shared State

Use shared state for small behavior-owned data that should move with the session. Use resources for host-owned dependencies and external systems.

Avoid module-level singletons in tools and hooks. Passing resources through the runtime config keeps tests isolated and lets hosts provide tenant-specific dependencies.
