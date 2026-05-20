---
title: Package Boundaries
description: Public subpaths and optional package responsibilities.
---

Harness Kernel packages expose public subpaths for the responsibility boundary. Import from those subpaths instead of reaching into package internals.

Package boundaries are also coupling boundaries. Agent packages should depend on `@harness-kernel/core/agent/*` and schema contracts for behavior. Host applications should depend on runner contracts and optional infrastructure packages when they choose concrete providers, storage, sandboxing, logging, or resources.

## Core Public Subpaths

| Subpath | Use |
| --- | --- |
| `@harness-kernel/core` | Broad root exports for core contracts and utilities. |
| `@harness-kernel/core/agent` | `defineAgent` and agent definition types. |
| `@harness-kernel/core/agent/mode` | `HarnessMode` and mode types. |
| `@harness-kernel/core/agent/tool` | `HarnessTool` and tool result types. |
| `@harness-kernel/core/agent/context` | `HarnessContextProvider` and context contribution types. |
| `@harness-kernel/core/agent/hook` | `HarnessHook` and hook types. |
| `@harness-kernel/core/agent/role` | `HarnessRole`, built-in roles, role targets, native roles. |
| `@harness-kernel/core/agent/event` | `HarnessEvent` and built-in event classes. |
| `@harness-kernel/core/agent/session` | Agent-facing session contracts. |
| `@harness-kernel/core/runner` | `createHarnessSessionStore` and runtime session contracts. |
| `@harness-kernel/core/runner/model-provider` | Model provider contracts and registry helpers. |
| `@harness-kernel/core/runner/storage` | Storage contracts, memory storage, noop storage. |
| `@harness-kernel/core/runner/sandbox` | Sandbox contracts and noop sandbox. |
| `@harness-kernel/core/runner/approval` | Runtime approval handle and decision types. |
| `@harness-kernel/core/runner/logging` | Runtime logging contracts and memory/console sinks. |
| `@harness-kernel/core/schema` | Official schema primitives and normalization helpers. |

## Optional Packages

Optional packages are explicit host choices:

- `@harness-kernel/provider-openai` registers the `openai` model provider namespace.
- `@harness-kernel/provider-ai-sdk` bridges Vercel AI SDK language models into `HarnessModelProvider`.
- `@harness-kernel/storage-file` provides `FileSessionStorage`.
- `@harness-kernel/storage-postgres` provides `PostgresSessionStorage`.
- `@harness-kernel/sandbox-docker` provides `DockerSandbox`.
- `@harness-kernel/sandbox-local` provides `LocalSandbox`.
- `@harness-kernel/tools-node` provides mode-owned Node tools.
- `@harness-kernel/logging-file` provides `JsonlFileLogSink`.
- `@harness-kernel/create` scaffolds projects and is not runtime infrastructure.

## Import Rule

Prefer the narrow public subpath that matches the owner:

```ts
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { FileSessionStorage } from "@harness-kernel/storage-file";
```

This keeps examples honest about whether code belongs to agent space or runtime host space.

## Coupling Smells

Move code back across the boundary when you see these smells:

- An agent package imports `@harness-kernel/provider-openai`, `@harness-kernel/storage-file`, `@harness-kernel/sandbox-docker`, `@harness-kernel/sandbox-local`, or logging sinks.
- A reusable mode needs a production API key, filesystem path, approval UI, or deployment-specific resource to load.
- A runtime host hard-codes prompts, mode tools, custom events, or hooks that should travel with the agent definition.
- A guide cannot say whether a dependency exists for behavior or for hosting.

The preferred shape is narrow coupling: agent behavior couples to kernel agent contracts, and runtime infrastructure couples to host-selected modules.
