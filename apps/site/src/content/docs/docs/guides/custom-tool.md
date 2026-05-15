---
title: Custom Tool
description: Add a mode-owned tool with Harness schema and structured results.
---

Objective: define a tool that updates shared state and returns structured data.

```ts
import type { AgentActionSession } from "@harness-kernel/core/agent/session";
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { s, type InferInput } from "@harness-kernel/core/schema";

const rememberSchema = s.object({
  note: s.string().min(1),
});

type RememberInput = InferInput<typeof rememberSchema>;

class RememberNoteTool extends HarnessTool<RememberInput, { count: number }> {
  name = "remember_note";
  description = "Remember a note in shared state.";
  schema = rememberSchema;
  risk = "write" as const;
  requiresApproval = true;

  async execute(args: RememberInput, session: AgentActionSession) {
    const input = rememberSchema.parse(args);
    const state = session.state.get();
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const next = [...notes, input.note];
    session.state.update({ notes: next });
    return {
      content: `Remembered ${input.note}`,
      data: { count: next.length },
      metadata: { stateKey: "notes" },
    };
  }
}
```

Attach it to a mode:

```ts
class NotesMode extends HarnessMode {
  tools = [new RememberNoteTool()];
}
```

Boundary note: the tool belongs to a mode. The runtime host still decides approval policy and sandbox access.

API: [Tools](../../agent/tools/) and [Tool Schemas](../../schema/tool-schemas/).
