# Architecture

Harness Kernel is split between public authoring APIs, pure runtime contracts,
and optional integration packages. Public packages define behavior through
classes such as modes, tools, roles, hooks, context providers, and events. The
app-owned runner wires those behaviors to model providers, storage, sandbox, and
logging.

## Folder Map

- `packages/core/src/exports/`: public core entrypoints.
- `packages/core/src/runtime/`: agent execution runtime and internal managers.
- `packages/core/src/runtime/types/`: domain-specific runtime contracts.
- `packages/core/src/session/`: app-level session facade, queue, status,
  approval, event hub, storage, and stream helpers.
- `packages/core/src/engine/`: pure model provider contracts and registry.
- `packages/provider-*`: model provider integrations.
- `packages/storage-*`: storage integrations.
- `packages/sandbox-*`: sandbox integrations.
- `packages/tools-node`: Node file and shell tools for modes.
- `packages/logging-file`: JSONL log sink.
- `packages/create/templates/`: generated project scaffolds.

## Runtime Managers

`src/runtime/runner.ts` is the orchestration layer. It composes concrete
internal classes rather than owning every rule directly:

- `RunStorageCoordinator`: opens run stores, loads persisted runtime state, and
  saves transcript, events, metrics, snapshots, context snapshots, and cursors.
- `SandboxManager`: opens, decorates, and closes sandbox sessions.
- `TranscriptManager`: owns transcript append/query/seek behavior and cursors.
- `EventRecorder`: owns event records, event cursor, listeners, and queries.
- `ContextRegistry`: owns dynamic context entries, consumption, activation, and
  context snapshots.
- `RoleResolver`: resolves author roles and model provider-native roles.
- `ToolExecutor`: validates tool args, handles approval, writes call/result
  transcript messages, runs tools, and returns structured errors.
- `SnapshotManager`: creates, lists, restores, deletes, and persists snapshots.
- `ModelPipeline`: prepares prompt/context, calls the model provider, emits
  model events, records logs, and handles turn handoff.

## Session Layer

`src/session/session.ts` is the public facade for app code. It delegates to:

- `SessionQueue`: serializes sends/streams and tracks pending send gates.
- `SessionStatusTracker`: tracks phase, active tool, queued count, current turn,
  last event, and last error.
- `ApprovalController`: owns pending approvals, timeout resolution, approve, and
  deny.
- `SessionEventHub`: owns listeners, typed event waits, and hydration of runtime
  records into stream events.

The app session is different from author callback sessions:

- `HarnessSession`: app-level API for `send`, `stream`, state, snapshots,
  events, approvals, status, and lifecycle.
- `AgentReadSession`: read-only facade passed to context providers and prompt
  callbacks.
- `AgentActionSession`: mutable facade passed to tools, hooks, and lifecycle
  callbacks.

## Events, Transcript, And Logs

Events are structured runtime facts and may be persisted to the event log. Hidden
event messages are also projected into the transcript for timeline auditing.
Transcript messages are the model-facing and audit-facing message history. Logs
are operational diagnostics; they are redacted and routed to sinks separately
from events and transcript.

## Extension Points

- Custom storage: implement `HarnessRunStorage` and `HarnessRunStore`.
- Custom sandbox: implement `HarnessSandbox`.
- Custom model provider: implement `HarnessModelProvider`.
- Custom tools/context/roles/hooks/modes/events: subclass the public OOP bases
  exported from `@harness-kernel/core/agent/*`.
