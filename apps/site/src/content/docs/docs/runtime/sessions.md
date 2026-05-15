---
title: Sessions
description: Send messages, stream runs, inspect status, switch modes, manage state, and close lifecycle.
---

A `HarnessSession` is a runtime-owned execution context for one agent and one session id. Sessions preserve mode, model override, shared state, transcript, events, snapshots, pending approvals, and status.

## Create Or Reuse

```ts
const session = await store.getOrCreate("project-1");
const sameSession = store.get("project-1");
const statuses = store.list();
```

`getOrCreate(sessionId, overrides)` can apply partial runtime config overrides for a new session. Existing sessions are returned unchanged.

## Send And Stream

```ts
const result = await session.send("Summarize this repository.");
console.log(result.answer);
```

```ts
const stream = session.stream("Write a short plan.");

for await (const event of stream) {
  if (event.type === "assistant.delta") process.stdout.write(event.text);
}

const result = await stream.result;
```

`store.send()` and `store.stream()` do the same through the store and create the session if needed.

## Status And Model

```ts
session.getStatus();
session.getModel();
session.setModel("openai/gpt-5.1");
session.clearModelOverride();
```

`getStatus()` includes phase, running state, active tool, pending approval count, current model, provider info, run id, output directory, and metrics.

## Modes And State

```ts
await session.switchMode(reviewMode, { reason: "handoff" });

session.updateState({ productArea: "billing" });
session.replaceState({ productArea: "billing", escalations: [] });
```

Mode switching triggers mode lifecycle behavior. State updates affect the shared state visible to tools, hooks, modes, and context providers.

## Transcript, Events, Snapshots

```ts
const transcript = session.transcript.get();
const cursor = session.transcript.getCursor();
const events = session.getEvents({ type: "tool:end" });
const snapshot = await session.snapshots.create({ label: "before-refactor" });
await session.snapshots.restore(snapshot.id);
```

Snapshot restore is only allowed while the session is idle and has no pending approvals.

## Close

Always close sessions or stores in scripts and tests:

```ts
await session.close();
await store.close();
```
