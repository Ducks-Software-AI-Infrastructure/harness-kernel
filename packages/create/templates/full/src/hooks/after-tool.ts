import { ToolEndEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";
import type { AgentActionSession } from "@harness-kernel/core/agent/session";
import { userRole } from "../roles/index.js";

class AfterToolHook extends HarnessHook.for(ToolEndEvent) {
  label = "After tool";

  async onActive(session: AgentActionSession, event: ToolEndEvent) {
    if ((event.payload.result as { isError?: boolean } | undefined)?.isError) {
      await session.messages.enqueue({
        role: userRole,
        content: `Tool ${event.payload.name} failed; decide the next recovery step.`,
      });
    }
  }
}

export const afterToolHook = new AfterToolHook();
