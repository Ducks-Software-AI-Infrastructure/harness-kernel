import assert from "node:assert/strict";
import { BashTool, createFileSystemTools } from "./index.js";

const bash = new BashTool();
assert.equal(bash.name, "bash");
assert.equal(bash.schema.parse({ command: "true" }).timeoutMs, 30_000);
assert.equal(createFileSystemTools().length, 5);
