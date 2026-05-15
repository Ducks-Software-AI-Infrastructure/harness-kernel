export type SchemaIssueCode =
  | "invalid_type"
  | "invalid_literal"
  | "invalid_enum"
  | "too_small"
  | "too_big"
  | "custom";

export type SchemaSource = "harness" | "zod" | "standard" | "json-schema" | "custom";

export interface SchemaIssue {
  path: string;
  code: string;
  message: string;
  expected?: string;
  received?: string;
}

export class SchemaError extends Error {
  readonly issues: SchemaIssue[];

  constructor(issues: SchemaIssue[]) {
    const normalized = issues.length ? issues.map(normalizeIssue) : [issue(undefined, "custom", "Schema validation failed.")];
    super(normalized[0]?.message ?? "Schema validation failed.");
    this.name = "SchemaError";
    this.issues = normalized;
  }
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: SchemaError };

export type JsonSchema = Record<string, unknown>;

type SchemaPathInput = string | number | Array<string | number> | undefined;

export function formatSchemaPath(path: SchemaPathInput): string {
  if (Array.isArray(path)) return path.length ? path.map((part) => String(part)).join(".") : "(root)";
  if (typeof path === "number") return String(path);
  if (typeof path === "string" && path.trim()) return path;
  return "(root)";
}

function joinSchemaPath(parent: SchemaPathInput, child: SchemaPathInput): string {
  const left = formatSchemaPath(parent);
  const right = formatSchemaPath(child);
  if (left === "(root)") return right;
  if (right === "(root)") return left;
  return `${left}.${right}`;
}

function normalizeIssue(value: unknown): SchemaIssue {
  if (typeof value !== "object" || value === null) {
    return issue(undefined, "custom", String(value || "Schema validation failed."));
  }
  const record = value as Record<string, unknown>;
  return {
    path: formatSchemaPath(record.path as SchemaPathInput),
    code: typeof record.code === "string" ? record.code : "custom",
    message: typeof record.message === "string" ? record.message : "Invalid value.",
    expected: typeof record.expected === "string" ? record.expected : undefined,
    received: typeof record.received === "string" ? record.received : undefined,
  };
}

export function schemaIssuesFromError(error: unknown): SchemaIssue[] {
  if (error instanceof SchemaError) return error.issues;
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues?: unknown }).issues)) {
    return (error as { issues: unknown[] }).issues.map(normalizeIssue);
  }
  return [issue(undefined, "custom", error instanceof Error ? error.message : String(error ?? "Schema validation failed."))];
}

export abstract class Schema<TInput = unknown, TOutput = TInput> {
  readonly isHarnessSchema = true;
  private schemaDescription?: string;

  abstract safeParse(input: unknown): SafeParseResult<TOutput>;
  abstract toJsonSchema(): JsonSchema;

  parse(input: TInput): TOutput {
    const result = this.safeParse(input);
    if (!result.success) throw result.error;
    return result.data;
  }

  optional(): OptionalSchema<TInput | undefined, TOutput | undefined> {
    return new OptionalSchema(this);
  }

  default(value: TOutput | (() => TOutput)): DefaultSchema<TInput | undefined, TOutput> {
    return new DefaultSchema(this, value);
  }

  describe(description: string): this {
    this.schemaDescription = description;
    return this;
  }

  protected withDescription<TJson extends JsonSchema>(json: TJson): TJson {
    return this.schemaDescription ? { ...json, description: this.schemaDescription } : json;
  }
}

export type InferInput<TSchema> = TSchema extends Schema<infer TInput, any> ? TInput : unknown;
export type InferOutput<TSchema> = TSchema extends Schema<any, infer TOutput> ? TOutput : unknown;

