import { streamText, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import { MessageDeltaEvent, type ModelProviderRunInput, type ModelProviderRunResult } from "@harness-kernel/core";
import { toModelMessages } from "./message-mapper.js";
import { buildAiTools } from "./tool-set.js";
import { finishInfoFromStreamPart } from "./usage.js";

export async function runAiSdkToolLoop(
  input: ModelProviderRunInput,
  model: LanguageModel,
  providerId: string,
): Promise<ModelProviderRunResult> {
  const initialMessages = toModelMessages(input.messages);
  let contextMessageCount = Math.max(0, initialMessages.length - 1);
  const result = streamText({
    model,
    system: input.systemPrompt,
    messages: initialMessages,
    tools: buildAiTools(input),
    stopWhen: stepCountIs(Math.max(1, input.maxTurns)),
    abortSignal: input.signal,
    prepareStep: async ({ stepNumber, messages }) => {
      if (stepNumber === 0) return undefined;

      const prepared = await input.prepareContext();
      const preparedMessages = toModelMessages(prepared.messages);
      const nextContextMessageCount = Math.max(0, preparedMessages.length - 1);
      const nextContextMessages = preparedMessages.slice(0, nextContextMessageCount);
      const preservedMessages = messages.slice(contextMessageCount);
      contextMessageCount = nextContextMessageCount;

      return {
        system: prepared.systemPrompt,
        messages: [...nextContextMessages, ...preservedMessages],
      };
    },
  });

  let content = "";
  let usage: unknown;
  let finishReason: string | undefined;

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      content += part.text;
      await input.emit(
        MessageDeltaEvent,
        { role: "assistant", text: part.text },
        { source: { kind: "model_provider", id: providerId }, hiddenTranscript: false },
      );
    } else if (part.type === "finish") {
      const finish = finishInfoFromStreamPart(part);
      usage = finish?.usage;
      finishReason = finish?.finishReason;
    } else if (part.type === "error") {
      throw part.error instanceof Error ? part.error : new Error(String(part.error));
    }
  }

  return { content, usage, finishReason };
}
