# @harness-kernel/skills

Package-only skill helpers for Harness Kernel agents.

A skill is a procedural capability, not an executable tool by itself. It declares when it should be used, adds prompt instructions when active, owns a set of gated tools, and records auditable events/logs for activation, deactivation, and blocked tool calls.

Skills do not own context providers. Attach the single `skills.provider` returned by `createSkillKit()` to `mode.providers`; keep other context providers as normal mode providers.

The package uses a soft gate outside `@harness-kernel/core`: skill tools are visible in the mode catalog, but the wrapper only delegates to the original tool after the skill is active.

## Install

```bash
pnpm add @harness-kernel/skills
```

## Basic Usage

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createSkillKit, defineSkill } from "@harness-kernel/skills";

const githubSkill = defineSkill({
  key: "github-pr-review",
  description: "Review GitHub pull requests and address review comments.",
  prompt: "Inspect unresolved comments before proposing code changes.",
  tools: [readPullRequestTool, listReviewCommentsTool],
});

const skills = createSkillKit([githubSkill]);

class DevMode extends HarnessMode {
  prompt = "You are a coding agent.";
  providers = [skills.provider];
  tools = [...skills.tools];
}

const devMode = new DevMode();

export const agent = defineAgent({
  label: "Dev Agent",
  initialMode: devMode,
  modes: [devMode],
  declaredEvents: skills.events,
});
```

## Runtime Flow

1. The prompt provider lists available skills and active skills.
2. The model calls `activate_skill({ key, reason })`.
3. The package writes `state.skills.active[key]`.
4. The next context build includes the active skill prompt.
5. Gated tools from that skill delegate to the original tools.

If a gated tool is called too early, it returns structured data with `code: "skill.required"` and emits `SkillRequiredEvent`. It does not mark the run as a technical tool error.

## API

- `defineSkill(input)` normalizes a skill declaration.
- `createSkillRegistry(skills)` validates duplicate skill keys and duplicate skill tool names.
- `listAvailableSkills()`, `listActiveSkills()`, `listInactiveSkills()`, and `isSkillActive()` inspect registry/state.
- `activateSkill()` and `deactivateSkill()` mutate session state and emit events/logs.
- `createSkillPromptProvider()` injects active skill instructions.
- `createSkillActivationTool()`, `createSkillDeactivationTool()`, and `createSkillListTool()` expose model-facing controls.
- `createSkillGatedTools()` wraps skill tools with the soft gate.
- `createSkillKit()` returns `{ registry, provider, tools, events }`.
- `skillEvents()` returns the custom event classes for `declaredEvents`.

Use `createSkillGatedTools(registry, { skillKeys: ["docs-research"] })` when a mode should expose only a subset of skill tools.

The default state key is `skills`. Pass `{ stateKey: "mySkills" }` to helpers, tools, provider, or `createSkillKit()` to use another key.

Skills do not grant authority. Tool approval, risk, permissions, sandbox policy, and host approval callbacks still belong to the core runtime and host application.
