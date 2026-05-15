import { HarnessTool } from "@harness-kernel/core/agent/tool";
import type { AgentActionSession, AgentToolResult } from "@harness-kernel/core/agent/session";
import { s, type InferInput } from "@harness-kernel/core/schema";
import { NoteRememberedEvent } from "../events/note-remembered.js";
import { systemRole } from "../roles/index.js";

const schema = s.object({
  note: s.string().min(1),
});
type RememberNoteInput = InferInput<typeof schema>;

export class RememberNoteTool extends HarnessTool<RememberNoteInput> {
  label = "Remember note";
  name = "remember_note";
  description = "Persist a short note in harness state.";
  schema = schema;
  risk = "safe" as const;

  async execute(args: RememberNoteInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = schema.parse(args);
    const state = session.state.get();
    const current = Array.isArray(state.notes) ? state.notes : [];
    const notes = [...current, input.note];
    session.state.update({ notes });
    await session.context.add({
      role: systemRole,
      content: `New note remembered for this run: ${input.note}`,
    });
    await session.events.emit(NoteRememberedEvent, { note: input.note });
    return {
      content: `Remembered note: ${input.note}`,
    };
  }
}

export const rememberNoteTool = new RememberNoteTool();
