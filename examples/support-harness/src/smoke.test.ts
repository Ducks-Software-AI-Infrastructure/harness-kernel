import assert from "node:assert/strict";
import { agent, supportMode, TicketEscalatedEvent } from "./agent.js";

assert.equal(agent.key, "support-harness");
assert.equal(agent.initialMode, supportMode);
assert.equal(TicketEscalatedEvent.type, "ticket.escalated");
assert.ok(supportMode.tools?.some((tool) => tool.name === "escalate_ticket"));
