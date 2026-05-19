import assert from "node:assert/strict";
import { RunAbortedEvent, RunEndEvent, RunFailedEvent, ToolEndEvent } from "../runtime/events.js";
import type { HarnessEventRecord } from "../runtime/types.js";
import { SessionQueue } from "./queue.js";

function record(type: string): HarnessEventRecord {
  return {
    id: `${type}-event`,
    seq: 1,
    branchId: "main",
    type,
    eventClassId: type,
    at: new Date(0).toISOString(),
    source: { kind: "runtime" },
    payload: {},
    runId: "run",
    hidden: true,
  };
}

const failedQueue = new SessionQueue();
failedQueue.addPendingSendTrigger(ToolEndEvent);
assert.equal(failedQueue.applyPendingSendTrigger(record(RunFailedEvent.type)), "cleared");

const abortedQueue = new SessionQueue();
abortedQueue.addPendingSendTrigger(ToolEndEvent);
assert.equal(abortedQueue.applyPendingSendTrigger(record(RunAbortedEvent.type)), "cleared");

const completedQueue = new SessionQueue();
completedQueue.addPendingSendTrigger(RunEndEvent);
assert.equal(completedQueue.applyPendingSendTrigger(record(RunEndEvent.type)), "cleared");
