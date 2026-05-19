---
title: Context Provider
description: Render dynamic context for a mode.
---

Objective: add a provider that reads shared state and contributes context.

```ts
import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import type { AgentReadSession } from "@harness-kernel/core/agent/session";

class NotesContext extends HarnessContextProvider<{ max?: number }> {
  label = "Notes Context";
  required = false;

  render(session: AgentReadSession, options: { max?: number } = {}) {
    const stateNotes = session.state.get().notes;
    const notes = Array.isArray(stateNotes) ? stateNotes.map(String) : [];
    const max = options.max ?? 5;
    if (!notes.length) return null;
    return `Known notes:\n${notes.slice(-max).join("\n")}`;
  }
}
```

Attach it to a mode:

```ts
class NotesMode extends HarnessMode {
  providers = [new NotesContext().with({ max: 3 })];
}
```

Boundary note: the provider is behavior. The data it reads may come from shared state or runtime resources.

Hosts that want optional provider failures to be skipped can opt in:

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new EchoProvider()],
  defaultModel: "echo/basic",
  errorPolicy: { contextFailure: "warn-and-skip" },
});
```

API: [Context Providers](../../agent/context-providers/).
