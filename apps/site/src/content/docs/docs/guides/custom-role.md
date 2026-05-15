---
title: Custom Role
description: Define a custom role and register it with an agent.
---

Objective: give agent behavior a named role that maps to a native provider role.

```ts
import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";

class CriticRole extends HarnessRole {
  label = "Critic";
  name = "critic";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
  description = "A review-oriented user message.";
}

export const criticRole = new CriticRole();
```

Register it:

```ts
export const agent = defineAgent({
  key: "review-agent",
  label: "Review Agent",
  initialMode: reviewMode,
  modes: [reviewMode],
  roles: [criticRole],
});
```

Use it when sending host input:

```ts
await session.send({
  content: "Review this answer for unsupported claims.",
  role: criticRole,
});
```

Boundary note: roles affect behavior and model-facing messages, so they belong to the agent package.

API: [Roles](../../agent/roles/).
