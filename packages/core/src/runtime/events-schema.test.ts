import assert from "node:assert/strict";
import { SchemaError } from "../schema/index.js";
import {
  MessageDeltaEvent,
  RunStartEvent,
  ToolApprovalResolvedEvent,
} from "./events.js";

assert.deepEqual(RunStartEvent.schema.parse({
  agentKey: "agent",
  modeId: "chat",
  workDir: ".",
}), {
  agentKey: "agent",
  modeId: "chat",
  workDir: ".",
});

assert.throws(() => RunStartEvent.schema.parse({
  agentKey: "agent",
  workDir: ".",
}), SchemaError);

assert.deepEqual(MessageDeltaEvent.schema.parse({ role: "assistant", text: "hello" }), {
  role: "assistant",
  text: "hello",
});
assert.throws(() => MessageDeltaEvent.schema.parse({ role: "user", text: "hello" }), SchemaError);

assert.deepEqual(ToolApprovalResolvedEvent.schema.parse({
  id: "call",
  name: "bash",
  args: {},
  decision: "approved",
}), {
  id: "call",
  name: "bash",
  args: {},
  decision: "approved",
});
