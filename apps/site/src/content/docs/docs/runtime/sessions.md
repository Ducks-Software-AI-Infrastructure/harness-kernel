---
title: Sessions
description: Send messages, stream runs, inspect status, switch modes, manage state, and close lifecycle.
---

A `HarnessSession` is a runtime-owned execution context for one agent and one session id. Sessions preserve mode, model override, shared state, transcript, events, snapshots, pending approvals, and status.

## Create Or Reuse

```ts
const session = await store.getOrCreate("project-1");
const sameSession = store.get("project-1");
const page = await store.list({ limit: 20 });
```

`get()` returns only an active in-memory session. `getOrCreate(sessionId, overrides)` can hydrate a persisted session or create a new one. Existing active sessions are returned unchanged.

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

When a run fails, `send()` and `stream.result` reject, `phase` becomes `error`, and `lastError` contains a canonical `HarnessErrorShape` with `code`, `category`, `severity`, and `recoverable`. A later `send()` starts a new run and clears `lastError` on `RunStartEvent`. Sessions remain reusable after fatal run failure unless the host sets `errorPolicy.closeSessionOnFatal`.

Abort is tracked separately from unexpected failure with `code: "run.aborted"` and `severity: "warn"`.

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
await store.close("project-1");
await store.close();
```

`close(sessionId)` unloads the active session without deleting persisted data. `delete(sessionId)` removes persisted session data when the backend supports deletion.
