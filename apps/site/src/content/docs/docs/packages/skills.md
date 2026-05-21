---
title: "@harness-kernel/skills"
description: Package-only procedural skills with prompt activation, shared state, gated tools, custom events, and audit logs.
---

`@harness-kernel/skills` adds procedural skills to existing Harness Kernel agents without changing `@harness-kernel/core`.

A skill is not a mode, a context provider, or a tool. A mode owns the active runtime surface, context providers own runtime context, a tool executes an action, and a skill packages procedural behavior that can be activated inside that surface. It can:

- describe when it should be used;
- inject prompt instructions after activation;
- declare tools associated with that behavior;
- block those tools until the skill is active;
- emit events and logs when activation or gating happens.

The package uses soft gate behavior. Skill tools remain visible in the mode tool catalog, but wrappers return `code: "skill.required"` until the model activates the required skill.

```ts
import { createSkillKit, defineSkill } from "@harness-kernel/skills";

const docsSkill = defineSkill({
  key: "docs-research",
  description: "Read project docs before changing documented behavior.",
  prompt: "Inspect the relevant docs and cite the source before editing.",
  tools: [readDocsTool, searchDocsTool],
});

export const skills = createSkillKit([docsSkill]);
```

Attach the kit to a mode:

```ts
class DevMode extends HarnessMode {
  prompt = "You are a coding agent.";
  providers = [skills.provider];
  tools = [...skills.tools];
}
```

Skills do not declare their own providers. Keep domain context in normal `mode.providers`; use `skills.provider` only for the skill catalog and active skill prompts.

Attach event classes to the agent manifest:

```ts
export const agent = defineAgent({
  label: "Dev Agent",
  initialMode: devMode,
  modes: [devMode],
  declaredEvents: skills.events,
});
```

## What It Exports

- `defineSkill()`
- `createSkillRegistry()`
- `listAvailableSkills()`
- `listActiveSkills()`
- `listInactiveSkills()`
- `isSkillActive()`
- `activateSkill()`
- `deactivateSkill()`
- `createSkillPromptProvider()`
- `createSkillActivationTool()`
- `createSkillDeactivationTool()`
- `createSkillListTool()`
- `createSkillGatedTools()`
- `createSkillKit()`
- `skillEvents()`

Use `createSkillGatedTools(registry, { skillKeys: ["docs-research"] })` when a specific mode should expose only a subset of skill tools. `list_skills` remains an optional model-facing catalog tool; `createSkillKit()` includes it by default for convenience.

The package stores active skills in shared state under `skills` by default:

```ts
{
  skills: {
    active: {
      "docs-research": {
        key: "docs-research",
        activatedAt: "2026-05-21T12:00:00.000Z",
        activatedByToolCallId: "call-123",
        reason: "Need docs context"
      }
    }
  }
}
```

Use `stateKey` to change that location.

## Authority Boundary

Activation changes behavior, not authority. A skill can let a gated wrapper delegate to its original tool, but approval still comes from `tool.risk`, `tool.permissions`, `tool.requiresApproval`, `mode.toolApproval`, the host approval flow, and sandbox policy.

Hard gate behavior, where tools appear or disappear from the provider catalog per step, requires core runtime support and is outside the package-only skills design.
