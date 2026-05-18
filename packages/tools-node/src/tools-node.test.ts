import assert from "node:assert/strict";
import { BashTool, createFileSystemTools } from "./index.js";
import { assertSafeRelativePath, assertSafeRelativePattern, shellQuote } from "./path.js";

const bash = new BashTool();
assert.equal(bash.name, "bash");
assert.equal(bash.schema.parse({ command: "true" }).timeoutMs, 30_000);
assert.equal(createFileSystemTools().length, 5);

assert.doesNotThrow(() => assertSafeRelativePath("src/index.ts"));
assert.doesNotThrow(() => assertSafeRelativePattern("src/**/*.ts"));
assert.throws(() => assertSafeRelativePath("../secret.txt"), /escapes workDir/);
assert.throws(() => assertSafeRelativePath("/tmp/secret.txt"), /Absolute paths are not allowed/);
assert.throws(() => assertSafeRelativePattern("../**/*"), /escapes workDir/);
assert.equal(shellQuote("a'b"), "'a'\\''b'");
