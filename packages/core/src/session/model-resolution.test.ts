import assert from "node:assert/strict";
import { createHarnessSession } from "./session.js";
import { defineAgent, HarnessMode, type HarnessModelProvider } from "../index.js";

class DefaultMode extends HarnessMode {
  prompt = "default";
}

class ModeModelMode extends HarnessMode {
  model = "fake/mode";
  prompt = "mode";
}

const calls: string[] = [];
const provider: HarnessModelProvider = {
  namespace: "fake",
  getModels: () => [{ id: "default" }, { id: "mode" }, { id: "session" }, { id: "run" }],
  async run(input) {
    calls.push(input.modelRef);
    return { content: input.modelRef };
  },
};

const defaultMode = new DefaultMode();
const defaultSession = await createHarnessSession({
  agent: {
    definition: defineAgent({
      label: "Default",
      initialMode: defaultMode,
      modes: [defaultMode],
    }),
  },
  providers: [provider],
  defaultModel: "fake/default",
});
assert.equal(defaultSession.getModel(), "fake/default");
assert.equal((await defaultSession.send("hello")).answer, "fake/default");
await defaultSession.close();

const modeModel = new ModeModelMode();
const modeSession = await createHarnessSession({
  agent: {
    definition: defineAgent({
      label: "Mode",
      initialMode: modeModel,
      modes: [modeModel],
    }),
  },
  providers: [provider],
  defaultModel: "fake/default",
});
assert.equal(modeSession.getModel(), "fake/mode");
assert.equal((await modeSession.send("hello")).answer, "fake/mode");
modeSession.setModel("fake/session");
assert.equal(modeSession.getModel(), "fake/session");
assert.equal((await modeSession.send("hello")).answer, "fake/session");
assert.equal((await modeSession.send("hello", { model: "fake/run" })).answer, "fake/run");
assert.equal(modeSession.getModel(), "fake/session");
modeSession.clearModelOverride();
assert.equal(modeSession.getModel(), "fake/mode");
assert.equal((await modeSession.send("hello")).answer, "fake/mode");
await modeSession.close();

assert.deepEqual(calls, ["fake/default", "fake/mode", "fake/session", "fake/run", "fake/mode"]);
