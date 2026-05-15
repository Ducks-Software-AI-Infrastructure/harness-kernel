import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { conversationHistoryProvider } from "../context/conversation-history.js";
import { projectContextProvider } from "../context/project.js";
import { enterOperatorTool, rememberNoteTool } from "../tools/index.js";

export class ChatMode extends HarnessMode {
  label = "Chat";
  providers = [
    projectContextProvider,
    conversationHistoryProvider.with({ maxMessages: 20 }),
  ];
  tools = [rememberNoteTool, enterOperatorTool];
  prompt = [
    "You are __AGENT_LABEL__, a small editable agent behavior package.",
    "Answer directly and use tools only when they help.",
    "Use remember_note when the user asks you to remember something.",
    "Use enter_operator when the user asks you to switch into operator mode.",
  ].join("\n");
}

export const chatMode = new ChatMode();
