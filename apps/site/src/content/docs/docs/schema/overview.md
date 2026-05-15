---
title: Schema Overview
description: Official Harness Kernel schema primitives and normalized schema boundary.
---

Harness Kernel ships a small official schema primitive in `@harness-kernel/core/schema`. Official packages use it so `@harness-kernel/core` stays independent from Zod or any other external validator.

```ts
import { s, type InferInput, type InferOutput } from "@harness-kernel/core/schema";

const ticketSchema = s.object({
  id: s.string().min(1),
  priority: s.enum(["low", "normal", "high"] as const).default("normal"),
  tags: s.array(s.string()).default([]),
});

type TicketInput = InferInput<typeof ticketSchema>;
type Ticket = InferOutput<typeof ticketSchema>;
```

## Primitives

| Primitive | Example |
| --- | --- |
| `s.string()` | `s.string().min(1).max(120)` |
| `s.number()` | `s.number().int().positive().max(100)` |
| `s.boolean()` | `s.boolean()` |
| `s.array(item)` | `s.array(s.string())` |
| `s.object(shape)` | `s.object({ name: s.string() })` |
| `s.record(value)` | `s.record(s.string())` |
| `s.enum(values)` | `s.enum(["read", "write"] as const)` |
| `s.literal(value)` | `s.literal("assistant")` |
| `s.unknown()` | `s.unknown()` |

Schemas support `optional()`, `default(value)`, `describe(text)`, `parse(input)`, `safeParse(input)`, and `toJsonSchema()`.

## Errors

Failed parsing throws `SchemaError` with normalized `SchemaIssue[]`.

```ts
const result = ticketSchema.safeParse({});
if (!result.success) {
  console.log(result.error.issues);
}
```

## Normalization

`normalizeSchema()` accepts Harness schemas, JSON Schema, Zod-like schemas with `safeParse`, Standard Schema values, and compatible custom schemas.

Use the official schema for docs and official package examples. Use normalized external schemas when application code already owns another validator.
