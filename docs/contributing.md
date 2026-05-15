# Contributing

Run the full local gate before sending runtime changes:

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Where To Change Things

- New core storage contracts: `packages/core/src/runtime/storage.ts` and
  `packages/core/src/runtime/storage-coordinator.ts`.
- File storage behavior: `packages/storage-file/src/`.
- New core sandbox contracts: `packages/core/src/runtime/sandbox.ts` and
  `packages/core/src/runtime/sandbox-manager.ts`.
- Local sandbox behavior: `packages/sandbox-local/src/`.
- Transcript or cursor behavior: `packages/core/src/runtime/transcript-manager.ts`.
- Runtime event behavior: `packages/core/src/runtime/event-recorder.ts` and
  `packages/core/src/session/event-hub.ts`.
- Dynamic context behavior: `packages/core/src/runtime/context-registry.ts`.
- Role behavior: `packages/core/src/runtime/role-resolver.ts`.
- Tool execution behavior: `packages/core/src/runtime/tool-executor.ts`.
- Node tool behavior: `packages/tools-node/src/`.
- Snapshot behavior: `packages/core/src/runtime/snapshot-manager.ts`.
- Model call behavior: `packages/core/src/runtime/model-pipeline.ts`.
- Model provider registry/contracts: `packages/core/src/engine/`.
- AI SDK model provider behavior: `packages/provider-ai-sdk/src/`.
- OpenAI model provider behavior: `packages/provider-openai/src/`.
- App session status/queue behavior: `packages/core/src/session/status.ts` and
  `packages/core/src/session/queue.ts`.
- Approval behavior: `packages/core/src/session/approval-controller.ts`.
- Logging/redaction/sinks: `packages/core/src/logging/` and
  `packages/logging-file/src/`.

## Adding An OOP Construct

1. Add or update the public base/type in `packages/core/src/runtime/types/`.
2. Re-export through the relevant `packages/core/src/exports/*` entrypoint.
3. Add runtime normalization/resolution near the existing resolver or manager.
4. Add focused unit coverage and keep `src/session/session.smoke.test.ts` as
   integration coverage.
5. Update templates and README when the authoring API changes.

## Testing Guidance

Prefer focused tests close to the manager for domain behavior:

- `packages/core/src/runtime/*manager.test.ts` for runtime managers.
- `packages/core/src/session/*test.ts` for queue, status, approvals, and event
  hub behavior.
- `packages/tools-node/src/*.test.ts` for official Node tools.
- `packages/core/src/logging/*.test.ts` for redaction shape and secret removal.
- `packages/provider-ai-sdk/src/*.test.ts` for AI SDK mapper/resolver/usage
  behavior.

Use package smoke tests for cross-component behavior such as real session send,
tool execution, events, snapshots, safe send, storage, sandbox, and logging.
