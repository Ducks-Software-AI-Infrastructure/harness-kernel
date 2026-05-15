import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessContextProvider } from "@harness-kernel/core/agent/context";
import { HarnessEvent } from "@harness-kernel/core/agent/event";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import type { AgentActionSession, AgentReadSession } from "@harness-kernel/core/agent/session";
import { HarnessTool } from "@harness-kernel/core/agent/tool";
import { s, type InferInput, type InferOutput } from "@harness-kernel/core/schema";

const supportStateSchema = s.object({
  productArea: s.string().default("general"),
  escalations: s.array(s.string()).default([]),
});

type SupportState = InferOutput<typeof supportStateSchema>;

const escalationSchema = s.object({
  ticketId: s.string().min(1),
  reason: s.string().min(1),
});

type EscalationInput = InferInput<typeof escalationSchema>;
type EscalationPayload = InferOutput<typeof escalationSchema>;

export class TicketEscalatedEvent extends HarnessEvent<EscalationPayload> {
  static type = "ticket.escalated";
  static schema = escalationSchema;
}

class SupportContext extends HarnessContextProvider {
  label = "Support Context";

  render(session: AgentReadSession) {
    const state = supportStateSchema.parse(session.state.get());
    return `Support queue area: ${state.productArea}. Escalated tickets: ${state.escalations.join(", ") || "none"}.`;
  }
}

class EscalateTicketTool extends HarnessTool<EscalationInput> {
  name = "escalate_ticket";
  description = "Record a ticket escalation for follow-up.";
  schema = escalationSchema;
  risk = "write" as const;
  requiresApproval = true;

  async execute(args: EscalationInput, session: AgentActionSession) {
    const input = escalationSchema.parse(args);
    const state = supportStateSchema.parse(session.state.get());
    session.state.update({ escalations: [...state.escalations, input.ticketId] });
    await session.events.emit(TicketEscalatedEvent, input, {
      source: { kind: "tool", name: this.name },
      metadata: { label: "Ticket escalated" },
    });
    return {
      content: `Escalated ${input.ticketId}: ${input.reason}`,
      data: input,
    };
  }
}

class SupportMode extends HarnessMode {
  label = "Support";
  prompt = "You handle support tickets. Ask one clarifying question when the ticket is ambiguous.";
  providers = [new SupportContext()];
  tools = [new EscalateTicketTool()];
}

export const supportMode = new SupportMode();

export const agent = defineAgent({
  key: "support-harness",
  label: "Support Harness",
  sharedState: {
    initial: () => supportStateSchema.parse({}),
  },
  declaredEvents: [TicketEscalatedEvent],
  initialMode: supportMode,
  modes: [supportMode],
});
