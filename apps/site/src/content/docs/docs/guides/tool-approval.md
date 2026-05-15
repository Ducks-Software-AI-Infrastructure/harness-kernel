---
title: Tool Approval
description: Request and resolve tool approvals from the runtime host.
---

Objective: run with `toolApproval: "ask"` and resolve pending tool requests.

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  toolApproval: "ask",
});

const stream = await store.stream("approval-guide", "Write a project summary.");

for await (const event of stream) {
  if (event.type === "tool.approval.requested") {
    if (event.approval.risk === "write") {
      await event.approval.approve();
    } else {
      await event.approval.deny("Only write approvals are expected here.");
    }
  }
}
```

Tools opt into approval:

```ts
class WriteSummaryTool extends HarnessTool<WriteSummaryInput> {
  risk = "write" as const;
  requiresApproval = true;
}
```

Boundary note: the tool requests approval as behavior metadata; the runtime host decides the policy and the user flow.

API: [Approvals](../../runtime/approvals/).
