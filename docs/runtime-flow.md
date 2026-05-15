# Runtime Flow

This document describes the main `session.send()` path.

## `session.send()`

1. `HarnessSessionImpl.send()` creates a stream and drains it.
2. `HarnessSessionImpl.stream()` normalizes user input, increments queued
   status, and enqueues execution through `SessionQueue`.
3. The queued task marks the session as running through `SessionStatusTracker`
   and calls `AgentSessionRunner.run()`.
4. The runner starts storage and sandbox through `RunStorageCoordinator` and
   `SandboxManager`.
5. Before appending the user message, the runner creates an automatic snapshot.
6. The runner appends the user message through `TranscriptManager` and persists
   transcript/cursors through `RunStorageCoordinator`.
7. `ModelPipeline` builds context through `ContextRegistry`, resolves the mode
   prompt, emits `context:*` and `model:*` events, then calls the model provider.
8. Engines call `input.prepareContext()` between tool/model steps when they need
   fresh dynamic context.
9. Tool calls go through `ToolExecutor`: schema validation, approval, transcript
   call/result messages, sandbox-backed execution, logs, and structured errors.
10. Assistant output is appended to transcript, model events are emitted, metrics
   are updated, and turn/run events close the execution.
11. `SessionEventHub` hydrates runtime records into stream events and notifies
   listeners.
12. The stream closes and `send()` resolves with the run result.

## Safe Send And Handoff

When a second send arrives while a run is active, `SessionQueue` records the
event gate requested by `options.after`. When the matching runtime record arrives,
the session requests turn handoff. If the run ends before the gate appears,
`RunEndEvent` clears the pending gate.

## Snapshot Restore

The app session checks that restore is idle and has no pending approvals. The
runner then delegates restore to `SnapshotManager`, which restores mode, model,
state, transcript cursor, event cursor, context entries, and current context
snapshot, then persists cursors.

