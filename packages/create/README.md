# @harness-kernel/create

Scaffold Harness Kernel projects without adding a runtime wrapper package.

```sh
pnpm create @harness-kernel
pnpm create @harness-kernel full my-agent
pnpm create @harness-kernel one-file my-agent
```

Generated apps declare the runtime packages they use directly, such as
`@harness-kernel/core`, `@harness-kernel/provider-openai`,
`@harness-kernel/storage-file`, `@harness-kernel/sandbox-local`, and
`@harness-kernel/tools-node`.

Docs: <https://ducks-software-ai-infrastructure.github.io/harness-kernel/docs/packages/create/>
