import type {
  AgentReadSession,
  HarnessTool,
  JsonObject,
} from "@harness-kernel/core";

export type SkillPromptResolver = (
  session: AgentReadSession,
  skill: HarnessSkill,
) => string | Promise<string>;

export interface HarnessSkill {
  key: string;
  label?: string;
  description: string;
  prompt?: string | SkillPromptResolver;
  tools?: HarnessTool[];
  metadata?: JsonObject;
}

export interface HarnessSkillInput {
  key: string;
  label?: string;
  description: string;
  prompt?: string | SkillPromptResolver;
  tools?: HarnessTool[];
  metadata?: JsonObject;
}

function normalizeKey(key: string): string {
  return key.trim();
}

function labelFromKey(key: string): string {
  return key
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function defineSkill(input: HarnessSkillInput): HarnessSkill {
  const key = normalizeKey(input.key);
  if (!key) throw new Error("Skill key must not be empty.");
  if (!input.description?.trim()) throw new Error(`Skill '${key}' description must not be empty.`);

  return {
    ...input,
    key,
    label: input.label?.trim() || labelFromKey(key),
    description: input.description,
    tools: input.tools ? [...input.tools] : undefined,
  };
}
