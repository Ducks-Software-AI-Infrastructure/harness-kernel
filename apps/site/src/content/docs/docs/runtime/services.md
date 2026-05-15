---
title: Services
description: Inject host dependencies into agent behavior without global state.
---

`services` lets the runtime host pass application dependencies into agent behavior. Use services for host-owned infrastructure such as database clients, user records, ticketing clients, feature flags, or request-scoped APIs.

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  services: {
    tickets: ticketClient,
    currentUser: { id: "user-1", plan: "team" },
  },
});
```

Agent behavior reads services through the session:

```ts
import type { AgentActionSession } from "@harness-kernel/core/agent/session";

interface Services {
  tickets: {
    create(input: { title: string }): Promise<{ id: string }>;
  };
}

async function createTicket(session: AgentActionSession<Record<string, unknown>, Services>) {
  return session.services.tickets.create({ title: "Follow up" });
}
```

## Services vs Shared State

Use shared state for small behavior-owned data that should move with the session. Use services for host-owned dependencies and external systems.

Avoid module-level singletons in tools and hooks. Passing services through the runtime config keeps tests isolated and lets hosts provide tenant-specific dependencies.
