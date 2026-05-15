import assert from "node:assert/strict";
import type { ModelProviderRunInput } from "@harness-kernel/core";
import { s } from "@harness-kernel/core";
import { AiSdkModelProvider } from "./index.js";
import { buildAiTools } from "./tool-set.js";

const provider = new AiSdkModelProvider({
  namespace: "test",
  models: [{ id: "model" }],
  resolveModel() {
    return {} as never;
  },
});

assert.equal(provider.namespace, "test");
assert.deepEqual(provider.getModels(), [{ id: "model" }]);

const input = {
  tools: [{
    name: "ok",
    description: "ok",
    inputSchema: s.object({ value: s.string() }),
    async execute() {
      return { content: "ok" };
    },
  }],
  async executeTool() {
    return { content: "ok" };
  },
} as unknown as ModelProviderRunInput;
assert.equal(Object.keys(buildAiTools(input))[0], "ok");

assert.throws(() => buildAiTools({
  ...input,
  tools: [{
    name: "custom",
    description: "custom",
    inputSchema: {
      parse(value: unknown) {
        return value;
      },
    },
    async execute() {
      return { content: "ok" };
    },
  }],
} as unknown as ModelProviderRunInput), /cannot be converted to JSON Schema/);
