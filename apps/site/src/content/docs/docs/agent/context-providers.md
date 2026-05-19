---
title: Context Providers
description: Render dynamic context as agent-owned behavior.
---

`HarnessContextProvider` renders dynamic context for a run. Context providers belong to agent behavior because they decide what the agent sees and how it is represented to the model provider.

```ts
import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import type { AgentReadSession } from "@harness-kernel/core/agent/session";

class ProjectContext extends HarnessContextProvider<{ includeWorkDir?: boolean }> {
  label = "Project Context";
  required = false;

  render(session: AgentReadSession, options = {}) {
    if (!options.includeWorkDir) return null;
    return `Current workDir: ${session.workDir}`;
  }
}
```

Attach a provider to a mode:

```ts
class DevMode extends HarnessMode {
  providers = [new ProjectContext().with({ includeWorkDir: true })];
}
```

## Output Forms

`render()` can return:

- a string contribution;
- a `ContextContributionInput` with explicit role and metadata;
- an array of strings/contributions;
- `null` or `undefined` when there is no context for this turn.

```ts
return {
  role: systemRole,
  content: "Prefer short final answers.",
  metadata: { source: "project-policy" },
};
```

## Runtime Context Session

Agent code can also add or render context during lifecycle or hooks:

```ts
await session.context.add(
  { content: "The customer has an open escalation." },
  { scope: ContextScopes.Session, consume: ContextConsume.WhileActive },
);
```

Use `ContextScopes.Turn`, `ContextScopes.Run`, or `ContextScopes.Session` to control lifetime. Use `ContextConsume.Once` or `ContextConsume.WhileActive` to control consumption.

## Boundary

Context providers define behavior. Runtime resources can be read through `session.resources`, but the provider object itself belongs to the agent package.

Set `required = false` on a provider, or use a binding such as `{ provider, options, required: false }`, when missing context should not necessarily fail the run. The runtime still decides the final behavior through `errorPolicy.contextFailure`; by default provider failures are fatal.
