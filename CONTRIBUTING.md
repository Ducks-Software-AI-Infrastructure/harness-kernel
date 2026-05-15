# Contributing to Harness Kernel

Thank you for your interest in contributing to Harness Kernel.

Harness Kernel is an app-owned runtime for embedded AI agents. The project
values small explicit abstractions, predictable runtime behavior, strong package
boundaries, and safe tool execution.

This guide explains how to report issues, propose changes, open pull requests,
and work on the repository locally.

## Project Principles

Harness Kernel follows these principles:

1. **App-owned runtime**
   The application owns its model providers, storage, sandbox, logging, tools,
   and approval policies.
2. **Small core, optional packages**
   `@harness-kernel/core` should remain lightweight and dependency-minimal.
   Concrete integrations belong in optional packages.
3. **Explicit execution**
   Agent behavior should be observable, auditable, and controlled through
   sessions, modes, tools, events, approvals, snapshots, and storage.
4. **Safe by design**
   Tool execution, sandboxing, secrets, filesystem access, and network access
   are security-sensitive.
5. **Stable public API**
   Public APIs should be deliberate. Breaking changes require discussion and
   documentation.

## Before Opening An Issue

Please search existing issues before opening a new one.

Open an issue when you want to:

- report a bug;
- request a feature;
- discuss a design or architecture change;
- propose a public API change;
- report unclear documentation;
- suggest a new package, provider, tool, storage implementation, or sandbox
  implementation.

When reporting a bug, include:

- Harness Kernel package and version, if applicable;
- Node.js version;
- package manager and version;
- operating system;
- minimal reproduction steps;
- expected behavior;
- actual behavior;
- relevant logs, errors, or stack traces.

## Before Opening A Pull Request

Small improvements can be submitted directly as a pull request.

Examples of changes that usually do not need an issue first:

- typo fixes;
- small documentation improvements;
- broken link fixes;
- test-only changes;
- simple examples;
- small internal refactors that do not change behavior;
- small bug fixes with a clear cause.

For larger changes, please open an issue first so the direction can be discussed
before implementation.

## What Needs An Issue First?

Please open an issue before submitting a pull request for:

- new features;
- new packages;
- new model providers;
- new storage implementations;
- new sandbox implementations;
- tool execution behavior changes;
- approval behavior changes;
- event schema changes;
- transcript, snapshot, or storage behavior changes;
- public API changes;
- breaking changes;
- large refactors;
- security-sensitive changes;
- changes that affect package boundaries.

Pull requests that introduce large changes without prior discussion may be
closed or converted into an issue first.

## Pull Request Requirements

A pull request should include:

- a clear title;
- a short explanation of what changed;
- the reason for the change;
- a linked issue, when applicable;
- tests, when behavior changes;
- documentation updates, when public behavior changes;
- no unrelated formatting churn;
- no unrelated refactors mixed with feature work.

Use GitHub issue-closing keywords when applicable:

```md
Closes #123
Fixes #123
Resolves #123
```

If a pull request does not need an issue, explain why in the PR description.

## Development Setup

Clone the repository:

```bash
git clone https://github.com/Ducks-Software-AI-Infrastructure/harness-kernel.git
cd harness-kernel
```

Install dependencies:

```bash
pnpm install
```

Run the full local gate:

```bash
pnpm verify
```

`pnpm verify` runs lint, package type checks, package tests, packed-consumer
checks, and the docs build.

## Common Commands

