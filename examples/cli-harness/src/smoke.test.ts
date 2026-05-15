import assert from "node:assert/strict";
import { agent, cliMode } from "./agent.js";

assert.equal(agent.key, "cli-harness");
assert.equal(agent.initialMode, cliMode);
assert.equal(agent.modes.length, 1);
assert.ok(cliMode.tools?.some((tool) => tool.name === "bash"));
