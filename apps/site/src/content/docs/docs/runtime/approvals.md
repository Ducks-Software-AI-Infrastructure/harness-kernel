---
title: Approvals
description: Runtime-owned approval policy for mode-owned tools.
---

Approval policy belongs to the runtime host. Tool metadata can request approval, but the host decides whether a request is automatically approved, denied, or surfaced to a user.

## Tool Metadata

```ts
class WriteReportTool extends HarnessTool<WriteReportInput> {
  name = "write_report";
  description = "Write a report file.";
  schema = writeReportSchema;
  risk = "write" as const;
  permissions = [{ kind: "filesystem" as const, access: "write" as const, path: "." }];
  requiresApproval = true;

  async execute(args, session) {
    return { content: "Wrote report.md" };
  }
}
```

The tool belongs to a mode. `requiresApproval` is a behavior hint.

## Runtime Policy

```ts
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  toolApproval: "ask",
});
```

Policies are `auto`, `ask`, `deny`, and `tool-default`.

## Resolve Pending Approvals

```ts
const stream = await store.stream("approval-demo", "Write the report.");

for await (const event of stream) {
  if (event.type === "tool.approval.requested") {
    await event.approval.approve();
  }
}
```

You can also resolve through the store:

```ts
const [approval] = store.getPendingApprovals("approval-demo");
await store.approveTool("approval-demo", approval.id);
await store.denyTool("approval-demo", approval.id, "Not allowed in this environment.");
```

Approval request and resolution events are available through streams, session listeners, event queries, logs, and storage.
