---
title: Tools
description: Define mode-owned tools with schemas, risk metadata, approval hints, and execution results.
---

Tools belong to modes. They describe behavior the agent can ask to run, while the runtime host owns sandboxing and approval policy.

```ts
import type { AgentActionSession } from "@harness-kernel/core/agent/session";
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { s, type InferInput } from "@harness-kernel/core/schema";

const noteSchema = s.object({
  text: s.string().min(1),
});

type NoteInput = InferInput<typeof noteSchema>;

class RememberNoteTool extends HarnessTool<NoteInput> {
  name = "remember_note";
  description = "Store a note in shared session state.";
  schema = noteSchema;
  risk = "write" as const;
  requiresApproval = true;

  async execute(args: NoteInput, session: AgentActionSession) {
    const input = noteSchema.parse(args);
    const state = session.state.get();
    const notes = Array.isArray(state.notes) ? state.notes : [];
    session.state.update({ notes: [...notes, input.text] });

    return {
      content: `Remembered: ${input.text}`,
      data: { count: notes.length + 1 },
      metadata: { stored: true },
    };
  }
}
```

## Tool Fields

| Field | Notes |
| --- | --- |
| `name` | Stable tool name exposed to the model provider. |
| `description` | Human and model-facing description. |
| `schema` | Harness schema, JSON Schema, Zod, Standard Schema, or compatible custom schema. |
| `risk` | `safe`, `read`, `write`, `execute`, `network`, or `destructive`. |
| `permissions` | Filesystem, shell, network, or custom permission metadata. |
| `requiresApproval` | Boolean or resolver function; runtime policy still makes the final approval decision. |
| `execute` | Receives parsed args and `AgentActionSession`. |

## Result Shape

`execute()` returns `AgentToolResult`:

```ts
return {
  content: "Wrote report.md",
  data: { path: "report.md" },
  refs: [{ kind: "file", path: "report.md", role: "created" }],
  metadata: { bytes: 1200 },
  isError: false,
};
```

Use `isError: true` when a tool failed but the model provider should receive a structured result rather than an exception.

## Mode Ownership

Attach tools to a mode:

```ts
class NotesMode extends HarnessMode {
  tools = [new RememberNoteTool()];
}
```

The session store does not define a global tool catalog. Runtime hosts provide sandboxing and approval policy; modes decide which tools are available for behavior.
