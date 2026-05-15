---
title: Roles
description: Define built-in and custom message roles for agent behavior.
---

Roles describe how messages and context contributions are represented. They are agent behavior because they affect the model-facing transcript and hidden/system message handling.

Built-in roles are exported from `@harness-kernel/core/agent/role`:

```ts
import {
  HarnessRole,
  NativeRoles,
  RoleTargets,
  assistantRole,
  systemRole,
  toolRole,
  userRole,
} from "@harness-kernel/core/agent/role";
```

## Built-In Roles

| Role | Target | Native role |
| --- | --- | --- |
| `systemRole` | `RoleTargets.System` | `NativeRoles.System` |
| `userRole` | `RoleTargets.Messages` | `NativeRoles.User` |
| `assistantRole` | `RoleTargets.Messages` | `NativeRoles.Assistant` |
| `toolRole` | `RoleTargets.Messages` | `NativeRoles.Tool` |

## Custom Role

```ts
class CriticRole extends HarnessRole {
  label = "Critic";
  name = "critic";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
  description = "Review-oriented user message.";
}

export const criticRole = new CriticRole();
```

Register the role with the agent:

```ts
export const agent = defineAgent({
  key: "review-agent",
  label: "Review Agent",
  initialMode: reviewMode,
  modes: [reviewMode],
  roles: [criticRole],
});
```

## Role Targets

- `RoleTargets.System` contributes to system-level context.
- `RoleTargets.Messages` contributes to the model message list.
- `RoleTargets.Hidden` is kept out of model-visible messages while remaining available to runtime records.

The runtime model provider may map roles into a provider-native shape, but the role definition stays with the agent.
