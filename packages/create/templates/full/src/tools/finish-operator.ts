import { HarnessTool } from "@harness-kernel/core/agent/tool";
import type { AgentActionSession, AgentToolResult } from "@harness-kernel/core/agent/session";
import { s, type InferInput } from "@harness-kernel/core/schema";

const schema = s.object({
  summary: s.string().min(1),
});
type FinishOperatorInput = InferInput<typeof schema>;

export class FinishOperatorTool extends HarnessTool<FinishOperatorInput> {
  label = "Finish operator";
  name = "finish_operator";
  description = "Finish operator mode and return to chat mode.";
  schema = schema;
  risk = "safe" as const;

  async execute(args: FinishOperatorInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = schema.parse(args);
    const { chatMode } = await import("../modes/chat.js");
    await session.mode.switch(chatMode);
    return { content: `Operator finished: ${input.summary}` };
  }
}

export const finishOperatorTool = new FinishOperatorTool();
