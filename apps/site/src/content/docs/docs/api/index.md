---
title: API Guide
description: How to navigate the generated Harness Kernel API reference.
---

The API reference is generated from public package exports with TypeDoc. Manual docs explain the responsibility boundary; generated docs expose exact classes, types, interfaces, and helpers.

Start with these groups:

- [Reference root](./reference/)
- [`@harness-kernel/core`](./reference/core/) for the root package surface.
- [`@harness-kernel/core/agent`](./reference/core/agent/) and child subpaths for agent-space behavior contracts.
- [`@harness-kernel/core/runner`](./reference/core/runner/) and child subpaths for runtime host contracts.
- [`@harness-kernel/core/schema`](./reference/core/schema/) for official schema primitives.
- Optional package roots for [OpenAI](./reference/provider-openai/), [AI SDK](./reference/provider-ai-sdk/), [file storage](./reference/storage-file/), [local sandbox](./reference/sandbox-local/), [Node tools](./reference/tools-node/), [file logging](./reference/logging-file/), and [create](./reference/create/).

Generated pages include a notice at the top and should not be edited directly. Run:

```bash
pnpm docs:api
```

Then run:

```bash
pnpm docs:build
```
