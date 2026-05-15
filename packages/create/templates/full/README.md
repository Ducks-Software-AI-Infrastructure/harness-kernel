# __AGENT_LABEL__

Full Harness Kernel project created with `@harness-kernel/create`.

This package keeps the agent behavior split across files and includes a runner
in the same project. The runner explicitly owns model providers, default model,
credentials, work directory, storage, sandbox, and tool approval policy.

## Run

```bash
npm install
cp .env.example .env
npm run run -- "hello"
```

Use `--auto-approve` for local development with tools that require approval:

```bash
npm run run -- --auto-approve "inspect this project"
```

Runs are saved under `.harness-kernel` by default.

## Check

```bash
npm run typecheck
```
