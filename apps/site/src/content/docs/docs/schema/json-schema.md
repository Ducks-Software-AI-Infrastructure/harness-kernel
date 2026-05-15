---
title: JSON Schema
description: Convert Harness schemas to JSON Schema and accept JSON Schema at the boundary.
---

Harness schemas can produce JSON Schema for tool providers and host integrations.

```ts
import { s } from "@harness-kernel/core/schema";

const schema = s.object({
  path: s.string().min(1),
  content: s.string(),
});

const jsonSchema = schema.toJsonSchema();
```

The generated object uses standard JSON Schema fields such as `type`, `properties`, `required`, `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`, and `maxLength`.

## JSON Schema As Input

`normalizeSchema()` can also wrap a JSON Schema-like object:

```ts
import { normalizeSchema } from "@harness-kernel/core/schema";

const normalized = normalizeSchema({
  type: "object",
  properties: {
    query: { type: "string" },
  },
  required: ["query"],
});

normalized.parse({ query: "storage" });
```

Use Harness schemas when writing official examples because they preserve TypeScript inference and do not add external dependencies. Use JSON Schema at integration boundaries where another system already provides schema objects.
