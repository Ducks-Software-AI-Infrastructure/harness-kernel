# Contributing

Thanks for helping improve Harness Kernel.

## Local Setup

```sh
pnpm install
pnpm verify
```

`pnpm verify` runs lint, package type checks, package tests,
packed-consumer checks, and the docs build.

## Pull Requests

- Keep changes focused and include tests for runtime behavior.
- Update docs and examples when public APIs change.
- Run `pnpm docs:check` when changing docs snippets or API reference inputs.
- Run `pnpm docs:smoke` when changing the site layout, navigation, or landing
  page.

More detailed package ownership notes live in
[`docs/contributing.md`](docs/contributing.md).