function received(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function issue(path: SchemaPathInput, code: SchemaIssueCode | string, message: string, expected?: string, value?: unknown): SchemaIssue {
  return {
    path: formatSchemaPath(path),
    code,
    message,
    expected,
    received: value === undefined ? undefined : received(value),
  };
}

function prependIssuePath(path: SchemaPathInput, entry: SchemaIssue): SchemaIssue {
  return { ...entry, path: joinSchemaPath(path, entry.path) };
}

function ok<T>(data: T): SafeParseResult<T> {
  return { success: true, data };
}

function fail<T>(issues: SchemaIssue[]): SafeParseResult<T> {
  return { success: false, error: new SchemaError(issues) };
}

export class StringSchema extends Schema<unknown, string> {
  private minLength?: number;
  private maxLength?: number;

  min(length: number): this {
    this.minLength = length;
    return this;
  }

  max(length: number): this {
    this.maxLength = length;
    return this;
  }

  safeParse(input: unknown): SafeParseResult<string> {
    if (typeof input !== "string") return fail([issue(undefined, "invalid_type", "Expected string.", "string", input)]);
    if (this.minLength !== undefined && input.length < this.minLength) {
      return fail([issue(undefined, "too_small", `Expected string to contain at least ${this.minLength} character(s).`, `string(min:${this.minLength})`, input)]);
    }
    if (this.maxLength !== undefined && input.length > this.maxLength) {
      return fail([issue(undefined, "too_big", `Expected string to contain at most ${this.maxLength} character(s).`, `string(max:${this.maxLength})`, input)]);
    }
    return ok(input);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({
      type: "string",
      ...(this.minLength !== undefined ? { minLength: this.minLength } : {}),
      ...(this.maxLength !== undefined ? { maxLength: this.maxLength } : {}),
    });
  }
}

export class NumberSchema extends Schema<unknown, number> {
  private integerOnly = false;
  private minValue?: number;
  private maxValue?: number;
  private exclusiveMin?: number;

  int(): this {
    this.integerOnly = true;
    return this;
  }

  min(value: number): this {
    this.minValue = value;
    return this;
  }

  max(value: number): this {
    this.maxValue = value;
    return this;
  }

  positive(): this {
    this.exclusiveMin = 0;
    return this;
  }

  safeParse(input: unknown): SafeParseResult<number> {
    if (typeof input !== "number" || Number.isNaN(input)) {
      return fail([issue(undefined, "invalid_type", "Expected number.", "number", input)]);
    }
    if (this.integerOnly && !Number.isInteger(input)) {
      return fail([issue(undefined, "invalid_type", "Expected integer.", "integer", input)]);
    }
    if (this.exclusiveMin !== undefined && input <= this.exclusiveMin) {
      return fail([issue(undefined, "too_small", `Expected number to be greater than ${this.exclusiveMin}.`, `number(>${this.exclusiveMin})`, input)]);
    }
    if (this.minValue !== undefined && input < this.minValue) {
      return fail([issue(undefined, "too_small", `Expected number to be greater than or equal to ${this.minValue}.`, `number(min:${this.minValue})`, input)]);
    }
    if (this.maxValue !== undefined && input > this.maxValue) {
      return fail([issue(undefined, "too_big", `Expected number to be less than or equal to ${this.maxValue}.`, `number(max:${this.maxValue})`, input)]);
    }
    return ok(input);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({
      type: this.integerOnly ? "integer" : "number",
      ...(this.minValue !== undefined ? { minimum: this.minValue } : {}),
      ...(this.maxValue !== undefined ? { maximum: this.maxValue } : {}),
      ...(this.exclusiveMin !== undefined ? { exclusiveMinimum: this.exclusiveMin } : {}),
    });
  }
}

export class BooleanSchema extends Schema<unknown, boolean> {
  safeParse(input: unknown): SafeParseResult<boolean> {
    return typeof input === "boolean"
      ? ok(input)
      : fail([issue(undefined, "invalid_type", "Expected boolean.", "boolean", input)]);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({ type: "boolean" });
  }
}

export class ArraySchema<TItem extends Schema<any, any>> extends Schema<InferInput<TItem>[], InferOutput<TItem>[]> {
  constructor(private readonly item: TItem) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<InferOutput<TItem>[]> {
    if (!Array.isArray(input)) return fail([issue(undefined, "invalid_type", "Expected array.", "array", input)]);
    const issues: SchemaIssue[] = [];
    const data: InferOutput<TItem>[] = [];
    input.forEach((value, index) => {
      const result = this.item.safeParse(value);
      if (result.success) data.push(result.data);
      else issues.push(...result.error.issues.map((entry) => prependIssuePath(index, entry)));
    });
    return issues.length ? fail(issues) : ok(data);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({ type: "array", items: this.item.toJsonSchema() });
  }
}

type ObjectShape = Record<string, Schema<any, any>>;
type OptionalInputKeys<TShape extends ObjectShape> = {
  [K in keyof TShape]: undefined extends InferInput<TShape[K]> ? K : never;
}[keyof TShape];
type ObjectInput<TShape extends ObjectShape> =
  & { [K in Exclude<keyof TShape, OptionalInputKeys<TShape>>]: InferInput<TShape[K]> }
  & { [K in OptionalInputKeys<TShape>]?: InferInput<TShape[K]> };
type OptionalOutputKeys<TShape extends ObjectShape> = {
  [K in keyof TShape]: undefined extends InferOutput<TShape[K]> ? K : never;
}[keyof TShape];
type ObjectOutput<TShape extends ObjectShape> =
  & { [K in Exclude<keyof TShape, OptionalOutputKeys<TShape>>]: InferOutput<TShape[K]> }
  & { [K in OptionalOutputKeys<TShape>]?: InferOutput<TShape[K]> };

export class ObjectSchema<TShape extends ObjectShape> extends Schema<ObjectInput<TShape>, ObjectOutput<TShape>> {
  constructor(private readonly shape: TShape) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<ObjectOutput<TShape>> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail([issue(undefined, "invalid_type", "Expected object.", "object", input)]);
    }
    const source = input as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const issues: SchemaIssue[] = [];
    for (const [key, schema] of Object.entries(this.shape)) {
      const result = schema.safeParse(source[key]);
      if (result.success) {
        if (result.data !== undefined || Object.prototype.hasOwnProperty.call(source, key)) output[key] = result.data;
      } else {
        issues.push(...result.error.issues.map((entry) => prependIssuePath(key, entry)));
      }
    }
    return issues.length ? fail(issues) : ok(output as ObjectOutput<TShape>);
  }

  toJsonSchema(): JsonSchema {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(this.shape)) {
      properties[key] = schema.toJsonSchema();
      if (!(schema instanceof OptionalSchema) && !(schema instanceof DefaultSchema)) required.push(key);
    }
    return this.withDescription({
      type: "object",
      properties,
      additionalProperties: false,
      ...(required.length ? { required } : {}),
    });
  }
}

