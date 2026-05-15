---
title: "@harness-kernel/create"
description: Scaffold and devtool package for new Harness Kernel projects.
---

`@harness-kernel/create` is a scaffold and devtool package. It should not be treated as hidden infrastructure.

```bash
pnpm create @harness-kernel
pnpm create @harness-kernel one-file my-agent
pnpm create @harness-kernel full my-agent
```

The scaffold writes starter files with explicit dependencies and runtime composition. After scaffolding, your app still owns:

- model providers;
- required `defaultModel`;
- storage;
- sandbox;
- approval policy;
- logging;
- services;
- session lifecycle.

Use generated projects as examples, then keep imports pointed at real public package subpaths.
