---
title: Runtime vs Agent
description: The main responsibility boundary in Harness Kernel.
---

Harness Kernel separates agent behavior from runtime ownership. This split is the main design tool for every package, example, and host integration.

The point of the split is coupling control. Agent packages should couple to kernel contracts such as modes, tools, hooks, roles, context providers, events, and agent-facing sessions. They should not couple to a specific model SDK, storage backend, sandbox implementation, logging sink, approval UI, or deployment host.

| Agent behavior | Runtime ownership |
| --- | --- |
| `defineAgent()` packages behavior. | `createHarnessSessionStore()` hosts behavior. |
| Modes declare prompts, tools, context, and optional model preference. | The host registers available model providers and a required `defaultModel`. |
| Tools are mode-owned behavior. | Approval policy and pending approval resolution are runtime-owned. |
| Hooks are agent behavior. | Session event listeners and streams are runtime observation. |
| Roles and custom events travel with the agent. | Storage, sandboxing, logs, resources, and session lifecycle stay with the app. |

## Agent Behavior

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { BashTool } from "@harness-kernel/tools-node";

class DevMode extends HarnessMode {
  model = "openai/gpt-5.1";
  prompt = "You are a careful coding assistant.";
  tools = [new BashTool()];
}

const devMode = new DevMode();

export const agent = defineAgent({
  key: "dev-agent",
  label: "Dev Agent",
  initialMode: devMode,
  modes: [devMode],
});
```

This package does not decide which OpenAI key to use, where transcripts are stored, which sandbox is allowed, or how approvals are shown to a user.

## Runtime Host

```ts
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { agent } from "./agent.js";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
});
```

The runtime host owns the provider list and the fallback model. It may also attach storage, sandbox, logging, and resources. Approval policy and turn limits live on modes and tools.

## Coupling Rule

Treat agent code as portable behavior and runtime code as host infrastructure. If a dependency is required to decide what the agent does, keep it in agent space behind kernel contracts. If a dependency is required to decide how the app runs, observes, persists, approves, or isolates the agent, keep it in the runtime host.

That rule keeps an agent testable without production infrastructure and lets a host replace OpenAI, file storage, sandboxing, logging, or approval surfaces without rewriting modes and tools.

## Boundary Rules

- Tools always belong to modes.
- Hooks are agent-owned behavior.
- Streams, `session.on()`, and `session.onEvent()` are runtime observation.
- `providers` and `defaultModel` are host-owned.
- Agents should not import host-only provider, storage, sandbox, logging, or resource packages.
- `@harness-kernel/create` is only a scaffold/devtool package.

When a design question is unclear, ask whether the concern changes behavior or changes hosting. Behavior goes into agent space; hosting goes into the runtime host.
