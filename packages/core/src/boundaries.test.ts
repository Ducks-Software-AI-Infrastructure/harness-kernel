import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = [
  /from ["']zod["']/,
  /from ["']ai["']/,
  /from ["']@ai-sdk\//,
  /from ["']node:fs/,
  /from ["']node:child_process/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (path.includes(`${join("src", "schema")}${"/"}`)) return statSync(path).isDirectory() ? files(path) : [path];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

for (const file of files(new URL(".", import.meta.url).pathname).filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))) {
  const content = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    assert.equal(pattern.test(content), false, `${file} imports a forbidden dependency: ${pattern}`);
  }
}
