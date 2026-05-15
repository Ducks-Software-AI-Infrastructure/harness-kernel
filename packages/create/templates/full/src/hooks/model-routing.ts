import { ModelBeforeEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";

class ModelRoutingHook extends HarnessHook.for(ModelBeforeEvent) {
  label = "Model routing";

  async onActive() {
    // Add runtime routing policy checks here.
  }
}

export const modelRoutingHook = new ModelRoutingHook();