export class RecordSchema<TValue extends Schema<any, any>> extends Schema<Record<string, InferInput<TValue>>, Record<string, InferOutput<TValue>>> {
  constructor(private readonly valueSchema: TValue) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<Record<string, InferOutput<TValue>>> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail([issue(undefined, "invalid_type", "Expected object.", "object", input)]);
    }
    const output: Record<string, InferOutput<TValue>> = {};
    const issues: SchemaIssue[] = [];
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const result = this.valueSchema.safeParse(value);
      if (result.success) output[key] = result.data;
      else issues.push(...result.error.issues.map((entry) => prependIssuePath(key, entry)));
    }
    return issues.length ? fail(issues) : ok(output);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({ type: "object", additionalProperties: this.valueSchema.toJsonSchema() });
  }
}

export class EnumSchema<const TValues extends readonly [string, ...string[]]> extends Schema<unknown, TValues[number]> {
  constructor(private readonly values: TValues) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<TValues[number]> {
    return typeof input === "string" && (this.values as readonly string[]).includes(input)
      ? ok(input as TValues[number])
      : fail([issue(undefined, "invalid_enum", `Expected one of: ${this.values.join(", ")}.`, this.values.join(" | "), input)]);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({ type: "string", enum: [...this.values] });
  }
}

export class LiteralSchema<const TValue> extends Schema<unknown, TValue> {
  constructor(private readonly value: TValue) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<TValue> {
    return Object.is(input, this.value)
      ? ok(this.value)
      : fail([issue(undefined, "invalid_literal", `Expected literal ${JSON.stringify(this.value)}.`, JSON.stringify(this.value), input)]);
  }

  toJsonSchema(): JsonSchema {
    const type = this.value === null ? "null" : typeof this.value;
    return this.withDescription({
      const: this.value,
      ...(type === "string" || type === "number" || type === "boolean" || type === "null" ? { type } : {}),
    });
  }
}

export class OptionalSchema<TInput, TOutput> extends Schema<TInput | undefined, TOutput | undefined> {
  constructor(private readonly inner: Schema<TInput, TOutput>) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<TOutput | undefined> {
    if (input === undefined) return ok(undefined);
    return this.inner.safeParse(input);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription(this.inner.toJsonSchema());
  }
}

export class DefaultSchema<TInput, TOutput> extends Schema<TInput | undefined, TOutput> {
  constructor(
    private readonly inner: Schema<TInput, TOutput>,
    private readonly value: TOutput | (() => TOutput),
  ) {
    super();
  }

  safeParse(input: unknown): SafeParseResult<TOutput> {
    if (input === undefined) return ok(typeof this.value === "function" ? (this.value as () => TOutput)() : this.value);
    return this.inner.safeParse(input);
  }

  toJsonSchema(): JsonSchema {
    const json = this.inner.toJsonSchema();
    return this.withDescription({
      ...json,
      ...(typeof this.value === "function" ? {} : { default: this.value }),
    });
  }
}

