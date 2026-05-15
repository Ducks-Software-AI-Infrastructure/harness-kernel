import assert from "node:assert/strict";
import { SchemaError } from "@harness-kernel/core";
import { OpenAIProvider, openAIProviderConfigSchema } from "./index.js";

const provider = new OpenAIProvider({ models: [{ id: "gpt-test" }] });
assert.equal(provider.namespace, "openai");
assert.deepEqual(provider.getModels(), [{ id: "gpt-test" }]);
assert.equal(provider.configSchema, openAIProviderConfigSchema);
assert.deepEqual(openAIProviderConfigSchema.parse({ headers: { "x-test": "yes" } }).headers, { "x-test": "yes" });
assert.throws(() => new OpenAIProvider({ headers: { "x-test": 1 } as never }), SchemaError);
