---
title: Zod Compatibility
description: Use Zod and compatible external schemas through normalizeSchema.
---

Harness Kernel core does not depend on Zod. Zod compatibility is supported as an external user schema path through `normalizeSchema()`.

```ts
import { normalizeSchema } from "@harness-kernel/core/schema";
import { z } from "zod";

const zodSchema = z.object({
  ticketId: z.string().min(1),
});

const normalized = normalizeSchema(zodSchema);
const parsed = normalized.parse({ ticketId: "T-123" });
```

`normalizeSchema()` recognizes compatible schemas with `safeParse()`, Standard Schema values, schemas with `parse()`, JSON Schema-like objects, and Harness schemas.

## When To Use Zod

Use Zod when your application already owns Zod schemas and wants to pass them into agent code. Official packages and public docs use `@harness-kernel/core/schema` so the core package keeps zero external runtime dependencies.

## JSON Schema Output

Some external schemas can provide JSON Schema through `toJsonSchema()` or compatible methods. If a schema cannot produce JSON Schema, a model provider that requires JSON Schema may reject it.

`@harness-kernel/provider-ai-sdk` validates that tool schemas can be converted before exposing them as provider tools.
