---
title: Getting Started
description: Build a minimal agent and host it with explicit runtime composition.
---

This guide builds the smallest useful split: an agent package defines behavior, and the host application creates a session store with an explicit model provider and `defaultModel`.

## Define Behavior

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import { HarnessEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";
import type { AgentActionSession, AgentReadSession } from "@harness-kernel/core/agent/session";
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { s, type InferInput } from "@harness-kernel/core/schema";

type StarterState = {
  notes: string[];
  lastNoteAt?: string;
};

const rememberSchema = s.object({
  note: s.string().min(1),
});

type RememberInput = InferInput<typeof rememberSchema>;

class NoteRememberedEvent extends HarnessEvent<{ note: string }> {
  static type = "note.remembered";
}

class ReviewerRole extends HarnessRole {
  label = "Reviewer";
  name = "reviewer";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
  description = "A review-focused message role.";
}

class SessionContext extends HarnessContextProvider {
  label = "Session Context";

  render(session: AgentReadSession<StarterState>) {
    const state = session.state.get();
    return [
      `Mode: ${session.mode.current().type}`,
      `Remembered notes: ${state.notes.join(", ") || "none"}`,
    ].join("\n");
  }
}

class RememberNoteTool extends HarnessTool<RememberInput> {
  name = "remember_note";
  description = "Remember a note in shared agent state.";
  schema = rememberSchema;
  risk = "write" as const;
  requiresApproval = true;

  async execute(input: RememberInput, session: AgentActionSession<StarterState>) {
    const parsed = rememberSchema.parse(input);
    const next = [...session.state.get().notes, parsed.note];
    session.state.update({ notes: next, lastNoteAt: new Date().toISOString() });
    await session.events.emit(NoteRememberedEvent, { note: parsed.note });
    return { content: `Remembered: ${parsed.note}`, data: { count: next.length } };
  }
}

class ChatMode extends HarnessMode {
  label = "Chat";
  model = "openai/gpt-5.1";
  prompt = "Answer clearly, keep useful notes, and ask for missing requirements.";
  providers = [new SessionContext()];
  tools = [new RememberNoteTool()];
  maxTurns = 8;
  toolApproval = "ask" as const;

  onEnter(session: AgentActionSession<StarterState>) {
    session.log.info("mode.enter", { mode: this.type });
  }
}

class NoteHook extends HarnessHook.for(NoteRememberedEvent) {
  onActive(session: AgentActionSession<StarterState>, event: NoteRememberedEvent) {
    session.log.info("note.remembered", { note: event.payload.note });
  }
}

const chatMode = new ChatMode();

export const agent = defineAgent({
  key: "starter-agent",
  label: "Starter Agent",
  sharedState: {
    initial: () => ({ notes: [] }),
  },
  declaredEvents: [NoteRememberedEvent],
  initialMode: chatMode,
  modes: [chatMode],
  roles: [new ReviewerRole()],
  hooks: [new NoteHook()],
});
```

This behavior package belongs to agent space. The mode owns tools and context providers, hooks are registered with the agent, and custom events are declared with the agent. This keeps coupling narrow: the agent depends on kernel behavior contracts, not on OpenAI, storage, sandboxing, logging sinks, approval UI, or a specific host. The runtime still owns model providers, storage, sandboxing, logging sinks, approvals, and session lifecycle.

## Compose The Runtime

```ts
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileSessionStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileSessionStorage(),
  sandbox: new LocalSandbox({ workDir: "." }),
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
});

try {
  const result = await store.send("starter", "Summarize the project.");
  console.log(result.answer);
} finally {
  await store.close();
}
```

`defaultModel` is required and must use the namespaced `<provider>/<model>` format. A mode can declare `model`, a session can call `session.setModel()`, and a single run can pass `send(..., { model })`.

## Install Packages

```bash
pnpm add @harness-kernel/core @harness-kernel/provider-openai
pnpm add @harness-kernel/storage-file @harness-kernel/sandbox-local
```

Only install optional packages your host needs. A core-only runtime can use `MemorySessionStorage`, `NoopSandbox`, and a custom `HarnessModelProvider`; see [Core-only Agent](../guides/core-only-agent/).

## Where To Go Next

- [Runtime vs Agent](../concepts/runtime-vs-agent/) explains the boundary.
- [Session Store](../runtime/session-store/) covers runtime configuration.
- [Define an Agent](../agent/define-agent/) covers agent packaging.
- [API Guide](../api/) links into generated reference pages.
