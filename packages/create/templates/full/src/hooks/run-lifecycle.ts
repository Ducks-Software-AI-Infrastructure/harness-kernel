import { RunStartEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";

class RunLifecycleHook extends HarnessHook.for(RunStartEvent) {
  label = "Run lifecycle";

  async onActive() {
    // Add run startup behavior here.
  }
}

export const runLifecycleHook = new RunLifecycleHook();
