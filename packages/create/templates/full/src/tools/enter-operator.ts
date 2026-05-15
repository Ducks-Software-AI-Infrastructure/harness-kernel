import { HarnessTool } from "@harness-kernel/core/agent/tool";
import type { AgentActionSession, AgentToolResult } from "@harness-kernel/core/agent/session";
import { s, type InferInput } from "@harness-kernel/core/schema";

const schema = s.object({
  task: s.string().min(1),
});
type EnterOperatorInput = InferInput<typeof schema>;

export class EnterOperatorTool extends HarnessTool<EnterOperatorInput> {
  label = "Enter operator";
  name = "enter_operator";
  description = "Switch to operator mode with a concrete task.";
  schema = schema;
  risk = "safe" as const;

  async execute(args: EnterOperatorInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = schema.parse(args);
    const { operatorMode } = await import("../modes/operator.js");
    await session.mode.switch(operatorMode, `Operator task: ${input.task}`);
    return { content: `Switched to operator mode for: ${input.task}` };
  }
}

export const enterOperatorTool = new EnterOperatorTool();
