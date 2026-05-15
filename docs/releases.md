# Releases

Harness Kernel uses a simple branch, tag, and release flow.

## Branches

`main` is the integration branch. It should stay buildable and releasable.
Feature work should happen on short-lived branches and land through review when
the project is ready for that workflow.

Branch names should describe the work:

```text
feat/provider-routing
fix/session-status
docs/runtime-boundary
chore/release-0.1.1
```

## Versions

The public packages currently use a fixed workspace version: all
`@harness-kernel/*` packages move together.

While the project is `0.x`, use:

- patch bumps, such as `0.1.1`, for fixes and docs-only release polish;
- minor bumps, such as `0.2.0`, for new public API or breaking public API
  changes.

After `1.0.0`, use normal SemVer:

- patch for compatible fixes;
- minor for backward-compatible features;
- major for breaking changes.

## Tags

A tag is an immutable Git pointer for a release commit. Release tags use the
version name:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The tag should point at the exact commit whose package versions were published.

## GitHub Releases

A GitHub Release is the human-facing page attached to a tag. It should include:

- highlights;
- breaking changes;
- package version;
- migration notes when needed;
- verification command results.

## NPM Publishing

Before publishing:

```sh
pnpm verify
pnpm docs:smoke
pnpm test:consumer:packed
```

Then publish packages from the release commit. Package versions and the Git tag
should match.
