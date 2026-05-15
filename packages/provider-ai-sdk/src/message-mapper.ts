import type { ModelProviderRunInput } from "@harness-kernel/core";

type RunnerMessage = ModelProviderRunInput["messages"][number];

function asTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content);
}

export function toModelMessage(message: RunnerMessage): any | undefined {
  if (message.hidden || message.role === "event") return undefined;

  if (message.role === "system") return { role: "system", content: asTextContent(message.content) };
  if (message.role === "user") {
    return {
      role: "user",
      content: typeof message.content === "string" || Array.isArray(message.content)
        ? message.content
        : asTextContent(message.content),
    };
  }
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: typeof message.content === "string" || Array.isArray(message.content)
        ? message.content
        : asTextContent(message.content),
    };
  }
  if (message.role === "tool") {
    const content = Array.isArray(message.content)
      ? message.content
      : [{
        type: "tool-result",
        toolCallId: message.toolCallId ?? message.id,
        toolName: message.toolName ?? "tool",
        output: message.content,
      }];
    return { role: "tool", content };
  }

  throw new Error(`AI SDK model provider does not support native role '${message.role}'.`);
}

export function toModelMessages(messages: ModelProviderRunInput["messages"]): any[] {
  return messages.map(toModelMessage).filter(Boolean);
}
