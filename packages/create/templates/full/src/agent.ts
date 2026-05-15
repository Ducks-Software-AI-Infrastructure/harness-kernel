import { defineAgent } from "@harness-kernel/core/agent";
import { afterToolHook } from "./hooks/after-tool.js";
import { modelRoutingHook } from "./hooks/model-routing.js";
import { runLifecycleHook } from "./hooks/run-lifecycle.js";
import { chatMode, operatorMode } from "./modes/index.js";
import { assistantRole, systemRole, toolRole, userRole } from "./roles/index.js";

export default defineAgent({
  key: "__AGENT_ID__",
  label: "__AGENT_LABEL__",
  initialMode: chatMode,
  sharedState: {
    initial: () => ({ notes: [] }),
  },
  modes: [chatMode, operatorMode],
  roles: [systemRole, userRole, assistantRole, toolRole],
  hooks: [afterToolHook, modelRoutingHook, runLifecycleHook],
});
