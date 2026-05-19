---
title: Streaming
description: Observe run progress, assistant deltas, tool activity, approvals, and events.
---

Streaming is runtime observation. It lets the host observe a run without making event listeners part of agent behavior.

## Session Stream

```ts
const stream = session.stream("Inspect the latest ticket.");

for await (const event of stream) {
  switch (event.type) {
    case "assistant.delta":
      process.stdout.write(event.text);
      break;
    case "tool.started":
      console.log(`tool: ${event.name}`);
      break;
    case "tool.approval.requested":
      await event.approval.deny("Read-only environment.");
      break;
  }
}

const result = await stream.result;
```

`HarnessRunStream` is an async iterable with an `id`, a `result` promise, and `cancel(reason)`.

Failed and aborted runs emit terminal stream events before the compatibility `error` event:

```ts
for await (const event of stream) {
  if (event.type === "run.failed" || event.type === "run.aborted") {
    console.error(event.error.code, event.error.message);
  }
  if (event.type === "error") {
    console.error(event.error.code);
  }
}
```

`run.failed` and `run.aborted` come from runtime timeline events and include final metrics. `error` exists for callers that only need the last public error shape.

## Store Stream

```ts
const stream = await store.stream("support-1", "Summarize this customer.");
```

`store.stream()` creates or reuses a session. `session.stream()` streams directly from an existing session.

## Event Listeners

```ts
const unsubscribe = session.on((event) => {
  if (event.type === "session.status") renderStatus(event.status);
});

session.onEvent(TurnEndEvent, (event) => {
  analytics.track("turn_end", event.payload);
});
```

Use `waitForEvent()` in tests and host workflows:

```ts
await session.waitForEvent(TurnEndEvent, { timeoutMs: 5000 });
```

Hooks are agent behavior. Session event listeners, streams, and `waitForEvent()` are runtime observation.
