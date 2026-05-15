---
title: Tool Schemas
description: Define tool input schemas and infer TypeScript types.
---

Tool schemas describe the arguments a model provider can pass to a `HarnessTool`. They should be precise, small, and serializable to JSON Schema when possible.

```ts
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { s, type InferInput } from "@harness-kernel/core/schema";

const searchSchema = s.object({
  query: s.string().min(1).describe("Search query."),
  limit: s.number().int().positive().max(20).default(5),
});

type SearchInput = InferInput<typeof searchSchema>;

class SearchDocsTool extends HarnessTool<SearchInput> {
  name = "search_docs";
  description = "Search project documentation.";
  schema = searchSchema;
  risk = "read" as const;

  async execute(args) {
    const input = searchSchema.parse(args);
    return {
      content: `Search ${input.query} with limit ${input.limit}`,
      data: input,
    };
  }
}
```

## Defaults And Inputs

`InferInput` represents what callers may pass. `InferOutput` represents the parsed result after defaults are applied. Tools commonly use `InferInput` for the class generic and call `schema.parse(args)` inside `execute()`.

## Approval Metadata

Schemas validate inputs. Tool risk, permissions, and `requiresApproval` describe execution risk:

```ts
class WriteFileTool extends HarnessTool<WriteInput> {
  risk = "write" as const;
  permissions = [{ kind: "filesystem" as const, access: "write" as const, path: "." }];
  requiresApproval = true;
}
```

The runtime host still owns approval policy.
