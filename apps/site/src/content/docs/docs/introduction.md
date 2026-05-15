---
title: Introduction
description: What Harness Kernel is and how it separates agent behavior from runtime ownership.
---

Harness Kernel is a small TypeScript runtime kernel for building app-owned AI agents. It gives your application explicit contracts for sessions, modes, tools, events, approvals, schemas, logging, storage, sandboxing, and model provider routing.

The central goal is controlled coupling. Agent packages depend on stable kernel contracts for behavior, while host applications choose model providers, storage, sandboxing, logging, services, and approval surfaces. That keeps the same agent reusable across a CLI, backend service, web app session, or another host without importing host infrastructure into the agent package.

The core rule is responsibility separation:

| Area | Owns | Public API examples |
| --- | --- | --- |
| Agent behavior | what the agent is and how it behaves | `defineAgent`, `HarnessMode`, `HarnessTool`, `HarnessHook`, `HarnessRole` |
| Runtime host | how the app executes, observes, stores, approves, and configures the agent | `createHarnessSessionStore`, `providers`, `defaultModel`, `storage`, `sandbox`, `logging` |

`@harness-kernel/core` has zero external runtime dependencies. It does not import OpenAI, the AI SDK, Zod, filesystem storage, local shell execution, or any default app runtime. Optional packages provide concrete integrations only when your host installs them.

## What It Is For

Use Harness Kernel when you want an agent that belongs to your application rather than to a hidden framework runtime. The agent package can be tested and reused as behavior. The host can make separate operational decisions about model providers, persistence, sandboxing, approval policy, and logs without coupling those decisions back into agent code.

That makes Harness Kernel a good fit for CLIs, backend workers, web app sessions, desktop apps, and internal tools where the app already owns infrastructure.

## What It Is Not

Harness Kernel is not a full-stack agent framework and does not ship a bundled app runtime. There is no implicit model provider, implicit storage backend, implicit sandbox, or implicit tool catalog.

`@harness-kernel/create` is a scaffold and devtool package. It writes starter projects; it is not the runtime your application hosts.

## First APIs To Learn

- `defineAgent` from `@harness-kernel/core/agent` packages behavior.
- `HarnessMode` from `@harness-kernel/core/agent/mode` defines mode prompts, model preference, tools, context providers, and lifecycle.
- `HarnessTool` from `@harness-kernel/core/agent/tool` defines mode-owned tool behavior.
- `createHarnessSessionStore` from `@harness-kernel/core/runner` creates runtime-owned sessions.
- `HarnessModelProvider` from `@harness-kernel/core/runner/model-provider` is the contract that executes model turns.

Next: [Getting Started](../getting-started/) and [Runtime vs Agent](../concepts/runtime-vs-agent/).
