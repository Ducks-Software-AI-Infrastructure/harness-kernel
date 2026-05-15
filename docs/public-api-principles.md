# Public API Principles

Harness Kernel is still pre-1.0, but public API changes should remain deliberate.

## Rules

- Prefer internal composition before adding public abstractions.
- Do not publish an interface only because an internal class exists.
- Add a public interface when there are real external implementations, clear
  testing value, or a stable architecture port.
- Keep generated templates, README examples, and public typechecks aligned with
  exported APIs.
- Avoid aliases for removed pre-1.0 names unless compatibility is a stated goal.

## Breaking Changes

Breaking public changes should be isolated from unrelated internal refactors
when possible. A breaking change should include:

- before/after API examples;
- reason and impact;
- README/template updates;
- public typecheck updates;
- migration notes;
- a final search for removed names in README, templates, and `src`.

Archived planning notes may still mention old API names as design history. Treat
those as explicit exceptions unless a current user-facing doc links them as
migration guidance.

Current public cleanup:

- `HarnessTool` subclasses use `name`, not `toolName`.
- `HarnessRole` subclasses use `name`, not `roleName`.
- `@harness-kernel/provider-ai-sdk` exports `createAiSdkModelProvider`.