export class UnknownSchema extends Schema<unknown, unknown> {
  safeParse(input: unknown): SafeParseResult<unknown> {
    return ok(input);
  }

  toJsonSchema(): JsonSchema {
    return this.withDescription({});
  }
}

export const s = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  array: <TItem extends Schema<any, any>>(item: TItem) => new ArraySchema(item),
  object: <TShape extends ObjectShape>(shape: TShape) => new ObjectSchema(shape),
  record: <TValue extends Schema<any, any>>(value: TValue) => new RecordSchema(value),
  enum: <const TValues extends readonly [string, ...string[]]>(values: TValues) => new EnumSchema(values),
  literal: <const TValue>(value: TValue) => new LiteralSchema(value),
  unknown: () => new UnknownSchema(),
};

export interface NormalizedSchema<TInput = unknown, TOutput = unknown> {
  source: SchemaSource;
  parse(input: TInput): TOutput;
  safeParse(input: TInput): SafeParseResult<TOutput>;
  issuesFromError(error: unknown): SchemaIssue[];
  toJsonSchema?: () => JsonSchema;
}

function isHarnessSchema(value: unknown): value is Schema<any, any> {
  return value instanceof Schema || (typeof value === "object" && value !== null && (value as { isHarnessSchema?: unknown }).isHarnessSchema === true);
}

function looksLikeJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && (
    "type" in value || "properties" in value || "enum" in value || "items" in value || "const" in value || "additionalProperties" in value
  );
}

function looksLikeZodSchema(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (!("safeParse" in value) || typeof (value as { safeParse?: unknown }).safeParse !== "function") return false;
  const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
  return "_def" in value || "_zod" in value || Boolean(constructorName?.startsWith("Zod"));
}

function looksLikeStandardSchema(value: unknown): value is { "~standard": { validate(input: unknown): unknown } } {
  return typeof value === "object"
    && value !== null
    && "~standard" in value
    && typeof (value as { "~standard"?: { validate?: unknown } })["~standard"]?.validate === "function";
}

function getExternalJsonSchema(schema: unknown): (() => JsonSchema) | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  if (typeof (schema as { toJsonSchema?: unknown }).toJsonSchema === "function") {
    return () => (schema as { toJsonSchema(): JsonSchema }).toJsonSchema();
  }
  if (typeof (schema as { toJSONSchema?: unknown }).toJSONSchema === "function") {
    return () => (schema as { toJSONSchema(): JsonSchema }).toJSONSchema();
  }
  const jsonSchema = (schema as { jsonSchema?: unknown }).jsonSchema;
  if (looksLikeJsonSchema(jsonSchema)) return () => jsonSchema;
  return undefined;
}

function parseJsonSchema(schema: JsonSchema, input: unknown, path: SchemaPathInput = undefined): unknown {
  if (Array.isArray(schema.enum) && !schema.enum.includes(input)) {
    throw new SchemaError([issue(path, "invalid_enum", `Expected one of: ${schema.enum.join(", ")}.`, schema.enum.join(" | "), input)]);
  }
  if ("const" in schema && !Object.is(schema.const, input)) {
    throw new SchemaError([issue(path, "invalid_literal", `Expected literal ${JSON.stringify(schema.const)}.`, JSON.stringify(schema.const), input)]);
  }

  const type = schema.type;
  if (type === "object" || schema.properties || schema.additionalProperties) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new SchemaError([issue(path, "invalid_type", "Expected object.", "object", input)]);
    }
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
    const properties = typeof schema.properties === "object" && schema.properties !== null
      ? schema.properties as Record<string, JsonSchema>
      : {};
    const output: Record<string, unknown> = {};
    const issues: SchemaIssue[] = [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) {
        issues.push(issue(joinSchemaPath(path, key), "invalid_type", "Required.", "defined", undefined));
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        try {
          output[key] = parseJsonSchema(child, (input as Record<string, unknown>)[key], joinSchemaPath(path, key));
        } catch (error) {
          issues.push(...schemaIssuesFromError(error));
        }
      }
    }
    if (issues.length) throw new SchemaError(issues);
    return { ...(input as Record<string, unknown>), ...output };
  }
  if (type === "string" && typeof input !== "string") throw new SchemaError([issue(path, "invalid_type", "Expected string.", "string", input)]);
  if ((type === "number" || type === "integer") && typeof input !== "number") throw new SchemaError([issue(path, "invalid_type", "Expected number.", String(type), input)]);
  if (type === "integer" && !Number.isInteger(input)) throw new SchemaError([issue(path, "invalid_type", "Expected integer.", "integer", input)]);
  if (type === "boolean" && typeof input !== "boolean") throw new SchemaError([issue(path, "invalid_type", "Expected boolean.", "boolean", input)]);
  if (type === "array") {
    if (!Array.isArray(input)) throw new SchemaError([issue(path, "invalid_type", "Expected array.", "array", input)]);
    if (looksLikeJsonSchema(schema.items)) {
      const issues: SchemaIssue[] = [];
      const output: unknown[] = [];
      input.forEach((value, index) => {
        try {
          output[index] = parseJsonSchema(schema.items as JsonSchema, value, joinSchemaPath(path, index));
        } catch (error) {
          issues.push(...schemaIssuesFromError(error));
        }
      });
      if (issues.length) throw new SchemaError(issues);
      return output;
    }
  }
  return input;
}

