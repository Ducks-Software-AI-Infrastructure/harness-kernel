---
title: Events
description: Built-in and custom events connect hooks, streams, logs, storage, and runtime observation.
---

Events are the common record format for lifecycle, tools, context, approvals, messages, mode changes, snapshots, and custom behavior. They appear in storage, streams, hooks, and session listeners.

## Built-In Events

Import built-in events from agent or runner event subpaths:

```ts
import {
  ContextReadyEvent,
  ModelAfterEvent,
  ToolApprovalRequestedEvent,
  ToolEndEvent,
  TurnEndEvent,
} from "@harness-kernel/core/agent/event";
```

Lifecycle events include run start/end, turn start/end, context ready, model before/after, message start/delta/end, tool start/end, approval requested/resolved, mode changed, snapshot changed, transcript cursor changed, and error events.

## Custom Event

```ts
import { HarnessEvent } from "@harness-kernel/core/agent/event";
import { s, type InferOutput } from "@harness-kernel/core/schema";

const escalationSchema = s.object({
  ticketId: s.string().min(1),
  reason: s.string().min(1),
});

type EscalationPayload = InferOutput<typeof escalationSchema>;

export class TicketEscalatedEvent extends HarnessEvent<EscalationPayload> {
  static type = "ticket.escalated";
  static schema = escalationSchema;
}
```

Declare custom events with the agent:

```ts
export const agent = defineAgent({
  key: "support-agent",
  label: "Support Agent",
  initialMode: supportMode,
  modes: [supportMode],
  declaredEvents: [TicketEscalatedEvent],
});
```

Emit from agent behavior:

```ts
await session.events.emit(TicketEscalatedEvent, input, {
  source: { kind: "tool", name: "escalate_ticket" },
  metadata: { label: "Ticket escalated" },
});
```

## Event Records

Each `HarnessEventRecord` has an id, sequence, branch, type, event class id, timestamp, source, payload, run id, optional turn and mode ids, correlation fields, and metadata.

The event class wraps that record and exposes `id`, `type`, `payload`, and `at`.

## Events And Sandboxes

Sandbox lifecycle is not an agent timeline event. Opening, closing, and executing commands in a sandbox are host operational concerns and are written through runtime logging.

Tools that use a sandbox still produce normal tool timeline events. For example, a shell tool can emit `ToolStartEvent` and `ToolEndEvent` around the tool call, while the runtime logs the underlying sandbox command start, completion, timeout, or failure.
