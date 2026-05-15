import assert from "node:assert/strict";
import { z } from "zod";
import { normalizeSchema, s, SchemaError, type InferOutput } from "./index.js";

const schema = s.object({
  name: s.string().min(2).describe("Display name."),
  age: s.number().int().positive().max(120),
  active: s.boolean().default(true),
  tags: s.array(s.string()).optional(),
  role: s.enum(["admin", "user"] as const),
  status: s.literal("active"),
  headers: s.record(s.string()).optional(),
  nested: s.object({ ok: s.boolean() }),
});

type Output = InferOutput<typeof schema>;
const parsed: Output = schema.parse({
  name: "Ada",
  age: 37,
  role: "admin",
  status: "active",
  headers: { "x-test": "yes" },
  nested: { ok: true },
});

assert.equal(parsed.active, true);
assert.equal(parsed.nested.ok, true);
assert.equal(parsed.headers?.["x-test"], "yes");
const failed = schema.safeParse({ name: "x", age: 1, role: "user", status: "active", nested: { ok: true } });
assert.equal(failed.success, false);
if (!failed.success) {
  assert.equal(failed.error.issues[0]?.path, "name");
}
assert.equal(schema.toJsonSchema().type, "object");
assert.equal(((schema.toJsonSchema().properties as Record<string, any>).name.description), "Display name.");

assert.throws(() => schema.parse({}), SchemaError);

const json = normalizeSchema({
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" } },
});
assert.equal(json.source, "json-schema");
assert.deepEqual(json.parse({ name: "Ada" }), { name: "Ada" });

const zodSchema = normalizeSchema(z.object({ value: z.string() }));
assert.equal(zodSchema.source, "zod");
assert.deepEqual(zodSchema.parse({ value: "ok" }), { value: "ok" });
const zodFailed = zodSchema.safeParse({ value: 1 });
assert.equal(zodFailed.success, false);
if (!zodFailed.success) {
  const issues = zodSchema.issuesFromError(zodFailed.error);
  assert.equal(issues[0]?.path, "value");
  assert.equal(issues[0]?.code, "invalid_type");
}
assert.equal(typeof zodSchema.toJsonSchema === "function" || zodSchema.toJsonSchema === undefined, true);

const customSchema = normalizeSchema({
  parse(input: unknown) {
    if (input !== "ok") throw new Error("Not ok.");
    return input;
  },
});
assert.equal(customSchema.source, "custom");
assert.equal(customSchema.safeParse("ok").success, true);
const customFailed = customSchema.safeParse("no");
assert.equal(customFailed.success, false);
if (!customFailed.success) {
  assert.equal(customFailed.error.issues[0]?.message, "Not ok.");
}