function normalizedFromParse<TInput, TOutput>(
  source: SchemaSource,
  parse: (input: TInput) => TOutput,
  toJsonSchema?: () => JsonSchema,
): NormalizedSchema<TInput, TOutput> {
  return {
    source,
    parse(input: TInput): TOutput {
      const result = this.safeParse(input);
      if (!result.success) throw result.error;
      return result.data;
    },
    safeParse(input: TInput): SafeParseResult<TOutput> {
      try {
        return ok(parse(input));
      } catch (error) {
        return fail(schemaIssuesFromError(error));
      }
    },
    issuesFromError: schemaIssuesFromError,
    toJsonSchema,
  };
}

function normalizedFromSafeParse<TInput, TOutput>(
  source: SchemaSource,
  safeParse: (input: TInput) => { success: true; data: TOutput } | { success: false; error: unknown },
  toJsonSchema?: () => JsonSchema,
): NormalizedSchema<TInput, TOutput> {
  return {
    source,
    parse(input: TInput): TOutput {
      const result = this.safeParse(input);
      if (!result.success) throw result.error;
      return result.data;
    },
    safeParse(input: TInput): SafeParseResult<TOutput> {
      const result = safeParse(input);
      return result.success ? ok(result.data) : fail(schemaIssuesFromError(result.error));
    },
    issuesFromError: schemaIssuesFromError,
    toJsonSchema,
  };
}

function parseStandardSchema<TInput, TOutput>(schema: { "~standard": { validate(input: unknown): unknown } }, input: TInput): TOutput {
  const result = schema["~standard"].validate(input);
  if (result && typeof (result as { then?: unknown }).then === "function") {
    throw new Error("Async Standard Schema validation is not supported by normalizeSchema().");
  }
  if (result && typeof result === "object" && "issues" in result) {
    throw new SchemaError(schemaIssuesFromError(result));
  }
  return (result as { value?: TOutput }).value as TOutput;
}

export function normalizeSchema<TInput = unknown, TOutput = unknown>(schema: unknown): NormalizedSchema<TInput, TOutput> {
  if (!schema) {
    const unknown = new UnknownSchema();
    return normalizedFromParse("harness", (input: TInput) => unknown.parse(input) as TOutput, () => unknown.toJsonSchema());
  }

  if (isHarnessSchema(schema)) {
    return normalizedFromParse(
      "harness",
      (input: TInput) => schema.parse(input) as TOutput,
      () => schema.toJsonSchema(),
    );
  }

  if (typeof schema === "object" && schema !== null && "safeParse" in schema && typeof (schema as { safeParse?: unknown }).safeParse === "function") {
    return normalizedFromSafeParse(
      looksLikeZodSchema(schema) ? "zod" : "custom",
      (input: TInput) => (schema as { safeParse(input: TInput): { success: true; data: TOutput } | { success: false; error: unknown } }).safeParse(input),
      getExternalJsonSchema(schema),
    );
  }

  if (looksLikeStandardSchema(schema)) {
    return normalizedFromParse(
      "standard",
      (input: TInput) => parseStandardSchema<TInput, TOutput>(schema, input),
      getExternalJsonSchema(schema),
    );
  }

  if (typeof schema === "object" && schema !== null && "parse" in schema && typeof (schema as { parse?: unknown }).parse === "function") {
    return normalizedFromParse(
      "custom",
      (input: TInput) => (schema as { parse(input: TInput): TOutput }).parse(input),
      getExternalJsonSchema(schema),
    );
  }

  if (looksLikeJsonSchema(schema)) {
    return normalizedFromParse(
      "json-schema",
      (input: TInput) => parseJsonSchema(schema, input) as TOutput,
      () => schema,
    );
  }

  const unknown = new UnknownSchema();
  return normalizedFromParse("custom", (input: TInput) => unknown.parse(input) as TOutput);
}
