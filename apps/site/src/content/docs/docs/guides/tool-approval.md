---
title: Tool Approval
description: Request and resolve tool approvals from modes and tools.
---

Objective: run a mode with `toolApproval = "ask"` and resolve pending tool requests.

```ts
class ReviewMode extends HarnessMode {
  toolApproval = "ask" as const;
  tools = [new WriteSummaryTool()];
}

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
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
  approvalTimeoutMs = 60_000;
}
```

Boundary note: the tool requests approval as behavior metadata; the mode decides the policy and the host owns the user flow for resolving requests.

API: [Approvals](../../runtime/approvals/).
