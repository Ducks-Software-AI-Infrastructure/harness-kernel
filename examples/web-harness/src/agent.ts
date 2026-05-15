import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";

class WebMode extends HarnessMode {
  label = "Web";
  prompt = "You are a product support assistant embedded in an HTTP service. Keep responses short and structured.";
}

export const webMode = new WebMode();

export const agent = defineAgent({
  key: "web-harness",
  label: "Web Harness",
  initialMode: webMode,
  modes: [webMode],
});
