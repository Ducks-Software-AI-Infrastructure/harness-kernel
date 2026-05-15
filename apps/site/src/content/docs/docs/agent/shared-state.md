---
title: Shared State
description: Read, update, and replace agent-owned shared state.
---

Shared state is per-session state owned by the agent package. It is useful for behavior memory that tools, hooks, modes, and context providers need to share.

## Initial State

```ts
export const agent = defineAgent({
  key: "support-agent",
  label: "Support Agent",
  initialMode: supportMode,
  modes: [supportMode],
  sharedState: {
    initial: () => ({
      productArea: "general",
      escalations: [],
    }),
  },
});
```

Use a function when the initial value contains arrays or objects that should not be shared across sessions.

## Agent-Facing State

`AgentReadSession` can read state:

```ts
const state = session.state.get();
```

`AgentActionSession` can update or replace state:

```ts
session.state.update({ productArea: "billing" });
session.state.set({ productArea: "billing", escalations: [] });
```

The public runtime session mirrors this with host methods:

```ts
const session = await store.getOrCreate("support-1");
session.updateState({ productArea: "billing" });
session.replaceState({ productArea: "billing", escalations: [] });
```

## State vs Services

Put small behavior state in shared state: mode flags, conversation preferences, ids that tools need, or derived context.

Keep host infrastructure in `services`: database clients, ticketing clients, feature flags, user identity providers, or request-scoped application dependencies. Services are injected by the runtime host and read through `session.services`.
