# Harness Kernel

[![CI](https://github.com/Ducks-Software-AI-Infrastructure/harness-kernel/actions/workflows/ci.yml/badge.svg)](https://github.com/Ducks-Software-AI-Infrastructure/harness-kernel/actions/workflows/ci.yml)
[![Docs](https://github.com/Ducks-Software-AI-Infrastructure/harness-kernel/actions/workflows/pages.yml/badge.svg)](https://github.com/Ducks-Software-AI-Infrastructure/harness-kernel/actions/workflows/pages.yml)

Harness Kernel is a TypeScript runtime kernel for building embeddable AI agent
harnesses. It gives applications a small core for sessions, modes, tools,
events, approvals, schema, logging contracts, storage contracts, sandbox
contracts, and model provider routing.

`@harness-kernel/core` has **zero external runtime dependencies**. Concrete
integrations such as OpenAI, the Vercel AI SDK, filesystem storage, local shell
sandboxing, and Node tools live in optional packages that applications install
explicitly.

There is no hidden factory that wires providers, storage, sandbox, or tools for
you. The scaffold package only writes starter files; runtime composition stays
in your app.

## Why It Exists

- Build app-owned agents without adopting a full framework.
- Keep model providers, storage, sandboxing, logging, and approvals explicit.
- Package agent behavior with OOP primitives: modes, tools, roles, hooks,
  context providers, and events.
- Use a built-in schema primitive for official packages while still accepting
  Zod/custom user schemas at the boundary.
- Run the same agent definition in CLIs, backend services, web apps, or other
  hosts.

## Packages

| Package | Purpose |
| --- | --- |
| `@harness-kernel/core` | Zero-dependency runtime contracts, sessions, schema, events, logging contracts, model provider registry, memory/noop storage, and noop sandbox. |
| `@harness-kernel/provider-ai-sdk` | Generic model provider wrapper for the Vercel AI SDK. |
| `@harness-kernel/provider-openai` | OpenAI model provider built on `provider-ai-sdk`. |
| `@harness-kernel/storage-file` | File-backed run storage for transcripts, events, snapshots, metrics, and cursors. |
| `@harness-kernel/sandbox-local` | Local shell sandbox implementation. |
| `@harness-kernel/tools-node` | Node/local tools such as shell and file tools for modes. |
| `@harness-kernel/logging-file` | JSONL operational log sink. |
| `@harness-kernel/create` | Scaffold/devtool for new projects. Not a runtime dependency. |

## Basic Core Usage

```ts
import { createHarnessSessionStore } from "@harness-kernel/core";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileRunStorage } from "@harness-kernel/storage-file";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: "openai/gpt-5.1",
  storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
  sandbox: new LocalSandbox(),
});
```

The app owns the infrastructure:

- `providers`: model providers available to the session store.
- `defaultModel`: required namespaced model reference such as
  `openai/gpt-5.1`.
- `storage`: optional run storage implementation.
- `sandbox`: optional command/file execution environment.
- `logging`: optional operational logging sinks and levels.
- `toolApproval`: approval policy for tool execution.

Modes can declare a model, and sessions can override it:

```ts
class DeepMode extends HarnessMode {
  model = "openai/gpt-5.1";
  tools = [new BashTool()];
}

session.setModel("openai/gpt-5.1-mini");
session.clearModelOverride();
```

Model resolution order is run override, session override, `mode.model`, then
`defaultModel`.

Tools belong to modes, not to the session store:

```ts
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { BashTool, createFileSystemTools } from "@harness-kernel/tools-node";

class DevMode extends HarnessMode {
  prompt = "You are a coding assistant.";
  tools = [new BashTool(), ...createFileSystemTools()];
}
```

## Scaffold

```bash
pnpm create @harness-kernel
pnpm create @harness-kernel one-file my-agent
pnpm create @harness-kernel full my-agent
```

The scaffold writes a project with explicit `@harness-kernel/*` dependencies and
runtime composition. There is no hidden package that wires providers, storage,
sandbox, or tools automatically.

## Documentation Site

The public docs site lives in `apps/site` and is built with Astro Starlight plus
TypeDoc-generated API reference pages.

Published site: <https://ducks-software-ai-infrastructure.github.io/harness-kernel/>

```bash
pnpm docs:dev
pnpm docs:api
pnpm docs:check
pnpm docs:build
pnpm docs:smoke
```

- `pnpm docs:dev` starts the local Starlight dev server.
- `pnpm docs:api` regenerates `/docs/api/reference/` from public exports.
- `pnpm docs:check` runs API generation, `astro check`, and snippet type checks.
- `pnpm docs:build` builds the static site.
- `pnpm docs:smoke` runs Playwright against `/`, `/docs/`,
  `/docs/concepts/runtime-vs-agent/`, `/docs/concepts/kernel-map/`,
  `/docs/api/`, and a generated API reference page.

The custom landing page is served at `/`; documentation pages are served under
`/docs/...`.

The GitHub Pages workflow builds the same site from `main` and serves it from
`/harness-kernel/`.

## Runtime Guarantees

- `@harness-kernel/core` has no runtime dependency on Zod, AI SDK, OpenAI, Node
  filesystem APIs, or child processes.
- Official tools use `@harness-kernel/core/schema`, not Zod.
- Zod compatibility is tested as an external user schema path, not as a core
  runtime dependency.
- Model references are namespaced as `<provider>/<model>`.
- `createHarnessSessionStore` requires `providers` and `defaultModel`.
- Package exports are smoke-tested after build.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

`pnpm test` runs package tests, builds the workspace, checks package exports,
and runs a packed external-consumer smoke test. Use `pnpm test:consumer` to
pack every public package with `npm pack`, install the tarballs in a temporary
project, import all public subpaths, and run a minimal session example.

`pnpm verify` runs lint, package type checks, package tests, and the docs build.

## Contributing And Releases

- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Security policy: [`SECURITY.md`](SECURITY.md)
- Release process: [`docs/releases.md`](docs/releases.md)

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
