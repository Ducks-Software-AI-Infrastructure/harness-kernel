import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createCoreTools } from "@harness-kernel/tools-node";

class CliMode extends HarnessMode {
  label = "CLI";
  prompt = "You are a local CLI assistant. Prefer concise answers and use tools only when they are needed.";
  tools = createCoreTools();
}

export const cliMode = new CliMode();

export const agent = defineAgent({
  key: "cli-harness",
  label: "CLI Harness",
  initialMode: cliMode,
  modes: [cliMode],
});
