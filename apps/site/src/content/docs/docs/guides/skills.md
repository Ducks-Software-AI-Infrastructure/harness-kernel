---
title: Skills
description: Add package-only procedural skills to a Harness Kernel agent with soft gated tools.
---

Objective: give an agent explicit procedural capabilities that can be activated during a session.

```ts
import { defineAgent } from "@harness-kernel/core/agent";
import { HarnessMode } from "@harness-kernel/core/agent/mode";
import { createSkillKit, defineSkill } from "@harness-kernel/skills";

const reviewSkill = defineSkill({
  key: "review-comments",
  description: "Inspect and address review comments before editing code.",
  prompt: "List unresolved comments first, then make the smallest code change that addresses them.",
  tools: [listReviewCommentsTool, replyToReviewCommentTool],
});

const skills = createSkillKit([reviewSkill]);

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

Keep regular context providers on the mode. Skills contribute the catalog and active prompts through `skills.provider`; they do not embed provider lists themselves.

## How Soft Gate Works

The mode receives:

- `activate_skill`, `deactivate_skill`, and `list_skills`;
- wrappers for each skill tool;
- a context provider that lists available skills and includes full prompts only for active skills;
- custom events for activation, deactivation, and required-skill blocks.

For mode-specific tool exposure, build gated tools with a subset:

```ts
const modeTools = createSkillGatedTools(skills.registry, {
  skillKeys: ["review-comments"],
});
```

When the model calls a gated tool too early, the wrapper returns:

```ts
{
  data: {
    ok: false,
    code: "skill.required",
    requiredSkill: "review-comments",
    toolName: "reply_to_review_comment"
  }
}
```

The model should then call:

```ts
activate_skill({
  key: "review-comments",
  reason: "Need to address unresolved PR comments"
})
```

The active skill prompt appears on the next context build. Providers that run multi-step tool loops can call `prepareContext()` between steps to observe the new prompt.

## Programmatic Helpers

Use helpers when agent code needs to inspect or change skill state directly:

```ts
import {
  activateSkill,
  isSkillActive,
  listActiveSkills,
  listAvailableSkills,
} from "@harness-kernel/skills";

const available = listAvailableSkills(skills.registry);
const active = listActiveSkills(session, skills.registry);

if (!isSkillActive(session, "review-comments")) {
  await activateSkill(session, skills.registry, {
    key: "review-comments",
    reason: "Required by workflow",
  });
}
```

## Troubleshooting

### Tool Requires Activating Skill First

This is expected soft gate behavior. Call `activate_skill` with the key from `data.requiredSkill`, then retry the gated tool.

### Skill Prompt Did Not Appear Until The Next Step

Activation mutates shared state during a tool call. The prompt provider reads that state the next time context is prepared.

### Duplicate Tool Name

`createSkillRegistry()` fails early if two skills declare tools with the same `name`. Tool names must remain unique in a mode.

### Why Are Inactive Skill Tools Visible?

This package avoids core runtime changes. The provider receives a static tool catalog for the turn, so inactive skill tools are visible but guarded by wrappers.

### When Do I Need Hard Gate Support?

Use hard gate support only when inactive tools must disappear from the model catalog. That requires runtime changes to recalculate tools per step and is outside the package-only skills design.

API: [Skills Package](../../packages/skills/), [Tools](../../agent/tools/), and [Shared State](../../agent/shared-state/).
