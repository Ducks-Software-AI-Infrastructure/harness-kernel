---
title: Execution Lifecycle
description: How a user input moves through sessions, context, model providers, tools, hooks, and storage.
---

A Harness Kernel run starts when a host sends input to a session and ends when the model provider returns the final assistant content. The same event path powers `send()`, `stream()`, logs, hooks, storage, and session listeners.

## High-Level Flow

1. The host calls `store.send()`, `store.stream()`, `session.send()`, or `session.stream()`.
2. The session normalizes the user input, queues it if another run is active, and emits status updates.
3. The runner starts a run, resolves the active mode, resolves the model, and records lifecycle events.
4. Context providers render contributions for the active mode.
5. The model provider receives the system prompt, messages, roles, tools, model ref, and helper callbacks.
6. Tool calls go through runtime approval policy before `HarnessTool.execute()` runs.
7. Hooks declared by the agent react to active events.
8. Storage persists transcript, events, snapshots, metrics, cursors, and context snapshots when configured.

## Events

Built-in event classes include `RunStartEvent`, `TurnStartEvent`, `ContextReadyEvent`, `ModelBeforeEvent`, `ModelAfterEvent`, `ToolStartEvent`, `ToolEndEvent`, `TurnEndEvent`, `RunEndEvent`, `RunFailedEvent`, `RunAbortedEvent`, approval events, message events, mode changes, snapshot events, and transcript cursor events.

Agent hooks bind to event classes:

```ts
import { ToolEndEvent } from "@harness-kernel/core/agent/event";
import { HarnessHook } from "@harness-kernel/core/agent/hook";

class ToolAuditHook extends HarnessHook.for(ToolEndEvent) {
  async onActive(session, event) {
    session.log.info("Tool finished.", {
      name: event.payload.name,
      durationMs: event.payload.durationMs,
    });
  }
}
```

Runtime observers listen from the session:

```ts
const unsubscribe = session.on((event) => {
  if (event.type === "assistant.delta") process.stdout.write(event.text);
});
```

Hooks are agent behavior. Session event listeners are runtime observation.

## Streams And Send Results

`session.send()` drains the same stream path used by `session.stream()`. `SendResult` includes `sessionId`, `runId`, `answer`, `agentKey`, `mode`, optional `outputDir`, `metrics`, `transcript`, and `events`.

Use `stream()` when the host needs live status, deltas, tool activity, or approval requests. Use `send()` when the host only needs the final result.
