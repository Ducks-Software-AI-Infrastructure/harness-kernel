---
title: Modes
description: Define prompts, model preferences, context, tools, lifecycle, and turn limits.
---

`HarnessMode` is the main behavior unit. Modes own prompts, tool lists, context provider selection, optional model preference, lifecycle methods, and per-mode execution policy.

```ts
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createFileSystemTools } from "@harness-kernel/tools-node";

class DevMode extends HarnessMode {
  label = "Developer";
  prompt = "You are a careful coding assistant.";
  model = "openai/gpt-5.1";
  tools = createFileSystemTools();
  maxTurns = 8;
  toolApproval = "tool-default" as const;
}
```

## Prompt

Use a string when the prompt is static:

```ts
class SupportMode extends HarnessMode {
  prompt = "Handle support tickets. Be precise and factual.";
}
```

Use `getPrompt()` or a prompt function when the prompt depends on session state or services:

```ts
class ProjectMode extends HarnessMode {
  async getPrompt(session) {
    return `Work in ${session.workDir}. Current mode: ${session.mode.current().label}.`;
  }
}
```

## Context Providers

`providers` can be `"all"` or a list of context provider references. Use `excludeProviders` to omit a provider type from the active mode.

```ts
class ResearchMode extends HarnessMode {
  providers = [new ProjectContext().with({ includeFiles: true })];
}
```

## Lifecycle

`onEnter()` and `onExit()` are agent behavior. They receive an `AgentActionSession`, so they can update state, emit events, add context, enqueue messages, or switch modes.

```ts
class ReviewMode extends HarnessMode {
  async onEnter(session) {
    session.state.update({ reviewStarted: true });
  }
}
```

## Runtime Boundary

Mode `model` is a preference, not a provider registration. The runtime host still owns `providers` and required `defaultModel`. Tools in `tools` are mode-owned behavior; runtime approval policy decides whether they may execute.
