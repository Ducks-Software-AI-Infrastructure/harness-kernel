import assert from "node:assert/strict";
import { HarnessModelProviderRegistry, parseModelRef, type HarnessModelProvider } from "./types.js";

const alpha: HarnessModelProvider = {
  namespace: "alpha",
  getModels: () => [{ id: "one" }],
  async run() {
    return { content: "alpha" };
  },
};

const beta: HarnessModelProvider = {
  namespace: "beta",
  async run() {
    return { content: "beta" };
  },
};

assert.deepEqual(parseModelRef("alpha/one"), { namespace: "alpha", modelId: "one" });
const registry = new HarnessModelProviderRegistry([alpha, beta]);
assert.equal(registry.resolve("alpha/one").provider, alpha);
assert.equal(registry.resolve("beta/anything").modelId, "anything");
assert.throws(() => registry.resolve("missing/one"), /Unknown model provider/);
assert.throws(() => registry.resolve("alpha/two"), /Unknown model/);
assert.throws(() => new HarnessModelProviderRegistry([alpha, alpha]), /Duplicate/);
