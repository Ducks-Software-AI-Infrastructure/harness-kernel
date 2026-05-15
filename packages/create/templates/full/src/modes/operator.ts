import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createCoreTools } from "@harness-kernel/tools-node";
import { conversationHistoryProvider } from "../context/conversation-history.js";
import { projectContextProvider } from "../context/project.js";
import { finishOperatorTool, rememberNoteTool } from "../tools/index.js";

export class OperatorMode extends HarnessMode {
  label = "Operator";
  providers = [
    projectContextProvider,
    conversationHistoryProvider.with({ maxMessages: 20 }),
  ];
  tools = [rememberNoteTool, finishOperatorTool, ...createCoreTools()];
  toolApproval = "tool-default" as const;
  prompt = [
    "You are in operator mode.",
    "You may inspect and modify files only when the harness policy approves the tool.",
    "When the task is complete, call finish_operator with a concise summary.",
  ].join("\n");
}

export const operatorMode = new OperatorMode();
