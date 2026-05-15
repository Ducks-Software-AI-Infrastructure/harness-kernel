import { HarnessEvent } from "@harness-kernel/core/agent/event";
import { s } from "@harness-kernel/core/schema";

export class NoteRememberedEvent extends HarnessEvent<{ note: string }> {
  static override schema = s.object({
    note: s.string().min(1),
  });
}
