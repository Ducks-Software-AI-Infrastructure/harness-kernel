import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import type { AgentReadSession } from "@harness-kernel/core/agent/session";
import { userRole } from "../roles/index.js";

type ConversationHistoryOptions = {
  maxMessages?: number;
};

class ConversationHistoryProvider extends HarnessContextProvider<ConversationHistoryOptions> {
  label = "Conversation History";
  priority = 1;

  render(session: AgentReadSession, options?: ConversationHistoryOptions) {
    return session.history.get({
      limit: options?.maxMessages ?? 20,
      includeHidden: false,
      beforeCurrentTurn: true,
    }).map((message) => ({
      role: userRole,
      content: message.content,
      metadata: { sourceRole: message.authorRole ?? message.role },
    }));
  }
}

export const conversationHistoryProvider = new ConversationHistoryProvider();
