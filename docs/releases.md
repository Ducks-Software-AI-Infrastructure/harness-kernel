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

The first public npm release is a prerelease:

```text
0.1.0-beta.0
```

While the project is `0.x`, use:

- patch bumps, such as `0.1.1`, for fixes and docs-only release polish;
- minor bumps, such as `0.2.0`, for new public API or breaking public API
  changes.
- prerelease bumps, such as `0.1.0-beta.1`, while validating the first public
  package set before a stable release.

After `1.0.0`, use normal SemVer:

- patch for compatible fixes;
- minor for backward-compatible features;
- major for breaking changes.

## Tags

A tag is an immutable Git pointer for a release commit. Release tags use the
version name with a `v` prefix:

```sh
git tag v0.1.0-beta.0
git push origin v0.1.0-beta.0
```

The tag should point at the exact commit whose package versions will be
published. Pushing a tag does not publish packages by itself; the npm publish
workflow runs when a GitHub Release is published for a `v*.*.*` tag.

## GitHub Releases

A GitHub Release is the human-facing page attached to a tag. Publishing the
Release is the action that starts the npm publish workflow. It should include:

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
pnpm release:check 0.1.0-beta.0
pnpm publish:dry-run
```

Publishing goes to the npm registry. `pnpm` is the workspace package manager; it
is not a separate package registry. The release workflow publishes with the
official npm CLI so it can use npm Trusted Publishing through GitHub Actions
OIDC.

The GitHub Actions workflow publishes from GitHub Releases and resolves the npm
dist-tag from the release tag version:

- stable versions, such as `0.1.0`, publish with npm dist-tag `latest`;
- prerelease versions, such as `0.1.0-beta.0`, publish with npm dist-tag
  `beta`.

Users can install the beta with:

```sh
pnpm add @harness-kernel/core@beta
pnpm create @harness-kernel@beta
```

Repository setup required before the first release:

- create or claim the `@harness-kernel` scope on npm;
- create the GitHub environment named `npm-publish`, with required reviewers if
  you want manual approval before a package release;
- configure npm Trusted Publishing for every public package, using:
  - Organization or user: `Ducks-Software-AI-Infrastructure`
  - Repository: `harness-kernel`
  - Workflow filename: `npm-publish.yml`
  - Environment name: `npm-publish`
- keep every public package version equal to the tag version;
- publish the GitHub Release only after the release tag points to the intended
  commit on `main`.

Do not add an `NPM_TOKEN` secret for the normal release path. Trusted Publishing
uses short-lived OIDC credentials from GitHub Actions instead of a long-lived npm
token.

Important first-publish constraint: npm Trusted Publishing is configured from an
existing package's npm settings, and the `npm trust` CLI also requires the
package to already exist on the registry. If these package names have never been
published, create the initial package records once with a maintainer account
using normal npm 2FA, then configure Trusted Publishing and use the GitHub
workflow for future releases.

After the publish workflow succeeds and the packages are visible on npm, update
the GitHub Release if needed with final npm links or verification notes.