Recommended local commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
pnpm docs:smoke
pnpm verify
```

Run `pnpm docs:check` when changing docs snippets or API reference inputs. Run
`pnpm docs:smoke` when changing the site layout, navigation, or landing page.

If your change only affects documentation, explain that runtime tests were not
run because the change is docs-only.

## Package Boundaries

Harness Kernel is organized as a monorepo. Package boundaries matter.

### Core Package

`@harness-kernel/core` should contain runtime contracts and dependency-light
behavior.

The core package should not depend on:

- OpenAI SDK;
- Vercel AI SDK;
- provider-specific SDKs;
- Node.js filesystem APIs;
- Node.js child process APIs;
- local shell execution;
- file storage implementation packages;
- local sandbox implementation packages;
- logging implementation packages;
- tool implementation packages.

### Optional Packages

Optional packages may integrate with external systems, including:

- model providers;
- storage backends;
- logging systems;
- sandboxes;
- local tools;
- runtime integrations.

### Why Boundaries Matter

Good package boundaries keep the project:

- easier to test;
- easier to audit;
- easier to adopt;
- safer for production use;
- portable across different application environments.

If a change crosses package boundaries, explain why in the pull request.

## Where To Change Things

- New core storage contracts: `packages/core/src/runtime/storage.ts` and nearby
  storage runtime modules.
- File storage behavior: `packages/storage-file/src/`.
- New core sandbox contracts: `packages/core/src/runtime/sandbox.ts` and nearby
  sandbox runtime modules.
- Local sandbox behavior: `packages/sandbox-local/src/`.
- Transcript or cursor behavior: `packages/core/src/runtime/transcript-manager.ts`.
- Runtime event behavior: `packages/core/src/runtime/event-recorder.ts` and
  session event modules.
- Dynamic context behavior: `packages/core/src/runtime/context-registry.ts`.
- Role behavior: `packages/core/src/runtime/role-resolver.ts`.
- Tool execution behavior: `packages/core/src/runtime/tool-executor.ts`.
- Node tool behavior: `packages/tools-node/src/`.
- Snapshot behavior: `packages/core/src/runtime/snapshot-manager.ts`.
- Model call behavior: `packages/core/src/runtime/model-pipeline.ts`.
- Model provider registry/contracts: `packages/core/src/engine/`.
- AI SDK model provider behavior: `packages/provider-ai-sdk/src/`.
- OpenAI model provider behavior: `packages/provider-openai/src/`.
- App session status/queue behavior: `packages/core/src/session/`.
- Approval behavior: `packages/core/src/session/approval-controller.ts`.
- Logging/redaction/sinks: `packages/core/src/logging/` and
  `packages/logging-file/src/`.

## Adding An OOP Construct

1. Add or update the public base/type in `packages/core/src/runtime/types/`.
2. Re-export through the relevant `packages/core/src/exports/*` entrypoint.
3. Add runtime normalization/resolution near the existing resolver or manager.
4. Add focused unit coverage and keep smoke tests as integration coverage.
5. Update templates and README when the authoring API changes.

## Testing Guidance

Prefer focused tests close to the manager for domain behavior:

- `packages/core/src/runtime/*.test.ts` for runtime managers.
- `packages/core/src/session/*.test.ts` for queue, status, approvals, and event
  hub behavior.
- `packages/tools-node/src/*.test.ts` for official Node tools.
- `packages/core/src/logging/*.test.ts` for redaction shape and secret removal.
- `packages/provider-ai-sdk/src/*.test.ts` for AI SDK mapper/resolver/usage
  behavior.

Use package smoke tests for cross-component behavior such as real session send,
tool execution, events, snapshots, safe send, storage, sandbox, and logging.

## Public API Changes

Public APIs include exported types, classes, functions, package entry points,
event schemas, tool contracts, mode contracts, and documented runtime behavior.

Public API changes require extra care.

Before changing public API, please consider:

- Is this change necessary?
- Can the old behavior be preserved?
- Is this a breaking change?
- Does this need a migration path?
- Does documentation need to be updated?
- Should this be discussed in an issue first?

Breaking changes should not be introduced casually.

## Security-Sensitive Changes

The following areas are security-sensitive:

- tool execution;
- shell execution;
- sandbox behavior;
- filesystem access;
- network access;
- secrets and environment variables;
- model input/output handling;
- transcript persistence;
- event persistence;
- approval policies;
- destructive actions;
- user-provided content;
- prompt-injection-sensitive flows.

Security-sensitive pull requests should include:

- the risk being addressed;
- the behavior before the change;
- the behavior after the change;
- test coverage where possible;
- documentation updates when applicable.

Do not include secrets, tokens, private keys, credentials, or private
infrastructure details in issues, pull requests, tests, or logs.

If you believe you found a vulnerability, do not open a public issue. Follow
the project's security policy in `SECURITY.md`.

## Commit And PR Style

Use clear, conventional-style titles when possible:

```txt
feat: add custom storage contract
fix: prevent unsafe tool execution without approval
docs: add quickstart for local sandbox
test: add mode lifecycle tests
refactor: simplify event recorder internals
chore: update workspace config
```

Prefer small, focused pull requests.

Avoid PRs that combine unrelated changes, for example:

- feature plus formatting rewrite;
- bug fix plus large refactor;
- docs rewrite plus runtime behavior change;
- dependency changes plus API redesign.

If a PR is large, explain why it could not be split.

## Maintainer Review Process

Maintainers may ask for:

- a smaller PR scope;
- more tests;
- documentation updates;
- API changes;
- package boundary changes;
- issue discussion before implementation;
- security review for sensitive changes.

A pull request may be declined if it does not fit the project direction, adds
unnecessary complexity, weakens safety guarantees, or changes public API without
enough justification.

This does not mean the contribution is not appreciated. It means the project
prioritizes a small, controlled runtime surface.
