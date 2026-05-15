import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import { HarnessEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import type { AgentActionSession, AgentReadSession, AgentToolResult } from "@harness-kernel/core/agent/session";

type AgentState = {
  reviews: number;
  lastReviewAt?: string;
};

class ReviewRequestedEvent extends HarnessEvent<{ requestedAt: string }> {}

class ReviewerRole extends HarnessRole {
  label = "Reviewer";
  name = "reviewer";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
}

class RequestReviewTool extends HarnessTool<Record<string, never>> {
  name = "request_review";
  description = "Request a concise review checkpoint for the current conversation.";
  risk = "read" as const;

  async execute(_args: Record<string, never>, session: AgentActionSession<AgentState>): Promise<AgentToolResult> {
    const requestedAt = new Date().toISOString();
    const state = session.state.get();
    session.state.update({ reviews: state.reviews + 1, lastReviewAt: requestedAt });
    session.log.info("review.requested", { reviews: state.reviews + 1 });
    await session.events.emit(ReviewRequestedEvent, { requestedAt });
    return { content: "Review checkpoint requested." };
  }
}

class SessionContext extends HarnessContextProvider {
  render(session: AgentReadSession<AgentState>) {
    const state = session.state.get();
    session.log.debug("session_context.render", { reviews: state.reviews });
    return [
      `Agent: ${session.agentKey}`,
      `Mode: ${session.mode.current().type}`,
      `Review checkpoints: ${state.reviews}`,
      state.lastReviewAt ? `Last review: ${state.lastReviewAt}` : "Last review: none",
    ].join("\n");
  }
}

class ChatMode extends HarnessMode {
  prompt = [
    "You are __AGENT_LABEL__, a compact editable Harness Kernel agent.",
    "Answer directly, keep state through context, and use request_review when the user asks for a review checkpoint.",
  ].join("\n");
  tools = [new RequestReviewTool()];
  providers = [new SessionContext()];
}

class ReviewRequestedHook extends HarnessHook.for(ReviewRequestedEvent) {
  onActive(session: AgentActionSession<AgentState>, event: ReviewRequestedEvent) {
    session.log.info("review.hook", { eventId: event.id, requestedAt: event.payload.requestedAt });
  }
}

const chatMode = new ChatMode();

export default defineAgent({
  key: "__AGENT_ID__",
  label: "__AGENT_LABEL__",
  initialMode: chatMode,
  sharedState: {
    initial: () => ({ reviews: 0 }),
  },
  modes: [chatMode],
  roles: [new ReviewerRole()],
  hooks: [new ReviewRequestedHook()],
});
