---
title: "@harness-kernel/tools-node"
description: Node-oriented mode-owned Bash and filesystem tools.
---

`@harness-kernel/tools-node` provides ready-made tools for Node-based hosts.

```ts
import {
  BashTool,
  ReadFileTool,
  WriteFileTool,
  createCoreTools,
  createFileSystemTools,
} from "@harness-kernel/tools-node";
```

Attach tools to a mode:

```ts
class CliMode extends HarnessMode {
  tools = createCoreTools();
}
```

Exports include `BashTool`, `ReadFileTool`, `WriteFileTool`, `EditFileTool`, `GlobTool`, `GrepTool`, and factory helpers. Subpaths `@harness-kernel/tools-node/bash` and `@harness-kernel/tools-node/files` are public.

These tools are mode-owned behavior. They need a runtime sandbox, such as `LocalSandbox` or `DockerSandbox`, to execute successfully. The mode chooses the tools; the host chooses the sandbox implementation and operational policy.
