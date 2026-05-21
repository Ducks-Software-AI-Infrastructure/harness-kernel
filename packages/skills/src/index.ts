import type { HarnessContextProvider, HarnessEventClass, HarnessTool } from "@harness-kernel/core";
import type { HarnessSkill } from "./skill.js";
import { createSkillRegistry, type SkillRegistry } from "./registry.js";
import { createSkillPromptProvider, type SkillPromptProviderOptions } from "./provider.js";
import {
  createSkillActivationTool,
  createSkillDeactivationTool,
  createSkillGatedTools,
  createSkillListTool,
  type SkillGateOptions,
} from "./tools.js";
import { skillEvents } from "./events.js";

export * from "./skill.js";
export * from "./registry.js";
export * from "./state.js";
export * from "./provider.js";
export * from "./tools.js";
export * from "./events.js";
export * from "./logs.js";

export interface SkillKitOptions extends SkillPromptProviderOptions, SkillGateOptions {}

export interface SkillKit {
  registry: SkillRegistry;
  provider: HarnessContextProvider;
  tools: HarnessTool[];
  events: HarnessEventClass[];
}

export function createSkillKit(skills: HarnessSkill[], options?: SkillKitOptions): SkillKit {
  const registry = createSkillRegistry(skills);
  return {
    registry,
    provider: createSkillPromptProvider(registry, options),
    tools: [
      createSkillActivationTool(registry, options),
      createSkillDeactivationTool(registry, options),
      createSkillListTool(registry, options),
      ...createSkillGatedTools(registry, options),
    ],
    events: skillEvents(),
  };
}
