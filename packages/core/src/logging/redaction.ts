import type { HarnessRedactionConfig } from "./types.js";

export const defaultRedactKeys = [
  "password",
  "token",
  "apiKey",
  "authorization",
  "secret",
  "cookie",
  "setCookie",
];

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function shouldRedactKey(key: string, keys: string[]): boolean {
  const normalized = normalizeKey(key);
  return keys.some((candidate) => {
    const sensitive = normalizeKey(candidate);
    return normalized === sensitive || normalized.includes(sensitive);
  });
}

export function redactError(error: Error): { name?: string; message: string; stack?: string } {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

export function redactValue(
  value: unknown,
  config: HarnessRedactionConfig = {},
  seen = new WeakSet<object>(),
): unknown {
  const keys = config.keys ?? defaultRedactKeys;
  const replacement = config.replacement ?? "[redacted]";

  if (value instanceof Error) return redactError(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, config, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedactKey(key, keys) ? replacement : redactValue(item, config, seen);
  }
  return output;
}

export function summarizeValue(value: unknown, config: HarnessRedactionConfig = {}): unknown {
  const keys = config.keys ?? defaultRedactKeys;
  const replacement = config.replacement ?? "[redacted]";

  const visit = (item: unknown, key?: string): unknown => {
    if (key && shouldRedactKey(key, keys)) return replacement;
    if (item instanceof Error) return { name: item.name, message: item.message };
    if (item === null) return "null";
    if (item === undefined) return "undefined";
    if (typeof item === "string") return `string(${item.length})`;
    if (typeof item === "number" || typeof item === "boolean") return item;
    if (typeof item === "bigint") return `${item.toString()}n`;
    if (typeof item === "symbol") return "symbol";
    if (typeof item === "function") return "function";
    if (Array.isArray(item)) return `array(${item.length})`;
    if (typeof item === "object") {
      const objectKeys = Object.keys(item as Record<string, unknown>)
        .map((objectKey) => shouldRedactKey(objectKey, keys) ? replacement : objectKey);
      return `object(${objectKeys.slice(0, 8).join(",")}${objectKeys.length > 8 ? ",..." : ""})`;
    }
    return String(item);
  };

  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Error)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = visit(item, key);
    return output;
  }
  return visit(value);
}
