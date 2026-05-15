import assert from "node:assert/strict";
import { JsonlFileLogSink } from "./index.js";

const sink = new JsonlFileLogSink({ path: ".harness-kernel-test/logs.jsonl" });
assert.equal(typeof sink.write, "function");
